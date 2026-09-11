(function (global) {
    'use strict';

    var sync = global.ChordCruiseSync || {};
    var core = sync.core;
    var database = sync.database;
    if (!core || !database) throw new Error('Sound Cruise Sync core and database must load before the client');

    var CREDENTIAL_PATTERN = /^scd1\.([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;
    var RECORD_TYPES = core.RECORD_TYPES;

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

    function parseJson(raw) {
        if (raw === null || raw === undefined) return null;
        try { return JSON.parse(raw); } catch (error) { return null; }
    }

    function createLocalAdapter(storage, cryptoImpl) {
        if (!storage || typeof storage.getItem !== 'function') throw new TypeError('localStorage is required');

        function getPayload(recordType, recordId) {
            var key = storageKey(recordType, recordId);
            if (!key) return null;
            var value;
            try { value = parseJson(storage.getItem(key)); } catch (error) { return null; }
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

        return Object.freeze({
            getPayload: getPayload,
            getRecord: getRecord,
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
            var normalized = core.normalizeRecord(
                record.recordType,
                record.recordId,
                record.payload,
                record.schemaVersion || core.APP_SCHEMA_VERSION
            );
            var payloadHash = await core.hashRecord(normalized, cryptoImpl);
            return {
                operationId: makeOperationId(cryptoImpl),
                appId: core.APP_ID,
                recordType: normalized.recordType,
                recordId: normalized.recordId,
                recordKey: core.recordKey(normalized.recordType, normalized.recordId),
                baseRevision: Number.isInteger(baseRevision) && baseRevision >= 0 ? baseRevision : 0,
                basePayload: basePayload ? core.cloneJson(basePayload) : null,
                payload: core.cloneJson(normalized.payload),
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
                if (!input || RECORD_TYPES.indexOf(input.recordType) === -1 || !Number.isInteger(input.revision) || input.revision < 1) {
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
            return { ok: true, appId: core.APP_ID, deviceId: body.deviceId, datasetState: body.datasetState };
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
            startIdentity: startIdentity
        });
    }

    sync.client = Object.freeze({
        CREDENTIAL_PATTERN: CREDENTIAL_PATTERN,
        createLocalAdapter: createLocalAdapter,
        createClient: createClient,
        makeOperationId: makeOperationId
    });
}(typeof window !== 'undefined' ? window : globalThis));
