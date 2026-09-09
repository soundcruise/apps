import assert from 'node:assert/strict';
import test from 'node:test';

test('image store refuses Standard writes and rechecks after DB await', async () => {
    const db = createFakeIndexedDB();
    const blob = new Blob(['image'], {type:'image/webp'});
    const blocked = createPhotoStore({indexedDBObject:db,canWrite:()=>false});
    assert.equal((await blocked.savePhoto(blob, { kind:'final', width:512, height:512 })).reason,'pro-required');
    let checks=0;
    const changed = createPhotoStore({indexedDBObject:db,canWrite:()=>++checks===1});
    assert.equal((await changed.savePhoto(blob, { kind:'final', width:512, height:512 })).reason,'pro-required');
    assert.equal(db.records.size,0);
});
import {
    GEAR_PHOTO_DB_NAME,
    GEAR_PHOTO_DB_VERSION,
    GEAR_PHOTO_STORE_NAME,
    createGearPhotoStore as createPhotoStore
} from './gear-photo-store.js';

const createGearPhotoStore = options => createPhotoStore({ canWrite: () => true, ...options });

function createFakeIndexedDB() {
    const records = new Map();
    const calls = [];
    let created = false;
    const database = {
        objectStoreNames: { contains: (name) => created && name === GEAR_PHOTO_STORE_NAME },
        createObjectStore(name, options) { created = true; calls.push(['createObjectStore', name, options]); },
        transaction(name, mode) {
            calls.push(['transaction', name, mode]);
            const transaction = {
                error: null,
                objectStore() {
                    return {
                        add(record) { queueMicrotask(() => { records.set(record.id, record); transaction.oncomplete?.(); }); },
                        get(id) {
                            const request = {};
                            queueMicrotask(() => { request.result = records.get(id); request.onsuccess?.(); });
                            return request;
                        },
                        delete(id) { queueMicrotask(() => { records.delete(id); transaction.oncomplete?.(); }); }
                    };
                }
            };
            return transaction;
        }
    };
    return {
        calls,
        records,
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

const indexedDBObject = createFakeIndexedDB();
const store = createGearPhotoStore({ indexedDBObject });
const blob = new Blob(['photo'], { type: 'image/webp' });
const now = new Date('2026-09-08T01:00:00.000Z');
const saved = await store.savePhoto(blob, {
    kind: 'final', width: 512, height: 512, now, idFactory: () => 'photo-final-1'
});
assert.equal(saved.ok, true);
assert.equal(saved.record.kind, 'final');
assert.equal(saved.record.width, 512);
assert.equal(saved.record.height, 512);
assert.deepEqual(indexedDBObject.calls[0], ['open', GEAR_PHOTO_DB_NAME, GEAR_PHOTO_DB_VERSION]);
assert.deepEqual(indexedDBObject.calls[1], ['createObjectStore', GEAR_PHOTO_STORE_NAME, { keyPath: 'id' }]);
assert.deepEqual((await store.getPhoto('photo-final-1')).record, saved.record);
assert.deepEqual(await store.deletePhoto('photo-final-1'), { ok: true });
assert.equal((await store.getPhoto('photo-final-1')).record, null);

assert.equal((await store.savePhoto(blob, { kind: 'invalid', width: 1, height: 1 })).reason, 'invalid-record');
const unavailable = createGearPhotoStore({ indexedDBObject: null });
assert.equal((await unavailable.savePhoto(blob, { kind: 'source', width: 10, height: 10 })).reason, 'write-failed');
assert.equal((await unavailable.getPhoto('missing')).reason, 'read-failed');

console.log('gear-photo-store: isolated IndexedDB schema, Blob CRUD, metadata, and failure checks passed');
