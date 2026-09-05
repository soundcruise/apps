import assert from 'node:assert/strict';
import {
    createTunerSmoother,
    initTuner,
    standardStringForNote
} from './tuner-app.js';
import {
    APP_DEFINITIONS,
    SCHEMA_VERSION,
    loadPracticeMenus
} from './practice-menu-store.js';

const E2_FREQUENCY = 82.4069;

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
        this.dataset = { ...dataset };
        this.classList = new FakeClassList();
        this.attributes = new Map();
        this.listeners = new Map();
        this.style = {
            values: new Map(),
            setProperty: (name, value) => this.style.values.set(name, value)
        };
        this.focusCalls = 0;
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
}

function createFakeRoot() {
    const ids = [
        'tuner-title',
        'tuner-note',
        'tuner-frequency',
        'tuner-cents',
        'tuner-direction',
        'tuner-guide',
        'tuner-meter',
        'tuner-toggle',
        'tuner-error',
        'tuner-status'
    ];
    const elements = new Map(ids.map((id) => [id, new FakeElement()]));
    const strings = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']
        .map((note) => new FakeElement({ note }));
    return {
        elements,
        strings,
        querySelector(selector) {
            return elements.get(selector.slice(1));
        },
        querySelectorAll(selector) {
            return selector === '[data-tuner-string]' ? strings : [];
        }
    };
}

{
    const root = createFakeRoot();
    let callbacks;
    let status = 'idle';
    let stopCalls = 0;
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
        getState: () => ({ status })
    };
    const app = initTuner(root, {
        audioControllerFactory(options) {
            callbacks = options;
            return controller;
        },
        now: () => clock
    });
    const toggle = root.elements.get('tuner-toggle');
    const note = root.elements.get('tuner-note');
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

    for (const frequency of [82.40, 82.41, 82.39]) {
        callbacks.onResult(result(frequency));
        clock += 50;
    }
    assert.equal(note.textContent, 'E2');
    assert.match(root.elements.get('tuner-frequency').textContent, /^82\.\d{2} Hz$/);
    assert(root.strings[0].classList.contains('is-active'));

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

    app.setActive(false);
    assert.equal(stopCalls, 2, 'route leave always requests a safe stop');
    assert.equal(note.textContent, '—');
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
