'use strict';

var assert = require('assert');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/chord-model.js');
require('../js/core/caged-forms.js');

var theory = window.ChordCruise.theory;
var chordModel = window.ChordCruise.chordModel;
var caged = window.ChordCruise.caged;
var EXTENDED = {
    aug: { intervals: [0, 4, 8], symbolSuffix: 'aug', romanSuffix: 'aug', degreeLabels: ['1', '3', '♯5'], symbol: 'Caug' },
    mMaj7: { intervals: [0, 3, 7, 11], symbolSuffix: 'mM7', romanSuffix: 'mM7', degreeLabels: ['1', '♭3', '5', '7'], symbol: 'CmM7' },
    maj7sharp5: { intervals: [0, 4, 8, 11], symbolSuffix: 'M7♯5', romanSuffix: 'M7♯5', degreeLabels: ['1', '3', '♯5', '7'], symbol: 'CM7♯5' },
    dim7: { intervals: [0, 3, 6, 9], symbolSuffix: 'dim7', romanSuffix: '°7', degreeLabels: ['1', '♭3', '♭5', '♭♭7'], symbol: 'Cdim7' }
};

Object.keys(EXTENDED).forEach(function (qualityKey) {
    var expected = EXTENDED[qualityKey];
    var quality = theory.QUALITIES[qualityKey];
    assert.deepStrictEqual(quality.intervals, expected.intervals, qualityKey + ' intervals');
    assert.strictEqual(quality.symbolSuffix, expected.symbolSuffix, qualityKey + ' symbol suffix');
    assert.strictEqual(quality.romanSuffix, expected.romanSuffix, qualityKey + ' Roman suffix');
    assert.deepStrictEqual(quality.degreeLabels, expected.degreeLabels, qualityKey + ' degree labels');
    assert.strictEqual(theory.identifyQuality(expected.intervals), qualityKey, qualityKey + ' recognition');
    assert.strictEqual(theory.chordSymbol(0, qualityKey, false), expected.symbol, qualityKey + ' C symbol');
});

assert.strictEqual(theory.chordSymbol(6, 'maj7sharp5', false), 'F♯M7♯5');
assert.deepStrictEqual(theory.degreeLabels([0, 3, 6, 9]), ['1', '♭3', '♭5', '6'], 'generic 9 remains 6');
assert.deepStrictEqual(theory.degreeLabelsForQuality('dim7', [0, 3, 6, 9]), ['1', '♭3', '♭5', '♭♭7']);
assert.deepStrictEqual(theory.degreeLabelsForQuality('unknown', [0, 3, 6, 9]), ['1', '♭3', '♭5', '6']);

var harmonicMinor = [0, 2, 3, 5, 7, 8, 11];
var melodicMinor = [0, 2, 3, 5, 7, 9, 11];
assert.deepStrictEqual(harmonicMinor.map(function (_interval, index) {
    return theory.identifyQuality(theory.stackScaleChordIntervals(harmonicMinor, index, 3));
}), ['m', 'dim', 'aug', 'm', 'maj', 'maj', 'dim']);
assert.deepStrictEqual(harmonicMinor.map(function (_interval, index) {
    return theory.identifyQuality(theory.stackScaleChordIntervals(harmonicMinor, index, 4));
}), ['mMaj7', 'm7b5', 'maj7sharp5', 'm7', '7', 'maj7', 'dim7']);
assert.deepStrictEqual(melodicMinor.map(function (_interval, index) {
    return theory.identifyQuality(theory.stackScaleChordIntervals(melodicMinor, index, 3));
}), ['m', 'm', 'aug', 'maj', 'maj', 'dim', 'dim']);
assert.deepStrictEqual(melodicMinor.map(function (_interval, index) {
    return theory.identifyQuality(theory.stackScaleChordIntervals(melodicMinor, index, 4));
}), ['mMaj7', 'm7', 'maj7sharp5', '7', '7', 'm7b5', 'm7b5']);

var gSharpHarmonicMinor = { id: 'harmonic-minor-test-only', intervals: harmonicMinor, degreeLabels: ['1', '2', '♭3', '4', '5', '♭6', '7'] };
var names = theory.spellScaleNotes({ tonicPc: 8, tonicName: 'G♯', scale: gSharpHarmonicMinor }).map(function (note) { return note.name; });
var seventhIntervals = theory.stackScaleChordIntervals(harmonicMinor, 6, 4);
assert.deepStrictEqual(names, ['G♯', 'A♯', 'B', 'C♯', 'D♯', 'E', 'F♯♯']);
assert.deepStrictEqual(seventhIntervals, [0, 3, 6, 9]);
assert.strictEqual(theory.identifyQuality(seventhIntervals), 'dim7');
assert.deepStrictEqual([0, 2, 4, 6].map(function (offset) { return names[(6 + offset) % 7]; }), ['F♯♯', 'A♯', 'C♯', 'E']);
assert.deepStrictEqual(theory.degreeLabelsForQuality('dim7', seventhIntervals), ['1', '♭3', '♭5', '♭♭7']);

// Phase B: arbitrary-code intervals share the canonical core quality IDs.
[
    [{ rootPc: 0, third: 4, fifth: 8, seventh: null, tensions: [] }, 'Caug', 'aug'],
    [{ rootPc: 0, third: 3, fifth: 7, seventh: 11, tensions: [] }, 'CmM7', 'mMaj7'],
    [{ rootPc: 0, third: 4, fifth: 8, seventh: 11, tensions: [] }, 'CM7♯5', 'maj7sharp5'],
    [{ rootPc: 0, third: 3, fifth: 6, seventh: 9, tensions: [] }, 'Cdim7', 'dim7']
].forEach(function (fixture) {
    var chord = chordModel.buildCustomChord(fixture[0], '');
    assert.strictEqual(chord.symbol, fixture[1]);
    assert.strictEqual(chord.qualityKey, fixture[2]);
});
assert.deepStrictEqual(
    chordModel.buildCustomChord({ rootPc: 0, third: 3, fifth: 6, seventh: 9, tensions: [] }, '').degreeLabelsList,
    ['1', '♭3', '♭5', '♭♭7']
);

// Phase G1-A: C5 remains the power-chord spelling; only the no-5 display name changes.
var c5 = chordModel.buildCustomChord({ rootPc: 0, third: null, fifth: 7, seventh: null, tensions: [] }, '');
var cNo5 = chordModel.buildCustomChord({ rootPc: 0, third: 4, fifth: null, seventh: null, tensions: [] }, '');
assert.strictEqual(c5.symbol, 'C5');
assert.strictEqual(cNo5.symbol, 'C(no5)');
assert.deepStrictEqual(c5.intervals, [0, 7]);
assert.deepStrictEqual(cNo5.intervals, [0, 4]);
assert.strictEqual(c5.qualityKey, null);
assert.strictEqual(cNo5.qualityKey, null);
assert.strictEqual(theory.identifyQuality(cNo5.intervals), null);
['C', 'A', 'G', 'E', 'D'].forEach(function (shape) {
    assert.strictEqual(caged.getForm(shape, cNo5.qualityKey, cNo5.rootPc, 13, 0).available, false, shape + ' C(no5) remains outside the existing CAGED quality set');
});

console.log('extended-qualities: canonical qualities, arbitrary-code connection, and Phase G1-A C5/C(no5) naming invariants OK');
