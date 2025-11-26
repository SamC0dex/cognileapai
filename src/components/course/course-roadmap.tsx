'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Star,
  ArrowRight,
  CheckCircle2,
  Circle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Chapter, LessonCompletion } from '@/lib/course-store'

interface CourseRoadmapProps {
  chapters: Chapter[]
  completedLessons: LessonCompletion[]
  currentLessonId?: string
  onLessonClick: (lessonId: string) => void
  courseName: string
}

export function CourseRoadmap({
  chapters,
  completedLessons,
  onLessonClick,
}: CourseRoadmapProps) {
  // Auto-select first incomplete unit
  const getFirstIncompleteIndex = () => {
    const idx = chapters.findIndex(ch => {
      if (!ch.lessons.length) return true
      return !ch.lessons.every(l => completedLessons.some(c => c.lessonId === l.id))
    })
    return idx === -1 ? 0 : idx
  }

  const [expandedIndex, setExpandedIndex] = React.useState<number>(getFirstIncompleteIndex())

  const isLessonCompleted = (lessonId: string) => {
    return completedLessons.some(c => c.lessonId === lessonId)
  }

  const isUnitCompleted = (chapter: Chapter) => {
    if (!chapter.lessons.length) return false
    return chapter.lessons.every(l => isLessonCompleted(l.id))
  }

  const getUnitProgress = (chapter: Chapter) => {
    if (!chapter.lessons.length) return 0
    const done = chapter.lessons.filter(l => isLessonCompleted(l.id)).length
    return Math.round((done / chapter.lessons.length) * 100)
  }

  return (
    <div className="flex flex-col items-center py-8 max-w-xl mx-auto">
      {chapters.map((chapter, index) => {
        const isCompleted = isUnitCompleted(chapter)
        const isExpanded = expandedIndex === index
        const progress = getUnitProgress(chapter)
        const firstLesson = chapter.lessons[0]

        return (
          <div key={chapter.id} className="w-full flex flex-col items-center">
            {/* Unit Row - Star + Title */}
            <motion.button
              onClick={() => setExpandedIndex(isExpanded ? -1 : index)}
              className="flex items-center gap-3 py-3 group"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              {/* Star Icon */}
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                isCompleted 
                  ? "bg-gradient-to-br from-amber-400 to-yellow-500 shadow-md" 
                  : "bg-gray-200 dark:bg-gray-700"
              )}>
                <Star className={cn(
                  "w-5 h-5",
                  isCompleted ? "text-white fill-white" : "text-gray-400 dark:text-gray-500"
                )} />
              </div>

              {/* Title */}
              <span className={cn(
                "text-base font-medium transition-colors",
                isCompleted 
                  ? "text-amber-600 dark:text-amber-400" 
                  : isExpanded 
                    ? "text-brand-purple-600 dark:text-brand-purple-400"
                    : "text-muted-foreground group-hover:text-foreground"
              )}>
                Unit {index + 1} - {chapter.title}
              </span>
            </motion.button>

            {/* Expanded Card */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-full overflow-hidden"
                >
                  <div className="py-4 px-2">
                    <div className="bg-card rounded-2xl border shadow-lg overflow-hidden max-w-md mx-auto">
                      {/* Mastery Score Header */}
                      <div className="p-5 border-b">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm text-muted-foreground font-medium">Task Mastery</span>
                          <div className="flex items-center gap-1">
                            <span className={cn(
                              "text-3xl font-bold",
                              progress === 100 ? "text-green-500" : "text-brand-purple-600 dark:text-brand-purple-400"
                            )}>
                              {progress}
                            </span>
                            {progress === 100 && <span className="text-xl">🎉</span>}
                          </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            className={cn(
                              "h-full rounded-full",
                              progress === 100 
                                ? "bg-gradient-to-r from-green-400 to-emerald-500"
                                : "bg-gradient-to-r from-brand-purple-500 to-brand-purple-600"
                            )}
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                      </div>

                      {/* Purple Lesson Card */}
                      <div className="relative bg-gradient-to-r from-brand-purple-500 via-brand-purple-600 to-brand-purple-500 p-5">
                        {/* Decorative blobs */}
                        <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4" />
                        <div className="absolute bottom-0 right-10 w-12 h-12 bg-white/10 rounded-full translate-y-1/2" />
                        
                        <h4 className="text-white font-semibold text-lg relative z-10 mb-3">
                          {firstLesson?.title || chapter.title}
                        </h4>
                        
                        <button
                          onClick={() => firstLesson && onLessonClick(firstLesson.id)}
                          className="w-full bg-white rounded-xl py-3 px-4 flex items-center justify-center gap-2 font-medium text-brand-purple-600 hover:bg-gray-50 transition-colors relative z-10"
                        >
                          {isCompleted ? 'Review' : progress > 0 ? 'Continue' : 'Start'}
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Lessons List */}
                      {chapter.lessons.length > 1 && (
                        <div className="p-4 space-y-2">
                          {chapter.lessons.map((lesson, i) => {
                            const done = isLessonCompleted(lesson.id)
                            return (
                              <button
                                key={lesson.id}
                                onClick={() => onLessonClick(lesson.id)}
                                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors text-left"
                              >
                                {done ? (
                                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                                ) : (
                                  <Circle className="w-5 h-5 text-muted-foreground/40 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-muted-foreground">{i + 1}</div>
                                  <div className="text-sm font-medium truncate">{lesson.title}</div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Connector line to next unit */}
            {index < chapters.length - 1 && (
              <div className={cn(
                "w-0.5 h-4",
                isCompleted ? "bg-amber-300" : "bg-gray-200 dark:bg-gray-700"
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}
