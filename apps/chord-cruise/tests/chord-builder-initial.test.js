'use strict';

var assert = require('assert');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/chord-model.js');
require('../js/ui/chord-builder.js');

var builder = window.ChordCruise.ui.chordBuilder;

function expected(rootPc, third, fifth, seventh, tensions, bassPc) {
    return {
        rootPc: rootPc,
        third: third,
        fifth: fifth,
        seventh: seventh,
        tensions: tensions || [],
        bassPc: bassPc === undefined ? null : bassPc
    };
}

assert.deepStrictEqual(builder.initialSpecForChord(null), expected(0, 4, 7, null),
    'no selected chord keeps the C major default');

assert.deepStrictEqual(builder.initialSpecForChord({ rootPc: 9, intervals: [0, 3, 7] }), expected(9, 3, 7, null),
    'selected Am starts the builder from Am');
assert.deepStrictEqual(builder.initialSpecForChord({ rootPc: 0, intervals: [0, 4, 7, 10] }), expected(0, 4, 7, 10),
    'selected C7 restores its core selector values');
assert.deepStrictEqual(builder.initialSpecForChord({ rootPc: 0, intervals: [0, 4, 7, 11] }), expected(0, 4, 7, 11),
    'selected CM7 restores its core selector values');
assert.deepStrictEqual(builder.initialSpecForChord({ rootPc: 0, qualityKey: '6', intervals: [0, 4, 7, 9] }), expected(0, 4, 7, 9),
    'selected C6 restores its core selector values');
assert.deepStrictEqual(builder.initialSpecForChord({ rootPc: 0, intervals: [0, 3, 7, 10] }), expected(0, 3, 7, 10),
    'selected Cm7 restores its core selector values');

assert.deepStrictEqual(builder.initialSpecForChord({ rootPc: 0, qualityKey: 'power5', intervals: [0, 7] }), expected(0, null, 7, null),
    'C5 is restored from its quality definition');
assert.deepStrictEqual(builder.initialSpecForChord({ rootPc: 0, qualityKey: 'no5', intervals: [0, 4] }), expected(0, 4, null, null),
    'C(no5) is restored from its quality definition');
assert.deepStrictEqual(builder.initialSpecForChord({ rootPc: 0, qualityKey: '7no5', intervals: [0, 4, 10] }), expected(0, 4, null, 10),
    'C7(no5) is restored from its quality definition');
assert.deepStrictEqual(builder.initialSpecForChord({ rootPc: 0, qualityKey: 'maj7no5', intervals: [0, 4, 11] }), expected(0, 4, null, 11),
    'CM7(no5) is restored from its quality definition');
assert.deepStrictEqual(builder.initialSpecForChord({ rootPc: 0, qualityKey: 'm7no5', intervals: [0, 3, 10] }), expected(0, 3, null, 10),
    'Cm7(no5) is restored from its quality definition');
assert.deepStrictEqual(builder.initialSpecForChord({ rootPc: 0, qualityKey: '7sus4', intervals: [0, 5, 7, 10] }), expected(0, 5, 7, 10),
    'C7sus4 is restored from its quality definition');
assert.deepStrictEqual(builder.initialSpecForChord({ rootPc: 0, qualityKey: 'M7sus4', intervals: [0, 5, 7, 11] }), expected(0, 5, 7, 11),
    'CM7sus4 is restored from its quality definition');

assert.deepStrictEqual(builder.initialSpecForChord({
    source: 'custom',
    rootPc: 0,
    qualityKey: 'm7',
    intervals: [0, 3, 7, 10],
    spec: { rootPc: 0, third: 4, fifth: 7, seventh: null, tensions: [14], bassPc: 4 }
}), expected(0, 4, 7, null, [14], 4),
    'custom chord spec has priority over derived quality data and keeps a tension and slash bass');

assert.deepStrictEqual(builder.initialSpecForChord({
    rootPc: 0,
    qualityKey: 'maj',
    coreIntervals: [0, 4, 7],
    tensionPcs: [9, 2],
    bassPc: 0
}), expected(0, 4, 7, null, [14, 21], null),
    'saved-style tension PCs are restored in degree order and a root bass normalizes to normal');

assert.deepStrictEqual(builder.defaultInitialSpec(), expected(0, 4, 7, null),
    'reset target is the original C major default');

var builderSource = require('fs').readFileSync(require('path').join(__dirname, '../js/ui/chord-builder.js'), 'utf8');
assert.ok(builderSource.indexOf('id="cc-builder-reset"') !== -1,
    'the builder renders a reset button');
assert.ok(builderSource.indexOf('applyInitialSpec(defaultInitialSpec())') !== -1,
    'reset reuses the default initial state and clears hand-edited naming through the shared initializer');

console.log('chord-builder-initial: complete chord copy and reset default OK');
