import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { routedCompletion } from '@/lib/ai-router'
import { recordUsage } from '@/lib/usage-tracker'
import { buildNudgePrompt } from '@/lib/active-recall-prompts'
import { RecallLayer } from '@/types/active-recall'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Gather context for the nudge
    const now = new Date().toISOString()

    // Get cards
    const { data: cards } = await supabase
      .from('review_cards')
      .select('topic, recall_layer, next_review_at, correct_reviews, total_reviews')
      .eq('user_id', user.id)

    const allCards = cards || []
    const dueCards = allCards.filter((c) => c.next_review_at <= now)
    const overdueCards = dueCards.filter((c) => {
      const dueDate = new Date(c.next_review_at)
      return (Date.now() - dueDate.getTime()) > 24 * 60 * 60 * 1000
    })

    // Get streak
    const { data: streak } = await supabase
      .from('user_streaks')
      .select('current_streak, longest_streak, review_streak, last_review_date')
      .eq('user_id', user.id)
      .single()

    // Get last session
    const { data: lastSession } = await supabase
      .from('review_sessions')
      .select('started_at, cards_correct, cards_reviewed')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(1)
      .single()

    // Identify weak/strong topics
    const topicStats = new Map<string, { correct: number; total: number }>()
    allCards.forEach((c) => {
      const topic = c.topic || 'General'
      const existing = topicStats.get(topic) || { correct: 0, total: 0 }
      existing.correct += c.correct_reviews
      existing.total += c.total_reviews
      topicStats.set(topic, existing)
    })

    const weakTopics: string[] = []
    const strongTopics: string[] = []
    topicStats.forEach((stats, topic) => {
      if (stats.total < 3) return // Not enough data
      const accuracy = (stats.correct / stats.total) * 100
      if (accuracy < 60) weakTopics.push(topic)
      else if (accuracy > 85) strongTopics.push(topic)
    })

    // Get exam info
    const { data: exams } = await supabase
      .from('exam_dates')
      .select('title, exam_date')
      .eq('user_id', user.id)
      .gte('exam_date', new Date().toISOString().split('T')[0])
      .order('exam_date', { ascending: true })
      .limit(1)

    const examInfo = exams?.[0]
      ? `${exams[0].title} on ${exams[0].exam_date}`
      : null

    const mastered = allCards.filter((c) => c.recall_layer === RecallLayer.MASTERED).length

    // Build nudge prompt
    const messages = buildNudgePrompt({
      dueCount: dueCards.length,
      overdueCount: overdueCards.length,
      currentStreak: streak?.review_streak || 0,
      longestStreak: streak?.longest_streak || 0,
      lastSessionDate: lastSession?.started_at
        ? new Date(lastSession.started_at).toLocaleDateString()
        : null,
      lastSessionAccuracy: lastSession && lastSession.cards_reviewed > 0
        ? Math.round((lastSession.cards_correct / lastSession.cards_reviewed) * 100)
        : null,
      weakTopics: weakTopics.slice(0, 3),
      strongTopics: strongTopics.slice(0, 3),
      totalMastered: mastered,
      totalCards: allCards.length,
      examInfo,
    })

    // Generate nudge
    const { text, config, usage } = await routedCompletion(user.id, {
      messages,
      maxTokens: 200,
      temperature: 0.8,
    })

    if (usage) {
      recordUsage({ userId: user.id, provider: config.provider, model: config.model, inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, totalTokens: usage.totalTokens, source: 'active-recall' })
    }

    return NextResponse.json({ message: text.trim() })
  } catch (error) {
    console.error('[ActiveRecall] AI nudge error:', error)
    // Return a default message on error
    return NextResponse.json({
      message: 'Ready to strengthen your memory? Start a review session to keep your knowledge sharp.',
    })
  }
}
