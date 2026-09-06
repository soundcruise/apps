import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
    createDetailedPitchDetector,
    createPitchDetector,
    detectPitch,
    detectPitchDetailed,
    frequencyToNoteInfo,
    TUNER_ENGINE_DEFAULTS
} from './tuner-engine.js';

const SAMPLE_RATES = [44100, 48000];
const BUFFER_LENGTH = 4096;
const STANDARD_NOTES = [
    ['E2', 82.4069],
    ['A2', 110],
    ['D3', 146.8324],
    ['G3', 195.9977],
    ['B3', 246.9417],
    ['E4', 329.6276]
];

function createRandom(seed = 0x12345678) {
    let state = seed >>> 0;
    return () => {
        state = ((1664525 * state) + 1013904223) >>> 0;
        return (state / 0x100000000) * 2 - 1;
    };
}

function makeWave({
    frequency,
    sampleRate,
    amplitude = 0.5,
    harmonics = [[1, 1]],
    noiseAmplitude = 0,
    dcOffset = 0,
    seed = 1
}) {
    const samples = new Float32Array(BUFFER_LENGTH);
    const random = createRandom(seed);
    for (let i = 0; i < samples.length; i += 1) {
        let value = dcOffset;
        for (const [multiple, gain] of harmonics) {
            value += amplitude * gain * Math.sin((2 * Math.PI * frequency * multiple * i) / sampleRate);
        }
        value += noiseAmplitude * random();
        samples[i] = value;
    }
    return samples;
}

function centsBetween(actual, expected) {
    return 1200 * Math.log2(actual / expected);
}

function assertDetected(result, expectedFrequency, label, toleranceCents = 1) {
    assert(result, `${label}: expected a pitch result`);
    const error = centsBetween(result.frequency, expectedFrequency);
    assert(Math.abs(error) <= toleranceCents, `${label}: ${error.toFixed(4)} cent`);
    return error;
}

const noteCases = [
    [440, 'A', 4, 0],
    [261.6256, 'C', 4, 0],
    [329.6276, 'E', 4, 0],
    [82.4069, 'E', 2, 0]
];
for (const [frequency, noteName, octave, expectedCents] of noteCases) {
    const note = frequencyToNoteInfo(frequency);
    assert(note);
    assert.equal(note.noteName, noteName);
    assert.equal(note.octave, octave);
    assert(Math.abs(note.cents - expectedCents) < 0.001);
}
assert.equal(frequencyToNoteInfo(0), null);
assert.equal(frequencyToNoteInfo(Number.NaN), null);
assert.equal(frequencyToNoteInfo(Number.POSITIVE_INFINITY), null);

let maximumSineError = 0;
const measured = [];
for (const sampleRate of SAMPLE_RATES) {
    const detector = createPitchDetector();
    for (const [label, frequency] of [...STANDARD_NOTES, ['E5', 659.2551], ['E6', 1318.5102]]) {
        const result = detector(makeWave({ frequency, sampleRate }), sampleRate);
        const error = assertDetected(result, frequency, `${sampleRate}Hz ${label}`);
        maximumSineError = Math.max(maximumSineError, Math.abs(error));
        measured.push({ sampleRate, label, frequency: result.frequency, centsError: error });
    }
}

for (const sampleRate of SAMPLE_RATES) {
    const detector = createPitchDetector();
    for (const baseFrequency of [82.4069, 440]) {
        for (const cents of [-5, 0, 5]) {
            const frequency = baseFrequency * (2 ** (cents / 1200));
            const result = detector(makeWave({ frequency, sampleRate }), sampleRate);
            assertDetected(result, frequency, `${sampleRate}Hz ${baseFrequency}Hz ${cents} cent`);
            assert(Math.abs(result.cents - cents) <= 1, `note cents should be near ${cents}`);
        }
    }
}

const normalHarmonics = [[1, 1], [2, 0.5], [3, 0.25]];
const weakFundamental = [[1, 0.25], [2, 1], [3, 0.4]];
for (const sampleRate of SAMPLE_RATES) {
    const detector = createPitchDetector();
    for (const frequency of [82.4069, 110]) {
        assertDetected(
            detector(makeWave({ frequency, sampleRate, amplitude: 0.35, harmonics: normalHarmonics }), sampleRate),
            frequency,
            `${sampleRate}Hz normal harmonics ${frequency}`
        );
        assertDetected(
            detector(makeWave({ frequency, sampleRate, amplitude: 0.35, harmonics: weakFundamental }), sampleRate),
            frequency,
            `${sampleRate}Hz weak fundamental ${frequency}`
        );
    }
}

for (const sampleRate of SAMPLE_RATES) {
    const detector = createPitchDetector();
    for (const noiseAmplitude of [0, 0.02, 0.08]) {
        const result = detector(makeWave({
            frequency: 82.4069,
            sampleRate,
            amplitude: 0.5,
            noiseAmplitude,
            seed: sampleRate + Math.round(noiseAmplitude * 100)
        }), sampleRate);
        const tolerance = noiseAmplitude >= 0.08 ? 12 : 3;
        assertDetected(result, 82.4069, `${sampleRate}Hz noise ${noiseAmplitude}`, tolerance);
    }
}

for (const amplitude of [0.5, 0.1, 0.01]) {
    assertDetected(
        detectPitch(makeWave({ frequency: 82.4069, sampleRate: 48000, amplitude }), 48000),
        82.4069,
        `weak input ${amplitude}`
    );
}
assert.equal(detectPitch(makeWave({ frequency: 82.4069, sampleRate: 48000, amplitude: 0.001 }), 48000), null);
assert.equal(detectPitch(new Float32Array(BUFFER_LENGTH), 48000), null);
assert.equal(detectPitch(makeWave({ frequency: 440, sampleRate: 48000, amplitude: 0, noiseAmplitude: 0.4 }), 48000), null);

for (const frequency of [70.01, 1399.9]) {
    assertDetected(
        detectPitch(makeWave({ frequency, sampleRate: 48000 }), 48000),
        frequency,
        `range boundary ${frequency}`,
        1.5
    );
}
assert.equal(detectPitch(makeWave({ frequency: 69, sampleRate: 48000 }), 48000), null);
assert.equal(detectPitch(makeWave({ frequency: 50, sampleRate: 48000 }), 48000), null);
assert.equal(detectPitch(makeWave({ frequency: 1500, sampleRate: 48000 }), 48000), null);

for (const frequency of [82.4069, 164.8138, 110, 220]) {
    assertDetected(
        detectPitch(makeWave({ frequency, sampleRate: 48000 }), 48000),
        frequency,
        `octave switch ${frequency}`
    );
}

assertDetected(
    detectPitch(makeWave({ frequency: 110, sampleRate: 48000, dcOffset: 0.3 }), 48000),
    110,
    'DC offset'
);
assert.equal(detectPitch(undefined, 48000), null);
assert.equal(detectPitch(new Float32Array(), 48000), null);
assert.equal(detectPitch(new Float32Array(4096), 0), null);
assert.equal(detectPitch(new Float32Array(4096), Number.NaN), null);
const invalidSamples = makeWave({ frequency: 440, sampleRate: 48000 });
invalidSamples[100] = Number.NaN;
assert.equal(detectPitch(invalidSamples, 48000), null);
const infiniteSamples = makeWave({ frequency: 440, sampleRate: 48000 });
infiniteSamples[100] = Number.POSITIVE_INFINITY;
assert.equal(detectPitch(infiniteSamples, 48000), null);
const oversizedSamples = makeWave({ frequency: 440, sampleRate: 48000 });
oversizedSamples[100] = 100;
assert.equal(detectPitch(oversizedSamples, 48000), null);
assert.equal(detectPitch(new Float32Array(4096).fill(0.5), 48000), null);
assert.throws(() => createPitchDetector({ minFrequency: 1400, maxFrequency: 70 }), TypeError);

{
    const samples = makeWave({ frequency: 82.4069, sampleRate: 48000 });
    const ordinary = detectPitch(samples, 48000);
    const detailed = detectPitchDetailed(samples, 48000);
    assert.deepEqual(detailed.result, ordinary, 'detailed detection preserves the ordinary result');
    assert.equal(detailed.diagnostics.reason, 'valid');
    assert.equal(detailed.diagnostics.finalFrequency, detailed.result.frequency);
    assert.equal(detailed.diagnostics.rawFrequency, detailed.result.frequency);
    assert.equal(detailed.diagnostics.rmsThreshold, 0.003);
    assert(Number.isFinite(detailed.diagnostics.rmsDbfs));

    const reusableDetailed = createDetailedPitchDetector();
    assert.equal(reusableDetailed(samples, 48000).diagnostics.reason, 'valid');
}

{
    const quietIphoneLikeInput = makeWave({
        frequency: 82.4069,
        sampleRate: 48000,
        amplitude: 0.0012
    });
    assert.equal(detectPitch(quietIphoneLikeInput, 48000), null, 'standard rejects sub-threshold input');
    const quietThresholdResult = detectPitchDetailed(quietIphoneLikeInput, 48000, { rmsThreshold: 0.0008 });
    assert(quietThresholdResult.result, 'a lower RMS threshold passes the measured iPhone-like level to YIN');
    assert.equal(quietThresholdResult.result.noteName, 'E');
    assert.equal(quietThresholdResult.result.octave, 2);
    assert.equal(quietThresholdResult.diagnostics.rmsThreshold, 0.0008);
}

{
    const weak = detectPitchDetailed(
        makeWave({ frequency: 82.4069, sampleRate: 48000, amplitude: 0.001 }),
        48000
    );
    assert.equal(weak.result, null);
    assert.equal(weak.diagnostics.reason, 'low-rms');
    assert(weak.diagnostics.rms < TUNER_ENGINE_DEFAULTS.rmsThreshold);
    assert(Number.isFinite(weak.diagnostics.rmsDbfs));
}

{
    const noise = detectPitchDetailed(
        makeWave({ frequency: 440, sampleRate: 48000, amplitude: 0, noiseAmplitude: 0.4 }),
        48000
    );
    assert.equal(noise.result, null);
    assert.equal(noise.diagnostics.reason, 'low-confidence');
    assert(noise.diagnostics.rms > TUNER_ENGINE_DEFAULTS.rmsThreshold);
    assert(noise.diagnostics.confidence < TUNER_ENGINE_DEFAULTS.minConfidence);
}

{
    const outside = detectPitchDetailed(makeWave({ frequency: 1500, sampleRate: 48000 }), 48000);
    assert.equal(outside.result, null);
    assert.equal(outside.diagnostics.reason, 'out-of-range');

    const invalid = detectPitchDetailed(undefined, 48000);
    assert.equal(invalid.result, null);
    assert.equal(invalid.diagnostics.reason, 'invalid-input');

    const invalidOptions = detectPitchDetailed(new Float32Array(BUFFER_LENGTH), 48000, {
        minFrequency: 1400,
        maxFrequency: 70
    });
    assert.equal(invalidOptions.diagnostics.reason, 'invalid-input');
}

const performanceDetector = createPitchDetector();
const performanceWave = makeWave({ frequency: 82.4069, sampleRate: 48000, harmonics: normalHarmonics });
performanceDetector(performanceWave, 48000);
const iterations = 20;
const startedAt = performance.now();
for (let i = 0; i < iterations; i += 1) performanceDetector(performanceWave, 48000);
const elapsedMs = performance.now() - startedAt;

console.log(JSON.stringify({
    defaults: TUNER_ENGINE_DEFAULTS,
    maximumSineErrorCents: maximumSineError,
    measured,
    performance: {
        iterations,
        elapsedMs,
        averageMs: elapsedMs / iterations
    }
}, null, 2));
console.log('tuner-engine: all tests passed');
