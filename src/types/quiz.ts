export interface QuizOptions {
  numberOfQuestions: 'fewer' | 'standard' | 'more' | 'custom'
  customCount?: number  // Only used when numberOfQuestions === 'custom'
  difficulty: 'easy' | 'medium' | 'hard'
  customInstructions?: string
}

export interface QuizQuestionEntry {
  id: string
  question: string
  options: string[]          // Always 4 options (A, B, C, D)
  correctAnswer: number      // Index of correct option (0-3)
  explanation: string        // Why the correct answer is right
  wrongExplanations: string[] // Brief explanation for each wrong option
  hint?: string              // Optional hint for the question
  difficulty: 'easy' | 'medium' | 'hard'
  topic?: string
}

export interface QuizSet {
  id: string
  title: string
  questions: QuizQuestionEntry[]
  options: QuizOptions
  createdAt: Date
  documentId?: string
  conversationId?: string
  metadata: {
    totalQuestions: number
    avgDifficulty: string
    generationTime: number
    model: string
    sourceContentLength: number
    isGenerating?: boolean
    generationProgress?: number
    statusMessage?: string
  }
}

export interface QuizProgress {
  currentIndex: number
  totalQuestions: number
  answeredQuestions: number
  correctAnswers: number
  isComplete: boolean
}

export interface QuizAnswer {
  questionId: string
  selectedOption: number     // Index of selected option (0-3)
  isCorrect: boolean
  timeSpent: number          // ms spent on this question
}

export interface QuizSession {
  quizSetId: string
  progress: QuizProgress
  answers: QuizAnswer[]
  startedAt: Date
  completedAt?: Date
  score?: number             // Percentage 0-100
}

// Constants for quiz generation
export const QUIZ_COUNTS = {
  fewer: { min: 5, max: 8, label: 'Fewer', description: 'Quick quiz on key concepts' },
  standard: { min: 10, max: 15, label: 'Standard', description: 'Balanced coverage of main topics' },
  more: { min: 20, max: 30, label: 'More', description: 'Comprehensive topic coverage' },
  custom: { min: 1, max: 50, label: 'Custom', description: 'Choose your own number' }
} as const

export const QUIZ_DIFFICULTIES = {
  easy: {
    description: 'Basic recall and definitions',
    promptModifier: 'Focus on fundamental terms, basic recall, and straightforward facts'
  },
  medium: {
    description: 'Application and analysis',
    promptModifier: 'Include analytical thinking, application of concepts, and moderate complexity'
  },
  hard: {
    description: 'Critical thinking and synthesis',
    promptModifier: 'Emphasize critical thinking, synthesis across topics, and nuanced understanding'
  }
} as const
