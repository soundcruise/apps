const GATE_VERSION = 4; // パスワード変更時に rotationId と合わせて +1
const CACHE_NAME = 'pitch-trainer-pro-scope-v14-apps-pitch-cruise';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        Promise.all([
            caches.keys().then((cacheNames) => {
                return Promise.all(cacheNames.map((name) => caches.delete(name)));
            }),
            self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({ type: 'PRO_GATE_INVALIDATE', version: GATE_VERSION });
                });
            })
        ])
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
