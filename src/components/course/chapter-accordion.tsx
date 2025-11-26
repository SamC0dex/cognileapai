'use client'

import * as React from 'react'
import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { ChevronDown, CheckCircle2, Circle, PlayCircle, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Chapter, Lesson, LessonCompletion } from '@/lib/course-store'

interface ChapterAccordionProps {
  chapters: Chapter[]
  completedLessons: LessonCompletion[]
  currentLessonId?: string
  onLessonClick: (lessonId: string) => void
  className?: string
}

export function ChapterAccordion({
  chapters,
  completedLessons,
  currentLessonId,
  onLessonClick,
  className
}: ChapterAccordionProps) {
  const [openChapters, setOpenChapters] = React.useState<string[]>([])

  // Auto-open first chapter on mount
  React.useEffect(() => {
    if (chapters.length > 0 && openChapters.length === 0) {
      setOpenChapters([`chapter-${chapters[0].id}`])
    }
  }, [chapters, openChapters.length])

  const isLessonCompleted = (lessonId: string) => {
    return completedLessons?.some(c => c.lessonId === lessonId) || false
  }

  const getLessonIcon = (lessonId: string) => {
    if (isLessonCompleted(lessonId)) {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />
    }
    if (lessonId === currentLessonId) {
      return <PlayCircle className="h-5 w-5 text-blue-500" />
    }
    return <Circle className="h-5 w-5 text-gray-400" />
  }

  return (
    <AccordionPrimitive.Root
      type="multiple"
      value={openChapters}
      onValueChange={setOpenChapters}
      className={cn("space-y-4", className)}
    >
      {chapters.map((chapter, chapterIndex) => {
        const completedCount = chapter.lessons.filter(l =>
          isLessonCompleted(l.id)
        ).length
        const totalLessons = chapter.lessons.length
        const progressPercentage = (completedCount / totalLessons) * 100

        return (
          <AccordionPrimitive.Item
            key={chapter.id}
            value={`chapter-${chapter.id}`}
            className={cn(
              "rounded-2xl border bg-card overflow-hidden",
              "shadow-soft hover:shadow-md transition-shadow duration-300"
            )}
          >
            <AccordionPrimitive.Header>
              <AccordionPrimitive.Trigger
                className={cn(
                  "flex w-full items-center justify-between p-6",
                  "hover:bg-accent/50 transition-colors duration-200",
                  "group"
                )}
              >
                <div className="flex items-start gap-4 flex-1 text-left">
                  {/* Chapter number badge */}
                  <div className={cn(
                    "flex-shrink-0 w-12 h-12 rounded-xl",
                    "bg-gradient-to-br from-teal-500/20 to-purple-500/20",
                    "dark:from-teal-500/30 dark:to-purple-500/30",
                    "border border-teal-500/30 dark:border-teal-500/40",
                    "flex items-center justify-center",
                    "font-bold text-lg text-teal-600 dark:text-teal-400"
                  )}>
                    {chapterIndex + 1}
                  </div>

                  {/* Chapter info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg mb-1 truncate">
                      {chapter.title}
                    </h3>
                    {chapter.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {chapter.description}
                      </p>
                    )}

                    {/* Progress bar */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-teal-500 to-purple-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${progressPercentage}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                        {completedCount}/{totalLessons}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Chevron */}
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-muted-foreground ml-4 flex-shrink-0",
                    "transition-transform duration-200",
                    "group-data-[state=open]:rotate-180"
                  )}
                />
              </AccordionPrimitive.Trigger>
            </AccordionPrimitive.Header>

            <AccordionPrimitive.Content
              className={cn(
                "overflow-hidden",
                "data-[state=closed]:animate-accordion-up",
                "data-[state=open]:animate-accordion-down"
              )}
            >
              <div className="px-6 pb-6">
                <div className="space-y-2">
                  {chapter.lessons.map((lesson, lessonIndex) => {
                    const isCompleted = isLessonCompleted(lesson.id)
                    const isCurrent = lesson.id === currentLessonId

                    return (
                      <motion.button
                        key={lesson.id}
                        onClick={() => onLessonClick(lesson.id)}
                        className={cn(
                          "w-full flex items-center gap-4 p-4 rounded-xl",
                          "transition-all duration-200",
                          "hover:bg-accent/50",
                          isCurrent && "bg-blue-50/50 dark:bg-blue-950/20 ring-2 ring-blue-500/30",
                          isCompleted && !isCurrent && "opacity-75"
                        )}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: lessonIndex * 0.05 }}
                        whileHover={{ x: 4 }}
                      >
                        {/* Status icon */}
                        <div className="flex-shrink-0">
                          {getLessonIcon(lesson.id)}
                        </div>

                        {/* Lesson info */}
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-muted-foreground">
                              {lesson.lessonNumber}
                            </span>
                            {isCompleted && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 font-medium">
                                Completed
                              </span>
                            )}
                            {isCurrent && !isCompleted && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                                In Progress
                              </span>
                            )}
                          </div>
                          <h4 className="font-medium text-base truncate">
                            {lesson.title}
                          </h4>
                          {lesson.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                              {lesson.description}
                            </p>
                          )}
                        </div>

                        {/* Duration */}
                        {lesson.estimatedMinutes && (
                          <div className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>{lesson.estimatedMinutes} min</span>
                          </div>
                        )}
                      </motion.button>
                    )
                  })}
                </div>
              </div>
            </AccordionPrimitive.Content>
          </AccordionPrimitive.Item>
        )
      })}
    </AccordionPrimitive.Root>
  )
}
