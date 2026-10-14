import { createDetailedPitchDetector, TUNER_ENGINE_DEFAULTS } from '../../../../cruise-port/tuner-engine.js?v=1.1.4';
// Port UI default, not the engine's fallback RMS threshold. Source parity is tested.
export const STANDARD_THRESHOLD_DB = -80;
export const CAPTURE_CONSTRAINTS = Object.freeze({ audio: Object.freeze({ echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: Object.freeze({ ideal: 1 }) }), video: false });
export { TUNER_ENGINE_DEFAULTS };
const codes = { NotAllowedError: 'permission-denied', NotFoundError: 'no-device', NotReadableError: 'device-busy', OverconstrainedError: 'constraints', SecurityError: 'insecure-context', AbortError: 'aborted', NotSupportedError: 'unsupported' };
export function createRuntime({ coordinator, environment = {}, sessionId = 'studio.tuner.standard' }) {
    const g = globalThis, env = { mediaDevices: g.navigator?.mediaDevices, windowTarget: g.window, documentTarget: g.document, secure: g.isSecureContext,
        createContext: () => new (g.AudioContext || g.webkitAudioContext)(), setTimer: g.setTimeout?.bind(g), clearTimer: g.clearTimeout?.bind(g), now: () => g.performance?.now?.() ?? Date.now(), ...environment };
    let run = null, generation = 0, disposed = false, destroyed = false, state = 'idle', reason = null, error = null, reading = null, diagnostics = null, requests = 0;
    const listeners = new Set(), failed = new Set(), closing = new Set(), bindings = [];
    const snapshot = () => Object.freeze({ state, reason, error, reading, diagnostics, sessionId, pendingRequests: requests, pendingCleanup: closing.size + failed.size, canStart: !disposed && !run && !closing.size && !failed.size });
    const publish = () => { for (const fn of listeners) { try { fn(snapshot()); } catch { /* isolate UI */ } } };
    const current = old => !disposed && run === old && generation === old.generation && coordinator.isLeaseCurrent(handle, old.lease);
    function unbind(old) { old.bindings.splice(0).forEach(off => off()); }
    function bind(target, name, fn, list = bindings) { if (!target?.addEventListener) return; target.addEventListener(name, fn); list.push(() => target.removeEventListener(name, fn)); }
    function cancelAnalysis(old) { if (old.timer !== null) { env.clearTimer(old.timer); old.timer = null; } unbind(old); }
    function stopTracks(old) {
        if (!old.stream) return;
        let problem = null;
        for (const track of old.stream.getTracks()) { try { track.stop(); } catch (e) { problem = e; } }
        if (old.stream.getTracks().some(track => track.readyState !== 'ended')) throw problem || new Error('Microphone track cleanup failed');
        old.stream = null;
    }
    function closeRun(old) {
        if (!old) return Promise.resolve({ ok: true });
        if (!old.closing) { failed.delete(old); old.cleanupError = null; }
        cancelAnalysis(old);
        // A late stream can arrive while context.close is pending. Stop it on every call.
        try { stopTracks(old); } catch (e) { old.cleanupError = old.cleanupError || e; }
        for (const key of ['source', 'analyser']) { try { old[key]?.disconnect(); old[key] = null; } catch (e) { old.cleanupError = old.cleanupError || e; } }
        if (old.closing) return old.closing;
        // Track stop and analysis cancellation are synchronous. close remains an owner operation.
        let close; try { close = old.context && old.context.state !== 'closed' ? old.context.close() : undefined; } catch (e) { close = Promise.reject(e); }
        old.closing = Promise.resolve(close).then(() => {
            if (old.cleanupError) throw old.cleanupError;
            if (old.context && old.context.state !== 'closed') throw new Error('Audio context did not close');
            if (old.context) coordinator.forgetContext(handle, old.context);
            coordinator.release(handle, old.lease); return { ok: true };
        }).catch(e => {
            failed.add(old);
            if (!disposed && !run) { state = 'failed'; error = 'cleanup-failed'; publish(); }
            return { ok: false, error: String(e.message || e) };
        }).finally(() => { closing.delete(old.closing); old.closing = null; publish(); });
        closing.add(old.closing); publish(); return old.closing;
    }
    function stop(why = 'cancelled') {
        generation++; const old = run; run = null; reading = diagnostics = null; reason = why; state = disposed ? 'disposed' : 'releasing';
        const candidates = new Set(failed); if (old) candidates.add(old);
        for (const candidate of candidates) closeRun(candidate);
        publish(); const token = generation;
        return Promise.all([...closing]).then(results => {
            const failure = results.find(r => !r.ok);
            if (token === generation && !run) { state = disposed ? 'disposed' : failure || failed.size ? 'failed' : why === 'interrupted' || why === 'device-disconnected' ? 'interrupted' : 'idle'; if (failure) error = 'cleanup-failed'; else if (!failed.size && error === 'cleanup-failed') error = null; publish(); }
            return failure || { ok: true };
        });
    }
    const handle = coordinator.register({ sessionId, ownerFeatureId: 'port.tuner', cleanup: async why => { const result = await stop(why); if (!result.ok || failed.size) throw new Error(result.error || 'Microphone cleanup failed'); }, notify: event => {
        if (event.kind === 'interruption') void stop('interrupted');
        if (event.kind === 'visibility' && event.detail?.hidden) void stop('visibility-hidden');
        // Device topology changes alone do not mean the active track ended. Track ended owns that decision.
    } });
    function analyze(old) {
        old.timer = null; if (!current(old) || state !== 'active') return;
        const started = env.now();
        try {
            old.analyser.getFloatTimeDomainData(old.samples);
            const detection = old.detector(old.samples, old.context.sampleRate);
            if (!current(old)) return;
            reading = detection.result ? Object.freeze({ ...detection.result }) : null;
            diagnostics = Object.freeze({ reason: detection.diagnostics.reason, confidence: detection.diagnostics.confidence });
            publish();
        } catch { if (current(old)) { error = 'analysis-failed'; void stop('failed'); } return; }
        if (current(old) && state === 'active') old.timer = env.setTimer(() => analyze(old), Math.max(0, 50 - (env.now() - started)));
    }
    function start() {
        if (disposed) return Promise.resolve(false);
        if (run) return run.promise || Promise.resolve(state === 'active');
        if (closing.size || failed.size) return Promise.resolve(false);
        error = null; reason = null; reading = diagnostics = null;
        if (env.secure === false || !env.mediaDevices?.getUserMedia) { state = 'failed'; error = env.secure === false ? 'insecure-context' : 'unsupported'; publish(); return Promise.resolve(false); }
        const lease = coordinator.request(handle, 'microphone/session');
        if (!lease) { state = 'failed'; error = 'resource-busy'; publish(); return Promise.resolve(false); }
        const old = { lease, generation: ++generation, context: null, stream: null, source: null, analyser: null, timer: null, bindings: [], promise: null, closing: null };
        run = old; state = 'requesting';
        let resume;
        try {
            old.context = env.createContext(); coordinator.ownContext(handle, lease, old.context);
            resume = old.context.state === 'running' ? undefined : old.context.resume();
        } catch (e) { resume = Promise.reject(e); }
        publish();
        old.promise = (async () => {
            try {
                await resume; if (!current(old)) { await closeRun(old); return false; }
                if (!Number.isFinite(old.context.sampleRate) || old.context.sampleRate <= 0) throw new Error('Invalid sample rate');
                requests++; publish();
                try { old.stream = await env.mediaDevices.getUserMedia(CAPTURE_CONSTRAINTS); } finally { requests--; }
                if (!current(old)) { await closeRun(old); return false; }
                const tracks = old.stream.getAudioTracks(); if (!tracks.length || tracks.some(t => t.readyState === 'ended')) throw Object.assign(new Error('No live microphone'), { name: 'NotFoundError' });
                if (old.context.state !== 'running') await old.context.resume();
                if (!current(old)) { await closeRun(old); return false; }
                old.source = old.context.createMediaStreamSource(old.stream); old.analyser = old.context.createAnalyser();
                let size = 4096; while (size < 32768 && size / old.context.sampleRate < 0.08) size *= 2;
                old.analyser.fftSize = size; old.samples = new Float32Array(size);
                old.detector = createDetailedPitchDetector({ rmsThreshold: 10 ** (STANDARD_THRESHOLD_DB / 20) });
                old.source.connect(old.analyser); // No destination connection: never monitor microphone through speakers.
                for (const track of old.stream.getTracks()) bind(track, 'ended', () => { if (current(old)) { error = 'device-disconnected'; void stop('device-disconnected'); } }, old.bindings);
                bind(old.context, 'statechange', () => { if (current(old) && state === 'active' && old.context.state !== 'running') coordinator.notify(handle, 'interruption', { state: old.context.state }); }, old.bindings);
                if (!current(old) || !coordinator.grant(handle, lease)) { await closeRun(old); return false; }
                state = 'active'; publish(); analyze(old); return true;
            } catch (e) {
                if (current(old)) { error = codes[e.name] || 'audio-failed'; await stop('failed'); if (!disposed && generation === old.generation + 1 && !run) { state = 'failed'; publish(); } }
                else await closeRun(old);
                return false;
            }
        })();
        return old.promise;
    }
    bind(env.windowTarget, 'pagehide', () => { void stop('pagehide'); });
    bind(env.windowTarget, 'unload', () => { void stop('unload'); });
    bind(env.documentTarget, 'visibilitychange', () => coordinator.notify(handle, 'visibility', { hidden: env.documentTarget.hidden }));
    bind(env.mediaDevices, 'devicechange', () => coordinator.notify(handle, 'devicechange', {}));
    return Object.freeze({ start, stop, snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, async dispose() {
        if (destroyed) return { ok: true }; disposed = true; bindings.splice(0).forEach(off => off());
        const result = await coordinator.disposeSession(handle); if (result.ok) { destroyed = true; listeners.clear(); } return result;
    } });
}
