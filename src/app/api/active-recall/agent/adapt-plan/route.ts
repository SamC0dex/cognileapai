import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { routedCompletion } from '@/lib/ai-router'
import { recordUsage } from '@/lib/usage-tracker'
import { buildPlanAdaptationPrompt, type PlanAdaptationContext } from '@/lib/active-recall-prompts'
import { buildActiveRecallLearningContext } from '@/lib/active-recall-learning-context'
import { getCalendarPlanDay } from '@/lib/active-recall-plan-day'

function schedulerBucketFor(type: string): 'learn' | 'practice' | 'remember' {
  if (type === 'review_due_cards') return 'remember'
  if (type === 'flashcards' || type === 'quiz') return 'practice'
  return 'learn'
}

function schedulerReasonFor(type: string) {
  if (type === 'review_due_cards') return 'Adapted to protect retention after recent work.'
  if (type === 'quiz') return 'Adapted to test weak or high-priority concepts.'
  if (type === 'flashcards') return 'Adapted to strengthen active recall.'
  if (type === 'mindmap') return 'Adapted to rebuild conceptual relationships.'
  if (type === 'summary') return 'Adapted to refresh understanding before practice.'
  if (type === 'smart_notes') return 'Adapted to organize details that need reinforcement.'
  return 'Adapted to keep the plan balanced.'
}

function expectedOutcomeFor(type: string) {
  if (type === 'review_due_cards') return 'Due review pressure reduced.'
  if (type === 'quiz') return 'Gaps exposed through scored practice.'
  if (type === 'flashcards') return 'Recall fluency improved.'
  if (type === 'mindmap') return 'Concept links clarified.'
  if (type === 'summary') return 'Topic refreshed at overview level.'
  if (type === 'smart_notes') return 'Key details condensed.'
  return 'Activity completed with useful study output.'
}

function sourceTypeForActivity(type: string) {
  if (type === 'flashcards') return 'flashcard_set'
  if (type === 'quiz') return 'quiz_set'
  if (type === 'mindmap') return 'mindmap_set'
  if (type === 'review_due_cards') return 'review_cards'
  return 'output'
}

function normalizeRequestedActivityType(request: string): string | null {
  const normalized = request.toLowerCase()
  if (normalized.includes('smart summary') || normalized.includes('summary')) return 'summary'
  if (normalized.includes('smart notes') || normalized.includes('notes')) return 'smart_notes'
  if (normalized.includes('study guide') || normalized.includes('guide')) return 'study_guide'
  if (normalized.includes('mind map') || normalized.includes('mindmap')) return 'mindmap'
  if (normalized.includes('flashcard') || normalized.includes('flash card')) return 'flashcards'
  if (normalized.includes('quiz') || normalized.includes('questions')) return 'quiz'
  if (normalized.includes('review cards') || normalized.includes('due cards')) return 'review_due_cards'
  return null
}

function requestedDayNumber(request: string): number | null {
  const match = request.toLowerCase().match(/\bday\s*(\d{1,3})\b/)
  if (!match) return null
  const day = Number(match[1])
  return Number.isFinite(day) && day > 0 ? Math.round(day) : null
}

function buildDirectActivity(params: {
  type: string
  day: number
  documentId?: string
  topic?: string
  generatedSourceId?: string | null
}) {
  const { type, day, documentId, topic, generatedSourceId } = params
  return {
    id: `adapted-direct-${day}-${Date.now()}`,
    type,
    documentId,
    topic: topic || (type === 'summary' ? 'Smart summary review' : 'Agent requested activity'),
    plannedMinutes: type === 'quiz' ? 20 : type === 'flashcards' ? 15 : 15,
    cardCount: type === 'quiz' ? 10 : type === 'flashcards' || type === 'review_due_cards' ? 15 : undefined,
    generationStatus: type === 'review_due_cards'
      ? 'not_required'
      : generatedSourceId
        ? 'ready'
        : 'not_generated',
    generatedSourceId: generatedSourceId || null,
    generatedSourceType: generatedSourceId ? sourceTypeForActivity(type) : type === 'review_due_cards' ? 'review_cards' : null,
    sourceSetId: generatedSourceId || null,
    completionStatus: 'not_started',
    completed: false,
    notes: 'Inserted from direct Study Agent request.',
    schedulerReason: schedulerReasonFor(type),
    schedulerBucket: schedulerBucketFor(type),
    schedulerWeight: type === 'review_due_cards' ? 0.95 : type === 'quiz' ? 0.85 : 0.75,
    expectedOutcome: expectedOutcomeFor(type),
    rescheduleReason: 'Direct user edit.',
  }
}

function enrichAdaptedSchedule(
  schedule: Array<{ day: number; date: string; activities: Array<Record<string, unknown>> }>,
  existingMaterialIds: Map<string, string>,
) {
  return schedule.map((day) => ({
    ...day,
    activities: (day.activities || []).map((activity, index) => {
      const type = String(activity.type || 'summary')
      const existingMaterialId = existingMaterialIds.get(type)
      const generatedSourceId = typeof activity.generatedSourceId === 'string' && activity.generatedSourceId
        ? activity.generatedSourceId
        : existingMaterialId || null
      return {
        id: typeof activity.id === 'string' ? activity.id : `adapted-${day.day}-${index + 1}`,
        ...activity,
        generationStatus: type === 'review_due_cards'
          ? 'not_required'
          : generatedSourceId
            ? 'ready'
            : (activity.generationStatus || 'not_generated'),
        generatedSourceId,
        generatedSourceType: generatedSourceId ? sourceTypeForActivity(type) : activity.generatedSourceType || null,
        sourceSetId: generatedSourceId,
        completionStatus: 'not_started',
        completed: false,
        schedulerReason: typeof activity.schedulerReason === 'string' && activity.schedulerReason.trim()
          ? activity.schedulerReason.trim()
          : schedulerReasonFor(type),
        schedulerBucket: schedulerBucketFor(type),
        schedulerWeight: typeof activity.schedulerWeight === 'number'
          ? Math.min(1, Math.max(0, activity.schedulerWeight))
          : type === 'review_due_cards' ? 0.95 : type === 'quiz' ? 0.85 : 0.7,
        expectedOutcome: typeof activity.expectedOutcome === 'string' && activity.expectedOutcome.trim()
          ? activity.expectedOutcome.trim()
          : expectedOutcomeFor(type),
        rescheduleReason: 'Adapted from current learning evidence and user request.',
      }
    }),
    isCompleted: false,
  }))
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contentType = req.headers.get('content-type') || ''
    const requestBody = contentType.includes('application/json')
      ? await req.json()
      : Object.fromEntries((await req.formData()).entries())
    const { planId, request: userRequest } = requestBody as { planId?: string; request?: string }

    if (!planId) {
      return NextResponse.json({ error: 'Missing planId' }, { status: 400 })
    }

    // Fetch the plan
    const { data: plan, error: planError } = await supabase
      .from('agent_study_plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', user.id)
      .single()

    if (planError || !plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    const learningContext = await buildActiveRecallLearningContext(supabase, user.id, { planId })

    const { data: activitySessions } = await supabase
      .from('plan_activity_sessions')
      .select('activity_type, topic, duration_ms, status, started_at')
      .eq('user_id', user.id)
      .eq('plan_id', planId)
      .order('started_at', { ascending: false })
      .limit(12)

    const topicPerformance = learningContext.topicPerformance
      .filter((topic) => topic.totalReviews >= 2)
      .map((topic) => ({
        topic: topic.topic,
        accuracy: topic.accuracy ?? 0,
        totalReviews: topic.totalReviews,
        avgResponseTimeMs: topic.avgResponseTimeMs ?? 3000,
        cardCount: topic.cardCount,
      }))

    if (topicPerformance.length === 0 && !(activitySessions || []).length && !userRequest) {
      return NextResponse.json({ message: 'Not enough topic data to adapt', adapted: false })
    }

    const overallAccuracy = learningContext.summary.accuracy ?? 0
    const weakTopics = learningContext.weakTopics.map((topic) => topic.topic)
    const strongTopics = learningContext.strongTopics.map((topic) => topic.topic)

    // Parse existing schedule
    const schedule = typeof plan.schedule === 'string' ? JSON.parse(plan.schedule) : plan.schedule
    const documentIds = Array.isArray(plan.document_ids) ? plan.document_ids : []
    const { data: outputs } = documentIds.length
      ? await supabase
        .from('outputs')
        .select('id, type')
        .in('document_id', documentIds)
      : { data: [] as Array<{ id: string; type: string }> }
    const existingMaterialIds = new Map<string, string>()
    ;(outputs || []).forEach((output) => {
      const activityType = ['study_guide', 'summary', 'notes', 'mind_map', 'flashcards', 'quiz'].includes(output.type)
        ? output.type === 'notes'
          ? 'smart_notes'
          : output.type === 'mind_map'
            ? 'mindmap'
            : output.type
        : null
      if (activityType && !existingMaterialIds.has(activityType)) {
        existingMaterialIds.set(activityType, output.id)
      }
    })

    const currentDay = getCalendarPlanDay(schedule, plan.created_at)

    const directType = userRequest ? normalizeRequestedActivityType(userRequest) : null
    const directDay = userRequest ? requestedDayNumber(userRequest) : null
    if (directType && directDay) {
      const targetDay = schedule.find((day: { day: number }) => day.day === directDay)
      if (!targetDay) {
        return NextResponse.json({ error: `Day ${directDay} was not found in this plan` }, { status: 400 })
      }
      const documentId = targetDay.activities?.find((activity: { documentId?: string }) => activity.documentId)?.documentId
        || documentIds[0]
      const existingMaterialId = existingMaterialIds.get(directType)
      targetDay.activities = [
        ...(targetDay.activities || []),
        buildDirectActivity({
          type: directType,
          day: directDay,
          documentId,
          topic: directType === 'summary' ? 'Smart summary review' : undefined,
          generatedSourceId: existingMaterialId || null,
        }),
      ]
      targetDay.isCompleted = false

      const newTotalActivities = schedule.reduce(
        (sum: number, day: { activities?: Array<unknown> }) => sum + (day.activities?.length || 0),
        0
      )

      const { error: directUpdateError } = await supabase
        .from('agent_study_plans')
        .update({
          schedule: JSON.stringify(schedule),
          total_activities: newTotalActivities,
          status: plan.status === 'completed' ? 'active' : plan.status,
          current_day: currentDay,
          updated_at: new Date().toISOString(),
        })
        .eq('id', planId)
        .eq('user_id', user.id)

      if (directUpdateError) {
        console.error('[AdaptPlan] Direct edit update error:', directUpdateError)
        return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
      }

      return NextResponse.json({
        adapted: true,
        explanation: `Added ${directType.replaceAll('_', ' ')} to day ${directDay}.`,
        changes: {
          daysAdjusted: 1,
          preservedThroughDay: currentDay,
          insertedActivity: directType,
          targetDay: directDay,
          weakTopics,
          strongTopics,
          overallAccuracy,
        },
      })
    }

    // Adapt only future days. Completed/current days are immutable in this module.
    const remainingSchedule = schedule.filter((d: { day: number }) => d.day > currentDay)

    if (remainingSchedule.length === 0) {
      return NextResponse.json({ message: 'Plan is complete, no remaining days to adapt', adapted: false })
    }

    // Build adaptation context
    const ctx: PlanAdaptationContext = {
      planTitle: plan.title,
      userRequest,
      currentDay,
      totalDays: schedule.length,
      remainingSchedule,
      topicPerformance,
      overallAccuracy,
      daysRemaining: remainingSchedule.length,
      weakTopics,
      strongTopics,
      activitySessionSummary: (activitySessions || []).map((session) => ({
        activityType: session.activity_type,
        topic: session.topic,
        durationMs: session.duration_ms,
        status: session.status,
      })),
    }

    const messages = buildPlanAdaptationPrompt(ctx)

    const { text, config, usage } = await routedCompletion(user.id, {
      messages,
      maxTokens: 3000,
      temperature: 0.5,
    })

    if (usage) {
      recordUsage({ userId: user.id, provider: config.provider, model: config.model, inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, totalTokens: usage.totalTokens, source: 'active-recall' })
    }

    // Parse adapted schedule
    let adaptedSchedule: Array<{
      day: number
      date: string
      activities: Array<{ type: string; topic: string; cardCount: number; notes: string }>
    }> = []

    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        adaptedSchedule = JSON.parse(jsonMatch[0])
      }
    } catch (parseError) {
      console.error('[AdaptPlan] JSON parse error:', parseError)
      return NextResponse.json({ error: 'Failed to parse adapted schedule' }, { status: 500 })
    }

    if (!adaptedSchedule.length) {
      return NextResponse.json({ message: 'AI returned empty schedule', adapted: false })
    }

    if (adaptedSchedule.some((day) => day.day <= currentDay)) {
      return NextResponse.json({ error: 'Adapted schedule attempted to rewrite completed days' }, { status: 500 })
    }

    // Merge: keep completed days, replace remaining with adapted
    const completedDays = schedule.filter((d: { day: number }) => d.day <= currentDay)
    const enrichedAdaptedSchedule = enrichAdaptedSchedule(adaptedSchedule, existingMaterialIds)
    const newSchedule = [...completedDays, ...enrichedAdaptedSchedule]
    const newTotalActivities = newSchedule.reduce(
      (sum: number, day: { activities: Array<unknown> }) => sum + day.activities.length, 0
    )

    // Update the plan
    const { error: updateError } = await supabase
      .from('agent_study_plans')
      .update({
        schedule: JSON.stringify(newSchedule),
        total_activities: newTotalActivities,
        current_day: currentDay,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('[AdaptPlan] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
    }

    return NextResponse.json({
      adapted: true,
      explanation: [
        userRequest ? `Adjusted future days for: ${userRequest}` : 'Adjusted future days based on recent performance.',
        weakTopics.length ? `Added more focus on weak topics: ${weakTopics.slice(0, 3).join(', ')}.` : 'No severe weak topic was detected, so the plan stays balanced.',
        strongTopics.length ? `Protected lighter maintenance for strong topics: ${strongTopics.slice(0, 3).join(', ')}.` : 'No strong topic was over-prioritized.',
        `Kept days 1-${currentDay} unchanged and rewrote ${enrichedAdaptedSchedule.length} future day${enrichedAdaptedSchedule.length === 1 ? '' : 's'} with schedule rationale.`,
      ].join(' '),
      changes: {
        daysAdjusted: enrichedAdaptedSchedule.length,
        preservedThroughDay: currentDay,
        weakTopics,
        strongTopics,
        overallAccuracy,
      },
    })
  } catch (error) {
    console.error('[AdaptPlan] Error:', error)
    return NextResponse.json({ error: 'Failed to adapt plan' }, { status: 500 })
  }
}
