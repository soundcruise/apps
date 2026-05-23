const GATE_VERSION = 8; // index.html の gateVersion と合わせる
const CACHE_NAME = 'fretboard-cruise-pro-v2.3.0';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
    e.waitUntil(Promise.all([
        caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))),
        self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
            clients.forEach(c => c.postMessage({ type: 'PRO_GATE_INVALIDATE', version: GATE_VERSION }));
        })
    ]));
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    if (e.request.mode === 'navigate') {
        e.respondWith(fetch(e.request, { cache: 'no-cache' }));
        return;
    }
    e.respondWith(fetch(e.request));
});
