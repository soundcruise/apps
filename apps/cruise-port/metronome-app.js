import {
    METRONOME_DEFAULTS,
    METRONOME_LIMITS,
    clampInteger,
    loadMetronomeSettings,
    saveMetronomeSettings
} from './metronome-store.js';

export const METRONOME_SCHEDULER_INTERVAL_MS = 30;
export const METRONOME_SCHEDULE_AHEAD_SEC = 0.13;
const METRONOME_START_LEAD_SEC = 0.06;
const TAP_RESET_MS = 3000;
const TAP_HISTORY_LIMIT = 4;

const METER_BEATS = Object.freeze({
    '2/4': 2,
    '3/4': 3,
    '4/4': 4,
    '6/8': 6
});

const METER_LABELS = Object.freeze({
    '2/4': '4分の2拍子',
    '3/4': '4分の3拍子',
    '4/4': '4分の4拍子',
    '6/8': '8分の6拍子'
});

export function beatsForMeter(meter) {
    return METER_BEATS[meter] || METER_BEATS[METRONOME_DEFAULTS.meter];
}

export function accentForBeat(meter, beatIndex) {
    if (beatIndex === 0) return 'strong';
    if (meter === '6/8' && beatIndex === 3) return 'medium';
    return 'normal';
}

export function secondsPerBeat(bpm) {
    return 60 / clampInteger(bpm, METRONOME_LIMITS.bpmMin, METRONOME_LIMITS.bpmMax, METRONOME_DEFAULTS.bpm);
}

export function bpmFromTapTimes(tapTimes) {
    if (!Array.isArray(tapTimes) || tapTimes.length < 2) return null;
    const recent = tapTimes.slice(-TAP_HISTORY_LIMIT);
    const intervals = [];
    for (let index = 1; index < recent.length; index += 1) {
        const interval = recent[index] - recent[index - 1];
        if (!(interval > 0) || interval >= TAP_RESET_MS) return null;
        intervals.push(interval);
    }
    if (!intervals.length) return null;
    const averageMs = intervals.reduce((total, interval) => total + interval, 0) / intervals.length;
    return clampInteger(60000 / averageMs, METRONOME_LIMITS.bpmMin, METRONOME_LIMITS.bpmMax, METRONOME_DEFAULTS.bpm);
}

function createAudioEngine(onVisualBeat) {
    let context = null;
    let noiseBuffer = null;
    let schedulerTimer = 0;
    let visualFrame = 0;
    let playing = false;
    let nextNoteTime = 0;
    let nextBeatIndex = 0;
    let visualQueue = [];
    const activeSources = new Map();

    function ensureContext() {
        if (!context || context.state === 'closed') {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return null;
            context = new AudioContextClass();
            noiseBuffer = null;
        }
        return context;
    }

    async function resume() {
        const audioContext = ensureContext();
        if (!audioContext) return null;
        if (audioContext.state === 'suspended') await audioContext.resume();
        return audioContext;
    }

    function getNoiseBuffer() {
        if (noiseBuffer) return noiseBuffer;
        const length = Math.ceil(context.sampleRate * 0.12);
        noiseBuffer = context.createBuffer(1, length, context.sampleRate);
        const samples = noiseBuffer.getChannelData(0);
        for (let index = 0; index < samples.length; index += 1) {
            samples[index] = Math.random() * 2 - 1;
        }
        return noiseBuffer;
    }

    function trackSource(source, cleanup) {
        activeSources.set(source, cleanup);
        source.addEventListener('ended', () => {
            const release = activeSources.get(source);
            if (release) release();
            activeSources.delete(source);
        }, { once: true });
    }

    function connectEnvelope(source, when, peak, attack, release, outputNode = context.destination) {
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), when + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + release);
        source.connect(gain).connect(outputNode);
        return gain;
    }

    function scheduleOscillator(when, options) {
        const oscillator = context.createOscillator();
        oscillator.type = options.type;
        oscillator.frequency.setValueAtTime(options.frequency, when);
        if (options.endFrequency) {
            oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, when + options.release);
        }
        const gain = connectEnvelope(oscillator, when, options.peak, options.attack, options.release);
        trackSource(oscillator, () => {
            try { oscillator.disconnect(); } catch (error) { /* Already disconnected. */ }
            try { gain.disconnect(); } catch (error) { /* Already disconnected. */ }
        });
        oscillator.start(when);
        oscillator.stop(when + options.release + 0.015);
    }

    function scheduleNoise(when, options) {
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        source.buffer = getNoiseBuffer();
        filter.type = options.filterType;
        filter.frequency.setValueAtTime(options.frequency, when);
        filter.Q.value = options.q;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, options.peak), when + options.attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + options.release);
        source.connect(filter).connect(gain).connect(context.destination);
        trackSource(source, () => {
            try { source.disconnect(); } catch (error) { /* Already disconnected. */ }
            try { filter.disconnect(); } catch (error) { /* Already disconnected. */ }
            try { gain.disconnect(); } catch (error) { /* Already disconnected. */ }
        });
        source.start(when);
        source.stop(when + options.release + 0.015);
    }

    function volumeLevel(volume) {
        if (volume <= 0) return 0;
        return Math.pow(volume / 100, 1.35);
    }

    function scheduleStandard(when, accent, volume) {
        const levels = {
            strong: { frequency: 1500, peak: 0.42 },
            medium: { frequency: 1350, peak: 0.35 },
            normal: { frequency: 1200, peak: 0.30 }
        };
        const voice = levels[accent];
        scheduleOscillator(when, {
            type: 'square',
            frequency: voice.frequency,
            peak: voice.peak * volume,
            attack: 0.002,
            release: 0.085
        });
    }

    function scheduleElectronicClick(when, accent, volume) {
        const levels = {
            strong: { frequency: 2600, peak: 0.34 },
            medium: { frequency: 2300, peak: 0.29 },
            normal: { frequency: 2050, peak: 0.25 }
        };
        const voice = levels[accent];
        scheduleOscillator(when, {
            type: 'square',
            frequency: voice.frequency,
            peak: voice.peak * volume,
            attack: 0.001,
            release: 0.045
        });
    }

    function scheduleWood(when, accent, volume) {
        const levels = {
            strong: { frequency: 980, noise: 0.27, body: 0.15 },
            medium: { frequency: 830, noise: 0.23, body: 0.13 },
            normal: { frequency: 690, noise: 0.20, body: 0.11 }
        };
        const voice = levels[accent];
        scheduleNoise(when, {
            filterType: 'bandpass',
            frequency: voice.frequency,
            q: 3.6,
            peak: voice.noise * volume,
            attack: 0.0015,
            release: 0.075
        });
        scheduleOscillator(when, {
            type: 'triangle',
            frequency: voice.frequency * 0.62,
            peak: voice.body * volume,
            attack: 0.002,
            release: 0.09
        });
    }

    function scheduleKick(when, strength, volume) {
        scheduleOscillator(when, {
            type: 'sine',
            frequency: strength === 'strong' ? 145 : 120,
            endFrequency: 52,
            peak: (strength === 'strong' ? 0.62 : 0.42) * volume,
            attack: 0.002,
            release: strength === 'strong' ? 0.16 : 0.13
        });
    }

    function scheduleHat(when, volume) {
        scheduleNoise(when, {
            filterType: 'highpass',
            frequency: 5200,
            q: 0.8,
            peak: 0.16 * volume,
            attack: 0.001,
            release: 0.045
        });
    }

    function scheduleSnare(when, volume) {
        scheduleNoise(when, {
            filterType: 'bandpass',
            frequency: 1800,
            q: 0.9,
            peak: 0.22 * volume,
            attack: 0.001,
            release: 0.09
        });
        scheduleOscillator(when, {
            type: 'triangle',
            frequency: 185,
            peak: 0.08 * volume,
            attack: 0.001,
            release: 0.07
        });
    }

    function scheduleDrum(when, meter, beatIndex, volume) {
        if (beatIndex === 0) {
            scheduleKick(when, 'strong', volume);
            return;
        }
        if (meter === '4/4' && beatIndex === 2) {
            scheduleSnare(when, volume);
            return;
        }
        if (meter === '6/8' && beatIndex === 3) {
            scheduleKick(when, 'medium', volume);
            return;
        }
        scheduleHat(when, volume);
    }

    function scheduleBeat(when, beatIndex, settings) {
        const volume = volumeLevel(settings.volume);
        const accent = accentForBeat(settings.meter, beatIndex);
        if (volume > 0) {
            if (settings.sound === 'wood') scheduleWood(when, accent, volume);
            else if (settings.sound === 'click') scheduleElectronicClick(when, accent, volume);
            else if (settings.sound === 'drum') scheduleDrum(when, settings.meter, beatIndex, volume);
            else scheduleStandard(when, accent, volume);
        }
        visualQueue.push({ when, beatIndex });
    }

    function cancelScheduledSources() {
        activeSources.forEach((cleanup, source) => {
            try { source.stop(); } catch (error) { /* A source may already have ended. */ }
            cleanup();
        });
        activeSources.clear();
    }

    function visualTick() {
        if (!playing || !context) return;
        while (visualQueue.length && visualQueue[0].when <= context.currentTime) {
            onVisualBeat(visualQueue.shift().beatIndex);
        }
        visualFrame = window.requestAnimationFrame(visualTick);
    }

    function scheduler(getSettings) {
        if (!playing || !context) return;
        const settings = getSettings();
        if (nextNoteTime < context.currentTime - METRONOME_SCHEDULE_AHEAD_SEC) {
            nextNoteTime = context.currentTime + METRONOME_START_LEAD_SEC;
        }
        const horizon = context.currentTime + METRONOME_SCHEDULE_AHEAD_SEC;
        while (nextNoteTime < horizon) {
            scheduleBeat(nextNoteTime, nextBeatIndex, settings);
            nextBeatIndex = (nextBeatIndex + 1) % beatsForMeter(settings.meter);
            nextNoteTime += secondsPerBeat(settings.bpm);
        }
        schedulerTimer = window.setTimeout(() => scheduler(getSettings), METRONOME_SCHEDULER_INTERVAL_MS);
    }

    async function start(getSettings) {
        if (playing) return true;
        const audioContext = await resume();
        if (!audioContext || audioContext.state !== 'running') return false;
        playing = true;
        nextBeatIndex = 0;
        nextNoteTime = audioContext.currentTime + METRONOME_START_LEAD_SEC;
        visualQueue = [];
        scheduler(getSettings);
        visualFrame = window.requestAnimationFrame(visualTick);
        return true;
    }

    function stop() {
        playing = false;
        window.clearTimeout(schedulerTimer);
        window.cancelAnimationFrame(visualFrame);
        schedulerTimer = 0;
        visualFrame = 0;
        visualQueue = [];
        cancelScheduledSources();
    }

    function reschedule(getSettings, currentBeat) {
        if (!playing || !context) return;
        window.clearTimeout(schedulerTimer);
        schedulerTimer = 0;
        cancelScheduledSources();
        visualQueue = [];
        nextBeatIndex = currentBeat < 0
            ? 0
            : (currentBeat + 1) % beatsForMeter(getSettings().meter);
        nextNoteTime = context.currentTime + METRONOME_START_LEAD_SEC;
        scheduler(getSettings);
    }

    async function suspend() {
        stop();
        if (context && context.state === 'running' && typeof context.suspend === 'function') {
            try { await context.suspend(); } catch (error) { /* The page is already leaving. */ }
        }
    }

    return {
        start,
        stop,
        reschedule,
        suspend,
        isPlaying: () => playing
    };
}

export function initMetronome(root) {
    const elements = {
        title: root.querySelector('#metronome-title'),
        bpm: root.querySelector('#metronome-bpm'),
        meter: root.querySelector('#metronome-meter'),
        sound: root.querySelector('#metronome-sound'),
        volume: root.querySelector('#metronome-volume'),
        volumeValue: root.querySelector('#metronome-volume-value'),
        beats: root.querySelector('#metronome-beats'),
        toggle: root.querySelector('#metronome-toggle'),
        tap: root.querySelector('#metronome-tap'),
        tapStatus: root.querySelector('#metronome-tap-status'),
        status: root.querySelector('#metronome-status'),
        storageError: root.querySelector('#metronome-storage-error'),
        stepButtons: [...root.querySelectorAll('[data-bpm-delta]')]
    };

    const loadResult = loadMetronomeSettings();
    const state = {
        settings: loadResult.settings,
        currentBeat: -1,
        tapTimes: []
    };

    function getSettings() {
        return { ...state.settings };
    }

    function showStorageError(message = '') {
        elements.storageError.textContent = message;
        elements.storageError.hidden = !message;
    }

    function saveSettings() {
        const result = saveMetronomeSettings(state.settings);
        showStorageError(result.ok ? '' : 'メトロノーム設定を保存できませんでした。現在の操作はこの画面内だけに反映されています。');
    }

    function renderBeatDisplay() {
        const beatCount = beatsForMeter(state.settings.meter);
        elements.beats.replaceChildren();
        for (let index = 0; index < beatCount; index += 1) {
            const dot = document.createElement('span');
            const accent = accentForBeat(state.settings.meter, index);
            dot.className = `beat-dot beat-${accent}`;
            if (index === state.currentBeat) dot.classList.add('is-current');
            if (state.settings.meter === '6/8' && index === 3) dot.classList.add('group-start');
            dot.setAttribute('aria-hidden', 'true');
            elements.beats.append(dot);
        }
        elements.beats.setAttribute(
            'aria-label',
            state.currentBeat < 0
                ? `${METER_LABELS[state.settings.meter]}、停止中`
                : `${METER_LABELS[state.settings.meter]}、${state.currentBeat + 1}拍目`
        );
    }

    function renderControls() {
        elements.bpm.value = String(state.settings.bpm);
        elements.meter.value = state.settings.meter;
        elements.sound.value = state.settings.sound;
        elements.volume.value = String(state.settings.volume);
        elements.volumeValue.value = String(state.settings.volume);
        renderBeatDisplay();
    }

    function renderPlaying() {
        const playing = engine.isPlaying();
        elements.toggle.textContent = playing ? '■ 停止' : '▶ 開始';
        elements.toggle.classList.toggle('is-playing', playing);
        elements.status.textContent = playing ? '再生中' : '停止中';
    }

    function setVisualBeat(beatIndex) {
        state.currentBeat = beatIndex;
        renderBeatDisplay();
    }

    const engine = createAudioEngine(setVisualBeat);

    function rescheduleIfPlaying() {
        if (engine.isPlaying()) engine.reschedule(getSettings, state.currentBeat);
    }

    function setBpm(value, { persist = true } = {}) {
        const bpm = clampInteger(value, METRONOME_LIMITS.bpmMin, METRONOME_LIMITS.bpmMax, state.settings.bpm);
        state.settings = { ...state.settings, bpm };
        elements.bpm.value = String(bpm);
        if (persist) saveSettings();
        rescheduleIfPlaying();
        return bpm;
    }

    elements.stepButtons.forEach((button) => {
        button.addEventListener('click', () => setBpm(state.settings.bpm + Number(button.dataset.bpmDelta)));
    });

    elements.bpm.addEventListener('change', () => setBpm(elements.bpm.value));
    elements.bpm.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            setBpm(elements.bpm.value);
            elements.bpm.blur();
        }
    });

    elements.meter.addEventListener('change', () => {
        state.settings = { ...state.settings, meter: elements.meter.value };
        state.currentBeat = -1;
        renderBeatDisplay();
        saveSettings();
        rescheduleIfPlaying();
    });

    elements.sound.addEventListener('change', () => {
        state.settings = { ...state.settings, sound: elements.sound.value };
        saveSettings();
        rescheduleIfPlaying();
    });

    elements.volume.addEventListener('input', () => {
        const volume = clampInteger(elements.volume.value, METRONOME_LIMITS.volumeMin, METRONOME_LIMITS.volumeMax, state.settings.volume);
        state.settings = { ...state.settings, volume };
        elements.volumeValue.value = String(volume);
    });
    elements.volume.addEventListener('change', saveSettings);

    elements.toggle.addEventListener('click', async () => {
        if (engine.isPlaying()) {
            engine.stop();
            state.currentBeat = -1;
            renderBeatDisplay();
            renderPlaying();
            return;
        }
        elements.toggle.disabled = true;
        try {
            const started = await engine.start(getSettings);
            if (!started) elements.status.textContent = '音声を開始できませんでした。もう一度お試しください。';
            renderPlaying();
        } catch (error) {
            elements.status.textContent = '音声を開始できませんでした。もう一度お試しください。';
        } finally {
            elements.toggle.disabled = false;
        }
    });

    elements.tap.addEventListener('click', () => {
        const now = performance.now();
        const lastTap = state.tapTimes[state.tapTimes.length - 1];
        if (lastTap === undefined || now - lastTap >= TAP_RESET_MS) {
            state.tapTimes = [now];
            elements.tapStatus.textContent = 'もう一度タップ';
            return;
        }
        state.tapTimes.push(now);
        state.tapTimes = state.tapTimes.slice(-TAP_HISTORY_LIMIT);
        const bpm = bpmFromTapTimes(state.tapTimes);
        if (bpm === null) return;
        setBpm(bpm);
        elements.tapStatus.textContent = `${bpm} BPM ・ 続けてタップできます`;
    });

    if (!loadResult.ok) {
        showStorageError('保存済みのメトロノーム設定を読み込めません。保存内容は変更していません。初期値で表示しています。');
    }
    renderControls();
    renderPlaying();

    return {
        setActive(active) {
            if (!active && engine.isPlaying()) {
                engine.stop();
                state.currentBeat = -1;
                renderBeatDisplay();
                renderPlaying();
            }
            if (active) elements.title.focus({ preventScroll: true });
        },
        stopForPageHidden() {
            state.tapTimes = [];
            engine.suspend();
            state.currentBeat = -1;
            renderBeatDisplay();
            renderPlaying();
        }
    };
}
