import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { onNotificationClick, onPush } from './swPush.js';

// The service worker (ADR 044 PR 5). It does what the generated one did (vite.config.js used to describe it with `workbox: {}`) and adds
// Web Push. Type-checked by tsconfig.sw.json (the worker's own globals), not by the app's tsconfig.
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> };

// Everything the app needs, including the Excel reader and fonts, is cached so it works offline (the file list is in vite.config.js).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// The API shares the origin (ADR 010). A page load of an /api path, such as the sign-in callback, must reach the server, not be
// answered with the app by the service worker.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//, /^\/delete-account$/] }));

// The landing page's screenshots (WebP) are left out of the install download, as only signed-out visitors see them. Cached the first
// time they load instead, so the landing page still shows them offline. Names are hashed, so a cached copy never goes stale; the limit
// drops old versions.
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && /\/assets\/[^/]+\.webp$/.test(url.pathname),
  new CacheFirst({ cacheName: 'landing-images', plugins: [new ExpirationPlugin({ maxEntries: 4 })] }),
);

// A new version waits until the app is idle (registerType 'prompt', ADR 018); UpdateBanner sends this when it is time.
self.addEventListener('message', event => {
  if ((event.data as { type?: unknown } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('push', event => {
  event.waitUntil(onPush(self, event.data?.text()));
});

self.addEventListener('notificationclick', event => {
  event.waitUntil(onNotificationClick(self, event.notification));
});
