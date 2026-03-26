'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { CheckCircle2 } from 'lucide-react'

interface DailyGoalRingProps {
  completed: number
  target: number
  className?: string
}

export function DailyGoalRing({ completed, target, className }: DailyGoalRingProps) {
  const progress = target > 0 ? Math.min(completed / target, 1) : 0
  const isComplete = completed >= target
  const circumference = 2 * Math.PI * 42 // radius = 42
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="relative h-20 w-20 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-muted/30"
          />
          {/* Progress circle */}
          <motion.circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className={cn(
              isComplete ? 'text-green-500' : 'text-primary'
            )}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          {isComplete ? (
            <CheckCircle2 className="h-6 w-6 text-green-500" />
          ) : (
            <span className="text-sm font-bold">{Math.round(progress * 100)}%</span>
          )}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium">
          {isComplete ? 'Goal reached!' : 'Daily Goal'}
        </p>
        <p className="text-xs text-muted-foreground">
          {completed} of {target} cards reviewed
        </p>
      </div>
    </div>
  )
}
