'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Play, ChevronDown, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'

interface AIGreetingCardProps {
  nudgeMessage: string | null
  totalDue: number
  isLoading: boolean
  onStartReview: () => void
  className?: string
}

export function AIGreetingCard({
  nudgeMessage,
  totalDue,
  isLoading,
  onStartReview,
  className,
}: AIGreetingCardProps) {
  const greeting = getTimeGreeting()
  const defaultMessage = totalDue > 0
    ? `You have ${totalDue} card${totalDue !== 1 ? 's' : ''} ready for review. Let's keep your memory sharp.`
    : 'All caught up! No cards due right now. Great job staying on top of your reviews.'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-card p-6',
        className
      )}
    >
      {/* Subtle gradient accent */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">{greeting}</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {nudgeMessage || defaultMessage}
          </p>
        </div>

        {totalDue > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={onStartReview}
              disabled={isLoading}
              variant="purple"
              size="lg"
              className="gap-2 min-w-[160px]"
            >
              <Play className="h-4 w-4" />
              Start Review
              <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-full text-xs font-medium">
                {totalDue}
              </span>
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function getTimeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
