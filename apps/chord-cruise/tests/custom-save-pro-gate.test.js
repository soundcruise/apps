'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var standardDirectory = path.join(root, 'standard');
var featureAccessSource = fs.readFileSync(path.join(root, 'js/core/feature-access.js'), 'utf8');
var storageSource = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');
var saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
var standardHtml = fs.readFileSync(path.join(standardDirectory, 'index.html'), 'utf8');
var proHtml = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');

function createLocalStorage() {
    var values = {};
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) { values[key] = String(value); },
        removeItem: function (key) { delete values[key]; }
    };
}

function loadEdition(appEdition, localStorage) {
    var context = {
        window: {
            ChordCruise: {},
            localStorage: localStorage || createLocalStorage(),
            document: { documentElement: { dataset: appEdition ? { appEdition: appEdition } : {} } }
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
    return context.window.ChordCruise;
}

function chord(name) {
    return {
        chordName: name,
        formName: 'C型',
        shape: 'C',
        rootPc: 0,
        intervals: [0, 4, 7],
        qualityKey: 'maj',
        notes: [],
        mutedStrings: []
    };
}

(function standardBlocksOnlyCustomSaveAtStorageBoundary() {
    var cruise = loadEdition(null);
    assert.strictEqual(cruise.featureAccess.hasFeature('customChordCreate'), true, 'Standard may create a custom chord');
    assert.strictEqual(cruise.featureAccess.hasFeature('customChordFretboardView'), true, 'Standard may inspect its fretboard');
    assert.strictEqual(cruise.featureAccess.hasFeature('customChordSave'), false, 'Standard custom save is a separate disabled feature');

    assert.strictEqual(cruise.storage.saveChord(chord('Custom C'), { source: 'custom' }), null, 'Standard storage rejects a custom save');
    assert.strictEqual(cruise.storage.getLastError(), 'custom-chord-save-pro-required', 'custom save rejection has a stable error code');
    assert.strictEqual(cruise.storage.loadChordIndex().length, 0, 'rejection does not create a record or index entry');

    var ordinary = cruise.storage.saveChord(chord('Diatonic C'), { source: 'diatonic' });
    assert(ordinary, 'Standard ordinary chord save remains available within its library limit');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(ordinary, 'source'), false, 'transient source is not added to schemaVersion 1 records');
    assert.strictEqual(ordinary.schemaVersion, 1, 'record schema remains version 1');
}());

(function proAllowsCustomSaveAndStandardCanReadExistingData() {
    var sharedStorage = createLocalStorage();
    var pro = loadEdition('Pro', sharedStorage);
    var saved = pro.storage.saveChord(chord('Pro Custom C'), { source: 'custom' });
    assert(saved, 'Pro storage accepts a custom save');

    var standard = loadEdition(null, sharedStorage);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(standard.storage.loadChord(saved.id))), JSON.parse(JSON.stringify(saved)), 'Standard can read an existing custom record unchanged');
}());

assert(standardHtml.includes('<script src="../js/core/feature-access.js?v=0.37.2"></script>'), 'Standard loads feature access');
assert(standardHtml.indexOf('js/core/feature-access.js') < standardHtml.indexOf('js/core/storage.js'), 'Standard loads feature access before storage');
assert(proHtml.indexOf('../js/core/feature-access.js') < proHtml.indexOf('../js/core/storage.js'), 'Pro loads feature access before storage');
assert(saveEditorSource.includes("source: chord.source === 'custom' ? 'custom' : 'diatonic'"), 'save editor keeps a transient source for new saves');
assert(saveEditorSource.includes("saveChord(record, { source: draft.source })"), 'save editor passes source to the storage boundary');
assert(saveEditorSource.includes('作成したコードを保存するにはPro版が必要です。'), 'custom save has an independent Pro explanation');
assert(saveEditorSource.includes('href="../pro-access.html"'), 'Standard points to the root Chord Cruise Pro access page');
assert(proHtml.includes('../../shared/pro-gate.js?v=19'), 'the Pro entry continues into the shared Pro gate');

console.log('custom-save-pro-gate: Standard creation/view remains enabled, custom save is rejected at UI/storage, Pro save and existing record read OK');
