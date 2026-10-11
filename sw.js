const CACHE = 'playwise-v5-elegant-20261011';
const CORE = ['/', '/guides.html', '/avis.html', '/reglement.html', '/support.html', '/profil.html', '/404.html', '/assets/playwise.js?v=20261011-elegant1', '/assets/playwise-modern.css?v=20261011-elegant1', '/assets/playwise-ui.js?v=20261011-elegant1', '/favicon.svg', '/assets/playwise-logo.svg'];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).catch(() => {}));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('playwise-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && response.type !== 'opaque') {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {}));
    }
    return response;
  }).catch(() => caches.match(event.request).then(response => response || (event.request.mode === 'navigate' ? caches.match('/404.html') : Response.error()))));
});
