import type { SyncRequest, SyncCardPayload } from '@/types/active-recall'
import type { FlashcardSet } from '@/types/flashcards'
import type { QuizSet } from '@/types/quiz'

/**
 * Build a sync request payload from a FlashcardSet.
 */
export function buildFlashcardSyncPayload(set: FlashcardSet): SyncRequest {
  const cards: SyncCardPayload[] = set.cards.map((card) => ({
    id: card.id,
    question: card.question,
    answer: card.answer,
    topic: card.topic,
    difficulty: card.difficulty,
  }))

  return {
    sourceType: 'flashcard',
    sourceSetId: set.id,
    documentId: set.documentId,
    cards,
  }
}

/**
 * Build a sync request payload from a QuizSet.
 * Maps: question → front, correct answer + explanation → back
 */
export function buildQuizSyncPayload(set: QuizSet): SyncRequest {
  const cards: SyncCardPayload[] = set.questions.map((q) => ({
    id: q.id,
    question: q.question,
    answer: `${q.options[q.correctAnswer]}${q.explanation ? `\n\n${q.explanation}` : ''}`,
    options: q.options,
    correctAnswer: q.correctAnswer,
    topic: q.topic,
    difficulty: q.difficulty,
  }))

  return {
    sourceType: 'quiz',
    sourceSetId: set.id,
    documentId: set.documentId,
    cards,
  }
}

/**
 * Fire-and-forget sync to ActiveRecall API.
 * Called from flashcard-store and quiz-store after generation.
 */
export async function syncToActiveRecall(payload: SyncRequest): Promise<void> {
  try {
    const response = await fetch('/api/active-recall/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.warn('[ActiveRecall] Sync failed:', response.status, await response.text())
    } else {
      const result = await response.json()
      console.log('[ActiveRecall] Synced:', result)
    }
  } catch (error) {
    console.warn('[ActiveRecall] Sync error (non-blocking):', error)
  }
}
