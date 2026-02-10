'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, BookOpen, Loader2, CheckCircle2, Sparkles, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Course, Chapter, GenerationProgress } from '@/lib/course-store'
import { useRouter } from 'next/navigation'

interface CourseGeneratingViewProps {
  course: Course
  chapters: Chapter[]
  progress: GenerationProgress
  onRefresh: () => void
}

const STUDY_TIPS = [
  { icon: '🧠', text: 'Spaced repetition is 50% more effective than cramming. Review what you learn tomorrow, then in 3 days.' },
  { icon: '✍️', text: 'Writing notes by hand improves retention by 29% compared to typing.' },
  { icon: '🎯', text: 'The Pomodoro Technique: 25 minutes of focus, 5-minute break. Your brain needs rest to consolidate.' },
  { icon: '💤', text: 'Sleep is when your brain moves information from short-term to long-term memory. Don\'t skip it!' },
  { icon: '🏃', text: 'A 20-minute walk before studying can improve focus and memory by up to 20%.' },
  { icon: '🎵', text: 'Ambient background noise (like a coffee shop) can boost creative thinking. Try lo-fi beats while studying.' },
  { icon: '📱', text: 'Just having your phone visible reduces cognitive capacity by 10%. Put it in another room while learning.' },
  { icon: '🧩', text: 'Teaching someone else is the best way to learn. Try explaining what you learned to a friend.' },
  { icon: '🌊', text: 'Your brain processes information in waves. Short study sessions with breaks beat marathon sessions.' },
  { icon: '🎨', text: 'Color-coding your notes activates visual memory pathways. Use colors to categorize concepts.' },
  { icon: '⚡', text: 'Active recall (testing yourself) is 3x more effective than re-reading your notes.' },
  { icon: '🌅', text: 'Most people learn best in the morning. Schedule your hardest material for when you\'re fresh.' },
]

const GENERATION_MESSAGES = [
  'Analyzing your document...',
  'Identifying key concepts...',
  'Structuring the learning path...',
  'Creating engaging content...',
  'Building quiz questions...',
  'Adding diagrams and visuals...',
  'Optimizing for your learning style...',
  'Polishing the final touches...',
]

export function CourseGeneratingView({
  course,
  chapters,
  progress,
  onRefresh
}: CourseGeneratingViewProps) {
  const router = useRouter()
  const [timeElapsed, setTimeElapsed] = React.useState(0)
  const [currentTipIndex, setCurrentTipIndex] = React.useState(0)
  const startTimeRef = React.useRef(Date.now())
  
  // Track elapsed time
  React.useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Rotate study tips every 8 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTipIndex(prev => (prev + 1) % STUDY_TIPS.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [])
  
  // Auto-refresh when complete
  React.useEffect(() => {
    if (progress.phase === 'complete') {
      setTimeout(onRefresh, 1500)
    }
  }, [progress.phase, onRefresh])
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  }
  
  const unitsCompleted = (progress as { unitsCompleted?: number }).unitsCompleted || 0
  const unitsTotal = (progress as { unitsTotal?: number }).unitsTotal || chapters.length || 1
  const isComplete = progress.phase === 'complete'

  // Estimate time remaining based on rate
  const estimatedTimeRemaining = React.useMemo(() => {
    if (isComplete || unitsCompleted === 0 || timeElapsed === 0) return null
    const avgTimePerUnit = timeElapsed / unitsCompleted
    const remaining = Math.ceil(avgTimePerUnit * (unitsTotal - unitsCompleted))
    if (remaining <= 0) return null
    const mins = Math.floor(remaining / 60)
    const secs = remaining % 60
    return mins > 0 ? `~${mins}m ${secs}s remaining` : `~${secs}s remaining`
  }, [unitsCompleted, unitsTotal, timeElapsed, isComplete])

  // Dynamic generation message
  const generationMessage = React.useMemo(() => {
    if (isComplete) return 'Course ready!'
    const msgIndex = Math.min(
      Math.floor((progress.percentage / 100) * GENERATION_MESSAGES.length),
      GENERATION_MESSAGES.length - 1
    )
    return GENERATION_MESSAGES[msgIndex]
  }, [progress.percentage, isComplete])

  const currentTip = STUDY_TIPS[currentTipIndex]
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
      {/* Header */}
      <div className="border-b border-border/40 bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/courses')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{course.title}</h1>
              <p className="text-sm text-muted-foreground">
                {course.description}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Progress Section */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Progress Card */}
        <motion.div
          className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-purple-500/10 via-teal-500/10 to-blue-500/10 border border-purple-500/20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {isComplete ? (
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-white" />
                </div>
              ) : (
                <motion.div
                  className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                >
                  <Sparkles className="h-5 w-5 text-white" />
                </motion.div>
              )}
              <div>
                <p className="font-semibold text-foreground">
                  {isComplete ? 'Course Ready!' : generationMessage}
                </p>
                <p className="text-sm text-muted-foreground">
                  {progress.currentStep}
                </p>
              </div>
            </div>
            
            <div className="text-right">
              <p className="text-2xl font-bold text-purple-600">
                {unitsCompleted}/{unitsTotal}
              </p>
              <p className="text-xs text-muted-foreground">units ready</p>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="relative h-3 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-purple-500 to-teal-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress.percentage}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{progress.percentage}% complete</span>
            <span>
              {estimatedTimeRemaining ? estimatedTimeRemaining : `${formatTime(timeElapsed)} elapsed`}
            </span>
          </div>
        </motion.div>
        
        {/* Units Grid */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Course Units
          </h2>
          
          <div className="grid gap-4">
            {chapters.map((chapter, index) => {
              const hasLesson = chapter.lessons && chapter.lessons.length > 0
              const isGenerating = index === unitsCompleted && !isComplete
              const isReady = index < unitsCompleted || isComplete
              const isPending = index > unitsCompleted && !isComplete
              
              return (
                <motion.div
                  key={chapter.id}
                  className={cn(
                    "p-4 rounded-xl border transition-all",
                    isReady && "bg-background border-green-500/30 hover:border-green-500/50",
                    isGenerating && "bg-purple-500/5 border-purple-500/30",
                    isPending && "bg-muted/30 border-border/50 opacity-60"
                  )}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="flex items-center gap-4">
                    {/* Status Icon */}
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold",
                      isReady && "bg-green-500",
                      isGenerating && "bg-purple-500",
                      isPending && "bg-muted-foreground/30"
                    )}>
                      {isReady ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : isGenerating ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {isPending ? (
                        <>
                          <div className="h-5 w-48 bg-muted rounded animate-pulse mb-2" />
                          <div className="h-4 w-32 bg-muted/50 rounded animate-pulse" />
                        </>
                      ) : (
                        <>
                          <h3 className="font-medium text-foreground truncate">
                            {chapter.title}
                          </h3>
                          <p className="text-sm text-muted-foreground truncate">
                            {chapter.description || (isGenerating ? 'Generating content...' : 'Ready to learn')}
                          </p>
                        </>
                      )}
                    </div>
                    
                    {/* Action */}
                    <div>
                      {isReady && hasLesson && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const lessonId = chapter.lessons[0]?.id
                            if (lessonId) {
                              router.push(`/courses/${course.id}/lessons/${lessonId}`)
                            }
                          }}
                          className="text-green-600 border-green-500/30 hover:bg-green-500/10"
                        >
                          Start
                        </Button>
                      )}
                      {isGenerating && (
                        <span className="text-xs text-purple-600 font-medium px-3 py-1 rounded-full bg-purple-500/10">
                          Creating...
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
        
        {/* Start Learning Tip */}
        {!isComplete && unitsCompleted > 0 && (
          <motion.div
            className="mt-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex gap-3">
              <span className="text-xl">🚀</span>
              <div>
                <p className="font-medium text-foreground mb-1">
                  Jump in — {unitsCompleted} {unitsCompleted === 1 ? 'unit is' : 'units are'} ready!
                </p>
                <p className="text-sm text-muted-foreground">
                  Start learning now. We&apos;ll keep building the rest in the background.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Rotating Study Tips */}
        {!isComplete && (
          <motion.div
            className="mt-4 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-blue-600 dark:text-blue-400">
              <Lightbulb className="h-4 w-4" />
              <span>Study Tip</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTipIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="flex gap-3"
              >
                <span className="text-xl flex-shrink-0">{currentTip.icon}</span>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {currentTip.text}
                </p>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  )
}
