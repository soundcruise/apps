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

    var folders = [];
    for (var folderIndex = 1; folderIndex <= 3; folderIndex += 1) {
        folders.push(storage.createFolder('Folder ' + folderIndex));
        assert(folders[folderIndex - 1], 'Standard creates custom folder ' + folderIndex);
    }
    assert.strictEqual(storage.loadFolders().length, 4, 'the builtin uncategorized folder is not counted against three custom folders');
    assert.strictEqual(storage.createFolder('Folder 4'), null, 'Standard rejects the fourth custom folder');
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

console.log('storage-limit: Standard 3 custom folders / 10 chords per folder, safe overwrite, rejected move, and Pro unlimited access OK');
