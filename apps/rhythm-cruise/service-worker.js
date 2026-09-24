/* リズムクルーズ Service Worker
   既存アプリ（pitch-cruise / fretboard_cruise）の最小パターンを踏襲。
   現段階ではキャッシュを保持せず、常にネットワーク取得とする。
   activate 時の掃除は rhythm-cruise 系の古いキャッシュのみ対象とし、
   同一オリジン上の他アプリ（pitch-cruise / fretboard_cruise / shared）の
   キャッシュには一切触れない。 */

const CACHE_NAME = 'rhythm-cruise-v12';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((names) => Promise.all(
            names
                .filter((n) => n.startsWith('rhythm-cruise-') && n !== CACHE_NAME)
                .map((n) => caches.delete(n))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const path = new URL(e.request.url).pathname;
    if (path.includes('/pro_') || path.endsWith('/shared/pro-gate.js') ||
        path.endsWith('/shared/sync-account/sync-account-turnstile.js')) {
        e.respondWith(fetch(e.request, { cache: 'no-cache' }));
        return;
    }
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
