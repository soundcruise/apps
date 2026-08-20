'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var featureAccessSource = fs.readFileSync(path.join(root, 'js/core/feature-access.js'), 'utf8');
var storageSource = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');
var saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
var settingsSource = fs.readFileSync(path.join(root, 'js/ui/settings.js'), 'utf8');

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

function loadStorage() {
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
        Math: Math
    };
    vm.createContext(context);
    vm.runInContext(featureAccessSource, context, { filename: 'feature-access.js' });
    vm.runInContext(storageSource, context, { filename: 'storage.js' });
    return { storage: context.window.ChordCruise.storage, localStorage: localStorage };
}

(function settingsRetainLastSaveFolderOutsideRecords() {
    var env = loadStorage();
    var storage = env.storage;
    assert.strictEqual(storage.loadSettings().lastSaveFolderId, storage.UNCATEGORIZED_ID, 'default save folder is uncategorized');
    assert.strictEqual(storage.saveSettings({ lastSaveFolderId: 'folder_last' }), true, 'last save folder persists through settings');
    assert.strictEqual(storage.loadSettings().lastSaveFolderId, 'folder_last', 'last save folder reloads from settings');

    var saved = storage.saveChord({ chordName: 'C', formName: 'C型', shape: 'C', folderId: storage.UNCATEGORIZED_ID, notes: [], mutedStrings: [] });
    assert(saved, 'record saves through the existing path');
    assert.strictEqual(saved.schemaVersion, 1, 'record schema remains 1');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(saved, 'lastSaveFolderId'), false, 'record does not receive UI settings');
}());

(function clearsOnlyChordCruiseKeys() {
    var env = loadStorage();
    env.localStorage.setItem('chordCruise.settings', '{}');
    env.localStorage.setItem('chordCruise.chord.example', '{}');
    env.localStorage.setItem('soundCruiseProAuth', 'keep');
    env.localStorage.setItem('otherApp.settings', 'keep');
    assert.strictEqual(env.storage.clearChordCruiseData(), true, 'Chord Cruise data clears successfully');
    assert.strictEqual(env.localStorage.getItem('chordCruise.settings'), null, 'Chord Cruise settings are removed');
    assert.strictEqual(env.localStorage.getItem('chordCruise.chord.example'), null, 'Chord Cruise records are removed');
    assert.strictEqual(env.localStorage.getItem('soundCruiseProAuth'), 'keep', 'Pro authentication is preserved');
    assert.strictEqual(env.localStorage.getItem('otherApp.settings'), 'keep', 'other app data is preserved');
}());

assert(saveEditorSource.includes('preferredSaveFolderId'), 'new save drafts select the remembered folder');
assert(saveEditorSource.includes('rememberSaveFolder(saved.folderId)'), 'only successful saves remember a folder');
assert(settingsSource.includes('window.__soundCruiseClearGate'), 'Pro settings use the shared gate reset API');
assert(settingsSource.includes('cc-settings-data-delete'), 'settings provide the app-data delete action');
assert(settingsSource.includes('保存したコード・設定をすべて削除して初期状態に戻します。'), 'settings explain the destructive action');
assert(!settingsSource.includes('localStorage.clear'), 'settings never clear all application storage');

console.log('settings-data-management: Pro auth reset, remembered save folder, and Chord Cruise-only data deletion OK');
