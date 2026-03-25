/**
 * Telegram Bot API helpers — server-side only.
 * Thin fetch() wrapper, no npm dependencies.
 */

const TELEGRAM_API = 'https://api.telegram.org/bot'

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured')
  return token
}

interface InlineKeyboardButton {
  text: string
  url?: string
  callback_data?: string
}

interface SendMessageOptions {
  parseMode?: 'Markdown' | 'HTML'
  replyMarkup?: {
    inline_keyboard: InlineKeyboardButton[][]
  }
}

/**
 * Send a text message to a Telegram chat.
 */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
  options?: SendMessageOptions
): Promise<boolean> {
  try {
    const token = getToken()
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
    }

    if (options?.parseMode) {
      body.parse_mode = options.parseMode
    }
    if (options?.replyMarkup) {
      body.reply_markup = options.replyMarkup
    }

    const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const result = await response.json()
    if (!result.ok) {
      console.error('[Telegram] Send message error:', result)
      return false
    }

    return true
  } catch (error) {
    console.error('[Telegram] Send message error:', error)
    return false
  }
}

/**
 * Send a review nudge with an inline "Start Review" button.
 */
export async function sendReviewNudge(
  chatId: number,
  message: string,
  webAppUrl: string
): Promise<boolean> {
  return sendTelegramMessage(chatId, message, {
    parseMode: 'Markdown',
    replyMarkup: {
      inline_keyboard: [
        [
          { text: 'Start Review', url: `${webAppUrl}/dashboard` },
        ],
      ],
    },
  })
}

/**
 * Send a daily summary to a user.
 */
export async function sendDailySummary(
  chatId: number,
  summary: {
    cardsReviewed: number
    accuracy: number
    cardsDueTomorrow: number
  }
): Promise<boolean> {
  const text = `📊 *Daily Summary*\n\nToday: ${summary.cardsReviewed} cards reviewed, ${summary.accuracy}% accuracy.\n${summary.cardsDueTomorrow} cards due tomorrow.`

  return sendTelegramMessage(chatId, text, {
    parseMode: 'Markdown',
  })
}

/**
 * Send a weekly report via Telegram.
 */
export async function sendWeeklyReport(
  chatId: number,
  reportMarkdown: string
): Promise<boolean> {
  // Telegram has a 4096 char limit, truncate if needed
  const truncated = reportMarkdown.length > 3800
    ? reportMarkdown.substring(0, 3800) + '\n\n_...read the full report in the app_'
    : reportMarkdown

  return sendTelegramMessage(chatId, truncated, {
    parseMode: 'Markdown',
  })
}

/**
 * Verify that a webhook update is from Telegram.
 * (Basic check — for production, use secret_token)
 */
export function verifyWebhookUpdate(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const update = body as Record<string, unknown>
  return 'update_id' in update && (
    'message' in update || 'callback_query' in update
  )
}
