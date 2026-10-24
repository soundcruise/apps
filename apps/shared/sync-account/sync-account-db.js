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

  async function set(key, value, indexedDb, check = () => {}) {
    assertSafeValue(key, value);
    const expectedGeneration = generation;
    const database = await open(indexedDb);
    try {
      check();
      if (expectedGeneration !== generation) throw new Error('account_generation_changed');
      const current = transaction(database, 'readwrite');
      const done = transactionDone(current);
      const unwatch = watchTransaction(current, expectedGeneration);
      try {
        current.objectStore(STORE_NAME).put(structuredClone(value), key);
      } catch (_) {
        try { current.abort(); } catch (_) { /* already inactive */ }
        await done.catch(() => {});
        unwatch();
        throw storageError('account_storage_write_failed');
      }
      try { await done; } finally { unwatch(); }
    } catch (error) {
      closeDatabase(database);
      throw error?.category === 'storage' ? error : storageError('account_storage_write_failed');
    }
  }

  async function remove(key, indexedDb, check = () => {}) {
    if (!ALLOWED_KEYS.has(key)) throw new Error('account_storage_invalid');
    const expectedGeneration = generation;
    const database = await open(indexedDb);
    try {
      check();
      if (expectedGeneration !== generation) throw new Error('account_generation_changed');
      const current = transaction(database, 'readwrite');
      const done = transactionDone(current);
      const unwatch = watchTransaction(current, expectedGeneration);
      try {
        current.objectStore(STORE_NAME).delete(key);
      } catch (_) {
        try { current.abort(); } catch (_) { /* already inactive */ }
        await done.catch(() => {});
        unwatch();
        throw storageError('account_storage_write_failed');
      }
      try { await done; } finally { unwatch(); }
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

  // Invalidate consumers before an Account write can publish. Only a notification,
  // never credentials, travels between tabs.
  let generation = 0;
  const accountListeners = new Set();
  const accountTransactions = new Map();
  function watchTransaction(transaction, epoch) {
    accountTransactions.set(transaction, epoch);
    return () => accountTransactions.delete(transaction);
  }
  const channel = global.document && global.BroadcastChannel
    ? new global.BroadcastChannel('sound-cruise-account-generation-v1') : null;
  function invalidate(broadcast = true) {
    generation += 1;
    for (const [transaction, epoch] of accountTransactions) {
      if (epoch !== generation) { try { transaction.abort(); } catch (_) {} }
    }
    for (const listener of accountListeners) { try { listener(generation); } catch (_) {} }
    if (broadcast) channel?.postMessage({ changed: true });
    return generation;
  }
  if (channel) channel.onmessage = () => invalidate(false);
  async function changeAccount(value, indexedDb) {
    const current = invalidate();
    const check = () => { if (current !== generation) throw new Error('account_generation_changed'); };
    await (value === null ? remove('account', indexedDb, check) : set('account', value, indexedDb, check));
    if (current !== generation) throw new Error('account_generation_changed');
    return Object.freeze({ generation: invalidate() });
  }

  // Explicit coordinated callers only; existing Account flows are unchanged.
  // The comparison and replacement share ONE Account DB transaction. A prior
  // asynchronous read (or a BroadcastChannel hint) is not a compare-and-set.
  async function changeAccountIfCurrent(expected, value, indexedDb) {
    const identity = candidate => candidate && typeof candidate.accountId === 'string' && candidate.accountId &&
      typeof candidate.accountCredential === 'string' && candidate.accountCredential
      ? [candidate.accountId, candidate.accountCredential, candidate.accountDeviceId ?? null] : null;
    const expectedIdentity = identity(expected);
    if (!expectedIdentity || (value !== null && !identity(value))) throw new Error('account_identity_invalid');
    if (value !== null) assertSafeValue('account', value);
    const replacement = value === null ? null : structuredClone(value);
    let current = generation;
    const database = await open(indexedDb);
    if (current !== generation) throw new Error('account_generation_changed');
    const tx = transaction(database, 'readwrite'), done = transactionDone(tx);
    let unwatch = () => {};
    let mismatch = false;
    try {
      const store = tx.objectStore(STORE_NAME), read = store.get('account');
      read.onsuccess = () => {
        if (current !== generation || JSON.stringify(identity(read.result)) !== JSON.stringify(expectedIdentity)) {
          mismatch = true;
          try { tx.abort(); } catch (_) { /* already inactive */ }
          return;
        }
        // An obsolete A must not even invalidate B's local observers. Once the
        // transaction has confirmed A, invalidate synchronously BEFORE put and
        // register this very transaction against the resulting generation.
        current = invalidate();
        unwatch = watchTransaction(tx, current);
        try { replacement === null ? store.delete('account') : store.put(replacement, 'account'); }
        catch (_) { try { tx.abort(); } catch (_) { /* already inactive */ } }
      };
      await done;
      if (current !== generation) throw new Error('account_generation_changed');
      return Object.freeze({ generation: invalidate() });
    } catch (error) {
      if (mismatch) throw new Error('account_identity_changed');
      throw error;
    } finally { unwatch(); }
  }

  root.storage = Object.freeze({
    DATABASE_NAME,
    getGeneration: () => generation,
    subscribeAccount: listener => { accountListeners.add(listener); return () => accountListeners.delete(listener); },
    getAccount: (indexedDb) => get('account', indexedDb),
    setAccount: (value, indexedDb) => changeAccount(value, indexedDb),
    clearAccount: (indexedDb) => changeAccount(null, indexedDb),
    changeAccountIfCurrent,
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
