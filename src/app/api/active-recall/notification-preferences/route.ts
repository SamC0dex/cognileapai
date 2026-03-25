import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET — Fetch user's notification preferences
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({ preferences: prefs || null })
  } catch (error) {
    console.error('[Notifications] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT — Update notification preferences
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const updates = await req.json()

    // Only allow updating specific fields
    const allowedFields = [
      'push_enabled',
      'telegram_enabled',
      'quiet_hours_start',
      'quiet_hours_end',
      'timezone',
      'daily_reminder_time',
      'max_notifications_per_day',
      'daily_summary_enabled',
      'weekly_report_enabled',
    ]

    const filteredUpdates: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (field in updates) {
        filteredUpdates[field] = updates[field]
      }
    }

    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert(
        {
          user_id: user.id,
          ...filteredUpdates,
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single()

    if (error) {
      console.error('[Notifications] PUT error:', error)
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
    }

    return NextResponse.json({ preferences: data })
  } catch (error) {
    console.error('[Notifications] PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
