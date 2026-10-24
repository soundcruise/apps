// Port owns tuning and synthesis; Studio owns only the audio lease/lifecycle.
import { synthesizeReferencePluck } from '../../../../cruise-port/tuner-preview-audio.js?v=1.12.3';
export { TUNING_PRESET_LIST, getTuningTargets, midiToNoteInfo } from '../../../../cruise-port/tuner-tuning.js?v=1.1.6';

export function createReference({ coordinator, createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)() }) {
    let run = null, closing = null, disposed = false, error = null, generation = 0, handle = null;
    const listeners = new Set();
    const snapshot = () => ({ state: closing ? 'releasing' : error ? 'failed' : run ? 'playing' : 'idle', error });
    const publish = () => { for (const fn of listeners) { try { fn(snapshot()); } catch {} } };
    async function stop() {
        generation++;
        if (closing) return closing;
        if (!run) return { ok: true };
        const old = run; run = null;
        // Keep failed ownership until an explicit retry successfully closes it.
        try { old.source?.stop(); } catch {}
        old.source && (old.source.onended = null);
        try { old.source?.disconnect(); old.gain?.disconnect(); } catch {}
        closing = Promise.resolve().then(() => old.context?.state === 'closed' ? undefined : old.context?.close()).then(() => {
            if (old.context && old.context.state !== 'closed') throw Error('Reference context did not close');
            if (old.context) coordinator.forgetContext(handle, old.context);
            coordinator.release(handle, old.lease); error = null; return { ok: true };
        }).catch(e => { run = old; error = '基準音の音声資源を解放できません。停止を再実行してください。'; return { ok: false, error: String(e) }; }).finally(() => { closing = null; publish(); });
        publish(); return closing;
    }
    function register() { if (!handle) handle = coordinator.register({ sessionId: 'studio.tuner.reference', ownerFeatureId: 'port.tuner', cleanup: async () => { const result = await stop(); if (!result.ok) throw Error(result.error); }, notify: () => { void stop(); } }); }
    async function play(target) {
        if (disposed || run || closing || !Number.isFinite(target?.targetFrequency) || target.targetFrequency < 20 || target.targetFrequency > 20000) return false;
        register();
        const lease = coordinator.request(handle, 'audio-output/session');
        if (!lease) { error = 'マイクまたは他の音声を先に停止してください。'; publish(); return false; }
        const old = { lease, context: null, source: null, gain: null }, token = ++generation; run = old; error = null;
        try {
            old.context = createContext(); coordinator.ownContext(handle, lease, old.context);
            if (old.context.state !== 'running') await old.context.resume();
            if (disposed || run !== old || token !== generation || !coordinator.isLeaseCurrent(handle, lease)) return false;
            const samples = synthesizeReferencePluck({ sampleRate: old.context.sampleRate, frequency: target.targetFrequency });
            const buffer = old.context.createBuffer(1, samples.length, old.context.sampleRate); buffer.copyToChannel(samples, 0);
            old.source = old.context.createBufferSource(); old.source.buffer = buffer;
            old.gain = old.context.createGain(); old.gain.gain.value = 0.18;
            old.source.connect(old.gain); old.gain.connect(old.context.destination);
            old.source.onended = () => { if (run === old && token === generation) void stop(); };
            if (!coordinator.grant(handle, lease)) { await stop(); return false; }
            old.source.start(); publish(); return true;
        } catch { if (run === old) { await stop(); error = error || '基準音を開始できません。音声設定を確認してください。'; publish(); } return false; }
    }
    return Object.freeze({ play, stop, snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, async dispose() { disposed = true; const result = handle ? await coordinator.disposeSession(handle) : { ok: true }; if (result.ok) listeners.clear(); return result; } });
}
