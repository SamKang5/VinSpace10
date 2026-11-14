const scope = self.registration.scope;
const prefix = 'mars-navigator:' + scope + ':';
const cacheName = prefix + REVISION;
const urls = new Set(ASSETS.map((asset) => new URL(asset, scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll([...urls].map(
    (url) => new Request(url, { cache: 'reload' }),
  ))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(
    names.filter((name) => name.startsWith(prefix) && name !== cacheName).map((name) => caches.delete(name)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate' && urls.has(request.url.split('?')[0])) {
    event.respondWith(fetch(request).catch(() => caches.open(cacheName).then(
      (cache) => cache.match(new URL('./index.html', scope)),
    )));
  } else if (urls.has(request.url)) {
    event.respondWith(caches.open(cacheName).then((cache) => cache.match(request.url)).then(
      (cached) => cached ?? fetch(request),
    ));
  }
});
