/**
 * Client-side push notification helpers.
 * No server-only dependencies — safe to import from 'use client' components.
 * For server-side sending, use push-notifications-server.ts instead.
 */

/**
 * Client-side: Register service worker and get push subscription.
 */
export async function registerPushSubscription(): Promise<PushSubscriptionJSON | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Push] Push notifications not supported')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.ready

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.warn('[Push] Permission denied')
      return null
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) {
      console.warn('[Push] VAPID public key not available')
      return null
    }

    // Convert VAPID key to Uint8Array
    const urlBase64ToUint8Array = (base64String: string) => {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
      const rawData = atob(base64)
      return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })

    return subscription.toJSON()
  } catch (error) {
    console.error('[Push] Registration error:', error)
    return null
  }
}
