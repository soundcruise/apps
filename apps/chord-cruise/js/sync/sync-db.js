(function (global) {
    'use strict';

    var core = global.ChordCruiseSync && global.ChordCruiseSync.core;
    if (!core) throw new Error('Sound Cruise Sync core must load before the database adapter');

    var STORE_NAMES = Object.freeze({
        meta: 'meta',
        outbox: 'outbox',
        shadow: 'shadow',
        conflicts: 'conflicts',
        backups: 'backups',
        mergeSessions: 'merge_sessions'
    });

    function requestResult(request) {
        return new Promise(function (resolve, reject) {
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { reject(request.error || new Error('IndexedDB request failed')); };
        });
    }

    function transactionDone(transaction) {
        return new Promise(function (resolve, reject) {
            transaction.oncomplete = function () { resolve(); };
            transaction.onerror = function () { reject(transaction.error || new Error('IndexedDB transaction failed')); };
            transaction.onabort = function () { reject(transaction.error || new Error('IndexedDB transaction aborted')); };
        });
    }

    function ensureSchema(database) {
        if (!database.objectStoreNames.contains(STORE_NAMES.meta)) {
            database.createObjectStore(STORE_NAMES.meta, { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains(STORE_NAMES.outbox)) {
            var outbox = database.createObjectStore(STORE_NAMES.outbox, { keyPath: 'operationId' });
            outbox.createIndex('recordKey', 'recordKey', { unique: false });
            outbox.createIndex('localCommitted', 'localCommitted', { unique: false });
            outbox.createIndex('nextRetryAt', 'nextRetryAt', { unique: false });
        }
        if (!database.objectStoreNames.contains(STORE_NAMES.shadow)) {
            database.createObjectStore(STORE_NAMES.shadow, { keyPath: 'recordKey' });
        }
        if (!database.objectStoreNames.contains(STORE_NAMES.conflicts)) {
            var conflicts = database.createObjectStore(STORE_NAMES.conflicts, { keyPath: 'conflictId' });
            conflicts.createIndex('recordKey', 'recordKey', { unique: false });
        }
        if (!database.objectStoreNames.contains(STORE_NAMES.backups)) {
            database.createObjectStore(STORE_NAMES.backups, { keyPath: 'backupId' });
        }
        if (!database.objectStoreNames.contains(STORE_NAMES.mergeSessions)) {
            database.createObjectStore(STORE_NAMES.mergeSessions, { keyPath: 'sessionId' });
        }
    }

    function openDatabase(indexedDbFactory) {
        var factory = indexedDbFactory || global.indexedDB;
        if (!factory || typeof factory.open !== 'function') {
            return Promise.reject(new Error('IndexedDB is unavailable'));
        }
        return new Promise(function (resolve, reject) {
            var request;
            try {
                request = factory.open(core.DB_NAME, core.DB_VERSION);
            } catch (error) {
                reject(error);
                return;
            }
            request.onupgradeneeded = function () { ensureSchema(request.result); };
            request.onsuccess = function () { resolve(createStore(request.result)); };
            request.onerror = function () { reject(request.error || new Error('IndexedDB open failed')); };
            request.onblocked = function () { reject(new Error('IndexedDB upgrade is blocked')); };
        });
    }

    function createStore(database) {
        function run(storeName, mode, action) {
            var transaction;
            try {
                transaction = database.transaction(storeName, mode);
            } catch (error) {
                return Promise.reject(error);
            }
            var store = transaction.objectStore(storeName);
            var resultPromise;
            try {
                resultPromise = action(store, transaction);
            } catch (error) {
                try { transaction.abort(); } catch (abortError) {}
                return Promise.reject(error);
            }
            return Promise.all([Promise.resolve(resultPromise), transactionDone(transaction)])
                .then(function (results) { return results[0]; });
        }

        function clone(value) {
            return value === undefined ? undefined : core.cloneJson(value);
        }

        return Object.freeze({
            name: core.DB_NAME,
            version: core.DB_VERSION,
            close: function () { database.close(); },
            getMeta: function (key) {
                return run(STORE_NAMES.meta, 'readonly', function (store) {
                    return requestResult(store.get(key)).then(function (entry) {
                        return entry ? clone(entry.value) : undefined;
                    });
                });
            },
            setMeta: function (key, value, updatedAt) {
                return run(STORE_NAMES.meta, 'readwrite', function (store) {
                    return requestResult(store.put({
                        key: key,
                        value: clone(value),
                        updatedAt: typeof updatedAt === 'number' ? updatedAt : Date.now()
                    }));
                });
            },
            setMetaBatch: function (entries, updatedAt) {
                if (!Array.isArray(entries) || entries.length < 1 || entries.some(function (entry) {
                    return !entry || typeof entry.key !== 'string' || !entry.key;
                })) return Promise.reject(new TypeError('Invalid metadata batch'));
                return run(STORE_NAMES.meta, 'readwrite', function (store) {
                    return Promise.all(entries.map(function (entry) {
                        return requestResult(store.put({
                            key: entry.key,
                            value: clone(entry.value),
                            updatedAt: typeof updatedAt === 'number' ? updatedAt : Date.now()
                        }));
                    }));
                });
            },
            putOutbox: function (operation) {
                return run(STORE_NAMES.outbox, 'readwrite', function (store) {
                    return requestResult(store.put(clone(operation)));
                });
            },
            getOutbox: function (operationId) {
                return run(STORE_NAMES.outbox, 'readonly', function (store) {
                    return requestResult(store.get(operationId)).then(clone);
                });
            },
            listOutbox: function () {
                return run(STORE_NAMES.outbox, 'readonly', function (store) {
                    return requestResult(store.getAll()).then(function (entries) { return clone(entries || []); });
                });
            },
            deleteOutbox: function (operationId) {
                return run(STORE_NAMES.outbox, 'readwrite', function (store) {
                    return requestResult(store.delete(operationId));
                });
            },
            putShadow: function (shadow) {
                return run(STORE_NAMES.shadow, 'readwrite', function (store) {
                    return requestResult(store.put(clone(shadow)));
                });
            },
            getShadow: function (recordKey) {
                return run(STORE_NAMES.shadow, 'readonly', function (store) {
                    return requestResult(store.get(recordKey)).then(clone);
                });
            },
            listShadow: function () {
                return run(STORE_NAMES.shadow, 'readonly', function (store) {
                    return requestResult(store.getAll()).then(function (entries) { return clone(entries || []); });
                });
            },
            putConflict: function (conflict) {
                return run(STORE_NAMES.conflicts, 'readwrite', function (store) {
                    return requestResult(store.put(clone(conflict)));
                });
            },
            listConflicts: function () {
                return run(STORE_NAMES.conflicts, 'readonly', function (store) {
                    return requestResult(store.getAll()).then(function (entries) { return clone(entries || []); });
                });
            },
            deleteConflict: function (conflictId) {
                return run(STORE_NAMES.conflicts, 'readwrite', function (store) {
                    return requestResult(store.delete(conflictId));
                });
            },
            putBackup: function (backup) {
                return run(STORE_NAMES.backups, 'readwrite', function (store) {
                    return requestResult(store.put(clone(backup)));
                });
            },
            getBackup: function (backupId) {
                return run(STORE_NAMES.backups, 'readonly', function (store) {
                    return requestResult(store.get(backupId)).then(clone);
                });
            },
            listBackups: function () {
                return run(STORE_NAMES.backups, 'readonly', function (store) {
                    return requestResult(store.getAll()).then(function (entries) { return clone(entries || []); });
                });
            },
            putMergeSession: function (session) {
                return run(STORE_NAMES.mergeSessions, 'readwrite', function (store) {
                    return requestResult(store.put(clone(session)));
                });
            },
            getMergeSession: function (sessionId) {
                return run(STORE_NAMES.mergeSessions, 'readonly', function (store) {
                    return requestResult(store.get(sessionId)).then(clone);
                });
            },
            listMergeSessions: function () {
                return run(STORE_NAMES.mergeSessions, 'readonly', function (store) {
                    return requestResult(store.getAll()).then(function (entries) { return clone(entries || []); });
                });
            },
            clearCloudState: function () {
                var names = [STORE_NAMES.meta, STORE_NAMES.outbox, STORE_NAMES.shadow, STORE_NAMES.conflicts, STORE_NAMES.mergeSessions];
                var transaction;
                try { transaction = database.transaction(names, 'readwrite'); } catch (error) { return Promise.reject(error); }
                try {
                    transaction.objectStore(STORE_NAMES.outbox).clear();
                    transaction.objectStore(STORE_NAMES.shadow).clear();
                    transaction.objectStore(STORE_NAMES.conflicts).clear();
                    transaction.objectStore(STORE_NAMES.mergeSessions).clear();
                    var meta = transaction.objectStore(STORE_NAMES.meta);
                    meta.clear();
                    meta.put({ key: 'appId', value: core.APP_ID, updatedAt: Date.now() });
                    meta.put({ key: 'syncState', value: 'off', updatedAt: Date.now() });
                    meta.put({ key: 'datasetState', value: 'local_only', updatedAt: Date.now() });
                    meta.put({ key: 'migrationState', value: 'not_started', updatedAt: Date.now() });
                } catch (error) {
                    try { transaction.abort(); } catch (abortError) {}
                    return Promise.reject(error);
                }
                return transactionDone(transaction);
            }
        });
    }

    global.ChordCruiseSync.database = Object.freeze({
        DB_NAME: core.DB_NAME,
        DB_VERSION: core.DB_VERSION,
        STORE_NAMES: STORE_NAMES,
        open: openDatabase,
        createStore: createStore
    });
}(typeof window !== 'undefined' ? window : globalThis));
