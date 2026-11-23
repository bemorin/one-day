/* One Day service worker: makes the app open instantly and work offline, even from a cold start.
   It only caches the app's own files, and its guide. It never sees your tasks, which live in localStorage. */
const CACHE = 'one-day-v55';
const SHELL = [
  './',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './favicon.ico',
  './fonts/archivo-latin.woff2',
  './fonts/archivo-latin-ext.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  // the guide's words, ready offline; its pictures are kept as they are seen
  './guide/',
  './guide/guide.css',
  './guide/guide.js',
];
const ROOT = new URL('./', self.registration.scope).pathname;
// The pages it answers when opened: the app (also as /index.html) and the guide.
const PAGES = { [ROOT]: './', [ROOT + 'index.html']: './', [ROOT + 'guide/']: './guide/' };

// A response that went through a redirect cannot answer a page load: keep a clean copy instead.
const plain = async r =>
  r.redirected ? new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers }) : r;

self.addEventListener('install', event => {
  // `reload` skips the HTTP cache, so a new version never installs yesterday's files.
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(
        SHELL.map(async url => {
          const r = await fetch(new Request(url, { cache: 'reload' }));
          if (!r.ok) throw new Error(`${url}: ${r.status}`);
          await cache.put(url, await plain(r));
        }),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Opening the app or the guide (with any query): the cached page at once, refreshed for next time.
  if (request.mode === 'navigate') {
    const page = Object.hasOwn(PAGES, url.pathname) ? PAGES[url.pathname] : null;
    if (!page) return;
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(page);
        const fresh = fetch(page, { cache: 'no-cache' }).then(async r => {
          if (r.ok) await cache.put(page, await plain(r.clone()));
          return r;
        });
        if (cached) {
          event.waitUntil(fresh.catch(() => {}));
          return cached;
        }
        return fresh.catch(() => fetch(request));
      }),
    );
    return;
  }

  // The app's files: stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(request);
      const fresh = fetch(request)
        .then(async r => {
          if (r.ok && r.type === 'basic') await cache.put(request, await plain(r.clone()));
          return r;
        })
        .catch(() => cached || Response.error());
      if (cached) {
        event.waitUntil(fresh);
        return cached;
      }
      return fresh;
    }),
  );
});
