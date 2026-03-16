'use client'

import { useCallback, useEffect } from 'react'
import {
  useChatStore,
  createNewConversation,
  getSuggestedQuestions
} from './chat-store'

export type {
  ContextLevel,
  WarningDecision,
  WarningResolution,
  OptimizationSummary
} from './chat-store'

/**
 * Custom hook for chat functionality
 * Provides a simplified API for components to interact with the chat store
 */
export function useChat(documentId?: string, conversationId?: string, selectedDocuments?: Array<{id: string, title: string}>) {
  const store = useChatStore()

  // Initialize conversation when documentId or conversationId changes
  useEffect(() => {
    if (conversationId) {
      // Load existing conversation (with optional documentId)
      store.loadConversation(conversationId, documentId)
    } else if (documentId) {
      // Set up new conversation context for document-specific chat
      store.setDocumentContext({
        id: documentId,
        title: 'Document', // This should be fetched from document data
        sections: []
      })
    }
    // If neither conversationId nor documentId, this is a new general chat (no initialization needed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, conversationId, store.loadConversation, store.setDocumentContext]) // store object recreated every render - individual function deps are correct pattern

  // Send message with simplified API
  const sendMessage = useCallback(async (content: string, modelOverride?: string) => {
    if (!content.trim()) return

    try {
      await store.sendMessage(content.trim(), documentId, modelOverride, selectedDocuments)
      store.clearErrorStates()
    } catch (error) {
      console.error('Failed to send message:', error)
      store.setError(error instanceof Error ? error.message : 'Failed to send message')
    }
  }, [store, documentId, selectedDocuments])



  // Regenerate last message with optional model override
  const regenerateLastMessage = useCallback(async (modelOverride?: string) => {
    try {
      await store.regenerateLastMessage(modelOverride, selectedDocuments)
      store.clearErrorStates()
    } catch (error) {
      console.error('Failed to regenerate message:', error)
      store.setError(error instanceof Error ? error.message : 'Failed to regenerate message')
    }
  }, [store, selectedDocuments])

  // Create new conversation
  const createConversation = useCallback(async () => {
    if (!documentId) return null
    
    return await createNewConversation(documentId)
  }, [documentId])

  // Get suggested questions
  const suggestedQuestions = getSuggestedQuestions(store.documentContext)

  // Computed values
  const isStreaming = Boolean(store.streamingMessage)
  const hasMessages = store.messages.length > 0
  const lastMessage = store.messages[store.messages.length - 1]
  const isLastMessageFromUser = lastMessage?.role === 'user'
  const canRegenerateLastMessage = hasMessages && !isLastMessageFromUser && !isStreaming

  return {
    // State
    messages: store.messages,
    isLoading: store.isLoading,
    isStreaming,
    streamingMessage: store.streamingMessage,
    error: store.error,
    friendlyError: store.friendlyError,
    documentContext: store.documentContext,
    currentConversation: store.currentConversation,
    autoRetryState: store.autoRetryState,
    rateLimitUntil: store.rateLimitUntil,
    pendingMessage: store.pendingMessage,
    contextLevel: store.contextLevel,
    cautionToastPending: store.cautionToastPending,
    warningActive: store.warningActive,
    warningDecision: store.warningDecision,
    criticalActive: store.criticalActive,
    isContextBlocked: store.isContextBlocked,
    lastContextUpdate: store.lastContextUpdate,
    isOptimizingConversation: store.isOptimizingConversation,
    lastOptimization: store.lastOptimization,

    // Token tracking
    conversationTokens: store.conversationTokens,
    contextWarning: store.contextWarning,

    // Computed values
    hasMessages,
    lastMessage,
    canRegenerateLastMessage,
    suggestedQuestions,

    // Actions
    sendMessage,
    regenerateLastMessage,
    createConversation,
    setError: store.setError,
    setFriendlyError: store.setFriendlyError,
    resetState: store.resetState,
    clearErrorStates: store.clearErrorStates,
    updateTokenTracking: store.updateTokenTracking,
    canAddMessage: store.canAddMessage,
    markCautionToastSeen: store.markCautionToastSeen,
    acknowledgeWarning: store.acknowledgeWarning,
    clearCriticalContext: store.clearCriticalContext,
    optimizeConversation: store.optimizeConversation,
    
    // Advanced actions (direct store access)
    loadConversation: store.loadConversation,
    setDocumentContext: store.setDocumentContext,
    setStreamingMessage: store.setStreamingMessage
  }
}

/**
 * Hook for chat input focus management
 * Provides utilities for managing input focus across the app
 */
export function useChatInputFocus() {
  const focusInput = useCallback(() => {
    const input = document.querySelector('textarea[data-chat-input]') as HTMLTextAreaElement
    if (input) {
      input.focus()
    }
  }, [])

  const clearAndFocusInput = useCallback(() => {
    const input = document.querySelector('textarea[data-chat-input]') as HTMLTextAreaElement
    if (input) {
      // Trigger clear via custom event
      input.dispatchEvent(new CustomEvent('chat-clear'))
      input.focus()
    }
  }, [])

  return {
    focusInput,
    clearAndFocusInput
  }
}