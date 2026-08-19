'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/chord-model.js');

var theory = window.ChordCruise.theory;
var chordModel = window.ChordCruise.chordModel;
var root = path.resolve(__dirname, '..');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
var saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');

[
    [{ rootPc: 0, third: 3, fifth: 7, seventh: null, tensions: [] }, ['C', 'E♭', 'G'], ['ド', 'ミ♭', 'ソ'], 'Cm'],
    [{ rootPc: 0, third: 3, fifth: 7, seventh: 10, tensions: [] }, ['C', 'E♭', 'G', 'B♭'], ['ド', 'ミ♭', 'ソ', 'シ♭'], 'Cm7'],
    [{ rootPc: 0, third: 3, fifth: 6, seventh: 10, tensions: [] }, ['C', 'E♭', 'G♭', 'B♭'], ['ド', 'ミ♭', 'ソ♭', 'シ♭'], 'Cm7♭5'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 10, tensions: [] }, ['C', 'E', 'G', 'B♭'], ['ド', 'ミ', 'ソ', 'シ♭'], 'C7'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 11, tensions: [] }, ['C', 'E', 'G', 'B'], ['ド', 'ミ', 'ソ', 'シ'], 'CM7'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 9, tensions: [] }, ['C', 'E', 'G', 'A'], ['ド', 'ミ', 'ソ', 'ラ'], 'C6'],
    [{ rootPc: 0, third: 3, fifth: 7, seventh: 9, tensions: [] }, ['C', 'E♭', 'G', 'A'], ['ド', 'ミ♭', 'ソ', 'ラ'], 'Cm6']
].forEach(function (fixture) {
    var chord = chordModel.buildCustomChord(fixture[0], '');
    var names = theory.spellChordNotes({
        rootPc: chord.rootPc,
        rootName: chordModel.CUSTOM_ROOT_NAMES[chord.rootPc],
        qualityKey: chord.qualityKey,
        intervals: chord.intervals,
        degreeLabels: chord.degreeLabelsList,
        keyContext: null
    });
    assert.deepStrictEqual(names, fixture[1], fixture[3] + ' CDE spelling');
    assert.deepStrictEqual(names.map(theory.solfegeNameForSpelling), fixture[2], fixture[3] + ' solfege spelling');
    assert.strictEqual(chord.degreeLabelsList.length, names.length, fixture[3] + ' degree count stays aligned');
});

assert(exploreSource.includes('function customChordSpelledNoteNames'), 'Explore isolates custom chord spelling');
assert(exploreSource.includes('spellChordNotes({'), 'Explore calls spellChordNotes for arbitrary chord labels');
assert(exploreSource.includes('function chordSolfegeName'), 'Explore derives solfege from the same spelling');
assert(saveEditorSource.includes('spelledNoteNames = theory().spellChordNotes({'), 'save-editor calls spellChordNotes for preview labels');
assert(saveEditorSource.includes('solfegeNameForSpelling'), 'save-editor derives solfege from the spelling result');
assert(saveEditorSource.includes('diatonicNoteNamesForContext('), 'save-editor retains the legacy fallback');

console.log('spell-integration: Explore/save-editor custom CDE and solfege spelling integration with fallback OK');
