'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, XCircle, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { QuizQuestion as QuizQuestionType } from '@/lib/course-store'

interface QuizQuestionProps {
  question: QuizQuestionType
  selectedAnswer?: string
  hasChecked: boolean
  onAnswerSelect: (questionId: string, answer: string) => void
  onAnswerCheck: (questionId: string, isCorrect: boolean) => void
  className?: string
}

export function QuizQuestion({
  question,
  selectedAnswer,
  hasChecked,
  onAnswerSelect,
  onAnswerCheck,
  className
}: QuizQuestionProps) {
  const [showFeedback, setShowFeedback] = React.useState(false)

  // Get the actual correct option text (handles both full text and letter formats)
  const correctOptionText = React.useMemo(() => {
    if (!question.correctAnswer) return null
    
    // Check if correctAnswer is stored as letter (A, B, C, D) format
    const letterMatch = question.correctAnswer.match(/^[A-D]$/i)
    if (letterMatch) {
      const letterIndex = letterMatch[0].toUpperCase().charCodeAt(0) - 65 // A=0, B=1, etc.
      return question.options[letterIndex] || null
    }
    
    // Otherwise it's the full text
    return question.correctAnswer
  }, [question.correctAnswer, question.options])

  // Robust answer comparison that handles different formats
  const isCorrect = React.useMemo(() => {
    if (!selectedAnswer || !correctOptionText) return false

    // Normalize both strings for comparison (trim whitespace, case-insensitive)
    const normalizedSelected = selectedAnswer.trim().toLowerCase()
    const normalizedCorrect = correctOptionText.trim().toLowerCase()

    return normalizedSelected === normalizedCorrect
  }, [selectedAnswer, correctOptionText])
  
  // Check if a given option is the correct answer
  const isOptionCorrect = React.useCallback((option: string) => {
    if (!correctOptionText) return false
    return option.trim().toLowerCase() === correctOptionText.trim().toLowerCase()
  }, [correctOptionText])

  // Handle check answer
  const handleCheckAnswer = () => {
    if (!selectedAnswer) return

    setShowFeedback(true)
    onAnswerCheck(question.id, isCorrect)
  }

  // Reset feedback when question changes
  React.useEffect(() => {
    setShowFeedback(false)
  }, [question.id])

  return (
    <div className={cn("space-y-6", className)}>
      {/* Question Card */}
      <div className="p-6 rounded-2xl border border-border bg-card shadow-soft">
        {/* Question Text */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold leading-relaxed text-foreground">
            {question.question}
          </h2>
        </div>

        {/* Answer Options */}
        <div className="space-y-3">
          {question.options.map((option, index) => {
            const isSelected = selectedAnswer === option
            // Show green for the correct option after checking (using robust comparison)
            const showCorrectAnswer = hasChecked && isOptionCorrect(option)
            // Show red for user's selection if it was wrong
            const showIncorrectAnswer = hasChecked && isSelected && !isCorrect

            return (
              <motion.button
                key={index}
                onClick={() => !hasChecked && onAnswerSelect(question.id, option)}
                disabled={hasChecked}
                className={cn(
                  "w-full p-4 rounded-xl text-left transition-all duration-200",
                  "border-2 font-medium",
                  "disabled:cursor-not-allowed",
                  // Default state
                  !isSelected && !hasChecked && "border-border bg-background hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30",
                  // Selected but not checked
                  isSelected && !hasChecked && "border-purple-500 bg-purple-50 dark:bg-purple-950/50",
                  // Correct answer (after check)
                  showCorrectAnswer && "border-green-500 bg-green-50 dark:bg-green-950/50",
                  // Incorrect answer (after check)
                  showIncorrectAnswer && "border-red-400 bg-red-50 dark:bg-red-950/50",
                  // Not selected after check
                  hasChecked && !showCorrectAnswer && !showIncorrectAnswer && "border-border bg-muted opacity-50"
                )}
                whileHover={!hasChecked ? { scale: 1.01 } : {}}
                whileTap={!hasChecked ? { scale: 0.99 } : {}}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Option Indicator */}
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-semibold transition-colors",
                        !isSelected && !hasChecked && "border-muted-foreground text-muted-foreground",
                        isSelected && !hasChecked && "border-purple-500 bg-purple-500 text-white",
                        showCorrectAnswer && "border-green-500 bg-green-500 text-white",
                        showIncorrectAnswer && "border-red-400 bg-red-400 text-white"
                      )}
                    >
                      {String.fromCharCode(65 + index)}
                    </div>

                    {/* Option Text */}
                    <span className="text-base leading-relaxed">{option}</span>
                  </div>

                  {/* Check/X Icon */}
                  {showCorrectAnswer && (
                    <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
                  )}
                  {showIncorrectAnswer && (
                    <XCircle className="h-6 w-6 text-red-400 flex-shrink-0" />
                  )}
                </div>
              </motion.button>
            )
          })}
        </div>

        {/* Check Answer Button */}
        {!hasChecked && (
          <div className="mt-6">
            <Button
              onClick={handleCheckAnswer}
              disabled={!selectedAnswer}
              size="lg"
              className={cn(
                "w-full",
                "bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700",
                "text-white font-medium",
                "shadow-lg hover:shadow-xl",
                "transition-all duration-300",
                !selectedAnswer && "opacity-50 cursor-not-allowed"
              )}
            >
              Check Answer
            </Button>
          </div>
        )}
      </div>

      {/* Feedback Banner */}
      {showFeedback && hasChecked && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={cn(
            "p-6 rounded-2xl border-2",
            isCorrect
              ? "border-green-500 bg-green-50 dark:bg-green-950/50"
              : "border-amber-500 bg-amber-50 dark:bg-amber-950/50"
          )}
        >
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "flex-shrink-0 p-2 rounded-full",
                isCorrect ? "bg-green-500/10" : "bg-amber-500/10"
              )}
            >
              {isCorrect ? (
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              ) : (
                <Lightbulb className="h-6 w-6 text-amber-500" />
              )}
            </div>

            <div className="flex-1">
              <h3
                className={cn(
                  "text-lg font-semibold mb-2",
                  isCorrect ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"
                )}
              >
                {isCorrect ? '🎉 Great job!' : '💡 Not quite!'}
              </h3>
              <p className="text-base leading-relaxed text-foreground/90">
                {question.explanation}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
