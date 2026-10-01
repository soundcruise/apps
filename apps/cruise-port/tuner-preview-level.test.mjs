import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeReferencePluck, TUNER_PREVIEW_DEFAULTS } from './tuner-preview-audio.js';

// Captured before the 1.12.2 lifecycle repair. These measure the 1.5-second synthesized buffer;
// the browser acceptance test separately guards the filtered output's three-second peak/RMS.
const reference = [
    [44100, 40, 0.8638284802436829, 0.15700043703369598],
    [44100, 64, 0.8444503545761108, 0.069709547389058],
    [48000, 40, 0.8639869093894958, 0.1572078912008762],
    [48000, 64, 0.8805665373802185, 0.06663568619430696]
];

test('reference preview keeps its fixed excitation, duration and sustain defaults', () => {
    assert.deepEqual(TUNER_PREVIEW_DEFAULTS, { duration: 1, sustainTime: 0.5, velocity: 0.7, releaseSeconds: 0.06 });
});

for (const [sampleRate, midi, expectedPeak, expectedRms] of reference) test(`reference preview level: ${sampleRate} Hz, MIDI ${midi}`, () => {
    let state = 0x12345678;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
    const samples = synthesizeReferencePluck({ sampleRate, frequency: 440 * 2 ** ((midi - 69) / 12), random });
    let peak = 0;
    let power = 0;
    for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); power += sample * sample; }
    assert.equal(samples.length, sampleRate * 1.5);
    assert.ok(Math.abs(peak - expectedPeak) < 1e-6, `peak ${peak}`);
    assert.ok(Math.abs(Math.sqrt(power / samples.length) - expectedRms) < 1e-7, 'RMS remains unchanged');
});
