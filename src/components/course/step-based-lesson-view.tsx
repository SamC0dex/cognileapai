'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Volume2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Lesson, QuizQuestion } from '@/lib/course-store'

// Step types
type ContentStep = {
  type: 'content'
  title: string
  content: string
  hasDiagram: boolean
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

/**
 * Intelligently parse markdown into logical content chunks
 * Each chunk should be a digestible micro-lesson (target: 100-300 words)
 */
function parseContentIntoSteps(markdown: string): ContentStep[] {
  const steps: ContentStep[] = []
  
  // First, normalize the markdown
  let content = markdown.trim()
  
  // Remove the main title (# heading) if present - we show it separately
  content = content.replace(/^# .+?\n+/, '')
  
  // Remove learning objective section if at the start (we show it in header)
  content = content.replace(/^\*\*🎯 Learning Objective:\*\*.+?\n+/m, '')
  content = content.replace(/^\*\*⏱️ Estimated Time:\*\*.+?\n+/m, '')
  content = content.replace(/^---\n+/m, '')
  
  // Split by ## headers (main sections)
  const sections = content.split(/(?=^## )/m).filter(s => s.trim())
  
  for (const section of sections) {
    const trimmed = section.trim()
    if (!trimmed) continue
    
    // Extract ## title if present
    const headerMatch = trimmed.match(/^## (.+?)(?:\n|$)/)
    const sectionTitle = headerMatch ? headerMatch[1].trim() : ''
    const sectionContent = headerMatch ? trimmed.slice(headerMatch[0].length).trim() : trimmed
    
    // Check if section has subsections (### headers)
    const hasSubsections = /^### /m.test(sectionContent)
    
    if (hasSubsections) {
      // Split into subsections
      const subsections = sectionContent.split(/(?=^### )/m).filter(s => s.trim())
      
      for (const subsection of subsections) {
        const subTrimmed = subsection.trim()
        if (!subTrimmed) continue
        
        const subHeaderMatch = subTrimmed.match(/^### (.+?)(?:\n|$)/)
        const subTitle = subHeaderMatch ? subHeaderMatch[1].trim() : sectionTitle
        const subContent = subHeaderMatch ? subTrimmed.slice(subHeaderMatch[0].length).trim() : subTrimmed
        
        if (subContent) {
          // Check if content is too long and needs further splitting
          const chunks = splitLongContent(subContent, subTitle)
          steps.push(...chunks)
        }
      }
    } else {
      // No subsections - check if content needs splitting
      if (sectionContent) {
        const chunks = splitLongContent(sectionContent, sectionTitle)
        steps.push(...chunks)
      }
    }
  }
  
  // If no sections were found (no ## headers), treat whole content as one or split by paragraphs
  if (steps.length === 0 && content.trim()) {
    const chunks = splitLongContent(content, '')
    steps.push(...chunks)
  }
  
  return steps
}

/**
 * Split long content into smaller chunks while preserving logical groupings
 * Targets ~150-250 words per chunk, but respects natural boundaries
 */
function splitLongContent(content: string, title: string): ContentStep[] {
  const MAX_WORDS = 300
  const MIN_WORDS = 50
  
  // Check if content has a diagram - keep diagrams with their context
  const hasDiagram = content.includes('```mermaid')
  
  // Count words roughly
  const wordCount = content.split(/\s+/).length
  
  // If short enough, return as single step
  if (wordCount <= MAX_WORDS) {
    return [{
      type: 'content',
      title,
      content,
      hasDiagram
    }]
  }
  
  const chunks: ContentStep[] = []
  
  // Split by natural boundaries: bullet lists, blockquotes, or double newlines
  // Priority: keep lists together, keep blockquotes together
  const segments = content.split(/\n\n+/).filter(s => s.trim())
  
  let currentChunk = ''
  let currentWords = 0
  let chunkIndex = 0
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const segmentWords = segment.split(/\s+/).length
    
    // If this segment alone is too big, we have to include it anyway
    if (segmentWords > MAX_WORDS) {
      // Save current chunk if exists
      if (currentChunk.trim()) {
        chunks.push({
          type: 'content',
          title: chunkIndex === 0 ? title : '',
          content: currentChunk.trim(),
          hasDiagram: currentChunk.includes('```mermaid')
        })
        chunkIndex++
      }
      // Add the big segment as its own chunk
      chunks.push({
        type: 'content',
        title: '',
        content: segment.trim(),
        hasDiagram: segment.includes('```mermaid')
      })
      chunkIndex++
      currentChunk = ''
      currentWords = 0
      continue
    }
    
    // Would adding this segment exceed max?
    if (currentWords + segmentWords > MAX_WORDS && currentWords >= MIN_WORDS) {
      // Save current chunk
      chunks.push({
        type: 'content',
        title: chunkIndex === 0 ? title : '',
        content: currentChunk.trim(),
        hasDiagram: currentChunk.includes('```mermaid')
      })
      chunkIndex++
      currentChunk = segment
      currentWords = segmentWords
    } else {
      // Add to current chunk
      currentChunk += (currentChunk ? '\n\n' : '') + segment
      currentWords += segmentWords
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push({
      type: 'content',
      title: chunkIndex === 0 ? title : '',
      content: currentChunk.trim(),
      hasDiagram: currentChunk.includes('```mermaid')
    })
  }
  
  return chunks
}

/**
 * Interleave content steps with quiz questions naturally
 * Places quizzes after logical content sections
 */
function createSteps(contentSteps: ContentStep[], quizQuestions: QuizQuestion[]): Step[] {
  const steps: Step[] = []
  
  if (contentSteps.length === 0) {
    return quizQuestions.map(q => ({ type: 'quiz' as const, question: q }))
  }
  
  if (quizQuestions.length === 0) {
    return contentSteps
  }
  
  // Distribute quizzes evenly throughout content
  // After every N content steps, insert a quiz
  const contentPerQuiz = Math.ceil(contentSteps.length / quizQuestions.length)
  
  let quizIndex = 0
  
  for (let i = 0; i < contentSteps.length; i++) {
    steps.push(contentSteps[i])
    
    // After every contentPerQuiz steps, add a quiz (if we have more)
    if ((i + 1) % contentPerQuiz === 0 && quizIndex < quizQuestions.length) {
      steps.push({ type: 'quiz', question: quizQuestions[quizIndex] })
      quizIndex++
    }
  }
  
  // Add any remaining quizzes at the end
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
  
  // Quiz state
  const [selectedAnswers, setSelectedAnswers] = React.useState<Record<string, string>>({})
  const [checkedQuestions, setCheckedQuestions] = React.useState<Set<string>>(new Set())
  const [correctQuestions, setCorrectQuestions] = React.useState<Set<string>>(new Set())
  
  // Create steps from content and quizzes
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
  
  // Check if current step can proceed
  const canProceed = React.useMemo(() => {
    if (!currentStep) return false
    if (currentStep.type === 'content') return true
    // For quiz steps, must have checked the answer
    return checkedQuestions.has(currentStep.question.id)
  }, [currentStep, checkedQuestions])
  
  // Handle answer selection for quiz steps
  const handleAnswerSelect = (questionId: string, answer: string) => {
    if (checkedQuestions.has(questionId)) return
    setSelectedAnswers(prev => ({ ...prev, [questionId]: answer }))
  }
  
  // Get correct answer text (handles letter format)
  const getCorrectAnswerText = React.useCallback((question: QuizQuestion) => {
    const letterMatch = question.correctAnswer.match(/^[A-D]$/i)
    if (letterMatch) {
      const idx = letterMatch[0].toUpperCase().charCodeAt(0) - 65
      return question.options[idx] || question.correctAnswer
    }
    return question.correctAnswer
  }, [])
  
  // Check answer
  const handleCheckAnswer = (question: QuizQuestion) => {
    const selected = selectedAnswers[question.id]
    if (!selected) return
    
    const correctText = getCorrectAnswerText(question)
    const isCorrect = selected.trim().toLowerCase() === correctText.trim().toLowerCase()
    
    setCheckedQuestions(prev => new Set(prev).add(question.id))
    if (isCorrect) {
      setCorrectQuestions(prev => new Set(prev).add(question.id))
    }
  }
  
  // Navigation
  const handleNext = () => {
    if (isLastStep) {
      const score = Math.round((correctQuestions.size / quizQuestions.length) * 100)
      const timeSpent = Math.floor((Date.now() - startTime) / 1000)
      onComplete(score, timeSpent)
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
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">No content available</p>
      </div>
    )
  }
  
  return (
    <div className={cn("min-h-screen bg-background", className)}>
      {/* Top Progress Bar */}
      <div className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="h-1.5 bg-muted">
          <motion.div
            className="h-full bg-gradient-to-r from-green-500 to-green-400"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToCourse}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Exit
          </Button>
          <span className="text-sm font-medium text-muted-foreground">
            Step {currentStepIndex + 1}/{steps.length}
          </span>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStepIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {currentStep.type === 'content' ? (
              <ContentStepView step={currentStep} />
            ) : (
              <QuizStepView
                step={currentStep}
                selectedAnswer={selectedAnswers[currentStep.question.id]}
                isChecked={checkedQuestions.has(currentStep.question.id)}
                isCorrect={correctQuestions.has(currentStep.question.id)}
                correctAnswerText={getCorrectAnswerText(currentStep.question)}
                onAnswerSelect={handleAnswerSelect}
                onCheckAnswer={() => handleCheckAnswer(currentStep.question)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      
      {/* Bottom Navigation */}
      <div className="sticky bottom-0 bg-background border-t border-border p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            className={cn(currentStepIndex === 0 && "opacity-50")}
          >
            Back
          </Button>
          
          <Button
            onClick={handleNext}
            disabled={!canProceed}
            className={cn(
              "px-8 bg-gradient-to-r from-purple-600 to-purple-500",
              "hover:from-purple-700 hover:to-purple-600",
              "text-white font-medium",
              !canProceed && "opacity-50 cursor-not-allowed"
            )}
          >
            {isLastStep ? 'Complete' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Content Step Component
function ContentStepView({ step }: { step: ContentStep }) {
  return (
    <div className="space-y-6">
      {/* Optional Listen Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="text-purple-600 border-purple-200 hover:bg-purple-50"
          disabled
          title="Coming soon"
        >
          <Volume2 className="h-4 w-4 mr-2" />
          Listen
        </Button>
      </div>
      
      {/* Content */}
      <div className="prose prose-lg dark:prose-invert max-w-none">
        {step.title && (
          <h2 className="text-2xl font-bold mb-6 text-foreground">{step.title}</h2>
        )}
        
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h3: ({ children }) => (
              <h3 className="text-xl font-semibold mt-8 mb-4 text-foreground">{children}</h3>
            ),
            p: ({ children }) => (
              <p className="text-base leading-relaxed mb-4 text-foreground/90">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="space-y-2 mb-4 ml-4">{children}</ul>
            ),
            li: ({ children }) => (
              <li className="text-base leading-relaxed flex items-start gap-2">
                <span className="text-purple-500 mt-1.5">•</span>
                <span>{children}</span>
              </li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">{children}</strong>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-purple-500 bg-purple-50 dark:bg-purple-950/20 pl-4 py-3 my-4 rounded-r-lg">
                {children}
              </blockquote>
            ),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            code: ({ className, children, ...props }: any) => {
              const match = /language-(\w+)/.exec(className || '')
              if (match?.[1] === 'mermaid') {
                return (
                  <div className="my-6 p-6 bg-purple-50 dark:bg-purple-950/20 rounded-xl border border-purple-200 dark:border-purple-800">
                    <div className="flex items-center gap-2 mb-3 text-purple-700 dark:text-purple-300">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <span className="font-medium">Diagram</span>
                    </div>
                    <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono bg-muted/50 p-3 rounded-lg overflow-x-auto">
                      {String(children).replace(/\n$/, '')}
                    </pre>
                  </div>
                )
              }
              return (
                <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono" {...props}>
                  {children}
                </code>
              )
            }
          }}
        >
          {step.content}
        </ReactMarkdown>
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
  onCheckAnswer
}: {
  step: QuizStep
  selectedAnswer?: string
  isChecked: boolean
  isCorrect: boolean
  correctAnswerText: string
  onAnswerSelect: (questionId: string, answer: string) => void
  onCheckAnswer: () => void
}) {
  const question = step.question
  
  const isOptionCorrect = (option: string) => {
    return option.trim().toLowerCase() === correctAnswerText.trim().toLowerCase()
  }
  
  return (
    <div className="space-y-6">
      {/* Quiz Header */}
      <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
        <span className="text-xl">👑</span>
        <span className="font-semibold">Mastery Moment</span>
      </div>
      
      {/* Question */}
      <div className="p-6 rounded-2xl bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900">
        <h3 className="text-lg font-medium text-foreground mb-6">
          {question.question}
        </h3>
        
        {/* Options */}
        <div className="space-y-3">
          {question.options.map((option, index) => {
            const isSelected = selectedAnswer === option
            const showAsCorrect = isChecked && isOptionCorrect(option)
            const showAsIncorrect = isChecked && isSelected && !isOptionCorrect(option)
            
            return (
              <button
                key={index}
                onClick={() => !isChecked && onAnswerSelect(question.id, option)}
                disabled={isChecked}
                className={cn(
                  "w-full p-4 rounded-xl text-left transition-all",
                  "border-2 font-medium",
                  // Default
                  !isSelected && !isChecked && "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-purple-300",
                  // Selected (not checked)
                  isSelected && !isChecked && "border-purple-500 bg-purple-100 dark:bg-purple-900/50",
                  // Correct (after check)
                  showAsCorrect && "border-green-500 bg-green-50 dark:bg-green-950/50",
                  // Incorrect (after check)
                  showAsIncorrect && "border-red-400 bg-red-50 dark:bg-red-950/50",
                  // Disabled state
                  isChecked && !showAsCorrect && !showAsIncorrect && "opacity-50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center text-sm font-semibold",
                      !isSelected && !isChecked && "bg-gray-100 dark:bg-gray-800 text-gray-600",
                      isSelected && !isChecked && "bg-purple-500 text-white",
                      showAsCorrect && "bg-green-500 text-white",
                      showAsIncorrect && "bg-red-400 text-white"
                    )}
                  >
                    {String.fromCharCode(65 + index)}
                  </div>
                  <span className="text-base">{option}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
      
      {/* Check Button (only show if not checked) */}
      {!isChecked && (
        <Button
          onClick={onCheckAnswer}
          disabled={!selectedAnswer}
          className={cn(
            "w-full py-6 text-base font-medium",
            "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
            "hover:bg-purple-200 dark:hover:bg-purple-900/50",
            "border-2 border-purple-200 dark:border-purple-800",
            !selectedAnswer && "opacity-50 cursor-not-allowed"
          )}
        >
          Check
        </Button>
      )}
      
      {/* Feedback (show after check) */}
      {isChecked && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-4 rounded-xl border-2",
            isCorrect
              ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
              : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
          )}
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl">{isCorrect ? '🎉' : '💡'}</span>
            <div>
              <p className={cn(
                "font-semibold mb-1",
                isCorrect ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"
              )}>
                {isCorrect ? 'Great job!' : 'Not quite!'}
              </p>
              <p className="text-sm text-foreground/80">
                {question.explanation}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
