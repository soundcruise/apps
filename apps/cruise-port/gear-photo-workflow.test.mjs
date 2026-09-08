import assert from 'node:assert/strict';
import {
    commitGearItemDeletion,
    commitGearPhotoChange,
    commitGearPhotoRemoval
} from './gear-photo-workflow.js';

function createStore({ failAt = 0 } = {}) {
    const records = new Map();
    const deleted = [];
    let writes = 0;
    return {
        records,
        deleted,
        async savePhoto(blob, metadata) {
            writes += 1;
            if (writes === failAt) return { ok: false };
            const id = `${metadata.kind}-${writes}`;
            records.set(id, blob);
            return { ok: true, record: { id } };
        },
        async deletePhoto(id) { deleted.push(id); records.delete(id); return { ok: true }; }
    };
}

const pending = {
    sourceBlob: new Blob(['source'], { type: 'image/webp' }),
    finalBlob: new Blob(['final'], { type: 'image/webp' }),
    sourceWidth: 1024,
    sourceHeight: 768,
    crop: { x: 0.1, y: 0, size: 0.8 }
};

{
    const store = createStore();
    const events = [];
    const originalDelete = store.deletePhoto;
    store.deletePhoto = async (id) => { events.push(`delete:${id}`); return originalDelete(id); };
    const result = await commitGearPhotoChange({
        photoStore: store,
        pending,
        previousReferences: { photoId: 'old-final', photoSourceId: 'old-source' },
        buildItems: (references) => [{ id: 'gear', ...references }],
        persist: () => { events.push('persist'); return { ok: true }; }
    });
    assert.equal(result.ok, true);
    assert.equal(result.items[0].photoId, 'final-2');
    assert.deepEqual(store.deleted, ['old-final', 'old-source']);
    assert.deepEqual(events, ['persist', 'delete:old-final', 'delete:old-source'], 'old blobs are deleted only after metadata succeeds');
}


{
    const store = createStore();
    const result = await commitGearPhotoRemoval({
        photoStore: store,
        previousReferences: { photoId: 'final', photoSourceId: 'source' },
        buildItems: () => [],
        persist: () => ({ ok: false })
    });
    assert.equal(result.reason, 'metadata-write-failed');
    assert.deepEqual(store.deleted, [], 'photo removal failure preserves both blobs');
}

{
    const store = createStore({ failAt: 2 });
    const result = await commitGearPhotoChange({
        photoStore: store, pending, previousReferences: null,
        buildItems: () => [], persist: () => ({ ok: true })
    });
    assert.equal(result.ok, false);
    assert.deepEqual(store.deleted, ['source-1'], 'partial IndexedDB save is rolled back');
}

{
    const store = createStore();
    const result = await commitGearPhotoChange({
        photoStore: store, pending, previousReferences: null,
        buildItems: () => [{ id: 'gear' }], persist: () => ({ ok: false })
    });
    assert.equal(result.reason, 'metadata-write-failed');
    assert.deepEqual(store.deleted, ['final-2', 'source-1'], 'new blobs are rolled back when localStorage fails');
}

for (const operation of [commitGearPhotoRemoval, commitGearItemDeletion]) {
    const store = createStore();
    const args = operation === commitGearPhotoRemoval
        ? { photoStore: store, previousReferences: { photoId: 'final', photoSourceId: 'source' }, buildItems: () => [], persist: () => ({ ok: true }) }
        : { photoStore: store, references: { photoId: 'final', photoSourceId: 'source' }, buildItems: () => [], persist: () => ({ ok: true }) };
    const result = await operation(args);
    assert.equal(result.ok, true);
    assert.deepEqual(store.deleted, ['final', 'source']);
}

{
    const store = createStore();
    const result = await commitGearItemDeletion({
        photoStore: store,
        references: { photoId: 'final', photoSourceId: 'source' },
        buildItems: () => [],
        persist: () => ({ ok: false })
    });
    assert.equal(result.reason, 'metadata-write-failed');
    assert.deepEqual(store.deleted, [], 'item delete failure preserves both photo blobs');
}

console.log('gear-photo-workflow: create, replace, remove, item delete, and rollback checks passed');
