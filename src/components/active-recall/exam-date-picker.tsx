'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarDays, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { ExamDate } from '@/types/active-recall'

interface ExamDatePickerProps {
  className?: string
}

export function ExamDatePicker({ className }: ExamDatePickerProps) {
  const [exams, setExams] = React.useState<ExamDate[]>([])
  const [isAdding, setIsAdding] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState('')
  const [newDate, setNewDate] = React.useState('')

  React.useEffect(() => {
    fetchExams()
  }, [])

  const fetchExams = async () => {
    try {
      const response = await fetch('/api/active-recall/exam-dates')
      const data = await response.json()
      setExams(data.exams || [])
    } catch (error) {
      console.error('[ExamDates] Fetch error:', error)
    }
  }

  const addExam = async () => {
    if (!newTitle.trim() || !newDate) return

    try {
      const response = await fetch('/api/active-recall/exam-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, examDate: newDate }),
      })

      if (response.ok) {
        const data = await response.json()
        setExams((prev) => [...prev, data.exam].sort(
          (a, b) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime()
        ))
        setNewTitle('')
        setNewDate('')
        setIsAdding(false)
      }
    } catch (error) {
      console.error('[ExamDates] Add error:', error)
    }
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
      console.error('[ExamDates] Remove error:', error)
    }
  }

  const getDaysUntil = (dateStr: string) => {
    const examDate = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diff = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  return (
    <div className={cn('rounded-xl border bg-card p-5', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays className="w-4 h-4" />
          Exam Dates
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsAdding(!isAdding)}
          className="gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>

      {/* Add exam form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 mb-4 overflow-hidden"
          >
            <input
              type="text"
              placeholder="Exam title (e.g., Biology Midterm)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="flex-1 px-3 py-2 rounded-lg border bg-background text-sm"
              />
              <Button size="sm" onClick={addExam} disabled={!newTitle.trim() || !newDate}>
                Save
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exam list */}
      {exams.length === 0 && !isAdding && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No exams scheduled. Add one to get pre-exam coaching.
        </p>
      )}

      <div className="space-y-2">
        {exams.map((exam) => {
          const daysUntil = getDaysUntil(exam.exam_date)
          const isUrgent = daysUntil <= 3 && daysUntil >= 0
          const isPast = daysUntil < 0

          return (
            <div
              key={exam.id}
              className={cn(
                'flex items-center justify-between px-3 py-2 rounded-lg border',
                isUrgent && 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20',
                isPast && 'opacity-50'
              )}
            >
              <div className="flex items-center gap-2">
                {isUrgent && <AlertTriangle className="w-4 h-4 text-red-500" />}
                <div>
                  <span className="text-sm font-medium">{exam.title}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {new Date(exam.exam_date).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-xs font-medium',
                  daysUntil <= 1 ? 'text-red-500' :
                  daysUntil <= 7 ? 'text-orange-500' :
                  'text-muted-foreground'
                )}>
                  {isPast ? 'Past' : daysUntil === 0 ? 'Today!' : `${daysUntil}d`}
                </span>
                <button
                  onClick={() => removeExam(exam.id)}
                  className="p-1 hover:bg-muted rounded"
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
