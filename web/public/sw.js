// Service worker de SEÑAL · IPTV. Caché para que cargue rápido.
// Estrategia:
//  - App shell (HTML/JS/CSS/íconos): cache-first con refresco en 2º plano.
//  - Listas (/api/home|meta|channels): stale-while-revalidate → instantáneo,
//    y la red actualiza por detrás.
//  - Logos/imágenes: cache-first (una vez vistos, quedan al toque), con tope.
//  - Vídeo (/api/stream) y endpoints sensibles: SIEMPRE red, nunca cachear.

const SHELL_CACHE = 'senal-shell-v2';
const DATA_CACHE = 'senal-data-v2';
const IMG_CACHE = 'senal-img-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
const DATA_API = /^\/api\/(home|meta|channels)(\?|$)/;
const IMG_MAX = 400;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, DATA_CACHE, IMG_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function staleWhileRevalidate(request) {
  return caches.open(DATA_CACHE).then((cache) =>
    cache.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => { if (res && res.ok) cache.put(request, res.clone()); return res; })
        .catch(() => cached);
      return cached || network; // responde del cache al instante; red actualiza
    })
  );
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) {
    for (const k of keys.slice(0, keys.length - max)) await cache.delete(k);
  }
}

function cacheFirstImage(request) {
  return caches.open(IMG_CACHE).then((cache) =>
    cache.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          cache.put(request, res.clone());
          trimCache(IMG_CACHE, IMG_MAX);
        }
        return res;
      });
    })
  );
}

function shellStatic(request) {
  return caches.open(SHELL_CACHE).then((cache) =>
    cache.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => { if (res && res.ok) cache.put(request, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Vídeo y URL de cast: nunca cachear (en vivo / firmado).
  if (url.pathname.endsWith('.apk')) return;
  if (url.pathname.startsWith('/api/stream') || url.pathname.startsWith('/api/cast-url')) return;

  // Listas de canales/meta/home: instantáneo con actualización en 2º plano.
  if (sameOrigin && DATA_API.test(url.pathname + url.search)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Resto de la API (auth, watch, check, streams de canal): siempre red.
  if (url.pathname.startsWith('/api/')) return;

  // Logos / imágenes (cualquier origen): cache-first.
  if (request.destination === 'image') {
    event.respondWith(cacheFirstImage(request).catch(() => fetch(request)));
    return;
  }

  // Navegaciones: red con fallback al shell (offline).
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  // Estáticos del mismo origen (JS/CSS): cache-first + refresco.
  if (sameOrigin) event.respondWith(shellStatic(request));
});
