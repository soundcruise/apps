(function () {
    'use strict';

    var PREFIX = 'chordCruise.';
    var KEY_SCHEMA_VERSION = PREFIX + 'schemaVersion';
    var KEY_SETTINGS = PREFIX + 'settings';

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

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.storage = {
        ensureSchemaVersion: ensureSchemaVersion,
        loadSettings: loadSettings,
        saveSettings: saveSettings
    };
})();
