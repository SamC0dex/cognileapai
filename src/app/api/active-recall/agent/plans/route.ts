import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCalendarPlanDay } from '@/lib/active-recall-plan-day'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: plans, error } = await supabase
      .from('agent_study_plans')
      .select('id, title, status, current_day, total_activities, completed_activities, created_at, schedule')
      .eq('user_id', user.id)
      .in('status', ['active', 'paused'])
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[AgentPlans] Error:', error)
      return NextResponse.json({ plans: [] })
    }

    const normalizedPlans = (plans || []).map((plan) => {
      const schedule = typeof plan.schedule === 'string'
        ? JSON.parse(plan.schedule)
        : Array.isArray(plan.schedule)
          ? plan.schedule
          : []

      return {
        ...plan,
        current_day: getCalendarPlanDay(schedule, plan.created_at),
        schedule: undefined,
      }
    })

    return NextResponse.json({ plans: normalizedPlans })
  } catch (error) {
    console.error('[AgentPlans] Error:', error)
    return NextResponse.json({ plans: [] })
  }
}
