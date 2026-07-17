const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const storageSource = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');
const settingsSource = fs.readFileSync(path.join(root, 'js/ui/settings.js'), 'utf8');
const librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
const themeSource = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');

const P = 'chordCruise.';
const ORDER_KEY = P + 'libraryOrder';
const FOLDERS_KEY = P + 'folders';
const INDEX_KEY = P + 'chords.index';
const UNCATEGORIZED = 'folder_uncategorized';

function json(value) {
    return JSON.stringify(value);
}

function makeLocalStorage(seed, failKeys, failRemoveKeys) {
    const values = Object.assign({}, seed || {});
    const failures = new Set(failKeys || []);
    const removeFailures = new Set(failRemoveKeys || []);
    return {
        getItem(key) {
            return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
        },
        setItem(key, value) {
            if (failures.has(key)) throw new Error('quota');
            values[key] = String(value);
        },
        removeItem(key) {
            if (removeFailures.has(key)) throw new Error('quota');
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

function loadStorage(seed, failKeys, failRemoveKeys) {
    const localStorage = makeLocalStorage(seed, failKeys, failRemoveKeys);
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

(function deleteChordAndFolderFullyRemovesOwnedData() {
    const env = loadStorage(baseData());
    env.storage.moveChord('a1', 'folder-a', -1);
    env.storage.deleteChord('b1');
    env.storage.setFolderColor('folder-a', 'wine');
    assert(!orderOf(env).entryIdsByFolder['folder-b'].includes('b1'));

    assert.strictEqual(env.storage.deleteFolder('folder-a'), true);
    const order = orderOf(env);
    assert(!order.folderIds.includes('folder-a'));
    assert.strictEqual(order.entryIdsByFolder['folder-a'], undefined);
    assert.deepStrictEqual(order.entryIdsByFolder[UNCATEGORIZED], ['u1']);
    assert.strictEqual(env.storage.loadChord('a1'), null);
    assert.strictEqual(env.storage.loadChord('a2'), null);
    assert.deepStrictEqual(ids(env.storage.loadChordIndex()), ['u1'], 'other folder entries remain after b1 was deleted');
    assert(!env.storage.loadFolders().some((folder) => folder.id === 'folder-a'), 'folder metadata including color is removed');
    assert.strictEqual(env.storage.deleteFolder(UNCATEGORIZED), false, 'uncategorized cannot be deleted');
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

(function folderShelfColumnsStayIndependentFromCodeGridColumns() {
    const env = loadStorage(baseData());
    env.storage.saveSettings({ libraryColumns: 2, folderShelfColumns: 6 });
    let settings = native(env.storage.loadSettings());
    assert.strictEqual(settings.libraryColumns, 2);
    assert.strictEqual(settings.folderShelfColumns, 6);
    env.storage.saveSettings({ folderShelfColumns: 99 });
    settings = native(env.storage.loadSettings());
    assert.strictEqual(settings.folderShelfColumns, 4, 'invalid shelf columns fall back to 4');
    assert.strictEqual(settings.libraryColumns, 2, 'code grid setting remains independent');
})();

(function folderColorsDefaultToBlackLeatherAndPersistOnlyWhenChosen() {
    const env = loadStorage(baseData());
    const source = env.storage.loadOrderedFolders().find((folder) => folder.id === 'folder-a');
    const before = env.localStorage.getItem(FOLDERS_KEY);
    const first = env.storage.folderColorKey(source);
    const second = env.storage.folderColorKey(source);
    assert.strictEqual(first, 'black-leather');
    assert.strictEqual(second, 'black-leather', 'legacy folders default to black leather');
    assert.strictEqual(env.localStorage.getItem(FOLDERS_KEY), before, 'reading a legacy color does not write');
    assert.strictEqual(env.storage.setFolderColor('folder-a', 'wine'), true);
    const changed = env.storage.loadOrderedFolders().find((folder) => folder.id === 'folder-a');
    assert.strictEqual(changed.colorKey, 'wine');
    assert.strictEqual(env.storage.folderColorKey(changed), 'wine');
    assert.strictEqual(env.storage.setFolderColor('folder-a', '#ff0000'), false, 'raw colors are rejected');
    assert.strictEqual(env.storage.setFolderColor(UNCATEGORIZED, 'navy'), true, 'uncategorized can be recolored');
    const created = env.storage.createFolder('黒革の新規');
    assert.strictEqual(created.colorKey, 'black-leather', 'new folders persist the default color');
})();

(function folderCopyDeepCopiesDataAndPreservesRelativeOrder() {
    const env = loadStorage(baseData());
    const copied = env.storage.copyFolder('folder-a');
    assert(copied && copied.id && copied.id !== 'folder-a');
    const order = orderOf(env);
    const sourcePosition = order.folderIds.indexOf('folder-a');
    assert.strictEqual(order.folderIds[sourcePosition + 1], copied.id, 'copy follows its original folder');
    assert.deepStrictEqual(order.entryIdsByFolder[copied.id].length, 2);
    assert.deepStrictEqual(ids(env.storage.loadOrderedChordIndex('folder-a')), ['a2', 'a1']);
    const copiedEntries = env.storage.loadOrderedChordIndex(copied.id);
    assert.deepStrictEqual(Array.from(copiedEntries, (entry) => entry.chordName), ['G', 'C'], 'code ordering is preserved');
    copiedEntries.forEach((entry) => {
        assert(!['a1', 'a2'].includes(entry.id), 'copied chord IDs are new');
        const chord = env.storage.loadChord(entry.id);
        assert.strictEqual(chord.folderId, copied.id);
        assert.strictEqual(chord.schemaVersion, 1);
    });
    assert.strictEqual(copied.name, 'Aのコピー');
    assert.strictEqual(copied.colorKey, 'black-leather', 'a colorless source copy inherits black leather');
    assert.strictEqual(env.storage.setFolderColor('folder-a', 'navy'), true);
    const coloredCopy = env.storage.copyFolder('folder-a');
    assert.strictEqual(coloredCopy.colorKey, 'navy', 'an explicit source color is inherited');
    const copiedAgain = env.storage.copyFolder('folder-a');
    assert.strictEqual(copiedAgain.name, 'Aのコピー3');
})();

(function emptyFolderCopyAndWriteFailureLeaveConsistentData() {
    const env = loadStorage(baseData());
    const empty = env.storage.copyFolder('folder-empty');
    assert(empty);
    assert.deepStrictEqual(orderOf(env).entryIdsByFolder[empty.id], []);
    const long = env.storage.createFolder('あいうえおかきくけこさしすせそたちつてとなにぬね');
    const longCopy = env.storage.copyFolder(long.id);
    assert(longCopy.name.length <= 24, 'copy names stay within the 24-character limit');

    const seeded = baseData();
    const before = Object.assign({}, seeded);
    const failing = loadStorage(seeded, [INDEX_KEY]);
    assert.strictEqual(failing.storage.copyFolder('folder-a'), null);
    assert.deepStrictEqual(failing.localStorage.snapshot(), before, 'failed copy rolls back all newly written data');
})();

(function failedFolderDeleteLeavesDataAndOrderUntouched() {
    const seed = baseData();
    const before = Object.assign({}, seed);
    const env = loadStorage(seed, [], [P + 'chord.a2']);
    assert.strictEqual(env.storage.deleteFolder('folder-a'), false);
    assert.deepStrictEqual(env.localStorage.snapshot(), before, 'failed delete rolls back code records, folders, index, and ordering');
})();

(function prolongedSoundMarkUsesDedicatedVisualRule() {
    assert(librarySource.includes("character === 'ー'"), 'only U+30FC receives the special class');
    assert(librarySource.includes('cc-spine-char--prolonged\" aria-hidden=\"true\"></span>'), 'the visual long-vowel mark has no glyph text');
    assert(themeSource.includes('.cc-spine-char--prolonged::before'), 'the long-vowel mark is drawn by a pseudo-element');
    assert(themeSource.includes('background: currentColor;'), 'the drawn line inherits the spine title color');
    const markRule = themeSource.match(/\.cc-spine-char--prolonged\s*\{([\s\S]*?)\n\}/);
    assert(markRule && !markRule[1].includes('rotate('), 'the mark itself no longer relies on rotation');
    assert(markRule && markRule[1].includes('width: 1em;') && markRule[1].includes('height: 1em;'), 'the mark occupies the same square as a normal character');
    assert(markRule && !markRule[1].includes('vertical-align:'), 'no extra cross-axis alignment shifts the mark');
    const lineRule = themeSource.match(/\.cc-spine-char--prolonged::before\s*\{([\s\S]*?)\n\}/);
    assert(lineRule && lineRule[1].includes('top: 50%;') && lineRule[1].includes('left: 50%;') && lineRule[1].includes('translate(-50%, -50%)'), 'the line is centered within its character box');
})();

console.log('library-order: migration, ordering, folder management persistence, failures, and reload URL OK');
