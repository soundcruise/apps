(function installSyncAccountDb(global) {
  'use strict';

  const root = global.SoundCruiseSyncAccount = global.SoundCruiseSyncAccount || {};
  const DATABASE_NAME = 'sound-cruise-sync-account';
  const STORE_NAME = 'meta';
  const VERSION = 1;
  const DEFAULT_STORAGE_TIMEOUT_MS = 20_000;
  const ALLOWED_KEYS = new Set([
    'account', 'qaAdmission', 'pendingStart', 'pendingConsume', 'pendingBridge',
    'pendingRecovery', 'pendingDelete', 'pendingDetach', 'pendingEnvironmentDetach'
  ]);
  const QA_APP_IDS = new Set(['chord', 'pitch', 'fretboard', 'rhythm']);
  let activeSource = null;
  let activeDatabase = null;
  let activeOpen = null;

  class AccountStorageError extends Error {
    constructor(code) {
      super(code);
      this.name = 'AccountStorageError';
      this.code = code;
      this.category = 'storage';
    }
  }

  function storageError(code) {
    return new AccountStorageError(code);
  }

  function requestResult(request, {
    errorCode = 'account_storage_read_failed',
    blockedCode = 'account_storage_blocked',
    timeoutMs = DEFAULT_STORAGE_TIMEOUT_MS
  } = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) {
          if (callback === resolve) request.result?.close?.();
          return;
        }
        settled = true;
        global.clearTimeout(timeoutId);
        callback(value);
      };
      const timeoutId = global.setTimeout(() => {
        try { request.transaction?.abort?.(); } catch (_) { /* already inactive */ }
        finish(reject, storageError('account_storage_timeout'));
      }, timeoutMs);
      request.onsuccess = () => finish(resolve, request.result);
      request.onerror = () => finish(reject, storageError(errorCode));
      request.onblocked = () => finish(reject, storageError(blockedCode));
    });
  }

  function transactionDone(transaction, timeoutMs = DEFAULT_STORAGE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        global.clearTimeout(timeoutId);
        callback(value);
      };
      const timeoutId = global.setTimeout(() => {
        try { transaction.abort(); } catch (_) { /* already inactive */ }
        finish(reject, storageError('account_storage_timeout'));
      }, timeoutMs);
      transaction.oncomplete = () => finish(resolve);
      transaction.onabort = () => finish(reject, storageError('account_storage_transaction_failed'));
      transaction.onerror = () => finish(reject, storageError('account_storage_transaction_failed'));
    });
  }

  function closeDatabase(database = activeDatabase) {
    if (!database) return;
    try { database.close(); } catch (_) { /* already closed */ }
    if (database === activeDatabase) {
      activeDatabase = null;
      activeSource = null;
    }
  }

  function transaction(database, mode) {
    try {
      return database.transaction(STORE_NAME, mode);
    } catch (_) {
      closeDatabase(database);
      throw storageError('account_storage_transaction_failed');
    }
  }

  async function open(indexedDb = global.indexedDB) {
    if (!indexedDb || typeof indexedDb.open !== 'function') {
      throw storageError('account_storage_unavailable');
    }
    if (activeDatabase && activeSource === indexedDb) return activeDatabase;
    if (activeOpen && activeSource === indexedDb) return activeOpen;
    if (activeDatabase && activeSource !== indexedDb) closeDatabase();

    let request;
    try {
      request = indexedDb.open(DATABASE_NAME, VERSION);
    } catch (_) {
      throw storageError('account_storage_open_failed');
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    activeSource = indexedDb;
    const opening = requestResult(request, { errorCode: 'account_storage_open_failed' });
    activeOpen = opening;
    try {
      const database = await opening;
      if (!database?.objectStoreNames?.contains?.(STORE_NAME)) {
        try { database?.close?.(); } catch (_) { /* best effort */ }
        throw storageError('account_storage_schema_invalid');
      }
      database.onversionchange = () => closeDatabase(database);
      activeDatabase = database;
      return database;
    } catch (error) {
      activeSource = null;
      throw error?.category === 'storage' ? error : storageError('account_storage_open_failed');
    } finally {
      if (activeOpen === opening) activeOpen = null;
    }
  }

  function assertSafeValue(key, value) {
    if (!ALLOWED_KEYS.has(key) || !value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('account_storage_invalid');
    }
    const serialized = JSON.stringify(value);
    if (/recoveryCode|handoffToken|joinCode/i.test(serialized) ||
        /sch1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/.test(serialized) ||
        /SCJ1(?:-?[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}){5}/.test(serialized) ||
        /SAR1(?:-?[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}){5}/.test(serialized)) {
      throw new Error('transient_secret_persistence_blocked');
    }
  }

  async function get(key, indexedDb) {
    if (!ALLOWED_KEYS.has(key)) throw new Error('account_storage_invalid');
    const database = await open(indexedDb);
    try {
      const current = transaction(database, 'readonly');
      return (await requestResult(current.objectStore(STORE_NAME).get(key))) || null;
    } catch (error) {
      closeDatabase(database);
      throw error?.category === 'storage' ? error : storageError('account_storage_read_failed');
    }
  }

  async function set(key, value, indexedDb) {
    assertSafeValue(key, value);
    const database = await open(indexedDb);
    try {
      const current = transaction(database, 'readwrite');
      const done = transactionDone(current);
      try {
        current.objectStore(STORE_NAME).put(structuredClone(value), key);
      } catch (_) {
        try { current.abort(); } catch (_) { /* already inactive */ }
        await done.catch(() => {});
        throw storageError('account_storage_write_failed');
      }
      await done;
    } catch (error) {
      closeDatabase(database);
      throw error?.category === 'storage' ? error : storageError('account_storage_write_failed');
    }
  }

  async function remove(key, indexedDb) {
    if (!ALLOWED_KEYS.has(key)) throw new Error('account_storage_invalid');
    const database = await open(indexedDb);
    try {
      const current = transaction(database, 'readwrite');
      const done = transactionDone(current);
      try {
        current.objectStore(STORE_NAME).delete(key);
      } catch (_) {
        try { current.abort(); } catch (_) { /* already inactive */ }
        await done.catch(() => {});
        throw storageError('account_storage_write_failed');
      }
      await done;
    } catch (error) {
      closeDatabase(database);
      throw error?.category === 'storage' ? error : storageError('account_storage_write_failed');
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
    const current = (await get('qaAdmission', indexedDb)) || {};
    return set('qaAdmission', { ...current, [slot]: structuredClone(value) }, indexedDb);
  }

  async function clearQaAdmission(scope = 'port', appId = null, indexedDb) {
    const slot = qaSlot(scope, appId);
    const current = (await get('qaAdmission', indexedDb)) || {};
    const next = { ...current };
    delete next[slot];
    if (Object.keys(next).length) return set('qaAdmission', next, indexedDb);
    return remove('qaAdmission', indexedDb);
  }

  root.storage = Object.freeze({
    DATABASE_NAME,
    getAccount: (indexedDb) => get('account', indexedDb),
    setAccount: (value, indexedDb) => set('account', value, indexedDb),
    clearAccount: (indexedDb) => remove('account', indexedDb),
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
    clearPendingBridge: (indexedDb) => remove('pendingBridge', indexedDb),
    getPendingRecovery: (indexedDb) => get('pendingRecovery', indexedDb),
    setPendingRecovery: (value, indexedDb) => set('pendingRecovery', value, indexedDb),
    clearPendingRecovery: (indexedDb) => remove('pendingRecovery', indexedDb),
    getPendingDelete: (indexedDb) => get('pendingDelete', indexedDb),
    setPendingDelete: (value, indexedDb) => set('pendingDelete', value, indexedDb),
    clearPendingDelete: (indexedDb) => remove('pendingDelete', indexedDb),
    getPendingDetach: (indexedDb) => get('pendingDetach', indexedDb),
    setPendingDetach: (value, indexedDb) => set('pendingDetach', value, indexedDb),
    clearPendingDetach: (indexedDb) => remove('pendingDetach', indexedDb),
    getPendingEnvironmentDetach: (indexedDb) => get('pendingEnvironmentDetach', indexedDb),
    setPendingEnvironmentDetach: (value, indexedDb) => set('pendingEnvironmentDetach', value, indexedDb),
    clearPendingEnvironmentDetach: (indexedDb) => remove('pendingEnvironmentDetach', indexedDb)
  });
})(globalThis);
