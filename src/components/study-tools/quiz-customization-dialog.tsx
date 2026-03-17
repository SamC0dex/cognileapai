'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui'
import { X, Sparkles, Check, BrainCircuit } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QuizOptions, QUIZ_COUNTS, QUIZ_DIFFICULTIES } from '@/types/quiz'

interface QuizCustomizationDialogProps {
  isOpen: boolean
  onClose: () => void
  onGenerate: (options: QuizOptions) => void
  isGenerating?: boolean
}

export const QuizCustomizationDialog: React.FC<QuizCustomizationDialogProps> = ({
  isOpen,
  onClose,
  onGenerate,
  isGenerating = false
}) => {
  const [numberOfQuestions, setNumberOfQuestions] = React.useState<'fewer' | 'standard' | 'more' | 'custom'>('standard')
  const [customCount, setCustomCount] = React.useState<number>(10)
  const [difficulty, setDifficulty] = React.useState<'easy' | 'medium' | 'hard'>('medium')
  const [customInstructions, setCustomInstructions] = React.useState('')

  const handleGenerate = () => {
    onGenerate({
      numberOfQuestions,
      customCount: numberOfQuestions === 'custom' ? customCount : undefined,
      difficulty,
      customInstructions: customInstructions.trim() || undefined
    })
  }

  const handleClose = () => {
    if (!isGenerating) {
      onClose()
    }
  }

  // Reset form when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      setNumberOfQuestions('standard')
      setCustomCount(10)
      setDifficulty('medium')
      setCustomInstructions('')
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[500] flex items-center justify-center p-4 sm:p-6 lg:p-8"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-3xl xl:max-w-4xl max-h-[90vh] overflow-y-auto mx-auto relative z-[510]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border bg-gradient-to-r from-rose-50/50 to-transparent dark:from-rose-900/20">
            <div className="flex items-center gap-3">
              <motion.div
                className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <BrainCircuit className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </motion.div>
              <h2 className="text-xl font-semibold text-foreground">
                Generate Quiz
              </h2>
            </div>
            {!isGenerating && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="rounded-lg hover:bg-accent/50"
              >
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {/* Number of Questions */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground">Number of Questions</h3>
              <div className="grid grid-cols-4 gap-3">
                {(Object.keys(QUIZ_COUNTS) as Array<keyof typeof QUIZ_COUNTS>).map((option) => {
                  const count = QUIZ_COUNTS[option]
                  const isSelected = numberOfQuestions === option

                  return (
                    <motion.button
                      key={option}
                      type="button"
                      className={cn(
                        "relative p-4 rounded-lg border-2 transition-all duration-200 text-left",
                        isSelected
                          ? "bg-rose-50 dark:bg-rose-900/20 border-rose-300 dark:border-rose-700 shadow-md"
                          : "bg-background border-border hover:border-rose-200 dark:hover:border-rose-800 hover:bg-rose-50/50 dark:hover:bg-rose-900/10"
                      )}
                      onClick={() => setNumberOfQuestions(option)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={isGenerating}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm capitalize text-foreground">
                          {count.label}
                          {option === 'standard' && ' ★'}
                        </span>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="text-rose-600 dark:text-rose-400"
                          >
                            <Check className="w-4 h-4" />
                          </motion.div>
                        )}
                      </div>
                      {option !== 'custom' && (
                        <p className="text-xs text-muted-foreground mb-1">
                          {count.min}-{count.max} questions
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {count.description}
                      </p>
                    </motion.button>
                  )
                })}
              </div>

              {/* Custom count input */}
              <AnimatePresence>
                {numberOfQuestions === 'custom' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-3 pt-2">
                      <label className="text-sm font-medium text-foreground whitespace-nowrap">
                        How many questions?
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={customCount}
                        onChange={(e) => {
                          const val = parseInt(e.target.value)
                          if (!isNaN(val) && val >= 1 && val <= 50) {
                            setCustomCount(val)
                          }
                        }}
                        disabled={isGenerating}
                        className={cn(
                          "w-24 px-3 py-2 rounded-lg border border-border bg-background",
                          "text-sm font-medium text-center",
                          "focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500/50",
                          "transition-all duration-200",
                          isGenerating && "opacity-50 cursor-not-allowed"
                        )}
                      />
                      <span className="text-xs text-muted-foreground">(1-50)</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Level of Difficulty */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground">Level of Difficulty</h3>
              <div className="grid grid-cols-3 gap-3">
                {(Object.keys(QUIZ_DIFFICULTIES) as Array<keyof typeof QUIZ_DIFFICULTIES>).map((level) => {
                  const config = QUIZ_DIFFICULTIES[level]
                  const isSelected = difficulty === level

                  return (
                    <motion.button
                      key={level}
                      type="button"
                      className={cn(
                        "relative p-4 rounded-lg border-2 transition-all duration-200 text-left",
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 shadow-md"
                          : "bg-background border-border hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-900/10"
                      )}
                      onClick={() => setDifficulty(level)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={isGenerating}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm capitalize text-foreground">
                          {level}
                          {level === 'medium' && ' (Default)'}
                        </span>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="text-blue-600 dark:text-blue-400"
                          >
                            <Check className="w-4 h-4" />
                          </motion.div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {config.description}
                      </p>
                    </motion.button>
                  )
                })}
              </div>
            </div>

            {/* Custom Instructions */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-foreground">Custom Instructions</h3>
              <div className="relative">
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder={
                    "Things to try:\n" +
                    "• Focus on a specific chapter or topic\n" +
                    "• Include scenario-based questions\n" +
                    "• Test only formulas and calculations\n" +
                    "• Create questions comparing two concepts"
                  }
                  disabled={isGenerating}
                  className={cn(
                    "w-full min-h-[100px] p-4 rounded-lg border border-border bg-background",
                    "placeholder:text-muted-foreground text-sm resize-none",
                    "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50",
                    "transition-all duration-200",
                    isGenerating && "opacity-50 cursor-not-allowed"
                  )}
                  maxLength={500}
                />
                <div className="absolute bottom-3 right-3 text-xs text-muted-foreground">
                  {customInstructions.length}/500
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <motion.div
              className="flex justify-end pt-4 border-t border-border"
            >
              <motion.button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className={cn(
                  "px-8 py-3 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600",
                  "text-white font-medium rounded-lg shadow-lg hover:shadow-xl",
                  "transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
                  "flex items-center gap-2"
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isGenerating ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Sparkles className="w-4 h-4" />
                    </motion.div>
                    Generating...
                  </>
                ) : (
                  <>
                    <BrainCircuit className="w-4 h-4" />
                    Generate Quiz
                  </>
                )}
              </motion.button>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
