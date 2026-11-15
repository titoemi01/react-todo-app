// The "service worker": a tiny script the browser keeps running in the background, even when the
// app is closed. Its only jobs are to show an alert when the server sends one, and to open the
// app when the alert is tapped.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // not JSON: show the text as the message
    data = { body: event.data ? event.data.text() : '' }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Task due now', {
      body: data.body || '',
      tag: data.tag || 'task',
      renotify: true, // ring again even if an alert with the same tag is still showing
      requireInteraction: true, // stays on screen until you tap it (where the system allows)
      vibrate: [400, 150, 400, 150, 800], // a long, insistent buzz on phones that support it
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) if ('focus' in client) return client.focus()
      return self.clients.openWindow(url)
    })
  )
})
