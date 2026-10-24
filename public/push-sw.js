// Imported into the generated Workbox service worker (see vite.config.ts).
// Shows Web Push notifications and routes taps back into the app.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Gym Tracker'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/notifications' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      for (const client of list) {
        if (new URL(client.url).origin !== self.location.origin) continue
        try {
          await client.focus()
          if ('navigate' in client) await client.navigate(url)
          return
        } catch {
          // Fall through and open a fresh window.
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
