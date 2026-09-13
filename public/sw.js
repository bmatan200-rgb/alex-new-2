const CACHE_NAME = 'alex-beauty-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

/**
 * אסטרטגיה: רשת קודם.
 *
 * חשוב במיוחד באפליקציית תורים — אסור להציג זמינות שעות מהמטמון,
 * כי משבצת שנתפסה לפני דקה תוצג כפנויה. המטמון משמש רק כגיבוי
 * כשאין אינטרנט בכלל.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.url.includes('/api/')) return;
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
