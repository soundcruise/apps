import assert from 'node:assert/strict';
import {
    TUNER_PREVIEW_DEFAULTS,
    createTunerPreviewAudioController
} from './tuner-preview-audio.js';

class FakeEventTarget {
    constructor() {
        this.hidden = false;
        this.listeners = new Map();
    }

    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(listener);
    }

    removeEventListener(type, listener) {
        this.listeners.get(type)?.delete(listener);
    }

    dispatch(type) {
        for (const listener of this.listeners.get(type) || []) listener({ type });
    }
}

class FakeAudioContext {
    static instances = [];

    constructor() {
        this.sampleRate = 48000;
        this.currentTime = 0;
        this.state = 'suspended';
        this.destination = { name: 'destination' };
        this.resumeCalls = 0;
        this.suspendCalls = 0;
        this.closeCalls = 0;
        this.sources = [];
        this.filters = [];
        this.gains = [];
        FakeAudioContext.instances.push(this);
    }

    async resume() { this.resumeCalls += 1; this.state = 'running'; }
    async suspend() { this.suspendCalls += 1; this.state = 'suspended'; }
    async close() { this.closeCalls += 1; this.state = 'closed'; }

    createBuffer(channels, length, sampleRate) {
        return {
            channels,
            length,
            sampleRate,
            data: null,
            copyToChannel(data) { this.data = data; }
        };
    }

    createBufferSource() {
        const source = {
            buffer: null,
            starts: [],
            stops: [],
            connections: [],
            onended: null,
            connect(node) { this.connections.push(node); },
            start(time) { this.starts.push(time); },
            stop(time) { this.stops.push(time); }
        };
        this.sources.push(source);
        return source;
    }

    createBiquadFilter() {
        const filter = {
            type: '',
            frequency: { value: 0 },
            Q: { value: 0 },
            gain: { value: 0 },
            connections: [],
            connect(node) { this.connections.push(node); }
        };
        this.filters.push(filter);
        return filter;
    }

    createGain() {
        const gain = {
            gain: {
                value: 0,
                calls: [],
                cancelScheduledValues(time) { this.calls.push(['cancel', time]); },
                setValueAtTime(value, time) { this.calls.push(['set', value, time]); },
                linearRampToValueAtTime(value, time) { this.calls.push(['ramp', value, time]); }
            },
            connections: [],
            connect(node) { this.connections.push(node); }
        };
        this.gains.push(gain);
        return gain;
    }
}

{
    const documentTarget = new FakeEventTarget();
    const windowTarget = new FakeEventTarget();
    const audioSession = { type: 'auto' };
    const controller = createTunerPreviewAudioController({
        environment: {
            AudioContextClass: FakeAudioContext,
            documentTarget,
            windowTarget,
            navigatorObject: { audioSession }
        }
    });
    assert.equal(controller.getState().hasContext, false, 'audio context stays lazy until a card tap');
    assert.equal(await controller.play({ targetFrequency: 82.4068892282175 }), true);

    const context = FakeAudioContext.instances.at(-1);
    assert.equal(context.resumeCalls, 1, 'card tap resumes a suspended context');
    assert.equal(audioSession.type, 'playback');
    assert.equal(context.sources.length, 1);
    assert.equal(context.sources[0].buffer.length, 72000, '1.0s duration plus 0.5s sustain at 48kHz');
    assert.equal(context.sources[0].starts[0], 0);
    assert.equal(context.sources[0].stops[0], 1.5);
    assert.equal(context.filters.length, 5, 'three body filters, presence, and high-cut match pitch cruise');
    assert.equal(context.gains[0].gain.value, 0.495, 'pitch cruise velocity 0.7 gain is preserved');
    assert.equal(controller.getState().playing, true);

    assert.equal(await controller.play({ targetFrequency: 110 }), true);
    assert.equal(context.sources.length, 2, 'same context is reused for rapid card changes');
    assert.equal(context.sources[0].stops.at(-1), TUNER_PREVIEW_DEFAULTS.releaseSeconds, 'prior sound receives a short release');
    assert.equal(controller.getState().playing, true);

    documentTarget.hidden = true;
    documentTarget.dispatch('visibilitychange');
    await Promise.resolve();
    assert.equal(controller.getState().playing, false, 'backgrounding stops playback');
    assert.equal(context.suspendCalls, 1, 'backgrounding suspends the preview context');

    await controller.play({ targetFrequency: 146.8323839587038 });
    windowTarget.dispatch('pagehide');
    await Promise.resolve();
    assert.equal(controller.getState().playing, false, 'pagehide stops playback');

    controller.destroy();
    assert.equal(context.closeCalls, 1, 'destroy closes the dedicated preview context');
}

{
    const controller = createTunerPreviewAudioController({ environment: { AudioContextClass: FakeAudioContext } });
    assert.equal(await controller.play({ targetFrequency: 0 }), false);
    assert.equal(await controller.play(null), false);
    assert.equal(controller.getState().hasContext, false, 'invalid cards never allocate audio resources');
}

console.log('tuner-preview-audio: acoustic guitar preview and lifecycle tests passed');
