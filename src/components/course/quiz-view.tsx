'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui'
import { QuizQuestion } from './quiz-question'
import type { QuizQuestion as QuizQuestionType } from '@/lib/course-store'
import { cn } from '@/lib/utils'

interface QuizViewProps {
  questions: QuizQuestionType[]
  lessonTitle: string
  onComplete: (score: number) => void
  onBackToLesson: () => void
  className?: string
}

export function QuizView({
  questions,
  lessonTitle,
  onComplete,
  onBackToLesson,
  className
}: QuizViewProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = React.useState(0)
  const [answers, setAnswers] = React.useState<Record<string, string>>({})
  // Track which questions have been checked (regardless of correct/incorrect)
  const [checkedQuestions, setCheckedQuestions] = React.useState<Set<string>>(new Set())
  // Track which questions were answered correctly
  const [correctQuestions, setCorrectQuestions] = React.useState<Set<string>>(new Set())

  // Handle empty questions array
  if (!questions || questions.length === 0) {
    return (
      <div className={cn("max-w-4xl mx-auto px-6 py-8 text-center", className)}>
        <div className="p-12 rounded-2xl bg-muted/50">
          <div className="text-6xl mb-4">📝</div>
          <h2 className="text-2xl font-bold mb-2">No Quiz Available</h2>
          <p className="text-muted-foreground mb-6">
            Quiz questions are being generated. Please check back in a few moments.
          </p>
          <Button onClick={onBackToLesson} variant="outline">
            Back to Lesson
          </Button>
        </div>
      </div>
    )
  }

  const currentQuestion = questions[currentQuestionIndex]

  // Double-check current question exists
  if (!currentQuestion) {
    return (
      <div className={cn("max-w-4xl mx-auto px-6 py-8 text-center", className)}>
        <div className="p-12 rounded-2xl bg-muted/50">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-2">Question Not Found</h2>
          <p className="text-muted-foreground mb-6">
            Unable to load this question. Please try again.
          </p>
          <Button onClick={onBackToLesson} variant="outline">
            Back to Lesson
          </Button>
        </div>
      </div>
    )
  }

  const isLastQuestion = currentQuestionIndex === questions.length - 1
  const hasAnswered = answers[currentQuestion.id] !== undefined
  // hasChecked is true if this question has been checked (regardless of correct/incorrect)
  const hasChecked = checkedQuestions.has(currentQuestion.id)

  // Handle answer selection
  const handleAnswerSelect = (questionId: string, answer: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }))
  }

  // Handle answer check - called when user clicks "Check Answer"
  const handleAnswerCheck = (questionId: string, isCorrect: boolean) => {
    // Mark this question as checked
    setCheckedQuestions(prev => new Set(prev).add(questionId))
    // If correct, also add to correct set
    if (isCorrect) {
      setCorrectQuestions(prev => new Set(prev).add(questionId))
    }
  }

  // Handle next question
  const handleNextQuestion = () => {
    if (isLastQuestion) {
      // Calculate final score based on correct answers
      const correctCount = correctQuestions.size
      const score = Math.round((correctCount / questions.length) * 100)
      onComplete(score)
    } else {
      setCurrentQuestionIndex(prev => prev + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // Handle back to previous question
  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className={cn("max-w-4xl mx-auto px-6 py-8", className)}>
      {/* Progress Bar at Top */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToLesson}
            className="hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Lesson
          </Button>
          <span className="text-sm font-medium text-muted-foreground">
            Step {currentQuestionIndex + 1}/{questions.length}
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-purple-500 to-purple-600"
            initial={{ width: '0%' }}
            animate={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          />
        </div>
      </div>

      {/* Header */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 mb-4">
          <span className="text-3xl">👑</span>
        </div>
        <h2 className="text-xl font-bold text-purple-600 dark:text-purple-400 mb-2">
          Mastery Moment
        </h2>
        <p className="text-muted-foreground">
          Question {currentQuestionIndex + 1} of {questions.length}
        </p>
      </div>

      {/* Progress Dots */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {questions.map((q, index) => {
          const isCurrentQuestion = index === currentQuestionIndex
          const wasChecked = checkedQuestions.has(q.id)
          const wasCorrect = correctQuestions.has(q.id)

          return (
            <div
              key={index}
              className={cn(
                "w-3 h-3 rounded-full transition-all duration-300",
                isCurrentQuestion && "w-4 h-4",
                wasChecked
                  ? wasCorrect
                    ? "bg-green-500"
                    : "bg-red-400"
                  : isCurrentQuestion
                  ? "bg-purple-500"
                  : "bg-muted"
              )}
            />
          )
        })}
      </div>

      {/* Question */}
      <QuizQuestion
        question={currentQuestion}
        selectedAnswer={answers[currentQuestion.id]}
        hasChecked={hasChecked}
        onAnswerSelect={handleAnswerSelect}
        onAnswerCheck={handleAnswerCheck}
      />

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between gap-4">
        <Button
          variant="outline"
          onClick={handlePreviousQuestion}
          disabled={currentQuestionIndex === 0}
          className={cn(
            "px-8",
            currentQuestionIndex === 0 && "opacity-50 cursor-not-allowed"
          )}
        >
          Back
        </Button>

        <Button
          onClick={handleNextQuestion}
          disabled={!hasChecked}
          size="lg"
          className={cn(
            "px-12 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700",
            "text-white font-semibold text-base",
            "shadow-lg hover:shadow-xl",
            "transition-all duration-300 rounded-xl",
            !hasChecked && "opacity-50 cursor-not-allowed"
          )}
        >
          {isLastQuestion ? 'Complete' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
