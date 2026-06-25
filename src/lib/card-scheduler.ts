// ============================================
// Smart Card Scheduler — Priority Scoring & Interleaving
// ============================================

import type { ReviewCard } from '@/types/active-recall'
import { RecallLayer } from '@/types/active-recall'

/**
 * Compute a priority score for a card based on multiple factors.
 * Higher score = higher priority = should be reviewed sooner.
 */
export function computePriorityScore(card: ReviewCard, now: Date = new Date()): number {
  const nextReview = card.next_review_at ? new Date(card.next_review_at) : now
  const intervalDays = Math.max(0.01, card.interval_days || 1)

  // How overdue relative to its interval (0 = on time, >1 = very overdue)
  const daysSincedue = (now.getTime() - nextReview.getTime()) / (1000 * 60 * 60 * 24)
  const overdueRatio = Math.max(0, daysSincedue / intervalDays)

  // Difficulty weight
  const difficultyWeight = card.difficulty === 'hard' ? 1.2
    : card.difficulty === 'easy' ? 0.8
    : 1.0

  // Lapse weight: cards that lapse more are higher priority
  const lapseWeight = 1 + ((card.lapse_count || 0) * 0.15)

  // Response time weight: slow responses indicate uncertainty
  const avgMs = card.average_response_time_ms || 5000
  const responseTimeWeight = Math.max(0.5, Math.min(1.5, avgMs / 8000))

  // Layer weight: prioritize middle layers where active learning happens
  const layerWeights: Record<number, number> = {
    [RecallLayer.ABSORB]: 0.6,
    [RecallLayer.RECOGNIZE]: 1.0,
    [RecallLayer.RETRIEVE]: 1.2,
    [RecallLayer.MASTERED]: 0.8,
  }
  const layerWeight = layerWeights[card.recall_layer] ?? 1.0

  return overdueRatio * difficultyWeight * lapseWeight * responseTimeWeight * layerWeight
}

/**
 * Interleave cards so no two consecutive cards share the same topic.
 * Uses round-robin from topic-grouped buckets.
 */
export function interleaveByTopic<T extends { topic?: string | null }>(cards: T[]): T[] {
  if (cards.length <= 2) return cards

  // Group by topic
  const buckets = new Map<string, T[]>()
  for (const card of cards) {
    const topic = card.topic || 'General'
    const bucket = buckets.get(topic) || []
    bucket.push(card)
    buckets.set(topic, bucket)
  }

  // Sort buckets by size descending (largest topic first to spread better)
  const sortedBuckets = [...buckets.values()].sort((a, b) => b.length - a.length)

  // Round-robin dequeue
  const result: T[] = []
  let lastTopic: string | null = null

  while (result.length < cards.length) {
    let added = false

    for (const bucket of sortedBuckets) {
      if (bucket.length === 0) continue
      const candidateTopic = (bucket[0] as { topic?: string | null }).topic || 'General'

      // Skip if same topic as last card (unless it's the only option)
      if (candidateTopic === lastTopic) continue

      result.push(bucket.shift()!)
      lastTopic = candidateTopic
      added = true
      break
    }

    // If no different topic found, take from the largest remaining bucket
    if (!added) {
      for (const bucket of sortedBuckets) {
        if (bucket.length > 0) {
          result.push(bucket.shift()!)
          lastTopic = ((result[result.length - 1] as { topic?: string | null }).topic) || 'General'
          break
        }
      }
    }
  }

  return result
}

/**
 * Select cards that fit within a time budget.
 * Estimates ~30s per card, weighted by difficulty and source type.
 */
export function selectCardsForCapacity<T extends { difficulty?: string | null; source_type?: string }>(
  cards: T[],
  minutesAvailable: number
): T[] {
  const secondsAvailable = minutesAvailable * 60
  let usedSeconds = 0
  const selected: T[] = []

  for (const card of cards) {
    // Base: 30s per card
    let cardSeconds = 30
    if (card.difficulty === 'hard') cardSeconds = 40
    else if (card.difficulty === 'easy') cardSeconds = 20
    // Mindmap cards take longer (context switching)
    if (card.source_type === 'mindmap') cardSeconds += 10

    if (usedSeconds + cardSeconds > secondsAvailable) break
    usedSeconds += cardSeconds
    selected.push(card)
  }

  return selected
}

/**
 * Categorize cards by urgency for the smart schedule metadata.
 */
export function categorizeByUrgency(cards: Array<{ priorityScore: number }>) {
  let critical = 0
  let important = 0
  let routine = 0

  for (const card of cards) {
    if (card.priorityScore > 2.0) critical++
    else if (card.priorityScore > 0.8) important++
    else routine++
  }

  return { critical, important, routine }
}

/**
 * Extract top focus topics from scored cards.
 */
export function getTopFocusTopics(
  cards: Array<{ topic?: string | null; priorityScore: number }>,
  maxTopics = 3
): Array<{ topic: string; cardCount: number; avgPriority: number }> {
  const topicMap = new Map<string, { count: number; totalPriority: number }>()

  for (const card of cards) {
    const topic = card.topic || 'General'
    const existing = topicMap.get(topic) || { count: 0, totalPriority: 0 }
    existing.count++
    existing.totalPriority += card.priorityScore
    topicMap.set(topic, existing)
  }

  return [...topicMap.entries()]
    .map(([topic, data]) => ({
      topic,
      cardCount: data.count,
      avgPriority: Math.round((data.totalPriority / data.count) * 100) / 100,
    }))
    .sort((a, b) => b.avgPriority - a.avgPriority)
    .slice(0, maxTopics)
}
