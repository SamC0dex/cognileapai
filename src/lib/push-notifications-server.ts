/**
 * Server-side Web Push notification helpers.
 * Uses the web-push npm package — must only be imported from server code (API routes).
 */

import webPush from 'web-push'

interface PushPayload {
  title: string
  body: string
  url?: string
}

/**
 * Send a push notification to a subscription.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionJSON,
  payload: PushPayload
): Promise<boolean> {
  try {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
    const vapidEmail = process.env.VAPID_CONTACT_EMAIL || 'mailto:admin@cognileap.com'

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn('[Push] VAPID keys not configured')
      return false
    }

    webPush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey)

    await webPush.sendNotification(
      subscription as unknown as webPush.PushSubscription,
      JSON.stringify(payload)
    )

    console.log('[Push] Notification sent successfully')
    return true
  } catch (error: unknown) {
    const err = error as { statusCode?: number }
    if (err.statusCode === 410 || err.statusCode === 404) {
      console.warn('[Push] Subscription expired or invalid')
      return false
    }
    console.error('[Push] Send error:', error)
    return false
  }
}
