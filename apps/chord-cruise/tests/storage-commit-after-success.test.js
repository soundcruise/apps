'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var storageSource = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
var saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
var settingsSource = fs.readFileSync(path.join(root, 'js/ui/settings.js'), 'utf8');

var P = 'chordCruise.';
var SETTINGS = P + 'settings';
var FOLDERS = P + 'folders';
var ORDER = P + 'libraryOrder';

function native(value) {
    return JSON.parse(JSON.stringify(value));
}

function storageError(name) {
    var error = new Error(name + ' test failure');
    error.name = name;
    return error;
}

function createLocalStorage(seed) {
    var values = Object.assign({}, seed || {});
    var failure = null;
    return {
        getItem: function (key) {
            if (failure && failure.operation === 'get' && failure.key === key) throw storageError(failure.name);
            return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
        },
        setItem: function (key, value) {
            if (failure && failure.operation === 'set' && failure.key === key) throw storageError(failure.name);
            values[key] = String(value);
        },
        removeItem: function (key) {
            if (failure && failure.operation === 'remove' && failure.key === key) throw storageError(failure.name);
            delete values[key];
        },
        key: function (index) { return Object.keys(values)[index] || null; },
        get length() { return Object.keys(values).length; },
        fail: function (operation, key, name) { failure = { operation: operation, key: key, name: name }; },
        clearFailure: function () { failure = null; },
        snapshot: function () { return Object.assign({}, values); }
    };
}

function loadStorage(seed) {
    var localStorage = createLocalStorage(seed);
    var context = {
        window: {
            localStorage: localStorage,
            ChordCruise: {
                featureAccess: {
                    hasFeature: function () { return false; },
                    isProEdition: function () { return false; }
                }
            }
        },
        document: { addEventListener: function () {}, getElementById: function () { return null; } },
        console: { warn: function () {} },
        Date: Date,
        JSON: JSON,
        Math: Math,
        Number: Number,
        isFinite: isFinite,
        URL: URL
    };
    vm.createContext(context);
    vm.runInContext(storageSource, context, { filename: 'storage.js' });
    return { context: context, storage: context.window.ChordCruise.storage, localStorage: localStorage };
}

function baseSeed() {
    var seed = {};
    seed[SETTINGS] = JSON.stringify({
        selectedKey: 0,
        chordToneMode: '3',
        fretboardDisplayMode: 'note',
        highFretMode: false,
        folderShelfColumns: 4,
        libraryColumns: 4,
        libraryCardDisplayMode: 'finger',
        libraryCardMonochrome: false,
        lastSaveFolderId: 'folder-a'
    });
    seed[FOLDERS] = JSON.stringify([
        { id: 'folder-a', name: 'A', builtin: false, colorKey: 'blue', order: 0 },
        { id: 'folder-b', name: 'B', builtin: false, colorKey: 'green', order: 1 }
    ]);
    return seed;
}

function exposeCommitHelpers(env) {
    var notices = [];
    env.context.window.ChordCruise.state = { settings: env.storage.loadSettings() };
    env.context.window.ChordCruise.ui = {
        toast: { show: function (message, options) { notices.push({ message: message, options: options }); } }
    };
    env.context.document = { addEventListener: function () {}, getElementById: function () { return null; } };

    var instrumentedExplore = exploreSource.replace(
        'window.ChordCruise.ui.explore = {',
        'window.ChordCruise.ui.__s3Explore = { saveSetting: saveSetting };\n    window.ChordCruise.ui.explore = {'
    );
    vm.runInContext(instrumentedExplore, env.context, { filename: 'explore.js' });

    var instrumentedLibrary = librarySource.replace(
        'window.ChordCruise.ui.library = {',
        'window.ChordCruise.ui.__s3Library = { saveLibrarySetting: saveLibrarySetting };\n    window.ChordCruise.ui.library = {'
    );
    vm.runInContext(instrumentedLibrary, env.context, { filename: 'library.js' });

    var instrumentedSaveEditor = saveEditorSource.replace(
        'window.ChordCruise.ui.saveEditor = {',
        'window.ChordCruise.ui.__s3SaveEditor = { rememberSaveFolder: rememberSaveFolder };\n    window.ChordCruise.ui.saveEditor = {'
    );
    vm.runInContext(instrumentedSaveEditor, env.context, { filename: 'save-editor.js' });

    return {
        notices: notices,
        explore: env.context.window.ChordCruise.ui.__s3Explore,
        library: env.context.window.ChordCruise.ui.__s3Library,
        saveEditor: env.context.window.ChordCruise.ui.__s3SaveEditor
    };
}

(function renameFolderReportsEveryWriteFailure() {
    ['QuotaExceededError', 'SecurityError', 'Error'].forEach(function (errorName) {
        var env = loadStorage(baseSeed());
        var before = env.localStorage.getItem(FOLDERS);
        env.localStorage.fail('set', FOLDERS, errorName);
        assert.strictEqual(env.storage.renameFolder('folder-a', '変更後'), false, errorName + ' returns false');
        assert.strictEqual(env.localStorage.getItem(FOLDERS), before, errorName + ' preserves stored folders');
        assert.strictEqual(env.storage.loadFolders()[0].name, 'A', errorName + ' preserves the visible folder name');
    });
}());

(function exploreAndLibrarySettingsCommitOnlyAfterSuccess() {
    var exploreChanges = [
        ['selectedKey', 7],
        ['chordToneMode', '7'],
        ['fretboardDisplayMode', 'degree'],
        ['highFretMode', true]
    ];
    var libraryChanges = [
        ['folderShelfColumns', 6],
        ['libraryColumns', 2],
        ['libraryCardDisplayMode', 'solfege'],
        ['libraryCardMonochrome', true],
        ['fretboardDisplayMode', 'finger']
    ];

    ['QuotaExceededError', 'SecurityError', 'Error'].forEach(function (errorName) {
        exploreChanges.concat(libraryChanges).forEach(function (change, index) {
            var env = loadStorage(baseSeed());
            var helpers = exposeCommitHelpers(env);
            var key = change[0];
            var beforeState = env.context.window.ChordCruise.state.settings[key];
            var beforeRaw = env.localStorage.getItem(SETTINGS);
            env.localStorage.fail('set', SETTINGS, errorName);
            var helper = index < exploreChanges.length ? helpers.explore.saveSetting : helpers.library.saveLibrarySetting;
            assert.strictEqual(helper((function () { var value = {}; value[key] = change[1]; return value; }())), false, errorName + ' rejects ' + key);
            assert.strictEqual(env.context.window.ChordCruise.state.settings[key], beforeState, errorName + ' preserves memory ' + key);
            assert.strictEqual(env.localStorage.getItem(SETTINGS), beforeRaw, errorName + ' preserves storage ' + key);
            assert.strictEqual(helpers.notices.length, 1, errorName + ' reports one error for ' + key);
            assert.strictEqual(helpers.notices[0].message, '設定を保存できませんでした');
            assert.strictEqual(helpers.notices[0].options.type, 'error');
        });
    });

    var success = loadStorage(baseSeed());
    var successHelpers = exposeCommitHelpers(success);
    exploreChanges.forEach(function (change) {
        var partial = {}; partial[change[0]] = change[1];
        assert.strictEqual(successHelpers.explore.saveSetting(partial), true, 'Explore saves ' + change[0]);
    });
    libraryChanges.forEach(function (change) {
        var partial = {}; partial[change[0]] = change[1];
        assert.strictEqual(successHelpers.library.saveLibrarySetting(partial), true, 'Library saves ' + change[0]);
    });
    var reloaded = loadStorage(success.localStorage.snapshot()).storage.loadSettings();
    var expected = {};
    exploreChanges.concat(libraryChanges).forEach(function (change) { expected[change[0]] = change[1]; });
    Object.keys(expected).forEach(function (key) {
        assert.strictEqual(reloaded[key], expected[key], 'successful ' + key + ' survives reload');
    });
    assert.strictEqual(successHelpers.notices.length, 0, 'successful settings changes show no error');
}());

(function rememberedFolderFailureNeverRollsBackTheSavedChord() {
    ['QuotaExceededError', 'SecurityError', 'Error'].forEach(function (errorName) {
        var env = loadStorage(baseSeed());
        var helpers = exposeCommitHelpers(env);
        var saved = env.storage.saveChord({ chordName: 'C', folderId: 'folder-b', notes: [], mutedStrings: [] });
        assert(saved, errorName + ' setup chord is saved');
        var recordRaw = env.localStorage.getItem(P + 'chord.' + saved.id);
        env.localStorage.fail('set', SETTINGS, errorName);
        helpers.saveEditor.rememberSaveFolder(saved.folderId);
        assert.strictEqual(env.context.window.ChordCruise.state.settings.lastSaveFolderId, 'folder-a', errorName + ' preserves remembered folder in memory');
        assert.strictEqual(env.storage.loadSettings().lastSaveFolderId, 'folder-a', errorName + ' preserves remembered folder in storage');
        assert.strictEqual(env.localStorage.getItem(P + 'chord.' + saved.id), recordRaw, errorName + ' leaves the saved chord intact');
    });
}());

(function folderCreationSurvivesDerivedOrderFailure() {
    ['QuotaExceededError', 'SecurityError', 'Error'].forEach(function (errorName) {
        var seed = baseSeed();
        seed[ORDER] = JSON.stringify({
            version: 1,
            folderIds: ['folder-a', 'folder-b'],
            entryIdsByFolder: { 'folder-a': [], 'folder-b': [] }
        });
        var env = loadStorage(seed);
        env.localStorage.fail('set', ORDER, errorName);
        var created = env.storage.createFolder('C');
        assert(created, errorName + ' keeps a successfully persisted folder');
        assert(env.storage.loadFolders().some(function (folder) { return folder.id === created.id; }), errorName + ' exposes the persisted folder');
        assert(env.storage.loadOrderedFolders().some(function (folder) { return folder.id === created.id; }), errorName + ' derives a safe in-memory order');
        env.localStorage.clearFailure();
        var reloaded = loadStorage(env.localStorage.snapshot());
        assert(reloaded.storage.loadOrderedFolders().some(function (folder) { return folder.id === created.id; }), errorName + ' supplements order after reload');
        assert.strictEqual(reloaded.storage.createFolder('over limit'), null, errorName + ' still counts the folder toward the Standard limit');
        assert.strictEqual(reloaded.storage.getLastError(), 'standard-folder-limit');
    });
}());

(function handlerOrderingKeepsUiOnThePersistedState() {
    assert(exploreSource.includes("if (!saveSetting({ selectedKey: parseInt(event.target.value, 10) })) {\n                event.target.value = String(getSettings().selectedKey);"), 'key selector rolls back to the persisted value');
    assert(exploreSource.includes("if (!saveSetting({ fretboardDisplayMode: mode })) {\n                    updateFbSegments();"), 'Explore display mode restores its controls on failure');
    assert(exploreSource.includes("if (!saveSetting({ highFretMode: enabled })) {\n                updateHighFretToggle();"), 'high-fret switch restores its controls on failure');
    assert(exploreSource.includes("if (!saveSetting({ chordToneMode: toneMode })) {\n            updateSegments();"), 'tone mode restores its controls on failure');

    assert(librarySource.includes("if (!saveLibrarySetting({ folderShelfColumns: columns })) {\n                    renderFolders();"), 'folder shelf columns rerender from old state on failure');
    assert(librarySource.includes("if (!saveLibrarySetting({ libraryColumns: nextColumns })) {\n                    applyLibraryColumns(currentLibraryColumns());"), 'code columns restore the old selection on failure');
    assert(librarySource.includes("if (!saveLibrarySetting({ libraryCardDisplayMode: mode })) {\n                    updateLibraryCardDisplayControls();"), 'list display mode restores controls on failure');
    assert(librarySource.includes("if (!saveLibrarySetting({ libraryCardMonochrome: monochrome })) {\n                updateLibraryCardDisplayControls();"), 'list monochrome restores controls on failure');
    assert(librarySource.includes("if (!saveLibrarySetting({ fretboardDisplayMode: mode })) {\n                    updateLibModeSegments();"), 'detail display mode restores controls on failure');
    assert(librarySource.includes("input.value = folder.name;\n                        toast(storageErrorMessage('フォルダ名を変更できませんでした'), 'error');"), 'rename failure restores the old name and reports an error');
    assert(settingsSource.includes('if (window.ChordCruise.storage.saveSettings(next) !== true)'), 'right-top settings retain their existing commit-after-success contract');
}());

console.log('storage-commit-after-success: write failures preserve storage, memory, UI selections, and saved records');
