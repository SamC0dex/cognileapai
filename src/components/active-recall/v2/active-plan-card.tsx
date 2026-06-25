'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Play,
  Calendar,
  Target,
  FileText,
  FlaskConical,
  TreePine,
  BookOpen,
  NotebookText,
  ScrollText,
  RotateCcw,
  Loader2,
  MoreHorizontal,
  Pencil,
  Pause,
  Trash2,
  Check,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui'

interface PlanCardData {
  id: string
  title: string
  status: string
  currentDay: number
  totalDays: number
  totalActivities: number
  completedActivities: number
}

interface TodayData {
  today: {
    day: number
    date: string
    activities: {
      type: string
      topic: string
      cardCount?: number
      plannedMinutes?: number
      notes: string
      completed?: boolean
      completionStatus?: string
    }[]
  } | null
  dueCards: {
    total: number
    byType: Record<string, number>
  }
}

interface ActivePlanCardProps {
  plan: {
    id: string
    title: string
    status: string
    current_day: number
    total_activities: number
    completed_activities: number
  }
  onDeleted?: () => void
}

export function ActivePlanCard({ plan, onDeleted }: ActivePlanCardProps) {
  const router = useRouter()
  const [todayData, setTodayData] = useState<TodayData | null>(null)
  const [planData, setPlanData] = useState<PlanCardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Edit states
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    fetchToday()
  }, [plan.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchToday = async () => {
    try {
      const res = await fetch(`/api/active-recall/agent/today?plan_id=${plan.id}`)
      if (res.ok) {
        const data = await res.json()
        setPlanData(data.plan)
        setTodayData({ today: data.today, dueCards: data.dueCards })
      }
    } catch (e) {
      console.error('[ActivePlanCard] Error:', e)
    }
    setIsLoading(false)
  }

  const handleCardClick = () => {
    if (isRenaming) return
    router.push(`/active-recall/plan/${plan.id}`)
  }

  const handleStartSession = (e: React.MouseEvent) => {
    e.stopPropagation()
    router.push(`/active-recall/review?plan_id=${plan.id}`)
  }

  const handleRename = async () => {
    if (!renameValue.trim()) return
    try {
      const res = await fetch(`/api/active-recall/agent/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', title: renameValue.trim() }),
      })
      if (res.ok) {
        setPlanData(prev => prev ? { ...prev, title: renameValue.trim() } : prev)
      }
    } catch { /* ignore */ }
    setIsRenaming(false)
  }

  const handleToggleStatus = async () => {
    try {
      const res = await fetch(`/api/active-recall/agent/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_status' }),
      })
      if (res.ok) {
        const data = await res.json()
        setPlanData(prev => prev ? { ...prev, status: data.status } : prev)
      }
    } catch { /* ignore */ }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/active-recall/agent/plans/${plan.id}`, { method: 'DELETE' })
      if (res.ok) {
        window.dispatchEvent(new Event('study-tools-refresh'))
        onDeleted?.()
      }
    } catch { /* ignore */ }
    setIsDeleting(false)
    setShowDeleteDialog(false)
  }

  const displayPlan = planData || {
    id: plan.id,
    title: plan.title,
    status: plan.status,
    currentDay: plan.current_day,
    totalDays: 0,
    totalActivities: plan.total_activities,
    completedActivities: plan.completed_activities,
  }

  const progress = displayPlan.totalActivities > 0
    ? Math.round((displayPlan.completedActivities / displayPlan.totalActivities) * 100)
    : 0

  const dueTotal = todayData?.dueCards.total || 0

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border bg-card overflow-hidden cursor-pointer hover:border-primary/20 transition-colors group"
        onClick={handleCardClick}
      >
        {/* Header */}
        <div className="relative p-5 pb-3">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
          <div className="relative">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                {isRenaming ? (
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename()
                        if (e.key === 'Escape') setIsRenaming(false)
                      }}
                      className="text-base font-semibold bg-transparent border-b-2 border-primary outline-none w-full"
                    />
                    <button onClick={handleRename} className="p-0.5 hover:bg-muted rounded">
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    </button>
                    <button onClick={() => setIsRenaming(false)} className="p-0.5 hover:bg-muted rounded">
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <h3 className="font-semibold text-base truncate">{displayPlan.title}</h3>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Day {displayPlan.currentDay}{displayPlan.totalDays > 0 ? ` of ${displayPlan.totalDays}` : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    {displayPlan.completedActivities}/{displayPlan.totalActivities} done
                  </span>
                </div>
              </div>

              {/* Dropdown menu */}
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <span className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full',
                  displayPlan.status === 'active' && 'bg-green-500/10 text-green-600 dark:text-green-400',
                  displayPlan.status === 'paused' && 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
                )}>
                  {displayPlan.status}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1 hover:bg-muted rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => { setRenameValue(displayPlan.title); setIsRenaming(true) }}>
                      <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleToggleStatus}>
                      <Pause className="h-3.5 w-3.5 mr-2" />
                      {displayPlan.status === 'active' ? 'Pause' : 'Resume'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, delay: 0.2 }}
              />
            </div>
          </div>
        </div>

        {/* Today's Activities */}
        <div className="px-5 pb-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading today&apos;s plan...
            </div>
          ) : todayData?.today ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground mb-2">Today&apos;s Focus</p>
              {todayData.today.activities.slice(0, 3).map((activity, idx) => (
                <ActivityRow key={idx} activity={activity} />
              ))}
            </div>
          ) : dueTotal > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground mb-2">Due Cards</p>
              <DueCardsSummary byType={todayData?.dueCards.byType || {}} total={dueTotal} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-1">
              No cards due today. Great job staying on track!
            </p>
          )}

          {/* Start Session CTA */}
          {dueTotal > 0 && (
            <Button
              onClick={handleStartSession}
              variant="purple"
              size="sm"
              className="w-full mt-3 gap-2"
            >
              <Play className="h-3.5 w-3.5" />
              Start Today&apos;s Session
              <span className="ml-1 bg-white/20 px-1.5 py-0.5 rounded-full text-[10px]">
                {dueTotal}
              </span>
            </Button>
          )}
        </div>
      </motion.div>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Study Plan</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{displayPlan.title}&quot;. Review cards won&apos;t be deleted.
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
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ActivityRow({
  activity,
}: {
  activity: {
    type: string
    topic: string
    cardCount?: number
    plannedMinutes?: number
    notes: string
    completed?: boolean
    completionStatus?: string
  }
}) {
  const typeConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    study_guide: {
      icon: <BookOpen className="h-3 w-3" />,
      label: 'Study Guide',
      color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10',
    },
    summary: {
      icon: <ScrollText className="h-3 w-3" />,
      label: 'Summary',
      color: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
    },
    smart_notes: {
      icon: <NotebookText className="h-3 w-3" />,
      label: 'Smart Notes',
      color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    },
    mindmap: {
      icon: <TreePine className="h-3 w-3" />,
      label: 'Mind Map',
      color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    },
    flashcards: {
      icon: <FileText className="h-3 w-3" />,
      label: 'Flashcards',
      color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
    },
    quiz: {
      icon: <FlaskConical className="h-3 w-3" />,
      label: 'Quiz',
      color: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
    },
    review_due_cards: {
      icon: <RotateCcw className="h-3 w-3" />,
      label: 'Due Review',
      color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10',
    },
    flashcard_review: {
      icon: <FileText className="h-3 w-3" />,
      label: 'Flashcards',
      color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
    },
    quiz_session: {
      icon: <FlaskConical className="h-3 w-3" />,
      label: 'Quiz',
      color: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
    },
    mindmap_review: {
      icon: <TreePine className="h-3 w-3" />,
      label: 'Mind Map',
      color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    },
  }

  const config = typeConfig[activity.type] || typeConfig.flashcard_review
  const isCompleted = activity.completed || activity.completionStatus === 'completed'
  const count = activity.cardCount ?? activity.plannedMinutes
  const unit = activity.cardCount
    ? activity.type === 'mindmap' || activity.type === 'mindmap_review'
      ? activity.cardCount === 1 ? 'mind map' : 'mind maps'
      : activity.type === 'quiz' || activity.type === 'quiz_session'
        ? activity.cardCount === 1 ? 'question' : 'questions'
        : activity.cardCount === 1 ? 'card' : 'cards'
    : activity.plannedMinutes === 1 ? 'minute' : 'minutes'

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium', config.color)}>
        {config.icon}
        {config.label}
      </span>
      <span className={cn('text-muted-foreground truncate', isCompleted && 'line-through')}>
        {activity.topic}
      </span>
      {count ? (
        <span className="text-muted-foreground ml-auto shrink-0">
          {count} {unit}
        </span>
      ) : null}
    </div>
  )
}

function DueCardsSummary({ byType, total }: { byType: Record<string, number>; total: number }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      {byType.flashcard > 0 && (
        <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
          <FileText className="h-3 w-3" /> {byType.flashcard} {byType.flashcard === 1 ? 'card' : 'cards'}
        </span>
      )}
      {byType.quiz > 0 && (
        <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
          <FlaskConical className="h-3 w-3" /> {byType.quiz} {byType.quiz === 1 ? 'question' : 'questions'}
        </span>
      )}
      {byType.mindmap > 0 && (
        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <TreePine className="h-3 w-3" /> {byType.mindmap} {byType.mindmap === 1 ? 'mind map' : 'mind maps'}
        </span>
      )}
      <span className="text-muted-foreground ml-auto">{total} total due</span>
    </div>
  )
}
