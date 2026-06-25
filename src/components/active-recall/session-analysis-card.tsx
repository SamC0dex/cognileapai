'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  Search,
  SlidersHorizontal,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import type { SessionAnalysisInsights } from '@/types/active-recall'

interface SessionAnalysisCardProps {
  status: 'analyzing' | 'complete' | 'error'
  insights: SessionAnalysisInsights | null
  cardsReviewed: number
  onContinue: () => void
}

const ANALYSIS_STEPS = [
  { id: 'review', icon: Search, label: 'Reviewing your session', activeLabel: 'Reviewing {n} cards...' },
  { id: 'patterns', icon: Brain, label: 'Identifying patterns', activeLabel: 'Identifying weak spots...' },
  { id: 'adjust', icon: SlidersHorizontal, label: 'Adjusting intervals', activeLabel: 'Optimizing your schedule...' },
  { id: 'plan', icon: CalendarClock, label: 'Updating your plan', activeLabel: 'Adapting tomorrow\'s session...' },
]

export function SessionAnalysisCard({ status, insights, cardsReviewed, onContinue }: SessionAnalysisCardProps) {
  const [activeStep, setActiveStep] = useState(0)
  const [showInsights, setShowInsights] = useState(false)

  // Animate through steps while analyzing
  useEffect(() => {
    if (status !== 'analyzing') return

    const interval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev >= ANALYSIS_STEPS.length - 1) return prev
        return prev + 1
      })
    }, 1200)

    return () => clearInterval(interval)
  }, [status])

  // When analysis completes, mark all steps done and reveal insights after a beat
  useEffect(() => {
    if (status === 'complete' || status === 'error') {
      setActiveStep(ANALYSIS_STEPS.length)
      const timer = setTimeout(() => setShowInsights(true), 600)
      return () => clearTimeout(timer)
    }
  }, [status])

  // Auto-continue after showing insights
  useEffect(() => {
    if (!showInsights) return
    const timer = setTimeout(onContinue, 5000)
    return () => clearTimeout(timer)
  }, [showInsights, onContinue])

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        {/* Main card */}
        <div className="rounded-2xl border bg-card shadow-lg overflow-hidden">

          {/* Header with pulsing brain */}
          <div className="relative px-6 pt-6 pb-4">
            <div className="flex items-center gap-3">
              <motion.div
                animate={status === 'analyzing' ? {
                  scale: [1, 1.1, 1],
                  opacity: [0.7, 1, 0.7],
                } : { scale: 1, opacity: 1 }}
                transition={status === 'analyzing' ? {
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                } : {}}
                className={cn(
                  'h-10 w-10 rounded-xl flex items-center justify-center',
                  status === 'analyzing' ? 'bg-purple-500/10' : 'bg-green-500/10'
                )}
              >
                {status === 'analyzing' ? (
                  <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                ) : (
                  <Sparkles className="h-5 w-5 text-green-600 dark:text-green-400" />
                )}
              </motion.div>
              <div>
                <h3 className="font-semibold text-base">
                  {status === 'analyzing' ? 'Agent is analyzing...' : 'Analysis complete'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {status === 'analyzing'
                    ? 'Learning from your session to optimize future reviews'
                    : `${insights?.cardsAnalyzed || 0} cards analyzed`}
                </p>
              </div>
            </div>

            {/* Animated progress line */}
            {status === 'analyzing' && (
              <motion.div
                className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 8, ease: 'linear' }}
              />
            )}
          </div>

          {/* Analysis steps */}
          <div className="px-6 pb-4 space-y-2">
            {ANALYSIS_STEPS.map((step, idx) => {
              const Icon = step.icon
              const isDone = idx < activeStep
              const isActive = idx === activeStep && status === 'analyzing'
              const isPending = idx > activeStep

              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: isPending ? 0.4 : 1, x: 0 }}
                  transition={{ delay: idx * 0.3, duration: 0.3 }}
                  className={cn(
                    'flex items-center gap-3 py-2 px-3 rounded-lg transition-colors',
                    isActive && 'bg-purple-500/5',
                    isDone && 'bg-green-500/5',
                  )}
                >
                  <div className={cn(
                    'h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-300',
                    isDone && 'bg-green-500/15',
                    isActive && 'bg-purple-500/15',
                    isPending && 'bg-muted',
                  )}>
                    {isDone ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      >
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      </motion.div>
                    ) : isActive ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      >
                        <Icon className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                      </motion.div>
                    ) : (
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <span className={cn(
                    'text-sm',
                    isDone && 'text-green-700 dark:text-green-400',
                    isActive && 'text-purple-700 dark:text-purple-400 font-medium',
                    isPending && 'text-muted-foreground',
                  )}>
                    {isActive
                      ? step.activeLabel.replace('{n}', String(cardsReviewed))
                      : isDone
                        ? step.label
                        : step.label}
                  </span>
                </motion.div>
              )
            })}
          </div>

          {/* Insights reveal */}
          <AnimatePresence>
            {showInsights && insights && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-5 space-y-3 border-t pt-4">
                  {/* Adjustments summary */}
                  {insights.adjustments.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="flex items-start gap-2"
                    >
                      <SlidersHorizontal className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                      <p className="text-sm text-muted-foreground">
                        Adjusted intervals for <span className="font-medium text-foreground">{insights.adjustments.length} cards</span> based on your performance
                      </p>
                    </motion.div>
                  )}

                  {/* Weak cards */}
                  {insights.weakCards.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 }}
                      className="space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                          {insights.weakCards.length} card{insights.weakCards.length > 1 ? 's' : ''} need attention
                        </span>
                      </div>
                      {insights.weakCards.slice(0, 3).map((card, i) => (
                        <motion.div
                          key={card.cardId}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.35 + i * 0.1 }}
                          className="ml-6 text-xs text-muted-foreground bg-amber-500/5 rounded-md px-2.5 py-1.5 border border-amber-500/10"
                        >
                          <span className="font-medium text-foreground">{card.topic}</span>
                          {card.reason && <span> — {card.reason}</span>}
                        </motion.div>
                      ))}
                    </motion.div>
                  )}

                  {/* Plan adapted */}
                  {insights.planAdapted && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="flex items-start gap-2"
                    >
                      <CalendarClock className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                      <p className="text-sm text-blue-700 dark:text-blue-400">
                        Study plan updated for tomorrow
                      </p>
                    </motion.div>
                  )}

                  {/* Continue button */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="pt-2"
                  >
                    <Button
                      onClick={onContinue}
                      variant="ghost"
                      size="sm"
                      className="w-full text-muted-foreground hover:text-foreground gap-2"
                    >
                      See full summary
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error state */}
          <AnimatePresence>
            {status === 'error' && showInsights && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-5 border-t pt-4">
                  <Button
                    onClick={onContinue}
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground hover:text-foreground gap-2"
                  >
                    Continue to summary
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
