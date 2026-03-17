"use client"

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Tokens } from 'marked'
import type { FlashcardOptions, FlashcardSet } from '@/types/flashcards'
import type { QuizOptions, QuizSet } from '@/types/quiz'
import {
  STUDY_TOOLS,
  type StudyToolContent,
  type StudyToolType,
  type ActiveGeneration
} from '@/lib/study-tools-shared'
import { translateError } from './errors/translator'
import { logError } from './errors/logger'
import type { UserFacingError, ErrorInput } from './errors/types'

export { STUDY_TOOLS }
export type { StudyToolContent, StudyToolType, ActiveGeneration }

const tightenMarkdownEmphasis = (value: string): string => {
  if (!value) return value

  let result = value
    .replace(/\*\*\s+/g, '**')
    .replace(/__(\s+)/g, '__')
    .replace(/(?<=\S)\s+\*\*/g, '**')
    .replace(/(?<=\S)\s+__/g, '__')

  result = result.replace(/\*\*([\s\S]*?)\*\*/g, (_match, inner: string) => `**${inner.trim()}**`)
  result = result.replace(/__([\s\S]*?)__/g, (_match, inner: string) => `__${inner.trim()}__`)

  return result
}

export const normalizeStudyToolMarkdown = (value: string): string => tightenMarkdownEmphasis(value)

interface ResumeGenerationOptions {
  resume: true
  generationId: string
  startedAt?: number
  flashcardOptions?: FlashcardOptions
  quizOptions?: QuizOptions
}

const isResumeOptions = (
  options: FlashcardOptions | QuizOptions | ResumeGenerationOptions | undefined
): options is ResumeGenerationOptions => {
  return Boolean(options && typeof options === 'object' && 'resume' in options && (options as ResumeGenerationOptions).resume)
}

type FlashcardStoreModule = typeof import('@/lib/flashcard-store')
type QuizStoreModule = typeof import('@/lib/quiz-store')

let cachedFlashcardStore: FlashcardStoreModule['useFlashcardStore'] | null = null
const loadFlashcardStore = async (): Promise<FlashcardStoreModule['useFlashcardStore']> => {
  if (cachedFlashcardStore) return cachedFlashcardStore
  const flashcardStoreModule = await import('@/lib/flashcard-store')
  cachedFlashcardStore = flashcardStoreModule.useFlashcardStore
  return cachedFlashcardStore
}

let cachedQuizStore: QuizStoreModule['useQuizStore'] | null = null
const loadQuizStore = async (): Promise<QuizStoreModule['useQuizStore']> => {
  if (cachedQuizStore) return cachedQuizStore
  const quizStoreModule = await import('@/lib/quiz-store')
  cachedQuizStore = quizStoreModule.useQuizStore
  return cachedQuizStore
}

interface StudyToolsStore {
  // Hydration state (not persisted)
  _hasHydrated: boolean

  // Panel state
  isPanelExpanded: boolean
  expandPanel: () => void
  collapsePanel: () => void
  togglePanel: () => void

  lastLoadedUserId: string | null
  setLastLoadedUserId: (userId: string | null) => void

  // Highlighting state for dashboard navigation
  highlightedTool: StudyToolType | null
  setHighlightedTool: (tool: StudyToolType | null) => void
  clearHighlightedTool: () => void

  // Canvas state
  isCanvasOpen: boolean
  isCanvasFullscreen: boolean
  canvasContent: StudyToolContent | null
  openCanvas: (content: StudyToolContent) => Promise<void>
  closeCanvas: () => void
  toggleCanvasFullscreen: () => void

  // Generation state - Fixed for concurrent generations
  activeGenerations: Map<string, ActiveGeneration>
  activeIntervals: Map<string, NodeJS.Timeout>
  activePollIntervals: Map<string, NodeJS.Timeout>
  getActiveGenerations: () => ActiveGeneration[]
  autoOpenQueue: Array<{ id: string; type: StudyToolType }>
  isProcessingAutoOpen: boolean
  _recentlyAutoOpened: Set<string>
  enqueueAutoOpen: (id: string, type: StudyToolType) => void
  _processAutoOpenQueue: () => void
  isGenerating: boolean // Proper reactive state, not computed
  isGeneratingType: (type: StudyToolType) => boolean
  generatingType: StudyToolType | null // Proper reactive state, not computed
  generationProgress: number // Proper reactive state, not computed
  error: string | null
  friendlyError: UserFacingError | null
  lastFailedGeneration: {
    type: StudyToolType
    documentId?: string
    conversationId?: string
    flashcardOptions?: FlashcardOptions
    quizOptions?: QuizOptions
    attempt: number
  } | null
  pendingGenerations: ActiveGeneration[]
  resumePendingGenerations: () => Promise<void>
  generateStudyTool: (
    type: StudyToolType,
    documentId?: string,
    conversationId?: string,
    generationOptions?: FlashcardOptions | QuizOptions | ResumeGenerationOptions
  ) => Promise<void>
  _updateGenerationState: () => void // Internal helper
  _cleanupGenerationTracking: (generationId: string) => void
  cancelGeneration: (generationId: string) => void // Manually cancel a stuck generation
  retryLastGeneration: () => Promise<void>
  setFriendlyError: (error: UserFacingError | null) => void
  clearError: () => void

  // Content management
  generatedContent: StudyToolContent[]
  addGeneratedContent: (content: StudyToolContent) => void
  removeGeneratedContent: (id: string) => Promise<void>
  renameGeneratedContent: (id: string, newTitle: string) => void
  clearGeneratedContent: () => void

  // Database functions
  loadStudyToolsFromDatabase: (documentId?: string, conversationId?: string) => Promise<void>

  // Export functions
  copyToClipboard: (content: string) => Promise<boolean>
  downloadAsPDF: (content: StudyToolContent) => Promise<void>
  downloadAsDOCX: (content: StudyToolContent) => Promise<void>
}

export const useStudyToolsStore = create<StudyToolsStore>()(
  persist(
    (set, get) => ({
  // Hydration state (not persisted)
  _hasHydrated: false,

  // Panel state
  isPanelExpanded: false,
  expandPanel: () => set({ isPanelExpanded: true }),
  collapsePanel: () => set({ isPanelExpanded: false }),
  togglePanel: () => set(state => ({ isPanelExpanded: !state.isPanelExpanded })),

  lastLoadedUserId: null,
  setLastLoadedUserId: (userId: string | null) => set({ lastLoadedUserId: userId }),

  // Highlighting state for dashboard navigation
  highlightedTool: null,
  setHighlightedTool: (tool: StudyToolType | null) => set({ highlightedTool: tool }),
  clearHighlightedTool: () => set({ highlightedTool: null }),

  // Canvas state
  isCanvasOpen: false,
  isCanvasFullscreen: false,
  canvasContent: null,
  openCanvas: async (content: StudyToolContent) => {
    console.log('[StudyToolsStore] Opening canvas with content:', content)

    // Close flashcard viewer when opening canvas (mutual exclusion)
    try {
      const { useFlashcardStore } = await import('@/lib/flashcard-store')
      const flashcardStore = useFlashcardStore.getState()
      if (flashcardStore.isViewerOpen) {
        flashcardStore.closeViewer()
      }
    } catch (error) {
      console.warn('[StudyToolsStore] Could not close flashcard viewer:', error)
    }

    set({ canvasContent: content, isCanvasOpen: true })
  },
  closeCanvas: () => {
    set({ isCanvasOpen: false, isCanvasFullscreen: false })
    // Don't clear content immediately to allow for smooth animation
    setTimeout(() => set({ canvasContent: null }), 300)
  },
  toggleCanvasFullscreen: () => {
    set(state => ({
      isCanvasFullscreen: !state.isCanvasFullscreen
    }))
  },

  // Generation state - Fixed for concurrent generations
  activeGenerations: new Map(),
  activeIntervals: new Map(),
  activePollIntervals: new Map(),
  pendingGenerations: [],
  getActiveGenerations: () => Array.from(get().activeGenerations.values()),
  autoOpenQueue: [],
  isProcessingAutoOpen: false,
  _recentlyAutoOpened: new Set<string>(),
  enqueueAutoOpen: (id: string, type: StudyToolType) => {
    const { _recentlyAutoOpened, autoOpenQueue, isProcessingAutoOpen } = get()
    
    // Skip if already auto-opened
    if (_recentlyAutoOpened.has(id)) {
      console.log('[StudyToolsStore] Skipping auto-open - already opened:', id)
      return
    }

    // Skip if already in queue
    if (autoOpenQueue.some(item => item.id === id)) {
      console.log('[StudyToolsStore] Skipping auto-open - already in queue:', id)
      return
    }

    console.log('[StudyToolsStore] Enqueueing auto-open:', { id, type, queueLength: autoOpenQueue.length })

    // Add to queue
    set(state => ({
      autoOpenQueue: [...state.autoOpenQueue, { id, type }]
    }))

    // Trigger processing if not already processing
    if (!isProcessingAutoOpen) {
      console.log('[StudyToolsStore] Starting queue processing')
      get()._processAutoOpenQueue()
    } else {
      console.log('[StudyToolsStore] Queue processing already in progress, item will be processed next')
    }
  },
  _processAutoOpenQueue: () => {
    const snapshot = get()
    
    // Guard: already processing
    if (snapshot.isProcessingAutoOpen) {
      console.log('[StudyToolsStore] Queue processing blocked - already in progress')
      return
    }

    const nextItem = snapshot.autoOpenQueue[0]
    
    // Guard: empty queue
    if (!nextItem) {
      console.log('[StudyToolsStore] Queue is empty, nothing to process')
      return
    }

    console.log('[StudyToolsStore] Processing queue item:', {
      id: nextItem.id,
      type: nextItem.type,
      remainingInQueue: snapshot.autoOpenQueue.length - 1
    })

    // Mark as processing and remove item from queue
    set(state => ({
      isProcessingAutoOpen: true,
      autoOpenQueue: state.autoOpenQueue.slice(1)
    }))

    const finalize = () => {
      console.log('[StudyToolsStore] Finalizing auto-open for:', nextItem.id)
      
      set(state => {
        const updatedSet = new Set(state._recentlyAutoOpened)
        updatedSet.add(nextItem.id)
        
        // Keep set size manageable
        if (updatedSet.size > 50) {
          const iterator = updatedSet.values()
          while (updatedSet.size > 50) {
            const next = iterator.next()
            if (next.done) break
            updatedSet.delete(next.value)
          }
        }
        
        return {
          isProcessingAutoOpen: false,
          _recentlyAutoOpened: updatedSet
        }
      })

      // Schedule next item processing after a delay
      const remainingQueue = get().autoOpenQueue
      if (remainingQueue.length > 0) {
        console.log('[StudyToolsStore] Scheduling next queue item processing:', remainingQueue[0].id)
        setTimeout(() => {
          get()._processAutoOpenQueue()
        }, 100) // Small delay to ensure UI has time to settle
      } else {
        console.log('[StudyToolsStore] Queue processing complete - no more items')
      }
    }

    // Wait 1200ms before opening to allow previous content to settle
    setTimeout(async () => {
      try {
        console.log('[StudyToolsStore] Opening content:', nextItem.id)
        
        if (nextItem.type === 'flashcards') {
          const flashcardStore = await loadFlashcardStore()
          const flashcardState = flashcardStore.getState()
          const flashcardSet = flashcardState.flashcardSets.find(set => set.id === nextItem.id)
          if (flashcardSet) {
            console.log('[StudyToolsStore] Opening flashcard viewer:', flashcardSet.title)
            flashcardState.openViewer(flashcardSet)
          } else {
            console.warn('[StudyToolsStore] Flashcard set not found:', nextItem.id)
          }
        } else if (nextItem.type === 'quiz') {
          const quizStore = await loadQuizStore()
          const quizState = quizStore.getState()
          const quizSet = quizState.quizSets.find(set => set.id === nextItem.id)
          if (quizSet) {
            console.log('[StudyToolsStore] Opening quiz viewer:', quizSet.title)
            quizState.openViewer(quizSet)
          } else {
            console.warn('[StudyToolsStore] Quiz set not found:', nextItem.id)
          }
        } else {
          const content = get().generatedContent.find(content => content.id === nextItem.id)
          if (content) {
            console.log('[StudyToolsStore] Opening canvas:', content.title)
            await get().openCanvas(content)
          } else {
            console.warn('[StudyToolsStore] Study tool content not found:', nextItem.id)
          }
        }
      } catch (error) {
        console.error('[StudyToolsStore] Auto-open failed:', error)
      } finally {
        finalize()
      }
    }, 1200) // Increased from 400ms to 1200ms for better sequential opening
  },
  isGenerating: false, // Proper reactive state
  isGeneratingType: (type: StudyToolType) => {
    const generations = get().activeGenerations
    return Array.from(generations.values()).some(gen => gen.type === type)
  },
  generatingType: null, // Proper reactive state
  generationProgress: 0, // Proper reactive state
  error: null,
  friendlyError: null,
  lastFailedGeneration: null,

  _updateGenerationState: () => {
    const generations = Array.from(get().activeGenerations.values())
    const isGenerating = generations.length > 0
    const generatingType = generations.length > 0 ? generations[0].type : null
    const generationProgress = generations.length === 0 ? 0 :
      Math.round(generations.reduce((sum, gen) => sum + gen.progress, 0) / generations.length)

    set({ isGenerating, generatingType, generationProgress })
  },
  setFriendlyError: (friendlyError: UserFacingError | null) => {
    set({ friendlyError, error: friendlyError ? friendlyError.message : null })
  },
  clearError: () => {
    set({ error: null, friendlyError: null, lastFailedGeneration: null })
  },
  _cleanupGenerationTracking: (generationId: string) => {
    const stateSnapshot = get()

    const progressInterval = stateSnapshot.activeIntervals.get(generationId)
    if (progressInterval) {
      clearInterval(progressInterval)
    }

    const pollInterval = stateSnapshot.activePollIntervals.get(generationId)
    if (pollInterval) {
      clearInterval(pollInterval)
    }

    set(state => {
      const newActiveIntervals = new Map(state.activeIntervals)
      const newActivePollIntervals = new Map(state.activePollIntervals)
      const newActiveGenerations = new Map(state.activeGenerations)

      newActiveIntervals.delete(generationId)
      newActivePollIntervals.delete(generationId)
      newActiveGenerations.delete(generationId)

      return {
        activeIntervals: newActiveIntervals,
        activePollIntervals: newActivePollIntervals,
        activeGenerations: newActiveGenerations,
        pendingGenerations: state.pendingGenerations.filter(gen => gen.id !== generationId)
      }
    })

    get()._updateGenerationState()
  },
  cancelGeneration: (generationId: string) => {
    console.log('[StudyToolsStore] Manually cancelling generation:', generationId)
    
    const currentState = get()
    const generation = currentState.activeGenerations.get(generationId)
    
    if (!generation) {
      console.warn('[StudyToolsStore] Generation not found:', generationId)
      return
    }
    
    // Mark content as cancelled
    set(state => ({
      generatedContent: state.generatedContent.map(content =>
        content.id === generationId
          ? {
              ...content,
              isGenerating: false,
              generationProgress: 0,
              statusMessage: 'Generation cancelled'
            }
          : content
      )
    }))
    
    // Clean up tracking
    get()._cleanupGenerationTracking(generationId)
    
    console.log('[StudyToolsStore] Generation cancelled successfully')
  },
  retryLastGeneration: async () => {
    const last = get().lastFailedGeneration
    if (!last) return
    const options = last.type === 'quiz' ? last.quizOptions : last.flashcardOptions
    await get().generateStudyTool(last.type, last.documentId, last.conversationId, options)
  },
  resumePendingGenerations: async () => {
    const pending = get().pendingGenerations
    if (!pending.length) return

    for (const generation of pending) {
      await get().generateStudyTool(
        generation.type,
        generation.documentId,
        generation.conversationId,
        {
          resume: true,
          generationId: generation.id,
          startedAt: generation.startTime,
          flashcardOptions: generation.flashcardOptions
        }
      )
    }
  },
  generateStudyTool: async (
    type: StudyToolType,
    documentId?: string,
    conversationId?: string,
    generationOptions?: FlashcardOptions | QuizOptions | ResumeGenerationOptions
  ) => {
    const resumeOptions = isResumeOptions(generationOptions) ? generationOptions : null
    const flashcardOptions = resumeOptions ? resumeOptions.flashcardOptions : (type === 'flashcards' ? generationOptions as FlashcardOptions | undefined : undefined)
    const quizOptions = resumeOptions ? resumeOptions.quizOptions : (type === 'quiz' ? generationOptions as QuizOptions | undefined : undefined)
    const generationId = resumeOptions?.generationId ?? crypto.randomUUID()
    const startTime = resumeOptions?.startedAt ?? Date.now()
    const cleanupGeneration = get()._cleanupGenerationTracking
    let isTimeout = false // Track if abort was due to timeout
    let isLongRunning = false
    let longRunningStartedAt: number | null = null
    const SOFT_TIMEOUT_MS = 90000
    const HARD_TIMEOUT_MS = 300000
    let softTimeoutId: ReturnType<typeof setTimeout> | null = null
    let hardTimeoutId: ReturnType<typeof setTimeout> | null = null

    console.log('[StudyToolsStore] Starting generation:', {
      type,
      documentId,
      conversationId,
      generationId,
      resume: Boolean(resumeOptions)
    })

    // Prevent duplicate generations of the same type when not resuming
    if (!resumeOptions && get().isGeneratingType(type)) {
      console.warn(`[StudyToolsStore] Already generating ${type}, skipping duplicate request`)
      return
    }

    let useFlashcardStoreRef: FlashcardStoreModule['useFlashcardStore'] | null = null
    const ensureFlashcardStore = async () => {
      if (useFlashcardStoreRef) {
        return useFlashcardStoreRef
      }
      useFlashcardStoreRef = await loadFlashcardStore()
      return useFlashcardStoreRef
    }

    let startStatusPolling: () => void = () => {}
    let activeGenerationRecord: ActiveGeneration | null = null
    let effectiveDocumentId: string | undefined = documentId
    let effectiveConversationId: string | undefined = conversationId
    let placeholderContent: StudyToolContent

    try {
      const stateSnapshot = get()

      const existingPlaceholder = type !== 'flashcards'
        ? stateSnapshot.generatedContent.find(content => content.id === generationId)
        : undefined

      effectiveDocumentId = documentId ?? existingPlaceholder?.documentId
      effectiveConversationId = conversationId ?? existingPlaceholder?.conversationId

      const statusMessage = resumeOptions ? 'Resuming generation...' : 'Preparing AI generation...'
      const placeholderTitle = existingPlaceholder?.title ?? STUDY_TOOLS[type].name

      placeholderContent = existingPlaceholder
        ? {
            ...existingPlaceholder,
            documentId: effectiveDocumentId,
            conversationId: effectiveConversationId,
            isGenerating: true,
            generationProgress: existingPlaceholder.generationProgress ?? 0,
            statusMessage
          }
        : {
            id: generationId,
            type,
            title: placeholderTitle,
            content: '',
            createdAt: new Date(startTime),
            documentId: effectiveDocumentId,
            conversationId: effectiveConversationId,
            isGenerating: true,
            generationProgress: 0,
            statusMessage
          }

      const activeGeneration: ActiveGeneration = {
        id: generationId,
        type,
        startTime,
        progress: placeholderContent.generationProgress ?? 0,
        status: 'starting',
        documentId: effectiveDocumentId,
        conversationId: effectiveConversationId,
        flashcardOptions
      }
      activeGenerationRecord = activeGeneration

      const markAsLongRunning = async () => {
        if (isLongRunning) return

        isLongRunning = true
        longRunningStartedAt = Date.now()

        console.warn(
          `[StudyToolsStore] Generation ${generationId} exceeded ${SOFT_TIMEOUT_MS / 1000}s, entering fallback wait state`
        )

        set(state => {
          const newActiveGenerations = new Map(state.activeGenerations)
          const generation = newActiveGenerations.get(generationId)

          if (generation) {
            newActiveGenerations.set(generationId, {
              ...generation,
              status: 'generating',
              progress: Math.max(generation.progress, 75)
            })
          }

          const updatedContent = state.generatedContent.map(content =>
            content.id === placeholderContent.id && content.isGenerating !== false
              ? {
                  ...content,
                  generationProgress: Math.max(content.generationProgress ?? 0, 75),
                  statusMessage: 'Fallback model is processing... this may take a little longer.'
                }
              : content
          )

          return {
            activeGenerations: newActiveGenerations,
            generatedContent: updatedContent
          }
        })

        get()._updateGenerationState()

        if (type === 'flashcards' && useFlashcardStoreRef) {
          const flashcardStore = useFlashcardStoreRef.getState()
          const updatedSets = flashcardStore.flashcardSets.map((set: FlashcardSet) =>
            set.id === placeholderContent.id
              ? {
                  ...set,
                  metadata: {
                    ...set.metadata,
                    isGenerating: true,
                    generationProgress: Math.max(set.metadata?.generationProgress ?? 0, 75),
                    statusMessage: 'Fallback model is processing... this may take a little longer.'
                  }
                }
              : set
          )

          useFlashcardStoreRef.setState({ flashcardSets: updatedSets })
        }

        if (!get().activePollIntervals.has(generationId)) {
          startStatusPolling()
        } else {
          // Force a fresh sync so UI reflects backend retries
          await get().loadStudyToolsFromDatabase(effectiveDocumentId, effectiveConversationId)
        }
      }

      // Update state with new generation
      set(state => {
        const newActiveGenerations = new Map(state.activeGenerations)
        newActiveGenerations.set(generationId, activeGeneration)

        let nextGeneratedContent = state.generatedContent
        if (type !== 'flashcards') {
          const existingIndex = state.generatedContent.findIndex(content => content.id === generationId)
          if (existingIndex >= 0) {
            nextGeneratedContent = state.generatedContent.map(content =>
              content.id === generationId ? placeholderContent : content
            )
          } else {
            nextGeneratedContent = [placeholderContent, ...state.generatedContent]
          }
        }

        const nextPendingGenerations = [
          ...state.pendingGenerations.filter(gen => gen.id !== generationId),
          activeGeneration
        ]

        return {
          activeGenerations: newActiveGenerations,
          pendingGenerations: nextPendingGenerations,
          error: null,
          friendlyError: null,
          lastFailedGeneration: null,
          generatedContent: (type !== 'flashcards' && type !== 'quiz') ? nextGeneratedContent : state.generatedContent
        }
      })

      // Update reactive state
      get()._updateGenerationState()

      // For flashcards, ensure placeholder exists in flashcard store
      if (type === 'flashcards') {
        const flashcardStoreHook = await ensureFlashcardStore()
        const flashcardStore = flashcardStoreHook.getState()
        const existingSet = flashcardStore.flashcardSets.find(set => set.id === generationId)

        if (existingSet) {
          flashcardStoreHook.setState({
            flashcardSets: flashcardStore.flashcardSets.map(set =>
              set.id === generationId
                ? {
                    ...set,
                    metadata: {
                      ...set.metadata,
                      isGenerating: true,
                      generationProgress: set.metadata?.generationProgress ?? 0,
                      statusMessage
                    }
                  }
                : set
            )
          })
        } else {
          const placeholderFlashcardSet = {
            id: placeholderContent.id,
            title: placeholderContent.title,
            cards: [],
            options: flashcardOptions || { numberOfCards: 'standard', difficulty: 'medium' },
            createdAt: placeholderContent.createdAt,
            documentId: placeholderContent.documentId,
            conversationId: placeholderContent.conversationId,
            metadata: {
              totalCards: 0,
              avgDifficulty: 'generating',
              generationTime: 0,
              model: 'gemini-2.5-pro',
              sourceContentLength: 0,
              isGenerating: true,
              generationProgress: placeholderContent.generationProgress ?? 0,
              statusMessage
            }
          }
          flashcardStoreHook.getState().addFlashcardSet(placeholderFlashcardSet)
        }
      }

      // For quiz, ensure placeholder exists in quiz store
      if (type === 'quiz') {
        const quizStoreHook = await loadQuizStore()
        const quizStore = quizStoreHook.getState()
        const existingSet = quizStore.quizSets.find(set => set.id === generationId)

        if (existingSet) {
          quizStoreHook.setState({
            quizSets: quizStore.quizSets.map(set =>
              set.id === generationId
                ? {
                    ...set,
                    metadata: {
                      ...set.metadata,
                      isGenerating: true,
                      generationProgress: set.metadata?.generationProgress ?? 0,
                      statusMessage
                    }
                  }
                : set
            )
          })
        } else {
          const placeholderQuizSet: QuizSet = {
            id: placeholderContent.id,
            title: placeholderContent.title,
            questions: [],
            options: quizOptions || { numberOfQuestions: 'standard', difficulty: 'medium' },
            createdAt: placeholderContent.createdAt,
            documentId: placeholderContent.documentId,
            conversationId: placeholderContent.conversationId,
            metadata: {
              totalQuestions: 0,
              avgDifficulty: 'generating',
              generationTime: 0,
              model: 'gemini-3-flash',
              sourceContentLength: 0,
              isGenerating: true,
              generationProgress: placeholderContent.generationProgress ?? 0,
              statusMessage
            }
          }
          quizStoreHook.getState().addQuizSet(placeholderQuizSet)
        }
      }

      startStatusPolling = () => {
        if (get().activePollIntervals.has(generationId)) {
          return
        }

        const pollStartTime = Date.now()
        const MAX_POLL_DURATION = 600000 // 10 minutes to allow for fallback retries

        const pollStatus = async () => {
          try {
            const elapsedTime = Date.now() - pollStartTime

            if (elapsedTime > MAX_POLL_DURATION) {
              console.warn(`[StudyToolsStore] Polling timeout for ${generationId}`)

              const existingContent = get().generatedContent.find(content => content.id === generationId)

              if (existingContent && existingContent.content && existingContent.content.trim().length > 0) {
                set(state => ({
                  generatedContent: state.generatedContent.map(content =>
                    content.id === generationId
                      ? {
                          ...content,
                          isGenerating: false,
                          generationProgress: content.generationProgress ?? 100,
                          statusMessage: undefined
                        }
                      : content
                  )
                }))
              } else {
                set(state => ({
                  generatedContent: state.generatedContent.map(content =>
                    content.id === generationId
                      ? { ...content, isGenerating: false, statusMessage: 'Generation timed out', generationProgress: 0 }
                      : content
                  )
                }))
              }

              cleanupGeneration(generationId)
              return
            }

            // Store current progress before database load to prevent overwriting
            const currentState = get()
            const currentContent = currentState.generatedContent.find(c => c.id === generationId)
            const currentProgress = currentContent?.generationProgress ?? 0
            const currentActiveGeneration = currentState.activeGenerations.get(generationId)
            
            // Detect if stuck at very high progress (95%+) for extended time
            // BUT: Respect fallback mechanism timing (90s-300s window)
            const isFallbackActive = currentContent?.statusMessage?.includes('Fallback')
            const stuckThreshold = isFallbackActive ? 330000 : 120000 // 5.5 minutes for fallback, 2 minutes otherwise
            
            if (currentProgress >= 95 && elapsedTime > stuckThreshold) {
              console.warn(`[StudyToolsStore] Generation stuck at ${currentProgress}% for ${elapsedTime}ms (fallback: ${isFallbackActive})`)
              
              // If we have content locally, complete the generation
              if (currentContent && currentContent.content && currentContent.content.trim().length > 0) {
                console.log('[StudyToolsStore] Found content locally after DB save failure, forcing completion')
                set(state => ({
                  generatedContent: state.generatedContent.map(content =>
                    content.id === generationId
                      ? {
                          ...content,
                          isGenerating: false,
                          generationProgress: 100,
                          statusMessage: undefined
                        }
                      : content
                  )
                }))
                cleanupGeneration(generationId)
                get().enqueueAutoOpen(currentContent.id, currentContent.type)
                return
              }
            }
            
            await get().loadStudyToolsFromDatabase(effectiveDocumentId, effectiveConversationId)

            // After database load, preserve higher progress value (don't let DB overwrite local progress)
            if (currentActiveGeneration) {
              set(state => {
                const dbContent = state.generatedContent.find(content => content.id === generationId)
                if (dbContent && dbContent.isGenerating && (dbContent.generationProgress ?? 0) < currentProgress) {
                  // Database has lower progress - restore the higher local progress
                  return {
                    generatedContent: state.generatedContent.map(content =>
                      content.id === generationId
                        ? { ...content, generationProgress: currentProgress }
                        : content
                    )
                  }
                }
                return state
              })
            }

            if (type === 'flashcards') {
              const flashcardStoreHook = useFlashcardStoreRef ?? await ensureFlashcardStore()
              const flashcardState = flashcardStoreHook.getState()
              const flashcardSet = flashcardState.flashcardSets.find(set => set.id === generationId)

              if (!flashcardSet || !flashcardSet.metadata?.isGenerating) {
                cleanupGeneration(generationId)
                if (flashcardSet && !flashcardSet.metadata?.isGenerating) {
                  get().enqueueAutoOpen(flashcardSet.id, 'flashcards')
                }
              }
            } else if (type === 'quiz') {
              try {
                const quizStoreHook = await loadQuizStore()
                const quizState = quizStoreHook.getState()
                const quizSet = quizState.quizSets.find((set: QuizSet) => set.id === generationId)

                if (!quizSet || !quizSet.metadata?.isGenerating) {
                  cleanupGeneration(generationId)
                  if (quizSet && !quizSet.metadata?.isGenerating) {
                    get().enqueueAutoOpen(quizSet.id, 'quiz')
                  }
                }
              } catch {
                // Quiz store not loaded
              }
            } else {
              const currentContent = get().generatedContent.find(content => content.id === generationId)

              if (!currentContent || currentContent.isGenerating === false) {
                cleanupGeneration(generationId)
                if (currentContent && !currentContent.isGenerating) {
                  get().enqueueAutoOpen(currentContent.id, currentContent.type)
                }
              }
            }
          } catch (error) {
            console.error('[StudyToolsStore] Status polling failed:', error)
          }
        }

        // Smart polling: wait 30s before first check, then use consistent 5s intervals
        // Reduced from aggressive 2s polling to prevent flickering
        const statusInterval = setInterval(() => {
          void pollStatus()
        }, 5000) // Consistent 5 second intervals - balances responsiveness with stability

        set(state => {
          const newActivePollIntervals = new Map(state.activePollIntervals)
          newActivePollIntervals.set(generationId, statusInterval)
          return { activePollIntervals: newActivePollIntervals }
        })

        // Wait 30 seconds before first check
        setTimeout(() => {
          void pollStatus() // First check after 30s
        }, 30000)
      }

      // Realistic AI generation progress simulation
      const getRealisticProgress = (
        elapsedSeconds: number,
        generationType: StudyToolType,
        longRunning: boolean,
        longRunningStart: number | null
      ) => {
        // Simple, reliable progress calculation designed for 30-45 second generations
        // Phase messages based on study tool type
        const messages = {
          'study-guide': [
            { threshold: 0, message: 'Analyzing content...' },
            { threshold: 20, message: 'Creating outline...' },
            { threshold: 40, message: 'Generating sections...' },
            { threshold: 70, message: 'Adding details...' },
            { threshold: 100, message: 'Finalizing guide...' }
          ],
          'flashcards': [
            { threshold: 0, message: 'Analyzing content...' },
            { threshold: 15, message: 'Identifying key concepts...' },
            { threshold: 35, message: 'Creating questions...' },
            { threshold: 65, message: 'Generating answers...' },
            { threshold: 100, message: 'Finalizing cards...' }
          ],
          'smart-notes': [
            { threshold: 0, message: 'Reading content...' },
            { threshold: 18, message: 'Extracting key points...' },
            { threshold: 45, message: 'Organizing notes...' },
            { threshold: 80, message: 'Adding insights...' }
          ],
          'smart-summary': [
            { threshold: 0, message: 'Processing content...' },
            { threshold: 25, message: 'Identifying main points...' },
            { threshold: 55, message: 'Creating summary...' },
            { threshold: 85, message: 'Polishing...' }
          ],
          'quiz': [
            { threshold: 0, message: 'Analyzing content...' },
            { threshold: 15, message: 'Crafting questions...' },
            { threshold: 35, message: 'Generating answer options...' },
            { threshold: 60, message: 'Writing explanations...' },
            { threshold: 85, message: 'Finalizing quiz...' }
          ]
        }

        // Calculate progress linearly with easing
        // Target: reach 90% at 100 seconds, then very slow progression to 97%
        let progress: number
        let currentMessage = messages[generationType][0].message

        if (elapsedSeconds <= 100) {
          // Smooth progression to 90% over 100 seconds with subtle easing
          // Apply gentle easing to make it feel natural
          const easingFactor = 1 - Math.pow(1 - (elapsedSeconds / 100), 1.2)
          progress = easingFactor * 90
        } else {
          // Very slow progression from 90% to 97% after 100 seconds
          const overtime = elapsedSeconds - 100
          const overtimeProgress = Math.min(overtime / 50, 1) // 50 second window for final 7%
          progress = 90 + (overtimeProgress * 7)
        }

        // Find current message based on elapsed time
        const toolMessages = messages[generationType]
        for (let i = toolMessages.length - 1; i >= 0; i--) {
          if (elapsedSeconds >= toolMessages[i].threshold) {
            currentMessage = toolMessages[i].message
            break
          }
        }

        if (longRunning) {
          const longRunningElapsed = longRunningStart
            ? (Date.now() - longRunningStart) / 1000
            : Math.max(0, elapsedSeconds - SOFT_TIMEOUT_MS / 1000)

          const plateauBase = Math.max(progress, 78)
          const plateauIncrement = Math.min(18, longRunningElapsed / 15) // roughly +1% every 15s
          progress = Math.min(plateauBase + plateauIncrement, 96)
          currentMessage = 'Fallback model is processing...'
        }

        // Ensure progress never exceeds 97% during generation
        progress = Math.min(progress, 97)

        return {
          progress: Math.round(Math.max(0, progress)),
          message: currentMessage
        }
      }

      let lastProgress = placeholderContent.generationProgress ?? 0 // Track to ensure never going backwards
      let lastUpdateTime = Date.now() // Track last update to throttle rapid updates
      
      const progressInterval = setInterval(() => {
        const now = Date.now()
        const elapsedSeconds = (now - startTime) / 1000
        const { progress: newProgress, message } = getRealisticProgress(
          elapsedSeconds,
          type,
          isLongRunning,
          longRunningStartedAt
        )
        
        // Ensure progress never goes backwards
        const progress = Math.max(lastProgress, newProgress)
        
        // Skip update if progress hasn't changed significantly (prevent flickering from tiny updates)
        if (Math.abs(progress - lastProgress) < 0.5 && now - lastUpdateTime < 500) {
          return
        }
        
        lastProgress = progress
        lastUpdateTime = now

        set(state => {
          // Update active generation progress
          const newActiveGenerations = new Map(state.activeGenerations)
          const currentGeneration = newActiveGenerations.get(generationId)
          if (currentGeneration) {
            newActiveGenerations.set(generationId, {
              ...currentGeneration,
              progress,
              status: progress < 95 ? 'generating' : 'finalizing'
            })
          }

          // Update placeholder content (only if still generating)
          const updatedContent = state.generatedContent.map(content =>
            content.id === placeholderContent.id && content.isGenerating !== false
              ? { ...content, generationProgress: progress, statusMessage: message }
              : content
          )

          return {
            activeGenerations: newActiveGenerations,
            generatedContent: updatedContent
          }
        })

        // Update reactive state
        get()._updateGenerationState()

        // Also update flashcard placeholder if it's a flashcard generation
        if (type === 'flashcards' && useFlashcardStoreRef) {
          const flashcardStore = useFlashcardStoreRef.getState()
          const updatedSets = flashcardStore.flashcardSets.map((set: FlashcardSet) =>
            set.id === placeholderContent.id
              ? {
                  ...set,
                  metadata: {
                    ...set.metadata,
                    generationProgress: progress,
                    statusMessage: message
                  }
                }
              : set
          )
          useFlashcardStoreRef.setState({ flashcardSets: updatedSets })
        }

        // Also update quiz placeholder if it's a quiz generation
        if (type === 'quiz' && cachedQuizStore) {
          const quizState = cachedQuizStore.getState()
          const updatedSets = quizState.quizSets.map((set: QuizSet) =>
            set.id === placeholderContent.id
              ? {
                  ...set,
                  metadata: {
                    ...set.metadata,
                    generationProgress: progress,
                    statusMessage: message
                  }
                }
              : set
          )
          cachedQuizStore.setState({ quizSets: updatedSets })
        }
      }, 500)

      // Track interval for cleanup
      set(state => {
        const newActiveIntervals = new Map(state.activeIntervals)
        newActiveIntervals.set(generationId, progressInterval)
        return { activeIntervals: newActiveIntervals }
      })

      if (resumeOptions) {
        startStatusPolling()
        return
      }

      // Create AbortController with 90 second timeout (API has 60s maxDuration + buffer)
      const controller = new AbortController()
      softTimeoutId = setTimeout(() => {
        void markAsLongRunning()
      }, SOFT_TIMEOUT_MS)

      hardTimeoutId = setTimeout(() => {
        isTimeout = true
        controller.abort(new Error('Request timeout after 5 minutes'))
      }, HARD_TIMEOUT_MS)

      let response: Response
      try {
        response = await fetch('/api/study-tools/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: generationId,
            type,
            documentId,
            conversationId,
            ...(type === 'flashcards' && flashcardOptions ? { flashcardOptions } : {}),
            ...(type === 'quiz' && quizOptions ? { quizOptions } : {})
          }),
          signal: controller.signal
        })
      } finally {
        if (softTimeoutId) {
          clearTimeout(softTimeoutId)
        }
        if (hardTimeoutId) {
          clearTimeout(hardTimeoutId)
        }
      }

      // Clean up interval
      clearInterval(progressInterval)
      set(state => {
        const newActiveIntervals = new Map(state.activeIntervals)
        newActiveIntervals.delete(generationId)
        return { activeIntervals: newActiveIntervals }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[StudyToolsStore] API Error:', errorData)

        // CRITICAL: Handle "all models overloaded" specially - clean UI, no empty card
        if (errorData.errorType === 'all_models_overloaded') {
          console.log('[StudyToolsStore] All models overloaded detected - removing placeholder and showing friendly error')
          
          // Remove the placeholder content completely (don't keep empty failed card)
          set(state => ({
            generatedContent: state.generatedContent.filter(content => content.id !== generationId),
            error: errorData.error,
            friendlyError: {
              id: crypto.randomUUID(),
              category: 'model-overload',
              severity: 'warning',
              title: 'AI Temporarily Unavailable',
              message: errorData.error || 'Our AI is experiencing high demand. Please try again in a few minutes.',
              icon: 'robot',
              details: errorData.details,
              actions: [
                { id: 'dismiss', label: 'Got it', variant: 'primary', intent: 'dismiss' },
                { id: 'retry', label: 'Try Again', variant: 'secondary', intent: 'retry', icon: 'refresh' }
              ]
            },
            lastFailedGeneration: null // Clear this since we removed the placeholder
          }))

          // Also remove flashcard placeholder if applicable
          if (type === 'flashcards') {
            const flashcardStoreHook = useFlashcardStoreRef ?? await ensureFlashcardStore()
            const flashcardStore = flashcardStoreHook.getState()
            const updatedSets = flashcardStore.flashcardSets.filter((set: FlashcardSet) => set.id !== generationId)
            flashcardStoreHook.setState({ flashcardSets: updatedSets })
          }

          // Also remove quiz placeholder if applicable
          if (type === 'quiz') {
            const quizStoreHook = await loadQuizStore()
            const quizStore = quizStoreHook.getState()
            const updatedSets = quizStore.quizSets.filter((set: QuizSet) => set.id !== generationId)
            quizStoreHook.setState({ quizSets: updatedSets })
          }

          cleanupGeneration(generationId)
          return // Exit early - don't throw error to prevent normal error handling
        }

        // Handle specific error cases
        if (response.status === 503 || errorData.error?.includes('overloaded')) {
          throw new Error(`${STUDY_TOOLS[type].name} service is temporarily overloaded. Please try again in a few minutes.`)
        } else if (response.status === 429) {
          throw new Error(`Rate limit exceeded. Please wait a moment before trying again.`)
        } else if (response.status === 422) {
          throw new Error(errorData.error || `Cannot generate ${STUDY_TOOLS[type].name} - insufficient content or document still processing.`)
        } else {
          throw new Error(errorData.error || `Failed to generate ${STUDY_TOOLS[type].name}. Please try again.`)
        }
      }

      const result = await response.json()
      console.log('[StudyToolsStore] Generation successful:', result)

      // Check if database save failed
      if (result.savedToDatabase === false) {
        console.warn('[StudyToolsStore] Content generated but database save failed, completing locally')
      }

      // Get current progress and status before completion animation
      const currentState = get()
      const currentGeneration = currentState.activeGenerations.get(generationId)
      const currentProgress = currentGeneration?.progress || 0
      const currentStatusMessage = placeholderContent.statusMessage || 'Finalizing...'

      // Animate progress to 100% before opening content (completion animation)
      const completeProgress = () => {
        return new Promise<void>((resolve) => {
          if (currentProgress >= 97) {
            // If already very close, just finish quickly
            setTimeout(resolve, 200)
            return
          }

          const completionInterval = setInterval(() => {
            set(state => {
              const newActiveGenerations = new Map(state.activeGenerations)
              const generation = newActiveGenerations.get(generationId)
              if (generation) {
                const progressStep = Math.min(5, 100 - generation.progress) // Speed up by 5% per step
                const newProgress = Math.min(100, generation.progress + progressStep)

                newActiveGenerations.set(generationId, {
                  ...generation,
                  progress: newProgress,
                  status: 'finalizing'
                })

                // Only show "Complete!" when very close to 100% to prevent flickering
                const completionMessage = newProgress >= 98 ? 'Complete!' : currentStatusMessage

                // Update placeholder content progress
                const updatedContent = state.generatedContent.map(content =>
                  content.id === placeholderContent.id
                    ? { ...content, generationProgress: newProgress, statusMessage: completionMessage }
                    : content
                )

                if (newProgress >= 100) {
                  clearInterval(completionInterval)
                  setTimeout(resolve, 100) // Small delay after reaching 100%
                }

                return {
                  activeGenerations: newActiveGenerations,
                  generatedContent: updatedContent
                }
              }
              return state
            })

            // Update reactive state
            get()._updateGenerationState()

            // Also update flashcard placeholder if it's a flashcard generation
            if (type === 'flashcards' && useFlashcardStoreRef) {
              const flashcardStore = useFlashcardStoreRef.getState()
              const currentFlashcardProgress = currentState.activeGenerations.get(generationId)?.progress || 0
              const flashcardCompletionMessage = currentFlashcardProgress >= 98 ? 'Complete!' : currentStatusMessage

              const updatedSets = flashcardStore.flashcardSets.map((set: FlashcardSet) =>
                set.id === placeholderContent.id
                  ? {
                      ...set,
                      metadata: {
                        ...set.metadata,
                        generationProgress: Math.min(100, currentFlashcardProgress + 5),
                        statusMessage: flashcardCompletionMessage
                      }
                    }
                  : set
              )
              useFlashcardStoreRef.setState({ flashcardSets: updatedSets })
            }

            // Also update quiz placeholder if it's a quiz generation
            if (type === 'quiz' && cachedQuizStore) {
              const quizState = cachedQuizStore.getState()
              const currentQuizProgress = currentState.activeGenerations.get(generationId)?.progress || 0
              const quizCompletionMessage = currentQuizProgress >= 98 ? 'Complete!' : currentStatusMessage

              const updatedSets = quizState.quizSets.map((set: QuizSet) =>
                set.id === placeholderContent.id
                  ? {
                      ...set,
                      metadata: {
                        ...set.metadata,
                        generationProgress: Math.min(100, currentQuizProgress + 5),
                        statusMessage: quizCompletionMessage
                      }
                    }
                  : set
              )
              cachedQuizStore.setState({ quizSets: updatedSets })
            }
          }, 150) // Fast completion animation
        })
      }

      // Wait for completion animation to finish
      await completeProgress()

      // Handle flashcards specially
      if (type === 'flashcards' && result.cards) {
        // Import flashcard store dynamically to avoid circular deps
        const flashcardStoreHook = useFlashcardStoreRef ?? await ensureFlashcardStore()

        // Create flashcard set
        const flashcardSet = {
          id: result.id || crypto.randomUUID(),
          title: result.title,
          cards: result.cards,
          options: result.options || flashcardOptions,
          createdAt: new Date(result.metadata?.generatedAt || new Date()),
          documentId,
          conversationId,
          metadata: {
            totalCards: result.cards.length,
            avgDifficulty: result.options?.difficulty || 'medium',
            generationTime: result.metadata?.duration || 0,
            model: result.metadata?.model || 'gemini-2.5-pro',
            sourceContentLength: result.metadata?.sourceContentLength || 0,
            isGenerating: false,
            generationProgress: 100,
            statusMessage: undefined
          }
        }

        // Replace placeholder with final flashcard set in flashcard store
        const flashcardStore = flashcardStoreHook.getState()
        const updatedSets = flashcardStore.flashcardSets.map(set =>
          set.id === placeholderContent.id ? flashcardSet : set
        )
        flashcardStoreHook.setState({ flashcardSets: updatedSets })
        cleanupGeneration(generationId)

        get().enqueueAutoOpen(flashcardSet.id, 'flashcards')

      } else if (type === 'quiz' && result.questions) {
        // Handle quiz results
        const quizStoreHook = await loadQuizStore()

        const quizSet: QuizSet = {
          id: result.id || crypto.randomUUID(),
          title: result.title,
          questions: result.questions,
          options: result.options || quizOptions || { numberOfQuestions: 'standard', difficulty: 'medium' },
          createdAt: new Date(result.metadata?.generatedAt || new Date()),
          documentId,
          conversationId,
          metadata: {
            totalQuestions: result.questions.length,
            avgDifficulty: result.options?.difficulty || 'medium',
            generationTime: result.metadata?.duration || 0,
            model: result.metadata?.model || 'gemini-3-flash',
            sourceContentLength: result.metadata?.sourceContentLength || 0,
            isGenerating: false,
            generationProgress: 100,
            statusMessage: undefined
          }
        }

        // Replace placeholder with final quiz set in quiz store
        const quizStore = quizStoreHook.getState()
        const updatedSets = quizStore.quizSets.map(set =>
          set.id === placeholderContent.id ? quizSet : set
        )
        quizStoreHook.setState({ quizSets: updatedSets })
        cleanupGeneration(generationId)

        get().enqueueAutoOpen(quizSet.id, 'quiz')

      } else {
        // Regular study tools
        const finalContent: StudyToolContent = {
          ...placeholderContent,
          id: result.id || placeholderContent.id, // Use database ID if available
          title: result.title || STUDY_TOOLS[type].name,
          content: result.content,
          isGenerating: false,
          generationProgress: 100,
          statusMessage: undefined
        }

        // Update placeholder with final content and remove from active generations
        set(state => ({
          generatedContent: state.generatedContent.map(content =>
            content.id === placeholderContent.id ? finalContent : content
          )
        }))
        cleanupGeneration(generationId)

        get().enqueueAutoOpen(finalContent.id, finalContent.type)
      }

    } catch (error) {
      if (softTimeoutId) {
        clearTimeout(softTimeoutId)
      }
      if (hardTimeoutId) {
        clearTimeout(hardTimeoutId)
      }
      console.error('[StudyToolsStore] Generation failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Generation failed'

      // Check if this is a timeout abort (intentional) vs navigation/refresh abort (unintentional)
      const isAbortError = error instanceof DOMException && error.name === 'AbortError'
      const isNetworkError = error instanceof TypeError && error.message.includes('Failed to fetch')
      
      // If timeout occurred, treat as actual error (not resumable)
      if (isAbortError && isTimeout) {
        console.error('[StudyToolsStore] Generation timed out after 90 seconds')
        
        // Clean up interval if it exists
        const currentState = get()
        const progressInterval = currentState.activeIntervals.get(generationId)
        if (progressInterval) {
          clearInterval(progressInterval)
          set(state => {
            const newActiveIntervals = new Map(state.activeIntervals)
            newActiveIntervals.delete(generationId)
            return { activeIntervals: newActiveIntervals }
          })
        }

        // Update placeholder to show timeout error
        const timeoutError = new Error(`${STUDY_TOOLS[type].name} generation timed out. The content may be too large or the service is experiencing high load. Please try with a smaller document or try again later.`)
        const translated = translateError(timeoutError, {
          source: 'study-tools',
          operation: 'generate',
          rawMessage: timeoutError.message,
          payload: { type, documentId, conversationId }
        })

        logError(timeoutError, {
          source: 'study-tools',
          operation: 'generate',
          rawMessage: timeoutError.message,
          payload: { type, documentId, conversationId }
        }, translated.userError)

        set(state => ({
          error: translated.userError.message,
          friendlyError: translated.userError,
          lastFailedGeneration: { type, documentId, conversationId, flashcardOptions, quizOptions, attempt: 1 },
          generatedContent: state.generatedContent.map(content =>
            content.id === placeholderContent.id
              ? { ...content, isGenerating: false, generationProgress: 0, statusMessage: undefined }
              : content
          )
        }))
        
        cleanupGeneration(generationId)
        return
      }

      // Handle navigation/refresh interruption (try to resume)
      if (isAbortError || isNetworkError) {
        console.warn('[StudyToolsStore] Generation interrupted (refresh/navigation). Preserving state and resuming...')

        startStatusPolling()

        set(state => {
          const newActiveGenerations = new Map(state.activeGenerations)
          const existingGeneration = newActiveGenerations.get(generationId) || activeGenerationRecord || {
            id: generationId,
            type,
            startTime,
            progress: placeholderContent.generationProgress ?? 0,
            status: 'starting',
            documentId: effectiveDocumentId,
            conversationId: effectiveConversationId,
            flashcardOptions
          }
          newActiveGenerations.set(generationId, {
            ...existingGeneration,
            status: 'generating'
          })

          const updatedContent = state.generatedContent.map(content =>
            content.id === generationId
              ? {
                  ...content,
                  isGenerating: true,
                  generationProgress: content.generationProgress ?? existingGeneration.progress ?? 0,
                  statusMessage: 'Resuming generation...'
                }
              : content
          )

          const pendingAlready = state.pendingGenerations.some(gen => gen.id === generationId)
          const nextPending = pendingAlready
            ? state.pendingGenerations
            : [...state.pendingGenerations, existingGeneration]

          return {
            activeGenerations: newActiveGenerations,
            generatedContent: updatedContent,
            pendingGenerations: nextPending,
            error: null,
            friendlyError: null,
            lastFailedGeneration: null
          }
        })

        return
      }

      // Clean up interval if it exists
      const currentState = get()
      const progressInterval = currentState.activeIntervals.get(generationId)
      if (progressInterval) {
        clearInterval(progressInterval)
        set(state => {
          const newActiveIntervals = new Map(state.activeIntervals)
          newActiveIntervals.delete(generationId)
          return { activeIntervals: newActiveIntervals }
        })
      }

      // Update placeholder to show error and remove from active generations
      const translated = translateError(error as ErrorInput, {
        source: 'study-tools',
        operation: 'generate',
        rawMessage: errorMessage,
        payload: {
          type,
          documentId,
          conversationId
        }
      })

      logError(error, {
        source: 'study-tools',
        operation: 'generate',
        rawMessage: errorMessage,
        payload: {
          type,
          documentId,
          conversationId
        }
      }, translated.userError)

      set(state => ({
        error: translated.userError.message,
        friendlyError: translated.userError,
        lastFailedGeneration: translated.isRetryable ? {
          type,
          documentId,
          conversationId,
          flashcardOptions,
          attempt: (get().lastFailedGeneration?.attempt ?? 0) + 1
        } : null,
        generatedContent: state.generatedContent.map(content =>
          content.id === generationId
            ? { ...content, isGenerating: false, statusMessage: translated.userError.message }
            : content
        )
      }))
      cleanupGeneration(generationId)

      // Also handle flashcard error cleanup
      if (type === 'flashcards') {
        const flashcardStoreHook = useFlashcardStoreRef ?? await ensureFlashcardStore()
        const flashcardStore = flashcardStoreHook.getState()
        const updatedSets = flashcardStore.flashcardSets.filter((set: FlashcardSet) => set.id !== generationId)
        flashcardStoreHook.setState({ flashcardSets: updatedSets })
      }

      // Also handle quiz error cleanup
      if (type === 'quiz') {
        try {
          const quizStoreHook = await loadQuizStore()
          const quizStore = quizStoreHook.getState()
          const updatedSets = quizStore.quizSets.filter((set: QuizSet) => set.id !== generationId)
          quizStoreHook.setState({ quizSets: updatedSets })
        } catch (quizCleanupError) {
          console.warn('[StudyToolsStore] Quiz cleanup error:', quizCleanupError)
        }
      }
    }
    // No finally block needed - cleanup is handled in try/catch
  },

  // Content management
  generatedContent: [],
  addGeneratedContent: (content: StudyToolContent) => {
    set(state => ({
      generatedContent: [content, ...state.generatedContent]
    }))
  },
  removeGeneratedContent: async (id: string) => {
    console.log('[StudyToolsStore] Removing generated content:', id)

    // Find the content to remove for potential rollback
    const currentState = get()
    const contentToRemove = currentState.generatedContent.find(content => content.id === id)

    if (!contentToRemove) {
      console.warn('[StudyToolsStore] Content not found in local state:', id)
      return
    }

    // Remove from local state immediately for responsive UI
    set(state => ({
      generatedContent: state.generatedContent.filter(content => content.id !== id)
    }))

    try {
      // Sync deletion with database
      const response = await fetch('/api/study-tools/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id })
      })

      console.log('[StudyToolsStore] Delete API response status:', response.status)

      // 404 is acceptable - item was never saved to database (e.g., failed generation)
      if (!response.ok && response.status !== 404) {
        const errorText = await response.text()
        console.error('[StudyToolsStore] Delete API error response:', errorText)
        throw new Error(`Failed to delete from database: ${response.status} - ${errorText}`)
      }

      if (response.status === 404) {
        console.log('[StudyToolsStore] Item not in database (likely failed generation) - deletion complete')
      } else {
        const result = await response.json()
        console.log('[StudyToolsStore] Successfully deleted from database:', result)
      }
    } catch (error) {
      console.error('[StudyToolsStore] Failed to sync deletion to database:', error)

      // Rollback: add the content back to local state since database deletion failed
      set(state => ({
        generatedContent: [contentToRemove, ...state.generatedContent].sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      }))

      // Re-throw error to allow UI to show error message if needed
      throw error
    }
  },
  renameGeneratedContent: (id: string, newTitle: string) => {
    set(state => ({
      generatedContent: state.generatedContent.map(content =>
        content.id === id ? { ...content, title: newTitle } : content
      )
    }))
  },
  clearGeneratedContent: () => {
    set({ generatedContent: [] })
  },

  // Database functions
  loadStudyToolsFromDatabase: async (documentId?: string, conversationId?: string) => {
    try {
      console.log('[StudyToolsStore] Loading study tools from database:', { documentId, conversationId })
      const cleanupGeneration = get()._cleanupGenerationTracking

      // Allow loading all user's study tools when no specific context is provided
      // This is used by dashboard to show all user's content
      const response = await fetch('/api/study-tools/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: documentId || undefined,
          conversationId: conversationId || undefined,
        }),
      })

      if (!response.ok) {
        // Gracefully handle 404 - user might not have any study tools yet
        if (response.status === 404) {
          console.log('[StudyToolsStore] No study tools found (404) - user may not have any content yet')
          return
        }

        // Log other errors but don't throw to avoid breaking the UI
        console.warn(`[StudyToolsStore] Failed to fetch study tools: ${response.status}`)
        return
      }

      const result = await response.json()
      console.log('[StudyToolsStore] Loaded study tools from database:', result)

      if (result.success && result.studyTools && result.studyTools.length > 0) {
        // Separate flashcards, quizzes from regular study tools
        const flashcards: StudyToolContent[] = []
        const quizzes: StudyToolContent[] = []
        const regularStudyTools: StudyToolContent[] = []

        result.studyTools.forEach((tool: StudyToolContent) => {
          if (tool.type === 'flashcards') {
            flashcards.push(tool)
          } else if (tool.type === 'quiz') {
            quizzes.push(tool)
          } else {
            regularStudyTools.push(tool)
          }
        })

        // Handle flashcards - route to flashcard store (keep existing behavior)
        if (flashcards.length > 0) {
          try {
            // Import flashcard store dynamically to avoid circular deps
            const { useFlashcardStore } = await import('@/lib/flashcard-store')

            // First, clean up any existing duplicates
            useFlashcardStore.getState().deduplicateFlashcardSets()

            const completedFlashcardIds: string[] = []

            for (const flashcardTool of flashcards) {
              try {
                // Parse the flashcard content
                const cleanedContent = flashcardTool.content
                  .trim()
                  .replace(/^```json\n?/, '')
                  .replace(/\n?```$/, '')
                  .trim()

                const parsedCards = JSON.parse(cleanedContent)

                if (Array.isArray(parsedCards)) {
                  const flashcardStoreState = useFlashcardStore.getState()
                  const existingSet = flashcardStoreState.flashcardSets.find(set => set.id === flashcardTool.id)

                  // Create flashcard set and add to flashcard store
                  const flashcardSet = {
                    id: flashcardTool.id,
                    title: flashcardTool.title,
                    cards: parsedCards,
                    options: { numberOfCards: 'standard' as const, difficulty: 'medium' as const },
                    createdAt: new Date(flashcardTool.createdAt),
                    documentId: flashcardTool.documentId,
                    conversationId: flashcardTool.conversationId,
                    metadata: {
                      totalCards: parsedCards.length,
                      avgDifficulty: 'medium',
                      generationTime: 0,
                      model: 'gemini-2.5-pro',
                      sourceContentLength: 0,
                      isGenerating: false,
                    generationProgress: 100,
                    statusMessage: undefined
                    }
                  }

                  // Add to flashcard store (will show up in flashcard list)
                  useFlashcardStore.getState().addFlashcardSet(flashcardSet)
                  if (existingSet?.metadata?.isGenerating) {
                    completedFlashcardIds.push(flashcardTool.id)
                  }
                  console.log('[StudyToolsStore] Added flashcard set to flashcard store:', flashcardTool.title)
                } else {
                  console.warn('[StudyToolsStore] Invalid flashcard format for:', flashcardTool.title)
                }
              } catch (parseError) {
                console.error('[StudyToolsStore] Failed to parse flashcard content:', parseError)
              }
            }

            if (completedFlashcardIds.length > 0) {
              completedFlashcardIds.forEach(id => {
                cleanupGeneration(id)
                get().enqueueAutoOpen(id, 'flashcards')
              })
            }
          } catch (importError) {
            console.error('[StudyToolsStore] Failed to import flashcard store:', importError)
          }
        }

        // Handle quizzes - route to quiz store
        if (quizzes.length > 0) {
          try {
            const { useQuizStore } = await import('@/lib/quiz-store')
            useQuizStore.getState().deduplicateQuizSets()

            const completedQuizIds: string[] = []

            for (const quizTool of quizzes) {
              try {
                const cleanedContent = quizTool.content
                  .trim()
                  .replace(/^```json\n?/, '')
                  .replace(/\n?```$/, '')
                  .trim()

                const parsedQuestions = JSON.parse(cleanedContent)

                if (Array.isArray(parsedQuestions)) {
                  const quizStoreState = useQuizStore.getState()
                  const existingSet = quizStoreState.quizSets.find(set => set.id === quizTool.id)

                  const quizSet: QuizSet = {
                    id: quizTool.id,
                    title: quizTool.title,
                    questions: parsedQuestions,
                    options: { numberOfQuestions: 'standard' as const, difficulty: 'medium' as const },
                    createdAt: new Date(quizTool.createdAt),
                    documentId: quizTool.documentId,
                    conversationId: quizTool.conversationId,
                    metadata: {
                      totalQuestions: parsedQuestions.length,
                      avgDifficulty: 'medium',
                      generationTime: 0,
                      model: 'gemini-3-flash',
                      sourceContentLength: 0,
                      isGenerating: false,
                      generationProgress: 100,
                      statusMessage: undefined
                    }
                  }

                  useQuizStore.getState().addQuizSet(quizSet)
                  if (existingSet?.metadata?.isGenerating) {
                    completedQuizIds.push(quizTool.id)
                  }
                  console.log('[StudyToolsStore] Added quiz set to quiz store:', quizTool.title)
                }
              } catch (parseError) {
                console.error('[StudyToolsStore] Failed to parse quiz content:', parseError)
              }
            }

            if (completedQuizIds.length > 0) {
              completedQuizIds.forEach(id => {
                cleanupGeneration(id)
                get().enqueueAutoOpen(id, 'quiz')
              })
            }
          } catch (importError) {
            console.error('[StudyToolsStore] Failed to import quiz store:', importError)
          }
        }

        // Handle regular study tools - add or update generatedContent
        if (regularStudyTools.length > 0) {
          const normalizedTools = regularStudyTools.map(tool => ({
            ...tool,
            createdAt: tool.createdAt instanceof Date ? tool.createdAt : new Date(tool.createdAt),
            isGenerating: false,
            generationProgress: 100,
            statusMessage: undefined
          }))

          const completedIds: string[] = []

          set(state => {
            let updatedContent = [...state.generatedContent]

            normalizedTools.forEach(tool => {
              const existingIndex = updatedContent.findIndex(content => content.id === tool.id)

              if (existingIndex >= 0) {
                const existing = updatedContent[existingIndex]
                updatedContent[existingIndex] = {
                  ...existing,
                  ...tool
                }

                if (existing.isGenerating || (existing.generationProgress ?? 0) < 100) {
                  completedIds.push(tool.id)
                }
              } else {
                updatedContent = [tool, ...updatedContent]
              }
            })

            return {
              generatedContent: updatedContent
            }
          })

          if (completedIds.length > 0) {
            completedIds.forEach(id => {
              cleanupGeneration(id)
              const content = get().generatedContent.find(entry => entry.id === id)
              if (content) {
                get().enqueueAutoOpen(content.id, content.type)
              }
            })
          }

          console.log('[StudyToolsStore] Successfully merged', normalizedTools.length, 'regular study tools from database')
        }

        // Ensure flashcards and quizzes are not in generatedContent (they have their own stores)
        set(state => ({
          generatedContent: state.generatedContent.filter(content => content.type !== 'flashcards' && content.type !== 'quiz')
        }))

        console.log('[StudyToolsStore] Processed', flashcards.length, 'flashcards,', quizzes.length, 'quizzes, and', regularStudyTools.length, 'regular study tools')
      } else {
        console.log('[StudyToolsStore] No study tools found in database')
      }

    } catch (error) {
      console.error('[StudyToolsStore] Failed to load study tools from database:', error)
    }
  },

  // Export functions
  copyToClipboard: async (content: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(content)
      return true
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      return false
    }
  },

  downloadAsPDF: async (content: StudyToolContent): Promise<void> => {
    if (content.type === 'flashcards') {
      console.warn('[StudyToolsStore] Flashcards do not support PDF export')
      throw new Error('Flashcards cannot be exported as PDF.')
    }

    try {
      const pdfMakeModule = await import('pdfmake/build/pdfmake')
      const pdfFontsModule = await import('pdfmake/build/vfs_fonts')
      const { marked } = await import('marked')

      interface PdfMakeStatic {
        vfs: Record<string, string>
        createPdf: (definition: PdfDocumentDefinition) => { download: (fileName?: string) => void }
      }

      type TextFragment =
        | string
        | {
            text: string
            bold?: boolean
            italics?: boolean
            color?: string
            link?: string
            background?: string
          }

      type PdfContent = Record<string, unknown>

      interface PdfDocumentDefinition {
        content: PdfContent[]
        styles?: Record<string, Record<string, unknown>>
        defaultStyle?: Record<string, unknown>
        pageMargins?: [number, number, number, number]
        info?: { title?: string }
      }

      const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as PdfMakeStatic
      const fontsSource = (pdfFontsModule as Record<string, unknown>).default ?? pdfFontsModule
      const virtualFileSystem =
        (fontsSource as { pdfMake?: { vfs?: Record<string, string> }; vfs?: Record<string, string> }).pdfMake?.vfs ??
        (fontsSource as { vfs?: Record<string, string> }).vfs ??
        (fontsSource as Record<string, string>)

      pdfMake.vfs = virtualFileSystem

      const tool = STUDY_TOOLS[content.type]
      const createdAt = content.createdAt

      const sanitizeIntro = (value: string): string => {
        const patterns: RegExp[] = [
          /^Of course[.,]?\s*/i,
          /^Here\s+(?:is|are)\s+(?:a|an|the|some)?\s*(?:comprehensive|detailed|smart)?\s*[^.]*?\s*on\s+the\s*["'""']?[^"'""']*?["'""']?[^.]*?[.,*]\s*/i,
          /^Here\s+are\s+comprehensive\s+smart\s+notes\s+on\s+the\s+["'""'][^"'""']*["'""']\s+syllabus[.,*\s]*/i,
          /^Here\s+(?:is|are)\s+[^.]*?(?:notes|summary|guide|analysis)[^.]*?[.,*]\s*/i,
          /^I'll\s+(?:create|provide|generate)\s+[^.]*?[.,]\s*/i,
          /^(?:Certainly|Absolutely|Sure)[.,]?\s*/i,
          /created\s+using\s+the\s+[^.]*?methodology[.,]?\s*/i,
          /^(?:Let me|I'd be happy to)\s+[^.]*?[.,]\s*/i
        ]

        let cleaned = value
        for (const pattern of patterns) {
          cleaned = cleaned.replace(pattern, '')
        }
        return cleaned.replace(/^[\s*]+/, '').trim()
      }

      const EMOJI_COLON_REPLACEMENTS: Record<string, string> = {
        white_check_mark: 'Yes',
        heavy_check_mark: 'Yes',
        check_mark: 'Yes',
        ballot_box_with_check: 'Yes',
        x: 'No',
        heavy_multiplication_x: 'No',
        warning: 'Warning:',
        star: 'Highlight:',
        sparkles: 'Highlight:',
        fire: 'Hot:',
        rocket: 'Launch:',
        brain: 'Insight:',
        bulb: 'Idea:',
        idea: 'Idea:',
        dart: 'Goal:',
        link: 'Link:',
        paperclip: 'Link:',
        pushpin: '•',
        round_pushpin: '•',
        memo: 'Notes:',
        books: 'Reference:',
        book: 'Reference:',
        bookmark_tabs: 'Reference:',
        graduation_cap: 'Education:',
        key: 'Key:',
        muscle: 'Strength:',
        puzzle_piece: 'Puzzle:'
      }

      const replaceEmojiMarkup = (value: string): string =>
        value.replace(/:([a-z0-9_+-]+):/gi, (match, code) => {
          const normalized = code.toLowerCase() as keyof typeof EMOJI_COLON_REPLACEMENTS
          return EMOJI_COLON_REPLACEMENTS[normalized] ?? match
        })

      const cleanedContent = tightenMarkdownEmphasis(replaceEmojiMarkup(sanitizeIntro(content.content)))
      const tokens = marked.lexer(cleanedContent) as Tokens.Generic[]

      const lexInlineTokens = (rawText: string): Tokens.Generic[] =>
        rawText ? ((marked.Lexer.lexInline(rawText) as Tokens.Generic[]) ?? []) : []

      const EMOJI_CHAR_REPLACEMENTS: Record<string, string> = {
        '✅': 'Yes',
        '☑️': 'Yes',
        '✔️': 'Yes',
        '☑': 'Yes',
        '✔': 'Yes',
        '❌': 'No',
        '✖️': 'No',
        '✘': 'No',
        '⚠️': 'Warning:',
        '⚠': 'Warning:',
        '⭐️': 'Highlight:',
        '🌟': 'Highlight:',
        '✨': 'Highlight:',
        '➡️': '->',
        '➔': '->',
        '➜': '->',
        '👉': '->',
        '🔗': 'Link:',
        '💡': 'Idea:',
        '🔥': 'Hot:',
        '🎯': 'Goal:',
        '📌': '•',
        '📍': '•',
        '🚀': 'Launch:',
        '🎓': 'Education:',
        '🧠': 'Insight:',
        '📘': 'Reference:',
        '📚': 'Reference:',
        '📝': 'Notes:',
        '🔑': 'Key:',
        '💪': 'Strength:',
        '🧩': 'Puzzle:'
      }

      const normalizeGlyphs = (value: string): string => {
        if (!value) return ''
        const withoutSelectors = value.replace(/[\uFE0E\uFE0F]/g, '')

        let normalized = ''
        let skipNextSpace = false
        for (const char of Array.from(withoutSelectors)) {
          const replacement = EMOJI_CHAR_REPLACEMENTS[char]
          if (replacement) {
            normalized += replacement
            skipNextSpace = false
            continue
          }

          const codePoint = char.codePointAt(0) ?? 0
          if (codePoint >= 0x1f000) {
            skipNextSpace = true
            continue
          }
          if (skipNextSpace && char === ' ') {
            skipNextSpace = false
            continue
          }
          skipNextSpace = false
          normalized += char
        }
        return normalized
      }

      const normalizeFragment = (fragment: TextFragment): TextFragment | null => {
        if (typeof fragment === 'string') {
          const text = normalizeGlyphs(fragment)
          return text ? text : null
        }
        const text = normalizeGlyphs(fragment.text)
        if (!text) return null
        return { ...fragment, text }
      }

      const finalizeFragments = (fragments: TextFragment[]): TextFragment[] =>
        fragments
          .map(normalizeFragment)
          .filter((fragment): fragment is TextFragment => fragment !== null)

      type TableRowTokens = Tokens.Table['rows'][number]
      type TableCellTokens = Tokens.TableCell

      const buildInline = (inlineTokens?: Tokens.Generic[], fallbackText = ''): TextFragment[] => {
        const tokensToProcess = inlineTokens && inlineTokens.length > 0 ? inlineTokens : lexInlineTokens(fallbackText)
        if (tokensToProcess.length === 0) return []
        const fragments: TextFragment[] = []

        tokensToProcess.forEach(inlineToken => {
          switch (inlineToken.type) {
            case 'text': {
              const textToken = inlineToken as Tokens.Text
              fragments.push(textToken.text ?? '')
              break
            }
            case 'strong': {
              const strongToken = inlineToken as Tokens.Strong
              finalizeFragments(
                buildInline(strongToken.tokens as Tokens.Generic[] | undefined, strongToken.text ?? '')
              ).forEach(fragment => {
                fragments.push(
                  typeof fragment === 'string'
                    ? { text: fragment, bold: true }
                    : { ...fragment, bold: true }
                )
              })
              break
            }
            case 'em': {
              const emphasisToken = inlineToken as Tokens.Em
              finalizeFragments(
                buildInline(emphasisToken.tokens as Tokens.Generic[] | undefined, emphasisToken.text ?? '')
              ).forEach(fragment => {
                fragments.push(
                  typeof fragment === 'string'
                    ? { text: fragment, italics: true }
                    : { ...fragment, italics: true }
                )
              })
              break
            }
            case 'codespan': {
              const codeToken = inlineToken as Tokens.Codespan
              if (codeToken.text) {
                fragments.push({
                  text: codeToken.text,
                  color: '#0f172a',
                  background: '#f1f5f9'
                })
              }
              break
            }
            case 'link': {
              const linkToken = inlineToken as Tokens.Link
              const nested = finalizeFragments(
                buildInline(linkToken.tokens as Tokens.Generic[] | undefined, linkToken.text ?? '')
              )
              nested.forEach(fragment => {
                const linkTarget = linkToken.href ?? ''
                fragments.push(
                  typeof fragment === 'string'
                    ? { text: fragment, link: linkTarget, color: '#0ea5e9' }
                    : { ...fragment, link: linkTarget, color: '#0ea5e9' }
                )
              })
              break
            }
            case 'br':
              fragments.push('\n')
              break
            case 'escape': {
              const escapeToken = inlineToken as Tokens.Escape
              fragments.push(escapeToken.text ?? '')
              break
            }
            default:
              if ('text' in inlineToken) {
                const genericText = inlineToken as Tokens.Text
                if (genericText.text) {
                  fragments.push(genericText.text)
                }
              }
          }
        })

        return finalizeFragments(fragments)
      }

      const resolveAlignment = (value?: string | null): 'left' | 'center' | 'right' => {
        if (value === 'center' || value === 'right') {
          return value
        }
        return 'left'
      }

      const buildContent = (tokenList: Tokens.Generic[]): PdfContent[] => {
        const sections: PdfContent[] = []

        tokenList.forEach(token => {
          switch (token.type) {
            case 'space':
              break
            case 'heading': {
              const headingToken = token as Tokens.Heading
              const inline = buildInline(
                headingToken.tokens as Tokens.Generic[] | undefined,
                headingToken.text ?? ''
              )
              sections.push({
                text: inline.length > 0 ? inline : normalizeGlyphs(headingToken.text ?? ''),
                style: `h${Math.min(headingToken.depth, 4)}`
              })
              break
            }
            case 'paragraph': {
              const paragraphToken = token as Tokens.Paragraph
              const inline = buildInline(
                paragraphToken.tokens as Tokens.Generic[] | undefined,
                paragraphToken.text ?? ''
              )
              sections.push({
                text: inline.length > 0 ? inline : normalizeGlyphs(paragraphToken.text ?? ''),
                style: 'paragraph',
                margin: [0, 0, 0, 10]
              })
              break
            }
            case 'list': {
              const listToken = token as Tokens.List
              const items = listToken.items.map((item: Tokens.ListItem) => {
                const itemBlocks = buildContent((item.tokens as Tokens.Generic[] | undefined) ?? [])
                if (itemBlocks.length === 0) {
                  const fallbackInline = buildInline(undefined, item.text ?? '')
                  if (fallbackInline.length === 0) {
                    const fallbackText = normalizeGlyphs(item.text ?? '')
                    return fallbackText ? { text: fallbackText, style: 'paragraph', margin: [0, 0, 0, 4] } : ''
                  }
                  return {
                    text: fallbackInline,
                    style: 'paragraph',
                    margin: [0, 0, 0, 4]
                  }
                }
                if (itemBlocks.length === 1) {
                  return itemBlocks[0]
                }
                return { stack: itemBlocks, margin: [0, 0, 0, 4] }
              })

              sections.push(
                listToken.ordered
                  ? { ol: items, style: 'list', margin: [0, 4, 0, 10] }
                  : { ul: items, style: 'list', margin: [0, 4, 0, 10] }
              )
              break
            }
            case 'blockquote': {
              const blockquoteToken = token as Tokens.Blockquote
              const blockquoteBody = buildContent((blockquoteToken.tokens as Tokens.Generic[] | undefined) ?? [])
              sections.push({
                table: {
                  widths: ['*'],
                  body: [
                    [
                      {
                        stack: blockquoteBody,
                        border: [false, false, false, false],
                        margin: [12, 8, 12, 8],
                        fillColor: '#f8fafc'
                      }
                    ]
                  ]
                },
                layout: {
                  paddingLeft: () => 0,
                  paddingRight: () => 0,
                  paddingTop: () => 0,
                  paddingBottom: () => 0,
                  hLineWidth: () => 0,
                  vLineWidth: (index: number) => (index === 0 ? 3 : 0),
                  vLineColor: () => '#38bdf8'
                },
                margin: [0, 12, 0, 12]
              })
              break
            }
            case 'table': {
              const tableToken = token as Tokens.Table
              const columnCount = Math.max(
                tableToken.header.length,
                ...tableToken.rows.map(row => row.length)
              )
              const isWideTable = columnCount >= 5

              const fragmentsToPlainText = (fragments: TextFragment[]): string =>
                fragments.map(fragment => (typeof fragment === 'string' ? fragment : fragment.text ?? '')).join('')

              const createCheckMarkGraphic = (compact: boolean): PdfContent => ({
                alignment: 'center',
                margin: compact ? [0, 1.5, 0, 1.5] : [0, 2.5, 0, 2.5],
                stack: [
                  {
                    canvas: [
                      {
                        type: 'polyline',
                        points: [
                          { x: 0, y: compact ? 5 : 6 },
                          { x: compact ? 3 : 4, y: compact ? 7 : 9 },
                          { x: compact ? 8 : 12, y: 0 }
                        ],
                        lineWidth: compact ? 1 : 1.4,
                        lineColor: '#0f172a'
                      }
                    ]
                  }
                ]
              })

              const createTableCellContent = (
                fragments: TextFragment[],
                rawText: string,
                alignment: 'left' | 'center' | 'right',
                compact: boolean,
                isHeader = false
              ): PdfContent => {
                const normalizedRaw = normalizeGlyphs(rawText)
                const fragmentsText = fragments.length > 0 ? normalizeGlyphs(fragmentsToPlainText(fragments)) : normalizedRaw
                const trimmed = fragmentsText.trim().toLowerCase()

                const positiveMarks = new Set(['[x]', 'x', '✓', 'yes', 'done'])
                if (positiveMarks.has(trimmed)) {
                  return createCheckMarkGraphic(compact)
                }

                if (trimmed === '[ ]' || trimmed === '') {
                  return {
                    text: '',
                    alignment,
                    margin: compact ? [6, 2, 6, 2] : [8, 3, 8, 3]
                  }
                }

                const styleName = isHeader
                  ? (compact ? 'tableHeaderCompact' : 'tableHeader')
                  : (compact ? 'tableCellCompact' : 'tableCell')

                const margin = compact
                  ? (isHeader ? [6, 4, 6, 4] : [6, 2, 6, 2])
                  : (isHeader ? [8, 6, 8, 6] : [8, 4, 8, 4])

                const fragmentContent = fragments.length > 0 ? fragments : fragmentsText

                if (typeof fragmentContent === 'string' && fragmentContent.startsWith('•') && fragmentContent.length > 1) {
                  return {
                    columns: [
                      { text: '•', width: compact ? 10 : 12, alignment: 'center' },
                      {
                        text: fragmentContent.slice(1).trimStart(),
                        alignment,
                        style: styleName,
                        margin
                      }
                    ],
                    columnGap: compact ? 2 : 4
                  }
                }

                return {
                  text: fragmentContent,
                  style: styleName,
                  alignment,
                  margin
                }
              }

              const widths: Array<number | '*'> = (() => {
                if (columnCount <= 0) return ['*']
                if (!isWideTable) {
                  return Array.from({ length: columnCount }, () => '*') as Array<number | '*'>
                }

                const printableWidth = 480
                const firstColumnWidth = Math.max(84, Math.floor(printableWidth * 0.2))
                const lastColumnWidth = Math.max(140, Math.floor(printableWidth * 0.3))
                const middleColumnCount = Math.max(columnCount - 2, 1)
                const remainingWidth = Math.max(printableWidth - firstColumnWidth - lastColumnWidth, middleColumnCount * 32)
                const middleColumnWidth = Math.max(Math.floor(remainingWidth / middleColumnCount), 40)

                const computed: number[] = [firstColumnWidth]
                for (let i = 0; i < middleColumnCount; i += 1) {
                  computed.push(middleColumnWidth)
                }
                computed.push(lastColumnWidth)

                const assignedWidth = computed.reduce((sum, value) => sum + value, 0)
                const diff = printableWidth - assignedWidth
                if (diff !== 0) {
                  const perColumn = Math.trunc(diff / computed.length)
                  let remainder = diff - perColumn * computed.length
                  computed.forEach((value, index) => {
                    let adjusted = value + perColumn
                    if (remainder !== 0) {
                      adjusted += remainder > 0 ? 1 : -1
                      remainder += remainder > 0 ? -1 : 1
                    }
                    computed[index] = Math.max(40, adjusted)
                  })
                }

                return computed
              })()

              const tableLayout: Record<string, unknown> = {
                fillColor: (rowIndex: number) => {
                  if (rowIndex === 0) return '#f8fafc'
                  if (!isWideTable) return undefined
                  return rowIndex % 2 === 0 ? '#f9fafb' : undefined
                },
                hLineWidth: (index: number, node: { table: { body: unknown[][] } }) =>
                  index === 0 || index === node.table.body.length ? 1 : 0.5,
                vLineWidth: () => 0.5,
                hLineColor: () => '#d1d5db',
                vLineColor: () => '#e5e7eb',
                paddingTop: () => (isWideTable ? 2 : 6),
                paddingBottom: () => (isWideTable ? 2 : 6),
                paddingLeft: () => (isWideTable ? 3 : 8),
                paddingRight: () => (isWideTable ? 3 : 8)
              }

              const headerRow = tableToken.header.map((cell: TableCellTokens, columnIndex: number) => {
                const fragments = buildInline(cell.tokens as Tokens.Generic[] | undefined, cell.text ?? '')
                return createTableCellContent(
                  fragments,
                  cell.text ?? '',
                  resolveAlignment(tableToken.align?.[columnIndex] ?? 'center'),
                  isWideTable,
                  true
                )
              })

              const bodyRows = tableToken.rows.map((row: TableRowTokens) =>
                row.map((cell: TableCellTokens, columnIndex: number) => {
                  const fragments = buildInline(cell.tokens as Tokens.Generic[] | undefined, cell.text ?? '')
                  return createTableCellContent(
                    fragments,
                    cell.text ?? '',
                    resolveAlignment(tableToken.align?.[columnIndex] ?? 'center'),
                    isWideTable,
                    false
                  )
                })
              )

              sections.push({
                table: {
                  widths,
                  body: [headerRow, ...bodyRows],
                  headerRows: 1
                },
                layout: tableLayout,
                margin: [0, 12, 0, isWideTable ? 16 : 18],
                dontBreakRows: false,
                keepWithHeaderRows: 1
              })
              break
            }
            case 'code':
              sections.push({
                text: normalizeGlyphs((token as Tokens.Code).text ?? ''),
                style: 'codeBlock',
                margin: [0, 8, 0, 12]
              })
              break
            case 'text': {
              const textToken = token as Tokens.Text
              const inline = buildInline(textToken.tokens as Tokens.Generic[] | undefined, textToken.text ?? '')
              const textContent = inline.length > 0 ? inline : normalizeGlyphs(textToken.text ?? '')
              if (typeof textContent === 'string' && !textContent.trim()) {
                break
              }
              sections.push({
                text: textContent,
                style: 'paragraph',
                margin: [0, 0, 0, 8]
              })
              break
            }
            case 'hr':
              sections.push({
                canvas: [
                  {
                    type: 'line',
                    x1: 0,
                    y1: 0,
                    x2: 515,
                    y2: 0,
                    lineWidth: 1,
                    lineColor: '#e2e8f0'
                  }
                ],
                margin: [0, 14, 0, 14]
              })
              break
            default:
              break
          }
        })

        return sections
      }

      const bodyContent = buildContent(tokens)
      const headerContent: PdfContent = {
        stack: [
          { text: tool.name.toUpperCase(), style: 'toolLabel' },
          { text: content.title, style: 'title' },
          {
            columns: [
              {
                text: createdAt.toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                }),
                style: 'meta'
              },
              {
                text: `Generated at ${createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                style: 'meta',
                alignment: 'right'
              }
            ],
            margin: [0, 6, 0, 12]
          }
        ],
        margin: [0, 0, 0, 12]
      }

      const descriptorContent: PdfContent = {
        text: `Crafted by CogniLeapAI • ${tool.description}`,
        style: 'descriptor',
        margin: [0, 0, 0, 18]
      }

      const documentDefinition: PdfDocumentDefinition = {
        info: {
          title: content.title
        },
        content: [headerContent, descriptorContent, ...bodyContent],
        styles: {
          title: { fontSize: 20, bold: true, color: '#0f172a', margin: [0, 4, 0, 0] },
          toolLabel: { fontSize: 9, bold: true, color: '#0f172a', letterSpacing: 1.2 },
          meta: { fontSize: 9, color: '#64748b' },
          descriptor: { fontSize: 10, color: '#475569' },
          paragraph: { fontSize: 11, lineHeight: 1.55, color: '#0f172a' },
          list: { fontSize: 11, lineHeight: 1.5, color: '#0f172a' },
          h1: { fontSize: 18, bold: true, color: '#0f172a', margin: [0, 18, 0, 8] },
          h2: { fontSize: 16, bold: true, color: '#0f172a', margin: [0, 16, 0, 6] },
          h3: { fontSize: 14, bold: true, color: '#0f172a', margin: [0, 14, 0, 5] },
          h4: { fontSize: 12, bold: true, color: '#0f172a', margin: [0, 12, 0, 4] },
          codeBlock: {
            fontSize: 10,
            color: '#0f172a',
            fillColor: '#f1f5f9',
            margin: [0, 8, 0, 12],
            alignment: 'left'
          },
          blockquoteText: { fontSize: 11, italics: true, color: '#0f172a', lineHeight: 1.5 },
          tableHeader: { fontSize: 11, bold: true, color: '#0f172a' },
          tableHeaderCompact: { fontSize: 9, bold: true, color: '#0f172a' },
          tableCell: { fontSize: 11, color: '#0f172a', lineHeight: 1.45 },
          tableCellCompact: { fontSize: 9, color: '#0f172a', lineHeight: 1.35 }
        },
        defaultStyle: {
          fontSize: 11,
          color: '#0f172a',
          lineHeight: 1.55
        },
        pageMargins: [48, 56, 48, 56]
      }

      const safeFileName = `${content.title.replace(/[^a-zA-Z0-9\s]/g, '_').replace(/\s+/g, '_')}.pdf`
      pdfMake.createPdf(documentDefinition).download(safeFileName)

    } catch (error) {
      console.error('Failed to download PDF:', error)
      throw error
    }
  },

  downloadAsDOCX: async (content: StudyToolContent): Promise<void> => {
    const cleanupPatterns = [
      /^Of course[.,]?\s*/i,
      /^Here\s+(?:is|are)\s+(?:a|an|the|some)?\s*(?:comprehensive|detailed|smart)?\s*[^.]*?\s*on\s+the\s*["'""']?[^"'""']*?["'""']?[^.]*?[.,*]\s*/i,
      /^Here\s+are\s+comprehensive\s+smart\s+notes\s+on\s+the\s+["'""'][^"'""']*["'""']\s+syllabus[.,*\s]*/i,
      /^Here\s+(?:is|are)\s+[^.]*?(?:notes|summary|guide|analysis)[^.]*?[.,*]\s*/i,
      /^I'll\s+(?:create|provide|generate)\s+[^.]*?[.,]\s*/i,
      /^(?:Certainly|Absolutely|Sure)[.,]?\s*/i,
      /created\s+using\s+the\s+[^.]*?methodology[.,]?\s*/i,
      /^(?:Let me|I'd be happy to)\s+[^.]*?[.,]\s*/i
    ]

    try {
      const [docxModule, markedModule, fileSaverModule] = await Promise.all([
        import('docx'),
        import('marked'),
        import('file-saver')
      ])

      const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        AlignmentType,
        HeadingLevel,
        ShadingType,
        Table,
        TableRow,
        TableCell,
        WidthType,
        BorderStyle,
        LevelFormat
      } = docxModule
      const { marked } = markedModule
      const saveAs = fileSaverModule.default || fileSaverModule.saveAs

      const FONT_SIZES = {
        title: 36,
        heading1: 36,
        heading2: 30,
        heading3: 26,
        heading4: 24,
        heading5: 24,
        paragraph: 24,
        listOrderedLevel0: 26,
        listOrderedLevel1: 24,
        listOrderedLevelN: 24,
        listBulletLevel0: 24,
        listBulletLevel1: 24,
        listBulletLevelN: 24,
        tableHeader: 24,
        tableCell: 24,
        blockquote: 24,
        code: 24
      } as const

      const toolThemes: Record<StudyToolType, { accent: string; bannerFill: string; description: string; emoji: string }> = {
        'smart-notes': { accent: '7C3AED', bannerFill: 'F3E8FF', description: 'Organized notes with highlights and key insights', emoji: '📝' },
        'smart-summary': { accent: 'F59E0B', bannerFill: 'FEF3C7', description: 'Concise overview with essential takeaways', emoji: '⚡' },
        'study-guide': { accent: '0F766E', bannerFill: 'D1FAE5', description: 'Comprehensive study guide with structured learning path', emoji: '📖' },
        'flashcards': { accent: '0EA5E9', bannerFill: 'CFFAFE', description: 'Interactive flashcards — explore key questions and answers', emoji: '📚' }
      }

      const theme = toolThemes[content.type] ?? toolThemes['study-guide']

      let cleanedContent = content.content
      for (const pattern of cleanupPatterns) {
        cleanedContent = cleanedContent.replace(pattern, '')
      }
      cleanedContent = cleanedContent.replace(/^[\s*]+/, '').trim()

      type GenericToken = ReturnType<typeof marked.lexer>[number]
      type ListToken = GenericToken & { type: 'list'; ordered: boolean; items: Array<GenericToken & { tokens?: GenericToken[]; text?: string }> }
      type TableToken = GenericToken & { type: 'table'; header: { text: string }[]; rows: { text: string }[][] }

      const tokens = marked.lexer(cleanedContent, { gfm: true }) as GenericToken[]

      type TokenWithOptionalText = { text?: string }
      type TokenWithOptionalTokens = { tokens?: GenericToken[] }

      const hasText = (token: GenericToken | undefined): token is GenericToken & { text: string } =>
        !!token && typeof (token as TokenWithOptionalText).text === 'string'

      const textOrEmpty = (token: GenericToken | undefined): string => (hasText(token) ? token.text : '')

      const getTokens = (token: GenericToken | undefined): GenericToken[] => {
        if (!token) return []
        const possible = (token as TokenWithOptionalTokens).tokens
        return Array.isArray(possible) ? possible : []
      }

      interface NumberingLevelConfiguration {
        level: number
        format: (typeof LevelFormat)[keyof typeof LevelFormat]
        text: string
        alignment: (typeof AlignmentType)[keyof typeof AlignmentType]
        style: {
          paragraph: { indent: { left: number; hanging: number } }
          run: { size: number }
        }
      }

      const docChildren: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = []
      const numberingConfigs: Array<{ reference: string; levels: NumberingLevelConfiguration[] }> = []
      let listCounter = 0

      const lexInline = (text: string): GenericToken[] => {
        const lexer = marked.Lexer as unknown as { lexInline: (src: string) => GenericToken[] }
        return lexer.lexInline(text)
      }

      const createRuns = (
        inlineTokens: GenericToken[] | undefined,
        fontSize: number,
        opts: { bold?: boolean; italics?: boolean } = {}
      ): InstanceType<typeof TextRun>[] => {
        const runs: InstanceType<typeof TextRun>[] = []
        if (!inlineTokens) return runs

        const applyText = (text: string, bold: boolean, italics: boolean) => {
          const segments = text.split('\n')
          segments.forEach((segment, idx) => {
            if (segment.length > 0) {
              runs.push(new TextRun({ text: segment, bold, italics, size: fontSize, color: '000000' }))
            }
            if (idx < segments.length - 1) {
              runs.push(new TextRun({ break: 1 }))
            }
          })
        }

        const walk = (tokensToWalk: GenericToken[], context: { bold: boolean; italics: boolean }) => {
          for (const token of tokensToWalk) {
            switch (token.type) {
              case 'text': {
                const textContent = textOrEmpty(token)
                const inlineTokens = lexInline(textContent)
                if (
                  inlineTokens.length === 1 &&
                  inlineTokens[0].type === 'text' &&
                  textOrEmpty(inlineTokens[0]) === textContent
                ) {
                  applyText(textContent, context.bold, context.italics)
                } else {
                  walk(inlineTokens, context)
                }
                break
              }
              case 'strong': {
                const childTokens = getTokens(token)
                const nextTokens = childTokens.length > 0 ? childTokens : lexInline(textOrEmpty(token))
                walk(nextTokens, { bold: true, italics: context.italics })
                break
              }
              case 'em': {
                const childTokens = getTokens(token)
                const nextTokens = childTokens.length > 0 ? childTokens : lexInline(textOrEmpty(token))
                walk(nextTokens, { bold: context.bold, italics: true })
                break
              }
              case 'codespan': {
                const codeText = textOrEmpty(token)
                if (codeText) {
                  applyText(codeText, context.bold, context.italics)
                }
                break
              }
              case 'link': {
                const linkText = textOrEmpty(token)
                if (linkText) {
                  applyText(linkText, context.bold, context.italics)
                }
                break
              }
              case 'br':
                runs.push(new TextRun({ break: 1 }))
                break
              default: {
                const fallback = textOrEmpty(token)
                if (fallback) {
                  applyText(fallback, context.bold, context.italics)
                }
                break
              }
            }
          }
        }

        walk(inlineTokens, { bold: !!opts.bold, italics: !!opts.italics })
        return runs
      }

      const listFontSizeFor = (level: number, ordered: boolean): number => {
        if (ordered) {
          if (level <= 0) return FONT_SIZES.listOrderedLevel0
          if (level === 1) return FONT_SIZES.listOrderedLevel1
          return FONT_SIZES.listOrderedLevelN
        }

        if (level <= 0) return FONT_SIZES.listBulletLevel0
        if (level === 1) return FONT_SIZES.listBulletLevel1
        return FONT_SIZES.listBulletLevelN
      }

      const registerListReference = (ordered: boolean) => {
        const reference = `${ordered ? 'ordered' : 'bullet'}-list-${++listCounter}`
        const glyphs = ['•', '◦', '▪', '·']
        numberingConfigs.push({
          reference,
          levels: Array.from({ length: 6 }).map((_, level) => ({
            level,
            format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
            text: ordered ? `%${level + 1}.` : glyphs[Math.min(level, glyphs.length - 1)],
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 720 * (level + 1), hanging: 360 }
              },
              run: {
                size: listFontSizeFor(level, ordered)
              }
            }
          }))
        })
        return reference
      }

      const convertList = (
        listToken: ListToken,
        level = 0,
        reference?: string,
        referenceOrdered?: boolean
      ): InstanceType<typeof Paragraph>[] => {
        const listReference =
          reference && referenceOrdered === listToken.ordered
            ? reference
            : registerListReference(listToken.ordered)
        const result: InstanceType<typeof Paragraph>[] = []

        listToken.items.forEach((item) => {
          const inlineTokens: GenericToken[] = []
          const nestedLists: ListToken[] = []

          for (const child of item.tokens ?? []) {
            if (child.type === 'list') {
              nestedLists.push(child as ListToken)
            } else if (child.type !== 'space') {
              inlineTokens.push(child)
            }
          }

          const itemText = 'text' in item && typeof item.text === 'string' ? item.text : ''

          if (inlineTokens.length === 0 && itemText) {
            inlineTokens.push(...lexInline(itemText))
          }

          const fontSize = listFontSizeFor(level, listToken.ordered)
          const runs = createRuns(inlineTokens, fontSize)
          if (runs.length === 0) {
            runs.push(new TextRun({ text: itemText, size: fontSize }))
          }

          result.push(new Paragraph({
            children: runs,
            numbering: {
              reference: listReference,
              level: Math.min(level, 5)
            },
            spacing: { before: 80, after: 80 }
          }))

          nestedLists.forEach((nested) => {
            result.push(
              ...convertList(
                nested,
                Math.min(level + 1, 5),
                nested.ordered === listToken.ordered ? listReference : undefined,
                nested.ordered === listToken.ordered ? listToken.ordered : undefined
              )
            )
          })
        })

        return result
      }

      const createHeadingParagraph = (token: GenericToken & { depth: number }) => {
        const level = Math.min(token.depth ?? 1, 5)
        const inlineTokens = getTokens(token)
        const sizeMap: Record<number, number> = {
          1: FONT_SIZES.heading1,
          2: FONT_SIZES.heading2,
          3: FONT_SIZES.heading3,
          4: FONT_SIZES.heading4,
          5: FONT_SIZES.heading5
        }
        const runs = createRuns(inlineTokens, sizeMap[level], { bold: true })
        const headingText = textOrEmpty(token)
        if (runs.length === 0 && headingText) {
          runs.push(new TextRun({ text: headingText, bold: true, size: sizeMap[level] }))
        }
        const headingLevel = level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4
        return new Paragraph({
          children: runs,
          heading: headingLevel,
          spacing: { before: 200, after: 140 }
        })
      }

      const createParagraph = (token: GenericToken) => {
        const runs = createRuns(getTokens(token), FONT_SIZES.paragraph)
        return new Paragraph({
          children: runs,
          spacing: { before: 120, after: 120 },
          alignment: AlignmentType.JUSTIFIED
        })
      }

      const createTable = (token: TableToken) => {
        const headerRow = new TableRow({
          tableHeader: true,
          children: token.header.map((cell) => new TableCell({
            children: [
              new Paragraph({
                children: createRuns(lexInline(cell.text), FONT_SIZES.tableHeader, { bold: true }),
                alignment: AlignmentType.CENTER
              })
            ],
            shading: { type: ShadingType.CLEAR, fill: theme.bannerFill, color: theme.bannerFill },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: theme.accent },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: theme.accent },
              left: { style: BorderStyle.SINGLE, size: 4, color: theme.accent },
              right: { style: BorderStyle.SINGLE, size: 4, color: theme.accent }
            }
          }))
        })

        const dataRows = token.rows.map((row) => new TableRow({
          children: row.map((cell) => new TableCell({
            children: [
              new Paragraph({
                children: createRuns(lexInline(cell.text), FONT_SIZES.tableCell),
                spacing: { before: 80, after: 80 }
              })
            ]
          }))
        }))

        return new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...dataRows],
          margins: { top: 80, bottom: 80, left: 80, right: 80 }
        })
      }

      const createBlockquote = (token: GenericToken & { text?: string }) => {
        const runs = createRuns(lexInline(textOrEmpty(token)), FONT_SIZES.blockquote, { italics: true })
        return new Paragraph({
          children: runs,
          spacing: { before: 160, after: 160 },
          border: { left: { style: BorderStyle.SINGLE, size: 6, color: theme.accent } },
          indent: { left: 480 }
        })
      }

      const createCodeBlock = (token: GenericToken & { text?: string }) => {
        return new Paragraph({
          children: [
            new TextRun({ text: textOrEmpty(token), font: 'Courier New', size: FONT_SIZES.code, color: '1F2937' })
          ],
          shading: { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'F3F4F6' },
          border: {
            top: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
            left: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
            right: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' }
          },
          spacing: { before: 160, after: 160 }
        })
      }

      const generatedOn = `Generated on ${new Date(content.createdAt).toLocaleDateString()} at ${new Date(content.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

      docChildren.push(
        new Paragraph({
          children: [new TextRun({ text: content.title, bold: true, size: FONT_SIZES.title, color: theme.accent })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        }),
        new Paragraph({
          children: [new TextRun({ text: generatedOn, italics: true, size: FONT_SIZES.paragraph, color: '6B7280' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 }
        }),
        new Paragraph({
          children: [new TextRun({ text: `${theme.emoji} ${theme.description}`, bold: true, size: FONT_SIZES.paragraph, color: theme.accent })],
          shading: { type: ShadingType.CLEAR, fill: theme.bannerFill, color: theme.bannerFill },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: theme.accent } },
          indent: { left: 240 },
          spacing: { before: 120, after: 200 }
        })
      )

      for (const token of tokens) {
        switch (token.type) {
          case 'space':
            docChildren.push(new Paragraph({ children: [new TextRun({ break: 1 })] }))
            break
          case 'heading':
            docChildren.push(createHeadingParagraph(token as GenericToken & { depth: number }))
            break
          case 'paragraph':
            docChildren.push(createParagraph(token))
            break
          case 'blockquote':
            docChildren.push(createBlockquote(token as GenericToken & { text?: string }))
            break
          case 'code':
            docChildren.push(createCodeBlock(token as GenericToken & { text?: string }))
            break
          case 'list':
            docChildren.push(...convertList(token as ListToken))
            break
          case 'table':
            docChildren.push(createTable(token as TableToken))
            break
          default:
            if (hasText(token)) {
              docChildren.push(createParagraph(token))
            }
            break
        }
      }

      const doc = new Document({
        numbering: { config: numberingConfigs },
        sections: [
          {
            properties: {
              page: {
                margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 }
              }
            },
            children: docChildren
          }
        ]
      })

      const blob = await Packer.toBlob(doc)
      const safeFileName = `${content.title.replace(/[^a-zA-Z0-9\s]/g, '_').replace(/\s+/g, '_')}.docx`
      saveAs(blob, safeFileName)

    } catch (error) {
      console.error('Failed to download DOCX:', error)

      try {
        console.log('Falling back to text file download...')

        let cleanedContent = content.content
        for (const pattern of cleanupPatterns) {
          cleanedContent = cleanedContent.replace(pattern, '')
        }
        cleanedContent = cleanedContent.replace(/^[\s*]+/, '').trim()

        const textContent = `${content.title}\n\nGenerated on ${new Date(content.createdAt).toLocaleDateString()} at ${new Date(content.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n\n${'='.repeat(50)}\n\n${cleanedContent}`

        const blob = new Blob([textContent], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${content.title.replace(/[^a-zA-Z0-9\s]/g, '_').replace(/\s+/g, '_')}.txt`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } catch (fallbackError) {
        console.error('Fallback text download also failed:', fallbackError)
        throw new Error('Failed to download document in any format')
      }
    }
  }
}),
    {
      name: 'study-tools-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isPanelExpanded: state.isPanelExpanded,
        generatedContent: state.generatedContent.map(content => ({
          ...content,
          createdAt: typeof content.createdAt === 'string' ? content.createdAt : content.createdAt.toISOString()
        })),
        pendingGenerations: state.pendingGenerations.map(generation => ({
          ...generation
        })),
        lastLoadedUserId: state.lastLoadedUserId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.generatedContent) {
          state.generatedContent = state.generatedContent.map(content => ({
            ...content,
            createdAt: typeof content.createdAt === 'string' ? new Date(content.createdAt) : content.createdAt
          }))
        }

        if (state?.pendingGenerations) {
          state.pendingGenerations = state.pendingGenerations.map(generation => ({
            ...generation,
            startTime: typeof generation.startTime === 'string'
              ? Number(generation.startTime)
              : generation.startTime
          }))
        } else if (state) {
          state.pendingGenerations = []
        }

        if (state) {
          state.lastLoadedUserId = state.lastLoadedUserId ?? null
          state._hasHydrated = true

          // CRITICAL: Auto-resume pending generations after page refresh/reload
          // Check BOTH pendingGenerations array AND generatedContent for isGenerating items
          const pendingFromArray = state.pendingGenerations || []
          const pendingFromContent = state.generatedContent?.filter(c => c.isGenerating) || []
          
          const hasPending = pendingFromArray.length > 0 || pendingFromContent.length > 0
          
          console.log('[StudyToolsStore] Rehydration check:', {
            pendingArray: pendingFromArray.length,
            generatingContent: pendingFromContent.length,
            totalGeneratedContent: state.generatedContent?.length || 0
          })
          
          if (hasPending) {
            console.log('[StudyToolsStore] Found pending generations, will resume:', {
              fromArray: pendingFromArray.map(g => ({ id: g.id, type: g.type })),
              fromContent: pendingFromContent.map(c => ({ id: c.id, title: c.title, progress: c.generationProgress }))
            })
            
            // Use queueMicrotask to ensure the store is fully initialized before resuming
            queueMicrotask(() => {
              // Resume from pendingGenerations array if available
              if (pendingFromArray.length > 0) {
                console.log('[StudyToolsStore] Resuming from pendingGenerations array')
                state.resumePendingGenerations().catch(error => {
                  console.error('[StudyToolsStore] Failed to resume from array:', error)
                })
              }
              
              // Also resume any isGenerating items from generatedContent
              pendingFromContent.forEach(content => {
                console.log('[StudyToolsStore] Resuming from generatedContent:', content.id, content.type)
                state.generateStudyTool(content.type, content.documentId, content.conversationId, {
                  resume: true,
                  generationId: content.id,
                  startedAt: content.createdAt.getTime()
                }).catch(error => {
                  console.error('[StudyToolsStore] Failed to resume content:', content.id, error)
                })
              })
            })
          } else {
            console.log('[StudyToolsStore] No pending generations found after rehydration')
          }
        }
      }
    }
  )
)

// CRITICAL: Force persist on page unload to ensure isGenerating state is saved
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try {
      const state = useStudyToolsStore.getState()
      const persistedState = {
        isPanelExpanded: state.isPanelExpanded,
        generatedContent: state.generatedContent.map(content => ({
          ...content,
          createdAt: content.createdAt instanceof Date ? content.createdAt.toISOString() : content.createdAt
        })),
        pendingGenerations: state.pendingGenerations || [],
        lastLoadedUserId: state.lastLoadedUserId
      }
      localStorage.setItem('study-tools-storage', JSON.stringify({ state: persistedState }))
      console.log('[StudyToolsStore] Forced persist on beforeunload', {
        generatingCount: persistedState.generatedContent.filter(c => c.isGenerating).length,
        pendingCount: persistedState.pendingGenerations.length
      })
    } catch (error) {
      console.error('[StudyToolsStore] Failed to persist on beforeunload:', error)
    }
  })
}
