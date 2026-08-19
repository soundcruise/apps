'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/chord-model.js');
require('../js/core/caged-forms.js');
require('../js/ui/fretboard.js');

var theory = window.ChordCruise.theory;
var chordModel = window.ChordCruise.chordModel;
var caged = window.ChordCruise.caged;
var fretboard = window.ChordCruise.ui.fretboard;
var shapes = ['C', 'A', 'G', 'E', 'D'];
var intervals = [0, 3, 7, 9];

assert.deepStrictEqual(theory.QUALITIES.m6, {
    suffix: 'm6', symbolSuffix: 'm6', romanSuffix: 'm6',
    intervals: intervals, degreeLabels: ['1', '♭3', '5', '6'],
    family: 'minor', modifier: 'sixth', complexity: 'intermediate', caged: { supported: true, mode: 'overlay', baseQuality: 'm' }
}, 'm6 quality metadata');
assert.strictEqual(theory.identifyQuality(intervals), 'm6', 'm6 quality recognition');

var chord = chordModel.buildCustomChord({ rootPc: 0, third: 3, fifth: 7, seventh: 9, tensions: [] }, '');
assert.strictEqual(chord.symbol, 'Cm6', 'Cm6 symbol');
assert.strictEqual(chord.qualityKey, 'm6', 'Cm6 qualityKey');
assert.deepStrictEqual(chord.coreIntervals, intervals, 'Cm6 intervals');
assert.deepStrictEqual(chord.degreeLabelsList, ['1', '♭3', '5', '6'], 'Cm6 degree labels');

var scenarioCount = 0;
var cRootOverlays = {};
shapes.forEach(function (shape) {
    assert.strictEqual(caged.FORMS[shape].qualities.m6, undefined, shape + ' has no dedicated m6 FORM');
    [{ start: 0, end: 13 }, { start: 12, end: 25 }].forEach(function (range) {
        for (var rootPc = 0; rootPc < 12; rootPc += 1) {
            var minor = caged.getForm(shape, 'm', rootPc, range.end, range.start);
            var minorSixth = caged.getForm(shape, 'm6', rootPc, range.end, range.start);
            assert.strictEqual(minorSixth.available, true, shape + '/m6 uses the Minor base FORM');
            assert.strictEqual(minorSixth.fingeringStatus, 'undefined', shape + '/m6 fingering is undefined');
            assert.deepStrictEqual(minorSixth.mutedStrings, minor.mutedStrings, shape + '/m6 keeps Minor mutes');
            assert.deepStrictEqual(minorSixth.notes.map(function (note) {
                return [note.string, note.fret, note.interval];
            }), minor.notes.map(function (note) {
                return [note.string, note.fret, note.interval];
            }), shape + '/m6 keeps every Minor marker');
            minorSixth.notes.forEach(function (note) {
                assert.strictEqual(note.finger, null, shape + '/m6 does not infer Minor fingering');
                assert([0, 3, 7].indexOf(note.interval) !== -1, shape + '/m6 base contains only Minor intervals');
            });

            var displayRange = minorSixth.displayRange || minorSixth.fretRange;
            var overlayOptions = {
                rootPc: rootPc, startFret: displayRange.min, endFret: displayRange.max,
                targetStrings: [3, 2, 1]
            };
            var overlays = chordModel.sixthOverlayNotes(overlayOptions);
            if (!overlays.length) {
                overlayOptions.targetStrings = [5];
                overlays = chordModel.sixthOverlayNotes(overlayOptions);
            }
            assert(overlays.length > 0, shape + '/m6 has a sixth marker in the Minor FORM range');
            overlays.forEach(function (overlay) {
                assert.strictEqual(overlay.interval, 9, shape + '/m6 overlay is interval 9');
                assert.strictEqual(overlay.degreeLabel, '6', shape + '/m6 overlay is degree 6, not 13');
                assert.strictEqual(overlay.overlayType, 'sixth', shape + '/m6 uses the shared sixth role');
                assert([1, 2, 3, 5].indexOf(overlay.string) !== -1, shape + '/m6 keeps added markers on the approved FORM strings');
                assert.strictEqual(minorSixth.notes.some(function (note) {
                    return note.string === overlay.string && note.fret === overlay.fret;
                }), false, shape + '/m6 does not replace an existing marker');
            });
            [0, 3, 7, 9].forEach(function (interval) {
                assert(minorSixth.notes.concat(overlays).some(function (note) { return note.interval === interval; }), shape + '/m6 combined display contains interval ' + interval);
            });
            if (rootPc === 0 && range.start === 0) cRootOverlays[shape] = overlays;
            scenarioCount += 1;
        }
    });
});
assert.strictEqual(scenarioCount, 120, '5 shapes × 12 roots × 2 ranges');

assert.deepStrictEqual(cRootOverlays.C.map(function (note) { return [note.string, note.fret]; }), [[3, 2]], 'C shape adds A on string 3');
assert.deepStrictEqual(cRootOverlays.A.map(function (note) { return [note.string, note.fret]; }), [[1, 5]], 'A shape adds A on string 1');
assert.deepStrictEqual(cRootOverlays.G.map(function (note) { return [note.string, note.fret]; }), [[1, 5]], 'G shape adds A on string 1');
assert.deepStrictEqual(cRootOverlays.E.map(function (note) { return [note.string, note.fret]; }), [[2, 10]], 'E shape adds A on string 2');
assert.deepStrictEqual(cRootOverlays.D.map(function (note) { return [note.string, note.fret]; }), [[2, 10]], 'D shape adds A on string 2');
var bRootCForm = caged.getForm('C', 'm6', 11, 13, 0);
assert.deepStrictEqual(chordModel.sixthOverlayNotes({
    rootPc: 11, startFret: bRootCForm.displayRange.min, endFret: bRootCForm.displayRange.max, targetStrings: [5, 3, 2, 1]
}).map(function (note) { return [note.string, note.fret]; }), [[5, 11]], 'B-root C form adds its in-range sixth on string 5');

var baseForm = caged.getForm('E', 'm6', 0, 13, 0);
var combinedNotes = baseForm.notes.concat(cRootOverlays.E);
var names = { 0: 'C', 3: 'E♭', 7: 'G', 9: 'A' };
var roles = { 0: 'root', 3: 'third', 7: 'fifth', 9: 'sixth' };
var diagram = {
    frets: [8, 9, 10],
    markers: combinedNotes.map(function (note) {
        return { string: note.string, fret: note.fret, label: names[note.interval], role: roles[note.interval] };
    }),
    barres: [], mutedStrings: baseForm.mutedStrings
};
var staticSvg = fretboard.buildStaticSvg(diagram);
var pngSvg = fretboard.buildExportSvg('Cm6', diagram).svg;
['C', 'E♭', 'G', 'A'].forEach(function (label) {
    assert(staticSvg.indexOf('>' + label + '</text>') !== -1, 'static SVG keeps ' + label);
    assert(pngSvg.indexOf('>' + label + '</text>') !== -1, 'PNG SVG keeps ' + label);
});
assert(staticSvg.indexOf('#b58cff') !== -1, 'static SVG uses the shared sixth palette');

var storedValues = {};
window.localStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(storedValues, key) ? storedValues[key] : null; },
    setItem: function (key, value) { storedValues[key] = String(value); },
    removeItem: function (key) { delete storedValues[key]; }
};
require('../js/core/storage.js');
var storage = window.ChordCruise.storage;
var saved = storage.saveChord({
    chordName: 'Cm6', formName: 'E型', shape: 'E', qualityKey: 'm6', rootPc: 0,
    intervals: intervals, fretRange: baseForm.fretRange,
    notes: combinedNotes.map(function (note) {
        return { string: note.string, fret: note.fret, interval: note.interval, finger: null, fingeringWarning: false };
    }),
    mutedStrings: baseForm.mutedStrings, folderId: 'folder_uncategorized'
});
assert(saved, 'Cm6 saves through schema 1');
var reloaded = storage.loadChord(saved.id);
assert.strictEqual(reloaded.schemaVersion, 1, 'Cm6 keeps schemaVersion 1');
assert.strictEqual(reloaded.qualityKey, 'm6', 'Cm6 reload keeps qualityKey m6');
assert.deepStrictEqual(reloaded.intervals, intervals, 'Cm6 reload keeps intervals');
assert(reloaded.notes.some(function (note) { return note.interval === 9; }), 'Cm6 reload keeps the sixth marker');
assert.strictEqual(storage.loadChordIndex()[0].chordName, 'Cm6', 'Cm6 enters the library index');

var exploreSource = fs.readFileSync(path.join(__dirname, '../js/ui/explore.js'), 'utf8');
var saveEditorSource = fs.readFileSync(path.join(__dirname, '../js/ui/save-editor.js'), 'utf8');
var librarySource = fs.readFileSync(path.join(__dirname, '../js/ui/library.js'), 'utf8');
assert(exploreSource.indexOf("chord.qualityKey === 'm6'") !== -1, 'Explore merges the shared sixth overlay for m6');
assert(saveEditorSource.indexOf("chord.qualityKey !== 'm6'") !== -1, 'save-editor adds editable sixth notes for m6 without changing the Minor FORM');
assert(saveEditorSource.indexOf("qualityKey === 'm6'") !== -1, 'save-editor persists qualityKey m6');
assert(librarySource.indexOf("qualityKey === 'm6'") !== -1, 'library/export preserves the shared sixth role for m6');

console.log('m6-overlay: Cm6 quality, unchanged Minor CAGED markers, shared sixth role, 120 overlay scenarios, schema-1 save/reload/library, and SVG/PNG OK');
