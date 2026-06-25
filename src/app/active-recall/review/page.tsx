'use client'

import React, { useEffect, useState, useCallback, useMemo, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
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
  TreePine,
  FileText,
  FlaskConical,
  CheckCircle2,
  SkipForward,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { useReviewStore } from '@/lib/active-recall-review-store'
import { useActiveRecallStore } from '@/lib/active-recall-store'
import { previewIntervals } from '@/lib/sm2'
import { RecallLayerBadge } from '@/components/active-recall/recall-layer-badge'
import { MindMapReviewCard } from '@/components/active-recall/v2/mindmap-review-card'
import { LazyMindMapViewer } from '@/components/study-tools/lazy-mindmap-viewer'
import type { SM2Rating, ReviewCard as ReviewCardType } from '@/types/active-recall'
import type { MindMapSet } from '@/types/mindmap'
import { SessionAnalysisCard } from '@/components/active-recall/session-analysis-card'

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
      <ReviewPageInner />
    </Suspense>
  )
}

function ReviewPageInner() {
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
    skipCard,
    undoLastRating,
    endSession,
    analyzeSession,
    fetchFeedback,
    reset,
    canUndo,
    analysisStatus,
    analysisInsights,
  } = useReviewStore()

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [mindMapData, setMindMapData] = useState<{ setId: string; data: MindMapSet } | null>(null)
  const [mindMapLoading, setMindMapLoading] = useState(false)

  const {
    dueCards,
    fetchDueCards,
    fetchStats,
    startSession: createServerSession,
    stats,
  } = useActiveRecallStore()

  const searchParams = useSearchParams()
  const planId = searchParams.get('plan_id')
  const sourceTypeFilter = searchParams.get('source_type')
  const includeAll = searchParams.get('include_all') === 'true'

  const [cardTimer, setCardTimer] = useState(0)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [planTitle, setPlanTitle] = useState<string | null>(null)

  const [initError, setInitError] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [showSummary, setShowSummary] = useState(false)
  const initStartedRef = useRef(false)

  useEffect(() => {
    const storeState = useReviewStore.getState()

    // If the store already has an active session with cards, RESUME it.
    // This handles remounts from HMR, React strict mode, and Suspense re-triggers.
    // Without this, each remount calls reset() which clears the cards and re-fetches,
    // causing cards to "disappear" one by one as each reviewed card becomes non-due.
    if (storeState.isActive && storeState.cards.length > 0) {
      setIsInitializing(false)
      return
    }

    if (storeState.isComplete) {
      setIsInitializing(false)
      return
    }

    // Guard: prevent double-init from strict mode or rapid remounts.
    // Refs survive strict mode's unmount/remount cycle.
    if (initStartedRef.current) return
    initStartedRef.current = true

    // No active session — start fresh (initSession internally resets via ...initialState)
    setIsInitializing(true)
    initReviewSession()
      .catch((err) => {
        console.error('[ReviewPage] Init error:', err)
        setInitError(true)
      })
      .finally(() => setIsInitializing(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const initReviewSession = async () => {
    // Build query params for due cards
    const params = new URLSearchParams()
    if (planId) {
      params.set('plan_id', planId)
      params.set('progressive', 'true')

      // Fetch plan title
      try {
        const planRes = await fetch(`/api/active-recall/agent/today?plan_id=${planId}`)
        if (planRes.ok) {
          const planData = await planRes.json()
          setPlanTitle(planData.plan?.title || null)
        }
      } catch {}
    }
    if (sourceTypeFilter) {
      params.set('source_type', sourceTypeFilter)
    }
    if (includeAll) {
      params.set('include_all', 'true')
    }

    // Fetch due cards (with plan filter if applicable)
    const dueRes = await fetch(`/api/active-recall/due-cards?${params}`)
    if (!dueRes.ok) {
      console.error('[ReviewPage] Due cards fetch failed:', dueRes.status)
      return
    }
    const dueData = await dueRes.json()
    const fetchedCards = dueData.cards || []
    console.log('[ReviewPage] Fetched', fetchedCards.length, 'due cards for plan', planId)
    if (!fetchedCards.length) return

    // Create server session — always init regardless of server response
    let sessionId = `local-${Date.now()}`
    try {
      const response = await fetch('/api/active-recall/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', planId }),
      })
      if (response.ok) {
        const { session } = await response.json()
        sessionId = session.id
      }
    } catch (err) {
      console.error('[ReviewPage] Session start error:', err)
    }

    initSession(sessionId, fetchedCards)
    console.log('[ReviewPage] Session initialized with', fetchedCards.length, 'cards, sessionId:', sessionId)
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

      // S to skip (move card to end)
      if (e.key === 's' || e.key === 'S') {
        if (!showAnswer && !isComplete) {
          skipCard()
          return
        }
      }

      // F to toggle fullscreen
      if (e.key === 'f' || e.key === 'F') {
        if (!e.ctrlKey && !e.metaKey) {
          setIsFullscreen((prev) => !prev)
          return
        }
      }

      // Ctrl+Z to undo
      if (e.ctrlKey && e.key === 'z' && canUndo()) {
        e.preventDefault()
        undoLastRating()
        return
      }

      // Escape to close (or exit fullscreen first)
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false)
          return
        }
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, showAnswer, isRating, isComplete]) // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger session analysis when session completes
  const sessionEndTriggeredRef = useRef(false)
  useEffect(() => {
    if (isComplete && !sessionEndTriggeredRef.current) {
      sessionEndTriggeredRef.current = true
      handleSessionEnd()
    }
  }, [isComplete]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    // Navigate immediately — don't let React re-render with reset state
    window.location.href = '/active-recall'
    // Fire-and-forget: end session + reset store in background
    if (isActive && ratings.length > 0) {
      endSession().finally(() => reset())
    } else {
      reset()
    }
  }

  const handleSessionEnd = async () => {
    await endSession()
    // Run analysis first (UI shows animated analysis card), then fetch coaching feedback
    await analyzeSession()
    await fetchFeedback()

    // Mark matching plan activities as complete
    if (planId && cards.length > 0) {
      const completedTypes = [...new Set(cards.map(c => {
        if (c.source_type === 'flashcard') return ['flashcards', 'flashcard_review']
        if (c.source_type === 'quiz') return ['quiz', 'quiz_session']
        if (c.source_type === 'mindmap') return ['mindmap', 'mindmap_review']
        return null
      }).flat().filter(Boolean))]
      if (completedTypes.length > 0) {
        fetch(`/api/active-recall/agent/plans/${planId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete_session', completedTypes }),
        }).catch(() => {})
      }
    }
  }

  // Count cards by source type for session indicator — must be before any early returns
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    cards.forEach((c) => {
      counts[c.source_type] = (counts[c.source_type] || 0) + 1
    })
    return counts
  }, [cards])

  const currentCard = cards[currentCardIndex]
  const isMindMapCard = currentCard?.source_type === 'mindmap'
  const progress = cards.length > 0 ? (ratings.length / cards.length) * 100 : 0
  const hasMultipleTypes = Object.keys(typeCounts).length > 1

  // Full mind map data cache (loaded once per source_set_id)
  const fullMindMapRef = useRef<{ setId: string; data: MindMapSet } | null>(null)

  // Fetch mind map data when current card is a mindmap
  useEffect(() => {
    if (!isMindMapCard || !currentCard?.source_set_id) {
      setMindMapData(null)
      return
    }

    const sourceSetId = currentCard.source_set_id!
    const sourceId = currentCard.source_id

    // If we already have the full data for this set, just extract subtree
    if (fullMindMapRef.current?.setId === sourceSetId) {
      const subTree = extractSubTree(fullMindMapRef.current.data, sourceId)
      setMindMapData({ setId: sourceSetId, data: subTree })
      return
    }

    setMindMapLoading(true)
    fetch(`/api/active-recall/mindmap-data?source_set_id=${sourceSetId}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.mindMapSet) {
          fullMindMapRef.current = { setId: sourceSetId, data: data.mindMapSet }
          const subTree = extractSubTree(data.mindMapSet, sourceId)
          setMindMapData({ setId: sourceSetId, data: subTree })
        } else {
          setMindMapData(null)
        }
      })
      .catch(() => setMindMapData(null))
      .finally(() => setMindMapLoading(false))
  }, [isMindMapCard, currentCard?.source_set_id, currentCard?.source_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Still loading
  if (isInitializing) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // No cards available or error
  if (!isActive && !isComplete) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <Trophy className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <h2 className="text-lg font-semibold">
            {initError ? 'Something went wrong' : 'All caught up!'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {initError
              ? 'Failed to load review cards. Please try again.'
              : planId
                ? 'No cards are due for this study plan right now. Cards will become due after their scheduled review time.'
                : 'No cards due for review right now.'}
          </p>
          <div className="flex gap-2 justify-center">
            {initError && (
              <Button onClick={() => { setInitError(false); initReviewSession().catch(() => setInitError(true)) }} variant="default">
                Try Again
              </Button>
            )}
            <Button onClick={() => window.location.href = '/active-recall'} variant="outline">
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Session complete — show analysis card first, then summary
  if (isComplete) {
    // Show analysis card while idle (waiting for effect), analyzing, or just completed (before user clicks continue)
    if (!showSummary && (analysisStatus === 'idle' || analysisStatus === 'analyzing' || analysisStatus === 'complete')) {
      return (
        <SessionAnalysisCard
          status={analysisStatus === 'idle' ? 'analyzing' : analysisStatus}
          insights={analysisInsights}
          cardsReviewed={ratings.length}
          onContinue={() => setShowSummary(true)}
        />
      )
    }

    // Show error state briefly, then auto-continue to summary
    if (analysisStatus === 'error' && !showSummary) {
      return (
        <SessionAnalysisCard
          status="error"
          insights={null}
          cardsReviewed={ratings.length}
          onContinue={() => setShowSummary(true)}
        />
      )
    }

    return (
      <SessionSummaryV2
        ratings={ratings}
        totalCards={cards.length}
        startedAt={startedAt}
        feedback={feedback}
        isLoadingFeedback={isLoadingFeedback}
        streak={stats?.reviewStreak}
        onClose={handleClose}
        analysisInsights={analysisInsights}
      />
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] relative">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <div className="flex items-center gap-4">
          {planTitle && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
              {planTitle}
            </span>
          )}
          <span className="text-sm font-medium">
            {ratings.length}/{cards.length}
          </span>
          {hasMultipleTypes && (
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {typeCounts.flashcard && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <FileText className="h-2.5 w-2.5" />{typeCounts.flashcard}
                </span>
              )}
              {typeCounts.quiz && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <FlaskConical className="h-2.5 w-2.5" />{typeCounts.quiz}
                </span>
              )}
              {typeCounts.mindmap && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <TreePine className="h-2.5 w-2.5" />{typeCounts.mindmap}
                </span>
              )}
            </div>
          )}
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
          {/* Skip button */}
          {!showAnswer && !isComplete && (
            <button
              onClick={skipCard}
              className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title="Skip card (S)"
            >
              <SkipForward className="h-3.5 w-3.5" />
              Skip
            </button>
          )}
          {/* Fullscreen toggle */}
          <button
            onClick={() => { setIsFullscreen(!isFullscreen); setZoomLevel(1) }}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground"
            title="Fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
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
            <p><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">S</kbd> Skip card</p>
            <p><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">F</kbd> Fullscreen</p>
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
      <div className={cn(
        'flex-1 flex flex-col items-center justify-center gap-4 overflow-y-auto',
        isFullscreen
          ? 'fixed inset-0 z-50 bg-background p-6 pt-16'
          : 'p-4'
      )}>
        {/* Fullscreen controls overlay */}
        {isFullscreen && (
          <div className="fixed top-3 right-3 z-[51] flex items-center gap-1">
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.1))}
              className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground"
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground font-mono w-10 text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(2, z + 0.1))}
              className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground"
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setIsFullscreen(false); setZoomLevel(1) }}
              className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground ml-2"
              title="Exit fullscreen (Esc)"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          </div>
        )}

        {currentCard ? (
          isMindMapCard && mindMapData?.data ? (
            /* Mind Map Review — show focused subtree for this card */
            <MindMapReviewView
              mindMapSet={mindMapData.data}
              card={currentCard}
              isRating={isRating}
              onRate={rateCard}
            />
          ) : isMindMapCard && mindMapLoading ? (
            <div className="text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Loading mind map...
            </div>
          ) : (
            <div style={isFullscreen ? { transform: `scale(${zoomLevel})`, transformOrigin: 'center top' } : undefined}>
              <SwipeableCard
                key={`${currentCard.id}-${currentCardIndex}`}
                card={currentCard}
                showAnswer={showAnswer}
                onFlip={flipCard}
                onRate={rateCard}
                isRating={isRating}
                isFullscreen={isFullscreen}
              />
            </div>
          )
        ) : (
          <div className="text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Loading next card...
          </div>
        )}

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
  isFullscreen,
}: {
  card: ReviewCardType
  showAnswer: boolean
  onFlip: () => void
  onRate: (r: SM2Rating) => Promise<void>
  isRating: boolean
  isFullscreen?: boolean
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

  const isQuizCard = card.source_type === 'quiz' && card.options?.length
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
      className={cn('w-full relative', isFullscreen ? 'max-w-4xl' : 'max-w-2xl')}
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
            !showAnswer && 'cursor-pointer',
            card.source_type === 'mindmap' && 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-950/10',
            card.source_type === 'quiz' && 'border-violet-200 dark:border-violet-800/50'
          )}
          onClick={!showAnswer && !isQuizCard ? onFlip : undefined}
        >
          {/* Top bar — shared across all card types */}
          <div className="flex items-center justify-between px-8 pt-6">
            <div className="flex items-center gap-2">
              <RecallLayerBadge layer={card.recall_layer} />
              <SourceTypeBadge sourceType={card.source_type} />
            </div>
            {card.source_type !== 'mindmap' && card.topic && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                {card.topic}
              </span>
            )}
          </div>

          {/* Card content — dispatched by source_type */}
          {card.source_type === 'mindmap' ? (
            <MindMapReviewCard
              question={card.question}
              answer={card.answer}
              topic={card.topic}
              showAnswer={showAnswer}
            />
          ) : isQuizCard ? (
            <QuizCardContent
              card={card}
              showAnswer={showAnswer}
              onSelectOption={onFlip}
              explanation={explanation}
              isExplaining={isExplaining}
              onExplain={handleExplain}
            />
          ) : (
            <FlashcardContent
              card={card}
              showAnswer={showAnswer}
              explanation={explanation}
              isExplaining={isExplaining}
              onExplain={handleExplain}
            />
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ============================================
// Flashcard Content
// ============================================

function FlashcardContent({
  card,
  showAnswer,
  explanation,
  isExplaining,
  onExplain,
}: {
  card: ReviewCardType
  showAnswer: boolean
  explanation: string | null
  isExplaining: boolean
  onExplain: () => void
}) {
  return (
    <div className="p-8 min-h-[320px] flex flex-col">
      {/* Question */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center w-full">
          <p className="text-xl font-medium leading-relaxed">
            {card.question}
          </p>
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
            <p className="text-base leading-relaxed text-foreground/80">
              {card.answer}
            </p>
            <ExplainSection explanation={explanation} isExplaining={isExplaining} onExplain={onExplain} />
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
  )
}

// ============================================
// Quiz Card Content
// ============================================

function QuizCardContent({
  card,
  showAnswer,
  onSelectOption,
  explanation,
  isExplaining,
  onExplain,
}: {
  card: ReviewCardType
  showAnswer: boolean
  onSelectOption: () => void
  explanation: string | null
  isExplaining: boolean
  onExplain: () => void
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const correctIndex = card.correct_answer ?? -1
  const options = card.options || []

  const handleOptionClick = (idx: number) => {
    if (showAnswer) return
    setSelectedIndex(idx)
    onSelectOption()
  }

  return (
    <div className="px-6 py-5 flex flex-col">
      {/* Question */}
      <p className="text-base font-medium leading-snug text-center mb-4">
        {card.question}
      </p>

      {/* Options */}
      <div className="space-y-2 max-w-lg mx-auto w-full">
        {options.map((option, idx) => {
          const isSelected = selectedIndex === idx
          const isCorrect = idx === correctIndex
          const revealed = showAnswer

          let optionStyle = 'border bg-muted/20 hover:bg-muted/40 cursor-pointer'
          if (revealed) {
            if (isCorrect) {
              optionStyle = 'border-green-400 dark:border-green-600 bg-green-500/10'
            } else if (isSelected && !isCorrect) {
              optionStyle = 'border-red-400 dark:border-red-600 bg-red-500/10'
            } else {
              optionStyle = 'border-border/50 bg-muted/10 opacity-50'
            }
          }

          return (
            <button
              key={idx}
              onClick={() => handleOptionClick(idx)}
              disabled={showAnswer}
              className={cn(
                'w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] text-left transition-all',
                optionStyle
              )}
            >
              <span className={cn(
                'flex items-center justify-center h-6 w-6 rounded-md text-[10px] font-bold shrink-0',
                revealed && isCorrect
                  ? 'bg-green-500 text-white'
                  : revealed && isSelected && !isCorrect
                    ? 'bg-red-500 text-white'
                    : 'bg-muted text-muted-foreground'
              )}>
                {String.fromCharCode(65 + idx)}
              </span>
              <span className={cn(
                'flex-1',
                revealed && isCorrect && 'font-semibold text-green-700 dark:text-green-300',
                revealed && isSelected && !isCorrect && 'text-red-600 dark:text-red-400 line-through'
              )}>
                {option}
              </span>
              {revealed && isCorrect && (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              )}
              {revealed && isSelected && !isCorrect && (
                <X className="h-4 w-4 text-red-500 shrink-0" />
              )}
            </button>
          )
        })}
      </div>

      {/* Answer explanation (revealed) — compact */}
      <AnimatePresence>
        {showAnswer && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.2 }}
            className="border-t border-violet-200 dark:border-violet-800/50 pt-3 mt-4 max-h-[120px] overflow-y-auto"
          >
            {selectedIndex !== null && selectedIndex === correctIndex ? (
              <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">Correct!</p>
            ) : selectedIndex !== null ? (
              <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                Incorrect — the answer is {String.fromCharCode(65 + correctIndex)}
              </p>
            ) : null}
            <p className="text-xs leading-relaxed text-foreground/60">
              {card.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selection hint */}
      {!showAnswer && (
        <p className="text-[11px] text-muted-foreground text-center mt-3">
          Select an answer
        </p>
      )}
    </div>
  )
}

// ============================================
// Shared Explain Section
// ============================================

function ExplainSection({
  explanation,
  isExplaining,
  onExplain,
}: {
  explanation: string | null
  isExplaining: boolean
  onExplain: () => void
}) {
  return (
    <div className="mt-4">
      {!explanation && (
        <button
          onClick={(e) => { e.stopPropagation(); onExplain() }}
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
  analysisInsights,
}: {
  ratings: import('@/types/active-recall').ReviewSessionResult[]
  totalCards: number
  startedAt: Date | null
  feedback: import('@/types/active-recall').SessionFeedback | null
  isLoadingFeedback: boolean
  streak?: number
  onClose: () => void
  analysisInsights?: import('@/types/active-recall').SessionAnalysisInsights | null
}) {
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

          {/* Agent insights */}
          {analysisInsights && analysisInsights.adjustments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mb-6 rounded-xl bg-purple-500/5 border border-purple-500/10 p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium text-purple-700 dark:text-purple-400">Agent Adjustments</span>
              </div>
              <p className="text-xs text-muted-foreground">{analysisInsights.summary}</p>
            </motion.div>
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

function SourceTypeBadge({ sourceType }: { sourceType: string }) {
  const config: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
    flashcard: {
      icon: <FileText className="h-3 w-3" />,
      label: 'Flashcard',
      className: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
    },
    quiz: {
      icon: <FlaskConical className="h-3 w-3" />,
      label: 'Quiz',
      className: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
    },
    mindmap: {
      icon: <TreePine className="h-3 w-3" />,
      label: 'Mind Map',
      className: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    },
  }

  const c = config[sourceType] || config.flashcard
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium', c.className)}>
      {c.icon}
      {c.label}
    </span>
  )
}

function formatTimer(ms: number): string {
  const secs = Math.floor(ms / 1000)
  const mins = Math.floor(secs / 60)
  const remaining = secs % 60
  if (mins > 0) return `${mins}:${remaining.toString().padStart(2, '0')}`
  return `${remaining}s`
}

// ============================================
// Mind Map Sub-Tree Extraction
// ============================================

interface MindMapNodeData {
  id: string
  label: string
  detail: string
  emoji?: string
  children?: MindMapNodeData[]
}

/**
 * Extract a focused subtree from the full mind map based on the card's source_id.
 * - `{setId}_branches` → full top-level (just branches, no deep children)
 * - `{setId}_{nodeId}_children` → that node as central topic with its children
 * - `{setId}_{nodeId}_detail` → that node as central topic (leaf detail)
 */
function extractSubTree(fullSet: MindMapSet, sourceId: string): MindMapSet {
  const data = fullSet.mindMapData
  if (!data?.branches) return fullSet

  // Parse source_id
  const setIdPrefix = fullSet.id
  const suffix = sourceId.startsWith(setIdPrefix + '_')
    ? sourceId.slice(setIdPrefix.length + 1)
    : sourceId

  // Top-level branches card
  if (suffix === 'branches') {
    // Show central topic + immediate branches (no deep children)
    const shallowBranches = data.branches.map((b: MindMapNodeData) => ({
      ...b,
      children: b.children?.map((c: MindMapNodeData) => ({ ...c, children: undefined })),
    }))
    return {
      ...fullSet,
      mindMapData: {
        ...data,
        branches: shallowBranches,
        metadata: {
          totalNodes: shallowBranches.reduce((n: number, b: MindMapNodeData) => n + 1 + (b.children?.length || 0), 0),
          maxDepth: 2,
        },
      },
    }
  }

  // Find node by ID in the tree
  const nodeId = suffix.replace(/_children$/, '').replace(/_detail$/, '')
  const isChildrenCard = suffix.endsWith('_children')

  const findNode = (nodes: MindMapNodeData[]): MindMapNodeData | null => {
    for (const node of nodes) {
      if (node.id === nodeId) return node
      if (node.children) {
        const found = findNode(node.children)
        if (found) return found
      }
    }
    return null
  }

  const targetNode = findNode(data.branches)
  if (!targetNode) return fullSet

  if (isChildrenCard && targetNode.children?.length) {
    // Show this node as central topic with its children (shallow)
    const shallowChildren = targetNode.children.map((c: MindMapNodeData) => ({
      ...c,
      children: c.children?.map((gc: MindMapNodeData) => ({ ...gc, children: undefined })),
    }))
    return {
      ...fullSet,
      title: targetNode.label,
      mindMapData: {
        title: targetNode.label,
        centralTopic: targetNode.label,
        branches: shallowChildren,
        metadata: {
          totalNodes: shallowChildren.reduce((n: number, c: MindMapNodeData) => n + 1 + (c.children?.length || 0), 0),
          maxDepth: 2,
        },
      },
    }
  }

  // Detail card — show just the node as a mini map
  return {
    ...fullSet,
    title: targetNode.label,
    mindMapData: {
      title: targetNode.label,
      centralTopic: targetNode.label,
      branches: targetNode.children?.length
        ? targetNode.children.map((c: MindMapNodeData) => ({ ...c, children: undefined }))
        : [{ id: `${targetNode.id}_detail_leaf`, label: targetNode.detail || targetNode.label, detail: '', children: undefined }],
      metadata: {
        totalNodes: (targetNode.children?.length || 1) + 1,
        maxDepth: 1,
      },
    },
  }
}

// ============================================
// Mind Map Review View
// ============================================

function MindMapReviewView({
  mindMapSet,
  card,
  isRating,
  onRate,
}: {
  mindMapSet: MindMapSet
  card: ReviewCardType
  isRating: boolean
  onRate: (rating: SM2Rating) => Promise<void>
}) {
  const [mapFullscreen, setMapFullscreen] = useState(false)
  const { showAnswer, flipCard } = useReviewStore()

  // Auto-flip for mind map cards (the map IS the content — no hidden answer)
  useEffect(() => {
    if (!showAnswer) {
      flipCard()
    }
  }, [card.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape exits fullscreen
  useEffect(() => {
    if (!mapFullscreen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMapFullscreen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [mapFullscreen])

  const title = mindMapSet.mindMapData?.centralTopic || mindMapSet.title

  // Fullscreen overlay
  if (mapFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="flex-1">
          <LazyMindMapViewer
            mindMapSet={mindMapSet}
            title={title}
            isFullscreen
            onToggleFullscreen={() => setMapFullscreen(false)}
            className="h-full"
          />
        </div>
        {/* Rating bar at bottom in fullscreen */}
        {showAnswer && (
          <div className="border-t bg-card p-4">
            <RatingButtonsV2 card={card} onRate={onRate} disabled={isRating} />
          </div>
        )}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full flex flex-col gap-3 max-w-5xl"
    >
      {/* Question prompt */}
      <div className="text-center px-4">
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5">
          <TreePine className="h-3.5 w-3.5" />
          {card.question}
        </p>
      </div>

      {/* Mind map viewer */}
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/50 bg-card overflow-hidden h-[450px]">
        <LazyMindMapViewer
          mindMapSet={mindMapSet}
          title={title}
          onToggleFullscreen={() => setMapFullscreen(true)}
          className="h-full"
        />
      </div>
    </motion.div>
  )
}
