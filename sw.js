// Lenz Converter service worker
const CACHE = 'lenz-v1';
const SHELL = ['./','./index.html','./css/app.css','./js/app.js','./js/engine.js','./js/queue.js','./js/subtitle.js','./js/idb.js','./js/faq.js','./manifest.webmanifest','./icons/icon.svg'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });

// Cross-origin isolation headers for SharedArrayBuffer (ffmpeg.wasm threads).
self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  // Navigation: network-first, fallback to cache, add COOP/COEP
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        return withIsolation(net);
      } catch {
        const cached = await caches.match('./index.html');
        return withIsolation(cached || new Response('Offline', { status: 503 }));
      }
    })()); return;
  }
  // Static assets: cache-first
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })));
    return;
  }
  // FFmpeg CDN: cache-first (so it works offline)
  if (/cdn\.jsdelivr\.net/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return withIsolation(res); })));
  }
});

function withIsolation(res) {
  const h = new Headers(res.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
