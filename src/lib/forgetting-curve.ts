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
