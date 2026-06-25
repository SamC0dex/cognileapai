// ============================================
// Forgetting Curve — Ebbinghaus Model
// Pure functions for retention prediction
// ============================================

/**
 * Predict retention using the Ebbinghaus forgetting curve.
 * R(t) = e^(-t/S) where S = stability
 *
 * @param lastReviewedAt - When the card was last reviewed
 * @param intervalDays - The SM-2 interval at last review
 * @param easeFactor - The SM-2 ease factor
 * @param now - Current time (defaults to now)
 * @returns Retention as a decimal (0-1)
 */
export function predictRetention(
  lastReviewedAt: Date | string,
  intervalDays: number,
  easeFactor: number,
  now: Date = new Date()
): number {
  const lastReview = typeof lastReviewedAt === 'string' ? new Date(lastReviewedAt) : lastReviewedAt
  const daysSinceReview = (now.getTime() - lastReview.getTime()) / (1000 * 60 * 60 * 24)

  if (daysSinceReview <= 0) return 1 // Just reviewed

  // Stability = how long the memory lasts (normalized by ease factor)
  const stability = Math.max(0.5, intervalDays * (easeFactor / 2.5))

  // Ebbinghaus: R = e^(-t/S)
  const retention = Math.exp(-daysSinceReview / stability)

  return Math.max(0, Math.min(1, retention))
}

/**
 * Generate curve points for visualization.
 * Returns an array of { day, retention } for plotting.
 */
export function generateCurvePoints(
  lastReviewedAt: Date | string,
  intervalDays: number,
  easeFactor: number,
  daysAhead: number = 30,
  numPoints: number = 60
): { day: number; retention: number }[] {
  const lastReview = typeof lastReviewedAt === 'string' ? new Date(lastReviewedAt) : lastReviewedAt
  const points: { day: number; retention: number }[] = []

  for (let i = 0; i <= numPoints; i++) {
    const day = (i / numPoints) * daysAhead
    const futureDate = new Date(lastReview.getTime() + day * 24 * 60 * 60 * 1000)
    const retention = predictRetention(lastReview, intervalDays, easeFactor, futureDate)
    points.push({ day: Math.round(day * 100) / 100, retention: Math.round(retention * 1000) / 1000 })
  }

  return points
}

/**
 * Aggregate retention across multiple cards for a document.
 * Returns average current retention and combined curve points.
 */
export function aggregateDocumentRetention(
  cards: Array<{
    last_reviewed_at: string | null
    interval_days: number
    ease_factor: number
    created_at: string
  }>,
  daysAhead: number = 30
): {
  currentRetention: number
  curvePoints: { day: number; retention: number }[]
  optimalReviewDay: number | null
} {
  if (cards.length === 0) {
    return { currentRetention: 0, curvePoints: [], optimalReviewDay: null }
  }

  const now = new Date()

  // Calculate current retention for each card
  const retentions = cards.map((card) => {
    const lastReview = card.last_reviewed_at || card.created_at
    return predictRetention(lastReview, card.interval_days || 1, card.ease_factor)
  })

  const currentRetention = retentions.reduce((sum, r) => sum + r, 0) / retentions.length

  // Generate combined curve: average all card curves
  const numPoints = 60
  const curvePoints: { day: number; retention: number }[] = []

  for (let i = 0; i <= numPoints; i++) {
    const day = (i / numPoints) * daysAhead
    const avgRetention = cards.reduce((sum, card) => {
      const lastReview = card.last_reviewed_at || card.created_at
      const lastReviewDate = new Date(lastReview)
      const futureDate = new Date(now.getTime() + day * 24 * 60 * 60 * 1000)
      return sum + predictRetention(lastReviewDate, card.interval_days || 1, card.ease_factor, futureDate)
    }, 0) / cards.length

    curvePoints.push({
      day: Math.round(day * 100) / 100,
      retention: Math.round(avgRetention * 1000) / 1000,
    })
  }

  // Find when retention drops below 0.5 (50%) — optimal review day
  const threshold = 0.5
  let optimalReviewDay: number | null = null
  for (const point of curvePoints) {
    if (point.retention < threshold) {
      optimalReviewDay = Math.round(point.day)
      break
    }
  }

  return { currentRetention, curvePoints, optimalReviewDay }
}

/**
 * Calculate days until retention drops below a threshold.
 */
export function daysUntilRetentionDrops(
  lastReviewedAt: Date | string,
  intervalDays: number,
  easeFactor: number,
  threshold: number = 0.5
): number {
  const stability = Math.max(0.5, intervalDays * (easeFactor / 2.5))
  // Solve: threshold = e^(-t/S) → t = -S * ln(threshold)
  const days = -stability * Math.log(threshold)
  const lastReview = typeof lastReviewedAt === 'string' ? new Date(lastReviewedAt) : lastReviewedAt
  const daysSinceReview = (Date.now() - lastReview.getTime()) / (1000 * 60 * 60 * 24)

  return Math.max(0, Math.round(days - daysSinceReview))
}

// ============================================
// Predictive Analytics Extensions
// ============================================

interface CardMinimal {
  last_reviewed_at: string | null
  interval_days: number
  ease_factor: number
  recall_layer: number
  consecutive_correct: number
  total_reviews: number
  correct_reviews: number
  average_response_time_ms: number
  lapse_count: number
  topic?: string | null
  next_review_at?: string | null
  stuck_since?: string | null
  created_at?: string
}

/**
 * Predict retention for a specific card at a specific future date.
 */
export function predictRetentionAtDate(card: CardMinimal, targetDate: Date): number {
  const lastReview = card.last_reviewed_at || card.created_at || new Date().toISOString()
  return predictRetention(lastReview, card.interval_days || 1, card.ease_factor || 2.5, targetDate)
}

/**
 * Estimate how many days and reviews until a card reaches MASTERED (layer 4).
 * Based on layer transition thresholds: RECOGNIZE→RETRIEVE needs 2 consecutive correct,
 * RETRIEVE→MASTERED needs 3 consecutive correct.
 */
export function estimateTimeToMastery(card: CardMinimal): { days: number; reviewsNeeded: number } {
  const layer = card.recall_layer || 1

  if (layer >= 4) return { days: 0, reviewsNeeded: 0 }

  // Estimate reviews needed per layer transition
  const accuracy = card.total_reviews > 0 ? card.correct_reviews / card.total_reviews : 0.5
  const avgInterval = Math.max(1, card.interval_days || 1)

  let reviewsNeeded = 0
  let estimatedDays = 0
  let currentInterval = avgInterval

  if (layer <= 1) {
    // ABSORB → RECOGNIZE: 1 review
    reviewsNeeded += 1
    estimatedDays += 1
    currentInterval = 1
  }

  if (layer <= 2) {
    // RECOGNIZE → RETRIEVE: need 2 consecutive correct
    // Account for failure probability
    const expectedTrials = Math.ceil(2 / Math.max(0.1, accuracy))
    reviewsNeeded += expectedTrials
    estimatedDays += expectedTrials * currentInterval
    currentInterval = Math.max(1, currentInterval * (card.ease_factor || 2.5) * 0.5)
  }

  if (layer <= 3) {
    // RETRIEVE → MASTERED: need 3 consecutive correct
    const expectedTrials = Math.ceil(3 / Math.max(0.1, accuracy))
    reviewsNeeded += expectedTrials
    estimatedDays += expectedTrials * currentInterval
  }

  return {
    days: Math.round(estimatedDays),
    reviewsNeeded,
  }
}

/**
 * Generate a day-by-day retention forecast for a set of cards.
 */
export function aggregateTopicRetentionForecast(
  cards: CardMinimal[],
  daysAhead: number = 30
): Array<{ date: string; avgRetention: number; cardsDue: number }> {
  if (cards.length === 0) return []

  const now = new Date()
  const forecast: Array<{ date: string; avgRetention: number; cardsDue: number }> = []

  for (let d = 0; d <= daysAhead; d++) {
    const targetDate = new Date(now.getTime() + d * 24 * 60 * 60 * 1000)
    const dateStr = targetDate.toISOString().split('T')[0]

    let totalRetention = 0
    let cardsDue = 0

    for (const card of cards) {
      const retention = predictRetentionAtDate(card, targetDate)
      totalRetention += retention

      // Card is due if its next_review_at is on or before the target date
      if (card.next_review_at && new Date(card.next_review_at) <= targetDate) {
        cardsDue++
      }
    }

    forecast.push({
      date: dateStr,
      avgRetention: Math.round((totalRetention / cards.length) * 1000) / 1000,
      cardsDue,
    })
  }

  return forecast
}

/**
 * Detect cards that are stuck — reviewed multiple times but not progressing.
 */
export function detectStuckCards(cards: CardMinimal[]): Array<{
  card: CardMinimal
  reason: string
}> {
  const stuck: Array<{ card: CardMinimal; reason: string }> = []

  for (const card of cards) {
    // Already flagged
    if (card.stuck_since) {
      stuck.push({ card, reason: `Flagged stuck since ${new Date(card.stuck_since).toLocaleDateString()}` })
      continue
    }

    // Detection heuristic: 5+ reviews, still at low layer, can't build consecutive correct
    if (card.total_reviews >= 5 && card.recall_layer <= 2 && card.consecutive_correct < 2) {
      const accuracy = card.total_reviews > 0 ? Math.round((card.correct_reviews / card.total_reviews) * 100) : 0
      stuck.push({
        card,
        reason: `${card.total_reviews} reviews at layer ${card.recall_layer} with ${accuracy}% accuracy — not progressing`,
      })
    }

    // High lapse rate
    if (card.lapse_count >= 3 && card.recall_layer <= 3) {
      stuck.push({
        card,
        reason: `Lapsed ${card.lapse_count} times — keeps forgetting after initial learning`,
      })
    }
  }

  // Deduplicate by card (keep first reason)
  const seen = new Set<string>()
  return stuck.filter((s) => {
    const key = (s.card as CardMinimal & { id?: string }).id || s.card.topic || ''
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
