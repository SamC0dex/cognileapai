'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Send,
  Sparkles,
  Loader2,
  Bot,
  User,
  Trash2,
  Search,
  Zap,
  TreePine,
  FileText,
  FlaskConical,
  Play,
  Bell,
  CheckCircle2,
  AlertCircle,
  Plus,
  History,
  MessageSquare,
  ArrowLeft,
  PenSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { MemoizedMarkdown } from '@/components/chat/memoized-markdown'
import { useDocuments } from '@/contexts/documents-context'

// ============================================
// Chat History Persistence
// ============================================

const CONVERSATIONS_STORAGE_KEY = 'ar-agent-conversations'
const ACTIVE_CONVO_KEY = 'ar-agent-active-convo'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  actions?: AgentAction[]
}

interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

// ============================================
// Agent Action Types
// ============================================

type AgentActionType = 'CHECK_TOOLS' | 'GENERATE_TOOLS' | 'SYNC_CARDS' | 'CREATE_PLAN' | 'ADAPT_PLAN' | 'SET_REMINDERS' | 'START_REVIEW'

interface AgentAction {
  id: string
  type: AgentActionType
  payload: Record<string, unknown>
  status: 'pending' | 'running' | 'done' | 'error'
  result?: unknown
}

const ACTION_REGEX = /<!--ACTION:(\w+):(.*?)-->/g

function parseActions(text: string): { cleanText: string; actions: AgentAction[] } {
  const actions: AgentAction[] = []
  const cleanText = text.replace(ACTION_REGEX, (_, type, payloadStr) => {
    try {
      const payload = JSON.parse(payloadStr)
      actions.push({
        id: `action-${actions.length}-${Date.now()}`,
        type: type as AgentActionType,
        payload,
        status: 'pending',
      })
    } catch {
      // Skip malformed
    }
    return ''
  })
  return { cleanText: cleanText.trim(), actions }
}

// ============================================
// LocalStorage helpers
// ============================================

function loadConversations(): Conversation[] {
  try {
    const stored = localStorage.getItem(CONVERSATIONS_STORAGE_KEY)
    if (!stored) return []
    const convos: Conversation[] = JSON.parse(stored)
    // Reset stale action statuses — mark interrupted actions as done (backend likely succeeded)
    return convos.map((c) => ({
      ...c,
      messages: c.messages.map((m) => ({
        ...m,
        actions: m.actions?.map((a) =>
          a.status === 'pending' || a.status === 'running'
            ? { ...a, status: 'done' as const, result: a.result || { note: 'Completed (page was refreshed)' } }
            : a
        ),
      })),
    }))
  } catch {
    return []
  }
}

function saveConversations(convos: Conversation[]) {
  try {
    // Keep only the latest 50 conversations to avoid storage issues
    const trimmed = convos.slice(0, 50)
    localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Storage full — trim more aggressively
    try {
      localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(convos.slice(0, 20)))
    } catch { /* give up */ }
  }
}

function getActiveConvoId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CONVO_KEY)
  } catch {
    return null
  }
}

function setActiveConvoId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_CONVO_KEY, id)
    else localStorage.removeItem(ACTIVE_CONVO_KEY)
  } catch { /* ignore */ }
}

// Migrate old single-chat format to new conversations format
function migrateOldChatHistory(): Conversation | null {
  try {
    const old = localStorage.getItem('ar-agent-chat-history')
    if (!old) return null
    const messages: ChatMessage[] = JSON.parse(old)
    if (!messages.length) return null
    const convo: Conversation = {
      id: crypto.randomUUID(),
      title: messages[0]?.content?.slice(0, 60) || 'Previous conversation',
      messages,
      createdAt: messages[0]?.timestamp || new Date().toISOString(),
      updatedAt: messages[messages.length - 1]?.timestamp || new Date().toISOString(),
    }
    localStorage.removeItem('ar-agent-chat-history')
    return convo
  } catch {
    return null
  }
}

function generateConvoTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (!firstUser) return 'New conversation'
  const text = firstUser.content.replace(/\[Selected documents:.*?\]\n\n/s, '').trim()
  return text.length > 50 ? text.slice(0, 50) + '...' : text || 'New conversation'
}

// ============================================
// Suggested Questions
// ============================================

const SUGGESTED_QUESTIONS = [
  'I want to study a document',
  'Create a study plan for my exam',
  'What should I study today?',
  'Adjust my current plan',
  'Remind me to study at 7pm',
  'How is my progress overall?',
  'Help me review weak topics',
]

function getCurrentPlanId(): string | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/^\/active-recall\/plan\/([^/]+)/)
  return match?.[1] || null
}

async function getCurrentPlanContextForAgent(): Promise<string | null> {
  const planId = getCurrentPlanId()
  if (!planId) return null

  try {
    const res = await fetch(`/api/active-recall/agent/plans/${planId}`)
    if (!res.ok) return `[Active plan id: ${planId}]`
    const data = await res.json()
    const plan = data.plan
    const stats = data.stats
    if (!plan) return `[Active plan id: ${planId}]`

    const schedule = Array.isArray(plan.schedule) ? plan.schedule : []
    const today = schedule.find((day: { day: number }) => day.day === plan.currentDay)
    const nextActivity = today?.activities?.find((activity: { completed?: boolean; completionStatus?: string }) =>
      !activity.completed && activity.completionStatus !== 'completed'
    )
    const scheduleLines = schedule.slice(0, 10).map((day: {
      day: number
      date?: string
      activities?: Array<{
        type: string
        topic: string
        generationStatus?: string
        completionStatus?: string
        generatedSourceId?: string | null
        reviewedCount?: number
      }>
    }) => {
      const activities = (day.activities || []).map((activity) =>
        `${activity.type}:${activity.topic} [material=${activity.generationStatus || 'unknown'}, status=${activity.completionStatus || 'unknown'}${activity.reviewedCount ? `, reviewed=${activity.reviewedCount}` : ''}${activity.generatedSourceId ? ', hasSource=true' : ''}]`
      ).join('; ')
      return `Day ${day.day}${day.date ? ` (${day.date})` : ''}: ${activities}`
    }).join('\n')

    return [
      '[Active study plan context]',
      `Plan: ${plan.title} (${plan.id})`,
      `Status: ${plan.status}; current day ${plan.currentDay}/${plan.totalDays}; completed ${plan.completed_activities}/${plan.total_activities}`,
      `Generated review items: ${stats?.totalCards ?? 0}; due now: ${stats?.dueCards ?? 0}`,
      nextActivity ? `Next incomplete activity today: ${nextActivity.type} - ${nextActivity.topic}` : 'Today activities complete.',
      `Schedule:\n${scheduleLines}`,
    ].join('\n')
  } catch {
    return `[Active plan id: ${planId}]`
  }
}

function isPlanAdaptationRequest(text: string): boolean {
  const normalized = text.toLowerCase()
  const intentWords = ['adapt', 'adjust', 'change', 'rebalance', 'reschedule', 'modify', 'easier', 'harder', 'lighter', 'more focus', 'weak']
  const planWords = ['plan', 'tomorrow', 'future', 'upcoming', 'next day', 'next days', 'schedule']
  return intentWords.some((word) => normalized.includes(word))
    && planWords.some((word) => normalized.includes(word))
}

function parseReminderTime(text: string): string | null {
  const normalized = text.toLowerCase()
  const twelveHour = normalized.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/)
  if (twelveHour) {
    let hours = Number(twelveHour[1])
    const minutes = twelveHour[2] || '00'
    if (twelveHour[3] === 'pm' && hours !== 12) hours += 12
    if (twelveHour[3] === 'am' && hours === 12) hours = 0
    return `${String(hours).padStart(2, '0')}:${minutes}`
  }

  const twentyFourHour = normalized.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
  if (twentyFourHour) {
    return `${String(Number(twentyFourHour[1])).padStart(2, '0')}:${twentyFourHour[2]}`
  }

  return null
}

function isReminderRequest(text: string): boolean {
  const normalized = text.toLowerCase()
  return ['remind', 'reminder', 'notification', 'notify', 'push'].some((word) => normalized.includes(word))
}

const panelSpring = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 40,
  mass: 0.8,
}

interface AIChatSidebarProps {
  isOpen: boolean
  onToggle: () => void
  pendingPrompt?: { id: string; text: string; autoSend?: boolean } | null
  onPendingPromptHandled?: () => void
}

export function AIChatSidebar({ isOpen, onToggle, pendingPrompt, onPendingPromptHandled }: AIChatSidebarProps) {
  // Conversation management
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const convos = loadConversations()
    // Migrate old format if needed
    const migrated = migrateOldChatHistory()
    if (migrated) {
      const updated = [migrated, ...convos]
      saveConversations(updated)
      return updated
    }
    return convos
  })
  const [activeConvoId, setActiveConvoIdState] = useState<string | null>(() => getActiveConvoId())
  const [showHistory, setShowHistory] = useState(false)

  const activeConvo = conversations.find((c) => c.id === activeConvoId) || null
  const messages = useMemo(() => activeConvo?.messages || [], [activeConvo])

  const setMessages = useCallback((updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setConversations((prev) => {
      if (!activeConvoId) return prev
      return prev.map((c) => {
        if (c.id !== activeConvoId) return c
        const newMessages = typeof updater === 'function' ? updater(c.messages) : updater
        return {
          ...c,
          messages: newMessages,
          title: generateConvoTitle(newMessages),
          updatedAt: new Date().toISOString(),
        }
      })
    })
  }, [activeConvoId])

  const switchConvo = useCallback((id: string | null) => {
    setActiveConvoIdState(id)
    setActiveConvoId(id)
    setShowHistory(false)
  }, [])

  const startNewConvo = useCallback(() => {
    const newConvo: Conversation = {
      id: crypto.randomUUID(),
      title: 'New conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setConversations((prev) => [newConvo, ...prev])
    switchConvo(newConvo.id)
  }, [switchConvo])

  const deleteConvo = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeConvoId === id) {
      switchConvo(null)
    }
  }, [activeConvoId, switchConvo])

  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  // showDocPicker removed — file selection now done via Files panel
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Document selection from shared context
  const {
    selectedDocuments,
    addSelectedDocument,
    removeSelectedDocument,
    refreshDocuments,
  } = useDocuments()

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
      refreshDocuments()
      // Auto-create a conversation if none active
      if (!activeConvoId && conversations.length === 0) {
        startNewConvo()
      } else if (!activeConvoId && conversations.length > 0) {
        // Resume most recent conversation
        switchConvo(conversations[0].id)
      }
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist conversations
  useEffect(() => {
    saveConversations(conversations)
  }, [conversations])

  // Persist active convo id
  useEffect(() => {
    setActiveConvoId(activeConvoId)
  }, [activeConvoId])

  // ============================================
  // Action Dispatcher
  // ============================================

  const handleAgentAction = useCallback(async (action: AgentAction, messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
            ...m,
            actions: m.actions?.map((a) =>
              a.id === action.id ? { ...a, status: 'running' as const } : a
            ),
          }
          : m
      )
    )

    try {
      let result: unknown = null

      switch (action.type) {
        case 'CHECK_TOOLS': {
          const res = await fetch('/api/active-recall/agent/discover-tools', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documentId: action.payload.documentId }),
            signal: AbortSignal.timeout(30000),
          })
          result = res.ok ? await res.json() : { error: `Failed to discover tools (${res.status})` }
          break
        }

        case 'GENERATE_TOOLS': {
          const types = (action.payload.types as string[]) || ['flashcards']
          const documentId = action.payload.documentId as string
          const topics = action.payload.topics as string[] | undefined
          const results: Array<{ type: string; success: boolean; error?: string }> = []

          for (const toolType of types) {
            try {
              const body: Record<string, unknown> = {
                id: crypto.randomUUID(),
                type: toolType,
                documentId,
              }
              // For mind maps with topics: pass them as batch in one request
              if (toolType === 'mind-map' && topics?.length) {
                body.mindMapOptions = {
                  batchTopics: topics,
                  customInstructions: 'Build each map at the size and depth the source material deserves. Do not make tiny placeholder maps.',
                }
              }
              const res = await fetch('/api/study-tools/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(180000), // 3min for batch
              })
              if (!res.ok) {
                results.push({ type: toolType, success: false, error: `Failed (${res.status})` })
                continue
              }

              const data = await res.json()

              // Add generated content to the appropriate Zustand store so it appears in the Study Tools panel
              if (toolType === 'flashcards' && data.cards) {
                const { useFlashcardStore } = await import('@/lib/flashcard-store')
                useFlashcardStore.getState().addFlashcardSet({
                  id: data.id || crypto.randomUUID(),
                  title: data.title,
                  cards: data.cards,
                  options: data.options,
                  createdAt: new Date(data.metadata?.generatedAt || new Date()),
                  documentId,
                  metadata: {
                    totalCards: data.cards.length,
                    avgDifficulty: data.options?.difficulty || 'medium',
                    generationTime: data.metadata?.duration || 0,
                    model: data.metadata?.model || 'gemini-3-flash',
                    sourceContentLength: data.metadata?.sourceContentLength || 0,
                    isGenerating: false,
                    generationProgress: 100,
                  }
                })
              } else if (toolType === 'quiz' && data.questions) {
                const { useQuizStore } = await import('@/lib/quiz-store')
                useQuizStore.getState().addQuizSet({
                  id: data.id || crypto.randomUUID(),
                  title: data.title,
                  questions: data.questions,
                  options: data.options || { numberOfQuestions: 'standard', difficulty: 'medium' },
                  createdAt: new Date(data.metadata?.generatedAt || new Date()),
                  documentId,
                  metadata: {
                    totalQuestions: data.questions.length,
                    avgDifficulty: data.options?.difficulty || 'medium',
                    generationTime: data.metadata?.duration || 0,
                    model: data.metadata?.model || 'gemini-3-flash',
                    sourceContentLength: data.metadata?.sourceContentLength || 0,
                    isGenerating: false,
                    generationProgress: 100,
                  }
                })
              } else if (toolType === 'mind-map' && data.mindMapData) {
                const { useMindMapStore } = await import('@/lib/mindmap-store')
                const mindMapStore = useMindMapStore.getState()
                const mindMapOptions = { visualStyle: 'radial' as const }

                // If batch response, add all mind maps
                if (data.batchMindMaps && Array.isArray(data.batchMindMaps)) {
                  for (const mm of data.batchMindMaps) {
                    mindMapStore.addMindMapSet({
                      id: mm.id || crypto.randomUUID(),
                      title: mm.title || mm.centralTopic,
                      mindMapData: { title: mm.title || mm.centralTopic, centralTopic: mm.centralTopic, branches: mm.branches, metadata: mm.metadata },
                      options: data.options || mindMapOptions,
                      createdAt: new Date(data.metadata?.generatedAt || new Date()),
                      documentId,
                      metadata: {
                        totalNodes: mm.metadata?.totalNodes || 0,
                        maxDepth: mm.metadata?.maxDepth || 3,
                        generationTime: data.metadata?.duration || 0,
                        model: data.metadata?.model || 'gemini-3-flash',
                        sourceContentLength: data.metadata?.sourceContentLength || 0,
                        isGenerating: false,
                        generationProgress: 100,
                      }
                    })
                  }
                } else {
                  // Single mind map
                  mindMapStore.addMindMapSet({
                    id: data.id || crypto.randomUUID(),
                    title: data.title,
                    mindMapData: data.mindMapData,
                    options: data.options || mindMapOptions,
                    createdAt: new Date(data.metadata?.generatedAt || new Date()),
                    documentId,
                    metadata: {
                      totalNodes: data.metadata?.totalNodes || data.mindMapData.metadata?.totalNodes || 0,
                      maxDepth: data.metadata?.maxDepth || data.mindMapData.metadata?.maxDepth || 3,
                      generationTime: data.metadata?.duration || 0,
                      model: data.metadata?.model || 'gemini-3-flash',
                      sourceContentLength: data.metadata?.sourceContentLength || 0,
                      isGenerating: false,
                      generationProgress: 100,
                    }
                  })
                }
              } else if (data.content) {
                // Regular study tools (study-guide, smart-notes, smart-summary)
                const { useStudyToolsStore } = await import('@/lib/study-tools-store')
                type StudyToolType = 'flashcards' | 'quiz' | 'mind-map' | 'study-guide' | 'smart-notes' | 'smart-summary'
                const studyToolsState = useStudyToolsStore.getState()
                const generatedContent = studyToolsState.generatedContent
                const newContent = {
                  id: data.id || crypto.randomUUID(),
                  type: toolType as StudyToolType,
                  title: data.title,
                  content: data.content,
                  documentId,
                  createdAt: new Date(data.metadata?.generatedAt || new Date()),
                  isGenerating: false,
                  generationProgress: 100,
                }
                useStudyToolsStore.setState({ generatedContent: [newContent, ...generatedContent] })
              }

              results.push({ type: toolType, success: true })
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Request failed'
              results.push({ type: toolType, success: false, error: msg })
            }
          }

          const succeeded = results.filter((r) => r.success).length
          if (succeeded > 0 && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('study-tools-refresh', {
              detail: { source: 'active-recall-agent', generated: results, types },
            }))
          }
          if (succeeded === 0) {
            result = { error: `All ${results.length} tool generations failed`, generated: results, types }
          } else if (succeeded < results.length) {
            result = { warning: `${succeeded}/${results.length} tools generated`, generated: results, types }
          } else {
            result = { generated: results, types }
          }
          break
        }

        case 'SYNC_CARDS': {
          const endpoint = action.payload.sourceType === 'mindmap'
            ? '/api/active-recall/agent/sync-mindmap'
            : '/api/active-recall/sync'

          const body = action.payload.sourceType === 'mindmap'
            ? { mindMapSetId: action.payload.sourceSetId, planId: action.payload.planId }
            : action.payload

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30000),
          })
          result = res.ok ? await res.json() : { error: `Failed to sync cards (${res.status})` }
          break
        }

        case 'CREATE_PLAN': {
          // Supplement documentIds from selected documents if the AI didn't provide valid ones
          const payload = { ...action.payload } as Record<string, unknown>
          if ((!payload.documentIds || !(payload.documentIds as string[]).length) && selectedDocuments.length > 0) {
            payload.documentIds = selectedDocuments.map((d) => d.id)
          }
          const res = await fetch('/api/active-recall/agent/create-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(60000), // 60s timeout for AI generation
          })
          result = res.ok ? await res.json() : { error: `Failed to create plan (${res.status})` }
          break
        }

        case 'ADAPT_PLAN': {
          const planId = action.payload.planId as string || getCurrentPlanId()
          const request = action.payload.request as string
          if (!planId) {
            result = { error: 'Open a study plan before asking me to adapt it.' }
            break
          }

          const res = await fetch('/api/active-recall/agent/adapt-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planId, request }),
            signal: AbortSignal.timeout(90000),
          })
          const data = await res.json().catch(() => null)
          result = res.ok ? data : { error: data?.error || `Failed to adapt plan (${res.status})` }
          break
        }

        case 'SET_REMINDERS': {
          const timezone = action.payload.timezone as string || Intl.DateTimeFormat().resolvedOptions().timeZone
          const payload = {
            daily_reminder_time: action.payload.dailyReminderTime as string || '09:00',
            timezone,
          }

          const res = await fetch('/api/active-recall/notification-preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(30000),
          })
          const prefs = await res.json().catch(() => null)
          if (!res.ok) {
            result = { error: prefs?.error || `Failed to update reminders (${res.status})` }
            break
          }

          const previewRes = await fetch('/api/active-recall/reminder-preview', {
            signal: AbortSignal.timeout(30000),
          })
          const preview = previewRes.ok ? await previewRes.json() : null
          result = {
            preferences: prefs?.preferences,
            preview,
            needsPushPermission: !preview?.preferences?.hasPushSubscription,
          }
          break
        }

        case 'START_REVIEW': {
          const planId = action.payload.planId as string
          window.location.href = `/active-recall/review${planId ? `?plan_id=${planId}` : ''}`
          result = { navigating: true }
          break
        }
      }

      // Check if the result indicates an error or partial failure
      const resultObj = result && typeof result === 'object' ? result as Record<string, unknown> : null
      const hasError = resultObj && 'error' in resultObj
      const hasWarning = resultObj && 'warning' in resultObj
      const finalStatus = hasError ? 'error' as const : 'done' as const

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
              ...m,
              actions: m.actions?.map((a) =>
                a.id === action.id ? { ...a, status: finalStatus, result } : a
              ),
            }
            : m
        )
      )

      // Notify dashboard/panels that agent completed an action (even partial success)
      if (!hasError || hasWarning) {
        // Extract documentId from the action for downstream listeners
        const actionDocumentId = action.payload.documentId as string | undefined
        const actionDocumentIds = action.payload.documentIds as string[] | undefined

        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('agent-action-completed', {
            detail: { type: action.type, result, documentId: actionDocumentId, documentIds: actionDocumentIds, planId: action.payload.planId },
          }))
          window.dispatchEvent(new CustomEvent('study-tools-refresh', {
            detail: { documentId: actionDocumentId, documentIds: actionDocumentIds },
          }))
        }, 500)

        // For plan creation, fire a second refresh after a longer delay as safety net
        if (action.type === 'CREATE_PLAN') {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('agent-action-completed', {
              detail: { type: action.type, result },
            }))
          }, 1500)
        }
      }
    } catch (error) {
      console.error('[AgentAction] Error:', error)
      const errorMsg = error instanceof Error
        ? (error.name === 'TimeoutError' ? 'Request timed out — try again' : error.message)
        : 'Action failed'
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
              ...m,
              actions: m.actions?.map((a) =>
                a.id === action.id ? { ...a, status: 'error' as const, result: { error: errorMsg } } : a
              ),
            }
            : m
        )
      )
    }
  }, [selectedDocuments]) // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================
  // Send Message
  // ============================================

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return

    // Ensure we have an active conversation
    let currentConvoId = activeConvoId
    if (!currentConvoId) {
      const newConvo: Conversation = {
        id: crypto.randomUUID(),
        title: text.trim().slice(0, 50) || 'New conversation',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setConversations((prev) => [newConvo, ...prev])
      setActiveConvoIdState(newConvo.id)
      setActiveConvoId(newConvo.id)
      currentConvoId = newConvo.id
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(), // Show clean text to user
      timestamp: new Date().toISOString(),
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')

    const currentPlanIdForAdaptation = getCurrentPlanId()
    if (currentPlanIdForAdaptation && isPlanAdaptationRequest(text)) {
      const assistantId = crypto.randomUUID()
      const action: AgentAction = {
        id: `action-0-${Date.now()}`,
        type: 'ADAPT_PLAN',
        payload: { planId: currentPlanIdForAdaptation, request: text.trim() },
        status: 'pending',
      }

      setMessages([
        ...updatedMessages,
        {
          id: assistantId,
          role: 'assistant',
          content: 'I will adapt the upcoming study days based on your request. Today and completed work will stay unchanged.',
          timestamp: new Date().toISOString(),
          actions: [action],
        },
      ])
      handleAgentAction(action, assistantId)
      return
    }

    if (isReminderRequest(text)) {
      const assistantId = crypto.randomUUID()
      const action: AgentAction = {
        id: `action-0-${Date.now()}`,
        type: 'SET_REMINDERS',
        payload: {
          dailyReminderTime: parseReminderTime(text) || '09:00',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        status: 'pending',
      }

      setMessages([
        ...updatedMessages,
        {
          id: assistantId,
          role: 'assistant',
          content: 'I will configure your reminders around your active plan, due reviews, and exam countdowns.',
          timestamp: new Date().toISOString(),
          actions: [action],
        },
      ])
      handleAgentAction(action, assistantId)
      return
    }

    setIsStreaming(true)

    const assistantId = crypto.randomUUID()
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    }
    setMessages([...updatedMessages, assistantMessage])

    try {
      abortControllerRef.current = new AbortController()

      // Build messages for API — include doc context in the actual content sent
      const activePlanContext = await getCurrentPlanContextForAgent()

      const apiMessages = updatedMessages.map((m, idx) => {
        let content = m.content
        if (idx === 0 && m.role === 'user') {
          const contextParts: string[] = []
          if (selectedDocuments.length > 0) {
            const docNames = selectedDocuments.map((d) => d.title).join(', ')
            const docIds = selectedDocuments.map((d) => d.id)
            contextParts.push(`[Selected documents: ${docNames} (IDs: ${docIds.join(', ')})]`)
          }
          if (activePlanContext) contextParts.push(activePlanContext)
          if (contextParts.length > 0) {
            content = `${contextParts.join('\n\n')}\n\n${content}`
          }
        }
        return { role: m.role, content }
      })

      const response = await fetch('/api/active-recall/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          agentMode: true,
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
      let lineBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          lineBuffer += decoder.decode()
          break
        }

        const text = decoder.decode(value, { stream: true })
        lineBuffer += text
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          if (line.startsWith('0:')) {
            const chunk = JSON.parse(line.slice(2))
            accumulated += chunk

            const { cleanText } = parseActions(accumulated)

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: cleanText } : m
              )
            )
          } else if (line.startsWith('3:')) {
            const error = JSON.parse(line.slice(2))
            throw new Error(error)
          }
        }
      }

      if (lineBuffer.trim()) {
        if (lineBuffer.startsWith('0:')) {
          const chunk = JSON.parse(lineBuffer.slice(2))
          accumulated += chunk
          const { cleanText } = parseActions(accumulated)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: cleanText } : m
            )
          )
        } else if (lineBuffer.startsWith('3:')) {
          const error = JSON.parse(lineBuffer.slice(2))
          throw new Error(error)
        }
      }

      // Final parse — extract and execute actions
      const { cleanText, actions } = parseActions(accumulated)

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: cleanText, actions: actions.length > 0 ? actions : undefined }
            : m
        )
      )

      // Auto-execute actions
      for (const action of actions) {
        await new Promise((r) => setTimeout(r, 300))
        handleAgentAction(action, assistantId)
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

  useEffect(() => {
    if (!isOpen || !pendingPrompt) return
    if (pendingPrompt.autoSend) {
      void sendMessage(pendingPrompt.text)
    } else {
      setInput(pendingPrompt.text)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
    onPendingPromptHandled?.()
  }, [isOpen, pendingPrompt?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // Upload file → opens Files panel → auto-selects in chat
  const handleUploadClick = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (!files || files.length === 0) return

      // Open Files panel immediately
      window.dispatchEvent(new Event('expand-files-panel'))

      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        try {
          const res = await fetch('/api/upload', { method: 'POST', body: formData })
          if (res.ok) {
            const result = await res.json()
            const doc = result.document
            if (doc) {
              // Auto-select the uploaded doc in chat
              addSelectedDocument({
                id: doc.id,
                title: doc.title,
                processing_status: doc.processing_status || undefined,
              })
              // Notify documents context
              window.dispatchEvent(new CustomEvent('document-uploaded', {
                detail: { document: doc },
              }))
            }
          }
        } catch { /* handled by Files panel refresh */ }
      }
      // Refresh documents list
      refreshDocuments({ force: true })
    }
    input.click()
  }, [addSelectedDocument, refreshDocuments])

  const clearChat = () => {
    if (activeConvoId) {
      deleteConvo(activeConvoId)
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsStreaming(false)
    startNewConvo()
  }

  return (
    <>
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className={cn(
            'fixed bottom-6 right-6 z-[250]',
            'inline-flex h-12 min-w-[132px] items-center justify-center gap-2 px-4 rounded-full',
            'bg-primary text-primary-foreground shadow-lg',
            'hover:shadow-xl hover:scale-[1.03] active:scale-[0.98]',
            'transition'
          )}
        >
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-medium">Study Agent</span>
        </button>
      )}

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
                'w-full sm:w-[420px] max-w-full',
                'bg-background border-l border-border shadow-2xl'
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  {showHistory ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowHistory(false)}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <h3 className="text-sm font-semibold">Chat History</h3>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold">Study Agent</h3>
                        <p className="text-xs text-muted-foreground">AI-powered learning plans</p>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!showHistory && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={startNewConvo}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        title="New conversation"
                      >
                        <PenSquare className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowHistory(true)}
                        className={cn(
                          'h-8 w-8 text-muted-foreground hover:text-foreground',
                          conversations.length > 1 && 'text-primary'
                        )}
                        title="Chat history"
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {showHistory && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={startNewConvo}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      title="New conversation"
                    >
                      <PenSquare className="h-4 w-4" />
                    </Button>
                  )}
                  {!showHistory && messages.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={clearChat}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      title="Delete conversation"
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

              {/* History Panel or Messages */}
              {showHistory ? (
                <ConversationHistory
                  conversations={conversations}
                  activeConvoId={activeConvoId}
                  onSelect={switchConvo}
                  onDelete={deleteConvo}
                />
              ) : (
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                  {messages.length === 0 ? (
                    <EmptyState onSuggest={sendMessage} />
                  ) : (
                    messages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        isStreaming={isStreaming && msg.role === 'assistant' && msg === messages[messages.length - 1]}
                        onRetryAction={(action) => handleAgentAction(action, msg.id)}
                      />
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* Input area — hidden when browsing history */}
              {!showHistory && <div className="border-t border-border p-3 space-y-2">
                {/* Selected documents pills */}
                {selectedDocuments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedDocuments.map((doc) => (
                      <motion.div
                        key={doc.id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-primary/10 text-primary border border-primary/20 max-w-[180px]"
                      >
                        <FileText className="h-3 w-3 shrink-0" />
                        <span className="truncate">{doc.title}</span>
                        <button
                          onClick={() => removeSelectedDocument(doc.id)}
                          className="shrink-0 hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Input row — symmetrical: upload | textarea | send */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleUploadClick}
                    className="h-9 w-9 rounded-full shrink-0 flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                    title="Upload file"
                  >
                    <Plus className="h-4 w-4" />
                  </button>

                  <div className="relative flex-1">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={selectedDocuments.length > 0
                        ? `Ask about ${selectedDocuments.length} selected file${selectedDocuments.length > 1 ? 's' : ''}...`
                        : 'Tell me what you want to study...'}
                      rows={1}
                      className={cn(
                        'w-full resize-none rounded-full bg-muted/50 px-4 py-2',
                        'text-sm placeholder:text-muted-foreground',
                        'focus:outline-none',
                        'max-h-32'
                      )}
                      style={{ height: 'auto', minHeight: '36px' }}
                      onInput={(e) => {
                        const el = e.target as HTMLTextAreaElement
                        el.style.height = 'auto'
                        el.style.height = Math.min(el.scrollHeight, 128) + 'px'
                      }}
                    />
                  </div>

                  <button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || isStreaming}
                    className={cn(
                      'h-9 w-9 rounded-full shrink-0 flex items-center justify-center transition-colors',
                      'bg-primary text-primary-foreground',
                      (!input.trim() || isStreaming) && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {isStreaming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

// ============================================
// Empty State
// ============================================

function EmptyState({ onSuggest }: { onSuggest: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-4">
        <Bot className="h-7 w-7 text-primary" />
      </div>
      <h3 className="text-base font-semibold mb-1">Your AI Study Agent</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-[280px]">
        Select files below and tell me what you want to study. I&apos;ll create a personalized plan with flashcards, quizzes, and mind maps.
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

// ============================================
// Conversation History
// ============================================

function ConversationHistory({
  conversations,
  activeConvoId,
  onSelect,
  onDelete,
}: {
  conversations: Conversation[]
  activeConvoId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No conversations yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Start chatting with the Study Agent</p>
      </div>
    )
  }

  // Group conversations by date
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  const groups: { label: string; convos: Conversation[] }[] = []
  const todayConvos: Conversation[] = []
  const yesterdayConvos: Conversation[] = []
  const olderConvos: Conversation[] = []

  for (const c of conversations) {
    const d = new Date(c.updatedAt).toDateString()
    if (d === today) todayConvos.push(c)
    else if (d === yesterday) yesterdayConvos.push(c)
    else olderConvos.push(c)
  }

  if (todayConvos.length) groups.push({ label: 'Today', convos: todayConvos })
  if (yesterdayConvos.length) groups.push({ label: 'Yesterday', convos: yesterdayConvos })
  if (olderConvos.length) groups.push({ label: 'Earlier', convos: olderConvos })

  return (
    <div className="flex-1 overflow-y-auto">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 bg-background/95 backdrop-blur-sm">
            {group.label}
          </div>
          {group.convos.map((convo) => {
            const isActive = convo.id === activeConvoId
            const msgCount = convo.messages.length
            const lastMsg = convo.messages[convo.messages.length - 1]
            const preview = lastMsg
              ? lastMsg.role === 'assistant'
                ? lastMsg.content.slice(0, 80)
                : lastMsg.content.slice(0, 80)
              : 'Empty conversation'

            return (
              <button
                key={convo.id}
                onClick={() => onSelect(convo.id)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-border/50 transition-colors group',
                  isActive ? 'bg-primary/5' : 'hover:bg-muted/50'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm font-medium truncate',
                      isActive && 'text-primary'
                    )}>
                      {convo.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {preview}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground/60">
                        {msgCount} message{msgCount !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">
                        {formatConvoTime(convo.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(convo.id) }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-all shrink-0"
                    title="Delete conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function formatConvoTime(isoStr: string): string {
  const d = new Date(isoStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ============================================
// Markdown Components for Chat
// ============================================

/* eslint-disable @typescript-eslint/no-explicit-any */
const CHAT_MD_COMPONENTS: Record<string, React.ComponentType<any>> = {
  p: ({ children }: any) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: any) => <em>{children}</em>,
  ul: ({ children }: any) => <ul className="list-disc list-inside mb-1.5 space-y-0.5">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5">{children}</ol>,
  li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
  code: ({ children, className }: any) => {
    const isBlock = className?.includes('language-')
    if (isBlock) {
      return <code className="block bg-background/50 rounded-md px-2.5 py-2 text-xs my-1.5 overflow-x-auto whitespace-pre">{children}</code>
    }
    return <code className="bg-background/50 rounded px-1 py-0.5 text-xs">{children}</code>
  },
  pre: ({ children }: any) => <pre className="my-1.5">{children}</pre>,
  h1: ({ children }: any) => <p className="font-bold text-base mb-1">{children}</p>,
  h2: ({ children }: any) => <p className="font-bold text-sm mb-1">{children}</p>,
  h3: ({ children }: any) => <p className="font-semibold text-sm mb-0.5">{children}</p>,
  h4: ({ children }: any) => <p className="font-semibold text-sm mb-0.5">{children}</p>,
  blockquote: ({ children }: any) => <blockquote className="border-l-2 border-primary/40 pl-2.5 my-1.5 italic text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="my-2 border-border/50" />,
  a: ({ href, children }: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{children}</a>,
  table: ({ children }: any) => <div className="overflow-x-auto my-1.5"><table className="text-xs w-full">{children}</table></div>,
  th: ({ children }: any) => <th className="border border-border/50 px-2 py-1 text-left font-semibold bg-muted/50">{children}</th>,
  td: ({ children }: any) => <td className="border border-border/50 px-2 py-1">{children}</td>,
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================
// Message Bubble
// ============================================

function MessageBubble({
  message,
  isStreaming,
  onRetryAction,
}: {
  message: ChatMessage
  isStreaming: boolean
  onRetryAction: (action: AgentAction) => void
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

      <div className={cn('max-w-[85%] space-y-2')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted rounded-bl-md'
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : message.content ? (
            <MemoizedMarkdown
              content={message.content}
              isStreaming={isStreaming}
              customComponents={CHAT_MD_COMPONENTS}
            />
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Thinking...
            </span>
          )}
        </div>

        {/* Action Cards */}
        {message.actions && message.actions.length > 0 && (
          <div className="space-y-2 pl-1">
            {message.actions.map((action) => (
              <ActionCard key={action.id} action={action} onRetry={() => onRetryAction(action)} />
            ))}
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

// ============================================
// Action Card
// ============================================

function ActionCard({ action, onRetry }: { action: AgentAction; onRetry: () => void }) {
  const config = ACTION_CARD_CONFIG[action.type]
  if (!config) return null

  const resultObj = action.result && typeof action.result === 'object' ? action.result as Record<string, unknown> : null
  const hasWarning = action.status === 'done' && resultObj && 'warning' in resultObj

  const statusIcon: Record<string, React.ReactNode> = {
    pending: <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />,
    running: <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />,
    done: hasWarning
      ? <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
      : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
    error: <AlertCircle className="h-3.5 w-3.5 text-red-500" />,
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-xl border px-3 py-2.5 text-xs',
        action.status === 'done' && !hasWarning && 'border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-950/20',
        action.status === 'done' && hasWarning && 'border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20',
        action.status === 'error' && 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/20',
        action.status === 'running' && 'border-primary/30 bg-primary/5',
        action.status === 'pending' && 'border-border bg-muted/30',
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn('p-1 rounded-md', config.iconBg)}>
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground">{config.label}</p>
          <p className="text-muted-foreground truncate">{getActionDescription(action)}</p>
        </div>
        {statusIcon[action.status]}
      </div>

      {action.status === 'done' && action.result != null && (
        <ActionResult action={action} />
      )}

      {action.status === 'error' && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-red-500 truncate">
            {(action.result as Record<string, unknown>)?.error
              ? String((action.result as Record<string, unknown>).error)
              : 'Action failed'}
          </span>
          <button onClick={onRetry} className="text-primary hover:underline font-medium shrink-0">
            Retry
          </button>
        </div>
      )}
    </motion.div>
  )
}

const ACTION_CARD_CONFIG: Record<AgentActionType, { label: string; icon: React.ReactNode; iconBg: string }> = {
  CHECK_TOOLS: {
    label: 'Discovering study tools',
    icon: <Search className="h-3 w-3 text-blue-600 dark:text-blue-400" />,
    iconBg: 'bg-blue-500/10',
  },
  GENERATE_TOOLS: {
    label: 'Generating study tools',
    icon: <Zap className="h-3 w-3 text-amber-600 dark:text-amber-400" />,
    iconBg: 'bg-amber-500/10',
  },
  SYNC_CARDS: {
    label: 'Syncing to spaced repetition',
    icon: <FileText className="h-3 w-3 text-violet-600 dark:text-violet-400" />,
    iconBg: 'bg-violet-500/10',
  },
  CREATE_PLAN: {
    label: 'Creating study plan',
    icon: <TreePine className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />,
    iconBg: 'bg-emerald-500/10',
  },
  ADAPT_PLAN: {
    label: 'Adapting study plan',
    icon: <Sparkles className="h-3 w-3 text-primary" />,
    iconBg: 'bg-primary/10',
  },
  SET_REMINDERS: {
    label: 'Configuring reminders',
    icon: <Bell className="h-3 w-3 text-blue-600 dark:text-blue-400" />,
    iconBg: 'bg-blue-500/10',
  },
  START_REVIEW: {
    label: 'Starting review session',
    icon: <Play className="h-3 w-3 text-green-600 dark:text-green-400" />,
    iconBg: 'bg-green-500/10',
  },
}

function getActionDescription(action: AgentAction): string {
  switch (action.type) {
    case 'CHECK_TOOLS':
      return `Checking document ${(action.payload.documentId as string)?.slice(0, 8)}...`
    case 'GENERATE_TOOLS': {
      const types = action.payload.types as string[]
      return types ? types.join(', ') : 'flashcards, quiz, mind map'
    }
    case 'SYNC_CARDS':
      return `Syncing ${action.payload.sourceType} cards`
    case 'CREATE_PLAN':
      return (action.payload.title as string) || 'New study plan'
    case 'ADAPT_PLAN':
      return 'Updating future days'
    case 'SET_REMINDERS':
      return `${action.payload.dailyReminderTime as string || '09:00'} daily`
    case 'START_REVIEW':
      return 'Launching review session'
    default:
      return ''
  }
}

function ActionResult({ action }: { action: AgentAction }) {
  const result = action.result as Record<string, unknown>
  if (!result || result.error) return null

  switch (action.type) {
    case 'CHECK_TOOLS': {
      const tools = result.tools as Record<string, { setCount: number; cardCount: number }>
      if (!tools) return null
      return (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <ToolCountBadge icon={<FileText className="h-3 w-3" />} label="Flashcards" count={tools.flashcards?.setCount || 0} cardCount={tools.flashcards?.cardCount || 0} />
          <ToolCountBadge icon={<FlaskConical className="h-3 w-3" />} label="Quizzes" count={tools.quizzes?.setCount || 0} cardCount={tools.quizzes?.cardCount || 0} />
          <ToolCountBadge icon={<TreePine className="h-3 w-3" />} label="Mind Maps" count={tools.mindmaps?.setCount || 0} cardCount={tools.mindmaps?.cardCount || 0} />
        </div>
      )
    }
    case 'GENERATE_TOOLS': {
      const generated = result.generated as Array<{ type: string; success: boolean; error?: string }>
      if (!generated) return null
      const succeeded = generated.filter((g) => g.success).length
      const failed = generated.filter((g) => !g.success)
      return (
        <div className="mt-1.5 space-y-0.5">
          <p className={cn(
            succeeded === generated.length ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'
          )}>
            Generated {succeeded}/{generated.length} tool{generated.length !== 1 ? 's' : ''}
          </p>
          {failed.map((f, i) => (
            <p key={i} className="text-red-400 text-[11px]">
              {f.type} failed{f.error ? `: ${f.error}` : ''}
            </p>
          ))}
        </div>
      )
    }
    case 'SYNC_CARDS': {
      const synced = result.synced as number
      const total = result.total as number
      return (
        <p className="mt-1.5 text-green-600 dark:text-green-400">
          Synced {synced} cards ({total} total)
        </p>
      )
    }
    case 'CREATE_PLAN': {
      const plan = result.plan as Record<string, unknown>
      if (!plan) return null
      return (
        <p className="mt-1.5 text-emerald-600 dark:text-emerald-400">
          Plan created: {plan.title as string} — {plan.totalActivities as number} activities
        </p>
      )
    }
    case 'ADAPT_PLAN': {
      const adapted = result.adapted as boolean
      const explanation = result.explanation as string | undefined
      return (
        <p className={cn(
          'mt-1.5',
          adapted ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
        )}>
          {adapted ? explanation || 'Future days adapted.' : result.message as string || 'No future days needed changes.'}
        </p>
      )
    }
    case 'SET_REMINDERS': {
      const preview = result.preview as {
        reminders?: Array<{ id: string; title: string; enabled: boolean }>
        preferences?: { dailyReminderTime?: string; timezone?: string }
      } | undefined
      const needsPushPermission = result.needsPushPermission as boolean
      return (
        <div className="mt-1.5 space-y-1">
          <p className="text-green-600 dark:text-green-400">
            Reminders set for {preview?.preferences?.dailyReminderTime || '09:00'}{preview?.preferences?.timezone ? ` in ${preview.preferences.timezone}` : ''}.
          </p>
          {preview?.reminders?.slice(0, 3).map((reminder) => (
            <p key={reminder.id} className="text-[11px] text-muted-foreground">
              {reminder.enabled ? 'On' : 'Preview'}: {reminder.title}
            </p>
          ))}
          {needsPushPermission && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Browser push still needs permission in Active Recall settings.
            </p>
          )}
        </div>
      )
    }
    default:
      return null
  }
}

function ToolCountBadge({ icon, label, count, cardCount }: { icon: React.ReactNode; label: string; count: number; cardCount: number }) {
  return (
    <div className={cn('flex flex-col items-center gap-0.5 p-1.5 rounded-lg', count > 0 ? 'bg-green-500/10' : 'bg-muted/50')}>
      {icon}
      <span className="font-medium">{count}</span>
      <span className="text-[9px] text-muted-foreground">{label}</span>
      {cardCount > 0 && <span className="text-[9px] text-muted-foreground">{cardCount} cards</span>}
    </div>
  )
}
