'use client'

import React from 'react'
import { Button } from '@/components/ui'
import { previewIntervals } from '@/lib/sm2'
import type { ReviewCard, SM2Rating } from '@/types/active-recall'
import { cn } from '@/lib/utils'

interface RatingButtonsProps {
  card: ReviewCard
  onRate: (rating: SM2Rating) => void
  disabled?: boolean
  className?: string
}

export function RatingButtons({ card, onRate, disabled, className }: RatingButtonsProps) {
  const intervals = previewIntervals({
    repetitions: card.repetitions,
    easeFactor: card.ease_factor,
    intervalDays: card.interval_days,
    aiMultiplier: card.ai_interval_multiplier,
  })

  const buttons: { label: string; quality: SM2Rating; interval: string; color: string; hoverColor: string }[] = [
    {
      label: 'Again',
      quality: 0,
      interval: intervals.again,
      color: 'bg-red-500/10 text-red-600 border-red-200 dark:border-red-800 dark:text-red-400',
      hoverColor: 'hover:bg-red-500/20',
    },
    {
      label: 'Hard',
      quality: 2,
      interval: intervals.hard,
      color: 'bg-orange-500/10 text-orange-600 border-orange-200 dark:border-orange-800 dark:text-orange-400',
      hoverColor: 'hover:bg-orange-500/20',
    },
    {
      label: 'Good',
      quality: 3,
      interval: intervals.good,
      color: 'bg-green-500/10 text-green-600 border-green-200 dark:border-green-800 dark:text-green-400',
      hoverColor: 'hover:bg-green-500/20',
    },
    {
      label: 'Easy',
      quality: 5,
      interval: intervals.easy,
      color: 'bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800 dark:text-blue-400',
      hoverColor: 'hover:bg-blue-500/20',
    },
  ]

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return
      if (e.key === '1') onRate(0)
      if (e.key === '2') onRate(2)
      if (e.key === '3') onRate(3)
      if (e.key === '4') onRate(5)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onRate, disabled])

  return (
    <div className={cn('flex gap-2 w-full', className)}>
      {buttons.map((btn) => (
        <button
          key={btn.label}
          onClick={() => onRate(btn.quality)}
          disabled={disabled}
          className={cn(
            'flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-lg border transition-all',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            btn.color,
            btn.hoverColor
          )}
        >
          <span className="text-sm font-semibold">{btn.label}</span>
          <span className="text-xs opacity-70">{btn.interval}</span>
        </button>
      ))}
    </div>
  )
}
