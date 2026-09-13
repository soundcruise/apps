(function (global) {
    'use strict';

    var sync = global.ChordCruiseSync || {};
    var core = sync.core;
    var database = sync.database;
    if (!core || !database) throw new Error('Sound Cruise Sync core and database must load before the client');

    var CREDENTIAL_PATTERN = /^scd1\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;
    var RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    var ENROLLMENT_PREFIX = 'SCE1';
    var RECOVERY_CLAIM_PATTERN = /^scr1\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;
    var DELETE_INTENT_PATTERN = /^sdi1\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;
    var RECORD_TYPES = core.RECORD_TYPES;
    var MAX_PUSH_OPERATIONS = 50;
    var MAX_PUSH_BODY_BYTES = 256 * 1024;
    var INITIAL_CURSOR = 'scc1.MA';
    var CURSOR_PATTERN = /^scc1\.[A-Za-z0-9_-]{1,32}$/;
    var MERGE_STAGES = ['planning', 'awaiting_confirmation', 'applying_local', 'pushing', 'verifying', 'complete', 'rollback_required', 'rolled_back'];

    function normalizePairingCode(value) {
        if (typeof value !== 'string') return null;
        var normalized = value.replace(/[\s-]/g, '');
        return /^\d{8}$/.test(normalized) ? normalized : null;
    }

    function formatPairingCode(value) {
        var normalized = normalizePairingCode(value);
        return normalized ? normalized.slice(0, 4) + ' ' + normalized.slice(4) : null;
    }

    function normalizeRecoveryCode(value) {
        if (typeof value !== 'string') return null;
        var normalized = value.toUpperCase().replace(/[\s-]/g, '');
        if (normalized.length !== 20) return null;
        for (var index = 0; index < normalized.length; index += 1) {
            if (RECOVERY_ALPHABET.indexOf(normalized[index]) === -1) return null;
        }
        return normalized;
    }

    function formatRecoveryCode(value) {
        var normalized = normalizeRecoveryCode(value);
        return normalized ? normalized.match(/.{4}/g).join('-') : null;
    }

    function normalizeEnrollmentCode(value) {
        if (typeof value !== 'string') return null;
        var compact = value.toUpperCase().replace(/[\s-]/g, '');
        if (compact.slice(0, ENROLLMENT_PREFIX.length) !== ENROLLMENT_PREFIX) return null;
        var code = compact.slice(ENROLLMENT_PREFIX.length);
        if (code.length !== 20) return null;
        for (var index = 0; index < code.length; index += 1) {
            if (RECOVERY_ALPHABET.indexOf(code[index]) === -1) return null;
        }
        return ENROLLMENT_PREFIX + code;
    }

    function automaticDeviceLabel() {
        var ua = (global.navigator && global.navigator.userAgent) || '';
        var standalone = Boolean((global.navigator && global.navigator.standalone) ||
            (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches));
        if (/iPhone/i.test(ua)) return standalone ? 'iPhone ホーム画面' : 'iPhone Safari';
        if (/iPad/i.test(ua)) return standalone ? 'iPad ホーム画面' : 'iPad Safari';
        if (/Android/i.test(ua)) return /Chrome/i.test(ua) ? 'Android Chrome' : 'Android ブラウザ';
        if (/Macintosh|Mac OS X/i.test(ua)) return /Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua) ? 'Mac Safari' : 'Mac ブラウザ';
        return 'この端末';
    }

    function isPositiveInteger(value) {
        return typeof value === 'number' && Number.isFinite(value) && Math.floor(value) === value && value > 0;
    }

    function utf8ByteLength(value) {
        return new TextEncoder().encode(value).byteLength;
    }

    function makeOperationId(cryptoImpl) {
        var cryptoObject = cryptoImpl || global.crypto;
        if (!cryptoObject || typeof cryptoObject.randomUUID !== 'function') {
            throw new Error('Web Crypto randomUUID is unavailable');
        }
        return cryptoObject.randomUUID();
    }

    function storageKey(recordType, recordId) {
        if (recordType === 'settings' && recordId === 'default') return 'chordCruise.settings';
        if (recordType === 'folder') return 'chordCruise.folders';
        if (recordType === 'chord') return 'chordCruise.chord.' + recordId;
        if (recordType === 'library_order' && recordId === 'default') return 'chordCruise.libraryOrder';
        return null;
    }

    function readJsonState(storage, key) {
        var raw;
        try { raw = storage.getItem(key); } catch (error) { return { exists: false, valid: false, value: null }; }
        if (raw === null || raw === undefined) return { exists: false, valid: true, value: null };
        try { return { exists: true, valid: true, value: JSON.parse(raw) }; } catch (error) {
            return { exists: true, valid: false, value: null };
        }
    }

    function createLocalAdapter(storage, cryptoImpl) {
        if (!storage || typeof storage.getItem !== 'function') throw new TypeError('localStorage is required');

        function getPayload(recordType, recordId) {
            var key = storageKey(recordType, recordId);
            if (!key) return null;
            var state = readJsonState(storage, key);
            if (!state.valid || !state.exists) return null;
            var value = state.value;
            if (recordType === 'folder') {
                if (!Array.isArray(value)) return null;
                for (var index = 0; index < value.length; index += 1) {
                    if (value[index] && value[index].id === recordId) return core.cloneJson(value[index]);
                }
                return null;
            }
            if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
            if (recordType === 'chord' && value.id !== recordId) return null;
            return core.cloneJson(value);
        }

        async function getRecord(recordType, recordId) {
            var payload = getPayload(recordType, recordId);
            if (!payload) return null;
            try {
                var record = core.normalizeRecord(recordType, recordId, payload, core.APP_SCHEMA_VERSION);
                record.recordKey = core.recordKey(recordType, recordId);
                record.payloadHash = await core.hashRecord(record, cryptoImpl);
                return record;
            } catch (error) {
                return null;
            }
        }


        async function getRecordState(recordType, recordId) {
            var key = storageKey(recordType, recordId);
            if (!key) return { exists: false, valid: false, record: null };
            var state = readJsonState(storage, key);
            if (!state.valid) return { exists: state.exists, valid: false, record: null };
            if (recordType === 'folder') {
                if (!state.exists) return { exists: false, valid: true, record: null };
                if (!Array.isArray(state.value)) return { exists: true, valid: false, record: null };
                var folder = null;
                for (var index = 0; index < state.value.length; index += 1) {
                    if (state.value[index] && state.value[index].id === recordId) folder = state.value[index];
                }
                if (!folder) return { exists: false, valid: true, record: null };
            }
            var record = await getRecord(recordType, recordId);
            if (!record && state.exists && recordType !== 'folder') return { exists: true, valid: false, record: null };
            return { exists: Boolean(record), valid: true, record: record };
        }

        function applyServerRecord(serverRecord) {
            if (!serverRecord || RECORD_TYPES.indexOf(serverRecord.recordType) === -1) {
                throw new TypeError('Invalid server record');
            }
            var key = storageKey(serverRecord.recordType, serverRecord.recordId);
            if (!key) throw new TypeError('Invalid server record key');
            var deleted = serverRecord.deletedAt != null;
            if (serverRecord.recordType === 'folder') {
                var foldersState = readJsonState(storage, key);
                if (!foldersState.valid || (foldersState.exists && !Array.isArray(foldersState.value))) {
                    throw new Error('Local folder storage is invalid');
                }
                var folders = foldersState.exists ? foldersState.value.slice() : [];
                var found = false;
                folders = folders.filter(function (folder) {
                    if (folder && folder.id === serverRecord.recordId) {
                        found = true;
                        return false;
                    }
                    return true;
                });
                if (!deleted) {
                    core.normalizeRecord('folder', serverRecord.recordId, serverRecord.payload, serverRecord.schemaVersion);
                    folders.push(core.cloneJson(serverRecord.payload));
                }
                storage.setItem(key, JSON.stringify(folders));
                return { changed: found || !deleted };
            }
            if (deleted) {
                storage.removeItem(key);
                return { changed: true };
            }
            core.normalizeRecord(serverRecord.recordType, serverRecord.recordId, serverRecord.payload, serverRecord.schemaVersion);
            storage.setItem(key, JSON.stringify(serverRecord.payload));
            return { changed: true };
        }

        return Object.freeze({
            getPayload: getPayload,
            getRecord: getRecord,
            getRecordState: getRecordState,
            applyServerRecord: applyServerRecord,
            snapshot: function () { return core.snapshotLocalStorage(storage, cryptoImpl); },
            createExport: async function (now) {
                return core.createExport(await core.snapshotLocalStorage(storage, cryptoImpl), now);
            }
        });
    }

    function normalizeEndpoint(endpoint) {
        var parsed;
        try { parsed = new URL(endpoint); } catch (error) { throw new TypeError('Invalid sync endpoint'); }
        if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
            throw new TypeError('Sync endpoint must use HTTPS');
        }
        parsed.pathname = parsed.pathname.replace(/\/$/, '');
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString().replace(/\/$/, '');
    }

    function createClient(options) {
        var config = options || {};
        var enabled = config.enabled === true;
        var storage = config.localStorage || global.localStorage;
        var cryptoImpl = config.crypto || global.crypto;
        var fetchImpl = config.fetch || global.fetch;
        var now = config.now || Date.now;
        var endpoint = normalizeEndpoint(config.endpoint || 'http://127.0.0.1:8787');
        var dbPromise = null;
        var adapter = storage ? createLocalAdapter(storage, cryptoImpl) : null;

        function mergeApi() {
            var api = global.ChordCruiseSync && global.ChordCruiseSync.merge;
            if (!api) throw new Error('Sound Cruise Sync merge planner is unavailable');
            return api;
        }

        function isManagedLocalKey(key) {
            return key === 'chordCruise.schemaVersion' || key === 'chordCruise.settings' ||
                key === 'chordCruise.folders' || key === 'chordCruise.libraryOrder' ||
                key === 'chordCruise.chords.index' || key.indexOf('chordCruise.chord.') === 0;
        }

        function captureManagedStorage() {
            var values = {};
            for (var index = 0; index < storage.length; index += 1) {
                var key = storage.key(index);
                if (typeof key === 'string' && isManagedLocalKey(key)) values[key] = storage.getItem(key);
            }
            return values;
        }

        function restoreManagedStorage(values) {
            var existing = [];
            for (var index = 0; index < storage.length; index += 1) {
                var key = storage.key(index);
                if (typeof key === 'string' && isManagedLocalKey(key)) existing.push(key);
            }
            existing.forEach(function (key) { storage.removeItem(key); });
            Object.keys(values || {}).forEach(function (key) {
                if (isManagedLocalKey(key)) storage.setItem(key, values[key]);
            });
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

        function applyFinalSnapshot(snapshot) {
            if (!snapshot || !Array.isArray(snapshot.records)) throw new TypeError('Final merge snapshot is required');
            var byType = { settings: [], folder: [], chord: [], library_order: [] };
            snapshot.records.forEach(function (record) { byType[record.recordType].push(record); });
            var currentChordKeys = [];
            for (var index = 0; index < storage.length; index += 1) {
                var key = storage.key(index);
                if (typeof key === 'string' && key.indexOf('chordCruise.chord.') === 0) currentChordKeys.push(key);
            }

            // Referential parents first; the derived index is rebuilt only after all
            // canonical chord records have been written.
            function setJsonIfChanged(key, value) {
                var serialized = JSON.stringify(value);
                if (storage.getItem(key) !== serialized) storage.setItem(key, serialized);
            }
            setJsonIfChanged('chordCruise.schemaVersion', core.APP_SCHEMA_VERSION);
            setJsonIfChanged('chordCruise.folders', byType.folder.map(function (record) { return record.payload; }));
            var desiredChords = Object.create(null);
            byType.chord.forEach(function (record) { desiredChords['chordCruise.chord.' + record.recordId] = record.payload; });
            currentChordKeys.forEach(function (key) {
                if (!Object.prototype.hasOwnProperty.call(desiredChords, key)) storage.removeItem(key);
            });
            Object.keys(desiredChords).forEach(function (key) {
                var next = JSON.stringify(desiredChords[key]);
                if (storage.getItem(key) !== next) storage.setItem(key, next);
            });
            if (byType.library_order[0]) setJsonIfChanged('chordCruise.libraryOrder', byType.library_order[0].payload);
            else storage.removeItem('chordCruise.libraryOrder');
            if (byType.settings[0]) setJsonIfChanged('chordCruise.settings', byType.settings[0].payload);
            else storage.removeItem('chordCruise.settings');
            setJsonIfChanged('chordCruise.chords.index', byType.chord.map(function (record) {
                return indexEntryOf(record.payload);
            }));
        }

        function verifyLocalGraph(finalSnapshot) {
            var folderIds = [];
            var chordById = Object.create(null);
            var expectedIndex = [];
            finalSnapshot.records.forEach(function (record) {
                if (record.recordType === 'folder') {
                    if (folderIds.indexOf(record.recordId) !== -1) throw new Error('duplicate_folder_id');
                    folderIds.push(record.recordId);
                }
            });
            finalSnapshot.records.forEach(function (record) {
                if (record.recordType === 'chord') {
                    if (chordById[record.recordId]) throw new Error('duplicate_chord_id');
                    chordById[record.recordId] = record;
                    if (folderIds.indexOf(record.payload.folderId) === -1) throw new Error('orphan_chord');
                    expectedIndex.push(indexEntryOf(record.payload));
                }
            });
            var orderState = readJsonState(storage, 'chordCruise.libraryOrder');
            var indexState = readJsonState(storage, 'chordCruise.chords.index');
            if (!orderState.valid || !orderState.exists || !indexState.valid || !indexState.exists) throw new Error('derived_state_invalid');
            var order = orderState.value;
            if (!Array.isArray(order.folderIds) || !order.entryIdsByFolder || typeof order.entryIdsByFolder !== 'object') throw new Error('order_invalid');
            if (new Set(order.folderIds).size !== order.folderIds.length || order.folderIds.length !== folderIds.length ||
                folderIds.some(function (id) { return order.folderIds.indexOf(id) === -1; })) throw new Error('folder_order_invalid');
            var orderedChordIds = [];
            order.folderIds.forEach(function (folderId) {
                var ids = order.entryIdsByFolder[folderId];
                if (!Array.isArray(ids)) throw new Error('entry_order_invalid');
                ids.forEach(function (id) {
                    if (!chordById[id] || chordById[id].payload.folderId !== folderId || orderedChordIds.indexOf(id) !== -1) {
                        throw new Error('entry_order_reference_invalid');
                    }
                    orderedChordIds.push(id);
                });
            });
            if (orderedChordIds.length !== Object.keys(chordById).length) throw new Error('entry_order_incomplete');
            var actualIndex = indexState.value.slice().sort(function (a, b) { return a.id.localeCompare(b.id); });
            expectedIndex.sort(function (a, b) { return a.id.localeCompare(b.id); });
            if (core.canonicalJson(actualIndex) !== core.canonicalJson(expectedIndex)) throw new Error('index_mismatch');
            return true;
        }

        function openStore() {
            if (!enabled) return Promise.reject(new Error('Sound Cruise Sync Pilot is disabled'));
            if (!dbPromise) dbPromise = database.open(config.indexedDB || global.indexedDB);
            return dbPromise;
        }

        async function initialize() {
            if (!enabled) return { enabled: false };
            var store = await openStore();
            var existingAppId = await store.getMeta('appId');
            if (existingAppId && existingAppId !== core.APP_ID) throw new Error('Unexpected sync app identity');
            await store.setMeta('appId', core.APP_ID, now());
            if (!(await store.getMeta('syncState'))) await store.setMeta('syncState', 'off', now());
            if (!(await store.getMeta('datasetState'))) await store.setMeta('datasetState', 'local_only', now());
            if (!(await store.getMeta('migrationState'))) await store.setMeta('migrationState', 'not_started', now());
            var mergeSessions = typeof store.listMergeSessions === 'function' ? await store.listMergeSessions() : [];
            for (var index = 0; index < mergeSessions.length; index += 1) {
                var session = mergeSessions[index];
                if (session.stage !== 'applying_local' && session.stage !== 'rollback_required') continue;
                var backup = typeof store.getBackup === 'function' ? await store.getBackup(session.backupId) : null;
                if (!backup || !backup.values) {
                    session.stage = 'rollback_required';
                    session.lastError = 'backup_missing';
                } else {
                    try {
                        restoreManagedStorage(backup.values);
                        session.stage = 'rolled_back';
                        session.rolledBackAt = now();
                    } catch (error) {
                        session.stage = 'rollback_required';
                        session.lastError = 'rollback_failed';
                    }
                }
                await store.putMergeSession(session);
            }
            return { enabled: true, database: store.name, version: store.version };
        }

        async function buildOperation(record, baseRevision, basePayload, deleted) {
            if (!record || RECORD_TYPES.indexOf(record.recordType) === -1 || typeof record.recordId !== 'string') {
                throw new TypeError('Invalid mutation record');
            }
            var schemaVersion = record.schemaVersion || core.APP_SCHEMA_VERSION;
            var normalized = deleted === true
                ? { recordType: record.recordType, recordId: record.recordId, schemaVersion: schemaVersion, payload: null }
                : core.normalizeRecord(record.recordType, record.recordId, record.payload, schemaVersion);
            var payloadHash = await core.hashSyncPayload(
                normalized.recordType, normalized.recordId, normalized.payload, schemaVersion, cryptoImpl
            );
            return {
                operationId: makeOperationId(cryptoImpl),
                appId: core.APP_ID,
                recordType: normalized.recordType,
                recordId: normalized.recordId,
                recordKey: core.recordKey(normalized.recordType, normalized.recordId),
                schemaVersion: schemaVersion,
                baseRevision: Number.isInteger(baseRevision) && baseRevision >= 0 ? baseRevision : 0,
                basePayload: basePayload ? core.cloneJson(basePayload) : null,
                payload: normalized.payload === null ? null : core.cloneJson(normalized.payload),
                payloadHash: payloadHash,
                deleted: deleted === true,
                localCommitted: false,
                createdAt: now(),
                retryCount: 0,
                nextRetryAt: 0
            };
        }

        async function queueLocalMutation(input, saveLocal) {
            if (!input || !input.record || typeof saveLocal !== 'function') throw new TypeError('Mutation and save callback are required');
            if (!enabled) return { enabled: false, localSaved: await Promise.resolve(saveLocal()) };
            var store = await openStore();
            var operation = await buildOperation(input.record, input.baseRevision, input.basePayload, input.deleted);
            await store.putOutbox(operation);

            var saved;
            try { saved = await Promise.resolve(saveLocal()); } catch (error) { saved = false; }
            if (!saved) {
                // The callback returned, so this is a known local failure rather than a
                // crash gap. Never leave a no-op operation that reconciliation could send.
                await store.deleteOutbox(operation.operationId);
                return { enabled: true, localSaved: false, operationId: operation.operationId };
            }

            var localRecord = await adapter.getRecord(operation.recordType, operation.recordId);
            var matches = operation.deleted ? localRecord === null : Boolean(localRecord && localRecord.payloadHash === operation.payloadHash);
            if (matches) {
                operation.localCommitted = true;
                await store.putOutbox(operation);
            }
            return {
                enabled: true,
                localSaved: true,
                committedForSync: matches,
                operationId: operation.operationId
            };
        }

        async function reconcile(options) {
            if (!enabled) return { enabled: false, committed: 0, discarded: 0, generated: 0 };
            var settings = options || {};
            var store = await openStore();
            var pending = await store.listOutbox();
            var committed = 0;
            var discarded = 0;
            var generated = 0;

            for (var index = 0; index < pending.length; index += 1) {
                var operation = pending[index];
                if (operation.localCommitted) continue;
                var localRecord = await adapter.getRecord(operation.recordType, operation.recordId);
                var matches = operation.deleted ? localRecord === null : Boolean(localRecord && localRecord.payloadHash === operation.payloadHash);
                if (matches) {
                    operation.localCommitted = true;
                    await store.putOutbox(operation);
                    committed += 1;
                } else {
                    await store.deleteOutbox(operation.operationId);
                    discarded += 1;
                }
            }

            if (settings.captureLocalDiffs !== true) {
                return { enabled: true, committed: committed, discarded: discarded, generated: generated };
            }

            var datasetState = await store.getMeta('datasetState');
            var migrationState = await store.getMeta('migrationState');
            if (datasetState !== 'ready' || migrationState !== 'complete') {
                return {
                    enabled: true,
                    committed: committed,
                    discarded: discarded,
                    generated: generated,
                    skipped: 'migration_not_ready'
                };
            }

            pending = await store.listOutbox();
            var activeByRecord = Object.create(null);
            pending.forEach(function (operation) {
                if (operation.localCommitted) activeByRecord[operation.recordKey] = true;
            });
            var snapshot = await adapter.snapshot();
            var shadowRecords = await store.listShadow();
            var shadowByRecord = Object.create(null);
            shadowRecords.forEach(function (shadow) { shadowByRecord[shadow.recordKey] = shadow; });

            for (index = 0; index < snapshot.records.length; index += 1) {
                var record = snapshot.records[index];
                if (activeByRecord[record.recordKey]) continue;
                var shadow = shadowByRecord[record.recordKey];
                if (shadow && shadow.deletedAt == null && shadow.payloadHash === record.payloadHash) continue;
                var created = await buildOperation(record, shadow ? shadow.revision : 0, shadow ? shadow.payload : null, false);
                created.localCommitted = true;
                await store.putOutbox(created);
                activeByRecord[record.recordKey] = true;
                generated += 1;
            }

            var localKeys = Object.create(null);
            snapshot.records.forEach(function (record) { localKeys[record.recordKey] = true; });
            for (index = 0; index < shadowRecords.length; index += 1) {
                var old = shadowRecords[index];
                if (old.deletedAt != null || localKeys[old.recordKey] || activeByRecord[old.recordKey]) continue;
                var deletedRecord = core.normalizeRecord(old.recordType, old.recordId, old.payload, core.APP_SCHEMA_VERSION);
                var deletion = await buildOperation(deletedRecord, old.revision, old.payload, true);
                deletion.localCommitted = true;
                await store.putOutbox(deletion);
                activeByRecord[old.recordKey] = true;
                generated += 1;
            }

            return { enabled: true, committed: committed, discarded: discarded, generated: generated };
        }

        async function saveShadow(records) {
            var store = await openStore();
            if (!Array.isArray(records)) throw new TypeError('Shadow records must be an array');
            for (var index = 0; index < records.length; index += 1) {
                var input = records[index];
                if (!input || RECORD_TYPES.indexOf(input.recordType) === -1 || !isPositiveInteger(input.revision)) {
                    throw new TypeError('Invalid shadow record');
                }
                var isDeleted = input.deletedAt != null;
                var payload = null;
                if (typeof input.payloadHash !== 'string' || input.payloadHash.length !== 64) {
                    throw new TypeError('Invalid shadow hash');
                }
                if (!isDeleted) {
                    var normalized = core.normalizeRecord(input.recordType, input.recordId, input.payload, core.APP_SCHEMA_VERSION);
                    var calculatedHash = await core.hashRecord(normalized, cryptoImpl);
                    if (input.payloadHash !== calculatedHash) throw new TypeError('Shadow hash mismatch');
                    payload = core.cloneJson(input.payload);
                } else {
                    var tombstoneHash = await core.hashSyncPayload(
                        input.recordType, input.recordId, null, core.APP_SCHEMA_VERSION, cryptoImpl
                    );
                    if (input.payloadHash !== tombstoneHash) throw new TypeError('Shadow tombstone hash mismatch');
                }
                await store.putShadow({
                    recordKey: core.recordKey(input.recordType, input.recordId),
                    recordType: input.recordType,
                    recordId: input.recordId,
                    revision: input.revision,
                    payload: payload,
                    payloadHash: input.payloadHash,
                    deletedAt: input.deletedAt == null ? null : input.deletedAt
                });
            }
            return true;
        }

        async function startIdentity(input) {
            if (!enabled) return { ok: false, code: 'pilot_disabled' };
            if (!fetchImpl) return { ok: false, code: 'network_unavailable' };
            var request = input || {};
            var snapshot = await adapter.snapshot();
            if (snapshot.errors.length) return { ok: false, code: 'snapshot_invalid', errors: snapshot.errors.length };
            var response;
            var enrollmentCode = request.enrollmentCode == null || request.enrollmentCode === ''
                ? null : normalizeEnrollmentCode(request.enrollmentCode);
            if (request.enrollmentCode && !enrollmentCode) return { ok: false, code: 'enrollment_invalid' };
            try {
                var startBody = {
                    appId: core.APP_ID,
                    turnstileToken: request.turnstileToken,
                    deviceLabel: request.deviceLabel || automaticDeviceLabel(),
                    initialSummary: {
                        schemaVersion: snapshot.schemaVersion,
                        recordCount: snapshot.counts.total,
                        manifestHash: snapshot.manifestHash
                    }
                };
                if (enrollmentCode) startBody.enrollmentCode = enrollmentCode;
                response = await fetchImpl(endpoint + '/v1/sync/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    cache: 'no-store',
                    body: JSON.stringify(startBody)
                });
            } catch (error) {
                return { ok: false, code: 'network_error' };
            }
            var body;
            try { body = await response.json(); } catch (error) { return { ok: false, code: 'invalid_response' }; }
            if (!response.ok || !body || body.ok !== true) return { ok: false, code: body && body.code ? body.code : 'start_failed' };
            if (body.appId !== core.APP_ID || body.datasetState !== 'initializing' ||
                typeof body.deviceId !== 'string' || !CREDENTIAL_PATTERN.test(body.deviceCredential || '') ||
                !normalizeRecoveryCode(body.recoveryCode) || body.recoveryVersion !== 1) {
                return { ok: false, code: 'invalid_response' };
            }
            var store = await openStore();
            await store.setMeta('deviceCredential', {
                deviceId: body.deviceId,
                credential: body.deviceCredential,
                credentialVersion: 1,
                createdAt: now()
            }, now());
            await store.setMeta('syncState', 'provisioning', now());
            await store.setMeta('datasetState', 'initializing', now());
            await store.setMeta('migrationState', 'not_started', now());
            var bookmark = response.headers && response.headers.get ? response.headers.get('X-D1-Bookmark') : null;
            if (bookmark) await store.setMeta('d1Bookmark', bookmark, now());
            return {
                ok: true, appId: core.APP_ID, deviceId: body.deviceId, datasetState: body.datasetState,
                recoveryCode: normalizeRecoveryCode(body.recoveryCode),
                displayRecoveryCode: formatRecoveryCode(body.recoveryCode),
                recoveryVersion: body.recoveryVersion
            };
        }

        async function authenticatedRequest(method, path, body) {
            if (!fetchImpl) return { ok: false, code: 'network_unavailable', retryable: true };
            var store = await openStore();
            var credentialMeta = await store.getMeta('deviceCredential');
            if (!credentialMeta || !CREDENTIAL_PATTERN.test(credentialMeta.credential || '')) {
                return { ok: false, code: 'credential_missing', retryable: false };
            }
            var headers = { 'Authorization': 'Bearer ' + credentialMeta.credential };
            if (body !== undefined) headers['Content-Type'] = 'application/json';
            var bookmark = await store.getMeta('d1Bookmark');
            if (typeof bookmark === 'string' && bookmark) headers['X-D1-Bookmark'] = bookmark;
            var response;
            try {
                response = await fetchImpl(endpoint + path, {
                    method: method,
                    headers: headers,
                    cache: 'no-store',
                    body: body === undefined ? undefined : JSON.stringify(body)
                });
            } catch (error) {
                return { ok: false, code: 'network_error', retryable: true };
            }
            var responseBody;
            try { responseBody = await response.json(); } catch (error) {
                return { ok: false, code: 'invalid_response', retryable: response.status >= 500 };
            }
            var code = responseBody && responseBody.code ? responseBody.code : (response.ok ? null : 'request_failed');
            var requestCategory = path.indexOf('/v1/sync/push') === 0 || path.indexOf('/v1/sync/migration/complete') === 0
                ? 'write'
                : path.indexOf('/v1/sync/changes') === 0 || path.indexOf('/v1/sync/snapshot') === 0
                    ? 'read'
                    : path.indexOf('/v1/sync/pairing-codes') === 0
                        ? 'admission'
                        : path.indexOf('/v1/sync/recovery-codes') === 0
                            ? 'recovery'
                            : path.indexOf('/v1/sync/account') === 0
                                ? 'cloud_delete' : null;
            var gateCategory = code === 'sync_write_paused' ? 'write'
                : code === 'sync_read_paused' ? 'read'
                    : code === 'sync_admission_paused' ? 'admission'
                        : code === 'sync_recovery_paused' ? 'recovery'
                            : code === 'sync_cloud_delete_paused' ? 'cloud_delete'
                                : code === 'rollout_control_unavailable' ? requestCategory || 'control' : null;
            if (gateCategory) {
                await store.setMeta('runtimePause', { category: gateCategory, code: code, observedAt: now() }, now());
            } else if (response.ok) {
                var currentPause = await store.getMeta('runtimePause');
                if (requestCategory && currentPause && currentPause.category === requestCategory) {
                    await store.setMeta('runtimePause', null, now());
                }
            }
            return {
                ok: response.ok && responseBody && responseBody.ok === true,
                status: response.status,
                code: code,
                retryable: !gateCategory && (response.status === 429 || response.status >= 500),
                body: responseBody,
                bookmark: response.headers && response.headers.get ? response.headers.get('X-D1-Bookmark') : null
            };
        }

        async function issuePairingCode() {
            if (!enabled) return { ok: false, code: 'pilot_disabled' };
            var response = await authenticatedRequest('POST', '/v1/sync/pairing-codes', { appId: core.APP_ID });
            if (!response.ok) return { ok: false, code: response.code || 'pairing_issue_failed' };
            var code = normalizePairingCode(response.body && response.body.pairingCode);
            if (!code || !Number.isFinite(response.body.expiresAt)) return { ok: false, code: 'invalid_response' };
            return { ok: true, pairingCode: code, displayCode: formatPairingCode(code), expiresAt: response.body.expiresAt };
        }

        async function pairWithCode(input) {
            if (!enabled) return { ok: false, code: 'pilot_disabled' };
            if (!fetchImpl) return { ok: false, code: 'network_unavailable' };
            var request = input || {};
            var code = normalizePairingCode(request.pairingCode);
            if (!code || typeof request.turnstileToken !== 'string' || !request.turnstileToken) {
                return { ok: false, code: 'invalid_request' };
            }
            var snapshot = await adapter.snapshot();
            if (snapshot.errors.length) return { ok: false, code: 'snapshot_invalid', errors: snapshot.errors.length };
            var response;
            try {
                response = await fetchImpl(endpoint + '/v1/sync/pair', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    cache: 'no-store',
                    body: JSON.stringify({
                        appId: core.APP_ID,
                        pairingCode: code,
                        turnstileToken: request.turnstileToken,
                        deviceLabel: request.deviceLabel || automaticDeviceLabel()
                    })
                });
            } catch (error) { return { ok: false, code: 'network_error' }; }
            var body;
            try { body = await response.json(); } catch (error) { return { ok: false, code: 'invalid_response' }; }
            if (!response.ok || !body || body.ok !== true) return { ok: false, code: body && body.code ? body.code : 'pair_failed' };
            if (body.appId !== core.APP_ID || body.datasetState !== 'remote_pending' ||
                typeof body.deviceId !== 'string' || !CREDENTIAL_PATTERN.test(body.deviceCredential || '')) {
                return { ok: false, code: 'invalid_response' };
            }
            var store = await openStore();
            var localState = mergeApi().hasMeaningfulLocalData(snapshot) ? 'local_data_pending_merge' : 'empty';
            var bookmark = response.headers && response.headers.get ? response.headers.get('X-D1-Bookmark') : null;
            try {
                await store.setMetaBatch([
                    { key: 'deviceCredential', value: { deviceId: body.deviceId, credential: body.deviceCredential, credentialVersion: 1, createdAt: now() } },
                    { key: 'syncState', value: 'paired_pending' },
                    { key: 'datasetState', value: 'remote_pending' },
                    { key: 'migrationState', value: 'pair_pending' },
                    { key: 'pairingLocalState', value: localState },
                    { key: 'd1Bookmark', value: bookmark || null }
                ], now());
            } catch (error) {
                // The response code is consumed and cannot safely be replayed. The
                // server marks this device pending; an unclaimed pending device is
                // opportunistically purged after 15 minutes on the next pair flow.
                return { ok: false, code: 'client_storage_failed', pairedOnServer: true };
            }
            return { ok: true, appId: core.APP_ID, deviceId: body.deviceId, localState: localState };
        }

        async function prepareRecovery(input) {
            if (!enabled) return { ok: false, code: 'pilot_disabled' };
            if (!fetchImpl) return { ok: false, code: 'network_unavailable' };
            var request = input || {};
            var recoveryCode = normalizeRecoveryCode(request.recoveryCode);
            if (!recoveryCode || typeof request.turnstileToken !== 'string' || !request.turnstileToken) {
                return { ok: false, code: 'invalid_request' };
            }
            var snapshot = await adapter.snapshot();
            if (snapshot.errors.length) return { ok: false, code: 'snapshot_invalid', errors: snapshot.errors.length };
            var response;
            try {
                response = await fetchImpl(endpoint + '/v1/sync/recover', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    cache: 'no-store',
                    body: JSON.stringify({
                        operation: 'prepare',
                        appId: core.APP_ID,
                        recoveryCode: recoveryCode,
                        turnstileToken: request.turnstileToken,
                        deviceLabel: request.deviceLabel || automaticDeviceLabel()
                    })
                });
            } catch (error) { return { ok: false, code: 'network_error' }; }
            var body;
            try { body = await response.json(); } catch (error) { return { ok: false, code: 'invalid_response' }; }
            if (!response.ok || !body || body.ok !== true) {
                return { ok: false, code: body && body.code ? body.code : 'recovery_failed' };
            }
            var nextCode = normalizeRecoveryCode(body.recoveryCode);
            var summary = body.summary;
            var summaryKeys = summary && typeof summary === 'object' ? Object.keys(summary).sort() : [];
            var expectedSummaryKeys = ['activeDeviceCount', 'appId', 'chordCount', 'folderCount', 'recordCount', 'updatedAt'];
            if (body.operation !== 'prepared' || body.appId !== core.APP_ID ||
                !RECOVERY_CLAIM_PATTERN.test(body.claimToken || '') ||
                !CREDENTIAL_PATTERN.test(body.deviceCredential || '') ||
                typeof body.deviceId !== 'string' || !nextCode || !Number.isFinite(body.expiresAt) ||
                summaryKeys.length !== expectedSummaryKeys.length ||
                summaryKeys.some(function (key, index) { return key !== expectedSummaryKeys[index]; }) ||
                summary.appId !== core.APP_ID ||
                !Number.isInteger(summary.recordCount) || summary.recordCount < 0 ||
                !Number.isInteger(summary.chordCount) || summary.chordCount < 0 ||
                !Number.isInteger(summary.folderCount) || summary.folderCount < 0 ||
                !Number.isInteger(summary.activeDeviceCount) || summary.activeDeviceCount < 0 ||
                !Number.isFinite(summary.updatedAt) || summary.updatedAt < 0) {
                return { ok: false, code: 'invalid_response' };
            }
            return {
                ok: true,
                claimToken: body.claimToken,
                expiresAt: body.expiresAt,
                deviceId: body.deviceId,
                deviceCredential: body.deviceCredential,
                recoveryCode: nextCode,
                displayRecoveryCode: formatRecoveryCode(nextCode),
                summary: {
                    appId: summary.appId,
                    recordCount: summary.recordCount,
                    chordCount: summary.chordCount,
                    folderCount: summary.folderCount,
                    updatedAt: summary.updatedAt,
                    activeDeviceCount: summary.activeDeviceCount
                },
                localState: mergeApi().hasMeaningfulLocalData(snapshot) ? 'local_data_pending_merge' : 'empty'
            };
        }

        async function requestWithCredential(credential, path) {
            if (!fetchImpl || !CREDENTIAL_PATTERN.test(credential || '')) return { ok: false, code: 'credential_missing' };
            var response;
            try {
                response = await fetchImpl(endpoint + path, {
                    method: 'GET',
                    headers: { Authorization: 'Bearer ' + credential },
                    cache: 'no-store'
                });
            } catch (error) { return { ok: false, code: 'network_error', retryable: true }; }
            var body;
            try { body = await response.json(); } catch (error) { return { ok: false, code: 'invalid_response' }; }
            return { ok: response.ok && body && body.ok === true, status: response.status, body: body };
        }

        async function promoteRecoveredCredential(store, pending, bookmark) {
            await store.setMetaBatch([
                { key: 'deviceCredential', value: {
                    deviceId: pending.deviceId,
                    credential: pending.deviceCredential,
                    credentialVersion: 1,
                    createdAt: pending.createdAt
                } },
                { key: 'syncState', value: 'paired_pending' },
                { key: 'datasetState', value: 'remote_pending' },
                { key: 'migrationState', value: 'pair_pending' },
                { key: 'pairingLocalState', value: pending.localState },
                { key: 'd1Bookmark', value: bookmark || null },
                { key: 'pendingRecovery', value: null }
            ], now());
            return { ok: true, appId: core.APP_ID, deviceId: pending.deviceId, localState: pending.localState };
        }

        async function commitRecovery(prepared) {
            if (!enabled) return { ok: false, code: 'pilot_disabled' };
            if (!prepared || !RECOVERY_CLAIM_PATTERN.test(prepared.claimToken || '') ||
                !CREDENTIAL_PATTERN.test(prepared.deviceCredential || '') || typeof prepared.deviceId !== 'string') {
                return { ok: false, code: 'invalid_request' };
            }
            var store = await openStore();
            var pending = {
                claimToken: prepared.claimToken,
                deviceId: prepared.deviceId,
                deviceCredential: prepared.deviceCredential,
                localState: prepared.localState === 'empty' ? 'empty' : 'local_data_pending_merge',
                createdAt: now(),
                expiresAt: prepared.expiresAt
            };
            try {
                // This durable write is deliberately before the destructive server
                // commit. If it fails, the old devices and recovery code remain valid.
                await store.setMeta('pendingRecovery', pending, now());
            } catch (error) {
                return { ok: false, code: 'client_storage_failed', serverUnchanged: true };
            }
            return resumeRecovery(pending);
        }

        async function resumeRecovery(providedPending) {
            if (!enabled) return { ok: false, code: 'pilot_disabled' };
            var store = await openStore();
            var pending = providedPending || await store.getMeta('pendingRecovery');
            if (!pending || !RECOVERY_CLAIM_PATTERN.test(pending.claimToken || '') ||
                !CREDENTIAL_PATTERN.test(pending.deviceCredential || '')) {
                return { ok: false, code: 'recovery_pending_missing' };
            }
            // A previous commit response may have been lost. Authenticate the
            // already-persisted candidate first; success proves the atomic commit.
            var proof = await requestWithCredential(
                pending.deviceCredential,
                '/v1/sync/snapshot?appId=' + encodeURIComponent(core.APP_ID)
            );
            if (proof.ok) return promoteRecoveredCredential(store, pending, null);
            var response;
            try {
                response = await fetchImpl(endpoint + '/v1/sync/recover', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    cache: 'no-store',
                    body: JSON.stringify({ operation: 'commit', appId: core.APP_ID, claimToken: pending.claimToken })
                });
            } catch (error) {
                proof = await requestWithCredential(
                    pending.deviceCredential,
                    '/v1/sync/snapshot?appId=' + encodeURIComponent(core.APP_ID)
                );
                if (proof.ok) return promoteRecoveredCredential(store, pending, null);
                return { ok: false, code: 'recovery_uncertain', resumable: true };
            }
            var body;
            try { body = await response.json(); } catch (error) {
                return { ok: false, code: 'recovery_uncertain', resumable: true };
            }
            if (response.ok && body && body.ok === true && body.operation === 'committed' &&
                body.appId === core.APP_ID && body.deviceId === pending.deviceId) {
                var bookmark = response.headers && response.headers.get ? response.headers.get('X-D1-Bookmark') : null;
                return promoteRecoveredCredential(store, pending, bookmark);
            }
            proof = await requestWithCredential(
                pending.deviceCredential,
                '/v1/sync/snapshot?appId=' + encodeURIComponent(core.APP_ID)
            );
            if (proof.ok) return promoteRecoveredCredential(store, pending, null);
            if (response.status >= 500 || response.status === 429) {
                return { ok: false, code: 'recovery_uncertain', resumable: true };
            }
            await store.setMeta('pendingRecovery', null, now());
            return { ok: false, code: body && body.code ? body.code : 'recovery_failed' };
        }

        async function regenerateRecoveryCode() {
            if (!enabled) return { ok: false, code: 'pilot_disabled' };
            var response = await authenticatedRequest('POST', '/v1/sync/recovery-codes', { appId: core.APP_ID });
            if (!response.ok) return { ok: false, code: response.code || 'recovery_rotation_failed' };
            var code = normalizeRecoveryCode(response.body && response.body.recoveryCode);
            if (!code || !Number.isInteger(response.body.recoveryVersion) || response.body.recoveryVersion < 2) {
                return { ok: false, code: 'invalid_response' };
            }
            return {
                ok: true,
                recoveryCode: code,
                displayRecoveryCode: formatRecoveryCode(code),
                recoveryVersion: response.body.recoveryVersion
            };
        }

        async function listDevices() {
            if (!enabled) return { ok: false, code: 'pilot_disabled' };
            var response = await authenticatedRequest('GET', '/v1/sync/devices?appId=' + encodeURIComponent(core.APP_ID));
            if (!response.ok || !Array.isArray(response.body && response.body.devices)) {
                return { ok: false, code: response.code || 'device_list_failed' };
            }
            var devices = response.body.devices.filter(function (device) {
                return device && typeof device.deviceId === 'string' && typeof device.appId === 'string' &&
                    typeof device.createdAt === 'number' && typeof device.lastSeenAt === 'number' &&
                    typeof device.isCurrent === 'boolean';
            });
            return { ok: true, devices: devices };
        }

        async function pendingOutboxCount() {
            var store = await openStore();
            return (await store.listOutbox()).filter(function (operation) { return operation && operation.localCommitted; }).length;
        }

        async function clearCloudState() {
            var store = await openStore();
            if (typeof store.clearCloudState !== 'function') return { ok: false, code: 'client_storage_failed' };
            try {
                await store.clearCloudState();
                return { ok: true };
            } catch (error) { return { ok: false, code: 'client_storage_failed' };
            }
        }

        async function revokeDevice(deviceId) {
            if (!enabled || typeof deviceId !== 'string') return { ok: false, code: 'invalid_request' };
            var response = await authenticatedRequest('POST', '/v1/sync/devices/revoke', { appId: core.APP_ID, deviceId: deviceId });
            if (!response.ok) return { ok: false, code: response.code || 'device_revoke_failed' };
            var current = Boolean(response.body && response.body.isCurrent);
            if (!current) return { ok: true, current: false };
            var cleared = await clearCloudState();
            return cleared.ok ? { ok: true, current: true } : { ok: false, code: cleared.code, revoked: true, current: true };
        }

        async function disconnectCurrentDevice() {
            var store = await openStore();
            var credential = await store.getMeta('deviceCredential');
            if (!credential || typeof credential.deviceId !== 'string') return { ok: false, code: 'credential_missing' };
            return revokeDevice(credential.deviceId);
        }

        async function prepareAccountDelete() {
            if (!enabled) return { ok: false, code: 'pilot_disabled' };
            var response = await authenticatedRequest('POST', '/v1/sync/account/delete-intent', { appId: core.APP_ID });
            if (!response.ok || !DELETE_INTENT_PATTERN.test(response.body && response.body.intentToken || '') ||
                !Number.isFinite(response.body && response.body.expiresAt)) {
                return { ok: false, code: response.code || 'delete_intent_failed' };
            }
            return { ok: true, intentToken: response.body.intentToken, expiresAt: response.body.expiresAt };
        }

        async function commitAccountDelete(prepared) {
            if (!enabled || !prepared || !DELETE_INTENT_PATTERN.test(prepared.intentToken || '')) {
                return { ok: false, code: 'invalid_request' };
            }
            var store = await openStore();
            try { await store.setMeta('pendingAccountDelete', { intentToken: prepared.intentToken, expiresAt: prepared.expiresAt, createdAt: now() }, now()); }
            catch (error) { return { ok: false, code: 'client_storage_failed', serverUnchanged: true }; }
            return resumeAccountDelete();
        }

        async function resumeAccountDelete() {
            if (!enabled) return { ok: false, code: 'pilot_disabled' };
            var store = await openStore();
            var pending = await store.getMeta('pendingAccountDelete');
            if (!pending || !DELETE_INTENT_PATTERN.test(pending.intentToken || '')) return { ok: false, code: 'delete_pending_missing' };
            var response = await authenticatedRequest('DELETE', '/v1/sync/account', { appId: core.APP_ID, intentToken: pending.intentToken });
            if (!response.ok || !response.body || response.body.deleted !== true) {
                return { ok: false, code: response.code || 'delete_uncertain', resumable: response.retryable === true };
            }
            var cleared = await clearCloudState();
            return cleared.ok ? { ok: true, deleted: true } : { ok: false, code: cleared.code, deleted: true };
        }

        function retryDelay(retryCount) {
            return Math.min(5 * 60 * 1000, 1000 * Math.pow(2, Math.min(retryCount, 8)));
        }

        async function markRetry(store, operations, code) {
            for (var index = 0; index < operations.length; index += 1) {
                var operation = operations[index];
                operation.retryCount = (operation.retryCount || 0) + 1;
                operation.nextRetryAt = now() + retryDelay(operation.retryCount - 1);
                operation.lastError = code || 'network_error';
                await store.putOutbox(operation);
            }
        }

        async function markPaused(store, operations, code) {
            for (var index = 0; index < operations.length; index += 1) {
                var operation = operations[index];
                operation.nextRetryAt = now() + 5 * 60 * 1000;
                operation.lastError = code;
                await store.putOutbox(operation);
            }
        }

        async function validatedServerRecord(input, expectedOperation, requireAcknowledgement) {
            if (!input) throw new TypeError('Invalid server record');
            if (RECORD_TYPES.indexOf(input.recordType) === -1) throw new TypeError('Invalid server record type');
            if (typeof input.recordId !== 'string' || !input.recordId) throw new TypeError('Invalid server record id');
            if (!isPositiveInteger(input.revision)) throw new TypeError('Invalid server record revision');
            if (input.schemaVersion !== core.APP_SCHEMA_VERSION) throw new TypeError('Invalid server schema version');
            if (typeof input.payloadHash !== 'string' || input.payloadHash.length !== 64) {
                throw new TypeError('Invalid server record hash');
            }
            if (expectedOperation && (input.recordType !== expectedOperation.recordType || input.recordId !== expectedOperation.recordId)) {
                throw new TypeError('Server record identity mismatch');
            }
            if (requireAcknowledgement === true && input.operationId !== expectedOperation.operationId) {
                throw new TypeError('Server acknowledgement mismatch');
            }
            var deleted = input.deletedAt != null;
            if (deleted && input.payload !== null) throw new TypeError('Invalid server tombstone');
            var calculated = await core.hashSyncPayload(
                input.recordType, input.recordId, input.payload, input.schemaVersion, cryptoImpl
            );
            if (calculated !== input.payloadHash) throw new TypeError('Server record hash mismatch');
            return {
                recordType: input.recordType,
                recordId: input.recordId,
                schemaVersion: input.schemaVersion,
                revision: input.revision,
                payload: deleted ? null : core.cloneJson(input.payload),
                payloadHash: input.payloadHash,
                deletedAt: deleted ? input.deletedAt : null,
                operationId: input.operationId || null,
                changeSeq: input.changeSeq == null ? null : input.changeSeq
            };
        }

        async function persistConflict(store, source, operation, serverRecord, details) {
            var recordType = operation ? operation.recordType : serverRecord.recordType;
            var recordId = operation ? operation.recordId : serverRecord.recordId;
            var localState = await adapter.getRecordState(recordType, recordId);
            var shadow = await store.getShadow(core.recordKey(recordType, recordId));
            var conflictId = source === 'push'
                ? 'push/' + operation.operationId
                : 'pull/' + String(serverRecord.changeSeq);
            await store.putConflict({
                conflictId: conflictId,
                source: source,
                recordKey: core.recordKey(recordType, recordId),
                operationId: operation ? operation.operationId : null,
                local: localState.record ? core.cloneJson(localState.record) : null,
                shadow: shadow || null,
                server: serverRecord ? core.cloneJson(serverRecord) : null,
                details: details || null,
                createdAt: now(),
                state: 'pending'
            });
            return conflictId;
        }

        function wireOperation(operation) {
            return {
                operationId: operation.operationId,
                recordType: operation.recordType,
                recordId: operation.recordId,
                schemaVersion: operation.schemaVersion || core.APP_SCHEMA_VERSION,
                baseRevision: operation.baseRevision,
                payload: operation.deleted ? null : operation.payload,
                payloadHash: operation.payloadHash,
                deleted: operation.deleted === true
            };
        }

        async function flushOutbox(options) {
            if (!enabled) return { enabled: false, sent: 0 };
            var settings = options || {};
            var store = await openStore();
            var candidates = (await store.listOutbox()).filter(function (operation) {
                return operation.localCommitted === true && !operation.terminalError && !operation.conflict &&
                    (settings.force === true || !operation.nextRetryAt || operation.nextRetryAt <= now());
            }).slice(0, MAX_PUSH_OPERATIONS);
            var pending = [];
            for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
                var trial = pending.concat(candidates[candidateIndex]);
                var trialBody = {
                    appId: core.APP_ID,
                    mode: settings.migration === true ? 'migration' : 'sync',
                    operations: trial.map(wireOperation)
                };
                if (utf8ByteLength(JSON.stringify(trialBody)) > MAX_PUSH_BODY_BYTES) break;
                pending = trial;
            }
            if (!pending.length && candidates.length) {
                candidates[0].terminalError = 'payload_too_large';
                candidates[0].nextRetryAt = null;
                await store.putOutbox(candidates[0]);
                return { enabled: true, sent: 0, ok: true, applied: 0, duplicate: 0, conflict: 0, invalid: 1 };
            }
            if (!pending.length) return { enabled: true, sent: 0, applied: 0, duplicate: 0, conflict: 0, invalid: 0 };
            var response = await authenticatedRequest('POST', '/v1/sync/push', {
                appId: core.APP_ID,
                mode: settings.migration === true ? 'migration' : 'sync',
                operations: pending.map(wireOperation)
            });
            if (!response.ok) {
                if (response.status === 401) await store.setMeta('syncState', 'credential_invalid', now());
                if (response.code === 'sync_write_paused' || response.code === 'rollout_control_unavailable') {
                    await markPaused(store, pending, response.code);
                }
                else if (response.retryable) await markRetry(store, pending, response.code);
                return { enabled: true, sent: pending.length, ok: false, code: response.code, retryable: response.retryable };
            }
            if (!response.body || !Array.isArray(response.body.results) || response.body.results.length !== pending.length) {
                await markRetry(store, pending, 'invalid_response');
                return { enabled: true, sent: pending.length, ok: false, code: 'invalid_response', retryable: true };
            }
            var byId = Object.create(null);
            var seen = Object.create(null);
            pending.forEach(function (operation) { byId[operation.operationId] = operation; });
            var counts = { applied: 0, duplicate: 0, conflict: 0, invalid: 0 };
            for (var index = 0; index < response.body.results.length; index += 1) {
                var result = response.body.results[index];
                var operation = result && byId[result.operationId];
                if (!operation || seen[result.operationId] || ['applied', 'duplicate', 'conflict', 'invalid'].indexOf(result.status) === -1) {
                    await markRetry(store, pending, 'invalid_response');
                    return { enabled: true, sent: pending.length, ok: false, code: 'invalid_response', retryable: true };
                }
                seen[result.operationId] = true;
                if (result.status === 'applied' || result.status === 'duplicate') {
                    var acknowledged = await validatedServerRecord(result.record, operation, true);
                    await saveShadow([acknowledged]);
                    await store.deleteOutbox(operation.operationId);
                    counts[result.status] += 1;
                } else if (result.status === 'conflict') {
                    var conflictRecord = result.record ? await validatedServerRecord(result.record, operation, false) : null;
                    await persistConflict(store, 'push', operation, conflictRecord, { code: result.code || 'stale_revision' });
                    operation.conflict = true;
                    operation.nextRetryAt = null;
                    await store.putOutbox(operation);
                    counts.conflict += 1;
                } else {
                    operation.terminalError = result.code || 'invalid';
                    operation.nextRetryAt = null;
                    await store.putOutbox(operation);
                    counts.invalid += 1;
                }
            }
            if (response.bookmark) await store.setMeta('d1Bookmark', response.bookmark, now());
            await store.setMeta('lastSyncAt', now(), now());
            return {
                enabled: true,
                sent: pending.length,
                ok: true,
                applied: counts.applied,
                duplicate: counts.duplicate,
                conflict: counts.conflict,
                invalid: counts.invalid
            };
        }

        function stateMatchesShadow(localState, shadow) {
            if (!localState.valid) return false;
            if (!shadow) return !localState.exists;
            if (shadow.deletedAt != null) return !localState.exists;
            return Boolean(localState.record && localState.record.payloadHash === shadow.payloadHash);
        }

        function stateMatchesServer(localState, serverRecord) {
            if (!localState.valid) return false;
            if (serverRecord.deletedAt != null) return !localState.exists;
            return Boolean(localState.record && localState.record.payloadHash === serverRecord.payloadHash);
        }

        async function applyPulledRecord(store, input) {
            var serverRecord = await validatedServerRecord(input, null);
            var recordKey = core.recordKey(serverRecord.recordType, serverRecord.recordId);
            var localState = await adapter.getRecordState(serverRecord.recordType, serverRecord.recordId);
            var shadow = await store.getShadow(recordKey);
            if (stateMatchesServer(localState, serverRecord)) {
                await saveShadow([serverRecord]);
                return { status: 'unchanged' };
            }
            if (stateMatchesShadow(localState, shadow)) {
                adapter.applyServerRecord(serverRecord);
                await saveShadow([serverRecord]);
                return { status: 'applied' };
            }
            var conflictId = await persistConflict(store, 'pull', null, serverRecord, {
                code: localState.valid ? 'local_diverged' : 'local_storage_invalid'
            });
            return { status: 'conflict', conflictId: conflictId };
        }

        async function pullOnce(options) {
            if (!enabled) return { enabled: false, pages: 0 };
            var settings = options || {};
            var store = await openStore();
            var cursor = await store.getMeta('cursor') || INITIAL_CURSOR;
            var pages = 0;
            var applied = 0;
            var conflicts = 0;
            var hasMore = true;
            while (hasMore && pages < (settings.maxPages || 10)) {
                var response = await authenticatedRequest(
                    'GET', '/v1/sync/changes?appId=' + encodeURIComponent(core.APP_ID) + '&cursor=' + encodeURIComponent(cursor)
                );
                if (!response.ok) {
                    if (response.status === 401) await store.setMeta('syncState', 'credential_invalid', now());
                    return { enabled: true, ok: false, code: response.code, pages: pages, applied: applied, conflicts: conflicts };
                }
                if (!response.body || !Array.isArray(response.body.changes) ||
                    typeof response.body.nextCursor !== 'string' || !CURSOR_PATTERN.test(response.body.nextCursor) ||
                    typeof response.body.hasMore !== 'boolean') {
                    return { enabled: true, ok: false, code: 'invalid_response', pages: pages, applied: applied, conflicts: conflicts };
                }
                for (var index = 0; index < response.body.changes.length; index += 1) {
                    var result = await applyPulledRecord(store, response.body.changes[index]);
                    if (result.status === 'applied') applied += 1;
                    if (result.status === 'conflict') conflicts += 1;
                }
                await store.setMeta('cursor', response.body.nextCursor, now());
                if (response.bookmark) await store.setMeta('d1Bookmark', response.bookmark, now());
                cursor = response.body.nextCursor;
                hasMore = response.body.hasMore === true;
                pages += 1;
            }
            await store.setMeta('lastSyncAt', now(), now());
            return { enabled: true, ok: true, pages: pages, applied: applied, conflicts: conflicts, hasMore: hasMore };
        }

        async function queueMigrationOperations(store, snapshot) {
            var pending = await store.listOutbox();
            var known = Object.create(null);
            pending.forEach(function (operation) { known[operation.operationId] = true; });
            for (var index = 0; index < snapshot.records.length; index += 1) {
                var record = snapshot.records[index];
                var operation = await buildOperation(record, 0, null, false);
                operation.operationId = await core.deterministicUuid(
                    'sound-cruise-sync:p2:' + snapshot.manifestHash + ':' + record.recordKey,
                    cryptoImpl
                );
                operation.localCommitted = true;
                operation.migration = true;
                if (!known[operation.operationId]) await store.putOutbox(operation);
            }
        }

        async function beginInitialMigration() {
            if (!enabled) return { enabled: false };
            var store = await openStore();
            var storedDatasetState = await store.getMeta('datasetState');
            var storedMigrationState = await store.getMeta('migrationState');
            if (storedDatasetState === 'ready' && storedMigrationState === 'complete') {
                return { enabled: true, ok: true, alreadyComplete: true };
            }
            var snapshot = await adapter.snapshot();
            if (snapshot.errors.length) return { enabled: true, ok: false, code: 'snapshot_invalid', errors: snapshot.errors.length };
            var backup = core.createExport(snapshot, now());
            var previous = await store.getMeta('migrationManifest');
            if (previous && previous.manifestHash !== snapshot.manifestHash) {
                return { enabled: true, ok: false, code: 'local_changed_during_migration', backup: backup };
            }
            await store.setMeta('migrationManifest', {
                schemaVersion: snapshot.schemaVersion,
                recordCount: snapshot.counts.total,
                manifestHash: snapshot.manifestHash,
                startedAt: previous ? previous.startedAt : now()
            }, now());
            await store.setMeta('migrationState', 'uploading', now());
            await queueMigrationOperations(store, snapshot);
            var remaining;
            do {
                var pushed = await flushOutbox({ migration: true, force: true });
                if (!pushed.ok && pushed.sent) return { enabled: true, ok: false, code: pushed.code, backup: backup };
                if (pushed.conflict || pushed.invalid) return { enabled: true, ok: false, code: 'migration_operation_failed', backup: backup };
                remaining = (await store.listOutbox()).filter(function (operation) {
                    return operation.migration && !operation.conflict && !operation.terminalError;
                });
            } while (remaining.length);
            var completed = await authenticatedRequest('POST', '/v1/sync/migration/complete', {
                appId: core.APP_ID,
                schemaVersion: snapshot.schemaVersion,
                recordCount: snapshot.counts.total,
                manifestHash: snapshot.manifestHash
            });
            if (!completed.ok) return { enabled: true, ok: false, code: completed.code, backup: backup };
            if (!completed.body || completed.body.datasetState !== 'ready' ||
                completed.body.recordCount !== snapshot.counts.total || completed.body.manifestHash !== snapshot.manifestHash) {
                return { enabled: true, ok: false, code: 'manifest_mismatch', backup: backup };
            }
            await store.setMeta('datasetState', 'ready', now());
            await store.setMeta('migrationState', 'complete', now());
            await store.setMeta('cursor', completed.body.cursor || INITIAL_CURSOR, now());
            await store.setMeta('syncState', 'pilot_ready', now());
            if (completed.bookmark) await store.setMeta('d1Bookmark', completed.bookmark, now());
            startBackgroundSync();
            return { enabled: true, ok: true, recordCount: snapshot.counts.total, manifestHash: snapshot.manifestHash, backup: backup };
        }

        async function getServerSnapshot() {
            var response = await authenticatedRequest('GET', '/v1/sync/snapshot?appId=' + encodeURIComponent(core.APP_ID));
            if (!response.ok) return { ok: false, code: response.code };
            return response.body;
        }

        async function readValidatedCloudSnapshot() {
            var body = await getServerSnapshot();
            if (!body || body.ok === false) return { ok: false, code: body && body.code ? body.code : 'snapshot_failed' };
            try {
                var validated = await mergeApi().validateCloudSnapshot(body, cryptoImpl);
                return { ok: true, snapshot: validated };
            } catch (error) {
                return { ok: false, code: 'invalid_cloud_snapshot' };
            }
        }

        async function preparePairingMerge(options) {
            if (!enabled) return { enabled: false };
            var settings = options || {};
            var store = await openStore();
            var syncState = await store.getMeta('syncState');
            if (syncState !== 'paired_pending') return { enabled: true, ok: false, code: 'pairing_not_pending' };
            var local = await adapter.snapshot();
            if (local.errors.length) return { enabled: true, ok: false, code: 'snapshot_invalid', errors: local.errors.length };
            var cloudResult = await readValidatedCloudSnapshot();
            if (!cloudResult.ok) return { enabled: true, ok: false, code: cloudResult.code };
            var shadow = await store.listShadow();
            var sessionId = settings.sessionId || await core.deterministicUuid(
                'sound-cruise-sync:p4:' + local.manifestHash + ':' + cloudResult.snapshot.manifestHash + ':' + cloudResult.snapshot.cursor,
                cryptoImpl
            );
            var plan = await mergeApi().planMerge({
                local: local,
                cloud: cloudResult.snapshot,
                shadow: shadow,
                choices: settings.choices || {},
                sessionId: sessionId
            }, cryptoImpl);
            var session = {
                sessionId: sessionId,
                stage: 'awaiting_confirmation',
                createdAt: now(),
                updatedAt: now(),
                localState: plan.localState,
                choices: core.cloneJson(settings.choices || {}),
                localSnapshot: core.cloneJson(local),
                cloudSnapshot: core.cloneJson(cloudResult.snapshot),
                shadow: core.cloneJson(shadow),
                plan: core.cloneJson(plan)
            };
            if (typeof store.putMergeSession !== 'function') return { enabled: true, ok: false, code: 'merge_storage_unavailable' };
            await store.putMergeSession(session);
            await store.setMeta('activeMergeSessionId', sessionId, now());
            return { enabled: true, ok: true, sessionId: sessionId, localState: plan.localState, plan: plan };
        }

        function changesBetweenCloudAndFinal(cloudSnapshot, finalSnapshot) {
            var before = Object.create(null);
            var after = Object.create(null);
            cloudSnapshot.records.forEach(function (record) { before[record.recordKey || core.recordKey(record.recordType, record.recordId)] = record; });
            finalSnapshot.records.forEach(function (record) { after[record.recordKey] = record; });
            var keys = Object.create(null);
            Object.keys(before).concat(Object.keys(after)).forEach(function (key) { keys[key] = true; });
            return Object.keys(keys).sort().filter(function (key) {
                var cloud = before[key]; var finalRecord = after[key];
                var cloudLive = Boolean(cloud && cloud.deletedAt == null && cloud.payload !== null);
                return (!cloudLive && finalRecord) || (cloudLive && !finalRecord) ||
                    (cloudLive && finalRecord && cloud.payloadHash !== finalRecord.payloadHash);
            }).map(function (key) { return { recordKey: key, before: before[key] || null, after: after[key] || null }; });
        }

        async function queueMergeChanges(store, session, cloudSnapshot, finalSnapshot) {
            var pending = await store.listOutbox();
            var known = Object.create(null);
            pending.forEach(function (operation) { known[operation.operationId] = true; });
            var changes = changesBetweenCloudAndFinal(cloudSnapshot, finalSnapshot);
            for (var index = 0; index < changes.length; index += 1) {
                var change = changes[index];
                var identity = change.after || change.before;
                var record = change.after || {
                    recordType: identity.recordType,
                    recordId: identity.recordId,
                    schemaVersion: core.APP_SCHEMA_VERSION,
                    payload: null
                };
                var operation = await buildOperation(
                    record,
                    change.before && Number.isInteger(change.before.revision) ? change.before.revision : 0,
                    change.before && change.before.deletedAt == null ? change.before.payload : null,
                    !change.after
                );
                operation.operationId = await core.deterministicUuid(
                    'sound-cruise-sync:p4:operation:' + session.sessionId + ':' + change.recordKey + ':' +
                    (change.after ? change.after.payloadHash : 'delete'),
                    cryptoImpl
                );
                operation.localCommitted = true;
                operation.mergeSessionId = session.sessionId;
                if (!known[operation.operationId]) await store.putOutbox(operation);
            }
            return changes.length;
        }

        async function finishMergeSession(store, session) {
            var enteringStage = session.stage;
            var local = await adapter.snapshot();
            if (local.errors.length || !session.plan.finalManifest ||
                local.manifestHash !== session.plan.finalManifest.manifestHash ||
                local.counts.total !== session.plan.finalManifest.recordCount) {
                session.stage = 'rollback_required';
                session.lastError = 'local_post_verify_failed';
                session.updatedAt = now();
                await store.putMergeSession(session);
                if (enteringStage === 'applying_local' && session.backupId) {
                    var failedBackup = await store.getBackup(session.backupId);
                    if (failedBackup && failedBackup.values) {
                        try {
                            restoreManagedStorage(failedBackup.values);
                            session.stage = 'rolled_back';
                            session.rolledBackAt = now();
                            await store.putMergeSession(session);
                        } catch (rollbackError) {}
                    }
                }
                return { enabled: true, ok: false, code: session.lastError, rollbackRequired: true };
            }
            try {
                verifyLocalGraph(session.plan.finalSnapshot);
            } catch (error) {
                session.stage = 'rollback_required';
                session.lastError = error.message || 'local_graph_verify_failed';
                session.updatedAt = now();
                await store.putMergeSession(session);
                if (session.backupId) {
                    var graphBackup = await store.getBackup(session.backupId);
                    if (graphBackup && graphBackup.values) {
                        try {
                            restoreManagedStorage(graphBackup.values);
                            session.stage = 'rolled_back';
                            session.rolledBackAt = now();
                            await store.putMergeSession(session);
                        } catch (graphRollbackError) {}
                    }
                }
                return { enabled: true, ok: false, code: session.lastError, rollbackRequired: session.stage !== 'rolled_back' };
            }

            if (enteringStage !== 'verifying') {
                session.stage = 'pushing';
                session.updatedAt = now();
                await store.putMergeSession(session);
                if (enteringStage === 'applying_local') {
                    var cloudResult = await readValidatedCloudSnapshot();
                    if (!cloudResult.ok) return { enabled: true, ok: false, code: cloudResult.code, resumable: true };
                    if (cloudResult.snapshot.cursor !== session.cloudSnapshot.cursor ||
                        cloudResult.snapshot.manifestHash !== session.cloudSnapshot.manifestHash) {
                        session.stage = 'rollback_required';
                        session.lastError = 'cloud_snapshot_stale';
                        session.updatedAt = now();
                        await store.putMergeSession(session);
                        var staleBackup = session.backupId ? await store.getBackup(session.backupId) : null;
                        if (staleBackup && staleBackup.values) {
                            try {
                                restoreManagedStorage(staleBackup.values);
                                session.stage = 'rolled_back';
                                session.rolledBackAt = now();
                                await store.putMergeSession(session);
                            } catch (staleRollbackError) {}
                        }
                        return {
                            enabled: true,
                            ok: false,
                            code: 'cloud_snapshot_stale',
                            rollbackRequired: session.stage !== 'rolled_back'
                        };
                    }
                }
                // Always retain the preview revisions as operation bases. If a remote
                // record changed after preview, P2 returns a revision conflict rather
                // than allowing the merge to overwrite that newer value.
                await queueMergeChanges(store, session, session.cloudSnapshot, session.plan.finalSnapshot);
                for (var batchIndex = 0; batchIndex < 50; batchIndex += 1) {
                    var mergePending = (await store.listOutbox()).filter(function (operation) {
                        return operation.mergeSessionId === session.sessionId && !operation.conflict && !operation.terminalError;
                    });
                    if (!mergePending.length) break;
                    var pushed = await flushOutbox({ force: true });
                    if (pushed.ok === false || pushed.conflict || pushed.invalid) {
                        session.lastError = pushed.code || (pushed.conflict ? 'remote_conflict' : 'remote_invalid');
                        session.updatedAt = now();
                        await store.putMergeSession(session);
                        return { enabled: true, ok: false, code: session.lastError, resumable: pushed.ok === false };
                    }
                }
                var left = (await store.listOutbox()).filter(function (operation) { return operation.mergeSessionId === session.sessionId; });
                if (left.length) return { enabled: true, ok: false, code: 'merge_push_incomplete', resumable: true };

                session.stage = 'verifying';
                session.updatedAt = now();
                await store.putMergeSession(session);
            }
            var verifiedResult = await readValidatedCloudSnapshot();
            if (!verifiedResult.ok) return { enabled: true, ok: false, code: verifiedResult.code, resumable: true };
            if (verifiedResult.snapshot.manifestHash !== session.plan.finalManifest.manifestHash ||
                verifiedResult.snapshot.recordCount !== session.plan.finalManifest.recordCount) {
                session.lastError = 'remote_post_verify_failed';
                session.updatedAt = now();
                await store.putMergeSession(session);
                return { enabled: true, ok: false, code: session.lastError, resumable: true };
            }
            await saveShadow(verifiedResult.snapshot.records);
            await store.setMetaBatch([
                { key: 'datasetState', value: 'ready' },
                { key: 'migrationState', value: 'complete' },
                { key: 'syncState', value: 'pilot_ready' },
                { key: 'cursor', value: verifiedResult.snapshot.cursor },
                { key: 'activeMergeSessionId', value: null }
            ], now());
            session.stage = 'complete';
            session.completedAt = now();
            session.updatedAt = now();
            delete session.lastError;
            await store.putMergeSession(session);
            startBackgroundSync();
            return {
                enabled: true,
                ok: true,
                sessionId: session.sessionId,
                recordCount: verifiedResult.snapshot.recordCount,
                manifestHash: verifiedResult.snapshot.manifestHash
            };
        }

        async function applyPairingMerge(sessionId, choices) {
            if (!enabled) return { enabled: false };
            var store = await openStore();
            if (typeof store.getMergeSession !== 'function') return { enabled: true, ok: false, code: 'merge_storage_unavailable' };
            var session = await store.getMergeSession(sessionId);
            if (!session || MERGE_STAGES.indexOf(session.stage) === -1) return { enabled: true, ok: false, code: 'merge_session_missing' };
            if (session.stage === 'pushing' || session.stage === 'verifying') return finishMergeSession(store, session);
            if (session.stage !== 'awaiting_confirmation') return { enabled: true, ok: false, code: 'merge_stage_invalid' };

            var local = await adapter.snapshot();
            if (local.errors.length || local.manifestHash !== session.localSnapshot.manifestHash) {
                return { enabled: true, ok: false, code: 'local_snapshot_stale' };
            }
            var cloudResult = await readValidatedCloudSnapshot();
            if (!cloudResult.ok) return { enabled: true, ok: false, code: cloudResult.code };
            if (cloudResult.snapshot.cursor !== session.cloudSnapshot.cursor ||
                cloudResult.snapshot.manifestHash !== session.cloudSnapshot.manifestHash) {
                return { enabled: true, ok: false, code: 'cloud_snapshot_stale' };
            }
            var plan = await mergeApi().planMerge({
                local: session.localSnapshot,
                cloud: session.cloudSnapshot,
                shadow: session.shadow,
                choices: choices || {},
                sessionId: session.sessionId
            }, cryptoImpl);
            if (plan.conflicts.length || !plan.finalSnapshot) {
                session.choices = core.cloneJson(choices || {});
                session.plan = core.cloneJson(plan);
                session.updatedAt = now();
                await store.putMergeSession(session);
                return { enabled: true, ok: false, code: 'merge_conflicts_unresolved', plan: plan };
            }

            var backupId = await core.deterministicUuid('sound-cruise-sync:p4:backup:' + session.sessionId, cryptoImpl);
            var backup = {
                backupId: backupId,
                sessionId: session.sessionId,
                createdAt: now(),
                manifestHash: local.manifestHash,
                export: core.createExport(local, now()),
                values: captureManagedStorage()
            };
            try {
                await store.putBackup(backup);
            } catch (error) {
                return { enabled: true, ok: false, code: 'backup_failed' };
            }
            session.backupId = backupId;
            session.choices = core.cloneJson(choices || {});
            session.plan = core.cloneJson(plan);
            session.stage = 'applying_local';
            session.updatedAt = now();
            await store.putMergeSession(session);
            try {
                applyFinalSnapshot(plan.finalSnapshot);
            } catch (error) {
                session.stage = 'rollback_required';
                session.lastError = 'local_apply_failed';
                await store.putMergeSession(session);
                try {
                    restoreManagedStorage(backup.values);
                    session.stage = 'rolled_back';
                    session.rolledBackAt = now();
                    await store.putMergeSession(session);
                } catch (rollbackError) {}
                return { enabled: true, ok: false, code: 'local_apply_failed', rollbackRequired: session.stage !== 'rolled_back' };
            }
            return finishMergeSession(store, session);
        }

        async function resumePairingMerge(sessionId) {
            var store = await openStore();
            var id = sessionId || await store.getMeta('activeMergeSessionId');
            var session = id && typeof store.getMergeSession === 'function' ? await store.getMergeSession(id) : null;
            if (!session) return { enabled: true, ok: false, code: 'merge_session_missing' };
            if (session.stage === 'pushing' || session.stage === 'verifying') return finishMergeSession(store, session);
            return { enabled: true, ok: false, code: 'merge_not_resumable', stage: session.stage };
        }

        async function rollbackPairingMerge(sessionId) {
            var store = await openStore();
            var session = typeof store.getMergeSession === 'function' ? await store.getMergeSession(sessionId) : null;
            if (!session || !session.backupId || session.stage === 'complete') return { enabled: true, ok: false, code: 'rollback_not_available' };
            var backup = await store.getBackup(session.backupId);
            if (!backup || !backup.values) return { enabled: true, ok: false, code: 'backup_missing' };
            try {
                restoreManagedStorage(backup.values);
                session.stage = 'rolled_back';
                session.rolledBackAt = now();
                await store.putMergeSession(session);
                return { enabled: true, ok: true, sessionId: session.sessionId };
            } catch (error) {
                session.stage = 'rollback_required';
                session.lastError = 'rollback_failed';
                await store.putMergeSession(session);
                return { enabled: true, ok: false, code: 'rollback_failed' };
            }
        }

        async function syncNow() {
            if (!enabled) return { enabled: false };
            var pushed = { enabled: true, sent: 0, applied: 0, duplicate: 0, conflict: 0, invalid: 0 };
            for (var batchIndex = 0; batchIndex < 10; batchIndex += 1) {
                await reconcile({ captureLocalDiffs: true });
                var batch = await flushOutbox();
                pushed.sent += batch.sent || 0;
                pushed.applied += batch.applied || 0;
                pushed.duplicate += batch.duplicate || 0;
                pushed.conflict += batch.conflict || 0;
                pushed.invalid += batch.invalid || 0;
                if (batch.ok === false && batch.sent) return { enabled: true, ok: false, push: batch };
                if (!batch.sent) break;
            }
            var pulled = await pullOnce();
            return { enabled: true, ok: pulled.ok !== false, push: pushed, pull: pulled };
        }

        var backgroundTimer = null;
        var backgroundRunning = false;
        function scheduleSync(delay) {
            if (!enabled || !backgroundRunning || backgroundTimer !== null) return;
            backgroundTimer = global.setTimeout(function () {
                backgroundTimer = null;
                syncNow().catch(function () {});
            }, typeof delay === 'number' ? delay : 1000);
        }

        function startBackgroundSync() {
            if (!enabled || backgroundRunning || !global.addEventListener) return false;
            backgroundRunning = true;
            global.addEventListener('online', scheduleSync);
            if (global.document) global.document.addEventListener('visibilitychange', function () {
                if (global.document.visibilityState === 'visible') scheduleSync(500);
            });
            scheduleSync(0);
            return true;
        }

        function watchLocalMutations(storageApi) {
            if (!enabled || !storageApi || storageApi.__soundCruiseSyncPilotWrapped === true) return false;
            var mutationMethods = [
                'saveSettings', 'clearChordCruiseData', 'saveFolders', 'createFolder', 'renameFolder',
                'copyFolder', 'setFolderColor', 'deleteFolder', 'moveFolder', 'moveChord', 'saveChord', 'deleteChord'
            ];
            mutationMethods.forEach(function (methodName) {
                var original = storageApi[methodName];
                if (typeof original !== 'function') return;
                storageApi[methodName] = function () {
                    var result = original.apply(storageApi, arguments);
                    if (result !== false && result !== null && result !== undefined) scheduleSync(750);
                    return result;
                };
            });
            Object.defineProperty(storageApi, '__soundCruiseSyncPilotWrapped', {
                value: true,
                configurable: false,
                enumerable: false,
                writable: false
            });
            return true;
        }

        return Object.freeze({
            enabled: enabled,
            initialize: initialize,
            openStore: openStore,
            localAdapter: adapter,
            buildOperation: buildOperation,
            queueLocalMutation: queueLocalMutation,
            reconcile: reconcile,
            captureSnapshot: function () { return adapter.snapshot(); },
            createExport: function (timestamp) { return adapter.createExport(timestamp); },
            saveShadow: saveShadow,
            startIdentity: startIdentity,
            issuePairingCode: issuePairingCode,
            pairWithCode: pairWithCode,
            prepareRecovery: prepareRecovery,
            commitRecovery: commitRecovery,
            resumeRecovery: resumeRecovery,
            regenerateRecoveryCode: regenerateRecoveryCode,
            automaticDeviceLabel: automaticDeviceLabel,
            listDevices: listDevices,
            pendingOutboxCount: pendingOutboxCount,
            revokeDevice: revokeDevice,
            disconnectCurrentDevice: disconnectCurrentDevice,
            clearCloudState: clearCloudState,
            prepareAccountDelete: prepareAccountDelete,
            commitAccountDelete: commitAccountDelete,
            resumeAccountDelete: resumeAccountDelete,
            flushOutbox: flushOutbox,
            applyPulledRecord: async function (input) { return applyPulledRecord(await openStore(), input); },
            pullOnce: pullOnce,
            beginInitialMigration: beginInitialMigration,
            getServerSnapshot: getServerSnapshot,
            preparePairingMerge: preparePairingMerge,
            applyPairingMerge: applyPairingMerge,
            resumePairingMerge: resumePairingMerge,
            rollbackPairingMerge: rollbackPairingMerge,
            syncNow: syncNow,
            scheduleSync: scheduleSync,
            startBackgroundSync: startBackgroundSync,
            watchLocalMutations: watchLocalMutations
        });
    }

    sync.client = Object.freeze({
        CREDENTIAL_PATTERN: CREDENTIAL_PATTERN,
        normalizePairingCode: normalizePairingCode,
        formatPairingCode: formatPairingCode,
        normalizeEnrollmentCode: normalizeEnrollmentCode,
        RECOVERY_ALPHABET: RECOVERY_ALPHABET,
        normalizeRecoveryCode: normalizeRecoveryCode,
        formatRecoveryCode: formatRecoveryCode,
        createLocalAdapter: createLocalAdapter,
        createClient: createClient,
        makeOperationId: makeOperationId
    });
}(typeof window !== 'undefined' ? window : globalThis));
