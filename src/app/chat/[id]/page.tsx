'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { ChatContainer } from '@/components/chat/chat-container'
import { ChatHistoryDrawer } from '@/components/chat-history-drawer'
import { createThreadId, upsertThread, type ChatThread } from '@/lib/chat-history'
import { useFlashcardStore } from '@/lib/flashcard-store'
import { useStudyToolsStore } from '@/components/study-tools'
import type { DocumentUploadedDetail } from '@/types/documents'
import { GeminiLogo } from '@/components/icons/gemini-logo'
import { useUserPreferences } from '@/lib/use-user-preferences'
import type { ConversationTokens } from '@/lib/token-manager'
import { ChatSettingsPopover } from '@/components/chat/chat-settings-popover'
import { TokenUsageBadge } from '@/components/chat/token-usage-indicator'

interface ChatPageProps {
  params: Promise<{ id: string }>
}

export default function ChatPage({ params }: ChatPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const resolvedParams = use(params)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [chatInstanceKey, setChatInstanceKey] = useState<string>('default')
  const [historyOpen, setHistoryOpen] = useState(false)
  // Load user AI preferences (provider, models, default selection)
  const {
    models: availableModels,
    selectedModelId,
    setSelectedModelId,
    providerInfo,
    reasoningEffort,
    cycleReasoningEffort,
    loading: preferencesLoading,
  } = useUserPreferences()
  const [pageTitle, setPageTitle] = useState('CogniLeap AI Chat')
  const [documentId, setDocumentId] = useState<string | undefined>(undefined)
  const [chatType, setChatType] = useState<'course' | 'lesson' | 'document' | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [initTimeout, setInitTimeout] = useState(false)
  const [tokenUsage, setTokenUsage] = useState<{ tokens: ConversationTokens | null; isCalculating: boolean }>({ tokens: null, isCalculating: false })
  const { isViewerOpen, isFullscreen } = useFlashcardStore()
  const { isCanvasOpen, isCanvasFullscreen } = useStudyToolsStore()
  const isFlashcardFullscreen = isViewerOpen && isFullscreen
  const isCanvasFullscreenMode = isCanvasOpen && isCanvasFullscreen

  // Sanitize potentially unsafe titles from URL
  const sanitizeTitle = useCallback((raw: string): string => {
    try {
      let t = String(raw || '')
      t = t.replace(/[`"<>]/g, ' ')
      const looksLikePath = /^(?:[A-Za-z]:\\|\\\\|\/).+/.test(t)
      if (looksLikePath) {
        const base = t.split(/[\/\\]/).pop() || t
        t = base
      }
      t = t.replace(/\.[A-Za-z0-9]{1,5}$/i, '')
      t = t.replace(/\s+/g, ' ').trim()
      if (!t) return 'Untitled'
      return t.length > 60 ? `${t.slice(0, 57)}...` : t
    } catch {
      return 'Untitled'
    }
  }, [])

  // Get display title based on chat type
  const getDisplayTitle = useCallback(() => {
    const safe = sanitizeTitle(pageTitle)
    switch (chatType) {
      case 'course':
        return safe.startsWith('Course:') ? safe : `Course: ${safe}`
      case 'lesson':
        return safe.startsWith('Lesson:') ? safe : `Lesson: ${safe}`
      case 'document':
        return safe.startsWith('Document:') ? safe : `Document: ${safe}`
      default:
        return safe
    }
  }, [pageTitle, chatType, sanitizeTitle])

  // Initialize conversation from URL params
  useEffect(() => {
    const initializeFromParams = async () => {
      try {
        const chatId = resolvedParams.id

        if (chatId && chatId !== 'new') {
          console.log('[Chat] Initializing chat with ID:', chatId)

          // Reset initialization flag when loading a new thread
          setIsInitialized(false)

          // Load existing conversation
          setConversationId(chatId)
          setChatInstanceKey(chatId)

          // Get URL search params
          const urlChatType = searchParams.get('type') as 'course' | 'lesson' | 'document' | null
          const urlDocumentId = searchParams.get('documentId')
          const urlTitle = searchParams.get('title')

          setChatType(urlChatType)
          setDocumentId(urlDocumentId || undefined)

          // Try to get conversation details from chat history
          try {
            const { getThreads } = await import('@/lib/chat-history')
            const threads = await getThreads()
            const thread = threads.find(t => t.id === chatId)

            if (thread) {
              setPageTitle(thread.title || urlTitle || 'CogniLeap AI Chat')
              setDocumentId(thread.documentId || urlDocumentId || undefined)
            } else if (urlTitle) {
              setPageTitle(urlTitle)
            }
          } catch (historyError) {
            console.warn('Failed to load chat history, continuing with URL params:', historyError)
            if (urlTitle) setPageTitle(urlTitle)
          }

          setIsInitialized(true)
        } else {
          // Invalid chat ID - redirect to new chat
          router.replace('/chat')
        }
      } catch (error) {
        console.error('Failed to initialize conversation from params:', error)
        // Set conversation ID anyway to prevent infinite loading
        setConversationId(resolvedParams.id)
        setIsInitialized(true)
      }
    }

    // Remove the isInitialized check to allow re-initialization if params change
    if (resolvedParams.id) {
      initializeFromParams()
    }
  }, [resolvedParams.id, searchParams, router])

  // Add timeout to prevent infinite loading
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!conversationId && !isInitialized) {
        console.warn('Chat initialization timeout, forcing conversation ID')
        setConversationId(resolvedParams.id || 'fallback')
        setInitTimeout(true)
        setIsInitialized(true)
      }
    }, 5000) // 5 second timeout

    return () => clearTimeout(timer)
  }, [conversationId, isInitialized, resolvedParams.id])

  useEffect(() => {
    const handleDocumentUploaded = (event: Event) => {
      const customEvent = event as CustomEvent<DocumentUploadedDetail>
      const uploadedDocument = customEvent.detail?.document
      if (!uploadedDocument) return

      setDocumentId(uploadedDocument.id)
      setChatType('document')
      setPageTitle(uploadedDocument.title || 'Document')

      if (typeof window !== 'undefined') {
        const search = new URLSearchParams(window.location.search)
        search.set('type', 'document')
        search.set('documentId', uploadedDocument.id)
        if (uploadedDocument.title) {
          search.set('title', uploadedDocument.title)
        }

        router.replace(`/chat/${resolvedParams.id}?${search.toString()}`, { scroll: false })
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('document-uploaded', handleDocumentUploaded as EventListener)
      return () => window.removeEventListener('document-uploaded', handleDocumentUploaded as EventListener)
    }
  }, [resolvedParams.id, router])

  const handleBackToDashboard = () => {
    router.push('/dashboard')
  }

  const handleOpenHistory = useCallback(() => setHistoryOpen(true), [])
  const handleCloseHistory = useCallback(() => setHistoryOpen(false), [])

  const handleNewChat = useCallback(() => {
    // Create a new conversation and redirect
    const id = createThreadId()
    const thread: ChatThread = {
      id,
      title: 'New Chat',
      documentId: null,
      preview: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messagesCount: 0,
    }
    upsertThread(thread)
    router.push(`/chat/${id}`)
  }, [router])

  const handleSelectThread = useCallback((t: ChatThread) => {
    // Build URL with query parameters from thread data
    const params = new URLSearchParams()

    if (t.documentId) {
      params.set('type', 'document')
      params.set('documentId', t.documentId)
    }

    if (t.title) {
      params.set('title', t.title)
    }

    const url = params.toString() ? `/chat/${t.id}?${params.toString()}` : `/chat/${t.id}`

    console.log('[Chat] Navigating to thread:', t.id, 'with params:', params.toString())
    router.push(url)
  }, [router])

  const handleCurrentChatDeleted = useCallback(() => {
    // Redirect to new chat when current chat is deleted
    router.push('/chat')
  }, [router])

  // Don't render until we have a conversation ID (with timeout safety)
  if (!conversationId && !initTimeout) {
    return (
      <DashboardLayout>
        <div className="h-full flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading chat...</div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="h-full min-h-0 flex flex-col bg-background">
        {/* Header - Hidden in fullscreen modes */}
        {!isFlashcardFullscreen && !isCanvasFullscreenMode && (
          <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
          <div className="px-6 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleBackToDashboard}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Back to Dashboard"
                  aria-label="Back to Dashboard"
                  type="button"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                {/* Page Title */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
                    <GeminiLogo size={22} />
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-foreground">
                      {getDisplayTitle()}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      Powered by Gemini AI
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {/* New Chat */}
                <button
                  onClick={handleNewChat}
                  className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  title="Start a new chat"
                  aria-label="New Chat"
                  type="button"
                >
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    <line x1="9" y1="10" x2="15" y2="10" />
                    <line x1="12" y1="7" x2="12" y2="13" />
                  </svg>
                  <span className="hidden sm:inline">New Chat</span>
                </button>

                {/* Chat History */}
                <button
                  onClick={handleOpenHistory}
                  className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  title="Open chat history"
                  aria-label="Chat History"
                  type="button"
                >
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="hidden sm:inline">History</span>
                </button>

                {/* Context Window Indicator */}
                <TokenUsageBadge
                  tokens={tokenUsage.tokens}
                  isCalculating={tokenUsage.isCalculating}
                />

                {/* Settings */}
                <ChatSettingsPopover />
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Main Chat Area */}
        <div className="flex-1 min-h-0">
          <ChatContainer
            key={chatInstanceKey}
            documentId={documentId}
            conversationId={conversationId || undefined}
            selectedModelId={selectedModelId}
            onModelIdChange={setSelectedModelId}
            availableModels={availableModels}
            providerInfo={providerInfo}
            reasoningEffort={reasoningEffort}
            onCycleReasoningEffort={cycleReasoningEffort}
            onTokenUsageChange={setTokenUsage}
          />
        </div>

        {/* Chat History Drawer */}
        <ChatHistoryDrawer
          open={historyOpen}
          onClose={handleCloseHistory}
          onSelectThread={handleSelectThread}
          onNewChat={handleNewChat}
          currentConversationId={conversationId}
          onCurrentChatDeleted={handleCurrentChatDeleted}
        />
      </div>
    </DashboardLayout>
  )
}
