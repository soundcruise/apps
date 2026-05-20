const GATE_VERSION = 8; // ゲート方式変更時・パスワード変更時に +1
const CACHE_NAME = 'pitch-trainer-pro-scope-v15-apps-pitch-cruise';
const INFO_NEW_VERSION_KEY = 'infoNewVersionSeen';

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
                    client.postMessage({ type: 'PRO_GATE_INVALIDATE', version: GATE_VERSION, resetGate: true });
                    client.postMessage({ type: 'INFO_VERSION_UPDATED', version: GATE_VERSION });
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
