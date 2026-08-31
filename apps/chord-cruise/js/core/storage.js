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
    var STANDARD_MAX_CUSTOM_FOLDERS = 3;
    var STANDARD_MAX_CHORDS_PER_FOLDER = 10;
    var lastError = null;
    var DEFAULT_HIGHLIGHTED_FRETS = [0, 3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
    var FOLDER_COLOR_KEYS = ['forest', 'burgundy', 'navy', 'umber', 'charcoal', 'teal', 'violet', 'russet', 'leather', 'black-leather', 'wine', 'black-gold', 'red', 'orange', 'yellow', 'green', 'blue', 'pink', 'pastel-pink', 'pastel-blue', 'pastel-purple', 'pastel-green', 'pastel-yellow', 'pastel-orange'];
    // Phase Dで公開する9種類を、保存設定でも正式値として扱う。
    // Object.keys() の列挙順には依存せず、UI側も同じ意図の並びを明示的に使う。
    var VALID_SCALE_TYPES = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'harmonic-minor', 'melodic-minor', 'locrian'];

    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function isNonEmptyId(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }

    function isIntegerInRange(value, min, max) {
        return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= min && value <= max;
    }

    function setLastError(code) {
        lastError = code || null;
    }

    function getLastError() {
        return lastError;
    }

    function hasFeature(featureName) {
        var featureAccess = window.ChordCruise && window.ChordCruise.featureAccess;
        if (featureAccess && typeof featureAccess.hasFeature === 'function') {
            return featureAccess.hasFeature(featureName);
        }
        // API未接続時も安全側のStandard制限を適用する。
        return false;
    }

    function hasUnlimitedLibraryAccess() {
        return hasFeature('unlimitedLibrary');
    }

    function folderCount(folders) {
        return folders.filter(function (folder) { return folder && folder.id; }).length;
    }

    function chordCountInFolder(index, folderId, excludedId) {
        return index.filter(function (entry) {
            return entry && entry.folderId === folderId && entry.id !== excludedId;
        }).length;
    }

    function getLibraryLimits() {
        var unlimited = hasUnlimitedLibraryAccess();
        return {
            unlimited: unlimited,
            maxCustomFolders: unlimited ? null : STANDARD_MAX_CUSTOM_FOLDERS,
            maxChordsPerFolder: unlimited ? null : STANDARD_MAX_CHORDS_PER_FOLDER
        };
    }

    var DEFAULT_SETTINGS = {
        selectedKey: 0,
        scaleType: 'major',
        chordToneMode: '3',
        fretboardDisplayMode: 'note',
        degreeNotationFormal: false,
        cagedTabAutoChange: true,
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
        librarySortMode: 'updatedDesc',
        // 新規保存画面だけで使うUI設定。保存コードのrecordには含めない。
        lastSaveFolderId: ''
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
        var normalized = getSettingsDefaults();
        var settingKey;
        if (isPlainObject(settings)) {
            for (settingKey in settings) {
                if (Object.prototype.hasOwnProperty.call(settings, settingKey)) {
                    normalized[settingKey] = settings[settingKey];
                }
            }
        }
        if (!isIntegerInRange(normalized.selectedKey, 0, 11)) {
            normalized.selectedKey = 0;
        }
        if (VALID_SCALE_TYPES.indexOf(normalized.scaleType) === -1) {
            normalized.scaleType = 'major';
        }
        if (['3', '7'].indexOf(normalized.chordToneMode) === -1) {
            normalized.chordToneMode = '3';
        }
        if (['note', 'solfege', 'degree', 'finger'].indexOf(normalized.fretboardDisplayMode) === -1) {
            normalized.fretboardDisplayMode = 'note';
        }
        if (['xsmall', 'small', 'medium', 'large', 'xlarge'].indexOf(normalized.chordNameSize) === -1) {
            normalized.chordNameSize = 'medium';
        }
        if (['xsmall', 'small', 'medium', 'large', 'xlarge'].indexOf(normalized.fretNumberSize) === -1) {
            normalized.fretNumberSize = 'medium';
        }
        if (['xsmall', 'small', 'medium', 'large', 'xlarge'].indexOf(normalized.fretboardMarkerLabelSize) === -1) {
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
        delete normalized.libraryCardChordNameSize;
        delete normalized.libraryCardFretNumberSize;
        delete normalized.libraryCardMarkerLabelSize;
        if (['all', 'position', 'custom'].indexOf(normalized.fretNumberHighlightMode) === -1) {
            normalized.fretNumberHighlightMode = 'all';
        }
        normalized.highlightedFrets = normalizeHighlightedFrets(normalized.highlightedFrets);
        normalized.highFretMode = normalized.highFretMode === true;
        normalized.degreeNotationFormal = normalized.degreeNotationFormal === true;
        normalized.cagedTabAutoChange = normalized.cagedTabAutoChange === true;
        delete normalized.cagedFormLocked;
        // 現行UIで並び替え方式は未提供。将来値を推測せず、現在の正式値だけを通す。
        if (normalized.librarySortMode !== 'updatedDesc') {
            normalized.librarySortMode = 'updatedDesc';
        }
        if (typeof normalized.lastSaveFolderId !== 'string') {
            normalized.lastSaveFolderId = '';
        }
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

    /** 欠損と破損を区別し、破損値を読み込みだけで上書きしないための状態読取。 */
    function readJSONState(key) {
        var raw;
        try {
            raw = window.localStorage.getItem(key);
        } catch (err) {
            return { exists: false, valid: false, value: null };
        }
        if (raw === null || raw === undefined) {
            return { exists: false, valid: true, value: null };
        }
        try {
            return { exists: true, valid: true, value: JSON.parse(raw) };
        } catch (err) {
            return { exists: true, valid: false, value: null };
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
        var current;
        try {
            current = window.localStorage.getItem(KEY_SCHEMA_VERSION);
        } catch (err) {
            return;
        }
        if (current === null || current === undefined) {
            writeJSON(KEY_SCHEMA_VERSION, '1');
        }
    }

    function loadSettings() {
        var stored = readJSON(KEY_SETTINGS, null);
        return normalizeSettings(stored);
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
        if (isPlainObject(partial)) {
            for (key in partial) {
                if (Object.prototype.hasOwnProperty.call(partial, key)) {
                    next[key] = partial[key];
                }
            }
        }
        return writeJSON(KEY_SETTINGS, normalizeSettings(next));
    }

    /** Chord Cruise自身が管理するlocalStorageキーだけを削除する。 */
    function clearChordCruiseData() {
        var snapshot = [];
        var index;
        try {
            for (index = 0; index < window.localStorage.length; index += 1) {
                var key = window.localStorage.key(index);
                if (typeof key === 'string' && key.indexOf(PREFIX) === 0) {
                    snapshot.push({ key: key, value: window.localStorage.getItem(key) });
                }
            }
            snapshot.forEach(function (entry) {
                window.localStorage.removeItem(entry.key);
            });
            return true;
        } catch (err) {
            snapshot.forEach(function (entry) {
                try { window.localStorage.setItem(entry.key, entry.value); } catch (restoreError) {}
            });
            console.warn('[ChordCruise.storage] failed to clear app data', err);
            return false;
        }
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

    /** 既存の任意fieldは保持し、一覧操作が直ちに必要とする最小契約だけを確認する。 */
    function isValidFolder(folder) {
        return isPlainObject(folder) && isNonEmptyId(folder.id) && typeof folder.name === 'string';
    }

    function isValidIndexEntry(entry) {
        return isPlainObject(entry) && isNonEmptyId(entry.id) && isNonEmptyId(entry.folderId);
    }

    function isValidChordNote(note) {
        return isPlainObject(note) && isIntegerInRange(note.string, 1, 6) &&
            typeof note.fret === 'number' && isFinite(note.fret) && Math.floor(note.fret) === note.fret && note.fret >= 0;
    }

    /**
     * 本棚・編集・描画へ渡すと即座に破綻するrecordだけを除外する。
     * legacy/custom/tension/未知fieldは必須化せず、そのまま保持する。
     */
    function isValidChordRecord(record) {
        if (!isPlainObject(record) || !isNonEmptyId(record.id) || !isNonEmptyId(record.folderId)) return false;
        if (typeof record.chordName !== 'string' || !Array.isArray(record.notes)) return false;
        if (!record.notes.every(isValidChordNote)) return false;
        if (record.intervals !== undefined && !Array.isArray(record.intervals)) return false;
        if (record.rootPc !== undefined && !isIntegerInRange(record.rootPc, 0, 11)) return false;
        if (record.schemaVersion !== undefined && (!isIntegerInRange(record.schemaVersion, 1, Number.MAX_SAFE_INTEGER || 9007199254740991))) return false;
        if (record.mutedStrings !== undefined && !Array.isArray(record.mutedStrings)) return false;
        return true;
    }

    function validatedUniqueItems(items, validator) {
        var seen = Object.create(null);
        return (Array.isArray(items) ? items : []).filter(function (item) {
            if (!validator(item) || seen[item.id]) return false;
            seen[item.id] = true;
            return true;
        });
    }

    function uniqueById(items) {
        return validatedUniqueItems(items, function (item) {
            return isPlainObject(item) && isNonEmptyId(item.id);
        });
    }

    function initialUncategorizedFolder() {
        return {
            id: UNCATEGORIZED_ID,
            name: '未分類',
            builtin: false,
            colorKey: defaultFolderColorKey(),
            order: 0,
            createdAt: nowIso(),
            updatedAt: nowIso()
        };
    }

    /**
     * 旧版の未分類フォルダだけを、通常フォルダとして一度だけ正規化する。
     * 空配列はユーザーが全フォルダを削除した有効な状態なので補充しない。
     */
    function normalizeUncategorizedFolder(folders) {
        var changed = false;
        var normalized = folders.map(function (folder) {
            if (!folder || folder.id !== UNCATEGORIZED_ID || folder.builtin !== true) return folder;
            var next = {};
            Object.keys(folder).forEach(function (key) { next[key] = folder[key]; });
            next.builtin = false;
            changed = true;
            return next;
        });
        return { folders: normalized, changed: changed };
    }

    function loadFolders() {
        var state = readJSONState(KEY_FOLDERS);
        if (!state.exists) {
            var initialFolders = [initialUncategorizedFolder()];
            if (state.valid) writeJSON(KEY_FOLDERS, initialFolders);
            return initialFolders;
        }
        if (!state.valid || !Array.isArray(state.value)) {
            console.warn('[ChordCruise.storage] invalid folders data; using a non-destructive fallback view');
            return [initialUncategorizedFolder()];
        }
        var normalized = normalizeUncategorizedFolder(state.value);
        var folders = validatedUniqueItems(normalized.folders, isValidFolder);
        // 従来のbuiltin移行は、配列全体が有効で重複もない場合だけ永続化する。
        // 破損memberを含むraw配列は読み込みだけで書き換えない。
        if (normalized.changed && folders.length === normalized.folders.length) {
            writeJSON(KEY_FOLDERS, normalized.folders);
        }
        return folders;
    }

    function saveFolders(folders) {
        return writeJSON(KEY_FOLDERS, folders);
    }

    function createFolder(name) {
        setLastError(null);
        var folders = loadFolders();
        if (!hasUnlimitedLibraryAccess() && folderCount(folders) >= STANDARD_MAX_CUSTOM_FOLDERS) {
            setLastError('standard-folder-limit');
            return null;
        }
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
        if (!saveFolders(folders)) {
            setLastError('storage-write-failed');
            return null;
        }
        orderBefore.folderIds = orderBefore.folderIds.filter(function (id) { return id !== folder.id; });
        orderBefore.folderIds.push(folder.id);
        orderBefore.entryIdsByFolder[folder.id] = [];
        if (!saveNormalizedLibraryOrder(orderBefore, folders, index)) {
            console.warn('[ChordCruise.storage] folder created but library order could not be saved');
        }
        return folder;
    }

    function renameFolder(id, name) {
        var folders = loadFolders();
        var changed = false;
        folders.forEach(function (folder) {
            if (folder.id === id) {
                folder.name = name;
                folder.updatedAt = nowIso();
                changed = true;
            }
        });
        if (!changed) return false;
        return saveFolders(folders);
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
        var restored = true;
        Object.keys(snapshot).forEach(function (key) {
            try {
                if (snapshot[key] === null) window.localStorage.removeItem(key);
                else window.localStorage.setItem(key, snapshot[key]);
            } catch (err) {
                restored = false;
                console.warn('[ChordCruise.storage] failed to roll back key: ' + key, err);
            }
        });
        return restored;
    }

    /** フォルダと所属コードを順序ごと複製する。書き込み失敗時は可能な限り復元する。 */
    function copyFolder(id) {
        setLastError(null);
        var folders = loadFolders();
        var storedIndex = loadStoredChordIndex();
        var index = loadChordIndex();
        var source = null;
        folders.forEach(function (folder) { if (folder.id === id) source = folder; });
        if (!source) return null;
        if (!hasUnlimitedLibraryAccess() && folderCount(folders) >= STANDARD_MAX_CUSTOM_FOLDERS) {
            setLastError('standard-folder-limit');
            return null;
        }
        var orderBefore = libraryOrderInfo(folders, index).order;
        var sourceIds = (orderBefore.entryIdsByFolder[id] || []).slice();
        if (!hasUnlimitedLibraryAccess() && sourceIds.length > STANDARD_MAX_CHORDS_PER_FOLDER) {
            setLastError('standard-folder-chord-limit');
            return null;
        }
        var existingFolderIds = {};
        var existingChordIds = {};
        folders.forEach(function (folder) { existingFolderIds[folder.id] = true; });
        storedIndex.forEach(function (entry) { existingChordIds[entry.id] = true; });
        index.forEach(function (entry) { existingChordIds[entry.id] = true; });
        var allRecordScan = scanStoredChordRecords();
        if (allRecordScan.available) {
            allRecordScan.records.forEach(function (record) { existingChordIds[record.id] = true; });
        }
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
        var copiedEntries = copiedChords.map(indexEntryOf);
        var nextStoredIndex = storedIndex.concat(copiedEntries);
        var nextOperationalIndex = index.concat(copiedEntries);
        var nextOrder = normalizeLibraryOrder(orderBefore, nextFolders, nextOperationalIndex);
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
            if (!writeChordIndex(nextStoredIndex)) throw new Error('index write failed');
            if (!saveFolders(nextFolders)) throw new Error('folder write failed');
            if (!writeJSON(KEY_LIBRARY_ORDER, normalizeLibraryOrder(nextOrder, nextFolders, nextOperationalIndex))) throw new Error('order write failed');
            return copiedFolder;
        } catch (err) {
            restoreKeys(snapshot);
            setLastError('storage-write-failed');
            return null;
        }
    }

    /** フォルダは所属コードごと完全に削除する。 */
    function deleteFolder(id) {
        var folders = loadFolders();
        var storedIndexBefore = loadStoredChordIndex();
        var indexBefore = loadChordIndex();
        var orderBefore = libraryOrderInfo(folders, indexBefore).order;
        var target = null;
        folders.forEach(function (folder) {
            if (folder.id === id) target = folder;
        });
        if (!target) {
            return false;
        }
        var recordScan = scanStoredChordRecords();
        var deletedRecordIds = [];
        if (recordScan.available) {
            recordScan.records.forEach(function (record) {
                if (record.folderId === id) deletedRecordIds.push(record.id);
            });
        } else {
            // 列挙不可時も従来のindexed record削除は継続し、アプリ操作を停止させない。
            indexBefore.forEach(function (entry) {
                var record = loadChord(entry.id);
                if (record && record.folderId === id && deletedRecordIds.indexOf(record.id) === -1) {
                    deletedRecordIds.push(record.id);
                }
            });
        }
        var nextFolders = folders.filter(function (folder) {
            return folder.id !== id;
        });
        var nextStoredIndex = storedIndexBefore.filter(function (entry) {
            return entry.folderId !== id && deletedRecordIds.indexOf(entry.id) === -1;
        });
        var nextOperationalIndex = indexBefore.filter(function (entry) {
            return entry.folderId !== id && deletedRecordIds.indexOf(entry.id) === -1;
        });
        var nextOrder = normalizeLibraryOrder(orderBefore, nextFolders, nextOperationalIndex);
        nextOrder.folderIds = nextOrder.folderIds.filter(function (folderId) { return folderId !== id; });
        delete nextOrder.entryIdsByFolder[id];
        var keys = [KEY_FOLDERS, KEY_CHORD_INDEX, KEY_LIBRARY_ORDER].concat(deletedRecordIds.map(chordKey));
        var snapshot = snapshotKeys(keys);
        try {
            if (!writeChordIndex(nextStoredIndex)) throw new Error('index write failed');
            if (!saveFolders(nextFolders)) throw new Error('folder write failed');
            if (!writeJSON(KEY_LIBRARY_ORDER, normalizeLibraryOrder(nextOrder, nextFolders, nextOperationalIndex))) throw new Error('order write failed');
            deletedRecordIds.forEach(function (entryId) { window.localStorage.removeItem(chordKey(entryId)); });
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

    /** raw indexを構造検証・重複除外しただけの永続metadata view。 */
    function loadStoredChordIndex() {
        var index = readJSON(KEY_CHORD_INDEX, null);
        return validatedUniqueItems(index, isValidIndexEntry);
    }

    /**
     * chordCruise.chord.* だけを列挙する。列挙APIのどこかが失敗した場合は、
     * 部分的なorphan判定を使わず全体を利用不可として返す。
     */
    function scanStoredChordRecords() {
        var keys = [];
        var length;
        var index;
        try {
            length = window.localStorage.length;
            if (!isIntegerInRange(length, 0, Number.MAX_SAFE_INTEGER || 9007199254740991) ||
                typeof window.localStorage.key !== 'function') {
                return { available: false, records: [] };
            }
            for (index = 0; index < length; index += 1) {
                var key = window.localStorage.key(index);
                if (typeof key === 'string' && key.indexOf(CHORD_KEY_PREFIX) === 0) keys.push(key);
            }
        } catch (err) {
            console.warn('[ChordCruise.storage] chord record enumeration is unavailable', err);
            return { available: false, records: [] };
        }

        var records = [];
        for (index = 0; index < keys.length; index += 1) {
            var raw;
            try {
                raw = window.localStorage.getItem(keys[index]);
            } catch (err) {
                console.warn('[ChordCruise.storage] chord record enumeration is unavailable', err);
                return { available: false, records: [] };
            }
            var record;
            try {
                record = raw === null || raw === undefined ? null : JSON.parse(raw);
            } catch (parseError) {
                continue;
            }
            var id = keys[index].slice(CHORD_KEY_PREFIX.length);
            if (isValidChordRecord(record) && record.id === id) records.push(record);
        }
        return { available: true, records: records };
    }

    /** record本体を優先しつつ、既存indexの未知metadataだけは失わない一時entry。 */
    function operationalIndexEntry(record, storedEntry) {
        var entry = {};
        if (isPlainObject(storedEntry)) {
            Object.keys(storedEntry).forEach(function (key) { entry[key] = storedEntry[key]; });
        }
        ['id', 'chordName', 'formName', 'shape', 'folderId', 'fretRange', 'memo', 'keyContext', 'updatedAt'].forEach(function (key) {
            if (Object.prototype.hasOwnProperty.call(record, key)) entry[key] = record[key];
        });
        // validator上必須なので、未知fieldだけのentryでも所属とIDは必ずrecord側を使う。
        entry.id = record.id;
        entry.folderId = record.folderId;
        return entry;
    }

    function buildOperationalChordIndex(storedIndex, folders, recordScan) {
        if (!recordScan.available) return storedIndex.slice();
        var folderIds = Object.create(null);
        var recordsById = Object.create(null);
        var included = Object.create(null);
        var result = [];
        folders.forEach(function (folder) { folderIds[folder.id] = true; });
        recordScan.records.forEach(function (record) { recordsById[record.id] = record; });

        storedIndex.forEach(function (entry) {
            var record = recordsById[entry.id];
            if (!record || !folderIds[record.folderId]) return;
            result.push(operationalIndexEntry(record, entry));
            included[record.id] = true;
        });
        recordScan.records.forEach(function (record) {
            if (included[record.id] || !folderIds[record.folderId]) return;
            result.push(operationalIndexEntry(record, null));
            included[record.id] = true;
        });
        return result;
    }

    /** Library・件数・上限が利用するrecord-backed operational view。 */
    function loadChordIndex() {
        return buildOperationalChordIndex(loadStoredChordIndex(), loadFolders(), scanStoredChordRecords());
    }

    function writeChordIndex(index) {
        return writeJSON(KEY_CHORD_INDEX, index);
    }

    // ---- コード本棚の並び順 ----

    function legacyFolderIds(folders) {
        return uniqueById(folders).map(function (folder, index) {
            return { folder: folder, index: index };
        }).sort(function (a, b) {
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
        if (delta !== -1 && delta !== 1) return false;
        var folders = loadFolders();
        var index = loadChordIndex();
        var order = libraryOrderInfo(folders, index).order;
        var position = order.folderIds.indexOf(id);
        var nextPosition = position + delta;
        if (position < 0 || nextPosition < 0 || nextPosition >= order.folderIds.length) return false;
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

    /**
     * 保存コードを保存する（新規は id / createdAt を採番）。関連キーを一括して同期する。
     * options.source は保存recordへ含めない一時的な保存元コンテキスト。
     */
    function saveChord(chord, options) {
        setLastError(null);
        if (!chord || typeof chord !== 'object') return null;
        if (options && options.source === 'custom' && !hasFeature('customChordSave')) {
            setLastError('custom-chord-save-pro-required');
            return null;
        }
        var record;
        try {
            record = JSON.parse(JSON.stringify(chord));
        } catch (err) {
            return null;
        }
        var storedIndexBefore = loadStoredChordIndex();
        var indexBefore = loadChordIndex();
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
        var folders = loadFolders();
        if (!record.folderId || !folders.some(function (folder) { return folder && folder.id === record.folderId; })) {
            setLastError('folder-required');
            return null;
        }
        var addsToDestination = isNew || !previousEntry || previousEntry.folderId !== record.folderId;
        if (!hasUnlimitedLibraryAccess() && addsToDestination &&
            chordCountInFolder(indexBefore, record.folderId, record.id) >= STANDARD_MAX_CHORDS_PER_FOLDER) {
            setLastError('standard-folder-chord-limit');
            return null;
        }
        var snapshot = null;
        try {
            snapshot = snapshotKeys([chordKey(record.id), KEY_CHORD_INDEX, KEY_LIBRARY_ORDER, KEY_FOLDERS]);
            var orderBefore = libraryOrderInfo(folders, indexBefore).order;
            if (!writeJSON(chordKey(record.id), record)) throw new Error('chord write failed');
            var storedIndex = storedIndexBefore.filter(function (entry) {
                return entry.id !== record.id;
            });
            storedIndex.push(indexEntryOf(record));
            if (!writeChordIndex(storedIndex)) throw new Error('index write failed');

            var operationalIndex = indexBefore.filter(function (entry) {
                return entry.id !== record.id;
            });
            operationalIndex.push(indexEntryOf(record));

            var nextOrder = normalizeLibraryOrder(orderBefore, folders, operationalIndex);
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
            if (!saveNormalizedLibraryOrder(nextOrder, folders, operationalIndex)) throw new Error('order write failed');
            return record;
        } catch (err) {
            if (snapshot && !restoreKeys(snapshot)) {
                console.warn('[ChordCruise.storage] chord save rollback was incomplete', err);
            }
            console.warn('[ChordCruise.storage] failed to save chord', err);
            setLastError('storage-write-failed');
            return null;
        }
    }

    function loadChord(id) {
        var record = readJSON(chordKey(id), null);
        return isValidChordRecord(record) && record.id === id ? record : null;
    }

    function deleteChord(id) {
        if (!id) return false;
        var recordKey = chordKey(id);
        var storedIndexBefore = loadStoredChordIndex();
        var indexBefore = loadChordIndex();
        var snapshot = null;
        try {
            snapshot = snapshotKeys([recordKey, KEY_CHORD_INDEX, KEY_LIBRARY_ORDER, KEY_FOLDERS]);
            var folders = loadFolders();
            var orderBefore = libraryOrderInfo(folders, indexBefore).order;
            var exists = snapshot[recordKey] !== null || storedIndexBefore.some(function (entry) {
                return entry.id === id;
            });
            Object.keys(orderBefore.entryIdsByFolder).forEach(function (folderId) {
                if (orderBefore.entryIdsByFolder[folderId].indexOf(id) !== -1) exists = true;
            });
            if (!exists) return false;

            window.localStorage.removeItem(recordKey);
            var nextStoredIndex = storedIndexBefore.filter(function (entry) {
                return entry.id !== id;
            });
            if (!writeChordIndex(nextStoredIndex)) throw new Error('index write failed');
            var nextOperationalIndex = indexBefore.filter(function (entry) {
                return entry.id !== id;
            });
            var nextOrder = normalizeLibraryOrder(orderBefore, folders, nextOperationalIndex);
            Object.keys(nextOrder.entryIdsByFolder).forEach(function (folderId) {
                nextOrder.entryIdsByFolder[folderId] = nextOrder.entryIdsByFolder[folderId].filter(function (entryId) {
                    return entryId !== id;
                });
            });
            if (!saveNormalizedLibraryOrder(nextOrder, folders, nextOperationalIndex)) throw new Error('order write failed');
            return true;
        } catch (err) {
            if (snapshot && !restoreKeys(snapshot)) {
                console.warn('[ChordCruise.storage] chord delete rollback was incomplete', err);
            }
            console.warn('[ChordCruise.storage] failed to delete chord: ' + id, err);
            return false;
        }
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.storage = {
        UNCATEGORIZED_ID: UNCATEGORIZED_ID,
        VALID_SCALE_TYPES: VALID_SCALE_TYPES.slice(),
        ensureSchemaVersion: ensureSchemaVersion,
        getSettingsDefaults: getSettingsDefaults,
        normalizeSettings: normalizeSettings,
        loadSettings: loadSettings,
        saveSettings: saveSettings,
        clearChordCruiseData: clearChordCruiseData,
        getLastError: getLastError,
        getLibraryLimits: getLibraryLimits,
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
