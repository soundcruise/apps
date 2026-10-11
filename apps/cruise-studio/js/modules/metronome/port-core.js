/* Read-only source projection: Cruise Port metronome-{store,timing,app}.js.
 * Timing functions and selected audio engine functions retain Port algorithms.
 * Transitive Port storage-conflict.js registers Sync globals, so do not import that graph.
 * Studio additions: onContext notification, owner close; electronic/default-only sound.
 * See docs/AUDIO_COORDINATOR.md and source consistency tests before updating.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.metronomeCore = factory();
})(globalThis, function () {
'use strict';
const METRONOME_LIMITS = Object.freeze({ bpmMin: 30, bpmMax: 240, volumeMin: 0, volumeMax: 100 });
const METRONOME_DEFAULTS = Object.freeze({ version: 3, bpm: 120, meter: '4/4', rhythm: 'quarter', sound: 'electronic', volume: 70, accents: Object.freeze([true, false, false, false]) });
function clampInteger(value, min, max, fallback) {
    if (value === null || (typeof value === 'string' && value.trim() === '')) return fallback;
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
}

const METRONOME_METER_INFO = Object.freeze({
    '2/4': Object.freeze({ beats: 2, compound: false, label: '4分の2拍子' }),
    '3/4': Object.freeze({ beats: 3, compound: false, label: '4分の3拍子' }),
    '4/4': Object.freeze({ beats: 4, compound: false, label: '4分の4拍子' }),
    '5/4': Object.freeze({ beats: 5, compound: false, label: '4分の5拍子' }),
    '6/8': Object.freeze({ beats: 2, compound: true, label: '8分の6拍子' }),
    '9/8': Object.freeze({ beats: 3, compound: true, label: '8分の9拍子' }),
    '12/8': Object.freeze({ beats: 4, compound: true, label: '8分の12拍子' })
});

const METRONOME_RHYTHM_INFO = Object.freeze({
    quarter: Object.freeze({ label: '4分', simpleOffsets: Object.freeze([0]), compoundOffsets: Object.freeze([0]) }),
    eighth: Object.freeze({ label: '8分', simpleOffsets: Object.freeze([0, 1 / 2]), compoundOffsets: Object.freeze([0, 1 / 3, 2 / 3]) }),
    sixteenth: Object.freeze({ label: '16分', simpleOffsets: Object.freeze([0, 1 / 4, 1 / 2, 3 / 4]), compoundOffsets: Object.freeze([0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]) }),
    triplet: Object.freeze({ label: '3連符', simpleOffsets: Object.freeze([0, 1 / 3, 2 / 3]), compoundOffsets: null }),
    'eighth-shuffle': Object.freeze({ label: '8分シャッフル', simpleOffsets: Object.freeze([0, 2 / 3]), compoundOffsets: null }),
    'sixteenth-shuffle': Object.freeze({ label: '16分シャッフル', simpleOffsets: Object.freeze([0, 1 / 3, 1 / 2, 5 / 6]), compoundOffsets: null })
});

function meterInfo(meter) {
    return METRONOME_METER_INFO[meter] || METRONOME_METER_INFO[METRONOME_DEFAULTS.meter];
}

function beatsForMeter(meter) {
    return meterInfo(meter).beats;
}

function isCompoundMeter(meter) {
    return meterInfo(meter).compound;
}

function meterLabel(meter) {
    return meterInfo(meter).label;
}

function isRhythmSupported(meter, rhythm) {
    const info = METRONOME_RHYTHM_INFO[rhythm];
    if (!info) return false;
    return isCompoundMeter(meter) ? Array.isArray(info.compoundOffsets) : Array.isArray(info.simpleOffsets);
}

function compatibleRhythm(meter, rhythm) {
    if (isRhythmSupported(meter, rhythm)) return rhythm;
    return isCompoundMeter(meter) ? 'eighth' : METRONOME_DEFAULTS.rhythm;
}

function subdivisionOffsets(meter, rhythm) {
    const normalizedRhythm = compatibleRhythm(meter, rhythm);
    const rhythmInfo = METRONOME_RHYTHM_INFO[normalizedRhythm];
    const offsets = isCompoundMeter(meter) ? rhythmInfo.compoundOffsets : rhythmInfo.simpleOffsets;
    return [...offsets];
}

function secondsPerBeat(bpm) {
    const normalizedBpm = clampInteger(
        bpm,
        METRONOME_LIMITS.bpmMin,
        METRONOME_LIMITS.bpmMax,
        METRONOME_DEFAULTS.bpm
    );
    return 60 / normalizedBpm;
}

function secondsPerQuarterNote(bpm, meter) {
    const beatSeconds = secondsPerBeat(bpm);
    return isCompoundMeter(meter) ? beatSeconds / 1.5 : beatSeconds;
}

function createScheduleCursor(when = 0, beatIndex = 0, subdivisionIndex = 0) {
    return { when, beatIndex, subdivisionIndex };
}

function describeScheduleEvent(cursor, settings) {
    const offsets = subdivisionOffsets(settings.meter, settings.rhythm);
    const subdivisionIndex = Math.max(0, Math.min(offsets.length - 1, cursor.subdivisionIndex));
    return {
        when: cursor.when,
        beatIndex: cursor.beatIndex % beatsForMeter(settings.meter),
        subdivisionIndex,
        subdivisionCount: offsets.length,
        phase: offsets[subdivisionIndex],
        isMainBeat: subdivisionIndex === 0
    };
}

function advanceScheduleCursor(cursor, settings) {
    const offsets = subdivisionOffsets(settings.meter, settings.rhythm);
    const event = describeScheduleEvent(cursor, settings);
    const nextSubdivisionIndex = event.subdivisionIndex + 1;
    if (nextSubdivisionIndex < offsets.length) {
        return {
            when: event.when + secondsPerBeat(settings.bpm) * (offsets[nextSubdivisionIndex] - offsets[event.subdivisionIndex]),
            beatIndex: event.beatIndex,
            subdivisionIndex: nextSubdivisionIndex
        };
    }
    return {
        when: event.when + secondsPerBeat(settings.bpm) * (1 - offsets[event.subdivisionIndex]),
        beatIndex: (event.beatIndex + 1) % beatsForMeter(settings.meter),
        subdivisionIndex: 0
    };
}

function scheduleEventsUntil(cursor, settings, horizon, maxEvents = 2048) {
    const events = [];
    let nextCursor = { ...cursor };
    while (nextCursor.when < horizon && events.length < maxEvents) {
        events.push(describeScheduleEvent(nextCursor, settings));
        nextCursor = advanceScheduleCursor(nextCursor, settings);
    }
    return { events, cursor: nextCursor };
}
const METRONOME_SCHEDULER_INTERVAL_MS = 25;
const METRONOME_SCHEDULE_AHEAD_SEC = 0.1;
const METRONOME_START_LEAD_SEC = 0.055;
const METRONOME_PREVIOUS_MAX_GAIN = 1.15;
const METRONOME_MAX_GAIN = 2.1;

function volumeLevel(volume) {
    const numeric = Number(volume);
    if (!Number.isFinite(numeric)) return 0;
    const normalized = Math.max(METRONOME_LIMITS.volumeMin, Math.min(METRONOME_LIMITS.volumeMax, numeric));
    if (normalized <= 0) return 0;
    if (normalized <= 50) {
        return METRONOME_PREVIOUS_MAX_GAIN * Math.pow(normalized / 50, 1.35);
    }
    return METRONOME_PREVIOUS_MAX_GAIN
        + (METRONOME_MAX_GAIN - METRONOME_PREVIOUS_MAX_GAIN) * Math.pow((normalized - 50) / 50, 1.15);
}

function createMetronomeAudioEngine(onVisualEvent = () => {}, environment = {}) {
    const windowObject = environment.windowObject || globalThis.window;
    const AudioContextClass = environment.AudioContextClass
        || windowObject?.AudioContext
        || windowObject?.webkitAudioContext;
    const setTimer = environment.setTimeout || windowObject?.setTimeout?.bind(windowObject);
    const clearTimer = environment.clearTimeout || windowObject?.clearTimeout?.bind(windowObject);
    const requestFrame = environment.requestAnimationFrame || windowObject?.requestAnimationFrame?.bind(windowObject);
    const cancelFrame = environment.cancelAnimationFrame || windowObject?.cancelAnimationFrame?.bind(windowObject);

    let context = null;
    let masterGain = null;
    let outputLimiter = null;
    let noiseBuffer = null;
    let schedulerTimer = 0;
    let visualFrame = 0;
    let playing = false;
    let cursor = createScheduleCursor();
    let visualQueue = [];
    let lastMainEvent = null;
    let startGeneration = 0;
    let latestVolume = METRONOME_DEFAULTS.volume;
    const activeSources = new Map();

    function setMasterVolume(volume, immediate = false) {
        latestVolume = clampInteger(
            volume,
            METRONOME_LIMITS.volumeMin,
            METRONOME_LIMITS.volumeMax,
            METRONOME_DEFAULTS.volume
        );
        if (!masterGain || !context) return;
        const target = volumeLevel(latestVolume);
        masterGain.gain.cancelScheduledValues?.(context.currentTime);
        if (!immediate && typeof masterGain.gain.setTargetAtTime === 'function') {
            masterGain.gain.setTargetAtTime(target, context.currentTime, 0.012);
        } else if (typeof masterGain.gain.setValueAtTime === 'function') {
            masterGain.gain.setValueAtTime(target, context.currentTime);
        } else {
            masterGain.gain.value = target;
        }
    }

    function ensureContext() {
        if (!context || context.state === 'closed') {
            if (!AudioContextClass) return null;
            context = new AudioContextClass();
            environment.onContext?.(context);
            masterGain = context.createGain();
            outputLimiter = typeof context.createDynamicsCompressor === 'function'
                ? context.createDynamicsCompressor()
                : null;
            if (outputLimiter) {
                outputLimiter.threshold.value = -3;
                outputLimiter.knee.value = 4;
                outputLimiter.ratio.value = 10;
                outputLimiter.attack.value = 0.002;
                outputLimiter.release.value = 0.06;
                masterGain.connect(outputLimiter).connect(context.destination);
            } else {
                masterGain.connect(context.destination);
            }
            noiseBuffer = null;
            setMasterVolume(latestVolume, true);
        }
        return context;
    }

    async function resume() {
        const audioContext = ensureContext();
        if (!audioContext) return null;
        if (audioContext.state === 'suspended') await audioContext.resume();
        return audioContext;
    }

    function trackSource(source, cleanup, when) {
        activeSources.set(source, { cleanup, when });
        source.addEventListener?.('ended', () => {
            const record = activeSources.get(source);
            if (record) record.cleanup();
            activeSources.delete(source);
        }, { once: true });
    }

    function connectEnvelope(source, when, peak, attack, release) {
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), when + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + release);
        source.connect(gain).connect(masterGain);
        trackSource(source, () => {
            try { source.disconnect(); } catch (_) { /* Already disconnected. */ }
            try { gain.disconnect(); } catch (_) { /* Already disconnected. */ }
        }, when);
    }

    function scheduleOscillator(when, { type, frequency, endFrequency = null, peak, attack, release }) {
        const oscillator = context.createOscillator();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, when);
        if (endFrequency !== null) {
            oscillator.frequency.exponentialRampToValueAtTime(endFrequency, when + release);
        }
        connectEnvelope(oscillator, when, peak, attack, release);
        oscillator.start(when);
        oscillator.stop(when + release + 0.012);
    }

    // Rhythm Cruiseのsquare波クリック（accent 1500Hz / normal 1200Hz）を、
    // マイク判定系へ依存しないCruise Port専用gainへ移し、短いattackを強める。
    function scheduleElectronic(when, voice) {
        const voices = {
            accent: { frequency: 1500, peak: 0.82, release: 0.072 },
            main: { frequency: 1200, peak: 0.70, release: 0.064 },
            subdivision: { frequency: 900, peak: 0.40, release: 0.034 }
        };
        const selected = voices[voice];
        scheduleOscillator(when, {
            type: 'square',
            frequency: selected.frequency,
            peak: selected.peak,
            attack: 0.0012,
            release: selected.release
        });
    }

    function scheduleSound(when, sound, voice) {
        scheduleElectronic(when, voice); // M1: Standard default only.
    }

    function scheduleEvent(event, settings) {
        const accentEnabled = event.isMainBeat && settings.accents[event.beatIndex] === true;
        const voice = accentEnabled ? 'accent' : (event.isMainBeat ? 'main' : 'subdivision');
        if (latestVolume > 0) scheduleSound(event.when, settings.sound, voice);
        visualQueue.push({ ...event, voice, sound: settings.sound, accentEnabled });
    }

    function cancelSources({ futureOnly = false } = {}) {
        const now = context?.currentTime ?? 0;
        activeSources.forEach((record, source) => {
            if (futureOnly && record.when <= now + 0.003) return;
            try { source.stop(); } catch (_) { /* A source may already have ended. */ }
            record.cleanup();
            activeSources.delete(source);
        });
    }

    function visualTick() {
        if (!playing || !context) return;
        while (visualQueue.length && visualQueue[0].when <= context.currentTime) {
            const event = visualQueue.shift();
            if (event.isMainBeat) lastMainEvent = event;
            onVisualEvent(event);
        }
        visualFrame = requestFrame?.(visualTick) || 0;
    }

    function scheduler(getSettings) {
        if (!playing || !context) return;
        const settings = getSettings();
        if (cursor.when < context.currentTime - METRONOME_SCHEDULE_AHEAD_SEC) {
            cursor = createScheduleCursor(context.currentTime + METRONOME_START_LEAD_SEC, cursor.beatIndex, 0);
        }
        const batch = scheduleEventsUntil(cursor, settings, context.currentTime + METRONOME_SCHEDULE_AHEAD_SEC);
        batch.events.forEach((event) => scheduleEvent(event, settings));
        cursor = batch.cursor;
        schedulerTimer = setTimer?.(() => scheduler(getSettings), METRONOME_SCHEDULER_INTERVAL_MS) || 0;
    }

    async function start(getSettings, canStart = () => true) {
        if (playing) return true;
        const generation = ++startGeneration;
        const audioContext = await resume();
        if (generation !== startGeneration || !audioContext || audioContext.state !== 'running' || !canStart()) return false;
        const settings = getSettings();
        playing = true;
        setMasterVolume(settings.volume, true);
        cursor = createScheduleCursor(audioContext.currentTime + METRONOME_START_LEAD_SEC);
        visualQueue = [];
        lastMainEvent = null;
        scheduler(getSettings);
        visualFrame = requestFrame?.(visualTick) || 0;
        return true;
    }

    function stop() {
        startGeneration += 1;
        playing = false;
        if (schedulerTimer) clearTimer?.(schedulerTimer);
        if (visualFrame) cancelFrame?.(visualFrame);
        schedulerTimer = 0;
        visualFrame = 0;
        visualQueue = [];
        lastMainEvent = null;
        cancelSources();
    }

    function reschedule(getSettings, { resetBeat = false } = {}) {
        if (!playing || !context) return;
        const settings = getSettings();
        const now = context.currentTime;
        while (visualQueue.length && visualQueue[0].when <= now) {
            const event = visualQueue.shift();
            if (event.isMainBeat) lastMainEvent = event;
            onVisualEvent(event);
        }
        const futureMain = visualQueue.find((event) => event.isMainBeat && event.when >= now + METRONOME_START_LEAD_SEC);
        let nextTime = futureMain?.when;
        let nextBeatIndex = resetBeat ? 0 : futureMain?.beatIndex;
        if (!Number.isFinite(nextTime)) {
            nextTime = lastMainEvent
                ? lastMainEvent.when + secondsPerBeat(settings.bpm)
                : now + METRONOME_START_LEAD_SEC;
            nextBeatIndex = resetBeat
                ? 0
                : ((lastMainEvent?.beatIndex ?? -1) + 1) % beatsForMeter(settings.meter);
        }
        while (nextTime < now + METRONOME_START_LEAD_SEC) {
            nextTime += secondsPerBeat(settings.bpm);
            if (!resetBeat) nextBeatIndex = (nextBeatIndex + 1) % beatsForMeter(settings.meter);
        }
        if (schedulerTimer) clearTimer?.(schedulerTimer);
        schedulerTimer = 0;
        cancelSources({ futureOnly: true });
        visualQueue = [];
        cursor = createScheduleCursor(nextTime, nextBeatIndex || 0, 0);
        scheduler(getSettings);
    }

    async function suspend() {
        stop();
        if (context?.state === 'running' && typeof context.suspend === 'function') {
            try { await context.suspend(); } catch (_) { /* The document is already leaving. */ }
        }
    }

    function snapshot() {
        return {
            playing,
            contextState: context?.state || 'none',
            activeSourceCount: activeSources.size,
            scheduledEvents: visualQueue.map((event) => ({ ...event })),
            cursor: { ...cursor },
            volume: latestVolume,
            outputLimiter: outputLimiter ? {
                threshold: outputLimiter.threshold.value,
                knee: outputLimiter.knee.value,
                ratio: outputLimiter.ratio.value,
                attack: outputLimiter.attack.value,
                release: outputLimiter.release.value
            } : null
        };
    }

    return {
        start,
        stop,
        close: function () {
            stop();
            const owned = context;
            try { masterGain?.disconnect(); outputLimiter?.disconnect(); } catch (_) { /* Already disconnected. */ }
            masterGain = outputLimiter = noiseBuffer = null;
            return Promise.resolve(owned && owned.state !== 'closed' ? owned.close() : undefined).then(function () {
                if (context === owned) context = null;
            });
        },
        reschedule,
        suspend,
        setVolume: setMasterVolume,
        isPlaying: () => playing,
        snapshot
    };
}

return Object.freeze({ defaults: METRONOME_DEFAULTS, limits: METRONOME_LIMITS, clampInteger,
    createMetronomeAudioEngine, secondsPerBeat, createScheduleCursor, scheduleEventsUntil,
    intervalMs: METRONOME_SCHEDULER_INTERVAL_MS, horizonSec: METRONOME_SCHEDULE_AHEAD_SEC, leadSec: METRONOME_START_LEAD_SEC });
});
