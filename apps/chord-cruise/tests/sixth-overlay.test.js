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
var intervals = [0, 4, 7, 9];

assert.deepStrictEqual(theory.QUALITIES['6'], {
    suffix: '6', symbolSuffix: '6', romanSuffix: '6',
    intervals: intervals, degreeLabels: ['1', '3', '5', '6'],
    family: 'major', modifier: 'sixth', complexity: 'intermediate', caged: { supported: true, mode: 'overlay', baseQuality: 'maj' }
}, '6 quality metadata');
assert.strictEqual(theory.identifyQuality(intervals), '6', '6 quality recognition');

var chord = chordModel.buildCustomChord({ rootPc: 0, third: 4, fifth: 7, seventh: 9, tensions: [] }, '');
assert.strictEqual(chord.symbol, 'C6', 'C6 symbol');
assert.strictEqual(chord.qualityKey, '6', 'C6 qualityKey');
assert.deepStrictEqual(chord.coreIntervals, intervals, 'C6 intervals');
assert.deepStrictEqual(chord.degreeLabelsList, ['1', '3', '5', '6'], 'C6 degree labels');

var scenarioCount = 0;
var cRootOverlays = {};
shapes.forEach(function (shape) {
    assert.strictEqual(caged.FORMS[shape].qualities['6'], undefined, shape + ' has no dedicated sixth FORM');
    [{ start: 0, end: 13 }, { start: 12, end: 25 }].forEach(function (range) {
        for (var rootPc = 0; rootPc < 12; rootPc += 1) {
            var major = caged.getForm(shape, 'maj', rootPc, range.end, range.start);
            var sixth = caged.getForm(shape, '6', rootPc, range.end, range.start);
            assert.strictEqual(sixth.available, true, shape + '/6 uses the Major base FORM');
            assert.strictEqual(sixth.fingeringStatus, 'undefined', shape + '/6 fingering is undefined');
            assert.deepStrictEqual(sixth.mutedStrings, major.mutedStrings, shape + '/6 keeps Major mutes');
            assert.deepStrictEqual(sixth.notes.map(function (note) {
                return [note.string, note.fret, note.interval];
            }), major.notes.map(function (note) {
                return [note.string, note.fret, note.interval];
            }), shape + '/6 keeps every Major marker');
            sixth.notes.forEach(function (note) {
                assert.strictEqual(note.finger, null, shape + '/6 does not infer Major fingering');
                assert([0, 4, 7].indexOf(note.interval) !== -1, shape + '/6 base contains only Major intervals');
            });

            var displayRange = sixth.displayRange || sixth.fretRange;
            var overlays = chordModel.sixthOverlayNotes({
                rootPc: rootPc, startFret: displayRange.min, endFret: displayRange.max,
                targetStrings: [3, 2, 1]
            });
            assert(overlays.length > 0, shape + '/6 has a sixth marker in the Major FORM range');
            overlays.forEach(function (overlay) {
                assert.strictEqual(overlay.interval, 9, shape + '/6 overlay is interval 9');
                assert.strictEqual(overlay.degreeLabel, '6', shape + '/6 overlay is degree 6, not 13');
                assert.strictEqual(overlay.overlayType, 'sixth', shape + '/6 uses a dedicated overlay role');
                assert([1, 2, 3].indexOf(overlay.string) !== -1, shape + '/6 keeps added markers on the high strings');
                assert.strictEqual(sixth.notes.some(function (note) {
                    return note.string === overlay.string && note.fret === overlay.fret;
                }), false, shape + '/6 does not replace an existing marker');
            });
            [0, 4, 7, 9].forEach(function (interval) {
                assert(sixth.notes.concat(overlays).some(function (note) { return note.interval === interval; }), shape + '/6 combined display contains interval ' + interval);
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
shapes.forEach(function (shape) {
    var base = caged.getForm(shape, '6', 0, 13, 0);
    cRootOverlays[shape].forEach(function (overlay) {
        assert(base.notes.some(function (note) { return note.string === overlay.string; }), shape + ' permits a sixth marker on an existing Major FORM string');
    });
});

var baseForm = caged.getForm('E', '6', 0, 13, 0);
var combinedNotes = baseForm.notes.concat(cRootOverlays.E);
var names = { 0: 'C', 4: 'E', 7: 'G', 9: 'A' };
var roles = { 0: 'root', 4: 'third', 7: 'fifth', 9: 'sixth' };
var diagram = {
    frets: [8, 9, 10],
    markers: combinedNotes.map(function (note) {
        return { string: note.string, fret: note.fret, label: names[note.interval], role: roles[note.interval] };
    }),
    barres: [], mutedStrings: baseForm.mutedStrings
};
var staticSvg = fretboard.buildStaticSvg(diagram);
var pngSvg = fretboard.buildExportSvg('C6', diagram).svg;
['C', 'E', 'G', 'A'].forEach(function (label) {
    assert(staticSvg.indexOf('>' + label + '</text>') !== -1, 'static SVG keeps ' + label);
    assert(pngSvg.indexOf('>' + label + '</text>') !== -1, 'PNG SVG keeps ' + label);
});
assert(staticSvg.indexOf('#b58cff') !== -1, 'static SVG uses the dedicated sixth palette');

var storedValues = {};
window.localStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(storedValues, key) ? storedValues[key] : null; },
    setItem: function (key, value) { storedValues[key] = String(value); },
    removeItem: function (key) { delete storedValues[key]; }
};
require('../js/core/storage.js');
var storage = window.ChordCruise.storage;
var saved = storage.saveChord({
    chordName: 'C6', formName: 'E型', shape: 'E', qualityKey: '6', rootPc: 0,
    intervals: intervals, fretRange: baseForm.fretRange,
    notes: combinedNotes.map(function (note) {
        return { string: note.string, fret: note.fret, interval: note.interval, finger: null, fingeringWarning: false };
    }),
    mutedStrings: baseForm.mutedStrings, folderId: 'folder_uncategorized'
});
assert(saved, 'C6 saves through schema 1');
var reloaded = storage.loadChord(saved.id);
assert.strictEqual(reloaded.schemaVersion, 1, 'C6 keeps schemaVersion 1');
assert.strictEqual(reloaded.qualityKey, '6', 'C6 reload keeps qualityKey 6');
assert.deepStrictEqual(reloaded.intervals, intervals, 'C6 reload keeps intervals');
assert(reloaded.notes.some(function (note) { return note.interval === 9; }), 'C6 reload keeps the sixth marker');
assert.strictEqual(storage.loadChordIndex()[0].chordName, 'C6', 'C6 enters the library index');

var exploreSource = fs.readFileSync(path.join(__dirname, '../js/ui/explore.js'), 'utf8');
var saveEditorSource = fs.readFileSync(path.join(__dirname, '../js/ui/save-editor.js'), 'utf8');
var librarySource = fs.readFileSync(path.join(__dirname, '../js/ui/library.js'), 'utf8');
assert(exploreSource.indexOf('mergeSixthOverlayMarkers') !== -1, 'Explore merges the sixth overlay separately');
assert(saveEditorSource.indexOf('notesWithSixthCandidates') !== -1, 'save-editor adds editable sixth notes without changing Major FORM');
assert(saveEditorSource.indexOf("record.qualityKey = '6'") !== -1, 'save-editor persists qualityKey 6');
assert(librarySource.indexOf("qualityKey === '6' && interval === 9") !== -1, 'library/export preserves the C6 sixth role');

console.log('sixth-overlay: C6 quality, unchanged Major CAGED markers, dedicated sixth role, 120 overlay scenarios, schema-1 save/reload/library, and SVG/PNG OK');
