import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { RecallLayer } from '@/types/active-recall'

type ReviewCardRow = {
  id: string
  source_type: string
  question: string
  topic: string | null
  document_id: string | null
  plan_id: string | null
  recall_layer: number
  total_reviews: number
  correct_reviews: number
  average_response_time_ms: number | null
  lapse_count: number
  consecutive_correct: number
  next_review_at: string
  last_reviewed_at: string | null
}

type ReviewSessionRow = {
  id: string
  cards_reviewed: number
  cards_correct: number
  cards_incorrect: number
  total_time_ms: number | null
  started_at: string
  completed_at: string | null
}

type TopicContext = {
  topic: string
  cardCount: number
  dueCount: number
  totalReviews: number
  accuracy: number | null
  avgResponseTimeMs: number | null
  lapseCount: number
  averageLayer: number
  masteryPct: number
}

function accuracy(correct: number, total: number) {
  return total > 0 ? Math.round((correct / total) * 100) : null
}

function isDue(card: ReviewCardRow, nowIso: string) {
  return card.next_review_at <= nowIso
}

function topicStats(cards: ReviewCardRow[], nowIso: string): TopicContext[] {
  const map = new Map<string, {
    cardCount: number
    dueCount: number
    totalReviews: number
    correctReviews: number
    responseTimeTotal: number
    responseTimeCount: number
    lapseCount: number
    layerTotal: number
    masteredCount: number
  }>()

  for (const card of cards) {
    const topic = card.topic || 'General'
    const entry = map.get(topic) || {
      cardCount: 0,
      dueCount: 0,
      totalReviews: 0,
      correctReviews: 0,
      responseTimeTotal: 0,
      responseTimeCount: 0,
      lapseCount: 0,
      layerTotal: 0,
      masteredCount: 0,
    }

    entry.cardCount++
    if (isDue(card, nowIso)) entry.dueCount++
    entry.totalReviews += card.total_reviews || 0
    entry.correctReviews += card.correct_reviews || 0
    if (card.average_response_time_ms) {
      entry.responseTimeTotal += card.average_response_time_ms
      entry.responseTimeCount++
    }
    entry.lapseCount += card.lapse_count || 0
    entry.layerTotal += card.recall_layer || RecallLayer.ABSORB
    if (card.recall_layer === RecallLayer.MASTERED) entry.masteredCount++

    map.set(topic, entry)
  }

  return Array.from(map.entries()).map(([topic, entry]) => ({
    topic,
    cardCount: entry.cardCount,
    dueCount: entry.dueCount,
    totalReviews: entry.totalReviews,
    accuracy: accuracy(entry.correctReviews, entry.totalReviews),
    avgResponseTimeMs: entry.responseTimeCount > 0
      ? Math.round(entry.responseTimeTotal / entry.responseTimeCount)
      : null,
    lapseCount: entry.lapseCount,
    averageLayer: Math.round((entry.layerTotal / entry.cardCount) * 100) / 100,
    masteryPct: Math.round((entry.masteredCount / entry.cardCount) * 100),
  }))
}

function weakTopicScore(topic: TopicContext) {
  const accuracyPenalty = topic.accuracy === null ? 20 : Math.max(0, 75 - topic.accuracy)
  const slowPenalty = topic.avgResponseTimeMs && topic.avgResponseTimeMs > 12000 ? 12 : 0
  const lapsePenalty = Math.min(20, topic.lapseCount * 5)
  const duePenalty = Math.min(15, topic.dueCount * 2)
  const layerPenalty = Math.max(0, (RecallLayer.RETRIEVE - topic.averageLayer) * 8)
  return accuracyPenalty + slowPenalty + lapsePenalty + duePenalty + layerPenalty
}

function strongTopicScore(topic: TopicContext) {
  const acc = topic.accuracy ?? 0
  return acc + topic.masteryPct + Math.max(0, topic.averageLayer - RecallLayer.RECOGNIZE) * 10 - topic.lapseCount * 5
}

function recentSessionSummary(sessions: ReviewSessionRow[]) {
  const completed = sessions.filter((session) => session.completed_at && session.cards_reviewed > 0)
  const totalReviewed = completed.reduce((sum, session) => sum + (session.cards_reviewed || 0), 0)
  const totalCorrect = completed.reduce((sum, session) => sum + (session.cards_correct || 0), 0)

  return {
    count: completed.length,
    cardsReviewed: totalReviewed,
    accuracy: accuracy(totalCorrect, totalReviewed),
    latest: completed.slice(0, 3).map((session) => ({
      id: session.id,
      startedAt: session.started_at,
      cardsReviewed: session.cards_reviewed,
      accuracy: accuracy(session.cards_correct || 0, session.cards_reviewed || 0),
      totalTimeMs: session.total_time_ms,
    })),
  }
}

function layerDistribution(cards: ReviewCardRow[]) {
  return {
    [RecallLayer.ABSORB]: cards.filter((card) => card.recall_layer === RecallLayer.ABSORB).length,
    [RecallLayer.RECOGNIZE]: cards.filter((card) => card.recall_layer === RecallLayer.RECOGNIZE).length,
    [RecallLayer.RETRIEVE]: cards.filter((card) => card.recall_layer === RecallLayer.RETRIEVE).length,
    [RecallLayer.MASTERED]: cards.filter((card) => card.recall_layer === RecallLayer.MASTERED).length,
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const planId = searchParams.get('plan_id')
    const documentId = searchParams.get('document_id')
    const nowIso = new Date().toISOString()

    let plan: {
      id: string
      title: string
      schedule: unknown
      current_day: number | null
      created_at: string
      document_ids: string[] | null
      onboarding_context?: Record<string, unknown> | null
    } | null = null

    if (planId) {
      const { data: planData, error: planError } = await supabase
        .from('agent_study_plans')
        .select('id,title,schedule,current_day,created_at,document_ids,onboarding_context')
        .eq('id', planId)
        .eq('user_id', user.id)
        .single()

      if (planError || !planData) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
      }
      plan = planData
    }

    let cardsQuery = supabase
      .from('review_cards')
      .select('id,source_type,question,topic,document_id,plan_id,recall_layer,total_reviews,correct_reviews,average_response_time_ms,lapse_count,consecutive_correct,next_review_at,last_reviewed_at')
      .eq('user_id', user.id)

    if (planId) cardsQuery = cardsQuery.eq('plan_id', planId)
    if (documentId) cardsQuery = cardsQuery.eq('document_id', documentId)

    const { data: cards, error: cardsError } = await cardsQuery

    if (cardsError) {
      console.error('[LearningContext] Cards fetch error:', cardsError)
      return NextResponse.json({ error: 'Failed to fetch learning context cards' }, { status: 500 })
    }

    let sessionsQuery = supabase
      .from('review_sessions')
      .select('id,cards_reviewed,cards_correct,cards_incorrect,total_time_ms,started_at,completed_at')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(10)

    if (planId) sessionsQuery = sessionsQuery.eq('plan_id', planId)

    const { data: sessions, error: sessionsError } = await sessionsQuery
    if (sessionsError) {
      console.error('[LearningContext] Sessions fetch error:', sessionsError)
      return NextResponse.json({ error: 'Failed to fetch learning context sessions' }, { status: 500 })
    }

    const reviewCards = (cards || []) as ReviewCardRow[]
    const topicContexts = topicStats(reviewCards, nowIso)
    const dueCards = reviewCards.filter((card) => isDue(card, nowIso))
    const totalReviews = reviewCards.reduce((sum, card) => sum + (card.total_reviews || 0), 0)
    const totalCorrect = reviewCards.reduce((sum, card) => sum + (card.correct_reviews || 0), 0)

    const weakTopics = [...topicContexts]
      .filter((topic) => topic.totalReviews > 0 || topic.dueCount > 0)
      .sort((a, b) => weakTopicScore(b) - weakTopicScore(a))
      .slice(0, 5)

    const strongTopics = [...topicContexts]
      .filter((topic) => (topic.accuracy ?? 0) >= 80 && topic.totalReviews >= 2)
      .sort((a, b) => strongTopicScore(b) - strongTopicScore(a))
      .slice(0, 5)

    const missedCards = reviewCards
      .filter((card) => (card.total_reviews || 0) > (card.correct_reviews || 0))
      .sort((a, b) => {
        const aMisses = (a.total_reviews || 0) - (a.correct_reviews || 0)
        const bMisses = (b.total_reviews || 0) - (b.correct_reviews || 0)
        return bMisses - aMisses
      })
      .slice(0, 8)
      .map((card) => ({
        cardId: card.id,
        topic: card.topic || 'General',
        question: card.question,
        misses: (card.total_reviews || 0) - (card.correct_reviews || 0),
        totalReviews: card.total_reviews || 0,
      }))

    const slowResponseTopics = [...topicContexts]
      .filter((topic) => (topic.avgResponseTimeMs || 0) >= 10000)
      .sort((a, b) => (b.avgResponseTimeMs || 0) - (a.avgResponseTimeMs || 0))
      .slice(0, 5)

    const examDate = plan?.onboarding_context && typeof plan.onboarding_context.examDate === 'string'
      ? plan.onboarding_context.examDate
      : plan?.onboarding_context && typeof plan.onboarding_context.deadline === 'string'
        ? plan.onboarding_context.deadline
        : null

    const daysUntilExam = examDate
      ? Math.ceil((new Date(examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null
    const planSchedule = plan?.schedule
      ? typeof plan.schedule === 'string'
        ? JSON.parse(plan.schedule)
        : plan.schedule
      : null
    const totalDays = Array.isArray(planSchedule) ? planSchedule.length : null

    return NextResponse.json({
      context: {
        scope: {
          planId: planId || null,
          documentId: documentId || null,
          generatedAt: nowIso,
        },
        plan: plan ? {
          id: plan.id,
          title: plan.title,
          currentDay: plan.current_day,
          totalDays,
          examDate,
          daysUntilExam,
        } : null,
        summary: {
          totalCards: reviewCards.length,
          dueCards: dueCards.length,
          overdueCards: dueCards.filter((card) => new Date(card.next_review_at).getTime() < Date.now() - 24 * 60 * 60 * 1000).length,
          totalReviews,
          accuracy: accuracy(totalCorrect, totalReviews),
          masteryLayerDistribution: layerDistribution(reviewCards),
          recentSessions: recentSessionSummary((sessions || []) as ReviewSessionRow[]),
        },
        weakTopics,
        strongTopics,
        missedCards,
        slowResponseTopics,
        dueLoadByTopic: topicContexts
          .filter((topic) => topic.dueCount > 0)
          .sort((a, b) => b.dueCount - a.dueCount)
          .slice(0, 8)
          .map((topic) => ({
            topic: topic.topic,
            dueCount: topic.dueCount,
            cardCount: topic.cardCount,
          })),
        topicPerformance: topicContexts
          .sort((a, b) => {
            const aAcc = a.accuracy ?? -1
            const bAcc = b.accuracy ?? -1
            return aAcc - bAcc
          })
          .slice(0, 12),
      },
    })
  } catch (error) {
    console.error('[LearningContext] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
