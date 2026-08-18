const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const fretboardSource = fs.readFileSync(path.join(root, 'js/ui/fretboard.js'), 'utf8');
const exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
const saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
const librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
const themeSource = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');

function loadFretboard() {
    const context = {
        window: {},
        Math,
        Array,
        String,
        Number,
        isFinite
    };
    vm.createContext(context);
    vm.runInContext(fretboardSource, context, { filename: 'fretboard.js' });
    return context.window.ChordCruise.ui.fretboard;
}

(function editableMarkersCarryTheirKeyboardMetadata() {
    const fretboard = loadFretboard();
    const model = fretboard.createModel({
        startFret: 1,
        endFret: 3,
        markers: [{ string: 2, fret: 3, label: '中', tappable: true, ariaLabel: '2弦 3フレット、現在 中指。運指を変更' }]
    });
    assert.strictEqual(model.markers.length, 1);
    assert.strictEqual(model.markers[0].tappable, true);
    assert.strictEqual(model.markers[0].ariaLabel, '2弦 3フレット、現在 中指。運指を変更');
})();

(function onlyEnterAndSpaceAreActivationKeys() {
    const fretboard = loadFretboard();
    assert.strictEqual(fretboard.isMarkerActivationKey({ key: 'Enter' }), true);
    assert.strictEqual(fretboard.isMarkerActivationKey({ key: ' ' }), true);
    assert.strictEqual(fretboard.isMarkerActivationKey({ key: 'Spacebar' }), true);
    assert.strictEqual(fretboard.isMarkerActivationKey({ key: 'Tab' }), false);
    assert.strictEqual(fretboard.isMarkerActivationKey({ key: 'ArrowRight' }), false);
})();

(function keyboardAndPointerUseOneActivationPath() {
    assert(fretboardSource.includes("el.setAttribute('role', 'button')"));
    assert(fretboardSource.includes("el.setAttribute('tabindex', '0')"));
    assert(fretboardSource.includes("el.setAttribute('aria-keyshortcuts', 'Enter Space')"));
    assert(fretboardSource.includes("activateMarker(marker, false)"));
    assert(fretboardSource.includes("activateMarker(marker, true)"));
    assert(fretboardSource.includes('event.preventDefault();'));
    assert(fretboardSource.includes('restoreMarkerFocus(host, stringNum, fret, marker);'));
})();

(function onlyEditableFingeringMarkersBecomeTabStops() {
    assert(saveEditorSource.includes('tappable: noteIncluded(note)'));
    assert(saveEditorSource.includes('ariaLabel: fingeringAccessibleLabel(note)'));
    assert(librarySource.includes('ariaLabel: opts.tappable ? detailFingeringAccessibleLabel(note) : \'\''));
    assert(saveEditorSource.includes('運指を変更'));
    assert(librarySource.includes('運指を変更'));
    assert(themeSource.includes('.cc-fb-marker--tappable:focus-visible'));
})();

(function longDegreeLabelsHaveACompactHtmlMarkerStyle() {
    assert(fretboardSource.includes("cls += ' cc-fb-marker--long-label'"));
    assert(themeSource.includes('.cc-fb-marker--long-label'));
    assert(themeSource.includes('calc(var(--cc-fb-marker-label-size, 0.76rem) * 0.84)'));
})();

(function fingeringWarningsOnlyReplaceLabelsInFingerMode() {
    assert(exploreSource.includes("if (mode === 'finger')"));
    assert(exploreSource.includes("return fingeringWarning ? '⚠' : ''"));
    assert(exploreSource.includes("if (mode === 'solfege')"));
    assert(exploreSource.includes("if (mode === 'degree')"));
    assert(exploreSource.includes("fingeringWarning: getSettings().fretboardDisplayMode === 'finger' && note.fingeringWarning === true"));

    assert(saveEditorSource.includes("if (draft.displayMode === 'finger')"));
    assert(saveEditorSource.includes("return note.fingeringWarning ? '⚠' : ''"));
    assert(saveEditorSource.includes("if (draft.displayMode === 'solfege')"));
    assert(saveEditorSource.includes("if (draft.displayMode === 'degree')"));
    assert(saveEditorSource.includes("fingeringWarning: draft.displayMode === 'finger' && note.fingeringWarning"));

    assert(librarySource.includes("if (mode === 'finger')"));
    assert(librarySource.includes("return note.fingeringWarning === true ? '⚠' : ''"));
    assert(librarySource.includes("if (mode === 'solfege')"));
    assert(librarySource.includes("if (mode === 'degree')"));
    assert(librarySource.includes("fingeringWarning: mode === 'finger' && note.fingeringWarning === true && note.finger == null"));
})();

console.log('fingering-keyboard: keyboard activation, marker accessibility, and focus restoration wiring OK');
