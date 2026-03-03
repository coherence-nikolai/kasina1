/* Collapse↑ service worker (offline-first, animation-safe) */
const CACHE_VERSION = 'cu-v36';
const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './data.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k !== CACHE_VERSION) ? caches.delete(k) : null)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // App shell: cache-first
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match('./index.html')))
    );
    return;
  }

  // Fonts/styles: stale-while-revalidate (best-effort)
  if (url.hostname.includes('googleapis') || url.hostname.includes('gstatic')) {
    event.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});
