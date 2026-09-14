(function installSyncAccountDb(global) {
  'use strict';

  const root = global.SoundCruiseSyncAccount = global.SoundCruiseSyncAccount || {};
  const DATABASE_NAME = 'sound-cruise-sync-account';
  const STORE_NAME = 'meta';
  const VERSION = 1;
  const ALLOWED_KEYS = new Set(['account', 'qaAdmission', 'pendingStart', 'pendingConsume', 'pendingBridge']);
  const QA_APP_IDS = new Set(['chord', 'pitch', 'fretboard', 'rhythm']);

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

  function qaSlot(scope, appId) {
    if (scope === 'port' && appId == null) return 'port';
    if (scope === 'app' && QA_APP_IDS.has(appId)) return `app:${appId}`;
    throw new Error('qa_admission_scope_invalid');
  }

  async function getQaAdmission(scope = 'port', appId = null, indexedDb) {
    const values = await get('qaAdmission', indexedDb);
    return values?.[qaSlot(scope, appId)] || null;
  }

  async function setQaAdmission(value, indexedDb) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('qa_admission_scope_invalid');
    }
    const slot = qaSlot(value.scope, value.appId || null);
    const database = await open(indexedDb);
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const current = (await requestResult(store.get('qaAdmission'))) || {};
      const next = { ...current, [slot]: structuredClone(value) };
      assertSafeValue('qaAdmission', next);
      store.put(next, 'qaAdmission');
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }

  async function clearQaAdmission(scope = 'port', appId = null, indexedDb) {
    const slot = qaSlot(scope, appId);
    const database = await open(indexedDb);
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const current = (await requestResult(store.get('qaAdmission'))) || {};
      const next = { ...current };
      delete next[slot];
      if (Object.keys(next).length) store.put(next, 'qaAdmission');
      else store.delete('qaAdmission');
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }

  root.storage = Object.freeze({
    DATABASE_NAME,
    getAccount: (indexedDb) => get('account', indexedDb),
    setAccount: (value, indexedDb) => set('account', value, indexedDb),
    getQaAdmission,
    setQaAdmission,
    clearQaAdmission,
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
