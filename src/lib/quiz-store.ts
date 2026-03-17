'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { QuizSet, QuizProgress, QuizSession, QuizAnswer } from '@/types/quiz'

interface QuizStore {
  // Hydration state (not persisted)
  _hasHydrated: boolean

  // Viewer state
  isViewerOpen: boolean
  currentQuizSet: QuizSet | null
  isFullscreen: boolean

  // Session state
  currentSession: QuizSession | null

  // Generated quiz sets
  quizSets: QuizSet[]

  // Actions
  openViewer: (quizSet: QuizSet) => void
  closeViewer: () => void
  toggleFullscreen: () => void

  // Session management
  startSession: (quizSetId: string) => void
  endSession: () => void
  updateProgress: (progress: Partial<QuizProgress>) => void
  recordAnswer: (answer: QuizAnswer) => void
  getSessionScore: () => number | null

  // Quiz set management
  addQuizSet: (quizSet: QuizSet) => void
  removeQuizSet: (id: string) => Promise<void>
  renameQuizSet: (id: string, newTitle: string) => Promise<void>
  clearQuizSets: () => void
  deduplicateQuizSets: () => void

  // Utilities
  getQuizSetById: (id: string) => QuizSet | null
}

export const useQuizStore = create<QuizStore>()(
  persist(
    (set, get) => ({
      // Hydration state (not persisted)
      _hasHydrated: false,

      // Initial state
      isViewerOpen: false,
      currentQuizSet: null,
      isFullscreen: false,
      currentSession: null,
      quizSets: [],

      // Viewer actions
      openViewer: (quizSet: QuizSet) => {
        console.log('[QuizStore] Opening viewer with quiz set:', quizSet.id)

        // Close canvas when opening quiz (mutual exclusion)
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { useStudyToolsStore } = require('@/lib/study-tools-store')
          const studyToolsStore = useStudyToolsStore.getState()
          if (studyToolsStore.isCanvasOpen) {
            studyToolsStore.closeCanvas()
          }
        } catch (error) {
          console.warn('[QuizStore] Could not close canvas:', error)
        }

        // Close flashcard viewer if open
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { useFlashcardStore } = require('@/lib/flashcard-store')
          const flashcardStore = useFlashcardStore.getState()
          if (flashcardStore.isViewerOpen) {
            flashcardStore.closeViewer()
          }
        } catch (error) {
          console.warn('[QuizStore] Could not close flashcard viewer:', error)
        }

        set({
          isViewerOpen: true,
          currentQuizSet: quizSet,
          isFullscreen: false,
          currentSession: null  // Reset session when opening new quiz
        })
      },

      closeViewer: () => {
        console.log('[QuizStore] Closing viewer')
        set({
          isViewerOpen: false,
          currentQuizSet: null,
          isFullscreen: false,
          currentSession: null
        })
      },

      toggleFullscreen: () => {
        set(state => ({ isFullscreen: !state.isFullscreen }))
      },

      // Session management
      startSession: (quizSetId: string) => {
        const quizSet = get().quizSets.find(s => s.id === quizSetId) || get().currentQuizSet
        if (!quizSet) return

        set({
          currentSession: {
            quizSetId,
            progress: {
              currentIndex: 0,
              totalQuestions: quizSet.questions.length,
              answeredQuestions: 0,
              correctAnswers: 0,
              isComplete: false
            },
            answers: [],
            startedAt: new Date()
          }
        })
      },

      endSession: () => {
        const session = get().currentSession
        if (!session) return

        const score = session.progress.totalQuestions > 0
          ? Math.round((session.progress.correctAnswers / session.progress.totalQuestions) * 100)
          : 0

        set({
          currentSession: {
            ...session,
            completedAt: new Date(),
            score,
            progress: {
              ...session.progress,
              isComplete: true
            }
          }
        })
      },

      updateProgress: (progress: Partial<QuizProgress>) => {
        const session = get().currentSession
        if (!session) return

        set({
          currentSession: {
            ...session,
            progress: { ...session.progress, ...progress }
          }
        })
      },

      recordAnswer: (answer: QuizAnswer) => {
        const session = get().currentSession
        if (!session) return

        // Check if already answered this question
        const existingIndex = session.answers.findIndex(a => a.questionId === answer.questionId)
        let newAnswers: QuizAnswer[]
        if (existingIndex >= 0) {
          newAnswers = [...session.answers]
          newAnswers[existingIndex] = answer
        } else {
          newAnswers = [...session.answers, answer]
        }

        const correctCount = newAnswers.filter(a => a.isCorrect).length

        set({
          currentSession: {
            ...session,
            answers: newAnswers,
            progress: {
              ...session.progress,
              answeredQuestions: newAnswers.length,
              correctAnswers: correctCount
            }
          }
        })
      },

      getSessionScore: () => {
        const session = get().currentSession
        if (!session || session.progress.totalQuestions === 0) return null
        return Math.round((session.progress.correctAnswers / session.progress.totalQuestions) * 100)
      },

      // Quiz set management
      addQuizSet: (quizSet: QuizSet) => {
        console.log('[QuizStore] Adding quiz set:', quizSet.id, quizSet.title)

        set(state => {
          // Deduplicate by id
          const existingIndex = state.quizSets.findIndex(s => s.id === quizSet.id)
          if (existingIndex >= 0) {
            const updated = [...state.quizSets]
            updated[existingIndex] = quizSet
            return { quizSets: updated }
          }
          return { quizSets: [quizSet, ...state.quizSets] }
        })
      },

      removeQuizSet: async (id: string) => {
        console.log('[QuizStore] Removing quiz set:', id)

        // Optimistic removal
        const previousSets = get().quizSets
        set(state => ({
          quizSets: state.quizSets.filter(s => s.id !== id),
          // Close viewer if viewing the deleted quiz
          ...(state.currentQuizSet?.id === id ? {
            isViewerOpen: false,
            currentQuizSet: null,
            currentSession: null
          } : {})
        }))

        // Try to delete from database (skip for placeholders that were never saved)
        const wasPlaceholder = previousSets.find(s => s.id === id)?.metadata?.isGenerating
        if (!wasPlaceholder) {
          try {
            const response = await fetch('/api/study-tools/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id })
            })
            if (!response.ok) {
              console.warn('[QuizStore] Failed to delete from database, rolling back')
              set({ quizSets: previousSets })
            }
          } catch (error) {
            console.error('[QuizStore] Delete error:', error)
            set({ quizSets: previousSets })
          }
        }
      },

      renameQuizSet: async (id: string, newTitle: string) => {
        console.log('[QuizStore] Renaming quiz set:', id, '->', newTitle)

        const previousSets = get().quizSets
        set(state => ({
          quizSets: state.quizSets.map(s =>
            s.id === id ? { ...s, title: newTitle } : s
          )
        }))

        try {
          const response = await fetch('/api/study-tools/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, title: newTitle })
          })
          if (!response.ok) {
            set({ quizSets: previousSets })
          }
        } catch (error) {
          console.error('[QuizStore] Rename error:', error)
          set({ quizSets: previousSets })
        }
      },

      clearQuizSets: () => {
        set({ quizSets: [] })
      },

      deduplicateQuizSets: () => {
        set(state => {
          const seen = new Set<string>()
          const deduplicated = state.quizSets.filter(s => {
            if (seen.has(s.id)) return false
            seen.add(s.id)
            return true
          })
          return { quizSets: deduplicated }
        })
      },

      // Utilities
      getQuizSetById: (id: string) => {
        return get().quizSets.find(s => s.id === id) || null
      }
    }),
    {
      name: 'cognileap-quiz-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        quizSets: state.quizSets.map(s => ({
          ...s,
          metadata: {
            ...s.metadata,
            isGenerating: false,
            generationProgress: undefined,
            statusMessage: undefined
          }
        }))
      }),
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            state._hasHydrated = true
          }
        }
      }
    }
  )
)
