'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');

var theory = window.ChordCruise.theory;
var root = path.resolve(__dirname, '..');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
var saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');

function spell(options) {
    return theory.spellBassNote(Object.assign({ rootPc: 0, rootName: 'C' }, options));
}

// 構成音Bassはupper chordのdegreeを明示して綴る。
assert.strictEqual(spell({ bassPc: 4, bassInterval: 4, bassDegreeLabel: '3' }), 'E', 'C/E');
assert.strictEqual(spell({ bassPc: 10, bassInterval: 10, bassDegreeLabel: '♭7' }), 'B♭', 'C7/B♭');

// 非構成音BassはbassIntervalから既存のslash degreeを推定する。
assert.strictEqual(spell({ bassPc: 2 }), 'D', 'C/D');
assert.strictEqual(spell({ bassPc: 6 }), 'F♯', 'C/F♯');

// keyContextはroot spellingを優先し、Bassのdegree letterと結合する。
assert.strictEqual(theory.spellBassNote({
    rootPc: 1, bassPc: 8, bassInterval: 7, bassDegreeLabel: '5',
    keyContext: { tonicPc: 1, mode: 'major' }
}), 'A♭', 'D♭ major context spells its fifth as A♭');

assert.strictEqual(theory.solfegeNameForSpelling('B♭'), 'シ♭', 'Bass spelling reuses shared solfege conversion');
assert.strictEqual(theory.solfegeNameForSpelling('A♭'), 'ラ♭', 'key-context Bass spelling keeps flat solfege');
assert.throws(function () {
    spell({ bassPc: 2, bassInterval: 3 });
}, /bassInterval to match bassPc/, 'Bass pitch class and interval must agree');

assert(exploreSource.includes('function bassSpelledNoteName'), 'Explore resolves Bass labels through a dedicated spelling helper');
assert(exploreSource.includes('theory.spellBassNote({'), 'Explore calls spellBassNote for Bass overlay labels');
assert(exploreSource.includes('solfegeNameForSpelling(spelled)'), 'Explore derives Bass solfege from the resolved spelling');
assert(saveEditorSource.includes('function bassSpelledNoteName'), 'save-editor resolves Bass labels through a dedicated spelling helper');
assert(saveEditorSource.includes('spellBassNote({'), 'save-editor calls spellBassNote for Bass overlay labels');
assert(saveEditorSource.includes('solfegeNameForSpelling(spelled)'), 'save-editor derives Bass solfege from the resolved spelling');

console.log('spell-bass: structural and non-chord Bass spelling, key context, solfege, and Explore/save-editor integration OK');
