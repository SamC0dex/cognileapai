'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Clock, Gift, Check, X, Flame, Trophy } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Lesson, QuizQuestion } from '@/lib/course-store'

// Encouraging messages based on progress
const ENCOURAGEMENT_MESSAGES = [
  "Let's go!",
  "Solid start!",
  "Picking up speed!",
  "You're locked in!",
  "Halfway there!",
  "On a roll!",
  "Crushing it!",
  "Almost done!",
  "Final push!",
  "Finish strong!"
]

// Step types
type ContentStep = {
  type: 'content'
  title: string
  content: string
  hasDiagram: boolean
  hasInteractive?: boolean
}

type QuizStep = {
  type: 'quiz'
  question: QuizQuestion
}

type Step = ContentStep | QuizStep

interface StepBasedLessonViewProps {
  lesson: Lesson
  quizQuestions: QuizQuestion[]
  onComplete: (score: number, timeSpent: number) => void
  onBackToCourse: () => void
  className?: string
}

function parseContentIntoSteps(markdown: string): ContentStep[] {
  const steps: ContentStep[] = []
  let content = markdown.trim()
  
  content = content.replace(/^# .+?\n+/, '')
  content = content.replace(/^\*\*🎯 Learning Objective:\*\*.+?\n+/m, '')
  content = content.replace(/^\*\*⏱️ Estimated Time:\*\*.+?\n+/m, '')
  content = content.replace(/^---\n+/m, '')
  
  const sections = content.split(/(?=^## )/m).filter(s => s.trim())
  
  for (const section of sections) {
    const trimmed = section.trim()
    if (!trimmed) continue
    
    const headerMatch = trimmed.match(/^## (.+?)(?:\n|$)/)
    const sectionTitle = headerMatch ? headerMatch[1].trim() : ''
    const sectionContent = headerMatch ? trimmed.slice(headerMatch[0].length).trim() : trimmed
    
    const hasSubsections = /^### /m.test(sectionContent)
    
    if (hasSubsections) {
      const subsections = sectionContent.split(/(?=^### )/m).filter(s => s.trim())
      
      for (const subsection of subsections) {
        const subTrimmed = subsection.trim()
        if (!subTrimmed) continue
        
        const subHeaderMatch = subTrimmed.match(/^### (.+?)(?:\n|$)/)
        const subTitle = subHeaderMatch ? subHeaderMatch[1].trim() : sectionTitle
        const subContent = subHeaderMatch ? subTrimmed.slice(subHeaderMatch[0].length).trim() : subTrimmed
        
        if (subContent) {
          const chunks = splitLongContent(subContent, subTitle)
          steps.push(...chunks)
        }
      }
    } else {
      if (sectionContent) {
        const chunks = splitLongContent(sectionContent, sectionTitle)
        steps.push(...chunks)
      }
    }
  }
  
  if (steps.length === 0 && content.trim()) {
    const chunks = splitLongContent(content, '')
    steps.push(...chunks)
  }
  
  return steps
}

function splitLongContent(content: string, title: string): ContentStep[] {
  const MAX_WORDS = 300
  const MIN_WORDS = 50
  
  const hasDiagram = content.includes('```mermaid')
  const hasInteractive = content.includes('```interactive') || content.includes('[interactive]')
  const wordCount = content.split(/\s+/).length
  
  if (wordCount <= MAX_WORDS) {
    return [{
      type: 'content',
      title,
      content,
      hasDiagram,
      hasInteractive
    }]
  }
  
  const chunks: ContentStep[] = []
  const segments = content.split(/\n\n+/).filter(s => s.trim())
  
  let currentChunk = ''
  let currentWords = 0
  let chunkIndex = 0
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const segmentWords = segment.split(/\s+/).length
    
    if (segmentWords > MAX_WORDS) {
      if (currentChunk.trim()) {
        chunks.push({
          type: 'content',
          title: chunkIndex === 0 ? title : '',
          content: currentChunk.trim(),
          hasDiagram: currentChunk.includes('```mermaid'),
          hasInteractive: currentChunk.includes('```interactive')
        })
        chunkIndex++
      }
      chunks.push({
        type: 'content',
        title: '',
        content: segment.trim(),
        hasDiagram: segment.includes('```mermaid'),
        hasInteractive: segment.includes('```interactive')
      })
      chunkIndex++
      currentChunk = ''
      currentWords = 0
      continue
    }
    
    if (currentWords + segmentWords > MAX_WORDS && currentWords >= MIN_WORDS) {
      chunks.push({
        type: 'content',
        title: chunkIndex === 0 ? title : '',
        content: currentChunk.trim(),
        hasDiagram: currentChunk.includes('```mermaid'),
        hasInteractive: currentChunk.includes('```interactive')
      })
      chunkIndex++
      currentChunk = segment
      currentWords = segmentWords
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + segment
      currentWords += segmentWords
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push({
      type: 'content',
      title: chunkIndex === 0 ? title : '',
      content: currentChunk.trim(),
      hasDiagram: currentChunk.includes('```mermaid'),
      hasInteractive: currentChunk.includes('```interactive')
    })
  }
  
  return chunks
}

function createSteps(contentSteps: ContentStep[], quizQuestions: QuizQuestion[]): Step[] {
  const steps: Step[] = []
  
  if (contentSteps.length === 0) {
    return quizQuestions.map(q => ({ type: 'quiz' as const, question: q }))
  }
  
  if (quizQuestions.length === 0) {
    return contentSteps
  }
  
  const contentPerQuiz = Math.ceil(contentSteps.length / quizQuestions.length)
  let quizIndex = 0
  
  for (let i = 0; i < contentSteps.length; i++) {
    steps.push(contentSteps[i])
    
    if ((i + 1) % contentPerQuiz === 0 && quizIndex < quizQuestions.length) {
      steps.push({ type: 'quiz', question: quizQuestions[quizIndex] })
      quizIndex++
    }
  }
  
  while (quizIndex < quizQuestions.length) {
    steps.push({ type: 'quiz', question: quizQuestions[quizIndex] })
    quizIndex++
  }
  
  return steps
}

export function StepBasedLessonView({
  lesson,
  quizQuestions,
  onComplete,
  onBackToCourse,
  className
}: StepBasedLessonViewProps) {
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0)
  const [startTime] = React.useState(Date.now())
  const totalSeconds = (lesson.estimatedMinutes || 5) * 60
  const [countdown, setCountdown] = React.useState(totalSeconds)

  // Quiz state
  const [selectedAnswers, setSelectedAnswers] = React.useState<Record<string, string>>({})
  const [checkedQuestions, setCheckedQuestions] = React.useState<Set<string>>(new Set())
  const [correctQuestions, setCorrectQuestions] = React.useState<Set<string>>(new Set())
  const [currentStreak, setCurrentStreak] = React.useState(0)
  const [bestStreak, setBestStreak] = React.useState(0)
  const [showStreakAnimation, setShowStreakAnimation] = React.useState(false)

  // Countdown timer
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [])
  
  const contentSteps = React.useMemo(
    () => parseContentIntoSteps(lesson.contentMarkdown),
    [lesson.contentMarkdown]
  )
  
  const steps = React.useMemo(
    () => createSteps(contentSteps, quizQuestions),
    [contentSteps, quizQuestions]
  )
  
  const currentStep = steps[currentStepIndex]
  const isLastStep = currentStepIndex === steps.length - 1
  const progress = ((currentStepIndex + 1) / steps.length) * 100

  // Countdown display
  const countdownMinutes = Math.floor(countdown / 60)
  const countdownSecs = countdown % 60
  const countdownDisplay = `${countdownMinutes}:${countdownSecs.toString().padStart(2, '0')}`
  const isOvertime = countdown === 0

  // Get encouragement message based on progress
  const encouragementIndex = Math.min(
    Math.floor(progress / 10),
    ENCOURAGEMENT_MESSAGES.length - 1
  )
  const encouragementMessage = ENCOURAGEMENT_MESSAGES[encouragementIndex]

  // Count quiz questions answered correctly
  const quizSteps = steps.filter(s => s.type === 'quiz') as QuizStep[]
  const totalQuizzes = quizSteps.length
  const completedQuizzes = checkedQuestions.size
  const correctCount = correctQuestions.size

  const [showSummary, setShowSummary] = React.useState(false)

  const canProceed = React.useMemo(() => {
    if (showSummary) return true
    if (!currentStep) return false
    if (currentStep.type === 'content') return true
    return checkedQuestions.has(currentStep.question.id)
  }, [currentStep, checkedQuestions, showSummary])
  
  const handleAnswerSelect = (questionId: string, answer: string) => {
    if (checkedQuestions.has(questionId)) return
    setSelectedAnswers(prev => ({ ...prev, [questionId]: answer }))
  }
  
  const getCorrectAnswerText = React.useCallback((question: QuizQuestion) => {
    const letterMatch = question.correctAnswer.match(/^[A-D]$/i)
    if (letterMatch) {
      const idx = letterMatch[0].toUpperCase().charCodeAt(0) - 65
      return question.options[idx] || question.correctAnswer
    }
    return question.correctAnswer
  }, [])
  
  const handleCheckAnswer = (question: QuizQuestion) => {
    const selected = selectedAnswers[question.id]
    if (!selected) return

    const correctText = getCorrectAnswerText(question)
    const isCorrect = selected.trim().toLowerCase() === correctText.trim().toLowerCase()

    setCheckedQuestions(prev => new Set(prev).add(question.id))
    if (isCorrect) {
      setCorrectQuestions(prev => new Set(prev).add(question.id))
      const newStreak = currentStreak + 1
      setCurrentStreak(newStreak)
      if (newStreak > bestStreak) setBestStreak(newStreak)
      if (newStreak >= 3) {
        setShowStreakAnimation(true)
        setTimeout(() => setShowStreakAnimation(false), 2000)
      }
    } else {
      setCurrentStreak(0)
    }
  }
  
  const handleNext = () => {
    if (isLastStep && !showSummary) {
      setShowSummary(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else if (showSummary) {
      const score = totalQuizzes > 0 ? Math.round((correctCount / totalQuizzes) * 100) : 100
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
      onComplete(score, elapsedSeconds)
    } else {
      setCurrentStepIndex(prev => prev + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  
  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  
  if (!currentStep) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-blue-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <p className="text-muted-foreground">No content available</p>
      </div>
    )
  }
  
  return (
    <div className={cn(
      "min-h-screen",
      "bg-gradient-to-br from-indigo-100 via-purple-50 to-blue-100",
      "dark:from-slate-900 dark:via-slate-800 dark:to-slate-900",
      className
    )}>
      {/* Top Header Bar */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        {/* Progress Bar */}
        <div className="h-1.5 bg-muted">
          <motion.div
            className="h-full bg-gradient-to-r from-green-400 via-emerald-500 to-teal-500"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
        
        {/* Header Content */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          {/* Left: Encouragement + Streak */}
          <div className="flex items-center gap-3">
            <motion.span
              key={encouragementMessage}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm font-semibold text-emerald-600 dark:text-emerald-400"
            >
              {encouragementMessage}
            </motion.span>
            {currentStreak >= 3 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
              >
                <Flame className="h-3.5 w-3.5" />
                <span className="text-xs font-bold">{currentStreak}</span>
              </motion.div>
            )}
          </div>

          {/* Center: Quiz Score */}
          {totalQuizzes > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="h-3.5 w-3.5" />
              <span>{correctCount}/{totalQuizzes} correct</span>
            </div>
          )}

          {/* Right: Timer and Exit */}
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full",
              isOvertime
                ? "bg-red-100 dark:bg-red-900/30"
                : "bg-muted"
            )}>
              <Clock className={cn("h-4 w-4", isOvertime ? "text-red-500" : "text-muted-foreground")} />
              <span className={cn(
                "text-sm font-mono font-medium",
                isOvertime ? "text-red-600 dark:text-red-400" : "text-foreground"
              )}>
                {isOvertime ? '0:00' : countdownDisplay}
              </span>
            </div>
            <button
              onClick={onBackToCourse}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title="Exit lesson"
            >
              <Gift className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Streak Animation Overlay */}
        <AnimatePresence>
          {showStreakAnimation && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-full left-1/2 -translate-x-1/2 z-50 mt-2"
            >
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold shadow-lg">
                <Flame className="h-5 w-5" />
                <span>{currentStreak} in a row — On Fire!</span>
                <Flame className="h-5 w-5" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-32">
        <AnimatePresence mode="wait">
          {showSummary ? (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <LessonSummaryCard
                lessonTitle={lesson.title}
                correctCount={correctCount}
                totalQuizzes={totalQuizzes}
                bestStreak={bestStreak}
                timeUsedSeconds={totalSeconds - countdown}
              />
            </motion.div>
          ) : (
            <motion.div
              key={currentStepIndex}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {currentStep.type === 'content' ? (
                <ContentStepView step={currentStep} lessonTitle={lesson.title} />
              ) : (
                <QuizStepView
                  step={currentStep}
                  selectedAnswer={selectedAnswers[currentStep.question.id]}
                  isChecked={checkedQuestions.has(currentStep.question.id)}
                  isCorrect={correctQuestions.has(currentStep.question.id)}
                  correctAnswerText={getCorrectAnswerText(currentStep.question)}
                  onAnswerSelect={handleAnswerSelect}
                  onCheckAnswer={() => handleCheckAnswer(currentStep.question)}
                  currentQuizNumber={completedQuizzes + (checkedQuestions.has(currentStep.question.id) ? 0 : 1)}
                  totalQuizzes={totalQuizzes}
                  correctSoFar={correctCount}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pagination Dots */}
        {!showSummary && (
          <div className="flex justify-center items-center gap-2 mt-8">
            {steps.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  if (index < currentStepIndex) {
                    setCurrentStepIndex(index)
                  }
                }}
                disabled={index > currentStepIndex}
                className={cn(
                  "w-2.5 h-2.5 rounded-full transition-all duration-300",
                  index === currentStepIndex
                    ? "w-8 bg-indigo-500 dark:bg-indigo-400"
                    : index < currentStepIndex
                      ? "bg-emerald-500 dark:bg-emerald-400 cursor-pointer hover:scale-110"
                      : "bg-muted-foreground/30"
                )}
                title={index <= currentStepIndex ? `Go to step ${index + 1}` : ''}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-xl border-t border-border/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={currentStepIndex === 0}
              className={cn(
                "px-6 py-2.5 text-muted-foreground",
                currentStepIndex === 0 && "opacity-30"
              )}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            
            <span className="text-sm text-muted-foreground font-medium">
              {currentStepIndex + 1} / {steps.length}
            </span>
            
            <Button
              onClick={handleNext}
              disabled={!canProceed}
              className={cn(
                "px-6 py-2.5 rounded-xl font-semibold",
                "bg-gradient-to-r from-indigo-500 to-purple-600",
                "hover:from-indigo-600 hover:to-purple-700",
                "text-white shadow-lg shadow-indigo-500/25",
                "transition-all duration-200",
                !canProceed && "opacity-50 cursor-not-allowed shadow-none"
              )}
            >
              {showSummary ? 'Complete Lesson' : isLastStep ? 'View Summary' : 'Got it'}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Content Step Component
function ContentStepView({ step, lessonTitle }: { step: ContentStep; lessonTitle: string }) {
  return (
    <div className="space-y-6">
      {/* Main Card */}
      <div className="bg-card rounded-3xl shadow-xl border overflow-hidden">
        {/* Card Header */}
        <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground text-center">
            {step.title || lessonTitle}
          </h1>
          {step.hasDiagram && (
            <p className="text-center text-sm text-muted-foreground mt-2">
              Explore the diagram below
            </p>
          )}
        </div>
        
        {/* Card Content */}
        <div className="px-6 sm:px-8 pb-8">
          {/* Prose Content */}
          <div className="prose dark:prose-invert max-w-none prose-headings:font-semibold prose-p:leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h2: ({ children }) => (
                  <h2 className="text-xl font-bold mt-6 mb-4 text-foreground">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg font-semibold mt-5 mb-3 text-foreground/90">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="text-base leading-relaxed mb-4 text-muted-foreground">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="space-y-2 mb-4 ml-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="space-y-2 mb-4 ml-1 list-decimal list-inside">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="text-base leading-relaxed flex items-start gap-3 text-muted-foreground">
                    <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2.5" />
                    <span className="flex-1">{children}</span>
                  </li>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-foreground">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic text-foreground/90">{children}</em>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 pl-4 py-3 my-4 rounded-r-xl">
                    <div className="text-foreground/90 font-medium">
                      {children}
                    </div>
                  </blockquote>
                ),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                code: ({ className, children, ...props }: any) => {
                  const match = /language-(\w+)/.exec(className || '')
                  if (match?.[1] === 'mermaid') {
                    return (
                      <div className="my-6 p-6 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 rounded-2xl border border-indigo-200/50 dark:border-indigo-800/50">
                        <div className="flex items-center gap-2 mb-3 text-indigo-600 dark:text-indigo-400">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          <span className="font-medium text-sm">Interactive Diagram</span>
                        </div>
                        <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono bg-card/60 p-4 rounded-xl overflow-x-auto">
                          {String(children).replace(/\n$/, '')}
                        </pre>
                      </div>
                    )
                  }
                  return (
                    <code className="px-1.5 py-0.5 rounded-md bg-muted text-sm font-mono text-foreground/90" {...props}>
                      {children}
                    </code>
                  )
                },
                table: ({ children }) => (
                  <div className="my-6 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="px-4 py-3 text-left text-sm font-semibold text-foreground bg-muted">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-4 py-3 text-sm text-muted-foreground bg-card">
                    {children}
                  </td>
                ),
              }}
            >
              {step.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
      
    </div>
  )
}

// Quiz Step Component
function QuizStepView({
  step,
  selectedAnswer,
  isChecked,
  isCorrect,
  correctAnswerText,
  onAnswerSelect,
  onCheckAnswer,
  currentQuizNumber,
  totalQuizzes,
  correctSoFar
}: {
  step: QuizStep
  selectedAnswer?: string
  isChecked: boolean
  isCorrect: boolean
  correctAnswerText: string
  onAnswerSelect: (questionId: string, answer: string) => void
  onCheckAnswer: () => void
  currentQuizNumber: number
  totalQuizzes: number
  correctSoFar: number
}) {
  const question = step.question
  
  const isOptionCorrect = (option: string) => {
    return option.trim().toLowerCase() === correctAnswerText.trim().toLowerCase()
  }
  
  return (
    <div className="space-y-6">
      {/* Quiz Card */}
      <div className="bg-card rounded-3xl shadow-xl border overflow-hidden">
        {/* Card Header with Level Info */}
        <div className="px-6 sm:px-8 pt-6 sm:pt-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-2xl">🎯</span>
            <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">
              Knowledge Check
            </span>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Question {currentQuizNumber} of {totalQuizzes}
          </p>
        </div>
        
        {/* Progress Mini-Card */}
        <div className="mx-6 sm:mx-8 my-4 p-4 bg-muted/50 rounded-xl">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress: {correctSoFar}/{totalQuizzes}</span>
            <div className="flex gap-1">
              {Array.from({ length: totalQuizzes }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-6 h-2 rounded-full transition-colors",
                    i < correctSoFar 
                      ? "bg-emerald-500" 
                      : i < currentQuizNumber - 1 
                        ? "bg-red-400" 
                        : "bg-muted-foreground/30"
                  )}
                />
              ))}
            </div>
          </div>
        </div>
        
        {/* Question */}
        <div className="px-6 sm:px-8 pb-6">
          <h2 className="text-xl font-semibold text-foreground mb-6 text-center">
            {question.question}
          </h2>
          
          {/* Options Grid */}
          <div className="grid gap-3">
            {question.options.map((option, index) => {
              const isSelected = selectedAnswer === option
              const showAsCorrect = isChecked && isOptionCorrect(option)
              const showAsIncorrect = isChecked && isSelected && !isOptionCorrect(option)
              
              return (
                <motion.button
                  key={index}
                  onClick={() => !isChecked && onAnswerSelect(question.id, option)}
                  disabled={isChecked}
                  whileHover={!isChecked ? { scale: 1.01 } : {}}
                  whileTap={!isChecked ? { scale: 0.99 } : {}}
                  className={cn(
                    "w-full p-4 rounded-xl text-left transition-all duration-200",
                    "border-2 font-medium",
                    "flex items-center gap-4",
                    // Default state
                    !isSelected && !isChecked && "border-border bg-card hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30",
                    // Selected (not checked)
                    isSelected && !isChecked && "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 ring-2 ring-indigo-500/20",
                    // Correct (after check)
                    showAsCorrect && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50",
                    // Incorrect (after check)
                    showAsIncorrect && "border-red-400 bg-red-50 dark:bg-red-950/50",
                    // Disabled non-answer
                    isChecked && !showAsCorrect && !showAsIncorrect && "opacity-50"
                  )}
                >
                  <div
                    className={cn(
                      "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-colors",
                      // Default
                      !isSelected && !isChecked && "bg-muted text-muted-foreground",
                      // Selected
                      isSelected && !isChecked && "bg-indigo-500 text-white",
                      // Correct
                      showAsCorrect && "bg-emerald-500 text-white",
                      // Incorrect
                      showAsIncorrect && "bg-red-400 text-white"
                    )}
                  >
                    {showAsCorrect ? (
                      <Check className="w-5 h-5" />
                    ) : showAsIncorrect ? (
                      <X className="w-5 h-5" />
                    ) : (
                      String.fromCharCode(65 + index)
                    )}
                  </div>
                  <span className="flex-1 text-foreground/90">{option}</span>
                </motion.button>
              )
            })}
          </div>
        </div>
        
        {/* Check Button */}
        {!isChecked && (
          <div className="px-6 sm:px-8 pb-6">
            <Button
              onClick={onCheckAnswer}
              disabled={!selectedAnswer}
              className={cn(
                "w-full py-4 text-base font-semibold rounded-xl",
                "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300",
                "hover:bg-indigo-200 dark:hover:bg-indigo-900/50",
                "border-2 border-indigo-200 dark:border-indigo-800",
                "transition-all duration-200",
                !selectedAnswer && "opacity-50 cursor-not-allowed"
              )}
            >
              Check Answer
            </Button>
          </div>
        )}
        
        {/* Feedback */}
        {isChecked && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-6 sm:px-8 pb-6"
          >
            <div
              className={cn(
                "p-5 rounded-2xl border-2",
                isCorrect
                  ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                  : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
              )}
            >
              <div className="flex items-start gap-4">
                <motion.span
                  className="text-3xl"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                >
                  {isCorrect ? '🎉' : '💡'}
                </motion.span>
                <div className="flex-1">
                  <p className={cn(
                    "font-bold text-lg mb-1",
                    isCorrect ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"
                  )}>
                    {isCorrect ? 'Nailed it!' : 'Not quite — here\'s why:'}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {question.explanation}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
      
      {/* Score indicator */}
      <div className="flex justify-center">
        <div className="px-4 py-2 rounded-full bg-card/60 backdrop-blur-sm border border-border/50">
          <span className="text-sm text-muted-foreground">
            {correctSoFar} of {totalQuizzes} correct
          </span>
        </div>
      </div>
    </div>
  )
}

// Lesson Summary Card Component
function LessonSummaryCard({
  lessonTitle,
  correctCount,
  totalQuizzes,
  bestStreak,
  timeUsedSeconds
}: {
  lessonTitle: string
  correctCount: number
  totalQuizzes: number
  bestStreak: number
  timeUsedSeconds: number
}) {
  const score = totalQuizzes > 0 ? Math.round((correctCount / totalQuizzes) * 100) : 100
  const mins = Math.floor(timeUsedSeconds / 60)
  const secs = timeUsedSeconds % 60

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-3xl shadow-xl overflow-hidden border">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 sm:px-8 py-8 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          >
            <Trophy className="h-12 w-12 text-white mx-auto mb-3" />
          </motion.div>
          <h2 className="text-2xl font-bold text-white mb-1">Lesson Complete!</h2>
          <p className="text-indigo-100 text-sm">{lessonTitle}</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 p-6 sm:p-8">
          <div className="text-center p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20">
            <Check className="h-6 w-6 text-emerald-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{score}%</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-500">Quiz Score</p>
          </div>

          <div className="text-center p-4 rounded-2xl bg-orange-50 dark:bg-orange-950/20">
            <Flame className="h-6 w-6 text-orange-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{bestStreak}</p>
            <p className="text-xs text-orange-600 dark:text-orange-500">Best Streak</p>
          </div>

          <div className="text-center p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/20">
            <Clock className="h-6 w-6 text-blue-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
              {mins}:{secs.toString().padStart(2, '0')}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-500">Time Spent</p>
          </div>
        </div>

        {/* Encouragement */}
        <div className="px-6 sm:px-8 pb-6">
          <div className="p-4 rounded-2xl bg-muted/50 text-center">
            <p className="text-sm font-medium text-foreground/80">
              {score >= 80
                ? 'Outstanding performance! You clearly understand this material.'
                : score >= 60
                  ? 'Good work! Review the tricky parts and you\'ll master this.'
                  : 'Keep going! Each attempt makes you stronger.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
