import { isProAccessReady } from './cruise-port-capabilities.js?v=1.24.23';

// Do not initialize tools, storage controllers or routes underneath a locked
// Pro gate. Shared authentication/legacy/offline rules remain unchanged.
let started = false;
const framed = window.parent !== window, requestedRoute = location.hash;
async function startWhenReady() {
    if (started || !isProAccessReady()) return;
    started = true;
    observer.disconnect();
    try { await import('./practice-menu-app.js?v=1.24.23'); }
    catch (_) {
        const notice = document.createElement('p');
        notice.setAttribute('role', 'alert');
        notice.textContent = 'アプリを読み込めませんでした。ページを再読み込みしてください。';
        document.body.prepend(notice);
        return;
    }
    if (framed) {
        // Initialization notification only; native Pro/Account/Sync remain owners.
        window.CruiseStudioPortTool = Object.freeze({
            pause() { const button = document.getElementById('practice-timer-toggle'); if (button?.getAttribute('aria-label') === '練習を一時停止する') button.click(); },
            stop() { window.dispatchEvent(new PageTransitionEvent('pagehide')); }
        });
        document.body.dataset.componentState = 'ready';
        if (requestedRoute) location.hash = requestedRoute;
        window.dispatchEvent(new Event('studio-port-ready'));
    }
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
