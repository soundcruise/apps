'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const builderSource = fs.readFileSync(path.join(root, 'js/ui/chord-builder.js'), 'utf8');
const exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
const saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
const librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');

assert(builderSource.includes('<option value="">通常</option>'), 'Bass selector names the root-position state 通常');
assert(builderSource.includes('<optgroup label="構成音">'), 'Bass selector groups every current chord tone');
assert(builderSource.includes('<optgroup label="その他のベース音">'), 'Bass selector separately groups non-chord bass tones');
assert(builderSource.includes('nonChordBassCandidates'), 'Bass selector fills every non-root pitch class');
assert(exploreSource.includes('bassDegreeLabel(overlay.interval)'), 'Explore gives non-chord bass its slash degree');
assert(saveEditorSource.includes('bassNoteName(note.pc)'), 'save editor keeps Bass-specific spelling');
assert(librarySource.includes('bassNoteName(overlay.pc)'), 'library and export keep Bass-specific spelling');
assert(storageSource.includes('record.schemaVersion = 1'), 'non-chord bass retains schemaVersion 1 without migration');

global.window = { ChordCruise: { state: { settings: { fretboardDisplayMode: 'note' } } } };
global.document = { addEventListener() {} };
require('../js/core/music-theory.js');
require('../js/core/chord-model.js');
require('../js/core/caged-forms.js');
require('../js/ui/fretboard.js');
require('../js/ui/library.js');

const model = window.ChordCruise.chordModel;
const savedDiagramOptions = window.ChordCruise.ui.library.savedDiagramOptions;
const major = { rootPc: 0, third: 4, fifth: 7, seventh: null, tensions: [] };
const maj7 = { rootPc: 0, third: 4, fifth: 7, seventh: 11, tensions: [] };
const dominant7 = { rootPc: 0, third: 4, fifth: 7, seventh: 10, tensions: [] };
const maj7add9 = { rootPc: 0, third: 4, fifth: 7, seventh: 11, tensions: [14] };

assert.deepStrictEqual(model.bassCandidates(major), [4, 7], 'triad selector has every non-root chord tone');
assert.deepStrictEqual(model.bassCandidates(maj7), [4, 7, 11], 'CM7 selector includes its 7th');
assert.deepStrictEqual(model.bassCandidates(dominant7), [4, 7, 10], 'C7 selector includes B♭');
assert.deepStrictEqual(model.bassCandidates(maj7add9), [4, 7, 11, 2], 'CM7(9) selector includes its tension tone');
assert.deepStrictEqual(model.nonChordBassCandidates(major), [1, 2, 3, 5, 6, 8, 9, 10, 11], 'other Bass options cover all remaining non-root pitch classes');
assert.strictEqual(model.bassNoteName(10), 'B♭');
assert.strictEqual(model.bassNoteName(3), 'E♭');
assert.strictEqual(model.bassNoteName(8), 'A♭');
assert.strictEqual(model.bassNoteName(6), 'F♯', 'existing sharp Bass spelling remains natural');

const cOverBb = model.buildCustomChord(Object.assign({}, major, { bassPc: 10 }), '');
const cOverD = model.buildCustomChord(Object.assign({}, major, { bassPc: 2 }), '');
const cOverF = model.buildCustomChord(Object.assign({}, major, { bassPc: 5 }), '');
assert.strictEqual(cOverBb.symbol, 'C/B♭');
assert.strictEqual(cOverD.symbol, 'C/D');
assert.strictEqual(cOverF.symbol, 'C/F');
assert.strictEqual(model.buildCustomChord(Object.assign({}, major, { bassPc: 0 }), '').symbol, 'C', 'root selection remains the normal state, never C/C');
assert.deepStrictEqual(cOverBb.intervals, [0, 4, 7], 'non-chord bass never enters upper intervals');
assert.strictEqual(cOverBb.qualityKey, 'maj', 'non-chord bass never changes CAGED quality');
assert.strictEqual(model.bassDegreeLabel(10), '♭7');
assert.strictEqual(model.bassDegreeLabel(2), '9');

const savedBase = {
    rootPc: 0, intervals: [0, 4, 7],
    fretRange: { min: 0, max: 6, includesOpen: true },
    notes: [
        { string: 5, fret: 3, interval: 0, finger: 3 },
        { string: 4, fret: 2, interval: 4, finger: 2 },
        { string: 3, fret: 0, interval: 7, finger: null },
        { string: 2, fret: 1, interval: 0, finger: 1 },
        { string: 1, fret: 0, interval: 4, finger: null }
    ], mutedStrings: [6]
};
const savedBb = savedDiagramOptions(Object.assign({ chordName: 'C/B♭', bassPc: 10 }, savedBase), { mode: 'note' });
const savedD = savedDiagramOptions(Object.assign({ chordName: 'C/D', bassPc: 2 }, savedBase), { mode: 'degree' });
const bbMarker = savedBb.markers.find((marker) => marker.isBassCandidate && marker.isOverlay);
const dMarker = savedD.markers.find((marker) => marker.isBassCandidate && marker.isOverlay);
assert(bbMarker && bbMarker.label === 'B♭', 'library rebuilds non-chord Bass with flat CDE spelling');
assert(dMarker && dMarker.label === '9', 'library rebuilds non-chord Bass with its slash degree');
assert(window.ChordCruise.ui.fretboard.buildStaticSvg(savedBb).includes('#e8c97a'), 'SVG/PNG shared renderer retains the Bass ring');

console.log('non-chord-bass: selector groups, non-chord symbols, degree labels, save/library/export compatibility OK');
