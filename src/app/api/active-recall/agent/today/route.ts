import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    const schedule = typeof plan.schedule === 'string'
      ? JSON.parse(plan.schedule)
      : plan.schedule

    // Calculate which day number we're on (Day 1 = creation day)
    const planCreatedDate = new Date(plan.created_at)
    planCreatedDate.setHours(0, 0, 0, 0)
    const todayDate = new Date()
    todayDate.setHours(0, 0, 0, 0)
    const currentDay = Math.max(1, Math.floor((todayDate.getTime() - planCreatedDate.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    const displayCurrentDay = Math.min(currentDay, schedule.length || currentDay)

    // Find today's schedule — try date match first, then day number, then index fallback
    const today = new Date().toISOString().split('T')[0]
    const todaySchedule = schedule.find((d: { date: string }) => d.date === today)
      || schedule.find((d: { day: number }) => d.day === currentDay)
      || (currentDay <= schedule.length ? schedule[currentDay - 1] : null)

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
