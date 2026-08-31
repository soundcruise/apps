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

var ordinaryOpenWithExploreOption = fretboard.createModel({
    frets: [0, 1, 2, 3],
    markers: [marker(6, 0, 'open'), marker(6, 3, 'G')],
    preserveOpenBassCandidates: true
});
assert.deepStrictEqual(ordinaryOpenWithExploreOption.markers.map(function (item) { return [item.string, item.fret]; }), [[6, 3]], 'the Explore option preserves Bass candidates only, not ordinary conflicting open notes');

var mergedFormBassWithOpen = fretboard.createModel({
    frets: [0, 1, 2, 3, 4, 5, 6, 7],
    markers: [
        marker(5, 0, 'A'),
        marker(5, 7, 'E', { isBassCandidate: true })
    ],
    preserveOpenBassCandidates: true
});
assert.deepStrictEqual(mergedFormBassWithOpen.markers.map(function (item) { return [item.string, item.fret]; }), [[5, 7]], 'a Bass flag merged onto an actual FORM note still suppresses a conflicting ordinary open note');

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

var ordinaryOpenWithSameStringMute = fretboard.createModel({
    frets: [0, 1, 2, 3],
    markers: [marker(5, 0, 'A')],
    mutedStrings: [5]
});
assert.deepStrictEqual(ordinaryOpenWithSameStringMute.mutedStrings, [], 'an active ordinary 0F marker suppresses the same-string mute mark');

var openBassWithSameStringMuteOptions = {
    frets: [0, 1, 2, 3],
    markers: [marker(5, 0, 'A', { isOverlay: true, overlayType: 'bass', isBassCandidate: true })],
    mutedStrings: [5],
    preserveOpenBassCandidates: true
};
var openBassWithSameStringMute = fretboard.createModel(openBassWithSameStringMuteOptions);
assert.deepStrictEqual(openBassWithSameStringMute.mutedStrings, [], 'an active 0F Bass candidate suppresses the same-string mute mark');
assert(openBassWithSameStringMute.markers[0].isBassCandidate, 'the open Bass candidate remains visible');
assert.strictEqual(fretboard.buildStaticSvg(openBassWithSameStringMuteOptions).indexOf('cc-fb-static-mute'), -1, 'static SVG/folder PNG card omits the conflicting mute mark');
assert.strictEqual(fretboard.buildExportSvg('D/A', openBassWithSameStringMuteOptions).svg.indexOf('cc-fb-static-mute'), -1, 'individual PNG source SVG omits the conflicting mute mark');

var pendingDeleteOpenWithMute = fretboard.createModel({
    frets: [0, 1, 2, 3],
    markers: [marker(5, 0, 'A', { pendingDelete: true })],
    mutedStrings: [5]
});
assert.deepStrictEqual(pendingDeleteOpenWithMute.mutedStrings, [5], 'a pending-delete 0F marker is not treated as an active open sound');

var muteWithoutSound = fretboard.createModel({
    frets: [0, 1, 2, 3],
    markers: [],
    mutedStrings: [5]
});
assert.deepStrictEqual(muteWithoutSound.mutedStrings, [5], 'a mute remains visible when no active marker exists');

// HTML renderもcreateModelの最終結果だけをDOMへ反映する。
function fakeElement() {
    return {
        className: '', style: {}, dataset: {}, children: [],
        setAttribute: function (name, value) { this[name] = value; },
        appendChild: function (child) { this.children.push(child); },
        addEventListener: function () {}
    };
}
var markerLayer = fakeElement();
var stage = fakeElement();
var scroll = fakeElement();
scroll.scrollLeft = 0;
var host = {
    classList: { toggle: function () {} },
    setAttribute: function () {},
    removeAttribute: function () {},
    querySelector: function (selector) {
        if (selector === '.cc-fb-markers') return markerLayer;
        if (selector === '.cc-fb-stage') return stage;
        if (selector === '.cc-fb-scroll') return scroll;
        return null;
    }
};
global.document = { createElement: fakeElement };
fretboard.render(host, openBassWithSameStringMuteOptions);
assert.strictEqual(markerLayer.children.filter(function (element) { return element.className === 'cc-fb-mute'; }).length, 0, 'HTML render creates no conflicting mute element');
assert.strictEqual(markerLayer.children.filter(function (element) { return element.className.indexOf('cc-fb-marker') === 0; }).length, 1, 'HTML render keeps the active open marker');

console.log('open-string-conflict: active fretted/open markers suppress same-string mute display across HTML/SVG/PNG');
