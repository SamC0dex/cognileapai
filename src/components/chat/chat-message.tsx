'use client'

import React, { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MemoizedMarkdown } from './memoized-markdown'
import type { ChatMessageProps, Citation } from './types'
import { GeminiLogo } from '@/components/icons/gemini-logo'

// Types for markdown components
interface MarkdownComponentProps {
  children?: React.ReactNode
  className?: string
  [key: string]: unknown
}

const formatRelativeTime = (date: Date): string => {
  const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const CopyButton: React.FC<{ text: string }> = React.memo(({ text }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text:', err)
    }
  }, [text])

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 hover:bg-background transition-colors opacity-0 group-hover:opacity-100"
      title={copied ? 'Copied!' : 'Copy code'}
    >
      {copied ? (
        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </motion.button>
  )
})

CopyButton.displayName = 'CopyButton'

const CitationLink: React.FC<{ 
  citation: Citation
  index: number
  onClick?: (citation: Citation) => void 
}> = React.memo(({ citation, index, onClick }) => {
  const handleClick = useCallback(() => {
    onClick?.(citation)
  }, [citation, onClick])

  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleClick}
      className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary rounded border border-primary/30 hover:border-primary/50 transition-all duration-200 cursor-pointer"
      style={{ verticalAlign: 'super', fontSize: '0.7em' }}
      title={`${citation.text}${citation.page ? ` (Page ${citation.page})` : ''}`}
    >
      {index + 1}
    </motion.button>
  )
})

CitationLink.displayName = 'CitationLink'

export const ChatMessage: React.FC<ChatMessageProps & {
  onRegenerate?: (modelOverride?: string) => void
  onCopy?: (text: string) => void
  conversationTokens?: import('../../lib/token-manager').ConversationTokens
}> = React.memo(({
  message,
  onCitationClick,
  showAvatar = true,
  onRegenerate,
  onCopy,
  conversationTokens
}) => {
  const { role, content, timestamp, isStreaming, citations } = message
  const [showActions, setShowActions] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)

  const customComponents = {
    // Custom code block component with copy button
    code({ children, className, ...props }: MarkdownComponentProps) {
      const match = /language-(\w+)/.exec(className || '')
      const isInline = !match
      
      if (isInline) {
        return (
          <code 
            className="px-1.5 py-0.5 text-sm bg-muted rounded border font-mono text-primary"
            {...props}
          >
            {children}
          </code>
        )
      }

      const codeText = String(children).replace(/\n$/, '')
      
      return (
        <div className="group relative my-4">
          <pre className="p-4 rounded-lg bg-muted text-foreground overflow-x-auto text-sm border">
            <code className={className} {...props}>
              {children}
            </code>
          </pre>
          <CopyButton text={codeText} />
        </div>
      )
    },

    // Enhanced list styling
    ul({ children }: MarkdownComponentProps) {
      return <ul className="list-disc pl-6 space-y-1 my-3">{children}</ul>
    },

    ol({ children }: MarkdownComponentProps) {
      return <ol className="list-decimal pl-6 space-y-1 my-3">{children}</ol>
    },

    // Enhanced paragraph spacing
    p({ children }: MarkdownComponentProps) {
      return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
    },

    // Enhanced blockquote styling
    blockquote({ children }: MarkdownComponentProps) {
      return (
        <blockquote className="border-l-4 border-primary pl-4 py-2 my-4 bg-muted/30 rounded-r text-foreground">
          {children}
        </blockquote>
      )
    },

    // Enhanced headers
    h1({ children }: MarkdownComponentProps) {
      return <h1 className="text-xl font-bold mt-6 mb-3 first:mt-0">{children}</h1>
    },

    h2({ children }: MarkdownComponentProps) {
      return <h2 className="text-lg font-semibold mt-5 mb-2">{children}</h2>
    },

    h3({ children }: MarkdownComponentProps) {
      return <h3 className="text-base font-medium mt-4 mb-2">{children}</h3>
    },

    // Enhanced table styling
    table({ children }: MarkdownComponentProps) {
      return (
        <div className="overflow-x-auto my-4">
          <table className="w-full border-collapse border border-border rounded-lg">
            {children}
          </table>
        </div>
      )
    },

    th({ children }: MarkdownComponentProps) {
      return (
        <th className="border border-border px-3 py-2 bg-muted font-semibold text-left text-foreground">
          {children}
        </th>
      )
    },

    td({ children }: MarkdownComponentProps) {
      return (
        <td className="border border-border px-3 py-2">
          {children}
        </td>
      )
    },

    // Enhanced strong/bold
    strong({ children }: MarkdownComponentProps) {
      return <strong className="font-semibold text-foreground">{children}</strong>
    },

    // Enhanced emphasis
    em({ children }: MarkdownComponentProps) {
      return <em className="italic text-muted-foreground">{children}</em>
    }
  }

  const handleCopyMessage = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content)
      onCopy?.(content)
    } catch (err) {
      console.error('Failed to copy message:', err)
    }
  }, [content, onCopy])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} mb-6 group`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className={`flex ${role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start gap-3 max-w-[90%] md:max-w-[85%]`}>
        {/* Modern Avatar */}
        {showAvatar && (
          <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center shadow-sm ${
            role === 'user'
              ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground'
              : 'bg-gradient-to-br from-muted to-muted/80 border border-border/50'
          }`}>
            {role === 'user' ? (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            ) : (
              <GeminiLogo size={18} />
            )}
          </div>
        )}

        {/* Message Content */}
        <div className="flex flex-col space-y-1">
          {/* Enhanced Message Bubble */}
          <div
            className={`px-4 py-3 rounded-2xl text-[15px] leading-relaxed relative transition-all duration-200 ${
              role === 'user'
                ? 'bg-primary/8 text-foreground rounded-br-md border border-primary/15 shadow-sm hover:shadow-md'
                : 'bg-background text-foreground rounded-bl-md border border-border/40 shadow-sm hover:shadow-md hover:border-border/60'
            }`}
          >
            {/* Elegant loading dots - no text, just beautiful animation */}
            {isStreaming && role === 'assistant' && content.length === 0 && (
              <div className="flex items-center justify-start py-2">
                <div className="flex items-center space-x-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{
                        opacity: [0.3, 1, 0.3],
                        scale: [0.8, 1, 0.8]
                      }}
                      transition={{
                        duration: 1.4,
                        repeat: Infinity,
                        delay: i * 0.2,
                        ease: "easeInOut"
                      }}
                      className="w-1.5 h-1.5 bg-primary/60 rounded-full"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Optimized Markdown Content with Memoization */}
            <MemoizedMarkdown
              content={content}
              isStreaming={isStreaming}
              customComponents={customComponents}
            />

            {/* Citations */}
            {citations && citations.length > 0 && !isStreaming && (
              <div className="mt-3 pt-2 border-t border-border/30">
                <p className="text-xs text-muted-foreground mb-2">Sources:</p>
                <div className="flex flex-wrap gap-2">
                  {citations.map((citation, index) => (
                    <CitationLink
                      key={citation.id}
                      citation={citation}
                      index={index}
                      onClick={onCitationClick}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Metadata for AI messages */}
            {role === 'assistant' && message.metadata?.model && !isStreaming && (
              <div className="mt-3 pt-2 border-t border-border/30 text-xs text-muted-foreground">
                <div className="flex items-center">
                  <span className="font-medium">{message.metadata.model}</span>
                </div>
              </div>
            )}

          </div>

          {/* External Action Buttons - ChatGPT Style */}
          {role === 'assistant' && !isStreaming && (
            <div className="relative min-h-[2.5rem] mt-1">
              <AnimatePresence>
                {showActions && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-1 left-0 flex items-center gap-2 z-10"
                  >
                  {/* Timestamp in prefix position */}
                  <span className="text-xs text-muted-foreground mr-1 px-2 py-1.5 rounded-md bg-background/80 backdrop-blur-sm border border-border/40 shadow-sm">
                    {formatRelativeTime(timestamp)}
                  </span>

                  {/* Copy Button */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCopyMessage}
                    className="p-1.5 rounded-md hover:bg-muted/70 transition-colors border border-border/40 bg-background/80 backdrop-blur-sm shadow-sm"
                    title="Copy message"
                  >
                    <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </motion.button>

                  {/* Regenerate Button with Model Dropdown */}
                  {onRegenerate && (
                    <div className="relative">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                        className="p-1.5 rounded-md hover:bg-muted/70 transition-colors border border-border/40 bg-background/80 backdrop-blur-sm shadow-sm flex items-center gap-1"
                        title="Regenerate response"
                      >
                        <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </motion.button>

                      {/* Model Selection Dropdown */}
                      <AnimatePresence>
                        {showModelDropdown && (
                          <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute bottom-full mb-2 left-0 bg-background/95 backdrop-blur-md border border-border rounded-lg shadow-lg py-1 min-w-[180px] z-50"
                            onMouseLeave={() => setShowModelDropdown(false)}
                          >
                            <div className="px-2 py-1 text-xs font-medium text-muted-foreground border-b border-border/50 mb-1">
                              Regenerate with:
                            </div>

                            {/* Gemini Flash Lite */}
                            <motion.button
                              whileHover={{ backgroundColor: 'hsl(var(--muted) / 0.8)' }}
                              onClick={() => {
                                onRegenerate('FLASH_LITE')
                                setShowModelDropdown(false)
                              }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-muted/80 transition-colors flex flex-col gap-0.5"
                            >
                              <span className="font-medium text-foreground">Flash Lite</span>
                              <span className="text-xs text-muted-foreground">Fastest • Simple queries</span>
                            </motion.button>

                            {/* Gemini Flash */}
                            <motion.button
                              whileHover={{ backgroundColor: 'hsl(var(--muted) / 0.8)' }}
                              onClick={() => {
                                onRegenerate('FLASH')
                                setShowModelDropdown(false)
                              }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-muted/80 transition-colors flex flex-col gap-0.5"
                            >
                              <span className="font-medium text-foreground">Flash</span>
                              <span className="text-xs text-muted-foreground">Balanced • Most tasks</span>
                            </motion.button>

                            {/* Gemini Pro */}
                            <motion.button
                              whileHover={{ backgroundColor: 'hsl(var(--muted) / 0.8)' }}
                              onClick={() => {
                                onRegenerate('PRO')
                                setShowModelDropdown(false)
                              }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-muted/80 transition-colors flex flex-col gap-0.5"
                            >
                              <span className="font-medium text-foreground">Pro</span>
                              <span className="text-xs text-muted-foreground">Most capable • Complex analysis</span>
                            </motion.button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Token Display */}
                  {(message.metadata?.tokens || conversationTokens) && (
                    <div className="px-2 py-1.5 rounded-md bg-background/80 backdrop-blur-sm border border-border/40 shadow-sm">
                      <div className="text-xs text-muted-foreground flex items-center gap-3">
                        {/* Individual Message Tokens */}
                        {(() => {
                          const apiTokens = message.metadata?.tokens
                          const estimatedTokens = Math.ceil(message.content.length / 4) // Fallback estimation
                          const messageTokens = apiTokens || estimatedTokens

                          return (
                            <div className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span>{messageTokens.toLocaleString()} tokens{!apiTokens ? ' ~' : ''}</span>
                            </div>
                          )
                        })()}

                        {/* Conversation Total */}
                        {conversationTokens && (
                          <div className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            <span>Total: {conversationTokens.totalTokens.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Three Dots - More Options (Placeholder) */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="p-1.5 rounded-md hover:bg-muted/70 transition-colors border border-border/40 bg-background/80 backdrop-blur-sm shadow-sm"
                    title="More options"
                    onClick={() => {
                      // Placeholder for future features (edit, delete, etc.)
                      console.log('More options clicked - placeholder for future features')
                    }}
                  >
                    <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
            </div>
          )}

        </div>
      </div>
    </motion.div>
  )
})

ChatMessage.displayName = 'ChatMessage'
