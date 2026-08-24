const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
const saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');

assert(exploreSource.includes('id="cc-save-form-btn" disabled aria-describedby="cc-fb-hint">保存する'), 'Explore always creates the independent save button in its current fretboard UI');
assert(!exploreSource.includes('id="cc-chord-detail"'), 'the removed lower detail card is not recreated for saving');
assert(exploreSource.includes('saveButton.disabled = !canSaveForm'), 'save is disabled until the current CAGED form is available');
assert(exploreSource.includes('window.ChordCruise.ui.saveEditor.open({'), 'the button reuses the existing save-editor entry point');
assert(exploreSource.includes('chord: chord,') && exploreSource.includes('form: form,'), 'the current chord and CAGED form are passed intact');
assert(exploreSource.includes('displayMode: exploreDisplayMode(),'), 'the effective Explore display mode is passed to the save editor');
assert(saveEditorSource.includes('function initialDisplayMode(value)'), 'the save editor validates an incoming display mode before using it');
assert(saveEditorSource.includes('displayMode: initialDisplayMode(payload.displayMode),'), 'the save editor uses the Explore display mode when present and falls back for existing entries');
assert(exploreSource.includes("keyContext: chord.source === 'custom' ? null"), 'custom and diatonic chords retain their existing key-context behavior');
assert(!exploreSource.includes('storage.saveChord('), 'Explore does not duplicate the save transaction');

console.log('explore-save-entry: independent save entry is visible, guarded by CAGED availability, and reuses save-editor');
