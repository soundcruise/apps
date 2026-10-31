import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReference, TUNING_PRESET_LIST, getTuningTargets } from '../js/modules/tuner/reference.mjs';
import coordinatorModule from '../js/core/audio-coordinator.js';

function fixture({ resume, close } = {}) {
    const contexts = [], coordinator = coordinatorModule.createCoordinator();
    const reference = createReference({ coordinator, createContext: () => {
        const context = { state: 'suspended', sampleRate: 44100, destination: {}, nodes: [], resume: async () => { await resume?.(); context.state = 'running'; }, close: async () => { await close?.(); context.state = 'closed'; },
            createBuffer: (channels, length) => ({ copyToChannel(samples) { assert.equal(samples.length, length); assert(samples.every(Number.isFinite)); } }),
            createBufferSource() { const source = { connect() {}, disconnect() {}, stop() { this.stopped = true; }, start() { this.started = true; } }; context.nodes.push(source); return source; },
            createGain() { return { gain: {}, connect() {}, disconnect() {} }; } };
        contexts.push(context); return context;
    } });
    return { reference, coordinator, contexts };
}
test('all tuning targets are the direct Port owner exports, including Free', async () => {
    const owner = await import('../../cruise-port/tuner-tuning.js?v=1.1.6');
    assert.equal(TUNING_PRESET_LIST, owner.TUNING_PRESET_LIST); assert.equal(getTuningTargets, owner.getTuningTargets);
    assert.deepEqual(getTuningTargets('free', 0), []); assert.equal(getTuningTargets('drop-d', 0)[0].note, 'D2');
});
test('reference cold import/creation performs no audio IO; target starts one owned context and ends cleanly', async () => {
    const f = fixture(); assert.equal(f.contexts.length, 0);
    assert(await f.reference.play(getTuningTargets('standard', 0)[0])); assert.equal(f.contexts.length, 1);
    assert.equal(f.coordinator.snapshot()[0].contextCount, 1); assert(f.contexts[0].nodes[0].started);
    f.contexts[0].nodes[0].onended(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.contexts[0].state, 'closed'); assert.equal(f.coordinator.snapshot()[0].resourceType, null); await f.reference.dispose();
});
test('reference does not steal mic or metronome leases and rejects malformed targets', async () => {
    const f = fixture(), mic = f.coordinator.register({ sessionId: 'mic', ownerFeatureId: 'port.tuner', cleanup() {} });
    const lease = f.coordinator.request(mic, 'microphone/session');
    assert.equal(await f.reference.play({ targetFrequency: 440 }), false); assert.equal(f.contexts.length, 0);
    f.coordinator.release(mic, lease);
    for (const value of [null, {}, { targetFrequency: NaN }, { targetFrequency: 0 }, { targetFrequency: 50000 }]) assert.equal(await f.reference.play(value), false);
    await f.reference.dispose();
});
test('Stop during pending resume never starts late or touches a newer context', async () => {
    let finish; const pending = new Promise(resolve => finish = resolve); let calls = 0;
    const f = fixture({ resume: () => ++calls === 1 ? pending : undefined });
    const old = f.reference.play({ targetFrequency: 440 }); await f.reference.stop();
    assert(await f.reference.play({ targetFrequency: 220 })); finish(); assert.equal(await old, false);
    assert.equal(f.contexts[1].state, 'running'); assert(f.contexts[1].nodes[0].started); await f.reference.dispose();
});
test('failed context close retains lease until explicit retry; Global Stop closes the reference', async () => {
    let fail = true; const f = fixture({ close: () => { if (fail) throw Error('fixture close'); } });
    await f.reference.play({ targetFrequency: 440 }); assert.equal((await f.reference.stop()).ok, false);
    assert.equal(f.coordinator.snapshot()[0].contextCount, 1); assert.equal(await f.reference.play({ targetFrequency: 220 }), false);
    fail = false; assert((await f.reference.stop()).ok); assert(await f.reference.play({ targetFrequency: 220 }));
    assert((await f.coordinator.stopAll()).every(result => result.ok)); assert.equal(f.coordinator.snapshot()[0].contextCount, 0); await f.reference.dispose();
});
test('Port tuner surface and memory-only score reference keep their separate owners', () => {
    const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(read('../index.html'), /class="metronome-advanced" disabled/);
    assert.match(read('../index.html'), /id="port-tuner-surface"/);
    assert.doesNotMatch(read('../index.html'), /id="tuner-apply"|id="tuner-cancel"/);
    assert.match(read('../js/modules/tuner/port-surface.js'), /cruise-port\//);
    const source = read('../js/modules/tuner/reference.mjs'); assert.match(source, /synthesizeReferencePluck/);
    assert.doesNotMatch(source, /localStorage|indexedDB|fetch\(|tuner-store|sync-account/);
});
