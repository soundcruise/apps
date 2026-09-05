import { createTunerAudioController } from './tuner-audio.js';
import { frequencyToNoteInfo } from './tuner-engine.js';

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

export function initTuner(root, {
    audioControllerFactory = createTunerAudioController,
    now = () => globalThis.performance?.now?.() ?? Date.now()
} = {}) {
    const elements = {
        title: root.querySelector('#tuner-title'),
        note: root.querySelector('#tuner-note'),
        frequency: root.querySelector('#tuner-frequency'),
        cents: root.querySelector('#tuner-cents'),
        direction: root.querySelector('#tuner-direction'),
        guide: root.querySelector('#tuner-guide'),
        meter: root.querySelector('#tuner-meter'),
        toggle: root.querySelector('#tuner-toggle'),
        error: root.querySelector('#tuner-error'),
        status: root.querySelector('#tuner-status'),
        strings: [...root.querySelectorAll('[data-tuner-string]')]
    };
    const smoother = createTunerSmoother();
    let viewActive = false;
    let audioStatus = 'idle';

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

    function renderNeutral() {
        smoother.reset();
        elements.note.textContent = '—';
        elements.frequency.textContent = '— Hz';
        elements.cents.textContent = '—';
        elements.direction.textContent = '入力待ち';
        elements.direction.dataset.state = 'neutral';
        elements.guide.textContent = '1本ずつ弦を鳴らしてください';
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
            low: '低い',
            high: '高い',
            'in-tune': '合っています',
            checking: '安定を確認しています'
        };
        elements.note.textContent = noteLabel;
        elements.frequency.textContent = `${reading.frequency.toFixed(2)} Hz`;
        elements.cents.textContent = formatCents(reading.cents);
        elements.direction.textContent = reading.stale ? '音を確認しています' : directionLabels[reading.direction];
        elements.direction.dataset.state = reading.stale ? 'stale' : reading.direction;
        elements.guide.textContent = reading.stale ? 'もう一度、弦を鳴らしてください' : '1本ずつ弦を鳴らしてください';
        elements.meter.classList.remove('is-neutral');
        elements.meter.style.setProperty(
            '--tuner-position',
            `${Math.max(0, Math.min(100, reading.cents + 50))}%`
        );
        elements.meter.setAttribute('aria-valuenow', String(Math.max(-50, Math.min(50, roundedCents))));
        elements.meter.setAttribute('aria-valuetext', `${formatCents(reading.cents)}、${directionLabels[reading.direction]}`);
        elements.meter.setAttribute('aria-label', `${noteLabel}、${formatCents(reading.cents)}、${directionLabels[reading.direction]}`);

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
            elements.toggle.disabled = true;
            elements.toggle.textContent = 'マイクの使用を確認中…';
            elements.status.textContent = 'マイクの使用を確認しています…';
            return;
        }
        if (state.status === 'running') {
            elements.toggle.disabled = false;
            elements.toggle.textContent = '■ マイク停止';
            elements.status.textContent = 'マイク入力中';
            elements.guide.textContent = '1本ずつ弦を鳴らしてください';
            return;
        }

        renderNeutral();
        elements.toggle.disabled = false;
        elements.toggle.textContent = 'マイクを開始';
        elements.status.textContent = state.status === 'error' ? 'マイクを開始できませんでした' : 'マイクは停止中です';
    }

    const audioController = audioControllerFactory({
        onResult(result) {
            if (!viewActive || audioStatus !== 'running') return;
            renderReading(smoother.push(result, now()));
        },
        onStateChange(state) {
            renderAudioState(state);
        },
        onError(error) {
            if (!viewActive) return;
            showError(errorMessage(error));
        }
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
    elements.status.textContent = 'マイクは停止中です';

    return {
        setActive(active) {
            viewActive = active;
            if (!active) {
                void audioController.stop();
                audioStatus = 'idle';
                showError();
                renderNeutral();
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
