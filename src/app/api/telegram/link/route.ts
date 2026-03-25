import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Generate a random link token
    const linkToken = crypto.randomUUID().replace(/-/g, '').substring(0, 16)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    // Upsert into telegram_connections
    const { error } = await supabase
      .from('telegram_connections')
      .upsert(
        {
          user_id: user.id,
          telegram_chat_id: 0, // Will be set by webhook
          link_token: linkToken,
          link_token_expires_at: expiresAt.toISOString(),
          is_active: false,
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('[Telegram] Link token error:', error)
      return NextResponse.json({ error: 'Failed to generate link' }, { status: 500 })
    }

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'CogniLeapBot'
    const linkUrl = `https://t.me/${botUsername}?start=${linkToken}`

    return NextResponse.json({ linkUrl, linkToken, expiresAt: expiresAt.toISOString() })
  } catch (error) {
    console.error('[Telegram] Link error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
