import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { routedCompletionStream } from '@/lib/ai-router'
import { buildAIChatSystemPrompt, type AIChatContext } from '@/lib/active-recall-prompts'
import { RecallLayer } from '@/types/active-recall'
import type { ChatMessage } from '@/lib/ai-providers'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messages: clientMessages } = await req.json() as {
      messages: { role: 'user' | 'assistant'; content: string }[]
    }

    if (!clientMessages?.length) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
    }

    // Gather learning context for the system prompt
    const now = new Date().toISOString()

    const [cardsResult, streakResult, sessionsResult, examsResult] = await Promise.all([
      supabase
        .from('review_cards')
        .select('topic, recall_layer, next_review_at, correct_reviews, total_reviews')
        .eq('user_id', user.id),
      supabase
        .from('user_streaks')
        .select('current_streak, longest_streak, review_streak, total_cards_reviewed')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('review_sessions')
        .select('started_at, cards_correct, cards_reviewed')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(3),
      supabase
        .from('exam_dates')
        .select('title, exam_date')
        .eq('user_id', user.id)
        .gte('exam_date', new Date().toISOString().split('T')[0])
        .order('exam_date', { ascending: true })
        .limit(5),
    ])

    const allCards = cardsResult.data || []
    const dueCards = allCards.filter((c) => c.next_review_at <= now)
    const overdueCards = dueCards.filter((c) => {
      const dueDate = new Date(c.next_review_at)
      return (Date.now() - dueDate.getTime()) > 24 * 60 * 60 * 1000
    })

    // Topic analysis
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
      if (stats.total < 3) return
      const accuracy = (stats.correct / stats.total) * 100
      if (accuracy < 60) weakTopics.push(topic)
      else if (accuracy > 85) strongTopics.push(topic)
    })

    // Total accuracy
    let totalCorrect = 0
    let totalReviewCount = 0
    allCards.forEach((c) => {
      totalCorrect += c.correct_reviews
      totalReviewCount += c.total_reviews
    })
    const recentAccuracy = totalReviewCount > 0
      ? Math.round((totalCorrect / totalReviewCount) * 100)
      : 0

    const mastered = allCards.filter((c) => c.recall_layer === RecallLayer.MASTERED).length
    const masteryPct = allCards.length > 0 ? Math.round((mastered / allCards.length) * 100) : 0

    // Recent session summary
    const lastSession = sessionsResult.data?.[0]
    const recentSessionSummary = lastSession && lastSession.cards_reviewed > 0
      ? `${lastSession.cards_reviewed} cards, ${Math.round((lastSession.cards_correct / lastSession.cards_reviewed) * 100)}% accuracy`
      : null

    // Upcoming exams
    const upcomingExams = (examsResult.data || []).map((e) => ({
      title: e.title,
      daysUntil: Math.ceil((new Date(e.exam_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    }))

    const ctx: AIChatContext = {
      totalCards: allCards.length,
      dueCards: dueCards.length,
      overdueCount: overdueCards.length,
      masteryPct,
      currentStreak: streakResult.data?.review_streak || 0,
      longestStreak: streakResult.data?.longest_streak || 0,
      weakTopics: weakTopics.slice(0, 5),
      strongTopics: strongTopics.slice(0, 5),
      recentAccuracy,
      totalReviews: streakResult.data?.total_cards_reviewed || 0,
      upcomingExams,
      recentSessionSummary,
    }

    // Build messages with system prompt
    const systemPrompt = buildAIChatSystemPrompt(ctx)
    const aiMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...clientMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    // Stream response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const generator = routedCompletionStream(user.id, {
            messages: aiMessages,
            maxTokens: 1000,
            temperature: 0.7,
          })

          for await (const chunk of generator) {
            if (chunk.text) {
              const data = JSON.stringify(chunk.text)
              controller.enqueue(encoder.encode(`0:${data}\n`))
            }
          }

          controller.close()
        } catch (error) {
          console.error('[ActiveRecall] AI chat stream error:', error)
          const errMsg = error instanceof Error ? error.message : 'Chat failed'
          controller.enqueue(encoder.encode(`3:${JSON.stringify(errMsg)}\n`))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('[ActiveRecall] AI chat error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
