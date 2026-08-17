'use strict';

var assert = require('assert');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/chord-model.js');
require('../js/ui/fretboard.js');

var theory = window.ChordCruise.theory;
var chordModel = window.ChordCruise.chordModel;
var fretboard = window.ChordCruise.ui.fretboard;
var SCALE_IDS = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'];
var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/* 実装から生成しない、現行12トニック（pitch class 0〜11）×7scaleの固定期待値。 */
var EXPECTED_SCALE_NAMES = {
    major: [
        'C D E F G A B',
        'D♭ E♭ F G♭ A♭ B♭ C',
        'D E F♯ G A B C♯',
        'E♭ F G A♭ B♭ C D',
        'E F♯ G♯ A B C♯ D♯',
        'F G A B♭ C D E',
        'F♯ G♯ A♯ B C♯ D♯ E♯',
        'G A B C D E F♯',
        'A♭ B♭ C D♭ E♭ F G',
        'A B C♯ D E F♯ G♯',
        'B♭ C D E♭ F G A',
        'B C♯ D♯ E F♯ G♯ A♯'
    ],
    dorian: [
        'C D E♭ F G A B♭',
        'D♭ E♭ F♭ G♭ A♭ B♭ C♭',
        'D E F G A B C',
        'E♭ F G♭ A♭ B♭ C D♭',
        'E F♯ G A B C♯ D',
        'F G A♭ B♭ C D E♭',
        'F♯ G♯ A B C♯ D♯ E',
        'G A B♭ C D E F',
        'A♭ B♭ C♭ D♭ E♭ F G♭',
        'A B C D E F♯ G',
        'B♭ C D♭ E♭ F G A♭',
        'B C♯ D E F♯ G♯ A'
    ],
    phrygian: [
        'C D♭ E♭ F G A♭ B♭',
        'D♭ E♭♭ F♭ G♭ A♭ B♭♭ C♭',
        'D E♭ F G A B♭ C',
        'E♭ F♭ G♭ A♭ B♭ C♭ D♭',
        'E F G A B C D',
        'F G♭ A♭ B♭ C D♭ E♭',
        'F♯ G A B C♯ D E',
        'G A♭ B♭ C D E♭ F',
        'A♭ B♭♭ C♭ D♭ E♭ F♭ G♭',
        'A B♭ C D E F G',
        'B♭ C♭ D♭ E♭ F G♭ A♭',
        'B C D E F♯ G A'
    ],
    lydian: [
        'C D E F♯ G A B',
        'D♭ E♭ F G A♭ B♭ C',
        'D E F♯ G♯ A B C♯',
        'E♭ F G A B♭ C D',
        'E F♯ G♯ A♯ B C♯ D♯',
        'F G A B C D E',
        'F♯ G♯ A♯ B♯ C♯ D♯ E♯',
        'G A B C♯ D E F♯',
        'A♭ B♭ C D E♭ F G',
        'A B C♯ D♯ E F♯ G♯',
        'B♭ C D E F G A',
        'B C♯ D♯ E♯ F♯ G♯ A♯'
    ],
    mixolydian: [
        'C D E F G A B♭',
        'D♭ E♭ F G♭ A♭ B♭ C♭',
        'D E F♯ G A B C',
        'E♭ F G A♭ B♭ C D♭',
        'E F♯ G♯ A B C♯ D',
        'F G A B♭ C D E♭',
        'F♯ G♯ A♯ B C♯ D♯ E',
        'G A B C D E F',
        'A♭ B♭ C D♭ E♭ F G♭',
        'A B C♯ D E F♯ G',
        'B♭ C D E♭ F G A♭',
        'B C♯ D♯ E F♯ G♯ A'
    ],
    minor: [
        'C D E♭ F G A♭ B♭',
        'C♯ D♯ E F♯ G♯ A B',
        'D E F G A B♭ C',
        'E♭ F G♭ A♭ B♭ C♭ D♭',
        'E F♯ G A B C D',
        'F G A♭ B♭ C D♭ E♭',
        'F♯ G♯ A B C♯ D E',
        'G A B♭ C D E♭ F',
        'G♯ A♯ B C♯ D♯ E F♯',
        'A B C D E F G',
        'B♭ C D♭ E♭ F G♭ A♭',
        'B C♯ D E F♯ G A'
    ],
    locrian: [
        'C D♭ E♭ F G♭ A♭ B♭',
        'D♭ E♭♭ F♭ G♭ A♭♭ B♭♭ C♭',
        'D E♭ F G A♭ B♭ C',
        'E♭ F♭ G♭ A♭ B♭♭ C♭ D♭',
        'E F G A B♭ C D',
        'F G♭ A♭ B♭ C♭ D♭ E♭',
        'F♯ G A B C D E',
        'G A♭ B♭ C D♭ E♭ F',
        'A♭ B♭♭ C♭ D♭ E♭♭ F♭ G♭',
        'A B♭ C D E♭ F G',
        'B♭ C♭ D♭ E♭ F♭ G♭ A♭',
        'B C D E F G A'
    ]
};

var EXPECTED_TONICS = {
    major: ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'],
    minor: ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B']
};
var EXPECTED_TONIC_FAMILY = {
    major: 'major', dorian: 'major', phrygian: 'major', lydian: 'major',
    mixolydian: 'major', minor: 'minor', locrian: 'major'
};
var QUALITY_SUFFIX = {
    maj: '', m: 'm', dim: 'dim', maj7: 'M7', '7': '7', m7: 'm7', m7b5: 'm7♭5'
};

assert.deepStrictEqual(theory.parseSpelledNoteName('C'), { letter: 'C', accidental: 0, pc: 0, name: 'C' });
assert.deepStrictEqual(theory.parseSpelledNoteName('F♯'), { letter: 'F', accidental: 1, pc: 6, name: 'F♯' });
assert.deepStrictEqual(theory.parseSpelledNoteName('B♭'), { letter: 'B', accidental: -1, pc: 10, name: 'B♭' });
assert.deepStrictEqual(theory.parseSpelledNoteName('F##'), { letter: 'F', accidental: 2, pc: 7, name: 'F♯♯' });
assert.deepStrictEqual(theory.parseSpelledNoteName('Bbb'), { letter: 'B', accidental: -2, pc: 9, name: 'B♭♭' });
assert.strictEqual(theory.parseSpelledNoteName('H'), null);
assert.strictEqual(theory.formatAccidental(0), '');
assert.strictEqual(theory.formatAccidental(2), '♯♯');
assert.strictEqual(theory.formatAccidental(-2), '♭♭');

var scaleFixtureCount = 0;
var rootFixtureCount = 0;
var chordSpellingCount = 0;
var unchangedLegacyScaleCount = 0;
var doubleAccidentalScales = [];

SCALE_IDS.forEach(function (scaleId) {
    var family = EXPECTED_TONIC_FAMILY[scaleId];
    assert.strictEqual(theory.SCALES[scaleId].tonicFamily, family, scaleId + ' tonic family');
    for (var tonicPc = 0; tonicPc < 12; tonicPc += 1) {
        var expectedNames = EXPECTED_SCALE_NAMES[scaleId][tonicPc].split(' ');
        var actual = theory.spellScaleNotes({ tonicPc: tonicPc, scaleId: scaleId });
        var repeated = theory.spellScaleNotes({ tonicPc: tonicPc, scaleId: scaleId });
        var expectedTonic = EXPECTED_TONICS[family][tonicPc];

        assert.strictEqual(theory.tonicNameFor(tonicPc, scaleId), expectedTonic, scaleId + '/' + tonicPc + ' tonic');
        assert.deepStrictEqual(repeated, actual, scaleId + '/' + tonicPc + ' deterministic');
        assert.deepStrictEqual(actual.map(function (note) { return note.name; }), expectedNames, scaleId + '/' + tonicPc);
        assert.strictEqual(new Set(actual.map(function (note) { return note.letter; })).size, 7, scaleId + '/' + tonicPc + ' unique letters');

        var tonicLetterIndex = LETTERS.indexOf(actual[0].letter);
        actual.forEach(function (note, degreeIndex) {
            assert.strictEqual(note.degreeIndex, degreeIndex);
            assert.strictEqual(note.degreeLabel, theory.SCALES[scaleId].degreeLabels[degreeIndex]);
            assert.strictEqual(note.letter, LETTERS[(tonicLetterIndex + degreeIndex) % 7]);
            assert.strictEqual(note.pc, (tonicPc + theory.SCALES[scaleId].intervals[degreeIndex]) % 12);
            assert.strictEqual(theory.parseSpelledNoteName(note.name).pc, note.pc);
        });

        var legacyNames = theory.SCALES[scaleId].intervals.map(function (interval) {
            return theory.noteName((tonicPc + interval) % 12, theory.keyUsesFlats(tonicPc, scaleId));
        });
        if (legacyNames.join(' ') === expectedNames.join(' ')) unchangedLegacyScaleCount += 1;
        if (expectedNames.some(function (name) { return /♯♯|♭♭/.test(name); })) {
            doubleAccidentalScales.push(scaleId + ':' + tonicPc);
        }

        var triads = theory.getDiatonicChords(tonicPc, scaleId, '3');
        var sevenths = theory.getDiatonicChords(tonicPc, scaleId, '7');
        triads.forEach(function (chord, degreeIndex) {
            assert.strictEqual(chord.rootName, expectedNames[degreeIndex]);
            var expectedSuffix = chord.qualityKey === 'dim' ? 'm♭5' : QUALITY_SUFFIX[chord.qualityKey];
            assert.strictEqual(chord.symbol, chord.rootName + expectedSuffix);
            assert.deepStrictEqual(chord.noteNames, [0, 2, 4].map(function (offset) {
                return expectedNames[(degreeIndex + offset) % 7];
            }));
            rootFixtureCount += 1;
            chordSpellingCount += 1;
        });
        sevenths.forEach(function (chord, degreeIndex) {
            assert.strictEqual(chord.rootName, expectedNames[degreeIndex]);
            assert.strictEqual(chord.symbol, chord.rootName + QUALITY_SUFFIX[chord.qualityKey]);
            assert.deepStrictEqual(chord.noteNames, [0, 2, 4, 6].map(function (offset) {
                return expectedNames[(degreeIndex + offset) % 7];
            }));
            chordSpellingCount += 1;
        });

        scaleFixtureCount += 1;
    }
});

assert.strictEqual(scaleFixtureCount, 84, '12 tonics × 7 scales');
assert.strictEqual(rootFixtureCount, 588, '84 scales × 7 chord roots');
assert.strictEqual(chordSpellingCount, 1176, '84 scales × 7 degrees × triad/seventh');
assert.strictEqual(unchangedLegacyScaleCount, 56, '56 scale spellings remain equal to v0.22.0');
assert.deepStrictEqual(doubleAccidentalScales, [
    'phrygian:1', 'phrygian:8', 'locrian:1', 'locrian:3', 'locrian:8'
]);

assert.deepStrictEqual(
    theory.getDiatonicChords(6, 'major', '3')[6].noteNames,
    ['E♯', 'G♯', 'B']
);
assert.strictEqual(theory.getDiatonicChords(6, 'major', '3')[6].symbol, 'E♯m♭5');
assert.deepStrictEqual(theory.getDiatonicChords(0, 'locrian', '7')[4].noteNames, ['G♭', 'B♭', 'D♭', 'F']);

var harmonicMinor = {
    id: 'harmonic-minor-test-only',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    degreeLabels: ['1', '2', '♭3', '4', '5', '♭6', '7']
};
var melodicMinor = {
    id: 'melodic-minor-test-only',
    intervals: [0, 2, 3, 5, 7, 9, 11],
    degreeLabels: ['1', '2', '♭3', '4', '5', '6', '7']
};
function syntheticNames(tonicPc, tonicName, scale) {
    return theory.spellScaleNotes({ tonicPc: tonicPc, tonicName: tonicName, scale: scale })
        .map(function (note) { return note.name; });
}
assert.deepStrictEqual(syntheticNames(9, 'A', harmonicMinor), 'A B C D E F G♯'.split(' '));
assert.deepStrictEqual(syntheticNames(9, 'A', melodicMinor), 'A B C D E F♯ G♯'.split(' '));
assert.deepStrictEqual(syntheticNames(6, 'F♯', harmonicMinor), 'F♯ G♯ A B C♯ D E♯'.split(' '));
assert.deepStrictEqual(syntheticNames(8, 'G♯', harmonicMinor), 'G♯ A♯ B C♯ D♯ E F♯♯'.split(' '));
assert.strictEqual(Object.prototype.hasOwnProperty.call(theory.SCALES, 'harmonic-minor'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(theory.SCALES, 'melodic-minor'), false);

var customCases = [
    [{ rootPc: 1, third: 4, fifth: 7, seventh: null, tensions: [] }, 'C♯'],
    [{ rootPc: 3, third: 3, fifth: 7, seventh: null, tensions: [] }, 'E♭m'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 10, tensions: [] }, 'C7'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 11, tensions: [] }, 'CM7'],
    [{ rootPc: 0, third: 3, fifth: 7, seventh: 10, tensions: [] }, 'Cm7'],
    [{ rootPc: 0, third: 3, fifth: 6, seventh: null, tensions: [] }, 'Cdim'],
    [{ rootPc: 0, third: 3, fifth: 6, seventh: 10, tensions: [] }, 'Cm7♭5'],
    [{ rootPc: 0, third: 4, fifth: 8, seventh: null, tensions: [] }, 'Caug']
];
customCases.forEach(function (fixture) {
    var chord = chordModel.buildCustomChord(fixture[0], '');
    assert.strictEqual(chord.symbol, fixture[1]);
    assert.strictEqual(chord.source, 'custom');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(chord, 'noteNames'), false);
});

assert.strictEqual(theory.diatonicNoteNamesForContext(null, 0, [0, 4, 7]), null);
assert.deepStrictEqual(
    theory.diatonicNoteNamesForContext({ tonicPc: 6, mode: 'major' }, 5, [0, 3, 6]),
    ['E♯', 'G♯', 'B']
);

var accidentalMarkers = [
    { string: 1, fret: 1, interval: 0, role: 'root', label: 'E♯' },
    { string: 2, fret: 2, interval: 4, role: 'third', label: 'C♭' },
    { string: 3, fret: 3, interval: 7, role: 'fifth', label: 'F♯♯' },
    { string: 4, fret: 4, interval: 10, role: 'seventh', label: 'B♭♭' }
];
var markerSvg = fretboard.buildStaticSvg({ frets: [1, 2, 3, 4], markers: accidentalMarkers });
var exportSvg = fretboard.buildExportSvg('F♯♯M7', {
    frets: [1, 2, 3, 4],
    markers: accidentalMarkers,
    chordNameSize: 'medium',
    markerLabelScale: fretboard.markerLabelScaleForSize('xlarge')
}).svg;
['E♯', 'C♭', 'F♯♯', 'B♭♭'].forEach(function (label) {
    assert(markerSvg.indexOf('>' + label + '</text>') !== -1, label + ' static SVG label');
    assert(exportSvg.indexOf('>' + label + '</text>') !== -1, label + ' export SVG label');
});
assert(markerSvg.indexOf('𝄪') === -1 && markerSvg.indexOf('𝄫') === -1, 'no supplementary accidental glyphs');
assert(markerSvg.indexOf('font-size:10px') !== -1, 'three-character accidental labels use the compact SVG size');
assert(exportSvg.indexOf('font-size:12.5px') !== -1, 'xlarge export sizing remains bounded for three-character labels');

console.log(
    'scale-spelling: ' + scaleFixtureCount + ' fixed scales, ' + rootFixtureCount +
    ' roots, ' + chordSpellingCount + ' chord spellings OK; 56 unchanged / 28 corrected'
);
