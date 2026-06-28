'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Play,
  Pause,
  Trash2,
  Pencil,
  Check,
  X,
  Calendar,
  Target,
  FileText,
  FlaskConical,
  TreePine,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Circle,
  BarChart3,
  Clock,
  BookOpen,
  NotebookText,
  ScrollText,
  RotateCcw,
  AlertCircle,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Button,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui'
import type { PlanActivity, PlanScheduleDay } from '@/types/active-recall'
import type { FlashcardEntry } from '@/types/flashcards'
import type { QuizQuestionEntry } from '@/types/quiz'
import type { MindMapData } from '@/types/mindmap'
import { useStudyToolsStore } from '@/lib/study-tools-store'

interface PlanDetail {
  id: string
  title: string
  status: 'active' | 'paused' | 'completed' | 'archived'
  document_ids: string[]
  onboarding_context: { goal: string; timeline?: string; priorKnowledge: string }
  schedule: PlanScheduleDay[]
  currentDay: number
  totalDays: number
  total_activities: number
  completed_activities: number
  created_at: string
}

interface PlanStats {
  totalCards: number
  dueCards: number
  cardsByType: Record<string, number>
  cardsByLayer: Record<string, number>
  activitySessions?: PlanActivitySession[]
  totalActivityTimeMs?: number
}

type StudyToolGenerateType = 'study-guide' | 'smart-summary' | 'smart-notes' | 'flashcards' | 'quiz' | 'mind-map'

interface ActivityCompletionSummary {
  key: string
  title: string
  typeLabel: string
  primaryMetric: string
  secondaryMetric: string
  timeSpent: string
}

interface PlanActivitySession {
  id: string
  plan_day: number
  activity_index: number
  activity_type: string
  topic: string | null
  status: 'in_progress' | 'completed' | 'abandoned'
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  result_metrics?: Record<string, unknown>
}

interface GeneratedStudyToolResponse {
  success: boolean
  id?: string | null
  title?: string
  type: StudyToolGenerateType
  documentId?: string
  content?: string
  cards?: FlashcardEntry[]
  questions?: QuizQuestionEntry[]
  mindMapData?: MindMapData
  options?: unknown
  activeRecallSync?: {
    sourceType: string
    synced: number
    total: number
  } | null
  metadata?: {
    generatedAt?: string
    duration?: number
    model?: string
    sourceContentLength?: number
    totalCards?: number
    totalQuestions?: number
    totalNodes?: number
    maxDepth?: number
  }
}

const ACTIVITY_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; reviewType?: string }> = {
  study_guide: {
    icon: <BookOpen className="h-3.5 w-3.5" />,
    label: 'Study Guide',
    color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-200 dark:border-indigo-800',
  },
  summary: {
    icon: <ScrollText className="h-3.5 w-3.5" />,
    label: 'Summary',
    color: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-200 dark:border-sky-800',
  },
  smart_notes: {
    icon: <NotebookText className="h-3.5 w-3.5" />,
    label: 'Smart Notes',
    color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-200 dark:border-amber-800',
  },
  mindmap: {
    icon: <TreePine className="h-3.5 w-3.5" />,
    label: 'Mind Map',
    color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-200 dark:border-emerald-800',
    reviewType: 'mindmap',
  },
  flashcards: {
    icon: <FileText className="h-3.5 w-3.5" />,
    label: 'Flashcards',
    color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-200 dark:border-blue-800',
    reviewType: 'flashcard',
  },
  quiz: {
    icon: <FlaskConical className="h-3.5 w-3.5" />,
    label: 'Quiz',
    color: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-200 dark:border-violet-800',
    reviewType: 'quiz',
  },
  review_due_cards: {
    icon: <RotateCcw className="h-3.5 w-3.5" />,
    label: 'Due Review',
    color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-200 dark:border-rose-800',
  },
  flashcard_review: {
    icon: <FileText className="h-3.5 w-3.5" />,
    label: 'Flashcards',
    color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-200 dark:border-blue-800',
    reviewType: 'flashcard',
  },
  quiz_session: {
    icon: <FlaskConical className="h-3.5 w-3.5" />,
    label: 'Quiz',
    color: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-200 dark:border-violet-800',
    reviewType: 'quiz',
  },
  mindmap_review: {
    icon: <TreePine className="h-3.5 w-3.5" />,
    label: 'Mind Map',
    color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-200 dark:border-emerald-800',
    reviewType: 'mindmap',
  },
}

function activityUnit(type: string, count?: number): string {
  const n = count ?? 2 // default plural
  if (type === 'mindmap' || type === 'mindmap_review') return n === 1 ? 'mind map' : 'mind maps'
  if (type === 'quiz' || type === 'quiz_session') return n === 1 ? 'question' : 'questions'
  if (type === 'study_guide' || type === 'summary' || type === 'smart_notes') return n === 1 ? 'minute' : 'minutes'
  return n === 1 ? 'card' : 'cards'
}

function studyToolTypeForActivity(type: string): StudyToolGenerateType | null {
  const mapping: Record<string, StudyToolGenerateType> = {
    study_guide: 'study-guide',
    summary: 'smart-summary',
    smart_notes: 'smart-notes',
    mindmap: 'mind-map',
    mindmap_review: 'mind-map',
    flashcards: 'flashcards',
    flashcard_review: 'flashcards',
    quiz: 'quiz',
    quiz_session: 'quiz',
  }
  return mapping[type] || null
}

function sourceTypeForActivity(type: string): PlanActivity['generatedSourceType'] {
  if (type === 'flashcards' || type === 'flashcard_review') return 'flashcard_set'
  if (type === 'quiz' || type === 'quiz_session') return 'quiz_set'
  if (type === 'mindmap' || type === 'mindmap_review') return 'mindmap_set'
  if (type === 'review_due_cards') return 'review_cards'
  return 'output'
}

function countToSize(count?: number): 'fewer' | 'standard' | 'more' {
  if (!count || count <= 10) return 'fewer'
  if (count <= 20) return 'standard'
  return 'more'
}

function generationBodyForActivity(activity: PlanActivity, toolType: StudyToolGenerateType) {
  const documentId = activity.documentId
  const context = [activity.topic, activity.notes].filter(Boolean).join(' - ')
  const body: Record<string, unknown> = {
    type: toolType,
    documentId,
  }

  if (toolType === 'flashcards') {
    body.flashcardOptions = {
      numberOfCards: countToSize(activity.cardCount),
      difficulty: 'medium',
      customInstructions: context ? `Focus on this plan activity: ${context}` : undefined,
    }
  }

  if (toolType === 'quiz') {
    body.quizOptions = activity.cardCount
      ? {
          numberOfQuestions: 'custom',
          customCount: Math.min(50, Math.max(1, activity.cardCount)),
          difficulty: 'medium',
          customInstructions: context ? `Focus on this plan activity: ${context}` : undefined,
        }
      : {
          numberOfQuestions: 'standard',
          difficulty: 'medium',
          customInstructions: context ? `Focus on this plan activity: ${context}` : undefined,
        }
  }

  if (toolType === 'mind-map') {
    body.mindMapOptions = {
      depth: 3,
      detailLevel: 'brief',
      visualStyle: 'radial',
      focusArea: activity.topic,
      customInstructions: activity.notes || undefined,
    }
  }

  return body
}

function reviewCardCountFromGeneration(result: GeneratedStudyToolResponse, fallback?: number): number | undefined {
  if (result.cards?.length) return result.cards.length
  if (result.questions?.length) return result.questions.length
  if (result.mindMapData?.branches?.length) return fallback
  return fallback
}

function isGenerationNeeded(activity: PlanActivity): boolean {
  if (activity.type === 'review_due_cards') return false
  if (activity.generationStatus === 'not_required') return false
  if (activity.generationStatus === 'ready' && activity.generatedSourceId) return false
  if (activity.generationStatus === 'failed') return true
  if (activity.generationStatus === 'not_generated') return true
  return !activity.generatedSourceId && !!studyToolTypeForActivity(activity.type)
}

function isActivityComplete(activity: Pick<PlanActivity, 'completed' | 'completionStatus'>): boolean {
  return !!activity.completed || activity.completionStatus === 'completed'
}

function getActivityState(activity: PlanActivity) {
  if (isActivityComplete(activity)) {
    return {
      label: 'Done',
      className: 'bg-green-500/10 text-green-600 dark:text-green-400',
      icon: <CheckCircle2 className="h-3 w-3" />,
    }
  }

  if (activity.generationStatus === 'not_generated') {
    return null
  }

  if (activity.completionStatus === 'in_progress') {
    return {
      label: 'In progress',
      className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      icon: <Clock className="h-3 w-3" />,
    }
  }

  if (activity.generationStatus === 'generating') {
    return {
      label: 'Generating',
      className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    }
  }

  if (activity.generationStatus === 'failed') {
    return {
      label: 'Blocked',
      className: 'bg-red-500/10 text-red-600 dark:text-red-400',
      icon: <AlertCircle className="h-3 w-3" />,
    }
  }

  return {
    label: 'Ready',
    className: 'bg-primary/10 text-primary',
    icon: <Play className="h-3 w-3" />,
  }
}

function activityKey(day: number, activityIndex: number) {
  return `${day}:${activityIndex}`
}

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return 'Under 1 min'
  const minutes = Math.max(1, Math.round(ms / 60000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`
}

function buildCompletionSummary(
  activity: PlanActivity,
  day: number,
  activityIndex: number,
  elapsedMs: number,
): ActivityCompletionSummary {
  const config = ACTIVITY_CONFIG[activity.type] || ACTIVITY_CONFIG.flashcard_review
  const plannedCount = activity.cardCount ?? activity.plannedMinutes ?? 0
  const unit = activityUnit(activity.type, plannedCount)
  const generatedCount = activity.reviewedCount && activity.reviewedCount > 0
    ? activity.reviewedCount
    : plannedCount

  const primaryMetric = activity.type === 'quiz'
    ? `${generatedCount} questions available`
    : activity.type === 'mindmap' || activity.type === 'mindmap_review'
      ? `${generatedCount} nodes reviewed`
      : activity.type === 'flashcard_review'
        ? `${generatedCount} cards reviewed`
        : `${generatedCount} ${unit}`

  return {
    key: `${activityKey(day, activityIndex)}:${Date.now()}`,
    title: activity.topic,
    typeLabel: config.label,
    primaryMetric,
    secondaryMetric: activity.generatedSourceId
      ? `Opened ${config.label} material`
      : 'Completed from today\'s plan',
    timeSpent: formatDuration(elapsedMs),
  }
}

function trackedTimeLabel(activity: PlanActivity) {
  if (activity.totalTimeMs && activity.totalTimeMs > 0) return `Tracked ${formatDuration(activity.totalTimeMs)}`
  if (activity.startedAt && activity.completionStatus === 'in_progress') return 'Timer running'
  return null
}

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { generatedContent, loadStudyToolsFromDatabase, openCanvas, enqueueAutoOpen } = useStudyToolsStore()
  const [plan, setPlan] = useState<PlanDetail | null>(null)
  const [stats, setStats] = useState<PlanStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit states
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)
  const [activityStartedAt, setActivityStartedAt] = useState<Record<string, number>>({})
  const [activitySessionIds, setActivitySessionIds] = useState<Record<string, string>>({})
  const [completionSummary, setCompletionSummary] = useState<ActivityCompletionSummary | null>(null)

  // Expanded days
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set())

  const fetchPlan = useCallback(async () => {
    try {
      const res = await fetch(`/api/active-recall/agent/plans/${id}`)
      if (!res.ok) {
        setError('Plan not found')
        return
      }
      const data = await res.json()
      setPlan(data.plan)
      setStats(data.stats)
      // Auto-expand today's day
      if (data.plan?.currentDay) {
        setExpandedDays(new Set([data.plan.currentDay]))
      }
    } catch {
      setError('Failed to load plan')
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchPlan()
  }, [fetchPlan])

  useEffect(() => {
    const handleAgentAction = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; planId?: string }>).detail
      if (detail?.type === 'ADAPT_PLAN' && detail?.planId === id) {
        fetchPlan()
      }
    }

    window.addEventListener('agent-action-completed', handleAgentAction)
    return () => window.removeEventListener('agent-action-completed', handleAgentAction)
  }, [fetchPlan, id])

  const handleRename = async () => {
    if (!renameValue.trim() || !plan) return
    try {
      const res = await fetch(`/api/active-recall/agent/plans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', title: renameValue.trim() }),
      })
      if (res.ok) {
        setPlan({ ...plan, title: renameValue.trim() })
      }
    } catch { /* ignore */ }
    setIsRenaming(false)
  }

  const handleToggleStatus = async () => {
    if (!plan) return
    setIsTogglingStatus(true)
    try {
      const res = await fetch(`/api/active-recall/agent/plans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_status' }),
      })
      if (res.ok) {
        const data = await res.json()
        setPlan({ ...plan, status: data.status })
      }
    } catch { /* ignore */ }
    setIsTogglingStatus(false)
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/active-recall/agent/plans/${id}`, { method: 'DELETE' })
      if (res.ok) {
        window.dispatchEvent(new Event('study-tools-refresh'))
        router.push('/active-recall')
      }
    } catch { /* ignore */ }
    setIsDeleting(false)
    setShowDeleteDialog(false)
  }

  const handleToggleActivity = async (day: number, activityIndex: number) => {
    if (!plan) return
    const dayEntry = plan.schedule.find(d => d.day === day)
    const activity = dayEntry?.activities[activityIndex]
    const wasCompleted = activity ? isActivityComplete(activity) : false

    // Optimistic update
    const newSchedule = plan.schedule.map(d => {
      if (d.day !== day) return d
      const newActivities = d.activities.map((a, i) =>
        i === activityIndex
          ? { ...a, completed: !wasCompleted, completionStatus: !wasCompleted ? 'completed' as const : 'not_started' as const }
          : a
      )
      return { ...d, activities: newActivities, isCompleted: newActivities.every(isActivityComplete) }
    })
    const newCompleted = Math.max(0, (plan.completed_activities || 0) + (wasCompleted ? -1 : 1))
    setPlan({ ...plan, schedule: newSchedule, completed_activities: newCompleted })

    try {
      await fetch(`/api/active-recall/agent/plans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete_activity', day, activityIndex }),
      })
    } catch {
      // Revert on failure
      fetchPlan()
    }
  }

  const patchActivityCompletion = async (
    day: number,
    activityIndex: number,
    completionStatus: PlanActivity['completionStatus'],
    options?: { sessionId?: string | null; durationMs?: number },
  ) => {
    setPlan((current) => {
      if (!current) return current
      let completedDelta = 0
      const schedule = current.schedule.map((scheduleDay) => {
        if (scheduleDay.day !== day) return scheduleDay
        const activities = scheduleDay.activities.map((entry, index) => {
          if (index !== activityIndex) return entry
          const wasCompleted = isActivityComplete(entry)
          const isCompleted = completionStatus === 'completed'
          completedDelta = wasCompleted === isCompleted ? 0 : isCompleted ? 1 : -1
          return {
            ...entry,
            completed: isCompleted,
            completionStatus,
          }
        })
        return { ...scheduleDay, activities, isCompleted: activities.every(isActivityComplete) }
      })
      return {
        ...current,
        schedule,
        completed_activities: Math.max(0, (current.completed_activities || 0) + completedDelta),
      }
    })

    const response = await fetch(`/api/active-recall/agent/plans/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_activity_completion',
        day,
        activityIndex,
        completionStatus,
        sessionId: options?.sessionId,
        durationMs: options?.durationMs,
      }),
    })

    if (!response.ok) {
      fetchPlan()
      throw new Error('Failed to update reading progress')
    }
  }

  const handleOpenStudyActivity = async (day: number, activityIndex: number) => {
    if (!plan) return
    const dayEntry = plan.schedule.find((entry) => entry.day === day)
    const activity = dayEntry?.activities[activityIndex]
    if (!activity) return

    try {
      const key = activityKey(day, activityIndex)
      const startedAt = Date.now()
      setActivityStartedAt((current) => current[key] ? current : { ...current, [key]: startedAt })
      if (!activitySessionIds[key] && !isActivityComplete(activity)) {
        try {
          const sessionRes = await fetch(`/api/active-recall/agent/plans/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start_activity_session', day, activityIndex }),
          })
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json()
            const sessionId = sessionData?.session?.id
            const startedAtIso = sessionData?.session?.started_at
            if (sessionId) {
              setActivitySessionIds((current) => ({ ...current, [key]: sessionId }))
            }
            if (startedAtIso) {
              const serverStartedAt = new Date(startedAtIso).getTime()
              if (Number.isFinite(serverStartedAt)) {
                setActivityStartedAt((current) => ({ ...current, [key]: serverStartedAt }))
              }
            }
          }
        } catch {
          // Session tracking is additive; opening material should still work if telemetry is unavailable.
        }
      }
      if (activity.documentId) {
        await loadStudyToolsFromDatabase(activity.documentId)
      }
      if (!isActivityComplete(activity) && activity.completionStatus !== 'in_progress') {
        await patchActivityCompletion(day, activityIndex, 'in_progress')
      }
      window.dispatchEvent(new Event('expand-study-tools-panel'))

      const toolType = studyToolTypeForActivity(activity.type)
      if (toolType === 'quiz' || toolType === 'mind-map' || toolType === 'flashcards') {
        if (!activity.generatedSourceId) {
          throw new Error('The generated study material is not available yet.')
        }
        enqueueAutoOpen(activity.generatedSourceId, toolType)
        return
      }

      const output = useStudyToolsStore.getState().generatedContent.find((tool) => tool.id === activity.generatedSourceId)
        || generatedContent.find((tool) => tool.id === activity.generatedSourceId)
      if (!output) {
        throw new Error('The generated study material is not available yet.')
      }

      await openCanvas(output)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open the study material.')
    }
  }

  const continueFromActivity = async (day: number, activityIndex: number) => {
    const dayEntry = plan?.schedule.find((entry) => entry.day === day)
    const nextIndex = dayEntry?.activities.findIndex((activity, index) =>
      index > activityIndex && !isActivityComplete(activity)
    ) ?? -1
    const nextActivity = nextIndex >= 0 ? dayEntry?.activities[nextIndex] : null

    if (!dayEntry || !nextActivity) return

    if (isGenerationNeeded(nextActivity)) {
      await handleGenerateActivity(dayEntry.day, nextIndex)
      return
    }

    if (nextActivity.generatedSourceId) {
      await handleOpenStudyActivity(dayEntry.day, nextIndex)
      return
    }

    if (nextActivity.type === 'review_due_cards') {
      handleStartSession()
    }
  }

  const handleCompleteStudyActivity = async (day: number, activityIndex: number, advance = false) => {
    try {
      const dayEntry = plan?.schedule.find((entry) => entry.day === day)
      const activity = dayEntry?.activities[activityIndex]
      const key = activityKey(day, activityIndex)
      const startedAt = activityStartedAt[key] ?? Date.now()
      const durationMs = Date.now() - startedAt
      const sessionId = activitySessionIds[key] || activity?.lastSessionId || null
      await patchActivityCompletion(day, activityIndex, 'completed', { sessionId, durationMs })
      if (activity) {
        setCompletionSummary(buildCompletionSummary(activity, day, activityIndex, durationMs))
      }
      setActivityStartedAt((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
      setActivitySessionIds((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
      toast.success('Reading marked complete.')
      if (advance) {
        await continueFromActivity(day, activityIndex)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to mark reading complete.')
    }
  }

  const patchActivityGeneration = async (
    day: number,
    activityIndex: number,
    activity: Partial<PlanActivity>
  ) => {
    setPlan((current) => {
      if (!current) return current
      return {
        ...current,
        schedule: current.schedule.map((scheduleDay) => {
          if (scheduleDay.day !== day) return scheduleDay
          return {
            ...scheduleDay,
            activities: scheduleDay.activities.map((entry, index) =>
              index === activityIndex ? { ...entry, ...activity } : entry
            ),
          }
        }),
      }
    })

    const response = await fetch(`/api/active-recall/agent/plans/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_activity_generation',
        day,
        activityIndex,
        generationStatus: activity.generationStatus,
        generatedSourceId: activity.generatedSourceId,
        generatedSourceType: activity.generatedSourceType,
        cardCount: activity.cardCount,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to update plan activity')
    }
  }

  const syncGeneratedActivity = async (
    activity: PlanActivity,
    result: GeneratedStudyToolResponse,
  ) => {
    if (!result.id) return

    if (result.type === 'flashcards' && result.cards?.length) {
      const response = await fetch('/api/active-recall/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'flashcard',
          sourceSetId: result.id,
          documentId: activity.documentId,
          planId: id,
          cards: result.cards.map((card) => ({
            id: card.id,
            question: card.question,
            answer: card.answer,
            topic: card.topic,
            difficulty: card.difficulty,
          })),
        }),
      })
      if (!response.ok) throw new Error('Generated flashcards could not be synced to review')
    }

    if (result.type === 'quiz' && result.questions?.length) {
      const response = await fetch('/api/active-recall/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'quiz',
          sourceSetId: result.id,
          documentId: activity.documentId,
          planId: id,
          cards: result.questions.map((question) => ({
            id: question.id,
            question: question.question,
            answer: `${question.options[question.correctAnswer]}${question.explanation ? `\n\n${question.explanation}` : ''}`,
            options: question.options,
            correctAnswer: question.correctAnswer,
            topic: question.topic,
            difficulty: question.difficulty,
          })),
        }),
      })
      if (!response.ok) throw new Error('Generated quiz could not be synced to review')
    }

    if (result.type === 'mind-map') {
      const response = await fetch('/api/active-recall/agent/sync-mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mindMapSetId: result.id, planId: id }),
      })
      if (!response.ok) throw new Error('Generated mind map could not be synced to review')
    }
  }

  const handleGenerateActivity = async (day: number, activityIndex: number) => {
    if (!plan) return
    const dayEntry = plan.schedule.find((entry) => entry.day === day)
    const activity = dayEntry?.activities[activityIndex]
    if (!activity) return

    const toolType = studyToolTypeForActivity(activity.type)
    if (!toolType || !activity.documentId) {
      toast.error('This activity cannot be generated yet.')
      return
    }

    if (activity.generatedSourceId && activity.generationStatus === 'ready') {
      toast.info('Material is already ready for this activity.')
      return
    }

    try {
      await patchActivityGeneration(day, activityIndex, { generationStatus: 'generating' })

      const response = await fetch('/api/study-tools/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...generationBodyForActivity(activity, toolType),
          planId: id,
          planDay: day,
          activityIndex,
        }),
        signal: AbortSignal.timeout(180000),
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null)
        throw new Error(errorBody?.error || `Generation failed (${response.status})`)
      }

      const result = await response.json() as GeneratedStudyToolResponse
      if (!result.id) {
        throw new Error('Generation completed but did not return a saved material id')
      }

      if (!result.activeRecallSync) {
        await syncGeneratedActivity(activity, result)

        await patchActivityGeneration(day, activityIndex, {
          generationStatus: 'ready',
          generatedSourceId: result.id,
          generatedSourceType: sourceTypeForActivity(activity.type),
          cardCount: reviewCardCountFromGeneration(result, activity.cardCount),
        })
      }

      window.dispatchEvent(new Event('study-tools-refresh'))
      toast.success('Activity material is ready.')
      fetchPlan()
    } catch (error) {
      await patchActivityGeneration(day, activityIndex, {
        generationStatus: 'failed',
        generatedSourceId: null,
        generatedSourceType: null,
      }).catch(() => undefined)
      toast.error(error instanceof Error ? error.message : 'Failed to generate activity material.')
      fetchPlan()
    }
  }

  const handleStartSession = (sourceType?: string, includeAll?: boolean) => {
    let url = `/active-recall/review?plan_id=${id}`
    if (sourceType) url += `&source_type=${sourceType}`
    if (includeAll) url += `&include_all=true`
    router.push(url)
  }

  const handleContinuePlan = async () => {
    if (!todayDay || !nextTodayActivity || nextTodayActivityIndex < 0) {
      handleStartSession()
      return
    }

    const activity = nextTodayActivity
    if (isGenerationNeeded(activity)) {
      await handleGenerateActivity(todayDay.day, nextTodayActivityIndex)
      return
    }

    if (activity.generatedSourceId) {
      await handleOpenStudyActivity(todayDay.day, nextTodayActivityIndex)
      return
    }

    if (activity.type === 'review_due_cards') {
      handleStartSession()
    }
  }

  const toggleDay = (day: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !plan) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <p className="text-muted-foreground">{error || 'Plan not found'}</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/active-recall')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>
    )
  }

  const progress = plan.total_activities > 0
    ? Math.round((plan.completed_activities / plan.total_activities) * 100)
    : 0
  const displayDay = Math.min(plan.currentDay, plan.totalDays || plan.currentDay)
  const daysRemaining = Math.max(0, plan.totalDays - displayDay)
  const todayDay = plan.schedule.find((day) => day.day === displayDay) || null
  const nextTodayActivityIndex = todayDay?.activities.findIndex((activity) => !isActivityComplete(activity)) ?? -1
  const nextTodayActivity = nextTodayActivityIndex >= 0 ? todayDay?.activities[nextTodayActivityIndex] ?? null : null
  const canContinuePlan = !!nextTodayActivity || (stats?.dueCards || 0) > 0
  const trackedStudyMinutes = stats?.totalActivityTimeMs
    ? Math.max(1, Math.round(stats.totalActivityTimeMs / 60000))
    : 0

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Back + Header */}
      <div>
        <button
          onClick={() => router.push('/active-recall')}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {isRenaming ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRename()
                    if (e.key === 'Escape') setIsRenaming(false)
                  }}
                  className="text-xl font-bold bg-transparent border-b-2 border-primary outline-none w-full"
                />
                <button onClick={handleRename} className="p-1 hover:bg-muted rounded">
                  <Check className="h-4 w-4 text-green-600" />
                </button>
                <button onClick={() => setIsRenaming(false)} className="p-1 hover:bg-muted rounded">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold truncate">{plan.title}</h1>
                <button
                  onClick={() => { setRenameValue(plan.title); setIsRenaming(true) }}
                  className="p-1 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Rename"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <span className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0',
                  plan.status === 'active' && 'bg-green-500/10 text-green-600 dark:text-green-400',
                  plan.status === 'paused' && 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
                  plan.status === 'completed' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                )}>
                  {plan.status}
                </span>
              </div>
            )}

            <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Day {displayDay} of {plan.totalDays}
              </span>
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                {plan.completed_activities}/{plan.total_activities} activities
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {daysRemaining} days left
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleStatus}
              disabled={isTogglingStatus}
              className="gap-1.5"
            >
              {plan.status === 'active' ? (
                <><Pause className="h-3.5 w-3.5" /> Pause</>
              ) : (
                <><Play className="h-3.5 w-3.5" /> Resume</>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setRenameValue(plan.title); setIsRenaming(true) }}
              className="gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" /> Rename
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Today's Plan */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Today&apos;s Plan
            </h2>
            {nextTodayActivity ? (
              <p className="text-xs text-muted-foreground mt-1">
                Next: {ACTIVITY_CONFIG[nextTodayActivity.type]?.label || 'Activity'}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Today&apos;s planned activities are complete.
              </p>
            )}
          </div>
          {canContinuePlan && (
            <Button
              onClick={() => { void handleContinuePlan() }}
              variant="purple"
              size="sm"
              className="gap-2"
            >
              <Play className="h-3.5 w-3.5" />
              {nextTodayActivity ? 'Continue Plan' : 'Start Review'}
              {!nextTodayActivity && (stats?.dueCards || 0) > 0 ? (
                <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[10px]">
                  {stats?.dueCards}
                </span>
              ) : null}
            </Button>
          )}
        </div>

        {todayDay ? (
          <div className="space-y-2">
            {todayDay.activities.map((activity, idx) => (
              <ActivityRow
                key={idx}
                activity={activity}
                onComplete={() => handleToggleActivity(todayDay.day, idx)}
                onCompleteStudy={() => handleCompleteStudyActivity(todayDay.day, idx, true)}
                onGenerate={() => handleGenerateActivity(todayDay.day, idx)}
                onStudy={() => handleOpenStudyActivity(todayDay.day, idx)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            This plan has no scheduled activity for today.
          </div>
        )}
      </div>

      <AnimatePresence>
        {completionSummary ? (
          <ActivityCompletionCard
            summary={completionSummary}
            onDismiss={() => setCompletionSummary(null)}
          />
        ) : null}
      </AnimatePresence>

      {/* Progress + Stats Bar */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Overall Progress</span>
          <span className="text-muted-foreground">{progress}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={<BarChart3 className="h-4 w-4" />} label="Generated Items" value={stats.totalCards} />
            <StatCard icon={<Target className="h-4 w-4" />} label="Due Now" value={stats.dueCards} accent />
            <StatCard icon={<FileText className="h-4 w-4 text-blue-500" />} label="Generated Flashcards" value={stats.cardsByType?.flashcard || 0} />
            <StatCard icon={<Clock className="h-4 w-4 text-violet-500" />} label="Tracked Study" value={trackedStudyMinutes} suffix="m" />
          </div>
        )}

        {/* Start Session CTA */}
        {canContinuePlan && (
          <Button
            onClick={() => { void handleContinuePlan() }}
            variant="purple"
            className="w-full gap-2"
          >
            <Play className="h-4 w-4" />
            {nextTodayActivity ? 'Continue Today\'s Plan' : 'Start Review Session'}
            {!nextTodayActivity && (stats?.dueCards || 0) > 0 ? (
              <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                {stats?.dueCards} due
              </span>
            ) : null}
          </Button>
        )}
      </div>

      {/* Schedule Timeline */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Schedule
        </h2>

        <div className="space-y-1">
          {plan.schedule.map((day) => {
            const isToday = day.day === plan.currentDay
            const isPast = day.day < plan.currentDay
            const isExpanded = expandedDays.has(day.day)
            const completedCount = day.activities.filter(isActivityComplete).length
            const totalCount = day.activities.length
            return (
              <div
                key={day.day}
                className={cn(
                  'rounded-xl border transition-colors',
                  isToday && 'ring-2 ring-primary/30 border-primary/20 bg-primary/[0.02]',
                  isPast && day.isCompleted && 'opacity-60',
                )}
              >
                {/* Day Header */}
                <button
                  onClick={() => toggleDay(day.day)}
                  className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-muted/50 transition-colors rounded-xl"
                >
                  {day.isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : isToday ? (
                    <div className="h-4 w-4 rounded-full bg-primary/20 border-2 border-primary shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-medium', isToday && 'text-primary')}>
                        Day {day.day}
                      </span>
                      {day.date && (
                        <span className="text-xs text-muted-foreground">
                          {formatDate(day.date)}
                        </span>
                      )}
                      {isToday && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                          Today
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {completedCount}/{totalCount} activities
                      {totalCount > 0 && completedCount === totalCount && ' - Complete'}
                    </div>
                  </div>

                  {/* Activity type pills preview when collapsed */}
                  {!isExpanded && (
                    <div className="flex items-center gap-1 mr-2">
                      {day.activities.map((a, i) => {
                        const config = ACTIVITY_CONFIG[a.type]
                        return config ? (
                          <span key={i} className={cn('p-1 rounded', config.color)}>
                            {config.icon}
                          </span>
                        ) : null
                      })}
                    </div>
                  )}

                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {/* Expanded Activities */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3.5 pb-3.5 space-y-2 ml-7">
                        {day.activities.map((activity, idx) => (
                          <ActivityRow
                            key={idx}
                            activity={activity}
                            onComplete={() => handleToggleActivity(day.day, idx)}
                            onCompleteStudy={() => handleCompleteStudyActivity(day.day, idx, isToday)}
                            onGenerate={() => handleGenerateActivity(day.day, idx)}
                            onStudy={() => handleOpenStudyActivity(day.day, idx)}
                          />
                        ))}

                        {/* Start day's session */}
                        {isToday && canContinuePlan && day.activities.some(a => !isActivityComplete(a)) && (
                          <Button
                            onClick={() => { void handleContinuePlan() }}
                            variant="outline"
                            size="sm"
                            className="w-full mt-2 gap-1.5"
                          >
                            <Play className="h-3.5 w-3.5" />
                            Continue Day {day.day}
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Study Plan</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{plan.title}&quot; and unlink all associated review cards.
              The cards themselves won&apos;t be deleted — they&apos;ll just no longer be part of this plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Delete Plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}

function ActivityCompletionCard({
  summary,
  onDismiss,
}: {
  summary: ActivityCompletionSummary
  onDismiss: () => void
}) {
  return (
    <motion.div
      key={summary.key}
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className="relative overflow-hidden rounded-xl border border-green-500/20 bg-green-500/[0.04] p-4 shadow-sm"
    >
      <motion.div
        aria-hidden
        className="absolute right-5 top-5 h-14 w-14 rounded-full bg-green-400/10"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: [0.5, 1.4, 1], opacity: [0, 0.7, 0.25] }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500 text-white shadow-sm">
            <Check className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">Activity Complete</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Sparkles className="h-3 w-3 text-green-500" />
                {summary.typeLabel}
              </span>
            </div>
            <p className="mt-1 truncate text-sm text-foreground">{summary.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{summary.secondaryMetric}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:min-w-[220px]">
          <div className="rounded-lg bg-background/75 p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Reviewed</p>
            <p className="mt-0.5 text-sm font-semibold">{summary.primaryMetric}</p>
          </div>
          <div className="rounded-lg bg-background/75 p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Time</p>
            <p className="mt-0.5 text-sm font-semibold">{summary.timeSpent}</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="absolute right-1 top-1 h-7 w-7 p-0 sm:static"
          aria-label="Dismiss completion summary"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.div>
  )
}

function ActivityRow({
  activity,
  onComplete,
  onCompleteStudy,
  onGenerate,
  onStudy,
}: {
  activity: PlanActivity
  onComplete: () => void
  onCompleteStudy: () => void
  onGenerate: () => void
  onStudy: () => void
}) {
  const config = ACTIVITY_CONFIG[activity.type] || ACTIVITY_CONFIG.flashcard_review
  const isCompleted = isActivityComplete(activity)
  const state = getActivityState(activity)
  const isGenerating = activity.generationStatus === 'generating'
  const isReady = activity.generationStatus === 'ready' || activity.generationStatus === 'not_required'
  const canGenerate = (isGenerationNeeded(activity) || isGenerating) && !!studyToolTypeForActivity(activity.type)
  const canStudy = activity.type !== 'review_due_cards'
    && isReady
    && !!activity.generatedSourceId
  const canCompleteStudy = canStudy && !isCompleted && activity.completionStatus === 'in_progress'
  const timeLabel = trackedTimeLabel(activity)

  return (
    <div className={cn(
      'flex flex-col gap-2 p-2.5 rounded-lg border transition-colors sm:flex-row sm:items-center sm:gap-3',
      isCompleted
        ? 'bg-muted/30 border-muted'
        : 'bg-card border-border hover:border-primary/20',
    )}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {/* Completion checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onComplete() }}
          className={cn(
            'mt-0.5 shrink-0 transition-colors',
            isCompleted ? 'text-green-500 hover:text-green-400' : 'text-muted-foreground/40 hover:text-muted-foreground',
          )}
        >
          {isCompleted ? (
            <CheckCircle2 className="h-4.5 w-4.5" />
          ) : (
            <Circle className="h-4.5 w-4.5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium shrink-0', config.color)}>
              {config.icon}
              {config.label}
            </span>
            {state ? (
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', state.className)}>
                {state.icon}
                {state.label}
              </span>
            ) : null}
          </div>
          <p className={cn('mt-1 text-sm truncate', isCompleted && 'line-through text-muted-foreground')}>
            {activity.topic}
          </p>
          {activity.notes && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{activity.notes}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            {activity.schedulerReason ? (
              <span>Why: {activity.schedulerReason}</span>
            ) : null}
            {activity.expectedOutcome ? (
              <span>Outcome: {activity.expectedOutcome}</span>
            ) : null}
            {timeLabel ? (
              <span>{timeLabel}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pl-7 sm:pl-0">
        <span className="text-xs text-muted-foreground shrink-0">
          {activity.reviewedCount && activity.reviewedCount > 0
            ? `${activity.reviewedCount} reviewed`
            : `${activity.cardCount ?? activity.plannedMinutes} ${activityUnit(activity.type, activity.cardCount ?? activity.plannedMinutes)}`}
        </span>

        <div className="flex items-center gap-1.5">
        {canGenerate ? (
          <Button
            variant={activity.generationStatus === 'failed' ? 'outline' : 'purple'}
            size="sm"
            onClick={(e) => { e.stopPropagation(); onGenerate() }}
            disabled={isGenerating}
            className="shrink-0 h-7 px-2.5 text-xs gap-1"
          >
            {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookOpen className="h-3 w-3" />}
            {activity.generationStatus === 'failed' ? 'Retry' : isGenerating ? 'Generating' : 'Generate'}
          </Button>
        ) : canStudy ? (
          <>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onStudy() }}
            className="shrink-0 h-7 px-2.5 text-xs gap-1"
          >
            <BookOpen className="h-3 w-3" />
            {isCompleted ? 'Revisit' : activity.completionStatus === 'in_progress' ? 'Continue' : 'Open'}
          </Button>
          {canCompleteStudy ? (
            <Button
              variant="purple"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onCompleteStudy() }}
              className="shrink-0 h-7 px-2.5 text-xs gap-1"
            >
              <Check className="h-3 w-3" />
              Done
            </Button>
          ) : null}
          </>
        ) : null}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, accent, suffix = '' }: { icon: React.ReactNode; label: string; value: number; accent?: boolean; suffix?: string }) {
  return (
    <div className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/50">
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <p className={cn('text-lg font-semibold leading-none', accent && value > 0 && 'text-primary')}>
          {value}{suffix}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}
