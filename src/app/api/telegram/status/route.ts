import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: connection } = await supabase
      .from('telegram_connections')
      .select('telegram_username, is_active, linked_at')
      .eq('user_id', user.id)
      .single()

    if (!connection || !connection.is_active) {
      return NextResponse.json({ connected: false })
    }

    return NextResponse.json({
      connected: true,
      username: connection.telegram_username,
      linkedAt: connection.linked_at,
    })
  } catch (error) {
    console.error('[Telegram] Status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
