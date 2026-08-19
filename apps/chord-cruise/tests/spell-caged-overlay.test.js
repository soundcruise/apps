'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/chord-model.js');
require('../js/core/caged-forms.js');

var theory = window.ChordCruise.theory;
var chordModel = window.ChordCruise.chordModel;
var caged = window.ChordCruise.caged;
var root = path.resolve(__dirname, '..');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
var saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');

function spellChord(chord) {
    return theory.spellChordNotes({
        rootPc: chord.rootPc,
        rootName: chordModel.CUSTOM_ROOT_NAMES[chord.rootPc],
        qualityKey: chord.qualityKey,
        intervals: chord.intervals,
        degreeLabels: chord.degreeLabelsList,
        keyContext: null
    });
}

[
    [{ rootPc: 0, third: 3, fifth: 7, seventh: null, tensions: [] }, 'm', ['C', 'E♭', 'G'], 'Cm'],
    [{ rootPc: 0, third: 3, fifth: 7, seventh: 10, tensions: [] }, 'm7', ['C', 'E♭', 'G', 'B♭'], 'Cm7'],
    [{ rootPc: 0, third: 3, fifth: 6, seventh: 10, tensions: [] }, 'm7b5', ['C', 'E♭', 'G♭', 'B♭'], 'Cm7♭5'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 10, tensions: [] }, '7', ['C', 'E', 'G', 'B♭'], 'C7'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 11, tensions: [] }, 'maj7', ['C', 'E', 'G', 'B'], 'CM7']
].forEach(function (fixture) {
    var chord = chordModel.buildCustomChord(fixture[0], '');
    var names = spellChord(chord);
    assert.deepStrictEqual(names, fixture[2], fixture[3] + ' CDE spelling');
    ['C', 'A', 'G', 'E', 'D'].forEach(function (shape) {
        var form = caged.getForm(shape, fixture[1], 0, 13, 0);
        assert.strictEqual(form.available, true, fixture[3] + ' ' + shape + ' form is available');
        form.notes.forEach(function (note) {
            var index = chord.intervals.indexOf(note.interval);
            assert(index !== -1, fixture[3] + ' ' + shape + ' marker interval remains in chord');
            assert(names.indexOf(names[index]) !== -1, fixture[3] + ' ' + shape + ' marker resolves through spelling');
        });
    });
    assert.strictEqual(names.map(theory.solfegeNameForSpelling).length, chord.degreeLabelsList.length, fixture[3] + ' solfege and degree remain aligned');
});

[
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 9, tensions: [] }, '6', 'C6'],
    [{ rootPc: 0, third: 3, fifth: 7, seventh: 9, tensions: [] }, 'm6', 'Cm6']
].forEach(function (fixture) {
    var chord = chordModel.buildCustomChord(fixture[0], '');
    var names = spellChord(chord);
    var sixthIndex = chord.intervals.indexOf(9);
    var overlays = chordModel.sixthOverlayNotes({ rootPc: 0, startFret: 0, endFret: 13 });
    assert.strictEqual(names[sixthIndex], 'A', fixture[2] + ' sixth CDE label');
    assert.strictEqual(theory.solfegeNameForSpelling(names[sixthIndex]), 'ラ', fixture[2] + ' sixth solfege label');
    assert(overlays.length > 0, fixture[2] + ' has sixth candidates');
    overlays.forEach(function (overlay) {
        assert.strictEqual(overlay.interval, 9, fixture[2] + ' preserves interval 9');
        assert.strictEqual(overlay.degreeLabel, '6', fixture[2] + ' preserves degree 6');
        assert.strictEqual(overlay.overlayType, 'sixth', fixture[2] + ' preserves sixth role source');
    });
});

[
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 10, tensions: [14] }, 'D', '9', 'C7(9)', ['C', 'E', 'G', 'B♭', 'D']],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: null, tensions: [14] }, 'D', '9', 'Cadd9', ['C', 'E', 'G', 'D']],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 10, tensions: [17] }, 'F', '11', 'C11', ['C', 'E', 'G', 'B♭', 'F']],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 10, tensions: [21] }, 'A', '13', 'C13', ['C', 'E', 'G', 'B♭', 'A']]
].forEach(function (fixture) {
    var chord = chordModel.buildCustomChord(fixture[0], '');
    var names = spellChord(chord);
    var tension = fixture[0].tensions[0];
    var interval = tension % 12;
    var index = chord.intervals.indexOf(interval);
    var overlays = chordModel.tensionOverlayNotes({ rootPc: 0, tensionIntervals: [tension], startFret: 0, endFret: 13 });
    assert.deepStrictEqual(names, fixture[4], fixture[3] + ' full CDE spelling');
    assert.strictEqual(names[index], fixture[1], fixture[3] + ' tension CDE label');
    assert.strictEqual(chord.degreeLabelsList[index], fixture[2], fixture[3] + ' tension degree remains unchanged');
    assert(overlays.length > 0, fixture[3] + ' has tension candidates');
    overlays.forEach(function (overlay) {
        assert.strictEqual(overlay.interval, interval, fixture[3] + ' tension interval remains unchanged');
        assert.strictEqual(overlay.overlayType, 'tension', fixture[3] + ' tension overlay type remains unchanged');
    });
});

assert(exploreSource.includes('function chordSpelledNoteNames'), 'Explore computes spelling for CAGED and overlay labels');
assert(exploreSource.includes('markerLabelFor(chord, pc, note.interval'), 'Explore supplies spelling to CAGED markers');
assert(exploreSource.includes('tensionOverlayMarkerLabel(chord, overlay'), 'Explore supplies spelling to tension overlays');
assert(exploreSource.includes("role: 'sixth'"), 'Explore keeps the dedicated sixth role');
assert(saveEditorSource.includes('mergeTensionOverlay(markers, spelledNoteNames)'), 'save-editor supplies spelling to tension overlays');
assert(saveEditorSource.includes('solfegeNameForSpelling(spelled)'), 'save-editor uses the same spelling for overlay solfege');

console.log('spell-caged-overlay: CAGED, sixth, and tension labels use degree-based spelling without changing marker semantics OK');
