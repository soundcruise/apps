import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PRACTICE_ATTACHMENT_DB_NAME,
    PRACTICE_ATTACHMENT_DB_VERSION,
    PRACTICE_ATTACHMENT_INDEX_NAME,
    PRACTICE_ATTACHMENT_LIMITS,
    PRACTICE_ATTACHMENT_STORE_NAME,
    createPracticeAttachmentStore as createAttachmentStore,
    isSafePracticeAttachmentInlineOpen,
    isSafePracticeImagePreview
} from './practice-menu-attachment-store.js';

const createPracticeAttachmentStore = options => createAttachmentStore({ canWrite: () => true, ...options });

test('Standard retains read/delete but cannot write, including capability changes during await', async () => {
    const indexedDBObject = createFakeIndexedDB();
    let allowed = true;
    const store = createAttachmentStore({ indexedDBObject, canWrite: () => allowed });
    const blob = new Blob(['QA'], { type: 'text/plain' });
    const first = await store.addAttachment('qa', blob, { fileName: 'qa.txt' });
    assert.equal(first.ok, true);
    allowed = false;
    assert.equal((await store.getAttachments('qa')).records.length, 1);
    assert.equal((await store.addAttachment('qa', blob, { fileName: 'blocked.txt' })).reason, 'pro-required');
    let checks = 0;
    const changing = createAttachmentStore({ indexedDBObject, canWrite: () => ++checks === 1 });
    assert.equal((await changing.addAttachment('qa', blob, { fileName: 'changed.txt' })).reason, 'pro-required');
    assert.equal(indexedDBObject.records.size, 1);
    assert.equal((await store.deleteAttachment(first.record.id)).ok, true);
    assert.equal(indexedDBObject.records.size, 0);
});

function createFakeIndexedDB() {
    const records = new Map();
    const calls = [];
    let created = false;
    const database = {
        objectStoreNames: { contains: (name) => created && name === PRACTICE_ATTACHMENT_STORE_NAME },
        createObjectStore(name, options) {
            created = true;
            calls.push(['createObjectStore', name, options]);
            return { createIndex(indexName, keyPath, indexOptions) { calls.push(['createIndex', indexName, keyPath, indexOptions]); } };
        },
        transaction(name, mode) {
            calls.push(['transaction', name, mode]);
            const transaction = { error: null };
            const store = {
                add(record) { queueMicrotask(() => { records.set(record.id, record); transaction.oncomplete?.(); }); },
                delete(id) { queueMicrotask(() => { records.delete(id); transaction.oncomplete?.(); }); },
                index(name) {
                    assert.equal(name, PRACTICE_ATTACHMENT_INDEX_NAME);
                    return {
                        getAll(practiceId) {
                            const request = {};
                            queueMicrotask(() => {
                                request.result = [...records.values()].filter((record) => record.practiceId === practiceId);
                                request.onsuccess?.();
                            });
                            return request;
                        },
                        count(practiceId) {
                            const request = {};
                            queueMicrotask(() => {
                                request.result = [...records.values()].filter((record) => record.practiceId === practiceId).length;
                                request.onsuccess?.();
                            });
                            return request;
                        }
                    };
                }
            };
            transaction.objectStore = () => store;
            return transaction;
        }
    };
    return {
        records,
        calls,
        open(name, version) {
            calls.push(['open', name, version]);
            const request = {};
            queueMicrotask(() => {
                request.result = database;
                request.onupgradeneeded?.();
                request.onsuccess?.();
            });
            return request;
        }
    };
}

test('separate IndexedDB stores multiple image and PDF attachments by practice', async () => {
    const indexedDBObject = createFakeIndexedDB();
    const store = createPracticeAttachmentStore({ indexedDBObject });
    const image = await store.addAttachment('practice-a', new Blob(['image'], { type: 'image/png' }), {
        fileName: 'photo.png', idFactory: () => 'image-1', now: new Date('2026-09-08T01:00:00Z')
    });
    const pdf = await store.addAttachment('practice-a', new Blob(['pdf'], { type: 'application/pdf' }), {
        fileName: 'score.pdf', idFactory: () => 'pdf-1', now: new Date('2026-09-08T01:01:00Z')
    });
    await store.addAttachment('practice-b', new Blob(['text'], { type: 'text/plain' }), {
        fileName: 'note.txt', idFactory: () => 'text-1', now: new Date('2026-09-08T01:02:00Z')
    });
    assert.equal(image.record.kind, 'image');
    assert.equal(pdf.record.kind, 'file');
    assert.deepEqual((await store.getAttachments('practice-a')).records.map(({ id }) => id), ['image-1', 'pdf-1']);
    assert.deepEqual(await store.getAttachmentCounts(['practice-a', 'practice-b', 'practice-a']), {
        ok: true,
        counts: { 'practice-a': 2, 'practice-b': 1 }
    });
    assert.deepEqual(indexedDBObject.calls[0], ['open', PRACTICE_ATTACHMENT_DB_NAME, PRACTICE_ATTACHMENT_DB_VERSION]);
    assert.deepEqual(indexedDBObject.calls[2], ['createIndex', PRACTICE_ATTACHMENT_INDEX_NAME, 'practiceId', { unique: false }]);
});

test('individual and practice cleanup never clear unrelated records', async () => {
    const indexedDBObject = createFakeIndexedDB();
    const store = createPracticeAttachmentStore({ indexedDBObject });
    await store.addAttachment('practice-a', new Blob(['a'], { type: 'application/pdf' }), { fileName: 'a.pdf', idFactory: () => 'a' });
    await store.addAttachment('practice-a', new Blob(['b'], { type: 'application/pdf' }), { fileName: 'b.pdf', idFactory: () => 'b' });
    await store.addAttachment('practice-b', new Blob(['c'], { type: 'application/pdf' }), { fileName: 'c.pdf', idFactory: () => 'c' });
    assert.deepEqual(await store.deleteAttachment('a'), { ok: true });
    assert.deepEqual(await store.deleteAttachmentsForPractice('practice-a'), { ok: true, deletedCount: 1 });
    assert.deepEqual((await store.getAttachments('practice-b')).records.map(({ id }) => id), ['c']);
});

test('size, count, malformed record, and unavailable DB fail safely', async () => {
    const indexedDBObject = createFakeIndexedDB();
    const store = createPracticeAttachmentStore({ indexedDBObject });
    const tooLarge = new Blob([new Uint8Array(PRACTICE_ATTACHMENT_LIMITS.imageBytes + 1)], { type: 'image/png' });
    assert.equal((await store.addAttachment('practice-a', tooLarge, { fileName: 'large.png' })).reason, 'invalid-record');
    assert.equal((await store.addAttachment('', new Blob(['x'], { type: 'text/plain' }), { fileName: 'x.txt' })).reason, 'invalid-record');
    const unavailable = createPracticeAttachmentStore({ indexedDBObject: null });
    assert.equal((await unavailable.getAttachments('practice-a')).reason, 'read-failed');
});

test('HTML and SVG are stored as files but never inline-previewed', () => {
    assert.equal(isSafePracticeImagePreview('image/png'), true);
    assert.equal(isSafePracticeImagePreview('image/svg+xml'), false);
    assert.equal(isSafePracticeAttachmentInlineOpen('application/pdf'), true);
    assert.equal(isSafePracticeAttachmentInlineOpen('text/html'), false);
    assert.equal(isSafePracticeAttachmentInlineOpen('image/svg+xml'), false);
});
