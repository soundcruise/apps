const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const storageSource = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');
const settingsSource = fs.readFileSync(path.join(root, 'js/ui/settings.js'), 'utf8');

const P = 'chordCruise.';
const ORDER_KEY = P + 'libraryOrder';
const FOLDERS_KEY = P + 'folders';
const INDEX_KEY = P + 'chords.index';
const UNCATEGORIZED = 'folder_uncategorized';

function json(value) {
    return JSON.stringify(value);
}

function makeLocalStorage(seed, failKeys) {
    const values = Object.assign({}, seed || {});
    const failures = new Set(failKeys || []);
    return {
        getItem(key) {
            return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
        },
        setItem(key, value) {
            if (failures.has(key)) throw new Error('quota');
            values[key] = String(value);
        },
        removeItem(key) {
            delete values[key];
        },
        snapshot() {
            return Object.assign({}, values);
        }
    };
}

function baseData() {
    const folders = [
        { id: UNCATEGORIZED, name: '未分類', builtin: true, order: 0 },
        { id: 'folder-a', name: 'A', builtin: false, order: 2 },
        { id: 'folder-b', name: 'B', builtin: false, order: 1 },
        { id: 'folder-empty', name: '空', builtin: false, order: 3 }
    ];
    const index = [
        { id: 'a1', chordName: 'C', formName: 'C型', folderId: 'folder-a', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 'a2', chordName: 'G', formName: 'G型', folderId: 'folder-a', updatedAt: '2026-02-01T00:00:00Z' },
        { id: 'b1', chordName: 'Am', formName: 'A型', folderId: 'folder-b', updatedAt: '2026-01-15T00:00:00Z' },
        { id: 'u1', chordName: 'Dm', formName: 'D型', folderId: UNCATEGORIZED, updatedAt: '2026-01-10T00:00:00Z' }
    ];
    const seed = {
        [FOLDERS_KEY]: json(folders),
        [INDEX_KEY]: json(index)
    };
    index.forEach((entry) => {
        seed[P + 'chord.' + entry.id] = json(Object.assign({
            notes: [], mutedStrings: [], schemaVersion: 1, createdAt: entry.updatedAt
        }, entry));
    });
    return seed;
}

function loadStorage(seed, failKeys) {
    const localStorage = makeLocalStorage(seed, failKeys);
    const context = {
        window: { localStorage },
        console: { warn() {} },
        URL,
        Date,
        JSON,
        Math
    };
    vm.createContext(context);
    vm.runInContext(storageSource, context, { filename: 'storage.js' });
    return { storage: context.window.ChordCruise.storage, localStorage, context };
}

function ids(items) {
    return Array.from(items, (item) => item.id);
}

function native(value) {
    return JSON.parse(JSON.stringify(value));
}

function orderOf(env) {
    return JSON.parse(env.localStorage.getItem(ORDER_KEY));
}

(function legacyOrderIsPreservedLazily() {
    const env = loadStorage(baseData());
    assert.deepStrictEqual(ids(env.storage.loadOrderedFolders()), [UNCATEGORIZED, 'folder-b', 'folder-a', 'folder-empty']);
    assert.deepStrictEqual(ids(env.storage.loadOrderedChordIndex('folder-a')), ['a2', 'a1']);
    assert.strictEqual(env.localStorage.getItem(ORDER_KEY), null, 'read-only legacy migration should stay in memory');
})();

(function folderMovesPersistAndKeepUncategorizedFirst() {
    const env = loadStorage(baseData());
    assert.strictEqual(env.storage.moveFolder('folder-a', -1), true);
    assert.deepStrictEqual(orderOf(env).folderIds, [UNCATEGORIZED, 'folder-a', 'folder-b', 'folder-empty']);
    assert.strictEqual(env.storage.moveFolder(UNCATEGORIZED, 1), false);
    assert.strictEqual(env.storage.moveFolder('folder-a', -1), false);
    assert.strictEqual(env.storage.moveFolder('folder-empty', 1), false);
})();

(function chordMovesPersistAcrossReload() {
    const env = loadStorage(baseData());
    assert.strictEqual(env.storage.moveChord('a1', 'folder-a', -1), true);
    assert.deepStrictEqual(orderOf(env).entryIdsByFolder['folder-a'], ['a1', 'a2']);
    const reloaded = loadStorage(env.localStorage.snapshot());
    assert.deepStrictEqual(ids(reloaded.storage.loadOrderedChordIndex('folder-a')), ['a1', 'a2']);
    assert.strictEqual(reloaded.storage.moveChord('a1', 'folder-a', -1), false);
    assert.strictEqual(reloaded.storage.moveChord('a1', 'folder-a', 1), true);
    assert.deepStrictEqual(ids(reloaded.storage.loadOrderedChordIndex('folder-a')), ['a2', 'a1']);
    assert.strictEqual(reloaded.storage.moveChord('a2', 'folder-a', -1), false);
    assert.strictEqual(reloaded.storage.moveChord('a1', 'folder-a', 1), false);
})();

(function normalizationRemovesDuplicatesUnknownAndWrongFolderIds() {
    const seed = baseData();
    seed[ORDER_KEY] = json({
        version: 1,
        folderIds: ['missing', 'folder-a', 'folder-a'],
        entryIdsByFolder: {
            'folder-a': ['a1', 'a1', 'missing', 'b1'],
            missing: ['a2']
        }
    });
    const env = loadStorage(seed);
    const normalized = native(env.storage.loadLibraryOrder());
    assert.deepStrictEqual(normalized.folderIds, [UNCATEGORIZED, 'folder-a', 'folder-b', 'folder-empty']);
    assert.deepStrictEqual(normalized.entryIdsByFolder['folder-a'], ['a1', 'a2']);
    assert.deepStrictEqual(normalized.entryIdsByFolder['folder-b'], ['b1']);
    assert.deepStrictEqual(native(env.storage.loadLibraryOrder()), normalized, 'normalization must be idempotent');
    assert.deepStrictEqual(orderOf(env), normalized, 'a stale existing key should be repaired');
})();

(function corruptOrderJsonFallsBackWithoutTouchingChordData() {
    const seed = baseData();
    const originalIndex = seed[INDEX_KEY];
    seed[ORDER_KEY] = '{broken';
    const env = loadStorage(seed);
    assert.deepStrictEqual(ids(env.storage.loadOrderedChordIndex('folder-a')), ['a2', 'a1']);
    assert.doesNotThrow(() => JSON.parse(env.localStorage.getItem(ORDER_KEY)));
    assert.strictEqual(env.localStorage.getItem(INDEX_KEY), originalIndex);
})();

(function createFolderAppendsAfterExistingFolders() {
    const env = loadStorage(baseData());
    const folder = env.storage.createFolder('新規');
    const folderIds = orderOf(env).folderIds;
    assert(folder && folder.id);
    assert.strictEqual(folderIds[0], UNCATEGORIZED);
    assert.strictEqual(folderIds[folderIds.length - 1], folder.id);
    assert.deepStrictEqual(orderOf(env).entryIdsByFolder[folder.id], []);
})();

(function newOverwriteCopyAndMoveRules() {
    const env = loadStorage(baseData());
    env.storage.moveChord('a1', 'folder-a', -1);
    let order = orderOf(env);
    assert.deepStrictEqual(order.entryIdsByFolder['folder-a'], ['a1', 'a2']);

    const a2 = env.storage.loadChord('a2');
    a2.memo = 'overwrite';
    env.storage.saveChord(a2);
    assert.deepStrictEqual(orderOf(env).entryIdsByFolder['folder-a'], ['a1', 'a2'], 'overwrite should retain position');

    const fresh = env.storage.saveChord({ chordName: 'F', formName: 'E型', folderId: 'folder-a', notes: [] });
    assert.strictEqual(orderOf(env).entryIdsByFolder['folder-a'][0], fresh.id, 'new chord should be first');

    const copy = Object.assign({}, a2);
    delete copy.id;
    delete copy.createdAt;
    const copied = env.storage.saveChord(copy);
    assert.strictEqual(orderOf(env).entryIdsByFolder['folder-a'][0], copied.id, 'copy should be first');

    a2.folderId = 'folder-b';
    env.storage.saveChord(a2);
    order = orderOf(env);
    assert(!order.entryIdsByFolder['folder-a'].includes('a2'));
    assert.strictEqual(order.entryIdsByFolder['folder-b'][0], 'a2', 'moved chord should be first in destination');
})();

(function deleteChordAndFolderCleanOrderMetadata() {
    const env = loadStorage(baseData());
    env.storage.moveChord('a1', 'folder-a', -1);
    env.storage.deleteChord('b1');
    assert(!orderOf(env).entryIdsByFolder['folder-b'].includes('b1'));

    assert.strictEqual(env.storage.deleteFolder('folder-a'), true);
    const order = orderOf(env);
    assert(!order.folderIds.includes('folder-a'));
    assert.strictEqual(order.entryIdsByFolder['folder-a'], undefined);
    assert.deepStrictEqual(order.entryIdsByFolder[UNCATEGORIZED].slice(0, 3), ['a1', 'a2', 'u1']);
    assert.strictEqual(env.storage.loadChord('a1').folderId, UNCATEGORIZED);
    assert.strictEqual(env.storage.loadChord('a2').folderId, UNCATEGORIZED);
})();

(function failedOrderWriteDoesNotChangePersistedOrderOrIndex() {
    const prepared = loadStorage(baseData());
    prepared.storage.moveFolder('folder-a', -1);
    const seed = prepared.localStorage.snapshot();
    const beforeOrder = seed[ORDER_KEY];
    const beforeIndex = seed[INDEX_KEY];
    const env = loadStorage(seed, [ORDER_KEY]);
    assert.strictEqual(env.storage.moveFolder('folder-b', -1), false);
    assert.strictEqual(env.localStorage.getItem(ORDER_KEY), beforeOrder);
    assert.strictEqual(env.localStorage.getItem(INDEX_KEY), beforeIndex);
})();

(function reloadUrlKeepsExistingQueryAndReplacesCacheBust() {
    const env = loadStorage(baseData());
    env.context.window.ChordCruise.state = { settings: {} };
    env.context.document = {
        addEventListener() {},
        getElementById() { return null; },
        querySelectorAll() { return []; },
        documentElement: { setAttribute() {} }
    };
    vm.runInContext(settingsSource, env.context, { filename: 'settings.js' });
    const result = env.context.window.ChordCruise.ui.settings.buildReloadUrl('http://127.0.0.1:8000/?x=1&_r=old', 12345);
    const url = new URL(result);
    assert.strictEqual(url.searchParams.get('x'), '1');
    assert.strictEqual(url.searchParams.get('_r'), '12345');
})();

(function reloadFallsBackWhenUrlConstructionFails() {
    const env = loadStorage(baseData());
    let reloadCount = 0;
    const button = {
        disabled: false,
        textContent: '',
        setAttribute() {}
    };
    env.context.URL = function () { throw new Error('invalid URL'); };
    env.context.window.location = {
        href: 'not a url',
        replace() { throw new Error('replace should not run'); },
        reload() { reloadCount += 1; }
    };
    env.context.window.ChordCruise.state = { settings: {} };
    env.context.document = {
        addEventListener() {},
        getElementById() { return null; },
        querySelectorAll(selector) { return selector === '.cc-refresh-app' ? [button] : []; },
        documentElement: { setAttribute() {} }
    };
    vm.runInContext(settingsSource, env.context, { filename: 'settings.js' });
    env.context.window.ChordCruise.ui.settings.reloadAppWithCacheBust();
    assert.strictEqual(reloadCount, 1);
    assert.strictEqual(button.disabled, true);
    assert.strictEqual(button.textContent, '更新中…');
})();

console.log('library-order: migration, ordering, persistence, failures, and reload URL OK');
