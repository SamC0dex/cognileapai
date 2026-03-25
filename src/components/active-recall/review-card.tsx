'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { ReviewCard as ReviewCardType } from '@/types/active-recall'
import { RecallLayer } from '@/types/active-recall'
import { RecallLayerBadge } from './recall-layer-badge'

interface ReviewCardProps {
  card: ReviewCardType
  showAnswer: boolean
  onFlip: () => void
  className?: string
}

export function ReviewCard({ card, showAnswer, onFlip, className }: ReviewCardProps) {
  const isQuizMode = card.recall_layer >= RecallLayer.RETRIEVE && card.options?.length

  // Keyboard: Space to flip
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !showAnswer) {
        e.preventDefault()
        onFlip()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onFlip, showAnswer])

  return (
    <div
      className={cn(
        'relative w-full max-w-2xl mx-auto cursor-pointer perspective-1000',
        className
      )}
      onClick={!showAnswer ? onFlip : undefined}
    >
      <motion.div
        className="relative w-full min-h-[300px]"
        initial={false}
        animate={{ rotateY: showAnswer ? 180 : 0 }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Front — Question */}
        <div
          className={cn(
            'absolute inset-0 rounded-xl border bg-card p-8 flex flex-col',
            'backface-hidden shadow-lg',
          )}
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="flex items-center justify-between mb-4">
            <RecallLayerBadge layer={card.recall_layer} />
            {card.topic && (
              <span className="text-xs text-muted-foreground">{card.topic}</span>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center">
            <p className="text-xl font-medium text-center leading-relaxed">
              {card.question}
            </p>
          </div>

          {isQuizMode && card.options && !showAnswer && (
            <div className="mt-4 space-y-2">
              {card.options.map((option, idx) => (
                <div
                  key={idx}
                  className="px-4 py-2 rounded-lg border bg-muted/30 text-sm"
                >
                  <span className="font-medium mr-2">
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  {option}
                </div>
              ))}
            </div>
          )}

          <p className="text-sm text-muted-foreground text-center mt-4">
            {showAnswer ? '' : 'Tap or press Space to reveal answer'}
          </p>
        </div>

        {/* Back — Answer */}
        <div
          className={cn(
            'absolute inset-0 rounded-xl border bg-card p-8 flex flex-col',
            'backface-hidden shadow-lg',
          )}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <RecallLayerBadge layer={card.recall_layer} />
            <span className="text-xs text-muted-foreground">Answer</span>
          </div>

          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              {isQuizMode && card.correct_answer !== null && card.options && (
                <div className="mb-4 px-4 py-2 rounded-lg bg-green-500/10 border border-green-200 dark:border-green-800">
                  <span className="font-semibold text-green-700 dark:text-green-400">
                    {String.fromCharCode(65 + card.correct_answer)}. {card.options[card.correct_answer]}
                  </span>
                </div>
              )}
              <p className="text-lg leading-relaxed text-foreground/90">
                {card.answer}
              </p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground text-center mt-4">
            Rate how well you remembered
          </p>
        </div>
      </motion.div>
    </div>
  )
}
