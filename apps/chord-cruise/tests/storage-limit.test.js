'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var featureAccessSource = fs.readFileSync(path.join(root, 'js/core/feature-access.js'), 'utf8');
var storageSource = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');

function createLocalStorage() {
    var values = {};
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) { values[key] = String(value); },
        removeItem: function (key) { delete values[key]; }
    };
}

function loadEdition(appEdition) {
    var localStorage = createLocalStorage();
    var context = {
        window: {
            ChordCruise: {},
            localStorage: localStorage,
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
    return { storage: context.window.ChordCruise.storage, localStorage: localStorage };
}

function chord(folderId, index) {
    return {
        chordName: 'C' + index,
        formName: 'C型',
        shape: 'C',
        folderId: folderId,
        notes: [],
        mutedStrings: []
    };
}

(function standardLimitsNewFoldersAndChords() {
    var env = loadEdition(null);
    var storage = env.storage;
    assert.deepStrictEqual(JSON.parse(JSON.stringify(storage.getLibraryLimits())), {
        unlimited: false,
        maxCustomFolders: 3,
        maxChordsPerFolder: 10
    }, 'Standard exposes the candidate limits');

    var initialFolder = storage.loadFolders()[0];
    assert(initialFolder && initialFolder.id === storage.UNCATEGORIZED_ID, 'new users start with an uncategorized folder');
    assert.strictEqual(initialFolder.builtin, false, 'the initial uncategorized folder is a normal folder');

    var folders = [];
    for (var folderIndex = 1; folderIndex <= 2; folderIndex += 1) {
        folders.push(storage.createFolder('Folder ' + folderIndex));
        assert(folders[folderIndex - 1], 'Standard creates folder ' + folderIndex);
    }
    assert.strictEqual(storage.loadFolders().length, 3, 'uncategorized is included in the Standard three-folder limit');
    assert.strictEqual(storage.createFolder('Folder 3'), null, 'Standard rejects a fourth total folder');
    assert.strictEqual(storage.getLastError(), 'standard-folder-limit', 'folder rejection exposes a stable error code');
    assert.strictEqual(storage.copyFolder(folders[0].id), null, 'Standard also rejects folder copy at the folder limit');
    assert.strictEqual(storage.getLastError(), 'standard-folder-limit', 'folder copy reports the same folder limit');

    for (var chordIndex = 1; chordIndex <= 10; chordIndex += 1) {
        assert(storage.saveChord(chord(folders[0].id, chordIndex)), 'Standard saves chord ' + chordIndex + ' in one folder');
    }
    assert.strictEqual(storage.saveChord(chord(folders[0].id, 11)), null, 'Standard rejects the eleventh chord in one folder');
    assert.strictEqual(storage.getLastError(), 'standard-folder-chord-limit', 'chord rejection exposes a stable error code');

    var existing = storage.loadChordIndex()[0];
    var existingRecord = storage.loadChord(existing.id);
    existingRecord.memo = 'overwrite remains available';
    assert(storage.saveChord(existingRecord), 'Standard may overwrite an existing record when its folder is full');

    var anotherFolderChord = storage.saveChord(chord(folders[1].id, 1));
    anotherFolderChord.folderId = folders[0].id;
    assert.strictEqual(storage.saveChord(anotherFolderChord), null, 'Standard cannot move an existing chord into a full folder');
    assert.strictEqual(storage.loadChord(anotherFolderChord.id).folderId, folders[1].id, 'rejected move preserves the existing record');
}());

(function uncategorizedCanBeRemovedWithoutRegeneration() {
    var env = loadEdition(null);
    var storage = env.storage;
    var uncategorized = storage.loadFolders()[0];
    assert.strictEqual(storage.renameFolder(uncategorized.id, '最初のフォルダ'), true, 'uncategorized can be renamed');
    assert.strictEqual(storage.setFolderColor(uncategorized.id, 'blue'), true, 'uncategorized can be recolored');
    var copied = storage.copyFolder(uncategorized.id);
    assert(copied, 'uncategorized can be copied');
    assert.strictEqual(storage.moveFolder(copied.id, -1), true, 'uncategorized participates in normal folder ordering');
    assert.strictEqual(storage.deleteFolder(copied.id), true, 'a copied folder can be removed normally');
    assert.strictEqual(storage.deleteFolder(uncategorized.id), true, 'uncategorized can be deleted');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(storage.loadFolders())), [], 'an explicit empty folder list remains empty');
    assert.strictEqual(storage.saveChord(chord(uncategorized.id, 1)), null, 'saving into a deleted folder is rejected');
    assert.strictEqual(storage.getLastError(), 'folder-required', 'missing save destinations expose a stable error code');
    var created = storage.createFolder('保存先');
    assert(created, 'a new folder can be created from the empty state');
    assert(storage.saveChord(chord(created.id, 1)), 'saving succeeds after a destination is created');
}());

(function legacyBuiltinUncategorizedIsNormalizedOnce() {
    var env = loadEdition(null);
    env.localStorage.setItem('chordCruise.folders', JSON.stringify([{
        id: env.storage.UNCATEGORIZED_ID,
        name: '未分類',
        builtin: true,
        order: 0
    }]));
    var folder = env.storage.loadFolders()[0];
    assert.strictEqual(folder.builtin, false, 'legacy builtin uncategorized folders become normal folders');
    assert.strictEqual(JSON.parse(env.localStorage.getItem('chordCruise.folders'))[0].builtin, false, 'normalization persists once');
}());

(function proHasNoCandidateLimits() {
    var storage = loadEdition('Pro').storage;
    assert.deepStrictEqual(JSON.parse(JSON.stringify(storage.getLibraryLimits())), {
        unlimited: true,
        maxCustomFolders: null,
        maxChordsPerFolder: null
    }, 'Pro exposes unlimited library access');

    var folders = [];
    for (var folderIndex = 1; folderIndex <= 4; folderIndex += 1) {
        folders.push(storage.createFolder('Pro Folder ' + folderIndex));
        assert(folders[folderIndex - 1], 'Pro creates folder ' + folderIndex);
    }
    for (var chordIndex = 1; chordIndex <= 11; chordIndex += 1) {
        assert(storage.saveChord(chord(folders[0].id, chordIndex)), 'Pro saves chord ' + chordIndex + ' in one folder');
    }
}());

var saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
assert(saveEditorSource.includes('Standard版ではフォルダは3個まで保存できます。'), 'save editor explains the Standard folder limit');
assert(saveEditorSource.includes('Standard版では1フォルダ10個まで保存できます。'), 'save editor explains the Standard chord limit');
assert(librarySource.includes('Standard版ではフォルダは3個まで保存できます。'), 'library explains the Standard folder limit');
assert(librarySource.includes('Standard版では1フォルダ10個まで保存できます。'), 'library explains the Standard chord limit');

console.log('storage-limit: Standard 3 total folders / 10 chords per folder, empty-state safety, and Pro unlimited access OK');
