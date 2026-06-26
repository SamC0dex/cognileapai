import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { routedCompletion } from '@/lib/ai-router'
import { recordUsage } from '@/lib/usage-tracker'
import { buildPlanAdaptationPrompt, type PlanAdaptationContext } from '@/lib/active-recall-prompts'
import { buildActiveRecallLearningContext } from '@/lib/active-recall-learning-context'

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

    if (learningContext.summary.totalCards === 0) {
      return NextResponse.json({ message: 'Not enough data to adapt', adapted: false })
    }

    const topicPerformance = learningContext.topicPerformance
      .filter((topic) => topic.totalReviews >= 2)
      .map((topic) => ({
        topic: topic.topic,
        accuracy: topic.accuracy ?? 0,
        totalReviews: topic.totalReviews,
        avgResponseTimeMs: topic.avgResponseTimeMs ?? 3000,
        cardCount: topic.cardCount,
      }))

    if (topicPerformance.length === 0) {
      return NextResponse.json({ message: 'Not enough topic data to adapt', adapted: false })
    }

    const overallAccuracy = learningContext.summary.accuracy ?? 0
    const weakTopics = learningContext.weakTopics.map((topic) => topic.topic)
    const strongTopics = learningContext.strongTopics.map((topic) => topic.topic)

    // Parse existing schedule
    const schedule = typeof plan.schedule === 'string' ? JSON.parse(plan.schedule) : plan.schedule

    // Calculate current day
    const planCreated = new Date(plan.created_at)
    planCreated.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const computedCurrentDay = Math.max(1, Math.floor((today.getTime() - planCreated.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    const storedCurrentDay = typeof plan.current_day === 'number' && plan.current_day > 0
      ? plan.current_day
      : null
    const currentDay = Math.min(schedule.length, storedCurrentDay || computedCurrentDay)

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
    const newSchedule = [...completedDays, ...adaptedSchedule]
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
        `Kept days 1-${currentDay} unchanged and rewrote ${adaptedSchedule.length} future day${adaptedSchedule.length === 1 ? '' : 's'}.`,
      ].join(' '),
      changes: {
        daysAdjusted: adaptedSchedule.length,
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
