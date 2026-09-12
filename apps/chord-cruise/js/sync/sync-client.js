(function (global) {
    'use strict';

    var sync = global.ChordCruiseSync || {};
    var core = sync.core;
    var database = sync.database;
    if (!core || !database) throw new Error('Sound Cruise Sync core and database must load before the client');

    var CREDENTIAL_PATTERN = /^scd1\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;
    var RECORD_TYPES = core.RECORD_TYPES;
    var MAX_PUSH_OPERATIONS = 50;
    var MAX_PUSH_BODY_BYTES = 256 * 1024;
    var INITIAL_CURSOR = 'scc1.MA';
    var CURSOR_PATTERN = /^scc1\.[A-Za-z0-9_-]{1,32}$/;

    function normalizePairingCode(value) {
        if (typeof value !== 'string') return null;
        var normalized = value.replace(/[\s-]/g, '');
        return /^\d{8}$/.test(normalized) ? normalized : null;
    }

    function formatPairingCode(value) {
        var normalized = normalizePairingCode(value);
        return normalized ? normalized.slice(0, 4) + ' ' + normalized.slice(4) : null;
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
            try {
                response = await fetchImpl(endpoint + '/v1/sync/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    cache: 'no-store',
                    body: JSON.stringify({
                        appId: core.APP_ID,
                        turnstileToken: request.turnstileToken,
                        deviceLabel: request.deviceLabel,
                        initialSummary: {
                            schemaVersion: snapshot.schemaVersion,
                            recordCount: snapshot.counts.total,
                            manifestHash: snapshot.manifestHash
                        }
                    })
                });
            } catch (error) {
                return { ok: false, code: 'network_error' };
            }
            var body;
            try { body = await response.json(); } catch (error) { return { ok: false, code: 'invalid_response' }; }
            if (!response.ok || !body || body.ok !== true) return { ok: false, code: body && body.code ? body.code : 'start_failed' };
            if (body.appId !== core.APP_ID || body.datasetState !== 'initializing' ||
                typeof body.deviceId !== 'string' || !CREDENTIAL_PATTERN.test(body.deviceCredential || '')) {
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
            return { ok: true, appId: core.APP_ID, deviceId: body.deviceId, datasetState: body.datasetState };
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
            return {
                ok: response.ok && responseBody && responseBody.ok === true,
                status: response.status,
                code: responseBody && responseBody.code ? responseBody.code : (response.ok ? null : 'request_failed'),
                retryable: response.status === 429 || response.status >= 500,
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
                        deviceLabel: request.deviceLabel
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
            var localState = snapshot.counts.total === 0 ? 'empty' : 'local_data_pending_merge';
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
                if (response.retryable) await markRetry(store, pending, response.code);
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
            flushOutbox: flushOutbox,
            applyPulledRecord: async function (input) { return applyPulledRecord(await openStore(), input); },
            pullOnce: pullOnce,
            beginInitialMigration: beginInitialMigration,
            getServerSnapshot: getServerSnapshot,
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
        createLocalAdapter: createLocalAdapter,
        createClient: createClient,
        makeOperationId: makeOperationId
    });
}(typeof window !== 'undefined' ? window : globalThis));
