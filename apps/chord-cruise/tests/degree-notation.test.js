'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var theorySource = fs.readFileSync(path.join(root, 'js/core/music-theory.js'), 'utf8');
var storageSource = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
var saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
var settingsSource = fs.readFileSync(path.join(root, 'js/ui/settings.js'), 'utf8');
var standardHtml = fs.readFileSync(path.join(root, 'standard/index.html'), 'utf8');
var proHtml = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');

function createLocalStorage() {
    var values = {};
    return {
        get length() { return Object.keys(values).length; },
        key: function (index) { return Object.keys(values)[index] || null; },
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) { values[key] = String(value); },
        removeItem: function (key) { delete values[key]; }
    };
}

var theoryContext = { window: { ChordCruise: {} } };
vm.createContext(theoryContext);
vm.runInContext(theorySource, theoryContext, { filename: 'music-theory.js' });
var theory = theoryContext.window.ChordCruise.theory;

var formalLabels = {
    '1': 'P1', '♭2': 'm2', '2': 'M2', '♭3': 'm3', '3': 'M3', '4': 'P4',
    '♯4': 'A4', '♭5': 'd5', '5': 'P5', '♯5': 'A5', '♭6': 'm6', '6': 'M6',
    '♭♭7': 'd7', '♭7': 'm7', '7': 'M7', '♭9': 'm9', '9': 'M9', '♯9': 'A9',
    '11': 'P11', '♯11': 'A11', '♭13': 'm13', '13': 'M13'
};

Object.keys(formalLabels).forEach(function (label) {
    assert.strictEqual(theory.formatDegreeLabel(label, false), label, 'OFF keeps ' + label);
    assert.strictEqual(theory.formatDegreeLabel(label, true), formalLabels[label], label + ' uses its semantic formal spelling');
});
assert.strictEqual(theory.formatDegreeLabel('♯4', true), 'A4', 'augmented fourth stays distinct');
assert.strictEqual(theory.formatDegreeLabel('♭5', true), 'd5', 'diminished fifth stays distinct');
assert.strictEqual(theory.formatDegreeLabel('unknown', true), 'unknown', 'unknown labels fail safely');

(function settingsPersistWithoutChangingRecords() {
    var localStorage = createLocalStorage();
    var context = {
        window: {
            ChordCruise: {},
            localStorage: localStorage,
            document: { documentElement: { dataset: {} } }
        },
        console: { warn: function () {} }, Date: Date, JSON: JSON, Math: Math
    };
    vm.createContext(context);
    vm.runInContext(storageSource, context, { filename: 'storage.js' });
    var storage = context.window.ChordCruise.storage;
    assert.strictEqual(storage.loadSettings().degreeNotationFormal, false, 'formal notation defaults off');
    assert.strictEqual(storage.saveSettings({ degreeNotationFormal: true }), true);
    assert.strictEqual(storage.loadSettings().degreeNotationFormal, true, 'true reloads');
    assert.strictEqual(storage.saveSettings({ degreeNotationFormal: false }), true);
    assert.strictEqual(storage.loadSettings().degreeNotationFormal, false, 'false reloads');
    localStorage.setItem('chordCruise.settings', JSON.stringify({ degreeNotationFormal: 'true' }));
    assert.strictEqual(storage.loadSettings().degreeNotationFormal, false, 'non-boolean values normalize to false');
    var saved = storage.saveChord({ chordName: 'C', formName: 'C型', shape: 'C', folderId: storage.UNCATEGORIZED_ID, notes: [], mutedStrings: [] });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(saved, 'degreeNotationFormal'), false, 'saved records never receive the display setting');
    assert.strictEqual(saved.schemaVersion, 1, 'record schema remains unchanged');
}());

assert(settingsSource.includes("'degreeNotationFormal'"), 'display reset includes the setting');
assert(settingsSource.includes('saveRightTopSettings({ degreeNotationFormal: enabled })'), 'settings use the established save path');
assert(settingsSource.includes("#cc-settings-degree-notation-toggle"), 'settings wire the formal-notation switch');
assert(settingsSource.includes("notifyFretboardChange();"), 'settings notify open fretboards');

[standardHtml, proHtml].forEach(function (html, index) {
    var edition = index === 0 ? 'Standard' : 'Pro';
    var chordNamePosition = html.indexOf('>コード名の大きさ<');
    var fretNumberPosition = html.indexOf('>フレット番号の大きさ<');
    var markerLabelPosition = html.indexOf('>丸内文字の大きさ<');
    var highlightPosition = html.indexOf('>強調するフレット番号<');
    var formalPosition = html.indexOf('>度数の正式表記<');
    var previewPosition = html.indexOf('>指板プレビュー<');
    assert(html.includes('度数の正式表記'), edition + ' exposes the same setting name');
    assert(html.includes('id="cc-settings-degree-notation-toggle"'), edition + ' exposes the switch');
    assert(html.includes('aria-checked="false"'), edition + ' starts with the switch off');
    assert(html.includes('P1・m3・M3'), edition + ' explains the formal notation');
    assert(chordNamePosition < fretNumberPosition && fretNumberPosition < markerLabelPosition && markerLabelPosition < highlightPosition && highlightPosition < formalPosition && formalPosition < previewPosition,
        edition + ' keeps the requested setting order before the fretboard preview');
    ['chord-name', 'fret-size', 'marker-label-size', 'fret-highlight'].forEach(function (descriptionId) {
        assert(html.includes('class="cc-settings-help-toggle" data-settings-description="' + descriptionId + '"'), edition + ' uses a question-mark help button for ' + descriptionId);
    });
    assert(html.includes('id="cc-settings-degree-notation-help-toggle"'), edition + ' exposes the existing help-button design');
    assert(html.includes('aria-controls="cc-settings-degree-notation-note"'), edition + ' connects the help button to its note');
    assert(/id="cc-settings-degree-notation-note" hidden>ONにすると、度数表示をP1・m3・M3/.test(html), edition + ' keeps the explanation hidden initially');
});
function fretboardSettingsMarkup(html) {
    var start = html.indexOf('<section class="cc-settings-card" aria-labelledby="cc-settings-fretboard-title">');
    var end = html.indexOf('<div class="cc-settings-refresh-bar"', start);
    return html.slice(start, end);
}
assert.strictEqual(fretboardSettingsMarkup(standardHtml), fretboardSettingsMarkup(proHtml), 'Standard and Pro use identical fretboard settings markup');
assert(settingsSource.includes("function toggleDegreeNotationDescription()"), 'settings reuse the existing help disclosure behavior');
assert(settingsSource.includes("#cc-settings-degree-notation-help-toggle"), 'the delegated settings click handler opens the formal-notation help');
assert(settingsSource.includes("classList.contains('cc-settings-help-toggle')"), 'question-mark help remains a question mark while expanded');

assert(exploreSource.includes('displayDegreeLabel(chordDegreeLabel(chord, idx))'), 'Explore whole-board and analysis labels use the formatter');
assert(exploreSource.includes('displayDegreeLabel(window.ChordCruise.chordModel.TENSION_LABELS'), 'Explore tension labels use the formatter');
assert(saveEditorSource.includes('function displayDegreeLabel(label)'), 'Save Editor has one display-only formatter boundary');
assert(saveEditorSource.includes('displayDegreeLabel(window.ChordCruise.chordModel.TENSION_LABELS'), 'Save Editor tension labels use it');
assert(librarySource.includes('function displayDegreeLabel(label)'), 'Library has one display-only formatter boundary');
assert(librarySource.includes('displayDegreeLabel(window.ChordCruise.chordModel.TENSION_LABELS'), 'Library tension labels use it before SVG and PNG');
assert(!fs.readFileSync(path.join(root, 'js/ui/fretboard.js'), 'utf8').includes('degreeNotationFormal'), 'fretboard geometry remains notation-agnostic');
assert(!fs.readFileSync(path.join(root, 'js/ui/chord-export.js'), 'utf8').includes('degreeNotationFormal'), 'export remains notation-agnostic');

console.log('degree-notation: semantic formal labels, persisted setting, Standard/Pro UI, and all display boundaries OK');
