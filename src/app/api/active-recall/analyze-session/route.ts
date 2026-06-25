import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { routedCompletion } from '@/lib/ai-router'
import { recordUsage } from '@/lib/usage-tracker'
import { buildSessionAnalysisPrompt } from '@/lib/active-recall-prompts'
import { predictRetention } from '@/lib/forgetting-curve'
import type { SessionAnalysisInsights, SessionCardAdjustment } from '@/types/active-recall'

// Compute a 0-1 weakness score for a card based on its performance history
function computeWeaknessScore(card: {
  correct_reviews: number
  total_reviews: number
  lapse_count: number
  average_response_time_ms: number
  recall_layer: number
  consecutive_correct: number
}): number {
  const accuracy = card.total_reviews > 0 ? card.correct_reviews / card.total_reviews : 0
  const lapseRate = card.total_reviews > 0 ? card.lapse_count / card.total_reviews : 0
  const responseTimeFactor = Math.min(1, (card.average_response_time_ms || 3000) / 15000)
  // Stagnation: at same layer for 5+ reviews without consecutive correct building up
  const stagnation = (card.total_reviews >= 5 && card.consecutive_correct < 2) ? 1 : 0

  return (1 - accuracy) * 0.4 + lapseRate * 0.3 + responseTimeFactor * 0.2 + stagnation * 0.1
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId } = await req.json()
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    // 1. Fetch the session
    const { data: session, error: sessionError } = await supabase
      .from('review_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Skip if already analyzed
    if (session.analysis_status === 'complete') {
      return NextResponse.json({ message: 'Already analyzed', insights: session.analysis_result })
    }

    // Mark as analyzing
    await supabase
      .from('review_sessions')
      .update({ analysis_status: 'analyzing' })
      .eq('id', sessionId)

    // 2. Parse session results
    const results: Array<{
      card_id: string
      rating: number
      response_time_ms: number
      previous_layer: number
      new_layer: number
    }> = Array.isArray(session.results) ? session.results : []

    if (results.length === 0) {
      await supabase
        .from('review_sessions')
        .update({ analysis_status: 'complete', analysis_result: { cardsAnalyzed: 0, adjustments: [], weakCards: [], planAdapted: false, summary: 'No cards to analyze.' } })
        .eq('id', sessionId)
      return NextResponse.json({ insights: { cardsAnalyzed: 0, adjustments: [], weakCards: [], planAdapted: false, summary: 'No cards to analyze.' } })
    }

    const cardIds = results.map((r) => r.card_id)

    // 3. Fetch full card data
    const { data: cards, error: cardsError } = await supabase
      .from('review_cards')
      .select('id, topic, question, answer, correct_reviews, total_reviews, lapse_count, average_response_time_ms, recall_layer, consecutive_correct, ai_interval_multiplier, ease_factor, interval_days, last_reviewed_at, plan_id, document_id')
      .eq('user_id', user.id)
      .in('id', cardIds)

    if (cardsError || !cards || cards.length === 0) {
      await supabase
        .from('review_sessions')
        .update({ analysis_status: 'complete', analysis_result: { cardsAnalyzed: 0, adjustments: [], weakCards: [], planAdapted: false, summary: 'Could not fetch card data.' } })
        .eq('id', sessionId)
      return NextResponse.json({ insights: { cardsAnalyzed: 0, adjustments: [], weakCards: [], planAdapted: false, summary: 'Could not fetch card data.' } })
    }

    // Map session results by card_id for quick lookup
    const resultMap = new Map(results.map((r) => [r.card_id, r]))

    // 4. Compute weakness scores and build analysis context
    const sessionCorrect = results.filter((r) => r.rating >= 3).length
    const sessionAccuracy = Math.round((sessionCorrect / results.length) * 100)
    const promotions = results.filter((r) => r.new_layer > r.previous_layer).length
    const demotions = results.filter((r) => r.new_layer < r.previous_layer).length

    const analysisCards = cards
      .map((card) => {
        const sessionResult = resultMap.get(card.id)
        if (!sessionResult) return null
        const accuracy = card.total_reviews > 0 ? Math.round((card.correct_reviews / card.total_reviews) * 100) : 0
        return {
          cardId: card.id,
          topic: card.topic || 'General',
          question: card.question || '',
          accuracy,
          lapseCount: card.lapse_count || 0,
          avgResponseTimeMs: card.average_response_time_ms || 3000,
          recallLayer: card.recall_layer || 1,
          consecutiveCorrect: card.consecutive_correct || 0,
          totalReviews: card.total_reviews || 0,
          currentMultiplier: card.ai_interval_multiplier || 1.0,
          weaknessScore: computeWeaknessScore(card),
          sessionRating: sessionResult.rating,
          sessionResponseTimeMs: sessionResult.response_time_ms,
        }
      })
      .filter(Boolean) as Array<NonNullable<ReturnType<typeof Object>>>

    // Sort by weakness score descending, take top 20 for AI analysis
    const sortedCards = [...analysisCards].sort((a, b) => (b as { weaknessScore: number }).weaknessScore - (a as { weaknessScore: number }).weaknessScore)
    const cardsForAI = sortedCards.slice(0, 20) as Parameters<typeof buildSessionAnalysisPrompt>[0]['cards']
    const remainingCards = sortedCards.slice(20) as typeof cardsForAI

    // 5. Call AI for per-card adjustments
    let aiAdjustments: SessionCardAdjustment[] = []
    try {
      const messages = buildSessionAnalysisPrompt({
        cards: cardsForAI,
        sessionAccuracy,
        sessionCardsReviewed: results.length,
        sessionTimeMs: session.total_time_ms || 0,
        promotions,
        demotions,
      })

      const { text, config, usage } = await routedCompletion(user.id, {
        messages,
        maxTokens: 2000,
        temperature: 0.3,
      })

      if (usage) {
        recordUsage({
          userId: user.id,
          provider: config.provider,
          model: config.model,
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          source: 'active-recall',
        })
      }

      // Parse AI response
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ cardId: string; multiplier: number; note: string; flagStuck: boolean }>
        aiAdjustments = parsed.map((adj) => ({
          cardId: adj.cardId,
          topic: (cardsForAI.find((c) => c.cardId === adj.cardId) as { topic: string } | undefined)?.topic || 'General',
          multiplier: Math.max(0.5, Math.min(2.0, adj.multiplier)),
          note: adj.note || '',
          flagStuck: adj.flagStuck || false,
        }))
      }
    } catch (aiError) {
      console.error('[AnalyzeSession] AI call failed, using rule-based fallback:', aiError)
    }

    // Rule-based fallback for cards not sent to AI (or if AI failed)
    const aiCardIds = new Set(aiAdjustments.map((a) => a.cardId))
    const cardsNeedingRules = [...(aiAdjustments.length === 0 ? sortedCards : remainingCards)] as typeof cardsForAI
    for (const card of cardsNeedingRules) {
      if (aiCardIds.has(card.cardId)) continue
      let multiplier = 1.0
      let note = ''
      let flagStuck = false

      if (card.sessionRating <= 1) {
        multiplier = 0.7
        note = `Rated ${card.sessionRating}/5 this session — scheduling sooner for reinforcement.`
      } else if (card.sessionRating >= 4 && card.sessionResponseTimeMs < 5000) {
        multiplier = 1.2
        note = `Quick and confident (${Math.round(card.sessionResponseTimeMs / 1000)}s) — spacing out reviews.`
      } else if (card.lapseCount >= 3) {
        multiplier = 0.6
        note = `${card.lapseCount} lapses — needs more frequent review.`
      }

      if (card.totalReviews >= 5 && card.consecutiveCorrect < 2 && card.recallLayer <= 2) {
        flagStuck = true
        note = `Stuck at layer ${card.recallLayer} after ${card.totalReviews} reviews — flagged for attention.`
      }

      if (multiplier !== 1.0 || flagStuck) {
        aiAdjustments.push({
          cardId: card.cardId,
          topic: card.topic,
          multiplier,
          note,
          flagStuck,
        })
      }
    }

    // 6. Apply adjustments to database
    let adjustedCount = 0
    for (const adj of aiAdjustments) {
      const updatePayload: Record<string, unknown> = {
        ai_interval_multiplier: adj.multiplier,
        ai_notes: adj.note,
        updated_at: new Date().toISOString(),
      }
      if (adj.flagStuck) {
        updatePayload.stuck_since = new Date().toISOString()
      }

      const { error: updateError } = await supabase
        .from('review_cards')
        .update(updatePayload)
        .eq('id', adj.cardId)
        .eq('user_id', user.id)

      if (!updateError) adjustedCount++
    }

    // Clear stuck_since for cards that got promoted this session
    const promotedCardIds = results
      .filter((r) => r.new_layer > r.previous_layer)
      .map((r) => r.card_id)
    if (promotedCardIds.length > 0) {
      await supabase
        .from('review_cards')
        .update({ stuck_since: null })
        .eq('user_id', user.id)
        .in('id', promotedCardIds)
    }

    // 7. Update learning_analytics per topic
    const topicMap = new Map<string, typeof cards>()
    for (const card of cards) {
      const topic = card.topic || 'General'
      const existing = topicMap.get(topic) || []
      existing.push(card)
      topicMap.set(topic, existing)
    }

    for (const [topic, topicCards] of topicMap) {
      const totalReviews = topicCards.reduce((s, c) => s + (c.total_reviews || 0), 0)
      const correctReviews = topicCards.reduce((s, c) => s + (c.correct_reviews || 0), 0)
      const avgAccuracy = totalReviews > 0 ? correctReviews / totalReviews : 0
      const avgEase = topicCards.reduce((s, c) => s + (c.ease_factor || 2.5), 0) / topicCards.length
      const avgInterval = topicCards.reduce((s, c) => s + (c.interval_days || 0), 0) / topicCards.length

      // Compute average current retention
      const retentions = topicCards
        .filter((c) => c.last_reviewed_at)
        .map((c) => predictRetention(c.last_reviewed_at, c.interval_days || 1, c.ease_factor || 2.5))
      const currentRetention = retentions.length > 0 ? retentions.reduce((a, b) => a + b, 0) / retentions.length : 1

      // Difficulty assessment
      let assessment = 'stable'
      if (avgAccuracy > 0.85) assessment = 'fast-learner'
      else if (avgAccuracy < 0.5) assessment = 'needs-repetition'

      const documentId = topicCards[0]?.document_id || null
      const retentionPoint = {
        date: new Date().toISOString().split('T')[0],
        predicted_retention: Math.round(currentRetention * 100) / 100,
        actual_retention: Math.round(avgAccuracy * 100) / 100,
        cards_due: topicCards.length,
        cards_reviewed: results.filter((r) => topicCards.some((c) => c.id === r.card_id)).length,
      }

      // Upsert learning_analytics
      const { data: existing } = await supabase
        .from('learning_analytics')
        .select('id, retention_history')
        .eq('user_id', user.id)
        .eq('topic', topic)
        .maybeSingle()

      if (existing) {
        const history = Array.isArray(existing.retention_history) ? existing.retention_history : []
        // Keep last 90 data points
        const updatedHistory = [...history.slice(-89), retentionPoint]

        await supabase
          .from('learning_analytics')
          .update({
            current_retention: currentRetention,
            decay_rate: avgEase > 0 ? 1 / avgEase : 0.4,
            optimal_interval_days: avgInterval * (avgAccuracy > 0.8 ? 1.2 : 0.8),
            ai_difficulty_assessment: assessment,
            retention_history: updatedHistory,
            last_computed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      } else if (documentId) {
        await supabase
          .from('learning_analytics')
          .insert({
            user_id: user.id,
            document_id: documentId,
            topic,
            current_retention: currentRetention,
            decay_rate: avgEase > 0 ? 1 / avgEase : 0.4,
            optimal_interval_days: avgInterval * (avgAccuracy > 0.8 ? 1.2 : 0.8),
            ai_difficulty_assessment: assessment,
            retention_history: [retentionPoint],
            last_computed_at: new Date().toISOString(),
          })
      }
    }

    // 8. Auto-trigger plan adaptation if accuracy is low
    let planAdapted = false
    if (sessionAccuracy < 60 && session.plan_id) {
      try {
        // Fire-and-forget plan adaptation
        const origin = req.headers.get('origin') || req.headers.get('host') || ''
        const baseUrl = origin.startsWith('http') ? origin : `https://${origin}`
        fetch(`${baseUrl}/api/active-recall/agent/adapt-plan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: req.headers.get('cookie') || '',
          },
          body: JSON.stringify({ planId: session.plan_id }),
        }).catch(() => {})
        planAdapted = true
        console.log(`[AnalyzeSession] Auto-triggered plan adaptation for plan ${session.plan_id} (accuracy: ${sessionAccuracy}%)`)
      } catch {
        console.error('[AnalyzeSession] Failed to trigger plan adaptation')
      }
    }

    // 9. Build insights
    const weakCards = aiAdjustments
      .filter((a) => a.multiplier < 0.8 || a.flagStuck)
      .slice(0, 5)
      .map((a) => ({
        cardId: a.cardId,
        topic: a.topic,
        reason: a.note,
      }))

    const summary = `Analyzed ${cards.length} cards. ${adjustedCount} intervals adjusted. ${weakCards.length} weak cards identified.${planAdapted ? ' Study plan auto-adapted for tomorrow.' : ''}`

    const insights: SessionAnalysisInsights = {
      cardsAnalyzed: cards.length,
      adjustments: aiAdjustments,
      weakCards,
      planAdapted,
      summary,
    }

    // 10. Save analysis result to session
    await supabase
      .from('review_sessions')
      .update({
        analysis_status: 'complete',
        analysis_result: insights,
      })
      .eq('id', sessionId)

    console.log(`[AnalyzeSession] Session ${sessionId}: ${adjustedCount} cards adjusted, ${weakCards.length} weak, planAdapted=${planAdapted}`)

    return NextResponse.json({ insights })

  } catch (error) {
    console.error('[AnalyzeSession] Error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze session' },
      { status: 500 }
    )
  }
}
