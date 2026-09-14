(function installSyncAppBackup(global) {
  'use strict';

  const root = global.SoundCruiseSyncAccount = global.SoundCruiseSyncAccount || {};
  const DATABASE_NAME = 'sound-cruise-sync-app-backups';
  const STORE_NAME = 'backups';
  const VERSION = 1;
  const MAX_BACKUPS_PER_APP = 5;
  const APP_IDS = new Set(['chord', 'pitch', 'fretboard', 'rhythm']);
  const FORBIDDEN_KEY = /(?:auth|credential|recovery|pairing|handoff|join|token|secret)/iu;
  const FORBIDDEN_VALUE = /(?:sc[adh]1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}|(?:SAR1|SCJ1)(?:-?[0-9A-Z]{4}){5})/u;

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('app_backup_storage_failed'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('app_backup_storage_failed'));
      transaction.onerror = () => reject(transaction.error || new Error('app_backup_storage_failed'));
    });
  }

  function assertSafeBackup(value) {
    if (!value || value.version !== 1 || !APP_IDS.has(value.appId) ||
        !Number.isSafeInteger(value.createdAt) || !value.values ||
        typeof value.values !== 'object' || Array.isArray(value.values)) {
      throw new Error('app_backup_invalid');
    }
    if (Object.keys(value.values).some((key) => FORBIDDEN_KEY.test(key)) ||
        FORBIDDEN_VALUE.test(JSON.stringify(value.values))) {
      throw new Error('app_backup_secret_forbidden');
    }
    return true;
  }

  async function open(indexedDb = global.indexedDB) {
    if (!indexedDb || typeof indexedDb.open !== 'function') throw new Error('app_backup_storage_unavailable');
    const request = indexedDb.open(DATABASE_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('byAppCreated', ['appId', 'createdAt']);
      }
    };
    return requestResult(request);
  }

  async function save(value, indexedDb) {
    assertSafeBackup(value);
    const database = await open(indexedDb);
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(structuredClone({
        ...value, id: `${value.appId}:${value.createdAt}:${global.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`
      }));
      await transactionDone(transaction);
    } finally {
      database.close();
    }
    await prune(value.appId, MAX_BACKUPS_PER_APP, indexedDb);
  }

  async function prune(appId, keep = MAX_BACKUPS_PER_APP, indexedDb) {
    if (!APP_IDS.has(appId) || !Number.isSafeInteger(keep) || keep < 1 || keep > 20) {
      throw new Error('app_backup_invalid');
    }
    const database = await open(indexedDb);
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const done = transactionDone(transaction);
      const index = transaction.objectStore(STORE_NAME).index('byAppCreated');
      const range = IDBKeyRange.bound([appId, 0], [appId, Number.MAX_SAFE_INTEGER]);
      const request = index.openCursor(range, 'prev');
      let seen = 0;
      await new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { resolve(); return; }
          seen += 1;
          if (seen > keep) cursor.delete();
          cursor.continue();
        };
        request.onerror = () => reject(request.error || new Error('app_backup_storage_failed'));
      });
      await done;
    } finally {
      database.close();
    }
  }

  async function latest(appId, indexedDb) {
    if (!APP_IDS.has(appId)) throw new Error('app_backup_invalid');
    const database = await open(indexedDb);
    try {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const index = transaction.objectStore(STORE_NAME).index('byAppCreated');
      const range = IDBKeyRange.bound([appId, 0], [appId, Number.MAX_SAFE_INTEGER]);
      const request = index.openCursor(range, 'prev');
      const cursor = await requestResult(request);
      if (!cursor) return null;
      const { id: _id, ...value } = cursor.value;
      return value;
    } finally {
      database.close();
    }
  }

  root.appBackupStorage = Object.freeze({
    DATABASE_NAME, MAX_BACKUPS_PER_APP, save, latest, prune, assertSafeBackup
  });
})(globalThis);
