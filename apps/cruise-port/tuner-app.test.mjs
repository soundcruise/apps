import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    createInputLevelSmoother,
    createTunerDiagnosticHistory,
    createTunerSmoother,
    formatTunerDiagnosticCopy,
    initTuner,
    inputLevelPercentage,
    isTunerDebugEnabled,
    standardStringForNote
} from './tuner-app.js';
import {
    APP_DEFINITIONS,
    SCHEMA_VERSION,
    loadPracticeMenus
} from './practice-menu-store.js';

const E2_FREQUENCY = 82.4069;
const tunerMarkup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const tunerStyles = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

assert.match(tunerMarkup, /id="tuner-input-settings-panel" class="tuner-input-tools" hidden/);
assert.match(tunerMarkup, /id="tuner-tuning"/);
assert.match(tunerMarkup, /id="tuner-capo-down"[^>]+aria-label="カポを1フレット下げる"/);
assert.doesNotMatch(tunerMarkup, /カポを付けたまま調弦する場合/);
assert.match(tunerMarkup, /id="tuner-note-string"/);
assert.match(tunerMarkup, /id="tuner-note-value"/);
assert.doesNotMatch(tunerMarkup, /1本ずつ弦を鳴らしてください/);
assert.match(tunerStyles, /\.tuner-input-tools\[hidden\]\s*\{\s*display: none;/);
assert.match(tunerStyles, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);

function result(frequency, confidence = 0.99) {
    return { frequency, confidence };
}

function frequencyAtCents(frequency, cents) {
    return frequency * (2 ** (cents / 1200));
}

function deferred() {
    let resolve;
    const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
    return { promise, resolve };
}

{
    const smoother = createTunerSmoother();
    const readings = [82.40, 82.41, 82.39].map((frequency, index) => (
        smoother.push(result(frequency), index * 50)
    ));
    assert(readings.every((reading) => reading.noteName === 'E' && reading.octave === 2));
    assert(Math.abs(readings.at(-1).cents) < 1, 'small E2 variation remains stable');
}

{
    const smoother = createTunerSmoother();
    const initial = smoother.push(result(82.4), 0);
    const outlier = smoother.push(result(164.8), 50);
    const recovered = smoother.push(result(82.4), 100);
    assert.equal(`${initial.noteName}${initial.octave}`, 'E2');
    assert.equal(`${outlier.noteName}${outlier.octave}`, 'E2', 'one octave outlier is held');
    assert.equal(`${recovered.noteName}${recovered.octave}`, 'E2');
}

{
    const smoother = createTunerSmoother();
    const frequencies = [82.4, 82.4, 110, 110, 110];
    const readings = frequencies.map((frequency, index) => smoother.push(result(frequency), index * 50));
    assert.equal(`${readings[2].noteName}${readings[2].octave}`, 'E2', 'first shifted frame is not enough');
    assert.equal(`${readings[3].noteName}${readings[3].octave}`, 'A2', 'two coherent frames switch string');
    assert.equal(`${readings[4].noteName}${readings[4].octave}`, 'A2');
}

{
    const smoother = createTunerSmoother();
    const centsSequence = [0, 0, 0, 4, 6, 6, 6, 6];
    const times = [0, 50, 100, 150, 200, 250, 300, 350];
    const readings = centsSequence.map((cents, index) => (
        smoother.push(result(frequencyAtCents(E2_FREQUENCY, cents)), times[index])
    ));
    assert.equal(readings[0].direction, 'checking');
    assert.equal(readings[2].direction, 'in-tune', '±3 cent for 100ms enters in-tune');
    assert.equal(readings[3].direction, 'in-tune', 'within ±5 cent keeps in-tune');
    assert.equal(readings.at(-1).direction, 'high', 'smoothed pitch over ±5 cent exits in-tune');
}

{
    const smoother = createTunerSmoother();
    const E4 = 329.6275569128699;
    const sequence = [
        [0, 0],
        [55, 1000],
        [55, 2000],
        [60, 3000],
        [60, 4000]
    ];
    const readings = sequence.map(([cents, timestamp]) => (
        smoother.push(result(frequencyAtCents(E4, cents)), timestamp)
    ));
    assert.equal(`${readings[2].noteName}${readings[2].octave}`, 'E4', '55 cent remains on the held note');
    assert.equal(`${readings.at(-1).noteName}${readings.at(-1).octave}`, 'F4', '58 cent boundary permits note change');
}

{
    const smoother = createTunerSmoother();
    const reading = smoother.push(result(E2_FREQUENCY), 0);
    const grace = smoother.push(null, 100);
    const neutral = smoother.push(null, 151);
    assert.equal(grace.noteName, reading.noteName);
    assert.equal(grace.stale, true, 'short null gap keeps a stale reading');
    assert.equal(neutral, null, 'null beyond 150ms returns neutral');
}

for (const [note, expectedString] of [
    ['E2', 6],
    ['A2', 5],
    ['D3', 4],
    ['G3', 3],
    ['B3', 2],
    ['E4', 1]
]) {
    const match = standardStringForNote(note.slice(0, -1), Number(note.at(-1)));
    assert.equal(match?.string, expectedString, `${note} highlights string ${expectedString}`);
}
for (const [noteName, octave] of [['F', 2], ['C♯', 3], ['A', 4]]) {
    assert.equal(standardStringForNote(noteName, octave), null);
}

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    add(value) {
        this.values.add(value);
    }

    remove(value) {
        this.values.delete(value);
    }

    contains(value) {
        return this.values.has(value);
    }
}

class FakeElement {
    constructor(dataset = {}) {
        this.textContent = '';
        this.hidden = false;
        this.disabled = false;
        this.value = '';
        this.dataset = { ...dataset };
        this.classList = new FakeClassList();
        this.attributes = new Map();
        this.listeners = new Map();
        this.style = {
            values: new Map(),
            setProperty: (name, value) => this.style.values.set(name, value)
        };
        this.focusCalls = 0;
        this.removeCalls = 0;
        this.children = [];
        this.namedChildren = new Map();
    }

    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(listener);
    }

    async dispatch(type) {
        for (const listener of this.listeners.get(type) || []) await listener({ type });
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    removeAttribute(name) {
        this.attributes.delete(name);
    }

    focus() {
        this.focusCalls += 1;
    }

    remove() {
        this.removeCalls += 1;
    }

    replaceChildren(...children) {
        this.children = children;
    }

    querySelector(selector) {
        return this.namedChildren.get(selector) || null;
    }
}

function createFakeRoot() {
    const ids = [
        'tuner-title',
        'tuner-note',
        'tuner-note-string',
        'tuner-note-value',
        'tuner-frequency',
        'tuner-cents',
        'tuner-direction',
        'tuner-meter',
        'tuner-toggle',
        'tuner-error',
        'tuner-status',
        'tuner-tuning',
        'tuner-capo-down',
        'tuner-capo-up',
        'tuner-capo-value',
        'tuner-settings-error',
        'tuner-input-settings-toggle',
        'tuner-input-settings-panel',
        'tuner-input-level-wrap',
        'tuner-input-level',
        'tuner-threshold',
        'tuner-threshold-value',
        'tuner-threshold-error',
        'tuner-diagnostic',
        'tuner-diagnostic-dbfs',
        'tuner-diagnostic-level',
        'tuner-diagnostic-rms',
        'tuner-diagnostic-confidence',
        'tuner-diagnostic-raw-frequency',
        'tuner-diagnostic-final',
        'tuner-diagnostic-reason',
        'tuner-diagnostic-display',
        'tuner-diagnostic-sample-rate',
        'tuner-diagnostic-fft-size',
        'tuner-diagnostic-threshold-db',
        'tuner-diagnostic-rms-threshold',
        'tuner-diagnostic-threshold-label',
        'tuner-diagnostic-track',
        'tuner-diagnostic-supported',
        'tuner-diagnostic-frames',
        'tuner-diagnostic-valid',
        'tuner-diagnostic-low-rms',
        'tuner-diagnostic-low-confidence',
        'tuner-diagnostic-other',
        'tuner-diagnostic-copy',
        'tuner-diagnostic-copy-status'
    ];
    const elements = new Map(ids.map((id) => [id, new FakeElement()]));
    const strings = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']
        .map((note, index) => {
            const element = new FakeElement({ note, string: String(6 - index) });
            element.namedChildren.set('span', new FakeElement());
            element.namedChildren.set('strong', new FakeElement());
            return element;
        });
    return {
        elements,
        strings,
        ownerDocument: { createElement: () => new FakeElement() },
        querySelector(selector) {
            return elements.get(selector.slice(1));
        },
        querySelectorAll(selector) {
            return selector === '[data-tuner-string]' ? strings : [];
        }
    };
}

assert.equal(isTunerDebugEnabled('?tunerDebug=1'), true);
assert.equal(isTunerDebugEnabled('?tunerDebug=0'), false);
assert.equal(isTunerDebugEnabled('?other=1'), false);
assert.equal(inputLevelPercentage(-100), 0);
assert.equal(inputLevelPercentage(-18), 100);
assert.equal(inputLevelPercentage(-80), (20 / 82) * 100);
assert.equal(inputLevelPercentage(0), 100);

{
    const level = createInputLevelSmoother();
    assert.equal(level.push(-100, 0), -100);
    const attacked = level.push(-30, 100);
    const released = level.push(-72, 200);
    assert(attacked > -50, 'input meter attack is fast');
    assert(released > -60, 'input meter release is slower than attack');
    level.reset();
    assert.equal(level.push(-50, 300), -50);
}

{
    const history = createTunerDiagnosticHistory({ windowMs: 5000, maxFrames: 3 });
    history.add('valid', 0);
    history.add('low-rms', 100);
    history.add('low-confidence', 200);
    const bounded = history.add('invalid-input', 300);
    assert.equal(bounded.frames, 3, 'diagnostic history obeys its fixed frame cap');
    assert.deepEqual(bounded, { frames: 3, valid: 0, lowRms: 33, lowConfidence: 33, other: 33 });
    assert.equal(history.summary(6000).frames, 0, 'diagnostic history expires old frames');
}

{
    const copied = formatTunerDiagnosticCopy({
        device: 'iPhone / Safari',
        diagnostic: {
            reason: 'low-rms',
            rms: 0.0021,
            rmsDbfs: -53.6,
            confidence: 0.88,
            rawFrequency: 82.57,
            sampleRate: 48000,
            fftSize: 4096,
            trackSettings: { sampleRate: 48000, channelCount: 1, deviceId: 'private-id' },
            supportedConstraints: { sampleRate: true, deviceId: true }
        },
        display: { state: 'neutral', note: null, frequency: null },
        summary: { frames: 100, valid: 18, lowRms: 76, lowConfidence: 5, other: 1 }
    });
    assert.match(copied, /low-rms 76%/);
    assert.match(copied, /Current dBFS: -53\.6/);
    assert.match(copied, /Threshold: -80 dBFS/);
    assert.match(copied, /RMS Threshold: 0\.000100/);
    assert.doesNotMatch(copied, /Sensitivity:/);
    assert.doesNotMatch(copied, /private-id|deviceId/i, 'copied diagnostics omit identifying IDs');
}

{
    const root = createFakeRoot();
    let callbacks;
    let status = 'idle';
    let stopCalls = 0;
    const thresholdChanges = [];
    let clock = 0;
    const startGate = deferred();
    const controller = {
        async start() {
            status = 'starting';
            callbacks.onStateChange({ status });
            await startGate.promise;
            status = 'running';
            callbacks.onStateChange({ status });
            return true;
        },
        async stop() {
            stopCalls += 1;
            status = 'idle';
            callbacks.onStateChange({ status });
        },
        setRmsThreshold(value) {
            thresholdChanges.push(value);
            return true;
        },
        getState: () => ({ status })
    };
    const app = initTuner(root, {
        audioControllerFactory(options) {
            callbacks = options;
            return controller;
        },
        now: () => clock
    });
    assert.equal(callbacks.rmsThreshold.toFixed(6), '0.000100', 'missing tuner settings use the -80 dB threshold');
    assert.equal(root.elements.get('tuner-threshold-value').textContent, '-80 dB');
    assert.match(root.elements.get('tuner-threshold').attributes.get('aria-valuetext'), /左ほど高感度/);
    assert.equal(root.elements.get('tuner-input-settings-panel').hidden, true, 'input settings start closed');
    assert.equal(root.elements.get('tuner-input-settings-toggle').attributes.get('aria-expanded'), 'false');
    assert.equal(root.elements.get('tuner-diagnostic').removeCalls, 1, 'debug OFF removes the panel');
    assert.equal(root.elements.get('tuner-tuning').children.length, 11, 'preset select is generated from the shared definition');
    assert.equal(root.elements.get('tuner-tuning').children.at(-1).textContent, '自由');
    assert.deepEqual(
        root.strings.map((element) => element.querySelector('strong').textContent),
        ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']
    );
    assert.equal(root.elements.get('tuner-capo-value').textContent, 'なし');
    assert.equal(root.elements.get('tuner-capo-down').disabled, true);
    const toggle = root.elements.get('tuner-toggle');
    const note = root.elements.get('tuner-note-value');
    const error = root.elements.get('tuner-error');

    app.setActive(true);
    assert.equal(note.textContent, '—');
    assert.equal(root.elements.get('tuner-title').focusCalls, 1);
    const startClick = toggle.dispatch('click');
    await Promise.resolve();
    assert.equal(toggle.disabled, true);
    assert.equal(toggle.textContent, 'マイクの使用を確認中…');
    startGate.resolve();
    await startClick;
    assert.equal(toggle.textContent, '■ マイク停止');
    assert.equal(root.elements.get('tuner-status').textContent, 'マイク入力中');
    assert.equal(root.elements.get('tuner-input-level-wrap').hidden, false);
    assert.equal(root.elements.get('tuner-input-settings-panel').hidden, true, 'running input meter stays inside the closed settings panel');

    await root.elements.get('tuner-input-settings-toggle').dispatch('click');
    assert.equal(root.elements.get('tuner-input-settings-panel').hidden, false, 'input settings open on click');
    assert.equal(root.elements.get('tuner-input-settings-toggle').attributes.get('aria-expanded'), 'true');
    await root.elements.get('tuner-input-settings-toggle').dispatch('click');
    assert.equal(root.elements.get('tuner-input-settings-panel').hidden, true, 'input settings close on click');
    assert.equal(root.elements.get('tuner-input-settings-toggle').attributes.get('aria-expanded'), 'false');

    callbacks.onInputLevel({ rms: 0.0012, rmsDbfs: -58.4 });
    assert.notEqual(
        root.elements.get('tuner-input-level').style.values.get('--tuner-input-level-position'),
        '0%'
    );

    root.elements.get('tuner-threshold').value = '-100';
    await root.elements.get('tuner-threshold').dispatch('input');
    assert.equal(thresholdChanges[0], 0.00001);
    assert.equal(root.elements.get('tuner-threshold-value').textContent, '-100 dB');
    assert.equal(root.elements.get('tuner-input-level').style.values.get('--tuner-threshold-position'), '0.0%');

    for (const frequency of [82.40, 82.41, 82.39]) {
        callbacks.onResult(result(frequency));
        clock += 50;
    }
    assert.equal(note.textContent, 'E2');
    assert.equal(root.elements.get('tuner-note-string').textContent, '6弦');
    assert.equal(root.elements.get('tuner-note-string').hidden, false);
    assert.match(root.elements.get('tuner-frequency').textContent, /^82\.\d{2} Hz$/);
    assert.equal(root.elements.get('tuner-direction').textContent, '✓ 合っています');
    assert(root.strings[0].classList.contains('is-active'));

    root.elements.get('tuner-tuning').value = 'whole-step-down';
    await root.elements.get('tuner-tuning').dispatch('change');
    assert.deepEqual(
        root.strings.map((element) => element.querySelector('strong').textContent),
        ['D2', 'G2', 'C3', 'F3', 'A3', 'D4']
    );
    assert.equal(root.elements.get('tuner-note-value').textContent, 'E2', 'detected chromatic note remains visible');
    assert.equal(root.elements.get('tuner-note-string').hidden, true, 'target外では弦番号を推測しない');
    assert.equal(root.elements.get('tuner-direction').textContent, '目標音ではありません');
    assert.equal(root.elements.get('tuner-cents').textContent, '—');
    assert(root.strings.every((element) => !element.classList.contains('is-active')));
    assert(root.elements.get('tuner-meter').classList.contains('is-neutral'));

    root.elements.get('tuner-tuning').value = 'standard';
    await root.elements.get('tuner-tuning').dispatch('change');
    assert.equal(root.elements.get('tuner-direction').textContent, '✓ 合っています');
    assert(root.strings[0].classList.contains('is-active'));
    await root.elements.get('tuner-capo-up').dispatch('click');
    assert.equal(root.elements.get('tuner-capo-value').textContent, '1');
    assert.equal(root.strings[0].querySelector('strong').textContent, 'F2');
    assert.equal(root.elements.get('tuner-direction').textContent, '目標音ではありません');
    await root.elements.get('tuner-capo-down').dispatch('click');
    assert.equal(root.elements.get('tuner-capo-value').textContent, 'なし');
    assert.equal(root.elements.get('tuner-direction').textContent, '✓ 合っています');

    root.elements.get('tuner-tuning').value = 'free';
    await root.elements.get('tuner-tuning').dispatch('change');
    assert.deepEqual(
        root.strings.map((element) => element.querySelector('strong').textContent),
        ['-', '-', '-', '-', '-', '-']
    );
    assert.equal(root.elements.get('tuner-capo-value').textContent, 'なし');
    assert.equal(root.elements.get('tuner-capo-down').disabled, true);
    assert.equal(root.elements.get('tuner-capo-up').disabled, true);
    assert.equal(root.elements.get('tuner-note-value').textContent, 'E2');
    assert.equal(root.elements.get('tuner-note-string').hidden, true, '自由モードでは弦番号を推測しない');
    assert.equal(root.elements.get('tuner-direction').textContent, '✓ 合っています');
    assert(root.strings.every((element) => !element.classList.contains('is-active')));

    for (const frequency of [87.31, 87.31]) {
        callbacks.onResult(result(frequency));
        clock += 50;
    }
    assert.equal(root.elements.get('tuner-note-value').textContent, 'F2');
    assert.notEqual(root.elements.get('tuner-direction').textContent, '目標音ではありません');
    assert.notEqual(root.elements.get('tuner-cents').textContent, '—');

    root.elements.get('tuner-tuning').value = 'standard';
    await root.elements.get('tuner-tuning').dispatch('change');
    for (const frequency of [82.40, 82.40]) {
        callbacks.onResult(result(frequency));
        clock += 50;
    }

    for (const frequency of [
        frequencyAtCents(E2_FREQUENCY, -25),
        frequencyAtCents(E2_FREQUENCY, -25)
    ]) {
        callbacks.onResult(result(frequency));
        clock += 50;
    }
    assert.equal(root.elements.get('tuner-direction').textContent, '↓ 低い');

    for (const frequency of [
        frequencyAtCents(E2_FREQUENCY, 25),
        frequencyAtCents(E2_FREQUENCY, 25),
        frequencyAtCents(E2_FREQUENCY, 25)
    ]) {
        callbacks.onResult(result(frequency));
        clock += 50;
    }
    assert.equal(root.elements.get('tuner-direction').textContent, '↑ 高い');

    callbacks.onResult(null);
    assert.equal(root.elements.get('tuner-direction').textContent, '音を確認しています');
    clock += 151;
    callbacks.onResult(null);
    assert.equal(root.elements.get('tuner-direction').textContent, '入力待ち');

    for (const [code, expectedText] of [
        ['permission-denied', 'マイク許可'],
        ['no-device', 'マイクが見つかりません'],
        ['device-busy', '他のアプリ'],
        ['insecure-context', 'HTTPS'],
        ['constraints', '入力設定'],
        ['aborted', '中断'],
        ['audio-resume-failed', '音声入力'],
        ['track-ended', '入力が中断'],
        ['unknown', 'もう一度お試しください']
    ]) {
        callbacks.onError({ code, message: 'browser text must not be shown' });
        assert.match(error.textContent, new RegExp(expectedText), `${code} has a safe Japanese message`);
        assert.doesNotMatch(error.textContent, /browser text/);
    }

    await toggle.dispatch('click');
    assert.equal(stopCalls, 1);
    assert.equal(note.textContent, '—');
    assert.equal(toggle.textContent, 'マイクを開始');

    await root.elements.get('tuner-input-settings-toggle').dispatch('click');
    assert.equal(root.elements.get('tuner-input-settings-panel').hidden, false);
    app.setActive(false);
    assert.equal(stopCalls, 2, 'route leave always requests a safe stop');
    assert.equal(note.textContent, '—');
    assert.equal(root.elements.get('tuner-input-settings-panel').hidden, true, 'route leave resets settings to closed');
    assert.equal(root.elements.get('tuner-input-settings-toggle').attributes.get('aria-expanded'), 'false');
}

{
    const root = createFakeRoot();
    let callbacks;
    let controllerOptions;
    let status = 'idle';
    let clock = 0;
    let copiedText = '';
    let stopCalls = 0;
    const thresholdChanges = [];
    const controller = {
        async start() {
            status = 'running';
            callbacks.onStateChange({ status });
            return true;
        },
        async stop() {
            stopCalls += 1;
            status = 'idle';
            callbacks.onStateChange({ status });
        },
        setRmsThreshold(value) {
            thresholdChanges.push(value);
            return true;
        },
        getState: () => ({ status })
    };
    const app = initTuner(root, {
        debugEnabled: true,
        audioControllerFactory(options) {
            controllerOptions = options;
            callbacks = options;
            return controller;
        },
        navigatorObject: {
            userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit Safari',
            clipboard: { writeText: async (text) => { copiedText = text; } }
        },
        now: () => clock
    });

    assert.equal(controllerOptions.diagnosticEnabled, true);
    assert.equal(root.elements.get('tuner-diagnostic').hidden, false, 'debug ON reveals the panel');
    assert.equal(root.elements.get('tuner-diagnostic-threshold-db').textContent, '-80 dBFS');
    assert.equal(root.elements.get('tuner-diagnostic-rms-threshold').textContent, '0.000100');
    app.setActive(true);
    await root.elements.get('tuner-toggle').dispatch('click');
    callbacks.onResult(result(E2_FREQUENCY));
    callbacks.onDiagnostic({
        reason: 'valid',
        rms: 0.0049,
        rmsDbfs: -46.2,
        confidence: 0.91,
        rawFrequency: 82.57,
        rmsThreshold: 0.003,
        sampleRate: 48000,
        fftSize: 4096,
        trackSettings: { sampleRate: 48000, channelCount: 1, deviceId: 'private-id' },
        supportedConstraints: { sampleRate: true, autoGainControl: true, deviceId: true }
    });
    assert.equal(root.elements.get('tuner-diagnostic-reason').textContent, 'valid');
    assert.equal(root.elements.get('tuner-diagnostic-dbfs').textContent, '-46.2 dBFS');
    assert.equal(root.elements.get('tuner-diagnostic-final').textContent.startsWith('E2 / '), true);
    assert.equal(root.elements.get('tuner-diagnostic-track').textContent.includes('private-id'), false);

    root.elements.get('tuner-threshold').value = '-40';
    await root.elements.get('tuner-threshold').dispatch('input');
    assert.equal(thresholdChanges[0], 0.01);
    assert.equal(root.elements.get('tuner-diagnostic-threshold-db').textContent, '-40 dBFS');
    assert.equal(root.elements.get('tuner-diagnostic-rms-threshold').textContent, '0.010000');

    clock = 100;
    callbacks.onResult(null);
    callbacks.onDiagnostic({
        reason: 'low-rms',
        rms: 0.0021,
        rmsDbfs: -53.6,
        confidence: null,
        rawFrequency: null,
        sampleRate: 48000,
        fftSize: 4096,
        trackSettings: {},
        supportedConstraints: {}
    });
    assert.equal(root.elements.get('tuner-diagnostic-frames').textContent, '2');
    assert.equal(root.elements.get('tuner-diagnostic-low-rms').textContent, '50%');
    assert.equal(root.elements.get('tuner-diagnostic-display').textContent, 'stale');

    clock = 200;
    callbacks.onResult(null);
    callbacks.onDiagnostic({
        reason: 'low-rms',
        rms: 0.0018,
        rmsDbfs: -54.9,
        confidence: null,
        rawFrequency: null,
        sampleRate: 48000,
        fftSize: 4096,
        trackSettings: {},
        supportedConstraints: {}
    });
    assert.equal(root.elements.get('tuner-diagnostic-display').textContent, 'neutral');
    assert.equal(
        root.elements.get('tuner-diagnostic-final').textContent.startsWith('E2 / '),
        true,
        'neutral display retains the latest valid note for diagnosis'
    );

    await root.elements.get('tuner-diagnostic-copy').dispatch('click');
    assert.match(copiedText, /Device: iPhone \/ Safari/);
    assert.match(copiedText, /low-rms 67%/);
    assert.match(copiedText, /Display: neutral/);
    assert.match(copiedText, /Final: E2/);
    assert.match(copiedText, /Threshold: -40 dBFS/);
    assert.match(copiedText, /RMS Threshold: 0\.010000/);
    assert.doesNotMatch(copiedText, /private-id|deviceId/i);
    assert.equal(root.elements.get('tuner-diagnostic-copy-status').textContent, '診断結果をコピーしました。');

    app.setActive(false);
    assert.equal(stopCalls, 1, 'route leave stops debug audio');
    assert.equal(root.elements.get('tuner-diagnostic-frames').textContent, '0', 'route leave resets diagnostics');
}

{
    const root = createFakeRoot();
    let callbacks;
    const writes = [];
    const storage = {
        getItem: () => JSON.stringify({ version: 1, sensitivity: 'low' }),
        setItem: (key, value) => writes.push([key, value])
    };
    const controller = {
        start: async () => true,
        stop: async () => {},
        getState: () => ({ status: 'idle' }),
        setRmsThreshold: () => true
    };
    initTuner(root, {
        storage,
        audioControllerFactory(options) {
            callbacks = options;
            return controller;
        }
    });
    assert.equal(callbacks.rmsThreshold, 10 ** (-44 / 20), 'v1 setting is migrated to its nearest 1 dB threshold');
    assert.equal(root.elements.get('tuner-threshold-value').textContent, '-44 dB');
    root.elements.get('tuner-threshold').value = '-60';
    await root.elements.get('tuner-threshold').dispatch('input');
    await root.elements.get('tuner-threshold').dispatch('change');
    assert.deepEqual(writes, [[
        'cruisePort.tuner',
        JSON.stringify({ version: 3, thresholdDb: -60, tuningId: 'standard', capo: 0 })
    ]]);
}

{
    const root = createFakeRoot();
    const controller = {
        start: async () => true,
        stop: async () => {},
        getState: () => ({ status: 'idle' }),
        setRmsThreshold: () => true
    };
    initTuner(root, {
        storage: {
            getItem: () => null,
            setItem: () => { throw new Error('quota'); }
        },
        audioControllerFactory: () => controller
    });
    root.elements.get('tuner-threshold').value = '-62';
    await root.elements.get('tuner-threshold').dispatch('input');
    await root.elements.get('tuner-threshold').dispatch('change');
    assert.equal(
        root.elements.get('tuner-settings-error').textContent,
        'チューナー設定を保存できませんでした。'
    );
    assert.equal(root.elements.get('tuner-threshold-value').textContent, '-62 dB', 'session value remains active');
}

{
    const root = createFakeRoot();
    const writes = [];
    let factoryCalls = 0;
    const storage = {
        getItem: () => JSON.stringify({ version: 3, thresholdDb: -72, tuningId: 'dadgad', capo: 2 }),
        setItem: (key, value) => writes.push([key, value])
    };
    const controller = {
        start: async () => true,
        stop: async () => {},
        getState: () => ({ status: 'idle' }),
        setRmsThreshold: () => true
    };
    initTuner(root, {
        storage,
        audioControllerFactory() {
            factoryCalls += 1;
            return controller;
        }
    });
    assert.equal(root.elements.get('tuner-tuning').value, 'dadgad');
    assert.equal(root.elements.get('tuner-capo-value').textContent, '2');
    assert.deepEqual(
        root.strings.map((element) => element.querySelector('strong').textContent),
        ['E2', 'B2', 'E3', 'A3', 'B3', 'E4']
    );

    root.elements.get('tuner-tuning').value = 'open-g';
    await root.elements.get('tuner-tuning').dispatch('change');
    await root.elements.get('tuner-capo-up').dispatch('click');
    assert.deepEqual(writes.map(([, value]) => JSON.parse(value)), [
        { version: 3, thresholdDb: -72, tuningId: 'open-g', capo: 2 },
        { version: 3, thresholdDb: -72, tuningId: 'open-g', capo: 3 }
    ]);
    for (let capo = 4; capo <= 12; capo += 1) {
        await root.elements.get('tuner-capo-up').dispatch('click');
    }
    assert.equal(root.elements.get('tuner-capo-value').textContent, '12');
    assert.equal(root.elements.get('tuner-capo-up').disabled, true);
    const writesAtMaximum = writes.length;
    await root.elements.get('tuner-capo-up').dispatch('click');
    assert.equal(writes.length, writesAtMaximum, 'capo remains clamped at 12 without an extra save');
    root.elements.get('tuner-tuning').value = 'free';
    await root.elements.get('tuner-tuning').dispatch('change');
    assert.deepEqual(JSON.parse(writes.at(-1)[1]), {
        version: 3,
        thresholdDb: -72,
        tuningId: 'free',
        capo: 0
    });
    assert.equal(root.elements.get('tuner-capo-down').disabled, true);
    assert.equal(root.elements.get('tuner-capo-up').disabled, true);
    assert.equal(factoryCalls, 1, 'target changes do not recreate the audio controller');
}

{
    const existingMenu = {
        id: 'existing-menu',
        name: '既存メニュー',
        durationMinutes: 10,
        appId: 'metronome',
        memo: '',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
    };
    const values = new Map([
        ['cruisePort.schemaVersion', '1'],
        ['cruisePort.practiceMenus', JSON.stringify({ version: 1, items: [existingMenu] })]
    ]);
    const storage = { getItem: (key) => values.get(key) ?? null };
    const loaded = loadPracticeMenus(storage);
    assert.equal(SCHEMA_VERSION, 1);
    assert.equal(loaded.ok, true);
    assert.deepEqual(loaded.items, [existingMenu]);
    assert.deepEqual(APP_DEFINITIONS.tuner, { name: 'チューナー', href: '#tuner' });
}

console.log('tuner-app: all UI-controller and smoothing tests passed');
