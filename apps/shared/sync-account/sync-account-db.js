(function installSyncAccountDb(global) {
  'use strict';

  const root = global.SoundCruiseSyncAccount = global.SoundCruiseSyncAccount || {};
  const DATABASE_NAME = 'sound-cruise-sync-account';
  const STORE_NAME = 'meta';
  const VERSION = 1;
  const ALLOWED_KEYS = new Set(['account', 'pendingStart', 'pendingConsume', 'pendingBridge']);

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('account_storage_failed'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('account_storage_failed'));
      transaction.onerror = () => reject(transaction.error || new Error('account_storage_failed'));
    });
  }

  async function open(indexedDb = global.indexedDB) {
    if (!indexedDb || typeof indexedDb.open !== 'function') throw new Error('account_storage_unavailable');
    const request = indexedDb.open(DATABASE_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    return requestResult(request);
  }

  function assertSafeValue(key, value) {
    if (!ALLOWED_KEYS.has(key) || !value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('account_storage_invalid');
    }
    const serialized = JSON.stringify(value);
    if (/recoveryCode|handoffToken/i.test(serialized) ||
        /sch1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/.test(serialized) ||
        /SAR1(?:-?[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}){5}/.test(serialized)) {
      throw new Error('transient_secret_persistence_blocked');
    }
  }

  async function get(key, indexedDb) {
    if (!ALLOWED_KEYS.has(key)) throw new Error('account_storage_invalid');
    const database = await open(indexedDb);
    try {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      return (await requestResult(transaction.objectStore(STORE_NAME).get(key))) || null;
    } finally {
      database.close();
    }
  }

  async function set(key, value, indexedDb) {
    assertSafeValue(key, value);
    const database = await open(indexedDb);
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(structuredClone(value), key);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }

  async function remove(key, indexedDb) {
    if (!ALLOWED_KEYS.has(key)) throw new Error('account_storage_invalid');
    const database = await open(indexedDb);
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }

  root.storage = Object.freeze({
    DATABASE_NAME,
    getAccount: (indexedDb) => get('account', indexedDb),
    setAccount: (value, indexedDb) => set('account', value, indexedDb),
    getPendingStart: (indexedDb) => get('pendingStart', indexedDb),
    setPendingStart: (value, indexedDb) => set('pendingStart', value, indexedDb),
    clearPendingStart: (indexedDb) => remove('pendingStart', indexedDb),
    getPendingConsume: (indexedDb) => get('pendingConsume', indexedDb),
    setPendingConsume: (value, indexedDb) => set('pendingConsume', value, indexedDb),
    clearPendingConsume: (indexedDb) => remove('pendingConsume', indexedDb),
    getPendingBridge: (indexedDb) => get('pendingBridge', indexedDb),
    setPendingBridge: (value, indexedDb) => set('pendingBridge', value, indexedDb),
    clearPendingBridge: (indexedDb) => remove('pendingBridge', indexedDb)
  });
})(globalThis);
