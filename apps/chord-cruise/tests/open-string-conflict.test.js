'use strict';

var assert = require('assert');

global.window = { ChordCruise: {} };
require('../js/ui/fretboard.js');

var fretboard = window.ChordCruise.ui.fretboard;

function marker(stringNum, fret, label, extra) {
    var value = {
        string: stringNum,
        fret: fret,
        label: label || '',
        role: 'other'
    };
    Object.keys(extra || {}).forEach(function (key) { value[key] = extra[key]; });
    return value;
}

var frettedWithMute = fretboard.createModel({
    frets: [0, 1, 2, 3],
    markers: [marker(6, 3, 'G')],
    mutedStrings: [6]
});
assert.deepStrictEqual(frettedWithMute.mutedStrings, [], 'a fretted marker suppresses the same string mute mark');
assert.deepStrictEqual(frettedWithMute.markers.map(function (item) { return [item.string, item.fret]; }), [[6, 3]], 'the fretted marker remains visible');
assert.strictEqual(fretboard.buildStaticSvg({
    frets: [0, 1, 2, 3], markers: [marker(6, 3, 'G')], mutedStrings: [6]
}).indexOf('cc-fb-static-mute'), -1, 'static SVG/PNG omits a conflicting mute mark');

var bassOverlayWithMute = fretboard.createModel({
    frets: [0, 1, 2, 3],
    markers: [marker(6, 3, 'G', { isOverlay: true, overlayType: 'bass', isBassCandidate: true })],
    mutedStrings: [6]
});
assert.deepStrictEqual(bassOverlayWithMute.mutedStrings, [], 'a Bass overlay is also a visible fretted marker');
assert(fretboard.buildStaticSvg({
    frets: [0, 1, 2, 3],
    markers: [marker(6, 3, 'G', { isOverlay: true, overlayType: 'bass', isBassCandidate: true })],
    mutedStrings: [6]
}).includes('#e8c97a'), 'the Bass overlay remains intact after conflict normalization');

var openAndFretted = fretboard.createModel({
    frets: [0, 1, 2, 3],
    markers: [marker(6, 0, 'open'), marker(6, 3, 'G')]
});
assert.deepStrictEqual(openAndFretted.markers.map(function (item) { return [item.string, item.fret]; }), [[6, 3]], 'a same-string open marker is hidden when a fretted marker exists');

var pendingDelete = fretboard.createModel({
    frets: [0, 1, 2, 3],
    markers: [marker(6, 0, 'open'), marker(6, 3, 'G', { pendingDelete: true })],
    mutedStrings: [5]
});
assert.deepStrictEqual(pendingDelete.markers.map(function (item) { return [item.string, item.fret]; }), [[6, 0], [6, 3]], 'a pending-delete marker does not suppress an open-string marker');
assert.deepStrictEqual(pendingDelete.mutedStrings, [5], 'unrelated mute marks remain visible');

var openOnly = fretboard.createModel({
    frets: [0, 1, 2, 3],
    markers: [marker(6, 0, 'open')],
    mutedStrings: [5]
});
assert.deepStrictEqual(openOnly.markers.map(function (item) { return [item.string, item.fret]; }), [[6, 0]], 'ordinary open-string markers remain visible');
assert.deepStrictEqual(openOnly.mutedStrings, [5], 'ordinary mute marks remain visible when the string has no fretted marker');

console.log('open-string-conflict: fretted markers suppress only same-string 0F open/mute display');
