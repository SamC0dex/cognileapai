"use client"

import { useCallback, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
// Model selection now uses string model IDs from user preferences (e.g., 'gemini-2.5-flash', 'anthropic/claude-opus-4.6')
import { TokenManager, type ConversationTokens } from './token-manager'
import { translateError, getNextAutoRetryDelay } from './errors/translator'
import { logError } from './errors/logger'
import type { UserFacingError, ErrorInput } from './errors/types'

export type Role = 'user' | 'assistant' | 'system'

export interface Message {
  id: string
  role: Role
  content: string
  timestamp: Date
  isStreaming?: boolean
  metadata?: Record<string, unknown>
  citations?: Citation[]
  tokenCount?: {
    estimated: number
    confidence: 'high' | 'medium' | 'low'
  }
}

export interface Citation {
  id: string
  text: string
  page?: number
  section?: string
}

export interface DocumentContext {
  id: string
  title: string
  sections: Array<{ id?: string; title?: string }>
}

export interface Conversation {
  id: string
  title: string
  documentId?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

interface StoreShape {
  // state
  messages: Message[]
  isLoading: boolean
  streamingMessage: string
  error: string | null
  friendlyError: UserFacingError | null
  documentContext: DocumentContext | null
  currentConversation: string | null
  selectedModel: string
  autoRetryState: AutoRetryState | null
  rateLimitUntil: number | null
  pendingMessage: string | null
  contextLevel: ContextLevel
  cautionToastPending: boolean
  warningActive: boolean
  warningDecision: WarningDecision
  criticalActive: boolean
  isContextBlocked: boolean
  lastContextUpdate: number | null
  isOptimizingConversation: boolean
  lastOptimization: OptimizationSummary | null

  // token tracking
  conversationTokens: ConversationTokens | null
  contextWarning: string | null

  // actions
  loadConversation: (conversationId: string, documentId?: string) => Promise<void>
  sendMessage: (content: string, documentId?: string | null, model?: string, selectedDocuments?: Array<{id: string, title: string}>, skipUserMessage?: boolean, isAutoRetry?: boolean) => Promise<void>

  regenerateLastMessage: (modelOverride?: string, selectedDocuments?: Array<{id: string, title: string}>) => Promise<void>
  setDocumentContext: (ctx: DocumentContext | null) => void
  setStreamingMessage: (val: string) => void
  setError: (err: string | null) => void
  setFriendlyError: (err: UserFacingError | null) => void
  setSelectedModel: (model: string) => void
  setReasoningEffort: (effort: 'low' | 'medium' | 'high') => void
  createNewConversation: (documentId?: string) => Promise<string>
  resetState: () => void
  clearErrorStates: () => void
  markCautionToastSeen: () => void
  acknowledgeWarning: (decision: WarningResolution) => void
  clearCriticalContext: () => void
  optimizeConversation: () => Promise<OptimizationSummary | null>

  // token tracking actions
  updateTokenTracking: () => void
  canAddMessage: (content: string) => { canAdd: boolean; warning?: string }
}

interface AutoRetryState {
  attempt: number
  maxAttempts: number
  nextRetryAt: number
  message: string
  model: string
  documentId?: string
  selectedDocuments?: Array<{ id: string; title: string }>
  skipUserMessage: boolean
}

export type ContextLevel = 'none' | 'caution' | 'warning' | 'critical'
export type WarningDecision = 'none' | 'continue' | 'optimize' | 'start_new_chat'
export type WarningResolution = Exclude<WarningDecision, 'none'>

interface ContextState {
  level: ContextLevel
  cautionToastPending: boolean
  warningActive: boolean
  warningDecision: WarningDecision
  criticalActive: boolean
  isBlocked: boolean
  lastUpdated: number | null
}

export interface OptimizationSummary {
  timestamp: number
  tokensRemoved: number
  tokensKept: number
  removedMessages: Message[]
  keptLeading: number
  keptTrailing: number
  highlightSnippets: string[]
  summaryMessageId?: string
  originalMessages: Message[]
  optimizedMessages: Message[]
}

const DEFAULT_CONTEXT_STATE: ContextState = {
  level: 'none',
  cautionToastPending: false,
  warningActive: false,
  warningDecision: 'none',
  criticalActive: false,
  isBlocked: false,
  lastUpdated: null
}


// Enhanced chat store with Supabase integration
export function useChatStore(): StoreShape {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [friendlyError, setFriendlyErrorState] = useState<UserFacingError | null>(null)
  const [documentContext, setDocumentContext] = useState<DocumentContext | null>(null)
  const [currentConversation, setCurrentConversation] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash')
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>('low')
  const [autoRetryState, setAutoRetryState] = useState<AutoRetryState | null>(null)
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [contextState, setContextState] = useState<ContextState>(DEFAULT_CONTEXT_STATE)
  const [isOptimizingConversation, setIsOptimizingConversation] = useState(false)
  const [lastOptimization, setLastOptimization] = useState<OptimizationSummary | null>(null)

  // token tracking state
  const [systemPromptTokens, setSystemPromptTokens] = useState<number>(0)
  const [documentContextTokens, setDocumentContextTokens] = useState<number>(0)
  const [tokenCountMethod, setTokenCountMethod] = useState<'api_count' | 'estimation'>('estimation')
  const [conversationTokens, setConversationTokens] = useState<ConversationTokens | null>(null)
  const [contextWarning, setContextWarning] = useState<string | null>(null)

  const conversationRef = useRef<string | null>(null)
  const allMessagesRef = useRef<Message[]>([])
  allMessagesRef.current = messages
  const autoRetryTimerRef = useRef<NodeJS.Timeout | null>(null)
  const autoRetryStateRef = useRef<AutoRetryState | null>(null)
  const contextStateRef = useRef<ContextState>(DEFAULT_CONTEXT_STATE)

  const clearAutoRetryTimer = () => {
    if (autoRetryTimerRef.current) {
      clearTimeout(autoRetryTimerRef.current)
      autoRetryTimerRef.current = null
    }
  }

  const updateAutoRetryState = (state: AutoRetryState | null) => {
    autoRetryStateRef.current = state
    setAutoRetryState(state)
  }

  const loadConversation = useCallback(async (conversationId: string, documentId?: string) => {
    try {
      const supabase = createClient()

      setIsLoading(true)
      setError(null)
      setLastOptimization(null)
      setIsOptimizingConversation(false)
      setContextState(() => {
        contextStateRef.current = DEFAULT_CONTEXT_STATE
        return DEFAULT_CONTEXT_STATE
      })
      // Reset token state to avoid stale data from previous conversation
      setSystemPromptTokens(0)
      setDocumentContextTokens(0)
      setTokenCountMethod('estimation')
      setCurrentConversation(conversationId)
      conversationRef.current = conversationId

      console.log('[Chat Store] Loading conversation:', conversationId)

      // Wait for authentication to complete before loading metadata
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.warn('[Chat Store] No authenticated user, waiting for auth...')
        // Retry after a short delay to allow auth to complete
        await new Promise(resolve => setTimeout(resolve, 500))
        const { data: { user: retryUser } } = await supabase.auth.getUser()
        if (!retryUser) {
          // Silently exit if auth fails - this is expected during logout or when session expires
          // Only set error if we're not in the process of redirecting/logging out
          console.log('[Chat Store] No authenticated user found - skipping conversation load')
          setIsLoading(false)
          return
        }
        console.log('[Chat Store] Auth completed on retry')
      }

      // Load conversation metadata (includes token breakdown) AND messages in parallel
      const [convResult, messagesResult] = await Promise.all([
        supabase
          .from('conversations')
          .select('metadata, document_id')
          .eq('id', conversationId)
          .single(),
        supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('sequence_number', { ascending: true })
      ])

      // Restore token breakdown from conversation metadata
      if (convResult.data?.metadata) {
        const metadata = convResult.data.metadata as Record<string, unknown> | null
        if (metadata && typeof metadata === 'object') {
          if (typeof metadata.systemPromptTokens === 'number') {
            setSystemPromptTokens(metadata.systemPromptTokens)
            console.log(`[Chat] Restored system prompt tokens: ${metadata.systemPromptTokens}`)
          }
          if (typeof metadata.documentContextTokens === 'number') {
            setDocumentContextTokens(metadata.documentContextTokens)
            console.log(`[Chat] Restored document context tokens: ${metadata.documentContextTokens}`)
          }
          if (metadata.tokenCountMethod === 'api_count' || metadata.tokenCountMethod === 'estimation') {
            setTokenCountMethod(metadata.tokenCountMethod)
            console.log(`[Chat] Restored token count method: ${metadata.tokenCountMethod}`)
          }
        }
      }

      // Check for messages errors
      const { data: messagesData, error: messagesError } = messagesResult
      if (messagesError) {
        console.error('Error loading messages:', {
          error: messagesError,
          message: messagesError.message,
          details: messagesError.details,
          code: messagesError.code,
          conversationId
        })
        setError(`Failed to load conversation: ${messagesError.message || 'Unknown database error'}`)
        return
      }

      // Handle empty messages case
      if (!messagesData || messagesData.length === 0) {
        console.log(`[Chat] No messages found for conversation ${conversationId}`)
        setMessages([])
        return
      }

      // Convert to Message format
      const loadedMessages: Message[] = messagesData.map(msg => ({
        id: msg.id,
        role: msg.role as Role,
        content: msg.content,
        timestamp: new Date(msg.created_at),
        metadata: msg.metadata,
        citations: msg.citations || []
      }))

      setMessages(loadedMessages)

      // Update token tracking after loading messages
      setTimeout(() => updateTokenTracking(), 0)
      console.log(`[Chat] Loaded ${loadedMessages.length} messages for conversation ${conversationId}`)

      // Load document context if documentId provided and not already loaded
      if (documentId && documentContext?.id !== documentId) {
        const { data: docData, error: docError } = await supabase
          .from('documents')
          .select('id, title')
          .eq('id', documentId)
          .single()

        if (docError) {
          console.warn('[Chat] Failed to load document context:', docError.message)
        } else if (docData) {
          setDocumentContext({ id: docData.id, title: docData.title, sections: [] })
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      console.error('Error in loadConversation:', error)
      setError(`Failed to load conversation: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentContext]) // updateTokenTracking is properly memoized and stable - adding would cause unnecessary re-renders


  const sendMessage = useCallback(async (
    content: string,
    documentId?: string | null,
    model?: string,
    selectedDocuments?: Array<{ id: string, title: string }>,
    skipUserMessage = false,
    isAutoRetry = false
  ) => {
    if (!content.trim()) return

    if (contextStateRef.current.isBlocked && !skipUserMessage) {
      const limitMessage = 'Context limit reached. Please optimize the conversation or start a fresh chat to continue.'
      setError(limitMessage)
      return
    }

    const modelToUse = model || selectedModel

    if (!isAutoRetry) {
      clearAutoRetryTimer()
      updateAutoRetryState(null)
      setFriendlyErrorState(null)
      setError(null)
    }

    setPendingMessage(content)
    let user: Message | null = null
    let finalTokenUsage: number | undefined // Declare at function scope for both finalUpdate functions
    let finalUserTokens: number | undefined // Accurate user message token count
    let finalAssistantTokens: number | undefined // Accurate assistant message token count
    let finalMessageTokenMethod: 'api_count' | 'estimation' | undefined // Token counting method for messages
    let serverMetadata: Record<string, unknown> | undefined // Full metadata from server 8: response

    // Add user message unless this is a regeneration
    if (!skipUserMessage) {
      const id = `u_${Date.now()}`
      const tokenCount = TokenManager.estimate(content)
      user = {
        id,
        role: 'user',
        content,
        timestamp: new Date(),
        tokenCount: {
          estimated: tokenCount.estimated,
          confidence: tokenCount.confidence
        }
      }
      // Instantly show user message (optimistic UI)
      setMessages(prev => [...prev, user!])

      // Update token tracking immediately after adding user message
      setTimeout(() => updateTokenTracking(), 0)
    }

    setIsLoading(false) // No loading state needed with optimistic UI
    setStreamingMessage('')
    setError(null)

    // Prepare streaming resources and state - declare at function scope for error handling
    let serverBuffer = ''
    let displayedText = ''
    let isStreamingActive = true

    // Resource tracking for cleanup - declare at function scope for error handling
    let streamInterval: NodeJS.Timeout | null = null
    let waitForCompletion: NodeJS.Timeout | null = null
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    const abortController = new AbortController()

    // Cleanup function to prevent resource leaks
    const cleanupResources = () => {
      console.log('[Chat] Cleaning up streaming resources')

      if (streamInterval) {
        clearInterval(streamInterval)
        streamInterval = null
      }

      if (waitForCompletion) {
        clearInterval(waitForCompletion)
        waitForCompletion = null
      }

      if (reader) {
        try {
          reader.releaseLock()
        } catch (e) {
          console.warn('[Chat] Reader already released:', e)
        }
        reader = null
      }

      isStreamingActive = false
    }

    try {
      // Create conversation if needed BEFORE adding assistant placeholder
      // This ensures proper timing for first message indicators
      let convId = conversationRef.current
      if (!convId) {
        console.log('[Chat] Creating new conversation...')
        convId = await createNewConversationInternal(documentId || documentContext?.id)
      }

      // Add assistant placeholder for streaming AFTER conversation exists
      // This ensures consistent timing for typing indicator across first and subsequent messages
      const assistantId = `a_${Date.now()}`
      const assistantPlaceholder: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true
      }
      setMessages(prev => [...prev, assistantPlaceholder])

      // Update token tracking immediately after adding assistant placeholder
      setTimeout(() => updateTokenTracking(), 0)

      // For regeneration, ensure we send messages up to and including the user message
      // For new messages, use allMessagesRef which is more current
      let messagesToSend: Array<{id: string, role: string, content: string, timestamp: string}>

      if (skipUserMessage) {
        // During regeneration: use current messages, ensuring the last one is the user message we're regenerating from
        // allMessagesRef.current should already contain the user message we want to regenerate from
        messagesToSend = allMessagesRef.current.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString()
        }))

        // Ensure the last message is a user message (required by API)
        if (messagesToSend.length === 0 || messagesToSend[messagesToSend.length - 1].role !== 'user') {
          throw new Error('Cannot regenerate: no user message found to regenerate from')
        }
      } else {
        // Normal message: use current messages + new user message
        messagesToSend = [...allMessagesRef.current, ...(user ? [user] : [])].map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString()
        }))
      }

      const payload = {
        messages: messagesToSend,
        chatType: (documentId || selectedDocuments?.length) ? 'document' : 'general',
        documentId: documentId || documentContext?.id,
        selectedDocuments: selectedDocuments,
        conversationId: convId,
        preferredModel: modelToUse,
        reasoningEffort: reasoningEffort
      }

      console.log(`[Chat] Sending message with model ${modelToUse}...`)
      const startTime = Date.now()

      try {
        // Network request with abort signal
        const apiEndpoint = '/api/chat/stateful'
        console.log(`[Chat] Using STATEFUL chat endpoint`)

        const res = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: abortController.signal // Add abort support
        })

        if (!res.ok) {
          // Try to parse error response body for detailed error message
          try {
            const errorData = await res.json()
            const errorMsg = errorData.message || errorData.error || errorData.details || `API error: ${res.status}`
            throw new Error(errorMsg)
          } catch {
            // If JSON parsing fails, throw generic error
            throw new Error(`API error: ${res.status}`)
          }
        }

        if (!res.body) {
          throw new Error('No response body')
        }

        reader = res.body.getReader()
        const decoder = new TextDecoder()

        // Improved streaming with better performance
        const STREAM_SPEED = 100 // Reduced frequency to 100ms for better performance
        const BATCH_SIZE = 8 // Increased batch size for smoother streaming
        let lastUpdateTime = 0

        const startSmoothStreaming = () => {
          streamInterval = setInterval(() => {
            if (displayedText.length < serverBuffer.length && isStreamingActive) {
              const nextText = serverBuffer.slice(0, displayedText.length + BATCH_SIZE)
              displayedText = nextText

              // Throttle UI updates to reduce React re-renders
              const now = Date.now()
              if (now - lastUpdateTime > 32) { // ~30fps throttling for better performance
                lastUpdateTime = now
                requestAnimationFrame(() => {
                  if (isStreamingActive) { // Double-check we're still streaming
                    setMessages(prev => prev.map(msg =>
                      msg.id === assistantId
                        ? { ...msg, content: displayedText, isStreaming: true }
                        : msg
                    ))
                  }
                })
              }
            } else if (displayedText.length >= serverBuffer.length && !isStreamingActive) {
              // Streaming complete
              if (streamInterval) {
                clearInterval(streamInterval)
                streamInterval = null
              }

              requestAnimationFrame(() => {
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantId
                    ? { ...msg, content: displayedText, isStreaming: false }
                    : msg
                ))
              })
            }
          }, STREAM_SPEED)
        }

        // Start streaming
        startSmoothStreaming()

        // Read from stream with timeout protection
        const streamStartTime = Date.now()
        const MAX_STREAM_TIME = 90000 // 90 seconds max

        while (true) {
          // Check for timeout
          if (Date.now() - streamStartTime > MAX_STREAM_TIME) {
            console.warn('[Chat] Stream timeout reached, stopping')
            break
          }

          const { value, done } = await reader.read()
          if (done) {
            isStreamingActive = false
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n').filter(line => line.trim())

          for (const line of lines) {
            try {
              if (line.startsWith('0:')) {
                const content = JSON.parse(line.slice(2))
                if (typeof content === 'string') {
                  serverBuffer += content
                }
              } else if (line.startsWith('d:')) {
                const data = line.slice(2)
                try {
                  const parsed = JSON.parse(data)
                  if (parsed?.text) {
                    serverBuffer += parsed.text
                  }
                } catch {
                  if (data) {
                    serverBuffer += data
                  }
                }
              } else if (line.startsWith('8:')) {
                try {
                  const metadata = JSON.parse(line.slice(2))
                  serverMetadata = metadata as Record<string, unknown>
                  console.log('[Chat] Received metadata:', metadata)
                  if (metadata?.usage?.totalTokens) {
                    finalTokenUsage = metadata.usage.totalTokens
                    console.log('[Chat] Received token usage:', finalTokenUsage)
                  }
                  // Capture accurate message token counts
                  if (metadata?.messageTokens) {
                    console.log('[Chat] Accurate message tokens:', metadata.messageTokens)
                    // Store for use in final update
                    finalUserTokens = metadata.messageTokens.user
                    finalAssistantTokens = metadata.messageTokens.assistant
                    finalMessageTokenMethod = metadata.messageTokens.method
                  }
                  // Capture system and document context tokens ONLY for new sessions
                  // For existing sessions, these values don't change and should not be updated
                  if (metadata?.tokenBreakdown) {
                    console.log('[Chat] Token breakdown found:', metadata.tokenBreakdown)
                    const isNewSession = metadata.tokenBreakdown.isNewSession
                    const countMethod = metadata.tokenBreakdown.method || 'estimation'
                    
                    // Only update system/document tokens for NEW sessions
                    if (isNewSession) {
                      if (metadata.tokenBreakdown.systemPrompt) {
                        setSystemPromptTokens(metadata.tokenBreakdown.systemPrompt)
                        console.log(`[Chat] NEW SESSION - System prompt tokens: ${metadata.tokenBreakdown.systemPrompt} (${countMethod})`)
                      }
                      if (metadata.tokenBreakdown.documentContext) {
                        setDocumentContextTokens(metadata.tokenBreakdown.documentContext)
                        console.log(`[Chat] NEW SESSION - Document context tokens: ${metadata.tokenBreakdown.documentContext} (${countMethod})`)
                      }
                      // Update token count method
                      setTokenCountMethod(countMethod)
                      console.log(`[Chat] NEW SESSION - Token count method: ${countMethod}`)
                    } else {
                      console.log(`[Chat] EXISTING SESSION - Keeping previous system/document context token values (${countMethod})`)
                    }
                  } else {
                    console.warn('[Chat] No tokenBreakdown in metadata')
                  }
                } catch (err) {
                  console.error('[Chat] Metadata parsing failed:', err)
                }
              }
            } catch {
              continue
            }
          }
        }

        // Final completion check with timeout
        waitForCompletion = setInterval(() => {
          if (displayedText.length >= serverBuffer.length || !isStreamingActive) {
            if (waitForCompletion) {
              clearInterval(waitForCompletion)
              waitForCompletion = null
            }
            if (streamInterval) {
              clearInterval(streamInterval)
              streamInterval = null
            }
          }
        }, 100)

      const duration = Date.now() - startTime
      console.log(`[Chat] Streaming completed in ${duration}ms`)

      if (!serverBuffer || serverBuffer.trim() === '') {
        throw new Error('AI response was empty')
      }

      // Get model display name — use metadata from server response if available,
      // otherwise derive from the model ID string (works for any provider)
      const modelDisplayName = serverMetadata?.model || modelToUse

      // Final update with metadata (will be handled by the interval completion)
      const finalUpdate = () => {
        // Use accurate token counts if available, fallback to estimation
        const assistantTokenCount = finalAssistantTokens
          ? { estimated: finalAssistantTokens, confidence: 'high' as const }
          : TokenManager.estimate(serverBuffer)

        const userTokenCount = finalUserTokens
          ? { estimated: finalUserTokens, confidence: 'high' as const }
          : (user?.tokenCount || TokenManager.estimate(content))

        // Update assistant message with accurate tokens
        setMessages(prev => prev.map(msg => {
          if (msg.id === assistantId) {
            return {
              ...msg,
              content: serverBuffer,
              isStreaming: false,
              tokenCount: assistantTokenCount,
              metadata: {
                model: modelDisplayName,
                modelKey: modelToUse,
                duration,
                tokens: finalAssistantTokens || assistantTokenCount.estimated,
                tokenMethod: finalMessageTokenMethod || 'estimation'
              }
            }
          } else if (user && msg.id === user.id) {
            // Update user message with accurate tokens
            return {
              ...msg,
              tokenCount: userTokenCount,
              metadata: {
                ...msg.metadata,
                tokens: finalUserTokens || userTokenCount.estimated,
                tokenMethod: finalMessageTokenMethod || 'estimation'
              }
            }
          }
          return msg
        }))

        console.log(`[Chat] Final token counts: user=${finalUserTokens || 'estimated'}, assistant=${finalAssistantTokens || 'estimated'}, method=${finalMessageTokenMethod || 'estimation'}`)

        // Update token tracking after message is complete
        updateTokenTracking()
      }

      // Wait a bit for smooth streaming to complete, then add metadata
      setTimeout(finalUpdate, 500)

      // Update chat history (debounced to avoid too frequent updates)
      if (typeof window !== 'undefined') {
        try {
          const { upsertThread, touchThread } = await import('./chat-history')
          const preview = serverBuffer.slice(0, 100) + (serverBuffer.length > 100 ? '...' : '')

          if (allMessagesRef.current.length === 0) {
            // New conversation
            await upsertThread({
              id: convId,
              title: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
              documentId: documentId || documentContext?.id,
              preview,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              messagesCount: 2
            })
          } else {
            // Update existing
            await touchThread(convId, {
              preview,
              messagesCount: allMessagesRef.current.length + 2
            })
          }
        } catch (historyError) {
          console.warn('[Chat] Failed to update chat history:', historyError)
          // Don't fail the whole operation for history update errors
        }
      }
      } catch (streamError) {
        console.error('[Chat] Stream reading error:', streamError)
        // Don't fail completely, just stop streaming
      } finally {
        // Always cleanup streaming resources
        cleanupResources()
      }

      const duration = Date.now() - startTime
      console.log(`[Chat] Streaming completed in ${duration}ms`)

      // Ensure we have some response
      if (!serverBuffer || serverBuffer.trim() === '') {
        serverBuffer = "I apologize, but I didn't receive a complete response. Please try again."
        console.warn('[Chat] Empty response received, using fallback')
      }

      // Get model display name from server metadata or model ID
      const modelDisplayName2 = serverMetadata?.model || modelToUse

      // Final update with metadata
      const finalUpdate = () => {
        const assistantTokenCount = TokenManager.estimate(serverBuffer)
        setMessages(prev => prev.map(msg =>
          msg.id === assistantId
            ? {
                ...msg,
                content: serverBuffer,
                isStreaming: false,
                tokenCount: {
                  estimated: assistantTokenCount.estimated,
                  confidence: assistantTokenCount.confidence
                },
                metadata: {
                  model: modelDisplayName2,
                  modelKey: modelToUse,
                  duration,
                  tokens: finalTokenUsage || assistantTokenCount.estimated
                }
              }
            : msg
        ))

        // Update token tracking
        updateTokenTracking()
      }

      // Apply final update
      setTimeout(finalUpdate, 200)

      // Update chat history
      if (typeof window !== 'undefined') {
        try {
          const { upsertThread, touchThread } = await import('./chat-history')
          const preview = serverBuffer.slice(0, 100) + (serverBuffer.length > 100 ? '...' : '')

          if (allMessagesRef.current.length === 0) {
            await upsertThread({
              id: convId,
              title: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
              documentId: documentId || documentContext?.id,
              preview,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              messagesCount: 2
            })
          } else {
            await touchThread(convId, {
              preview,
              messagesCount: allMessagesRef.current.length + 2
            })
          }
        } catch (historyError) {
          console.warn('[Chat] Failed to update chat history:', historyError)
        }
      }

      setPendingMessage(null)
      updateAutoRetryState(null)
      setFriendlyErrorState(null)
      setRateLimitUntil(null)

    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred'
      console.error('[Chat] sendMessage failed:', errorMessage, e)

      const errorContext = {
        source: 'chat' as const,
        operation: skipUserMessage ? 'regenerate' : 'send',
        rawMessage: errorMessage,
        payload: {
          documentId,
          conversationId: conversationRef.current,
          model: modelToUse
        }
      }

      const translated = translateError(e as ErrorInput, errorContext)
      const baseUserError: UserFacingError = {
        ...translated.userError,
        metadata: {
          ...translated.userError.metadata,
          autoRetryAttempt: isAutoRetry && autoRetryStateRef.current?.attempt ? autoRetryStateRef.current.attempt : 1,
          autoRetryMax: translated.userError.autoBehavior?.maxAttempts ?? undefined
        }
      }

      logError(e, errorContext, baseUserError)

      // Abort any ongoing requests
      abortController.abort()

      // Cleanup resources on error
      if (typeof cleanupResources === 'function') {
        cleanupResources()
      }

      // Remove optimistically added messages on error
      setMessages(prev => prev.slice(0, skipUserMessage ? -1 : -2))

      setFriendlyErrorState(baseUserError)
      setError(baseUserError.message)

      if (translated.userError.autoBehavior?.type === 'countdown') {
        const countdownMs = (translated.userError.autoBehavior.countdownSeconds ?? 30) * 1000
        setRateLimitUntil(Date.now() + countdownMs)
      }

      const autoBehavior = translated.userError.autoBehavior

      if (translated.isRetryable && autoBehavior?.type === 'auto-retry') {
        const maxAttempts = autoBehavior.maxAttempts ?? 3
        const currentAttempt = isAutoRetry && autoRetryStateRef.current?.attempt
          ? autoRetryStateRef.current.attempt
          : 1
        const nextAttempt = currentAttempt + 1

        if (nextAttempt <= maxAttempts) {
          const delay = getNextAutoRetryDelay(nextAttempt - 2 >= 0 ? nextAttempt - 2 : 0)
          const nextRetryAt = Date.now() + delay

          const retryUserError: UserFacingError = {
            ...baseUserError,
            message: `Our AI is momentarily busy. Retrying automatically (Attempt ${nextAttempt}/${maxAttempts})...`,
            metadata: {
              ...baseUserError.metadata,
              autoRetryAttempt: nextAttempt,
              autoRetryMax: maxAttempts
            }
          }

          setFriendlyErrorState(retryUserError)

          updateAutoRetryState({
            attempt: nextAttempt,
            maxAttempts,
            nextRetryAt,
            message: content,
            model: modelToUse,
            documentId: documentId || documentContext?.id || undefined,
            selectedDocuments,
            skipUserMessage
          })

          clearAutoRetryTimer()
          autoRetryTimerRef.current = setTimeout(() => {
            autoRetryTimerRef.current = null
            void sendMessage(content, documentId, modelToUse, selectedDocuments, skipUserMessage, true)
          }, delay)

          return
        }
      }

      updateAutoRetryState(null)
    } finally {
      setIsLoading(false)
      setStreamingMessage('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentContext, selectedModel]) // updateTokenTracking is stable and called directly - no dependency needed

  // Define createNewConversationInternal before it's used in callbacks
  const createNewConversationInternal = async (documentId?: string): Promise<string> => {
    try {
      const supabase = createClient()

      // Generate a proper UUID v4
      const conversationId = crypto.randomUUID()

      // Create conversation in database
      const { error } = await supabase
        .from('conversations')
        .insert({
          id: conversationId,
          document_id: documentId || null,
          selected_document_id: documentId || null,
          title: 'New Conversation' // Temporary title, will be updated with first message
        })

      if (error) {
        console.warn('[DB] Failed to create conversation in database, continuing with in-memory:', error.message)
        // Continue with in-memory conversation even if database insert fails
      } else {
        console.log('[Chat] Created conversation in database with ID:', conversationId)
      }

      setCurrentConversation(conversationId)
      conversationRef.current = conversationId
      return conversationId
    } catch (error) {
      console.error('Error in createNewConversationInternal:', error)
      const fallbackId = crypto.randomUUID()
      setCurrentConversation(fallbackId)
      conversationRef.current = fallbackId
      return fallbackId
    }
  }

  const regenerateLastMessage = useCallback(async (modelOverride?: string, selectedDocuments?: Array<{id: string, title: string}>) => {
    // Find last assistant and user message indices
    let lastAssistantIndex = -1
    let lastUserIndex = -1

    for (let i = messages.length - 1; i >= 0; i--) {
      if (lastAssistantIndex === -1 && messages[i].role === 'assistant') {
        lastAssistantIndex = i
      }
      if (lastUserIndex === -1 && messages[i].role === 'user') {
        lastUserIndex = i
      }
      if (lastAssistantIndex > -1 && lastUserIndex > -1) break
    }

    if (lastAssistantIndex > -1 && lastUserIndex > -1 && lastUserIndex < lastAssistantIndex) {
      // Get the messages up to (and including) the user message we want to regenerate from
      const messagesForRegeneration = messages.slice(0, lastAssistantIndex)
      const lastUserMessage = messages[lastUserIndex]

      // Remove the last assistant message from UI
      setMessages(messagesForRegeneration)

      // Update allMessagesRef to ensure sendMessage has the correct message context
      allMessagesRef.current = messagesForRegeneration

      // Use the existing sendMessage with skipUserMessage=true to reuse proven streaming logic
      // Preserve the selectedDocuments that were used in the original conversation
      await sendMessage(lastUserMessage.content, documentContext?.id, modelOverride, selectedDocuments, true)
    }
  }, [messages, documentContext, sendMessage])

  const createNewConversation = useCallback(async (documentId?: string) => {
    return await createNewConversationInternal(documentId)
  }, [])

  const resetState = useCallback(() => {
    setMessages([])
    setStreamingMessage('')
    setError(null)
    setFriendlyErrorState(null)
    setCurrentConversation(null)
    conversationRef.current = null
    updateAutoRetryState(null)
    clearAutoRetryTimer()
    setRateLimitUntil(null)
    setPendingMessage(null)
    setLastOptimization(null)
    setIsOptimizingConversation(false)
    setContextState(() => {
      contextStateRef.current = DEFAULT_CONTEXT_STATE
      return DEFAULT_CONTEXT_STATE
    })
    allMessagesRef.current = []

    // Reset token tracking
    setConversationTokens(null)
    setContextWarning(null)
  }, [])

  const clearErrorStates = useCallback(() => {
    setError(null)
    setFriendlyErrorState(null)
    updateAutoRetryState(null)
    clearAutoRetryTimer()
    setRateLimitUntil(null)
  }, [])

  const markCautionToastSeen = useCallback(() => {
    setContextState(prev => {
      if (!prev.cautionToastPending) {
        return prev
      }
      const next: ContextState = {
        ...prev,
        cautionToastPending: false,
        lastUpdated: Date.now()
      }
      contextStateRef.current = next
      return next
    })
  }, [])

  const acknowledgeWarning = useCallback((decision: WarningResolution) => {
    setContextState(prev => {
      const nextLevel = decision === 'start_new_chat' ? 'none' : prev.level
      const next: ContextState = {
        ...prev,
        level: nextLevel,
        warningActive: false,
        warningDecision: decision,
        cautionToastPending: decision === 'start_new_chat' ? false : prev.cautionToastPending,
        criticalActive: decision === 'start_new_chat' ? false : prev.criticalActive,
        isBlocked: decision === 'start_new_chat' ? false : prev.isBlocked,
        lastUpdated: Date.now()
      }
      contextStateRef.current = next
      return next
    })
  }, [])

  const clearCriticalContext = useCallback(() => {
    setContextState(prev => {
      if (!prev.criticalActive && !prev.isBlocked) {
        return prev
      }
      const next: ContextState = {
        ...prev,
        criticalActive: false,
        isBlocked: false,
        lastUpdated: Date.now()
      }
      contextStateRef.current = next
      return next
    })
  }, [])

  const stableSetDocumentContext = useCallback((ctx: DocumentContext | null) => {
    setDocumentContext(ctx)
  }, [])

  // Token tracking functions
  const updateTokenTracking = useCallback(() => {
    if (messages.length === 0) {
      setConversationTokens(null)
      setContextWarning(null)
      setContextState(() => {
        contextStateRef.current = DEFAULT_CONTEXT_STATE
        return DEFAULT_CONTEXT_STATE
      })
      setLastOptimization(null)
      setIsOptimizingConversation(false)
      return
    }

    // Skip calculation if any message is still streaming
    // Token tracking will run again when streaming completes
    const hasStreamingMessage = messages.some(msg => msg.isStreaming)
    if (hasStreamingMessage) {
      return
    }

    // Convert messages to format expected by TokenManager
    const messagesWithTokens = messages.map(msg => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
      timestamp: msg.timestamp,
      tokenCount: msg.metadata?.tokens && typeof msg.metadata.tokens === 'number' ? {
        estimated: msg.metadata.tokens,
        confidence: 'high' as const,
        method: 'api_count' as const,
        timestamp: new Date()
      } : msg.tokenCount ? {
        estimated: msg.tokenCount.estimated,
        confidence: msg.tokenCount.confidence,
        method: 'estimation' as const,
        timestamp: new Date()
      } : TokenManager.estimate(msg.content)
    }))

    // Calculate conversation tokens
    const tokens = TokenManager.estimateConversation(messagesWithTokens, {
      systemPrompt: systemPromptTokens,
      documentContext: documentContextTokens
    })
    tokens.conversationId = currentConversation || 'temp-conversation'
    tokens.method = tokenCountMethod // Pass through token counting method for UI display

    // Generate warning message
    const warning = TokenManager.getWarning(tokens)

    setConversationTokens(tokens)
    setContextWarning(warning)
    setContextState(prev => {
      const nextLevel = tokens.warningLevel

      let warningDecision = prev.warningDecision
      if (nextLevel === 'none' || nextLevel === 'caution') {
        warningDecision = 'none'
      }

      let cautionToastPending = prev.cautionToastPending
      if (nextLevel === 'caution') {
        if (prev.level !== 'caution' && prev.level !== 'warning' && prev.level !== 'critical') {
          cautionToastPending = true
        }
      } else {
        cautionToastPending = false
      }

      let warningActive = prev.warningActive
      if (nextLevel === 'warning') {
        if (prev.level !== 'warning' && warningDecision !== 'continue' && warningDecision !== 'optimize' && warningDecision !== 'start_new_chat') {
          warningActive = true
        }
      } else {
        warningActive = false
      }

      if (nextLevel === 'warning' && (warningDecision === 'continue' || warningDecision === 'optimize' || warningDecision === 'start_new_chat')) {
        warningActive = false
      }

      const criticalActive = nextLevel === 'critical'
      if (criticalActive) {
        warningActive = false
        warningDecision = 'none'
      }

      const nextState: ContextState = {
        level: nextLevel,
        cautionToastPending,
        warningActive,
        warningDecision,
        criticalActive,
        isBlocked: criticalActive,
        lastUpdated: Date.now()
      }

      contextStateRef.current = nextState
      return nextState
    })

    console.log(`[TokenTracker] Conversation ${currentConversation}: ${tokens.totalTokens.toLocaleString()} tokens (${tokens.warningLevel})`)
  }, [messages, currentConversation, systemPromptTokens, documentContextTokens, tokenCountMethod])

  const canAddMessage = useCallback((content: string): { canAdd: boolean; warning?: string } => {
    if (!conversationTokens) {
      return { canAdd: true }
    }

    const newMessageTokens = TokenManager.estimate(content).estimated
    const result = TokenManager.canAdd(conversationTokens.totalTokens, newMessageTokens)

    return {
      canAdd: result.canAdd,
      warning: result.suggestedAction
    }
  }, [conversationTokens])

  const optimizeConversation = useCallback(async (): Promise<OptimizationSummary | null> => {
    if (isOptimizingConversation || allMessagesRef.current.length === 0) {
      return null
    }

    setIsOptimizingConversation(true)

    try {
      const currentMessages = allMessagesRef.current
      const tokenManagerMessages = currentMessages.map(message => {
        const estimatedTokenCount = message.tokenCount
          ? {
              estimated: message.tokenCount.estimated,
              confidence: message.tokenCount.confidence,
              method: 'estimation' as const,
              timestamp: message.timestamp
            }
          : TokenManager.estimate(message.content)

        return {
          id: message.id,
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
          tokenCount: estimatedTokenCount
        }
      })

      const result = TokenManager.optimize(tokenManagerMessages, undefined, {
        leadingMessages: 3,
        trailingMessages: 30,
        minimumTrailing: 8,
        highlightSamples: 3
      })

      const normalizedOptimizedMessages: Message[] = result.optimizedMessages.map(message => ({
        id: message.id,
        role: message.role as Role,
        content: message.content,
        timestamp: message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp),
        tokenCount: message.tokenCount
          ? {
              estimated: message.tokenCount.estimated,
              confidence: message.tokenCount.confidence
            }
          : undefined
      }))

      const normalizedRemovedMessages: Message[] = result.removedMessages.map(message => ({
        id: message.id,
        role: message.role as Role,
        content: message.content,
        timestamp: message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp),
        tokenCount: message.tokenCount
          ? {
              estimated: message.tokenCount.estimated,
              confidence: message.tokenCount.confidence
            }
          : undefined
      }))

      setMessages(normalizedOptimizedMessages)
      allMessagesRef.current = normalizedOptimizedMessages

      const timestamp = Date.now()
      const summary: OptimizationSummary = {
        timestamp,
        tokensRemoved: result.tokensRemoved,
        tokensKept: result.tokensKept,
        removedMessages: normalizedRemovedMessages,
        keptLeading: result.keptLeading,
        keptTrailing: result.keptTrailing,
        highlightSnippets: result.highlightSnippets,
        summaryMessageId: result.summaryMessage?.id,
        originalMessages: currentMessages,
        optimizedMessages: normalizedOptimizedMessages
      }

      setLastOptimization(summary)
      clearCriticalContext()
      setContextState(prev => {
        const next: ContextState = {
          ...prev,
          level: prev.level === 'critical' ? 'warning' : prev.level,
          warningActive: false,
          warningDecision: 'optimize',
          cautionToastPending: false,
          criticalActive: false,
          isBlocked: false,
          lastUpdated: timestamp
        }
        contextStateRef.current = next
        return next
      })

      setTimeout(() => updateTokenTracking(), 0)

      return summary
    } catch (optimizationError) {
      console.error('[Chat] Failed to optimize conversation:', optimizationError)
      setError('Failed to optimize conversation. Please try again.')
      return null
    } finally {
      setIsOptimizingConversation(false)
    }
  }, [clearCriticalContext, isOptimizingConversation, updateTokenTracking])

  return {
    messages,
    isLoading,
    streamingMessage,
    error,
    friendlyError,
    documentContext,
    currentConversation,
    selectedModel,
    autoRetryState,
    rateLimitUntil,
    pendingMessage,
    contextLevel: contextState.level,
    cautionToastPending: contextState.cautionToastPending,
    warningActive: contextState.warningActive,
    warningDecision: contextState.warningDecision,
    criticalActive: contextState.criticalActive,
    isContextBlocked: contextState.isBlocked,
    lastContextUpdate: contextState.lastUpdated,
    isOptimizingConversation,
    lastOptimization,

    // token tracking
    conversationTokens,
    contextWarning,

    loadConversation,
    sendMessage,

    regenerateLastMessage,
    setDocumentContext: stableSetDocumentContext,
    setStreamingMessage,
    setError,
    setFriendlyError: setFriendlyErrorState,
    setSelectedModel,
    setReasoningEffort,
    createNewConversation,
    resetState,
    clearErrorStates,
    markCautionToastSeen,
    acknowledgeWarning,
    clearCriticalContext,
    optimizeConversation,

    // token tracking actions
    updateTokenTracking,
    canAddMessage
  }
}

export function getSuggestedQuestions(ctx: DocumentContext | null | undefined): string[] {
  if (!ctx) {
    return [
      'How can you help me learn today?',
      'Suggest a quick study plan.',
      'What should I focus on first?'
    ]
  }
  return [
    'Give me key concepts from this document.',
    'Create a short study guide.',
    'Generate practice questions.'
  ]
}

export async function createNewConversation(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  documentId: string
): Promise<string> {
  return crypto.randomUUID()
}

// Cleanup helpers for logout flows
export function cleanupChatStoreCaches() {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('cognileap:threads')
      window.dispatchEvent(new CustomEvent('chat:threads:changed'))
    }
  } catch {
    // ignore
  }
}
