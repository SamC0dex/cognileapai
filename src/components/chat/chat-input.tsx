'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore } from '@/lib/chat-store'
import { GeminiLogo } from '@/components/icons/gemini-logo'
import type { ChatModelOption, ReasoningEffort } from '@/lib/use-user-preferences'
import type { ProviderInfo } from '@/lib/model-registry'
import { toast } from 'sonner'
import type { ChatInputProps } from './types'
import type { DocumentRecord, DocumentUploadedDetail } from '@/types/documents'
import { useDocuments } from '@/contexts/documents-context'

const MIN_HEIGHT = 44 // Minimum height for textarea
const MAX_HEIGHT = 144 // Maximum height (4 lines * 36px)
const LINE_HEIGHT = 24 // Approximate line height

export const ChatInput: React.FC<ChatInputProps & {
  selectedModelId?: string
  onModelIdChange?: (modelId: string) => void
  availableModels?: ChatModelOption[]
  providerInfo?: ProviderInfo | null
  reasoningEffort?: ReasoningEffort
  onCycleReasoningEffort?: () => void
  disabledReason?: string
  rateLimitCountdown?: number | null
  initialValue?: string
}> = React.memo(({
  onSendMessage,
  disabled = false,
  placeholder = 'Type your message here...',
  maxLength = 4000,
  autoFocus = false,
  selectedModelId = 'gemini-2.5-flash',
  onModelIdChange,
  availableModels = [],
  providerInfo = null,
  reasoningEffort = 'low',
  onCycleReasoningEffort,
  selectedDocuments = [],
  urlSelectedDocument = null,
  onRemoveDocument,
  disabledReason,
  rateLimitCountdown = null,
  initialValue
}) => {
  const [inputValue, setInputValue] = useState('')
  const [textareaHeight, setTextareaHeight] = useState(MIN_HEIGHT)
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  // const [lastUserMessage, setLastUserMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  // Get streaming status from chat store
  const { streamingMessage, messages } = useChatStore()
  const isSending = Boolean(streamingMessage)

  // Calculate textarea height based on content
  const calculateHeight = useCallback(() => {
    if (textareaRef.current) {
      // Reset height to get accurate scrollHeight
      textareaRef.current.style.height = `${MIN_HEIGHT}px`

      const scrollHeight = textareaRef.current.scrollHeight
      const newHeight = Math.min(Math.max(scrollHeight, MIN_HEIGHT), MAX_HEIGHT)

      setTextareaHeight(newHeight)
      textareaRef.current.style.height = `${newHeight}px`
    }
  }, [])

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [autoFocus])

  useEffect(() => {
    if (typeof initialValue === 'string' && initialValue !== inputValue) {
      setInputValue(initialValue)
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = `${MIN_HEIGHT}px`
        }
        calculateHeight()
      }, 0)
    }
  }, [initialValue, inputValue, calculateHeight])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K: Focus input
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !e.shiftKey) {
        e.preventDefault()
        textareaRef.current?.focus()
        setShowModelSelector(false)
      }
      
      // Cmd/Ctrl + Shift + K: Focus input and clear
      else if ((e.metaKey || e.ctrlKey) && e.key === 'K' && e.shiftKey) {
        e.preventDefault()
        setInputValue('')
        setTextareaHeight(MIN_HEIGHT)
        textareaRef.current?.focus()
        setShowModelSelector(false)
      }
    }

    // Only add global shortcuts when not in an input field
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true'
      
      if (!isInInput) {
        handleGlobalKeydown(e)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Clear function
  const handleClear = useCallback(() => {
    setInputValue('')
    setTextareaHeight(MIN_HEIGHT)
    if (textareaRef.current) {
      textareaRef.current.style.height = `${MIN_HEIGHT}px`
      textareaRef.current.focus()
    }
  }, [])

  // Update height when input value changes
  useEffect(() => {
    calculateHeight()
  }, [inputValue, calculateHeight])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    if (value.length <= maxLength) {
      setInputValue(value)
    }
  }, [maxLength])

  const handleSendMessage = useCallback(async () => {
    const trimmedValue = inputValue.trim()

    if (!trimmedValue || isSending || disabled) return

    // Instantly clear input for immediate feedback
    setInputValue('')
    setTextareaHeight(MIN_HEIGHT)
    if (textareaRef.current) {
      textareaRef.current.style.height = `${MIN_HEIGHT}px`
      textareaRef.current.focus()
    }

    // Send message optimistically (UI updates happen in chat-store)
    try {
      await onSendMessage(trimmedValue)
    } catch (error) {
      console.error('Failed to send message:', error)
      // Error handling is managed in chat-store
    }
  }, [inputValue, isSending, disabled, onSendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter: Send message (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
    
    // Escape: Clear input
    else if (e.key === 'Escape') {
      e.preventDefault()
      handleClear()
    }
    
    // Up arrow: Edit last user message (if input is empty and at start)
    else if (e.key === 'ArrowUp' && inputValue === '' && textareaRef.current?.selectionStart === 0) {
      e.preventDefault()
      const userMessages = messages.filter(msg => msg.role === 'user')
      const lastUserMsg = userMessages[userMessages.length - 1]
      if (lastUserMsg) {
        setInputValue(lastUserMsg.content)
        // setLastUserMessage(lastUserMsg.content)
        // Move cursor to end
        setTimeout(() => {
          if (textareaRef.current) {
            const length = lastUserMsg.content.length
            textareaRef.current.setSelectionRange(length, length)
          }
        }, 0)
      }
    }
    
    // Ctrl/Cmd + A: Select all
    else if ((e.ctrlKey || e.metaKey) && e.key === 'a' && inputValue) {
      // Let default behavior handle this
    }
    
    // Ctrl/Cmd + V: Handle paste (support for multi-line)
    else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      // Let default paste behavior handle this, but recalculate height
      setTimeout(calculateHeight, 0)
    }
  }, [handleSendMessage, inputValue, messages, calculateHeight, handleClear])

  // Listen for custom clear event
  useEffect(() => {
    const handleCustomClear = () => {
      setInputValue('')
      setTextareaHeight(MIN_HEIGHT)
      if (textareaRef.current) {
        textareaRef.current.style.height = `${MIN_HEIGHT}px`
        textareaRef.current.focus()
      }
    }

    const textarea = textareaRef.current
    if (textarea) {
      textarea.addEventListener('chat-clear', handleCustomClear)
      return () => textarea.removeEventListener('chat-clear', handleCustomClear)
    }
  }, [])

  const isOverLimit = inputValue.length > maxLength * 0.8
  const showCharacterCount = inputValue.length > 500 || isOverLimit
  const canSend = inputValue.trim().length > 0 && !isSending && !disabled

  const handleModelSelect = useCallback((modelId: string) => {
    onModelIdChange?.(modelId)
    setShowModelSelector(false)
  }, [onModelIdChange])

  // Find the currently selected model from the available models list
  const currentModel = availableModels.find(m => m.id === selectedModelId) || availableModels[0]
  const isGeminiProvider = !providerInfo || providerInfo.id === 'gemini'

  const toggleModelSelector = useCallback(() => {
    setShowModelSelector(!showModelSelector)
  }, [showModelSelector])



  // Use documents context for consistent upload experience
  const {
    addUploadingDocument,
    updateUploadingDocument,
    removeUploadingDocument,
    addSelectedDocument
  } = useDocuments()

  const handleFileUpload = useCallback(async () => {
    if (isUploading) return

    // First expand the files panel to show upload progress
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('expand-files-panel'))
    }

    // Create file input dynamically
    const input = document.createElement('input')
    input.type = 'file'
    // No accept filter — server validates MIME type
    input.multiple = false
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      if (files.length > 0) {
        setIsUploading(true)
        const file = files[0]
        
        // Generate temporary ID for optimistic update
        const tempId = `uploading-${Date.now()}-${Math.random()}`
        const documentTitle = file.name.replace(/\.[^.]+$/, '')
        
        // Mark upload intent for auto-select after refresh
        try {
          sessionStorage.setItem('cognileap-pending-chatbox-upload', documentTitle)
        } catch {
          // Ignore storage errors
        }
        
        // Add uploading document to context immediately
        addUploadingDocument({
          id: tempId,
          title: documentTitle,
          size: file.size,
          isUploading: true,
          progress: 0
        })

        try {
          const formData = new FormData()
          formData.append('file', file)

          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          })

          if (response.ok) {
            const result = await response.json() as {
              success: boolean
              alreadyExists?: boolean
              document?: DocumentRecord
            }

            // Remove uploading document
            removeUploadingDocument(tempId)

            const uploadedDocument = result.document

            if (uploadedDocument) {
              // Clear pending upload and store completed document ID
              try {
                sessionStorage.removeItem('cognileap-pending-chatbox-upload')
                sessionStorage.setItem('cognileap-chatbox-uploaded-doc', uploadedDocument.id)
              } catch {
                // Ignore storage errors
              }

              // Auto-select the uploaded document in chat
              addSelectedDocument({
                id: uploadedDocument.id,
                title: uploadedDocument.title,
                size: uploadedDocument.bytes || undefined,
                processing_status: uploadedDocument.processing_status || undefined
              })

              if (result.alreadyExists) {
                toast.info(`"${uploadedDocument.title || file.name}" is already uploaded and selected for chat.`)
              } else {
                toast.success(`"${file.name}" uploaded successfully and selected for chat!`)
              }

              if (typeof window !== 'undefined') {
                const detail: DocumentUploadedDetail = {
                  document: uploadedDocument,
                  alreadyExists: result.alreadyExists
                }
                window.dispatchEvent(new CustomEvent<DocumentUploadedDetail>('document-uploaded', { detail }))
              }
            } else {
              toast.success(`"${file.name}" uploaded successfully!`)
            }
          } else {
            const error = await response.json()
            
            // Update uploading document with error
            updateUploadingDocument(tempId, {
              error: error.error || 'Upload failed'
            })

            toast.error(error.error || 'Upload failed')

            // Remove failed upload after 3 seconds
            setTimeout(() => {
              removeUploadingDocument(tempId)
            }, 3000)
          }
        } catch (error) {
          // Update uploading document with error
          updateUploadingDocument(tempId, {
            error: 'Network error'
          })

          toast.error('Upload failed')
          console.error('Upload error:', error)

          // Remove failed upload after 3 seconds
          setTimeout(() => {
            removeUploadingDocument(tempId)
          }, 3000)
        } finally {
          setIsUploading(false)
        }
      }
    }
    input.click()
  }, [isUploading, addUploadingDocument, updateUploadingDocument, removeUploadingDocument, addSelectedDocument])

  return (
    <div className="border-t border-border/50 bg-background/80 backdrop-blur-xl mb-[0.3rem]">
      <div className="px-6 pb-[0.6rem] pt-2 max-w-4xl mx-auto">
        {/* Selected Documents Pills - Above the chat box */}
        {(selectedDocuments.length > 0 || urlSelectedDocument) && (
          <div className="mb-1.5">
            <div className="flex flex-wrap gap-2">
              {selectedDocuments.map(doc => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="group inline-flex items-center gap-1.5 px-2 py-1 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 text-xs rounded-md border border-red-200 dark:border-red-800/30 max-w-48"
                >
                  <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                  </svg>
                  <span className="truncate font-medium" title={doc.title}>
                    {doc.title}
                  </span>
                  {doc.processing_status === 'processing' && (
                    <div className="w-2 h-2 border border-red-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  )}
                  {doc.processing_status === 'completed' && (
                    <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                  )}
                  {onRemoveDocument && (
                    <button
                      onClick={() => onRemoveDocument(doc.id)}
                      className="ml-1 w-3 h-3 rounded-full hover:bg-red-200 dark:hover:bg-red-800/40 flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                      title="Remove document"
                    >
                      <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </motion.div>
              ))}

              {urlSelectedDocument && !selectedDocuments.some(doc => doc.id === urlSelectedDocument.id) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="group inline-flex items-center gap-1.5 px-2 py-1 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 text-xs rounded-md border border-red-200 dark:border-red-800/30 max-w-48"
                >
                  <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                  </svg>
                  <span className="truncate font-medium" title={urlSelectedDocument.title}>
                    {urlSelectedDocument.title}
                  </span>
                  {urlSelectedDocument.processing_status === 'processing' && (
                    <div className="w-2 h-2 border border-red-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  )}
                  {urlSelectedDocument.processing_status === 'completed' && (
                    <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                  )}
                  {onRemoveDocument && (
                    <button
                      onClick={() => onRemoveDocument(urlSelectedDocument.id)}
                      className="ml-1 w-3 h-3 rounded-full hover:bg-red-200 dark:hover:bg-red-800/40 flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                      title="Remove document"
                    >
                      <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        )}

        {/* Main Input Container */}
        <div className="relative">
          {/* Let height be natural so the textarea stays inside the card */}
          <div
            className="relative bg-background rounded-2xl border border-border/50 ring-1 ring-primary/10 shadow-lg hover:shadow-xl transition-all duration-300 focus-within:border-primary/40 focus-within:ring-primary/20 focus-within:shadow-primary/10"
          >
            {/* Model Selector & Controls Bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
              <div className="flex items-center gap-3">
                {/* Model Selector */}
                <div className="relative">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={toggleModelSelector}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-primary/10 text-primary rounded-lg border border-primary/20 hover:bg-primary/15 transition-all duration-200 dark:bg-primary/20 dark:border-primary/40"
                  >
                    {isGeminiProvider ? (
                      <GeminiLogo size={16} />
                    ) : (
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                        style={{ backgroundColor: providerInfo?.color || '#4285F4' }}
                      >
                        {providerInfo?.name?.charAt(0) || 'G'}
                      </div>
                    )}
                    <span>{currentModel?.name || 'Select Model'}</span>
                    <svg className={`w-3 h-3 transition-transform duration-200 ${showModelSelector ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </motion.button>

                  {/* Model Dropdown */}
                  <AnimatePresence>
                    {showModelSelector && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.98 }}
                        transition={{ duration: 0.12, ease: 'easeOut' }}
                        className="absolute bottom-full left-0 mb-2 w-72 max-h-[60vh] overflow-auto bg-background rounded-xl border border-border shadow-xl z-50"
                      >
                        {providerInfo && (
                          <div className="px-3 py-2 border-b border-border/50">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <div
                                className="w-3 h-3 rounded flex items-center justify-center text-white text-[6px] font-bold shrink-0"
                                style={{ backgroundColor: providerInfo.color }}
                              >
                                {providerInfo.name.charAt(0)}
                              </div>
                              <span>{providerInfo.name}</span>
                            </div>
                          </div>
                        )}
                        <div className="p-2">
                          {availableModels.map((model) => {
                            const isSelected = selectedModelId === model.id
                            // For the selected model, show reasoning effort (clickable to cycle)
                            // For unselected models, show cost tier (static)
                            const badgeLabel = isSelected ? reasoningEffort : model.costTier
                            const effortColors = {
                              low: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
                              medium: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
                              high: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
                              free: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
                            }

                            return (
                              <motion.button
                                key={model.id}
                                whileHover={{ scale: 1.01, x: 4 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handleModelSelect(model.id)}
                                className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
                                  isSelected
                                    ? 'bg-primary/15 text-primary border border-primary/20'
                                    : 'hover:bg-muted/50 text-foreground'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {isGeminiProvider ? (
                                      <GeminiLogo size={14} />
                                    ) : (
                                      <div
                                        className="w-3.5 h-3.5 rounded flex items-center justify-center text-white text-[7px] font-bold shrink-0"
                                        style={{ backgroundColor: providerInfo?.color || '#4285F4' }}
                                      >
                                        {providerInfo?.name?.charAt(0) || 'G'}
                                      </div>
                                    )}
                                    <div>
                                      <div className="font-medium text-sm">{model.name}</div>
                                      <div className="text-xs text-muted-foreground mt-0.5">{model.description}</div>
                                    </div>
                                  </div>
                                  <div
                                    onClick={isSelected ? (e: React.MouseEvent) => {
                                      e.stopPropagation()
                                      onCycleReasoningEffort?.()
                                    } : undefined}
                                    className={`px-2 py-1 text-xs rounded-full transition-all duration-150 ${effortColors[badgeLabel] || effortColors.low} ${
                                      isSelected ? 'cursor-pointer hover:ring-2 hover:ring-primary/30 hover:scale-105' : ''
                                    }`}
                                    title={isSelected ? `Reasoning: ${reasoningEffort} — click to cycle` : model.costTier}
                                  >
                                    {badgeLabel}
                                  </div>
                                </div>
                              </motion.button>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {/* Search removed by request */}
                {/* Attach button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleFileUpload}
                  disabled={isUploading}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-border hover:bg-muted/50 text-foreground transition-all duration-200 ${
                    isUploading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  title={isUploading ? "Uploading..." : "Upload document or image"}
                >
                  {isUploading ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.44 11.05l-7.07 7.07a5 5 0 11-7.07-7.07l7.07-7.07a3 3 0 114.24 4.24l-7.07 7.07a1 1 0 01-1.42-1.42l6.36-6.36" />
                    </svg>
                  )}
                </motion.button>

              </div>
              
              {/* Right side controls */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>⇧ + ⏎ for new line</span>
              </div>
            </div>
            
            {/* Text Input Area */}
            <div className="relative px-4 pt-4 pb-[0.36rem]">
              <textarea
                ref={textareaRef}
                data-chat-input
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className="w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed pr-16"
                style={{ 
                  height: textareaHeight,
                  minHeight: MIN_HEIGHT,
                  maxHeight: MAX_HEIGHT,
                  lineHeight: `${LINE_HEIGHT}px`
                }}
                rows={1}
              />
            
              {/* Action Buttons */}
              <div className="absolute right-2 top-2 flex items-center gap-2">
                {/* Clear Button */}
                <AnimatePresence>
                  {inputValue && !disabled && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleClear}
                      className="w-8 h-8 rounded-lg bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors"
                      title="Clear input"
                    >
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </motion.button>
                  )}
                </AnimatePresence>

                {/* Send Button - Enhanced for instant feedback */}
                <motion.button
                  whileHover={canSend ? { scale: 1.05, y: -1 } : {}}
                  whileTap={canSend ? { scale: 0.95 } : {}}
                  onClick={handleSendMessage}
                  disabled={!canSend}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 ${
                    canSend
                      ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg hover:shadow-xl hover:shadow-primary/25 dark:from-teal-600 dark:to-teal-700 dark:text-white dark:hover:from-teal-700 dark:hover:to-teal-800'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                  }`}
                  title={isSending ? 'AI is responding...' : 'Send message'}
                >
                  {isSending ? (
                    <motion.svg
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </motion.svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                  )}
                </motion.button>
              </div>
            </div>
          </div>
        </div>

        {disabled && disabledReason && (
          <div className="px-2 pt-2 text-xs text-amber-600 dark:text-amber-400">
            {disabledReason}
            {typeof rateLimitCountdown === 'number' && rateLimitCountdown > 0 && ` (${rateLimitCountdown}s)`}
          </div>
        )}

        {/* Footer */}
        {(showCharacterCount || isSending) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-between items-center mt-2 px-2"
          >
            <div className="flex items-center gap-3">
              {/* Status Indicator */}
              {isSending && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs text-muted-foreground">
                    AI is thinking...
                  </span>
                </div>
              )}
            </div>

            {/* Character Count */}
            {showCharacterCount && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2"
              >
                <span className={`text-xs font-medium transition-colors ${
                  isOverLimit ? 'text-red-500' : 'text-muted-foreground'
                }`}>
                  {inputValue.length}{maxLength ? `/${maxLength}` : ''}
                </span>
                {isOverLimit && (
                  <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.865-.833-2.635 0L4.232 15.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
})

ChatInput.displayName = 'ChatInput'
