// ============================================
// ActiveRecall — Types & Interfaces
// ============================================

// Multi-Layer Recall Model
export enum RecallLayer {
  ABSORB = 1,     // First exposure — never reviewed yet
  RECOGNIZE = 2,  // Flashcard mode: see question, flip to reveal answer
  RETRIEVE = 3,   // Quiz mode: answer without seeing the answer
  MASTERED = 4,   // Spaced repetition at SM-2 intervals
}

export const RECALL_LAYER_LABELS: Record<RecallLayer, string> = {
  [RecallLayer.ABSORB]: 'New',
  [RecallLayer.RECOGNIZE]: 'Learning',
  [RecallLayer.RETRIEVE]: 'Reviewing',
  [RecallLayer.MASTERED]: 'Mastered',
}

export const RECALL_LAYER_COLORS: Record<RecallLayer, string> = {
  [RecallLayer.ABSORB]: 'gray',
  [RecallLayer.RECOGNIZE]: 'yellow',
  [RecallLayer.RETRIEVE]: 'blue',
  [RecallLayer.MASTERED]: 'green',
}

// SM-2 Rating Scale
export type SM2Rating = 0 | 1 | 2 | 3 | 4 | 5

export const RATING_LABELS: Record<number, string> = {
  0: 'Again',
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
  5: 'Easy',
}

// For UI — simplified 4-button rating
export interface RatingOption {
  label: string
  quality: SM2Rating
  color: string
  previewInterval: string // e.g. "1d", "4d"
}

// ============================================
// Database Models
// ============================================

export interface ReviewCard {
  id: string
  user_id: string
  source_type: 'flashcard' | 'quiz'
  source_id: string
  source_set_id: string
  document_id: string | null
  question: string
  answer: string
  options: string[] | null        // Quiz options, null for flashcards
  correct_answer: number | null   // Quiz correct index
  topic: string | null
  difficulty: 'easy' | 'medium' | 'hard' | null

  // SM-2 state
  ease_factor: number
  interval_days: number
  repetitions: number
  next_review_at: string          // ISO timestamp
  last_reviewed_at: string | null

  // Multi-layer state
  recall_layer: RecallLayer

  // AI adjustments
  ai_interval_multiplier: number
  ai_notes: string | null

  // Stats
  total_reviews: number
  correct_reviews: number
  consecutive_correct: number
  average_response_time_ms: number | null
  lapse_count: number

  created_at: string
  updated_at: string
}

export interface ReviewSession {
  id: string
  user_id: string
  started_at: string
  completed_at: string | null
  cards_reviewed: number
  cards_correct: number
  cards_incorrect: number
  results: ReviewSessionResult[]
  total_time_ms: number | null
  document_id: string | null
  created_at: string
}

export interface ReviewSessionResult {
  card_id: string
  rating: SM2Rating
  response_time_ms: number
  previous_layer: RecallLayer
  new_layer: RecallLayer
}

export interface NotificationPreferences {
  id: string
  user_id: string
  push_enabled: boolean
  push_subscription: PushSubscriptionJSON | null
  telegram_enabled: boolean
  quiet_hours_start: string      // "HH:MM"
  quiet_hours_end: string
  timezone: string
  daily_reminder_time: string
  max_notifications_per_day: number
  daily_summary_enabled: boolean
  weekly_report_enabled: boolean
  created_at: string
  updated_at: string
}

export interface TelegramConnection {
  id: string
  user_id: string
  telegram_chat_id: number
  telegram_username: string | null
  link_token: string | null
  link_token_expires_at: string | null
  is_active: boolean
  linked_at: string
}

export interface WeeklyReport {
  id: string
  user_id: string
  week_start: string
  week_end: string
  report_markdown: string
  stats: WeeklyReportStats
  sent_telegram: boolean
  sent_push: boolean
  created_at: string
}

export interface WeeklyReportStats {
  cards_reviewed: number
  accuracy: number
  streak: number
  topics_studied: string[]
  weak_areas: string[]
  strong_areas: string[]
  time_spent_minutes: number
  layer_promotions: number
  layer_demotions: number
}

export interface LearningAnalytics {
  id: string
  user_id: string
  document_id: string | null
  topic: string | null
  retention_history: RetentionDataPoint[]
  current_retention: number | null
  decay_rate: number | null
  optimal_interval_days: number | null
  ai_difficulty_assessment: 'fast-learner' | 'needs-repetition' | 'stable' | null
  last_computed_at: string
  created_at: string
  updated_at: string
}

export interface RetentionDataPoint {
  date: string
  predicted_retention: number
  actual_retention: number | null
  cards_due: number
  cards_reviewed: number
}

export interface ExamDate {
  id: string
  user_id: string
  document_id: string | null
  title: string
  exam_date: string
  reminder_days_before: number[]
  created_at: string
}

// ============================================
// API Request/Response Types
// ============================================

export interface SyncCardPayload {
  id: string
  question: string
  answer: string
  options?: string[]
  correctAnswer?: number
  topic?: string
  difficulty?: 'easy' | 'medium' | 'hard'
}

export interface SyncRequest {
  sourceType: 'flashcard' | 'quiz'
  sourceSetId: string
  documentId?: string
  cards: SyncCardPayload[]
}

export interface SyncResponse {
  synced: number
  existing: number
  total: number
}

export interface DueCardsResponse {
  cards: ReviewCard[]
  totalDue: number
  dueByLayer: Record<RecallLayer, number>
}

export interface ReviewRequest {
  cardId: string
  rating: SM2Rating
  responseTimeMs: number
  sessionId: string
}

export interface ReviewResponse {
  updatedCard: ReviewCard
  newInterval: string
  layerChange: { from: RecallLayer; to: RecallLayer } | null
}

// ============================================
// Stats & Analytics Types
// ============================================

export interface ActiveRecallStats {
  totalCards: number
  totalDue: number
  overdueCount: number
  currentStreak: number
  longestStreak: number
  reviewStreak: number
  masteryPct: number
  totalReviews: number
  averageAccuracy: number
  cardsByLayer: Record<RecallLayer, number>
  recentSessions: ReviewSession[]
}

export interface DocumentMastery {
  documentId: string
  documentTitle: string
  totalCards: number
  masteredCards: number
  learningCards: number
  newCards: number
  reviewingCards: number
  masteryPct: number
  currentRetention: number
  nextDueDate: string | null
  cardsByLayer: Record<RecallLayer, number>
}

export interface ForgettingCurveData {
  documentId: string
  documentTitle: string
  curvePoints: { day: number; retention: number }[]
  currentRetention: number
  optimalReviewDay: number | null
}

// ============================================
// Store Types
// ============================================

export interface ActiveRecallStoreState {
  _hasHydrated: boolean

  // Due cards
  dueCards: ReviewCard[]
  totalDue: number
  isLoading: boolean
  error: string | null

  // Review session
  currentSession: {
    id: string
    cards: ReviewCard[]
    currentCardIndex: number
    showAnswer: boolean
    ratings: ReviewSessionResult[]
    startedAt: Date
    cardRevealedAt: Date | null
  } | null

  // Stats cache
  stats: ActiveRecallStats | null
  masteryByDocument: DocumentMastery[]

  // AI nudge
  nudgeMessage: string | null
  nudgeLoadedAt: number | null
}

export interface ActiveRecallStoreActions {
  // Data fetching
  fetchDueCards: (documentId?: string) => Promise<void>
  fetchStats: (period?: string) => Promise<void>
  fetchNudgeMessage: () => Promise<void>

  // Review session
  startSession: (cards?: ReviewCard[]) => Promise<void>
  flipCard: () => void
  rateCard: (rating: SM2Rating) => Promise<void>
  nextCard: () => void
  endSession: () => Promise<void>

  // Sync
  syncFromFlashcards: (flashcardSetId: string, documentId?: string) => Promise<void>
  syncFromQuiz: (quizSetId: string, documentId?: string) => Promise<void>

  // Reset
  reset: () => void
}

export type ActiveRecallStore = ActiveRecallStoreState & ActiveRecallStoreActions

// ============================================
// V2 Types — Review Session, Exam Prep, Preferences
// ============================================

export interface ReviewSessionConfig {
  documentIds?: string[]
  topics?: string[]
  cardCount: number
  mode: 'flashcard' | 'quiz' | 'mixed'
  includeNew: boolean
  orderStrategy: 'optimal' | 'random' | 'newest'
}

export interface ReviewSessionState {
  id: string
  config: ReviewSessionConfig
  cards: ReviewCard[]
  currentCardIndex: number
  showAnswer: boolean
  ratings: ReviewSessionResult[]
  undoStack: ReviewUndoEntry[]
  startedAt: Date
  cardRevealedAt: Date | null
}

export interface ReviewUndoEntry {
  cardIndex: number
  previousRating: ReviewSessionResult
  previousCardState: {
    ease_factor: number
    interval_days: number
    repetitions: number
    recall_layer: RecallLayer
    next_review_at: string
    consecutive_correct: number
  }
}

export interface ExamReadiness {
  examId: string
  examTitle: string
  examDate: string
  daysUntil: number
  overallReadiness: number
  topicReadiness: Record<string, number>
  dailyTarget: number
  behindTopics: string[]
  linkedDocumentIds: string[]
  linkedTopics: string[]
}

export interface DailyGoal {
  target: number
  completed: number
  date: string
  streakDays: number
  streakFreezeAvailable: boolean
}

export interface ReviewPreferences {
  defaultCardCount: number
  defaultMode: 'flashcard' | 'quiz' | 'mixed'
  autoAdvance: boolean
  showIntervalPreviews: boolean
  cardOrder: 'optimal' | 'random' | 'newest'
  enableSwipeGestures: boolean
}

export interface StudyPlan {
  id: string
  userId: string
  examId: string
  days: StudyPlanDay[]
  totalCards: number
  estimatedHours: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface StudyPlanDay {
  date: string
  targetCards: number
  completedCards: number
  topics: string[]
  isCramMode: boolean
}

export interface AICardExplanation {
  id: string
  cardId: string
  userId: string
  explanation: string
  createdAt: string
}

export interface SessionFeedback {
  summary: string
  accuracy: number
  avgResponseTimeMs: number
  layerPromotions: number
  layerDemotions: number
  strengths: string[]
  weaknesses: string[]
  aiCoachingMessage: string
  streakUpdate: { current: number; isNew: boolean } | null
  dailyGoalProgress: { completed: number; target: number } | null
}

export interface AIChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface LearningContext {
  totalCards: number
  dueCards: number
  masteryPct: number
  currentStreak: number
  weakTopics: string[]
  strongTopics: string[]
  recentAccuracy: number
  upcomingExams: { title: string; daysUntil: number }[]
  dailyGoal: DailyGoal | null
}
