import assert from 'node:assert/strict';
import {
    createMyAppEntry,
    deleteMyAppEntry,
    updateMyAppEntry
} from './my-apps-icon-workflow.js';

class EventStorage {
    constructor(events, failWrites = false) {
        this.events = events;
        this.failWrites = failWrites;
        this.value = null;
    }

    getItem() { return this.value; }

    setItem(key, value) {
        this.events.push(`metadata:${key}`);
        if (this.failWrites) throw new Error('quota exceeded');
        this.value = value;
    }
}

function createIconStore(events, { failSaveAt = 0, failDelete = false } = {}) {
    let saveCount = 0;
    return {
        async saveIcon(blob, options) {
            saveCount += 1;
            events.push(`blob:save:${saveCount}`);
            if (failSaveAt === saveCount) return { ok: false, reason: 'write-failed' };
            return {
                ok: true,
                record: {
                    id: options.idFactory?.() || `new-blob-${saveCount}`,
                    blob,
                    mimeType: blob.type,
                    byteSize: blob.size,
                    createdAt: options.now.toISOString()
                }
            };
        },
        async deleteIcon(id) {
            events.push(`blob:delete:${id}`);
            return failDelete ? { ok: false } : { ok: true };
        }
    };
}

const now = new Date('2026-09-06T02:00:00.000Z');
const appId = 'bd3af570-c86d-4581-ae52-d86ecfec8c0e';
const oldIconId = '54a101c7-d015-48ef-bbaa-339beab422f4';
const oldSourceId = 'f9433150-03c8-4d99-a6f2-7e444345f8c5';
const newIconId = 'ce3006d8-c1a3-4316-a51d-7a13a8bb7462';
const newSourceId = '7f110e06-e069-459a-b9ea-b166adfd6d08';
const values = {
    name: 'Spotify',
    url: 'https://open.spotify.com/',
    launchMode: 'https',
    appKey: null,
    customLaunch: null
};
const crop = { x: 0.25, y: 0.1, size: 0.5 };
const nextCrop = { x: 0.1, y: 0.2, size: 0.4 };
const baseItem = {
    id: appId,
    ...values,
    iconId: oldIconId,
    iconSourceId: oldSourceId,
    iconCrop: crop,
    iconPresetKey: null,
    createdAt: '2026-09-06T01:00:00.000Z',
    updatedAt: '2026-09-06T01:00:00.000Z'
};
const iconBlob = new Blob(['final'], { type: 'image/webp' });
const sourceBlob = new Blob(['editor-source'], { type: 'image/webp' });

{
    const events = [];
    const result = await createMyAppEntry({
        items: [], values, storage: new EventStorage(events), iconStore: createIconStore(events),
        now, appIdFactory: () => appId
    });
    assert.equal(result.ok, true);
    assert.deepEqual(
        { iconId: result.item.iconId, iconSourceId: result.item.iconSourceId, iconCrop: result.item.iconCrop },
        { iconId: null, iconSourceId: null, iconCrop: null }
    );
    assert.deepEqual(events, ['metadata:cruisePort.myApps']);
}

{
    const events = [];
    const result = await createMyAppEntry({
        items: [], values, iconPresetKey: 'microphone', storage: new EventStorage(events),
        iconStore: createIconStore(events), now, appIdFactory: () => appId
    });
    assert.equal(result.ok, true);
    assert.deepEqual(
        { iconId: result.item.iconId, iconSourceId: result.item.iconSourceId, iconCrop: result.item.iconCrop, iconPresetKey: result.item.iconPresetKey },
        { iconId: null, iconSourceId: null, iconCrop: null, iconPresetKey: 'microphone' }
    );
    assert.deepEqual(events, ['metadata:cruisePort.myApps']);
}

{
    const events = [];
    const result = await createMyAppEntry({
        items: [], values, iconBlob, iconSourceBlob: sourceBlob, iconCrop: crop,
        storage: new EventStorage(events), iconStore: createIconStore(events), now,
        appIdFactory: () => appId, sourceIdFactory: () => newSourceId, iconIdFactory: () => newIconId
    });
    assert.equal(result.ok, true);
    assert.equal(result.item.iconSourceId, newSourceId);
    assert.equal(result.item.iconId, newIconId);
    assert.deepEqual(result.item.iconCrop, crop);
    assert.deepEqual(events, ['blob:save:1', 'blob:save:2', 'metadata:cruisePort.myApps']);
}

{
    const events = [];
    const result = await updateMyAppEntry({
        items: [baseItem], id: appId, values, iconAction: 'preset', iconPresetKey: 'microphone',
        storage: new EventStorage(events), iconStore: createIconStore(events), now
    });
    assert.equal(result.ok, true);
    assert.deepEqual(
        { iconId: result.items[0].iconId, iconSourceId: result.items[0].iconSourceId, iconCrop: result.items[0].iconCrop, iconPresetKey: result.items[0].iconPresetKey },
        { iconId: null, iconSourceId: null, iconCrop: null, iconPresetKey: 'microphone' }
    );
    assert.deepEqual(events, ['metadata:cruisePort.myApps', `blob:delete:${oldIconId}`, `blob:delete:${oldSourceId}`], 'old blobs are removed only after preset metadata saves');
}

{
    const events = [];
    const presetItem = { ...baseItem, iconId: null, iconSourceId: null, iconCrop: null, iconPresetKey: 'microphone' };
    const result = await updateMyAppEntry({
        items: [presetItem], id: appId, values, iconAction: 'replace', iconBlob, iconSourceBlob: sourceBlob, iconCrop: nextCrop,
        storage: new EventStorage(events), iconStore: createIconStore(events), now,
        sourceIdFactory: () => newSourceId, iconIdFactory: () => newIconId
    });
    assert.equal(result.ok, true);
    assert.equal(result.items[0].iconPresetKey, null, 'custom image clears the preset only after its save succeeds');
    assert.deepEqual(events, ['blob:save:1', 'blob:save:2', 'metadata:cruisePort.myApps']);
}

{
    const events = [];
    const result = await createMyAppEntry({
        items: [], values, iconBlob, iconSourceBlob: sourceBlob, iconCrop: crop,
        storage: new EventStorage(events), iconStore: createIconStore(events, { failSaveAt: 2 }), now,
        sourceIdFactory: () => newSourceId
    });
    assert.deepEqual(result, { ok: false, reason: 'icon-write-failed' });
    assert.deepEqual(events, ['blob:save:1', 'blob:save:2', `blob:delete:${newSourceId}`]);
}

{
    const events = [];
    const result = await createMyAppEntry({
        items: [], values, iconBlob, iconSourceBlob: sourceBlob, iconCrop: crop,
        storage: new EventStorage(events, true), iconStore: createIconStore(events), now,
        sourceIdFactory: () => newSourceId, iconIdFactory: () => newIconId
    });
    assert.deepEqual(result, { ok: false, reason: 'metadata-write-failed' });
    assert.deepEqual(events, [
        'blob:save:1', 'blob:save:2', 'metadata:cruisePort.myApps',
        `blob:delete:${newSourceId}`, `blob:delete:${newIconId}`
    ]);
}

{
    const events = [];
    const result = await updateMyAppEntry({
        items: [baseItem], id: appId, values: { ...values, name: 'Spotify Web' },
        storage: new EventStorage(events), iconStore: createIconStore(events), now
    });
    assert.equal(result.ok, true);
    assert.equal(result.items[0].iconId, oldIconId);
    assert.equal(result.items[0].iconSourceId, oldSourceId);
    assert.deepEqual(result.items[0].iconCrop, crop);
    assert.deepEqual(events, ['metadata:cruisePort.myApps']);
}

{
    const events = [];
    const result = await updateMyAppEntry({
        items: [baseItem], id: appId, values, iconAction: 'replace', iconBlob,
        iconSourceBlob: sourceBlob, iconCrop: nextCrop,
        storage: new EventStorage(events), iconStore: createIconStore(events), now,
        sourceIdFactory: () => newSourceId, iconIdFactory: () => newIconId
    });
    assert.equal(result.ok, true);
    assert.deepEqual(
        { iconId: result.items[0].iconId, iconSourceId: result.items[0].iconSourceId, iconCrop: result.items[0].iconCrop },
        { iconId: newIconId, iconSourceId: newSourceId, iconCrop: nextCrop }
    );
    assert.deepEqual(events, [
        'blob:save:1', 'blob:save:2', 'metadata:cruisePort.myApps',
        `blob:delete:${oldIconId}`, `blob:delete:${oldSourceId}`
    ]);
}

{
    const events = [];
    const result = await updateMyAppEntry({
        items: [baseItem], id: appId, values, iconAction: 'replace', iconBlob,
        iconSourceBlob: sourceBlob, iconCrop: nextCrop,
        storage: new EventStorage(events, true), iconStore: createIconStore(events), now,
        sourceIdFactory: () => newSourceId, iconIdFactory: () => newIconId
    });
    assert.equal(result.ok, false);
    assert.deepEqual(events, [
        'blob:save:1', 'blob:save:2', 'metadata:cruisePort.myApps',
        `blob:delete:${newSourceId}`, `blob:delete:${newIconId}`
    ]);
    assert(!events.includes(`blob:delete:${oldIconId}`));
    assert(!events.includes(`blob:delete:${oldSourceId}`));
}

{
    const events = [];
    const result = await updateMyAppEntry({
        items: [baseItem], id: appId, values, iconAction: 'readjust', iconBlob, iconCrop: nextCrop,
        storage: new EventStorage(events), iconStore: createIconStore(events), now,
        iconIdFactory: () => newIconId
    });
    assert.equal(result.items[0].iconSourceId, oldSourceId, 're-adjust keeps the editor source');
    assert.equal(result.items[0].iconId, newIconId);
    assert.deepEqual(events, ['blob:save:1', 'metadata:cruisePort.myApps', `blob:delete:${oldIconId}`]);
}

{
    const events = [];
    const legacyItem = { ...baseItem, iconSourceId: null, iconCrop: null };
    const result = await updateMyAppEntry({
        items: [legacyItem], id: appId, values, iconAction: 'readjust', iconBlob, iconCrop: nextCrop,
        useCurrentIconAsSource: true, storage: new EventStorage(events),
        iconStore: createIconStore(events), now, iconIdFactory: () => newIconId
    });
    assert.equal(result.items[0].iconSourceId, oldIconId, 'legacy final Blob becomes the stable editor source');
    assert.equal(result.items[0].iconId, newIconId);
    assert.deepEqual(events, ['blob:save:1', 'metadata:cruisePort.myApps']);
}

{
    const events = [];
    const result = await updateMyAppEntry({
        items: [baseItem], id: appId, values, iconAction: 'remove',
        storage: new EventStorage(events), iconStore: createIconStore(events), now
    });
    assert.deepEqual(
        { iconId: result.items[0].iconId, iconSourceId: result.items[0].iconSourceId, iconCrop: result.items[0].iconCrop },
        { iconId: null, iconSourceId: null, iconCrop: null }
    );
    assert.deepEqual(events, ['metadata:cruisePort.myApps', `blob:delete:${oldIconId}`, `blob:delete:${oldSourceId}`]);
}

{
    const events = [];
    const sameBlobItem = { ...baseItem, iconSourceId: oldIconId };
    const result = await deleteMyAppEntry({
        items: [sameBlobItem], id: appId, storage: new EventStorage(events), iconStore: createIconStore(events)
    });
    assert.equal(result.ok, true);
    assert.deepEqual(events, ['metadata:cruisePort.myApps', `blob:delete:${oldIconId}`], 'same ID is deleted once');
}

{
    const events = [];
    const result = await deleteMyAppEntry({
        items: [baseItem], id: appId, storage: new EventStorage(events, true), iconStore: createIconStore(events)
    });
    assert.equal(result.ok, false);
    assert.deepEqual(events, ['metadata:cruisePort.myApps'], 'both old Blobs remain when metadata deletion fails');
}

console.log('my-apps-icon-workflow: source/final create, replace, re-adjust, delete, rollback, and ordering tests passed');
