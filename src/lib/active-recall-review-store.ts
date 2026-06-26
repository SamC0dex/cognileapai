'use client'

import { create } from 'zustand'
import type {
  ReviewCard,
  ReviewSessionResult,
  ReviewSessionConfig,
  ReviewUndoEntry,
  SM2Rating,
  SessionFeedback,
  SessionAnalysisInsights,
} from '@/types/active-recall'

interface ReviewStoreState {
  // Session
  sessionId: string | null
  config: ReviewSessionConfig | null
  cards: ReviewCard[]
  currentCardIndex: number
  showAnswer: boolean
  ratings: ReviewSessionResult[]
  undoStack: ReviewUndoEntry[]
  startedAt: Date | null
  cardRevealedAt: Date | null
  cardShownAt: Date | null // when the question was first displayed

  // State
  isActive: boolean
  isRating: boolean
  isComplete: boolean
  isLoadingFeedback: boolean

  // Results
  feedback: SessionFeedback | null

  // Analysis
  analysisStatus: 'idle' | 'analyzing' | 'complete' | 'error'
  analysisInsights: SessionAnalysisInsights | null
}

interface ReviewStoreActions {
  initSession: (sessionId: string, cards: ReviewCard[], config?: ReviewSessionConfig) => void
  flipCard: () => void
  rateCard: (rating: SM2Rating) => Promise<void>
  rateMindMapGroup: (sourceSetId: string, rating: SM2Rating) => Promise<void>
  skipCard: () => void
  undoLastRating: () => Promise<void>
  endSession: () => Promise<void>
  analyzeSession: () => Promise<void>
  fetchFeedback: () => Promise<void>
  reset: () => void

  // Computed
  getCurrentCard: () => ReviewCard | null
  getProgress: () => number
  getElapsedTime: () => number
  getCardTime: () => number
  canUndo: () => boolean
}

type ReviewStore = ReviewStoreState & ReviewStoreActions

const initialState: ReviewStoreState = {
  sessionId: null,
  config: null,
  cards: [],
  currentCardIndex: 0,
  showAnswer: false,
  ratings: [],
  undoStack: [],
  startedAt: null,
  cardRevealedAt: null,
  cardShownAt: null,
  isActive: false,
  isRating: false,
  isComplete: false,
  isLoadingFeedback: false,
  feedback: null,
  analysisStatus: 'idle',
  analysisInsights: null,
}

export const useReviewStore = create<ReviewStore>()((set, get) => ({
  ...initialState,

  initSession: (sessionId, cards, config) => {
    set({
      ...initialState,
      sessionId,
      cards,
      config: config || null,
      startedAt: new Date(),
      cardShownAt: new Date(),
      isActive: true,
    })
  },

  flipCard: () => {
    set((state) => {
      if (!state.isActive || state.showAnswer) return state
      return {
        showAnswer: true,
        cardRevealedAt: new Date(),
      }
    })
  },

  rateCard: async (rating) => {
    const state = get()
    if (!state.isActive || state.isRating || !state.showAnswer) return

    const card = state.cards[state.currentCardIndex]
    if (!card) return

    set({ isRating: true })

    // Calculate response time from reveal
    const now = Date.now()
    const revealTime = state.cardRevealedAt?.getTime() ?? now - 2000
    const responseTimeMs = Math.max(500, now - revealTime)

    // Build result optimistically — update even if server call fails
    const result: ReviewSessionResult = {
      card_id: card.id,
      rating,
      response_time_ms: responseTimeMs,
      previous_layer: card.recall_layer,
      new_layer: card.recall_layer, // Will be updated if API succeeds
    }

    const undoEntry: ReviewUndoEntry = {
      cardIndex: state.currentCardIndex,
      previousRating: result,
      previousCardState: {
        ease_factor: card.ease_factor,
        interval_days: card.interval_days,
        repetitions: card.repetitions,
        recall_layer: card.recall_layer,
        next_review_at: card.next_review_at,
        last_reviewed_at: card.last_reviewed_at,
        total_reviews: card.total_reviews,
        correct_reviews: card.correct_reviews,
        consecutive_correct: card.consecutive_correct,
        average_response_time_ms: card.average_response_time_ms,
        lapse_count: card.lapse_count,
      },
    }

    try {
      const response = await fetch('/api/active-recall/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          rating,
          responseTimeMs,
          sessionId: state.sessionId,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        result.new_layer = data.layerChange?.to ?? card.recall_layer
      } else {
        console.error('[ReviewStore] Rate API error:', response.status)
      }
    } catch (error) {
      console.error('[ReviewStore] Rate network error:', error)
    }

    // Always advance the card — don't get stuck on API failure
    const isLastCard = state.currentCardIndex >= state.cards.length - 1

    set((s) => ({
      ratings: [...s.ratings, result],
      undoStack: [...s.undoStack, undoEntry],
      currentCardIndex: isLastCard ? s.currentCardIndex : s.currentCardIndex + 1,
      showAnswer: false,
      cardRevealedAt: null,
      cardShownAt: new Date(),
      isRating: false,
      isComplete: isLastCard,
    }))
  },

  rateMindMapGroup: async (sourceSetId, rating) => {
    const state = get()
    if (!state.isActive || state.isRating) return

    set({ isRating: true })

    // Find ALL mindmap cards with this source_set_id
    const groupCards = state.cards.filter(
      (c) => c.source_type === 'mindmap' && c.source_set_id === sourceSetId
    )
    const groupCardIds = new Set(groupCards.map((c) => c.id))

    const results: ReviewSessionResult[] = []

    // Rate each card in the group via API
    for (const card of groupCards) {
      // Skip cards already rated
      if (state.ratings.some((r) => r.card_id === card.id)) continue

      const result: ReviewSessionResult = {
        card_id: card.id,
        rating,
        response_time_ms: 5000, // flat time for group rating
        previous_layer: card.recall_layer,
        new_layer: card.recall_layer,
      }

      try {
        const response = await fetch('/api/active-recall/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cardId: card.id,
            rating,
            responseTimeMs: 5000,
            sessionId: state.sessionId,
          }),
        })
        if (response.ok) {
          const data = await response.json()
          result.new_layer = data.layerChange?.to ?? card.recall_layer
        }
      } catch { /* continue */ }

      results.push(result)
    }

    // Remove group cards from deck and advance
    const remainingCards = state.cards.filter((c) => !groupCardIds.has(c.id))
    const newIndex = Math.min(state.currentCardIndex, Math.max(0, remainingCards.length - 1))

    set((s) => ({
      cards: remainingCards.length > 0 ? remainingCards : s.cards,
      ratings: [...s.ratings, ...results],
      currentCardIndex: remainingCards.length > 0 ? newIndex : s.currentCardIndex,
      showAnswer: false,
      cardRevealedAt: null,
      cardShownAt: new Date(),
      isRating: false,
      isComplete: remainingCards.length === 0,
    }))
  },

  skipCard: () => {
    const state = get()
    if (!state.isActive || state.isRating || state.isComplete) return

    const card = state.cards[state.currentCardIndex]
    if (!card) return

    // Move skipped card to end of the deck (so it comes back later)
    const newCards = [...state.cards]
    newCards.splice(state.currentCardIndex, 1)
    newCards.push(card)

    set({
      cards: newCards,
      // currentCardIndex stays the same (next card slides into position)
      showAnswer: false,
      cardRevealedAt: null,
      cardShownAt: new Date(),
      // If we skipped the last remaining card, it wraps to position 0
      currentCardIndex: state.currentCardIndex >= newCards.length
        ? 0
        : state.currentCardIndex,
    })
  },

  undoLastRating: async () => {
    const state = get()
    if (state.undoStack.length === 0 || state.isRating) return

    const lastUndo = state.undoStack[state.undoStack.length - 1]

    try {
      // Revert card state on server
      await fetch('/api/active-recall/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: lastUndo.previousRating.card_id,
          rating: lastUndo.previousRating.rating,
          responseTimeMs: 0,
          sessionId: state.sessionId,
          undo: true,
          previousState: lastUndo.previousCardState,
        }),
      })
    } catch (error) {
      console.error('[ReviewStore] Undo error:', error)
      // Still revert locally even if server fails
    }

    set((s) => ({
      ratings: s.ratings.slice(0, -1),
      undoStack: s.undoStack.slice(0, -1),
      currentCardIndex: lastUndo.cardIndex,
      showAnswer: false,
      cardRevealedAt: null,
      cardShownAt: new Date(),
      isComplete: false,
    }))
  },

  endSession: async () => {
    const state = get()
    if (!state.sessionId || !state.startedAt) return

    const totalTimeMs = Date.now() - state.startedAt.getTime()

    try {
      await fetch('/api/active-recall/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          sessionId: state.sessionId,
          totalTimeMs,
        }),
      })
    } catch (error) {
      console.error('[ReviewStore] End session error:', error)
    }
  },

  analyzeSession: async () => {
    const state = get()
    if (!state.sessionId || state.ratings.length === 0) {
      set({ analysisStatus: 'complete', analysisInsights: null })
      return
    }

    set({ analysisStatus: 'analyzing' })

    try {
      const res = await fetch('/api/active-recall/analyze-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId }),
        signal: AbortSignal.timeout(15000), // 15s timeout
      })

      if (res.ok) {
        const data = await res.json()
        set({ analysisStatus: 'complete', analysisInsights: data.insights || null })
      } else {
        console.error('[ReviewStore] Analysis failed:', res.status)
        set({ analysisStatus: 'error', analysisInsights: null })
      }
    } catch (error) {
      console.error('[ReviewStore] Analysis error:', error)
      set({ analysisStatus: 'error', analysisInsights: null })
    }
  },

  fetchFeedback: async () => {
    const state = get()
    if (!state.ratings.length) return

    set({ isLoadingFeedback: true })

    const correctCount = state.ratings.filter((r) => r.rating >= 3).length
    const avgResponseTime = state.ratings.reduce((sum, r) => sum + r.response_time_ms, 0) / state.ratings.length
    const promotions = state.ratings.filter((r) => r.new_layer > r.previous_layer).length
    const demotions = state.ratings.filter((r) => r.new_layer < r.previous_layer).length
    const accuracy = state.ratings.length > 0 ? (correctCount / state.ratings.length) * 100 : 0

    // Fetch AI coaching message
    let aiCoachingMessage = ''
    try {
      const res = await fetch('/api/active-recall/session-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accuracy: Math.round(accuracy),
          cardsReviewed: state.ratings.length,
          avgResponseTimeMs: avgResponseTime,
          promotions,
          demotions,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        aiCoachingMessage = data.feedback
      }
    } catch {
      // Fall back to local message
    }

    const feedback: SessionFeedback = {
      summary: aiCoachingMessage || (accuracy >= 90
        ? 'Outstanding session! Your memory retention is excellent.'
        : accuracy >= 70
          ? 'Great session. You\'re building strong recall patterns.'
          : accuracy >= 50
            ? 'Good effort. Consistent practice will improve your recall.'
            : 'Keep at it. Every review session strengthens your memory pathways.'),
      accuracy,
      avgResponseTimeMs: avgResponseTime,
      layerPromotions: promotions,
      layerDemotions: demotions,
      strengths: [],
      weaknesses: [],
      aiCoachingMessage,
      streakUpdate: null,
      dailyGoalProgress: null,
    }

    set({ feedback, isLoadingFeedback: false })
  },

  reset: () => set(initialState),

  getCurrentCard: () => {
    const { cards, currentCardIndex } = get()
    return cards[currentCardIndex] || null
  },

  getProgress: () => {
    const { ratings, cards } = get()
    return cards.length > 0 ? (ratings.length / cards.length) * 100 : 0
  },

  getElapsedTime: () => {
    const { startedAt } = get()
    return startedAt ? Date.now() - startedAt.getTime() : 0
  },

  getCardTime: () => {
    const { cardShownAt } = get()
    return cardShownAt ? Date.now() - cardShownAt.getTime() : 0
  },

  canUndo: () => {
    const { undoStack, isRating } = get()
    return undoStack.length > 0 && !isRating
  },
}))
