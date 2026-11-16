import {insist, freeze, clone, assertJSON} from './json.mjs';

// This owner has no Project Repository, EditingSession, save/undo or command API.
// Freezing is an in-process boundary, not DRM or a same-origin security boundary.
export function createReadOnlyScore({codec, normalizePresentation, playbackState = () => 'paused'}) {
    let current = null, request = 0, disposed = false;
    function ready() { insist(!disposed, 'viewer-disposed'); insist(current, 'no-viewer-score'); }
    function stopped() { insist(['paused','ended'].includes(playbackState()), 'stop-before-replacing-score'); }
    async function open(bytes) {
        insist(!disposed, 'viewer-disposed'); stopped();
        const ticket = ++request, decoded = await codec.decode(bytes);
        insist(!disposed && ticket === request, 'stale-viewer-load'); stopped();
        // Publish once, after validation/hash checks. Failed reads leave current intact.
        current = Object.freeze({document:decoded.document, byteHash:decoded.byteHash,
            warnings:decoded.warnings, presentation:decoded.document.defaultPresentation});
        return current;
    }
    function setPresentation(value) {
        ready(); assertJSON(value);
        const normalized = normalizePresentation(clone(value), current.document.score);
        current = Object.freeze({...current, presentation:freeze(clone(normalized.value))});
        return current;
    }
    function renderWith(renderer, container, options = {}) {
        ready();
        // The read-only flag wins even if an editor accidentally passes its options.
        return renderer.render(current.document.score, container, {...options, readOnly:true, editableSlots:false});
    }
    return Object.freeze({open, read() { ready(); return current; }, setPresentation, renderWith,
        dispose() { disposed = true; request++; current = null; }});
}
