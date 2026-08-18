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
const storageSource = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');

function custom(tensions, seventh) {
    return model.buildCustomChord({
        rootPc: 0, third: 4, fifth: 7,
        seventh: seventh == null ? null : seventh,
        tensions: tensions, bassPc: null
    }, '');
}

const cadd9 = custom([14]);
assert.strictEqual(cadd9.symbol, 'Cadd9', 'a triad plus 9 must not be named C9');
assert.strictEqual(cadd9.qualityKey, 'maj', 'tension never changes the upper CAGED quality');
assert.deepStrictEqual(cadd9.coreIntervals, [0, 4, 7]);
assert.deepStrictEqual(cadd9.tensionIntervals, [14]);
assert.deepStrictEqual(cadd9.intervals, [0, 4, 7, 2], 'display theory continues to contain the tension tone');
assert.strictEqual(cadd9.degreeLabelsList[3], '9');

const cmaj7add9 = custom([14], 11);
assert.strictEqual(cmaj7add9.symbol, 'CM7(9)');
assert.strictEqual(cmaj7add9.qualityKey, 'maj7', 'Cmaj7(add9) still selects its unmodified maj7 FORM');
assert.deepStrictEqual(cmaj7add9.coreIntervals, [0, 4, 7, 11]);
assert.deepStrictEqual(cmaj7add9.tensionIntervals, [14]);

const c7add9 = custom([14], 10);
assert.strictEqual(c7add9.symbol, 'C7(9)');
assert.strictEqual(c7add9.qualityKey, '7', 'C7(add9) still selects its unmodified dominant-7 FORM');
assert.strictEqual(custom([17]).qualityKey, 'maj', 'Cadd11 still selects its unmodified major FORM');

[
    [{ rootPc: 0, third: 4, fifth: 7, seventh: null, tensions: [17], bassPc: null }, 'Cadd11'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: null, tensions: [21], bassPc: null }, 'Cadd13'],
    [{ rootPc: 0, third: 3, fifth: 7, seventh: null, tensions: [14], bassPc: null }, 'Cmadd9'],
    [{ rootPc: 0, third: 3, fifth: 7, seventh: 10, tensions: [14], bassPc: null }, 'Cm7(9)'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 11, tensions: [18], bassPc: null }, 'CM7(♯11)'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: 10, tensions: [20], bassPc: null }, 'C7(♭13)'],
    [{ rootPc: 0, third: 4, fifth: 8, seventh: 11, tensions: [14], bassPc: null }, 'CM7♯5(9)'],
    [{ rootPc: 0, third: 4, fifth: 7, seventh: null, tensions: [14], bassPc: 4 }, 'Cadd9/E']
].forEach(([spec, symbol]) => {
    assert.strictEqual(model.buildCustomChord(spec, '').symbol, symbol);
});

Object.keys(model.TENSION_LABELS).forEach((value) => {
    const tension = Number(value);
    const chord = custom([tension]);
    assert.strictEqual(chord.tensionIntervals[0], tension);
    assert.strictEqual(chord.degreeLabelsList[3], model.TENSION_LABELS[tension]);
});

const normal = model.tensionOverlayNotes({ rootPc: 0, tensionIntervals: [14], startFret: 0, endFret: 13 });
assert.deepStrictEqual(normal.map((note) => [note.string, note.fret]), [[3, 7], [2, 3], [1, 10]], 'C 9 candidates use only strings 1–3');
assert(normal.every((note) => note.type === 'tension' && note.overlayType === 'tension'));
assert(normal.every((note) => note.finger === null && note.fingeringWarning === false));
assert(normal.every((note) => [1, 2, 3].includes(note.string)));

const high = model.tensionOverlayNotes({ rootPc: 0, tensionIntervals: [14], startFret: 12, endFret: 25 });
assert.deepStrictEqual(high.map((note) => [note.string, note.fret]), [[3, 19], [2, 15], [1, 22]], 'high-fret candidates are recalculated within the current range');

const rendered = fretboard.createModel({
    startFret: 0, endFret: 3,
    markers: [{ string: 2, fret: 3, label: 'D', role: 'other', isOverlay: true, overlayType: 'tension', isTensionCandidate: true }]
});
assert.strictEqual(rendered.markers[0].isOverlay, true);
assert.strictEqual(rendered.markers[0].isTensionCandidate, true, 'renderer retains the tension candidate marker state');
assert.strictEqual(rendered.markers[0].isBassCandidate, false);

assert(exploreSource.includes('mergeTensionOverlayMarkers'), 'CAGED display has a dedicated tension merge path');
assert(exploreSource.includes('existingBySlot[key].isTensionCandidate = true'), 'a FORM slot is marked instead of duplicated');
assert(exploreSource.includes("overlayType: overlay.type") && exploreSource.includes('isTensionCandidate: true'), 'overlay-only notes explicitly remain non-FORM candidates');
assert(exploreSource.includes("mode === 'finger') return '';"), 'finger mode leaves tension candidate labels blank');
assert(!exploreSource.includes('テンション付きコードの保存は今後対応予定です'), 'Phase F2 lets CAGED-compatible tension chords use the existing save entry');
assert(!storageSource.includes('tensionIntervals'), 'the storage layer still has no migration or position-list field');

assert(themeSource.includes('.cc-fb-marker--tension-candidate'), 'tension candidates receive their own visual class');
assert(themeSource.includes('0 0 0 4px var(--cc-gold),'), 'tension uses the existing darker gold token, distinct from Bass bright gold');
assert(themeSource.includes('.cc-fb-host--monochrome .cc-fb-marker--tension-candidate'));

console.log('tension-overlay: upper-quality CAGED, 1–3 string candidates, merge state, blank Explore fingering, and Phase F2 save entry OK');
