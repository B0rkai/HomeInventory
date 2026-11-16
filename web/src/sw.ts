/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { notificationText, type PushMessage } from './notificationText'

declare let self: ServiceWorkerGlobalScope

// The app shell works offline; API calls always go to the network.
const manifest = self.__WB_MANIFEST
precacheAndRoute(manifest)
cleanupOutdatedCaches()
// Only the build precaches index.html; in dev the list is empty, and binding to a missing
// entry would stop the service worker from installing.
if (manifest.some((entry) => (typeof entry === 'string' ? entry : entry.url) === 'index.html')) {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }),
  )
}

// A new version takes over on the next load instead of waiting for every tab to close.
self.skipWaiting()
clientsClaim()

// Notifications: the server says what happened, the text is made here.
self.addEventListener('push', (event) => {
  if (!event.data) return
  const message = event.data.json() as PushMessage
  const { title, body } = notificationText(message)
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      // A newer message about the same thing replaces the older one.
      tag: message.tag,
      icon: '/pwa-192x192.png',
      // Android draws only the badge's shape, in the status bar.
      badge: '/badge-96x96.png',
      data: { url: message.url },
    }),
  )
})

// A tap opens the app (an open window if there is one) on the page the message is about.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(
    (event.notification.data as { url?: string })?.url ?? '/',
    self.location.origin,
  )
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((client) => new URL(client.url).origin === url.origin)
      if (open) {
        await open.focus()
        await open.navigate(url.href)
      } else {
        await self.clients.openWindow(url.href)
      }
    })(),
  )
})
