// ============================================
// SM-2 Spaced Repetition Algorithm
// Pure functions — isomorphic (client + server)
// ============================================

import { RecallLayer } from '@/types/active-recall'

export interface SM2Input {
  quality: number        // 0-5 rating scale
  repetitions: number    // current consecutive correct count
  easeFactor: number     // current ease factor (≥ 1.3)
  intervalDays: number   // current interval in days
  aiMultiplier?: number  // AI-computed override (default 1.0)
  avgResponseTimeMs?: number  // average response time — slow = uncertainty, fast = confidence
  difficulty?: string | null  // card difficulty level
}

export interface SM2Output {
  repetitions: number
  easeFactor: number
  intervalDays: number
  nextReviewAt: Date
}

function roundInterval(days: number) {
  return days < 1
    ? Math.round(days * 100000) / 100000
    : Math.round(days * 100) / 100
}

/**
 * SM-2 Algorithm — compute next review schedule based on rating.
 *
 * Quality scale:
 *   0 = Complete blackout (Again)
 *   1 = Incorrect, but remembered upon seeing answer
 *   2 = Incorrect, but answer seemed easy to recall (Hard)
 *   3 = Correct with serious difficulty (Good)
 *   4 = Correct after hesitation
 *   5 = Perfect response (Easy)
 */
export function sm2(input: SM2Input): SM2Output {
  const { quality, repetitions, easeFactor, intervalDays, aiMultiplier = 1.0, avgResponseTimeMs, difficulty } = input

  let newReps: number
  let newEF: number
  let newInterval: number

  if (quality < 3) {
    // Failed — reset repetitions, short interval for re-learning
    newReps = 0
    newEF = Math.max(1.3, easeFactor - 0.2)
    newInterval = quality === 0 ? 0.00069 : 0.00694 // ~1 min or ~10 min
  } else {
    // Passed — progress through SM-2 intervals
    newReps = repetitions + 1

    if (newReps === 1) {
      newInterval = 1 // 1 day
    } else if (newReps === 2) {
      newInterval = 6 // 6 days
    } else {
      newInterval = Math.round(intervalDays * easeFactor * 100) / 100
    }

    // Update ease factor using SM-2 formula
    newEF = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    newEF = Math.max(1.3, Math.round(newEF * 100) / 100)
  }

  // Apply AI multiplier to interval
  newInterval = roundInterval(newInterval * aiMultiplier)

  // Apply response time adjustment (capped at ±10%)
  if (avgResponseTimeMs !== undefined && quality >= 3) {
    if (avgResponseTimeMs > 12000) {
      // Slow response indicates uncertainty — review sooner
      newInterval = roundInterval(newInterval * 0.9)
    } else if (avgResponseTimeMs < 3000) {
      // Fast confident response — can space out
      newInterval = roundInterval(newInterval * 1.05)
    }
  }

  // Apply difficulty adjustment on failures
  if (difficulty === 'hard' && quality < 3) {
    newEF = Math.max(1.3, newEF - 0.05)
  }

  // Compute next review date
  const nextReviewAt = new Date()
  nextReviewAt.setTime(nextReviewAt.getTime() + newInterval * 24 * 60 * 60 * 1000)

  return {
    repetitions: newReps,
    easeFactor: newEF,
    intervalDays: newInterval,
    nextReviewAt,
  }
}

/**
 * Preview intervals for all 4 rating buttons.
 * Used by the UI to show "1d", "6d", etc. on each button.
 */
export function previewIntervals(input: Omit<SM2Input, 'quality'>): {
  again: string
  hard: string
  good: string
  easy: string
} {
  const again = sm2({ ...input, quality: 0 })
  const hard = sm2({ ...input, quality: 2 })
  const good = sm2({ ...input, quality: 3 })
  const easy = sm2({ ...input, quality: 5 })

  return {
    again: formatInterval(again.intervalDays),
    hard: formatInterval(hard.intervalDays),
    good: formatInterval(good.intervalDays),
    easy: formatInterval(easy.intervalDays),
  }
}

/**
 * Format interval in days to human-readable string.
 */
export function formatInterval(days: number): string {
  if (days < 0.0035) return '<1m'      // less than ~5 min
  if (days < 0.042) return `${Math.round(days * 24 * 60)}m` // minutes
  if (days < 1) return `${Math.round(days * 24)}h`          // hours
  if (days < 30) return `${Math.round(days)}d`               // days
  if (days < 365) return `${Math.round(days / 30)}mo`        // months
  return `${Math.round(days / 365)}y`                         // years
}

// ============================================
// Multi-Layer Recall State Machine
// ============================================

export interface LayerTransition {
  newLayer: RecallLayer
  reason: string
}

/**
 * Compute layer transition based on rating and performance.
 *
 * Transitions:
 *   ABSORB → RECOGNIZE (always, first review)
 *   RECOGNIZE → RETRIEVE (2+ consecutive correct)
 *   RETRIEVE → MASTERED (3+ consecutive correct)
 *   MASTERED → RECOGNIZE (hard fail = lapse)
 *   RETRIEVE → RECOGNIZE (hard fail)
 */
export function computeLayerTransition(
  currentLayer: RecallLayer,
  quality: number,
  consecutiveCorrect: number,
): LayerTransition {
  const passed = quality >= 3
  const failedHard = quality <= 1

  switch (currentLayer) {
    case RecallLayer.ABSORB:
      return { newLayer: RecallLayer.RECOGNIZE, reason: 'First exposure complete' }

    case RecallLayer.RECOGNIZE:
      if (passed && consecutiveCorrect >= 2) {
        return { newLayer: RecallLayer.RETRIEVE, reason: 'Consistent recognition — testing retrieval' }
      }
      if (failedHard) {
        return { newLayer: RecallLayer.RECOGNIZE, reason: 'Keep practicing recognition' }
      }
      return { newLayer: RecallLayer.RECOGNIZE, reason: 'Continue recognition practice' }

    case RecallLayer.RETRIEVE:
      if (passed && consecutiveCorrect >= 3) {
        return { newLayer: RecallLayer.MASTERED, reason: 'Strong retrieval — entering spaced repetition' }
      }
      if (failedHard) {
        return { newLayer: RecallLayer.RECOGNIZE, reason: 'Retrieval failed — returning to recognition' }
      }
      return { newLayer: RecallLayer.RETRIEVE, reason: 'Continue retrieval practice' }

    case RecallLayer.MASTERED:
      if (failedHard) {
        return { newLayer: RecallLayer.RECOGNIZE, reason: 'Lapse detected — re-learning needed' }
      }
      return { newLayer: RecallLayer.MASTERED, reason: 'Maintaining mastery' }

    default:
      return { newLayer: RecallLayer.RECOGNIZE, reason: 'Unknown state — resetting' }
  }
}
