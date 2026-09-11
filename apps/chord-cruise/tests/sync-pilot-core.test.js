'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var webcrypto = require('crypto').webcrypto;

var root = path.join(__dirname, '..');
var coreSource = fs.readFileSync(path.join(root, 'js/sync/sync-core.js'), 'utf8');

function loadCore() {
    var window = { crypto: webcrypto };
    var context = { window: window, crypto: webcrypto, TextEncoder: TextEncoder, JSON: JSON, Object: Object, Number: Number, Uint8Array: Uint8Array };
    vm.createContext(context);
    vm.runInContext(coreSource, context, { filename: 'sync-core.js' });
    return window.ChordCruiseSync.core;
}

function createStorage(seed) {
    var values = Object.assign({}, seed || {});
    var writes = [];
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) { writes.push(key); values[key] = String(value); },
        removeItem: function (key) { writes.push(key); delete values[key]; },
        key: function (index) { return Object.keys(values)[index] || null; },
        get length() { return Object.keys(values).length; },
        writes: writes,
        snapshot: function () { return Object.assign({}, values); }
    };
}

var core = loadCore();

(async function () {
    assert.strictEqual(core.DB_NAME, 'soundCruiseSync');
    assert.strictEqual(core.DB_VERSION, 1);
    assert.strictEqual(core.canonicalJson({ z: 1, a: { y: 2, x: undefined }, list: [1, undefined, -0] }),
        '{"a":{"y":2},"list":[1,null,0],"z":1}', 'canonical JSON sorts keys and fixes JSON edge cases');

    var first = core.normalizeRecord('chord', 'c1', {
        id: 'c1', chordName: 'C', updatedAt: '2026-01-01', createdAt: '2025-01-01', unknown: { b: 2, a: 1 }
    }, 1);
    var second = core.normalizeRecord('chord', 'c1', {
        unknown: { a: 1, b: 2 }, createdAt: '2030-01-01', updatedAt: '2031-01-01', chordName: 'C', id: 'c1'
    }, 1);
    assert.strictEqual(await core.hashRecord(first, webcrypto), await core.hashRecord(second, webcrypto),
        'timestamps and key order do not create semantic changes');
    second.payload.chordName = 'Cm';
    assert.notStrictEqual(await core.hashRecord(first, webcrypto), await core.hashRecord(second, webcrypto),
        'musical data changes the semantic hash');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(first.payload.unknown)), { a: 1, b: 2 }, 'unknown fields survive normalization');

    var seed = {
        'chordCruise.schemaVersion': JSON.stringify('1'),
        'chordCruise.settings': JSON.stringify({ selectedKey: 0, updatedAt: 'ignored-for-hash' }),
        'chordCruise.folders': JSON.stringify([
            { id: 'folder-b', name: 'B', extra: true },
            { id: 'folder-a', name: 'A' }
        ]),
        'chordCruise.chords.index': JSON.stringify([{ id: 'ghost', folderId: 'folder-a' }]),
        'chordCruise.chord.c2': JSON.stringify({ id: 'c2', folderId: 'folder-b', chordName: 'G', notes: [] }),
        'chordCruise.chord.c1': JSON.stringify({ id: 'c1', folderId: 'folder-a', chordName: 'C', notes: [] }),
        'chordCruise.libraryOrder': JSON.stringify({ version: 1, folderIds: ['folder-a', 'folder-b'], entryIdsByFolder: {} }),
        'unrelated.key': 'keep'
    };
    var storage = createStorage(seed);
    var before = storage.snapshot();
    var snapshot = await core.snapshotLocalStorage(storage, webcrypto);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(snapshot.counts)), { total: 6, settings: 1, folder: 2, chord: 2, library_order: 1 });
    assert.strictEqual(snapshot.records.some(function (record) { return record.recordId === 'ghost'; }), false, 'derived chord index is excluded');
    assert.deepStrictEqual(storage.snapshot(), before, 'snapshot never writes localStorage');
    assert.deepStrictEqual(storage.writes, [], 'snapshot performs no storage mutation');
    assert.strictEqual(snapshot.errors.length, 0);

    var reorderedSeed = Object.fromEntries(Object.entries(seed).reverse());
    var reordered = await core.snapshotLocalStorage(createStorage(reorderedSeed), webcrypto);
    assert.strictEqual(snapshot.manifestHash, reordered.manifestHash, 'manifest is independent of storage enumeration order');

    var brokenStorage = createStorage(Object.assign({}, seed, {
        'chordCruise.chord.bad': '{broken',
        'chordCruise.chord.mismatch': JSON.stringify({ id: 'other', folderId: 'folder-a', chordName: 'X', notes: [] })
    }));
    var brokenBefore = brokenStorage.snapshot();
    var broken = await core.snapshotLocalStorage(brokenStorage, webcrypto);
    assert(broken.errors.some(function (error) { return error.key === 'chordCruise.chord.bad'; }));
    assert(broken.errors.some(function (error) { return error.key === 'chordCruise.chord.mismatch'; }));
    assert.deepStrictEqual(brokenStorage.snapshot(), brokenBefore, 'invalid data remains untouched');

    var exported = core.createExport(snapshot, Date.UTC(2026, 8, 12, 0, 0, 0));
    assert.strictEqual(exported.formatVersion, 1);
    assert.strictEqual(exported.appId, 'chord');
    assert.strictEqual(exported.schemaVersion, 1);
    assert.strictEqual(exported.exportedAt, '2026-09-12T00:00:00.000Z');
    assert.strictEqual(exported.manifestHash, snapshot.manifestHash);
    exported.records[0].payload.changedByExport = true;
    assert.strictEqual(snapshot.records[0].payload.changedByExport, undefined, 'export is detached from snapshot data');

    console.log('sync-pilot-core: deterministic normalization, semantic hash, read-only snapshot, manifest, and export passed');
}()).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
