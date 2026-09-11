import { createSecureId } from './my-apps-store.js?v=0.24.0';
import { getCapabilities } from './cruise-port-capabilities.js?v=0.27.0';

export const MY_APPS_ICON_DB_NAME = 'cruisePortMyApps';
export const MY_APPS_ICON_DB_VERSION = 1;
export const MY_APPS_ICON_STORE_NAME = 'icons';

const OUTPUT_MIME_TYPES = Object.freeze(['image/webp', 'image/png']);

function isIsoDate(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isValidRecord(record) {
    return Boolean(
        record
        && typeof record === 'object'
        && typeof record.id === 'string'
        && record.id.length > 0
        && record.blob instanceof Blob
        && OUTPUT_MIME_TYPES.includes(record.mimeType)
        && record.blob.type === record.mimeType
        && Number.isInteger(record.byteSize)
        && record.byteSize === record.blob.size
        && record.byteSize > 0
        && isIsoDate(record.createdAt)
    );
}

function openDatabase(indexedDBObject) {
    return new Promise((resolve, reject) => {
        if (indexedDBObject === undefined) indexedDBObject = globalThis.indexedDB;
        if (!indexedDBObject?.open) {
            reject(new Error('indexeddb-unavailable'));
            return;
        }

        let request;
        try {
            request = indexedDBObject.open(MY_APPS_ICON_DB_NAME, MY_APPS_ICON_DB_VERSION);
        } catch (error) {
            reject(error);
            return;
        }

        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(MY_APPS_ICON_STORE_NAME)) {
                database.createObjectStore(MY_APPS_ICON_STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('indexeddb-open-failed'));
        request.onblocked = () => reject(new Error('indexeddb-open-blocked'));
    });
}

function runTransaction(database, mode, operation) {
    return new Promise((resolve, reject) => {
        let transaction;
        try {
            transaction = database.transaction(MY_APPS_ICON_STORE_NAME, mode);
            operation(transaction.objectStore(MY_APPS_ICON_STORE_NAME), transaction);
        } catch (error) {
            reject(error);
            return;
        }
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || new Error('indexeddb-transaction-aborted'));
        transaction.onerror = () => reject(transaction.error || new Error('indexeddb-transaction-failed'));
    });
}

export function createMyAppsIconStore({ indexedDBObject, canWrite = () => getCapabilities().customMyAppIconWrite } = {}) {
    let databasePromise = null;

    function getDatabase() {
        if (!databasePromise) {
            databasePromise = openDatabase(indexedDBObject).catch((error) => {
                databasePromise = null;
                throw error;
            });
        }
        return databasePromise;
    }

    return Object.freeze({
        async saveIcon(blob, { now = new Date(), idFactory = createSecureId } = {}) {
            if (!canWrite()) return { ok: false, reason: 'pro-required' };
            if (!(blob instanceof Blob) || !OUTPUT_MIME_TYPES.includes(blob.type) || blob.size < 1) {
                return { ok: false, reason: 'invalid-blob' };
            }
            let record;
            try {
                record = {
                    id: idFactory(),
                    blob,
                    mimeType: blob.type,
                    byteSize: blob.size,
                    createdAt: now.toISOString()
                };
                if (!isValidRecord(record)) return { ok: false, reason: 'invalid-record' };
                const database = await getDatabase();
                if (!canWrite()) return { ok: false, reason: 'pro-required' };
                await runTransaction(database, 'readwrite', (store) => store.add(record));
                return { ok: true, record: { ...record } };
            } catch (_) {
                return { ok: false, reason: 'write-failed' };
            }
        },

        async getIcon(id) {
            if (typeof id !== 'string' || !id) return { ok: false, record: null, reason: 'invalid-id' };
            try {
                const database = await getDatabase();
                const record = await new Promise((resolve, reject) => {
                    const transaction = database.transaction(MY_APPS_ICON_STORE_NAME, 'readonly');
                    const request = transaction.objectStore(MY_APPS_ICON_STORE_NAME).get(id);
                    request.onsuccess = () => resolve(request.result || null);
                    request.onerror = () => reject(request.error || new Error('indexeddb-read-failed'));
                });
                return isValidRecord(record)
                    ? { ok: true, record: { ...record } }
                    : { ok: true, record: null };
            } catch (_) {
                return { ok: false, record: null, reason: 'read-failed' };
            }
        },

        async deleteIcon(id) {
            if (typeof id !== 'string' || !id) return { ok: false, reason: 'invalid-id' };
            try {
                const database = await getDatabase();
                await runTransaction(database, 'readwrite', (store) => store.delete(id));
                return { ok: true };
            } catch (_) {
                return { ok: false, reason: 'delete-failed' };
            }
        }
    });
}
