import type { ActiveRecallLearningContext } from '@/lib/active-recall-learning-context'

export type ActiveRecallReadinessStatus = 'ready' | 'needs_work' | 'not_enough_data'

export interface ActiveRecallReadinessSummary {
  score: number
  status: ActiveRecallReadinessStatus
  label: string
  reason: string
  nextFocus: string
  dueLoad: {
    totalDue: number
    overdue: number
    byTopic: Array<{ topic: string; dueCount: number; cardCount: number }>
  }
  weakTopics: Array<{
    topic: string
    accuracy: number | null
    dueCount: number
    masteryPct: number
    cardCount: number
  }>
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function buildActiveRecallReadiness(
  context: ActiveRecallLearningContext
): ActiveRecallReadinessSummary {
  const { summary } = context

  if (summary.totalCards === 0) {
    return {
      score: 0,
      status: 'not_enough_data',
      label: 'Needs data',
      reason: 'No review cards are attached yet.',
      nextFocus: 'Generate today\'s material so the agent can measure readiness.',
      dueLoad: {
        totalDue: 0,
        overdue: 0,
        byTopic: [],
      },
      weakTopics: [],
    }
  }

  const accuracy = summary.accuracy ?? 50
  const mastered = summary.masteryLayerDistribution[4] || 0
  const retrieve = summary.masteryLayerDistribution[3] || 0
  const durablePct = ((mastered + retrieve * 0.75) / summary.totalCards) * 100
  const duePenalty = Math.min(25, (summary.dueCards / summary.totalCards) * 50)
  const overduePenalty = Math.min(15, (summary.overdueCards / summary.totalCards) * 60)
  const weakPenalty = Math.min(18, context.weakTopics.length * 4)
  const recentBoost = summary.recentSessions.accuracy !== null && summary.recentSessions.accuracy >= 85 ? 5 : 0

  const score = clampScore(
    accuracy * 0.38
    + durablePct * 0.42
    + summary.masteryLayerDistribution[4] / summary.totalCards * 20
    + recentBoost
    - duePenalty
    - overduePenalty
    - weakPenalty
  )

  const status: ActiveRecallReadinessStatus = summary.totalReviews < 3
    ? 'not_enough_data'
    : score >= 72 && summary.overdueCards === 0
      ? 'ready'
      : 'needs_work'

  const topWeak = context.weakTopics[0]
  const topDue = context.dueLoadByTopic[0]
  const nextFocus = topWeak
    ? `Focus on ${topWeak.topic}`
    : topDue
      ? `Clear due reviews in ${topDue.topic}`
      : summary.dueCards > 0
        ? 'Clear today\'s due reviews'
        : 'Continue the next planned activity'

  const reason = status === 'ready'
    ? `Readiness is strong at ${score}% with ${summary.dueCards} due.`
    : status === 'not_enough_data'
      ? `Only ${summary.totalReviews} reviews recorded; readiness will improve after more review data.`
      : `${summary.dueCards} due, ${summary.overdueCards} overdue, and ${context.weakTopics.length} weak ${context.weakTopics.length === 1 ? 'topic' : 'topics'} need attention.`

  return {
    score,
    status,
    label: status === 'ready' ? 'Ready' : status === 'needs_work' ? 'Needs work' : 'Needs data',
    reason,
    nextFocus,
    dueLoad: {
      totalDue: summary.dueCards,
      overdue: summary.overdueCards,
      byTopic: context.dueLoadByTopic,
    },
    weakTopics: context.weakTopics.map((topic) => ({
      topic: topic.topic,
      accuracy: topic.accuracy,
      dueCount: topic.dueCount,
      masteryPct: topic.masteryPct,
      cardCount: topic.cardCount,
    })),
  }
}
