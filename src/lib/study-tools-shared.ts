'use client'

import type { FlashcardOptions } from '@/types/flashcards'
import type { QuizOptions } from '@/types/quiz'

export type StudyToolType = 'study-guide' | 'flashcards' | 'smart-notes' | 'smart-summary' | 'quiz'

export interface StudyToolContent {
  id: string
  type: StudyToolType
  title: string
  content: string
  createdAt: Date
  documentId?: string
  conversationId?: string
  isGenerating?: boolean
  generationProgress?: number
  statusMessage?: string
}

export interface ActiveGeneration {
  id: string
  type: StudyToolType
  startTime: number
  progress: number
  status: 'starting' | 'generating' | 'finalizing'
  documentId?: string
  conversationId?: string
  flashcardOptions?: FlashcardOptions
  quizOptions?: QuizOptions
}

export interface StudyTool {
  name: string
  description: string
  icon: string
  color: string
  borderColor: string
  textColor: string
  progressBarColor: string
  disabled?: boolean
}

export const STUDY_TOOLS: Record<StudyToolType, StudyTool> = {
  'study-guide': {
    name: 'Study Guide',
    description: 'Comprehensive overview with key concepts',
    icon: '📚',
    color: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    textColor: 'text-blue-700 dark:text-blue-300',
    progressBarColor: 'bg-blue-500 dark:bg-blue-400'
  },
  flashcards: {
    name: 'Flashcards',
    description: 'Interactive Q&A cards for memorization',
    icon: '📄',
    color: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-200 dark:border-green-800',
    textColor: 'text-green-700 dark:text-green-300',
    progressBarColor: 'bg-green-500 dark:bg-green-400'
  },
  'smart-notes': {
    name: 'Smart Notes',
    description: 'Organized notes with key insights',
    icon: '📝',
    color: 'bg-purple-50 dark:bg-purple-900/20',
    borderColor: 'border-purple-200 dark:border-purple-800',
    textColor: 'text-purple-700 dark:text-purple-300',
    progressBarColor: 'bg-purple-500 dark:bg-purple-400'
  },
  'smart-summary': {
    name: 'Smart Summary',
    description: 'Concise overview of main points',
    icon: '⚡',
    color: 'bg-amber-50 dark:bg-amber-900/20',
    borderColor: 'border-amber-200 dark:border-amber-800',
    textColor: 'text-amber-700 dark:text-amber-300',
    progressBarColor: 'bg-amber-500 dark:bg-amber-400'
  },
  quiz: {
    name: 'Quiz',
    description: 'Test your knowledge with MCQs',
    icon: '🧠',
    color: 'bg-rose-50 dark:bg-rose-900/20',
    borderColor: 'border-rose-200 dark:border-rose-800',
    textColor: 'text-rose-700 dark:text-rose-300',
    progressBarColor: 'bg-rose-500 dark:bg-rose-400'
  }
} as const
