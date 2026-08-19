'use strict';

var assert = require('assert');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/chord-model.js');
require('../js/core/caged-forms.js');
require('../js/ui/fretboard.js');

var theory = window.ChordCruise.theory;
var model = window.ChordCruise.chordModel;
var caged = window.ChordCruise.caged;
var fretboard = window.ChordCruise.ui.fretboard;
var shapes = ['C', 'A', 'G', 'E', 'D'];
var fixture = {
    intervals: [0, 4, 11],
    degreeLabels: ['1', '3', '7'],
    symbol: 'CM7(no5)',
    spec: { rootPc: 0, third: 4, fifth: null, seventh: 11, tensions: [] },
    tabs: { C: ['x', '3', '2', 'x', '0', '0'], A: ['x', '3', 'x', '4', '5', 'x'], G: ['8', '7', 'x', '5', '5', '7'], E: ['8', 'x', '9', '9', 'x', '8'], D: ['x', 'x', '10', 'x', '12', '12'] },
    labels: ['C', 'E', 'B']
};

assert.deepStrictEqual(theory.QUALITIES.maj7no5, {
    suffix: 'M7(no5)', symbolSuffix: 'M7(no5)', romanSuffix: 'M7(no5)',
    intervals: fixture.intervals, degreeLabels: fixture.degreeLabels
}, 'maj7no5 quality metadata');
assert.strictEqual(theory.identifyQuality(fixture.intervals), 'maj7no5', 'maj7no5 recognition');
assert.strictEqual(theory.chordSymbol(0, 'maj7no5', false), fixture.symbol, 'maj7no5 C symbol');

var chord = model.buildCustomChord(fixture.spec, '');
assert.strictEqual(chord.symbol, fixture.symbol, 'custom builder keeps the existing CM7(no5) name');
assert.strictEqual(chord.qualityKey, 'maj7no5', 'CM7(no5) enters the CAGED quality set');
assert.deepStrictEqual(chord.coreIntervals, fixture.intervals, 'CM7(no5) core intervals');
assert.deepStrictEqual(chord.degreeLabelsList, fixture.degreeLabels, 'CM7(no5) degree labels');

shapes.forEach(function (shape) {
    var source = caged.FORMS[shape].qualities.maj7;
    var def = caged.FORMS[shape].qualities.maj7no5;
    assert(def, shape + '/maj7no5 fixed definition');
    assert.deepStrictEqual(def.fingers, {}, shape + '/maj7no5 has no inferred fingers');
    assert.strictEqual(def.fingeringStatus, 'undefined', shape + '/maj7no5 marks fingering as undefined');
    assert.strictEqual(def.slots.some(function (slot) { return slot.iv === 7; }), false, shape + '/maj7no5 removes every fifth');
    [0, 4, 11].forEach(function (interval) {
        assert(def.slots.some(function (slot) { return slot.iv === interval; }), shape + '/maj7no5 retains interval ' + interval);
    });
    source.slots.filter(function (slot) { return slot.iv !== 7; }).forEach(function (slot) {
        assert(def.slots.some(function (candidate) {
            return candidate.s === slot.s && candidate.o === slot.o && candidate.iv === slot.iv;
        }), shape + '/maj7no5 retains source string ' + slot.s);
    });

    [{ start: 0, end: 13 }, { start: 12, end: 25 }].forEach(function (range) {
        for (var rootPc = 0; rootPc < 12; rootPc += 1) {
            var form = caged.getForm(shape, 'maj7no5', rootPc, range.end, range.start);
            assert.strictEqual(form.available, true, shape + '/maj7no5 is available for root ' + rootPc);
            assert.strictEqual(form.fingeringStatus, 'undefined', shape + '/maj7no5 exposes undefined fingering');
            form.notes.forEach(function (note) {
                assert.strictEqual((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, (rootPc + note.interval) % 12, shape + '/maj7no5 pitch matches interval');
                assert.notStrictEqual(note.interval, 7, shape + '/maj7no5 never displays a fifth');
                assert.strictEqual(note.fingeringWarning, false, shape + '/maj7no5 keeps undefined fingers distinct from warnings');
            });
        }
    });

    var cForm = caged.getForm(shape, 'maj7no5', 0, 13, 0);
    var tab = [6, 5, 4, 3, 2, 1].map(function (stringNum) {
        var note = cForm.notes.filter(function (candidate) { return candidate.string === stringNum; })[0];
        return note ? String(note.fret) : 'x';
    });
    assert.deepStrictEqual(tab, fixture.tabs[shape], shape + '/maj7no5 C-root fixed FORM');
});

var exportForm = caged.getForm('E', 'maj7no5', 0, 13, 0);
var diagram = {
    frets: [8, 9, 10],
    markers: exportForm.notes.map(function (note) {
        var label = note.interval === 0 ? 'C' : (note.interval === 4 ? 'E' : 'B');
        var role = note.interval === 0 ? 'root' : (note.interval === 4 ? 'third' : 'seventh');
        return { string: note.string, fret: note.fret, label: label, role: role };
    }),
    barres: caged.detectBarres(exportForm.notes), mutedStrings: exportForm.mutedStrings
};
var staticSvg = fretboard.buildStaticSvg(diagram);
var pngSvg = fretboard.buildExportSvg(fixture.symbol, diagram).svg;
fixture.labels.forEach(function (label) {
    assert(staticSvg.indexOf('>' + label + '</text>') !== -1, 'static SVG keeps ' + label);
    assert(pngSvg.indexOf('>' + label + '</text>') !== -1, 'PNG SVG keeps ' + label);
});
assert.strictEqual(staticSvg.indexOf('>G</text>') === -1, true, 'static SVG has no fifth label');

var storedValues = {};
window.localStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(storedValues, key) ? storedValues[key] : null; },
    setItem: function (key, value) { storedValues[key] = String(value); },
    removeItem: function (key) { delete storedValues[key]; }
};
require('../js/core/storage.js');
var storage = window.ChordCruise.storage;
var saved = storage.saveChord({
    chordName: fixture.symbol, formName: 'E型', shape: 'E', qualityKey: 'maj7no5', rootPc: 0,
    intervals: fixture.intervals, fretRange: exportForm.fretRange,
    notes: exportForm.notes.map(function (note) {
        return { string: note.string, fret: note.fret, interval: note.interval, finger: note.finger, fingeringWarning: note.fingeringWarning };
    }),
    mutedStrings: exportForm.mutedStrings, folderId: 'folder_uncategorized'
});
assert(saved, 'CM7(no5) saves through the existing schema-1 transaction');
var reloaded = storage.loadChord(saved.id);
assert.strictEqual(reloaded.schemaVersion, 1, 'CM7(no5) keeps schemaVersion 1');
assert.strictEqual(reloaded.qualityKey, 'maj7no5', 'CM7(no5) reloads its CAGED quality');
assert.deepStrictEqual(reloaded.intervals, fixture.intervals, 'CM7(no5) reloads its intervals');
assert.strictEqual(storage.loadChordIndex()[0].chordName, fixture.symbol, 'CM7(no5) enters the existing library index');

console.log('maj7no5-caged: maj7no5 quality, M7-derived 5 FORM candidates, undefined fingering, 120 range scenarios, save/reload/library, and export labels OK');
