import assert from 'node:assert/strict';
import test from 'node:test';

test('image store refuses Standard writes and rechecks after DB await', async () => {
    const db = createFakeIndexedDB();
    const blob = new Blob(['image'], {type:'image/webp'});
    const blocked = createIconStore({indexedDBObject:db,canWrite:()=>false});
    assert.equal((await blocked.saveIcon(blob, { idFactory: () => 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' })).reason,'pro-required');
    let checks=0;
    const changed = createIconStore({indexedDBObject:db,canWrite:()=>++checks===1});
    assert.equal((await changed.saveIcon(blob, { idFactory: () => 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' })).reason,'pro-required');
    assert.equal(db.records.size,0);
});
import {
    MY_APPS_ICON_DB_NAME,
    MY_APPS_ICON_DB_VERSION,
    MY_APPS_ICON_STORE_NAME,
    createMyAppsIconStore as createIconStore
} from './my-apps-icon-store.js';

const createMyAppsIconStore = options => createIconStore({ canWrite: () => true, ...options });

function createFakeIndexedDB() {
    const records = new Map();
    const calls = [];
    let storeCreated = false;
    const database = {
        objectStoreNames: { contains: (name) => storeCreated && name === MY_APPS_ICON_STORE_NAME },
        createObjectStore(name, options) {
            calls.push(['createObjectStore', name, options]);
            storeCreated = true;
        },
        transaction(name, mode) {
            calls.push(['transaction', name, mode]);
            const transaction = {
                error: null,
                objectStore() {
                    return {
                        add(record) {
                            queueMicrotask(() => {
                                records.set(record.id, record);
                                transaction.oncomplete?.();
                            });
                        },
                        get(id) {
                            const request = {};
                            queueMicrotask(() => {
                                request.result = records.get(id);
                                request.onsuccess?.();
                            });
                            return request;
                        },
                        delete(id) {
                            queueMicrotask(() => {
                                records.delete(id);
                                transaction.oncomplete?.();
                            });
                        }
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
const store = createMyAppsIconStore({ indexedDBObject });
const blob = new Blob(['icon'], { type: 'image/webp' });
const now = new Date('2026-09-06T01:00:00.000Z');
const iconId = '56582913-4b14-4ae4-95f6-af8367858f6d';
const saved = await store.saveIcon(blob, { now, idFactory: () => iconId });
assert.equal(saved.ok, true);
assert.deepEqual(saved.record, {
    id: iconId,
    blob,
    mimeType: 'image/webp',
    byteSize: blob.size,
    createdAt: now.toISOString()
});
assert.deepEqual(indexedDBObject.calls[0], ['open', MY_APPS_ICON_DB_NAME, MY_APPS_ICON_DB_VERSION]);
assert.deepEqual(indexedDBObject.calls[1], ['createObjectStore', MY_APPS_ICON_STORE_NAME, { keyPath: 'id' }]);
assert.deepEqual((await store.getIcon(iconId)).record, saved.record);
assert.deepEqual(await store.getIcon('missing'), { ok: true, record: null });
assert.deepEqual(await store.deleteIcon(iconId), { ok: true });
assert.equal((await store.getIcon(iconId)).record, null);

const unavailable = createMyAppsIconStore({ indexedDBObject: null });
assert.equal((await unavailable.saveIcon(blob, { idFactory: () => iconId })).ok, false);
assert.equal((await unavailable.getIcon(iconId)).ok, false);

console.log('my-apps-icon-store: IndexedDB schema, Blob CRUD, and failure tests passed');
