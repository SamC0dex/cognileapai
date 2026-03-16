'use client'

import React, { useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChatMessage } from './chat-message'
import type { Message, Citation } from './types'

interface ChatMessagesProps {
  messages: Message[]
  isLoading: boolean
  error: string | null
  streamingMessage?: string | null
  onCitationClick: (citation: Citation) => void
  onScrollStateChange: (userScrolled: boolean, showScrollButton: boolean) => void
  onRegenerate?: (modelOverride?: string) => void
  onCopy?: (text: string) => void
  forceScrollToBottom?: number
  conversationTokens?: import('../../lib/token-manager').ConversationTokens
}

const LoadingSkeleton = React.memo(() => (
  <div className="space-y-4 p-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="flex justify-start">
        <div className="flex items-start gap-3 max-w-[85%]">
          <div className="w-8 h-8 bg-muted rounded-full loading-shimmer" />
          <div className="space-y-2">
            <div className="w-64 h-4 bg-muted rounded loading-shimmer" />
            <div className="w-48 h-4 bg-muted rounded loading-shimmer" />
            <div className="w-32 h-4 bg-muted rounded loading-shimmer" />
          </div>
        </div>
      </div>
    ))}
  </div>
))

LoadingSkeleton.displayName = 'LoadingSkeleton'

export const ChatMessages = React.memo<ChatMessagesProps>(({
  messages,
  isLoading,
  error,
  onCitationClick,
  onScrollStateChange,
  onRegenerate,
  onCopy,
  forceScrollToBottom = 0,
  conversationTokens
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logic
  const scrollToBottom = useCallback((smooth = true, force = false) => {
    if (messagesEndRef.current && (force || !document.querySelector('[data-user-scrolled="true"]'))) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'end'
      })
      if (messagesContainerRef.current) {
        messagesContainerRef.current.removeAttribute('data-user-scrolled')
      }
    }
  }, [])

  // Handle scroll detection
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
    const userScrolled = !isNearBottom
    const showScrollButton = !isNearBottom && messages.length > 3

    if (userScrolled) {
      messagesContainerRef.current.setAttribute('data-user-scrolled', 'true')
    } else {
      messagesContainerRef.current.removeAttribute('data-user-scrolled')
    }

    onScrollStateChange(userScrolled, showScrollButton)
  }, [messages.length, onScrollStateChange])

  // Auto-scroll on new messages
  useEffect(() => {
    const timer = setTimeout(() => scrollToBottom(), 100)
    return () => clearTimeout(timer)
  }, [messages, scrollToBottom])

  // Force scroll when requested
  useEffect(() => {
    if (forceScrollToBottom > 0) {
      scrollToBottom(true, true)
    }
  }, [forceScrollToBottom, scrollToBottom])

  return (
    <div
      ref={messagesContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto scrollbar-enhanced optimized-container"
      style={{ minHeight: 0 }}
    >
      {/* Loading State */}
      {isLoading && <LoadingSkeleton />}

      {/* Error State */}
      {error && (
        <div className="p-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-red-100 dark:bg-red-800 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.865-.833-2.635 0L4.232 15.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-red-800 dark:text-red-200">Error</h4>
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Messages */}
      {!isLoading && (
        <div className="p-4 space-y-1">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onCitationClick={onCitationClick}
                onRegenerate={onRegenerate}
                onCopy={onCopy}
                conversationTokens={conversationTokens}
                showAvatar={true}
                showTimestamp={true}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Scroll anchor */}
      <div ref={messagesEndRef} />
    </div>
  )
})

ChatMessages.displayName = 'ChatMessages'