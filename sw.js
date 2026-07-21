/* YOUR LIFE - YOUR TIMELINE : service worker
   Bump CACHE_VERSION any time you redeploy index.html so phones pick up
   the new build instead of serving a stale one. */
const CACHE_VERSION = 'ylyt-v1';
const SHELL = CACHE_VERSION + '-shell';

// Everything here is relative, so it works whether the site lives at the
// domain root or at a subpath like /DAILY-OS/.
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // addAll fails the whole install if one file 404s - add individually.
    await Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Let the page trigger an immediate update.
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Only ever handle our own files. Firebase, Google auth/calendar, fonts and
  // the Chart.js CDN go straight to the network, untouched - caching auth
  // traffic is how PWAs end up with mystery sign-in failures.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first (so a redeploy shows up), cache as fallback.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(SHELL);
        c.put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        const c = await caches.open(SHELL);
        return (await c.match('./index.html')) || (await c.match('./')) ||
               new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Static same-origin assets: cache first, refresh in background.
  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    const hit = await c.match(req);
    const net = fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await net) ||
           new Response('', { status: 504 });
  })());
});
