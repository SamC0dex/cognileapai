'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, BookOpen, Clock, Loader2, CheckCircle2, Sparkles } from 'lucide-react'
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

export function CourseGeneratingView({
  course,
  chapters,
  progress,
  onRefresh
}: CourseGeneratingViewProps) {
  const router = useRouter()
  const [timeElapsed, setTimeElapsed] = React.useState(0)
  const startTimeRef = React.useRef(Date.now())
  
  // Track elapsed time
  React.useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
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
  
  const unitsCompleted = (progress as any).unitsCompleted || 0
  const unitsTotal = (progress as any).unitsTotal || chapters.length || 1
  const isComplete = progress.phase === 'complete'
  
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
                  {isComplete ? 'Course Ready!' : 'Creating Your Course...'}
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
            <span>{formatTime(timeElapsed)} elapsed</span>
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
        
        {/* Tips */}
        {!isComplete && (
          <motion.div
            className="mt-8 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex gap-3">
              <span className="text-xl">💡</span>
              <div>
                <p className="font-medium text-foreground mb-1">
                  You can start learning!
                </p>
                <p className="text-sm text-muted-foreground">
                  Units become available as they're created. Start with the first unit while we prepare the rest!
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
