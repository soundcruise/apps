const DEFAULT_OPTIONS = Object.freeze({
    minFrequency: 70,
    maxFrequency: 1400,
    yinThreshold: 0.12,
    minConfidence: 0.82,
    rmsThreshold: 0.003
});

const NOTE_NAMES = Object.freeze(['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']);
const REFERENCE_FREQUENCY = 440;
const MAX_ABSOLUTE_SAMPLE = 16;
const MIN_BUFFER_LENGTH = 64;
const OCTAVE_SCORE_RATIO = 0.75;
const OCTAVE_SCORE_IMPROVEMENT = 0.04;

function isFinitePositive(value) {
    return Number.isFinite(value) && value > 0;
}

function normalizeOptions(options = {}) {
    const normalized = { ...DEFAULT_OPTIONS, ...options };
    if (!isFinitePositive(normalized.minFrequency)
        || !isFinitePositive(normalized.maxFrequency)
        || normalized.minFrequency >= normalized.maxFrequency
        || !Number.isFinite(normalized.yinThreshold)
        || normalized.yinThreshold <= 0
        || normalized.yinThreshold >= 1
        || !Number.isFinite(normalized.minConfidence)
        || normalized.minConfidence < 0
        || normalized.minConfidence > 1
        || !Number.isFinite(normalized.rmsThreshold)
        || normalized.rmsThreshold < 0) {
        return null;
    }
    return normalized;
}

function modulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
}

export function frequencyToNoteInfo(frequency) {
    if (!isFinitePositive(frequency)) return null;

    const midiFloat = 69 + (12 * Math.log2(frequency / REFERENCE_FREQUENCY));
    if (!Number.isFinite(midiFloat)) return null;

    const midi = Math.round(midiFloat);
    const targetFrequency = REFERENCE_FREQUENCY * (2 ** ((midi - 69) / 12));
    const cents = 1200 * Math.log2(frequency / targetFrequency);
    if (!Number.isFinite(targetFrequency) || !Number.isFinite(cents)) return null;

    return {
        midi,
        noteName: NOTE_NAMES[modulo(midi, 12)],
        octave: Math.floor(midi / 12) - 1,
        cents,
        targetFrequency
    };
}

function calculateCenteredRms(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
        const sample = samples[i];
        if (!Number.isFinite(sample) || Math.abs(sample) > MAX_ABSOLUTE_SAMPLE) return null;
        sum += sample;
    }

    const mean = sum / samples.length;
    let squareSum = 0;
    for (let i = 0; i < samples.length; i += 1) {
        const centered = samples[i] - mean;
        squareSum += centered * centered;
    }

    const rms = Math.sqrt(squareSum / samples.length);
    return Number.isFinite(rms) ? rms : null;
}

function findLocalMinimum(values, start, end) {
    let lag = Math.max(start, 1);
    while (lag < end && values[lag + 1] < values[lag]) lag += 1;
    return lag;
}

function findThresholdCandidate(values, start, end, threshold) {
    for (let lag = start; lag <= end; lag += 1) {
        if (values[lag] < threshold) return findLocalMinimum(values, lag, end);
    }
    return -1;
}

function findBestCandidate(values, start, end) {
    let bestLag = -1;
    let bestValue = Number.POSITIVE_INFINITY;
    for (let lag = start; lag <= end; lag += 1) {
        if (values[lag] < bestValue) {
            bestValue = values[lag];
            bestLag = lag;
        }
    }
    return bestLag;
}

function findNearbyMinimum(values, center, end) {
    const start = Math.max(1, center - 2);
    const stop = Math.min(end, center + 2);
    return findBestCandidate(values, start, stop);
}

function reduceOctaveError(values, candidate, end) {
    const doubledCenter = candidate * 2;
    if (doubledCenter > end + 2) return candidate;

    const doubled = findNearbyMinimum(values, doubledCenter, end);
    if (doubled < 0) return candidate;

    const score = values[candidate];
    const doubledScore = values[doubled];
    const meaningfullyBetter = doubledScore <= score * OCTAVE_SCORE_RATIO
        && score - doubledScore >= OCTAVE_SCORE_IMPROVEMENT;
    return meaningfullyBetter ? doubled : candidate;
}

function interpolateLag(values, lag) {
    if (lag <= 0 || lag >= values.length - 1) return lag;

    const left = values[lag - 1];
    const center = values[lag];
    const right = values[lag + 1];
    const denominator = left - (2 * center) + right;
    if (!Number.isFinite(denominator) || Math.abs(denominator) < Number.EPSILON) return lag;

    const offset = 0.5 * (left - right) / denominator;
    if (!Number.isFinite(offset) || Math.abs(offset) > 1) return lag;
    return lag + offset;
}

function createWorkspace() {
    return {
        difference: new Float64Array(0),
        normalizedDifference: new Float64Array(0),
        ensureLength(length) {
            if (this.difference.length < length) {
                this.difference = new Float64Array(length);
                this.normalizedDifference = new Float64Array(length);
            }
        }
    };
}

function detectWithWorkspace(samples, sampleRate, config, workspace) {
    if (!(samples instanceof Float32Array)
        || samples.length < MIN_BUFFER_LENGTH
        || !isFinitePositive(sampleRate)) {
        return null;
    }

    const rms = calculateCenteredRms(samples);
    if (rms === null || rms < config.rmsThreshold) return null;

    const firstSearchLag = Math.max(2, Math.floor(sampleRate / config.maxFrequency) - 1);
    const requestedLastLag = Math.ceil(sampleRate / config.minFrequency) + 1;
    const lastLag = Math.min(requestedLastLag, samples.length - 3);
    const comparisonLength = samples.length - lastLag - 1;
    if (firstSearchLag > lastLag || comparisonLength < lastLag) return null;

    workspace.ensureLength(lastLag + 1);
    const difference = workspace.difference;
    const normalized = workspace.normalizedDifference;
    difference.fill(0, 0, lastLag + 1);
    normalized.fill(0, 0, lastLag + 1);

    // YIN difference function. A common comparison length keeps every lag comparable.
    for (let lag = 1; lag <= lastLag; lag += 1) {
        let total = 0;
        for (let index = 0; index < comparisonLength; index += 1) {
            const delta = samples[index] - samples[index + lag];
            total += delta * delta;
        }
        difference[lag] = total;
    }

    // Cumulative mean normalized difference converts periodic minima to values near zero.
    normalized[0] = 1;
    let runningTotal = 0;
    for (let lag = 1; lag <= lastLag; lag += 1) {
        runningTotal += difference[lag];
        normalized[lag] = runningTotal > 0 ? (difference[lag] * lag) / runningTotal : 1;
    }

    // Detect an above-range fundamental before accepting one of its in-range multiples.
    const firstCandidate = findThresholdCandidate(normalized, 2, lastLag, config.yinThreshold);
    if (firstCandidate > 0 && firstCandidate < firstSearchLag) return null;

    let candidate = firstCandidate >= firstSearchLag ? firstCandidate : -1;
    if (candidate < 0) {
        candidate = findBestCandidate(normalized, firstSearchLag, lastLag);
        if (candidate < 0 || 1 - normalized[candidate] < config.minConfidence) return null;
    }

    candidate = reduceOctaveError(normalized, candidate, lastLag);
    const confidence = Math.max(0, Math.min(1, 1 - normalized[candidate]));
    if (confidence < config.minConfidence) return null;

    // Refine against the unnormalized difference curve; it has less high-note bias.
    const refinedLag = interpolateLag(difference, candidate);
    const frequency = sampleRate / refinedLag;
    if (!Number.isFinite(frequency)
        || frequency < config.minFrequency
        || frequency > config.maxFrequency) {
        return null;
    }

    const note = frequencyToNoteInfo(frequency);
    if (!note) return null;
    return { frequency, confidence, rms, ...note };
}

export function createPitchDetector(options = {}) {
    const config = normalizeOptions(options);
    if (!config) throw new TypeError('Invalid tuner detector options');
    const workspace = createWorkspace();
    return (samples, sampleRate) => detectWithWorkspace(samples, sampleRate, config, workspace);
}

export function detectPitch(samples, sampleRate, options = {}) {
    const config = normalizeOptions(options);
    if (!config) return null;
    const workspace = createWorkspace();
    return detectWithWorkspace(samples, sampleRate, config, workspace);
}

export const TUNER_ENGINE_DEFAULTS = DEFAULT_OPTIONS;
