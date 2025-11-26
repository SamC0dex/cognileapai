'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useCourseStore } from '@/lib/course-store'
import { StepBasedLessonView } from '@/components/course/step-based-lesson-view'
import { LessonCompleteScreen } from '@/components/course/lesson-complete-screen'
import { LoadingSpinner } from '@/components/ui'

type ViewState = 'loading' | 'learning' | 'complete'

export default function LessonPage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.courseId as string
  const lessonId = params.lessonId as string

  const {
    activeLesson,
    activeLessonQuiz,
    activeChapters,
    fetchLessonContent,
    fetchCourseDetails,
    markLessonComplete
  } = useCourseStore()

  const [viewState, setViewState] = React.useState<ViewState>('loading')
  const [quizScore, setQuizScore] = React.useState<number>(0)
  const [timeSpent, setTimeSpent] = React.useState<number>(0)

  // Load lesson content and course details
  React.useEffect(() => {
    const loadLesson = async () => {
      try {
        setViewState('loading')
        await Promise.all([
          fetchLessonContent(lessonId),
          fetchCourseDetails(courseId)
        ])
        setViewState('learning')
      } catch (error) {
        console.error('Failed to load lesson:', error)
      }
    }

    loadLesson()
  }, [lessonId, courseId, fetchLessonContent, fetchCourseDetails])

  // Handle lesson completion (from step-based view)
  const handleLessonComplete = async (score: number, elapsed: number) => {
    try {
      await markLessonComplete(lessonId, score, elapsed)
      setQuizScore(score)
      setTimeSpent(elapsed)
      setViewState('complete')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      console.error('Failed to mark lesson complete:', error)
    }
  }

  // Handle navigation
  const handleBackToCourse = () => {
    router.push(`/courses/${courseId}`)
  }

  const handleNextLesson = () => {
    if (!activeLesson || !activeChapters || activeChapters.length === 0) {
      router.push(`/courses/${courseId}`)
      return
    }

    // Find all lessons across all chapters, sorted by chapter and lesson order
    const allLessons: Array<{ id: string; chapterId: string; chapterOrder: number; lessonOrder: number }> = []

    activeChapters.forEach(chapter => {
      chapter.lessons.forEach(lesson => {
        allLessons.push({
          id: lesson.id,
          chapterId: lesson.chapterId,
          chapterOrder: chapter.orderIndex,
          lessonOrder: lesson.orderIndex
        })
      })
    })

    // Sort lessons by chapter order, then by lesson order
    allLessons.sort((a, b) => {
      if (a.chapterOrder !== b.chapterOrder) {
        return a.chapterOrder - b.chapterOrder
      }
      return a.lessonOrder - b.lessonOrder
    })

    // Find current lesson index
    const currentIndex = allLessons.findIndex(l => l.id === lessonId)

    // Navigate to next lesson if it exists
    if (currentIndex !== -1 && currentIndex < allLessons.length - 1) {
      const nextLesson = allLessons[currentIndex + 1]
      router.push(`/courses/${courseId}/lessons/${nextLesson.id}`)
    } else {
      // No more lessons, go back to course overview
      router.push(`/courses/${courseId}`)
    }
  }

  if (viewState === 'loading' || !activeLesson) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <LoadingSpinner className="h-12 w-12 mx-auto" />
          <p className="text-muted-foreground">Loading lesson...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence mode="wait">
        {viewState === 'learning' && (
          <motion.div
            key="learning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <StepBasedLessonView
              lesson={activeLesson}
              quizQuestions={activeLessonQuiz}
              onComplete={handleLessonComplete}
              onBackToCourse={handleBackToCourse}
            />
          </motion.div>
        )}

        {viewState === 'complete' && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.4 }}
          >
            <LessonCompleteScreen
              lessonTitle={activeLesson.title}
              quizScore={quizScore}
              totalQuestions={activeLessonQuiz.length}
              timeSpent={timeSpent}
              learningObjective={activeLesson.learningObjective}
              onNextLesson={handleNextLesson}
              onBackToCourse={handleBackToCourse}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
