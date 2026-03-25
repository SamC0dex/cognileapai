// ActiveRecall Service Worker — Push Notifications

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}

  const options = {
    body: data.body || 'Time to review your cards!',
    icon: '/logo-dark.png',
    badge: '/logo-dark.png',
    data: {
      url: data.url || '/dashboard',
    },
    actions: [
      { action: 'review', title: 'Start Review' },
      { action: 'dismiss', title: 'Later' },
    ],
    tag: 'active-recall',
    renotify: true,
  }

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'CogniLeap — ActiveRecall',
      options
    )
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/dashboard'

  if (event.action === 'dismiss') return

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          return client.focus()
        }
      }
      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})
