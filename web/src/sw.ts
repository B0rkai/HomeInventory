/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

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
