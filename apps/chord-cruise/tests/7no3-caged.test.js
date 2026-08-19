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
    C: ['x', '3', 'x', '3', '1', '3'],
    A: ['x', '3', '5', '3', 'x', '3'],
    G: ['8', 'x', '5', '5', 'x', '6'],
    E: ['8', '10', '8', 'x', '8', '8'],
    D: ['x', 'x', '10', '12', '11', 'x']
};
var intervals = [0, 7, 10];
var degreeLabels = ['1', '5', '♭7'];

assert.deepStrictEqual(theory.QUALITIES['7no3'].intervals, intervals, '7no3 intervals');
assert.deepStrictEqual(theory.QUALITIES['7no3'].degreeLabels, degreeLabels, '7no3 degree labels');
assert.strictEqual(theory.identifyQuality(intervals), '7no3', '7no3 quality recognition');
assert.strictEqual(theory.chordSymbol(0, '7no3', false), 'C7(no3)', '7no3 symbol');

var chord = model.buildCustomChord({ rootPc: 0, third: null, fifth: 7, seventh: 10, tensions: [] }, '');
assert.strictEqual(chord.symbol, 'C7(no3)', 'custom chord keeps the C7(no3) name');
assert.strictEqual(chord.qualityKey, '7no3', 'C7(no3) enters the CAGED quality set');
assert.deepStrictEqual(chord.coreIntervals, intervals, 'C7(no3) core intervals');
assert.deepStrictEqual(chord.degreeLabelsList, degreeLabels, 'C7(no3) degree labels');
assert.deepStrictEqual(theory.spellChordNotes({
    rootPc: chord.rootPc, qualityKey: chord.qualityKey,
    intervals: chord.intervals, degreeLabels: chord.degreeLabelsList
}), ['C', 'G', 'B♭'], 'C7(no3) uses theoretical spelling');

shapes.forEach(function (shape) {
    var source = caged.FORMS[shape].qualities['7'];
    var def = caged.FORMS[shape].qualities['7no3'];
    assert(def, shape + '/7no3 fixed definition exists');
    assert.deepStrictEqual(def.fingers, {}, shape + '/7no3 has no inferred fingers');
    assert.strictEqual(def.fingeringStatus, 'undefined', shape + '/7no3 keeps fingering undefined');
    assert.strictEqual(def.slots.some(function (slot) { return slot.iv === 4; }), false, shape + '/7no3 removes every third');
    [0, 7, 10].forEach(function (interval) {
        assert(def.slots.some(function (slot) { return slot.iv === interval; }), shape + '/7no3 retains interval ' + interval);
    });
    source.slots.filter(function (slot) { return slot.iv !== 4; }).forEach(function (slot) {
        assert(def.slots.some(function (candidate) {
            return candidate.s === slot.s && candidate.o === slot.o && candidate.iv === slot.iv;
        }), shape + '/7no3 retains source string ' + slot.s);
    });
    source.slots.filter(function (slot) { return slot.iv === 4; }).forEach(function (slot) {
        assert(def.muted.indexOf(slot.s) !== -1, shape + '/7no3 mutes removed third string ' + slot.s);
    });

    [{ start: 0, end: 13 }, { start: 12, end: 25 }].forEach(function (range) {
        for (var rootPc = 0; rootPc < 12; rootPc += 1) {
            var form = caged.getForm(shape, '7no3', rootPc, range.end, range.start);
            assert.strictEqual(form.available, true, shape + '/7no3 is available for root ' + rootPc);
            assert.strictEqual(form.fingeringStatus, 'undefined', shape + '/7no3 exposes undefined fingering');
            form.notes.forEach(function (note) {
                assert.strictEqual((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, (rootPc + note.interval) % 12, shape + '/7no3 pitch matches its interval');
                assert.notStrictEqual(note.interval, 4, shape + '/7no3 never displays a third');
                assert.strictEqual(note.finger, null, shape + '/7no3 has no inferred finger');
                assert.strictEqual(note.fingeringWarning, false, shape + '/7no3 keeps undefined fingers distinct from warnings');
            });
        }
    });

    var cForm = caged.getForm(shape, '7no3', 0, 13, 0);
    var tab = [6, 5, 4, 3, 2, 1].map(function (stringNum) {
        var note = cForm.notes.filter(function (candidate) { return candidate.string === stringNum; })[0];
        return note ? String(note.fret) : 'x';
    });
    assert.deepStrictEqual(tab, expectedTabs[shape], shape + '/7no3 C-root fixed FORM');
});

var storedValues = {};
window.localStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(storedValues, key) ? storedValues[key] : null; },
    setItem: function (key, value) { storedValues[key] = String(value); },
    removeItem: function (key) { delete storedValues[key]; }
};
var saveForm = caged.getForm('E', '7no3', 0, 13, 0);
var saved = storage.saveChord({
    chordName: 'C7(no3)', formName: 'E型', shape: 'E', qualityKey: '7no3', rootPc: 0,
    intervals: intervals, fretRange: saveForm.fretRange,
    notes: saveForm.notes, mutedStrings: saveForm.mutedStrings, folderId: 'folder_uncategorized'
});
assert(saved, '7no3 saves through schema version 1');
var reloaded = storage.loadChord(saved.id);
assert.strictEqual(reloaded.qualityKey, '7no3', '7no3 qualityKey survives reload');
assert.deepStrictEqual(reloaded.intervals, intervals, '7no3 intervals survive reload');
var diagram = savedDiagramOptions(reloaded, { mode: 'note' });
['C', 'G', 'B♭'].forEach(function (label) {
    assert(diagram.markers.some(function (marker) { return marker.label === label; }), 'library diagram keeps ' + label);
    assert(fretboard.buildStaticSvg(diagram).indexOf('>' + label + '</text>') !== -1, 'SVG keeps ' + label);
    assert(fretboard.buildExportSvg('C7(no3)', diagram).svg.indexOf('>' + label + '</text>') !== -1, 'PNG source SVG keeps ' + label);
});

console.log('7no3-caged: quality, fixed five-shape third-omission forms, spelling, undefined fingering, schema-1 save/reload, library, and export OK');
