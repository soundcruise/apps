import {
    METRONOME_DEFAULTS,
    METRONOME_LIMITS,
    clampInteger,
    defaultAccentsForMeter,
    loadMetronomeSettings,
    saveMetronomeSettings
} from './metronome-store.js?v=2.0.0';
import {
    beatsForMeter,
    compatibleRhythm,
    createScheduleCursor,
    isCompoundMeter,
    isRhythmSupported,
    meterLabel,
    scheduleEventsUntil,
    secondsPerBeat
} from './metronome-timing.js?v=1.0.0';

export const METRONOME_SCHEDULER_INTERVAL_MS = 25;
export const METRONOME_SCHEDULE_AHEAD_SEC = 0.1;
export const METRONOME_START_LEAD_SEC = 0.055;
export const METRONOME_TAP_RESET_MS = 3000;
export const METRONOME_TAP_MIN_INTERVAL_MS = 250;
export const METRONOME_TAP_HISTORY_LIMIT = 4;

export function bpmFromTapTimes(tapTimes) {
    if (!Array.isArray(tapTimes) || tapTimes.length < 2) return null;
    const recent = tapTimes.slice(-METRONOME_TAP_HISTORY_LIMIT);
    const intervals = [];
    for (let index = 1; index < recent.length; index += 1) {
        const interval = recent[index] - recent[index - 1];
        if (interval < METRONOME_TAP_MIN_INTERVAL_MS || interval >= METRONOME_TAP_RESET_MS) return null;
        intervals.push(interval);
    }
    const averageMs = intervals.reduce((total, interval) => total + interval, 0) / intervals.length;
    return clampInteger(60000 / averageMs, METRONOME_LIMITS.bpmMin, METRONOME_LIMITS.bpmMax, METRONOME_DEFAULTS.bpm);
}

function volumeLevel(volume) {
    if (volume <= 0) return 0;
    return Math.pow(volume / 100, 1.35);
}

export function createMetronomeAudioEngine(onVisualEvent = () => {}, environment = {}) {
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
            masterGain = context.createGain();
            masterGain.connect(context.destination);
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
    // マイク判定系へ依存しないCruise Port専用の安全なgainで再利用する。
    function scheduleElectronic(when, voice) {
        const voices = {
            accent: { frequency: 1500, peak: 0.46, release: 0.08 },
            main: { frequency: 1200, peak: 0.35, release: 0.075 },
            subdivision: { frequency: 900, peak: 0.19, release: 0.042 }
        };
        const selected = voices[voice];
        scheduleOscillator(when, {
            type: 'square',
            frequency: selected.frequency,
            peak: selected.peak,
            attack: 0.002,
            release: selected.release
        });
    }

    // Fretboard Cruise「指板をたどる」のkick/snare/hat生成方式を再利用。
    // subdivisionでも重ならないよう、同じ周波数特性を保ったままgainとtailを安全側へ整える。
    function scheduleDrum(when, voice) {
        if (voice === 'accent') {
            scheduleOscillator(when, {
                type: 'sine',
                frequency: 150,
                endFrequency: 42,
                peak: 0.52,
                attack: 0.002,
                release: 0.18
            });
            scheduleOscillator(when, {
                type: 'square',
                frequency: 8000,
                peak: 0.035,
                attack: 0.001,
                release: 0.04
            });
            return;
        }
        if (voice === 'main') {
            scheduleOscillator(when, {
                type: 'square',
                frequency: 250,
                peak: 0.23,
                attack: 0.001,
                release: 0.075
            });
            return;
        }
        scheduleOscillator(when, {
            type: 'square',
            frequency: 8000,
            peak: 0.06,
            attack: 0.001,
            release: 0.032
        });
    }

    function scheduleEvent(event, settings) {
        const accentEnabled = event.isMainBeat && settings.accents[event.beatIndex] === true;
        const voice = accentEnabled ? 'accent' : (event.isMainBeat ? 'main' : 'subdivision');
        if (latestVolume > 0) {
            if (settings.sound === 'drum') scheduleDrum(event.when, voice);
            else scheduleElectronic(event.when, voice);
        }
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
            volume: latestVolume
        };
    }

    return {
        start,
        stop,
        reschedule,
        suspend,
        setVolume: setMasterVolume,
        isPlaying: () => playing,
        snapshot
    };
}

export function initMetronome(root) {
    const elements = {
        title: root.querySelector('#metronome-title'),
        bpm: root.querySelector('#metronome-bpm'),
        bpmSlider: root.querySelector('#metronome-bpm-slider'),
        meter: root.querySelector('#metronome-meter'),
        tempoNote: root.querySelector('#metronome-tempo-note'),
        rhythm: root.querySelector('#metronome-rhythm'),
        rhythmHint: root.querySelector('#metronome-rhythm-hint'),
        sound: root.querySelector('#metronome-sound'),
        volume: root.querySelector('#metronome-volume'),
        volumeValue: root.querySelector('#metronome-volume-value'),
        beats: root.querySelector('#metronome-beats'),
        toggle: root.querySelector('#metronome-toggle'),
        tap: root.querySelector('#metronome-tap'),
        tapStatus: root.querySelector('#metronome-tap-status'),
        status: root.querySelector('#metronome-status'),
        storageError: root.querySelector('#metronome-storage-error'),
        stepButtons: [...root.querySelectorAll('[data-bpm-delta]')],
        rhythmButtons: [...root.querySelectorAll('[data-metronome-rhythm]')]
    };

    const loadResult = loadMetronomeSettings();
    const state = {
        settings: loadResult.settings,
        currentBeat: -1,
        currentSubdivision: -1,
        tapTimes: []
    };
    let viewActive = false;

    function getSettings() {
        return { ...state.settings, accents: [...state.settings.accents] };
    }

    function showStorageError(message = '') {
        elements.storageError.textContent = message;
        elements.storageError.hidden = !message;
    }

    function saveSettings() {
        const result = saveMetronomeSettings(state.settings);
        showStorageError(result.ok ? '' : 'メトロノーム設定を保存できませんでした。現在の操作はこの画面内だけに反映されています。');
    }

    function renderBeatState() {
        const buttons = [...elements.beats.querySelectorAll('[data-accent-beat]')];
        buttons.forEach((button, index) => {
            const accented = state.settings.accents[index] === true;
            button.classList.toggle('is-accented', accented);
            button.classList.toggle('is-current', index === state.currentBeat);
            button.classList.toggle('is-main-pulse', index === state.currentBeat && state.currentSubdivision === 0);
            button.setAttribute('aria-pressed', String(accented));
            button.setAttribute('aria-label', `${index + 1}拍目、アクセント${accented ? 'オン' : 'オフ'}`);
            button.querySelector('.beat-mark').textContent = accented ? '●' : '○';
        });
        elements.beats.setAttribute(
            'aria-label',
            state.currentBeat < 0
                ? `${meterLabel(state.settings.meter)}、停止中。拍を押すとアクセントを変更できます`
                : `${meterLabel(state.settings.meter)}、${state.currentBeat + 1}拍目`
        );
    }

    function rebuildBeatDisplay() {
        elements.beats.replaceChildren();
        for (let index = 0; index < beatsForMeter(state.settings.meter); index += 1) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'beat-button';
            button.dataset.accentBeat = String(index);
            const mark = document.createElement('span');
            mark.className = 'beat-mark';
            mark.setAttribute('aria-hidden', 'true');
            const number = document.createElement('span');
            number.className = 'beat-number';
            number.setAttribute('aria-hidden', 'true');
            number.textContent = String(index + 1);
            button.append(mark, number);
            elements.beats.append(button);
        }
        renderBeatState();
    }

    function renderRhythmControls() {
        elements.rhythmButtons.forEach((button) => {
            const rhythm = button.dataset.metronomeRhythm;
            const supported = isRhythmSupported(state.settings.meter, rhythm);
            const selected = state.settings.rhythm === rhythm;
            button.disabled = !supported;
            button.setAttribute('aria-disabled', String(!supported));
            button.setAttribute('aria-checked', String(selected));
            button.classList.toggle('is-selected', selected);
        });
        elements.rhythmHint.hidden = !isCompoundMeter(state.settings.meter);
    }

    function renderControls({ rebuildBeats = true } = {}) {
        elements.bpm.value = String(state.settings.bpm);
        elements.bpmSlider.value = String(state.settings.bpm);
        elements.bpmSlider.setAttribute('aria-valuetext', `${state.settings.bpm} BPM`);
        elements.meter.value = state.settings.meter;
        elements.sound.value = state.settings.sound;
        elements.volume.value = String(state.settings.volume);
        elements.volumeValue.value = String(state.settings.volume);
        elements.tempoNote.textContent = isCompoundMeter(state.settings.meter)
            ? '付点4分音符＝BPM'
            : '4分音符＝BPM';
        renderRhythmControls();
        if (rebuildBeats) rebuildBeatDisplay();
        else renderBeatState();
    }

    function renderPlaying() {
        const playing = engine.isPlaying();
        elements.toggle.textContent = playing ? '■ 停止' : '▶ 開始';
        elements.toggle.classList.toggle('is-playing', playing);
        elements.toggle.setAttribute('aria-pressed', String(playing));
        elements.status.textContent = playing ? '再生中' : '停止中';
    }

    function setVisualEvent(event) {
        state.currentBeat = event.beatIndex;
        state.currentSubdivision = event.subdivisionIndex;
        renderBeatState();
    }

    const engine = createMetronomeAudioEngine(setVisualEvent);

    function rescheduleIfPlaying(options) {
        if (engine.isPlaying()) engine.reschedule(getSettings, options);
    }

    function resetTapState() {
        state.tapTimes = [];
        elements.tapStatus.textContent = 'タップしてテンポを測定';
    }

    function setBpm(value, { persist = true } = {}) {
        const bpm = clampInteger(value, METRONOME_LIMITS.bpmMin, METRONOME_LIMITS.bpmMax, state.settings.bpm);
        state.settings = { ...state.settings, bpm };
        elements.bpm.value = String(bpm);
        elements.bpmSlider.value = String(bpm);
        elements.bpmSlider.setAttribute('aria-valuetext', `${bpm} BPM`);
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
    elements.bpmSlider.addEventListener('input', () => setBpm(elements.bpmSlider.value, { persist: false }));
    elements.bpmSlider.addEventListener('change', saveSettings);

    elements.tap.addEventListener('click', () => {
        const now = performance.now();
        const lastTap = state.tapTimes[state.tapTimes.length - 1];
        const interval = lastTap === undefined ? null : now - lastTap;
        if (interval === null || interval < METRONOME_TAP_MIN_INTERVAL_MS || interval >= METRONOME_TAP_RESET_MS) {
            state.tapTimes = [now];
            elements.tapStatus.textContent = 'もう一度タップ';
            return;
        }
        state.tapTimes.push(now);
        state.tapTimes = state.tapTimes.slice(-METRONOME_TAP_HISTORY_LIMIT);
        const bpm = bpmFromTapTimes(state.tapTimes);
        if (bpm === null) return;
        setBpm(bpm);
        elements.tapStatus.textContent = `${bpm} BPM ・ 続けてタップできます`;
    });

    elements.meter.addEventListener('change', () => {
        const meter = elements.meter.value;
        const rhythm = compatibleRhythm(meter, state.settings.rhythm);
        state.settings = {
            ...state.settings,
            meter,
            rhythm,
            accents: defaultAccentsForMeter(meter)
        };
        state.currentBeat = -1;
        state.currentSubdivision = -1;
        renderControls();
        saveSettings();
        rescheduleIfPlaying({ resetBeat: true });
    });

    elements.rhythm.addEventListener('click', (event) => {
        const button = event.target.closest('[data-metronome-rhythm]');
        if (!button || button.disabled) return;
        const rhythm = button.dataset.metronomeRhythm;
        state.settings = { ...state.settings, rhythm };
        renderRhythmControls();
        saveSettings();
        rescheduleIfPlaying();
    });

    elements.beats.addEventListener('click', (event) => {
        const button = event.target.closest('[data-accent-beat]');
        if (!button) return;
        const beatIndex = Number(button.dataset.accentBeat);
        const accents = [...state.settings.accents];
        accents[beatIndex] = !accents[beatIndex];
        state.settings = { ...state.settings, accents };
        renderBeatState();
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
        engine.setVolume(volume);
    });
    elements.volume.addEventListener('change', saveSettings);

    elements.toggle.addEventListener('click', async () => {
        if (engine.isPlaying()) {
            engine.stop();
            state.currentBeat = -1;
            state.currentSubdivision = -1;
            renderBeatState();
            renderPlaying();
            return;
        }
        elements.toggle.disabled = true;
        try {
            const started = await engine.start(getSettings, () => viewActive && !document.hidden);
            if (!started && viewActive) elements.status.textContent = '音声を開始できませんでした。もう一度お試しください。';
            renderPlaying();
        } catch (_) {
            elements.status.textContent = '音声を開始できませんでした。もう一度お試しください。';
        } finally {
            elements.toggle.disabled = false;
        }
    });

    if (!loadResult.ok) {
        showStorageError(loadResult.reason === 'migration-write-failed'
            ? '旧設定を使用していますが、新しい形式で保存できませんでした。'
            : '保存済みのメトロノーム設定を読み込めません。保存内容は変更していません。初期値で表示しています。');
    }
    renderControls();
    renderPlaying();

    return {
        setActive(active) {
            viewActive = active;
            if (!active) {
                engine.stop();
                state.currentBeat = -1;
                state.currentSubdivision = -1;
                resetTapState();
                renderBeatState();
                renderPlaying();
            }
            if (active) elements.title.focus({ preventScroll: true });
        },
        stopForPageHidden() {
            resetTapState();
            engine.suspend();
            state.currentBeat = -1;
            state.currentSubdivision = -1;
            renderBeatState();
            renderPlaying();
        }
    };
}
