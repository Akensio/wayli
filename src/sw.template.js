// Wayli service worker: the app shell works offline; data files are cached once downloaded.
const SHELL = 'wayli-shell-__BUILD__';   // build_site.py puts the build time here: every deploy is a new shell cache
const DATA = 'wayli-data-v1';
const SHELL_FILES = __SHELL_FILES__;   // the built files, written by vite.config.ts at build time

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const isData = url.pathname.includes('/data/');
  const isManifest = url.pathname.endsWith('/data/manifest.json');
  if (isManifest) {
    // network first, so a new feed is noticed; cached copy when offline
    e.respondWith(fetch(e.request).then((r) => { caches.open(DATA).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  if (isData || url.origin === location.origin || url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'unpkg.com') {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok) caches.open(isData ? DATA : SHELL).then(async (c) => {
        await c.put(e.request, r.clone());
        // a data file is cached per build (?v=): the older builds of the same file go
        if (isData) for (const k of await c.keys()) { const u = new URL(k.url); if (u.pathname === url.pathname && u.search !== url.search) c.delete(k); }
      });
      return r;
    })));
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
