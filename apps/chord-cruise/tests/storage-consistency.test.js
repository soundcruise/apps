'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var storageSource = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
var P = 'chordCruise.';
var FOLDERS = P + 'folders';
var INDEX = P + 'chords.index';

function native(value) {
    return JSON.parse(JSON.stringify(value));
}

function folder(id) {
    return { id: id, name: id, builtin: false, colorKey: 'blue', order: 0 };
}

function entry(id, folderId, chordName) {
    return { id: id, folderId: folderId, chordName: chordName || id, updatedAt: '2026-01-01T00:00:00Z' };
}

function record(id, folderId, chordName) {
    return {
        id: id,
        folderId: folderId,
        chordName: chordName || id,
        notes: [],
        mutedStrings: [],
        schemaVersion: 1,
        updatedAt: '2026-02-01T00:00:00Z'
    };
}

function createLocalStorage(seed, failureMode) {
    var values = Object.assign({}, seed || {});
    var storage = {
        getItem: function (key) {
            if (failureMode === 'get-record' && key.indexOf(P + 'chord.') === 0) throw new Error('SecurityError');
            return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
        },
        setItem: function (key, value) { values[key] = String(value); },
        removeItem: function (key) { delete values[key]; },
        key: function (index) {
            if (failureMode === 'key') throw new Error('SecurityError');
            return Object.keys(values)[index] || null;
        },
        snapshot: function () { return Object.assign({}, values); }
    };
    Object.defineProperty(storage, 'length', {
        get: function () {
            if (failureMode === 'length') throw new Error('SecurityError');
            return Object.keys(values).length;
        }
    });
    return storage;
}

function loadStorage(seed, options) {
    var opts = options || {};
    var localStorage = createLocalStorage(seed, opts.failureMode);
    var context = {
        window: {
            localStorage: localStorage,
            ChordCruise: {
                featureAccess: {
                    hasFeature: function (featureName) { return !!opts.pro && featureName === 'unlimitedLibrary'; }
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

(function ghostEntriesAreExcludedWithoutRawRepair() {
    var ghosts = [];
    for (var index = 0; index < 10; index += 1) ghosts.push(entry('ghost-' + index, 'f1'));
    var rawIndex = JSON.stringify(ghosts);
    var seed = {};
    seed[FOLDERS] = JSON.stringify([folder('f1')]);
    seed[INDEX] = rawIndex;
    var env = loadStorage(seed);
    assert.deepStrictEqual(native(env.storage.loadChordIndex()), [], 'record-less ghost entries are absent from the operational view');
    assert.deepStrictEqual(native(env.storage.loadOrderedChordIndex('f1')), [], 'ghosts cannot become Library/export cards');
    assert.strictEqual(env.localStorage.getItem(INDEX), rawIndex, 'ordinary reads do not delete ghost metadata');

    var saved = env.storage.saveChord({ chordName: 'C', folderId: 'f1', notes: [], mutedStrings: [] });
    assert(saved, 'ten ghosts consume zero Standard slots');
    assert.strictEqual(env.storage.loadChordIndex().length, 1, 'the new real record is the only operational entry');
    assert.strictEqual(JSON.parse(env.localStorage.getItem(INDEX)).length, 11, 'an explicit save preserves unrelated raw ghost entries');
}());

(function orphanARecoversFromRecordWithoutIndexRewrite() {
    var orphan = record('orphan-a', 'f1', 'Cadd9');
    var seed = {};
    seed[FOLDERS] = JSON.stringify([folder('f1')]);
    seed[INDEX] = '[]';
    seed[P + 'chord.orphan-a'] = JSON.stringify(orphan);
    var env = loadStorage(seed);
    var operational = env.storage.loadChordIndex();
    assert.strictEqual(operational.length, 1);
    assert.strictEqual(operational[0].id, 'orphan-a');
    assert.strictEqual(operational[0].chordName, 'Cadd9', 'recovered metadata comes from the record source of truth');
    assert.deepStrictEqual(native(env.storage.loadOrderedChordIndex('f1')).map(function (item) { return item.id; }), ['orphan-a'], 'orphan A is reachable by Library and folder export');
    assert.strictEqual(env.localStorage.getItem(INDEX), '[]', 'orphan recovery does not auto-repair raw index');

    var cloneInput = native(env.storage.loadChord('orphan-a'));
    delete cloneInput.id;
    delete cloneInput.createdAt;
    delete cloneInput.updatedAt;
    delete cloneInput.schemaVersion;
    var clone = env.storage.saveChord(cloneInput);
    assert(clone && clone.folderId === 'f1', 'a recovered orphan can be duplicated into its record-side folder');
    assert.strictEqual(env.storage.loadChordIndex().length, 2, 'original orphan and duplicate are both operationally visible');
}());

(function orphanACountsTowardStandardLimit() {
    var seed = {};
    var folders = [folder('f1')];
    seed[FOLDERS] = JSON.stringify(folders);
    seed[INDEX] = '[]';
    for (var index = 0; index < 10; index += 1) {
        var orphan = record('orphan-limit-' + index, 'f1');
        seed[P + 'chord.' + orphan.id] = JSON.stringify(orphan);
    }
    var env = loadStorage(seed);
    assert.strictEqual(env.storage.loadChordIndex().length, 10);
    assert.strictEqual(env.storage.saveChord({ chordName: 'overflow', folderId: 'f1', notes: [] }), null, 'ten orphan A records fill the Standard folder limit');
    assert.strictEqual(env.storage.getLastError(), 'standard-folder-chord-limit');
}());

(function orphanBRemainsHiddenAndUntouched() {
    var missingFolderRecord = record('orphan-b', 'missing-folder', 'Dm');
    var rawRecord = JSON.stringify(missingFolderRecord);
    var seed = {};
    seed[FOLDERS] = JSON.stringify([folder('f1')]);
    seed[INDEX] = '[]';
    seed[P + 'chord.orphan-b'] = rawRecord;
    var env = loadStorage(seed);
    assert.deepStrictEqual(native(env.storage.loadChordIndex()), [], 'orphan B is not exposed to Library or limits');
    assert.strictEqual(env.localStorage.getItem(P + 'chord.orphan-b'), rawRecord, 'orphan B raw record is retained');
    assert.strictEqual(env.storage.loadChord('orphan-b').folderId, 'missing-folder', 'orphan B is not moved to another folder');
}());

(function recordFolderIdOverridesStaleIndexFolderId() {
    var seed = {};
    var rawEntries = [];
    seed[FOLDERS] = JSON.stringify([folder('f1'), folder('f2')]);
    for (var index = 0; index < 10; index += 1) {
        var id = 'mismatch-' + index;
        rawEntries.push(entry(id, 'f1', 'stale-' + index));
        seed[P + 'chord.' + id] = JSON.stringify(record(id, 'f2', 'record-' + index));
    }
    seed[INDEX] = JSON.stringify(rawEntries);
    var rawBefore = seed[INDEX];
    var env = loadStorage(seed);
    var operational = env.storage.loadChordIndex();
    assert(operational.every(function (item) { return item.folderId === 'f2' && item.chordName.indexOf('record-') === 0; }), 'folder and display metadata use the record source of truth');
    assert.deepStrictEqual(native(env.storage.loadOrderedChordIndex('f1')), []);
    assert.strictEqual(env.storage.loadOrderedChordIndex('f2').length, 10);
    assert.strictEqual(env.localStorage.getItem(INDEX), rawBefore, 'stale raw folderId is not auto-rewritten');

    assert(env.storage.saveChord({ chordName: 'F', folderId: 'f1', notes: [] }), 'stale f1 index entries consume no f1 slots');
    assert.strictEqual(env.storage.saveChord({ chordName: 'G', folderId: 'f2', notes: [] }), null, 'record-side f2 entries consume f2 slots');
    assert.strictEqual(env.storage.getLastError(), 'standard-folder-chord-limit');
}());

(function folderDeleteScansRecordsBeyondIndexAndProtectsOtherData() {
    var seed = {};
    seed[FOLDERS] = JSON.stringify([folder('f1'), folder('f2')]);
    seed[INDEX] = JSON.stringify([entry('stale-f1-index', 'f1')]);
    seed[P + 'chord.orphan-target'] = JSON.stringify(record('orphan-target', 'f1'));
    seed[P + 'chord.other-orphan'] = JSON.stringify(record('other-orphan', 'f2'));
    seed[P + 'chord.stale-f1-index'] = JSON.stringify(record('stale-f1-index', 'f2'));
    var malformedRaw = JSON.stringify({ id: 'malformed', folderId: 'f1', chordName: 'broken', notes: 'not-an-array' });
    seed[P + 'chord.malformed'] = malformedRaw;
    var env = loadStorage(seed);

    assert.strictEqual(env.storage.deleteFolder('f1'), true);
    assert.strictEqual(env.localStorage.getItem(P + 'chord.orphan-target'), null, 'orphan A belonging to the deleted folder is removed');
    assert(env.localStorage.getItem(P + 'chord.other-orphan'), 'other-folder orphan remains');
    assert(env.localStorage.getItem(P + 'chord.stale-f1-index'), 'record-side f2 wins over stale f1 metadata during deletion');
    assert.strictEqual(env.localStorage.getItem(P + 'chord.malformed'), malformedRaw, 'malformed record with unverifiable ownership is not deleted');
    assert.deepStrictEqual(native(env.storage.loadChordIndex()).map(function (item) { return item.id; }).sort(), ['other-orphan', 'stale-f1-index'], 'remaining f2 records recover normally');

    var secondSeed = {};
    secondSeed[FOLDERS] = JSON.stringify([folder('f1'), folder('f2')]);
    secondSeed[INDEX] = JSON.stringify([entry('delete-by-record-folder', 'f1')]);
    secondSeed[P + 'chord.delete-by-record-folder'] = JSON.stringify(record('delete-by-record-folder', 'f2'));
    var second = loadStorage(secondSeed);
    assert.strictEqual(second.storage.deleteFolder('f2'), true);
    assert.strictEqual(second.localStorage.getItem(P + 'chord.delete-by-record-folder'), null, 'record-side folder match deletes a mismatched indexed record');
    assert.deepStrictEqual(JSON.parse(second.localStorage.getItem(INDEX)), [], 'stale index metadata for the deleted record is removed by ID');
}());

(function recoveredOrphanCanBeDeletedNormally() {
    var seed = {};
    seed[FOLDERS] = JSON.stringify([folder('f1')]);
    seed[INDEX] = '[]';
    seed[P + 'chord.recovered-delete'] = JSON.stringify(record('recovered-delete', 'f1'));
    var env = loadStorage(seed);
    assert.strictEqual(env.storage.loadChordIndex()[0].id, 'recovered-delete');
    assert.strictEqual(env.storage.deleteChord('recovered-delete'), true);
    assert.strictEqual(env.localStorage.getItem(P + 'chord.recovered-delete'), null);
    assert.deepStrictEqual(native(env.storage.loadChordIndex()), []);
}());

(function enumerationFailureFallsBackWithoutStoppingTheApp() {
    ['length', 'key', 'get-record'].forEach(function (failureMode) {
        var seed = {};
        seed[FOLDERS] = JSON.stringify([folder('f1')]);
        seed[INDEX] = JSON.stringify([entry('indexed', 'f1')]);
        seed[P + 'chord.indexed'] = JSON.stringify(record('indexed', 'f1'));
        seed[P + 'chord.orphan'] = JSON.stringify(record('orphan', 'f1'));
        var env = loadStorage(seed, { failureMode: failureMode });
        assert.doesNotThrow(function () { env.storage.loadChordIndex(); }, failureMode + ' failure does not stop storage');
        assert.deepStrictEqual(native(env.storage.loadChordIndex()).map(function (item) { return item.id; }), ['indexed'], failureMode + ' uses the structurally validated stored index without orphan recovery');
    });
}());

assert(librarySource.includes('storage().loadOrderedChordIndex(folder.id)'), 'Library cards and folder export share the operational ordered index boundary');

console.log('storage-consistency: ghost filtering, orphan recovery/protection, record-side folder ownership, limits, and folder deletion OK');
