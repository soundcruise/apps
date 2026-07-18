(function () {
    'use strict';

    var PREFIX = 'chordCruise.';
    var KEY_SCHEMA_VERSION = PREFIX + 'schemaVersion';
    var KEY_SETTINGS = PREFIX + 'settings';
    var KEY_FOLDERS = PREFIX + 'folders';
    var KEY_CHORD_INDEX = PREFIX + 'chords.index';
    var KEY_LIBRARY_ORDER = PREFIX + 'libraryOrder';
    var CHORD_KEY_PREFIX = PREFIX + 'chord.';
    var UNCATEGORIZED_ID = 'folder_uncategorized';
    var LIBRARY_ORDER_VERSION = 1;
    var DEFAULT_HIGHLIGHTED_FRETS = [0, 3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
    var FOLDER_COLOR_KEYS = ['forest', 'burgundy', 'navy', 'umber', 'charcoal', 'teal', 'violet', 'russet', 'leather', 'black-leather', 'wine', 'black-gold'];

    var DEFAULT_SETTINGS = {
        selectedKey: 0,
        scaleType: 'major',
        chordToneMode: '3',
        fretboardDisplayMode: 'note',
        chordNameSize: 'medium',
        fretNumberSize: 'medium',
        fretboardMarkerLabelSize: 'medium',
        fretNumberHighlightMode: 'all',
        highlightedFrets: DEFAULT_HIGHLIGHTED_FRETS,
        highFretMode: false,
        libraryColumns: 4,
        folderShelfColumns: 4,
        // コード本棚の一覧サムネイル専用。通常指板・詳細・PNGの表示設定とは分離する。
        libraryCardDisplayMode: 'finger',
        libraryCardMonochrome: false,
        libraryCardChordNameSize: 'medium',
        libraryCardFretNumberSize: 'medium',
        libraryCardMarkerLabelSize: 'medium',
        librarySortMode: 'updatedDesc'
    };

    function normalizeHighlightedFrets(value) {
        if (!Array.isArray(value)) {
            return DEFAULT_HIGHLIGHTED_FRETS.slice();
        }
        var seen = {};
        return value.filter(function (fret) {
            if (typeof fret !== 'number' || Math.floor(fret) !== fret || fret < 0 || fret > 25 || seen[fret]) {
                return false;
            }
            seen[fret] = true;
            return true;
        }).sort(function (a, b) { return a - b; });
    }

    function normalizeSettings(settings) {
        var normalized = settings;
        if (['small', 'medium', 'large', 'xlarge'].indexOf(normalized.chordNameSize) === -1) {
            normalized.chordNameSize = 'medium';
        }
        if (['small', 'medium', 'large', 'xlarge'].indexOf(normalized.fretNumberSize) === -1) {
            normalized.fretNumberSize = 'medium';
        }
        if (['small', 'medium', 'large', 'xlarge'].indexOf(normalized.fretboardMarkerLabelSize) === -1) {
            normalized.fretboardMarkerLabelSize = 'medium';
        }
        if ([1, 2, 3, 4].indexOf(normalized.libraryColumns) === -1) {
            normalized.libraryColumns = 4;
        }
        if ([2, 3, 4, 5, 6].indexOf(normalized.folderShelfColumns) === -1) {
            normalized.folderShelfColumns = 4;
        }
        if (['note', 'solfege', 'degree', 'finger'].indexOf(normalized.libraryCardDisplayMode) === -1) {
            normalized.libraryCardDisplayMode = 'finger';
        }
        normalized.libraryCardMonochrome = normalized.libraryCardMonochrome === true;
        ['libraryCardChordNameSize', 'libraryCardFretNumberSize', 'libraryCardMarkerLabelSize'].forEach(function (key) {
            if (['small', 'medium', 'large', 'xlarge'].indexOf(normalized[key]) === -1) {
                normalized[key] = 'medium';
            }
        });
        if (['all', 'position', 'custom'].indexOf(normalized.fretNumberHighlightMode) === -1) {
            normalized.fretNumberHighlightMode = 'all';
        }
        normalized.highlightedFrets = normalizeHighlightedFrets(normalized.highlightedFrets);
        normalized.highFretMode = normalized.highFretMode === true;
        return normalized;
    }

    /**
     * 設定画面で「デフォルトに戻す」際にも使う正式な初期値。
     * 配列を複製し、呼び出し側の編集が既定値定義へ波及しないようにする。
     */
    function getSettingsDefaults() {
        var defaults = {};
        var key;
        for (key in DEFAULT_SETTINGS) {
            if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
                defaults[key] = Array.isArray(DEFAULT_SETTINGS[key])
                    ? DEFAULT_SETTINGS[key].slice()
                    : DEFAULT_SETTINGS[key];
            }
        }
        return defaults;
    }

    function readJSON(key, fallback) {
        try {
            var raw = window.localStorage.getItem(key);
            if (raw === null || raw === undefined) {
                return fallback;
            }
            return JSON.parse(raw);
        } catch (err) {
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (err) {
            console.warn('[ChordCruise.storage] failed to write key: ' + key, err);
            return false;
        }
    }

    function ensureSchemaVersion() {
        var current = window.localStorage.getItem(KEY_SCHEMA_VERSION);
        if (current === null || current === undefined) {
            writeJSON(KEY_SCHEMA_VERSION, '1');
        }
    }

    function loadSettings() {
        var stored = readJSON(KEY_SETTINGS, null);
        var merged = {};
        var key;
        for (key in DEFAULT_SETTINGS) {
            if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
                merged[key] = DEFAULT_SETTINGS[key];
            }
        }
        if (stored && typeof stored === 'object') {
            for (key in stored) {
                if (Object.prototype.hasOwnProperty.call(stored, key)) {
                    merged[key] = stored[key];
                }
            }
        }
        return normalizeSettings(merged);
    }

    function saveSettings(partial) {
        var current = loadSettings();
        var next = {};
        var key;
        for (key in current) {
            if (Object.prototype.hasOwnProperty.call(current, key)) {
                next[key] = current[key];
            }
        }
        if (partial && typeof partial === 'object') {
            for (key in partial) {
                if (Object.prototype.hasOwnProperty.call(partial, key)) {
                    next[key] = partial[key];
                }
            }
        }
        return writeJSON(KEY_SETTINGS, normalizeSettings(next));
    }

    // ---- フォルダ ----

    function nowIso() {
        return new Date().toISOString();
    }

    function defaultFolderColorKey(id) {
        return 'black-leather';
    }

    function validFolderColorKey(value) {
        return FOLDER_COLOR_KEYS.indexOf(value) !== -1;
    }

    function folderColorKey(folder) {
        return folder && validFolderColorKey(folder.colorKey) ? folder.colorKey : defaultFolderColorKey(folder && folder.id);
    }

    function uniqueById(items) {
        var seen = {};
        return (Array.isArray(items) ? items : []).filter(function (item) {
            if (!item || typeof item.id !== 'string' || !item.id || seen[item.id]) return false;
            seen[item.id] = true;
            return true;
        });
    }

    function ensureUncategorizedFolder(folders) {
        var hasUncategorized = folders.some(function (folder) {
            return folder && folder.id === UNCATEGORIZED_ID;
        });
        if (hasUncategorized) return folders;
        return [{
            id: UNCATEGORIZED_ID,
            name: '未分類',
            builtin: true,
            order: 0,
            createdAt: nowIso(),
            updatedAt: nowIso()
        }].concat(folders);
    }

    function loadFolders() {
        var folders = readJSON(KEY_FOLDERS, null);
        if (!Array.isArray(folders) || folders.length === 0) {
            folders = [{
                id: UNCATEGORIZED_ID,
                name: '未分類',
                builtin: true,
                order: 0,
                createdAt: nowIso(),
                updatedAt: nowIso()
            }];
            writeJSON(KEY_FOLDERS, folders);
        } else if (!folders.some(function (folder) { return folder && folder.id === UNCATEGORIZED_ID; })) {
            folders = ensureUncategorizedFolder(folders);
            writeJSON(KEY_FOLDERS, folders);
        }
        return folders;
    }

    function saveFolders(folders) {
        return writeJSON(KEY_FOLDERS, folders);
    }

    function createFolder(name) {
        var folders = loadFolders();
        var index = loadChordIndex();
        var orderBefore = libraryOrderInfo(folders, index).order;
        var maxOrder = 0;
        folders.forEach(function (folder) {
            if ((folder.order || 0) > maxOrder) maxOrder = folder.order || 0;
        });
        var folder = {
            id: 'folder_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
            name: name,
            builtin: false,
            colorKey: defaultFolderColorKey(),
            order: maxOrder + 1,
            createdAt: nowIso(),
            updatedAt: nowIso()
        };
        folders.push(folder);
        if (!saveFolders(folders)) return null;
        orderBefore.folderIds = orderBefore.folderIds.filter(function (id) { return id !== folder.id; });
        orderBefore.folderIds.push(folder.id);
        orderBefore.entryIdsByFolder[folder.id] = [];
        if (!saveNormalizedLibraryOrder(orderBefore, folders, index)) {
            console.warn('[ChordCruise.storage] folder created but library order could not be saved');
        }
        return folder;
    }

    /** builtin フォルダは改名不可 */
    function renameFolder(id, name) {
        var folders = loadFolders();
        var changed = false;
        folders.forEach(function (folder) {
            if (folder.id === id && !folder.builtin) {
                folder.name = name;
                folder.updatedAt = nowIso();
                changed = true;
            }
        });
        if (changed) saveFolders(folders);
        return changed;
    }

    function setFolderColor(id, colorKey) {
        if (!validFolderColorKey(colorKey)) return false;
        var folders = loadFolders();
        var changed = false;
        folders.forEach(function (folder) {
            if (folder.id === id) {
                folder.colorKey = colorKey;
                folder.updatedAt = nowIso();
                changed = true;
            }
        });
        return changed && saveFolders(folders);
    }

    function copyFolderName(name, folders) {
        var names = {};
        folders.forEach(function (folder) { names[folder.name] = true; });
        var sequence = 1;
        while (sequence < 1000) {
            var suffix = 'のコピー' + (sequence === 1 ? '' : sequence);
            var candidate = String(name || '').slice(0, Math.max(0, 24 - suffix.length)) + suffix;
            if (!names[candidate]) return candidate;
            sequence += 1;
        }
        return String(name || '').slice(0, 20) + 'のコピー';
    }

    function snapshotKeys(keys) {
        var snapshot = {};
        keys.forEach(function (key) { snapshot[key] = window.localStorage.getItem(key); });
        return snapshot;
    }

    function restoreKeys(snapshot) {
        Object.keys(snapshot).forEach(function (key) {
            try {
                if (snapshot[key] === null) window.localStorage.removeItem(key);
                else window.localStorage.setItem(key, snapshot[key]);
            } catch (err) {
                console.warn('[ChordCruise.storage] failed to roll back key: ' + key, err);
            }
        });
    }

    /** フォルダと所属コードを順序ごと複製する。書き込み失敗時は可能な限り復元する。 */
    function copyFolder(id) {
        var folders = loadFolders();
        var index = loadChordIndex();
        var source = null;
        folders.forEach(function (folder) { if (folder.id === id) source = folder; });
        if (!source || source.builtin) return null;
        var orderBefore = libraryOrderInfo(folders, index).order;
        var sourceIds = (orderBefore.entryIdsByFolder[id] || []).slice();
        var existingFolderIds = {};
        var existingChordIds = {};
        folders.forEach(function (folder) { existingFolderIds[folder.id] = true; });
        index.forEach(function (entry) { existingChordIds[entry.id] = true; });
        var stamp = Date.now();
        var copyId = 'folder_' + stamp + '_copy';
        var copyNumber = 1;
        while (existingFolderIds[copyId]) copyId = 'folder_' + stamp + '_copy_' + (++copyNumber);
        var copiedFolder = {
            id: copyId,
            name: copyFolderName(source.name, folders),
            builtin: false,
            order: source.order || 0,
            colorKey: folderColorKey(source),
            createdAt: nowIso(),
            updatedAt: nowIso()
        };
        var copiedChords = [];
        for (var position = 0; position < sourceIds.length; position += 1) {
            var original = loadChord(sourceIds[position]);
            if (!original) return null;
            var clone = JSON.parse(JSON.stringify(original));
            var cloneId = 'cc_' + stamp + '_copy_' + position;
            var cloneNumber = 1;
            while (existingChordIds[cloneId]) cloneId = 'cc_' + stamp + '_copy_' + position + '_' + (++cloneNumber);
            existingChordIds[cloneId] = true;
            clone.id = cloneId;
            clone.folderId = copyId;
            clone.createdAt = nowIso();
            clone.updatedAt = nowIso();
            clone.schemaVersion = 1;
            copiedChords.push(clone);
        }
        var nextFolders = folders.concat([copiedFolder]);
        var nextIndex = index.concat(copiedChords.map(indexEntryOf));
        var nextOrder = normalizeLibraryOrder(orderBefore, nextFolders, nextIndex);
        var sourcePosition = nextOrder.folderIds.indexOf(id);
        nextOrder.folderIds = nextOrder.folderIds.filter(function (folderId) { return folderId !== copyId; });
        nextOrder.folderIds.splice(sourcePosition + 1, 0, copyId);
        nextOrder.entryIdsByFolder[copyId] = copiedChords.map(function (chord) { return chord.id; });
        var keys = [KEY_FOLDERS, KEY_CHORD_INDEX, KEY_LIBRARY_ORDER].concat(copiedChords.map(function (chord) { return chordKey(chord.id); }));
        var snapshot = snapshotKeys(keys);
        try {
            for (var copyIndex = 0; copyIndex < copiedChords.length; copyIndex += 1) {
                if (!writeJSON(chordKey(copiedChords[copyIndex].id), copiedChords[copyIndex])) throw new Error('chord write failed');
            }
            if (!writeChordIndex(nextIndex)) throw new Error('index write failed');
            if (!saveFolders(nextFolders)) throw new Error('folder write failed');
            if (!writeJSON(KEY_LIBRARY_ORDER, normalizeLibraryOrder(nextOrder, nextFolders, nextIndex))) throw new Error('order write failed');
            return copiedFolder;
        } catch (err) {
            restoreKeys(snapshot);
            return null;
        }
    }

    /** builtin フォルダは削除不可。通常フォルダは所属コードごと完全に削除する。 */
    function deleteFolder(id) {
        var folders = loadFolders();
        var indexBefore = loadChordIndex();
        var orderBefore = libraryOrderInfo(folders, indexBefore).order;
        var target = null;
        folders.forEach(function (folder) {
            if (folder.id === id) target = folder;
        });
        if (!target || target.builtin) {
            return false;
        }
        var deletedIds = (orderBefore.entryIdsByFolder[id] || []).slice();
        indexBefore.forEach(function (entry) {
            if (entry.folderId === id && deletedIds.indexOf(entry.id) === -1) deletedIds.push(entry.id);
        });
        var nextFolders = folders.filter(function (folder) {
            return folder.id !== id;
        });
        var nextIndex = indexBefore.filter(function (entry) { return entry.folderId !== id; });
        var nextOrder = normalizeLibraryOrder(orderBefore, nextFolders, nextIndex);
        nextOrder.folderIds = nextOrder.folderIds.filter(function (folderId) { return folderId !== id; });
        delete nextOrder.entryIdsByFolder[id];
        var keys = [KEY_FOLDERS, KEY_CHORD_INDEX, KEY_LIBRARY_ORDER].concat(deletedIds.map(chordKey));
        var snapshot = snapshotKeys(keys);
        try {
            if (!writeChordIndex(nextIndex)) throw new Error('index write failed');
            if (!saveFolders(nextFolders)) throw new Error('folder write failed');
            if (!writeJSON(KEY_LIBRARY_ORDER, normalizeLibraryOrder(nextOrder, nextFolders, nextIndex))) throw new Error('order write failed');
            deletedIds.forEach(function (entryId) { window.localStorage.removeItem(chordKey(entryId)); });
        } catch (err) {
            restoreKeys(snapshot);
            return false;
        }
        return true;
    }

    // ---- 保存コード ----

    function chordKey(id) {
        return CHORD_KEY_PREFIX + id;
    }

    function loadChordIndex() {
        var index = readJSON(KEY_CHORD_INDEX, null);
        return Array.isArray(index) ? index : [];
    }

    function writeChordIndex(index) {
        return writeJSON(KEY_CHORD_INDEX, index);
    }

    // ---- コード本棚の並び順 ----

    function legacyFolderIds(folders) {
        return uniqueById(folders).map(function (folder, index) {
            return { folder: folder, index: index };
        }).sort(function (a, b) {
            if (a.folder.id === UNCATEGORIZED_ID) return -1;
            if (b.folder.id === UNCATEGORIZED_ID) return 1;
            var aOrder = typeof a.folder.order === 'number' ? a.folder.order : 0;
            var bOrder = typeof b.folder.order === 'number' ? b.folder.order : 0;
            return aOrder - bOrder || a.index - b.index;
        }).map(function (item) { return item.folder.id; });
    }

    function legacyEntryIds(index, folderId) {
        return uniqueById(index).map(function (entry, position) {
            return { entry: entry, position: position };
        }).filter(function (item) {
            return item.entry.folderId === folderId;
        }).sort(function (a, b) {
            var byUpdated = String(b.entry.updatedAt || '').localeCompare(String(a.entry.updatedAt || ''));
            return byUpdated || a.position - b.position;
        }).map(function (item) { return item.entry.id; });
    }

    function readLibraryOrderState() {
        var raw;
        try {
            raw = window.localStorage.getItem(KEY_LIBRARY_ORDER);
        } catch (err) {
            return { exists: false, value: null, invalid: false };
        }
        if (raw === null || raw === undefined) return { exists: false, value: null, invalid: false };
        try {
            var parsed = JSON.parse(raw);
            return {
                exists: true,
                value: parsed && typeof parsed === 'object' ? parsed : null,
                invalid: !parsed || typeof parsed !== 'object'
            };
        } catch (err) {
            return { exists: true, value: null, invalid: true };
        }
    }

    function normalizeLibraryOrder(rawOrder, folders, index) {
        var validFolders = uniqueById(folders);
        var validEntries = uniqueById(index);
        var folderLookup = {};
        var entryLookup = {};
        validFolders.forEach(function (folder) { folderLookup[folder.id] = folder; });
        validEntries.forEach(function (entry) { entryLookup[entry.id] = entry; });

        var rawFolderIds = rawOrder && Array.isArray(rawOrder.folderIds) ? rawOrder.folderIds : [];
        var fallbackFolderIds = legacyFolderIds(validFolders);
        var folderIds = [];
        var seenFolders = {};
        rawFolderIds.concat(fallbackFolderIds).forEach(function (id) {
            if (typeof id !== 'string' || seenFolders[id] || !folderLookup[id]) return;
            seenFolders[id] = true;
            folderIds.push(id);
        });
        folderIds = folderIds.filter(function (id) { return id !== UNCATEGORIZED_ID; });
        if (folderLookup[UNCATEGORIZED_ID]) folderIds.unshift(UNCATEGORIZED_ID);

        var rawByFolder = rawOrder && rawOrder.entryIdsByFolder && typeof rawOrder.entryIdsByFolder === 'object'
            ? rawOrder.entryIdsByFolder
            : {};
        var entryIdsByFolder = {};
        folderIds.forEach(function (folderId) {
            var rawIds = Array.isArray(rawByFolder[folderId]) ? rawByFolder[folderId] : [];
            var fallbackIds = legacyEntryIds(validEntries, folderId);
            var seenEntries = {};
            entryIdsByFolder[folderId] = [];
            rawIds.concat(fallbackIds).forEach(function (entryId) {
                var entry = entryLookup[entryId];
                if (!entry || seenEntries[entryId] || entry.folderId !== folderId) return;
                seenEntries[entryId] = true;
                entryIdsByFolder[folderId].push(entryId);
            });
        });
        return {
            version: LIBRARY_ORDER_VERSION,
            folderIds: folderIds,
            entryIdsByFolder: entryIdsByFolder
        };
    }

    function sameLibraryOrder(a, b) {
        try {
            return JSON.stringify(a) === JSON.stringify(b);
        } catch (err) {
            return false;
        }
    }

    function libraryOrderInfo(folders, index) {
        var state = readLibraryOrderState();
        var order = normalizeLibraryOrder(state.value, folders, index);
        if (state.exists && (state.invalid || !sameLibraryOrder(state.value, order))) {
            writeJSON(KEY_LIBRARY_ORDER, order);
        }
        return { order: order, exists: state.exists };
    }

    function saveNormalizedLibraryOrder(order, folders, index) {
        return writeJSON(KEY_LIBRARY_ORDER, normalizeLibraryOrder(order, folders, index));
    }

    function loadLibraryOrder() {
        return libraryOrderInfo(loadFolders(), loadChordIndex()).order;
    }

    function loadOrderedFolders() {
        var folders = uniqueById(loadFolders());
        var byId = {};
        folders.forEach(function (folder) { byId[folder.id] = folder; });
        return loadLibraryOrder().folderIds.map(function (id) { return byId[id]; }).filter(Boolean);
    }

    function loadOrderedChordIndex(folderId) {
        var index = uniqueById(loadChordIndex());
        var byId = {};
        index.forEach(function (entry) { byId[entry.id] = entry; });
        var ids = loadLibraryOrder().entryIdsByFolder[folderId] || [];
        return ids.map(function (id) { return byId[id]; }).filter(function (entry) {
            return entry && entry.folderId === folderId;
        });
    }

    function moveFolder(id, delta) {
        if (id === UNCATEGORIZED_ID || (delta !== -1 && delta !== 1)) return false;
        var folders = loadFolders();
        var index = loadChordIndex();
        var order = libraryOrderInfo(folders, index).order;
        var position = order.folderIds.indexOf(id);
        var nextPosition = position + delta;
        if (position < 1 || nextPosition < 1 || nextPosition >= order.folderIds.length) return false;
        var next = normalizeLibraryOrder(order, folders, index);
        var swap = next.folderIds[nextPosition];
        next.folderIds[nextPosition] = id;
        next.folderIds[position] = swap;
        return writeJSON(KEY_LIBRARY_ORDER, next);
    }

    function moveChord(id, folderId, delta) {
        if (delta !== -1 && delta !== 1) return false;
        var folders = loadFolders();
        var index = loadChordIndex();
        var order = libraryOrderInfo(folders, index).order;
        var ids = order.entryIdsByFolder[folderId] || [];
        var position = ids.indexOf(id);
        var nextPosition = position + delta;
        if (position < 0 || nextPosition < 0 || nextPosition >= ids.length) return false;
        var next = normalizeLibraryOrder(order, folders, index);
        var nextIds = next.entryIdsByFolder[folderId];
        var swap = nextIds[nextPosition];
        nextIds[nextPosition] = id;
        nextIds[position] = swap;
        return writeJSON(KEY_LIBRARY_ORDER, next);
    }

    function indexEntryOf(chord) {
        return {
            id: chord.id,
            chordName: chord.chordName,
            formName: chord.formName,
            shape: chord.shape,
            folderId: chord.folderId,
            fretRange: chord.fretRange,
            memo: chord.memo || '',
            keyContext: chord.keyContext || null,
            updatedAt: chord.updatedAt
        };
    }

    /** 保存コードを保存する（新規は id / createdAt を採番）。indexも同期する。 */
    function saveChord(chord) {
        var record = chord;
        var indexBefore = loadChordIndex();
        var folders = loadFolders();
        var orderBefore = libraryOrderInfo(folders, indexBefore).order;
        var previousEntry = null;
        var isNew = !record.id;
        indexBefore.forEach(function (entry) {
            if (record.id && entry.id === record.id) previousEntry = entry;
        });
        if (isNew) {
            record.id = 'cc_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
            record.createdAt = nowIso();
        }
        record.schemaVersion = 1;
        record.updatedAt = nowIso();
        if (!record.folderId) {
            record.folderId = UNCATEGORIZED_ID;
        }
        if (!writeJSON(chordKey(record.id), record)) return null;
        var index = indexBefore.filter(function (entry) {
            return entry.id !== record.id;
        });
        index.push(indexEntryOf(record));
        if (!writeChordIndex(index)) return null;

        var nextOrder = normalizeLibraryOrder(orderBefore, folders, index);
        Object.keys(nextOrder.entryIdsByFolder).forEach(function (folderId) {
            nextOrder.entryIdsByFolder[folderId] = nextOrder.entryIdsByFolder[folderId].filter(function (id) {
                return id !== record.id;
            });
        });
        var destination = nextOrder.entryIdsByFolder[record.folderId] || [];
        if (!isNew && previousEntry && previousEntry.folderId === record.folderId) {
            var previousIds = orderBefore.entryIdsByFolder[record.folderId] || [];
            var previousPosition = previousIds.indexOf(record.id);
            if (previousPosition < 0 || previousPosition > destination.length) previousPosition = destination.length;
            destination.splice(previousPosition, 0, record.id);
        } else {
            destination.unshift(record.id);
        }
        nextOrder.entryIdsByFolder[record.folderId] = destination;
        if (!saveNormalizedLibraryOrder(nextOrder, folders, index)) {
            console.warn('[ChordCruise.storage] chord saved but library order could not be saved');
        }
        return record;
    }

    function loadChord(id) {
        return readJSON(chordKey(id), null);
    }

    function deleteChord(id) {
        try {
            window.localStorage.removeItem(chordKey(id));
        } catch (err) {
            console.warn('[ChordCruise.storage] failed to remove chord: ' + id, err);
        }
        var nextIndex = loadChordIndex().filter(function (entry) {
            return entry.id !== id;
        });
        writeChordIndex(nextIndex);
        var folders = loadFolders();
        var order = libraryOrderInfo(folders, nextIndex).order;
        Object.keys(order.entryIdsByFolder).forEach(function (folderId) {
            order.entryIdsByFolder[folderId] = order.entryIdsByFolder[folderId].filter(function (entryId) {
                return entryId !== id;
            });
        });
        saveNormalizedLibraryOrder(order, folders, nextIndex);
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.storage = {
        UNCATEGORIZED_ID: UNCATEGORIZED_ID,
        ensureSchemaVersion: ensureSchemaVersion,
        getSettingsDefaults: getSettingsDefaults,
        loadSettings: loadSettings,
        saveSettings: saveSettings,
        loadFolders: loadFolders,
        saveFolders: saveFolders,
        createFolder: createFolder,
        renameFolder: renameFolder,
        copyFolder: copyFolder,
        setFolderColor: setFolderColor,
        folderColorKey: folderColorKey,
        FOLDER_COLOR_KEYS: FOLDER_COLOR_KEYS.slice(),
        deleteFolder: deleteFolder,
        loadChordIndex: loadChordIndex,
        loadLibraryOrder: loadLibraryOrder,
        loadOrderedFolders: loadOrderedFolders,
        loadOrderedChordIndex: loadOrderedChordIndex,
        moveFolder: moveFolder,
        moveChord: moveChord,
        saveChord: saveChord,
        loadChord: loadChord,
        deleteChord: deleteChord
    };
})();
