'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui'
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  X,
  RotateCcw,
  Lightbulb,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Trophy,
  Target,
  Clock,
  BrainCircuit,
  ArrowRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { QuizQuestionEntry } from '@/types/quiz'

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const

interface QuizViewerProps {
  questions: QuizQuestionEntry[]
  title: string
  onClose?: () => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  className?: string
}

interface QuestionAnswer {
  selectedOption: number
  isCorrect: boolean
  isChecked: boolean
}

export const QuizViewer: React.FC<QuizViewerProps> = ({
  questions,
  title,
  onClose,
  isFullscreen = false,
  onToggleFullscreen,
  className
}) => {
  const [currentIndex, setCurrentIndex] = React.useState(0)
  const [answers, setAnswers] = React.useState<Record<number, QuestionAnswer>>({})
  const [selectedOption, setSelectedOption] = React.useState<number | null>(null)
  const [showHint, setShowHint] = React.useState(false)
  const [showResults, setShowResults] = React.useState(false)
  const [startTime] = React.useState(Date.now())
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const currentQuestion = questions[currentIndex]
  const currentAnswer = answers[currentIndex]
  const isAnswered = currentAnswer?.isChecked === true
  const totalAnswered = Object.values(answers).filter(a => a.isChecked).length
  const totalCorrect = Object.values(answers).filter(a => a.isChecked && a.isCorrect).length
  const progress = ((currentIndex + 1) / questions.length) * 100

  // Scroll to top when question changes
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [currentIndex])

  const handleOptionSelect = (optionIndex: number) => {
    if (isAnswered) return
    setSelectedOption(optionIndex)
  }

  const handleCheckAnswer = () => {
    if (selectedOption === null) return

    const isCorrect = selectedOption === currentQuestion.correctAnswer
    setAnswers(prev => ({
      ...prev,
      [currentIndex]: {
        selectedOption,
        isCorrect,
        isChecked: true
      }
    }))
  }

  const goToNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1)
      setSelectedOption(answers[currentIndex + 1]?.selectedOption ?? null)
      setShowHint(false)
    } else if (totalAnswered === questions.length) {
      setShowResults(true)
    }
  }

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
      setSelectedOption(answers[currentIndex - 1]?.selectedOption ?? null)
      setShowHint(false)
    }
  }

  const handleRestart = () => {
    setCurrentIndex(0)
    setAnswers({})
    setSelectedOption(null)
    setShowHint(false)
    setShowResults(false)
  }

  const getElapsedTime = () => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    const mins = Math.floor(elapsed / 60)
    const secs = elapsed % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showResults) {
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault()
          handleRestart()
        }
        return
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          goToPrevious()
          break
        case 'ArrowRight':
          e.preventDefault()
          if (isAnswered) goToNext()
          break
        case 'Enter':
          e.preventDefault()
          if (!isAnswered && selectedOption !== null) handleCheckAnswer()
          else if (isAnswered) goToNext()
          break
        case '1': case 'a': case 'A':
          e.preventDefault()
          handleOptionSelect(0)
          break
        case '2': case 'b': case 'B':
          e.preventDefault()
          handleOptionSelect(1)
          break
        case '3': case 'c': case 'C':
          e.preventDefault()
          handleOptionSelect(2)
          break
        case '4': case 'd': case 'D':
          e.preventDefault()
          handleOptionSelect(3)
          break
        case 'h': case 'H':
          e.preventDefault()
          if (!isAnswered) setShowHint(prev => !prev)
          break
        case 'Escape':
          if (isFullscreen && onToggleFullscreen) {
            onToggleFullscreen()
          } else if (onClose) {
            onClose()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, selectedOption, isAnswered, showResults, isFullscreen])

  if (!currentQuestion && !showResults) return null

  // Results screen
  if (showResults) {
    const score = questions.length > 0 ? Math.round((totalCorrect / questions.length) * 100) : 0
    const getScoreMessage = () => {
      if (score >= 90) return { text: 'Outstanding!', emoji: '🏆', color: 'text-yellow-500' }
      if (score >= 70) return { text: 'Great job!', emoji: '🌟', color: 'text-green-500' }
      if (score >= 50) return { text: 'Good effort!', emoji: '💪', color: 'text-blue-500' }
      return { text: 'Keep practicing!', emoji: '📚', color: 'text-orange-500' }
    }
    const scoreMsg = getScoreMessage()

    return (
      <div className={cn("flex flex-col bg-background", isFullscreen ? "h-full" : "h-full", className)}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800">
              <Trophy className={cn("w-4 h-4", scoreMsg.color)} />
            </div>
            <div>
              <h1 className="font-semibold text-base text-foreground">Quiz Results</h1>
              <p className="text-xs text-muted-foreground">{title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose} className="w-8 h-8 rounded-lg">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Results content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className={cn("p-6 space-y-6", isFullscreen ? "max-w-2xl mx-auto" : "")}>
            {/* Score circle */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="relative">
                <svg className={cn(isFullscreen ? "w-40 h-40" : "w-32 h-32")} viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
                  <motion.circle
                    cx="60" cy="60" r="54" fill="none"
                    strokeWidth="8" strokeLinecap="round"
                    className={score >= 70 ? "text-green-500" : score >= 50 ? "text-blue-500" : "text-orange-500"}
                    stroke="currentColor"
                    strokeDasharray={`${2 * Math.PI * 54}`}
                    initial={{ strokeDashoffset: 2 * Math.PI * 54 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 54 * (1 - score / 100) }}
                    transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                    transform="rotate(-90 60 60)"
                  />
                </svg>
                <motion.div
                  className="absolute inset-0 flex flex-col items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  <span className={cn("font-bold", isFullscreen ? "text-4xl" : "text-3xl")}>{score}%</span>
                  <span className="text-xs text-muted-foreground">{totalCorrect}/{questions.length}</span>
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
                className="text-center"
              >
                <p className={cn("text-2xl font-bold", scoreMsg.color)}>
                  {scoreMsg.emoji} {scoreMsg.text}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Time: {getElapsedTime()}
                </p>
              </motion.div>
            </motion.div>

            {/* Stats row */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
              className="grid grid-cols-3 gap-3"
            >
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-center">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-green-700 dark:text-green-300">{totalCorrect}</p>
                <p className="text-xs text-green-600 dark:text-green-400">Correct</p>
              </div>
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-red-700 dark:text-red-300">{questions.length - totalCorrect}</p>
                <p className="text-xs text-red-600 dark:text-red-400">Incorrect</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-center">
                <Target className="w-5 h-5 text-blue-600 dark:text-blue-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{questions.length}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">Total</p>
              </div>
            </motion.div>

            {/* Question review */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              className="space-y-3"
            >
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Question Review
              </h3>
              {questions.map((q, idx) => {
                const ans = answers[idx]
                return (
                  <motion.button
                    key={q.id}
                    type="button"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.4 + idx * 0.05 }}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all duration-200",
                      "hover:shadow-sm cursor-pointer",
                      ans?.isCorrect
                        ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10"
                        : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"
                    )}
                    onClick={() => {
                      setShowResults(false)
                      setCurrentIndex(idx)
                      setSelectedOption(ans?.selectedOption ?? null)
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                        ans?.isCorrect
                          ? "bg-green-100 dark:bg-green-900/30"
                          : "bg-red-100 dark:bg-red-900/30"
                      )}>
                        {ans?.isCorrect ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground line-clamp-2">{q.question}</p>
                        {ans && !ans.isCorrect && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Your answer: {OPTION_LABELS[ans.selectedOption]} &middot; Correct: {OPTION_LABELS[q.correctAnswer]}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                    </div>
                  </motion.button>
                )
              })}
            </motion.div>

            {/* Restart button */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.6 }}
              className="flex justify-center pt-2 pb-4"
            >
              <Button
                onClick={handleRestart}
                className="bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 text-white gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Retake Quiz
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    )
  }

  // Main quiz UI
  return (
    <div className={cn("flex flex-col bg-background", isFullscreen ? "h-full" : "h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800">
            <BrainCircuit className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <h1 className="font-semibold text-base text-foreground truncate max-w-xs">
              {title}
            </h1>
            <p className="text-xs text-muted-foreground">
              {questions.length} questions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onToggleFullscreen && (
            <Button variant="ghost" size="icon" onClick={onToggleFullscreen} className="w-8 h-8 rounded-lg">
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="w-8 h-8 rounded-lg">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Question Area */}
      <div ref={scrollRef} className={cn("flex-1 overflow-y-auto", isFullscreen ? "px-8 py-6" : "px-4 py-4")}>
        <div className={cn(isFullscreen ? "max-w-2xl mx-auto" : "")}>
          {/* Question counter */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground font-medium">
              {currentIndex + 1} / {questions.length}
            </span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span>{totalCorrect}/{totalAnswered} correct</span>
            </div>
          </div>

          {/* Question text */}
          <motion.div
            key={`question-${currentIndex}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className={cn(
              "font-semibold text-foreground leading-relaxed mb-6",
              isFullscreen ? "text-xl" : "text-lg"
            )}>
              {currentQuestion.question}
            </h2>
          </motion.div>

          {/* Options */}
          <div className="space-y-3 mb-6">
            {currentQuestion.options.map((option, optIdx) => {
              const isSelected = selectedOption === optIdx
              const isCorrectOption = optIdx === currentQuestion.correctAnswer
              const wasSelectedWrong = isAnswered && currentAnswer.selectedOption === optIdx && !currentAnswer.isCorrect

              let optionState: 'default' | 'selected' | 'correct' | 'wrong' | 'correctReveal' = 'default'
              if (isAnswered) {
                if (isCorrectOption) optionState = 'correct'
                else if (wasSelectedWrong) optionState = 'wrong'
                else optionState = 'default'
              } else if (isSelected) {
                optionState = 'selected'
              }

              const optionStyles = {
                default: "border-border hover:border-muted-foreground/30 hover:bg-accent/30",
                selected: "border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-900/10 shadow-sm",
                correct: "border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/20",
                wrong: "border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/20",
                correctReveal: "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10"
              }

              return (
                <motion.div
                  key={`opt-${currentIndex}-${optIdx}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: optIdx * 0.05, duration: 0.2 }}
                >
                  <motion.button
                    type="button"
                    disabled={isAnswered}
                    onClick={() => handleOptionSelect(optIdx)}
                    className={cn(
                      "w-full text-left p-4 rounded-xl border-2 transition-all duration-200",
                      !isAnswered && "cursor-pointer",
                      isAnswered && "cursor-default",
                      optionStyles[optionState]
                    )}
                    whileHover={!isAnswered ? { scale: 1.01 } : undefined}
                    whileTap={!isAnswered ? { scale: 0.99 } : undefined}
                  >
                    <div className="flex items-start gap-3">
                      {/* Option label */}
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-semibold text-sm border transition-all",
                        optionState === 'default' && "bg-muted/50 border-border text-muted-foreground",
                        optionState === 'selected' && "bg-rose-100 dark:bg-rose-900/30 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300",
                        optionState === 'correct' && "bg-green-100 dark:bg-green-900/30 border-green-400 dark:border-green-600 text-green-700 dark:text-green-300",
                        optionState === 'wrong' && "bg-red-100 dark:bg-red-900/30 border-red-400 dark:border-red-600 text-red-700 dark:text-red-300",
                        optionState === 'correctReveal' && "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-600 dark:text-green-400"
                      )}>
                        {isAnswered && isCorrectOption ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : isAnswered && wasSelectedWrong ? (
                          <XCircle className="w-4 h-4" />
                        ) : (
                          OPTION_LABELS[optIdx]
                        )}
                      </div>

                      {/* Option text and explanation */}
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm font-medium leading-relaxed",
                          optionState === 'correct' && "text-green-800 dark:text-green-200",
                          optionState === 'wrong' && "text-red-800 dark:text-red-200",
                          (optionState === 'default' || optionState === 'selected') && "text-foreground"
                        )}>
                          {option}
                        </p>

                        {/* Feedback after answer check */}
                        <AnimatePresence>
                          {isAnswered && (optionState === 'correct' || optionState === 'wrong') && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3 }}
                              className="overflow-hidden"
                            >
                              {optionState === 'correct' && (
                                <div className="mt-2 flex items-start gap-2">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                                  <div>
                                    <p className="text-xs font-semibold text-green-700 dark:text-green-300">
                                      {currentAnswer.isCorrect ? "That's right!" : "Right answer"}
                                    </p>
                                    <p className="text-xs text-green-600/80 dark:text-green-400/80 mt-0.5 leading-relaxed">
                                      {currentQuestion.explanation}
                                    </p>
                                  </div>
                                </div>
                              )}
                              {optionState === 'wrong' && (
                                <div className="mt-2 flex items-start gap-2">
                                  <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                                  <div>
                                    <p className="text-xs font-semibold text-red-700 dark:text-red-300">Not quite</p>
                                    <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5 leading-relaxed">
                                      {currentQuestion.wrongExplanations?.[optIdx] || 'This is not the correct answer.'}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          )}

                          {/* Show explanations for non-selected wrong options when answered */}
                          {isAnswered && optionState === 'default' && currentQuestion.wrongExplanations?.[optIdx] && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              transition={{ duration: 0.3, delay: 0.2 }}
                              className="overflow-hidden"
                            >
                              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                                {currentQuestion.wrongExplanations[optIdx]}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.button>
                </motion.div>
              )
            })}
          </div>

          {/* Hint section */}
          {!isAnswered && currentQuestion.hint && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mb-6"
            >
              <button
                type="button"
                onClick={() => setShowHint(prev => !prev)}
                className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
              >
                <Lightbulb className="w-4 h-4" />
                <span>Hint</span>
                <motion.div
                  animate={{ rotate: showHint ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </motion.div>
              </button>
              <AnimatePresence>
                {showHint && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">
                        {currentQuestion.hint}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Explain button (after answering) */}
          {isAnswered && currentQuestion.explanation && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mb-6 p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800"
            >
              <div className="flex items-start gap-2">
                <BrainCircuit className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Explanation</p>
                  <p className="text-sm text-blue-600/80 dark:text-blue-400/80 leading-relaxed">
                    {currentQuestion.explanation}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className={cn(
        "border-t border-border bg-background/95 backdrop-blur-sm",
        isFullscreen ? "px-8 py-3" : "p-3"
      )}>
        {/* Action row */}
        <div className="flex items-center justify-between mb-2">
          {/* Hint / Check answer */}
          <div className="flex items-center gap-2">
            {!isAnswered && (
              <motion.button
                type="button"
                onClick={handleCheckAnswer}
                disabled={selectedOption === null}
                className={cn(
                  "px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200",
                  "flex items-center gap-2",
                  selectedOption !== null
                    ? "bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-md hover:shadow-lg"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
                whileHover={selectedOption !== null ? { scale: 1.02 } : undefined}
                whileTap={selectedOption !== null ? { scale: 0.98 } : undefined}
              >
                <CheckCircle2 className="w-4 h-4" />
                Check
              </motion.button>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevious}
              disabled={currentIndex === 0}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <Button
              variant={isAnswered ? "default" : "outline"}
              size="sm"
              onClick={goToNext}
              disabled={!isAnswered}
              className={cn(
                "flex items-center gap-1",
                isAnswered && "bg-gradient-to-r from-rose-600 to-rose-500 text-white hover:from-rose-700 hover:to-rose-600"
              )}
            >
              {currentIndex === questions.length - 1 && totalAnswered === questions.length
                ? 'See Results'
                : 'Next'}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRestart}
            className="flex-shrink-0"
            title="Restart quiz"
          >
            <RotateCcw className={cn(isFullscreen ? "w-4 h-4" : "w-3 h-3")} />
          </Button>
          <div className={cn(
            "bg-muted rounded-full overflow-hidden flex-1",
            isFullscreen ? "h-3" : "h-1.5"
          )}>
            <motion.div
              className="h-full bg-gradient-to-r from-rose-500 to-rose-600 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
