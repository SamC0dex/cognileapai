import type { PlanActivity, PlanScheduleDay, PlanActivityType } from '@/types/active-recall'

type DocumentDisplayContext = {
  id?: string
  title?: string
  sectionTitles?: string[]
}

function isGenericTopic(topic: string) {
  const normalized = topic.trim().toLowerCase()
  return !normalized
    || normalized === 'full document'
    || normalized === 'entire document'
    || normalized === 'whole document'
    || normalized === 'general'
    || normalized === 'mixed review'
}

function contextFromOnboarding(onboardingContext: unknown): DocumentDisplayContext[] {
  if (!onboardingContext || typeof onboardingContext !== 'object') return []
  const context = onboardingContext as { documentContext?: unknown }
  if (!Array.isArray(context.documentContext)) return []
  return context.documentContext
    .filter((entry): entry is DocumentDisplayContext => !!entry && typeof entry === 'object')
}

function displayTopicForActivity(
  activity: PlanActivity,
  documentContext: DocumentDisplayContext[],
  fallbackIndex: number,
) {
  const doc = documentContext.find((entry) => entry.id && entry.id === activity.documentId)
    || documentContext[fallbackIndex % Math.max(1, documentContext.length)]
  const sections = Array.isArray(doc?.sectionTitles) ? doc.sectionTitles.filter(Boolean) : []
  const sectionCandidate = sections[fallbackIndex % Math.max(1, sections.length)]
  const section = sectionCandidate && !isGenericTopic(sectionCandidate) ? sectionCandidate : undefined
  const base = section || doc?.title || 'Core concepts'
  const type = activity.type as PlanActivityType

  if (type === 'flashcards' || activity.type === 'flashcard_review') return `${base} recall prompts`
  if (type === 'quiz' || activity.type === 'quiz_session') return `${base} practice questions`
  if (type === 'review_due_cards') return `${base} due review`
  if (type === 'mindmap' || activity.type === 'mindmap_review') return `${base} concept map`
  if (type === 'summary') return `${base} overview`
  if (type === 'smart_notes') return `${base} notes`
  return `${base} study guide`
}

export function normalizePlanDisplaySchedule(
  schedule: PlanScheduleDay[],
  onboardingContext: unknown,
  cardCountsBySourceSet: Record<string, number> = {},
) {
  const documentContext = contextFromOnboarding(onboardingContext)

  return schedule.map((day, dayIndex) => ({
    ...day,
    activities: (day.activities || []).map((activity, activityIndex) => {
      const sourceSetId = activity.generatedSourceId || activity.sourceSetId || ''
      const actualCardCount = sourceSetId ? cardCountsBySourceSet[sourceSetId] : undefined
      const countPatch = typeof actualCardCount === 'number' && actualCardCount > 0
        ? { cardCount: actualCardCount, reviewedCount: activity.reviewedCount && activity.reviewedCount > actualCardCount ? actualCardCount : activity.reviewedCount }
        : {}
      const copyPatch = activity.type === 'review_due_cards'
        ? {
            topic: isGenericTopic(activity.topic || '') || /due/i.test(activity.topic || '')
              ? 'Plan review sweep'
              : activity.topic,
            notes: (activity.notes || '').replace(/\bdue cards\b/gi, 'priority review cards').replace(/\bdue\b/gi, 'scheduled'),
            expectedOutcome: (activity.expectedOutcome || '').replace(/\bZero due cards remaining\b/gi, 'Priority review completed'),
          }
        : {}

      if (!documentContext.length || !isGenericTopic(activity.topic || '')) {
        return { ...activity, ...countPatch, ...copyPatch }
      }
      return {
        ...activity,
        ...countPatch,
        ...copyPatch,
        topic: displayTopicForActivity(activity, documentContext, dayIndex + activityIndex),
      }
    }),
  }))
}
