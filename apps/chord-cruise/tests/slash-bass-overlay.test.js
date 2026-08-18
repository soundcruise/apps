'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/chord-model.js');
require('../js/ui/fretboard.js');

const root = path.resolve(__dirname, '..');
const model = window.ChordCruise.chordModel;
const fretboard = window.ChordCruise.ui.fretboard;
const exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
const themeSource = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');

function custom(rootPc, third, fifth, seventh, bassPc) {
    return model.buildCustomChord({ rootPc, third, fifth, seventh, tensions: [], bassPc }, '');
}

const cOverE = custom(0, 4, 7, null, 4);
assert.strictEqual(cOverE.symbol, 'C/E');
assert.strictEqual(cOverE.bassPc, 4);
assert.deepStrictEqual(cOverE.intervals, [0, 4, 7], 'bassPc never enters upper intervals');
assert.strictEqual(cOverE.qualityKey, 'maj', 'bassPc never changes upper quality');
assert.deepStrictEqual(model.bassCandidates(cOverE.spec), [4, 7], 'root is excluded from C slash candidates');

assert.strictEqual(custom(0, 4, 7, null, 7).symbol, 'C/G');
assert.strictEqual(custom(7, 4, 7, null, 11).symbol, 'G/B');
assert.strictEqual(custom(2, 4, 7, null, 6).symbol, 'D/F♯');
assert.strictEqual(custom(9, 3, 7, null, 0).symbol, 'Am/C');
const dm7OverC = custom(2, 3, 7, 10, 0);
assert.strictEqual(dm7OverC.symbol, 'Dm7/C');
assert.strictEqual(dm7OverC.degreeLabelsList[dm7OverC.intervals.indexOf(10)], '♭7');
assert.deepStrictEqual(model.bassCandidates(dm7OverC.spec), [5, 9, 0]);

assert.strictEqual(custom(0, 4, 7, null, 0).bassPc, null, 'root bass falls back to normal root position');
assert.strictEqual(custom(0, 4, 7, null, 10).symbol, 'C/B♭', 'non-chord bass uses the Bass-specific flat spelling');
assert.strictEqual(custom(0, 4, 7, null, 10).bassPc, 10, 'non-chord bass remains semantic bassPc without changing the upper chord');

const normal = model.bassOverlayNotes({ bassPc: 4, rootPc: 0, intervals: [0, 4, 7], startFret: 0, endFret: 13 });
assert.deepStrictEqual(normal.map((note) => [note.string, note.fret]), [[6, 0], [6, 12], [5, 7], [4, 2]], 'normal range returns every 4–6 string E candidate');
assert(normal.every((note) => note.type === 'bass' && note.overlayType === 'bass' && note.finger === null && note.fingeringWarning === false));
assert(normal.every((note) => [4, 5, 6].includes(note.string)), 'bass overlay never targets strings 1–3');
const high = model.bassOverlayNotes({ bassPc: 4, rootPc: 0, intervals: [0, 4, 7], startFret: 12, endFret: 25 });
assert.deepStrictEqual(high.map((note) => [note.string, note.fret]), [[6, 12], [6, 24], [5, 19], [4, 14]], 'high range recalculates every candidate');

const rendered = fretboard.createModel({
    startFret: 0,
    endFret: 2,
    markers: [{ string: 4, fret: 2, label: '', role: 'third', isOverlay: true, overlayType: 'bass', isBassCandidate: true }]
});
assert.strictEqual(rendered.markers[0].isOverlay, true);
assert.strictEqual(rendered.markers[0].isBassCandidate, true);
assert(fretboard.buildStaticSvg({ startFret: 0, endFret: 2, markers: rendered.markers }).includes('#e8c97a'), 'static model preserves the double gold bass outline');
assert(fretboard.buildStaticSvg({ startFret: 0, endFret: 2, markers: [{ string: 4, fret: 2, label: 'E', role: 'third' }] }).indexOf('#e8c97a') === -1, 'ordinary non-bass markers never receive the bass ring');

assert(themeSource.includes('0 0 0 2px var(--cc-bg),\n        0 0 0 4px var(--cc-gold-bright)'), 'bass CSS paints the 2px dark separator in front of the independent 2px gold outer ring');
assert(themeSource.includes('外径は通常30pxより8pxだけ大きい38px'), 'bass ring exterior remains intentionally bounded for the mobile grid');
assert(themeSource.includes('.cc-fb-host--monochrome .cc-fb-marker--bass-candidate'), 'monochrome keeps the same ring-shaped bass distinction');

assert(exploreSource.includes('mergeBassOverlayMarkers'), 'CAGED and full fretboard share the bass overlay merge path');
assert(exploreSource.includes('existingBySlot[key].isBassCandidate = true'), 'overlapping FORM notes are merged instead of duplicated');
assert(exploreSource.includes('isOverlay: true') && exploreSource.includes("overlayType: overlay.type"), 'non-FORM candidates remain explicit overlay markers');
assert(!exploreSource.includes('!chord || !form || chord.bassPc != null'), 'E2 lets a CAGED-compatible slash chord enter the existing save route');
assert(!exploreSource.includes('分数コードの保存は今後対応予定です'), 'CAGED-compatible slash chords no longer show the obsolete save-disabled hint');
assert(exploreSource.includes('運指は表示していません'), 'finger mode explains that overlay candidates have no fingering');

console.log('slash-bass-overlay: optional bassPc, symbols, 4–6 string overlays, merge flags, and E2 save entry OK');
