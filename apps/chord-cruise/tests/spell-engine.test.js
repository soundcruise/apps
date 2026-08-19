'use strict';

var assert = require('assert');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');

var theory = window.ChordCruise.theory;

function spell(qualityKey, intervals, degreeLabels, keyContext) {
    return theory.spellChordNotes({
        rootPc: 0,
        qualityKey: qualityKey,
        intervals: intervals,
        degreeLabels: degreeLabels,
        keyContext: keyContext || null
    });
}

assert.deepStrictEqual(spell('m'), ['C', 'E♭', 'G'], 'Cm');
assert.deepStrictEqual(spell('m7'), ['C', 'E♭', 'G', 'B♭'], 'Cm7');
assert.deepStrictEqual(spell('m7b5'), ['C', 'E♭', 'G♭', 'B♭'], 'Cm7b5');
assert.deepStrictEqual(spell('7'), ['C', 'E', 'G', 'B♭'], 'C7');
assert.deepStrictEqual(spell('maj7'), ['C', 'E', 'G', 'B'], 'CM7');
assert.deepStrictEqual(spell('6'), ['C', 'E', 'G', 'A'], 'C6');
assert.deepStrictEqual(spell('m6'), ['C', 'E♭', 'G', 'A'], 'Cm6');
assert.strictEqual(theory.solfegeNameForSpelling('E♭'), 'ミ♭');
assert.strictEqual(theory.solfegeNameForSpelling('B♭'), 'シ♭');

var cMinorContext = { tonicPc: 0, mode: 'minor' };
var cMajorContext = { tonicPc: 0, mode: 'major' };
assert.deepStrictEqual(spell('m', null, null, cMinorContext), ['C', 'E♭', 'G'], 'C minor key context uses E-flat');
assert.deepStrictEqual(spell('m7', null, null, cMinorContext), ['C', 'E♭', 'G', 'B♭'], 'C minor key context uses B-flat');
assert.deepStrictEqual(spell('maj', null, null, cMajorContext), ['C', 'E', 'G'], 'C major key context keeps natural notes');

// APIはquality補完と明示interval/degreeの両方を受け、既存noteName()は従来通り残る。
assert.deepStrictEqual(spell(null, [0, 3, 7], ['1', '♭3', '5']), ['C', 'E♭', 'G']);
assert.strictEqual(theory.noteName(3, false), 'D♯');
assert.strictEqual(theory.noteName(3, true), 'E♭');

assert.throws(function () {
    theory.spellChordNotes({ rootPc: 0, intervals: [0, 3], degreeLabels: ['1'] });
}, /matching intervals and degreeLabels/);

console.log('spell-engine: degree-based chord spelling, key-context priority, and legacy noteName compatibility OK');
