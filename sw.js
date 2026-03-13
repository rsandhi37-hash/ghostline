/* ═══════════════════════════════════════════
   GhostLine Service Worker v1.0
   Handles: Offline cache, PWA install, updates
═══════════════════════════════════════════ */

const CACHE_NAME = 'ghostline-v1';
const STATIC_CACHE = 'ghostline-static-v1';

// Files to cache for offline use
const PRECACHE_URLS = [
  'index.html',
  'ghostline.html',
  'manifest.json'
];

// External CDN URLs to cache (fonts, firebase)
const CDN_CACHE_URLS = [
  'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap'
];

/* ── INSTALL ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        // Cache local files (ignore failures for optional files)
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(() => console.log('SW: Could not cache', url))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== STATIC_CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH STRATEGY ──
   - HTML pages: Network first, fallback to cache
   - Firebase/API calls: Network only (always live data)
   - Fonts/CDN: Cache first
   - Everything else: Network first, fallback cache
*/
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Firebase API — always network, never cache
  if (
    url.hostname.includes('firebasedatabase.app') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com')
  ) {
    return; // Let browser handle directly
  }

  // Google Fonts — cache first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // HTML files — network first, cache fallback
  if (event.request.headers.get('accept')?.includes('text/html') || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('/index.html')))
    );
    return;
  }

  // Everything else — network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

/* ── BACKGROUND SYNC (future use) ── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-messages') {
    // Placeholder for future background sync
    console.log('SW: Background sync triggered');
  }
});

/* ── PUSH NOTIFICATIONS (future use) ── */
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'GhostLine', {
      body: data.body || 'New message',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/ghostline.html' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('ghostline') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data?.url || '/ghostline.html');
    })
  );
});
