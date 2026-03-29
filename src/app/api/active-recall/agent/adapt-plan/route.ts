import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { routedCompletion } from '@/lib/ai-router'
import { recordUsage } from '@/lib/usage-tracker'
import { buildPlanAdaptationPrompt, type PlanAdaptationContext } from '@/lib/active-recall-prompts'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { planId } = await req.json()

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

    // Fetch all cards linked to this plan
    const { data: cards } = await supabase
      .from('review_cards')
      .select('topic, correct_reviews, total_reviews, average_response_time_ms, recall_layer')
      .eq('user_id', user.id)
      .eq('plan_id', planId)

    if (!cards || cards.length === 0) {
      return NextResponse.json({ message: 'Not enough data to adapt', adapted: false })
    }

    // Compute per-topic performance
    const topicMap = new Map<string, {
      correct: number
      total: number
      totalResponseMs: number
      count: number
    }>()

    for (const card of cards) {
      const topic = card.topic || 'General'
      const existing = topicMap.get(topic) || { correct: 0, total: 0, totalResponseMs: 0, count: 0 }
      existing.correct += card.correct_reviews || 0
      existing.total += card.total_reviews || 0
      existing.totalResponseMs += (card.average_response_time_ms || 3000) * (card.total_reviews || 1)
      existing.count++
      topicMap.set(topic, existing)
    }

    const topicPerformance = Array.from(topicMap.entries())
      .filter(([, s]) => s.total >= 2)
      .map(([topic, s]) => ({
        topic,
        accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
        totalReviews: s.total,
        avgResponseTimeMs: s.total > 0 ? Math.round(s.totalResponseMs / s.total) : 3000,
        cardCount: s.count,
      }))

    if (topicPerformance.length === 0) {
      return NextResponse.json({ message: 'Not enough topic data to adapt', adapted: false })
    }

    // Compute overall stats
    let totalCorrect = 0
    let totalReviews = 0
    cards.forEach((c) => {
      totalCorrect += c.correct_reviews || 0
      totalReviews += c.total_reviews || 0
    })
    const overallAccuracy = totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0

    const weakTopics = topicPerformance.filter((t) => t.accuracy < 65).map((t) => t.topic)
    const strongTopics = topicPerformance.filter((t) => t.accuracy > 85).map((t) => t.topic)

    // Parse existing schedule
    const schedule = typeof plan.schedule === 'string' ? JSON.parse(plan.schedule) : plan.schedule

    // Calculate current day
    const planCreated = new Date(plan.created_at)
    planCreated.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const currentDay = Math.max(1, Math.floor((today.getTime() - planCreated.getTime()) / (1000 * 60 * 60 * 24)) + 1)

    // Get remaining schedule (future days)
    const remainingSchedule = schedule.filter((d: { day: number }) => d.day > currentDay)

    if (remainingSchedule.length === 0) {
      return NextResponse.json({ message: 'Plan is complete, no remaining days to adapt', adapted: false })
    }

    // Build adaptation context
    const ctx: PlanAdaptationContext = {
      planTitle: plan.title,
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
      changes: {
        daysAdjusted: adaptedSchedule.length,
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
