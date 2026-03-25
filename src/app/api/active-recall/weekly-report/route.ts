import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { routedCompletion } from '@/lib/ai-router'
import { buildWeeklyReportPrompt } from '@/lib/active-recall-prompts'
import { RecallLayer } from '@/types/active-recall'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Calculate week boundaries
    const now = new Date()
    const weekEnd = new Date(now)
    weekEnd.setHours(23, 59, 59, 999)
    const weekStart = new Date(weekEnd)
    weekStart.setDate(weekStart.getDate() - 7)
    weekStart.setHours(0, 0, 0, 0)

    const prevWeekStart = new Date(weekStart)
    prevWeekStart.setDate(prevWeekStart.getDate() - 7)

    // This week's sessions
    const { data: sessions } = await supabase
      .from('review_sessions')
      .select('*')
      .eq('user_id', user.id)
      .gte('started_at', weekStart.toISOString())
      .lte('started_at', weekEnd.toISOString())

    // Previous week's sessions
    const { data: prevSessions } = await supabase
      .from('review_sessions')
      .select('cards_reviewed, cards_correct')
      .eq('user_id', user.id)
      .gte('started_at', prevWeekStart.toISOString())
      .lt('started_at', weekStart.toISOString())

    // Get all cards for topic analysis
    const { data: cards } = await supabase
      .from('review_cards')
      .select('topic, recall_layer, correct_reviews, total_reviews')
      .eq('user_id', user.id)

    // Get streak
    const { data: streak } = await supabase
      .from('user_streaks')
      .select('review_streak')
      .eq('user_id', user.id)
      .single()

    const allCards = cards || []
    const allSessions = sessions || []
    const allPrevSessions = prevSessions || []

    // Calculate stats
    const cardsReviewed = allSessions.reduce((sum, s) => sum + s.cards_reviewed, 0)
    const cardsCorrect = allSessions.reduce((sum, s) => sum + s.cards_correct, 0)
    const accuracy = cardsReviewed > 0 ? Math.round((cardsCorrect / cardsReviewed) * 100) : 0

    const prevCards = allPrevSessions.reduce((sum, s) => sum + s.cards_reviewed, 0)
    const prevCorrect = allPrevSessions.reduce((sum, s) => sum + s.cards_correct, 0)
    const prevAccuracy = prevCards > 0 ? Math.round((prevCorrect / prevCards) * 100) : 0

    const timeSpentMinutes = Math.round(
      allSessions.reduce((sum, s) => sum + (s.total_time_ms || 0), 0) / 60000
    )

    // Topic analysis
    const topicStats = new Map<string, { correct: number; total: number }>()
    allCards.forEach((c) => {
      const topic = c.topic || 'General'
      const existing = topicStats.get(topic) || { correct: 0, total: 0 }
      existing.correct += c.correct_reviews
      existing.total += c.total_reviews
      topicStats.set(topic, existing)
    })

    const topicsStudied = Array.from(topicStats.keys())
    const weakAreas: string[] = []
    const strongAreas: string[] = []
    topicStats.forEach((stats, topic) => {
      if (stats.total < 3) return
      const acc = (stats.correct / stats.total) * 100
      if (acc < 70) weakAreas.push(topic)
      else if (acc > 90) strongAreas.push(topic)
    })

    // Layer changes from session results
    let layerPromotions = 0
    let layerDemotions = 0
    allSessions.forEach((s) => {
      const results = s.results as Array<{ previous_layer: number; new_layer: number }>
      results.forEach((r) => {
        if (r.new_layer > r.previous_layer) layerPromotions++
        if (r.new_layer < r.previous_layer) layerDemotions++
      })
    })

    const mastered = allCards.filter((c) => c.recall_layer === RecallLayer.MASTERED).length
    const masteryPct = allCards.length > 0 ? Math.round((mastered / allCards.length) * 100) : 0

    // Build prompt and generate report
    const messages = buildWeeklyReportPrompt({
      cardsReviewed,
      prevWeekCards: prevCards,
      accuracy,
      prevAccuracy,
      topicsStudied: topicsStudied.slice(0, 10),
      weakAreas: weakAreas.slice(0, 5),
      strongAreas: strongAreas.slice(0, 5),
      streak: streak?.review_streak || 0,
      timeSpentMinutes,
      layerPromotions,
      layerDemotions,
      totalCards: allCards.length,
      masteryPct,
    })

    const { text } = await routedCompletion(user.id, {
      messages,
      maxTokens: 800,
      temperature: 0.7,
    })

    // Store report
    const weekStartStr = weekStart.toISOString().split('T')[0]
    const weekEndStr = weekEnd.toISOString().split('T')[0]

    const { data: report, error: insertError } = await supabase
      .from('weekly_reports')
      .upsert(
        {
          user_id: user.id,
          week_start: weekStartStr,
          week_end: weekEndStr,
          report_markdown: text.trim(),
          stats: {
            cards_reviewed: cardsReviewed,
            accuracy,
            streak: streak?.review_streak || 0,
            topics_studied: topicsStudied,
            weak_areas: weakAreas,
            strong_areas: strongAreas,
            time_spent_minutes: timeSpentMinutes,
            layer_promotions: layerPromotions,
            layer_demotions: layerDemotions,
          },
        },
        { onConflict: 'user_id,week_start' }
      )
      .select()
      .single()

    if (insertError) {
      console.error('[ActiveRecall] Weekly report storage error:', insertError)
    }

    return NextResponse.json({
      report: text.trim(),
      stats: {
        cardsReviewed,
        accuracy,
        timeSpentMinutes,
        masteryPct,
      },
    })
  } catch (error) {
    console.error('[ActiveRecall] Weekly report error:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}

// GET — Fetch latest report
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: report } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({ report: report || null })
  } catch (error) {
    console.error('[ActiveRecall] Report fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
