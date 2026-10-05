import { isProAccessReady } from './cruise-port-capabilities.js?v=1.19.2';

// Do not initialize tools, storage controllers or routes underneath a locked
// Pro gate. Shared authentication/legacy/offline rules remain unchanged.
let started = false;
async function startWhenReady() {
    if (started || !isProAccessReady()) return;
    started = true;
    observer.disconnect();
    try { await import('./practice-menu-app.js?v=1.19.4'); }
    catch (_) {
        const notice = document.createElement('p');
        notice.setAttribute('role', 'alert');
        notice.textContent = 'アプリを読み込めませんでした。ページを再読み込みしてください。';
        document.body.prepend(notice);
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
