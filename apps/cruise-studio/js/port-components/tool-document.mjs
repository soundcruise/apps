/* Port owns markup, styling, controller and local stores; Studio owns this document lifetime. */
import { createPortProBoundary } from '../core/port-pro-boundary.mjs?v=0.70.0';
const boundary = createPortProBoundary();
let controller, epoch = 0, stopped = false, fullApplication = false, policy;
function pause() { const button = document.getElementById('practice-timer-toggle'); if (button?.getAttribute('aria-label') === '練習を一時停止する') button.click(); }
async function stop() {
    if (stopped) return;
    stopped = true;
    pause();
    epoch++; boundary.invalidate();
    policy?.revokePermission();
    if (fullApplication) window.dispatchEvent(new PageTransitionEvent('pagehide'));
    controller?.setActive(false);
    controller?.stopForPageHidden?.();
    await controller?.destroy?.();
    controller = null;
}
window.CruiseStudioPortTool = Object.freeze({ stop, pause });
window.addEventListener('pagehide', () => { if (!stopped) void stop(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (fullApplication) pause(); else void stop(); } });
async function mount() {
    const token = ++epoch;
    const tool = new URLSearchParams(location.search).get('tool') || location.hash.slice(1);
    if (!['tuner', 'metronome', 'practice', 'gear', 'myApps'].includes(tool) || controller || fullApplication || stopped) return;
    const permission = await boundary.authorize();
    if (token !== epoch) return;
    if (!permission.ok || !permission.capabilities) {
        document.querySelector('[role="status"]').textContent = 'Studioの利用権限が未接続です。';
        document.body.dataset.componentState = 'locked'; return;
    }
    policy = await import('./policy-context.mjs'); policy.installPermission(permission);
    document.body.style.visibility = 'hidden';
    const response = await fetch('/apps/cruise-port/pro_9a3943176561/index.html');
    if (!response.ok) throw Error('Port markup unavailable');
    const source = new DOMParser().parseFromString(await response.text(), 'text/html');
    const isApplication = ['practice', 'gear', 'myApps'].includes(tool);
    const root = isApplication ? source.body : source.getElementById(tool + '-view');
    if (!root || token !== epoch) return;
    for (const link of source.querySelectorAll('link[rel="stylesheet"]')) {
        const style = document.createElement('link'); style.rel = 'stylesheet';
        style.href = new URL(link.getAttribute('href'), new URL('/apps/cruise-port/pro_9a3943176561/', location.origin)).href;
        document.head.append(style);
    }
    const style = document.createElement('style');
    style.textContent = isApplication ? (tool === 'myApps' ? 'body{margin:0} #home-view > :not(#my-apps-section){display:none!important}' : 'body{margin:0}') : 'body{margin:0}.port-view{max-width:1100px;margin:0 auto;padding:24px}'; style.textContent += '#tuner-view > .view-back[data-action=home],#metronome-view > .view-back[data-action=home],#practice-list-view > .view-back[data-action=home],#wishlist-view > .view-back[data-action=home]{display:none!important}';document.head.append(style);
    if (isApplication) {
        // Import only inert markup; none of Port's gate, Account or Sync script tags execute.
        root.querySelectorAll('script').forEach(script => script.remove());
        if(tool==='myApps')root.querySelectorAll('[data-action=my-apps-home],[data-action=my-apps-home-scroll]').forEach(function(button){if(button.textContent.includes('クルーズポート'))button.textContent='← My Apps';});
        for (const node of root.querySelectorAll('[src], [href]')) for (const attr of ['src', 'href']) {
            const value = node.getAttribute(attr);
            if (value && !value.startsWith('#')) node.setAttribute(attr, new URL(value, new URL('/apps/cruise-port/pro_9a3943176561/', location.origin)).href);
        }
        document.body.replaceChildren(...Array.from(root.childNodes, node => document.importNode(node, true)));
        fullApplication = true;
        await import('/apps/cruise-port/practice-menu-app.js?v=1.28.2');
        if (token !== epoch) return;
        const hash = { practice: '#practice-menu', gear: '#wishlist', myApps: '' }[tool];
        // Port boot renders Home; select its own route once initialization completes.
        location.hash = hash;
        document.body.dataset.componentState = 'ready';
        document.body.style.visibility = '';
        window.dispatchEvent(new Event('studio-port-ready'));
        return;
    }
    root.hidden = false; root.classList.add('is-active');
    document.body.replaceChildren(document.importNode(root, true));
    const module = await import(`/apps/cruise-port/${tool}-app.js?v=1.24.23`);
    if (token !== epoch) return;
    const init = tool === 'tuner' ? module.initTuner : module.initMetronome;
    controller = init(document.getElementById(tool + '-view'), { capabilities: permission.capabilities,
        requestPro: () => {} });
    controller.setActive(true);
    document.body.dataset.componentState = 'ready';
    document.body.style.visibility = '';
}
window.addEventListener('hashchange', () => { void mount().catch(showError); });
function showError() { document.body.style.visibility = '';  document.body.dataset.componentState = 'failed'; document.body.textContent = 'ツールを読み込めませんでした。'; }
void mount().catch(showError);
