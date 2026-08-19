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
var expected = {
    '7no5': {
        sourceQuality: '7', intervals: [0, 4, 10], degreeLabels: ['1', '3', '♭7'],
        symbol: 'C7(no5)', spec: { rootPc: 0, third: 4, fifth: null, seventh: 10, tensions: [] },
        tabs: { C: ['x', '3', '2', '3', '1', 'x'], A: ['x', '3', 'x', '3', '5', 'x'], G: ['8', '7', 'x', '5', '5', '6'], E: ['8', 'x', '8', '9', 'x', '8'], D: ['x', 'x', '10', 'x', '11', '12'] },
        labels: ['C', 'E', 'B♭']
    },
    m7no5: {
        sourceQuality: 'm7', intervals: [0, 3, 10], degreeLabels: ['1', '♭3', '♭7'],
        symbol: 'Cm7(no5)', spec: { rootPc: 0, third: 3, fifth: null, seventh: 10, tensions: [] },
        tabs: { C: ['x', '3', '1', '3', '1', 'x'], A: ['x', '3', 'x', '3', '4', 'x'], G: ['8', '6', 'x', '5', '4', '6'], E: ['8', 'x', '8', '8', 'x', '8'], D: ['x', 'x', '10', 'x', '11', '11'] },
        labels: ['C', 'E♭', 'B♭']
    }
};

Object.keys(expected).forEach(function (qualityKey) {
    var fixture = expected[qualityKey];
    assert.deepStrictEqual(theory.QUALITIES[qualityKey].intervals, fixture.intervals, qualityKey + ' intervals');
    assert.deepStrictEqual(theory.QUALITIES[qualityKey].degreeLabels, fixture.degreeLabels, qualityKey + ' degree labels');
    assert.strictEqual(theory.identifyQuality(fixture.intervals), qualityKey, qualityKey + ' recognition');
    assert.strictEqual(theory.chordSymbol(0, qualityKey, false), fixture.symbol, qualityKey + ' C symbol');

    var chord = model.buildCustomChord(fixture.spec, '');
    assert.strictEqual(chord.symbol, fixture.symbol, qualityKey + ' generated symbol');
    assert.strictEqual(chord.qualityKey, qualityKey, qualityKey + ' enters the CAGED quality set');
    assert.deepStrictEqual(chord.coreIntervals, fixture.intervals, qualityKey + ' core intervals');
    assert.deepStrictEqual(chord.degreeLabelsList, fixture.degreeLabels, qualityKey + ' degree labels');

    shapes.forEach(function (shape) {
        var source = caged.FORMS[shape].qualities[fixture.sourceQuality];
        var def = caged.FORMS[shape].qualities[qualityKey];
        assert(def, shape + '/' + qualityKey + ' fixed definition');
        assert.deepStrictEqual(def.fingers, {}, shape + '/' + qualityKey + ' has no inferred fingers');
        assert.strictEqual(def.fingeringStatus, 'undefined', shape + '/' + qualityKey + ' marks fingering as undefined');
        assert.strictEqual(def.slots.some(function (slot) { return slot.iv === 7; }), false, shape + '/' + qualityKey + ' removes every fifth');
        [0, 10].forEach(function (interval) {
            assert(def.slots.some(function (slot) { return slot.iv === interval; }), shape + '/' + qualityKey + ' retains interval ' + interval);
        });
        assert(def.slots.some(function (slot) { return slot.iv === (qualityKey === '7no5' ? 4 : 3); }), shape + '/' + qualityKey + ' retains its third');
        source.slots.filter(function (slot) { return slot.iv !== 7; }).forEach(function (slot) {
            assert(def.slots.some(function (candidate) {
                return candidate.s === slot.s && candidate.o === slot.o && candidate.iv === slot.iv;
            }), shape + '/' + qualityKey + ' retains source string ' + slot.s);
        });

        [{ start: 0, end: 13 }, { start: 12, end: 25 }].forEach(function (range) {
            for (var rootPc = 0; rootPc < 12; rootPc += 1) {
                var form = caged.getForm(shape, qualityKey, rootPc, range.end, range.start);
                assert.strictEqual(form.available, true, shape + '/' + qualityKey + ' is available for root ' + rootPc);
                assert.strictEqual(form.fingeringStatus, 'undefined', shape + '/' + qualityKey + ' exposes undefined fingering');
                form.notes.forEach(function (note) {
                    assert.strictEqual((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, (rootPc + note.interval) % 12, shape + '/' + qualityKey + ' pitch matches interval');
                    assert.notStrictEqual(note.interval, 7, shape + '/' + qualityKey + ' never displays a fifth');
                    assert.strictEqual(note.fingeringWarning, false, shape + '/' + qualityKey + ' keeps undefined fingers distinct from warnings');
                });
            }
        });

        var cForm = caged.getForm(shape, qualityKey, 0, 13, 0);
        var tab = [6, 5, 4, 3, 2, 1].map(function (stringNum) {
            var note = cForm.notes.filter(function (candidate) { return candidate.string === stringNum; })[0];
            return note ? String(note.fret) : 'x';
        });
        assert.deepStrictEqual(tab, fixture.tabs[shape], shape + '/' + qualityKey + ' C-root fixed FORM');
    });

    var exportForm = caged.getForm('E', qualityKey, 0, 13, 0);
    var diagram = {
        frets: [8, 9, 10],
        markers: exportForm.notes.map(function (note) {
            var label = note.interval === 0 ? 'C' : (note.interval === 10 ? 'B♭' : fixture.labels[1]);
            var role = note.interval === 0 ? 'root' : (note.interval === 10 ? 'seventh' : 'third');
            return { string: note.string, fret: note.fret, label: label, role: role };
        }),
        barres: caged.detectBarres(exportForm.notes), mutedStrings: exportForm.mutedStrings
    };
    var staticSvg = fretboard.buildStaticSvg(diagram);
    var pngSvg = fretboard.buildExportSvg(fixture.symbol, diagram).svg;
    fixture.labels.forEach(function (label) {
        assert(staticSvg.indexOf('>' + label + '</text>') !== -1, qualityKey + ' static SVG keeps ' + label);
        assert(pngSvg.indexOf('>' + label + '</text>') !== -1, qualityKey + ' PNG SVG keeps ' + label);
    });
});

var storedValues = {};
window.localStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(storedValues, key) ? storedValues[key] : null; },
    setItem: function (key, value) { storedValues[key] = String(value); },
    removeItem: function (key) { delete storedValues[key]; }
};
require('../js/core/storage.js');
var storage = window.ChordCruise.storage;
Object.keys(expected).forEach(function (qualityKey) {
    var fixture = expected[qualityKey];
    var form = caged.getForm('E', qualityKey, 0, 13, 0);
    var saved = storage.saveChord({
        chordName: fixture.symbol, formName: 'E型', shape: 'E', qualityKey: qualityKey, rootPc: 0,
        intervals: fixture.intervals, fretRange: form.fretRange,
        notes: form.notes.map(function (note) {
            return { string: note.string, fret: note.fret, interval: note.interval, finger: note.finger, fingeringWarning: note.fingeringWarning };
        }),
        mutedStrings: form.mutedStrings, folderId: 'folder_uncategorized'
    });
    assert(saved, qualityKey + ' saves through the existing schema-1 transaction');
    var reloaded = storage.loadChord(saved.id);
    assert.strictEqual(reloaded.schemaVersion, 1, qualityKey + ' keeps schemaVersion 1');
    assert.strictEqual(reloaded.qualityKey, qualityKey, qualityKey + ' reloads its CAGED quality');
    assert.deepStrictEqual(reloaded.intervals, fixture.intervals, qualityKey + ' reloads its intervals');
});
assert.deepStrictEqual(storage.loadChordIndex().map(function (entry) { return entry.chordName; }).sort(), ['C7(no5)', 'Cm7(no5)'], 'both seventh no5 forms enter the existing library index');

console.log('no5-seventh-caged: 7no5/m7no5 qualities, 10 fixed FORM candidates, undefined fingering, 240 range scenarios, save/reload/library, and export labels OK');
