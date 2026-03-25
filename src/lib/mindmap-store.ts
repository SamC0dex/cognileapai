'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { MindMapSet } from '@/types/mindmap'

interface MindMapStore {
  _hasHydrated: boolean

  // Viewer state
  isViewerOpen: boolean
  currentMindMapSet: MindMapSet | null
  isFullscreen: boolean

  // Generated mind map sets
  mindMapSets: MindMapSet[]

  // Actions
  openViewer: (mindMapSet: MindMapSet) => void
  closeViewer: () => void
  toggleFullscreen: () => void

  // Mind map set management
  addMindMapSet: (mindMapSet: MindMapSet) => void
  removeMindMapSet: (id: string) => Promise<void>
  renameMindMapSet: (id: string, newTitle: string) => Promise<void>
  clearMindMapSets: () => void
  deduplicateMindMapSets: () => void

  // Utilities
  getMindMapSetById: (id: string) => MindMapSet | null
}

export const useMindMapStore = create<MindMapStore>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,

      isViewerOpen: false,
      currentMindMapSet: null,
      isFullscreen: false,
      mindMapSets: [],

      openViewer: (mindMapSet: MindMapSet) => {
        console.log('[MindMapStore] Opening viewer with mind map set:', mindMapSet.id)

        // Close canvas when opening mind map (mutual exclusion)
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { useStudyToolsStore } = require('@/lib/study-tools-store')
          const studyToolsStore = useStudyToolsStore.getState()
          if (studyToolsStore.isCanvasOpen) {
            studyToolsStore.closeCanvas()
          }
        } catch (error) {
          console.warn('[MindMapStore] Could not close canvas:', error)
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
          console.warn('[MindMapStore] Could not close flashcard viewer:', error)
        }

        // Close quiz viewer if open
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { useQuizStore } = require('@/lib/quiz-store')
          const quizStore = useQuizStore.getState()
          if (quizStore.isViewerOpen) {
            quizStore.closeViewer()
          }
        } catch (error) {
          console.warn('[MindMapStore] Could not close quiz viewer:', error)
        }

        set({
          isViewerOpen: true,
          currentMindMapSet: mindMapSet,
          isFullscreen: false
        })
      },

      closeViewer: () => {
        set({
          isViewerOpen: false,
          currentMindMapSet: null,
          isFullscreen: false
        })
      },

      toggleFullscreen: () => {
        set(state => ({ isFullscreen: !state.isFullscreen }))
      },

      addMindMapSet: (mindMapSet: MindMapSet) => {
        set(state => {
          const existingIndex = state.mindMapSets.findIndex(s => s.id === mindMapSet.id)
          if (existingIndex >= 0) {
            const updated = [...state.mindMapSets]
            updated[existingIndex] = mindMapSet
            return { mindMapSets: updated }
          }
          return { mindMapSets: [mindMapSet, ...state.mindMapSets] }
        })
      },

      removeMindMapSet: async (id: string) => {
        const previous = get().mindMapSets
        set(state => ({
          mindMapSets: state.mindMapSets.filter(s => s.id !== id),
          ...(state.currentMindMapSet?.id === id ? { isViewerOpen: false, currentMindMapSet: null } : {})
        }))

        try {
          const response = await fetch('/api/study-tools/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
          })
          if (!response.ok) {
            // If 404, the item was never saved to DB — that's fine, local removal is enough
            if (response.status === 404) {
              console.log('[MindMapStore] Item not in database (never saved), removed locally')
              return
            }
            console.error('[MindMapStore] Failed to delete from database')
            set({ mindMapSets: previous })
          }
        } catch (error) {
          console.error('[MindMapStore] Delete error:', error)
          set({ mindMapSets: previous })
        }
      },

      renameMindMapSet: async (id: string, newTitle: string) => {
        set(state => ({
          mindMapSets: state.mindMapSets.map(s =>
            s.id === id ? { ...s, title: newTitle } : s
          ),
          ...(state.currentMindMapSet?.id === id
            ? { currentMindMapSet: { ...state.currentMindMapSet!, title: newTitle } }
            : {})
        }))

        try {
          await fetch('/api/study-tools/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, title: newTitle })
          })
        } catch (error) {
          console.error('[MindMapStore] Rename error:', error)
        }
      },

      clearMindMapSets: () => {
        set({ mindMapSets: [], isViewerOpen: false, currentMindMapSet: null })
      },

      deduplicateMindMapSets: () => {
        set(state => {
          const seen = new Set<string>()
          const deduped = state.mindMapSets.filter(s => {
            if (seen.has(s.id)) return false
            seen.add(s.id)
            return true
          })
          return { mindMapSets: deduped }
        })
      },

      getMindMapSetById: (id: string) => {
        return get().mindMapSets.find(s => s.id === id) || null
      }
    }),
    {
      name: 'mindmap-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        mindMapSets: state.mindMapSets
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true
        }
      }
    }
  )
)
