'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var editorSource = fs.readFileSync(path.join(__dirname, '..', 'js/ui/save-editor.js'), 'utf8');
var fretboardSource = fs.readFileSync(path.join(__dirname, '..', 'js/ui/fretboard.js'), 'utf8');
var helperSource = editorSource.slice(
    editorSource.indexOf('function noteIncluded'),
    editorSource.indexOf('function markerLabel')
);

function createHelpers(draft) {
    return new Function('context',
        'var draft = context.draft;\n' +
        'var EDIT_CYCLE = [null, \'T\', 1, 2, 3, 4, \'warning\', \'delete\'];\n' +
        'var ADDED_NOTE_CYCLE = [\'T\', 1, 2, 3, 4];\n' +
        'var theory = function () { return context.theory; };\n' +
        helperSource + '\n' +
        'return { addDraftNoteAtSlot: addDraftNoteAtSlot, cycleAddedDraftNote: cycleAddedDraftNote, cycleNote: cycleNote };'
    )({
        draft: draft,
        theory: { OPEN_STRINGS: [4, 9, 2, 7, 11, 4] }
    });
}

function createDraft() {
    return {
        rootPc: 0,
        range: { min: 1, max: 3, includesOpen: false },
        formRange: { hasOpen: false },
        notes: [],
        mutedStrings: [6]
    };
}

var draft = createDraft();
var helpers = createHelpers(draft);

assert.strictEqual(helpers.addDraftNoteAtSlot(6, 3), true, 'an empty fretted slot can add a note');
assert.deepStrictEqual(draft.notes[0], {
    string: 6,
    fret: 3,
    interval: 7,
    finger: 'T',
    fingeringWarning: false,
    pendingDelete: false,
    warningStartsCycle: false,
    addedInEditor: true,
    restoreMuteOnRemove: true
}, 'an added note uses the existing note fields plus editor-only state');
assert.deepStrictEqual(draft.mutedStrings, [], 'adding to a muted string makes the new note audible');
assert.strictEqual(draft.range.max, 3, 'the existing range is retained when the note falls inside it');

[1, 2, 3, 4].forEach(function (finger) {
    helpers.cycleAddedDraftNote(draft.notes[0]);
    assert.strictEqual(draft.notes[0].finger, finger, 'new notes cycle through all fingerings');
});
helpers.cycleAddedDraftNote(draft.notes[0]);
assert.strictEqual(draft.notes.length, 0, 'the cycle removes a newly added note instead of leaving a pending-delete marker');
assert.deepStrictEqual(draft.mutedStrings, [6], 'removing an added note restores its original muted-string state');

var openDraft = createDraft();
var openHelpers = createHelpers(openDraft);
assert.strictEqual(openHelpers.addDraftNoteAtSlot(1, 0), true, 'an empty open-string slot can add a note');
assert.strictEqual(openDraft.notes[0].interval, 4, 'open-string additions calculate the existing record interval from root and string pitch');
assert.strictEqual(openDraft.range.includesOpen, true, 'adding an open string includes the open-string range');
assert.strictEqual(openDraft.formRange.hasOpen, true, 'the open-string range control becomes available after an open-string addition');

var existingDraft = createDraft();
existingDraft.notes.push({ string: 5, fret: 3, interval: 0, finger: 4, fingeringWarning: false, pendingDelete: false });
var existingHelpers = createHelpers(existingDraft);
existingHelpers.cycleNote(existingDraft.notes[0]);
assert.strictEqual(existingDraft.notes.length, 1, 'existing notes retain the existing warning/delete editing path');
assert.strictEqual(existingDraft.notes[0].fingeringWarning, true, 'existing note cycle still reaches its warning state');

assert.ok(fretboardSource.indexOf('onEmptySlotTap') !== -1, 'the fretboard renderer exposes an empty-slot callback');
assert.ok(fretboardSource.indexOf('function slotAtPointer') !== -1, 'empty taps resolve to displayed string/fret coordinates');
assert.ok(fretboardSource.indexOf("closest('.cc-fb-marker, .cc-fb-barre, .cc-fb-mute')") !== -1, 'existing markers and barres cannot be added again as empty slots');
assert.ok(editorSource.indexOf('record.notes = includedNotes;') !== -1, 'the existing notes record remains the save/reload path');
assert.ok(editorSource.indexOf('addedInEditor') !== -1, 'editor-only add state is not part of the persisted record mapping');

function createLocalStorage() {
    var values = {};
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) { values[key] = String(value); },
        removeItem: function (key) { delete values[key]; }
    };
}

var featureAccessSource = fs.readFileSync(path.join(__dirname, '..', 'js/core/feature-access.js'), 'utf8');
var storageSource = fs.readFileSync(path.join(__dirname, '..', 'js/core/storage.js'), 'utf8');
var localStorage = createLocalStorage();
var context = {
    window: {
        ChordCruise: {},
        localStorage: localStorage,
        document: { documentElement: { dataset: {} } }
    },
    console: { warn: function () {} },
    Date: Date,
    JSON: JSON,
    Math: Math,
    URL: URL
};
vm.createContext(context);
vm.runInContext(featureAccessSource, context, { filename: 'feature-access.js' });
vm.runInContext(storageSource, context, { filename: 'storage.js' });
var persistedNote = {
    string: 1,
    fret: 0,
    interval: 4,
    finger: 'T',
    fingeringWarning: false
};
var saved = context.window.ChordCruise.storage.saveChord({
    chordName: 'C',
    formName: '編集フォーム',
    shape: 'C',
    notes: [persistedNote],
    mutedStrings: []
});
assert(saved, 'an existing-format record with an added note saves successfully');
var reloaded = context.window.ChordCruise.storage.loadChord(saved.id);
assert.deepStrictEqual(JSON.parse(JSON.stringify(reloaded.notes)), [persistedNote], 'the added note reloads through the existing record schema without editor-only fields');

console.log('empty-slot-edit: blank-slot add/cycle/remove, open strings, existing-note behavior, and record compatibility OK');
