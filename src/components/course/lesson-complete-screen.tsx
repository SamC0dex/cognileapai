'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Award, Clock, Flame, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useCourseStore } from '@/lib/course-store'

interface LessonCompleteScreenProps {
  lessonTitle: string
  quizScore: number
  totalQuestions: number
  timeSpent: number
  learningObjective: string
  onNextLesson: () => void
  onBackToCourse: () => void
  className?: string
}

// Confetti component
function Confetti() {
  const colors = ['#14B8A6', '#8B5CF6', '#10B981', '#F59E0B', '#3B82F6']
  const confettiPieces = Array.from({ length: 50 })

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {confettiPieces.map((_, index) => {
        const randomColor = colors[Math.floor(Math.random() * colors.length)]
        const randomDelay = Math.random() * 0.5
        const randomDuration = 2 + Math.random() * 2
        const randomX = Math.random() * 100
        const randomRotate = Math.random() * 360

        return (
          <motion.div
            key={index}
            className="absolute w-2 h-2 rounded-full"
            style={{
              backgroundColor: randomColor,
              left: `${randomX}%`,
              top: '-10px'
            }}
            initial={{ opacity: 1, y: -10, rotate: 0 }}
            animate={{
              opacity: [1, 1, 0],
              y: [0, window.innerHeight + 50],
              rotate: [0, randomRotate],
              x: [0, (Math.random() - 0.5) * 200]
            }}
            transition={{
              duration: randomDuration,
              delay: randomDelay,
              ease: 'easeOut'
            }}
          />
        )
      })}
    </div>
  )
}

export function LessonCompleteScreen({
  lessonTitle,
  quizScore,
  totalQuestions,
  timeSpent,
  learningObjective,
  onNextLesson,
  onBackToCourse,
  className
}: LessonCompleteScreenProps) {
  const { userStreak } = useCourseStore()
  const [showConfetti, setShowConfetti] = React.useState(true)

  // Hide confetti after 3 seconds
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setShowConfetti(false)
    }, 3000)

    return () => clearTimeout(timer)
  }, [])

  // Format time spent
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return minutes > 0 ? `${minutes} min ${remainingSeconds}s` : `${seconds}s`
  }

  // quizScore is already a percentage (0-100), not raw count
  const percentageScore = Math.min(100, Math.max(0, quizScore))
  // Calculate number correct from percentage
  const numberCorrect = Math.round((percentageScore / 100) * totalQuestions)

  // Determine performance message
  const getPerformanceMessage = () => {
    if (percentageScore === 100) return "Perfect score! You're a star! 🌟"
    if (percentageScore >= 80) return "Excellent work! You've got this! 🎉"
    if (percentageScore >= 60) return "Good job! Keep it up! 👏"
    return "Nice effort! Review and try again! 💪"
  }

  return (
    <div className={cn("max-w-3xl mx-auto px-6 py-12", className)}>
      {/* Confetti Animation */}
      {showConfetti && <Confetti />}

      {/* Success Animation */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="text-center mb-12"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 10 }}
          className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-green-600 mb-6"
        >
          <CheckCircle2 className="h-14 w-14 text-white" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-4xl font-bold mb-3"
        >
          🎉 Lesson Complete!
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-xl text-muted-foreground"
        >
          {lessonTitle}
        </motion.p>
      </motion.div>

      {/* Results Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="p-8 rounded-2xl border border-border bg-card shadow-soft mb-8"
      >
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
          <Award className="h-7 w-7 text-purple-500" />
          Your Results
        </h2>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Score */}
          <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800">
            <div className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">
              Score
            </div>
            <div className="text-3xl font-bold text-green-600 dark:text-green-500">
              {percentageScore}%
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {numberCorrect}/{totalQuestions} correct
            </div>
          </div>

          {/* Time Spent */}
          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800">
            <div className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">
              Time
            </div>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-500 flex items-center gap-2">
              <Clock className="h-7 w-7" />
              {formatTime(timeSpent)}
            </div>
          </div>

          {/* Streak */}
          <div className="p-4 rounded-xl bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800">
            <div className="text-sm font-medium text-orange-700 dark:text-orange-400 mb-1">
              Streak
            </div>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-500 flex items-center gap-2">
              <Flame className="h-7 w-7" />
              {userStreak?.currentStreak || 1} days
            </div>
          </div>
        </div>

        {/* Performance Message */}
        <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 text-center">
          <p className="text-lg font-medium text-purple-700 dark:text-purple-400">
            {getPerformanceMessage()}
          </p>
        </div>
      </motion.div>

      {/* Mastery Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0 }}
        className="p-6 rounded-2xl border border-border bg-card shadow-soft mb-8"
      >
        <h3 className="text-lg font-semibold mb-4">✓ What You Mastered</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
            <p className="text-base leading-relaxed text-foreground/90">
              {learningObjective}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Navigation Buttons */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="flex flex-col sm:flex-row items-center gap-4"
      >
        <Button
          onClick={onNextLesson}
          size="lg"
          className={cn(
            "w-full sm:flex-1",
            "bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700",
            "text-white font-medium",
            "shadow-lg hover:shadow-xl",
            "transition-all duration-300"
          )}
        >
          Continue to Next Lesson
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>

        <Button
          onClick={onBackToCourse}
          variant="outline"
          size="lg"
          className="w-full sm:w-auto"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Course Overview
        </Button>
      </motion.div>
    </div>
  )
}
