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
    '6': { suffix: '6', symbolSuffix: '6', romanSuffix: '6', intervals: [0, 4, 7, 9], degreeLabels: ['1', '3', '5', '6'] },
    sus4: { suffix: 'sus4', symbolSuffix: 'sus4', romanSuffix: 'sus4', intervals: [0, 5, 7], degreeLabels: ['1', '4', '5'] },
    '7sus4': { suffix: '7sus4', symbolSuffix: '7sus4', romanSuffix: '7sus4', intervals: [0, 5, 7, 10], degreeLabels: ['1', '4', '5', '♭7'] },
    M7sus4: { suffix: 'M7sus4', symbolSuffix: 'M7sus4', romanSuffix: 'M7sus4', intervals: [0, 5, 7, 11], degreeLabels: ['1', '4', '5', '7'] },
    power5: { suffix: '5', symbolSuffix: '5', romanSuffix: '5', intervals: [0, 7], degreeLabels: ['1', '5'] },
    no5: { suffix: '(no5)', symbolSuffix: '(no5)', romanSuffix: '(no5)', intervals: [0, 4], degreeLabels: ['1', '3'] },
    '7no3': { suffix: '7(no3)', symbolSuffix: '7(no3)', romanSuffix: '7(no3)', intervals: [0, 7, 10], degreeLabels: ['1', '5', '♭7'] },
    maj7no3: { suffix: 'M7(no3)', symbolSuffix: 'M7(no3)', romanSuffix: 'M7(no3)', intervals: [0, 7, 11], degreeLabels: ['1', '5', '7'] },
    '7no5': { suffix: '7(no5)', symbolSuffix: '7(no5)', romanSuffix: '7(no5)', intervals: [0, 4, 10], degreeLabels: ['1', '3', '♭7'] },
    maj7no5: { suffix: 'M7(no5)', symbolSuffix: 'M7(no5)', romanSuffix: 'M7(no5)', intervals: [0, 4, 11], degreeLabels: ['1', '3', '7'] },
    m7no5: { suffix: 'm7(no5)', symbolSuffix: 'm7(no5)', romanSuffix: 'm7(no5)', intervals: [0, 3, 10], degreeLabels: ['1', '♭3', '♭7'] },
    m: { suffix: 'm', symbolSuffix: 'm', romanSuffix: 'm', intervals: [0, 3, 7], degreeLabels: ['1', '♭3', '5'] },
    m6: { suffix: 'm6', symbolSuffix: 'm6', romanSuffix: 'm6', intervals: [0, 3, 7, 9], degreeLabels: ['1', '♭3', '5', '6'] },
    dim: { suffix: 'dim', symbolSuffix: 'dim', romanSuffix: '°', intervals: [0, 3, 6], degreeLabels: ['1', '♭3', '♭5'] },
    maj7: { suffix: 'M7', symbolSuffix: 'M7', romanSuffix: 'M7', intervals: [0, 4, 7, 11], degreeLabels: ['1', '3', '5', '7'] },
    '7': { suffix: '7', symbolSuffix: '7', romanSuffix: '7', intervals: [0, 4, 7, 10], degreeLabels: ['1', '3', '5', '♭7'] },
    '7b5': { suffix: '7♭5', symbolSuffix: '7♭5', romanSuffix: '7♭5', intervals: [0, 4, 6, 10], degreeLabels: ['1', '3', '♭5', '♭7'] },
    'maj7b5': { suffix: 'M7♭5', symbolSuffix: 'M7♭5', romanSuffix: 'M7♭5', intervals: [0, 4, 6, 11], degreeLabels: ['1', '3', '♭5', '7'] },
    m7: { suffix: 'm7', symbolSuffix: 'm7', romanSuffix: 'm7', intervals: [0, 3, 7, 10], degreeLabels: ['1', '♭3', '5', '♭7'] },
    m7b5: { suffix: 'm7♭5', symbolSuffix: 'm7♭5', romanSuffix: 'm7♭5', intervals: [0, 3, 6, 10], degreeLabels: ['1', '♭3', '♭5', '♭7'] },
    aug: { suffix: 'aug', symbolSuffix: 'aug', romanSuffix: 'aug', intervals: [0, 4, 8], degreeLabels: ['1', '3', '♯5'] },
    mMaj7: { suffix: 'mM7', symbolSuffix: 'mM7', romanSuffix: 'mM7', intervals: [0, 3, 7, 11], degreeLabels: ['1', '♭3', '5', '7'] },
    maj7sharp5: { suffix: 'M7♯5', symbolSuffix: 'M7♯5', romanSuffix: 'M7♯5', intervals: [0, 4, 8, 11], degreeLabels: ['1', '3', '♯5', '7'] },
    dim7: { suffix: 'dim7', symbolSuffix: 'dim7', romanSuffix: '°7', intervals: [0, 3, 6, 9], degreeLabels: ['1', '♭3', '♭5', '♭♭7'] }
};
var LEGACY_SCALE_IDS = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'];
var SCALE_IDS = LEGACY_SCALE_IDS.concat(['harmonic-minor', 'melodic-minor']);
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
    },
    'harmonic-minor': {
        label: 'ハーモニックマイナー',
        rootIntervals: [0, 2, 3, 5, 7, 8, 11],
        degreeLabels: ['1', '2', '♭3', '4', '5', '♭6', '7'],
        triadQualities: ['m', 'dim', 'aug', 'm', 'maj', 'maj', 'dim'],
        seventhQualities: ['mMaj7', 'm7b5', 'maj7sharp5', 'm7', '7', 'maj7', 'dim7'],
        roman3: ['Im', 'II°', 'IIIaug', 'IVm', 'V', 'VI', 'VII°'],
        roman7: ['ImM7', 'IIm7♭5', 'IIIM7♯5', 'IVm7', 'V7', 'VIM7', 'VII°7']
    },
    'melodic-minor': {
        label: 'メロディックマイナー',
        rootIntervals: [0, 2, 3, 5, 7, 9, 11],
        degreeLabels: ['1', '2', '♭3', '4', '5', '6', '7'],
        triadQualities: ['m', 'm', 'aug', 'maj', 'maj', 'dim', 'dim'],
        seventhQualities: ['mMaj7', 'm7', 'maj7sharp5', '7', '7', 'm7b5', 'm7b5'],
        roman3: ['Im', 'IIm', 'IIIaug', 'IV', 'V', 'VI°', 'VII°'],
        roman7: ['ImM7', 'IIm7', 'IIIM7♯5', 'IV7', 'V7', 'VIm7♭5', 'VIIm7♭5']
    }
};

assert.deepStrictEqual(Object.keys(theory.SCALES), SCALE_IDS, 'core exposes the fixed nine-scale definition');
assert.deepStrictEqual(Object.keys(theory.DIATONIC), SCALE_IDS, 'DIATONIC must expose the same nine scale IDs');
var qualityTheory = {};
Object.keys(theory.QUALITIES).forEach(function (qualityKey) {
    var quality = theory.QUALITIES[qualityKey];
    qualityTheory[qualityKey] = {
        suffix: quality.suffix,
        symbolSuffix: quality.symbolSuffix,
        romanSuffix: quality.romanSuffix,
        intervals: quality.intervals,
        degreeLabels: quality.degreeLabels
    };
});
assert.deepStrictEqual(qualityTheory, EXPECTED_QUALITIES, 'core retains the fixed twenty-five theoretical-quality fields including Major and Minor sixth overlays');

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

assert.strictEqual(comparisonCount, 1512, 'must compare all 12 tonics × 9 scales × 2 chord sizes × 7 degrees');
assert.deepStrictEqual(
    Object.keys(generatedQualityKeys).sort(),
    Object.keys(EXPECTED_QUALITIES).filter(function (qualityKey) { return qualityKey !== '6' && qualityKey !== 'm6' && qualityKey !== 'sus4' && qualityKey !== '7sus4' && qualityKey !== 'M7sus4' && qualityKey !== 'power5' && qualityKey !== 'no5' && qualityKey !== '7no3' && qualityKey !== 'maj7no3' && qualityKey !== '7no5' && qualityKey !== 'maj7no5' && qualityKey !== 'm7no5' && qualityKey !== '7b5' && qualityKey !== 'maj7b5'; }).sort(),
    'nine core scales must retain their eleven diatonic qualities'
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

var phaseCStructureCount = 0;
['harmonic-minor', 'melodic-minor'].forEach(function (mode) {
    ['3', '7'].forEach(function (toneMode) {
        for (var tonicPc = 0; tonicPc < 12; tonicPc += 1) {
            theory.getDiatonicChords(tonicPc, mode, toneMode).forEach(function (chord, degreeIndex) {
                assert.deepStrictEqual(chord, theory.getDiatonicChords(tonicPc, mode, toneMode)[degreeIndex]);
                phaseCStructureCount += 1;
            });
        }
    });
});
assert.strictEqual(phaseCStructureCount, 336, 'Phase C adds 336 fixed Harmonic/Melodic Minor structures');

// 生成されるqualityは全CAGED型の正式対応集合に含まれる。
Object.keys(generatedQualityKeys).forEach(function (qualityKey) {
    caged.SHAPE_ORDER.forEach(function (shapeKey) {
        assert(caged.FORMS[shapeKey].qualities[qualityKey], shapeKey + ' shape must support ' + qualityKey);
    });
});

['harmonic-minor', 'melodic-minor'].forEach(function (mode) {
    ['3', '7'].forEach(function (toneMode) {
        theory.getDiatonicChords(9, mode, toneMode).forEach(function (chord) {
            caged.SHAPE_ORDER.forEach(function (shapeKey) {
                var form = caged.getForm(shapeKey, chord.qualityKey, chord.rootPc, 13, 0);
                assert.strictEqual(form.available, true, mode + '/' + toneMode + '/' + chord.symbol + '/' + shapeKey + ' has a CAGED form');
                assert(form.notes.length > 0, mode + '/' + toneMode + '/' + chord.symbol + '/' + shapeKey + ' retains form notes');
            });
        });
    });
});

console.log(
    'diatonic-scales: 9 scales match ' + comparisonCount +
    ' fixed structure cases; Major/Minor retain ' + majorMinorStructureCount +
    ' v0.22.0 structures; Phase C adds ' + phaseCStructureCount
);
