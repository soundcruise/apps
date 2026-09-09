import {
    METRONOME_DEFAULTS,
    METRONOME_LIMITS,
    clampInteger,
    defaultAccentsForMeter,
    loadMetronomeSettings,
    saveMetronomeSettings
} from './metronome-store.js?v=0.24.0';
import {
    METRONOME_PRESET_LIMITS,
    createMetronomePreset,
    deleteMetronomePreset,
    loadMetronomePresets,
    settingsFromMetronomePreset
} from './metronome-presets-store.js?v=0.24.0';
import {
    beatsForMeter,
    compatibleRhythm,
    createScheduleCursor,
    isCompoundMeter,
    isRhythmSupported,
    meterLabel,
    scheduleEventsUntil,
    secondsPerBeat
} from './metronome-timing.js?v=0.24.0';

export const METRONOME_SCHEDULER_INTERVAL_MS = 25;
export const METRONOME_SCHEDULE_AHEAD_SEC = 0.1;
export const METRONOME_START_LEAD_SEC = 0.055;
export const METRONOME_PREVIOUS_MAX_GAIN = 1.15;
export const METRONOME_MAX_GAIN = 2.1;

export function volumeLevel(volume) {
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

    function getNoiseBuffer() {
        if (noiseBuffer) return noiseBuffer;
        const length = Math.ceil(context.sampleRate * 0.1);
        noiseBuffer = context.createBuffer(1, length, context.sampleRate);
        const samples = noiseBuffer.getChannelData(0);
        for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
        return noiseBuffer;
    }

    function scheduleNoise(when, { frequency, q, peak, attack, release }) {
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        source.buffer = getNoiseBuffer();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(frequency, when);
        filter.Q.value = q;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), when + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + release);
        source.connect(filter).connect(gain).connect(masterGain);
        trackSource(source, () => {
            try { source.disconnect(); } catch (_) { /* Already disconnected. */ }
            try { filter.disconnect(); } catch (_) { /* Already disconnected. */ }
            try { gain.disconnect(); } catch (_) { /* Already disconnected. */ }
        }, when);
        source.start(when);
        source.stop(when + release + 0.012);
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

    function scheduleAnalog(when, voice) {
        const voices = {
            accent: { frequency: 1050, peak: 0.76, body: 0.16, release: 0.085 },
            main: { frequency: 780, peak: 0.63, body: 0.13, release: 0.072 },
            subdivision: { frequency: 620, peak: 0.34, body: 0.07, release: 0.04 }
        };
        const selected = voices[voice];
        scheduleOscillator(when, {
            type: 'triangle',
            frequency: selected.frequency,
            endFrequency: selected.frequency * 0.82,
            peak: selected.peak,
            attack: 0.002,
            release: selected.release
        });
        scheduleOscillator(when, {
            type: 'sine',
            frequency: selected.frequency * 0.5,
            peak: selected.body,
            attack: 0.002,
            release: selected.release * 0.9
        });
    }

    function scheduleHardClick(when, voice) {
        const voices = {
            accent: { frequency: 2500, peak: 0.76, body: 0.18, release: 0.032 },
            main: { frequency: 2100, peak: 0.64, body: 0.15, release: 0.027 },
            subdivision: { frequency: 1700, peak: 0.35, body: 0.08, release: 0.018 }
        };
        const selected = voices[voice];
        scheduleOscillator(when, {
            type: 'square',
            frequency: selected.frequency,
            peak: selected.peak,
            attack: 0.001,
            release: selected.release
        });
        scheduleOscillator(when, {
            type: 'triangle',
            frequency: selected.frequency * 0.5,
            peak: selected.body,
            attack: 0.001,
            release: selected.release * 1.1
        });
    }

    function scheduleRim(when, voice) {
        const voices = {
            accent: { frequency: 1480, noiseFrequency: 3500, body: 0.58, core: 0.16, noise: 0.28, release: 0.043 },
            main: { frequency: 1240, noiseFrequency: 3050, body: 0.46, core: 0.13, noise: 0.23, release: 0.036 },
            subdivision: { frequency: 1020, noiseFrequency: 2700, body: 0.25, core: 0.07, noise: 0.13, release: 0.024 }
        };
        const selected = voices[voice];
        scheduleOscillator(when, {
            type: 'triangle',
            frequency: selected.frequency,
            endFrequency: selected.frequency * 0.88,
            peak: selected.body,
            attack: 0.0008,
            release: selected.release
        });
        scheduleOscillator(when, {
            type: 'sine',
            frequency: selected.frequency * 0.52,
            peak: selected.core,
            attack: 0.0009,
            release: selected.release * 0.86
        });
        scheduleNoise(when, {
            frequency: selected.noiseFrequency,
            q: 1.7,
            peak: selected.noise,
            attack: 0.0007,
            release: selected.release * 0.62
        });
    }

    function scheduleSound(when, sound, voice) {
        if (sound === 'analog') scheduleAnalog(when, voice);
        else if (sound === 'click') scheduleHardClick(when, voice);
        else if (sound === 'rim') scheduleRim(when, voice);
        else scheduleElectronic(when, voice);
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
        rhythm: root.querySelector('#metronome-rhythm'),
        rhythmHint: root.querySelector('#metronome-rhythm-hint'),
        sound: root.querySelector('#metronome-sound'),
        details: root.querySelector('#metronome-details'),
        detailsSummary: root.querySelector('#metronome-details-summary'),
        visualBeats: root.querySelector('#metronome-visual-beats'),
        visualSubdivisions: root.querySelector('#metronome-visual-subdivisions'),
        volume: root.querySelector('#metronome-volume'),
        volumeValue: root.querySelector('#metronome-volume-value'),
        beats: root.querySelector('#metronome-beats'),
        toggle: root.querySelector('#metronome-toggle'),
        status: root.querySelector('#metronome-status'),
        storageError: root.querySelector('#metronome-storage-error'),
        presetSelect: root.querySelector('#metronome-preset-select'),
        presetSaveOpen: root.querySelector('#metronome-preset-save-open'),
        presetDelete: root.querySelector('#metronome-preset-delete'),
        presetStatus: root.querySelector('#metronome-preset-status'),
        presetError: root.querySelector('#metronome-preset-error'),
        presetDialog: root.querySelector('#metronome-preset-dialog'),
        presetName: root.querySelector('#metronome-preset-name'),
        presetDialogError: root.querySelector('#metronome-preset-dialog-error'),
        presetSave: root.querySelector('#metronome-preset-save'),
        presetCancel: root.querySelector('#metronome-preset-cancel'),
        stepButtons: [...root.querySelectorAll('[data-bpm-delta]')],
        rhythmButtons: [...root.querySelectorAll('[data-metronome-rhythm]')],
        soundButtons: [...root.querySelectorAll('[data-metronome-sound]')]
    };

    const loadResult = loadMetronomeSettings();
    const presetLoadResult = loadMetronomePresets();
    const state = {
        settings: loadResult.settings,
        presets: presetLoadResult.presets,
        presetStorageWritable: presetLoadResult.ok,
        selectedPresetId: '',
        currentBeat: -1,
        currentSubdivision: -1
    };
    let viewActive = false;
    let presetDialogReturnFocus = null;

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

    function showPresetError(message = '') {
        elements.presetError.textContent = message;
        elements.presetError.hidden = !message;
    }

    function showPresetDialogError(message = '') {
        elements.presetDialogError.textContent = message;
        elements.presetDialogError.hidden = !message;
    }

    function showPresetStatus(message = '') {
        elements.presetStatus.textContent = message;
    }

    function renderPresetOptions() {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = state.presets.length ? 'プリセットを選択' : '保存済みプリセットなし';
        elements.presetSelect.replaceChildren(placeholder);
        state.presets.forEach((preset) => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = preset.name;
            elements.presetSelect.append(option);
        });
        if (!state.presets.some((preset) => preset.id === state.selectedPresetId)) state.selectedPresetId = '';
        elements.presetSelect.value = state.selectedPresetId;
        elements.presetDelete.hidden = !state.selectedPresetId;
        elements.presetDelete.disabled = !state.presetStorageWritable;
        elements.presetSaveOpen.disabled = !state.presetStorageWritable
            || state.presets.length >= METRONOME_PRESET_LIMITS.items;
    }

    function markPresetDirty() {
        if (!state.selectedPresetId) return;
        state.selectedPresetId = '';
        elements.presetSelect.value = '';
        elements.presetDelete.hidden = true;
        showPresetStatus('設定を変更しました。保存済みプリセットは変更されていません。');
    }

    function openPresetDialog() {
        if (!state.presetStorageWritable) {
            showPresetError('保存済みプリセットを安全に読み込めないため、新しい保存は行いません。現在のメトロノームはそのまま利用できます。');
            return;
        }
        if (state.presets.length >= METRONOME_PRESET_LIMITS.items) {
            showPresetError(`プリセットは${METRONOME_PRESET_LIMITS.items}件まで保存できます。`);
            return;
        }
        presetDialogReturnFocus = document.activeElement;
        elements.presetName.value = '';
        showPresetDialogError();
        elements.presetDialog.hidden = false;
        document.body.classList.add('metronome-preset-open');
        requestAnimationFrame(() => elements.presetName.focus({ preventScroll: true }));
    }

    function closePresetDialog({ restoreFocus = true } = {}) {
        if (elements.presetDialog.hidden) return;
        elements.presetDialog.hidden = true;
        document.body.classList.remove('metronome-preset-open');
        showPresetDialogError();
        if (restoreFocus && viewActive && presetDialogReturnFocus?.isConnected) {
            presetDialogReturnFocus.focus({ preventScroll: true });
        }
        presetDialogReturnFocus = null;
    }

    function markPresetStorageUnavailable() {
        state.presetStorageWritable = false;
        renderPresetOptions();
        showPresetError('プリセットを保存できませんでした。保存済みデータは変更していません。Safariの保存設定や空き容量を確認してください。');
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

    function renderVisualState() {
        [...elements.visualBeats.querySelectorAll('[data-visual-beat]')].forEach((indicator, index) => {
            indicator.classList.toggle('is-accented', state.settings.accents[index] === true);
            indicator.classList.toggle('is-current', index === state.currentBeat);
        });
        [...elements.visualSubdivisions.children].forEach((indicator, index) => {
            indicator.classList.toggle('is-current', state.currentBeat >= 0 && index === state.currentSubdivision);
        });
        elements.visualBeats.setAttribute(
            'aria-label',
            state.currentBeat < 0
                ? `${meterLabel(state.settings.meter)}、停止中`
                : `${meterLabel(state.settings.meter)}、現在${state.currentBeat + 1}拍目`
        );
    }

    function rebuildVisualRhythm() {
        elements.visualBeats.replaceChildren();
        for (let index = 0; index < beatsForMeter(state.settings.meter); index += 1) {
            const indicator = document.createElement('span');
            indicator.className = 'visual-beat-dot';
            indicator.dataset.visualBeat = String(index);
            indicator.setAttribute('aria-hidden', 'true');
            elements.visualBeats.append(indicator);
        }
        const subdivisionCount = scheduleEventsUntil(
            createScheduleCursor(0),
            { ...state.settings, bpm: 60 },
            0.999
        ).events.length;
        elements.visualSubdivisions.replaceChildren();
        for (let index = 0; index < subdivisionCount; index += 1) {
            const indicator = document.createElement('span');
            indicator.setAttribute('aria-hidden', 'true');
            elements.visualSubdivisions.append(indicator);
        }
        elements.visualSubdivisions.hidden = subdivisionCount <= 1;
        renderVisualState();
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

    function renderSoundControls() {
        elements.soundButtons.forEach((button) => {
            const selected = state.settings.sound === button.dataset.metronomeSound;
            button.setAttribute('aria-checked', String(selected));
            button.classList.toggle('is-selected', selected);
        });
    }

    function renderControls({ rebuildBeats = true } = {}) {
        elements.bpm.value = String(state.settings.bpm);
        elements.bpmSlider.value = String(state.settings.bpm);
        elements.bpmSlider.setAttribute('aria-valuetext', `${state.settings.bpm} BPM`);
        elements.meter.value = state.settings.meter;
        elements.volume.value = String(state.settings.volume);
        elements.volumeValue.value = String(state.settings.volume);
        renderRhythmControls();
        renderSoundControls();
        if (rebuildBeats) rebuildBeatDisplay();
        else renderBeatState();
        rebuildVisualRhythm();
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
        renderVisualState();
    }

    const engine = createMetronomeAudioEngine(setVisualEvent);

    function rescheduleIfPlaying(options) {
        if (engine.isPlaying()) engine.reschedule(getSettings, options);
    }

    function applyPreset(presetId) {
        const preset = state.presets.find((candidate) => candidate.id === presetId);
        const settings = settingsFromMetronomePreset(preset);
        if (!preset || !settings) {
            state.selectedPresetId = '';
            renderPresetOptions();
            showPresetError('このプリセットを読み込めませんでした。現在の設定は変更していません。');
            return false;
        }
        state.settings = settings;
        state.selectedPresetId = preset.id;
        state.currentBeat = -1;
        state.currentSubdivision = -1;
        engine.setVolume(settings.volume);
        renderControls();
        renderPresetOptions();
        saveSettings();
        showPresetError();
        showPresetStatus(`「${preset.name}」を呼び出しました。`);
        if (engine.isPlaying()) engine.reschedule(getSettings, { resetBeat: true });
        return true;
    }

    function saveCurrentAsPreset() {
        const result = createMetronomePreset({
            presets: state.presets,
            name: elements.presetName.value,
            settings: getSettings()
        });
        if (!result.ok) {
            if (result.reason === 'name-required') showPresetDialogError('プリセット名を入力してください。');
            else if (result.reason === 'name-too-long') showPresetDialogError(`プリセット名は${METRONOME_PRESET_LIMITS.name}文字以内で入力してください。`);
            else if (result.reason === 'duplicate-name') showPresetDialogError('同じ名前のプリセットがあります。別の名前を入力してください。');
            else if (result.reason === 'limit-reached') showPresetDialogError(`プリセットは${METRONOME_PRESET_LIMITS.items}件まで保存できます。`);
            else {
                closePresetDialog({ restoreFocus: false });
                markPresetStorageUnavailable();
            }
            return false;
        }
        state.presets = result.presets;
        state.selectedPresetId = result.preset.id;
        renderPresetOptions();
        showPresetError();
        showPresetStatus(`「${result.preset.name}」を保存しました。`);
        closePresetDialog();
        return true;
    }

    function deleteSelectedPreset() {
        const preset = state.presets.find((candidate) => candidate.id === state.selectedPresetId);
        if (!preset) return;
        if (!state.presetStorageWritable) {
            showPresetError('保存済みプリセットを安全に読み込めないため、削除は行いません。');
            return;
        }
        if (!window.confirm(`プリセット「${preset.name}」を削除しますか？\n現在のメトロノーム設定はそのまま残ります。`)) return;
        const result = deleteMetronomePreset({ presets: state.presets, id: preset.id });
        if (!result.ok) {
            markPresetStorageUnavailable();
            return;
        }
        state.presets = result.presets;
        state.selectedPresetId = '';
        renderPresetOptions();
        showPresetError();
        showPresetStatus(`「${preset.name}」を削除しました。現在の設定は変更していません。`);
    }

    function setBpm(value, { persist = true } = {}) {
        const bpm = clampInteger(value, METRONOME_LIMITS.bpmMin, METRONOME_LIMITS.bpmMax, state.settings.bpm);
        state.settings = { ...state.settings, bpm };
        markPresetDirty();
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

    elements.presetSelect.addEventListener('change', () => {
        if (!elements.presetSelect.value) {
            state.selectedPresetId = '';
            elements.presetDelete.hidden = true;
            showPresetStatus();
            return;
        }
        applyPreset(elements.presetSelect.value);
    });
    elements.presetSaveOpen.addEventListener('click', openPresetDialog);
    elements.presetSave.addEventListener('click', saveCurrentAsPreset);
    elements.presetCancel.addEventListener('click', () => closePresetDialog());
    elements.presetDelete.addEventListener('click', deleteSelectedPreset);
    elements.presetName.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            saveCurrentAsPreset();
        }
    });
    elements.presetDialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closePresetDialog();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [elements.presetName, elements.presetSave, elements.presetCancel]
            .filter((element) => !element.disabled && !element.hidden);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    elements.details.addEventListener('toggle', () => {
        elements.detailsSummary.setAttribute('aria-expanded', String(elements.details.open));
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
        markPresetDirty();
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
        markPresetDirty();
        renderRhythmControls();
        rebuildVisualRhythm();
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
        markPresetDirty();
        renderBeatState();
        renderVisualState();
        saveSettings();
        rescheduleIfPlaying();
    });

    elements.sound.addEventListener('click', (event) => {
        const button = event.target.closest('[data-metronome-sound]');
        if (!button) return;
        state.settings = { ...state.settings, sound: button.dataset.metronomeSound };
        markPresetDirty();
        renderSoundControls();
        saveSettings();
        rescheduleIfPlaying();
    });

    elements.volume.addEventListener('input', () => {
        const volume = clampInteger(elements.volume.value, METRONOME_LIMITS.volumeMin, METRONOME_LIMITS.volumeMax, state.settings.volume);
        state.settings = { ...state.settings, volume };
        markPresetDirty();
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
            renderVisualState();
            renderPlaying();
            return;
        }
        elements.toggle.disabled = true;
        try {
            const started = await engine.start(getSettings, () => viewActive && !document.hidden);
            renderPlaying();
            if (!started && viewActive) elements.status.textContent = '音声を開始できませんでした。もう一度お試しください。';
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
    if (!presetLoadResult.ok) {
        showPresetError(presetLoadResult.reason === 'partial-invalid'
            ? `保存済みプリセットのうち${presetLoadResult.ignored}件を安全のため読み込みませんでした。プリセットの保存・削除は停止しています。`
            : '保存済みプリセットを読み込めません。保存内容は変更せず、プリセット機能だけ停止しています。');
    }
    renderControls();
    renderPresetOptions();
    renderPlaying();

    return {
        setActive(active) {
            viewActive = active;
            if (!active) {
                engine.stop();
                closePresetDialog({ restoreFocus: false });
                elements.details.open = false;
                elements.detailsSummary.setAttribute('aria-expanded', 'false');
                state.currentBeat = -1;
                state.currentSubdivision = -1;
                renderBeatState();
                renderVisualState();
                renderPlaying();
            }
            if (active) elements.title.focus({ preventScroll: true });
        },
        stopForPageHidden() {
            closePresetDialog({ restoreFocus: false });
            engine.suspend();
            state.currentBeat = -1;
            state.currentSubdivision = -1;
            renderBeatState();
            renderVisualState();
            renderPlaying();
        }
    };
}
