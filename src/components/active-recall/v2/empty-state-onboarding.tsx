'use client'

import { motion } from 'framer-motion'
import { Brain, Sparkles, BookOpen, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui'

export function EmptyStateOnboarding() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border bg-card p-8 text-center max-w-lg mx-auto"
    >
      <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mx-auto mb-5">
        <Brain className="h-8 w-8 text-primary" />
      </div>

      <h3 className="text-xl font-semibold mb-2">Your AI Study Companion</h3>
      <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
        Active Recall uses spaced repetition to help you remember what you learn.
        Generate flashcards or quizzes from your study materials, and the AI will
        schedule optimal review times to maximize retention.
      </p>

      <div className="space-y-3 text-left mb-6">
        {[
          { icon: BookOpen, text: 'Upload study materials or notes' },
          { icon: Sparkles, text: 'Generate flashcards or quizzes with AI' },
          { icon: Brain, text: 'Review at the perfect time for your memory' },
        ].map((step, i) => {
          const Icon = step.icon
          return (
            <div key={i} className="flex items-center gap-3 py-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 shrink-0">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <p className="text-sm">{step.text}</p>
            </div>
          )
        })}
      </div>

      <Button
        variant="purple"
        className="gap-2"
        onClick={() => { window.location.href = '/chat' }}
      >
        Get Started
        <ArrowRight className="h-4 w-4" />
      </Button>
    </motion.div>
  )
}
