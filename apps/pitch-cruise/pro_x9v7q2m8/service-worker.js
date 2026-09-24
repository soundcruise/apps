const CACHE_NAME = 'pitch-trainer-pro-scope-v25-apps-pitch-cruise';
const CACHE_PREFIX = 'pitch-trainer-pro-scope-';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((cacheNames) => Promise.all(
            cacheNames.filter((name) => name.startsWith(CACHE_PREFIX))
                .map((name) => caches.delete(name))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    if (e.request.mode === 'navigate') {
        e.respondWith(fetch(e.request, { cache: 'no-cache' }));
        return;
    }
    e.respondWith(fetch(e.request));
});
