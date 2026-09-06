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

function createIconStore(events, { failSave = false, failDelete = false } = {}) {
    return {
        async saveIcon(blob, options) {
            events.push('icon:save');
            if (failSave) return { ok: false, reason: 'write-failed' };
            return {
                ok: true,
                record: {
                    id: options.idFactory?.() || 'new-icon',
                    blob,
                    mimeType: blob.type,
                    byteSize: blob.size,
                    createdAt: options.now.toISOString()
                }
            };
        },
        async deleteIcon(id) {
            events.push(`icon:delete:${id}`);
            return failDelete ? { ok: false } : { ok: true };
        }
    };
}

const now = new Date('2026-09-06T02:00:00.000Z');
const appId = 'bd3af570-c86d-4581-ae52-d86ecfec8c0e';
const oldIconId = '54a101c7-d015-48ef-bbaa-339beab422f4';
const newIconId = 'ce3006d8-c1a3-4316-a51d-7a13a8bb7462';
const values = { name: 'Spotify', url: 'https://open.spotify.com/' };
const baseItem = {
    id: appId,
    ...values,
    iconId: oldIconId,
    createdAt: '2026-09-06T01:00:00.000Z',
    updatedAt: '2026-09-06T01:00:00.000Z'
};
const iconBlob = new Blob(['icon'], { type: 'image/webp' });

{
    const events = [];
    const result = await createMyAppEntry({
        items: [], values, storage: new EventStorage(events), iconStore: createIconStore(events),
        now, appIdFactory: () => appId
    });
    assert.equal(result.ok, true);
    assert.equal(result.item.iconId, null, 'new item without image uses generic icon');
    assert.deepEqual(events, ['metadata:cruisePort.myApps'], 'no IndexedDB write occurs without image');
}

{
    const events = [];
    const result = await createMyAppEntry({
        items: [], values, iconBlob, storage: new EventStorage(events), iconStore: createIconStore(events),
        now, appIdFactory: () => appId, iconIdFactory: () => newIconId
    });
    assert.equal(result.ok, true);
    assert.equal(result.item.iconId, newIconId);
    assert.deepEqual(events, ['icon:save', 'metadata:cruisePort.myApps'], 'Blob is saved before metadata');
}

{
    const events = [];
    const result = await createMyAppEntry({
        items: [], values, iconBlob, storage: new EventStorage(events),
        iconStore: createIconStore(events, { failSave: true }), now, appIdFactory: () => appId
    });
    assert.deepEqual(result, { ok: false, reason: 'icon-write-failed' });
    assert.deepEqual(events, ['icon:save'], 'metadata is untouched after IndexedDB failure');
}

{
    const events = [];
    const result = await createMyAppEntry({
        items: [], values, iconBlob, storage: new EventStorage(events, true), iconStore: createIconStore(events),
        now, appIdFactory: () => appId, iconIdFactory: () => newIconId
    });
    assert.deepEqual(result, { ok: false, reason: 'metadata-write-failed' });
    assert.deepEqual(events, ['icon:save', 'metadata:cruisePort.myApps', `icon:delete:${newIconId}`]);
}

{
    const events = [];
    const result = await updateMyAppEntry({
        items: [baseItem], id: appId, values: { ...values, name: 'Spotify Web' },
        storage: new EventStorage(events), iconStore: createIconStore(events), now
    });
    assert.equal(result.ok, true);
    assert.equal(result.items[0].iconId, oldIconId, 'name/URL edit keeps current icon ID');
    assert.deepEqual(events, ['metadata:cruisePort.myApps']);
}

{
    const events = [];
    const result = await updateMyAppEntry({
        items: [baseItem], id: appId, values, iconAction: 'replace', iconBlob,
        storage: new EventStorage(events), iconStore: createIconStore(events), now,
        iconIdFactory: () => newIconId
    });
    assert.equal(result.ok, true);
    assert.equal(result.items[0].iconId, newIconId);
    assert.deepEqual(events, ['icon:save', 'metadata:cruisePort.myApps', `icon:delete:${oldIconId}`]);
}

{
    const events = [];
    const result = await updateMyAppEntry({
        items: [baseItem], id: appId, values, iconAction: 'replace', iconBlob,
        storage: new EventStorage(events, true), iconStore: createIconStore(events), now,
        iconIdFactory: () => newIconId
    });
    assert.equal(result.ok, false);
    assert.deepEqual(events, ['icon:save', 'metadata:cruisePort.myApps', `icon:delete:${newIconId}`]);
    assert(!events.includes(`icon:delete:${oldIconId}`), 'old Blob remains when metadata update fails');
}

{
    const events = [];
    const result = await updateMyAppEntry({
        items: [baseItem], id: appId, values, iconAction: 'remove',
        storage: new EventStorage(events), iconStore: createIconStore(events), now
    });
    assert.equal(result.items[0].iconId, null);
    assert.deepEqual(events, ['metadata:cruisePort.myApps', `icon:delete:${oldIconId}`]);
}

{
    const events = [];
    const result = await deleteMyAppEntry({
        items: [baseItem], id: appId, storage: new EventStorage(events), iconStore: createIconStore(events)
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.items, []);
    assert.deepEqual(events, ['metadata:cruisePort.myApps', `icon:delete:${oldIconId}`]);
}

{
    const events = [];
    const result = await deleteMyAppEntry({
        items: [baseItem], id: appId, storage: new EventStorage(events, true), iconStore: createIconStore(events)
    });
    assert.equal(result.ok, false);
    assert.deepEqual(events, ['metadata:cruisePort.myApps'], 'Blob remains when item deletion metadata fails');
}

console.log('my-apps-icon-workflow: create, replace, remove, delete, rollback, and ordering tests passed');
