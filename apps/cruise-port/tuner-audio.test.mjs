import assert from 'node:assert/strict';
import { createTunerAudioController, TUNER_AUDIO_CONSTRAINTS } from './tuner-audio.js';
import { createPitchDetector } from './tuner-engine.js';

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

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

class FakeTrack extends FakeEventTarget {
    constructor(sampleRate = 48000, settings = {}) {
        super();
        this.sampleRate = sampleRate;
        this.settings = settings;
        this.readyState = 'live';
        this.stopCalls = 0;
    }

    getSettings() {
        return { sampleRate: this.sampleRate, ...this.settings };
    }

    stop() {
        this.stopCalls += 1;
        this.readyState = 'ended';
    }
}

function createStream(sampleRate = 48000, settings = {}) {
    const track = new FakeTrack(sampleRate, settings);
    return {
        track,
        getTracks: () => [track],
        getAudioTracks: () => [track]
    };
}

function createTimers() {
    let nextId = 1;
    const callbacks = new Map();
    return {
        setTimeout(callback) {
            const id = nextId;
            nextId += 1;
            callbacks.set(id, callback);
            return id;
        },
        clearTimeout(id) {
            callbacks.delete(id);
        },
        runNext() {
            const first = callbacks.entries().next().value;
            if (!first) return false;
            callbacks.delete(first[0]);
            first[1]();
            return true;
        },
        get size() {
            return callbacks.size;
        }
    };
}

function createContextClass({
    sampleRate = 48000,
    resumeError = null,
    resumeDeferred = null,
    waveform = null
} = {}) {
    const instances = [];
    class FakeAudioContext {
        constructor() {
            this.sampleRate = sampleRate;
            this.state = resumeError || resumeDeferred ? 'suspended' : 'running';
            this.closeCalls = 0;
            this.resumeCalls = 0;
            this.source = null;
            this.analyser = null;
            instances.push(this);
        }

        async resume() {
            this.resumeCalls += 1;
            if (resumeDeferred) await resumeDeferred.promise;
            if (resumeError) throw resumeError;
            if (this.state !== 'closed') this.state = 'running';
        }

        createMediaStreamSource() {
            this.source = {
                connectedTo: null,
                disconnectCalls: 0,
                connect: (node) => { this.source.connectedTo = node; },
                disconnect: () => { this.source.disconnectCalls += 1; }
            };
            return this.source;
        }

        createAnalyser() {
            this.analyser = {
                fftSize: 2048,
                disconnectCalls: 0,
                getFloatTimeDomainData: (target) => {
                    if (waveform) target.set(waveform.subarray(0, target.length));
                    else target.fill(0);
                },
                disconnect: () => { this.analyser.disconnectCalls += 1; }
            };
            return this.analyser;
        }

        async close() {
            this.closeCalls += 1;
            this.state = 'closed';
        }
    }
    FakeAudioContext.instances = instances;
    return FakeAudioContext;
}

function createHarness({
    getUserMedia,
    getSupportedConstraints,
    audioSession,
    ContextClass,
    detectorFactory,
    detailedDetectorFactory,
    diagnosticEnabled,
    rmsThreshold,
    onResult,
    onInputLevel,
    onDiagnostic,
    onStateChange,
    onError
} = {}) {
    const documentTarget = new FakeEventTarget();
    const windowTarget = new FakeEventTarget();
    const timers = createTimers();
    let getUserMediaCalls = 0;
    const requestedConstraints = [];
    const gum = getUserMedia || (async () => createStream());
    const controller = createTunerAudioController({
        onResult,
        onInputLevel,
        onDiagnostic,
        onStateChange,
        onError,
        diagnosticEnabled,
        rmsThreshold,
        environment: {
            navigatorObject: {
                ...(audioSession ? { audioSession } : {}),
                mediaDevices: {
                    getUserMedia: (constraints) => {
                        getUserMediaCalls += 1;
                        requestedConstraints.push(constraints);
                        return gum(constraints);
                    },
                    getSupportedConstraints: getSupportedConstraints || (() => ({}))
                }
            },
            AudioContextClass: ContextClass || createContextClass(),
            documentTarget,
            windowTarget,
            isSecureContext: true,
            setTimeout: timers.setTimeout,
            clearTimeout: timers.clearTimeout,
            now: () => 0,
            detectorFactory: detectorFactory || (() => () => null),
            detailedDetectorFactory: detailedDetectorFactory || (() => () => ({
                result: null,
                diagnostics: { reason: 'low-rms', rms: 0, rmsDbfs: Number.NEGATIVE_INFINITY }
            }))
        }
    });
    return {
        controller,
        documentTarget,
        windowTarget,
        timers,
        get getUserMediaCalls() { return getUserMediaCalls; },
        requestedConstraints
    };
}

{
    const calls = [];
    let audioSessionType = 'playback';
    const audioSession = {};
    Object.defineProperty(audioSession, 'type', {
        enumerable: true,
        get: () => audioSessionType,
        set(value) {
            audioSessionType = value;
            calls.push(`audioSession:${value}`);
        }
    });
    const harness = createHarness({
        audioSession,
        getUserMedia: async () => {
            calls.push('getUserMedia');
            return createStream();
        }
    });
    assert.equal(await harness.controller.start(), true, 'preview playback state can transition to microphone capture');
    assert.equal(audioSession.type, 'play-and-record');
    assert.deepEqual(calls, ['audioSession:play-and-record', 'getUserMedia'], 'capture session is requested before getUserMedia');
    await harness.controller.stop();
}

{
    const harness = createHarness();
    assert.equal(await harness.controller.start(), true, 'browsers without Audio Session API keep the existing microphone path');
    assert.equal(harness.getUserMediaCalls, 1);
    await harness.controller.stop();
}

{
    const errors = [];
    const ContextClass = createContextClass();
    const audioSession = {};
    const failure = new Error('Audio Session type could not be changed.');
    failure.name = 'InvalidStateError';
    Object.defineProperty(audioSession, 'type', {
        enumerable: true,
        get: () => 'playback',
        set() { throw failure; }
    });
    const harness = createHarness({
        audioSession,
        ContextClass,
        onError: (error) => errors.push(error)
    });
    assert.equal(await harness.controller.start(), false, 'Audio Session assignment failures use the existing error path');
    assert.equal(harness.getUserMediaCalls, 0, 'failed Audio Session assignment does not request a microphone stream');
    assert.equal(harness.controller.getState().status, 'error');
    assert.equal(errors[0].code, 'unknown');
    assert.equal(ContextClass.instances[0].closeCalls, 1, 'failed Audio Session assignment closes the microphone context');
}

{
    const ContextClass = createContextClass();
    const factoryThresholds = [];
    const inputLevels = [];
    const results = [];
    const harness = createHarness({
        ContextClass,
        rmsThreshold: 0.003,
        onResult: (value) => results.push(value),
        onInputLevel: (value) => inputLevels.push(value),
        detailedDetectorFactory: (options) => {
            factoryThresholds.push(options.rmsThreshold);
            const threshold = options.rmsThreshold;
            return () => ({
                result: threshold === 0.0008 ? { frequency: 82.4, confidence: 0.9 } : null,
                diagnostics: {
                    reason: threshold === 0.0008 ? 'valid' : 'low-rms',
                    rms: 0.0012,
                    rmsDbfs: -58.4,
                    rmsThreshold: threshold
                }
            });
        }
    });
    await harness.controller.start();
    assert.deepEqual(factoryThresholds, [0.003]);
    harness.timers.runNext();
    assert.equal(results[0], null);
    assert.deepEqual(inputLevels[0], { rms: 0.0012, rmsDbfs: -58.4 });

    assert.equal(harness.controller.setRmsThreshold(0.0008), true);
    assert.deepEqual(factoryThresholds, [0.003, 0.0008]);
    assert.equal(harness.getUserMediaCalls, 1, 'threshold switch does not reacquire the stream');
    assert.equal(ContextClass.instances.length, 1, 'threshold switch does not recreate AudioContext');
    assert.equal(harness.controller.getState().rmsThreshold, 0.0008);
    harness.timers.runNext();
    assert.equal(results[1].frequency, 82.4, 'next frame uses the replacement detector');

    assert.equal(harness.controller.setRmsThreshold(-1), false);
    assert.equal(harness.controller.getState().rmsThreshold, 0.0008);
    assert.deepEqual(factoryThresholds, [0.003, 0.0008]);
    await harness.controller.stop();
}

{
    const ordinaryResult = { frequency: 82.4, confidence: 0.99 };
    let detailedFactoryCalls = 0;
    const results = [];
    const diagnostics = [];
    const harness = createHarness({
        detectorFactory: () => () => ordinaryResult,
        detailedDetectorFactory: () => {
            detailedFactoryCalls += 1;
            return () => ({ result: null, diagnostics: { reason: 'other' } });
        },
        onResult: (value) => results.push(value),
        onDiagnostic: (value) => diagnostics.push(value)
    });
    await harness.controller.start();
    harness.timers.runNext();
    assert.strictEqual(results[0], ordinaryResult, 'normal mode keeps raw result callback behavior');
    assert.equal(diagnostics.length, 0, 'normal mode emits no diagnostics');
    assert.equal(detailedFactoryCalls, 0, 'normal mode does not create a detailed detector');
    await harness.controller.stop();
}

{
    const rawResult = { frequency: 82.4, confidence: 0.91 };
    const results = [];
    const diagnostics = [];
    const stream = createStream(48000, {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        deviceId: 'must-not-leak',
        groupId: 'must-not-leak'
    });
    const harness = createHarness({
        getUserMedia: async () => stream,
        getSupportedConstraints: () => ({
            sampleRate: true,
            channelCount: true,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            deviceId: true
        }),
        diagnosticEnabled: true,
        detailedDetectorFactory: () => () => ({
            result: rawResult,
            diagnostics: {
                reason: 'valid',
                rms: 0.0049,
                rmsDbfs: -46.2,
                confidence: 0.91,
                candidateLag: 582,
                rawFrequency: 82.57,
                finalFrequency: 82.4
            }
        }),
        onResult: (value) => results.push(value),
        onDiagnostic: (value) => diagnostics.push(value)
    });
    await harness.controller.start();
    harness.timers.runNext();
    assert.strictEqual(results[0], rawResult, 'diagnostic mode preserves onResult payload');
    assert.equal(diagnostics[0].reason, 'valid');
    assert.equal(diagnostics[0].sampleRate, 48000);
    assert.equal(diagnostics[0].fftSize, 4096);
    assert.deepEqual(diagnostics[0].trackSettings, {
        sampleRate: 48000,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
    });
    assert.equal(diagnostics[0].trackSettings.deviceId, undefined);
    assert.equal(diagnostics[0].supportedConstraints.deviceId, undefined);
    await harness.controller.stop();
    assert.equal(harness.timers.size, 0, 'diagnostic mode cleans up its analysis timer');
}

{
    const resumeGate = deferred();
    const ContextClass = createContextClass({ resumeDeferred: resumeGate });
    const harness = createHarness({ ContextClass });
    const startPromise = harness.controller.start();
    await Promise.resolve();
    await harness.controller.stop();
    resumeGate.resolve();
    assert.equal(await startPromise, false, 'stop invalidates a pending context resume');
    assert.equal(harness.getUserMediaCalls, 0, 'stale resume never requests a stream');
    assert.equal(harness.controller.getState().status, 'idle');
}

{
    const pendingStream = deferred();
    const staleStream = createStream();
    const harness = createHarness({ getUserMedia: () => pendingStream.promise });
    const firstStart = harness.controller.start();
    const secondStart = harness.controller.start();
    assert.strictEqual(firstStart, secondStart, 'starting calls share one promise');
    assert.equal(harness.getUserMediaCalls, 1, 'starting calls request one stream');
    await harness.controller.stop();
    pendingStream.resolve(staleStream);
    assert.equal(await firstStart, false);
    assert.equal(staleStream.track.stopCalls, 1, 'stale stream is stopped');
    assert.equal(harness.controller.getState().status, 'idle');
}

{
    const firstPending = deferred();
    const secondPending = deferred();
    const staleStream = createStream();
    const activeStream = createStream();
    let requestIndex = 0;
    const harness = createHarness({
        getUserMedia: () => {
            requestIndex += 1;
            return requestIndex === 1 ? firstPending.promise : secondPending.promise;
        }
    });
    const firstStart = harness.controller.start();
    await harness.controller.stop();
    const secondStart = harness.controller.start();
    secondPending.resolve(activeStream);
    assert.equal(await secondStart, true);
    firstPending.resolve(staleStream);
    assert.equal(await firstStart, false);
    assert.equal(staleStream.track.stopCalls, 1, 'old generation stops only its own stream');
    assert.equal(activeStream.track.stopCalls, 0, 'old generation does not stop the active stream');
    assert.equal(harness.controller.getState().status, 'running');
    await harness.controller.stop();
}

{
    const stream = createStream();
    const ContextClass = createContextClass();
    const harness = createHarness({
        ContextClass,
        getUserMedia: async () => {
            ContextClass.instances[0].state = 'suspended';
            return stream;
        }
    });
    assert.equal(await harness.controller.start(), true);
    assert.equal(ContextClass.instances[0].resumeCalls, 1, 'context suspended during permission flow is resumed');
    await harness.controller.stop();
}

{
    const stream = createStream();
    const ContextClass = createContextClass();
    const harness = createHarness({ getUserMedia: async () => stream, ContextClass });
    assert.equal(await harness.controller.start(), true);
    assert.equal(await harness.controller.start(), true);
    assert.equal(harness.getUserMediaCalls, 1, 'running start does not reacquire');
    assert.deepEqual(harness.requestedConstraints[0], TUNER_AUDIO_CONSTRAINTS);
    assert.equal(harness.controller.getState().sampleRate, 48000);
    assert.equal(harness.controller.getState().trackSampleRate, 48000);
    assert.equal(harness.controller.getState().analyserFftSize, 4096);
    assert.equal(ContextClass.instances[0].source.connectedTo, ContextClass.instances[0].analyser);
    assert.equal(harness.timers.size, 1);
    await harness.controller.stop();
    await harness.controller.stop();
    assert.equal(stream.track.stopCalls, 1, 'repeated stop stops the track once');
    assert.equal(ContextClass.instances[0].source.disconnectCalls, 1);
    assert.equal(ContextClass.instances[0].analyser.disconnectCalls, 1);
    assert.equal(ContextClass.instances[0].closeCalls, 1);
    assert.equal(harness.timers.size, 0, 'stop clears analysis timer');
}

{
    const stream = createStream();
    const ContextClass = createContextClass();
    const harness = createHarness({ getUserMedia: async () => stream, ContextClass });
    await harness.controller.start();
    stream.getTracks = () => { throw new Error('track enumeration failed'); };
    await harness.controller.stop();
    assert.equal(ContextClass.instances[0].source.disconnectCalls, 1, 'source cleanup survives getTracks failure');
    assert.equal(ContextClass.instances[0].analyser.disconnectCalls, 1, 'analyser cleanup survives getTracks failure');
    assert.equal(ContextClass.instances[0].closeCalls, 1, 'context cleanup survives getTracks failure');
}

{
    const stream = createStream();
    const harness = createHarness({ getUserMedia: async () => stream });
    await harness.controller.start();
    await harness.controller.destroy();
    assert.equal(await harness.controller.start(), false);
    assert.equal(harness.getUserMediaCalls, 1, 'destroyed controller cannot restart');
    assert.equal(harness.controller.getState().status, 'destroyed');
}

for (const [name, expectedCode] of [
    ['NotAllowedError', 'permission-denied'],
    ['NotFoundError', 'no-device'],
    ['NotReadableError', 'device-busy'],
    ['SecurityError', 'insecure-context'],
    ['OverconstrainedError', 'constraints'],
    ['AbortError', 'aborted'],
    ['OtherError', 'unknown']
]) {
    const errors = [];
    const failure = new Error(name);
    failure.name = name;
    const ContextClass = createContextClass();
    const harness = createHarness({
        ContextClass,
        getUserMedia: async () => { throw failure; },
        onError: (error) => errors.push(error)
    });
    assert.equal(await harness.controller.start(), false);
    assert.equal(errors.at(-1).code, expectedCode, `${name} classification`);
    assert.equal(harness.controller.getState().status, 'error');
    assert.equal(ContextClass.instances[0].closeCalls, 1, `${name} closes its context`);
}

for (const [isSecureContext, expectedCode] of [
    [false, 'insecure-context'],
    [true, 'unsupported']
]) {
    const errors = [];
    const controller = createTunerAudioController({
        onError: (error) => errors.push(error),
        environment: {
            navigatorObject: {},
            AudioContextClass: createContextClass(),
            documentTarget: new FakeEventTarget(),
            windowTarget: new FakeEventTarget(),
            isSecureContext
        }
    });
    assert.equal(await controller.start(), false);
    assert.equal(errors[0].code, expectedCode, 'missing mediaDevices is classified safely');
}

{
    const errors = [];
    const resumeError = new Error('resume failed');
    const harness = createHarness({
        ContextClass: createContextClass({ resumeError }),
        onError: (error) => errors.push(error)
    });
    assert.equal(await harness.controller.start(), false);
    assert.equal(errors[0].code, 'audio-resume-failed');
    assert.equal(harness.getUserMediaCalls, 0, 'resume failure does not request a stream');
}

{
    const errors = [];
    const stream = createStream();
    const harness = createHarness({
        getUserMedia: async () => stream,
        onError: (error) => errors.push(error)
    });
    await harness.controller.start();
    stream.track.dispatch('ended');
    await Promise.resolve();
    assert.equal(harness.controller.getState().status, 'error');
    assert.equal(errors[0].code, 'track-ended');
    assert.equal(stream.track.stopCalls, 1);
    assert.equal(harness.timers.size, 0);
}

{
    const errors = [];
    let resultCalls = 0;
    const harness = createHarness({
        onResult: () => {
            resultCalls += 1;
            throw new Error('consumer failed');
        },
        onError: (error) => errors.push(error)
    });
    await harness.controller.start();
    assert.equal(harness.timers.runNext(), true);
    assert.equal(harness.timers.runNext(), true);
    assert.equal(resultCalls, 2, 'callback exception does not stop analysis');
    assert.equal(errors.filter((error) => error.code === 'callback-error').length, 1);
    assert.equal(harness.controller.getState().status, 'running');
    await harness.controller.stop();
}

{
    let resultCalls = 0;
    const harness = createHarness({ onResult: () => { resultCalls += 1; } });
    await harness.controller.start();
    for (let index = 0; index < 1000; index += 1) {
        assert.equal(harness.timers.size, 1, 'analysis keeps exactly one timer');
        harness.timers.runNext();
    }
    assert.equal(resultCalls, 1000);
    await harness.controller.stop();
    assert.equal(harness.timers.size, 0);
}

{
    const stream = createStream();
    const BaseContextClass = createContextClass();
    class BrokenAnalyserContext extends BaseContextClass {
        createAnalyser() {
            throw new Error('analyser failed');
        }
    }
    BrokenAnalyserContext.instances = BaseContextClass.instances;
    const harness = createHarness({
        ContextClass: BrokenAnalyserContext,
        getUserMedia: async () => stream
    });
    assert.equal(await harness.controller.start(), false);
    assert.equal(stream.track.stopCalls, 1, 'partial graph failure stops the stream');
    assert.equal(BrokenAnalyserContext.instances[0].source.disconnectCalls, 1);
    assert.equal(BrokenAnalyserContext.instances[0].closeCalls, 1);
}

{
    const stream = createStream();
    const harness = createHarness({ getUserMedia: async () => stream });
    await harness.controller.start();
    harness.documentTarget.hidden = true;
    harness.documentTarget.dispatch('visibilitychange');
    await Promise.resolve();
    assert.equal(harness.controller.getState().status, 'idle');
    assert.equal(stream.track.stopCalls, 1);
    harness.documentTarget.hidden = false;
    harness.documentTarget.dispatch('visibilitychange');
    assert.equal(harness.getUserMediaCalls, 1, 'visible does not auto-start');
}

{
    const stream = createStream();
    const harness = createHarness({ getUserMedia: async () => stream });
    await harness.controller.start();
    harness.windowTarget.dispatch('pagehide');
    await Promise.resolve();
    assert.equal(harness.controller.getState().status, 'idle');
    assert.equal(stream.track.stopCalls, 1);
}

{
    const sampleRate = 96000;
    const frequency = 82.4069;
    const waveform = new Float32Array(8192);
    for (let i = 0; i < waveform.length; i += 1) {
        waveform[i] = 0.5 * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    }
    const results = [];
    const harness = createHarness({
        ContextClass: createContextClass({ sampleRate, waveform }),
        getUserMedia: async () => createStream(48000),
        detectorFactory: createPitchDetector,
        onResult: (result) => results.push(result)
    });
    await harness.controller.start();
    harness.timers.runNext();
    assert.equal(harness.controller.getState().analyserFftSize, 8192);
    assert(results[0], 'real T1 detector returns a result');
    assert.equal(results[0].noteName, 'E');
    assert.equal(results[0].octave, 2);
    assert(Math.abs(results[0].frequency - frequency) < 0.01);
    await harness.controller.stop();
}

console.log('tuner-audio: all controller tests passed');
