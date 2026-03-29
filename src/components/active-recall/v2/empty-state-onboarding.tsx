'use client'

import { motion } from 'framer-motion'
import { Brain, Sparkles, BookOpen, ArrowRight, TreePine, FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui'

interface EmptyStateOnboardingProps {
  onOpenChat?: () => void
}

export function EmptyStateOnboarding({ onOpenChat }: EmptyStateOnboardingProps) {
  const handleGetStarted = () => {
    if (onOpenChat) {
      onOpenChat()
    } else {
      window.location.href = '/active-recall'
    }
  }

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

      <h3 className="text-xl font-semibold mb-2">Your AI Study Agent</h3>
      <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
        Tell the AI what you want to study and it will create a personalized plan
        combining flashcards, quizzes, and mind maps — all with spaced repetition.
      </p>

      <div className="space-y-3 text-left mb-6">
        {[
          { icon: Sparkles, text: 'Tell the AI agent what you want to study' },
          { icon: BookOpen, text: 'It discovers or generates flashcards, quizzes & mind maps' },
          { icon: TreePine, text: 'Get a structured multi-tool study plan' },
          { icon: Brain, text: 'Review everything with AI-optimized spaced repetition' },
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
        onClick={handleGetStarted}
      >
        Open Study Agent
        <ArrowRight className="h-4 w-4" />
      </Button>
    </motion.div>
  )
}
