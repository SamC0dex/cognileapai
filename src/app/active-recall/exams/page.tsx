'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap,
  Plus,
  Trash2,
  AlertTriangle,
  Calendar,
  BookOpen,
  Target,
  Clock,
  X,
  Play,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { useActiveRecallStore } from '@/lib/active-recall-store'
import type { ExamDate } from '@/types/active-recall'

interface StudyPlanDay {
  day: number
  date: string
  focus: string
  cards: number
  notes: string
}

interface StudyPlan {
  id: string | null
  examId: string
  examTitle: string
  examDate: string
  daysUntil: number
  days: StudyPlanDay[]
  totalCards: number
  estimatedHours: number
  weakTopics: string[]
  strongTopics: string[]
  masteryPct: number
}

export default function ExamsPage() {
  const { stats, masteryByDocument, fetchStats } = useActiveRecallStore()
  const [exams, setExams] = useState<ExamDate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [generatingPlanFor, setGeneratingPlanFor] = useState<string | null>(null)
  const [studyPlans, setStudyPlans] = useState<Record<string, StudyPlan>>({})
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null)

  useEffect(() => {
    fetchExams()
    fetchStats()
  }, [fetchStats])

  const fetchExams = async () => {
    try {
      const response = await fetch('/api/active-recall/exam-dates')
      const data = await response.json()
      setExams(data.exams || [])
    } catch (error) {
      console.error('[Exams] Fetch error:', error)
    }
    setIsLoading(false)
  }

  const removeExam = async (id: string) => {
    try {
      await fetch('/api/active-recall/exam-dates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setExams((prev) => prev.filter((e) => e.id !== id))
    } catch (error) {
      console.error('[Exams] Remove error:', error)
    }
  }

  const getDaysUntil = (dateStr: string) => {
    const examDate = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  const generateStudyPlan = async (examId: string) => {
    setGeneratingPlanFor(examId)
    try {
      const response = await fetch('/api/active-recall/study-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId }),
      })
      if (response.ok) {
        const data = await response.json()
        setStudyPlans((prev) => ({ ...prev, [examId]: data.plan }))
        setExpandedPlan(examId)
      }
    } catch (error) {
      console.error('[Exams] Study plan error:', error)
    }
    setGeneratingPlanFor(null)
  }

  // Approximate readiness from overall mastery
  const overallMastery = stats?.masteryPct || 0

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  const upcomingExams = exams
    .filter((e) => getDaysUntil(e.exam_date) >= 0)
    .sort((a, b) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime())
  const pastExams = exams.filter((e) => getDaysUntil(e.exam_date) < 0)

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Exam Prep</h2>
        <Button
          onClick={() => setShowAddDialog(true)}
          size="sm"
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Add Exam
        </Button>
      </div>

      {/* Upcoming Exams */}
      {upcomingExams.length > 0 ? (
        <div className="space-y-4">
          {upcomingExams.map((exam, i) => {
            const daysUntil = getDaysUntil(exam.exam_date)
            const isUrgent = daysUntil <= 3
            const isSoon = daysUntil <= 7

            // Approximate readiness (will improve with linked docs)
            const readiness = Math.min(overallMastery * 1.2, 100)

            return (
              <motion.div
                key={exam.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  'rounded-xl border bg-card p-5 overflow-hidden',
                  isUrgent && 'border-red-300 dark:border-red-800'
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {isUrgent && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
                      <h3 className="text-base font-semibold truncate">{exam.title}</h3>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(exam.exam_date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                      <span className={cn(
                        'font-medium',
                        isUrgent ? 'text-red-500' : isSoon ? 'text-orange-500' : ''
                      )}>
                        {daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days left`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => removeExam(exam.id)}
                      className="p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                {/* Readiness bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Estimated Readiness</span>
                    <span className={cn(
                      'text-sm font-bold',
                      readiness >= 80 ? 'text-green-500' :
                      readiness >= 50 ? 'text-yellow-500' :
                      'text-red-500'
                    )}>
                      {Math.round(readiness)}%
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className={cn(
                        'h-full rounded-full',
                        readiness >= 80 ? 'bg-green-400' :
                        readiness >= 50 ? 'bg-yellow-400' :
                        'bg-red-400'
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(readiness, 100)}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                </div>

                {/* Quick actions */}
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => {
                      window.location.href = '/active-recall'
                    }}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Study for this exam
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => generateStudyPlan(exam.id)}
                    disabled={generatingPlanFor === exam.id}
                  >
                    {generatingPlanFor === exam.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {generatingPlanFor === exam.id ? 'Generating...' : studyPlans[exam.id] ? 'Regenerate Plan' : 'AI Study Plan'}
                  </Button>
                  {studyPlans[exam.id] && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => setExpandedPlan(expandedPlan === exam.id ? null : exam.id)}
                    >
                      {expandedPlan === exam.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {expandedPlan === exam.id ? 'Hide Plan' : 'View Plan'}
                    </Button>
                  )}
                  {daysUntil <= 2 && (
                    <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Cram mode recommended
                    </span>
                  )}
                </div>

                {/* Study Plan View */}
                <AnimatePresence>
                  {expandedPlan === exam.id && studyPlans[exam.id] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <StudyPlanView plan={studyPlans[exam.id]} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-8 text-center">
          <GraduationCap className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <h3 className="text-base font-semibold mb-1">No upcoming exams</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">
            Add your exams to get countdown timers, readiness tracking, and AI-powered study plans.
          </p>
          <Button onClick={() => setShowAddDialog(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Your First Exam
          </Button>
        </div>
      )}

      {/* Past Exams */}
      {pastExams.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">Past Exams</h3>
          <div className="space-y-2">
            {pastExams.map((exam) => (
              <div
                key={exam.id}
                className="flex items-center justify-between px-4 py-3 rounded-lg border opacity-60"
              >
                <div>
                  <p className="text-sm font-medium">{exam.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(exam.exam_date).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => removeExam(exam.id)}
                  className="p-1.5 hover:bg-muted rounded transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Exam Dialog */}
      <AnimatePresence>
        {showAddDialog && (
          <AddExamDialog
            onClose={() => setShowAddDialog(false)}
            onAdded={(exam) => {
              setExams((prev) => [...prev, exam].sort(
                (a, b) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime()
              ))
              setShowAddDialog(false)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function AddExamDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: (exam: ExamDate) => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim() || !date) return
    setIsSaving(true)

    try {
      const response = await fetch('/api/active-recall/exam-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), examDate: date }),
      })

      if (response.ok) {
        const data = await response.json()
        onAdded(data.exam)
      }
    } catch (error) {
      console.error('[Exams] Add error:', error)
    }
    setIsSaving(false)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[401] w-full max-w-md"
      >
        <div className="rounded-2xl border bg-card shadow-xl p-6 mx-4">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold">Add Exam</h3>
            <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Exam Title</label>
              <input
                type="text"
                placeholder="e.g., Biology Midterm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Exam Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!title.trim() || !date || isSaving}
            >
              {isSaving ? 'Saving...' : 'Add Exam'}
            </Button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

function StudyPlanView({ plan }: { plan: StudyPlan }) {
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="mt-4 pt-4 border-t space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI Study Plan
        </h4>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{plan.totalCards} cards total</span>
          <span>{plan.estimatedHours}h estimated</span>
        </div>
      </div>

      {plan.weakTopics.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Focus areas: <span className="text-foreground font-medium">{plan.weakTopics.join(', ')}</span>
        </p>
      )}

      <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
        {plan.days.map((day) => {
          const isPast = day.date < today
          const isToday = day.date === today

          return (
            <div
              key={day.day}
              className={cn(
                'flex items-start gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isToday ? 'bg-primary/10 border border-primary/20' :
                isPast ? 'opacity-50' : 'hover:bg-muted/50'
              )}
            >
              <div className="flex items-center gap-2 shrink-0 min-w-[100px]">
                {isPast ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                ) : isToday ? (
                  <Target className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className={cn('text-xs', isToday && 'font-semibold text-primary')}>
                  {isToday ? 'Today' : new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{day.focus}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">{day.cards} cards</span>
                </div>
                {day.notes && (
                  <p className="text-xs text-muted-foreground mt-0.5">{day.notes}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
