import assert from 'node:assert/strict';
import {
    TUNER_CAPO_MAX,
    TUNER_CAPO_MIN,
    TUNING_PRESET_LIST,
    TUNING_PRESETS,
    findTargetString,
    getTuningTargets,
    isValidCapo,
    isFreeTuning,
    isValidTuningId,
    midiToNoteInfo
} from './tuner-tuning.js';

const EXPECTED_PRESETS = Object.freeze({
    standard: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
    'half-step-down': ['D♯2', 'G♯2', 'C♯3', 'F♯3', 'A♯3', 'D♯4'],
    'whole-step-down': ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'],
    'drop-d': ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'],
    'double-drop-d': ['D2', 'A2', 'D3', 'G3', 'B3', 'D4'],
    dadgad: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'],
    'open-g': ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'],
    'open-d': ['D2', 'A2', 'D3', 'F♯3', 'A3', 'D4'],
    'open-e': ['E2', 'B2', 'E3', 'G♯3', 'B3', 'E4'],
    'open-c': ['C2', 'G2', 'C3', 'G3', 'C4', 'E4']
});

assert.equal(TUNING_PRESET_LIST.length, 11);
assert.deepEqual(TUNING_PRESET_LIST.map(({ id }) => id), [...Object.keys(EXPECTED_PRESETS), 'free']);
for (const [tuningId, expectedNotes] of Object.entries(EXPECTED_PRESETS)) {
    const targets = getTuningTargets(tuningId, 0);
    assert.deepEqual(targets.map(({ note }) => note), expectedNotes, `${tuningId} notes`);
    assert.deepEqual(targets.map(({ string }) => string), [6, 5, 4, 3, 2, 1]);
    assert.deepEqual(targets.map(({ midi }) => midi), TUNING_PRESETS[tuningId].baseMidis);
}
assert.equal(TUNING_PRESETS.free.baseMidis, null, 'free mode has no synthetic string targets');
assert.equal(isFreeTuning('free'), true);
assert.equal(isFreeTuning('standard'), false);
assert.deepEqual(getTuningTargets('free', 0), []);
assert.deepEqual(getTuningTargets('free', 12), []);

assert.deepEqual([TUNER_CAPO_MIN, TUNER_CAPO_MAX], [0, 12]);
assert.deepEqual(
    getTuningTargets('standard', 2).map(({ note }) => note),
    ['F♯2', 'B2', 'E3', 'A3', 'C♯4', 'F♯4']
);
assert.deepEqual(
    getTuningTargets('dadgad', 3).map(({ note }) => note),
    ['F2', 'C3', 'F3', 'A♯3', 'C4', 'F4']
);
for (const capo of [0, 1, 2, 5, 12]) {
    const targets = getTuningTargets('standard', capo);
    assert.deepEqual(
        targets.map(({ midi }, index) => midi - TUNING_PRESETS.standard.baseMidis[index]),
        Array(6).fill(capo),
        `capo ${capo} shifts every string numerically`
    );
}
const standardOpen = getTuningTargets('standard', 0);
const standardOctave = getTuningTargets('standard', 12);
assert.deepEqual(
    standardOctave.map(({ octave }, index) => octave - standardOpen[index].octave),
    Array(6).fill(1)
);

assert.equal(midiToNoteInfo(69).note, 'A4');
assert.equal(midiToNoteInfo(69).targetFrequency, 440);
assert(Math.abs(midiToNoteInfo(40).targetFrequency - 82.406889) < 0.00001);
assert.equal(midiToNoteInfo(-1), null);

for (const [tuningId, notes] of Object.entries(EXPECTED_PRESETS)) {
    const targets = getTuningTargets(tuningId, 0);
    for (const [index, note] of notes.entries()) {
        const target = targets[index];
        assert.equal(findTargetString(targets, target.noteName, target.octave)?.string, 6 - index, `${tuningId} ${note}`);
    }
}
const capoTargets = getTuningTargets('drop-d', 2);
assert.equal(findTargetString(capoTargets, 'E', 2)?.string, 6);
assert.equal(findTargetString(capoTargets, 'E', 3)?.string, 4);
assert.equal(findTargetString(standardOpen, 'F', 2), null);
assert.equal(findTargetString(standardOpen, 'C', 3), null);
assert.equal(findTargetString(standardOpen, 'A', 4), null);

assert.equal(isValidTuningId('standard'), true);
assert.equal(isValidTuningId('free'), true);
assert.equal(isValidTuningId('unknown'), false);
assert.equal(isValidCapo(0), true);
assert.equal(isValidCapo(12), true);
assert.equal(isValidCapo(-1), false);
assert.equal(isValidCapo(13), false);
assert.equal(isValidCapo(2.5), false);
assert.equal(getTuningTargets('unknown', 0), null);
assert.equal(getTuningTargets('standard', 13), null);

console.log('tuner-tuning: all preset, capo, frequency, and target matching tests passed');
