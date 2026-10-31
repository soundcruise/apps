/* Port owns markup, styling, controller and local stores; Studio owns this document lifetime. */
import { createPortProBoundary } from '../core/port-pro-boundary.mjs?v=0.56.0';
const boundary = createPortProBoundary();
let controller, epoch = 0, stopped = false;
async function stop() {
    stopped = true; epoch++; boundary.invalidate();
    controller?.setActive(false);
    controller?.stopForPageHidden?.();
    await controller?.destroy?.();
    controller = null;
}
window.CruiseStudioPortTool = Object.freeze({ stop });
window.addEventListener('pagehide', () => { void stop(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) void stop(); });
async function mount() {
    const token = ++epoch;
    const tool = location.hash.slice(1);
    if (!['tuner', 'metronome'].includes(tool) || controller || stopped) return;
    const permission = await boundary.authorize();
    if (token !== epoch) return;
    if (!permission.ok || !permission.capabilities) {
        document.querySelector('[role="status"]').textContent = 'Studioの利用権限が未接続です。';
        document.body.dataset.componentState = 'locked'; return;
    }
    const response = await fetch('/apps/cruise-port/pro_9a3943176561/index.html');
    if (!response.ok) throw Error('Port markup unavailable');
    const source = new DOMParser().parseFromString(await response.text(), 'text/html');
    const root = source.getElementById(tool + '-view');
    if (!root || token !== epoch) return;
    for (const link of source.querySelectorAll('link[rel="stylesheet"]')) {
        const style = document.createElement('link'); style.rel = 'stylesheet';
        style.href = new URL(link.getAttribute('href'), new URL('/apps/cruise-port/pro_9a3943176561/', location.origin)).href;
        document.head.append(style);
    }
    const style = document.createElement('style');
    style.textContent = 'body{margin:0}.port-view{max-width:1100px;margin:0 auto;padding:24px}'; document.head.append(style);
    root.hidden = false; root.classList.add('is-active');
    document.body.replaceChildren(document.importNode(root, true));
    const module = await import(`/apps/cruise-port/${tool}-app.js?v=1.24.23`);
    if (token !== epoch) return;
    const init = tool === 'tuner' ? module.initTuner : module.initMetronome;
    controller = init(document.getElementById(tool + '-view'), { capabilities: permission.capabilities,
        requestPro: () => {} });
    controller.setActive(true);
    document.body.dataset.componentState = 'ready';
}
window.addEventListener('hashchange', () => { void mount().catch(showError); });
function showError() { document.body.dataset.componentState = 'failed'; document.body.textContent = 'ツールを読み込めませんでした。'; }
void mount().catch(showError);
