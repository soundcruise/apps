import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    METRONOME_DEFAULTS,
    METRONOME_LIMITS,
    METRONOME_SCHEMA_VERSION,
    METRONOME_SOUNDS,
    METRONOME_STORAGE_KEY,
    beatCountForMeter,
    clampInteger,
    defaultAccentsForMeter,
    loadMetronomeSettings,
    normalizeMetronomeSettings,
    saveMetronomeSettings
} from './metronome-store.js';
import {
    advanceScheduleCursor,
    beatsForMeter,
    compatibleRhythm,
    createScheduleCursor,
    isCompoundMeter,
    isRhythmSupported,
    scheduleEventsUntil,
    secondsPerBeat,
    secondsPerQuarterNote,
    subdivisionOffsets
} from './metronome-timing.js';
import {
    METRONOME_MAX_GAIN,
    METRONOME_PREVIOUS_MAX_GAIN,
    METRONOME_SCHEDULE_AHEAD_SEC,
    METRONOME_SCHEDULER_INTERVAL_MS,
    METRONOME_START_LEAD_SEC,
    createMetronomeAudioEngine,
    volumeLevel
} from './metronome-app.js';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./metronome-app.js', import.meta.url), 'utf8');
const rootSource = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');

function memoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        get parsed() { return JSON.parse(values.get(METRONOME_STORAGE_KEY)); },
        get raw() { return values.get(METRONOME_STORAGE_KEY); }
    };
}

class FakeAudioParam {
    constructor(value = 0) {
        this.value = value;
        this.events = [];
    }
    setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
    exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push(['exponential', value, time]); }
    setTargetAtTime(value, time, constant) { this.value = value; this.events.push(['target', value, time, constant]); }
    cancelScheduledValues(time) { this.events.push(['cancel', time]); }
}

class FakeAudioNode {
    constructor(context, kind) {
        this.context = context;
        this.kind = kind;
        this.frequency = new FakeAudioParam();
        this.Q = new FakeAudioParam();
        this.gain = new FakeAudioParam(1);
        this.type = '';
        this.listeners = new Map();
        this.stopCalls = 0;
    }
    connect(target) { this.target = target; return target; }
    disconnect() { this.disconnected = true; }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    start(time) { this.startTime = time; this.context.started.push(this); }
    stop(time) { this.stopTime = time; this.stopCalls += 1; }
}

class FakeAudioContext {
    static instances = [];
    constructor() {
        this.currentTime = 10;
        this.state = 'running';
        this.destination = new FakeAudioNode(this, 'destination');
        this.sampleRate = 48000;
        this.started = [];
        this.gains = [];
        FakeAudioContext.instances.push(this);
    }
    createGain() { const node = new FakeAudioNode(this, 'gain'); this.gains.push(node); return node; }
    createOscillator() { return new FakeAudioNode(this, 'oscillator'); }
    createBufferSource() { return new FakeAudioNode(this, 'buffer-source'); }
    createBiquadFilter() { return new FakeAudioNode(this, 'biquad-filter'); }
    createDynamicsCompressor() {
        const node = new FakeAudioNode(this, 'compressor');
        node.threshold = new FakeAudioParam();
        node.knee = new FakeAudioParam();
        node.ratio = new FakeAudioParam();
        node.attack = new FakeAudioParam();
        node.release = new FakeAudioParam();
        return node;
    }
    createBuffer(_channels, length) {
        const samples = new Float32Array(length);
        return { getChannelData: () => samples };
    }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
}

function engineHarness(settingsOverride = {}) {
    FakeAudioContext.instances = [];
    let nextId = 1;
    const timers = new Map();
    const frames = new Map();
    const settings = {
        ...METRONOME_DEFAULTS,
        accents: [...METRONOME_DEFAULTS.accents],
        ...settingsOverride
    };
    const engine = createMetronomeAudioEngine(() => {}, {
        AudioContextClass: FakeAudioContext,
        setTimeout(callback) { const id = nextId++; timers.set(id, callback); return id; },
        clearTimeout(id) { timers.delete(id); },
        requestAnimationFrame(callback) { const id = nextId++; frames.set(id, callback); return id; },
        cancelAnimationFrame(id) { frames.delete(id); }
    });
    return { engine, settings, timers, frames };
}

function runLatestTimer(harness) {
    const timerId = Math.max(...harness.timers.keys());
    const callback = harness.timers.get(timerId);
    harness.timers.delete(timerId);
    callback();
}

function sourcePeak(source) {
    let node = source.target;
    while (node && !node.gain?.events?.length) node = node.target;
    return Math.max(0, ...(node?.gain?.events || []).map((event) => Number(event[1]) || 0));
}

test('default BPM is 120', () => assert.equal(METRONOME_DEFAULTS.bpm, 120));
test('BPM minimum clamps to 30', () => assert.equal(clampInteger(1, 30, 240, 120), 30));
test('BPM maximum clamps to 240', () => assert.equal(clampInteger(999, 30, 240, 120), 240));
test('BPM slider spans 30 through 240', () => assert.match(html, /id="metronome-bpm-slider"[^>]*min="30"[^>]*max="240"/));
test('BPM step controls include four balanced buttons in order', () => {
    assert.match(html, /data-bpm-delta="-5"[\s\S]*data-bpm-delta="-1"[\s\S]*data-bpm-delta="1"[\s\S]*data-bpm-delta="5"/);
    assert.equal((html.match(/data-bpm-delta=/g) || []).length, 4);
});
test('TAP UI and logic are completely removed', () => {
    assert.doesNotMatch(html, /metronome-tap|>TAP<|タップしてテンポを測定/);
    assert.doesNotMatch(appSource, /bpmFromTapTimes|METRONOME_TAP_|tapTimes|tapStatus|metronome-tap/);
    assert.doesNotMatch(css, /metronome-tap|tap-status/);
});

for (const [meter, beats] of Object.entries({ '2/4': 2, '3/4': 3, '4/4': 4, '5/4': 5, '6/8': 2, '9/8': 3, '12/8': 4 })) {
    test(`${meter} exposes ${beats} musical beat groups`, () => {
        assert.equal(beatsForMeter(meter), beats);
        assert.equal(beatCountForMeter(meter), beats);
        assert.match(html, new RegExp(`<option value="${meter.replace('/', '\\/')}"`));
    });
}

test('simple-meter BPM is a quarter-note pulse', () => assert.equal(secondsPerQuarterNote(120, '4/4'), 0.5));
test('compound-meter BPM is a dotted-quarter pulse', () => {
    assert.equal(isCompoundMeter('6/8'), true);
    assert.equal(secondsPerBeat(120), 0.5);
    assert.ok(Math.abs(secondsPerQuarterNote(120, '6/8') - (1 / 3)) < 1e-12);
});
test('6/8, 9/8, and 12/8 use compound grouping', () => {
    assert.equal(isCompoundMeter('6/8'), true);
    assert.equal(isCompoundMeter('9/8'), true);
    assert.equal(isCompoundMeter('12/8'), true);
});

test('quarter rhythm schedules one event per simple beat', () => assert.deepEqual(subdivisionOffsets('4/4', 'quarter'), [0]));
test('eighth rhythm schedules two events per simple beat', () => assert.deepEqual(subdivisionOffsets('4/4', 'eighth'), [0, 0.5]));
test('sixteenth rhythm schedules four events per simple beat', () => assert.deepEqual(subdivisionOffsets('4/4', 'sixteenth'), [0, 0.25, 0.5, 0.75]));
test('triplet rhythm preserves three equal beat phases', () => assert.deepEqual(subdivisionOffsets('4/4', 'triplet'), [0, 1 / 3, 2 / 3]));
test('eighth shuffle uses the first and third triplet positions', () => assert.deepEqual(subdivisionOffsets('4/4', 'eighth-shuffle'), [0, 2 / 3]));
test('sixteenth shuffle applies long-short timing inside both eighth-note pairs', () => assert.deepEqual(subdivisionOffsets('4/4', 'sixteenth-shuffle'), [0, 1 / 3, 1 / 2, 5 / 6]));
test('shuffle timestamps retain the beat boundary', () => {
    const { events, cursor } = scheduleEventsUntil(
        createScheduleCursor(0),
        { bpm: 60, meter: '4/4', rhythm: 'eighth-shuffle' },
        1.01
    );
    assert.deepEqual(events.map(({ when }) => when), [0, 2 / 3, 1]);
    assert.ok(cursor.when > 1);
});
test('sixteenth-shuffle cursor advances without cumulative phase drift', () => {
    let cursor = createScheduleCursor(0);
    const settings = { bpm: 120, meter: '4/4', rhythm: 'sixteenth-shuffle' };
    for (let index = 0; index < 4; index += 1) cursor = advanceScheduleCursor(cursor, settings);
    assert.equal(cursor.when, 0.5);
    assert.equal(cursor.beatIndex, 1);
    assert.equal(cursor.subdivisionIndex, 0);
});
test('compound eighth rhythm is three natural eighth notes per dotted beat', () => assert.deepEqual(subdivisionOffsets('6/8', 'eighth'), [0, 1 / 3, 2 / 3]));
test('compound sixteenth rhythm is six equal subdivisions per dotted beat', () => assert.deepEqual(subdivisionOffsets('9/8', 'sixteenth'), [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]));
test('compound triplet and shuffle combinations are disabled', () => {
    for (const rhythm of ['triplet', 'eighth-shuffle', 'sixteenth-shuffle']) assert.equal(isRhythmSupported('12/8', rhythm), false);
    assert.equal(compatibleRhythm('6/8', 'triplet'), 'eighth');
});

test('accent defaults enable only the first beat', () => assert.deepEqual(defaultAccentsForMeter('5/4'), [true, false, false, false, false]));
test('compound accent defaults operate on beat groups', () => {
    assert.deepEqual(defaultAccentsForMeter('6/8'), [true, false]);
    assert.deepEqual(defaultAccentsForMeter('9/8'), [true, false, false]);
    assert.deepEqual(defaultAccentsForMeter('12/8'), [true, false, false, false]);
});
test('accent controls expose pressed state and a tap target', () => {
    assert.match(appSource, /button\.setAttribute\('aria-pressed'/);
    assert.match(css, /\.beat-button\s*\{[\s\S]*min-height:\s*58px/);
});

test('schema v3 persists rhythm, sound, and accents', () => {
    const storage = memoryStorage();
    const settings = { ...METRONOME_DEFAULTS, sound: 'analog', accents: [true, false, true, false] };
    assert.equal(saveMetronomeSettings(settings, storage).ok, true);
    assert.deepEqual(loadMetronomeSettings(storage).settings, settings);
    assert.equal(storage.parsed.version, 3);
});
test('legacy v1 settings migrate without touching the storage key', () => {
    const legacy = { version: 1, bpm: 96, meter: '3/4', sound: 'click', volume: 55 };
    const storage = memoryStorage({ [METRONOME_STORAGE_KEY]: JSON.stringify(legacy) });
    const result = loadMetronomeSettings(storage);
    assert.equal(result.migrated, true);
    assert.deepEqual(result.settings, { version: 3, bpm: 96, meter: '3/4', rhythm: 'quarter', sound: 'click', volume: 55, accents: [true, false, false] });
});
test('legacy 6/8 keeps its audible eighth-note pulse during migration', () => {
    const legacy = { version: 1, bpm: 120, meter: '6/8', sound: 'drum', volume: 70 };
    const storage = memoryStorage({ [METRONOME_STORAGE_KEY]: JSON.stringify(legacy) });
    assert.equal(loadMetronomeSettings(storage).settings.rhythm, 'eighth');
});
test('legacy wood migrates to the formal rim sound', () => {
    const legacy = { version: 1, bpm: 80, meter: '4/4', sound: 'wood', volume: 60 };
    const storage = memoryStorage({ [METRONOME_STORAGE_KEY]: JSON.stringify(legacy) });
    assert.equal(loadMetronomeSettings(storage).settings.sound, 'rim');
});
test('schema v2 drum migrates to rim without losing settings', () => {
    const legacy = { version: 2, bpm: 132, meter: '5/4', rhythm: 'eighth', sound: 'drum', volume: 84, accents: [true, false, true, false, true] };
    const storage = memoryStorage({ [METRONOME_STORAGE_KEY]: JSON.stringify(legacy) });
    const result = loadMetronomeSettings(storage);
    assert.equal(result.migrated, true);
    assert.deepEqual(result.settings, { ...legacy, version: 3, sound: 'rim' });
});
for (const retiredSound of ['electronic-drum', 'wood']) {
    test(`schema v3 ${retiredSound} migrates to rim without changing volume`, () => {
        const retired = { ...METRONOME_DEFAULTS, sound: retiredSound, volume: 83, accents: [...METRONOME_DEFAULTS.accents] };
        const storage = memoryStorage({ [METRONOME_STORAGE_KEY]: JSON.stringify(retired) });
        const result = loadMetronomeSettings(storage);
        assert.equal(result.migrated, true);
        assert.deepEqual(result.settings, { ...retired, sound: 'rim' });
        assert.deepEqual(storage.parsed, result.settings);
    });
}
test('retired current sound remains usable when migration cannot be persisted', () => {
    const retired = { ...METRONOME_DEFAULTS, sound: 'wood', volume: 81, accents: [...METRONOME_DEFAULTS.accents] };
    const raw = JSON.stringify(retired);
    const storage = {
        getItem: () => raw,
        setItem() { throw new Error('quota'); }
    };
    const result = loadMetronomeSettings(storage);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'migration-write-failed');
    assert.equal(result.settings.sound, 'rim');
    assert.equal(result.settings.volume, 81);
});
test('schema v2 electronic sound remains electronic after migration', () => {
    const legacy = { version: 2, bpm: 72, meter: '6/8', rhythm: 'eighth', sound: 'electronic', volume: 61, accents: [true, false] };
    const storage = memoryStorage({ [METRONOME_STORAGE_KEY]: JSON.stringify(legacy) });
    assert.deepEqual(loadMetronomeSettings(storage).settings, { ...legacy, version: 3 });
});
test('malformed settings fall back safely without overwriting their raw value', () => {
    const raw = '{"version":2,"bpm":"fast"}';
    const storage = memoryStorage({ [METRONOME_STORAGE_KEY]: raw });
    const result = loadMetronomeSettings(storage);
    assert.equal(result.ok, false);
    assert.deepEqual(result.settings, { ...METRONOME_DEFAULTS, accents: [...METRONOME_DEFAULTS.accents] });
    assert.equal(storage.raw, raw);
});
test('invalid compound rhythm is rejected by v3 normalization', () => {
    assert.equal(normalizeMetronomeSettings({ ...METRONOME_DEFAULTS, meter: '6/8', rhythm: 'triplet', accents: [true, false] }), null);
});
test('schema v3 accepts exactly the four formal sound colors', () => {
    assert.deepEqual(METRONOME_SOUNDS, ['electronic', 'analog', 'click', 'rim']);
    METRONOME_SOUNDS.forEach((sound) => assert.ok(normalizeMetronomeSettings({ ...METRONOME_DEFAULTS, sound })));
    for (const sound of ['drum', 'electronic-drum', 'wood']) {
        assert.equal(normalizeMetronomeSettings({ ...METRONOME_DEFAULTS, sound }), null);
    }
});
test('metronome keeps its dedicated localStorage key and schema version', () => {
    assert.equal(METRONOME_STORAGE_KEY, 'cruisePort.metronome');
    assert.equal(METRONOME_SCHEMA_VERSION, 3);
});

test('lookahead scheduler uses the AudioContext timeline', async () => {
    const harness = engineHarness();
    assert.equal(await harness.engine.start(() => harness.settings), true);
    const snapshot = harness.engine.snapshot();
    assert.equal(snapshot.playing, true);
    assert.ok(snapshot.scheduledEvents[0].when >= 10 + 0.05);
    assert.equal(METRONOME_SCHEDULE_AHEAD_SEC, 0.1);
    assert.equal(METRONOME_SCHEDULER_INTERVAL_MS, 25);
    assert.equal(METRONOME_START_LEAD_SEC, 0.055);
});
test('scheduler prevents double start', async () => {
    const harness = engineHarness();
    await harness.engine.start(() => harness.settings);
    const sourceCount = harness.engine.snapshot().activeSourceCount;
    assert.equal(await harness.engine.start(() => harness.settings), true);
    assert.equal(harness.engine.snapshot().activeSourceCount, sourceCount);
});
test('stop clears pending sources and events', async () => {
    const harness = engineHarness();
    await harness.engine.start(() => harness.settings);
    harness.engine.stop();
    assert.equal(harness.engine.snapshot().playing, false);
    assert.equal(harness.engine.snapshot().activeSourceCount, 0);
    assert.deepEqual(harness.engine.snapshot().scheduledEvents, []);
});
test('live BPM reschedule retains one future timeline', async () => {
    const harness = engineHarness();
    await harness.engine.start(() => harness.settings);
    harness.settings.bpm = 160;
    harness.engine.reschedule(() => harness.settings);
    const events = harness.engine.snapshot().scheduledEvents;
    assert.ok(events.length >= 1);
    assert.equal(events[0].beatIndex, 0);
    assert.ok(events.every((event, index) => index === 0 || event.when > events[index - 1].when));
});
test('live meter change resets cleanly at beat one', async () => {
    const harness = engineHarness();
    await harness.engine.start(() => harness.settings);
    Object.assign(harness.settings, { meter: '5/4', accents: defaultAccentsForMeter('5/4') });
    harness.engine.reschedule(() => harness.settings, { resetBeat: true });
    assert.equal(harness.engine.snapshot().scheduledEvents[0].beatIndex, 0);
});
test('live rhythm change schedules the new subdivision phases', async () => {
    const harness = engineHarness({ bpm: 240 });
    await harness.engine.start(() => harness.settings);
    harness.settings.rhythm = 'sixteenth';
    harness.engine.reschedule(() => harness.settings);
    const events = harness.engine.snapshot().scheduledEvents;
    assert.equal(events[0].subdivisionCount, 4);
});
test('live sound change replaces future voices', async () => {
    const harness = engineHarness();
    await harness.engine.start(() => harness.settings);
    harness.settings.sound = 'rim';
    harness.engine.reschedule(() => harness.settings);
    assert.ok(harness.engine.snapshot().scheduledEvents.every(({ sound }) => sound === 'rim'));
});
test('live accent change selects a distinct accent voice', async () => {
    const harness = engineHarness({ accents: [false, false, false, false] });
    await harness.engine.start(() => harness.settings);
    harness.settings.accents[0] = true;
    harness.engine.reschedule(() => harness.settings);
    assert.equal(harness.engine.snapshot().scheduledEvents[0].voice, 'accent');
});
test('live volume updates the shared master gain without a restart', async () => {
    const harness = engineHarness();
    await harness.engine.start(() => harness.settings);
    harness.engine.setVolume(25);
    assert.equal(harness.engine.snapshot().volume, 25);
    assert.equal(harness.engine.snapshot().playing, true);
});
test('new volume curve maps 50 percent to the previous maximum and extends headroom', () => {
    assert.equal(volumeLevel(0), 0);
    assert.equal(volumeLevel(50), METRONOME_PREVIOUS_MAX_GAIN);
    assert.equal(METRONOME_PREVIOUS_MAX_GAIN, 1.15);
    assert.equal(volumeLevel(100), METRONOME_MAX_GAIN);
    assert.equal(METRONOME_MAX_GAIN, 2.1);
    assert.ok(volumeLevel(100) > volumeLevel(50));
});
test('volume curve is monotonic, fine-grained at low levels, and safe for invalid input', () => {
    const levels = Array.from({ length: 101 }, (_, volume) => volumeLevel(volume));
    assert.ok(levels.every((level, index) => index === 0 || level > levels[index - 1]));
    assert.ok(volumeLevel(10) < volumeLevel(25));
    assert.equal(volumeLevel(-1), 0);
    assert.equal(volumeLevel(Number.NaN), 0);
    assert.equal(volumeLevel('invalid'), 0);
    assert.equal(volumeLevel(500), METRONOME_MAX_GAIN);
});
test('output uses a short safety limiter after the boosted master gain', async () => {
    const harness = engineHarness();
    await harness.engine.start(() => harness.settings);
    assert.deepEqual(harness.engine.snapshot().outputLimiter, {
        threshold: -3,
        knee: 4,
        ratio: 10,
        attack: 0.002,
        release: 0.06
    });
});
test('maximum summed source peak retains estimated headroom after limiting', () => {
    const loudestFormalVoicePeak = 1.02;
    const inputDb = 20 * Math.log10(loudestFormalVoicePeak * METRONOME_MAX_GAIN);
    const estimatedOutputDb = -3 + (inputDb + 3) / 10;
    assert.ok(estimatedOutputDb < 0);
});
test('electronic sound reuses Rhythm Cruise accent frequency', async () => {
    const harness = engineHarness({ sound: 'electronic' });
    await harness.engine.start(() => harness.settings);
    const context = FakeAudioContext.instances[0];
    assert.ok(context.started.some((node) => node.type === 'square' && node.frequency.events.some((event) => event[1] === 1500)));
});
test('analog adds a round lower body without replacing its triangle character', async () => {
    const harness = engineHarness({ sound: 'analog' });
    await harness.engine.start(() => harness.settings);
    const context = FakeAudioContext.instances[0];
    assert.ok(context.started.some((node) => node.type === 'triangle' && node.frequency.events.some((event) => event[1] === 1050)));
    assert.ok(context.started.some((node) => node.type === 'sine' && node.frequency.events.some((event) => event[1] === 525)));
});
test('click balances its hard transient with a short midrange body', async () => {
    const harness = engineHarness({ sound: 'click' });
    await harness.engine.start(() => harness.settings);
    const context = FakeAudioContext.instances[0];
    assert.ok(context.started.some((node) => node.type === 'square' && node.frequency.events.some((event) => event[1] === 2500)));
    assert.ok(context.started.some((node) => node.type === 'triangle' && node.frequency.events.some((event) => event[1] === 1250)));
});
for (const sound of ['analog', 'click', 'rim']) {
    test(`${sound} has a schedulable dedicated Web Audio voice`, async () => {
        const harness = engineHarness({ sound });
        await harness.engine.start(() => harness.settings);
        assert.ok(FakeAudioContext.instances[0].started.length > 0);
        assert.ok(harness.engine.snapshot().scheduledEvents.every((event) => event.sound === sound));
    });
}
test('rim sound combines a stronger midrange body, core, and transient', async () => {
    const harness = engineHarness({ sound: 'rim' });
    await harness.engine.start(() => harness.settings);
    const context = FakeAudioContext.instances[0];
    assert.ok(context.started.some((node) => node.type === 'triangle' && node.frequency.events.some((event) => event[1] === 1480)));
    assert.ok(context.started.some((node) => node.type === 'sine' && node.frequency.events.some((event) => Math.abs(event[1] - 769.6) < 1e-9)));
    assert.ok(context.started.some((node) => node.kind === 'buffer-source'));
});
for (const sound of METRONOME_SOUNDS) {
    test(`${sound} keeps accent, main, and subdivision peak hierarchy`, async () => {
        const harness = engineHarness({ bpm: 240, rhythm: 'sixteenth', sound });
        await harness.engine.start(() => harness.settings);
        const context = FakeAudioContext.instances[0];
        for (const currentTime of [10.08, 10.14, 10.20, 10.26]) {
            context.currentTime = currentTime;
            runLatestTimer(harness);
        }
        const peakByTime = new Map();
        context.started.forEach((source) => {
            peakByTime.set(source.startTime, (peakByTime.get(source.startTime) || 0) + sourcePeak(source));
        });
        const events = harness.engine.snapshot().scheduledEvents;
        const accentPeak = peakByTime.get(events.find((event) => event.voice === 'accent').when);
        const mainPeak = peakByTime.get(events.find((event) => event.voice === 'main').when);
        const subdivisionPeak = Math.max(...events
            .filter((event) => event.voice === 'subdivision')
            .map((event) => peakByTime.get(event.when)));
        assert.ok(accentPeak > mainPeak, `${sound}: accent ${accentPeak} > main ${mainPeak}`);
        assert.ok(mainPeak > subdivisionPeak, `${sound}: main ${mainPeak} > subdivision ${subdivisionPeak}`);
    });
}
test('background suspend stops playback and does not auto-resume', async () => {
    const harness = engineHarness();
    await harness.engine.start(() => harness.settings);
    await harness.engine.suspend();
    assert.equal(harness.engine.snapshot().playing, false);
    assert.equal(harness.engine.snapshot().contextState, 'suspended');
});

test('route cleanup remains connected to every view change', () => assert.match(rootSource, /metronomeController\?\.setActive\(view === elements\.metronomeView\)/));
test('page visibility and pagehide both stop the metronome', () => {
    assert.match(rootSource, /visibilitychange[\s\S]*stopForPageHidden/);
    assert.match(rootSource, /pagehide[\s\S]*stopForPageHidden/);
});
test('metronome does not modify navigator.audioSession', () => assert.doesNotMatch(appSource, /audioSession/));
test('tuner, Practice Menu, Gear List, and My Apps routes remain present', () => {
    for (const route of ['#tuner', '#practice-menu', '#wishlist', '#my-apps']) assert.match(rootSource + html, new RegExp(route));
});
test('mobile UI keeps large touch controls and a two-column rhythm grid', () => {
    assert.match(css, /\.tempo-steps button\s*\{[\s\S]*min-height:\s*48px/);
    assert.match(css, /\.metronome-choice-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2/);
});
test('detailed settings start closed and include all five advanced controls', () => {
    assert.match(html, /<details id="metronome-details" class="metronome-details">/);
    assert.doesNotMatch(html, /<details id="metronome-details"[^>]*\sopen(?:\s|>)/);
    assert.match(html, /id="metronome-details-summary" aria-expanded="false"/);
    for (const label of ['拍子', 'リズム', 'アクセント', '音色', '音量']) assert.match(html, new RegExp(`>${label}(?:\\s|<)`));
    assert.match(appSource, /details\.addEventListener\('toggle'[\s\S]*aria-expanded/);
});
test('sound selector exposes exactly four formal radio choices', () => {
    for (const [key, label] of [['electronic', '電子音'], ['analog', 'アナログ'], ['click', 'クリック'], ['rim', 'リム']]) {
        assert.match(html, new RegExp(`data-metronome-sound="${key}"[^>]*>${label}<`));
    }
    assert.equal((html.match(/data-metronome-sound=/g) || []).length, 4);
    assert.doesNotMatch(html, /data-metronome-sound="(?:electronic-drum|wood)"/);
});
test('BPM label sits above the centered number and visual beats directly below it', () => {
    const unitIndex = html.indexOf('class="tempo-unit"');
    const bpmIndex = html.indexOf('id="metronome-bpm"');
    const visualIndex = html.indexOf('id="metronome-visual-beats"');
    const sliderIndex = html.indexOf('id="metronome-bpm-slider"');
    assert.ok(unitIndex < bpmIndex && bpmIndex < visualIndex && visualIndex < sliderIndex);
    assert.match(css, /\.tempo-readout\s*\{[\s\S]*place-items:\s*center/);
    assert.doesNotMatch(css.match(/\.tempo-unit\s*\{[\s\S]*?\}/)[0], /position:\s*absolute/);
    assert.match(css, /\.tempo-steps\s*\{[\s\S]*grid-template-columns:\s*repeat\(4/);
});
test('BPM interpretation copy is removed without changing timing logic', () => {
    assert.doesNotMatch(html + appSource, /metronome-tempo-note|4分音符＝BPM|付点4分音符＝BPM/);
    assert.equal(secondsPerQuarterNote(120, '4/4'), 0.5);
    assert.ok(Math.abs(secondsPerQuarterNote(120, '6/8') - (1 / 3)) < 1e-12);
});
test('primary beat display remains visible outside detailed settings', () => {
    assert.ok(html.indexOf('id="metronome-visual-beats"') < html.indexOf('id="metronome-details"'));
    assert.match(appSource, /function renderVisualState\(\)[\s\S]*data-visual-beat/);
    assert.match(appSource, /function setVisualEvent\(event\)[\s\S]*renderVisualState\(\)/);
});
test('named preset UI stays outside details and uses a focused modal workflow', () => {
    assert.ok(html.indexOf('id="metronome-preset-select"') < html.indexOf('id="metronome-details"'));
    assert.match(html, /id="metronome-preset-dialog"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*hidden/);
    assert.match(html, /id="metronome-preset-name"[^>]*maxlength="40"/);
    assert.match(appSource, /function openPresetDialog\(\)[\s\S]*presetName\.focus/);
    assert.match(appSource, /event\.key === 'Escape'[\s\S]*closePresetDialog/);
});
test('preset apply commits one complete settings object and reschedules once', () => {
    const applySource = appSource.match(/function applyPreset\(presetId\)[\s\S]*?function saveCurrentAsPreset/)[0];
    assert.match(applySource, /state\.settings = settings/);
    assert.match(applySource, /engine\.setVolume\(settings\.volume\)/);
    assert.equal((applySource.match(/engine\.reschedule/g) || []).length, 1);
    assert.match(applySource, /engine\.reschedule\(getSettings, \{ resetBeat: true \}\)/);
});
test('stop, route leave, and hidden cleanup clear the primary beat state', () => {
    assert.match(appSource, /engine\.stop\(\);[\s\S]*state\.currentBeat = -1;[\s\S]*renderVisualState\(\)/);
    assert.match(appSource, /details\.open = false/);
    assert.match(appSource, /closePresetDialog\(\{ restoreFocus: false \}\)/);
    assert.match(rootSource, /visibilitychange[\s\S]*stopForPageHidden/);
});
test('reduced motion also covers the new primary beat display', () => {
    assert.match(css, /prefers-reduced-motion:[\s\S]*visual-beat-dot[\s\S]*visual-subdivision-display/);
});
test('range and selection controls expose accessible names and states', () => {
    assert.match(html, /for="metronome-bpm-slider"/);
    assert.match(html, /role="radiogroup" aria-labelledby="metronome-rhythm-label"/);
    assert.match(html, /id="metronome-volume"[^>]*type="range"/);
});

console.log('metronome-v2: BPM, meters, subdivisions, shuffle, accents, audio scheduler, migration, lifecycle, and accessibility passed');
