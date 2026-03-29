'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  ActiveRecallStore,
  ActiveRecallStoreState,
  ReviewCard,
  ReviewSessionResult,
  DueCardsResponse,
  ActiveRecallStats,
  DocumentMastery,
  SM2Rating,
  RecallLayer,
} from '@/types/active-recall'

const initialState: ActiveRecallStoreState = {
  _hasHydrated: false,
  dueCards: [],
  totalDue: 0,
  isLoading: false,
  error: null,
  currentSession: null,
  stats: null,
  masteryByDocument: [],
  nudgeMessage: null,
  nudgeLoadedAt: null,
}

export const useActiveRecallStore = create<ActiveRecallStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ============================================
      // Data Fetching
      // ============================================

      fetchDueCards: async (documentId?: string) => {
        set({ isLoading: true, error: null })
        try {
          const params = new URLSearchParams()
          if (documentId) params.set('document_id', documentId)

          const response = await fetch(`/api/active-recall/due-cards?${params}`)
          if (!response.ok) throw new Error('Failed to fetch due cards')

          const data: DueCardsResponse = await response.json()
          set({
            dueCards: data.cards,
            totalDue: data.totalDue,
            isLoading: false,
          })
        } catch (error) {
          console.error('[ActiveRecall] Fetch due cards error:', error)
          set({ isLoading: false, error: 'Failed to load due cards' })
        }
      },

      fetchStats: async (period?: string) => {
        try {
          const params = new URLSearchParams()
          if (period) params.set('period', period)

          const response = await fetch(`/api/active-recall/stats?${params}`)
          if (!response.ok) throw new Error('Failed to fetch stats')

          const data = await response.json()
          set({
            stats: data.stats as ActiveRecallStats,
            masteryByDocument: data.masteryByDocument as DocumentMastery[],
          })
        } catch (error) {
          console.error('[ActiveRecall] Fetch stats error:', error)
        }
      },

      fetchNudgeMessage: async () => {
        // Cache nudge for 1 hour
        const { nudgeLoadedAt } = get()
        if (nudgeLoadedAt && Date.now() - nudgeLoadedAt < 3600000) return

        try {
          const response = await fetch('/api/active-recall/ai-nudge')
          if (!response.ok) throw new Error('Failed to fetch nudge')

          const data = await response.json()
          set({
            nudgeMessage: data.message,
            nudgeLoadedAt: Date.now(),
          })
        } catch (error) {
          console.error('[ActiveRecall] Fetch nudge error:', error)
        }
      },

      // ============================================
      // Review Session
      // ============================================

      startSession: async (cards?: ReviewCard[]) => {
        try {
          // Use provided cards or fetch due cards
          let sessionCards = cards
          if (!sessionCards) {
            await get().fetchDueCards()
            sessionCards = get().dueCards
          }

          if (!sessionCards.length) {
            set({ error: 'No cards available for review' })
            return
          }

          // Create session on server
          const response = await fetch('/api/active-recall/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start' }),
          })

          if (!response.ok) throw new Error('Failed to start session')

          const { session } = await response.json()

          set({
            currentSession: {
              id: session.id,
              cards: sessionCards,
              currentCardIndex: 0,
              showAnswer: false,
              ratings: [],
              startedAt: new Date(),
              cardRevealedAt: null,
            },
            error: null,
          })
        } catch (error) {
          console.error('[ActiveRecall] Start session error:', error)
          set({ error: 'Failed to start review session' })
        }
      },

      flipCard: () => {
        set((state) => {
          if (!state.currentSession) return state
          const isRevealing = !state.currentSession.showAnswer
          return {
            currentSession: {
              ...state.currentSession,
              showAnswer: isRevealing,
              // Track when the answer was revealed for per-card response time
              cardRevealedAt: isRevealing ? new Date() : state.currentSession.cardRevealedAt,
            },
          }
        })
      },

      rateCard: async (rating: SM2Rating) => {
        const { currentSession } = get()
        if (!currentSession) return

        const card = currentSession.cards[currentSession.currentCardIndex]
        if (!card) return

        // Per-card response time: time between answer reveal and rating
        const now = Date.now()
        const revealTime = currentSession.cardRevealedAt?.getTime() ?? now - 2000
        const responseTimeMs = Math.max(500, now - revealTime)

        try {
          const response = await fetch('/api/active-recall/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cardId: card.id,
              rating,
              responseTimeMs,
              sessionId: currentSession.id,
            }),
          })

          if (!response.ok) throw new Error('Failed to rate card')

          const data = await response.json()

          // Record the result locally
          const result: ReviewSessionResult = {
            card_id: card.id,
            rating,
            response_time_ms: responseTimeMs,
            previous_layer: card.recall_layer,
            new_layer: data.layerChange?.to ?? card.recall_layer,
          }

          set((state) => {
            if (!state.currentSession) return state

            const isLastCard = state.currentSession.currentCardIndex >= state.currentSession.cards.length - 1

            return {
              currentSession: {
                ...state.currentSession,
                ratings: [...state.currentSession.ratings, result],
                // Auto-advance to next card
                currentCardIndex: isLastCard
                  ? state.currentSession.currentCardIndex
                  : state.currentSession.currentCardIndex + 1,
                showAnswer: false,
                cardRevealedAt: null, // Reset for next card
              },
            }
          })
        } catch (error) {
          console.error('[ActiveRecall] Rate card error:', error)
          set({ error: 'Failed to save rating' })
        }
      },

      nextCard: () => {
        set((state) => {
          if (!state.currentSession) return state
          const nextIndex = state.currentSession.currentCardIndex + 1
          if (nextIndex >= state.currentSession.cards.length) return state

          return {
            currentSession: {
              ...state.currentSession,
              currentCardIndex: nextIndex,
              showAnswer: false,
              cardRevealedAt: null,
            },
          }
        })
      },

      endSession: async () => {
        const { currentSession } = get()
        if (!currentSession) return

        try {
          const totalTimeMs = Date.now() - currentSession.startedAt.getTime()

          await fetch('/api/active-recall/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'complete',
              sessionId: currentSession.id,
              totalTimeMs,
            }),
          })

          // Don't clear session yet — let the summary component read it
          set((state) => ({
            currentSession: state.currentSession
              ? { ...state.currentSession }
              : null,
          }))

          // Refresh due cards and stats
          await get().fetchDueCards()
          await get().fetchStats()
        } catch (error) {
          console.error('[ActiveRecall] End session error:', error)
        }
      },

      // ============================================
      // Sync
      // ============================================

      syncFromFlashcards: async (flashcardSetId: string, documentId?: string) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { useFlashcardStore } = require('@/lib/flashcard-store')
          const flashcardStore = useFlashcardStore.getState()
          const flashcardSet = flashcardStore.getFlashcardSetById(flashcardSetId)
          if (!flashcardSet) return

          const { buildFlashcardSyncPayload, syncToActiveRecall } = await import('@/lib/active-recall-sync')
          const payload = buildFlashcardSyncPayload(flashcardSet)
          await syncToActiveRecall(payload)
        } catch (error) {
          console.warn('[ActiveRecall] Sync from flashcards error:', error)
        }
      },

      syncFromQuiz: async (quizSetId: string, documentId?: string) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { useQuizStore } = require('@/lib/quiz-store')
          const quizStore = useQuizStore.getState()
          const quizSet = quizStore.getQuizSetById(quizSetId)
          if (!quizSet) return

          const { buildQuizSyncPayload, syncToActiveRecall } = await import('@/lib/active-recall-sync')
          const payload = buildQuizSyncPayload(quizSet)
          await syncToActiveRecall(payload)
        } catch (error) {
          console.warn('[ActiveRecall] Sync from quiz error:', error)
        }
      },

      syncFromMindMap: async (mindMapSetId: string, documentId?: string) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { useMindMapStore } = require('@/lib/mindmap-store')
          const mindMapStore = useMindMapStore.getState()
          const mindMapSet = mindMapStore.getMindMapSetById(mindMapSetId)
          if (!mindMapSet) return

          const { buildMindMapSyncPayloadFromSet, syncToActiveRecall } = await import('@/lib/active-recall-sync')
          const payload = buildMindMapSyncPayloadFromSet(mindMapSet)
          await syncToActiveRecall(payload)
        } catch (error) {
          console.warn('[ActiveRecall] Sync from mind map error:', error)
        }
      },

      // ============================================
      // Reset
      // ============================================

      reset: () => {
        set({
          ...initialState,
          _hasHydrated: true,
        })
      },
    }),
    {
      name: 'cognileap-active-recall',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist stats cache and nudge — everything else is fetched fresh
        stats: state.stats,
        masteryByDocument: state.masteryByDocument,
        nudgeMessage: state.nudgeMessage,
        nudgeLoadedAt: state.nudgeLoadedAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true
        }
      },
    }
  )
)
