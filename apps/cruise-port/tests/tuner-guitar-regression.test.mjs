import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { GUITAR_NOTES, analyserSize, guitarSignal, frameAt } from './fixtures/tuner-guitar.mjs';
import { createTunerSmoother } from '../tuner-app.js';
// Optional baseline file allows the exact same corpus/metrics to run against git show HEAD:... .
const { createDetailedPitchDetector } = await import(process.env.TUNER_ENGINE_PATH
    ? pathToFileURL(process.env.TUNER_ENGINE_PATH).href : '../tuner-engine.js');
const rates = [32000, 44100, 48000, 96000];
const profiles = ['clean', 'hiss', 'weak-fundamental', 'inharmonic', 'clipped'];
const report = { syntheticOnly: true, cadenceMs: 50, toleranceCents: 10, rows: [], negatives: {}, timingsMs: [] };
const cents = (hz, expected) => 1200 * Math.log2(hz / expected);
for (const sampleRate of rates) for (const profile of profiles) test(`${sampleRate} Hz guitar ${profile}: all strings, levels, attack and decay`, () => {
    const row = { sampleRate, profile, frames: 0, correct: 0, wrong: 0, rejected: 0, portCorrect: 0, reasons: {}, maxErrorCents: 0, maxFirstDetectionMs: 0, neverDetected: 0, maxDropoutMs: 0, minDbfs: Infinity, maxDbfs: -Infinity };
    for (const [note, frequency] of GUITAR_NOTES) for (const amplitude of [.008, .08, .4]) {
        const detector = createDetailedPitchDetector({ rmsThreshold: .0001 });
        const smoother = createTunerSmoother();
        const signal = guitarSignal({ sampleRate, frequency, amplitude, profile });
        let first = null, dropout = 0;
        for (let time = 50; time <= 1100; time += 50) {
            const frame = frameAt(signal, sampleRate, time), start = performance.now();
            const detection = detector(frame, sampleRate);
            report.timingsMs.push(performance.now() - start);
            const display = smoother.push(detection.result, time);
            const error = detection.result ? Math.abs(cents(detection.result.frequency, frequency)) : null;
            if (error !== null && error <= 10 && first === null) first = time - 50; // From pluck onset, excludes microphone permission.
            if (time < 200) continue; // Attack remains measured in first detection; steady-state denominator starts at 150 ms after pluck.
            row.frames++;
            row.reasons[detection.diagnostics.reason] = (row.reasons[detection.diagnostics.reason] || 0) + 1;
            row.minDbfs = Math.min(row.minDbfs, detection.diagnostics.rmsDbfs);
            row.maxDbfs = Math.max(row.maxDbfs, detection.diagnostics.rmsDbfs);
            if (error === null) { row.rejected++; dropout += 50; }
            else { row.maxErrorCents = Math.max(row.maxErrorCents, error); if (error <= 10) row.correct++; else row.wrong++; dropout = 0; }
            row.maxDropoutMs = Math.max(row.maxDropoutMs, dropout);
            if (display && Math.abs(cents(display.frequency, frequency)) <= 10) row.portCorrect++;
        }
        if (first === null) row.neverDetected++;
        else row.maxFirstDetectionMs = Math.max(row.maxFirstDetectionMs, first);
        if (!process.env.TUNER_BASELINE) assert(first !== null && first <= 150, `${note} amplitude ${amplitude}: first ${first}`);
    }
    report.rows.push(row);
    if (!process.env.TUNER_BASELINE) {
        assert.equal(row.wrong, 0, JSON.stringify(row));
        assert(row.correct / row.frames >= .98, JSON.stringify(row));
        assert(row.portCorrect / row.frames >= .98, JSON.stringify(row));
        assert(row.maxDropoutMs <= 100, JSON.stringify(row));
    }
});
test('reject silence, sub-threshold guitar, DC, white/low-pass noise, hum and outside-range fundamentals', () => {
    for (const sampleRate of rates) {
        const detector = createDetailedPitchDetector({ rmsThreshold: .0001 });
        const size = analyserSize(sampleRate);
        for (const kind of ['silence', 'quiet', 'dc', 'noise', 'colored-noise', 'hum', 'low', 'high']) {
            let seed = 89, colored = 0;
            for (let frame = 0; frame < 20; frame++) {
                const samples = Float32Array.from({ length: size }, (_, i) => {
                    seed = (1664525 * seed + 1013904223) >>> 0;
                    const random = seed / 2 ** 31 - 1, t = (i + frame * size) / sampleRate;
                    colored += .08 * (random - colored);
                    if (kind === 'silence') return 0;
                    if (kind === 'dc') return .1;
                    if (kind === 'noise') return .2 * random;
                    if (kind === 'colored-noise') return .2 * colored;
                    const frequency = kind === 'quiet' ? 110 : kind === 'hum' ? 50 : kind === 'low' ? 69 : 1500;
                    return (kind === 'quiet' ? .00001 : .2) * Math.sin(2 * Math.PI * frequency * t);
                });
                const d = detector(samples, sampleRate);
                report.negatives[kind] ??= { frames: 0, accepted: 0, reasons: {} };
                const n = report.negatives[kind]; n.frames++; n.accepted += Boolean(d.result); n.reasons[d.diagnostics.reason] = (n.reasons[d.diagnostics.reason] || 0) + 1;
                assert.equal(d.result, null, `${sampleRate} ${kind}: ${JSON.stringify(d)}`);
            }
        }
    }
});
test('overlapping frames, sample-rate changes and input arrays never carry filter state or mutate audio', () => {
    const shared = createDetailedPitchDetector({ rmsThreshold: .0001 });
    for (const sampleRate of [96000, 44100, 32000, 48000, 44100]) {
        const signal = guitarSignal({ sampleRate, frequency: 110, profile: 'hiss' });
        for (const end of [350, 400, 350]) {
            const frame = frameAt(signal, sampleRate, end), original = frame.slice();
            const actual = shared(frame, sampleRate), fresh = createDetailedPitchDetector({ rmsThreshold: .0001 })(frame, sampleRate);
            assert.deepEqual(actual, fresh); assert.deepEqual(frame, original);
        }
    }
});
test.after(async () => {
    const times = report.timingsMs.sort((a,b) => a-b);
    report.performance = { frames: times.length, meanMs: times.reduce((a,b) => a+b,0) / times.length, p95Ms: times[Math.floor(times.length * .95)], maxMs: times.at(-1) };
    delete report.timingsMs;
    if (process.env.TUNER_REPORT) { const { writeFileSync } = await import('node:fs'); writeFileSync(process.env.TUNER_REPORT, JSON.stringify(report, null, 2) + '\n'); }
    console.log(JSON.stringify(report));
});
