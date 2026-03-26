'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion'
import {
  X,
  Undo2,
  Clock,
  Trophy,
  Target,
  Flame,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  Keyboard,
  Lightbulb,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { useReviewStore } from '@/lib/active-recall-review-store'
import { useActiveRecallStore } from '@/lib/active-recall-store'
import { previewIntervals } from '@/lib/sm2'
import { RecallLayerBadge } from '@/components/active-recall/recall-layer-badge'
import { RecallLayer } from '@/types/active-recall'
import type { SM2Rating, ReviewCard as ReviewCardType } from '@/types/active-recall'

export default function ReviewPage() {
  const {
    isActive,
    isComplete,
    cards,
    currentCardIndex,
    showAnswer,
    ratings,
    feedback,
    isRating,
    isLoadingFeedback,
    startedAt,
    cardRevealedAt,
    initSession,
    flipCard,
    rateCard,
    undoLastRating,
    endSession,
    fetchFeedback,
    reset,
    canUndo,
  } = useReviewStore()

  const {
    dueCards,
    fetchDueCards,
    fetchStats,
    startSession: createServerSession,
    stats,
  } = useActiveRecallStore()

  const [cardTimer, setCardTimer] = useState(0)
  const [showShortcuts, setShowShortcuts] = useState(false)

  // Start session on mount if not active
  useEffect(() => {
    if (!isActive) {
      initReviewSession()
    }
    return () => {
      // Cleanup on unmount
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const initReviewSession = async () => {
    await fetchDueCards()
    const cards = useActiveRecallStore.getState().dueCards
    if (!cards.length) return

    // Create server session
    const response = await fetch('/api/active-recall/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    })

    if (response.ok) {
      const { session } = await response.json()
      initSession(session.id, cards)
    }
  }

  // Per-card timer
  useEffect(() => {
    if (!isActive || isComplete) return
    const interval = setInterval(() => {
      const store = useReviewStore.getState()
      if (store.cardRevealedAt) {
        setCardTimer(Date.now() - store.cardRevealedAt.getTime())
      } else if (store.startedAt) {
        setCardTimer(0)
      }
    }, 100)
    return () => clearInterval(interval)
  }, [isActive, isComplete, currentCardIndex])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return

      // Space to flip
      if (e.code === 'Space' && !showAnswer && !isComplete) {
        e.preventDefault()
        flipCard()
        return
      }

      // 1-4 to rate
      if (showAnswer && !isRating && !isComplete) {
        if (e.key === '1') { rateCard(0); return }
        if (e.key === '2') { rateCard(2); return }
        if (e.key === '3') { rateCard(3); return }
        if (e.key === '4') { rateCard(5); return }
      }

      // Ctrl+Z to undo
      if (e.ctrlKey && e.key === 'z' && canUndo()) {
        e.preventDefault()
        undoLastRating()
        return
      }

      // Escape to close
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, showAnswer, isRating, isComplete]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = async () => {
    if (isActive && ratings.length > 0) {
      await endSession()
    }
    reset()
    await fetchDueCards()
    await fetchStats()
    window.location.href = '/active-recall'
  }

  const handleSessionEnd = async () => {
    await endSession()
    await fetchFeedback()
  }

  // No cards available
  if (!isActive && !isComplete) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <Trophy className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <h2 className="text-lg font-semibold">All caught up!</h2>
          <p className="text-sm text-muted-foreground">No cards due for review right now.</p>
          <Button onClick={() => window.location.href = '/active-recall'} variant="outline">
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  const currentCard = cards[currentCardIndex]
  const progress = cards.length > 0 ? (ratings.length / cards.length) * 100 : 0

  // Session complete — show summary
  if (isComplete) {
    return (
      <SessionSummaryV2
        ratings={ratings}
        totalCards={cards.length}
        startedAt={startedAt}
        feedback={feedback}
        isLoadingFeedback={isLoadingFeedback}
        streak={stats?.reviewStreak}
        onClose={handleClose}
        onEndSession={handleSessionEnd}
      />
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] relative">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">
            {ratings.length}/{cards.length}
          </span>
          {canUndo() && (
            <button
              onClick={undoLastRating}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Undo last rating (Ctrl+Z)"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Per-card timer */}
          {cardRevealedAt && (
            <span className="text-xs text-muted-foreground font-mono tabular-nums">
              {formatTimer(cardTimer)}
            </span>
          )}
          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground"
            title="Keyboard shortcuts"
          >
            <Keyboard className="h-4 w-4" />
          </button>
          <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted shrink-0">
        <motion.div
          className="h-full bg-primary"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Keyboard shortcuts overlay */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-14 right-4 z-10 rounded-xl border bg-card shadow-lg p-4 text-xs space-y-1.5"
          >
            <p className="font-semibold mb-2">Shortcuts</p>
            <p><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Space</kbd> Flip card</p>
            <p><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">1</kbd> Again</p>
            <p><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">2</kbd> Hard</p>
            <p><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">3</kbd> Good</p>
            <p><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">4</kbd> Easy</p>
            <p><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Ctrl+Z</kbd> Undo</p>
            <p><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> Exit</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 overflow-hidden">
        <AnimatePresence mode="wait">
          {currentCard && (
            <SwipeableCard
              key={`${currentCard.id}-${currentCardIndex}`}
              card={currentCard}
              showAnswer={showAnswer}
              onFlip={flipCard}
              onRate={rateCard}
              isRating={isRating}
            />
          )}
        </AnimatePresence>

        {/* Rating buttons */}
        <AnimatePresence>
          {showAnswer && currentCard && !isRating && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-2xl"
            >
              <RatingButtonsV2 card={currentCard} onRate={rateCard} disabled={isRating} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ============================================
// Swipeable Card
// ============================================

function SwipeableCard({
  card,
  showAnswer,
  onFlip,
  onRate,
  isRating,
}: {
  card: ReviewCardType
  showAnswer: boolean
  onFlip: () => void
  onRate: (r: SM2Rating) => Promise<void>
  isRating: boolean
}) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-15, 15])
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5])

  // Swipe indicators
  const leftIndicatorOpacity = useTransform(x, [-150, -50, 0], [1, 0.5, 0])
  const rightIndicatorOpacity = useTransform(x, [0, 50, 150], [0, 0.5, 1])

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (!showAnswer || isRating) return
    const threshold = 100
    const velocity = Math.abs(info.velocity.x)

    if (info.offset.x < -threshold || (info.velocity.x < -500 && velocity > 200)) {
      onRate(0) // Swipe left = Again
    } else if (info.offset.x > threshold || (info.velocity.x > 500 && velocity > 200)) {
      onRate(3) // Swipe right = Good
    }
  }

  const isQuizMode = card.recall_layer >= RecallLayer.RETRIEVE && card.options?.length
  const [explanation, setExplanation] = useState<string | null>(null)
  const [isExplaining, setIsExplaining] = useState(false)

  const handleExplain = async () => {
    if (isExplaining || explanation) return
    setIsExplaining(true)
    try {
      const res = await fetch('/api/active-recall/explain-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          question: card.question,
          answer: card.answer,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setExplanation(data.explanation)
      }
    } catch (e) {
      console.error('[Explain] Error:', e)
    }
    setIsExplaining(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, x: 100 }}
      transition={{ duration: 0.2 }}
      className="w-full max-w-2xl relative"
    >
      {/* Swipe indicators */}
      {showAnswer && (
        <>
          <motion.div
            style={{ opacity: leftIndicatorOpacity }}
            className="absolute -left-16 top-1/2 -translate-y-1/2 text-red-500 font-bold text-sm hidden md:block"
          >
            Again
          </motion.div>
          <motion.div
            style={{ opacity: rightIndicatorOpacity }}
            className="absolute -right-16 top-1/2 -translate-y-1/2 text-green-500 font-bold text-sm hidden md:block"
          >
            Good
          </motion.div>
        </>
      )}

      <motion.div
        style={{ x, rotate, opacity }}
        drag={showAnswer && !isRating ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        onDragEnd={handleDragEnd}
        className="touch-none"
      >
        <div
          className={cn(
            'rounded-2xl border bg-card shadow-lg overflow-hidden',
            !showAnswer && 'cursor-pointer'
          )}
          onClick={!showAnswer ? onFlip : undefined}
        >
          {/* Card content */}
          <div className="p-8 min-h-[320px] flex flex-col">
            {/* Top bar */}
            <div className="flex items-center justify-between mb-6">
              <RecallLayerBadge layer={card.recall_layer} />
              {card.topic && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                  {card.topic}
                </span>
              )}
            </div>

            {/* Question */}
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center w-full">
                <p className="text-xl font-medium leading-relaxed mb-4">
                  {card.question}
                </p>

                {/* Quiz options on question side */}
                {isQuizMode && card.options && !showAnswer && (
                  <div className="mt-4 space-y-2 text-left max-w-md mx-auto">
                    {card.options.map((option, idx) => (
                      <div
                        key={idx}
                        className="px-4 py-2.5 rounded-xl border bg-muted/30 text-sm hover:bg-muted/50 transition-colors"
                      >
                        <span className="font-semibold mr-2 text-muted-foreground">
                          {String.fromCharCode(65 + idx)}.
                        </span>
                        {option}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Answer (revealed) */}
            <AnimatePresence>
              {showAnswer && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.25 }}
                  className="border-t pt-6 mt-4"
                >
                  {isQuizMode && card.correct_answer !== null && card.options && (
                    <div className="mb-3 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-200 dark:border-green-800 inline-block">
                      <span className="font-semibold text-green-700 dark:text-green-400">
                        {String.fromCharCode(65 + card.correct_answer)}. {card.options[card.correct_answer]}
                      </span>
                    </div>
                  )}
                  <p className="text-base leading-relaxed text-foreground/80">
                    {card.answer}
                  </p>

                  {/* Explain button */}
                  <div className="mt-4">
                    {!explanation && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleExplain() }}
                        disabled={isExplaining}
                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                      >
                        {isExplaining ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Lightbulb className="h-3.5 w-3.5" />
                        )}
                        {isExplaining ? 'Explaining...' : 'Explain this'}
                      </button>
                    )}
                    {explanation && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-2 px-4 py-3 rounded-xl bg-primary/5 border border-primary/10 text-sm leading-relaxed text-foreground/70"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-1.5">
                          <Lightbulb className="h-3.5 w-3.5" />
                          AI Explanation
                        </div>
                        {explanation}
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Flip hint */}
            {!showAnswer && (
              <p className="text-xs text-muted-foreground text-center mt-4">
                Tap or press <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Space</kbd> to reveal
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ============================================
// Rating Buttons V2
// ============================================

function RatingButtonsV2({
  card,
  onRate,
  disabled,
}: {
  card: ReviewCardType
  onRate: (r: SM2Rating) => Promise<void>
  disabled: boolean
}) {
  const intervals = previewIntervals({
    repetitions: card.repetitions,
    easeFactor: card.ease_factor,
    intervalDays: card.interval_days,
    aiMultiplier: card.ai_interval_multiplier,
  })

  const buttons: { label: string; quality: SM2Rating; interval: string; key: string; color: string; hoverBg: string }[] = [
    { label: 'Again', quality: 0, interval: intervals.again, key: '1', color: 'text-red-500', hoverBg: 'hover:bg-red-500/10 active:bg-red-500/20' },
    { label: 'Hard', quality: 2, interval: intervals.hard, key: '2', color: 'text-orange-500', hoverBg: 'hover:bg-orange-500/10 active:bg-orange-500/20' },
    { label: 'Good', quality: 3, interval: intervals.good, key: '3', color: 'text-green-500', hoverBg: 'hover:bg-green-500/10 active:bg-green-500/20' },
    { label: 'Easy', quality: 5, interval: intervals.easy, key: '4', color: 'text-blue-500', hoverBg: 'hover:bg-blue-500/10 active:bg-blue-500/20' },
  ]

  return (
    <div className="flex gap-2">
      {buttons.map((btn) => (
        <button
          key={btn.label}
          onClick={() => onRate(btn.quality)}
          disabled={disabled}
          className={cn(
            'flex-1 flex flex-col items-center gap-1.5 py-4 px-3 rounded-xl border transition-all',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            btn.hoverBg
          )}
        >
          <span className={cn('text-sm font-semibold', btn.color)}>{btn.label}</span>
          <span className="text-[11px] text-muted-foreground">{btn.interval}</span>
          <kbd className="text-[10px] text-muted-foreground/50 bg-muted px-1.5 py-0.5 rounded">{btn.key}</kbd>
        </button>
      ))}
    </div>
  )
}

// ============================================
// Session Summary V2
// ============================================

function SessionSummaryV2({
  ratings,
  totalCards,
  startedAt,
  feedback,
  isLoadingFeedback,
  streak,
  onClose,
  onEndSession,
}: {
  ratings: import('@/types/active-recall').ReviewSessionResult[]
  totalCards: number
  startedAt: Date | null
  feedback: import('@/types/active-recall').SessionFeedback | null
  isLoadingFeedback: boolean
  streak?: number
  onClose: () => void
  onEndSession: () => void
}) {
  useEffect(() => {
    onEndSession()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const correctCount = ratings.filter((r) => r.rating >= 3).length
  const accuracy = totalCards > 0 ? Math.round((correctCount / totalCards) * 100) : 0
  const totalTimeMs = startedAt ? Date.now() - startedAt.getTime() : 0
  const totalTimeSec = Math.round(totalTimeMs / 1000)
  const minutes = Math.floor(totalTimeSec / 60)
  const seconds = totalTimeSec % 60
  const promotions = ratings.filter((r) => r.new_layer > r.previous_layer).length
  const demotions = ratings.filter((r) => r.new_layer < r.previous_layer).length

  return (
    <div className="flex items-center justify-center p-6 min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg"
      >
        <div className="rounded-2xl border bg-card p-8 shadow-lg">
          {/* Header */}
          <div className="text-center mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            >
              <Trophy className="h-12 w-12 mx-auto mb-3 text-yellow-500" />
            </motion.div>
            <h2 className="text-2xl font-bold">Session Complete!</h2>
            {feedback && (
              <p className="text-sm text-muted-foreground mt-2">{feedback.summary}</p>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <StatBox icon={<Target className="h-5 w-5 text-green-500" />} value={`${accuracy}%`} label="Accuracy" />
            <StatBox
              icon={<Clock className="h-5 w-5 text-blue-500" />}
              value={minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`}
              label="Time"
            />
            <StatBox value={`${correctCount}/${totalCards}`} label="Correct" />
            {streak !== undefined && streak > 0 && (
              <StatBox icon={<Flame className="h-5 w-5 text-orange-500" />} value={`${streak}`} label="Streak" />
            )}
          </div>

          {/* Layer changes */}
          {(promotions > 0 || demotions > 0) && (
            <div className="mb-6 space-y-1.5">
              {promotions > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <ArrowUp className="h-4 w-4" />
                  {promotions} card{promotions > 1 ? 's' : ''} promoted
                </div>
              )}
              {demotions > 0 && (
                <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400">
                  <ArrowDown className="h-4 w-4" />
                  {demotions} card{demotions > 1 ? 's' : ''} need more practice
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button onClick={onClose} className="flex-1" size="lg">
              Back to Home
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="gap-1.5"
              onClick={() => window.location.reload()}
            >
              Review More
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function StatBox({ icon, value, label }: { icon?: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-4 text-center">
      {icon && <div className="mb-1 flex justify-center">{icon}</div>}
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function formatTimer(ms: number): string {
  const secs = Math.floor(ms / 1000)
  const mins = Math.floor(secs / 60)
  const remaining = secs % 60
  if (mins > 0) return `${mins}:${remaining.toString().padStart(2, '0')}`
  return `${remaining}s`
}
