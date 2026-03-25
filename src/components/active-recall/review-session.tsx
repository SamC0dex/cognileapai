'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui'
import { X, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActiveRecallStore } from '@/lib/active-recall-store'
import { ReviewCard } from './review-card'
import { RatingButtons } from './rating-buttons'
import { SessionSummary } from './session-summary'
import type { SM2Rating } from '@/types/active-recall'

interface ReviewSessionProps {
  onClose: () => void
  className?: string
}

export function ReviewSession({ onClose, className }: ReviewSessionProps) {
  const {
    currentSession,
    flipCard,
    rateCard,
    endSession,
    stats,
  } = useActiveRecallStore()

  const [isRating, setIsRating] = React.useState(false)
  const [showSummary, setShowSummary] = React.useState(false)

  if (!currentSession) return null

  const { cards, currentCardIndex, showAnswer, ratings } = currentSession
  const currentCard = cards[currentCardIndex]
  const progress = ((ratings.length) / cards.length) * 100
  const isLastCard = currentCardIndex >= cards.length - 1
  const isSessionComplete = ratings.length >= cards.length

  const handleRate = async (rating: SM2Rating) => {
    if (isRating) return
    setIsRating(true)

    await rateCard(rating)

    setIsRating(false)

    // Check if session is complete after rating
    if (isLastCard) {
      // Small delay to let the user see the result
      setTimeout(async () => {
        await endSession()
        setShowSummary(true)
      }, 300)
    }
  }

  const handleClose = () => {
    // Reset session state in store
    useActiveRecallStore.setState({ currentSession: null })
    onClose()
  }

  // Session summary view
  if (showSummary) {
    return (
      <div className={cn('fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4', className)}>
        <SessionSummary
          ratings={ratings}
          totalCards={cards.length}
          startedAt={currentSession.startedAt}
          onClose={handleClose}
          streak={stats?.reviewStreak}
        />
      </div>
    )
  }

  return (
    <div className={cn('fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Review Session</h2>
          <span className="text-sm text-muted-foreground">
            {ratings.length} / {cards.length} cards
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Card Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <AnimatePresence mode="wait">
          {currentCard && (
            <motion.div
              key={currentCard.id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-2xl"
            >
              <ReviewCard
                card={currentCard}
                showAnswer={showAnswer}
                onFlip={flipCard}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rating buttons — shown after flip */}
        <AnimatePresence>
          {showAnswer && currentCard && !isSessionComplete && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-2xl"
            >
              <RatingButtons
                card={currentCard}
                onRate={handleRate}
                disabled={isRating}
              />
              <p className="text-xs text-muted-foreground text-center mt-2">
                Keyboard: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
