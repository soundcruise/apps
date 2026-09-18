import test from 'node:test';
import assert from 'node:assert/strict';
import { PortAssetSync, hashBlob } from './port-asset-sync.js';

function storage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key) => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key)
    };
}

function controller({ syncResult = { ok: true } } = {}) {
    const syncReasons = [];
    return {
        enabled: true,
        syncReasons,
        runtime: {
            endpoint: 'https://sync.example', admissionMode: 'production',
            credential: async () => `scd1.123e4567-e89b-42d3-a456-426614174000.${'A'.repeat(43)}`,
            qaCredential: async () => null
        },
        async sync(reason) { syncReasons.push(reason); return syncResult; }
    };
}

function assetApi() {
    const prepared = new Map();
    const objects = new Map();
    const requests = [];
    return {
        requests,
        async fetch(url, options) {
            const path = new URL(url).pathname;
            requests.push({ path, method: options.method });
            if (path === '/v1/sync/assets/prepare') {
                const body = JSON.parse(options.body);
                prepared.set(body.assetId, body);
                return Response.json({ ok: true, phase: 'prepared', asset: metadata(body, 'prepared') }, { status: 201 });
            }
            if (path.endsWith('/content') && options.method === 'PUT') {
                const id = path.split('/').at(-2);
                objects.set(id, options.body);
                return Response.json({ ok: true, phase: 'uploaded' });
            }
            if (path === '/v1/sync/assets/commit') {
                const body = JSON.parse(options.body);
                return Response.json({ ok: true, phase: 'available', asset: metadata(prepared.get(body.assetId), 'available') });
            }
            if (path === '/v1/sync/assets/unreference') return Response.json({ ok: true, unreferenced: 1 });
            const id = path.split('/').at(-1);
            const request = prepared.get(id);
            const blob = objects.get(id);
            return new Response(blob, { status: 200, headers: {
                'Content-Type': request.mime, 'X-Asset-SHA256': request.hash
            } });
        }
    };
}

function metadata(input, availability) {
    return {
        assetId: input.assetId, kind: input.kind, hash: input.hash, mime: input.mime,
        byteSize: input.byteSize, width: input.width, height: input.height,
        objectVersion: 1, availability,
        ...(input.ownerRecordId ? {
            ownerRecordId: input.ownerRecordId,
            originalFilename: input.originalFilename
        } : {})
    };
}

function blob(bytes = [0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]) {
    return new Blob([Uint8Array.from(bytes)], { type: 'image/webp' });
}

test('Gear source/final upload publishes logical IDs, then another Port downloads into its own local IDs', async () => {
    const sourceBlob = blob();
    const finalBlob = blob([0x52,0x49,0x46,0x46,1,0,0,0,0x57,0x45,0x42,0x50]);
    const a = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [{ id: 'gear-1', photoId: 'local-final-a',
            photoSourceId: 'local-source-a', photoCrop: { x: 0, y: 0, size: 1 } }] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] })
    });
    const api = assetApi();
    const aSync = new PortAssetSync({ controller: controller(), storage: a, fetchImpl: api.fetch,
        gearPhotoStore: {
            getPhoto: async (id) => ({ ok: true, record: id.includes('source')
                ? { id, blob: sourceBlob, mimeType: 'image/webp', width: 900, height: 700 }
                : { id, blob: finalBlob, mimeType: 'image/webp', width: 512, height: 512 } })
        }, myAppsIconStore: {} });
    const uploaded = await aSync.reconcile();
    assert.equal(uploaded.ok, true);
    const aMeta = JSON.parse(a.getItem('cruisePort.syncAssetMetadata'));
    assert.equal(aMeta.gear['gear-1'].published.final.kind, 'gear_photo_final');
    assert.equal(aMeta.gear['gear-1'].published.source.kind, 'gear_photo_source');
    assert.notEqual(aMeta.gear['gear-1'].published.final.assetId, 'local-final-a');
    assert.equal(api.requests.filter((request) => request.method === 'PUT').length, 2);

    const b = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [{ id: 'gear-1', photoId: null,
            photoSourceId: null, photoCrop: { x: 0, y: 0, size: 1 } }] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] }),
        'cruisePort.syncAssetMetadata': JSON.stringify({ version: 2, gear: {
            'gear-1': { published: aMeta.gear['gear-1'].published, binding: null, pending: null }
        }, myApps: {}, releaseQueue: [] })
    });
    let cached = 0;
    const bSync = new PortAssetSync({ controller: controller(), storage: b, fetchImpl: api.fetch,
        gearPhotoStore: { cachePhoto: async () => ({ ok: true, record: { id: `local-b-${++cached}` } }) },
        myAppsIconStore: {} });
    const hydrated = await bSync.reconcile();
    assert.equal(hydrated.hydrated, true);
    const bItem = JSON.parse(b.getItem('cruisePort.gearList')).items[0];
    assert.match(bItem.photoId, /^local-b-/);
    assert.match(bItem.photoSourceId, /^local-b-/);
    assert.notEqual(bItem.photoId, 'local-final-a');
});

test('custom My Apps source/final upload is isolated and deletion queues delayed unreference', async () => {
    const finalBlob = blob();
    const sourceBlob = blob([0x52,0x49,0x46,0x46,2,0,0,0,0x57,0x45,0x42,0x50]);
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [{ id: 'app-1', iconId: 'icon-final',
            iconSourceId: 'icon-source', iconCrop: { x: 0, y: 0, size: 1 }, iconPresetKey: null }] })
    });
    const api = assetApi();
    const sync = new PortAssetSync({ controller: controller(), storage: local, fetchImpl: api.fetch,
        gearPhotoStore: {}, myAppsIconStore: { getIcon: async (id) => ({ ok: true, record: {
            id, blob: id === 'icon-final' ? finalBlob : sourceBlob, mimeType: 'image/webp',
            width: id === 'icon-final' ? 256 : 800, height: id === 'icon-final' ? 256 : 600
        } }) } });
    await sync.reconcile();
    let state = JSON.parse(local.getItem('cruisePort.syncAssetMetadata'));
    assert.equal(state.myApps['app-1'].published.final.kind, 'my_app_icon_final');
    assert.equal(state.myApps['app-1'].published.source.kind, 'my_app_icon_source');
    local.setItem('cruisePort.myApps', JSON.stringify({ version: 6, items: [{ id: 'app-1', iconId: null,
        iconSourceId: null, iconCrop: null, iconPresetKey: 'guitar' }] }));
    sync.markLocalRemovals();
    state = JSON.parse(local.getItem('cruisePort.syncAssetMetadata'));
    assert.equal(state.myApps['app-1'].published, null);
    assert.equal(state.releaseQueue.length, 2);
    await sync.reconcile();
    assert.equal(api.requests.some((request) => request.path === '/v1/sync/assets/unreference'), true);
});

test('hashing is content-stable and no raw binary enters metadata', async () => {
    const value = blob();
    assert.equal(await hashBlob(value), await hashBlob(value));
});

test('offline local image stays pending locally without any asset request', async () => {
    const previousNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
    try {
        const local = storage({
            'cruisePort.gearList': JSON.stringify({ version: 4, items: [{ id: 'gear-offline', photoId: 'local', photoSourceId: null }] }),
            'cruisePort.myApps': JSON.stringify({ version: 6, items: [] })
        });
        let requested = false;
        const sync = new PortAssetSync({ controller: controller(), storage: local,
            fetchImpl: async () => { requested = true; throw new Error('unexpected'); },
            gearPhotoStore: {}, myAppsIconStore: {} });
        assert.deepEqual(await sync.reconcile(), { ok: false, offline: true });
        assert.equal(requested, false);
        assert.equal(JSON.parse(local.getItem('cruisePort.gearList')).items[0].photoId, 'local');
    } finally {
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previousNavigator });
    }
});

test('old published assets are not unreferenced until the structured reference sync succeeds', async () => {
    const finalBlob = blob();
    const oldAsset = metadata({ assetId: '123e4567-e89b-42d3-a456-426614174001', kind: 'gear_photo_final',
        hash: 'a'.repeat(64), mime: 'image/webp', byteSize: finalBlob.size, width: 512, height: 512 }, 'available');
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [{ id: 'gear-update', photoId: 'new-local', photoSourceId: null }] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] }),
        'cruisePort.syncAssetMetadata': JSON.stringify({ version: 2, gear: { 'gear-update': {
            published: { version: 1, availability: 'available', final: oldAsset, source: null, crop: null },
            binding: { final: { assetId: oldAsset.assetId, hash: oldAsset.hash, localId: 'old-local' }, source: null }, pending: null
        } }, myApps: {}, releaseQueue: [] })
    });
    const api = assetApi();
    const sync = new PortAssetSync({ controller: controller({ syncResult: { ok: false, code: 'conflict' } }),
        storage: local, fetchImpl: api.fetch, gearPhotoStore: { getPhoto: async () => ({ ok: true, record: {
            id: 'new-local', blob: finalBlob, mimeType: 'image/webp', width: 512, height: 512
        } }) }, myAppsIconStore: {} });
    const result = await sync.reconcile();
    assert.equal(result.ok, false);
    assert.equal(result.code, 'conflict');
    assert.equal(api.requests.some((request) => request.path === '/v1/sync/assets/unreference'), false);
    assert.deepEqual(JSON.parse(local.getItem('cruisePort.syncAssetMetadata')).releaseQueue, [oldAsset.assetId]);
});

test('missing IndexedDB cache is re-downloaded from the same logical asset', async () => {
    const finalBlob = blob();
    const api = assetApi();
    const prepared = {
        appId: 'port', assetId: '123e4567-e89b-42d3-a456-426614174002', operationId: '223e4567-e89b-42d3-a456-426614174002',
        kind: 'gear_photo_final', hash: await hashBlob(finalBlob), mime: 'image/webp', byteSize: finalBlob.size, width: 512, height: 512
    };
    api.requests.length = 0;
    await api.fetch('https://sync.example/v1/sync/assets/prepare', { method: 'POST', body: JSON.stringify(prepared) });
    await api.fetch(`https://sync.example/v1/sync/assets/${prepared.assetId}/content`, { method: 'PUT', body: finalBlob });
    const available = metadata(prepared, 'available');
    api.requests.length = 0;
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [{ id: 'gear-cache', photoId: 'evicted-local', photoSourceId: null }] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] }),
        'cruisePort.syncAssetMetadata': JSON.stringify({ version: 2, gear: { 'gear-cache': {
            published: { version: 1, availability: 'available', final: available, source: null, crop: null },
            binding: { final: { assetId: available.assetId, hash: available.hash, localId: 'evicted-local' }, source: null }, pending: null
        } }, myApps: {}, releaseQueue: [] })
    });
    const sync = new PortAssetSync({ controller: controller(), storage: local, fetchImpl: api.fetch,
        gearPhotoStore: {
            getPhoto: async () => ({ ok: true, record: null }),
            cachePhoto: async () => ({ ok: true, record: { id: 'restored-local' } })
        }, myAppsIconStore: {} });
    const result = await sync.reconcile();
    assert.equal(result.hydrated, true);
    assert.equal(JSON.parse(local.getItem('cruisePort.gearList')).items[0].photoId, 'restored-local');
    assert.equal(api.requests.filter((request) => request.method === 'GET').length, 1);
});

test('practice attachment uploads once, stays lazy on another Port, then downloads into a different local ID', async () => {
    const localRecord = {
        id: 'local-a', practiceId: 'practice-a', kind: 'file',
        blob: new Blob(['practice notes'], { type: 'text/plain' }), mimeType: 'text/plain',
        fileName: 'notes.txt', byteSize: 14,
        createdAt: '2026-09-18T01:00:00.000Z', updatedAt: '2026-09-18T01:00:00.000Z'
    };
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] }),
        'cruisePort.practiceMenus': JSON.stringify({ version: 3, items: [{ id: 'practice-a', name: 'A' }] })
    });
    const api = assetApi();
    const aController = controller();
    const aSync = new PortAssetSync({ controller: aController, storage: local, fetchImpl: api.fetch,
        gearPhotoStore: {}, myAppsIconStore: {}, practiceAttachmentStore: {
            getAllAttachments: async () => ({ ok: true, records: [localRecord] }),
            getAttachments: async () => ({ ok: true, records: [localRecord] })
        } });
    assert.equal((await aSync.reconcile()).ok, true);
    assert.deepEqual(aController.syncReasons, ['attachment-owner', 'asset-reference']);
    const aMetadata = JSON.parse(local.getItem('cruisePort.syncAssetMetadata'));
    const [logicalId, entry] = Object.entries(aMetadata.attachments)[0];
    assert.notEqual(logicalId, localRecord.id);
    assert.equal(entry.published.asset.kind, 'practice_attachment_text');
    assert.equal(entry.published.asset.ownerRecordId, 'practice-a');
    assert.equal(entry.binding.localId, 'local-a');

    const remote = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] }),
        'cruisePort.syncAssetMetadata': JSON.stringify({
            version: 3, gear: {}, myApps: {}, attachments: {
                [logicalId]: { ...entry, binding: null }
            }, releaseQueue: [], discardQueue: []
        })
    });
    let cached = null;
    const bSync = new PortAssetSync({ controller: controller(), storage: remote, fetchImpl: api.fetch,
        gearPhotoStore: {}, myAppsIconStore: {}, practiceAttachmentStore: {
            getAttachments: async () => ({ ok: true, records: cached ? [cached] : [] }),
            getAttachment: async (id) => ({ ok: true, record: cached?.id === id ? cached : null }),
            getAllAttachments: async () => ({ ok: true, records: cached ? [cached] : [] }),
            cacheAttachment: async (downloaded, metadataValue) => {
                cached = { ...localRecord, id: 'local-b', blob: downloaded, ...metadataValue };
                return { ok: true, record: cached };
            },
            deleteAttachment: async () => ({ ok: true })
        } });
    api.requests.length = 0;
    const beforeOpen = await bSync.listPracticeAttachments('practice-a');
    assert.equal(beforeOpen.records[0].cloudOnly, true);
    assert.equal(api.requests.length, 0, 'remote metadata never downloads binary during startup/list rendering');
    const opened = await bSync.ensurePracticeAttachment(logicalId);
    assert.equal(opened.ok, true);
    assert.equal(opened.record.id, 'local-b');
    assert.equal(opened.record.logicalId, logicalId);
    assert.equal(api.requests.filter((request) => request.method === 'GET').length, 1);
});

test('practice attachment deletion syncs the structured tombstone before delayed unreference', async () => {
    const asset = metadata({
        assetId: '123e4567-e89b-42d3-a456-426614174090', kind: 'practice_attachment_pdf',
        hash: 'a'.repeat(64), mime: 'application/pdf', byteSize: 10, width: 1, height: 1,
        ownerRecordId: 'practice-a', originalFilename: 'score.pdf'
    }, 'available');
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] }),
        'cruisePort.syncAssetMetadata': JSON.stringify({
            version: 3, gear: {}, myApps: {}, attachments: {
                '323e4567-e89b-42d3-a456-426614174090': {
                    practiceId: 'practice-a', kind: 'file', mimeType: 'application/pdf', fileName: 'score.pdf',
                    byteSize: 10, createdAt: '2026-09-18T01:00:00.000Z', updatedAt: '2026-09-18T01:00:00.000Z',
                    published: { version: 1, availability: 'available', asset },
                    binding: { assetId: asset.assetId, hash: asset.hash, localId: 'local-a' }, pending: null
                }
            }, releaseQueue: [], discardQueue: []
        })
    });
    const api = assetApi();
    const syncController = controller();
    const sync = new PortAssetSync({ controller: syncController, storage: local, fetchImpl: api.fetch,
        gearPhotoStore: {}, myAppsIconStore: {}, practiceAttachmentStore: {
            getAllAttachments: async () => ({ ok: true, records: [] }),
            deleteAttachment: async () => ({ ok: true })
        } });
    assert.equal(sync.removePracticeAttachment({ id: 'local-a' }), true);
    await sync.running;
    assert.deepEqual(syncController.syncReasons, ['asset-release']);
    assert.equal(api.requests.at(-1).path, '/v1/sync/assets/unreference');
    assert.deepEqual(JSON.parse(local.getItem('cruisePort.syncAssetMetadata')).releaseQueue, []);
});

test('offline practice attachment remains local, then uploads and publishes when connectivity returns', async () => {
    const previousNavigator = globalThis.navigator;
    let online = false;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, get: () => ({ onLine: online }) });
    const file = new Blob(['offline notes'], { type: 'text/plain' });
    const record = {
        id: 'offline-local', practiceId: 'practice-offline', kind: 'file', blob: file,
        mimeType: 'text/plain', fileName: 'offline.txt', byteSize: file.size,
        createdAt: '2026-09-18T02:00:00.000Z', updatedAt: '2026-09-18T02:00:00.000Z'
    };
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] })
    });
    const api = assetApi();
    const syncController = controller();
    const sync = new PortAssetSync({ controller: syncController, storage: local, fetchImpl: api.fetch,
        gearPhotoStore: {}, myAppsIconStore: {}, practiceAttachmentStore: {
            getAllAttachments: async () => ({ ok: true, records: [record] })
        } });
    try {
        assert.deepEqual(await sync.reconcile(), { ok: false, offline: true });
        assert.equal(api.requests.length, 0);
        assert.equal(local.getItem('cruisePort.syncAssetMetadata'), null);
        online = true;
        assert.equal((await sync.reconcile()).ok, true);
        assert.deepEqual(syncController.syncReasons, ['attachment-owner', 'asset-reference']);
        assert.equal(api.requests.some((request) => request.method === 'PUT'), true);
        const metadataValue = JSON.parse(local.getItem('cruisePort.syncAssetMetadata'));
        assert.equal(Object.values(metadataValue.attachments).length, 1);
        assert.equal(Object.values(metadataValue.attachments)[0].binding.localId, 'offline-local');
    } finally {
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previousNavigator });
    }
});

test('practice upload response loss retries the same logical asset and operation without duplication', async () => {
    const file = new Blob(['retry notes'], { type: 'text/plain' });
    const record = {
        id: 'retry-local', practiceId: 'practice-retry', kind: 'file', blob: file,
        mimeType: 'text/plain', fileName: 'retry.txt', byteSize: file.size,
        createdAt: '2026-09-18T03:00:00.000Z', updatedAt: '2026-09-18T03:00:00.000Z'
    };
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] })
    });
    const api = assetApi();
    const prepareBodies = [];
    let loseFirstCommit = true;
    const fetchImpl = async (url, options) => {
        const path = new URL(url).pathname;
        if (path === '/v1/sync/assets/prepare') prepareBodies.push(JSON.parse(options.body));
        if (path === '/v1/sync/assets/commit' && loseFirstCommit) {
            loseFirstCommit = false;
            throw new Error('response-lost');
        }
        return api.fetch(url, options);
    };
    const sync = new PortAssetSync({ controller: controller(), storage: local, fetchImpl,
        gearPhotoStore: {}, myAppsIconStore: {}, practiceAttachmentStore: {
            getAllAttachments: async () => ({ ok: true, records: [record] })
        } });
    await assert.rejects(sync.reconcile(), /response-lost/);
    assert.equal((await sync.reconcile()).ok, true);
    assert.equal(prepareBodies.length, 2);
    assert.equal(prepareBodies[0].assetId, prepareBodies[1].assetId);
    assert.equal(prepareBodies[0].operationId, prepareBodies[1].operationId);
    const metadataValue = JSON.parse(local.getItem('cruisePort.syncAssetMetadata'));
    assert.equal(Object.keys(metadataValue.attachments).length, 1);
    assert.equal(Object.values(metadataValue.attachments)[0].published.asset.assetId, prepareBodies[0].assetId);
});
