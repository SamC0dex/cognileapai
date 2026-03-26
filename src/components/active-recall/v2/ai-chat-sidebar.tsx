'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle,
  X,
  Send,
  Sparkles,
  Loader2,
  Bot,
  User,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const SUGGESTED_QUESTIONS = [
  'Am I ready for my exam?',
  'What should I study today?',
  'Why do I keep failing certain topics?',
  'Make me a study plan for this week',
  'How is my progress overall?',
]

const panelSpring = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 40,
  mass: 0.8,
}

interface AIChatSidebarProps {
  isOpen: boolean
  onToggle: () => void
}

export function AIChatSidebar({ isOpen, onToggle }: AIChatSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setIsStreaming(true)

    // Create placeholder assistant message
    const assistantId = crypto.randomUUID()
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }
    setMessages([...updatedMessages, assistantMessage])

    try {
      abortControllerRef.current = new AbortController()

      const response = await fetch('/api/active-recall/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error('Chat request failed')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader')

      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        const lines = text.split('\n').filter(Boolean)

        for (const line of lines) {
          if (line.startsWith('0:')) {
            const chunk = JSON.parse(line.slice(2))
            accumulated += chunk
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated } : m
              )
            )
          } else if (line.startsWith('3:')) {
            const error = JSON.parse(line.slice(2))
            throw new Error(error)
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return
      console.error('[AIChatSidebar] Error:', error)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: 'Sorry, I had trouble responding. Please try again.' }
            : m
        )
      )
    } finally {
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const clearChat = () => {
    setMessages([])
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsStreaming(false)
  }

  return (
    <>
      {/* Floating Toggle Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={onToggle}
            className={cn(
              'fixed bottom-6 right-6 z-[250]',
              'flex items-center gap-2 px-4 py-3 rounded-full',
              'bg-primary text-primary-foreground shadow-lg',
              'hover:shadow-xl hover:scale-105 active:scale-95',
              'transition-shadow'
            )}
          >
            <Sparkles className="h-5 w-5" />
            <span className="text-sm font-medium">Ask AI</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop on mobile */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[290] bg-black/30 backdrop-blur-sm md:hidden"
              onClick={onToggle}
            />

            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              transition={panelSpring}
              className={cn(
                'fixed right-0 top-0 bottom-0 z-[300]',
                'flex flex-col',
                'w-full sm:w-[400px] max-w-full',
                'bg-background border-l border-border shadow-2xl'
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Study Coach</h3>
                    <p className="text-xs text-muted-foreground">Powered by AI</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {messages.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={clearChat}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggle}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {messages.length === 0 ? (
                  <EmptyState onSuggest={sendMessage} />
                ) : (
                  messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} isStreaming={isStreaming && msg.role === 'assistant' && msg === messages[messages.length - 1]} />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border p-3">
                <div className="flex items-end gap-2">
                  <div className="relative flex-1">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask anything about your studies..."
                      rows={1}
                      className={cn(
                        'w-full resize-none rounded-xl border border-border bg-muted/50 px-4 py-3 pr-12',
                        'text-sm placeholder:text-muted-foreground',
                        'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40',
                        'max-h-32'
                      )}
                      style={{
                        height: 'auto',
                        minHeight: '44px',
                      }}
                      onInput={(e) => {
                        const el = e.target as HTMLTextAreaElement
                        el.style.height = 'auto'
                        el.style.height = Math.min(el.scrollHeight, 128) + 'px'
                      }}
                    />
                  </div>
                  <Button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || isStreaming}
                    size="icon"
                    className="h-11 w-11 rounded-xl shrink-0"
                  >
                    {isStreaming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

function EmptyState({ onSuggest }: { onSuggest: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-4">
        <Bot className="h-7 w-7 text-primary" />
      </div>
      <h3 className="text-base font-semibold mb-1">Your Study Coach</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-[260px]">
        I know your learning data. Ask me anything about your progress, study strategy, or exam prep.
      </p>
      <div className="w-full space-y-2">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onSuggest(q)}
            className={cn(
              'w-full text-left text-sm px-4 py-2.5 rounded-xl',
              'border border-border hover:border-primary/30',
              'hover:bg-muted/50 transition-colors',
              'text-muted-foreground hover:text-foreground'
            )}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  isStreaming,
}: {
  message: ChatMessage
  isStreaming: boolean
}) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('flex gap-2.5', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser && (
        <div className="flex items-start">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10 shrink-0 mt-0.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
        </div>
      )}

      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="whitespace-pre-wrap">
            {message.content || (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Thinking...
              </span>
            )}
            {isStreaming && message.content && (
              <span className="inline-block w-1.5 h-4 bg-primary/60 rounded-sm animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex items-start">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-muted shrink-0 mt-0.5">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      )}
    </motion.div>
  )
}
