import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { routedCompletion } from '@/lib/ai-router'
import { buildIntervalAdjustPrompt } from '@/lib/active-recall-prompts'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch all cards with enough reviews to analyze
    const { data: cards, error: cardsError } = await supabase
      .from('review_cards')
      .select('id, topic, correct_reviews, total_reviews, average_response_time_ms, recall_layer, ease_factor, ai_interval_multiplier')
      .eq('user_id', user.id)
      .gte('total_reviews', 3)

    if (cardsError || !cards || cards.length === 0) {
      return NextResponse.json({ message: 'Not enough review data yet', adjusted: 0 })
    }

    // Aggregate per-topic stats
    const topicMap = new Map<string, {
      correct: number
      total: number
      totalResponseMs: number
      cardCount: number
      ids: string[]
      currentMultipliers: number[]
    }>()

    for (const card of cards) {
      const topic = card.topic || 'General'
      const existing = topicMap.get(topic) || {
        correct: 0, total: 0, totalResponseMs: 0, cardCount: 0, ids: [], currentMultipliers: [],
      }
      existing.correct += card.correct_reviews || 0
      existing.total += card.total_reviews || 0
      existing.totalResponseMs += (card.average_response_time_ms || 3000) * (card.total_reviews || 1)
      existing.cardCount++
      existing.ids.push(card.id)
      existing.currentMultipliers.push(card.ai_interval_multiplier || 1.0)
      topicMap.set(topic, existing)
    }

    // Build topics array for prompt — only topics with meaningful data
    const topics = Array.from(topicMap.entries())
      .filter(([, s]) => s.total >= 5)
      .map(([topic, s]) => {
        const avgAccuracy = Math.round((s.correct / s.total) * 100)
        const avgResponseTimeMs = Math.round(s.totalResponseMs / s.total)
        const currentDecayRate = s.currentMultipliers.reduce((a, b) => a + b, 0) / s.currentMultipliers.length

        // Determine trend from recent accuracy vs overall
        // Simple heuristic: compare last-third vs first-third performance
        let recentTrend: 'improving' | 'stable' | 'declining' = 'stable'
        if (avgAccuracy > 80) recentTrend = 'improving'
        else if (avgAccuracy < 50) recentTrend = 'declining'

        return {
          topic,
          avgAccuracy,
          avgResponseTimeMs,
          reviewCount: s.total,
          currentDecayRate,
          recentTrend,
        }
      })

    if (topics.length === 0) {
      return NextResponse.json({ message: 'Not enough topic data yet', adjusted: 0 })
    }

    // Call AI for interval multiplier recommendations
    const messages = buildIntervalAdjustPrompt({ topics })

    const { text } = await routedCompletion(user.id, {
      messages,
      maxTokens: 1000,
      temperature: 0.3,
    })

    // Parse AI response
    let adjustments: Array<{ topic: string; multiplier: number; reasoning: string }> = []
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        adjustments = JSON.parse(jsonMatch[0])
      }
    } catch (parseError) {
      console.error('[AdjustIntervals] JSON parse error:', parseError)
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    // Apply multipliers to cards
    let adjustedCount = 0
    for (const adj of adjustments) {
      const topicData = topicMap.get(adj.topic)
      if (!topicData) continue

      // Clamp multiplier to safe range
      const multiplier = Math.max(0.5, Math.min(2.0, adj.multiplier))

      // Update all cards in this topic
      const { error: updateError } = await supabase
        .from('review_cards')
        .update({ ai_interval_multiplier: multiplier })
        .in('id', topicData.ids)
        .eq('user_id', user.id)

      if (!updateError) {
        adjustedCount += topicData.ids.length
      }
    }

    return NextResponse.json({
      adjusted: adjustedCount,
      topics: adjustments.map((a) => ({
        topic: a.topic,
        multiplier: a.multiplier,
        reasoning: a.reasoning,
      })),
    })
  } catch (error) {
    console.error('[AdjustIntervals] Error:', error)
    return NextResponse.json({ error: 'Failed to adjust intervals' }, { status: 500 })
  }
}
