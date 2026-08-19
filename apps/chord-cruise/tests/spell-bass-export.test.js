'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

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
var librarySource = fs.readFileSync(path.join(__dirname, '../js/ui/library.js'), 'utf8');

function savedRecord(spec, keyContext) {
    var chord = chordModel.buildCustomChord(spec, '');
    var form = caged.getForm('E', chord.qualityKey, chord.rootPc, 13, 0);
    assert.strictEqual(form.available, true, chord.symbol + ' has a saved base FORM');
    return {
        // 音名は保存nameを解析せず、semantic fieldsだけから再構成する。
        chordName: '旧保存表記', formName: 'E型', shape: 'E', rootPc: chord.rootPc,
        qualityKey: chord.qualityKey, intervals: chord.intervals.slice(), bassPc: chord.bassPc,
        keyContext: keyContext || null,
        fretRange: { min: 0, max: 13, includesOpen: true },
        notes: form.notes.map(function (note) {
            return { string: note.string, fret: note.fret, interval: note.interval, finger: null, fingeringWarning: false };
        }),
        mutedStrings: form.mutedStrings,
        folderId: 'folder_uncategorized'
    };
}

function bassMarker(record, mode) {
    return savedDiagramOptions(record, { mode: mode || 'note' }).markers.filter(function (marker) {
        return marker.isBassCandidate === true && marker.isOverlay === true;
    })[0];
}

[
    [{ rootPc: 0, third: 4, fifth: 7, seventh: null, tensions: [], bassPc: 4 }, 'C/E', 'E'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 10, tensions: [], bassPc: 10 }, 'C7/B♭', 'B♭'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: null, tensions: [], bassPc: 2 }, 'C/D', 'D'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: null, tensions: [], bassPc: 6 }, 'C/F♯', 'F♯']
].forEach(function (fixture) {
    var record = savedRecord(fixture[0]);
    var diagram = savedDiagramOptions(record, { mode: 'note' });
    var marker = bassMarker(record);
    var staticSvg = fretboard.buildStaticSvg(diagram);
    var pngSvg = fretboard.buildExportSvg(fixture[1], diagram).svg;
    assert(marker && marker.label === fixture[2], fixture[1] + ' library Bass label');
    assert(staticSvg.indexOf('>' + fixture[2] + '</text>') !== -1, fixture[1] + ' static SVG Bass label');
    assert(pngSvg.indexOf('>' + fixture[2] + '</text>') !== -1, fixture[1] + ' PNG source SVG Bass label');
});

var dbMajor = savedRecord(
    { rootPc: 1, third: 4, fifth: 7, seventh: null, tensions: [], bassPc: 8 },
    { tonicPc: 1, mode: 'major' }
);
assert.strictEqual(bassMarker(dbMajor).label, 'A♭', 'keyContext spells D♭ major Bass fifth as A♭');

var c7OverBb = savedRecord({ rootPc: 0, third: 4, fifth: 7, seventh: 10, tensions: [], bassPc: 10 });
assert.strictEqual(bassMarker(c7OverBb, 'solfege').label, 'シ♭', 'library Bass solfege follows resolved B♭ spelling');

var storedValues = {};
window.localStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(storedValues, key) ? storedValues[key] : null; },
    setItem: function (key, value) { storedValues[key] = String(value); },
    removeItem: function (key) { delete storedValues[key]; }
};
require('../js/core/storage.js');
var saved = window.ChordCruise.storage.saveChord(c7OverBb);
var reloaded = window.ChordCruise.storage.loadChord(saved.id);
assert.strictEqual(reloaded.schemaVersion, 1, 'Bass spelling keeps schemaVersion 1');
assert.strictEqual(reloaded.bassPc, 10, 'Bass spelling keeps bassPc');
assert.deepStrictEqual(reloaded.intervals, [0, 4, 7, 10], 'Bass spelling keeps upper intervals');
assert.strictEqual(bassMarker(reloaded).label, 'B♭', 'reloaded record rebuilds Bass spelling from semantic fields');

assert(librarySource.includes('function savedBassSpelledNoteName'), 'library has a dedicated saved Bass spelling helper');
assert(librarySource.includes('spellBassNote({'), 'library calls spellBassNote for Bass labels');
assert(librarySource.includes('solfegeNameForSpelling(spelled)'), 'library derives Bass solfege from resolved spelling');

console.log('spell-bass-export: library, SVG, PNG, reload, key context, and solfege use semantic Bass spelling OK');
