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

test('cold-start retry uploads an existing Gear photo after Port sync becomes ready', async () => {
    const previousAddEventListener = globalThis.addEventListener;
    const previousDispatchEvent = globalThis.dispatchEvent;
    const listeners = new Map();
    globalThis.addEventListener = (type, listener) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(listener);
    };
    globalThis.dispatchEvent = (event) => {
        for (const listener of listeners.get(event.type) || []) listener(event);
        return true;
    };
    const sourceBlob = blob();
    const finalBlob = blob([0x52,0x49,0x46,0x46,3,0,0,0,0x57,0x45,0x42,0x50]);
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [{
            id: 'gear-existing', photoId: 'local-final', photoSourceId: 'local-source',
            photoCrop: { x: 0, y: 0, size: 1 }
        }] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] })
    });
    const api = assetApi();
    let ready = false;
    const syncController = controller();
    syncController.runtime.credential = async () => ready
        ? `scd1.123e4567-e89b-42d3-a456-426614174000.${'A'.repeat(43)}`
        : null;
    const sync = new PortAssetSync({ controller: syncController, storage: local, fetchImpl: api.fetch,
        gearPhotoStore: { getPhoto: async (id) => ({ ok: true, record: {
            id, blob: id === 'local-final' ? finalBlob : sourceBlob, mimeType: 'image/webp',
            width: id === 'local-final' ? 512 : 900, height: id === 'local-final' ? 512 : 700
        } }) }, myAppsIconStore: {} }).bind();
    try {
        assert.equal((await sync.running).code, 'asset_auth_required');
        assert.equal(api.requests.length, 0);
        ready = true;
        globalThis.dispatchEvent(new CustomEvent('cruise-port-sync-state', { detail: { state: 'ready' } }));
        assert.equal((await sync.running).ok, true);
        assert.equal(api.requests.filter((request) => request.method === 'PUT').length, 2);
        const state = JSON.parse(local.getItem('cruisePort.syncAssetMetadata'));
        assert.equal(state.gear['gear-existing'].published.availability, 'available');
    } finally {
        if (previousAddEventListener) globalThis.addEventListener = previousAddEventListener;
        else delete globalThis.addEventListener;
        if (previousDispatchEvent) globalThis.dispatchEvent = previousDispatchEvent;
        else delete globalThis.dispatchEvent;
    }
});

test('retries a logical asset reference after upload completed before dataset migration', async () => {
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [{ id: 'gear-retry', photoId: 'local-final', photoSourceId: null }] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] })
    });
    const api = assetApi();
    const syncReasons = [];
    let attempts = 0;
    const syncController = {
        ...controller(),
        sync: async (reason) => {
            syncReasons.push(reason);
            attempts += 1;
            return attempts === 1 ? { ok: false, code: 'migration_required' } : { ok: true };
        }
    };
    const sync = new PortAssetSync({ controller: syncController, storage: local, fetchImpl: api.fetch,
        gearPhotoStore: { getPhoto: async (id) => ({ ok: true, record: {
            id, blob: blob(), mimeType: 'image/webp', width: 512, height: 512
        } }) }, myAppsIconStore: {} });

    assert.deepEqual(await sync.reconcile(), { ok: false, code: 'migration_required' });
    assert.equal(JSON.parse(local.getItem('cruisePort.syncAssetMetadata')).referencePending, true);
    assert.equal(api.requests.filter((request) => request.method === 'PUT').length, 1);

    assert.equal((await sync.reconcile()).ok, true);
    assert.deepEqual(syncReasons, ['asset-reference', 'asset-reference']);
    assert.equal(JSON.parse(local.getItem('cruisePort.syncAssetMetadata')).referencePending, false);
    assert.equal(api.requests.filter((request) => request.method === 'PUT').length, 1, 'retry only republishes metadata');
});

test('cold start republishes a missing current-version Gear reference without another upload', async () => {
    const available = metadata({
        assetId: '123e4567-e89b-42d3-a456-426614174200', kind: 'gear_photo_final',
        hash: 'c'.repeat(64), mime: 'image/webp', byteSize: 12, width: 512, height: 512
    }, 'available');
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [{
            id: 'gear-current', photoId: 'local-final', photoSourceId: null
        }] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] }),
        'cruisePort.syncAssetMetadata': JSON.stringify({
            version: 4, gear: { 'gear-current': {
                published: { version: 1, availability: 'available', final: available, source: null, crop: null },
                binding: { final: { assetId: available.assetId, hash: available.hash, localId: 'local-final' }, source: null },
                pending: null
            } }, myApps: {}, attachments: {}, releaseQueue: [], discardQueue: [], referencePending: false
        })
    });
    const api = assetApi();
    const syncController = controller();
    let checked = false;
    syncController.reconcileAssetReferences = async () => {
        if (checked) return false;
        checked = true;
        const value = JSON.parse(local.getItem('cruisePort.syncAssetMetadata'));
        value.referencePending = true;
        local.setItem('cruisePort.syncAssetMetadata', JSON.stringify(value));
        return true;
    };
    const sync = new PortAssetSync({ controller: syncController, storage: local, fetchImpl: api.fetch,
        gearPhotoStore: { getPhoto: async () => ({ ok: true, record: { id: 'local-final', blob: blob() } }) },
        myAppsIconStore: {}, practiceAttachmentStore: { getAllAttachments: async () => ({ ok: true, records: [] }) } });

    assert.equal((await sync.reconcile()).ok, true);
    assert.deepEqual(syncController.syncReasons, ['asset-reference']);
    assert.equal(api.requests.filter((request) => request.method === 'PUT').length, 0);
    assert.equal(JSON.parse(local.getItem('cruisePort.syncAssetMetadata')).gear['gear-current'].published.final.assetId,
        available.assetId);
    assert.equal(JSON.parse(local.getItem('cruisePort.syncAssetMetadata')).referencePending, false);

    assert.equal((await sync.reconcile()).ok, true);
    assert.deepEqual(syncController.syncReasons, ['asset-reference'], 'repeat startup is a no-op after convergence');
    assert.equal(api.requests.length, 0);
});

test('cold start rebinds committed pending Gear assets without PUT or new asset IDs', async () => {
    const finalBlob = blob([0x52,0x49,0x46,0x46,7,0,0,0,0x57,0x45,0x42,0x50]);
    const sourceBlob = blob([0x52,0x49,0x46,0x46,8,0,0,0,0x57,0x45,0x42,0x50]);
    const finalHash = await hashBlob(finalBlob);
    const sourceHash = await hashBlob(sourceBlob);
    const finalAssetId = '123e4567-e89b-42d3-a456-426614174210';
    const sourceAssetId = '123e4567-e89b-42d3-a456-426614174211';
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [{
            id: 'gear-pending', photoId: 'local-final', photoSourceId: 'local-source',
            photoCrop: { x: 0, y: 0, size: 1 }
        }] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] }),
        'cruisePort.syncAssetMetadata': JSON.stringify({
            version: 4, gear: { 'gear-pending': {
                published: null, binding: null, pending: {
                    final: { localId: 'local-final', assetId: finalAssetId, operationId: 'final-operation', hash: finalHash },
                    source: { localId: 'local-source', assetId: sourceAssetId, operationId: 'source-operation', hash: sourceHash }
                }
            } }, myApps: {}, attachments: {}, releaseQueue: [], discardQueue: [], referencePending: false
        })
    });
    const requests = [];
    const fetchImpl = async (url, options) => {
        const path = new URL(url).pathname;
        requests.push({ path, method: options.method });
        assert.equal(path, '/v1/sync/assets/prepare');
        const body = JSON.parse(options.body);
        return Response.json({ ok: true, phase: 'available', asset: metadata(body, 'available') });
    };
    const syncController = controller();
    const sync = new PortAssetSync({ controller: syncController, storage: local, fetchImpl,
        gearPhotoStore: { getPhoto: async (id) => ({ ok: true, record: {
            id, blob: id === 'local-final' ? finalBlob : sourceBlob, mimeType: 'image/webp',
            width: id === 'local-final' ? 512 : 900, height: id === 'local-final' ? 512 : 700
        } }) }, myAppsIconStore: {}, practiceAttachmentStore: {
            getAllAttachments: async () => ({ ok: true, records: [] })
        } });

    assert.equal((await sync.reconcile()).ok, true);
    const state = JSON.parse(local.getItem('cruisePort.syncAssetMetadata'));
    assert.equal(state.gear['gear-pending'].published.final.assetId, finalAssetId);
    assert.equal(state.gear['gear-pending'].published.source.assetId, sourceAssetId);
    assert.equal(state.gear['gear-pending'].pending, null);
    assert.equal(state.referencePending, false);
    assert.equal(requests.filter((request) => request.method === 'PUT').length, 0);
    assert.deepEqual(syncController.syncReasons, ['asset-reference']);
});

test('completed Gear rebind survives a Practice owner conflict and retries only reference publish', async () => {
    const finalBlob = blob([0x52,0x49,0x46,0x46,9,0,0,0,0x57,0x45,0x42,0x50]);
    const finalHash = await hashBlob(finalBlob);
    const finalAssetId = '123e4567-e89b-42d3-a456-426614174212';
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [{
            id: 'gear-before-owner', photoId: 'local-final', photoSourceId: null
        }] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] }),
        'cruisePort.syncAssetMetadata': JSON.stringify({
            version: 4, gear: { 'gear-before-owner': {
                published: null, binding: null, pending: {
                    final: { localId: 'local-final', assetId: finalAssetId, operationId: 'final-operation', hash: finalHash },
                    source: null
                }
            } }, myApps: {}, attachments: {}, releaseQueue: [], discardQueue: [], referencePending: false
        })
    });
    const requests = [];
    const fetchImpl = async (url, options) => {
        const path = new URL(url).pathname;
        requests.push({ path, method: options.method });
        assert.equal(path, '/v1/sync/assets/prepare');
        const body = JSON.parse(options.body);
        return Response.json({ ok: true, phase: 'available', asset: metadata(body, 'available') });
    };
    const syncController = controller();
    syncController.sync = async (reason) => {
        syncController.syncReasons.push(reason);
        return reason === 'attachment-owner' ? { ok: false, code: 'conflict_pending' } : { ok: true };
    };
    const attachmentBlob = new Blob(['owner pending'], { type: 'text/plain' });
    const sync = new PortAssetSync({ controller: syncController, storage: local, fetchImpl,
        gearPhotoStore: { getPhoto: async (id) => ({ ok: true, record: {
            id, blob: finalBlob, mimeType: 'image/webp', width: 512, height: 512
        } }) }, myAppsIconStore: {}, practiceAttachmentStore: {
            getAllAttachments: async () => ({ ok: true, records: [{
                id: 'attachment-local', practiceId: 'practice-owner', kind: 'file', blob: attachmentBlob,
                mimeType: 'text/plain', fileName: 'owner.txt', byteSize: attachmentBlob.size,
                createdAt: '2026-09-22T00:00:00.000Z', updatedAt: '2026-09-22T00:00:00.000Z'
            }] })
        } });

    assert.deepEqual(await sync.reconcile(), { ok: false, code: 'conflict_pending' });
    const state = JSON.parse(local.getItem('cruisePort.syncAssetMetadata'));
    assert.equal(state.gear['gear-before-owner'].published.final.assetId, finalAssetId);
    assert.equal(state.gear['gear-before-owner'].pending, null);
    assert.equal(state.referencePending, true);
    assert.equal(requests.filter((request) => request.method === 'PUT').length, 0);
    assert.deepEqual(syncController.syncReasons, ['attachment-owner']);
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

test('custom My Apps icon hydrates on another Port with environment-local cache IDs', async () => {
    const finalBlob = blob([10, 11, 12]);
    const sourceBlob = blob([13, 14, 15]);
    const source = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [{
            id: 'app-hydrate', iconId: 'a-final', iconSourceId: 'a-source', iconPresetKey: null
        }] })
    });
    const api = assetApi();
    const aSync = new PortAssetSync({ controller: controller(), storage: source, fetchImpl: api.fetch,
        gearPhotoStore: {}, myAppsIconStore: { getIcon: async (id) => ({ ok: true, record: {
            id, blob: id === 'a-final' ? finalBlob : sourceBlob, mimeType: 'image/webp',
            width: id === 'a-final' ? 256 : 900, height: id === 'a-final' ? 256 : 700
        } }) } });
    assert.equal((await aSync.reconcile()).ok, true);
    const published = JSON.parse(source.getItem('cruisePort.syncAssetMetadata')).myApps['app-hydrate'].published;
    const target = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [{
            id: 'app-hydrate', iconId: null, iconSourceId: null, iconPresetKey: null
        }] }),
        'cruisePort.syncAssetMetadata': JSON.stringify({
            version: 4, gear: {}, myApps: { 'app-hydrate': { published, binding: null, pending: null } },
            attachments: {}, releaseQueue: [], discardQueue: [], referencePending: false
        })
    });
    let cached = 0;
    const bSync = new PortAssetSync({ controller: controller(), storage: target, fetchImpl: api.fetch,
        gearPhotoStore: {}, myAppsIconStore: {
            cacheIcon: async () => ({ ok: true, record: { id: `b-icon-${++cached}` } })
        }, practiceAttachmentStore: { getAllAttachments: async () => ({ ok: true, records: [] }) } });
    api.requests.length = 0;
    assert.equal((await bSync.reconcile()).hydrated, true);
    const item = JSON.parse(target.getItem('cruisePort.myApps')).items[0];
    assert.match(item.iconId, /^b-icon-/u);
    assert.match(item.iconSourceId, /^b-icon-/u);
    assert.equal(item.iconId === 'a-final' || item.iconSourceId === 'a-source', false);
    assert.equal(api.requests.filter((request) => request.method === 'GET').length, 2);
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

test('My Apps reference publish retries after migration without re-uploading the custom icon', async () => {
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [{
            id: 'app-retry', iconId: 'icon-final', iconSourceId: 'icon-source', iconPresetKey: null
        }] })
    });
    const api = assetApi();
    const syncReasons = [];
    let referenceAttempts = 0;
    const syncController = {
        ...controller(),
        async sync(reason) {
            syncReasons.push(reason);
            if (reason === 'asset-reference' && referenceAttempts++ === 0) return { ok: false, code: 'migration_required' };
            return { ok: true };
        }
    };
    const sync = new PortAssetSync({ controller: syncController, storage: local, fetchImpl: api.fetch,
        gearPhotoStore: {}, myAppsIconStore: { getIcon: async (id) => ({ ok: true, record: {
            id, blob: blob(id === 'icon-final' ? [1, 2, 3] : [4, 5, 6]), mimeType: 'image/webp',
            width: id === 'icon-final' ? 256 : 800, height: id === 'icon-final' ? 256 : 600
        } }) } });

    assert.equal((await sync.reconcile()).code, 'migration_required');
    assert.equal(api.requests.filter((request) => request.method === 'PUT').length, 2);
    assert.equal((await sync.reconcile()).ok, true);
    assert.deepEqual(syncReasons, ['asset-reference', 'asset-reference']);
    assert.equal(api.requests.filter((request) => request.method === 'PUT').length, 2);
    assert.equal(JSON.parse(local.getItem('cruisePort.syncAssetMetadata')).referencePending, false);
});

test('Practice attachment reference publish retries after migration without re-uploading the file', async () => {
    const file = new Blob(['reference retry'], { type: 'text/plain' });
    const record = {
        id: 'attachment-retry', practiceId: 'practice-retry', kind: 'file', blob: file,
        mimeType: 'text/plain', fileName: 'retry.txt', byteSize: file.size,
        createdAt: '2026-09-21T01:00:00.000Z', updatedAt: '2026-09-21T01:00:00.000Z'
    };
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] })
    });
    const api = assetApi();
    const syncReasons = [];
    let referenceAttempts = 0;
    const syncController = {
        ...controller(),
        async sync(reason) {
            syncReasons.push(reason);
            if (reason === 'asset-reference' && referenceAttempts++ === 0) return { ok: false, code: 'migration_required' };
            return { ok: true };
        }
    };
    const sync = new PortAssetSync({ controller: syncController, storage: local, fetchImpl: api.fetch,
        gearPhotoStore: {}, myAppsIconStore: {}, practiceAttachmentStore: {
            getAllAttachments: async () => ({ ok: true, records: [record] })
        } });

    assert.equal((await sync.reconcile()).code, 'migration_required');
    assert.equal(api.requests.filter((request) => request.method === 'PUT').length, 1);
    assert.equal((await sync.reconcile()).ok, true);
    assert.deepEqual(syncReasons, ['attachment-owner', 'asset-reference', 'asset-reference']);
    assert.equal(api.requests.filter((request) => request.method === 'PUT').length, 1);
    assert.equal(JSON.parse(local.getItem('cruisePort.syncAssetMetadata')).referencePending, false);
});

test('asset status aggregates Gear, My Apps, Practice and reference pending work without exposing details', async () => {
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [{ id: 'gear-pending', photoId: 'gear-local' }] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [{ id: 'app-pending', iconId: 'app-local', iconPresetKey: null }] }),
        'cruisePort.syncAssetMetadata': JSON.stringify({
            version: 4, gear: {}, myApps: {}, attachments: {}, releaseQueue: [], discardQueue: [], referencePending: true
        })
    });
    const sync = new PortAssetSync({ controller: controller(), storage: local,
        gearPhotoStore: {}, myAppsIconStore: {}, practiceAttachmentStore: {
            getAllAttachments: async () => ({ ok: true, records: [{ id: 'attachment-local' }] })
        } });
    assert.deepEqual(await sync.status(), {
        known: true, pendingCount: 4, running: false, error: false
    });
});

test('online lifecycle retry converges an offline Gear save without another save event', async () => {
    const previousNavigator = globalThis.navigator;
    const previousAddEventListener = globalThis.addEventListener;
    const previousDispatchEvent = globalThis.dispatchEvent;
    const listeners = new Map();
    let online = false;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, get: () => ({ onLine: online }) });
    globalThis.addEventListener = (type, listener) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(listener);
    };
    globalThis.dispatchEvent = (event) => {
        for (const listener of listeners.get(event.type) || []) listener(event);
        return true;
    };
    const local = storage({
        'cruisePort.gearList': JSON.stringify({ version: 4, items: [{ id: 'gear-online', photoId: 'local-final', photoSourceId: null }] }),
        'cruisePort.myApps': JSON.stringify({ version: 6, items: [] })
    });
    const api = assetApi();
    const sync = new PortAssetSync({ controller: controller(), storage: local, fetchImpl: api.fetch,
        gearPhotoStore: { getPhoto: async (id) => ({ ok: true, record: {
            id, blob: blob(), mimeType: 'image/webp', width: 512, height: 512
        } }) }, myAppsIconStore: {}, practiceAttachmentStore: {
            getAllAttachments: async () => ({ ok: true, records: [] })
        } }).bind();
    try {
        assert.equal((await sync.running).offline, true);
        online = true;
        globalThis.dispatchEvent(new Event('online'));
        assert.equal((await sync.running).ok, true);
        assert.equal(api.requests.filter((request) => request.method === 'PUT').length, 1);
        assert.equal(JSON.parse(local.getItem('cruisePort.syncAssetMetadata')).referencePending, false);
    } finally {
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previousNavigator });
        if (previousAddEventListener) globalThis.addEventListener = previousAddEventListener;
        else delete globalThis.addEventListener;
        if (previousDispatchEvent) globalThis.dispatchEvent = previousDispatchEvent;
        else delete globalThis.dispatchEvent;
    }
});
