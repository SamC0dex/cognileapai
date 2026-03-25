'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Brain, Flame, ChevronRight, Zap } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

interface DueCardNudgeProps {
  totalDue: number
  streak: number
  nudgeMessage: string | null
  onStartReview: () => void
  className?: string
}

export function DueCardNudge({
  totalDue,
  streak,
  nudgeMessage,
  onStartReview,
  className,
}: DueCardNudgeProps) {
  const getDefaultMessage = () => {
    if (totalDue === 0) return "You're all caught up! Come back tomorrow."
    if (totalDue <= 5) return `Just ${totalDue} cards to review. Quick session!`
    if (totalDue <= 15) return `${totalDue} cards are waiting. Let's knock them out.`
    return `${totalDue} cards need your attention. Start with the most urgent ones.`
  }

  const message = nudgeMessage || getDefaultMessage()

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-xl border bg-gradient-to-br from-primary/5 via-card to-primary/5 p-6',
        className
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Brain className="w-6 h-6 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-lg font-semibold">ActiveRecall</h3>
            {streak > 0 && (
              <div className="flex items-center gap-1 text-orange-500">
                <Flame className="w-4 h-4" />
                <span className="text-sm font-medium">{streak} day{streak !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>

          <p className="text-sm text-muted-foreground mb-4">{message}</p>

          {totalDue > 0 && (
            <div className="flex items-center gap-3">
              <Button onClick={onStartReview} className="gap-2">
                <Zap className="w-4 h-4" />
                Start Review
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary-foreground/20 text-xs">
                  {totalDue}
                </span>
              </Button>
              <span className="text-xs text-muted-foreground">
                ~{Math.max(1, Math.round(totalDue * 0.5))} min
              </span>
            </div>
          )}

          {totalDue === 0 && (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <span className="text-sm font-medium">All caught up!</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
