const CACHE_NAME = 'fretboard-cruise-pro-auth-s2a';
const CACHE_PREFIX = 'fretboard-cruise-pro-';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then(names => Promise.all(
        names.filter(n => n.startsWith(CACHE_PREFIX)).map(n => caches.delete(n))
    )));
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    if (e.request.mode === 'navigate') {
        e.respondWith(fetch(e.request, { cache: 'no-cache' }));
        return;
    }
    e.respondWith(fetch(e.request));
});
