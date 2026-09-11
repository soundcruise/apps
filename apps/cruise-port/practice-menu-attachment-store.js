import { getCapabilities } from './cruise-port-capabilities.js?v=0.27.0';

export const PRACTICE_ATTACHMENT_DB_NAME = 'cruisePortPractice';
export const PRACTICE_ATTACHMENT_DB_VERSION = 1;
export const PRACTICE_ATTACHMENT_STORE_NAME = 'attachments';
export const PRACTICE_ATTACHMENT_INDEX_NAME = 'practiceId';
export const PRACTICE_ATTACHMENT_LIMITS = Object.freeze({
    countPerPractice: 10,
    imageBytes: 15 * 1024 * 1024,
    fileBytes: 20 * 1024 * 1024,
    fileName: 255
});

const SAFE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const SAFE_INLINE_TYPES = new Set([...SAFE_IMAGE_TYPES, 'application/pdf', 'text/plain']);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

function createAttachmentId() {
    return globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isIsoDate(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function isSafePracticeImagePreview(mimeType) {
    return SAFE_IMAGE_TYPES.has(mimeType);
}

export function isSafePracticeAttachmentInlineOpen(mimeType) {
    return SAFE_INLINE_TYPES.has(mimeType) || /^audio\/(mpeg|mp4|wav|ogg|webm)$/u.test(mimeType);
}

function normalizeFileName(value) {
    return typeof value === 'string' ? value.trim().slice(0, PRACTICE_ATTACHMENT_LIMITS.fileName) : '';
}

function normalizeMimeType(blob) {
    return typeof blob?.type === 'string' && blob.type ? blob.type.toLowerCase() : 'application/octet-stream';
}

function isValidRecord(record) {
    const limit = record?.kind === 'image'
        ? PRACTICE_ATTACHMENT_LIMITS.imageBytes
        : PRACTICE_ATTACHMENT_LIMITS.fileBytes;
    return Boolean(
        record
        && typeof record === 'object'
        && typeof record.id === 'string'
        && record.id.length > 0
        && typeof record.practiceId === 'string'
        && record.practiceId.length > 0
        && ['image', 'file'].includes(record.kind)
        && record.blob instanceof Blob
        && typeof record.mimeType === 'string'
        && record.mimeType.length > 0
        && record.mimeType.length <= 100
        && (!record.blob.type || record.blob.type.toLowerCase() === record.mimeType)
        && typeof record.fileName === 'string'
        && record.fileName.length > 0
        && record.fileName.length <= PRACTICE_ATTACHMENT_LIMITS.fileName
        && !CONTROL_CHARACTERS.test(record.fileName)
        && record.byteSize === record.blob.size
        && record.byteSize > 0
        && record.byteSize <= limit
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
            request = indexedDBObject.open(PRACTICE_ATTACHMENT_DB_NAME, PRACTICE_ATTACHMENT_DB_VERSION);
        } catch (error) {
            reject(error);
            return;
        }
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(PRACTICE_ATTACHMENT_STORE_NAME)) {
                const store = request.result.createObjectStore(PRACTICE_ATTACHMENT_STORE_NAME, { keyPath: 'id' });
                store.createIndex(PRACTICE_ATTACHMENT_INDEX_NAME, 'practiceId', { unique: false });
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
            transaction = database.transaction(PRACTICE_ATTACHMENT_STORE_NAME, mode);
            operation(transaction.objectStore(PRACTICE_ATTACHMENT_STORE_NAME));
        } catch (error) {
            reject(error);
            return;
        }
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || new Error('indexeddb-transaction-aborted'));
        transaction.onerror = () => reject(transaction.error || new Error('indexeddb-transaction-failed'));
    });
}

export function createPracticeAttachmentStore({ indexedDBObject, canWrite = () => getCapabilities().practiceFileWrite } = {}) {
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

    async function getAttachments(practiceId) {
        if (typeof practiceId !== 'string' || !practiceId) return { ok: false, records: [], reason: 'invalid-id' };
        try {
            const database = await getDatabase();
            const records = await new Promise((resolve, reject) => {
                const transaction = database.transaction(PRACTICE_ATTACHMENT_STORE_NAME, 'readonly');
                const request = transaction.objectStore(PRACTICE_ATTACHMENT_STORE_NAME)
                    .index(PRACTICE_ATTACHMENT_INDEX_NAME)
                    .getAll(practiceId);
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error || new Error('indexeddb-read-failed'));
            });
            return {
                ok: true,
                records: records.filter(isValidRecord).sort((first, second) => first.createdAt.localeCompare(second.createdAt))
                    .map((record) => ({ ...record }))
            };
        } catch (_) {
            return { ok: false, records: [], reason: 'read-failed' };
        }
    }

    async function deleteAttachment(id) {
        if (typeof id !== 'string' || !id) return { ok: false, reason: 'invalid-id' };
        try {
            const database = await getDatabase();
            await runTransaction(database, 'readwrite', (store) => store.delete(id));
            return { ok: true };
        } catch (_) {
            return { ok: false, reason: 'delete-failed' };
        }
    }

    async function getAttachmentCounts(practiceIds) {
        const ids = [...new Set(practiceIds)].filter((practiceId) => typeof practiceId === 'string' && practiceId);
        try {
            const database = await getDatabase();
            const counts = await Promise.all(ids.map((practiceId) => new Promise((resolve, reject) => {
                const transaction = database.transaction(PRACTICE_ATTACHMENT_STORE_NAME, 'readonly');
                const request = transaction.objectStore(PRACTICE_ATTACHMENT_STORE_NAME)
                    .index(PRACTICE_ATTACHMENT_INDEX_NAME)
                    .count(practiceId);
                request.onsuccess = () => resolve([practiceId, request.result || 0]);
                request.onerror = () => reject(request.error || new Error('indexeddb-count-failed'));
            })));
            return { ok: true, counts: Object.fromEntries(counts) };
        } catch (_) {
            return { ok: false, counts: {}, reason: 'read-failed' };
        }
    }

    return Object.freeze({
        async addAttachment(practiceId, blob, { fileName, now = new Date(), idFactory = createAttachmentId } = {}) {
            if (!canWrite()) return { ok: false, reason: 'pro-required' };
            const mimeType = normalizeMimeType(blob);
            const kind = isSafePracticeImagePreview(mimeType) ? 'image' : 'file';
            const record = {
                id: idFactory(),
                practiceId,
                kind,
                blob,
                mimeType,
                fileName: normalizeFileName(fileName),
                byteSize: blob?.size,
                createdAt: now.toISOString()
            };
            if (!isValidRecord(record)) return { ok: false, reason: 'invalid-record' };
            const existing = await getAttachments(practiceId);
            if (!existing.ok) return { ok: false, reason: 'read-failed' };
            if (existing.records.length >= PRACTICE_ATTACHMENT_LIMITS.countPerPractice) {
                return { ok: false, reason: 'limit-reached' };
            }
            try {
                const database = await getDatabase();
                if (!canWrite()) return { ok: false, reason: 'pro-required' };
                await runTransaction(database, 'readwrite', (store) => store.add(record));
                return { ok: true, record: { ...record } };
            } catch (_) {
                return { ok: false, reason: 'write-failed' };
            }
        },
        getAttachments,
        getAttachmentCounts,
        deleteAttachment,
        async deleteAttachmentsForPractice(practiceId) {
            const existing = await getAttachments(practiceId);
            if (!existing.ok) return { ok: false, reason: 'read-failed' };
            const results = await Promise.all(existing.records.map((record) => deleteAttachment(record.id)));
            return results.every((result) => result.ok)
                ? { ok: true, deletedCount: existing.records.length }
                : { ok: false, reason: 'delete-failed' };
        }
    });
}
