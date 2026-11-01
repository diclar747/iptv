// Service worker de SEÑAL · IPTV.
// Estrategia:
//  - App shell (HTML/JS/CSS/íconos): cache-first con actualización en segundo plano.
//  - API de datos (/api/*): siempre red (datos frescos). NUNCA cachear vídeo.
//  - El proxy de streams (/api/stream) jamás se intercepta: es vídeo en vivo.

const CACHE = 'senal-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // No tocar la API ni el vídeo: siempre a la red.
  if (url.pathname.startsWith('/api/')) return;

  // Navegaciones: red con fallback al shell cacheado (offline).
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  // Recursos estáticos del mismo origen: cache-first + refresco.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
