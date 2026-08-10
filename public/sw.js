const CACHE_NAME = 'craftcommand-center-v2.3.0-beta.11';
const STATIC_ASSETS = [
  '/', '/index.html', '/status.html', '/items.html', '/achievements.html', '/activity.html', '/accounts.html', '/help.html',
  '/styles.css', '/theme.js', '/app.js', '/status.js', '/catalog.js', '/achievements.js', '/achievements.json', '/activity.js', '/accounts.js', '/help.js',
  '/item-icons.js', '/pwa.js', '/manifest.webmanifest', '/icon.png', '/favicon.png',
  '/apple-touch-icon.png', '/app-icon-192.png', '/app-icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request).then(hit => hit || caches.match('/index.html'))));
    return;
  }
  event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    return response;
  })));
});
