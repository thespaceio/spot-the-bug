// Spot the Bug service worker: the game keeps working offline once opened.
// There's no build step, so file names don't change between releases. Every
// same-origin file is fetched from the network first (always the newest
// version when online) and the saved copy is used only when offline.
// VERSION and PRECACHE are kept up to date by scripts/update-sw.mjs
// (npm test fails if they're out of date).
const VERSION = /*VERSION*/ '0.11.0' /*END*/;
const PRECACHE = /*PRECACHE*/ [
  './',
  './app.webmanifest',
  './assets/css/styles.css',
  './assets/img/apple-touch-icon.png',
  './assets/img/icon-192.png',
  './assets/img/icon-512.png',
  './assets/img/icon-maskable-512.png',
  './assets/img/mark.svg',
  './assets/js/app.js',
  './assets/js/auth.js',
  './assets/js/config.js',
  './assets/js/context.js',
  './assets/js/dom.js',
  './assets/js/draw.js',
  './assets/js/engine.js',
  './assets/js/gamenight.js',
  './assets/js/highlight.js',
  './assets/js/intro.js',
  './assets/js/online.js',
  './assets/js/qr.js',
  './assets/js/stats.js',
  './assets/js/storage.js',
  './assets/js/supa.js',
  './assets/js/sync.js',
  './assets/js/tilt.js',
  './assets/js/views/about.js',
  './assets/js/views/account.js',
  './assets/js/views/board.js',
  './assets/js/views/certcheck.js',
  './assets/js/views/classroom.js',
  './assets/js/views/home.js',
  './assets/js/views/live.js',
  './assets/js/views/moderate.js',
  './assets/js/views/privacy.js',
  './assets/js/views/progress.js',
  './assets/js/views/results.js',
  './assets/js/views/round.js',
  './assets/js/views/scoreboard.js',
  './assets/js/views/slides.js',
  './assets/js/whatsnew.js',
  './assets/js/world.js',
  './assets/vendor/qrcode.js',
  './assets/vendor/supabase.js',
  './data/categories.json',
  './data/manifest.json',
  './data/snippets/advanced.json',
  './data/snippets/beginner.json',
  './data/snippets/intermediate.json',
  './index.html',
] /*END*/;
const CACHE = `stb-${VERSION}`;
const FONT_CACHE = 'stb-fonts';
const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' })))));
  // No skipWaiting: an updated worker takes over once old tabs close.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((names) => Promise.all(names.filter((n) => n.startsWith('stb-') && n !== CACHE && n !== FONT_CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Web fonts: keep a copy so the brand typefaces work offline too.
  if (FONT_ORIGINS.includes(url.origin)) {
    event.respondWith(caches.open(FONT_CACHE).then((cache) => cache.match(request).then((hit) => hit
      || fetch(request).then((res) => {
        if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
        return res;
      }))));
    return;
  }
  // Supabase and everything else on other sites: straight to the network.
  if (url.origin !== self.location.origin) return;

  const isPage = request.mode === 'navigate';
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(isPage ? './index.html' : request, copy));
        }
        return res;
      })
      .catch(() => caches.match(isPage ? './index.html' : request, { ignoreSearch: isPage })
        .then((hit) => hit || (isPage ? caches.match('./') : undefined))
        .then((hit) => hit || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }))),
  );
});
