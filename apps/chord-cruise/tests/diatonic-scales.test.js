'use strict';

var assert = require('assert');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');

var theory = window.ChordCruise.theory;

/*
 * v0.21.6 のroot／quality固定表と、v0.21.7後の全大文字Romanを、
 * 実装から独立した期待値として保持する。新しいscale generatorやSCALESから
 * 期待値を生成してはいけない。
 */
var LEGACY_NOTES_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
var LEGACY_NOTES_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
var LEGACY_FLAT_MAJOR_TONICS = [5, 10, 3, 8, 1];
var LEGACY_FLAT_MINOR_TONICS = [2, 7, 0, 5, 10, 3];
var LEGACY_QUALITIES = {
    maj: { suffix: '', intervals: [0, 4, 7] },
    m: { suffix: 'm', intervals: [0, 3, 7] },
    dim: { suffix: 'dim', intervals: [0, 3, 6] },
    maj7: { suffix: 'M7', intervals: [0, 4, 7, 11] },
    '7': { suffix: '7', intervals: [0, 4, 7, 10] },
    m7: { suffix: 'm7', intervals: [0, 3, 7, 10] },
    m7b5: { suffix: 'm7♭5', intervals: [0, 3, 6, 10] }
};
var LEGACY_DIATONIC = {
    major: {
        rootIntervals: [0, 2, 4, 5, 7, 9, 11],
        triadQualities: ['maj', 'm', 'm', 'maj', 'maj', 'm', 'dim'],
        seventhQualities: ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5']
    },
    minor: {
        rootIntervals: [0, 2, 3, 5, 7, 8, 10],
        triadQualities: ['m', 'dim', 'maj', 'm', 'm', 'maj', 'maj'],
        seventhQualities: ['m7', 'm7b5', 'maj7', 'm7', 'm7', 'maj7', '7']
    }
};
var UPPERCASE_ROMAN = {
    major: {
        roman3: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII°'],
        roman7: ['IM7', 'IIm7', 'IIIm7', 'IVM7', 'V7', 'VIm7', 'VIIm7♭5']
    },
    minor: {
        roman3: ['I', 'II°', 'III', 'IV', 'V', 'VI', 'VII'],
        roman7: ['Im7', 'IIm7♭5', 'IIIM7', 'IVm7', 'Vm7', 'VIM7', 'VII7']
    }
};

assert.deepStrictEqual(theory.SCALES.major.intervals, LEGACY_DIATONIC.major.rootIntervals);
assert.deepStrictEqual(theory.SCALES.major.degreeLabels, ['1', '2', '3', '4', '5', '6', '7']);
assert.deepStrictEqual(theory.SCALES.minor.intervals, LEGACY_DIATONIC.minor.rootIntervals);
assert.deepStrictEqual(theory.SCALES.minor.degreeLabels, ['1', '2', '♭3', '4', '5', '♭6', '♭7']);

['major', 'minor'].forEach(function (mode) {
    assert.deepStrictEqual(theory.DIATONIC[mode].rootIntervals, LEGACY_DIATONIC[mode].rootIntervals);
    assert.deepStrictEqual(theory.DIATONIC[mode].triadQualities, LEGACY_DIATONIC[mode].triadQualities);
    assert.deepStrictEqual(theory.DIATONIC[mode].seventhQualities, LEGACY_DIATONIC[mode].seventhQualities);
    assert.deepStrictEqual(theory.DIATONIC[mode].roman3, UPPERCASE_ROMAN[mode].roman3);
    assert.deepStrictEqual(theory.DIATONIC[mode].roman7, UPPERCASE_ROMAN[mode].roman7);
});

assert.deepStrictEqual(theory.stackScaleChordIntervals(theory.SCALES.major.intervals, 0, 3), [0, 4, 7]);
assert.deepStrictEqual(theory.stackScaleChordIntervals(theory.SCALES.major.intervals, 6, 4), [0, 3, 6, 10]);
assert.deepStrictEqual(theory.stackScaleChordIntervals(theory.SCALES.minor.intervals, 0, 4), [0, 3, 7, 10]);
assert.deepStrictEqual(theory.stackScaleChordIntervals(theory.SCALES.minor.intervals, 1, 3), [0, 3, 6]);
Object.keys(LEGACY_QUALITIES).forEach(function (qualityKey) {
    assert.strictEqual(theory.identifyQuality(LEGACY_QUALITIES[qualityKey].intervals), qualityKey);
});
assert.strictEqual(theory.identifyQuality([0, 4, 8]), null, 'new qualities must not be introduced in Phase 1');

function legacyUsesFlats(tonicPc, mode) {
    var tonics = mode === 'minor' ? LEGACY_FLAT_MINOR_TONICS : LEGACY_FLAT_MAJOR_TONICS;
    return tonics.indexOf(tonicPc) !== -1;
}

function legacyNoteName(pc, useFlats) {
    var names = useFlats ? LEGACY_NOTES_FLAT : LEGACY_NOTES_SHARP;
    return names[((pc % 12) + 12) % 12];
}

function legacyExpectedChord(tonicPc, mode, toneMode, degreeIndex) {
    var def = LEGACY_DIATONIC[mode];
    var useFlats = legacyUsesFlats(tonicPc, mode);
    var qualityKey = toneMode === '7'
        ? def.seventhQualities[degreeIndex]
        : def.triadQualities[degreeIndex];
    var intervals = LEGACY_QUALITIES[qualityKey].intervals.slice();
    var rootPc = (tonicPc + def.rootIntervals[degreeIndex]) % 12;
    var rootName = legacyNoteName(rootPc, useFlats);
    var symbol = toneMode !== '7' && qualityKey === 'dim'
        ? rootName + 'm♭5'
        : rootName + LEGACY_QUALITIES[qualityKey].suffix;
    var notePcs = intervals.map(function (interval) { return (rootPc + interval) % 12; });

    return {
        index: degreeIndex,
        roman: (toneMode === '7' ? UPPERCASE_ROMAN[mode].roman7 : UPPERCASE_ROMAN[mode].roman3)[degreeIndex],
        rootPc: rootPc,
        rootName: rootName,
        qualityKey: qualityKey,
        symbol: symbol,
        intervals: intervals,
        notePcs: notePcs,
        noteNames: notePcs.map(function (pc) { return legacyNoteName(pc, useFlats); })
    };
}

var comparisonCount = 0;
['major', 'minor'].forEach(function (mode) {
    ['3', '7'].forEach(function (toneMode) {
        for (var tonicPc = 0; tonicPc < 12; tonicPc += 1) {
            var actual = theory.getDiatonicChords(tonicPc, mode, toneMode);
            var repeated = theory.getDiatonicChords(tonicPc, mode, toneMode);
            assert.deepStrictEqual(repeated, actual, mode + '/' + toneMode + '/' + tonicPc + ' must be deterministic');
            assert.strictEqual(actual.length, 7, mode + '/' + toneMode + '/' + tonicPc + ' must have seven degrees');

            actual.forEach(function (chord, degreeIndex) {
                var expected = legacyExpectedChord(tonicPc, mode, toneMode, degreeIndex);
                assert.strictEqual(chord.index, expected.index);
                assert.strictEqual(chord.roman, expected.roman);
                assert.strictEqual(chord.rootPc, expected.rootPc);
                assert.strictEqual(legacyNoteName(chord.rootPc, legacyUsesFlats(tonicPc, mode)), expected.rootName);
                assert.strictEqual(chord.qualityKey, expected.qualityKey);
                assert.strictEqual(chord.symbol, expected.symbol);
                assert.deepStrictEqual(chord.intervals, expected.intervals);
                assert.deepStrictEqual(chord.notePcs, expected.notePcs);
                assert.deepStrictEqual(chord.noteNames, expected.noteNames);
                comparisonCount += 1;
            });
        }
    });
});

assert.strictEqual(comparisonCount, 336, 'must compare all 12 tonics × 2 modes × 2 chord sizes × 7 degrees');

console.log('diatonic-scales: v0.21.7 root/quality output and uppercase Roman match ' + comparisonCount + ' fixed expectation cases');
