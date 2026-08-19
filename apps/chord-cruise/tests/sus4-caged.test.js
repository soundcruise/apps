'use strict';

var assert = require('assert');
var fs = require('fs');

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
    C: { tab: ['x', '3', '3', '0', '1', '1'], muted: [6], slots: ['5:0/0', '4:0/5', '3:-3/7', '2:-2/0', '1:-2/5'], fingers: { 5: 3, 4: 4, 2: 1, 1: 1 }, warnings: 1 },
    A: { tab: ['x', '3', '5', '5', '6', '3'], muted: [6], slots: ['5:0/0', '4:2/7', '3:2/0', '2:3/5', '1:0/7'], fingers: { 5: 1, 4: 2, 3: 3, 2: 4, 1: 1 }, warnings: 0 },
    G: { tab: ['8', '8', '5', '5', '6', '8'], muted: [], slots: ['6:0/0', '5:0/5', '4:-3/7', '3:-3/0', '2:-2/5', '1:0/0'], fingers: { 6: 3, 5: 4, 4: 1 }, warnings: 3 },
    E: { tab: ['8', '10', '10', '10', '8', '8'], muted: [], slots: ['6:0/0', '5:2/7', '4:2/0', '3:2/5', '2:0/7', '1:0/0'], fingers: { 6: 1, 5: 2, 4: 3, 3: 4, 2: 1, 1: 1 }, warnings: 0 },
    D: { tab: ['x', 'x', '10', '12', '13', '13'], muted: [6, 5], slots: ['4:0/0', '3:2/7', '2:3/0', '1:3/5'], fingers: { 4: 1, 3: 2, 2: 3, 1: 4 }, warnings: 0 }
};

assert.deepStrictEqual(theory.QUALITIES.sus4, {
    suffix: 'sus4', symbolSuffix: 'sus4', romanSuffix: 'sus4', intervals: [0, 5, 7], degreeLabels: ['1', '4', '5'],
    family: 'sus', modifier: 'none', caged: { supported: true, mode: 'fixed', baseQuality: null }
});
assert.strictEqual(theory.identifyQuality([0, 5, 7]), 'sus4');
assert.deepStrictEqual(theory.degreeLabelsForQuality('sus4', [0, 5, 7]), ['1', '4', '5']);

var csus4 = model.buildCustomChord({ rootPc: 0, third: 5, fifth: 7, seventh: null, tensions: [] }, '');
assert.strictEqual(csus4.symbol, 'Csus4');
assert.strictEqual(csus4.qualityKey, 'sus4');
assert.deepStrictEqual(csus4.coreIntervals, [0, 5, 7]);
assert.deepStrictEqual(csus4.intervals, [0, 5, 7]);
assert.deepStrictEqual(csus4.notePcs, [0, 5, 7]);
assert.deepStrictEqual(csus4.degreeLabelsList, ['1', '4', '5']);

function slotFixture(def) {
    return def.slots.map(function (slot) {
        return slot.s + ':' + slot.o + '/' + slot.iv;
    });
}

shapes.forEach(function (shape) {
    var fixture = expected[shape];
    var def = caged.FORMS[shape].qualities.sus4;
    assert(def, shape + ' has a fixed sus4 definition');
    assert.deepStrictEqual(slotFixture(def), fixture.slots, shape + ' keeps every sus4 FORM slot');
    assert.deepStrictEqual(def.muted, fixture.muted, shape + ' keeps the expected muted strings');
    assert.deepStrictEqual(def.fingers, fixture.fingers, shape + ' uses only its planned candidate fingering');
    assert.strictEqual(def.slots.filter(function (slot) { return slot.fingeringWarning; }).length, fixture.warnings, shape + ' warning slot count');

    [{ start: 0, end: 13 }, { start: 12, end: 25 }].forEach(function (range) {
        for (var rootPc = 0; rootPc < 12; rootPc += 1) {
            var form = caged.getForm(shape, 'sus4', rootPc, range.end, range.start);
            assert.strictEqual(form.available, true, shape + ' sus4 is available for root ' + rootPc + ' in ' + range.start + '-' + range.end);
            form.notes.forEach(function (note) {
                assert.strictEqual(
                    (theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12,
                    (rootPc + note.interval) % 12,
                    shape + ' actual pitch matches the sus4 FORM interval'
                );
            });
        }
    });
});

[0, 2, 4, 5, 7, 9, 11].forEach(function (rootPc) {
    var featured = caged.getCommonForm('sus4', rootPc, 13, 0);
    assert(featured && featured.shape, 'sus4 has a featured CAGED form for root ' + rootPc);
});

Object.keys(expected).forEach(function (shape) {
    var form = caged.getForm(shape, 'sus4', 0, 13, 0);
    var tab = [6, 5, 4, 3, 2, 1].map(function (stringNum) {
        var note = form.notes.filter(function (candidate) { return candidate.string === stringNum; })[0];
        return note ? String(note.fret) : 'x';
    }).join(' ');
    assert.strictEqual(tab, expected[shape].tab.join(' '), shape + ' C-root tab');
    assert.deepStrictEqual(form.mutedStrings, expected[shape].muted.slice().sort(function (a, b) { return a - b; }), shape + ' C-root mute strings');
    assert(form.notes.some(function (note) { return note.interval === 0; }), shape + ' keeps a root');
    assert(form.notes.some(function (note) { return note.interval === 5; }), shape + ' keeps a fourth');
    assert(form.notes.some(function (note) { return note.interval === 7; }), shape + ' keeps a fifth');
});

var cSus4Form = caged.getForm('C', 'sus4', 0, 13, 0);
assert.strictEqual(cSus4Form.notes.filter(function (note) { return note.string === 3; })[0].finger, null, 'C-root C型 keeps its open third-string slot fingerless');
assert.strictEqual(cSus4Form.notes.filter(function (note) { return note.string === 3; })[0].fingeringWarning, false, 'C-root C型 open third-string slot is not warned');
var dSus4CForm = caged.getForm('C', 'sus4', 2, 13, 0);
assert.strictEqual(dSus4CForm.notes.filter(function (note) { return note.string === 3; })[0].fingeringWarning, true, 'movable C型 keeps the third-string FORM slot as a warning');
var cSus4Markers = cSus4Form.notes.map(function (note) {
    var labelByInterval = { 0: 'C', 5: 'F', 7: 'G' };
    return { string: note.string, fret: note.fret, label: labelByInterval[note.interval], role: note.interval === 0 ? 'root' : (note.interval === 5 ? 'third' : 'fifth') };
});
var cSus4Diagram = {
    frets: [0, 1, 2, 3],
    markers: cSus4Markers,
    barres: caged.detectBarres(cSus4Form.notes),
    mutedStrings: cSus4Form.mutedStrings
};
var cSus4StaticSvg = fretboard.buildStaticSvg(cSus4Diagram);
var cSus4PngSource = fretboard.buildExportSvg('Csus4', cSus4Diagram).svg;
['C', 'F', 'G'].forEach(function (label) {
    assert(cSus4StaticSvg.indexOf('>' + label + '</text>') !== -1, 'Csus4 static SVG keeps ' + label);
    assert(cSus4PngSource.indexOf('>' + label + '</text>') !== -1, 'Csus4 PNG source keeps ' + label);
});
assert(cSus4StaticSvg.indexOf('#ffd93d') !== -1, 'Csus4 static SVG renders the fourth in the third-color yellow');
['../js/ui/explore.js', '../js/ui/save-editor.js', '../js/ui/library.js'].forEach(function (file) {
    var source = fs.readFileSync(__dirname + '/' + file, 'utf8');
    assert(source.indexOf('interval === 3 || interval === 4 || interval === 5') !== -1, file + ' maps sus4 fourths to the third role');
});

console.log('sus4-caged: sus4 quality, C-root 5 FORM candidates, candidate fingers, color role, and 120 range scenarios OK');
