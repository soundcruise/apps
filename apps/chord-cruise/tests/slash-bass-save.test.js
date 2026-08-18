'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const saveEditor = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
const library = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');
const fretboard = fs.readFileSync(path.join(root, 'js/ui/fretboard.js'), 'utf8');

assert(saveEditor.includes('bassPc: validBassPc(chord.bassPc)'), 'Explore slash bass enters the save-editor draft');
assert(saveEditor.includes('bassPc: validBassPc(original.bassPc)'), 'saved slash bass reloads into the edit draft');
assert(saveEditor.includes('if (draft.bassPc !== null) record.bassPc = draft.bassPc'), 'only a valid slash bass is stored on the record');
assert(saveEditor.includes('delete record.bassPc'), 'ordinary records retain their existing field shape');
assert(saveEditor.includes('mergeBassOverlay(markers, spelledNoteNames)'), 'save-editor regenerates semantic bass overlays rather than storing candidates as notes');
assert(saveEditor.includes("finger: null, fingeringWarning: false, pendingDelete: false"), 'unconfigured save-editor bass overrides begin with no fingering or warning');
assert(!saveEditor.includes('bassString') && !saveEditor.includes('bassFret') && !saveEditor.includes('selectedBassCandidate'), 'no selected bass position is persisted');
assert(saveEditor.includes('bassFingerings'), 'save-editor stores only optional per-candidate fingering overrides');
assert(saveEditor.includes('cycleBassFingering'), 'overlay-only markers reuse the existing editor finger cycle');
assert(saveEditor.includes('tappable: draft.displayMode === \'finger\''), 'only finger-mode save-editor overlays are editable');
assert(saveEditor.includes('ベース候補、現在'), 'editable overlays have a dedicated accessible label');
assert(saveEditor.includes('rangeWithBassCandidates'), 'slash save defaults are expanded from nearby displayed bass candidates');
assert(saveEditor.includes('contextStart = Math.max(0, range.min - 1)'), 'range expansion is limited to the current CAGED context instead of all same-pitch positions');
assert(!saveEditor.includes("return '消'"), 'pending deletion never renders the visual 消 label');
assert(saveEditor.includes("pendingDelete: entry.pendingDelete === true"), 'bass candidate delete is persisted as an override state');
assert(saveEditor.includes('record.deletedNotes = deletedNotes'), 'deleted FORM notes are retained only as recoverable edit metadata');
assert(saveEditor.includes('concat(deletedNotes.map(deletedDraftNote))'), 'the editor restores deleted FORM notes as pending-delete markers');

assert(library.includes('mergeSavedBassOverlay'), 'list, detail, and export share the saved bass overlay rebuild path');
assert(library.includes('bassOverlayNotes'), 'library uses the Phase E1 generator instead of copying pitch-position logic');
assert(library.includes('filter(function (note) { return frets.indexOf(note.fret) !== -1; })'), 'saved diagrams only show candidates inside their saved range');
assert(library.includes('isBassCandidate = true'), 'saved FORM overlaps merge into one marker');
assert(library.includes('isOverlay: true, overlayType: \'bass\''), 'saved non-FORM candidates remain overlays');
assert(library.includes('candidate.bassFingerings.push'), 'library detail edits persist only the overlay finger override');
assert(library.includes('tappable: editable && mode === \'finger\''), 'library overlays are editable only in its existing finger mode');
assert(fretboard.includes('r="19"') && fretboard.includes('r="17"'), 'static SVG/PNG preserves a dark separator and gold outer ring');

assert(storage.includes('record = JSON.parse(JSON.stringify(chord))'), 'storage preserves optional record fields through its existing clone path');
assert(storage.includes('record.schemaVersion = 1'), 'schemaVersion remains 1 without migration');

global.window = { ChordCruise: { state: { settings: { fretboardDisplayMode: 'note' } } } };
global.document = { addEventListener() {} };
require('../js/core/music-theory.js');
require('../js/core/chord-model.js');
require('../js/core/caged-forms.js');
require('../js/ui/library.js');
const savedDiagramOptions = window.ChordCruise.ui.library.savedDiagramOptions;
const cOverE = {
    chordName: 'C/E', rootPc: 0, bassPc: 4, intervals: [0, 4, 7],
    fretRange: { min: 0, max: 3, includesOpen: true },
    notes: [
        { string: 5, fret: 3, interval: 0, finger: 3 },
        { string: 4, fret: 2, interval: 4, finger: 2 },
        { string: 3, fret: 0, interval: 7, finger: null },
        { string: 2, fret: 1, interval: 0, finger: 1 },
        { string: 1, fret: 0, interval: 4, finger: null }
    ], mutedStrings: [6]
};
const diagram = savedDiagramOptions(cOverE, { mode: 'note' });
assert.strictEqual(diagram.markers.filter((marker) => marker.string === 4 && marker.fret === 2).length, 1, 'CAGED/bass overlap is merged in saved diagrams');
assert(diagram.markers.find((marker) => marker.string === 4 && marker.fret === 2).isBassCandidate, 'merged saved marker receives the bass ring');
const overlayOnly = diagram.markers.find((marker) => marker.string === 6 && marker.fret === 0);
assert(overlayOnly && overlayOnly.isOverlay && overlayOnly.isBassCandidate, 'saved diagram regenerates overlay-only bass positions');
assert.strictEqual(overlayOnly.finger, null, 'semantic bass overlay never becomes a saved fingering note');
assert.strictEqual(savedDiagramOptions(Object.assign({}, cOverE, { bassPc: undefined }), { mode: 'note' }).markers.some((marker) => marker.isBassCandidate), false, 'old records without bassPc remain unchanged');
const deletedBassDiagram = savedDiagramOptions(Object.assign({}, cOverE, {
    bassFingerings: [{ string: 6, fret: 0, finger: null, fingeringWarning: false, pendingDelete: true }]
}), { mode: 'finger' });
assert.strictEqual(deletedBassDiagram.markers.some((marker) => marker.string === 6 && marker.fret === 0), false, 'normal library/SVG diagrams omit pending-deleted bass candidates');
assert.strictEqual(savedDiagramOptions(Object.assign({}, cOverE, {
    notes: cOverE.notes.filter((note) => !(note.string === 4 && note.fret === 2)),
    deletedNotes: [{ string: 4, fret: 2, interval: 4, pendingDelete: true }]
}), { mode: 'note' }).markers.some((marker) => marker.string === 4 && marker.fret === 2 && !marker.isBassCandidate), false, 'normal library diagrams omit deleted FORM notes');

const aForm = window.ChordCruise.caged.getForm('A', 'maj', 0, 13, 0);
const nearbyE = window.ChordCruise.chordModel.bassOverlayNotes({ bassPc: 4, rootPc: 0, intervals: [0, 4, 7], startFret: aForm.displayRange.min - 1, endFret: aForm.displayRange.max + 1 });
assert(nearbyE.some((note) => note.string === 4 && note.fret === 2), 'C/E A-form context includes the 4th-string 2F E candidate');
assert.strictEqual(aForm.displayRange.min, 3, 'the fixture proves the candidate extends the legacy 3–5F form range downward');

console.log('slash-bass-save: semantic bassPc save/reload/editor/library/export coverage wiring OK');
