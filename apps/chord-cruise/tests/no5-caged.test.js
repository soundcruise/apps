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
    C: { tab: ['x', '3', '2', 'x', '1', '0'], muted: [6, 3], slots: ['5:0/0', '4:-1/4', '2:-2/0', '1:-3/4'], fingers: { 5: 4, 4: 3, 2: 2, 1: 1 }, warnings: [] },
    A: { tab: ['x', '3', 'x', '5', '5', 'x'], muted: [6, 4, 1], slots: ['5:0/0', '3:2/0', '2:2/4'], fingers: { 5: 1, 3: 3, 2: 4 }, warnings: [] },
    G: { tab: ['8', '7', 'x', '5', '5', '8'], muted: [4], slots: ['6:0/0', '5:-1/4', '3:-3/0', '2:-3/4', '1:0/0'], fingers: { 6: 3, 5: 2, 3: 1, 2: 1, 1: 4 }, warnings: [] },
    E: { tab: ['8', 'x', '10', '9', 'x', '8'], muted: [5, 2], slots: ['6:0/0', '4:2/0', '3:1/4', '1:0/0'], fingers: { 6: 1, 4: 3, 3: 2 }, warnings: [1] },
    D: { tab: ['x', 'x', '10', 'x', '13', '12'], muted: [6, 5, 3], slots: ['4:0/0', '2:3/0', '1:2/4'], fingers: { 4: 1, 2: 4, 1: 3 }, warnings: [] }
};

function slotFixture(def) {
    return def.slots.map(function (slot) {
        return slot.s + ':' + slot.o + '/' + slot.iv;
    });
}

assert.deepStrictEqual(theory.QUALITIES.no5, {
    suffix: '(no5)', symbolSuffix: '(no5)', romanSuffix: '(no5)', intervals: [0, 4], degreeLabels: ['1', '3'],
    family: 'major', modifier: 'no', complexity: 'intermediate', caged: { supported: true, mode: 'fixed', baseQuality: null }
});
assert.strictEqual(theory.identifyQuality([0, 4]), 'no5');
assert.deepStrictEqual(theory.degreeLabelsForQuality('no5', [0, 4]), ['1', '3']);

var cNo5 = model.buildCustomChord({ rootPc: 0, third: 4, fifth: null, seventh: null, tensions: [] }, '');
assert.strictEqual(cNo5.symbol, 'C(no5)');
assert.strictEqual(cNo5.qualityKey, 'no5');
assert.deepStrictEqual(cNo5.coreIntervals, [0, 4]);
assert.deepStrictEqual(cNo5.intervals, [0, 4]);
assert.deepStrictEqual(cNo5.degreeLabelsList, ['1', '3']);

shapes.forEach(function (shape) {
    var fixture = expected[shape];
    var major = caged.FORMS[shape].qualities.maj;
    var def = caged.FORMS[shape].qualities.no5;
    assert(def, shape + ' has a fixed no5 definition');
    assert.deepStrictEqual(slotFixture(def), fixture.slots, shape + ' retains only its Major root/third slots');
    assert.deepStrictEqual(def.muted.slice().sort(function (a, b) { return a - b; }), fixture.muted.slice().sort(function (a, b) { return a - b; }), shape + ' mutes only removed-fifth strings or shape defaults');
    assert.deepStrictEqual(def.fingers, fixture.fingers, shape + ' keeps the provisional fingers for retained Major slots');
    assert.deepStrictEqual(def.slots.filter(function (slot) { return slot.fingeringWarning; }).map(function (slot) { return slot.s; }), fixture.warnings, shape + ' warns only explicitly unresolved active slots');
    assert.strictEqual(def.slots.some(function (slot) { return slot.iv === 7; }), false, shape + ' removes every Major fifth slot');
    assert(def.slots.some(function (slot) { return slot.iv === 0; }), shape + ' retains roots');
    assert(def.slots.some(function (slot) { return slot.iv === 4; }), shape + ' retains thirds');
    major.slots.filter(function (slot) { return slot.iv !== 7; }).forEach(function (slot) {
        assert(def.slots.some(function (candidate) {
            return candidate.s === slot.s && candidate.o === slot.o && candidate.iv === slot.iv;
        }), shape + ' retains Major ' + slot.s + '弦 interval ' + slot.iv);
    });

    [{ start: 0, end: 13 }, { start: 12, end: 25 }].forEach(function (range) {
        for (var rootPc = 0; rootPc < 12; rootPc += 1) {
            var form = caged.getForm(shape, 'no5', rootPc, range.end, range.start);
            assert.strictEqual(form.available, true, shape + ' no5 is available for root ' + rootPc);
            form.notes.forEach(function (note) {
                assert.strictEqual((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, (rootPc + note.interval) % 12, shape + ' pitch matches retained interval');
                assert.notStrictEqual(note.interval, 7, shape + ' never displays a fifth');
            });
        }
    });

    var cForm = caged.getForm(shape, 'no5', 0, 13, 0);
    var tab = [6, 5, 4, 3, 2, 1].map(function (stringNum) {
        var note = cForm.notes.filter(function (candidate) { return candidate.string === stringNum; })[0];
        return note ? String(note.fret) : 'x';
    });
    assert.deepStrictEqual(tab, fixture.tab, shape + ' C-root FORM preserves high root/third slots');
});

var cNo5E = caged.getForm('E', 'no5', 0, 13, 0);
assert.deepStrictEqual(cNo5E.notes.filter(function (note) { return note.string <= 3; }).sort(function (a, b) { return a.string - b.string; }).map(function (note) { return note.interval; }), [0, 4], 'E型 keeps the high third and root');
assert.deepStrictEqual(cNo5E.notes.filter(function (note) { return note.fingeringWarning; }).map(function (note) { return note.string; }), [1], 'E型 warns only the unverified high root');

var cNo5Markers = cNo5E.notes.map(function (note) {
    return { string: note.string, fret: note.fret, label: note.interval === 0 ? 'C' : 'E', role: note.interval === 0 ? 'root' : 'third' };
});
var cNo5Diagram = { frets: [8, 9, 10], markers: cNo5Markers, barres: caged.detectBarres(cNo5E.notes), mutedStrings: cNo5E.mutedStrings };
var staticSvg = fretboard.buildStaticSvg(cNo5Diagram);
var pngSvg = fretboard.buildExportSvg('C(no5)', cNo5Diagram).svg;
['C', 'E'].forEach(function (label) {
    assert(staticSvg.indexOf('>' + label + '</text>') !== -1, 'static SVG retains ' + label);
    assert(pngSvg.indexOf('>' + label + '</text>') !== -1, 'PNG SVG retains ' + label);
});
assert.strictEqual(staticSvg.indexOf('>G</text>') === -1, true, 'C(no5) export has no fifth label');

var storedValues = {};
window.localStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(storedValues, key) ? storedValues[key] : null; },
    setItem: function (key, value) { storedValues[key] = String(value); },
    removeItem: function (key) { delete storedValues[key]; }
};
require('../js/core/storage.js');
var storage = window.ChordCruise.storage;
var saved = storage.saveChord({
    chordName: 'C(no5)', formName: 'E型', shape: 'E', qualityKey: 'no5', rootPc: 0,
    intervals: [0, 4], fretRange: cNo5E.fretRange,
    notes: cNo5E.notes.map(function (note) {
        return { string: note.string, fret: note.fret, interval: note.interval, finger: note.finger, fingeringWarning: note.fingeringWarning };
    }),
    mutedStrings: cNo5E.mutedStrings, folderId: 'folder_uncategorized'
});
assert(saved, 'C(no5) CAGED form saves through the existing schema-1 transaction');
var reloaded = storage.loadChord(saved.id);
assert.strictEqual(reloaded.schemaVersion, 1, 'C(no5) save keeps schemaVersion 1');
assert.strictEqual(reloaded.qualityKey, 'no5', 'C(no5) save reloads its CAGED quality');
assert.deepStrictEqual(reloaded.intervals, [0, 4], 'C(no5) save reloads only root/third intervals');
assert.deepStrictEqual(reloaded.notes.map(function (note) { return note.interval; }).sort(), [0, 0, 0, 4], 'C(no5) save keeps every displayed root/third slot');
assert.strictEqual(storage.loadChordIndex()[0].chordName, 'C(no5)', 'C(no5) save enters the existing library index');

console.log('no5-caged: no5 quality, Major-derived 5 FORM candidates, retained high tones, 120 range scenarios, and schema-1 save/reload OK');
