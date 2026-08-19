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
    C: { tab: ['x', '3', 'x', '0', '1', 'x'], muted: [6, 4, 1], slots: ['5:0/0', '3:-3/7', '2:-2/0'], fingers: { 5: 4, 3: 1, 2: 2 }, warnings: [] },
    A: { tab: ['x', '3', '5', '5', 'x', '3'], muted: [6, 2], slots: ['5:0/0', '4:2/7', '3:2/0', '1:0/7'], fingers: { 5: 1, 4: 2, 3: 3, 1: 1 }, warnings: [] },
    G: { tab: ['8', 'x', '5', '5', 'x', '8'], muted: [5, 2], slots: ['6:0/0', '4:-3/7', '3:-3/0', '1:0/0'], fingers: { 6: 3, 4: 1, 3: 1, 1: 4 }, warnings: [] },
    E: { tab: ['8', '10', '10', 'x', '8', '8'], muted: [3], slots: ['6:0/0', '5:2/7', '4:2/0', '2:0/7', '1:0/0'], fingers: { 6: 1, 5: 3, 4: 4 }, warnings: [2, 1] },
    D: { tab: ['x', 'x', '10', '12', '13', 'x'], muted: [6, 5, 1], slots: ['4:0/0', '3:2/7', '2:3/0'], fingers: { 4: 1, 3: 2, 2: 4 }, warnings: [] }
};

function slotFixture(def) {
    return def.slots.map(function (slot) {
        return slot.s + ':' + slot.o + '/' + slot.iv;
    });
}

assert.deepStrictEqual(theory.QUALITIES.power5, {
    suffix: '5', symbolSuffix: '5', romanSuffix: '5', intervals: [0, 7], degreeLabels: ['1', '5'],
    family: 'power', modifier: 'none', complexity: 'basic', caged: { supported: true, mode: 'fixed', baseQuality: null }
});
assert.strictEqual(theory.identifyQuality([0, 7]), 'power5');
assert.deepStrictEqual(theory.degreeLabelsForQuality('power5', [0, 7]), ['1', '5']);

var c5 = model.buildCustomChord({ rootPc: 0, third: null, fifth: 7, seventh: null, tensions: [] }, '');
assert.strictEqual(c5.symbol, 'C5');
assert.strictEqual(c5.qualityKey, 'power5');
assert.deepStrictEqual(c5.coreIntervals, [0, 7]);
assert.deepStrictEqual(c5.intervals, [0, 7]);
assert.deepStrictEqual(c5.degreeLabelsList, ['1', '5']);

shapes.forEach(function (shape) {
    var fixture = expected[shape];
    var major = caged.FORMS[shape].qualities.maj;
    var def = caged.FORMS[shape].qualities.power5;
    assert(def, shape + ' has a fixed power5 definition');
    assert.deepStrictEqual(slotFixture(def), fixture.slots, shape + ' retains only its Major root/fifth slots');
    assert.deepStrictEqual(def.muted.slice().sort(function (a, b) { return a - b; }), fixture.muted.slice().sort(function (a, b) { return a - b; }), shape + ' mutes only removed-third strings or shape defaults');
    assert.deepStrictEqual(def.fingers, fixture.fingers, shape + ' keeps the candidate fingers for retained Major slots');
    assert.deepStrictEqual(def.slots.filter(function (slot) { return slot.fingeringWarning; }).map(function (slot) { return slot.s; }), fixture.warnings, shape + ' keeps only explicitly unresolved active slots warned');
    assert.strictEqual(def.slots.some(function (slot) { return slot.iv === 4; }), false, shape + ' removes every Major third slot');
    assert(def.slots.some(function (slot) { return slot.iv === 0; }), shape + ' retains roots');
    assert(def.slots.some(function (slot) { return slot.iv === 7; }), shape + ' retains fifths');
    major.slots.filter(function (slot) { return slot.iv !== 4; }).forEach(function (slot) {
        assert(def.slots.some(function (candidate) {
            return candidate.s === slot.s && candidate.o === slot.o && candidate.iv === slot.iv;
        }), shape + ' retains Major ' + slot.s + '弦 interval ' + slot.iv);
    });

    [{ start: 0, end: 13 }, { start: 12, end: 25 }].forEach(function (range) {
        for (var rootPc = 0; rootPc < 12; rootPc += 1) {
            var form = caged.getForm(shape, 'power5', rootPc, range.end, range.start);
            assert.strictEqual(form.available, true, shape + ' power5 is available for root ' + rootPc);
            form.notes.forEach(function (note) {
                assert.strictEqual((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, (rootPc + note.interval) % 12, shape + ' pitch matches retained interval');
                assert.notStrictEqual(note.interval, 4, shape + ' never displays a third');
            });
        }
    });

    var cForm = caged.getForm(shape, 'power5', 0, 13, 0);
    var tab = [6, 5, 4, 3, 2, 1].map(function (stringNum) {
        var note = cForm.notes.filter(function (candidate) { return candidate.string === stringNum; })[0];
        return note ? String(note.fret) : 'x';
    });
    assert.deepStrictEqual(tab, fixture.tab, shape + ' C-root FORM preserves high root/fifth slots');
});

var c5E = caged.getForm('E', 'power5', 0, 13, 0);
assert.deepStrictEqual(c5E.notes.filter(function (note) { return note.string <= 2; }).sort(function (a, b) { return a.string - b.string; }).map(function (note) { return note.interval; }), [0, 7], 'E型 keeps the high root and fifth');
assert.deepStrictEqual(c5E.notes.filter(function (note) { return note.fingeringWarning; }).map(function (note) { return note.string; }), [2, 1], 'E型 warns only the unverified high retained slots');

var c5Markers = c5E.notes.map(function (note) {
    return { string: note.string, fret: note.fret, label: note.interval === 0 ? 'C' : 'G', role: note.interval === 0 ? 'root' : 'fifth' };
});
var c5Diagram = { frets: [8, 9, 10], markers: c5Markers, barres: caged.detectBarres(c5E.notes), mutedStrings: c5E.mutedStrings };
var staticSvg = fretboard.buildStaticSvg(c5Diagram);
var pngSvg = fretboard.buildExportSvg('C5', c5Diagram).svg;
['C', 'G'].forEach(function (label) {
    assert(staticSvg.indexOf('>' + label + '</text>') !== -1, 'static SVG retains ' + label);
    assert(pngSvg.indexOf('>' + label + '</text>') !== -1, 'PNG SVG retains ' + label);
});
assert.strictEqual(staticSvg.indexOf('>E</text>') === -1, true, 'C5 export has no third label');

var storedValues = {};
window.localStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(storedValues, key) ? storedValues[key] : null; },
    setItem: function (key, value) { storedValues[key] = String(value); },
    removeItem: function (key) { delete storedValues[key]; }
};
require('../js/core/storage.js');
var storage = window.ChordCruise.storage;
var saved = storage.saveChord({
    chordName: 'C5', formName: 'E型', shape: 'E', qualityKey: 'power5', rootPc: 0,
    intervals: [0, 7], fretRange: c5E.fretRange,
    notes: c5E.notes.map(function (note) {
        return { string: note.string, fret: note.fret, interval: note.interval, finger: note.finger, fingeringWarning: note.fingeringWarning };
    }),
    mutedStrings: c5E.mutedStrings, folderId: 'folder_uncategorized'
});
assert(saved, 'C5 CAGED form saves through the existing schema-1 transaction');
var reloaded = storage.loadChord(saved.id);
assert.strictEqual(reloaded.schemaVersion, 1, 'C5 save keeps schemaVersion 1');
assert.strictEqual(reloaded.qualityKey, 'power5', 'C5 save reloads its CAGED quality');
assert.deepStrictEqual(reloaded.intervals, [0, 7], 'C5 save reloads only root/fifth intervals');
assert.deepStrictEqual(reloaded.notes.map(function (note) { return note.interval; }).sort(), [0, 0, 0, 7, 7], 'C5 save keeps every displayed root/fifth slot');
assert.strictEqual(storage.loadChordIndex()[0].chordName, 'C5', 'C5 save enters the existing library index');

console.log('power5-caged: power5 quality, Major-derived 5 FORM candidates, retained high tones, 120 range scenarios, and schema-1 save/reload OK');
