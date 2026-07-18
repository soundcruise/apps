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
