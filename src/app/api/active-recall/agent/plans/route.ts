import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: plans, error } = await supabase
      .from('agent_study_plans')
      .select('id, title, status, current_day, total_activities, completed_activities, created_at')
      .eq('user_id', user.id)
      .in('status', ['active', 'paused'])
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[AgentPlans] Error:', error)
      return NextResponse.json({ plans: [] })
    }

    return NextResponse.json({ plans: plans || [] })
  } catch (error) {
    console.error('[AgentPlans] Error:', error)
    return NextResponse.json({ plans: [] })
  }
}
