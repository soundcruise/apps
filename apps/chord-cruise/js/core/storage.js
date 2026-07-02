(function () {
    'use strict';

    var PREFIX = 'chordCruise.';
    var KEY_SCHEMA_VERSION = PREFIX + 'schemaVersion';
    var KEY_SETTINGS = PREFIX + 'settings';
    var KEY_FOLDERS = PREFIX + 'folders';
    var KEY_CHORD_INDEX = PREFIX + 'chords.index';
    var CHORD_KEY_PREFIX = PREFIX + 'chord.';
    var UNCATEGORIZED_ID = 'folder_uncategorized';

    var DEFAULT_SETTINGS = {
        selectedKey: 0,
        scaleType: 'major',
        chordToneMode: '3',
        fretboardDisplayMode: 'note',
        librarySortMode: 'updatedDesc'
    };

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
        } catch (err) {
            console.warn('[ChordCruise.storage] failed to write key: ' + key, err);
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
        return merged;
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
        writeJSON(KEY_SETTINGS, next);
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
        writeJSON(KEY_FOLDERS, folders);
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
        writeJSON(KEY_CHORD_INDEX, index);
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
        writeJSON(chordKey(record.id), record);
        var index = loadChordIndex().filter(function (entry) {
            return entry.id !== record.id;
        });
        index.push(indexEntryOf(record));
        writeChordIndex(index);
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
        loadChordIndex: loadChordIndex,
        saveChord: saveChord,
        loadChord: loadChord,
        deleteChord: deleteChord
    };
})();
