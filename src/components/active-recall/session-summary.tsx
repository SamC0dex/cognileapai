'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui'
import { Trophy, Target, Clock, ArrowUp, ArrowDown, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RecallLayer, RECALL_LAYER_LABELS } from '@/types/active-recall'
import type { ReviewSessionResult } from '@/types/active-recall'

interface SessionSummaryProps {
  ratings: ReviewSessionResult[]
  totalCards: number
  startedAt: Date
  onClose: () => void
  streak?: number
  className?: string
}

export function SessionSummary({
  ratings,
  totalCards,
  startedAt,
  onClose,
  streak,
  className,
}: SessionSummaryProps) {
  const correctCount = ratings.filter((r) => r.rating >= 3).length
  const accuracy = totalCards > 0 ? Math.round((correctCount / totalCards) * 100) : 0
  const totalTimeMs = Date.now() - startedAt.getTime()
  const totalTimeSec = Math.round(totalTimeMs / 1000)
  const minutes = Math.floor(totalTimeSec / 60)
  const seconds = totalTimeSec % 60

  // Layer changes
  const promotions = ratings.filter((r) => r.new_layer > r.previous_layer).length
  const demotions = ratings.filter((r) => r.new_layer < r.previous_layer).length

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn('w-full max-w-lg mx-auto', className)}
    >
      <div className="rounded-xl border bg-card p-8 shadow-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            <Trophy className="w-12 h-12 mx-auto mb-3 text-yellow-500" />
          </motion.div>
          <h2 className="text-2xl font-bold">Session Complete!</h2>
          <p className="text-muted-foreground mt-1">
            {accuracy >= 90
              ? 'Outstanding performance!'
              : accuracy >= 70
                ? 'Great job! Keep it up.'
                : accuracy >= 50
                  ? 'Good effort. Practice makes perfect.'
                  : 'Keep going — every review strengthens your memory.'}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-lg bg-muted/50 p-4 text-center">
            <Target className="w-5 h-5 mx-auto mb-1 text-green-500" />
            <div className="text-2xl font-bold">{accuracy}%</div>
            <div className="text-xs text-muted-foreground">Accuracy</div>
          </div>

          <div className="rounded-lg bg-muted/50 p-4 text-center">
            <Clock className="w-5 h-5 mx-auto mb-1 text-blue-500" />
            <div className="text-2xl font-bold">
              {minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`}
            </div>
            <div className="text-xs text-muted-foreground">Time Spent</div>
          </div>

          <div className="rounded-lg bg-muted/50 p-4 text-center">
            <div className="text-2xl font-bold">
              {correctCount}/{totalCards}
            </div>
            <div className="text-xs text-muted-foreground">Cards Correct</div>
          </div>

          {streak !== undefined && streak > 0 && (
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <Flame className="w-5 h-5 mx-auto mb-1 text-orange-500" />
              <div className="text-2xl font-bold">{streak}</div>
              <div className="text-xs text-muted-foreground">Day Streak</div>
            </div>
          )}
        </div>

        {/* Layer Changes */}
        {(promotions > 0 || demotions > 0) && (
          <div className="mb-6 space-y-2">
            {promotions > 0 && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <ArrowUp className="w-4 h-4" />
                <span>{promotions} card{promotions > 1 ? 's' : ''} promoted to a higher level</span>
              </div>
            )}
            {demotions > 0 && (
              <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400">
                <ArrowDown className="w-4 h-4" />
                <span>{demotions} card{demotions > 1 ? 's' : ''} need more practice</span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <Button onClick={onClose} className="w-full" size="lg">
          Back to Dashboard
        </Button>
      </div>
    </motion.div>
  )
}
