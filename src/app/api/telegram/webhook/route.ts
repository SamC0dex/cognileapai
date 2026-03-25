import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookUpdate, sendTelegramMessage } from '@/lib/telegram-bot'
import { createClient } from '@supabase/supabase-js'

// Use admin client for webhook (no user auth context)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface TelegramMessage {
  message_id: number
  from: {
    id: number
    username?: string
    first_name: string
  }
  chat: {
    id: number
    type: string
  }
  text?: string
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

export async function POST(req: NextRequest) {
  try {
    const body: TelegramUpdate = await req.json()

    if (!verifyWebhookUpdate(body)) {
      return NextResponse.json({ error: 'Invalid update' }, { status: 400 })
    }

    const message = body.message
    if (!message?.text) {
      return NextResponse.json({ ok: true })
    }

    const chatId = message.chat.id
    const text = message.text.trim()
    const username = message.from.username

    // Handle /start command with link token
    if (text.startsWith('/start')) {
      const parts = text.split(' ')
      const linkToken = parts[1]

      if (linkToken) {
        // Look up the link token
        const { data: connection } = await supabaseAdmin
          .from('telegram_connections')
          .select('*')
          .eq('link_token', linkToken)
          .gt('link_token_expires_at', new Date().toISOString())
          .single()

        if (connection) {
          // Link the account
          await supabaseAdmin
            .from('telegram_connections')
            .update({
              telegram_chat_id: chatId,
              telegram_username: username || null,
              link_token: null,
              link_token_expires_at: null,
              is_active: true,
            })
            .eq('id', connection.id)

          await sendTelegramMessage(
            chatId,
            'Connected! You\'ll receive study reminders here.\n\nCommands:\n/stats — View your stats\n/review — Open review in browser\n/unlink — Disconnect'
          )
        } else {
          await sendTelegramMessage(
            chatId,
            'This link has expired. Please generate a new one from the CogniLeap app.'
          )
        }
      } else {
        await sendTelegramMessage(
          chatId,
          'Welcome to CogniLeap ActiveRecall!\n\nTo connect your account, use the link from the CogniLeap app settings.'
        )
      }

      return NextResponse.json({ ok: true })
    }

    // Handle /stats command
    if (text === '/stats') {
      const { data: connection } = await supabaseAdmin
        .from('telegram_connections')
        .select('user_id')
        .eq('telegram_chat_id', chatId)
        .eq('is_active', true)
        .single()

      if (!connection) {
        await sendTelegramMessage(chatId, 'Not connected. Link your account first from the CogniLeap app.')
        return NextResponse.json({ ok: true })
      }

      // Get quick stats
      const { count: totalCards } = await supabaseAdmin
        .from('review_cards')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', connection.user_id)

      const { count: dueCards } = await supabaseAdmin
        .from('review_cards')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', connection.user_id)
        .lte('next_review_at', new Date().toISOString())

      const { data: streak } = await supabaseAdmin
        .from('user_streaks')
        .select('review_streak')
        .eq('user_id', connection.user_id)
        .single()

      await sendTelegramMessage(
        chatId,
        `📊 *Your Stats*\n\n` +
        `Cards due: ${dueCards || 0}\n` +
        `Total cards: ${totalCards || 0}\n` +
        `Current streak: ${streak?.review_streak || 0} days`,
        { parseMode: 'Markdown' }
      )

      return NextResponse.json({ ok: true })
    }

    // Handle /review command
    if (text === '/review') {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cognileap.com'
      await sendTelegramMessage(chatId, 'Open your review session:', {
        replyMarkup: {
          inline_keyboard: [[{ text: 'Start Review', url: `${appUrl}/dashboard` }]],
        },
      })
      return NextResponse.json({ ok: true })
    }

    // Handle /unlink command
    if (text === '/unlink') {
      await supabaseAdmin
        .from('telegram_connections')
        .update({ is_active: false })
        .eq('telegram_chat_id', chatId)

      await sendTelegramMessage(chatId, 'Disconnected. You will no longer receive study reminders.')
      return NextResponse.json({ ok: true })
    }

    // Unknown command
    await sendTelegramMessage(
      chatId,
      'Available commands:\n/stats — View your stats\n/review — Open review in browser\n/unlink — Disconnect'
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Telegram] Webhook error:', error)
    return NextResponse.json({ ok: true }) // Always return 200 to Telegram
  }
}
