'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { GenerationProgress } from '@/lib/course-store'

interface CourseGenerationProgressProps {
  progress: GenerationProgress
  courseTitle: string
  onRetry?: () => void
  className?: string
}

// Phase display information
const PHASE_INFO = {
  outline: {
    title: 'Reading Document',
    icon: '📖',
    color: 'text-blue-500'
  },
  lessons: {
    title: 'Creating Lessons',
    icon: '✏️',
    color: 'text-teal-500'
  },
  quizzes: {
    title: 'Adding Quizzes',
    icon: '🎯',
    color: 'text-purple-500'
  },
  verification: {
    title: 'Quality Check',
    icon: '🔍',
    color: 'text-indigo-500'
  },
  finalizing: {
    title: 'Finishing Up',
    icon: '✨',
    color: 'text-green-500'
  },
  complete: {
    title: 'Course Ready!',
    icon: '🎉',
    color: 'text-green-500'
  },
  error: {
    title: 'Generation Error',
    icon: '⚠️',
    color: 'text-red-500'
  }
}

export function CourseGenerationProgress({
  progress,
  courseTitle,
  onRetry,
  className
}: CourseGenerationProgressProps) {
  const [timeElapsed, setTimeElapsed] = React.useState(0)
  const startTimeRef = React.useRef(Date.now())

  // Track elapsed time
  React.useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const phaseInfo = PHASE_INFO[progress.phase] || PHASE_INFO.outline
  const isComplete = progress.phase === 'complete'
  const isError = progress.phase === 'error'

  // Format time elapsed
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins > 0) {
      return `${mins}m ${secs}s`
    }
    return `${secs}s`
  }

  return (
    <div className={cn("w-full max-w-4xl mx-auto", className)}>
      <motion.div
        className="bg-background border border-border/50 rounded-3xl shadow-xl overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        {/* Header */}
        <div className="relative p-10 border-b border-border/50 overflow-hidden bg-gradient-to-r from-teal-500/5 via-purple-500/5 to-blue-500/5">
          <div className="flex items-center gap-6 mb-6">
            <motion.div
              className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-500/20 to-purple-500/20 border border-teal-500/30 flex items-center justify-center text-4xl shadow-lg"
              animate={isComplete ? { scale: [1, 1.1, 1] } : { rotate: [0, 360] }}
              transition={isComplete ? { duration: 0.6 } : { duration: 4, repeat: Infinity, ease: 'linear' }}
            >
              {isComplete ? '🎉' : phaseInfo.icon}
            </motion.div>
            <div className="flex-1">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-teal-600 to-purple-600 bg-clip-text text-transparent mb-2">
                {courseTitle}
              </h2>
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                  AI-powered course generation
                </p>
                {!isComplete && !isError && (
                  <motion.div
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/10 border border-red-500/20"
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-medium text-red-600 dark:text-red-400">LIVE</span>
                  </motion.div>
                )}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="relative">
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <motion.div
                className={cn(
                  "h-full rounded-full",
                  isError ? "bg-red-500" : "bg-gradient-to-r from-teal-500 to-purple-500"
                )}
                initial={{ width: '0%' }}
                animate={{ width: `${progress.percentage}%` }}
                transition={{
                  duration: 0.8,
                  ease: [0.4, 0.0, 0.2, 1]
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>{progress.percentage}% complete</span>
              <span>⏱️ {formatTime(timeElapsed)}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-10 space-y-8">
          {/* Step Indicators */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Generation Progress
            </h3>

            <div className="space-y-3">
              {[
                { key: 'outline', label: 'Reading gently...', icon: '📖' },
                { key: 'lessons', label: 'Finding the fun parts...', icon: '✏️' },
                { key: 'quizzes', label: 'Making tiny steps...', icon: '🎯' },
                { key: 'verification', label: 'Quality check...', icon: '🔍' },
                { key: 'finalizing', label: 'Ready!', icon: '✨' }
              ].map((step, index) => {
                const phaseOrder = ['outline', 'lessons', 'quizzes', 'verification', 'finalizing']
                const currentPhaseIndex = phaseOrder.indexOf(progress.phase)
                const stepPhaseIndex = phaseOrder.indexOf(step.key)
                const isCompleted = currentPhaseIndex > stepPhaseIndex
                const isActive = progress.phase === step.key
                const isPending = currentPhaseIndex < stepPhaseIndex

                return (
                  <motion.div
                    key={step.key}
                    className="flex items-center gap-4"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    {/* Step indicator */}
                    <div className="relative">
                      {isCompleted ? (
                        <motion.div
                          className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        >
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        </motion.div>
                      ) : isActive ? (
                        <motion.div
                          className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center"
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        </motion.div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
                        </div>
                      )}
                    </div>

                    {/* Step label */}
                    <div className="flex-1">
                      <p className={cn(
                        "text-base font-medium transition-colors",
                        isCompleted && "text-green-600 dark:text-green-400",
                        isActive && "text-teal-600 dark:text-teal-400",
                        isPending && "text-muted-foreground"
                      )}>
                        {step.label}
                      </p>
                      {isActive && progress.currentStep && (
                        <motion.p
                          className="text-sm text-muted-foreground mt-1"
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          {progress.currentStep}
                        </motion.p>
                      )}
                    </div>

                    {/* Step icon */}
                    <div className={cn(
                      "text-2xl transition-opacity",
                      isCompleted && "opacity-50",
                      isActive && "opacity-100",
                      isPending && "opacity-30"
                    )}>
                      {step.icon}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Error Message */}
          {isError && progress.error && (
            <motion.div
              className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">
                    Generation Error
                  </p>
                  <p className="text-sm text-red-600/90 dark:text-red-400/90">
                    {progress.error}
                  </p>
                </div>
                {onRetry && (
                  <Button
                    onClick={onRetry}
                    size="sm"
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Try Again
                  </Button>
                )}
              </div>
            </motion.div>
          )}

          {/* Helpful Tips */}
          {!isComplete && !isError && (
            <motion.div
              className="p-5 bg-gradient-to-r from-blue-500/5 to-purple-500/5 border border-blue-500/10 rounded-xl"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">💡</span>
                <div className="flex-1">
                  <p className="font-semibold text-foreground mb-1.5">ADHD-Friendly Design</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Your course is being optimized with short paragraphs, clear headings,
                    and visual elements to make learning enjoyable and accessible!
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Completion Message */}
          {isComplete && (
            <motion.div
              className="flex items-center justify-center gap-3 text-green-600 dark:text-green-400 py-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <CheckCircle2 className="w-8 h-8" />
              <span className="text-xl font-semibold">Course Ready! Refreshing...</span>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
