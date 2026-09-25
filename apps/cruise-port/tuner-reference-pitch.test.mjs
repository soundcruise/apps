import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPitchDetector } from './tuner-engine.js';
import { getTuningTargets, midiToNoteInfo } from './tuner-tuning.js';
import { synthesizeReferencePluck, TUNER_PREVIEW_DEFAULTS } from './tuner-preview-audio.js';

// The reference tone must read as the exact centre on Cruise Port's own tuner (digital loop).
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const cents = (a, b) => 1200 * Math.log2(a / b);
function measure(samples, sampleRate, target) {
  const detect = createPitchDetector();
  let size = 4096; while (size < 32768 && size / sampleRate < 0.08) size *= 2; // same as tuner-audio.js
  const values = [];
  for (let start = Math.floor(sampleRate * 0.1); start + size < samples.length - sampleRate * 0.1; start += size) {
    const result = detect(samples.subarray(start, start + size), sampleRate);
    if (result) values.push(cents(result.frequency, target));
  }
  return values;
}

test('targets are equal-tempered from A4 = 440 Hz in double precision', () => {
  assert.equal(midiToNoteInfo(69).targetFrequency, 440);
  assert.ok(Math.abs(midiToNoteInfo(40).targetFrequency - 82.40688922821748) < 1e-12);
  assert.ok(Math.abs(midiToNoteInfo(64).targetFrequency - 329.6275569128699) < 1e-12);
});

test('standard tuning, capo 0 / 5 / 12, 44.1 and 48 kHz: every string within ±1 cent (median) and ±2 (frames)', () => {
  for (const sampleRate of [44100, 48000]) {
    for (const capo of [0, 5, 12]) {
      for (const target of getTuningTargets('standard', capo)) {
        const samples = synthesizeReferencePluck({ sampleRate, frequency: target.targetFrequency, random: seeded(capo * 7 + target.string) });
        const values = measure(samples, sampleRate, target.targetFrequency);
        assert.ok(values.length >= 5, `${target.note} is detected`);
        const sorted = [...values].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        assert.ok(Math.abs(median) <= 1, `${sampleRate} capo${capo} ${target.note}: median ${median.toFixed(3)} cents`);
        assert.ok(values.every((value) => Math.abs(value) <= 2), `${sampleRate} capo${capo} ${target.note}: frame within ±2 cents`);
      }
    }
  }
});

test('alternate tunings read at their targets too', () => {
  for (const [tuning, capo] of [['drop-d', 0], ['half-step-down', 3], ['dadgad', 2], ['open-g', 7]]) {
    for (const target of getTuningTargets(tuning, capo)) {
      const samples = synthesizeReferencePluck({ sampleRate: 48000, frequency: target.targetFrequency, random: seeded(target.string) });
      const values = measure(samples, 48000, target.targetFrequency).sort((a, b) => a - b);
      assert.ok(Math.abs(values[Math.floor(values.length / 2)]) <= 1, `${tuning} capo${capo} ${target.note}`);
    }
  }
});

test('the tone keeps its length and character; no random detune remains', () => {
  const samples = synthesizeReferencePluck({ sampleRate: 48000, frequency: 110, random: seeded(3) });
  assert.equal(samples.length, Math.ceil(48000 * (TUNER_PREVIEW_DEFAULTS.duration + TUNER_PREVIEW_DEFAULTS.sustainTime)));
  assert.ok(samples.every(Number.isFinite));
  const peak = Math.max(...samples.map(Math.abs));
  assert.ok(peak > 0.3 && peak < 2, `peak ${peak}`);
  assert.ok(Math.abs(samples.at(-1)) < 1e-3, 'the fade still ends near silence');
  const again = synthesizeReferencePluck({ sampleRate: 48000, frequency: 110, random: seeded(3) });
  assert.deepEqual(again, samples, 'deterministic for the same random source');
  const source = readFileSync(new URL('./tuner-preview-audio.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /detuneRatio/, 'no random detune on a reference pitch');
  assert.match(source, /filterCoeff = 0\.40 \+ velocity \* 0\.20/, 'same string filter');
  assert.match(source, /Math\.pow\(0\.001, 1 \/ sustainSamples\) \* freqDecayCorrection/, 'same decay');
  assert.match(source, /bodyRes1\.frequency\.value = 100/, 'same body EQ chain');
});
