/* Shared Port component owner; production is deliberately closed until writer admission exists. */
import { createPortProBoundary } from '../core/port-pro-boundary.mjs?v=0.63.0';

const boundary = createPortProBoundary();
const allowed = new Set(['tuner', 'metronome']);
let disposed = false;

async function open(tool) {
    if (!allowed.has(tool)) return { ok: false, reason: 'unsupported-tool' };
    if (disposed) return { ok: false, reason: 'disposed' };
    // Both controllers initialize storage and attach listeners; never fetch DOM,
    // instantiate, or start audio until the owner has admitted those effects.
    return boundary.authorize();
}
function stop() { boundary.invalidate(); }
function dispose() { if (!disposed) { disposed = true; boundary.dispose(); } }
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
window.addEventListener('pagehide', stop);
window.CruiseStudio.portProComponents = Object.freeze({ open, stop, dispose });
