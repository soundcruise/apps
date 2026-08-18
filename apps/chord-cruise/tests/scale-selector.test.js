'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var SCALE_IDS = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'harmonic-minor', 'melodic-minor', 'locrian'];
var CORE_SCALE_IDS = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian', 'harmonic-minor', 'melodic-minor'];
var SCALE_LABELS = {
    major: 'メジャー / イオニアン',
    dorian: 'ドリアン',
    phrygian: 'フリジアン',
    lydian: 'リディアン',
    mixolydian: 'ミクソリディアン',
    minor: 'マイナー / エオリアン',
    'harmonic-minor': 'ハーモニックマイナー',
    'melodic-minor': 'メロディックマイナー',
    locrian: 'ロクリアン'
};

function createLocalStorage() {
    var values = {};
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) { values[key] = String(value); },
        removeItem: function (key) { delete values[key]; }
    };
}

global.window = { ChordCruise: {}, localStorage: createLocalStorage() };
require('../js/core/music-theory.js');
require('../js/core/storage.js');

var theory = window.ChordCruise.theory;
var storage = window.ChordCruise.storage;

assert.deepStrictEqual(storage.VALID_SCALE_TYPES, SCALE_IDS, 'storage accepts the nine scales published by the selector');
assert.deepStrictEqual(Object.keys(theory.SCALES), CORE_SCALE_IDS, 'core retains its independent nine-scale definition order');
SCALE_IDS.forEach(function (scaleType) {
    assert.strictEqual(theory.SCALES[scaleType].label, SCALE_LABELS[scaleType], scaleType + ' label');
});

function normalizedScaleType(value) {
    var settings = storage.getSettingsDefaults();
    settings.scaleType = value;
    return storage.normalizeSettings(settings).scaleType;
}

assert.strictEqual(normalizedScaleType(undefined), 'major', 'missing scaleType defaults to major');
assert.strictEqual(normalizedScaleType(null), 'major', 'null scaleType defaults to major');
assert.strictEqual(normalizedScaleType('banana'), 'major', 'invalid scaleType defaults to major');
assert.strictEqual(normalizedScaleType('harmonic-minor'), 'harmonic-minor', 'Harmonic Minor is a persisted UI setting');
assert.strictEqual(normalizedScaleType('melodic-minor'), 'melodic-minor', 'Melodic Minor is a persisted UI setting');
SCALE_IDS.forEach(function (scaleType) {
    assert.strictEqual(normalizedScaleType(scaleType), scaleType, scaleType + ' restores unchanged');
});

assert.strictEqual(storage.saveSettings({ scaleType: 'minor' }), true);
assert.strictEqual(storage.loadSettings().scaleType, 'minor', 'legacy minor settings remain compatible');
assert.strictEqual(storage.saveSettings({ scaleType: 'dorian' }), true);
assert.strictEqual(storage.loadSettings().scaleType, 'dorian', 'new scale settings persist and restore');
assert.strictEqual(storage.saveSettings({ scaleType: 'harmonic-minor', selectedKey: 8, chordToneMode: '7' }), true);
assert.strictEqual(storage.loadSettings().scaleType, 'harmonic-minor', 'Harmonic Minor persists and reloads');
assert.strictEqual(storage.loadSettings().selectedKey, 8, 'Harmonic Minor keeps the selected pitch class');
assert.strictEqual(storage.loadSettings().chordToneMode, '7', 'Harmonic Minor keeps the selected chord size');
assert.strictEqual(storage.saveSettings({ scaleType: 'melodic-minor' }), true);
assert.strictEqual(storage.loadSettings().scaleType, 'melodic-minor', 'Melodic Minor persists and reloads');
assert.strictEqual(storage.saveSettings({ scaleType: 'invalid-mode' }), true);
assert.strictEqual(storage.loadSettings().scaleType, 'major', 'invalid persisted settings recover to major');

SCALE_IDS.forEach(function (scaleType) {
    ['3', '7'].forEach(function (toneMode) {
        var chords = theory.getDiatonicChords(0, scaleType, toneMode);
        assert.strictEqual(chords.length, 7, scaleType + '/' + toneMode + ' renders seven degrees');
        chords.forEach(function (chord) {
            assert(/^[IV]+/.test(chord.roman), scaleType + ' Roman degree starts in uppercase');
        });
    });
});

function classList() {
    var names = {};
    return {
        toggle: function (name, active) { names[name] = !!active; },
        contains: function (name) { return !!names[name]; }
    };
}

function element() {
    var attrs = {};
    var children = [];
    var value = '';
    return {
        classList: classList(),
        dataset: {},
        children: children,
        appendChild: function (child) { children.push(child); return child; },
        setAttribute: function (name, attrValue) { attrs[name] = String(attrValue); },
        getAttribute: function (name) { return attrs[name] || null; },
        removeAttribute: function (name) { delete attrs[name]; },
        get innerHTML() { return value; },
        set innerHTML(nextValue) { value = String(nextValue); children.length = 0; },
        textContent: '',
        value: '',
        hidden: false
    };
}

function createExploreDocument() {
    var elements = {
        'cc-key-select': element(),
        'cc-scale-selector': element(),
        'cc-scale-selector-value': element(),
        'cc-tone-3': element(),
        'cc-tone-7': element(),
        'cc-chord-grid': element()
    };
    return {
        getElementById: function (id) { return elements[id] || null; },
        createElement: function () { return element(); },
        elements: elements
    };
}

var exploreSource = fs.readFileSync(path.resolve(__dirname, '../js/ui/explore.js'), 'utf8');
var previousDocument = global.document;
var testDocument = createExploreDocument();
global.document = testDocument;

var savedScaleType = null;
var shouldSave = true;
var toastMessage = null;
window.ChordCruise.state = {
    settings: Object.assign(storage.getSettingsDefaults(), { scaleType: 'minor', selectedKey: 0, chordToneMode: '7' }),
    exploreSelectedChordIndex: null,
    exploreCustomChord: null,
    exploreShape: ''
};
window.ChordCruise.storage = {
    saveSettings: function (partial) {
        if (!shouldSave) return false;
        savedScaleType = partial.scaleType;
        return true;
    }
};
window.ChordCruise.ui = {
    toast: { show: function (message) { toastMessage = message; } },
    fretboard: { getScrollLeft: function () { return 0; }, render: function () {} }
};
require('../js/ui/explore.js');

var explore = window.ChordCruise.ui.explore;
assert.strictEqual(explore.setScaleType('major'), true, 'a scale change commits after successful persistence');
assert.strictEqual(savedScaleType, 'major');
assert.strictEqual(window.ChordCruise.state.settings.scaleType, 'major');
assert.strictEqual(window.ChordCruise.state.settings.chordToneMode, '7', 'changing scale preserves the selected chord size');
assert.strictEqual(testDocument.elements['cc-scale-selector-value'].textContent, SCALE_LABELS.major, 'selector label updates after a successful commit');
assert.strictEqual(testDocument.elements['cc-chord-grid'].children.length, 7, 'successful commit redraws the diatonic grid');

assert.strictEqual(explore.setScaleType('harmonic-minor'), true, 'Harmonic Minor commits after successful persistence');
assert.strictEqual(savedScaleType, 'harmonic-minor');
assert.strictEqual(window.ChordCruise.state.settings.scaleType, 'harmonic-minor');
assert.strictEqual(window.ChordCruise.state.settings.selectedKey, 0, 'changing family preserves the selected pitch class');
assert.strictEqual(window.ChordCruise.state.settings.chordToneMode, '7', 'Harmonic Minor preserves the selected chord size');
assert.strictEqual(testDocument.elements['cc-scale-selector-value'].textContent, SCALE_LABELS['harmonic-minor']);
assert.strictEqual(testDocument.elements['cc-key-select'].children[8].textContent, 'G♯', 'minor-family scales use minor tonic names');

assert.strictEqual(explore.setScaleType('melodic-minor'), true, 'Melodic Minor commits after successful persistence');
assert.strictEqual(savedScaleType, 'melodic-minor');
assert.strictEqual(window.ChordCruise.state.settings.scaleType, 'melodic-minor');
assert.strictEqual(testDocument.elements['cc-scale-selector-value'].textContent, SCALE_LABELS['melodic-minor']);

var melodicGridFirstSymbol = testDocument.elements['cc-chord-grid'].children[0].children[1].textContent;
shouldSave = false;
assert.strictEqual(explore.setScaleType('dorian'), false, 'a failed persistence rejects the new scale');
assert.strictEqual(window.ChordCruise.state.settings.scaleType, 'melodic-minor', 'failed persistence keeps in-memory scale unchanged');
assert.strictEqual(testDocument.elements['cc-scale-selector-value'].textContent, SCALE_LABELS['melodic-minor'], 'failed persistence keeps the existing selector label');
assert.strictEqual(testDocument.elements['cc-chord-grid'].children[0].children[1].textContent, melodicGridFirstSymbol, 'failed persistence keeps the rendered scale unchanged');
assert.strictEqual(toastMessage, 'スケール設定を保存できませんでした', 'failed persistence reports the existing-style error feedback');

assert(exploreSource.indexOf('aria-haspopup="dialog"') !== -1, 'selector exposes dialog semantics');
assert(exploreSource.indexOf('aria-expanded="false"') !== -1, 'selector exposes collapsed state');
assert(exploreSource.indexOf('role="dialog" aria-modal="true" aria-labelledby="cc-scale-sheet-title"') !== -1, 'bottom sheet is an accessible dialog');
assert(exploreSource.indexOf('role="radiogroup"') !== -1, 'scale list uses radio group semantics');
assert(exploreSource.indexOf('role="radio" aria-checked="') !== -1, 'scale options expose checked state');
assert(exploreSource.indexOf("event.key === 'Escape'") !== -1, 'Escape closes the sheet');
assert(exploreSource.indexOf('focusTrap().trapFocus') !== -1, 'sheet delegates Tab behavior to the shared focus helper');
assert(exploreSource.indexOf('focusTrap().restoreFocus') !== -1, 'sheet returns focus to its opener');
assert(exploreSource.indexOf("mode: settings.scaleType") !== -1, 'newly saved forms retain the selected scale ID in keyContext.mode');
assert(exploreSource.indexOf("SCALE_SELECTION_ORDER = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'harmonic-minor', 'melodic-minor', 'locrian']") !== -1, 'selector retains the approved nine-scale order');
assert.strictEqual((exploreSource.match(/cc-mode-major/g) || []).length, 0, 'legacy Major / Minor segment controls are removed');
assert.strictEqual((exploreSource.match(/cc-mode-minor/g) || []).length, 0, 'legacy Major / Minor segment controls are removed');

global.document = previousDocument;
console.log('scale-selector: nine-scale storage, persistence safety, minor-family keys, redraw, and sheet semantics OK');
