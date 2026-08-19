'use strict';

var assert = require('assert');

global.window = { ChordCruise: { state: { settings: { fretboardDisplayMode: 'note' } } } };
global.document = { addEventListener: function () {} };
require('../js/core/music-theory.js');
require('../js/core/chord-model.js');
require('../js/core/caged-forms.js');
require('../js/ui/fretboard.js');
require('../js/ui/library.js');

var chordModel = window.ChordCruise.chordModel;
var caged = window.ChordCruise.caged;
var fretboard = window.ChordCruise.ui.fretboard;
var savedDiagramOptions = window.ChordCruise.ui.library.savedDiagramOptions;
var theory = window.ChordCruise.theory;

function formNotesFor(chord) {
    var form = caged.getForm('E', chord.qualityKey, chord.rootPc, 13, 0);
    assert.strictEqual(form.available, true, chord.symbol + ' has a library base FORM');
    var notes = form.notes.map(function (note) {
        return { string: note.string, fret: note.fret, interval: note.interval, finger: null, fingeringWarning: false };
    });
    if (chord.qualityKey === '6' || chord.qualityKey === 'm6') {
        var range = form.displayRange || form.fretRange;
        notes = notes.concat(chordModel.sixthOverlayNotes({
            rootPc: chord.rootPc, startFret: range.min, endFret: range.max, targetStrings: [3, 2, 1]
        }).map(function (note) {
            return { string: note.string, fret: note.fret, interval: note.interval, finger: null, fingeringWarning: false };
        }));
    }
    return { form: form, notes: notes };
}

function savedRecord(spec) {
    var chord = chordModel.buildCustomChord(spec, '');
    var formData = formNotesFor(chord);
    return {
        // 旧保存名は表示互換のため残すが、音名綴りの判定には使わない。
        chordName: '旧表示名', formName: 'E型', shape: 'E', rootPc: chord.rootPc,
        qualityKey: chord.qualityKey, intervals: chord.intervals.slice(),
        tensionPcs: chordModel.tensionPcsForIntervals(chord.rootPc, chord.tensionIntervals),
        bassPc: chord.bassPc,
        fretRange: formData.form.fretRange,
        notes: formData.notes,
        mutedStrings: formData.form.mutedStrings
    };
}

function markerLabels(record, mode) {
    return savedDiagramOptions(record, { mode: mode || 'note' }).markers.map(function (marker) { return marker.label; });
}

[
    [{ rootPc: 0, third: 3, fifth: 7, seventh: null, tensions: [] }, ['C', 'E♭', 'G'], 'Cm'],
    [{ rootPc: 0, third: 3, fifth: 7, seventh: 10, tensions: [] }, ['C', 'E♭', 'G', 'B♭'], 'Cm7'],
    [{ rootPc: 0, third: 3, fifth: 6, seventh: 10, tensions: [] }, ['C', 'E♭', 'G♭', 'B♭'], 'Cm7♭5'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 10, tensions: [] }, ['C', 'E', 'G', 'B♭'], 'C7'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 11, tensions: [] }, ['C', 'E', 'G', 'B'], 'CM7'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 9, tensions: [] }, ['C', 'E', 'G', 'A'], 'C6'],
    [{ rootPc: 0, third: 3, fifth: 7, seventh: 9, tensions: [] }, ['C', 'E♭', 'G', 'A'], 'Cm6'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 10, tensions: [14] }, ['C', 'E', 'G', 'B♭', 'D'], 'C7(9)'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: null, tensions: [14] }, ['C', 'E', 'G', 'D'], 'Cadd9']
].forEach(function (fixture) {
    var record = savedRecord(fixture[0]);
    var chord = chordModel.buildCustomChord(fixture[0], '');
    var diagram = savedDiagramOptions(record, { mode: 'note' });
    var staticSvg = fretboard.buildStaticSvg(diagram);
    var pngSvg = fretboard.buildExportSvg(fixture[2], diagram).svg;
    fixture[1].forEach(function (name) {
        assert(markerLabels(record).indexOf(name) !== -1, fixture[2] + ' library uses semantic spelling for ' + name);
        assert(staticSvg.indexOf('>' + name + '</text>') !== -1, fixture[2] + ' SVG uses semantic spelling for ' + name);
        assert(pngSvg.indexOf('>' + name + '</text>') !== -1, fixture[2] + ' PNG source SVG uses semantic spelling for ' + name);
    });
    chord.degreeLabelsList.forEach(function (degree) {
        assert(markerLabels(record, 'degree').indexOf(degree) !== -1, fixture[2] + ' keeps degree ' + degree);
    });
    fixture[1].map(theory.solfegeNameForSpelling).forEach(function (solfege) {
        assert(markerLabels(record, 'solfege').indexOf(solfege) !== -1, fixture[2] + ' library keeps solfege ' + solfege);
    });
});

[
    [{ rootPc: 0, third: 4, fifth: 7, seventh: null, tensions: [], bassPc: 4 }, 'C/E'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 10, tensions: [], bassPc: 4 }, 'C7/E']
].forEach(function (fixture) {
    var record = savedRecord(fixture[0]);
    // Bass overlay is range-scoped just as a real saved record is; include its candidate range here.
    record.fretRange = { min: 0, max: 13, includesOpen: true };
    var diagram = savedDiagramOptions(record, { mode: 'note' });
    assert(diagram.markers.some(function (marker) {
        return marker.isBassCandidate === true && marker.label === 'E';
    }), fixture[1] + ' retains the existing semantic Bass label');
    assert(fretboard.buildExportSvg(fixture[1], diagram).svg.indexOf('>E</text>') !== -1, fixture[1] + ' PNG source retains Bass display');
});

assert(markerLabels(Object.assign({}, savedRecord({ rootPc: 0, third: 3, fifth: 7, seventh: 10, tensions: [] }), {
    qualityKey: undefined
})).indexOf('E♭') !== -1, 'records without qualityKey fall back to intervals without parsing chordName');

var storedValues = {};
window.localStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(storedValues, key) ? storedValues[key] : null; },
    setItem: function (key, value) { storedValues[key] = String(value); },
    removeItem: function (key) { delete storedValues[key]; }
};
require('../js/core/storage.js');
var persisted = savedRecord({ rootPc: 0, third: 3, fifth: 7, seventh: 10, tensions: [] });
persisted.chordName = 'Cm7';
persisted.folderId = 'folder_uncategorized';
var saved = window.ChordCruise.storage.saveChord(persisted);
var reloaded = window.ChordCruise.storage.loadChord(saved.id);
assert.strictEqual(reloaded.schemaVersion, 1, 'spelling integration retains schemaVersion 1');
assert.strictEqual(reloaded.qualityKey, 'm7', 'spelling integration retains qualityKey');
assert.deepStrictEqual(reloaded.intervals, [0, 3, 7, 10], 'spelling integration retains intervals');
assert(markerLabels(reloaded).indexOf('E♭') !== -1 && markerLabels(reloaded).indexOf('B♭') !== -1,
    'reloaded record uses semantic spelling in the library');

console.log('spell-library-export: library, SVG, and PNG use saved semantic chord data for spelling while keeping Bass behavior OK');
