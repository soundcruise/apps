(function () {
    'use strict';

    var PREFIX = 'chordCruise.';
    var KEY_SCHEMA_VERSION = PREFIX + 'schemaVersion';
    var KEY_SETTINGS = PREFIX + 'settings';
    var KEY_FOLDERS = PREFIX + 'folders';
    var KEY_CHORD_INDEX = PREFIX + 'chords.index';
    var CHORD_KEY_PREFIX = PREFIX + 'chord.';
    var UNCATEGORIZED_ID = 'folder_uncategorized';
    var DEFAULT_HIGHLIGHTED_FRETS = [0, 3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

    var DEFAULT_SETTINGS = {
        selectedKey: 0,
        scaleType: 'major',
        chordToneMode: '3',
        fretboardDisplayMode: 'note',
        chordNameSize: 'medium',
        fretNumberSize: 'medium',
        fretNumberHighlightMode: 'all',
        highlightedFrets: DEFAULT_HIGHLIGHTED_FRETS,
        highFretMode: false,
        libraryColumns: 4,
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
        if ([1, 2, 3, 4].indexOf(normalized.libraryColumns) === -1) {
            normalized.libraryColumns = 4;
        }
        if (['all', 'position', 'custom'].indexOf(normalized.fretNumberHighlightMode) === -1) {
            normalized.fretNumberHighlightMode = 'all';
        }
        normalized.highlightedFrets = normalizeHighlightedFrets(normalized.highlightedFrets);
        normalized.highFretMode = normalized.highFretMode === true;
        return normalized;
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
        writeJSON(KEY_SETTINGS, normalizeSettings(next));
    }

    // ---- フォルダ ----

    function nowIso() {
        return new Date().toISOString();
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
        }
        return folders;
    }

    function saveFolders(folders) {
        return writeJSON(KEY_FOLDERS, folders);
    }

    function createFolder(name) {
        var folders = loadFolders();
        var maxOrder = 0;
        folders.forEach(function (folder) {
            if ((folder.order || 0) > maxOrder) maxOrder = folder.order || 0;
        });
        var folder = {
            id: 'folder_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
            name: name,
            builtin: false,
            order: maxOrder + 1,
            createdAt: nowIso(),
            updatedAt: nowIso()
        };
        folders.push(folder);
        return saveFolders(folders) ? folder : null;
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

    /** builtin フォルダは削除不可。中のコードは未分類へ移動する。 */
    function deleteFolder(id) {
        var folders = loadFolders();
        var target = null;
        folders.forEach(function (folder) {
            if (folder.id === id) target = folder;
        });
        if (!target || target.builtin) {
            return false;
        }
        loadChordIndex().forEach(function (entry) {
            if (entry.folderId === id) {
                var chord = loadChord(entry.id);
                if (chord) {
                    chord.folderId = UNCATEGORIZED_ID;
                    saveChord(chord);
                }
            }
        });
        saveFolders(folders.filter(function (folder) {
            return folder.id !== id;
        }));
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
        if (!record.id) {
            record.id = 'cc_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
            record.createdAt = nowIso();
        }
        record.schemaVersion = 1;
        record.updatedAt = nowIso();
        if (!record.folderId) {
            record.folderId = UNCATEGORIZED_ID;
        }
        if (!writeJSON(chordKey(record.id), record)) return null;
        var index = loadChordIndex().filter(function (entry) {
            return entry.id !== record.id;
        });
        index.push(indexEntryOf(record));
        return writeChordIndex(index) ? record : null;
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
        writeChordIndex(loadChordIndex().filter(function (entry) {
            return entry.id !== id;
        }));
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.storage = {
        UNCATEGORIZED_ID: UNCATEGORIZED_ID,
        ensureSchemaVersion: ensureSchemaVersion,
        loadSettings: loadSettings,
        saveSettings: saveSettings,
        loadFolders: loadFolders,
        saveFolders: saveFolders,
        createFolder: createFolder,
        renameFolder: renameFolder,
        deleteFolder: deleteFolder,
        loadChordIndex: loadChordIndex,
        saveChord: saveChord,
        loadChord: loadChord,
        deleteChord: deleteChord
    };
})();
