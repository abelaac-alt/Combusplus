const CACHE = 'combusplus-v9-2';
const SHELL = [
  './',
  './index.html',
  './privacy.html',
  './assets/styles.css',
  './assets/logo.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './src/app.js',
  './src/core.js',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // La configuración generada por GitHub Actions nunca se sirve desde una caché
  // antigua. Esto evita que una APK o PWA conserve claves o URLs obsoletas.
  if (url.pathname.endsWith('/config.js')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => new Response(
          "window.COMBUSPLUS_CONFIG = Object.freeze({version:'9.0.0'});",
          { headers: { 'content-type': 'application/javascript; charset=utf-8' } }
        ))
    );
    return;
  }

  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      return new Response('', { status: 504, statusText: 'Sin conexión' });
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || './#favorites';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
