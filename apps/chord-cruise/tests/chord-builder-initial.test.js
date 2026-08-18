'use strict';

var assert = require('assert');

global.window = { ChordCruise: {} };
require('../js/ui/chord-builder.js');

var builder = window.ChordCruise.ui.chordBuilder;

assert.deepStrictEqual(builder.initialSpecForChord(null), {
    rootPc: 0, third: 4, fifth: 7, seventh: null, tensions: [], bassPc: null
}, 'no selected chord keeps the C major default');

assert.deepStrictEqual(builder.initialSpecForChord({ rootPc: 9, intervals: [0, 3, 7] }), {
    rootPc: 9, third: 3, fifth: 7, seventh: null, tensions: [], bassPc: null
}, 'selected Am starts the builder from Am');

assert.deepStrictEqual(builder.initialSpecForChord({ rootPc: 0, intervals: [0, 4, 7, 11] }), {
    rootPc: 0, third: 4, fifth: 7, seventh: 11, tensions: [], bassPc: null
}, 'selected CM7 carries its core selector values only');

assert.deepStrictEqual(builder.initialSpecForChord({ rootPc: 0, intervals: [0, 5, 7] }), {
    rootPc: 0, third: 5, fifth: 7, seventh: null, tensions: [], bassPc: null
}, 'sus4 remains representable when passed as an initial chord');

assert.deepStrictEqual(builder.initialSpecForChord({ source: 'custom', rootPc: 9, intervals: [0, 3, 7] }), {
    rootPc: 0, third: 4, fifth: 7, seventh: null, tensions: [], bassPc: null
}, 'a prior custom chord does not replace the diatonic-or-default entry point');

console.log('chord-builder-initial: selected diatonic core values and default fallback OK');
