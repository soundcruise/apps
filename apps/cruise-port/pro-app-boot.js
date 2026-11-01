import { isProAccessReady } from './cruise-port-capabilities.js?v=1.28.1';

// Do not initialize tools, storage controllers or routes underneath a locked
// Pro gate. Shared authentication/legacy/offline rules remain unchanged.
let started = false;
const framed = window.parent !== window;
const requestedRoute = location.hash;
async function startWhenReady() {
    let application;
    if (started || !isProAccessReady()) return;
    started = true;
    observer.disconnect();
    try { application = await import('./practice-menu-app.js?v=1.28.1'); }
    catch (_) {
        const notice = document.createElement('p');
        notice.setAttribute('role', 'alert');
        notice.textContent = 'アプリを読み込めませんでした。ページを再読み込みしてください。';
        document.body.prepend(notice);
    }
    if (framed && document.documentElement.dataset.portWriterReady === 'true') {
        // Native Port owns Pro, Account, stores and Sync. Studio owns only the
        // iframe lifetime; no permissions or credentials are minted here.
        window.CruiseStudioPortTool = Object.freeze({
            pause() { const button = document.getElementById('practice-timer-toggle'); if (button?.getAttribute('aria-label') === '練習を一時停止する') button.click(); },
            stop() { window.dispatchEvent(new PageTransitionEvent('pagehide')); }
        });
        document.body.dataset.componentState = 'ready';
        if (requestedRoute) location.hash = requestedRoute;
        window.dispatchEvent(new Event('studio-port-ready'));
        window.SoundCruiseSyncAccount?.storage?.subscribeAccount?.(() => window.dispatchEvent(new Event('studio-port-account-changed')));

    }
    const restore = () => {
        try { if (isProAccessReady() && JSON.parse(localStorage.getItem('cruisePort.syncLocalAccount.v1') || 'null')?.mode === 'sync')
            void application?.resumeNativePortSync().catch(() => window.dispatchEvent(new Event('studio-port-sync-pending'))); } catch (_) {}
    };
    restore(); window.addEventListener('online', restore);
}
const observer = new MutationObserver(() => { void startWhenReady(); });
observer.observe(document.body, { childList: true, attributes: true, attributeFilter: ['class'] });
void startWhenReady();
if (typeof globalThis.__soundCruiseClearGate !== 'function') {
    const notice = document.createElement('p');
    notice.setAttribute('role', 'alert');
    notice.textContent = '認証画面を読み込めませんでした。ページを再読み込みしてください。';
    document.body.prepend(notice);
    document.querySelector('.port-shell').inert = true;
}
