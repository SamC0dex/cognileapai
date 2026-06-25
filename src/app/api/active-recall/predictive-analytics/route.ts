import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { routedCompletion } from '@/lib/ai-router'
import { recordUsage } from '@/lib/usage-tracker'
import { buildStuckCardSuggestionsPrompt } from '@/lib/active-recall-prompts'
import {
  predictRetentionAtDate,
  estimateTimeToMastery,
  aggregateTopicRetentionForecast,
  detectStuckCards,
} from '@/lib/forgetting-curve'
import type { PredictiveAnalytics, TopicMasteryTimeline, StuckCardInfo } from '@/types/active-recall'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const period = parseInt(searchParams.get('period') || '30', 10)

    // Fetch all user's review cards
    const { data: cards, error: cardsError } = await supabase
      .from('review_cards')
      .select('*')
      .eq('user_id', user.id)

    if (cardsError) {
      console.error('[Predictive] Cards fetch error:', cardsError)
      return NextResponse.json({ error: 'Failed to fetch cards' }, { status: 500 })
    }

    if (!cards || cards.length === 0) {
      const empty: PredictiveAnalytics = {
        retentionForecast: [],
        topicMasteryTimelines: [],
        stuckCards: [],
        learningVelocity: { cardsPerDay: 0, avgAccuracy: 0, trend: 'stable' },
      }
      return NextResponse.json(empty)
    }

    // 1. Retention forecast
    const retentionForecast = aggregateTopicRetentionForecast(cards, period)

    // 2. Topic mastery timelines
    const topicGroups = new Map<string, typeof cards>()
    for (const card of cards) {
      const topic = card.topic || 'General'
      if (!topicGroups.has(topic)) topicGroups.set(topic, [])
      topicGroups.get(topic)!.push(card)
    }

    const now = new Date()
    const topicMasteryTimelines: TopicMasteryTimeline[] = []

    for (const [topic, topicCards] of topicGroups) {
      const avgLayer = topicCards.reduce((s, c) => s + (c.recall_layer || 1), 0) / topicCards.length
      const avgEase = topicCards.reduce((s, c) => s + (c.ease_factor || 2.5), 0) / topicCards.length
      const totalReviews = topicCards.reduce((s, c) => s + (c.total_reviews || 0), 0)
      const totalCorrect = topicCards.reduce((s, c) => s + (c.correct_reviews || 0), 0)
      const accuracy = totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0

      // Estimate mastery from the least-mastered card in topic
      let maxDays = 0
      let totalReviewsNeeded = 0
      for (const card of topicCards) {
        const est = estimateTimeToMastery(card)
        maxDays = Math.max(maxDays, est.days)
        totalReviewsNeeded += est.reviewsNeeded
      }

      const masteryDate = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000)

      topicMasteryTimelines.push({
        topic,
        currentLayer: Math.round(avgLayer),
        avgEaseFactor: Math.round(avgEase * 100) / 100,
        estimatedMasteryDate: masteryDate.toISOString().split('T')[0],
        reviewsRemaining: totalReviewsNeeded,
        currentAccuracy: accuracy,
      })
    }

    // Sort by most reviews remaining (hardest topics first)
    topicMasteryTimelines.sort((a, b) => b.reviewsRemaining - a.reviewsRemaining)

    // 3. Stuck cards with AI suggestions
    const stuckDetected = detectStuckCards(cards)
    let stuckCards: StuckCardInfo[] = []

    if (stuckDetected.length > 0) {
      // Prepare stuck cards for AI suggestions
      const stuckForAI = stuckDetected.slice(0, 10).map((s) => {
        const c = s.card as typeof cards[0]
        return {
          cardId: c.id,
          question: c.question || c.front_content || '',
          answer: c.answer || c.back_content || '',
          topic: c.topic || 'General',
          recallLayer: c.recall_layer || 1,
          totalReviews: c.total_reviews || 0,
          accuracy: c.total_reviews > 0 ? Math.round((c.correct_reviews / c.total_reviews) * 100) : 0,
          avgResponseTimeMs: c.average_response_time_ms || 0,
          lapseCount: c.lapse_count || 0,
        }
      })

      // Get AI suggestions for stuck cards
      try {
        const messages = buildStuckCardSuggestionsPrompt(stuckForAI)
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

        // Parse AI suggestions
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        let suggestions: Array<{ cardId: string; suggestion: string }> = []
        if (jsonMatch) {
          try {
            suggestions = JSON.parse(jsonMatch[0])
          } catch { /* use empty */ }
        }

        const suggestionMap = new Map(suggestions.map((s) => [s.cardId, s.suggestion]))

        stuckCards = stuckForAI.map((c) => ({
          cardId: c.cardId,
          question: c.question,
          topic: c.topic,
          layer: c.recallLayer,
          reviewCount: c.totalReviews,
          stuckSince: (stuckDetected.find((s) => (s.card as typeof cards[0]).id === c.cardId)?.card as typeof cards[0])?.stuck_since?.split('T')[0] || now.toISOString().split('T')[0],
          suggestion: suggestionMap.get(c.cardId) || 'Try breaking this concept into smaller parts and reviewing each separately.',
        }))
      } catch (aiError) {
        console.error('[Predictive] AI stuck card suggestions error:', aiError)
        // Fallback: return stuck cards without AI suggestions
        stuckCards = stuckForAI.map((c) => ({
          cardId: c.cardId,
          question: c.question,
          topic: c.topic,
          layer: c.recallLayer,
          reviewCount: c.totalReviews,
          stuckSince: now.toISOString().split('T')[0],
          suggestion: 'This card needs extra attention — try re-reading the source material or explaining the concept out loud.',
        }))
      }
    }

    // 4. Learning velocity
    const { data: recentSessions } = await supabase
      .from('review_sessions')
      .select('cards_reviewed, cards_correct, started_at')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('started_at', { ascending: false })
      .limit(30)

    let cardsPerDay = 0
    let avgAccuracy = 0
    let trend: 'improving' | 'stable' | 'declining' = 'stable'

    if (recentSessions && recentSessions.length > 0) {
      const firstSession = new Date(recentSessions[recentSessions.length - 1].started_at)
      const daySpan = Math.max(1, Math.round((now.getTime() - firstSession.getTime()) / (1000 * 60 * 60 * 24)))
      const totalCards = recentSessions.reduce((s, sess) => s + (sess.cards_reviewed || 0), 0)
      const totalCorrect = recentSessions.reduce((s, sess) => s + (sess.cards_correct || 0), 0)

      cardsPerDay = Math.round((totalCards / daySpan) * 10) / 10
      avgAccuracy = totalCards > 0 ? Math.round((totalCorrect / totalCards) * 100) : 0

      // Trend: compare first half vs second half
      if (recentSessions.length >= 4) {
        const mid = Math.floor(recentSessions.length / 2)
        const recentHalf = recentSessions.slice(0, mid)
        const olderHalf = recentSessions.slice(mid)

        const recentAcc = recentHalf.reduce((s, sess) => s + (sess.cards_reviewed > 0 ? sess.cards_correct / sess.cards_reviewed : 0), 0) / recentHalf.length
        const olderAcc = olderHalf.reduce((s, sess) => s + (sess.cards_reviewed > 0 ? sess.cards_correct / sess.cards_reviewed : 0), 0) / olderHalf.length

        const diff = recentAcc - olderAcc
        if (diff > 0.05) trend = 'improving'
        else if (diff < -0.05) trend = 'declining'
      }
    }

    const analytics: PredictiveAnalytics = {
      retentionForecast,
      topicMasteryTimelines,
      stuckCards,
      learningVelocity: { cardsPerDay, avgAccuracy, trend },
    }

    return NextResponse.json(analytics)
  } catch (error) {
    console.error('[Predictive] Analytics error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
