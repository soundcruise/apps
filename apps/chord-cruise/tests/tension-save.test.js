'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const saveEditor = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
const library = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
const explore = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');

assert(saveEditor.includes('tensionPcs: tensionPcs'), 'new saves retain only semantic tension PCs');
assert(saveEditor.includes('tensionFingerings: []'), 'new drafts start with no tension fingering override');
assert(saveEditor.includes('record.tensionPcs = clone(draft.tensionPcs)'), 'tension PCs persist with the record');
assert(saveEditor.includes('tensionFingeringsForRecord'), 'only non-FORM tension candidate overrides persist');
assert(saveEditor.includes('normalizeTensionFingerings(original.tensionFingerings'), 'old and new records reload through the same optional field');
assert(saveEditor.includes('cycleTensionFingering'), 'overlay-only tension markers reuse the existing editor cycle');
assert(saveEditor.includes('isTensionCandidate = true'), 'FORM overlap is merged instead of adding a second marker');
assert(!explore.includes('テンション付きコードの保存は今後対応予定です'), 'CAGED-compatible tension chords now enter the existing save route');

const rangeFunctionSource = saveEditor.slice(
    saveEditor.indexOf('function rangeWithBassCandidates'),
    saveEditor.indexOf('function normalizeBassFingerings')
);

assert(library.includes('mergeSavedTensionOverlay'), 'list, detail, SVG, and PNG rebuild saved tension candidates together');
assert(library.includes('tensionOverlayNotes'), 'library regenerates candidates from PCs and saved range');
assert(library.includes('tensionFingerings'), 'library keeps only per-candidate overrides');
assert(library.includes('isTensionCandidate: true'), 'saved overlay-only candidates retain their visual identity');
assert(library.includes('tensionEntry && tensionEntry.pendingDelete === true'), 'normal diagrams omit pending-deleted tension candidates');

global.window = { ChordCruise: { state: { settings: { fretboardDisplayMode: 'note' } } } };
global.document = { addEventListener() {} };
require('../js/core/music-theory.js');
require('../js/core/chord-model.js');
require('../js/core/caged-forms.js');
require('../js/ui/fretboard.js');
require('../js/ui/library.js');

const model = window.ChordCruise.chordModel;
const savedDiagramOptions = window.ChordCruise.ui.library.savedDiagramOptions;
const rangeWithBassCandidates = new Function('validBassPc', 'window', `${rangeFunctionSource}; return rangeWithBassCandidates;`)(
    (value) => typeof value === 'number' && Math.floor(value) === value && value >= 0 && value <= 11 ? value : null,
    window
);
const rootPc = 0;
assert.deepStrictEqual(model.tensionPcsForIntervals(rootPc, [21, 14]), [2, 9], 'multiple tensions normalize in degree order, not input order');
assert.deepStrictEqual(model.tensionIntervalsForPcs(rootPc, [9, 2]), [14, 21], 'saved PCs restore the same degree order');

const formRange = { min: 0, max: 3, includesOpen: true };
assert.deepStrictEqual(
    rangeWithBassCandidates({ rootPc, intervals: [0, 4, 7], tensionIntervals: [14] }, formRange),
    formRange,
    'Cadd9 default save range remains based on the CAGED FORM, not remote tension candidates'
);
assert.deepStrictEqual(
    rangeWithBassCandidates({ rootPc, intervals: [0, 4, 7, 11], tensionIntervals: [14, 21] }, formRange),
    formRange,
    'CM7(9,13) does not over-expand the default save range'
);
const aForm = window.ChordCruise.caged.getForm('A', 'maj', rootPc, 13, 0);
const slashRange = rangeWithBassCandidates({ rootPc, bassPc: 4, intervals: [0, 4, 7] }, aForm.displayRange);
assert.strictEqual(slashRange.min, 2, 'C/E preserves Phase E2 bass-driven expansion to the nearby 4th-string 2F E');
assert.strictEqual(slashRange.max, aForm.displayRange.max, 'slash expansion does not alter the FORM upper bound');
assert.deepStrictEqual(
    rangeWithBassCandidates({ rootPc, intervals: [0, 4, 7] }, formRange),
    formRange,
    'ordinary chord save range remains unchanged'
);

const cmaj7 = {
    chordName: 'CM7(9,13)', rootPc: 0, intervals: [0, 4, 7, 11, 2, 9],
    tensionPcs: [2, 9],
    fretRange: { min: 0, max: 10, includesOpen: true },
    notes: [
        { string: 5, fret: 3, interval: 0, finger: 3 },
        { string: 4, fret: 2, interval: 4, finger: 2 },
        { string: 3, fret: 0, interval: 7, finger: null },
        { string: 2, fret: 0, interval: 11, finger: null },
        { string: 1, fret: 0, interval: 4, finger: null }
    ], mutedStrings: [6]
};
const diagram = savedDiagramOptions(cmaj7, { mode: 'note' });
const tensionMarkers = diagram.markers.filter((marker) => marker.isTensionCandidate);
assert.strictEqual(tensionMarkers.length, 6, 'two saved tensions regenerate every 1–3 string candidate inside the saved range');
assert(tensionMarkers.every((marker) => [1, 2, 3].includes(marker.string)), 'tension candidates never enter bass strings');
assert(tensionMarkers.every((marker) => marker.fret >= cmaj7.fretRange.min && marker.fret <= cmaj7.fretRange.max), 'tension overlays remain visible only inside the saved range');
assert(tensionMarkers.some((marker) => marker.isOverlay), 'FORM-external tension candidates remain overlays');
assert.strictEqual(savedDiagramOptions(Object.assign({}, cmaj7, { tensionPcs: undefined }), { mode: 'note' }).markers.some((marker) => marker.isTensionCandidate), false, 'old records without tension fields remain unchanged');

const overridden = savedDiagramOptions(Object.assign({}, cmaj7, {
    tensionFingerings: [{ string: 2, fret: 3, pc: 2, finger: 2, fingeringWarning: false, pendingDelete: false }]
}), { mode: 'finger' });
const overriddenMarker = overridden.markers.find((marker) => marker.string === 2 && marker.fret === 3 && marker.isTensionCandidate);
assert.strictEqual(overriddenMarker.label, '中', 'saved tension finger overrides return in finger mode');

const deleted = savedDiagramOptions(Object.assign({}, cmaj7, {
    tensionFingerings: [{ string: 2, fret: 3, pc: 2, finger: null, fingeringWarning: false, pendingDelete: true }]
}), { mode: 'note' });
assert.strictEqual(deleted.markers.some((marker) => marker.string === 2 && marker.fret === 3 && marker.isTensionCandidate), false, 'normal library/SVG diagrams omit pending-deleted tension candidates');
assert(window.ChordCruise.ui.fretboard.buildStaticSvg({ frets: [0, 1, 2, 3], markers: [{ string: 2, fret: 3, label: 'D', role: 'other', isTensionCandidate: true }] }).includes('#d4af37'), 'static SVG/PNG preserves the tension outer ring');

console.log('tension-save: semantic PCs, multiple tensions, reload/library/export overrides, and delete compatibility OK');
