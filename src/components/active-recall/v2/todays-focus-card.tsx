'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  Clock,
  Play,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import type { SmartScheduleMeta } from '@/types/active-recall'

interface TodaysFocusCardProps {
  totalDue: number
}

const TIME_OPTIONS = [
  { label: '5 min', minutes: 5 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: 'All', minutes: 0 },
]

export function TodaysFocusCard({ totalDue }: TodaysFocusCardProps) {
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null)
  const [smartMeta, setSmartMeta] = useState<SmartScheduleMeta | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const fetchSmartMeta = useCallback(async () => {
    if (totalDue === 0) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/active-recall/due-cards?smart=true&limit=200')
      if (res.ok) {
        const data = await res.json()
        setSmartMeta(data.smartMeta || null)
      }
    } catch { /* ignore */ }
    setIsLoading(false)
  }, [totalDue])

  useEffect(() => {
    fetchSmartMeta()
  }, [fetchSmartMeta])

  if (totalDue === 0) return null

  const estimatedCards = selectedMinutes
    ? Math.min(totalDue, Math.ceil(selectedMinutes * 2)) // ~30s per card
    : totalDue

  const handleStart = () => {
    const params = new URLSearchParams({ smart: 'true' })
    if (selectedMinutes && selectedMinutes > 0) {
      params.set('minutes', String(selectedMinutes))
    }
    window.location.href = `/active-recall/review?${params.toString()}`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-xl border bg-card p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Today&apos;s Focus</h3>
            <p className="text-[11px] text-muted-foreground">Smart scheduling based on your performance</p>
          </div>
        </div>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Focus topics */}
      {smartMeta && smartMeta.topFocusTopics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {smartMeta.topFocusTopics.map((t, idx) => (
            <motion.div
              key={t.topic}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + idx * 0.08 }}
              className={cn(
                'text-[11px] font-medium px-2.5 py-1 rounded-full border',
                idx === 0 && 'bg-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-400',
                idx === 1 && 'bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400',
                idx === 2 && 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400',
              )}
            >
              {t.topic} ({t.cardCount})
            </motion.div>
          ))}
        </div>
      )}

      {/* Urgency breakdown */}
      {smartMeta && (
        <div className="flex gap-3 mb-4 text-[11px]">
          {smartMeta.cardsByUrgency.critical > 0 && (
            <span className="text-red-600 dark:text-red-400 font-medium">
              {smartMeta.cardsByUrgency.critical} critical
            </span>
          )}
          {smartMeta.cardsByUrgency.important > 0 && (
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              {smartMeta.cardsByUrgency.important} important
            </span>
          )}
          {smartMeta.cardsByUrgency.routine > 0 && (
            <span className="text-muted-foreground">
              {smartMeta.cardsByUrgency.routine} routine
            </span>
          )}
        </div>
      )}

      {/* Time selector */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">How much time do you have?</span>
        </div>
        <div className="flex gap-2">
          {TIME_OPTIONS.map((opt) => (
            <button
              key={opt.minutes}
              onClick={() => setSelectedMinutes(opt.minutes === selectedMinutes ? null : opt.minutes)}
              className={cn(
                'flex-1 py-1.5 px-2 rounded-lg text-xs font-medium border transition-all',
                selectedMinutes === opt.minutes
                  ? 'bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-400'
                  : 'border-border hover:bg-muted/50 text-muted-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Card count + Start button */}
      <div className="flex items-center justify-between">
        <AnimatePresence mode="wait">
          <motion.p
            key={estimatedCards}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs text-muted-foreground"
          >
            <span className="font-semibold text-foreground">{estimatedCards} cards</span>
            {selectedMinutes ? ` for a ${selectedMinutes}-min session` : ' ready to review'}
          </motion.p>
        </AnimatePresence>

        <Button
          onClick={handleStart}
          variant="purple"
          size="sm"
          className="gap-1.5"
        >
          <Play className="h-3.5 w-3.5" />
          Start Smart Session
        </Button>
      </div>
    </motion.div>
  )
}
