// Service worker: makes the app installable and usable offline.
//
// - Only this site's own GET requests are handled. Calls to Google, Gemini,
//   USOS and any other origin go straight to the network, never cached.
// - Pages: network first, revalidating the HTTP cache (so a new deploy shows
//   up at once, not after its max-age), the cached copy when offline.
// - Built assets (/assets/*, content-hashed, never change): cache first.
// - On install and after each page load, every file of the current build is
//   cached (see asset-manifest.json), so the app works offline after the
//   first visit; files of older builds are dropped.
const CACHE = 'dashboard-v1';
const scope = new URL(self.registration.scope);
const PAGE = new URL('./', scope).href;

const STATIC = [
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
];

/**
 * Caches the current build: the page, every built file (from
 * asset-manifest.json, written at build time) and the icons. Files already
 * cached are skipped; files of older builds are dropped.
 */
async function cacheBuild() {
  const cache = await caches.open(CACHE);
  const list = await fetch(new URL('asset-manifest.json', scope), {
    cache: 'no-store',
  });
  if (!list.ok) return;
  const urls = [...STATIC, ...(await list.json())].map(
    f => new URL(f, scope).href,
  );
  const missing = [];
  for (const url of urls) if (!(await cache.match(url))) missing.push(url);
  await cache.addAll(missing);
  const keep = new Set(urls);
  for (const req of await cache.keys())
    if (req.url.includes('/assets/') && !keep.has(req.url))
      await cache.delete(req);
}

/** Whether `url` is the app's page: the scope's root or its index.html. */
function isPage(url) {
  return (
    url.pathname === scope.pathname ||
    url.pathname === `${scope.pathname}index.html`
  );
}

self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      fetch(PAGE, {cache: 'no-store'}).then(res =>
        res.ok ? caches.open(CACHE).then(c => c.put(PAGE, res)) : undefined,
      ),
      cacheBuild(),
    ]).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== scope.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, {cache: 'no-cache'})
        .then(res => {
          // Only the app's own page becomes the offline copy.
          if (res.ok && isPage(url)) {
            const copy = res.clone();
            // Keep the offline copy current, including a new deploy's files.
            event.waitUntil(
              caches
                .open(CACHE)
                .then(c => c.put(PAGE, copy))
                .then(cacheBuild)
                .catch(() => {}),
            );
          }
          return res;
        })
        .catch(() => caches.match(PAGE).then(r => r ?? Response.error())),
    );
    return;
  }
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        hit =>
          hit ??
          fetch(req).then(res => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then(c => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
