'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TreePine, ChevronRight, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MindMapReviewCardProps {
  question: string
  answer: string
  topic: string | null
  showAnswer: boolean
}

const BRANCH_COLORS = [
  { bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-700', dot: 'bg-emerald-500' },
  { bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-300 dark:border-blue-700', dot: 'bg-blue-500' },
  { bg: 'bg-violet-500/15', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-300 dark:border-violet-700', dot: 'bg-violet-500' },
  { bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-700', dot: 'bg-amber-500' },
  { bg: 'bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-300 dark:border-rose-700', dot: 'bg-rose-500' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-300 dark:border-cyan-700', dot: 'bg-cyan-500' },
]

/**
 * Visual tree-themed renderer for mind map review cards.
 * Shows branches as a mini tree structure with color-coded nodes.
 */
export function MindMapReviewCard({ question, answer, topic, showAnswer }: MindMapReviewCardProps) {
  // Parse structured answers (comma-separated branches)
  const answerItems = answer.includes(',')
    ? answer.split(',').map((s) => s.trim()).filter(Boolean)
    : null

  // Detect if this is a "What are the branches of X?" type question
  const isBranchQuestion = question.includes('branches') || question.includes('sub-topics') || question.includes('main')

  return (
    <div className="p-8 min-h-[320px] flex flex-col">
      {/* Question */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center w-full">
          {/* Tree path breadcrumb */}
          {topic && (
            <div className="flex items-center justify-center gap-1.5 mb-4 text-xs">
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <TreePine className="h-3 w-3" />
                <span className="font-medium">{topic}</span>
              </div>
            </div>
          )}

          <p className="text-xl font-medium leading-relaxed">
            {question}
          </p>
        </div>
      </div>

      {/* Answer (revealed) */}
      <AnimatePresence>
        {showAnswer && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.25 }}
            className="border-t border-emerald-200 dark:border-emerald-800/50 pt-6 mt-4"
          >
            {answerItems && isBranchQuestion ? (
              // Branch-style tree view
              <div className="space-y-2">
                {/* Central node */}
                <div className="flex items-center gap-2 mb-3">
                  <GitBranch className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {answerItems.length} branches
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {answerItems.map((item, idx) => {
                    const color = BRANCH_COLORS[idx % BRANCH_COLORS.length]
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.06 }}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border',
                          color.bg, color.border
                        )}
                      >
                        <div className={cn('h-2 w-2 rounded-full shrink-0', color.dot)} />
                        <span className={cn('text-sm font-medium', color.text)}>{item}</span>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            ) : answerItems ? (
              // Ordered list style
              <div className="space-y-2">
                {answerItems.map((item, idx) => {
                  const color = BRANCH_COLORS[idx % BRANCH_COLORS.length]
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-center gap-2.5"
                    >
                      <div className={cn(
                        'h-6 w-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0',
                        color.bg, color.text
                      )}>
                        {idx + 1}
                      </div>
                      <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                      <span className="text-sm text-foreground/80">{item}</span>
                    </motion.div>
                  )
                })}
              </div>
            ) : (
              // Single answer: show as text with accent
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-200 dark:border-emerald-800/30 px-4 py-3">
                <p className="text-base leading-relaxed text-foreground/80">
                  {answer}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tap hint */}
      {!showAnswer && (
        <p className="text-xs text-muted-foreground text-center mt-4">
          Tap or press <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Space</kbd> to reveal
        </p>
      )}
    </div>
  )
}
