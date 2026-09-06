import { createTunerAudioController } from './tuner-audio.js?v=1.1.4';
import { frequencyToNoteInfo } from './tuner-engine.js?v=1.1.4';
import {
    TUNER_DEFAULT_THRESHOLD_DB,
    TUNER_SCHEMA_VERSION,
    TUNER_THRESHOLD_DB_MAX,
    TUNER_THRESHOLD_DB_MIN,
    loadTunerSettings,
    saveTunerSettings,
    thresholdDbToRms
} from './tuner-store.js?v=1.1.4';

const EMA_TIME_CONSTANT_MS = 80;
const NULL_GRACE_MS = 150;
const LARGE_SHIFT_CENTS = 70;
const SHIFT_MATCH_CENTS = 45;
const SHIFT_CONFIRM_FRAMES = 2;
const MIN_CONFIDENCE = 0.75;
const SHIFT_CONFIDENCE = 0.82;
const NOTE_HYSTERESIS_CENTS = 8;
const IN_TUNE_ENTER_CENTS = 3;
const IN_TUNE_EXIT_CENTS = 5;
const IN_TUNE_HOLD_MS = 100;
const DIAGNOSTIC_WINDOW_MS = 5000;
const DIAGNOSTIC_MAX_FRAMES = 120;
const DIAGNOSTIC_RENDER_INTERVAL_MS = 100;
const DIAGNOSTIC_MIN_DBFS = -100;
const DIAGNOSTIC_MAX_DBFS = -18;
const INPUT_LEVEL_ATTACK_MS = 70;
const INPUT_LEVEL_RELEASE_MS = 400;

export const STANDARD_TUNING = Object.freeze([
    Object.freeze({ string: 6, note: 'E2' }),
    Object.freeze({ string: 5, note: 'A2' }),
    Object.freeze({ string: 4, note: 'D3' }),
    Object.freeze({ string: 3, note: 'G3' }),
    Object.freeze({ string: 2, note: 'B3' }),
    Object.freeze({ string: 1, note: 'E4' })
]);

const ERROR_MESSAGES = Object.freeze({
    'permission-denied': 'マイクを利用できません。サイトと端末のマイク許可を確認してください。',
    'no-device': '使用できるマイクが見つかりません。',
    'device-busy': 'マイクを開始できません。他のアプリの使用状況や接続を確認してください。',
    'insecure-context': 'この環境ではマイクを利用できません。HTTPSのページで開いてください。',
    constraints: 'このマイクでは必要な入力設定を利用できません。',
    aborted: 'マイクの開始が中断されました。もう一度お試しください。',
    'audio-resume-failed': '音声入力を開始できません。もう一度お試しください。',
    'track-ended': 'マイク入力が中断されました。もう一度開始してください。',
    unsupported: 'このブラウザではマイク入力を利用できません。',
    'analysis-failed': '音程を解析できませんでした。もう一度開始してください。',
    unknown: 'マイクを開始できませんでした。もう一度お試しください。'
});

function median(values) {
    const sorted = [...values].sort((first, second) => first - second);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

function centsBetween(firstLogFrequency, secondLogFrequency) {
    return Math.abs(firstLogFrequency - secondLogFrequency) * 1200;
}

function isValidResult(result) {
    return Boolean(
        result
        && Number.isFinite(result.frequency)
        && result.frequency > 0
        && Number.isFinite(result.confidence)
        && result.confidence >= MIN_CONFIDENCE
    );
}

export function standardStringForNote(noteName, octave) {
    const note = `${noteName}${octave}`;
    return STANDARD_TUNING.find((entry) => entry.note === note) || null;
}

export function createTunerSmoother() {
    let history = [];
    let emaLogFrequency = null;
    let lastFilterTime = null;
    let lastValidTime = null;
    let heldNote = null;
    let shiftCandidate = [];
    let inTune = false;
    let inTuneCandidateSince = null;
    let lastReading = null;

    function reset() {
        history = [];
        emaLogFrequency = null;
        lastFilterTime = null;
        lastValidTime = null;
        heldNote = null;
        shiftCandidate = [];
        inTune = false;
        inTuneCandidateSince = null;
        lastReading = null;
    }

    function updateNote(frequency, forceChange, timestamp) {
        const nearestNote = frequencyToNoteInfo(frequency);
        if (!nearestNote) return null;

        const previousMidi = heldNote?.midi ?? null;
        if (!heldNote || forceChange) {
            heldNote = nearestNote;
        } else if (nearestNote.midi !== heldNote.midi) {
            const centsFromHeldNote = 1200 * Math.log2(frequency / heldNote.targetFrequency);
            if (Math.abs(centsFromHeldNote) >= 50 + NOTE_HYSTERESIS_CENTS) heldNote = nearestNote;
        }

        if (heldNote.midi !== previousMidi) {
            inTune = false;
            inTuneCandidateSince = null;
        }

        const cents = 1200 * Math.log2(frequency / heldNote.targetFrequency);
        const absoluteCents = Math.abs(cents);
        if (inTune) {
            if (absoluteCents > IN_TUNE_EXIT_CENTS) {
                inTune = false;
                inTuneCandidateSince = null;
            }
        } else if (absoluteCents <= IN_TUNE_ENTER_CENTS) {
            if (inTuneCandidateSince === null) inTuneCandidateSince = timestamp;
            if (timestamp - inTuneCandidateSince >= IN_TUNE_HOLD_MS) inTune = true;
        } else {
            inTuneCandidateSince = null;
        }

        let direction = 'checking';
        if (inTune) direction = 'in-tune';
        else if (cents < -IN_TUNE_ENTER_CENTS) direction = 'low';
        else if (cents > IN_TUNE_ENTER_CENTS) direction = 'high';

        return {
            frequency,
            midi: heldNote.midi,
            noteName: heldNote.noteName,
            octave: heldNote.octave,
            targetFrequency: heldNote.targetFrequency,
            cents,
            direction,
            inTune,
            stale: false
        };
    }

    function push(rawResult, timestamp) {
        const now = Number.isFinite(timestamp) ? timestamp : 0;
        if (!isValidResult(rawResult)) {
            shiftCandidate = [];
            if (lastReading && lastValidTime !== null && now - lastValidTime <= NULL_GRACE_MS) {
                return { ...lastReading, stale: true };
            }
            reset();
            return null;
        }

        const rawLogFrequency = Math.log2(rawResult.frequency);
        let forceNoteChange = false;
        if (emaLogFrequency !== null
            && centsBetween(rawLogFrequency, emaLogFrequency) > LARGE_SHIFT_CENTS) {
            if (rawResult.confidence < SHIFT_CONFIDENCE) {
                return push(null, now);
            }

            const previousCandidate = shiftCandidate.at(-1);
            if (previousCandidate === undefined
                || centsBetween(rawLogFrequency, previousCandidate) > SHIFT_MATCH_CENTS) {
                shiftCandidate = [rawLogFrequency];
            } else {
                shiftCandidate.push(rawLogFrequency);
            }

            if (shiftCandidate.length < SHIFT_CONFIRM_FRAMES) {
                if (lastReading && lastValidTime !== null && now - lastValidTime <= NULL_GRACE_MS) {
                    return { ...lastReading, stale: true };
                }
                return null;
            }

            history = shiftCandidate.slice(-SHIFT_CONFIRM_FRAMES);
            emaLogFrequency = median(history);
            lastFilterTime = now;
            shiftCandidate = [];
            forceNoteChange = true;
        } else {
            shiftCandidate = [];
            history.push(rawLogFrequency);
            history = history.slice(-3);
            const medianLogFrequency = median(history);
            if (emaLogFrequency === null) {
                emaLogFrequency = medianLogFrequency;
            } else {
                const elapsed = Math.max(0, now - (lastFilterTime ?? now));
                const alpha = 1 - Math.exp(-elapsed / EMA_TIME_CONSTANT_MS);
                emaLogFrequency += alpha * (medianLogFrequency - emaLogFrequency);
            }
            lastFilterTime = now;
        }

        const frequency = 2 ** emaLogFrequency;
        const reading = updateNote(frequency, forceNoteChange, now);
        if (!reading) {
            reset();
            return null;
        }
        lastValidTime = now;
        lastReading = reading;
        return reading;
    }

    return { push, reset };
}

function errorMessage(error) {
    return ERROR_MESSAGES[error?.code] || ERROR_MESSAGES.unknown;
}

function formatCents(cents) {
    const rounded = Math.round(cents);
    if (rounded > 0) return `+${rounded} cent`;
    return `${rounded} cent`;
}

export function inputLevelPercentage(dbfs) {
    const level = Number.isFinite(dbfs) ? dbfs : DIAGNOSTIC_MIN_DBFS;
    const clamped = Math.max(DIAGNOSTIC_MIN_DBFS, Math.min(DIAGNOSTIC_MAX_DBFS, level));
    return ((clamped - DIAGNOSTIC_MIN_DBFS) / (DIAGNOSTIC_MAX_DBFS - DIAGNOSTIC_MIN_DBFS)) * 100;
}

export function createInputLevelSmoother({
    attackMs = INPUT_LEVEL_ATTACK_MS,
    releaseMs = INPUT_LEVEL_RELEASE_MS
} = {}) {
    let level = DIAGNOSTIC_MIN_DBFS;
    let lastTime = null;

    return {
        push(dbfs, timestamp) {
            const now = Number.isFinite(timestamp) ? timestamp : 0;
            const target = Math.max(
                DIAGNOSTIC_MIN_DBFS,
                Math.min(DIAGNOSTIC_MAX_DBFS, Number.isFinite(dbfs) ? dbfs : DIAGNOSTIC_MIN_DBFS)
            );
            if (lastTime === null) {
                level = target;
            } else {
                const elapsed = Math.max(0, now - lastTime);
                const timeConstant = target > level ? attackMs : releaseMs;
                const alpha = timeConstant > 0 ? 1 - Math.exp(-elapsed / timeConstant) : 1;
                level += alpha * (target - level);
            }
            lastTime = now;
            return level;
        },
        reset() {
            level = DIAGNOSTIC_MIN_DBFS;
            lastTime = null;
        }
    };
}

export function isTunerDebugEnabled(search = globalThis.location?.search || '') {
    try { return new URLSearchParams(search).get('tunerDebug') === '1'; } catch (_) { return false; }
}

function diagnosticCategory(reason) {
    if (reason === 'valid' || reason === 'low-rms' || reason === 'low-confidence') return reason;
    return 'other';
}

export function createTunerDiagnosticHistory({
    windowMs = DIAGNOSTIC_WINDOW_MS,
    maxFrames = DIAGNOSTIC_MAX_FRAMES
} = {}) {
    let frames = [];

    function prune(now) {
        const cutoff = now - windowMs;
        while (frames.length && frames[0].timestamp < cutoff) frames.shift();
        if (frames.length > maxFrames) frames = frames.slice(-maxFrames);
    }

    function summary(now) {
        prune(now);
        const counts = { valid: 0, 'low-rms': 0, 'low-confidence': 0, other: 0 };
        for (const frame of frames) counts[frame.category] += 1;
        const percentage = (count) => (frames.length ? Math.round((count / frames.length) * 100) : 0);
        return {
            frames: frames.length,
            valid: percentage(counts.valid),
            lowRms: percentage(counts['low-rms']),
            lowConfidence: percentage(counts['low-confidence']),
            other: percentage(counts.other)
        };
    }

    return {
        add(reason, timestamp) {
            const now = Number.isFinite(timestamp) ? timestamp : 0;
            frames.push({ timestamp: now, category: diagnosticCategory(reason) });
            prune(now);
            return summary(now);
        },
        summary,
        reset() { frames = []; }
    };
}

function formatValue(value) {
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    if (Number.isFinite(value)) return String(value);
    return '—';
}

function formatSettings(values = {}) {
    const labels = {
        sampleRate: 'SR',
        channelCount: 'ch',
        echoCancellation: 'EC',
        noiseSuppression: 'NS',
        autoGainControl: 'AGC'
    };
    const parts = Object.entries(labels)
        .filter(([key]) => Object.prototype.hasOwnProperty.call(values, key))
        .map(([key, label]) => `${label} ${formatValue(values[key])}`);
    return parts.join(' / ') || '—';
}

export function formatTunerDiagnosticCopy({
    device = 'Unknown browser',
    diagnostic = {},
    display = {},
    thresholdDb = TUNER_DEFAULT_THRESHOLD_DB,
    rmsThreshold = diagnostic.rmsThreshold ?? thresholdDbToRms(thresholdDb),
    summary = { frames: 0, valid: 0, lowRms: 0, lowConfidence: 0, other: 0 }
} = {}) {
    const number = (value, digits) => (Number.isFinite(value) ? value.toFixed(digits) : '—');
    const finalLabel = display.note && Number.isFinite(display.frequency)
        ? `${display.note} / ${display.frequency.toFixed(2)} Hz`
        : '—';
    return [
        'Cruise Port Tuner Diagnostic',
        '',
        `Device: ${device}`,
        `Sample Rate: ${formatValue(diagnostic.sampleRate)} Hz`,
        `FFT Size: ${formatValue(diagnostic.fftSize)}`,
        `Track Settings: ${formatSettings(diagnostic.trackSettings)}`,
        `Supported: ${formatSettings(diagnostic.supportedConstraints)}`,
        '',
        `Current RMS: ${number(diagnostic.rms, 6)}`,
        `Current dBFS: ${number(diagnostic.rmsDbfs, 1)}`,
        `Current Confidence: ${number(diagnostic.confidence, 3)}`,
        `Raw Frequency: ${number(diagnostic.rawFrequency, 2)} Hz`,
        `Current Reason: ${diagnostic.reason || '—'}`,
        `Threshold: ${number(thresholdDb, 0)} dBFS`,
        `RMS Threshold: ${number(rmsThreshold, 6)}`,
        `Display: ${display.state || 'neutral'}`,
        `Final: ${finalLabel}`,
        '',
        `Last 5 sec (${summary.frames} frames):`,
        `valid ${summary.valid}%`,
        `low-rms ${summary.lowRms}%`,
        `low-confidence ${summary.lowConfidence}%`,
        `other ${summary.other}%`
    ].join('\n');
}

function diagnosticDeviceLabel(navigatorObject) {
    const userAgent = navigatorObject?.userAgent || '';
    if (/iPhone/i.test(userAgent)) return 'iPhone / Safari';
    if (/iPad/i.test(userAgent)) return 'iPad / Safari';
    if (/Macintosh|Mac OS X/i.test(userAgent)) return 'Mac / Safari-compatible browser';
    return 'Browser';
}

export function initTuner(root, {
    audioControllerFactory = createTunerAudioController,
    now = () => globalThis.performance?.now?.() ?? Date.now(),
    debugEnabled = isTunerDebugEnabled(),
    navigatorObject = globalThis.navigator,
    storage
} = {}) {
    const elements = {
        title: root.querySelector('#tuner-title'),
        note: root.querySelector('#tuner-note'),
        frequency: root.querySelector('#tuner-frequency'),
        cents: root.querySelector('#tuner-cents'),
        direction: root.querySelector('#tuner-direction'),
        meter: root.querySelector('#tuner-meter'),
        toggle: root.querySelector('#tuner-toggle'),
        error: root.querySelector('#tuner-error'),
        status: root.querySelector('#tuner-status'),
        inputLevelWrap: root.querySelector('#tuner-input-level-wrap'),
        inputLevel: root.querySelector('#tuner-input-level'),
        inputSettingsToggle: root.querySelector('#tuner-input-settings-toggle'),
        inputSettingsPanel: root.querySelector('#tuner-input-settings-panel'),
        threshold: root.querySelector('#tuner-threshold'),
        thresholdValue: root.querySelector('#tuner-threshold-value'),
        thresholdError: root.querySelector('#tuner-threshold-error'),
        diagnostic: root.querySelector('#tuner-diagnostic'),
        strings: [...root.querySelectorAll('[data-tuner-string]')]
    };
    if (!debugEnabled) elements.diagnostic?.remove?.();
    const diagnosticElements = debugEnabled && elements.diagnostic ? {
        dbfs: root.querySelector('#tuner-diagnostic-dbfs'),
        level: root.querySelector('#tuner-diagnostic-level'),
        rms: root.querySelector('#tuner-diagnostic-rms'),
        confidence: root.querySelector('#tuner-diagnostic-confidence'),
        rawFrequency: root.querySelector('#tuner-diagnostic-raw-frequency'),
        final: root.querySelector('#tuner-diagnostic-final'),
        reason: root.querySelector('#tuner-diagnostic-reason'),
        display: root.querySelector('#tuner-diagnostic-display'),
        sampleRate: root.querySelector('#tuner-diagnostic-sample-rate'),
        fftSize: root.querySelector('#tuner-diagnostic-fft-size'),
        thresholdDb: root.querySelector('#tuner-diagnostic-threshold-db'),
        rmsThreshold: root.querySelector('#tuner-diagnostic-rms-threshold'),
        thresholdLabel: root.querySelector('#tuner-diagnostic-threshold-label'),
        track: root.querySelector('#tuner-diagnostic-track'),
        supported: root.querySelector('#tuner-diagnostic-supported'),
        frames: root.querySelector('#tuner-diagnostic-frames'),
        valid: root.querySelector('#tuner-diagnostic-valid'),
        lowRms: root.querySelector('#tuner-diagnostic-low-rms'),
        lowConfidence: root.querySelector('#tuner-diagnostic-low-confidence'),
        other: root.querySelector('#tuner-diagnostic-other'),
        copy: root.querySelector('#tuner-diagnostic-copy'),
        copyStatus: root.querySelector('#tuner-diagnostic-copy-status')
    } : null;
    const smoother = createTunerSmoother();
    const inputLevelSmoother = createInputLevelSmoother();
    const diagnosticHistory = debugEnabled ? createTunerDiagnosticHistory() : null;
    const loadResult = loadTunerSettings(storage);
    let currentThresholdDb = loadResult.settings.thresholdDb;
    let inputSettingsOpen = false;
    let viewActive = false;
    let audioStatus = 'idle';
    let latestDiagnostic = null;
    let latestDiagnosticSummary = diagnosticHistory?.summary(0) || null;
    let latestDiagnosticDisplay = { state: 'neutral', note: null, frequency: null };
    let lastDiagnosticRenderTime = Number.NEGATIVE_INFINITY;

    function clearStringHighlight() {
        elements.strings.forEach((element) => {
            element.classList.remove('is-active');
            element.removeAttribute('aria-current');
        });
    }

    function showError(message = '') {
        elements.error.textContent = message;
        elements.error.hidden = !message;
    }

    function renderInputSettings() {
        elements.inputSettingsToggle.setAttribute('aria-expanded', String(inputSettingsOpen));
        elements.inputSettingsPanel.hidden = !inputSettingsOpen;
    }

    function renderNeutral() {
        smoother.reset();
        elements.note.textContent = '—';
        elements.frequency.textContent = '— Hz';
        elements.cents.textContent = '—';
        elements.direction.textContent = '入力待ち';
        elements.direction.dataset.state = 'neutral';
        elements.meter.classList.add('is-neutral');
        elements.meter.style.setProperty('--tuner-position', '50%');
        elements.meter.setAttribute('aria-valuenow', '0');
        elements.meter.setAttribute('aria-valuetext', '入力待ち');
        elements.meter.setAttribute('aria-label', '音程メーター、入力待ち');
        clearStringHighlight();
    }

    function renderReading(reading) {
        if (!reading) {
            renderNeutral();
            return;
        }

        const roundedCents = Math.round(reading.cents);
        const noteLabel = `${reading.noteName}${reading.octave}`;
        const directionLabels = {
            low: '↓ 低い',
            high: '↑ 高い',
            'in-tune': '✓ 合っています',
            checking: '安定を確認しています'
        };
        elements.note.textContent = noteLabel;
        elements.frequency.textContent = `${reading.frequency.toFixed(2)} Hz`;
        elements.cents.textContent = formatCents(reading.cents);
        const directionText = reading.stale ? '音を確認しています' : directionLabels[reading.direction];
        elements.direction.textContent = directionText;
        elements.direction.dataset.state = reading.stale ? 'stale' : reading.direction;
        elements.meter.classList.remove('is-neutral');
        elements.meter.style.setProperty(
            '--tuner-position',
            `${Math.max(0, Math.min(100, reading.cents + 50))}%`
        );
        elements.meter.setAttribute('aria-valuenow', String(Math.max(-50, Math.min(50, roundedCents))));
        elements.meter.setAttribute('aria-valuetext', `${formatCents(reading.cents)}、${directionText}`);
        elements.meter.setAttribute('aria-label', `${noteLabel}、${formatCents(reading.cents)}、${directionText}`);

        clearStringHighlight();
        const standardString = standardStringForNote(reading.noteName, reading.octave);
        if (standardString) {
            const activeElement = elements.strings.find((element) => element.dataset.note === standardString.note);
            activeElement?.classList.add('is-active');
            activeElement?.setAttribute('aria-current', 'true');
        }
    }

    function renderAudioState(state) {
        audioStatus = state.status;
        if (!viewActive) return;

        if (state.status === 'starting') {
            renderNeutral();
            elements.inputLevelWrap.hidden = true;
            elements.toggle.disabled = true;
            elements.toggle.textContent = 'マイクの使用を確認中…';
            elements.status.textContent = 'マイクの使用を確認しています…';
            return;
        }
        if (state.status === 'running') {
            elements.inputLevelWrap.hidden = false;
            elements.toggle.disabled = false;
            elements.toggle.textContent = '■ マイク停止';
            elements.status.textContent = 'マイク入力中';
            return;
        }

        renderNeutral();
        inputLevelSmoother.reset();
        elements.inputLevelWrap.hidden = true;
        elements.inputLevel.style.setProperty('--tuner-input-level-position', '0%');
        elements.inputLevel.setAttribute('aria-valuenow', String(DIAGNOSTIC_MIN_DBFS));
        elements.toggle.disabled = false;
        elements.toggle.textContent = 'マイクを開始';
        elements.status.textContent = state.status === 'error' ? 'マイクを開始できませんでした' : 'マイクは停止中です';
    }

    function renderInputLevel(level) {
        if (!viewActive || audioStatus !== 'running') return;
        const smoothedDbfs = inputLevelSmoother.push(level.rmsDbfs, now());
        const percentage = inputLevelPercentage(smoothedDbfs);
        elements.inputLevel.style.setProperty('--tuner-input-level-position', `${percentage.toFixed(1)}%`);
        elements.inputLevel.setAttribute('aria-valuenow', smoothedDbfs.toFixed(1));
    }

    function renderThreshold() {
        const rmsThreshold = thresholdDbToRms(currentThresholdDb);
        elements.threshold.value = String(currentThresholdDb);
        elements.thresholdValue.textContent = `${currentThresholdDb} dB`;
        elements.threshold.setAttribute(
            'aria-valuetext',
            `${currentThresholdDb} dBFS。左ほど高感度、右ほど低感度`
        );
        elements.inputLevel.style.setProperty(
            '--tuner-threshold-position',
            `${inputLevelPercentage(currentThresholdDb).toFixed(1)}%`
        );
        if (latestDiagnostic) latestDiagnostic = { ...latestDiagnostic, rmsThreshold };
        if (!diagnosticElements) return;

        diagnosticElements.thresholdDb.textContent = `${currentThresholdDb} dBFS`;
        diagnosticElements.rmsThreshold.textContent = rmsThreshold.toFixed(6);
        diagnosticElements.thresholdLabel.textContent = `現在の検出しきい値 ${currentThresholdDb} dBFS`;
        elements.diagnostic.style.setProperty(
            '--diagnostic-threshold-position',
            `${inputLevelPercentage(currentThresholdDb).toFixed(1)}%`
        );
    }

    function resetDiagnostic() {
        if (!diagnosticElements) return;
        diagnosticHistory.reset();
        latestDiagnostic = null;
        latestDiagnosticSummary = diagnosticHistory.summary(0);
        latestDiagnosticDisplay = { state: 'neutral', note: null, frequency: null };
        lastDiagnosticRenderTime = Number.NEGATIVE_INFINITY;
        diagnosticElements.dbfs.textContent = '— dBFS';
        diagnosticElements.level.style.setProperty('--diagnostic-level-position', '0%');
        diagnosticElements.level.setAttribute('aria-valuenow', String(DIAGNOSTIC_MIN_DBFS));
        diagnosticElements.rms.textContent = '—';
        diagnosticElements.confidence.textContent = '—';
        diagnosticElements.rawFrequency.textContent = '—';
        diagnosticElements.final.textContent = '—';
        diagnosticElements.reason.textContent = '—';
        diagnosticElements.display.textContent = 'neutral';
        diagnosticElements.sampleRate.textContent = '—';
        diagnosticElements.fftSize.textContent = '—';
        diagnosticElements.track.textContent = '—';
        diagnosticElements.supported.textContent = '—';
        diagnosticElements.frames.textContent = '0';
        diagnosticElements.valid.textContent = '0%';
        diagnosticElements.lowRms.textContent = '0%';
        diagnosticElements.lowConfidence.textContent = '0%';
        diagnosticElements.other.textContent = '0%';
        diagnosticElements.copyStatus.textContent = '';
        renderThreshold();
    }

    function renderDiagnostic(diagnostic, timestamp) {
        if (!diagnosticElements) return;
        latestDiagnostic = diagnostic;
        latestDiagnosticSummary = diagnosticHistory.add(diagnostic.reason, timestamp);
        if (timestamp - lastDiagnosticRenderTime < DIAGNOSTIC_RENDER_INTERVAL_MS) return;
        lastDiagnosticRenderTime = timestamp;

        const dbfs = Number.isFinite(diagnostic.rmsDbfs) ? diagnostic.rmsDbfs : DIAGNOSTIC_MIN_DBFS;
        const clampedDbfs = Math.max(DIAGNOSTIC_MIN_DBFS, Math.min(DIAGNOSTIC_MAX_DBFS, dbfs));
        const levelPercent = inputLevelPercentage(dbfs);
        diagnosticElements.dbfs.textContent = Number.isFinite(diagnostic.rmsDbfs)
            ? `${diagnostic.rmsDbfs.toFixed(1)} dBFS`
            : '−∞ dBFS';
        diagnosticElements.level.style.setProperty('--diagnostic-level-position', `${levelPercent.toFixed(1)}%`);
        diagnosticElements.level.setAttribute('aria-valuenow', String(clampedDbfs));
        diagnosticElements.rms.textContent = Number.isFinite(diagnostic.rms) ? diagnostic.rms.toFixed(6) : '—';
        diagnosticElements.confidence.textContent = Number.isFinite(diagnostic.confidence)
            ? diagnostic.confidence.toFixed(3)
            : '—';
        diagnosticElements.rawFrequency.textContent = Number.isFinite(diagnostic.rawFrequency)
            ? `${diagnostic.rawFrequency.toFixed(2)} Hz`
            : '—';
        diagnosticElements.final.textContent = latestDiagnosticDisplay.note
            ? `${latestDiagnosticDisplay.note} / ${latestDiagnosticDisplay.frequency.toFixed(2)} Hz`
            : '—';
        diagnosticElements.reason.textContent = diagnostic.reason || '—';
        diagnosticElements.display.textContent = latestDiagnosticDisplay.state;
        diagnosticElements.sampleRate.textContent = Number.isFinite(diagnostic.sampleRate)
            ? `${diagnostic.sampleRate} Hz`
            : '—';
        diagnosticElements.fftSize.textContent = Number.isFinite(diagnostic.fftSize)
            ? String(diagnostic.fftSize)
            : '—';
        diagnosticElements.track.textContent = formatSettings(diagnostic.trackSettings);
        diagnosticElements.supported.textContent = formatSettings(diagnostic.supportedConstraints);
        diagnosticElements.frames.textContent = String(latestDiagnosticSummary.frames);
        diagnosticElements.valid.textContent = `${latestDiagnosticSummary.valid}%`;
        diagnosticElements.lowRms.textContent = `${latestDiagnosticSummary.lowRms}%`;
        diagnosticElements.lowConfidence.textContent = `${latestDiagnosticSummary.lowConfidence}%`;
        diagnosticElements.other.textContent = `${latestDiagnosticSummary.other}%`;
    }

    const audioController = audioControllerFactory({
        onResult(result) {
            if (!viewActive || audioStatus !== 'running') return;
            const reading = smoother.push(result, now());
            latestDiagnosticDisplay = reading
                ? {
                    state: reading.stale ? 'stale' : 'valid',
                    note: `${reading.noteName}${reading.octave}`,
                    frequency: reading.frequency
                }
                : { ...latestDiagnosticDisplay, state: 'neutral' };
            renderReading(reading);
        },
        onDiagnostic(diagnostic) {
            if (!viewActive || audioStatus !== 'running') return;
            renderDiagnostic(diagnostic, now());
        },
        onInputLevel(level) {
            renderInputLevel(level);
        },
        onStateChange(state) {
            renderAudioState(state);
        },
        onError(error) {
            if (!viewActive) return;
            showError(errorMessage(error));
        },
        diagnosticEnabled: debugEnabled,
        rmsThreshold: thresholdDbToRms(currentThresholdDb)
    });

    if (diagnosticElements) {
        elements.diagnostic.hidden = false;
        resetDiagnostic();
        diagnosticElements.copy.addEventListener('click', async () => {
            const copyText = formatTunerDiagnosticCopy({
                device: diagnosticDeviceLabel(navigatorObject),
                diagnostic: latestDiagnostic || {},
                display: latestDiagnosticDisplay,
                thresholdDb: currentThresholdDb,
                rmsThreshold: thresholdDbToRms(currentThresholdDb),
                summary: latestDiagnosticSummary
            });
            try {
                if (!navigatorObject?.clipboard?.writeText) throw new Error('Clipboard is unavailable');
                await navigatorObject.clipboard.writeText(copyText);
                diagnosticElements.copyStatus.textContent = '診断結果をコピーしました。';
            } catch (_) {
                diagnosticElements.copyStatus.textContent = 'コピーできませんでした。画面をスクリーンショットしてください。';
            }
        });
    }


    elements.threshold.addEventListener('input', () => {
        const nextThresholdDb = Number(elements.threshold.value);
        const nextRmsThreshold = thresholdDbToRms(nextThresholdDb);
        if (!Number.isInteger(nextThresholdDb)
            || nextThresholdDb < TUNER_THRESHOLD_DB_MIN
            || nextThresholdDb > TUNER_THRESHOLD_DB_MAX
            || !audioController.setRmsThreshold(nextRmsThreshold)) {
            elements.thresholdError.textContent = '検出閾値を変更できませんでした。';
            renderThreshold();
            return;
        }
        currentThresholdDb = nextThresholdDb;
        elements.thresholdError.textContent = '';
        renderThreshold();
    });

    elements.threshold.addEventListener('change', () => {
        const result = saveTunerSettings({
            version: TUNER_SCHEMA_VERSION,
            thresholdDb: currentThresholdDb
        }, storage);
        elements.thresholdError.textContent = result.ok ? '' : '検出閾値を保存できませんでした。';
    });

    elements.inputSettingsToggle.addEventListener('click', () => {
        inputSettingsOpen = !inputSettingsOpen;
        renderInputSettings();
    });

    elements.toggle.addEventListener('click', async () => {
        if (audioStatus === 'running') {
            await audioController.stop();
            return;
        }
        if (audioStatus === 'starting') return;
        showError();
        await audioController.start();
    });

    renderNeutral();
    renderThreshold();
    renderInputSettings();
    elements.inputLevelWrap.hidden = true;
    elements.status.textContent = 'マイクは停止中です';

    return {
        setActive(active) {
            viewActive = active;
            if (!active) {
                void audioController.stop();
                audioStatus = 'idle';
                resetDiagnostic();
                showError();
                renderNeutral();
                inputLevelSmoother.reset();
                elements.inputLevelWrap.hidden = true;
                inputSettingsOpen = false;
                renderInputSettings();
                elements.inputLevel.style.setProperty('--tuner-input-level-position', '0%');
                elements.toggle.disabled = false;
                elements.toggle.textContent = 'マイクを開始';
                elements.status.textContent = 'マイクは停止中です';
                return;
            }
            showError();
            renderAudioState({ status: audioController.getState().status });
            elements.title.focus({ preventScroll: true });
        }
    };
}
