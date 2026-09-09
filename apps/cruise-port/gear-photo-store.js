export const GEAR_PHOTO_DB_NAME = 'cruisePortGear';
export const GEAR_PHOTO_DB_VERSION = 1;
export const GEAR_PHOTO_STORE_NAME = 'photos';

const PHOTO_KINDS = new Set(['source', 'final']);
const OUTPUT_MIME_TYPES = new Set(['image/webp', 'image/png']);

function createPhotoId() {
    return globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isIsoDate(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isValidRecord(record) {
    return Boolean(
        record
        && typeof record.id === 'string'
        && record.id
        && PHOTO_KINDS.has(record.kind)
        && record.blob instanceof Blob
        && OUTPUT_MIME_TYPES.has(record.mimeType)
        && record.blob.type === record.mimeType
        && record.byteSize === record.blob.size
        && record.byteSize > 0
        && Number.isInteger(record.width)
        && record.width > 0
        && Number.isInteger(record.height)
        && record.height > 0
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
            request = indexedDBObject.open(GEAR_PHOTO_DB_NAME, GEAR_PHOTO_DB_VERSION);
        } catch (error) {
            reject(error);
            return;
        }
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(GEAR_PHOTO_STORE_NAME)) {
                request.result.createObjectStore(GEAR_PHOTO_STORE_NAME, { keyPath: 'id' });
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
            transaction = database.transaction(GEAR_PHOTO_STORE_NAME, mode);
            operation(transaction.objectStore(GEAR_PHOTO_STORE_NAME));
        } catch (error) {
            reject(error);
            return;
        }
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || new Error('indexeddb-transaction-aborted'));
        transaction.onerror = () => reject(transaction.error || new Error('indexeddb-transaction-failed'));
    });
}

export function createGearPhotoStore({ indexedDBObject } = {}) {
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
        async savePhoto(blob, { kind, width, height, now = new Date(), idFactory = createPhotoId } = {}) {
            const record = {
                id: idFactory(),
                kind,
                blob,
                mimeType: blob?.type,
                byteSize: blob?.size,
                width,
                height,
                createdAt: now.toISOString()
            };
            if (!isValidRecord(record)) return { ok: false, reason: 'invalid-record' };
            try {
                const database = await getDatabase();
                await runTransaction(database, 'readwrite', (store) => store.add(record));
                return { ok: true, record: { ...record } };
            } catch (_) {
                return { ok: false, reason: 'write-failed' };
            }
        },

        async getPhoto(id) {
            if (typeof id !== 'string' || !id) return { ok: false, record: null, reason: 'invalid-id' };
            try {
                const database = await getDatabase();
                const record = await new Promise((resolve, reject) => {
                    const transaction = database.transaction(GEAR_PHOTO_STORE_NAME, 'readonly');
                    const request = transaction.objectStore(GEAR_PHOTO_STORE_NAME).get(id);
                    request.onsuccess = () => resolve(request.result || null);
                    request.onerror = () => reject(request.error || new Error('indexeddb-read-failed'));
                });
                return isValidRecord(record) ? { ok: true, record: { ...record } } : { ok: true, record: null };
            } catch (_) {
                return { ok: false, record: null, reason: 'read-failed' };
            }
        },

        async deletePhoto(id) {
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
