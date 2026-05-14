const GATE_VERSION = 4; // pitch-cruise と共有クッキー（soundcruise_pro_gate_rid）を使うため同じ値にする
const CACHE_NAME = 'fretboard-cruise-pro-v1.141.16';

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
