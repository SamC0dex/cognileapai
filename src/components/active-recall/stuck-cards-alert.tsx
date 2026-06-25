'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RotateCcw, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { useRouter } from 'next/navigation'
import type { StuckCardInfo } from '@/types/active-recall'
import { RECALL_LAYER_LABELS } from '@/types/active-recall'

interface StuckCardsAlertProps {
  cards: StuckCardInfo[]
  className?: string
}

export function StuckCardsAlert({ cards, className }: StuckCardsAlertProps) {
  const router = useRouter()

  if (cards.length === 0) return null

  const handleReviewCard = (cardId: string) => {
    router.push(`/active-recall/review?cardId=${cardId}`)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-xl border border-amber-500/30 bg-amber-500/5 p-5',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center"
        >
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </motion.div>
        <div>
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            {cards.length} Stuck Card{cards.length !== 1 ? 's' : ''} Detected
          </h3>
          <p className="text-[11px] text-amber-600/70 dark:text-amber-500/70">
            These cards need a different approach — the agent has suggestions
          </p>
        </div>
      </div>

      {/* Card list */}
      <div className="space-y-3">
        {cards.map((card, idx) => {
          const layerLabel = RECALL_LAYER_LABELS[card.layer as keyof typeof RECALL_LAYER_LABELS] || 'Unknown'

          return (
            <motion.div
              key={card.cardId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + idx * 0.08 }}
              className="rounded-lg border border-amber-500/20 bg-card p-3.5"
            >
              {/* Question */}
              <p className="text-sm font-medium line-clamp-2 mb-2">{card.question}</p>

              {/* Meta pills */}
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {card.topic}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {layerLabel}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {card.reviewCount} reviews
                </span>
              </div>

              {/* AI Suggestion */}
              <div className="flex gap-2 p-2.5 rounded-md bg-amber-500/5 border border-amber-500/10">
                <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                  {card.suggestion}
                </p>
              </div>

              {/* Review button */}
              <div className="mt-2.5 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReviewCard(card.cardId)}
                  className="text-xs gap-1.5 h-7 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                >
                  <RotateCcw className="h-3 w-3" />
                  Review Now
                </Button>
              </div>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}
