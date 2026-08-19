'use strict';

var assert = require('assert');

global.window = { ChordCruise: { state: { settings: { fretboardDisplayMode: 'note' } } } };
global.document = { addEventListener: function () {} };
require('../js/core/music-theory.js');
require('../js/core/chord-model.js');
require('../js/core/caged-forms.js');
require('../js/ui/fretboard.js');
require('../js/core/storage.js');
require('../js/ui/library.js');

var theory = window.ChordCruise.theory;
var model = window.ChordCruise.chordModel;
var caged = window.ChordCruise.caged;
var storage = window.ChordCruise.storage;
var fretboard = window.ChordCruise.ui.fretboard;
var savedDiagramOptions = window.ChordCruise.ui.library.savedDiagramOptions;
var shapes = ['C', 'A', 'G', 'E', 'D'];
var expectedTabs = {
    C: ['x', '3', '2', '3', '1', '2'],
    A: ['x', '3', '4', '3', '5', '2'],
    G: ['8', '7', '4', '5', '5', '6'],
    E: ['8', '9', '8', '9', '7', '8'],
    D: ['x', 'x', '10', '11', '11', '12']
};
var intervals = [0, 4, 6, 10];
var degreeLabels = ['1', '3', '♭5', '♭7'];

assert.deepStrictEqual(theory.QUALITIES['7b5'].intervals, intervals, '7b5 intervals');
assert.deepStrictEqual(theory.QUALITIES['7b5'].degreeLabels, degreeLabels, '7b5 degree labels');
assert.strictEqual(theory.identifyQuality(intervals), '7b5', '7b5 quality recognition');
assert.strictEqual(theory.chordSymbol(0, '7b5', false), 'C7♭5', '7b5 symbol');

var chord = model.buildCustomChord({ rootPc: 0, third: 4, fifth: 6, seventh: 10, tensions: [] }, '');
assert.strictEqual(chord.symbol, 'C7♭5', 'custom chord uses the 7b5 symbol');
assert.strictEqual(chord.qualityKey, '7b5', 'custom chord enters the CAGED quality set');
assert.deepStrictEqual(chord.coreIntervals, intervals, 'custom chord preserves 7b5 core intervals');
assert.deepStrictEqual(chord.degreeLabelsList, degreeLabels, 'custom chord preserves 7b5 degrees');
assert.deepStrictEqual(theory.spellChordNotes({
    rootPc: chord.rootPc, qualityKey: chord.qualityKey,
    intervals: chord.intervals, degreeLabels: chord.degreeLabelsList
}), ['C', 'E', 'G♭', 'B♭'], 'C7♭5 uses theoretical spelling');

shapes.forEach(function (shape) {
    var source = caged.FORMS[shape].qualities['7'];
    var def = caged.FORMS[shape].qualities['7b5'];
    assert(def, shape + '/7b5 fixed definition exists');
    assert.deepStrictEqual(def.fingers, {}, shape + '/7b5 has no inferred fingers');
    assert.strictEqual(def.fingeringStatus, 'undefined', shape + '/7b5 keeps fingering undefined');
    assert.strictEqual(def.slots.some(function (slot) { return slot.iv === 7; }), false, shape + '/7b5 removes every perfect fifth');
    [0, 4, 6, 10].forEach(function (interval) {
        assert(def.slots.some(function (slot) { return slot.iv === interval; }), shape + '/7b5 retains interval ' + interval);
    });
    source.slots.forEach(function (slot) {
        var expectedInterval = slot.iv === 7 ? 6 : slot.iv;
        var expectedOffset = slot.iv === 7 ? slot.o - 1 : slot.o;
        assert(def.slots.some(function (candidate) {
            return candidate.s === slot.s && candidate.o === expectedOffset && candidate.iv === expectedInterval;
        }), shape + '/7b5 changes only the fifth on string ' + slot.s);
    });

    [{ start: 0, end: 13 }, { start: 12, end: 25 }].forEach(function (range) {
        for (var rootPc = 0; rootPc < 12; rootPc += 1) {
            var form = caged.getForm(shape, '7b5', rootPc, range.end, range.start);
            assert.strictEqual(form.available, true, shape + '/7b5 is available for root ' + rootPc);
            assert.strictEqual(form.fingeringStatus, 'undefined', shape + '/7b5 exposes undefined fingering');
            form.notes.forEach(function (note) {
                assert.strictEqual((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, (rootPc + note.interval) % 12, shape + '/7b5 pitch matches its interval');
                assert.notStrictEqual(note.interval, 7, shape + '/7b5 never displays a perfect fifth');
                assert.strictEqual(note.finger, null, shape + '/7b5 has no inferred finger');
                assert.strictEqual(note.fingeringWarning, false, shape + '/7b5 keeps undefined fingers distinct from warnings');
            });
        }
    });

    var cForm = caged.getForm(shape, '7b5', 0, 13, 0);
    var tab = [6, 5, 4, 3, 2, 1].map(function (stringNum) {
        var note = cForm.notes.filter(function (candidate) { return candidate.string === stringNum; })[0];
        return note ? String(note.fret) : 'x';
    });
    assert.deepStrictEqual(tab, expectedTabs[shape], shape + '/7b5 C-root fixed FORM');
});

var storedValues = {};
window.localStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(storedValues, key) ? storedValues[key] : null; },
    setItem: function (key, value) { storedValues[key] = String(value); },
    removeItem: function (key) { delete storedValues[key]; }
};
var saveForm = caged.getForm('E', '7b5', 0, 13, 0);
var saved = storage.saveChord({
    chordName: 'C7♭5', formName: 'E型', shape: 'E', qualityKey: '7b5', rootPc: 0,
    intervals: intervals, fretRange: saveForm.fretRange,
    notes: saveForm.notes, mutedStrings: saveForm.mutedStrings, folderId: 'folder_uncategorized'
});
assert(saved, '7b5 saves through schema version 1');
var reloaded = storage.loadChord(saved.id);
assert.strictEqual(reloaded.qualityKey, '7b5', '7b5 qualityKey survives reload');
assert.deepStrictEqual(reloaded.intervals, intervals, '7b5 intervals survive reload');
var diagram = savedDiagramOptions(reloaded, { mode: 'note' });
['C', 'E', 'G♭', 'B♭'].forEach(function (label) {
    assert(diagram.markers.some(function (marker) { return marker.label === label; }), 'library diagram keeps ' + label);
    assert(fretboard.buildStaticSvg(diagram).indexOf('>' + label + '</text>') !== -1, 'SVG keeps ' + label);
    assert(fretboard.buildExportSvg('C7♭5', diagram).svg.indexOf('>' + label + '</text>') !== -1, 'PNG source SVG keeps ' + label);
});

console.log('7b5-caged: quality, fixed five-shape altered-fifth forms, spelling, undefined fingering, schema-1 save/reload, library, and export OK');
