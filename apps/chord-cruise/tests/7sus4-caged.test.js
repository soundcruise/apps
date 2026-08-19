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
    '7sus4': {
        intervals: [0, 5, 7, 10], degreeLabels: ['1', '4', '5', '♭7'], symbol: 'C7sus4', seventh: 10,
        tabs: { C: ['x', '3', '3', '3', '1', '3'], A: ['x', '3', '5', '3', '6', '3'], G: ['8', '8', '5', '5', '6', '6'], E: ['8', '10', '8', '10', '8', '8'], D: ['x', 'x', '10', '12', '11', '13'] }
    },
    M7sus4: {
        intervals: [0, 5, 7, 11], degreeLabels: ['1', '4', '5', '7'], symbol: 'CM7sus4', seventh: 11,
        tabs: { C: ['x', '3', '3', '0', '0', '1'], A: ['x', '3', '5', '4', '6', '3'], G: ['8', '8', '5', '5', '6', '7'], E: ['8', '10', '9', '10', '8', '8'], D: ['x', 'x', '10', '12', '12', '13'] }
    }
};

Object.keys(expected).forEach(function (qualityKey) {
    var fixture = expected[qualityKey];
    assert.deepStrictEqual(theory.QUALITIES[qualityKey].intervals, fixture.intervals, qualityKey + ' intervals');
    assert.deepStrictEqual(theory.QUALITIES[qualityKey].degreeLabels, fixture.degreeLabels, qualityKey + ' degree labels');
    assert.strictEqual(theory.identifyQuality(fixture.intervals), qualityKey, qualityKey + ' recognition');
    assert.strictEqual(theory.chordSymbol(0, qualityKey, false), fixture.symbol, qualityKey + ' C symbol');

    var chord = model.buildCustomChord({ rootPc: 0, third: 5, fifth: 7, seventh: fixture.seventh, tensions: [] }, '');
    assert.strictEqual(chord.symbol, fixture.symbol, qualityKey + ' keeps existing generated symbol');
    assert.strictEqual(chord.qualityKey, qualityKey, qualityKey + ' enters CAGED quality set');
    assert.deepStrictEqual(chord.coreIntervals, fixture.intervals, qualityKey + ' core intervals');
    assert.deepStrictEqual(chord.intervals, fixture.intervals, qualityKey + ' intervals');
    assert.deepStrictEqual(chord.notePcs, fixture.intervals, qualityKey + ' C note PCs');
    assert.deepStrictEqual(chord.degreeLabelsList, fixture.degreeLabels, qualityKey + ' degree labels');

    shapes.forEach(function (shape) {
        var sourceQuality = qualityKey === '7sus4' ? '7' : 'maj7';
        var source = caged.FORMS[shape].qualities[sourceQuality];
        var def = caged.FORMS[shape].qualities[qualityKey];
        assert(def, shape + '/' + qualityKey + ' fixed definition');
        assert.deepStrictEqual(def.fingers, {}, shape + '/' + qualityKey + ' has no inferred fingers');
        assert.strictEqual(def.fingeringStatus, 'undefined', shape + '/' + qualityKey + ' explicitly distinguishes undefined fingering');
        assert.strictEqual(def.slots.some(function (slot) { return slot.iv === 4; }), false, shape + '/' + qualityKey + ' removes every third');
        assert(def.slots.some(function (slot) { return slot.iv === 5; }), shape + '/' + qualityKey + ' adds a fourth');
        assert(def.slots.some(function (slot) { return slot.iv === 7; }), shape + '/' + qualityKey + ' retains a fifth');
        assert(def.slots.some(function (slot) { return slot.iv === fixture.seventh; }), shape + '/' + qualityKey + ' retains its seventh');
        source.slots.forEach(function (slot) {
            var expectedInterval = slot.iv === 4 ? 5 : slot.iv;
            assert(def.slots.some(function (candidate) {
                return candidate.s === slot.s && candidate.iv === expectedInterval;
            }), shape + '/' + qualityKey + ' derives string ' + slot.s + ' from ' + sourceQuality);
        });

        [{ start: 0, end: 13 }, { start: 12, end: 25 }].forEach(function (range) {
            for (var rootPc = 0; rootPc < 12; rootPc += 1) {
                var form = caged.getForm(shape, qualityKey, rootPc, range.end, range.start);
                assert.strictEqual(form.available, true, shape + '/' + qualityKey + ' is available for root ' + rootPc);
                assert.strictEqual(form.fingeringStatus, 'undefined', shape + '/' + qualityKey + ' exposes undefined fingering without saving it');
                form.notes.forEach(function (note) {
                    assert.strictEqual((theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12, (rootPc + note.interval) % 12, shape + '/' + qualityKey + ' pitch matches interval');
                    assert.notStrictEqual(note.interval, 4, shape + '/' + qualityKey + ' never displays a third');
                });
            }
        });

        var cForm = caged.getForm(shape, qualityKey, 0, 13, 0);
        var tab = [6, 5, 4, 3, 2, 1].map(function (stringNum) {
            var note = cForm.notes.filter(function (candidate) { return candidate.string === stringNum; })[0];
            return note ? String(note.fret) : 'x';
        });
        assert.deepStrictEqual(tab, fixture.tabs[shape], shape + '/' + qualityKey + ' C-root fixed FORM');
        cForm.notes.filter(function (note) { return note.fret > 0; }).forEach(function (note) {
            assert.strictEqual(note.finger, null, shape + '/' + qualityKey + ' keeps fretted FORM slot fingerless');
            assert.strictEqual(note.fingeringWarning, false, shape + '/' + qualityKey + ' keeps undefined fingering distinct from a warning');
        });
    });
});

var c7sus4 = caged.getForm('E', '7sus4', 0, 13, 0);
var cM7sus4 = caged.getForm('E', 'M7sus4', 0, 13, 0);
var cNo5 = caged.getForm('E', 'no5', 0, 13, 0);
assert.strictEqual(cNo5.fingeringStatus, 'defined', 'existing candidate fingering remains distinct from undefined fingering');
assert(cNo5.notes.some(function (note) { return note.fingeringWarning === true; }), 'existing no5 warning markers remain warnings');
function diagramFrom(form, seventhLabel) {
    return {
        frets: [8, 9, 10],
        markers: form.notes.map(function (note) {
            var label = note.interval === 0 ? 'C' : (note.interval === 5 ? 'F' : (note.interval === 7 ? 'G' : seventhLabel));
            var role = note.interval === 0 ? 'root' : (note.interval === 5 ? 'third' : (note.interval === 7 ? 'fifth' : 'seventh'));
            return { string: note.string, fret: note.fret, label: label, role: role };
        }),
        barres: caged.detectBarres(form.notes), mutedStrings: form.mutedStrings
    };
}
[['7sus4', c7sus4, 'B♭', ['C', 'F', 'G', 'B♭']], ['M7sus4', cM7sus4, 'B', ['C', 'F', 'G', 'B']]].forEach(function (item) {
    var diagram = diagramFrom(item[1], item[2]);
    var staticSvg = fretboard.buildStaticSvg(diagram);
    var pngSvg = fretboard.buildExportSvg('C' + item[0], diagram).svg;
    item[3].forEach(function (label) {
        assert(staticSvg.indexOf('>' + label + '</text>') !== -1, item[0] + ' static SVG keeps ' + label);
        assert(pngSvg.indexOf('>' + label + '</text>') !== -1, item[0] + ' PNG SVG keeps ' + label);
    });
});
['../js/ui/explore.js', '../js/ui/save-editor.js', '../js/ui/library.js'].forEach(function (file) {
    var source = fs.readFileSync(__dirname + '/' + file, 'utf8');
    assert(source.indexOf('interval === 3 || interval === 4 || interval === 5') !== -1, file + ' maps fourths to the third role');
    assert(source.indexOf('interval === 9 || interval === 10 || interval === 11') !== -1, file + ' maps sevenths to the seventh role');
});
var exploreSource = fs.readFileSync(__dirname + '/../js/ui/explore.js', 'utf8');
assert(exploreSource.indexOf("form.fingeringStatus === 'undefined'") !== -1, 'explore separates undefined fingering from warning forms');
assert(exploreSource.indexOf('運指は未定義です。保存で編集できます。') !== -1, 'explore explains that undefined fingering remains editable in save editor');
assert(exploreSource.indexOf("type === 'undefined' ? '運指未定義'") !== -1, 'explore uses a non-warning notice label for undefined fingering');

var storedValues = {};
window.localStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(storedValues, key) ? storedValues[key] : null; },
    setItem: function (key, value) { storedValues[key] = String(value); },
    removeItem: function (key) { delete storedValues[key]; }
};
require('../js/core/storage.js');
var storage = window.ChordCruise.storage;
['7sus4', 'M7sus4'].forEach(function (qualityKey) {
    var form = caged.getForm('E', qualityKey, 0, 13, 0);
    var saved = storage.saveChord({
        chordName: qualityKey === '7sus4' ? 'C7sus4' : 'CM7sus4', formName: 'E型', shape: 'E', qualityKey: qualityKey, rootPc: 0,
        intervals: expected[qualityKey].intervals, fretRange: form.fretRange,
        notes: form.notes.map(function (note) {
            return { string: note.string, fret: note.fret, interval: note.interval, finger: note.finger, fingeringWarning: note.fingeringWarning };
        }),
        mutedStrings: form.mutedStrings, folderId: 'folder_uncategorized'
    });
    assert(saved, qualityKey + ' saves through the existing schema-1 transaction');
    var reloaded = storage.loadChord(saved.id);
    assert.strictEqual(reloaded.schemaVersion, 1, qualityKey + ' keeps schemaVersion 1');
    assert.strictEqual(reloaded.qualityKey, qualityKey, qualityKey + ' reloads its CAGED quality');
    assert.deepStrictEqual(reloaded.intervals, expected[qualityKey].intervals, qualityKey + ' reloads its intervals');
});
assert.deepStrictEqual(storage.loadChordIndex().map(function (entry) { return entry.chordName; }).sort(), ['C7sus4', 'CM7sus4'], 'both seventh-sus4 forms enter the existing library index');

console.log('7sus4-caged: 7sus4/M7sus4 qualities, Major-7th-derived 10 fixed FORM candidates, undefined fingering, 240 range scenarios, save/reload/library, and export labels OK');
