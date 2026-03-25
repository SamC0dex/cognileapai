import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { subscription } = await req.json()

    if (!subscription) {
      return NextResponse.json({ error: 'Missing subscription' }, { status: 400 })
    }

    // Upsert notification preferences with push subscription
    const { error } = await supabase
      .from('notification_preferences')
      .upsert(
        {
          user_id: user.id,
          push_enabled: true,
          push_subscription: subscription,
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('[Push] Subscribe error:', error)
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Push] Subscribe error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
