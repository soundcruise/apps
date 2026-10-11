(function installMultiAppSyncDb(global) {
  'use strict';

  const root = global.SoundCruiseMultiAppSync = global.SoundCruiseMultiAppSync || {};
  const VERSION = 1;
  const STORES = Object.freeze(['meta', 'outbox', 'shadow', 'conflicts']);
  const APPS = new Set(['pitch', 'rhythm', 'fretboard', 'port']);

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('multi_app_storage_failed'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('multi_app_storage_failed'));
      transaction.onerror = () => reject(transaction.error || new Error('multi_app_storage_failed'));
    });
  }

  function assertAppId(appId) {
    if (!APPS.has(appId)) throw new Error('multi_app_id_invalid');
  }

  function assertSafe(value) {
    const serialized = JSON.stringify(value);
    if (/sca1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/.test(serialized) ||
        /sch1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/.test(serialized) ||
        /SAR1(?:-?[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}){5}/.test(serialized) ||
        /recoveryCode|handoffToken|pairingCode/i.test(serialized)) {
      throw new Error('cross_plane_secret_persistence_blocked');
    }
  }

  async function open(appId, indexedDb = global.indexedDB, namespace = '') {
    assertAppId(appId);
    if (!indexedDb?.open) throw new Error('multi_app_storage_unavailable');
    const request = indexedDb.open(`sound-cruise-sync-data-${appId}${namespace}`, VERSION);
    request.onupgradeneeded = () => {
      for (const store of STORES) {
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
      }
    };
    return requestResult(request);
  }

  function createStore(appId, options = {}) {
    assertAppId(appId);
    const indexedDb = options.indexedDb || global.indexedDB;
    const namespace = options.accountId ? `-account-${encodeURIComponent(options.accountId)}` : '';
    const check = () => { options.assertCurrent?.(); if (options.signal?.aborted) throw new Error('runtime_disposed'); };
    async function databaseForOperation() {
      check();
      const database = await open(appId, indexedDb, namespace);
      try { check(); return database; } catch (error) { database.close(); throw error; }
    }
    async function finish(transaction) {
      const cancel = () => { try { transaction.abort(); } catch (_) {} };
      options.signal?.addEventListener('abort', cancel, { once: true });
      const done = transactionDone(transaction);
      try { check(); await done; check(); }
      catch (error) { cancel(); await done.catch(() => {}); throw error; }
      finally { options.signal?.removeEventListener('abort', cancel); }
    }
    async function get(storeName, key) {
      const database = await databaseForOperation();
      try {
        return (await requestResult(database.transaction(storeName, 'readonly').objectStore(storeName).get(key))) || null;
      } finally { database.close(); }
    }
    async function put(storeName, key, value) {
      assertSafe(value);
      const database = await databaseForOperation();
      try {
        const transaction = database.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).put(structuredClone(value), key);
        await finish(transaction);
      } finally { database.close(); }
    }
    async function remove(storeName, key) {
      const database = await databaseForOperation();
      try {
        const transaction = database.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).delete(key);
        await finish(transaction);
      } finally { database.close(); }
    }
    async function values(storeName) {
      const database = await databaseForOperation();
      try { return await requestResult(database.transaction(storeName, 'readonly').objectStore(storeName).getAll()); }
      finally { database.close(); }
    }
    async function clearCloudState() {
      const database = await databaseForOperation();
      try {
        const transaction = database.transaction(STORES, 'readwrite');
        for (const storeName of STORES) transaction.objectStore(storeName).clear();
        await finish(transaction);
      } finally { database.close(); }
    }
    return Object.freeze({
      appId, accountId: options.accountId || null,
      getMeta: (key) => get('meta', key),
      setMeta: (key, value) => put('meta', key, { value, updatedAt: Date.now() }),
      readMeta: async (key) => (await get('meta', key))?.value ?? null,
      removeMeta: (key) => remove('meta', key),
      putOutbox: (operation) => put('outbox', operation.operationId, operation),
      listOutbox: () => values('outbox'),
      deleteOutbox: (operationId) => remove('outbox', operationId),
      putShadow: (recordKey, record) => put('shadow', recordKey, record),
      getShadow: (recordKey) => get('shadow', recordKey),
      listShadow: () => values('shadow'),
      deleteShadow: (recordKey) => remove('shadow', recordKey),
      putConflict: (conflict) => put('conflicts', conflict.id, conflict),
      getConflict: (conflictId) => get('conflicts', conflictId),
      listConflicts: () => values('conflicts'),
      deleteConflict: (conflictId) => remove('conflicts', conflictId),
      clearCloudState
    });
  }

  root.dataStorage = Object.freeze({ createStore, assertSafe });
})(globalThis);
