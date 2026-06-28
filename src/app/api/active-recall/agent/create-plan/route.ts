import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { routedCompletion } from '@/lib/ai-router'
import { recordUsage } from '@/lib/usage-tracker'
import { buildMindMapSyncPayload } from '@/lib/active-recall-mindmap-sync'
import type { ChatMessage } from '@/lib/ai-providers'
import type { MindMapData } from '@/types/mindmap'
import type { PlanActivity, PlanActivityType, PlanScheduleDay } from '@/types/active-recall'

type PlanGoal = 'exam_prep' | 'understanding' | 'review' | 'custom'
type PriorKnowledge = 'new' | 'some_exposure' | 'refreshing'
type CurrentUnderstanding = 'new' | 'some_exposure' | 'comfortable' | 'advanced'
type PreferredIntensity = 'light' | 'standard' | 'intensive'

type DocumentContext = {
  id: string
  title: string
  pageCount: number
  bytes: number
  chunkCount: number
  actualTokens: number | null
  processingStatus: string
  fileType: string
  inferredDifficulty: 'easy' | 'medium' | 'hard'
  sizeLabel: 'short' | 'medium' | 'long'
  sectionTitles: string[]
}

const ACTIVITY_TYPES: PlanActivityType[] = [
  'study_guide',
  'summary',
  'smart_notes',
  'mindmap',
  'flashcards',
  'quiz',
  'review_due_cards',
]

const ACTIVITY_DEFAULT_MINUTES: Record<PlanActivityType, number> = {
  study_guide: 25,
  summary: 15,
  smart_notes: 20,
  mindmap: 20,
  flashcards: 15,
  quiz: 20,
  review_due_cards: 15,
}

function normalizeGoal(goal: unknown): PlanGoal {
  return ['exam_prep', 'understanding', 'review', 'custom'].includes(String(goal))
    ? goal as PlanGoal
    : 'understanding'
}

function normalizePriorKnowledge(value: unknown): PriorKnowledge {
  const normalized = String(value || '').trim()
  if (normalized === 'new') return 'new'
  if (normalized === 'refreshing' || normalized === 'comfortable' || normalized === 'advanced') return 'refreshing'
  return 'some_exposure'
}

function normalizeCurrentUnderstanding(value: unknown, fallback: PriorKnowledge): CurrentUnderstanding {
  const normalized = String(value || '').trim()
  if (['new', 'some_exposure', 'comfortable', 'advanced'].includes(normalized)) {
    return normalized as CurrentUnderstanding
  }
  if (fallback === 'new') return 'new'
  if (fallback === 'refreshing') return 'comfortable'
  return 'some_exposure'
}

function normalizeIntensity(value: unknown): PreferredIntensity {
  return ['light', 'standard', 'intensive'].includes(String(value))
    ? value as PreferredIntensity
    : 'standard'
}

function normalizeDailyMinutes(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.min(240, Math.max(10, Math.round(value)))
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.match(/\d+/)?.[0])
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.min(240, Math.max(10, Math.round(parsed)))
      }
    }
  }
  return 45
}

function inferDocumentSize(pageCount: number, tokens: number | null, bytes: number): 'short' | 'medium' | 'long' {
  if (pageCount >= 80 || (tokens ?? 0) >= 60000 || bytes >= 8_000_000) return 'long'
  if (pageCount >= 25 || (tokens ?? 0) >= 18000 || bytes >= 2_000_000) return 'medium'
  return 'short'
}

function inferDocumentDifficulty(doc: {
  page_count?: number | null
  actual_tokens?: number | null
  bytes?: number | null
  chunk_count?: number | null
}): 'easy' | 'medium' | 'hard' {
  const pageCount = doc.page_count || 0
  const tokens = doc.actual_tokens || 0
  const chunkCount = doc.chunk_count || 0
  const bytes = doc.bytes || 0
  let score = 0

  if (pageCount > 50) score += 2
  else if (pageCount > 20) score += 1

  if (tokens > 50000) score += 2
  else if (tokens > 15000) score += 1

  if (chunkCount > 80) score += 2
  else if (chunkCount > 30) score += 1

  if (bytes > 6_000_000) score += 1

  if (score >= 4) return 'hard'
  if (score >= 2) return 'medium'
  return 'easy'
}

function normalizeActivityType(type: unknown): PlanActivityType {
  const normalized = String(type || '').trim().replaceAll('-', '_')
  if (normalized === 'flashcard_review') return 'flashcards'
  if (normalized === 'quiz_session') return 'quiz'
  if (normalized === 'mindmap_review' || normalized === 'mind_map') return 'mindmap'
  if (normalized === 'smart_summary') return 'summary'
  if ((ACTIVITY_TYPES as string[]).includes(normalized)) return normalized as PlanActivityType
  return 'review_due_cards'
}

function normalizeSchedulerBucket(value: unknown, type: PlanActivityType): 'learn' | 'practice' | 'remember' {
  if (value === 'learn' || value === 'practice' || value === 'remember') return value
  if (type === 'review_due_cards') return 'remember'
  if (type === 'flashcards' || type === 'quiz') return 'practice'
  return 'learn'
}

function defaultSchedulerReason(type: PlanActivityType): string {
  if (type === 'review_due_cards') return 'Protect retention with spaced review pressure.'
  if (type === 'flashcards') return 'Convert material into active recall prompts.'
  if (type === 'quiz') return 'Check retrieval and application after learning.'
  if (type === 'mindmap') return 'Build relationships between concepts before recall.'
  if (type === 'smart_notes') return 'Organize dense material into reviewable structure.'
  if (type === 'summary') return 'Create a first-pass mental model before practice.'
  return 'Study the core explanation for this topic.'
}

function defaultExpectedOutcome(type: PlanActivityType): string {
  if (type === 'review_due_cards') return 'Due review cleared or reduced.'
  if (type === 'flashcards') return 'Recall prompts generated and practiced.'
  if (type === 'quiz') return 'Knowledge gaps exposed with scored practice.'
  if (type === 'mindmap') return 'Concept relationships reviewed visually.'
  if (type === 'smart_notes') return 'Key details condensed into notes.'
  if (type === 'summary') return 'Topic understood at overview level.'
  return 'Topic studied with usable reference material.'
}

function defaultSchedulerWeight(type: PlanActivityType): number {
  if (type === 'review_due_cards') return 0.95
  if (type === 'quiz') return 0.85
  if (type === 'flashcards') return 0.8
  if (type === 'mindmap') return 0.65
  return 0.6
}

function normalizeActivity(
  activity: Record<string, unknown>,
  documentIds: string[],
  index: number
): PlanActivity {
  const type = normalizeActivityType(activity.type)
  const generatedSourceId = typeof activity.generatedSourceId === 'string'
    ? activity.generatedSourceId
    : typeof activity.sourceSetId === 'string'
      ? activity.sourceSetId
      : null
  const completed = Boolean(activity.completed) || activity.completionStatus === 'completed'
  const cardCount = typeof activity.cardCount === 'number'
    ? activity.cardCount
    : type === 'review_due_cards'
      ? 20
      : undefined

  return {
    id: typeof activity.id === 'string' ? activity.id : `activity-${index + 1}`,
    type,
    documentId: typeof activity.documentId === 'string' ? activity.documentId : documentIds[0],
    topic: typeof activity.topic === 'string' && activity.topic.trim() ? activity.topic.trim() : 'Mixed review',
    plannedMinutes: typeof activity.plannedMinutes === 'number'
      ? Math.max(5, Math.round(activity.plannedMinutes))
      : ACTIVITY_DEFAULT_MINUTES[type],
    generationStatus: type === 'review_due_cards'
      ? 'not_required'
      : generatedSourceId
        ? 'ready'
        : 'not_generated',
    generatedSourceId,
    generatedSourceType: type === 'flashcards'
      ? 'flashcard_set'
      : type === 'quiz'
        ? 'quiz_set'
        : type === 'mindmap'
          ? 'mindmap_set'
          : type === 'review_due_cards'
            ? 'review_cards'
            : 'output',
    completionStatus: completed ? 'completed' : 'not_started',
    notes: typeof activity.notes === 'string' ? activity.notes : '',
    sourceSetId: typeof activity.sourceSetId === 'string' ? activity.sourceSetId : generatedSourceId,
    cardCount,
    startedAt: typeof activity.startedAt === 'string' ? activity.startedAt : null,
    completedAt: typeof activity.completedAt === 'string' ? activity.completedAt : null,
    totalTimeMs: typeof activity.totalTimeMs === 'number' ? activity.totalTimeMs : undefined,
    lastSessionId: typeof activity.lastSessionId === 'string' ? activity.lastSessionId : null,
    schedulerReason: typeof activity.schedulerReason === 'string' && activity.schedulerReason.trim()
      ? activity.schedulerReason.trim()
      : defaultSchedulerReason(type),
    schedulerWeight: typeof activity.schedulerWeight === 'number' && Number.isFinite(activity.schedulerWeight)
      ? Math.min(1, Math.max(0, activity.schedulerWeight))
      : defaultSchedulerWeight(type),
    schedulerBucket: normalizeSchedulerBucket(activity.schedulerBucket, type),
    expectedOutcome: typeof activity.expectedOutcome === 'string' && activity.expectedOutcome.trim()
      ? activity.expectedOutcome.trim()
      : defaultExpectedOutcome(type),
    actualOutcome: typeof activity.actualOutcome === 'string' ? activity.actualOutcome : undefined,
    rescheduleReason: typeof activity.rescheduleReason === 'string' ? activity.rescheduleReason : undefined,
    completed,
  }
}

function normalizeSchedule(
  schedule: Array<{ day: number; date: string; activities: Array<Record<string, unknown>> }>,
  dates: string[],
  documentIds: string[]
): PlanScheduleDay[] {
  return schedule.map((day, dayIndex) => {
    const activities = Array.isArray(day.activities) ? day.activities : []
    const normalizedActivities = activities.map((activity, activityIndex) =>
      normalizeActivity(activity, documentIds, dayIndex * 10 + activityIndex)
    )

    return {
      day: dayIndex + 1,
      date: dates[dayIndex] || day.date,
      activities: normalizedActivities,
      isCompleted: normalizedActivities.length > 0 && normalizedActivities.every((activity) => activity.completed),
    }
  })
}

function buildPlannedActivity(
  type: PlanActivityType,
  documentId: string,
  topic: string,
  plannedMinutes: number,
  notes: string,
  cardCount?: number
): PlanActivity {
  return normalizeActivity({
    type,
    documentId,
    topic,
    plannedMinutes,
    cardCount,
    notes,
    generationStatus: type === 'review_due_cards' ? 'not_required' : 'not_generated',
    generatedSourceId: null,
    completionStatus: 'not_started',
  }, [documentId], Date.now())
}

function activity(
  type: PlanActivityType,
  documentId: string,
  topic: string,
  plannedMinutes: number,
  notes: string,
  cardCount?: number
) {
  return {
    type,
    documentId,
    topic,
    plannedMinutes,
    cardCount,
    generationStatus: type === 'review_due_cards' ? 'not_required' : 'not_generated',
    generatedSourceId: null,
    completionStatus: 'not_started',
    notes,
    schedulerReason: defaultSchedulerReason(type),
    schedulerWeight: defaultSchedulerWeight(type),
    schedulerBucket: normalizeSchedulerBucket(undefined, type),
    expectedOutcome: defaultExpectedOutcome(type),
  }
}

function fallbackTopics(
  documentContext: DocumentContext[],
  weakTopics: string[],
  strongTopics: string[]
): string[] {
  const sectionTopics = documentContext.flatMap((doc) => doc.sectionTitles || [])
  const documentTitles = documentContext.map((doc) => doc.title).filter(Boolean)
  const rawTopics = [
    ...weakTopics,
    ...sectionTopics,
    ...strongTopics,
    ...documentTitles,
    'Core concepts',
    'High-priority exam topics',
    'Weak areas',
    'Mixed review',
  ]

  const seen = new Set<string>()
  return rawTopics
    .map((topic) => topic.trim())
    .filter((topic) => {
      if (!topic || seen.has(topic.toLowerCase())) return false
      seen.add(topic.toLowerCase())
      return true
    })
}

function buildFallbackSchedule(params: {
  dates: string[]
  documentContext: DocumentContext[]
  weakTopics: string[]
  strongTopics: string[]
  dailyMinutes: number
  priorKnowledge: PriorKnowledge
  currentUnderstanding: CurrentUnderstanding
  totalCards: number
}): Array<{ day: number; date: string; activities: Array<Record<string, unknown>> }> {
  const {
    dates,
    documentContext,
    weakTopics,
    strongTopics,
    dailyMinutes,
    priorKnowledge,
    currentUnderstanding,
    totalCards,
  } = params
  const documentId = documentContext[0]?.id
  if (!documentId) return []

  const topics = fallbackTopics(documentContext, weakTopics, strongTopics)
  const isNewLearner = priorKnowledge === 'new' || currentUnderstanding === 'new'
  const availableMinutes = Math.max(20, dailyMinutes)

  return dates.map((date, index) => {
    const dayNumber = index + 1
    const primaryTopic = topics[index % topics.length]
    const secondaryTopic = topics[(index + 1) % topics.length]
    const finalDay = index === dates.length - 1
    const earlyDay = index < Math.min(2, dates.length)
    const activities: Array<Record<string, unknown>> = []

    if (isNewLearner && earlyDay) {
      activities.push(
        activity(index === 0 ? 'summary' : 'smart_notes', documentId, primaryTopic, Math.min(15, availableMinutes), index === 0
          ? 'Build a clear first-pass understanding before testing.'
          : 'Turn the topic into organized notes and examples.')
      )
      activities.push(
        activity('mindmap', documentId, secondaryTopic, Math.min(15, availableMinutes), 'Map relationships so the topic is easier to recall.')
      )
    } else if (finalDay) {
      if (totalCards > 0) {
        activities.push(activity('review_due_cards', documentId, 'Final due-card sweep', 10, 'Review due cards before the final check.', 20))
      }
      activities.push(activity('quiz', documentId, primaryTopic, 15, 'Use exam-style questions to expose remaining gaps.', 10))
      activities.push(activity('flashcards', documentId, secondaryTopic, 10, 'Finish with active recall on weak facts.', 12))
    } else {
      const pattern = index % 3
      if (pattern === 0) {
        activities.push(activity('study_guide', documentId, primaryTopic, 15, 'Study the highest-yield explanation for this topic.'))
        activities.push(activity('flashcards', documentId, primaryTopic, 15, 'Convert the topic into recall prompts.', 15))
      } else if (pattern === 1) {
        activities.push(activity('smart_notes', documentId, primaryTopic, 12, 'Condense details into memory-friendly notes.'))
        activities.push(activity('quiz', documentId, primaryTopic, 15, 'Check whether the concept can be applied.', 8))
      } else {
        activities.push(activity('mindmap', documentId, primaryTopic, 12, 'Review relationships and dependencies visually.'))
        activities.push(activity('flashcards', documentId, secondaryTopic, 12, 'Reinforce related definitions and steps.', 12))
      }
    }

    if (totalCards > 0 && dayNumber > 1 && dayNumber % 2 === 0 && activities.length < 3) {
      activities.push(activity('review_due_cards', documentId, 'Due review', 8, 'Protect retention with spaced review.', 15))
    }

    return {
      day: dayNumber,
      date,
      activities,
    }
  })
}

function alignScheduleWithOnboarding(
  schedule: PlanScheduleDay[],
  context: {
    documentIds: string[]
    goal: PlanGoal
    priorKnowledge: PriorKnowledge
    currentUnderstanding: CurrentUnderstanding
    totalCards: number
  }
): PlanScheduleDay[] {
  if (!schedule.length || !context.documentIds.length) return schedule

  const firstDocumentId = context.documentIds[0]
  const learnTypes = new Set<PlanActivityType>(['study_guide', 'summary', 'smart_notes', 'mindmap'])
  const practiceTypes = new Set<PlanActivityType>(['flashcards', 'quiz'])
  const shouldStartWithLearning = context.priorKnowledge === 'new' || context.currentUnderstanding === 'new'
  const shouldPrioritizeRetention = context.goal === 'review' || ['comfortable', 'advanced'].includes(context.currentUnderstanding)

  return schedule.map((day, index) => {
    if (index > 0) return day

    let activities = [...day.activities]

    if (shouldStartWithLearning) {
      const hasLearn = activities.some((activity) => learnTypes.has(activity.type as PlanActivityType))
      if (!hasLearn) {
        activities = [
          buildPlannedActivity('summary', firstDocumentId, 'Core concepts', 15, 'Start with an overview before practice.'),
          ...activities,
        ]
      }

      activities = activities.sort((a, b) => {
        const aLearn = learnTypes.has(a.type as PlanActivityType) ? 0 : 1
        const bLearn = learnTypes.has(b.type as PlanActivityType) ? 0 : 1
        return aLearn - bLearn
      })
    }

    if (shouldPrioritizeRetention) {
      const hasReview = activities.some((activity) => activity.type === 'review_due_cards')
      const hasPractice = activities.some((activity) => practiceTypes.has(activity.type as PlanActivityType))

      if (context.totalCards > 0 && !hasReview) {
        activities = [
          buildPlannedActivity('review_due_cards', firstDocumentId, 'Due review', 15, 'Start with due cards to protect retention.', 20),
          ...activities,
        ]
      }
      if (!hasPractice) {
        activities = [
          ...activities,
          buildPlannedActivity('flashcards', firstDocumentId, 'Mixed review', 15, 'Reinforce key facts with active recall.', 15),
        ]
      }
    }

    return {
      ...day,
      activities,
      isCompleted: activities.length > 0 && activities.every((activity) => activity.completed),
    }
  })
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const {
      title,
      documentIds,
      goal,
      timeline,
      deadline,
      examDate,
      durationDays,
      priorKnowledge,
      currentUnderstanding,
      dailyAvailableMinutes,
      dailyStudyMinutes,
      availableMinutes,
      preferredIntensity,
      intensity,
      examId,
      notes,
    } = body

    if (!title || !documentIds?.length) {
      return NextResponse.json({ error: 'Missing title or documentIds' }, { status: 400 })
    }

    const normalizedGoal = normalizeGoal(goal)
    const normalizedTimeline = timeline || deadline || examDate || undefined
    const normalizedPriorKnowledge = normalizePriorKnowledge(priorKnowledge ?? currentUnderstanding)
    const normalizedCurrentUnderstanding = normalizeCurrentUnderstanding(currentUnderstanding, normalizedPriorKnowledge)
    const normalizedIntensity = normalizeIntensity(preferredIntensity ?? intensity)
    const normalizedDailyMinutes = normalizeDailyMinutes(dailyAvailableMinutes, dailyStudyMinutes, availableMinutes)

    // Fetch document metadata for size and difficulty-aware planning.
    const { data: docs } = await supabase
      .from('documents')
      .select('id, title, page_count, bytes, chunk_count, actual_tokens, processing_status, file_type')
      .in('id', documentIds)
      .eq('user_id', user.id)

    if (!docs?.length) {
      return NextResponse.json({ error: 'No matching documents found' }, { status: 404 })
    }

    const { data: sections } = await supabase
      .from('sections')
      .select('document_id, title, ord')
      .in('document_id', documentIds)
      .order('ord', { ascending: true })

    const sectionTitlesByDocument = new Map<string, string[]>()
    ;(sections || []).forEach((section) => {
      const titles = sectionTitlesByDocument.get(section.document_id) || []
      if (section.title && titles.length < 8) titles.push(section.title)
      sectionTitlesByDocument.set(section.document_id, titles)
    })

    const documentContext: DocumentContext[] = docs.map((doc) => {
      const pageCount = doc.page_count || 0
      const bytes = doc.bytes || 0
      const actualTokens = doc.actual_tokens ?? null
      return {
        id: doc.id,
        title: doc.title,
        pageCount,
        bytes,
        chunkCount: doc.chunk_count || 0,
        actualTokens,
        processingStatus: doc.processing_status || 'unknown',
        fileType: doc.file_type || 'pdf',
        inferredDifficulty: inferDocumentDifficulty(doc),
        sizeLabel: inferDocumentSize(pageCount, actualTokens, bytes),
        sectionTitles: sectionTitlesByDocument.get(doc.id) || [],
      }
    })
    const planDocumentIds = documentContext.map((doc) => doc.id)

    // Auto-sync any unsynced mind maps from outputs table before counting cards
    const { data: mindMapOutputs } = await supabase
      .from('outputs')
      .select('id, payload, document_id')
      .eq('type', 'mind_map')
      .in('document_id', planDocumentIds)

    if (mindMapOutputs && mindMapOutputs.length > 0) {
      // Check which mind maps are already synced
      const { data: syncedMindmaps } = await supabase
        .from('review_cards')
        .select('source_set_id')
        .eq('user_id', user.id)
        .eq('source_type', 'mindmap')
        .in('document_id', planDocumentIds)

      const syncedSetIds = new Set((syncedMindmaps || []).map((c) => c.source_set_id))

      for (const mm of mindMapOutputs) {
        if (syncedSetIds.has(mm.id)) continue // Already synced

        try {
          const payload = typeof mm.payload === 'string' ? JSON.parse(mm.payload) : mm.payload
          const mindMapData: MindMapData | undefined = payload?.mindMapData
          if (!mindMapData?.branches) continue

          const syncPayload = buildMindMapSyncPayload(mm.id, mindMapData, mm.document_id)

          for (const card of syncPayload.cards) {
            await supabase
              .from('review_cards')
              .upsert(
                {
                  user_id: user.id,
                  source_type: 'mindmap',
                  source_id: card.id,
                  source_set_id: mm.id,
                  document_id: mm.document_id || null,
                  question: card.question,
                  answer: card.answer,
                  topic: card.topic || null,
                  difficulty: card.difficulty || null,
                },
                { onConflict: 'user_id,source_type,source_id', ignoreDuplicates: true }
              )
          }
          console.log(`[CreatePlan] Auto-synced ${syncPayload.cards.length} mind map cards from output ${mm.id}`)
        } catch (syncErr) {
          console.error(`[CreatePlan] Failed to auto-sync mind map ${mm.id}:`, syncErr)
        }
      }
    }

    // Fetch existing review cards per document (now includes auto-synced mind maps)
    const { data: existingCards } = await supabase
      .from('review_cards')
      .select('id, source_type, source_set_id, topic, recall_layer, correct_reviews, total_reviews')
      .eq('user_id', user.id)
      .in('document_id', planDocumentIds)

    const totalCards = existingCards?.length || 0

    // Compute per-topic stats
    const topicStats = new Map<string, { correct: number; total: number; count: number }>()
    ;(existingCards || []).forEach((c) => {
      const topic = c.topic || 'General'
      const existing = topicStats.get(topic) || { correct: 0, total: 0, count: 0 }
      existing.correct += c.correct_reviews || 0
      existing.total += c.total_reviews || 0
      existing.count++
      topicStats.set(topic, existing)
    })

    const weakTopics: string[] = []
    const strongTopics: string[] = []
    topicStats.forEach((s, topic) => {
      if (s.total < 2) return
      const acc = (s.correct / s.total) * 100
      if (acc < 65) weakTopics.push(topic)
      else if (acc > 85) strongTopics.push(topic)
    })

    // Count tool types
    const sourceTypes = new Map<string, Set<string>>()
    ;(existingCards || []).forEach((c) => {
      const existing = sourceTypes.get(c.source_type) || new Set()
      existing.add(c.source_set_id)
      sourceTypes.set(c.source_type, existing)
    })

    const flashcardSets = sourceTypes.get('flashcard')?.size || 0
    const quizSets = sourceTypes.get('quiz')?.size || 0
    const mindmapSets = sourceTypes.get('mindmap')?.size || 0

    // Calculate days for the plan
    let daysCount = 14
    if (durationDays && typeof durationDays === 'number' && durationDays > 0) {
      daysCount = Math.min(90, Math.max(1, Math.round(durationDays)))
    } else if (normalizedTimeline) {
      const targetDate = new Date(normalizedTimeline)
      if (!isNaN(targetDate.getTime())) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        daysCount = Math.max(1, Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
      }
    }
    console.log(`[CreatePlan] Calculated daysCount=${daysCount} from timeline=${normalizedTimeline}, durationDays=${durationDays}`)

    // Build dates for the schedule
    const today = new Date()
    const dates: string[] = []
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      dates.push(d.toISOString().split('T')[0])
    }

    const documentSummary = documentContext.map((doc) => (
      `- ${doc.title} (id: ${doc.id}): ${doc.pageCount} pages, ${doc.actualTokens ?? 'unknown'} tokens, ${doc.chunkCount} chunks, ${doc.sizeLabel}, inferred difficulty ${doc.inferredDifficulty}, status ${doc.processingStatus}${doc.sectionTitles.length ? `, sections: ${doc.sectionTitles.join('; ')}` : ''}`
    )).join('\n')

    // Build AI prompt for schedule generation. Plan creation only schedules work;
    // material generation happens later on demand.
    const systemPrompt = `You are a study planning AI that creates multi-tool learning schedules. Create a day-by-day study plan that combines learning, practice, and long-term review.

Progressive Learning Model:
- Learn: summaries, study guides, smart notes, and mind maps help the student understand the material.
- Practice: flashcards and quizzes test understanding after learning activities.
- Remember: due-card review uses SM-2; you set daily focus and time, but do not generate material upfront.

CRITICAL: You MUST generate EXACTLY ${daysCount} days in the schedule. Each day should fit the user's daily minute budget; use 1-6 activities depending on available time, difficulty, due-review pressure, and timeline urgency. Do not force the same count every day.

Output a JSON array with EXACTLY ${daysCount} day objects:
[{
  "day": 1,
  "date": "${dates[0]}",
  "activities": [
    { "type": "summary", "documentId": "${planDocumentIds[0]}", "topic": "...", "plannedMinutes": 15, "generationStatus": "not_generated", "generatedSourceId": null, "completionStatus": "not_started", "notes": "...", "schedulerReason": "why this is scheduled today", "schedulerBucket": "learn", "schedulerWeight": 0.7, "expectedOutcome": "what completion should prove" },
    { "type": "flashcards", "documentId": "${planDocumentIds[0]}", "topic": "...", "plannedMinutes": 15, "cardCount": 15, "generationStatus": "not_generated", "generatedSourceId": null, "completionStatus": "not_started", "notes": "...", "schedulerReason": "why recall practice belongs here", "schedulerBucket": "practice", "schedulerWeight": 0.8, "expectedOutcome": "what recall should improve" },
    { "type": "review_due_cards", "documentId": "${planDocumentIds[0]}", "topic": "...", "plannedMinutes": 10, "cardCount": 10, "generationStatus": "not_required", "generatedSourceId": null, "completionStatus": "not_started", "notes": "...", "schedulerReason": "why spaced review is needed", "schedulerBucket": "remember", "schedulerWeight": 0.95, "expectedOutcome": "due review cleared" }
  ]
},
... (${daysCount} total days through day ${daysCount} on ${dates[dates.length - 1]})]

Rules:
- activity type must be one of: study_guide, summary, smart_notes, mindmap, flashcards, quiz, review_due_cards
- Every activity must include: type, documentId, topic, plannedMinutes, generationStatus, generatedSourceId, completionStatus, notes, schedulerReason, schedulerBucket, schedulerWeight, expectedOutcome
- Use cardCount only for flashcards, quiz, and review_due_cards
- Do not generate material or invent generatedSourceId values during plan creation; use null unless the material already exists
- ${daysCount <= 3 ? 'CRAM MODE: increase daily cards to 50, focus on weak areas, no rest days' : daysCount <= 7 ? 'SHORT timeline: be focused and efficient, cover all topics, no rest days' : 'normal pacing, include 1 rest/light day per week if > 10 days'}
- Front-load Learn activities when prior knowledge is new; use more Remember/Practice if this is review-focused
- Keep each day's plannedMinutes total at or below ${normalizedDailyMinutes} unless the timeline is too short
- Vary daily activity count naturally: light days can have 1-2 focused activities, standard days usually 2-4, intensive/cram days can have 4-6 if the minute budget supports it
- Preferred intensity is ${normalizedIntensity}; light means fewer activities and easier pacing, intensive means more practice but still within daily time
- For new learners, schedule Learn activities before heavy quizzes; for retention/review learners, prioritize review_due_cards, flashcards, and quizzes
- Scale pacing by document size and inferred difficulty; harder or longer documents need more Learn time and smaller topic chunks
- Be specific about topics per activity — vary them across days
- Include review_due_cards periodically when review cards exist
- Return ONLY valid JSON array, no other text
- The array MUST contain exactly ${daysCount} day entries`

    const userPrompt = `Create a ${daysCount}-day study plan:
- Title: ${title}
- Goal: ${normalizedGoal}
- Deadline/exam date: ${normalizedTimeline || 'none'}
- Daily available study time: ${normalizedDailyMinutes} minutes
- Current understanding: ${normalizedCurrentUnderstanding}
- Prior knowledge: ${normalizedPriorKnowledge}
- Preferred intensity: ${normalizedIntensity}
- Duration: EXACTLY ${daysCount} days (${dates[0]} to ${dates[dates.length - 1]})
- Dates for each day: ${dates.map((d, i) => `Day ${i + 1}: ${d}`).join(', ')}
- Documents:
${documentSummary}
- Available existing generated material: ${flashcardSets} flashcard sets, ${quizSets} quiz sets, ${mindmapSets} mind map sets
- Total review cards: ${totalCards}
- Weak topics: ${weakTopics.join(', ') || 'none identified'}
- Strong topics: ${strongTopics.join(', ') || 'none identified'}

Generate the ${daysCount}-day study schedule as JSON. Remember: EXACTLY ${daysCount} day entries.`

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]

    const { text, config, usage } = await routedCompletion(user.id, {
      messages,
      maxTokens: Math.min(8192, 1000 + daysCount * 600),
      temperature: 0.5,
    })

    if (usage) {
      recordUsage({ userId: user.id, provider: config.provider, model: config.model, inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, totalTokens: usage.totalTokens, source: 'active-recall' })
    }

    // Parse schedule from AI
    let schedule: Array<{
      day: number
      date: string
      activities: Array<Record<string, unknown>>
    }> = []

    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        schedule = JSON.parse(jsonMatch[0])
      }
    } catch (parseError) {
      console.error('[CreatePlan] JSON parse error:', parseError, 'Raw text:', text.slice(0, 500))
      schedule = []
    }

    const fallbackSchedule = buildFallbackSchedule({
      dates,
      documentContext,
      weakTopics,
      strongTopics,
      dailyMinutes: normalizedDailyMinutes,
      priorKnowledge: normalizedPriorKnowledge,
      currentUnderstanding: normalizedCurrentUnderstanding,
      totalCards,
    })

    if (!Array.isArray(schedule) || schedule.length === 0) {
      console.warn('[CreatePlan] AI generated no usable schedule, using deterministic fallback schedule')
      schedule = fallbackSchedule
    }

    // Ensure schedule has correct dates and fill in missing days
    if (schedule.length < daysCount) {
      console.warn(`[CreatePlan] AI only generated ${schedule.length}/${daysCount} days, filling remaining days with fallback schedule`)

      for (let i = schedule.length; i < daysCount; i++) {
        schedule.push(fallbackSchedule[i])
      }
    }

    // Fix dates in case AI used wrong dates
    for (let i = 0; i < schedule.length; i++) {
      schedule[i].day = i + 1
      schedule[i].date = dates[i] || schedule[i].date
    }

    if (!schedule.length) {
      return NextResponse.json({ error: 'AI generated empty schedule' }, { status: 500 })
    }

    let normalizedSchedule = normalizeSchedule(schedule, dates, planDocumentIds)
    normalizedSchedule = alignScheduleWithOnboarding(normalizedSchedule, {
      documentIds: planDocumentIds,
      goal: normalizedGoal,
      priorKnowledge: normalizedPriorKnowledge,
      currentUnderstanding: normalizedCurrentUnderstanding,
      totalCards,
    })

    const onboardingContext = {
      goal: normalizedGoal,
      timeline: normalizedTimeline,
      deadline: normalizedTimeline,
      durationDays: daysCount,
      dailyAvailableMinutes: normalizedDailyMinutes,
      currentUnderstanding: normalizedCurrentUnderstanding,
      preferredIntensity: normalizedIntensity,
      priorKnowledge: normalizedPriorKnowledge,
      notes: typeof notes === 'string' ? notes : undefined,
      documentContext,
      availableMaterials: {
        flashcardSets,
        quizSets,
        mindmapSets,
        totalReviewCards: totalCards,
      },
      weakTopics,
      strongTopics,
    }

    // Calculate totals
    const totalActivities = normalizedSchedule.reduce((sum, day) => sum + day.activities.length, 0)

    // Save to agent_study_plans
    const { data: plan, error: insertError } = await supabase
      .from('agent_study_plans')
      .insert({
        user_id: user.id,
        title,
        document_ids: planDocumentIds,
        exam_id: examId || null,
        onboarding_context: onboardingContext,
        schedule: normalizedSchedule,
        status: 'active',
        current_day: 1,
        total_activities: totalActivities,
        completed_activities: 0,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[CreatePlan] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save plan' }, { status: 500 })
    }

    return NextResponse.json({
      plan: {
        id: plan.id,
        title: plan.title,
        documentIds: planDocumentIds,
        schedule: normalizedSchedule,
        totalActivities,
        status: 'active',
        onboardingContext,
        weakTopics,
        strongTopics,
      },
    })
  } catch (error) {
    console.error('[CreatePlan] Error:', error)
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
  }
}
