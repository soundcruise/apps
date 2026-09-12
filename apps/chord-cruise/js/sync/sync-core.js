(function (global) {
    'use strict';

    var APP_ID = 'chord';
    var APP_SCHEMA_VERSION = 1;
    var EXPORT_FORMAT_VERSION = 1;
    var PREFIX = 'chordCruise.';
    var KEY_SCHEMA_VERSION = PREFIX + 'schemaVersion';
    var KEY_SETTINGS = PREFIX + 'settings';
    var KEY_FOLDERS = PREFIX + 'folders';
    var KEY_LIBRARY_ORDER = PREFIX + 'libraryOrder';
    var CHORD_KEY_PREFIX = PREFIX + 'chord.';
    var RECORD_TYPES = ['settings', 'folder', 'chord', 'library_order'];
    var OMIT = {};

    function isPlainObject(value) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
        return Object.prototype.toString.call(value) === '[object Object]';
    }

    function isNonEmptyString(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }

    function normalizeJsonValue(value, inArray, stack) {
        if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) return null;
            return Object.is(value, -0) ? 0 : value;
        }
        if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
            return inArray ? null : OMIT;
        }
        if (typeof value === 'bigint') throw new TypeError('BigInt is not valid JSON');
        if (typeof value !== 'object') return inArray ? null : OMIT;
        if (stack.indexOf(value) !== -1) throw new TypeError('Cyclic data is not valid JSON');

        stack.push(value);
        var normalized;
        if (Array.isArray(value)) {
            normalized = value.map(function (item) {
                var next = normalizeJsonValue(item, true, stack);
                return next === OMIT ? null : next;
            });
        } else {
            normalized = {};
            Object.keys(value).sort().forEach(function (key) {
                var next = normalizeJsonValue(value[key], false, stack);
                if (next !== OMIT) normalized[key] = next;
            });
        }
        stack.pop();
        return normalized;
    }

    function canonicalValue(value) {
        var normalized = normalizeJsonValue(value, false, []);
        if (normalized === OMIT) return null;
        return normalized;
    }

    function canonicalJson(value) {
        return JSON.stringify(canonicalValue(value));
    }

    function cloneJson(value) {
        return JSON.parse(canonicalJson(value));
    }

    function recordKey(recordType, recordId) {
        return recordType + '/' + recordId;
    }

    function normalizeRecord(recordType, recordId, payload, schemaVersion) {
        if (RECORD_TYPES.indexOf(recordType) === -1) throw new TypeError('Unsupported record type');
        if (!isNonEmptyString(recordId) || recordId.length > 200) throw new TypeError('Invalid record id');
        if (!Number.isInteger(schemaVersion || APP_SCHEMA_VERSION) || (schemaVersion || APP_SCHEMA_VERSION) < 1) {
            throw new TypeError('Invalid schema version');
        }
        var normalizedPayload = canonicalValue(payload);
        if (!isPlainObject(normalizedPayload)) throw new TypeError('Record payload must be an object');
        if ((recordType === 'folder' || recordType === 'chord') && normalizedPayload.id !== recordId) {
            throw new TypeError('Record id does not match payload');
        }
        return {
            appId: APP_ID,
            recordType: recordType,
            recordId: recordId,
            schemaVersion: schemaVersion || APP_SCHEMA_VERSION,
            payload: normalizedPayload
        };
    }

    function semanticPayload(record) {
        var payload = cloneJson(record.payload);
        // These are local bookkeeping fields. They remain in the synchronized payload,
        // but do not create a conflict when the musical/user-visible data is identical.
        delete payload.createdAt;
        delete payload.updatedAt;
        return payload;
    }

    function bytesToHex(bytes) {
        return Array.prototype.map.call(bytes, function (byte) {
            return byte.toString(16).padStart(2, '0');
        }).join('');
    }

    async function sha256Text(text, cryptoImpl) {
        var cryptoObject = cryptoImpl || global.crypto;
        if (!cryptoObject || !cryptoObject.subtle || typeof cryptoObject.subtle.digest !== 'function') {
            throw new Error('Web Crypto SHA-256 is unavailable');
        }
        var data = new TextEncoder().encode(String(text));
        var digest = await cryptoObject.subtle.digest('SHA-256', data);
        return bytesToHex(new Uint8Array(digest));
    }

    async function hashRecord(record, cryptoImpl) {
        var normalized = normalizeRecord(
            record.recordType,
            record.recordId,
            record.payload,
            record.schemaVersion
        );
        return sha256Text(canonicalJson({
            appId: normalized.appId,
            recordType: normalized.recordType,
            recordId: normalized.recordId,
            schemaVersion: normalized.schemaVersion,
            payload: semanticPayload(normalized)
        }), cryptoImpl);
    }

    async function hashSyncPayload(recordType, recordId, payload, schemaVersion, cryptoImpl) {
        if (payload === null) {
            if (RECORD_TYPES.indexOf(recordType) === -1 || !isNonEmptyString(recordId)) {
                throw new TypeError('Invalid tombstone identity');
            }
            return sha256Text(canonicalJson({
                appId: APP_ID,
                recordType: recordType,
                recordId: recordId,
                schemaVersion: schemaVersion || APP_SCHEMA_VERSION,
                payload: null
            }), cryptoImpl);
        }
        return hashRecord({
            recordType: recordType,
            recordId: recordId,
            schemaVersion: schemaVersion || APP_SCHEMA_VERSION,
            payload: payload
        }, cryptoImpl);
    }

    async function deterministicUuid(value, cryptoImpl) {
        var hex = await sha256Text(String(value), cryptoImpl);
        var bytes = [];
        for (var index = 0; index < 32; index += 2) bytes.push(parseInt(hex.slice(index, index + 2), 16));
        bytes[6] = (bytes[6] & 0x0f) | 0x50;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        var uuidHex = bytes.map(function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
        return uuidHex.slice(0, 8) + '-' + uuidHex.slice(8, 12) + '-' + uuidHex.slice(12, 16) + '-' +
            uuidHex.slice(16, 20) + '-' + uuidHex.slice(20, 32);
    }

    function safeRead(storage, key, errors) {
        var raw;
        try {
            raw = storage.getItem(key);
        } catch (error) {
            errors.push({ key: key, code: 'read_failed' });
            return { exists: false, valid: false, value: null };
        }
        if (raw === null || raw === undefined) return { exists: false, valid: true, value: null };
        try {
            return { exists: true, valid: true, value: JSON.parse(raw) };
        } catch (error) {
            errors.push({ key: key, code: 'invalid_json' });
            return { exists: true, valid: false, value: null };
        }
    }

    function pushRecord(records, errors, recordType, recordId, payload, sourceKey, seen) {
        var key = recordKey(recordType, recordId);
        if (seen[key]) {
            errors.push({ key: sourceKey, code: 'duplicate_record_id' });
            return;
        }
        try {
            records.push(normalizeRecord(recordType, recordId, payload, APP_SCHEMA_VERSION));
            seen[key] = true;
        } catch (error) {
            errors.push({ key: sourceKey, code: 'invalid_record' });
        }
    }

    async function snapshotLocalStorage(storage, cryptoImpl) {
        if (!storage || typeof storage.getItem !== 'function') throw new TypeError('localStorage adapter is required');
        var errors = [];
        var records = [];
        var seen = Object.create(null);
        var schemaState = safeRead(storage, KEY_SCHEMA_VERSION, errors);
        var schemaVersion = Number(schemaState.value || APP_SCHEMA_VERSION);
        if (schemaVersion !== APP_SCHEMA_VERSION) {
            errors.push({ key: KEY_SCHEMA_VERSION, code: 'unsupported_schema' });
            schemaVersion = APP_SCHEMA_VERSION;
        }

        var settings = safeRead(storage, KEY_SETTINGS, errors);
        if (settings.exists && settings.valid && isPlainObject(settings.value)) {
            pushRecord(records, errors, 'settings', 'default', settings.value, KEY_SETTINGS, seen);
        } else if (settings.exists && settings.valid) {
            errors.push({ key: KEY_SETTINGS, code: 'invalid_record' });
        }

        var folders = safeRead(storage, KEY_FOLDERS, errors);
        if (folders.exists && folders.valid && Array.isArray(folders.value)) {
            folders.value.forEach(function (folder) {
                if (!isPlainObject(folder) || !isNonEmptyString(folder.id)) {
                    errors.push({ key: KEY_FOLDERS, code: 'invalid_record' });
                    return;
                }
                pushRecord(records, errors, 'folder', folder.id, folder, KEY_FOLDERS, seen);
            });
        } else if (folders.exists && folders.valid) {
            errors.push({ key: KEY_FOLDERS, code: 'invalid_record' });
        }

        var order = safeRead(storage, KEY_LIBRARY_ORDER, errors);
        if (order.exists && order.valid && isPlainObject(order.value)) {
            pushRecord(records, errors, 'library_order', 'default', order.value, KEY_LIBRARY_ORDER, seen);
        } else if (order.exists && order.valid) {
            errors.push({ key: KEY_LIBRARY_ORDER, code: 'invalid_record' });
        }

        var chordKeys = [];
        try {
            for (var index = 0; index < storage.length; index += 1) {
                var key = storage.key(index);
                if (typeof key === 'string' && key.indexOf(CHORD_KEY_PREFIX) === 0) chordKeys.push(key);
            }
        } catch (error) {
            errors.push({ key: CHORD_KEY_PREFIX + '*', code: 'enumeration_failed' });
        }
        chordKeys.sort().forEach(function (key) {
            var state = safeRead(storage, key, errors);
            var id = key.slice(CHORD_KEY_PREFIX.length);
            if (!state.valid || !state.exists) return;
            if (!isPlainObject(state.value) || state.value.id !== id) {
                errors.push({ key: key, code: 'invalid_record' });
                return;
            }
            pushRecord(records, errors, 'chord', id, state.value, key, seen);
        });

        records.sort(function (a, b) {
            return recordKey(a.recordType, a.recordId).localeCompare(recordKey(b.recordType, b.recordId));
        });
        var withHashes = await Promise.all(records.map(async function (record) {
            var next = cloneJson(record);
            next.payloadHash = await hashRecord(record, cryptoImpl);
            next.recordKey = recordKey(record.recordType, record.recordId);
            return next;
        }));
        var manifestRows = withHashes.map(function (record) {
            return { recordKey: record.recordKey, payloadHash: record.payloadHash };
        });
        var manifestHash = await sha256Text(canonicalJson({
            appId: APP_ID,
            schemaVersion: schemaVersion,
            records: manifestRows
        }), cryptoImpl);
        var counts = { total: withHashes.length, settings: 0, folder: 0, chord: 0, library_order: 0 };
        withHashes.forEach(function (record) { counts[record.recordType] += 1; });

        return {
            appId: APP_ID,
            schemaVersion: schemaVersion,
            records: withHashes,
            counts: counts,
            manifestHash: manifestHash,
            errors: errors
        };
    }

    function createExport(snapshot, now) {
        if (!snapshot || snapshot.appId !== APP_ID || !Array.isArray(snapshot.records)) {
            throw new TypeError('A Chord sync snapshot is required');
        }
        return {
            formatVersion: EXPORT_FORMAT_VERSION,
            appId: APP_ID,
            schemaVersion: snapshot.schemaVersion,
            exportedAt: new Date(typeof now === 'number' ? now : Date.now()).toISOString(),
            records: cloneJson(snapshot.records),
            manifestHash: snapshot.manifestHash
        };
    }

    global.ChordCruiseSync = global.ChordCruiseSync || {};
    global.ChordCruiseSync.core = Object.freeze({
        APP_ID: APP_ID,
        APP_SCHEMA_VERSION: APP_SCHEMA_VERSION,
        EXPORT_FORMAT_VERSION: EXPORT_FORMAT_VERSION,
        DB_NAME: 'soundCruiseSync',
        DB_VERSION: 1,
        RECORD_TYPES: RECORD_TYPES.slice(),
        canonicalValue: canonicalValue,
        canonicalJson: canonicalJson,
        cloneJson: cloneJson,
        recordKey: recordKey,
        normalizeRecord: normalizeRecord,
        hashRecord: hashRecord,
        hashSyncPayload: hashSyncPayload,
        deterministicUuid: deterministicUuid,
        sha256Text: sha256Text,
        snapshotLocalStorage: snapshotLocalStorage,
        createExport: createExport
    });
}(typeof window !== 'undefined' ? window : globalThis));
