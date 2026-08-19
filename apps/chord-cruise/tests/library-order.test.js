const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const storageSource = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');
const theorySource = fs.readFileSync(path.join(root, 'js/core/music-theory.js'), 'utf8');
const settingsSource = fs.readFileSync(path.join(root, 'js/ui/settings.js'), 'utf8');
const librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
const themeSource = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const chordExportSource = fs.readFileSync(path.join(root, 'js/ui/chord-export.js'), 'utf8');

const P = 'chordCruise.';
const ORDER_KEY = P + 'libraryOrder';
const FOLDERS_KEY = P + 'folders';
const INDEX_KEY = P + 'chords.index';
const UNCATEGORIZED = 'folder_uncategorized';

function json(value) {
    return JSON.stringify(value);
}

function failureMatches(failures, key) {
    if (failures.has(key)) return true;
    return Array.from(failures).some((pattern) => pattern.endsWith('*') && key.startsWith(pattern.slice(0, -1)));
}

function makeLocalStorage(seed, failKeys, failRemoveKeys, failurePlan) {
    const values = Object.assign({}, seed || {});
    const failures = new Set(failKeys || []);
    const removeFailures = new Set(failRemoveKeys || []);
    const calls = Object.create(null);
    function plannedFailure(operation, key) {
        const token = operation + ':' + key;
        calls[token] = (calls[token] || 0) + 1;
        const planned = failurePlan && failurePlan[token];
        return Array.isArray(planned) && planned.includes(calls[token]);
    }
    return {
        getItem(key) {
            return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
        },
        setItem(key, value) {
            if (failureMatches(failures, key) || plannedFailure('set', key)) throw new Error('quota');
            values[key] = String(value);
        },
        removeItem(key) {
            if (failureMatches(removeFailures, key) || plannedFailure('remove', key)) throw new Error('quota');
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

function loadStorage(seed, failKeys, failRemoveKeys, failurePlan) {
    const localStorage = makeLocalStorage(seed, failKeys, failRemoveKeys, failurePlan);
    const context = {
        window: {
            localStorage,
            ChordCruise: {
                featureAccess: {
                    hasFeature(featureName) { return featureName === 'unlimitedLibrary'; }
                }
            }
        },
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

function loadLibrary(seed) {
    const env = loadStorage(seed);
    env.context.document = {
        addEventListener() {},
        getElementById() { return null; },
        querySelectorAll() { return []; }
    };
    env.context.window.ChordCruise.state = { settings: env.storage.loadSettings() };
    env.context.window.ChordCruise.caged = { detectBarres() { return []; } };
    vm.runInContext(theorySource, env.context, { filename: 'music-theory.js' });
    vm.runInContext(librarySource, env.context, { filename: 'library.js' });
    return env;
}

function loadRightTopSettingsUi(seed, failKeys) {
    const env = loadStorage(seed, failKeys);
    const attributes = {};
    const notices = [];
    let settingsClickHandler = null;
    let fretboardChangeCount = 0;
    const overlay = {
        addEventListener(type, handler) {
            if (type === 'click') settingsClickHandler = handler;
        },
        querySelectorAll() { return []; },
        classList: { add() {}, remove() {} },
        setAttribute() {}
    };
    env.context.window.ChordCruise.state = { settings: env.storage.loadSettings() };
    env.context.window.ChordCruise.ui = {
        toast: { show(message, options) { notices.push({ message, options }); } }
    };
    env.context.window.CustomEvent = function (type) { this.type = type; };
    env.context.document = {
        activeElement: null,
        body: { classList: { add() {}, remove() {} } },
        documentElement: { setAttribute(name, value) { attributes[name] = value; } },
        addEventListener() {},
        dispatchEvent(event) {
            if (event && event.type === 'chordcruise:fretboard-settings-change') fretboardChangeCount += 1;
        },
        getElementById(id) { return id === 'cc-settings-overlay' ? overlay : null; },
        querySelectorAll() { return []; }
    };
    vm.runInContext(settingsSource, env.context, { filename: 'settings.js' });
    const api = env.context.window.ChordCruise.ui.settings;
    api.init();
    return {
        env,
        api,
        attributes,
        notices,
        fretboardChangeCount() { return fretboardChangeCount; },
        choose(attribute, value) {
            assert(settingsClickHandler, 'settings click handler is registered');
            const choice = {
                getAttribute(name) { return name === attribute ? String(value) : null; }
            };
            settingsClickHandler({
                target: {
                    closest(selector) { return selector === '[' + attribute + ']' ? choice : null; }
                }
            });
        }
    };
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

(function saveChordIsAtomicAtEveryWriteStage() {
    const freshChord = { chordName: 'F', formName: 'E型', folderId: 'folder-a', notes: [] };

    [
        { name: 'record', failKeys: [P + 'chord.*'] },
        { name: 'index', failKeys: [INDEX_KEY] },
        { name: 'order', failKeys: [ORDER_KEY] }
    ].forEach((scenario) => {
        const seed = baseData();
        const env = loadStorage(seed, scenario.failKeys);
        const before = env.localStorage.snapshot();
        const input = native(freshChord);
        assert.strictEqual(env.storage.saveChord(input), null, scenario.name + ' write failure must be reported');
        assert.deepStrictEqual(env.localStorage.snapshot(), before, scenario.name + ' write failure must restore every related key');
        assert.strictEqual(input.id, undefined, 'failed save must not assign an ID to caller data');
    });

    const overwriteSeed = baseData();
    overwriteSeed[ORDER_KEY] = json({
        version: 1,
        folderIds: [UNCATEGORIZED, 'folder-b', 'folder-a', 'folder-empty'],
        entryIdsByFolder: {
            [UNCATEGORIZED]: ['u1'],
            'folder-b': ['b1'],
            'folder-a': ['a2', 'a1'],
            'folder-empty': []
        }
    });
    ['index', 'order'].forEach((stage) => {
        const env = loadStorage(overwriteSeed, [stage === 'index' ? INDEX_KEY : ORDER_KEY]);
        const before = env.localStorage.snapshot();
        const changed = env.storage.loadChord('a1');
        changed.memo = 'must roll back';
        assert.strictEqual(env.storage.saveChord(changed), null, 'overwrite ' + stage + ' failure must be reported');
        assert.deepStrictEqual(env.localStorage.snapshot(), before, 'overwrite ' + stage + ' failure restores the original record and metadata');
    });

    const successEnv = loadStorage(baseData());
    const successInput = native(freshChord);
    const saved = successEnv.storage.saveChord(successInput);
    assert(saved && saved.id, 'successful save returns the persisted record');
    assert.strictEqual(successInput.id, undefined, 'successful save does not mutate caller data');
    assert(successEnv.storage.loadChordIndex().some((entry) => entry.id === saved.id));
    assert.strictEqual(orderOf(successEnv).entryIdsByFolder['folder-a'][0], saved.id);
})();

(function deleteChordIsAtomicAtEveryWriteStage() {
    const seed = baseData();
    seed[ORDER_KEY] = json({
        version: 1,
        folderIds: [UNCATEGORIZED, 'folder-b', 'folder-a', 'folder-empty'],
        entryIdsByFolder: {
            [UNCATEGORIZED]: ['u1'],
            'folder-b': ['b1'],
            'folder-a': ['a2', 'a1'],
            'folder-empty': []
        }
    });
    [
        { name: 'record removal', failRemoveKeys: [P + 'chord.a1'] },
        { name: 'index', failKeys: [INDEX_KEY] },
        { name: 'order', failKeys: [ORDER_KEY] }
    ].forEach((scenario) => {
        const env = loadStorage(seed, scenario.failKeys, scenario.failRemoveKeys);
        const before = env.localStorage.snapshot();
        assert.strictEqual(env.storage.deleteChord('a1'), false, scenario.name + ' failure must be reported');
        assert.deepStrictEqual(env.localStorage.snapshot(), before, scenario.name + ' failure must restore every related key');
    });

    const successEnv = loadStorage(seed);
    assert.strictEqual(successEnv.storage.deleteChord('a1'), true);
    assert.strictEqual(successEnv.storage.loadChord('a1'), null);
    assert(!successEnv.storage.loadChordIndex().some((entry) => entry.id === 'a1'));
    assert(!orderOf(successEnv).entryIdsByFolder['folder-a'].includes('a1'));
    assert.strictEqual(successEnv.storage.deleteChord('missing'), false, 'deleting a missing chord is not reported as success');
})();

(function rollbackFailureStillReportsTheOriginalOperationAsFailure() {
    const saveSeed = baseData();
    saveSeed[ORDER_KEY] = json({
        version: 1,
        folderIds: [UNCATEGORIZED, 'folder-b', 'folder-a', 'folder-empty'],
        entryIdsByFolder: {
            [UNCATEGORIZED]: ['u1'], 'folder-b': ['b1'], 'folder-a': ['a2', 'a1'], 'folder-empty': []
        }
    });
    const saveBefore = Object.assign({}, saveSeed);
    const saveEnv = loadStorage(saveSeed, [], [], {
        ['set:' + ORDER_KEY]: [1],
        ['set:' + P + 'chord.a1']: [2]
    });
    const changed = saveEnv.storage.loadChord('a1');
    changed.memo = 'partial rollback';
    assert.strictEqual(saveEnv.storage.saveChord(changed), null, 'partial save rollback must never report success');
    assert.strictEqual(saveEnv.localStorage.getItem(INDEX_KEY), saveBefore[INDEX_KEY], 'rollback continues after one restore failure');
    assert.strictEqual(saveEnv.localStorage.getItem(ORDER_KEY), saveBefore[ORDER_KEY], 'later rollback keys are still restored');

    const deleteEnv = loadStorage(saveSeed, [], [], {
        ['set:' + ORDER_KEY]: [1],
        ['set:' + P + 'chord.a1']: [1]
    });
    assert.strictEqual(deleteEnv.storage.deleteChord('a1'), false, 'partial delete rollback must never report success');
    assert.strictEqual(deleteEnv.localStorage.getItem(INDEX_KEY), saveBefore[INDEX_KEY], 'delete rollback continues after record restore failure');
    assert.strictEqual(deleteEnv.localStorage.getItem(ORDER_KEY), saveBefore[ORDER_KEY]);
})();

(function detailActionsOnlyUpdateUiAfterPersistenceSucceeds() {
    assert(librarySource.includes("toast('運指を保存できませんでした', 'error')"), 'finger auto-save exposes storage failure');
    assert(librarySource.includes("toast(storageErrorMessage('変更を保存できませんでした'), 'error')"), 'name and memo edit exposes the specific storage failure');
    assert(librarySource.includes("toast(storageErrorMessage('フォルダを移動できませんでした'), 'error')"), 'folder move exposes the specific storage failure');
    assert(librarySource.includes("toast('コードを削除できませんでした', 'error')"), 'delete exposes storage failure');
    assert(librarySource.includes('moveSelect.value = previousFolderId;'), 'failed move restores the selected folder');
    assert(librarySource.includes('if (!storage().deleteChord(current.id))'), 'detail remains open unless deletion succeeds');
    assert(librarySource.includes('currentDetailChord && currentDetailChord.id === chord.id'), 'finger edits use the latest successfully persisted detail record');
})();

(function deleteChordAndFolderFullyRemovesOwnedData() {
    const env = loadStorage(baseData());
    env.storage.moveChord('a1', 'folder-a', -1);
    assert.strictEqual(env.storage.deleteChord('b1'), true);
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

(function libraryCardDisplaySettingsNormalizeAndPreserveOtherSettings() {
    const env = loadStorage(baseData());
    let settings = native(env.storage.loadSettings());
    assert.strictEqual(settings.libraryCardDisplayMode, 'finger');
    assert.strictEqual(settings.libraryCardMonochrome, false);

    ['note', 'solfege', 'degree', 'finger'].forEach((mode) => {
        env.storage.saveSettings({ libraryCardDisplayMode: mode });
        assert.strictEqual(env.storage.loadSettings().libraryCardDisplayMode, mode);
    });
    env.storage.saveSettings({ libraryCardMonochrome: true, libraryColumns: 2 });
    settings = native(env.storage.loadSettings());
    assert.strictEqual(settings.libraryCardMonochrome, true);
    assert.strictEqual(settings.libraryColumns, 2, 'library display settings must not replace existing settings');

    env.storage.saveSettings({ libraryCardDisplayMode: 'invalid', libraryCardMonochrome: 'true' });
    settings = native(env.storage.loadSettings());
    assert.strictEqual(settings.libraryCardDisplayMode, 'finger');
    assert.strictEqual(settings.libraryCardMonochrome, false);
    assert.strictEqual(settings.libraryColumns, 2);
})();

(function libraryCardTextSizeSettingsAreIndependentAndPersisted() {
    const env = loadStorage(baseData());
    let settings = native(env.storage.loadSettings());
    ['libraryCardChordNameSize', 'libraryCardFretNumberSize', 'libraryCardMarkerLabelSize'].forEach((key) => {
        assert.strictEqual(settings[key], 'medium', key + ' defaults to medium');
    });

    env.storage.saveSettings({
        libraryCardChordNameSize: 'small',
        libraryCardFretNumberSize: 'xlarge',
        libraryCardMarkerLabelSize: 'xlarge',
        chordNameSize: 'xlarge',
        fretNumberSize: 'small',
        fretboardMarkerLabelSize: 'large'
    });
    settings = native(env.storage.loadSettings());
    assert.strictEqual(settings.libraryCardChordNameSize, 'small');
    assert.strictEqual(settings.libraryCardFretNumberSize, 'xlarge');
    assert.strictEqual(settings.libraryCardMarkerLabelSize, 'xlarge');
    assert.strictEqual(settings.chordNameSize, 'xlarge', 'right-top chord-name setting stays independent');
    assert.strictEqual(settings.fretNumberSize, 'small', 'right-top fret-number setting stays independent');
    assert.strictEqual(settings.fretboardMarkerLabelSize, 'large', 'right-top marker-label setting stays independent');

    const reloaded = loadStorage(env.localStorage.snapshot());
    settings = native(reloaded.storage.loadSettings());
    assert.strictEqual(settings.libraryCardChordNameSize, 'small');
    assert.strictEqual(settings.libraryCardFretNumberSize, 'xlarge');
    assert.strictEqual(settings.libraryCardMarkerLabelSize, 'xlarge');
    assert.strictEqual(settings.fretboardMarkerLabelSize, 'large');

    reloaded.storage.saveSettings({
        libraryCardChordNameSize: 'invalid',
        libraryCardFretNumberSize: 1,
        libraryCardMarkerLabelSize: null,
        fretboardMarkerLabelSize: 'invalid'
    });
    settings = native(reloaded.storage.loadSettings());
    assert.strictEqual(settings.libraryCardChordNameSize, 'medium');
    assert.strictEqual(settings.libraryCardFretNumberSize, 'medium');
    assert.strictEqual(settings.libraryCardMarkerLabelSize, 'medium');
    assert.strictEqual(settings.fretboardMarkerLabelSize, 'medium');
})();

(function rightTopDisplayResetUsesStorageDefaultsAndKeepsOtherSettings() {
    const env = loadStorage(baseData());
    env.storage.saveSettings({
        chordNameSize: 'xlarge',
        fretNumberSize: 'small',
        fretboardMarkerLabelSize: 'large',
        fretNumberHighlightMode: 'custom',
        highlightedFrets: [1, 4, 9],
        fretboardDisplayMode: 'degree',
        libraryCardDisplayMode: 'solfege',
        libraryCardMonochrome: true,
        libraryCardChordNameSize: 'small',
        libraryCardFretNumberSize: 'xlarge',
        libraryCardMarkerLabelSize: 'large',
        libraryColumns: 2,
        folderShelfColumns: 6,
        futureSetting: 'keep-me'
    });

    const defaults = native(env.storage.getSettingsDefaults());
    assert.strictEqual(defaults.fretboardMarkerLabelSize, 'medium');
    defaults.highlightedFrets.push(25);
    assert(!env.storage.getSettingsDefaults().highlightedFrets.includes(25), 'settings defaults must return a cloned fret array');

    const reset = {};
    ['chordNameSize', 'fretNumberSize', 'fretboardMarkerLabelSize', 'fretNumberHighlightMode', 'highlightedFrets', 'fretboardDisplayMode'].forEach((key) => {
        reset[key] = Array.isArray(defaults[key]) ? defaults[key].filter((fret) => fret !== 25) : defaults[key];
    });
    assert.strictEqual(env.storage.saveSettings(reset), true, 'display reset saves in one storage write');
    const settings = native(env.storage.loadSettings());
    assert.strictEqual(settings.chordNameSize, 'medium');
    assert.strictEqual(settings.fretNumberSize, 'medium');
    assert.strictEqual(settings.fretboardMarkerLabelSize, 'medium');
    assert.strictEqual(settings.fretNumberHighlightMode, 'all');
    assert.deepStrictEqual(settings.highlightedFrets, [0, 3, 5, 7, 9, 12, 15, 17, 19, 21, 24]);
    assert.strictEqual(settings.fretboardDisplayMode, 'note');
    assert.strictEqual(settings.libraryCardDisplayMode, 'solfege', 'library-only display setting remains untouched');
    assert.strictEqual(settings.libraryCardMonochrome, true, 'library-only monochrome setting remains untouched');
    assert.strictEqual(settings.libraryCardChordNameSize, 'small');
    assert.strictEqual(settings.libraryCardFretNumberSize, 'xlarge');
    assert.strictEqual(settings.libraryCardMarkerLabelSize, 'large');
    assert.strictEqual(settings.libraryColumns, 2);
    assert.strictEqual(settings.folderShelfColumns, 6);
    assert.strictEqual(settings.futureSetting, 'keep-me', 'unknown settings are preserved');
})();

(function failedSettingsWriteReportsFailureWithoutReplacingStoredSettings() {
    const seed = baseData();
    seed[P + 'settings'] = json({ fretboardMarkerLabelSize: 'xlarge' });
    const env = loadStorage(seed, [P + 'settings']);
    assert.strictEqual(env.storage.saveSettings({ fretboardMarkerLabelSize: 'small' }), false);
    assert.strictEqual(env.storage.loadSettings().fretboardMarkerLabelSize, 'xlarge');
})();

(function rightTopSettingsCommitOnlyAfterSuccessfulPersistence() {
    const seed = baseData();
    seed[P + 'settings'] = json({
        chordNameSize: 'small',
        fretNumberSize: 'small',
        fretboardMarkerLabelSize: 'small',
        fretNumberHighlightMode: 'custom',
        highlightedFrets: [1, 5],
        fretboardDisplayMode: 'degree',
        libraryCardDisplayMode: 'solfege',
        futureSetting: 'keep-me'
    });
    const scenarios = [
        ['data-chord-name-size', 'xlarge', 'chordNameSize'],
        ['data-fret-number-size', 'xlarge', 'fretNumberSize'],
        ['data-fretboard-marker-label-size', 'xlarge', 'fretboardMarkerLabelSize'],
        ['data-preview-display-mode', 'finger', 'fretboardDisplayMode'],
        ['data-fret-highlight-mode', 'all', 'fretNumberHighlightMode'],
        ['data-highlight-fret', '9', 'highlightedFrets']
    ];
    scenarios.forEach(([attribute, value, changedKey]) => {
        const ui = loadRightTopSettingsUi(seed, [P + 'settings']);
        const beforeState = native(ui.env.context.window.ChordCruise.state.settings);
        const beforeStored = ui.env.localStorage.getItem(P + 'settings');
        ui.choose(attribute, value);
        assert.deepStrictEqual(native(ui.env.context.window.ChordCruise.state.settings), beforeState, changedKey + ' stays in memory at its persisted value when saving fails');
        assert.strictEqual(ui.env.localStorage.getItem(P + 'settings'), beforeStored, changedKey + ' storage remains unchanged when saving fails');
        assert.strictEqual(ui.fretboardChangeCount(), 0, changedKey + ' does not redraw fretboards before persistence succeeds');
        assert.strictEqual(ui.notices.at(-1).message, '設定を保存できませんでした');
        assert.strictEqual(ui.notices.at(-1).options.type, 'error');
    });

    const successful = loadRightTopSettingsUi(seed);
    successful.choose('data-chord-name-size', 'xlarge');
    const saved = successful.env.storage.loadSettings();
    assert.strictEqual(successful.env.context.window.ChordCruise.state.settings.chordNameSize, 'xlarge');
    assert.strictEqual(saved.chordNameSize, 'xlarge');
    assert.strictEqual(saved.futureSetting, 'keep-me', 'successful settings changes preserve unknown keys');
    assert.strictEqual(saved.libraryCardDisplayMode, 'solfege', 'right-top settings leave library-only settings unchanged');
    assert.strictEqual(successful.attributes['data-cc-chord-name-size'], 'xlarge');
    assert.strictEqual(successful.fretboardChangeCount(), 1, 'successful persistence redraws dependent fretboards once');
})();

(function rightTopSettingsResetFailureKeepsMemoryAndStoredValues() {
    const seed = baseData();
    seed[P + 'settings'] = json({
        chordNameSize: 'xlarge',
        fretNumberSize: 'small',
        fretboardMarkerLabelSize: 'large',
        fretNumberHighlightMode: 'custom',
        highlightedFrets: [1, 5],
        fretboardDisplayMode: 'degree',
        libraryCardDisplayMode: 'solfege',
        futureSetting: 'keep-me'
    });
    const ui = loadRightTopSettingsUi(seed, [P + 'settings']);
    const beforeState = native(ui.env.context.window.ChordCruise.state.settings);
    const beforeStored = ui.env.localStorage.getItem(P + 'settings');
    assert.strictEqual(ui.api.resetDisplaySettings(), false);
    assert.deepStrictEqual(native(ui.env.context.window.ChordCruise.state.settings), beforeState);
    assert.strictEqual(ui.env.localStorage.getItem(P + 'settings'), beforeStored);
    assert.strictEqual(ui.fretboardChangeCount(), 0);
    assert.strictEqual(ui.notices.at(-1).message, '表示設定を保存できませんでした');
    assert.strictEqual(ui.notices.at(-1).options.type, 'error');
})();

(function libraryCardTextScalesClampByColumnWithoutDisablingLarge() {
    const env = loadLibrary(baseData());
    const scale = env.context.window.ChordCruise.ui.library.libraryCardTextScale;
    assert.strictEqual(scale('small', 1), 0.85);
    assert.strictEqual(scale('medium', 4), 1);
    assert.strictEqual(scale('large', 1), 1.12);
    assert.strictEqual(scale('large', 2), 1.12);
    assert.strictEqual(scale('large', 3), 1.09);
    assert.strictEqual(scale('large', 4), 1.06);
    assert.strictEqual(scale('xlarge', 1), 1.25);
    assert.strictEqual(scale('xlarge', 2), 1.22);
    assert.strictEqual(scale('xlarge', 3), 1.15);
    assert.strictEqual(scale('xlarge', 4), 1.09);
    assert(scale('large', 4) > scale('medium', 4), '4-column large must remain visibly larger than medium');
    assert(scale('xlarge', 4) > scale('large', 4), '4-column xlarge must remain visibly larger than large');
    assert(themeSource.includes('--cc-library-card-chord-name-size'), 'thumbnail title uses an independent CSS variable');
    assert(!/\.cc-chordthumb-name\s*\{[\s\S]*?--cc-chord-name-thumbnail-size/.test(themeSource), 'thumbnail title must not read the global chord-name size variable');
    assert(themeSource.includes('data-library-chord-name-size="xlarge"'), 'thumbnail title has a dedicated xlarge value');
    assert(themeSource.includes('1.20rem') && themeSource.includes('1.16rem') && themeSource.includes('1.08rem') && themeSource.includes('1rem'), 'xlarge chord-name limits cover all four library columns');
})();

(function libraryDisplaySheetUsesAccessibleTabsInsteadOfTextSizeDisclosure() {
    assert(librarySource.includes('role="tablist" aria-label="表示設定の分類"'), 'display sheet exposes a tablist');
    assert(librarySource.includes('role="tabpanel"'), 'display sheet exposes tabpanels');
    assert(librarySource.includes('aria-selected="'), 'tabs expose selected state');
    assert(librarySource.includes('aria-controls="cc-library-display-panel-'), 'tabs identify their panels');
    assert(librarySource.includes("event.key === 'ArrowLeft'") && librarySource.includes("event.key === 'ArrowRight'"), 'tabs support left and right arrow keys');
    assert(librarySource.includes("event.key === 'Home'") && librarySource.includes("event.key === 'End'"), 'tabs support Home and End keys');
    assert(!librarySource.includes('libraryTextSizeExpanded'), 'old text-size disclosure state is removed');
    assert(!librarySource.includes('data-library-text-size-toggle'), 'old text-size disclosure control is removed');
    assert(themeSource.includes('.cc-library-display-tab.is-selected') && themeSource.includes('border-bottom-color: var(--cc-gold-bright)'), 'selected tab uses a gold underline');
    assert(indexSource.includes('data-fretboard-marker-label-size="xlarge"'), 'settings exposes the marker-label xlarge choice');
    assert(indexSource.includes('丸内文字の大きさ'), 'settings uses the marker-label title');
    assert(settingsSource.includes('fretboardMarkerLabelSize'), 'settings persists the independent marker-label key');
    assert(chordExportSource.includes('markerLabelScale = fretboard.markerLabelScaleForSize'), 'PNG receives the explicit marker-label scale');
    assert(librarySource.includes('markerLabelSize: opts.markerLabelSize'), 'detail marker-label size survives the saved-diagram options boundary');
    assert(indexSource.includes('すべてデフォルトに戻す'), 'settings exposes the display-settings reset trigger');
    assert(indexSource.includes('保存したコードやフォルダは削除されません。'), 'reset copy distinguishes settings from saved data');
    assert(settingsSource.includes('DISPLAY_SETTING_KEYS'), 'reset has an explicit right-top settings scope');
    assert(settingsSource.includes('storage.saveSettings(next) !== true'), 'reset leaves the current UI intact when persistence fails');
    assert(!settingsSource.includes('localStorage.clear'), 'display reset never clears all local storage');
})();

(function listThumbnailsReuseDetailLabelsWithoutChangingSavedData() {
    const env = loadLibrary(baseData());
    const chord = {
        chordName: 'D♭m7♭5',
        fretRange: { min: 1, max: 4, includesOpen: true },
        notes: [
            { string: 5, fret: 4, interval: 0, finger: 'T' },
            { string: 4, fret: 2, interval: 3, finger: 1 },
            { string: 3, fret: 0, interval: 6, finger: null, fingeringWarning: true },
            { string: 2, fret: 0, interval: 10, finger: null }
        ],
        mutedStrings: [6]
    };
    const before = JSON.stringify(chord);
    const options = env.context.window.ChordCruise.ui.library.savedDiagramOptions;
    assert.deepStrictEqual(native(options(chord, { thumbnail: true, mode: 'note' }).markers.map((marker) => marker.label)), ['D♭', 'E', 'G', 'B']);
    assert.deepStrictEqual(native(options(chord, { thumbnail: true, mode: 'solfege' }).markers.map((marker) => marker.label)), ['レ♭', 'ミ', 'ソ', 'シ']);
    assert.deepStrictEqual(native(options(chord, { thumbnail: true, mode: 'degree' }).markers.map((marker) => marker.label)), ['1', '♭3', '♭5', '♭7']);
    assert.deepStrictEqual(native(options(chord, { thumbnail: true, mode: 'finger', monochrome: true }).markers.map((marker) => marker.label)), ['親', '人', '⚠', '']);
    assert.strictEqual(options(chord, { thumbnail: true, mode: 'finger', monochrome: true }).monochrome, true);
    assert.strictEqual(JSON.stringify(chord), before, 'thumbnail labels must not mutate saved chord data');
})();

(function extendedQualitySaveLoadKeepsLegacyTitleAndUsesQualityAwareDegrees() {
    const env = loadLibrary(baseData());
    const legacy = env.storage.saveChord({
        chordName: 'CaugM7',
        formName: 'E型',
        folderId: 'folder-a',
        rootPc: 0,
        intervals: [0, 4, 8, 11],
        fretRange: { min: 1, max: 4, includesOpen: false },
        notes: [
            { string: 6, fret: 1, interval: 0, finger: 1 },
            { string: 5, fret: 4, interval: 8, finger: 4 },
            { string: 4, fret: 2, interval: 11, finger: 2 },
            { string: 3, fret: 2, interval: 4, finger: 2 }
        ],
        mutedStrings: []
    });
    assert(legacy && legacy.id, 'extended-quality fixture saves with schema v1');

    const reloaded = loadLibrary(env.localStorage.snapshot());
    const stored = reloaded.storage.loadChord(legacy.id);
    const options = reloaded.context.window.ChordCruise.ui.library.savedDiagramOptions;
    assert.strictEqual(stored.schemaVersion, 1, 'extended quality does not require a schema change');
    assert.strictEqual(stored.chordName, 'CaugM7', 'legacy saved title remains byte-for-byte unchanged');
    assert.deepStrictEqual(
        native(options(stored, { mode: 'degree' }).markers.map((marker) => marker.label)),
        ['1', '♯5', '7', '3'],
        'legacy augmented-major-seventh intervals use maj7sharp5 degree behavior'
    );

    const dim7 = {
        chordName: 'Cdim7',
        rootPc: 0,
        intervals: [0, 3, 6, 9],
        fretRange: { min: 1, max: 4, includesOpen: false },
        notes: [
            { string: 6, fret: 1, interval: 0 },
            { string: 5, fret: 2, interval: 6 },
            { string: 4, fret: 1, interval: 9 },
            { string: 3, fret: 2, interval: 3 }
        ],
        mutedStrings: []
    };
    assert.deepStrictEqual(
        native(options(dim7, { mode: 'degree' }).markers.map((marker) => marker.label)),
        ['1', '♭5', '♭♭7', '♭3'],
        'saved dim7 diagrams retain the double-flat seventh'
    );
})();

(function augmentedFullFormSurvivesSaveLoadAndAllSavedDiagramModes() {
    const env = loadLibrary(baseData());
    const saved = env.storage.saveChord({
        chordName: 'Caug',
        formName: 'G型',
        shape: 'G',
        folderId: 'folder-a',
        rootPc: 0,
        intervals: [0, 4, 8],
        fretRange: { min: 5, max: 8, includesOpen: false },
        notes: [
            { string: 6, fret: 8, interval: 0, finger: 4, fingeringWarning: false },
            { string: 5, fret: 7, interval: 4, finger: 3, fingeringWarning: false },
            { string: 4, fret: 6, interval: 8, finger: 2, fingeringWarning: false },
            { string: 3, fret: 5, interval: 0, finger: 1, fingeringWarning: false },
            { string: 2, fret: 5, interval: 4, finger: 1, fingeringWarning: false },
            { string: 1, fret: 8, interval: 0, finger: null, fingeringWarning: true }
        ],
        mutedStrings: []
    });
    assert(saved && saved.id, 'full augmented form saves with schema v1');

    const reloaded = loadLibrary(env.localStorage.snapshot());
    const stored = reloaded.storage.loadChord(saved.id);
    const options = reloaded.context.window.ChordCruise.ui.library.savedDiagramOptions;
    assert.strictEqual(stored.schemaVersion, 1, 'aug FORM needs no schema migration');
    assert.strictEqual(stored.notes.length, 6, 'all theoretical G-shape slots survive save/load');
    assert.deepStrictEqual(native(stored.mutedStrings), [], 'fingering convenience does not create saved mutes');
    assert.strictEqual(stored.notes[0].finger, 4, 'source-backed low root pinky survives save/load');
    assert.strictEqual(stored.notes[5].finger, null, 'source-omitted first string keeps a null finger');
    assert.strictEqual(stored.notes[5].fingeringWarning, true, 'source-omitted first string warning survives save/load');
    assert.deepStrictEqual(native(options(stored, { mode: 'note' }).markers.map((marker) => marker.label)), ['C', 'E', 'G♯', 'C', 'E', 'C']);
    assert.deepStrictEqual(native(options(stored, { mode: 'solfege' }).markers.map((marker) => marker.label)), ['ド', 'ミ', 'ソ♯', 'ド', 'ミ', 'ド']);
    assert.deepStrictEqual(native(options(stored, { mode: 'degree' }).markers.map((marker) => marker.label)), ['1', '3', '♯5', '1', '3', '1']);
    assert.deepStrictEqual(native(options(stored, { mode: 'finger' }).markers.map((marker) => marker.label)), ['小', '薬', '中', '人', '人', '⚠']);
    assert(librarySource.includes('diagramOptions: diagramOptions'), 'PNG export receives the same saved diagram options');
})();

(function minorMajorSevenFullFormSurvivesSaveLoadAndAllSavedDiagramModes() {
    const env = loadLibrary(baseData());
    const saved = env.storage.saveChord({
        chordName: 'CmM7',
        formName: 'G型',
        shape: 'G',
        qualityKey: 'mMaj7',
        folderId: 'folder-a',
        rootPc: 0,
        intervals: [0, 3, 7, 11],
        fretRange: { min: 4, max: 8, includesOpen: false },
        notes: [
            { string: 6, fret: 8, interval: 0, finger: 4, fingeringWarning: false },
            { string: 5, fret: 6, interval: 3, finger: 3, fingeringWarning: false },
            { string: 4, fret: 5, interval: 7, finger: 2, fingeringWarning: false },
            { string: 3, fret: 5, interval: 0, finger: null, fingeringWarning: true },
            { string: 2, fret: 4, interval: 3, finger: null, fingeringWarning: true },
            { string: 1, fret: 7, interval: 11, finger: null, fingeringWarning: true }
        ],
        mutedStrings: []
    });
    assert(saved && saved.id, 'full mMaj7 form saves with schema v1');

    const reloaded = loadLibrary(env.localStorage.snapshot());
    const stored = reloaded.storage.loadChord(saved.id);
    const options = reloaded.context.window.ChordCruise.ui.library.savedDiagramOptions;
    assert.strictEqual(stored.schemaVersion, 1, 'mMaj7 FORM needs no schema migration');
    assert.strictEqual(stored.qualityKey, 'mMaj7');
    assert.strictEqual(stored.notes.length, 6, 'all theoretical G-shape mMaj7 slots survive save/load');
    assert.deepStrictEqual(native(stored.mutedStrings), [], 'mMaj7 source omissions do not create saved mutes');
    assert.deepStrictEqual(native(stored.notes.slice(0, 3).map((note) => note.finger)), [4, 3, 2], 'source-backed low strings survive save/load');
    assert.deepStrictEqual(native(stored.notes.slice(3).map((note) => note.finger)), [null, null, null], 'unsupported high strings keep null fingers');
    assert(stored.notes.slice(3).every((note) => note.fingeringWarning === true), 'unsupported high-string warnings survive save/load');
    assert.deepStrictEqual(native(options(stored, { mode: 'note' }).markers.map((marker) => marker.label)), ['C', 'D♯', 'G', 'C', 'D♯', 'B']);
    assert.deepStrictEqual(native(options(stored, { mode: 'solfege' }).markers.map((marker) => marker.label)), ['ド', 'レ♯', 'ソ', 'ド', 'レ♯', 'シ']);
    assert.deepStrictEqual(native(options(stored, { mode: 'degree' }).markers.map((marker) => marker.label)), ['1', '♭3', '5', '1', '♭3', '7']);
    assert.deepStrictEqual(native(options(stored, { mode: 'finger' }).markers.map((marker) => marker.label)), ['小', '薬', '中', '⚠', '⚠', '⚠']);
    assert(librarySource.includes('diagramOptions: diagramOptions'), 'mMaj7 PNG export receives the same saved diagram options');
})();

(function majorSevenSharpFiveFullFormSurvivesSaveLoadAndAllSavedDiagramModes() {
    const env = loadLibrary(baseData());
    const saved = env.storage.saveChord({
        chordName: 'CM7♯5',
        formName: 'G型',
        shape: 'G',
        qualityKey: 'maj7sharp5',
        folderId: 'folder-a',
        rootPc: 0,
        intervals: [0, 4, 8, 11],
        fretRange: { min: 5, max: 8, includesOpen: false },
        notes: [
            { string: 6, fret: 8, interval: 0, finger: 'T', fingeringWarning: false },
            { string: 5, fret: 7, interval: 4, finger: 2, fingeringWarning: false },
            { string: 4, fret: 6, interval: 8, finger: 1, fingeringWarning: false },
            { string: 3, fret: 5, interval: 0, finger: null, fingeringWarning: true },
            { string: 2, fret: 5, interval: 4, finger: null, fingeringWarning: true },
            { string: 1, fret: 7, interval: 11, finger: 3, fingeringWarning: false }
        ],
        mutedStrings: []
    });
    assert(saved && saved.id, 'full M7♯5 form saves with schema v1');

    const reloaded = loadLibrary(env.localStorage.snapshot());
    const stored = reloaded.storage.loadChord(saved.id);
    const options = reloaded.context.window.ChordCruise.ui.library.savedDiagramOptions;
    assert.strictEqual(stored.schemaVersion, 1, 'M7♯5 FORM needs no schema migration');
    assert.strictEqual(stored.qualityKey, 'maj7sharp5');
    assert.strictEqual(stored.notes.length, 6, 'all theoretical G-shape M7♯5 slots survive save/load');
    assert.deepStrictEqual(native(stored.mutedStrings), [], 'M7♯5 complete FORM creates no saved mutes');
    assert.deepStrictEqual(native(stored.notes.map((note) => note.finger)), ['T', 2, 1, null, null, 3], 'user-verified M7♯5 fingers survive save/load');
    assert.deepStrictEqual(native(stored.notes.map((note) => note.fingeringWarning)), [false, false, false, true, true, false], 'M7♯5 warning slots survive save/load');
    assert.deepStrictEqual(native(options(stored, { mode: 'note' }).markers.map((marker) => marker.label)), ['C', 'E', 'G♯', 'C', 'E', 'B']);
    assert.deepStrictEqual(native(options(stored, { mode: 'solfege' }).markers.map((marker) => marker.label)), ['ド', 'ミ', 'ソ♯', 'ド', 'ミ', 'シ']);
    assert.deepStrictEqual(native(options(stored, { mode: 'degree' }).markers.map((marker) => marker.label)), ['1', '3', '♯5', '1', '3', '7']);
    assert.deepStrictEqual(native(options(stored, { mode: 'finger' }).markers.map((marker) => marker.label)), ['親', '中', '人', '⚠', '⚠', '薬']);
    assert(librarySource.includes('diagramOptions: diagramOptions'), 'M7♯5 PNG export receives the same saved diagram options');
})();

(function diminishedSevenFormSurvivesSaveLoadAndAllSavedDiagramModes() {
    const env = loadLibrary(baseData());
    const saved = env.storage.saveChord({
        chordName: 'Cdim7',
        formName: 'G型',
        shape: 'G',
        qualityKey: 'dim7',
        folderId: 'folder-a',
        rootPc: 0,
        intervals: [0, 3, 6, 9],
        fretRange: { min: 7, max: 8, includesOpen: false },
        notes: [
            { string: 6, fret: 8, interval: 0, finger: 'T', fingeringWarning: false },
            { string: 4, fret: 7, interval: 9, finger: 1, fingeringWarning: false },
            { string: 3, fret: 8, interval: 3, finger: 3, fingeringWarning: false },
            { string: 2, fret: 7, interval: 6, finger: 2, fingeringWarning: false }
        ],
        mutedStrings: [5, 1]
    });
    assert(saved && saved.id, 'dim7 form saves with schema v1');

    const reloaded = loadLibrary(env.localStorage.snapshot());
    const stored = reloaded.storage.loadChord(saved.id);
    const options = reloaded.context.window.ChordCruise.ui.library.savedDiagramOptions;
    assert.strictEqual(stored.schemaVersion, 1, 'dim7 FORM needs no schema migration');
    assert.strictEqual(stored.qualityKey, 'dim7');
    assert.strictEqual(stored.notes.length, 4, 'all four dim7 chord tones survive save/load');
    assert.deepStrictEqual(native(stored.mutedStrings), [5, 1], 'dim7 FORM mutes survive unchanged');
    assert.deepStrictEqual(native(stored.notes.map((note) => note.finger)), ['T', 1, 3, 2], 'user-verified dim7 fingers survive save/load');
    assert(stored.notes.every((note) => note.fingeringWarning === false), 'dim7 stays warning-free after save/load');
    assert.deepStrictEqual(native(options(stored, { mode: 'note' }).markers.map((marker) => marker.label)), ['C', 'A', 'D♯', 'F♯']);
    assert.deepStrictEqual(native(options(stored, { mode: 'solfege' }).markers.map((marker) => marker.label)), ['ド', 'ラ', 'レ♯', 'ファ♯']);
    assert.deepStrictEqual(native(options(stored, { mode: 'degree' }).markers.map((marker) => marker.label)), ['1', '♭♭7', '♭3', '♭5']);
    assert.deepStrictEqual(native(options(stored, { mode: 'finger' }).markers.map((marker) => marker.label)), ['親', '人', '薬', '中']);
    assert(librarySource.includes('diagramOptions: diagramOptions'), 'dim7 PNG export receives the same saved diagram options');
})();

(function savedDiatonicLabelsRebuildScaleSpellingWithoutChangingStoredTitles() {
    const env = loadLibrary(baseData());
    const options = env.context.window.ChordCruise.ui.library.savedDiagramOptions;
    const sharpChord = {
        chordName: 'Fm♭5',
        keyContext: { tonicPc: 6, mode: 'major', degreeLabel: 'VII°' },
        rootPc: 5,
        intervals: [0, 3, 6],
        fretRange: { min: 1, max: 6, includesOpen: false },
        notes: [
            { string: 6, fret: 1, interval: 0 },
            { string: 4, fret: 6, interval: 3 },
            { string: 3, fret: 4, interval: 6 }
        ],
        mutedStrings: []
    };
    const doubleFlatChord = {
        chordName: 'G',
        keyContext: { tonicPc: 1, mode: 'locrian', degreeLabel: 'V' },
        rootPc: 7,
        intervals: [0, 4, 7],
        fretRange: { min: 0, max: 3, includesOpen: true },
        notes: [
            { string: 6, fret: 3, interval: 0 },
            { string: 5, fret: 2, interval: 4 },
            { string: 4, fret: 0, interval: 7 }
        ],
        mutedStrings: []
    };
    const sharpBefore = JSON.stringify(sharpChord);
    const flatBefore = JSON.stringify(doubleFlatChord);

    assert.deepStrictEqual(
        native(options(sharpChord, { mode: 'note' }).markers.map((marker) => marker.label)),
        ['E♯', 'G♯', 'B']
    );
    assert.deepStrictEqual(
        native(options(doubleFlatChord, { mode: 'note' }).markers.map((marker) => marker.label)),
        ['A♭♭', 'C♭', 'E♭♭']
    );
    assert.strictEqual(sharpChord.chordName, 'Fm♭5', 'legacy saved title remains the stored string');
    assert.strictEqual(doubleFlatChord.chordName, 'G', 'saved title is never rewritten from marker spelling');
    assert.strictEqual(JSON.stringify(sharpChord), sharpBefore, 'scale-aware marker rendering is read-only');
    assert.strictEqual(JSON.stringify(doubleFlatChord), flatBefore, 'double-flat rendering is read-only');
})();

(function phaseDPublishedScalesSaveReloadAndRebuildLibraryLabels() {
    const env = loadLibrary(baseData());
    const harmonic = env.storage.saveChord({
        chordName: 'F♯♯dim7',
        formName: 'C型',
        shape: 'C',
        qualityKey: 'dim7',
        folderId: 'folder-a',
        keyContext: { tonicPc: 8, mode: 'harmonic-minor', degreeLabel: 'VII°7' },
        rootPc: 7,
        intervals: [0, 3, 6, 9],
        fretRange: { min: 9, max: 12, includesOpen: false },
        notes: [
            { string: 5, fret: 9, interval: 0 },
            { string: 4, fret: 11, interval: 3 },
            { string: 3, fret: 9, interval: 9 },
            { string: 2, fret: 11, interval: 6 }
        ],
        mutedStrings: [6, 1]
    });
    const melodic = env.storage.saveChord({
        chordName: 'CM7♯5',
        formName: 'E型',
        shape: 'E',
        qualityKey: 'maj7sharp5',
        folderId: 'folder-a',
        keyContext: { tonicPc: 9, mode: 'melodic-minor', degreeLabel: 'IIIM7♯5' },
        rootPc: 0,
        intervals: [0, 4, 8, 11],
        fretRange: { min: 8, max: 11, includesOpen: false },
        notes: [
            { string: 6, fret: 8, interval: 0 },
            { string: 5, fret: 11, interval: 8 },
            { string: 4, fret: 9, interval: 11 },
            { string: 3, fret: 9, interval: 4 }
        ],
        mutedStrings: [2, 1]
    });
    assert(harmonic && melodic, 'published-scale forms save with the existing schema');

    const reloaded = loadLibrary(env.localStorage.snapshot());
    const options = reloaded.context.window.ChordCruise.ui.library.savedDiagramOptions;
    const storedHarmonic = reloaded.storage.loadChord(harmonic.id);
    const storedMelodic = reloaded.storage.loadChord(melodic.id);
    assert.strictEqual(storedHarmonic.schemaVersion, 1);
    assert.strictEqual(storedMelodic.schemaVersion, 1);
    assert.strictEqual(storedHarmonic.keyContext.mode, 'harmonic-minor');
    assert.strictEqual(storedMelodic.keyContext.mode, 'melodic-minor');
    assert.deepStrictEqual(
        native(options(storedHarmonic, { mode: 'note' }).markers.map((marker) => marker.label)),
        ['F♯♯', 'A♯', 'E', 'C♯']
    );
    assert.deepStrictEqual(
        native(options(storedHarmonic, { mode: 'degree' }).markers.map((marker) => marker.label)),
        ['1', '♭3', '♭♭7', '♭5']
    );
    assert.deepStrictEqual(
        native(options(storedMelodic, { mode: 'note' }).markers.map((marker) => marker.label)),
        ['C', 'G♯', 'B', 'E']
    );
    assert.deepStrictEqual(
        native(options(storedMelodic, { mode: 'degree' }).markers.map((marker) => marker.label)),
        ['1', '♯5', '7', '3']
    );
    assert(librarySource.includes('diagramOptions: diagramOptions'), 'published-scale PNG/SVG uses saved diagram options');
})();

(function m7b5UserVerifiedEAndDFingersSurviveSaveReloadAndExport() {
    const env = loadLibrary(baseData());
    const eShape = env.storage.saveChord({
        chordName: 'Cm7♭5', formName: 'E型', shape: 'E', qualityKey: 'm7b5', folderId: 'folder-a',
        rootPc: 0, intervals: [0, 3, 6, 10], fretRange: { min: 7, max: 9, includesOpen: false },
        notes: [
            { string: 6, fret: 8, interval: 0, finger: 'T', fingeringWarning: false },
            { string: 5, fret: 9, interval: 6, finger: null, fingeringWarning: true },
            { string: 4, fret: 8, interval: 10, finger: 2, fingeringWarning: false },
            { string: 3, fret: 8, interval: 3, finger: 3, fingeringWarning: false },
            { string: 2, fret: 7, interval: 6, finger: 1, fingeringWarning: false },
            { string: 1, fret: 8, interval: 0, finger: 4, fingeringWarning: false }
        ], mutedStrings: []
    });
    const dShape = env.storage.saveChord({
        chordName: 'Cm7♭5', formName: 'D型', shape: 'D', qualityKey: 'm7b5', folderId: 'folder-a',
        rootPc: 0, intervals: [0, 3, 6, 10], fretRange: { min: 10, max: 11, includesOpen: false },
        notes: [
            { string: 4, fret: 10, interval: 0, finger: 1, fingeringWarning: false },
            { string: 3, fret: 11, interval: 6, finger: 2, fingeringWarning: false },
            { string: 2, fret: 11, interval: 10, finger: 3, fingeringWarning: false },
            { string: 1, fret: 11, interval: 3, finger: 4, fingeringWarning: false }
        ], mutedStrings: [6, 5]
    });
    const reloaded = loadLibrary(env.localStorage.snapshot());
    const options = reloaded.context.window.ChordCruise.ui.library.savedDiagramOptions;
    const storedE = reloaded.storage.loadChord(eShape.id);
    const storedD = reloaded.storage.loadChord(dShape.id);
    assert.strictEqual(storedE.schemaVersion, 1);
    assert.strictEqual(storedD.schemaVersion, 1);
    assert.deepStrictEqual(native(storedE.notes.map((note) => [note.finger, note.fingeringWarning])), [['T', false], [null, true], [2, false], [3, false], [1, false], [4, false]]);
    assert.deepStrictEqual(native(storedD.notes.map((note) => [note.finger, note.fingeringWarning])), [[1, false], [2, false], [3, false], [4, false]]);
    assert.deepStrictEqual(native(options(storedE, { mode: 'finger' }).markers.map((marker) => marker.label)), ['親', '⚠', '中', '薬', '人', '小']);
    assert.deepStrictEqual(native(options(storedD, { mode: 'finger' }).markers.map((marker) => marker.label)), ['人', '中', '薬', '小']);
    assert.deepStrictEqual(native(options(storedE, { mode: 'degree' }).markers.map((marker) => marker.label)), ['1', '♭5', '♭7', '♭3', '♭5', '1']);
    assert(librarySource.includes('diagramOptions: diagramOptions'), 'm7♭5 PNG/SVG uses the saved fingering markers');
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
