import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCalendarPlanDay } from '@/lib/active-recall-plan-day'
import { normalizePlanDisplaySchedule } from '@/lib/active-recall-plan-display'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const planId = searchParams.get('plan_id')

    if (!planId) {
      return NextResponse.json({ error: 'Missing plan_id' }, { status: 400 })
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

    // Parse schedule
    const rawSchedule = typeof plan.schedule === 'string'
      ? JSON.parse(plan.schedule)
      : plan.schedule
    const { data: allPlanCards } = await supabase
      .from('review_cards')
      .select('source_set_id')
      .eq('user_id', user.id)
      .eq('plan_id', planId)

    const cardCountsBySourceSet: Record<string, number> = {}
    allPlanCards?.forEach((card) => {
      if (card.source_set_id) {
        cardCountsBySourceSet[card.source_set_id] = (cardCountsBySourceSet[card.source_set_id] || 0) + 1
      }
    })

    const schedule = normalizePlanDisplaySchedule(rawSchedule, plan.onboarding_context, cardCountsBySourceSet)

    const displayCurrentDay = getCalendarPlanDay(schedule, plan.created_at)

    // Find today's schedule — try date match first, then day number, then index fallback
    const today = new Date().toISOString().split('T')[0]
    const todaySchedule = schedule.find((d: { date: string }) => d.date === today)
      || schedule.find((d: { day: number }) => d.day === displayCurrentDay)
      || (displayCurrentDay <= schedule.length ? schedule[displayCurrentDay - 1] : null)

    // Fetch due cards for this plan
    const { data: dueCards, count: totalDue } = await supabase
      .from('review_cards')
      .select('id, source_type, topic, recall_layer, next_review_at', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('plan_id', planId)
      .lte('next_review_at', new Date().toISOString())
      .order('next_review_at', { ascending: true })
      .limit(100)

    // Count by source type
    const byType: Record<string, number> = { flashcard: 0, quiz: 0, mindmap: 0 }
    ;(dueCards || []).forEach((c) => {
      byType[c.source_type] = (byType[c.source_type] || 0) + 1
    })

    return NextResponse.json({
      plan: {
        id: plan.id,
        title: plan.title,
        status: plan.status,
        currentDay: displayCurrentDay,
        totalDays: schedule.length,
        totalActivities: plan.total_activities,
        completedActivities: plan.completed_activities,
      },
      today: todaySchedule,
      dueCards: {
        total: totalDue || 0,
        byType,
      },
    })
  } catch (error) {
    console.error('[AgentToday] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
