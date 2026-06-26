import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface PlanActivityPreview {
  type?: string
  topic?: string
  completed?: boolean
  completionStatus?: string
}

interface PlanScheduleDayPreview {
  day: number
  date?: string
  activities?: PlanActivityPreview[]
}

function isActivityComplete(activity: PlanActivityPreview): boolean {
  return !!activity.completed || activity.completionStatus === 'completed'
}

function parseTime(value: string | null | undefined, fallback: string): string {
  const candidate = value || fallback
  const match = candidate.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return fallback
  const hours = Math.min(23, Math.max(0, Number(match[1])))
  const minutes = Math.min(59, Math.max(0, Number(match[2])))
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function daysUntil(date: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${date}T00:00:00`)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date().toISOString()

    const [prefsResult, plansResult, dueResult, examsResult] = await Promise.all([
      supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('agent_study_plans')
        .select('id,title,schedule,current_day,total_activities,completed_activities,status,created_at,updated_at')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1),
      supabase
        .from('review_cards')
        .select('id,topic,plan_id,next_review_at')
        .eq('user_id', user.id)
        .lte('next_review_at', now)
        .order('next_review_at', { ascending: true })
        .limit(25),
      supabase
        .from('exam_dates')
        .select('id,title,exam_date,reminder_days_before')
        .eq('user_id', user.id)
        .gte('exam_date', new Date().toISOString().split('T')[0])
        .order('exam_date', { ascending: true })
        .limit(3),
    ])

    const prefs = prefsResult.data || null
    const plan = plansResult.data?.[0] || null
    const dailyTime = parseTime(prefs?.daily_reminder_time, '09:00')
    const timezone = prefs?.timezone || 'UTC'

    let todayActivityCount = 0
    let nextActivityTopic: string | null = null
    let planUrl = '/active-recall'

    if (plan) {
      planUrl = `/active-recall/plan/${plan.id}`
      const schedule = typeof plan.schedule === 'string'
        ? JSON.parse(plan.schedule) as PlanScheduleDayPreview[]
        : plan.schedule as PlanScheduleDayPreview[]
      const currentDay = typeof plan.current_day === 'number' && plan.current_day > 0 ? plan.current_day : 1
      const today = schedule.find((day) => day.day === currentDay) || schedule[currentDay - 1]
      const remaining = (today?.activities || []).filter((activity) => !isActivityComplete(activity))
      todayActivityCount = remaining.length
      nextActivityTopic = remaining[0]?.topic || null
    }

    const dueCards = dueResult.data || []
    const firstExam = examsResult.data?.[0] || null
    const examDays = firstExam ? daysUntil(firstExam.exam_date) : null
    const examReminderDays = Array.isArray(firstExam?.reminder_days_before)
      ? firstExam.reminder_days_before as number[]
      : [7, 3, 1]
    const examCountdownActive = typeof examDays === 'number'
      && examDays >= 0
      && examReminderDays.includes(examDays)

    return NextResponse.json({
      preferences: {
        pushEnabled: !!prefs?.push_enabled,
        hasPushSubscription: !!prefs?.push_subscription,
        dailyReminderTime: dailyTime,
        timezone,
      },
      reminders: [
        {
          id: 'daily-study',
          type: 'daily_study',
          title: plan ? `Study ${plan.title}` : 'Start today\'s study plan',
          body: todayActivityCount > 0
            ? `${todayActivityCount} planned ${todayActivityCount === 1 ? 'activity' : 'activities'} today${nextActivityTopic ? `, starting with ${nextActivityTopic}` : ''}.`
            : plan
              ? 'Today\'s planned activities are complete. Open the plan if you want to review ahead.'
              : 'Create a study plan so reminders can point to specific work.',
          scheduledTime: dailyTime,
          url: planUrl,
          enabled: true,
        },
        {
          id: 'due-cards',
          type: 'due_cards',
          title: dueCards.length > 0 ? `${dueCards.length} cards due` : 'No cards due right now',
          body: dueCards.length > 0
            ? `Review ${dueCards.length} due ${dueCards.length === 1 ? 'card' : 'cards'} before they become stale.`
            : 'The agent will remind you when review cards become due.',
          scheduledTime: dailyTime,
          url: plan ? `/active-recall/review?plan_id=${plan.id}` : '/active-recall/review',
          enabled: dueCards.length > 0,
        },
        {
          id: 'exam-countdown',
          type: 'exam_countdown',
          title: firstExam ? `${firstExam.title} in ${examDays} ${examDays === 1 ? 'day' : 'days'}` : 'No upcoming exam countdown',
          body: firstExam
            ? examCountdownActive
              ? 'Exam countdown reminder is active for today.'
              : `Countdown reminders are scheduled for ${examReminderDays.join(', ')} days before the exam.`
            : 'Add an exam date to enable countdown reminders.',
          scheduledTime: dailyTime,
          url: '/active-recall/exams',
          enabled: !!firstExam,
        },
      ],
    })
  } catch (error) {
    console.error('[ReminderPreview] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
