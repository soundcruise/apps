'use strict';

var assert = require('assert');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/caged-forms.js');

var theory = window.ChordCruise.theory;
var caged = window.ChordCruise.caged;

/*
 * v0.22.0の音楽構造と、承認された教会旋法の理論値を、実装から独立した
 * 固定期待値として保持する。spellingはscale-spelling.test.jsで別に固定する。
 */
var EXPECTED_QUALITIES = {
    maj: { suffix: '', symbolSuffix: '', romanSuffix: '', intervals: [0, 4, 7], degreeLabels: ['1', '3', '5'] },
    m: { suffix: 'm', symbolSuffix: 'm', romanSuffix: 'm', intervals: [0, 3, 7], degreeLabels: ['1', '♭3', '5'] },
    dim: { suffix: 'dim', symbolSuffix: 'dim', romanSuffix: '°', intervals: [0, 3, 6], degreeLabels: ['1', '♭3', '♭5'] },
    maj7: { suffix: 'M7', symbolSuffix: 'M7', romanSuffix: 'M7', intervals: [0, 4, 7, 11], degreeLabels: ['1', '3', '5', '7'] },
    '7': { suffix: '7', symbolSuffix: '7', romanSuffix: '7', intervals: [0, 4, 7, 10], degreeLabels: ['1', '3', '5', '♭7'] },
    m7: { suffix: 'm7', symbolSuffix: 'm7', romanSuffix: 'm7', intervals: [0, 3, 7, 10], degreeLabels: ['1', '♭3', '5', '♭7'] },
    m7b5: { suffix: 'm7♭5', symbolSuffix: 'm7♭5', romanSuffix: 'm7♭5', intervals: [0, 3, 6, 10], degreeLabels: ['1', '♭3', '♭5', '♭7'] },
    aug: { suffix: 'aug', symbolSuffix: 'aug', romanSuffix: 'aug', intervals: [0, 4, 8], degreeLabels: ['1', '3', '♯5'] },
    mMaj7: { suffix: 'mM7', symbolSuffix: 'mM7', romanSuffix: 'mM7', intervals: [0, 3, 7, 11], degreeLabels: ['1', '♭3', '5', '7'] },
    maj7sharp5: { suffix: 'M7♯5', symbolSuffix: 'M7♯5', romanSuffix: 'M7♯5', intervals: [0, 4, 8, 11], degreeLabels: ['1', '3', '♯5', '7'] },
    dim7: { suffix: 'dim7', symbolSuffix: 'dim7', romanSuffix: '°7', intervals: [0, 3, 6, 9], degreeLabels: ['1', '♭3', '♭5', '♭♭7'] }
};
var EXISTING_SCALE_QUALITY_KEYS = ['maj', 'm', 'dim', 'maj7', '7', 'm7', 'm7b5'];
var SCALE_IDS = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'];
var EXPECTED_SCALES = {
    major: {
        label: 'メジャー / イオニアン',
        rootIntervals: [0, 2, 4, 5, 7, 9, 11],
        degreeLabels: ['1', '2', '3', '4', '5', '6', '7'],
        triadQualities: ['maj', 'm', 'm', 'maj', 'maj', 'm', 'dim'],
        seventhQualities: ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'],
        roman3: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII°'],
        roman7: ['IM7', 'IIm7', 'IIIm7', 'IVM7', 'V7', 'VIm7', 'VIIm7♭5']
    },
    dorian: {
        label: 'ドリアン',
        rootIntervals: [0, 2, 3, 5, 7, 9, 10],
        degreeLabels: ['1', '2', '♭3', '4', '5', '6', '♭7'],
        triadQualities: ['m', 'm', 'maj', 'maj', 'm', 'dim', 'maj'],
        seventhQualities: ['m7', 'm7', 'maj7', '7', 'm7', 'm7b5', 'maj7'],
        roman3: ['I', 'II', 'III', 'IV', 'V', 'VI°', 'VII'],
        roman7: ['Im7', 'IIm7', 'IIIM7', 'IV7', 'Vm7', 'VIm7♭5', 'VIIM7']
    },
    phrygian: {
        label: 'フリジアン',
        rootIntervals: [0, 1, 3, 5, 7, 8, 10],
        degreeLabels: ['1', '♭2', '♭3', '4', '5', '♭6', '♭7'],
        triadQualities: ['m', 'maj', 'maj', 'm', 'dim', 'maj', 'm'],
        seventhQualities: ['m7', 'maj7', '7', 'm7', 'm7b5', 'maj7', 'm7'],
        roman3: ['I', 'II', 'III', 'IV', 'V°', 'VI', 'VII'],
        roman7: ['Im7', 'IIM7', 'III7', 'IVm7', 'Vm7♭5', 'VIM7', 'VIIm7']
    },
    lydian: {
        label: 'リディアン',
        rootIntervals: [0, 2, 4, 6, 7, 9, 11],
        degreeLabels: ['1', '2', '3', '♯4', '5', '6', '7'],
        triadQualities: ['maj', 'maj', 'm', 'dim', 'maj', 'm', 'm'],
        seventhQualities: ['maj7', '7', 'm7', 'm7b5', 'maj7', 'm7', 'm7'],
        roman3: ['I', 'II', 'III', 'IV°', 'V', 'VI', 'VII'],
        roman7: ['IM7', 'II7', 'IIIm7', 'IVm7♭5', 'VM7', 'VIm7', 'VIIm7']
    },
    mixolydian: {
        label: 'ミクソリディアン',
        rootIntervals: [0, 2, 4, 5, 7, 9, 10],
        degreeLabels: ['1', '2', '3', '4', '5', '6', '♭7'],
        triadQualities: ['maj', 'm', 'dim', 'maj', 'm', 'm', 'maj'],
        seventhQualities: ['7', 'm7', 'm7b5', 'maj7', 'm7', 'm7', 'maj7'],
        roman3: ['I', 'II', 'III°', 'IV', 'V', 'VI', 'VII'],
        roman7: ['I7', 'IIm7', 'IIIm7♭5', 'IVM7', 'Vm7', 'VIm7', 'VIIM7']
    },
    minor: {
        label: 'マイナー / エオリアン',
        rootIntervals: [0, 2, 3, 5, 7, 8, 10],
        degreeLabels: ['1', '2', '♭3', '4', '5', '♭6', '♭7'],
        triadQualities: ['m', 'dim', 'maj', 'm', 'm', 'maj', 'maj'],
        seventhQualities: ['m7', 'm7b5', 'maj7', 'm7', 'm7', 'maj7', '7'],
        roman3: ['I', 'II°', 'III', 'IV', 'V', 'VI', 'VII'],
        roman7: ['Im7', 'IIm7♭5', 'IIIM7', 'IVm7', 'Vm7', 'VIM7', 'VII7']
    },
    locrian: {
        label: 'ロクリアン',
        rootIntervals: [0, 1, 3, 5, 6, 8, 10],
        degreeLabels: ['1', '♭2', '♭3', '4', '♭5', '♭6', '♭7'],
        triadQualities: ['dim', 'maj', 'm', 'm', 'maj', 'maj', 'm'],
        seventhQualities: ['m7b5', 'maj7', 'm7', 'm7', 'maj7', '7', 'm7'],
        roman3: ['I°', 'II', 'III', 'IV', 'V', 'VI', 'VII'],
        roman7: ['Im7♭5', 'IIM7', 'IIIm7', 'IVm7', 'VM7', 'VI7', 'VIIm7']
    }
};

assert.deepStrictEqual(Object.keys(theory.SCALES), SCALE_IDS, 'only the approved seven scale IDs are exposed internally');
assert.deepStrictEqual(Object.keys(theory.DIATONIC), SCALE_IDS, 'DIATONIC must expose the same seven scale IDs');
assert.deepStrictEqual(theory.QUALITIES, EXPECTED_QUALITIES, 'Phase A must expose the fixed eleven-quality core metadata');

SCALE_IDS.forEach(function (mode) {
    var expected = EXPECTED_SCALES[mode];
    var scale = theory.SCALES[mode];
    var diatonic = theory.DIATONIC[mode];

    assert.strictEqual(scale.id, mode);
    assert.strictEqual(scale.label, expected.label);
    assert.deepStrictEqual(scale.intervals, expected.rootIntervals, mode + ' intervals');
    assert.deepStrictEqual(scale.degreeLabels, expected.degreeLabels, mode + ' degree labels');
    assert.deepStrictEqual(scale.roman3, expected.roman3, mode + ' scale triad Roman');
    assert.deepStrictEqual(scale.roman7, expected.roman7, mode + ' scale seventh Roman');
    assert.deepStrictEqual(diatonic.rootIntervals, expected.rootIntervals, mode + ' root intervals');
    assert.deepStrictEqual(diatonic.triadQualities, expected.triadQualities, mode + ' generated triad qualities');
    assert.deepStrictEqual(diatonic.seventhQualities, expected.seventhQualities, mode + ' generated seventh qualities');
    assert.deepStrictEqual(diatonic.roman3, expected.roman3, mode + ' DIATONIC triad Roman');
    assert.deepStrictEqual(diatonic.roman7, expected.roman7, mode + ' DIATONIC seventh Roman');
});

assert.deepStrictEqual(theory.stackScaleChordIntervals(EXPECTED_SCALES.major.rootIntervals, 0, 3), [0, 4, 7]);
assert.deepStrictEqual(theory.stackScaleChordIntervals(EXPECTED_SCALES.dorian.rootIntervals, 3, 4), [0, 4, 7, 10]);
assert.deepStrictEqual(theory.stackScaleChordIntervals(EXPECTED_SCALES.phrygian.rootIntervals, 4, 3), [0, 3, 6]);
assert.deepStrictEqual(theory.stackScaleChordIntervals(EXPECTED_SCALES.lydian.rootIntervals, 1, 4), [0, 4, 7, 10]);
assert.deepStrictEqual(theory.stackScaleChordIntervals(EXPECTED_SCALES.mixolydian.rootIntervals, 0, 4), [0, 4, 7, 10]);
assert.deepStrictEqual(theory.stackScaleChordIntervals(EXPECTED_SCALES.minor.rootIntervals, 1, 3), [0, 3, 6]);
assert.deepStrictEqual(theory.stackScaleChordIntervals(EXPECTED_SCALES.locrian.rootIntervals, 0, 4), [0, 3, 6, 10]);
Object.keys(EXPECTED_QUALITIES).forEach(function (qualityKey) {
    assert.strictEqual(theory.identifyQuality(EXPECTED_QUALITIES[qualityKey].intervals), qualityKey);
});
assert.strictEqual(theory.identifyQuality([0, 4, 8]), 'aug');

function fixedExpectedChord(tonicPc, mode, toneMode, degreeIndex) {
    var def = EXPECTED_SCALES[mode];
    var qualityKey = toneMode === '7'
        ? def.seventhQualities[degreeIndex]
        : def.triadQualities[degreeIndex];
    var intervals = EXPECTED_QUALITIES[qualityKey].intervals.slice();
    var rootPc = (tonicPc + def.rootIntervals[degreeIndex]) % 12;
    var notePcs = intervals.map(function (interval) {
        return (rootPc + interval) % 12;
    });
    return {
        roman: (toneMode === '7' ? def.roman7 : def.roman3)[degreeIndex],
        rootPc: rootPc,
        qualityKey: qualityKey,
        intervals: intervals,
        notePcs: notePcs
    };
}

var comparisonCount = 0;
var generatedQualityKeys = {};
SCALE_IDS.forEach(function (mode) {
    ['3', '7'].forEach(function (toneMode) {
        for (var tonicPc = 0; tonicPc < 12; tonicPc += 1) {
            var actual = theory.getDiatonicChords(tonicPc, mode, toneMode);
            var repeated = theory.getDiatonicChords(tonicPc, mode, toneMode);
            assert.deepStrictEqual(repeated, actual, mode + '/' + toneMode + '/' + tonicPc + ' must be deterministic');
            assert.strictEqual(actual.length, 7, mode + '/' + toneMode + '/' + tonicPc + ' must have seven degrees');

            actual.forEach(function (chord, degreeIndex) {
                var expected = fixedExpectedChord(tonicPc, mode, toneMode, degreeIndex);
                assert.strictEqual(chord.index, degreeIndex);
                assert.strictEqual(chord.roman, expected.roman);
                assert.strictEqual(chord.rootPc, expected.rootPc);
                assert.strictEqual(chord.qualityKey, expected.qualityKey);
                assert.deepStrictEqual(chord.intervals, expected.intervals);
                assert.deepStrictEqual(chord.notePcs, expected.notePcs);
                generatedQualityKeys[chord.qualityKey] = true;
                comparisonCount += 1;
            });
        }
    });
});

assert.strictEqual(comparisonCount, 1176, 'must compare all 12 tonics × 7 scales × 2 chord sizes × 7 degrees');
assert.deepStrictEqual(
    Object.keys(generatedQualityKeys).sort(),
    EXISTING_SCALE_QUALITY_KEYS.slice().sort(),
    'all seven scales must use exactly the existing seven qualities'
);

// Major / Minorの音楽構造336件もspellingから独立して明示回帰する。
var majorMinorStructureCount = 0;
['major', 'minor'].forEach(function (mode) {
    ['3', '7'].forEach(function (toneMode) {
        for (var tonicPc = 0; tonicPc < 12; tonicPc += 1) {
            theory.getDiatonicChords(tonicPc, mode, toneMode).forEach(function (chord, degreeIndex) {
                var expected = fixedExpectedChord(tonicPc, mode, toneMode, degreeIndex);
                assert.strictEqual(chord.roman, expected.roman);
                assert.strictEqual(chord.rootPc, expected.rootPc);
                assert.strictEqual(chord.qualityKey, expected.qualityKey);
                assert.deepStrictEqual(chord.intervals, expected.intervals);
                assert.deepStrictEqual(chord.notePcs, expected.notePcs);
                majorMinorStructureCount += 1;
            });
        }
    });
});
assert.strictEqual(majorMinorStructureCount, 336, 'Major / Minor must retain all 336 v0.22.0 structures');

// 生成されるqualityは全CAGED型の正式対応集合に含まれる。
Object.keys(generatedQualityKeys).forEach(function (qualityKey) {
    caged.SHAPE_ORDER.forEach(function (shapeKey) {
        assert(caged.FORMS[shapeKey].qualities[qualityKey], shapeKey + ' shape must support ' + qualityKey);
    });
});

console.log(
    'diatonic-scales: 7 scales match ' + comparisonCount +
    ' fixed structure cases; Major/Minor retain ' + majorMinorStructureCount + ' v0.22.0 structures'
);
