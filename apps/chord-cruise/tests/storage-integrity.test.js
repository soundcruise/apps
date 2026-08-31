'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var storageSource = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');
var P = 'chordCruise.';

function native(value) {
    return JSON.parse(JSON.stringify(value));
}

function createLocalStorage(seed) {
    var values = Object.assign({}, seed || {});
    var getFailure = null;
    var setFailure = null;
    var setCalls = 0;
    function failure(name) {
        var error = new Error(name === 'Error' ? 'generic storage failure' : name);
        error.name = name;
        return error;
    }
    return {
        getItem: function (key) {
            if (getFailure) throw failure(getFailure);
            return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
        },
        setItem: function (key, value) {
            setCalls += 1;
            if (setFailure) throw failure(setFailure);
            values[key] = String(value);
        },
        removeItem: function (key) { delete values[key]; },
        key: function (index) { return Object.keys(values)[index] || null; },
        snapshot: function () { return Object.assign({}, values); },
        failGet: function (name) { getFailure = name; },
        failSet: function (name) { setFailure = name; },
        setCallCount: function () { return setCalls; },
        get length() { return Object.keys(values).length; }
    };
}

function loadStorage(seed, pro) {
    var localStorage = createLocalStorage(seed);
    var context = {
        window: {
            localStorage: localStorage,
            ChordCruise: {
                featureAccess: {
                    hasFeature: function (featureName) { return !!pro && featureName === 'unlimitedLibrary'; }
                }
            }
        },
        console: { warn: function () {} },
        Date: Date,
        JSON: JSON,
        Math: Math,
        Number: Number,
        isFinite: isFinite
    };
    vm.createContext(context);
    vm.runInContext(storageSource, context, { filename: 'storage.js' });
    return { storage: context.window.ChordCruise.storage, localStorage: localStorage };
}

function folder(id, name) {
    return { id: id, name: name, builtin: false, colorKey: 'blue', order: 0 };
}

function indexEntry(id, folderId) {
    return { id: id, folderId: folderId, chordName: 'C', updatedAt: '2026-01-01T00:00:00Z' };
}

(function schemaVersionAccessFailuresNeverStopInitialization() {
    ['SecurityError', 'Error'].forEach(function (errorName) {
        var readFailure = loadStorage({});
        readFailure.localStorage.failGet(errorName);
        assert.doesNotThrow(function () {
            readFailure.storage.ensureSchemaVersion();
        }, errorName + ' from getItem does not escape ensureSchemaVersion');
        assert.strictEqual(readFailure.localStorage.setCallCount(), 0, errorName + ' read failure does not attempt initialization');
    });

    var writeFailure = loadStorage({});
    writeFailure.localStorage.failSet('SecurityError');
    assert.doesNotThrow(function () {
        writeFailure.storage.ensureSchemaVersion();
    }, 'SecurityError from setItem does not escape ensureSchemaVersion');

    var missing = loadStorage({});
    missing.storage.ensureSchemaVersion();
    assert.strictEqual(JSON.parse(missing.localStorage.getItem(P + 'schemaVersion')), '1', 'missing schema version is initialized to 1');

    var existingSeed = {};
    existingSeed[P + 'schemaVersion'] = JSON.stringify('1');
    var existing = loadStorage(existingSeed);
    existing.storage.ensureSchemaVersion();
    assert.strictEqual(existing.localStorage.setCallCount(), 0, 'existing schema version is not rewritten');
    assert.strictEqual(existing.localStorage.getItem(P + 'schemaVersion'), existingSeed[P + 'schemaVersion']);
}());

(function settingsRejectMalformedValuesAndPreserveFutureKeys() {
    var invalidSelectedKeys = [null, undefined, '4', 'NaN', {}, [], -1, 12, 1.5];
    invalidSelectedKeys.forEach(function (selectedKey) {
        var seed = {};
        seed[P + 'settings'] = JSON.stringify({
            selectedKey: selectedKey,
            chordToneMode: 'invalid',
            fretboardDisplayMode: 'invalid',
            librarySortMode: 'invalid',
            futureStringSetting: 'keep-me'
        });
        var settings = loadStorage(seed).storage.loadSettings();
        assert.strictEqual(settings.selectedKey, 0, 'invalid selectedKey falls back to C');
        assert.strictEqual(settings.chordToneMode, '3');
        assert.strictEqual(settings.fretboardDisplayMode, 'note');
        assert.strictEqual(settings.librarySortMode, 'updatedDesc');
        assert.strictEqual(settings.futureStringSetting, 'keep-me', 'unknown settings remain forward-compatible');
    });

    var validSeed = {};
    validSeed[P + 'settings'] = JSON.stringify({ selectedKey: 11, chordToneMode: '7', fretboardDisplayMode: 'degree', librarySortMode: 'updatedDesc' });
    var valid = loadStorage(validSeed).storage.loadSettings();
    assert.strictEqual(valid.selectedKey, 11);
    assert.strictEqual(valid.chordToneMode, '7');
    assert.strictEqual(valid.fretboardDisplayMode, 'degree');
    assert.strictEqual(loadStorage({}).storage.normalizeSettings({ selectedKey: NaN }).selectedKey, 0, 'NaN selectedKey is rejected before Explore');

    [null, true, 3, 'settings', [{ selectedKey: 9 }]].forEach(function (rawSettings) {
        var seed = {};
        seed[P + 'settings'] = JSON.stringify(rawSettings);
        var storage = loadStorage(seed).storage;
        var loaded = storage.loadSettings();
        assert.strictEqual(loaded.selectedKey, 0, 'non-object settings use defaults');
        assert.strictEqual(loaded['0'], undefined, 'array indexes are not merged as setting keys');
        assert.strictEqual(storage.normalizeSettings(rawSettings).selectedKey, 0, 'the public normalizer is also safe for malformed top-level input');
    });
}());

(function foldersReturnValidatedUniqueNonDestructiveView() {
    var rawFolders = [
        null, 1, true, '', '   ', {}, [],
        { id: '', name: 'empty id' },
        { id: '   ', name: 'space id' },
        { id: 'folder-no-name' },
        folder('folder-valid', '有効'),
        folder('folder-valid', '重複は後勝ちにしない')
    ];
    var raw = JSON.stringify(rawFolders);
    var seed = {};
    seed[P + 'folders'] = raw;
    var env = loadStorage(seed);
    assert.deepStrictEqual(native(env.storage.loadFolders()), [folder('folder-valid', '有効')], 'only the first valid folder ID remains in the view');
    assert.strictEqual(env.localStorage.getItem(P + 'folders'), raw, 'invalid raw folder members are not rewritten');
}());

(function corruptFolderTopLevelsUseFallbackWithoutOverwrite() {
    ['{', 'null', '{}', '"folders"'].forEach(function (raw) {
        var seed = {};
        seed[P + 'folders'] = raw;
        var env = loadStorage(seed);
        var folders = env.storage.loadFolders();
        assert.strictEqual(folders.length, 1);
        assert.strictEqual(folders[0].id, env.storage.UNCATEGORIZED_ID, 'corrupt folders expose a safe fallback view');
        assert.strictEqual(env.localStorage.getItem(P + 'folders'), raw, 'corrupt folders raw value is preserved');
    });

    var missing = loadStorage({});
    assert.strictEqual(missing.storage.loadFolders()[0].id, missing.storage.UNCATEGORIZED_ID);
    assert(Array.isArray(JSON.parse(missing.localStorage.getItem(P + 'folders'))), 'a genuinely new user still receives a persisted initial folder');
}());

(function indexReturnsValidatedUniqueNonDestructiveView() {
    var rawIndex = [
        null, 1, false, '', [], {},
        { id: '', folderId: 'folder-a' },
        { id: '   ', folderId: 'folder-a' },
        { id: 'missing-folder' },
        { id: 'bad-folder', folderId: '   ' },
        indexEntry('entry-valid', 'folder-a'),
        indexEntry('entry-valid', 'folder-b')
    ];
    var raw = JSON.stringify(rawIndex);
    var seed = {};
    seed[P + 'chords.index'] = raw;
    seed[P + 'chord.entry-valid'] = JSON.stringify({ id: 'entry-valid', folderId: 'folder-a', chordName: 'C', notes: [] });
    seed[P + 'folders'] = JSON.stringify([folder('folder-a', 'A'), folder('folder-b', 'B')]);
    var env = loadStorage(seed);
    assert.deepStrictEqual(native(env.storage.loadChordIndex()), [indexEntry('entry-valid', 'folder-a')], 'only the first valid index ID remains in the view');
    assert.strictEqual(env.localStorage.getItem(P + 'chords.index'), raw, 'invalid raw index members are not rewritten');

    ['{', 'null', '{}', '"index"'].forEach(function (topLevelRaw) {
        var topLevelSeed = {};
        topLevelSeed[P + 'chords.index'] = topLevelRaw;
        var topLevelEnv = loadStorage(topLevelSeed);
        assert.deepStrictEqual(native(topLevelEnv.storage.loadChordIndex()), [], 'invalid index top-level exposes an empty safe view');
        assert.strictEqual(topLevelEnv.localStorage.getItem(P + 'chords.index'), topLevelRaw, 'invalid index top-level is not rewritten');
    });
}());

(function invalidAndDuplicateIndexEntriesDoNotConsumeStandardLimit() {
    var targetFolder = folder('folder-a', 'A');
    var rawIndex = [null, {}, [], { id: ' ', folderId: 'folder-a' }];
    for (var duplicate = 0; duplicate < 10; duplicate += 1) {
        rawIndex.push(indexEntry('one-real-slot', 'folder-a'));
    }
    var seed = {};
    seed[P + 'folders'] = JSON.stringify([targetFolder]);
    seed[P + 'chords.index'] = JSON.stringify(rawIndex);
    seed[P + 'chord.one-real-slot'] = JSON.stringify({ id: 'one-real-slot', folderId: 'folder-a', chordName: 'C', notes: [] });
    var env = loadStorage(seed);
    assert.strictEqual(env.storage.loadChordIndex().length, 1, 'duplicates consume one safe-view slot');
    var saved = env.storage.saveChord({ chordName: 'G', folderId: 'folder-a', notes: [], mutedStrings: [] });
    assert(saved, 'invalid and duplicate index members do not falsely exhaust the Standard ten-chord limit');
}());

(function malformedChordRecordsAreUnreadableButRemainStored() {
    var cases = {
        parse: '{',
        nullValue: 'null',
        primitive: '3',
        array: '[]',
        empty: '{}',
        missingNotes: JSON.stringify({ id: 'missingNotes', folderId: 'folder-a', chordName: 'C' }),
        badNote: JSON.stringify({ id: 'badNote', folderId: 'folder-a', chordName: 'C', notes: [null] }),
        badRoot: JSON.stringify({ id: 'badRoot', folderId: 'folder-a', chordName: 'C', notes: [], rootPc: 12 }),
        wrongId: JSON.stringify({ id: 'another-id', folderId: 'folder-a', chordName: 'C', notes: [] })
    };
    var seed = {};
    Object.keys(cases).forEach(function (id) { seed[P + 'chord.' + id] = cases[id]; });
    var env = loadStorage(seed);
    Object.keys(cases).forEach(function (id) {
        assert.strictEqual(env.storage.loadChord(id), null, id + ' is excluded from the safe record view');
        assert.strictEqual(env.localStorage.getItem(P + 'chord.' + id), cases[id], id + ' raw record is not deleted or rewritten');
    });
}());

(function normalLegacyAndCustomDataRemainUnchanged() {
    var normalFolder = {
        id: 'folder-custom', name: '練習', builtin: false, colorKey: 'pastel-blue', order: 8,
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', futureFolderField: 'keep'
    };
    var normalIndex = {
        id: 'record-custom', folderId: 'folder-custom', chordName: 'C7(♯9)', formName: '自由', shape: null,
        fretRange: { min: 0, max: 7, includesOpen: true }, memo: 'memo', keyContext: { tonicPc: 0, scaleType: 'major' },
        updatedAt: '2026-01-01T00:00:00Z', futureIndexField: 'keep'
    };
    var normalRecord = {
        id: 'record-custom', folderId: 'folder-custom', chordName: 'C7(♯9)', formName: '自由',
        rootPc: 0, intervals: [0, 4, 7, 10, 15], schemaVersion: 1,
        notes: [{ string: 6, fret: 0, interval: 4, finger: '親', fingeringWarning: false }],
        mutedStrings: [5], tensionPcs: [3], tensionFingerings: [{ string: 2, fret: 4, finger: '小' }],
        memo: 'memo', keyContext: { tonicPc: 0, scaleType: 'major' }, customFingering: { enabled: true },
        futureRecordField: { keep: true }
    };
    var seed = {};
    seed[P + 'folders'] = JSON.stringify([normalFolder]);
    seed[P + 'chords.index'] = JSON.stringify([normalIndex]);
    seed[P + 'chord.record-custom'] = JSON.stringify(normalRecord);
    var env = loadStorage(seed);
    assert.deepStrictEqual(native(env.storage.loadFolders()), [normalFolder], 'normal folder fields and order remain unchanged');
    assert.deepStrictEqual(native(env.storage.loadChordIndex()), [normalIndex], 'normal index and unknown fields remain unchanged');
    assert.deepStrictEqual(native(env.storage.loadChord('record-custom')), normalRecord, 'custom fingering, mute, tension, memo, context, and unknown fields remain unchanged');
}());

(function libraryOrderConsumesOnlyValidatedViews() {
    var rawFolders = [folder('folder-a', 'A'), null, folder('folder-a', 'duplicate')];
    var rawIndex = [indexEntry('entry-a', 'folder-a'), {}, indexEntry('entry-a', 'folder-a')];
    var seed = {};
    seed[P + 'folders'] = JSON.stringify(rawFolders);
    seed[P + 'chords.index'] = JSON.stringify(rawIndex);
    seed[P + 'chord.entry-a'] = JSON.stringify({ id: 'entry-a', folderId: 'folder-a', chordName: 'C', notes: [] });
    seed[P + 'libraryOrder'] = JSON.stringify({ version: 1, folderIds: ['bad', 'folder-a'], entryIdsByFolder: { 'folder-a': ['bad', 'entry-a'] } });
    var env = loadStorage(seed);
    assert.deepStrictEqual(native(env.storage.loadLibraryOrder()), {
        version: 1,
        folderIds: ['folder-a'],
        entryIdsByFolder: { 'folder-a': ['entry-a'] }
    }, 'library order is normalized against validated folder/index views');
    assert.strictEqual(env.localStorage.getItem(P + 'folders'), JSON.stringify(rawFolders), 'order normalization does not repair raw folders');
    assert.strictEqual(env.localStorage.getItem(P + 'chords.index'), JSON.stringify(rawIndex), 'order normalization does not repair raw index');
}());

console.log('storage-integrity: safe schema access, non-destructive settings/folder/index/record validation, and normal-data compatibility OK');
