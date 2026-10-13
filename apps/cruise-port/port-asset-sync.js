import { usesPortRepository, portRepository } from './port-dataset-storage.js?v=1.22.14';
import { getCapabilities } from './cruise-port-capabilities.js?v=1.22.14';
const METADATA_KEY = 'cruisePort.syncAssetMetadata';
const GEAR_KEY = 'cruisePort.gearList';
const MY_APPS_KEY = 'cruisePort.myApps';
const VERSION = 4;
const MAX_ITEMS_PER_PASS = 4;
const metadataBases = new WeakMap();

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function parse(storage, key, fallback) {
    try { return JSON.parse(storage.getItem(key) || '') || clone(fallback); } catch (_) { return clone(fallback); }
}
function emptyMetadata() {
    return { version: VERSION, gear: {}, myApps: {}, attachments: {}, releaseQueue: [], discardQueue: [], referencePending: false };
}
function normalizeMetadata(value) {
    if (!value || ![2, 3, VERSION].includes(value.version)) return emptyMetadata();
    const metadata = {
        version: VERSION,
        gear: value.gear && typeof value.gear === 'object' ? clone(value.gear) : {},
        myApps: value.myApps && typeof value.myApps === 'object' ? clone(value.myApps) : {},
        attachments: value.attachments && typeof value.attachments === 'object' ? clone(value.attachments) : {},
        releaseQueue: Array.isArray(value.releaseQueue) ? [...new Set(value.releaseQueue.filter(Boolean))] : [],
        discardQueue: Array.isArray(value.discardQueue) ? [...new Set(value.discardQueue.filter(Boolean))] : [],
        referencePending: value.referencePending === true
    };
    // v3 could finish an upload before the dataset migration completed. Replay one
    // structured reference publish for those legacy available assets after upgrade.
    if (value.version < VERSION && !metadata.referencePending) {
        metadata.referencePending = hasAvailablePublished(metadata);
    }
    return metadata;
}
function assetIds(asset) {
    return [asset?.final?.assetId, asset?.source?.assetId].filter(Boolean);
}
function hasAvailablePublished(metadata) {
    return [metadata.gear, metadata.myApps, metadata.attachments]
        .some((bucket) => Object.values(bucket).some((entry) => entry?.published?.availability === 'available'));
}
function uuid() { return globalThis.crypto.randomUUID(); }
async function hashBlob(blob, cryptoImpl = globalThis.crypto) {
    const digest = await cryptoImpl.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function practiceAssetKind(record) {
    if (record?.kind === 'image') return 'practice_attachment_image';
    if (record?.mimeType === 'application/pdf') return 'practice_attachment_pdf';
    if (record?.mimeType === 'text/plain') return 'practice_attachment_text';
    return null;
}

export class PortAssetSync {
    constructor({ controller, gearPhotoStore, myAppsIconStore, practiceAttachmentStore, storage = globalThis.localStorage,
        fetchImpl = globalThis.fetch?.bind(globalThis), cryptoImpl = globalThis.crypto,
        canSync = () => getCapabilities().cloudSyncOperations } = {}) {
        this.canSync = canSync;
        this.controller = controller;
        this.gearPhotoStore = gearPhotoStore;
        this.myAppsIconStore = myAppsIconStore;
        this.practiceAttachmentStore = practiceAttachmentStore;
        this.storage = storage;
        this.fetchImpl = fetchImpl;
        this.cryptoImpl = cryptoImpl;
        this.running = null;
        this.pendingAgain = false;
        this.bound = false;
        this.lastErrorCode = null;
        this.disposed = false;
        this.listeners = [];
    }

    async wait(operation, owner) {
        const check = () => {
            if (this.disposed || this.controller?.runtime !== owner || owner?.disposed) throw new Error('account_generation_changed');
            owner?.assertActive?.();
        };
        check(); const result = await operation(); check();
        await owner?.assertCurrentAsync?.(); check(); return result;
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true; this.pendingAgain = false;
        for (const remove of this.listeners || []) remove();
        this.listeners = []; this.bound = false;
    }
    readMetadata() {
        const raw = this.storage.getItem(METADATA_KEY);
        const value = normalizeMetadata(parse(this.storage, METADATA_KEY, emptyMetadata()));
        metadataBases.set(value, raw);
        return value;
    }
    async coordinated(method, args, expectedValues) {
        const runtimeOwner = this.controller?.runtime;

        const repo = portRepository(this.storage);
        const base = await this.wait(async () => (repo.readDatasetState()), runtimeOwner);
        const result = await this.wait(async () => (repo.runWrite({ expectedRevision: base.revision, expectedValues, assertCurrent: async () => {
            if (this.controller?.runtime !== runtimeOwner || runtimeOwner?.disposed) throw new Error('account_generation_changed');
            await runtimeOwner?.assertCurrentAsync?.();
            if (this.controller?.runtime !== runtimeOwner || runtimeOwner?.disposed) throw new Error('account_generation_changed');
        } }, async tx => {
            const isolated = Object.assign(Object.create(Object.getPrototypeOf(this)), this, { storage: tx, schedule: () => {} });
            return { ok: true, value: await this.wait(async () => (isolated[method](...args)), runtimeOwner) };
        })), runtimeOwner);
        if (!result.ok) throw Object.assign(new Error(result.reason), { code: result.reason });
        return result.value;
    }
    writeMetadata(metadata) {
        if (usesPortRepository(this.storage)) return this.coordinated('writeMetadata', [metadata],
            { [METADATA_KEY]: metadataBases.has(metadata) ? metadataBases.get(metadata) : this.storage.getItem(METADATA_KEY) });
        this.storage.setItem(METADATA_KEY, JSON.stringify(normalizeMetadata(metadata)));
    }

    async patchMetadataEntry(bucket, id, expected, next, { releaseIds = [], referencePending = false } = {}) {
        if (usesPortRepository(this.storage)) return this.coordinated('patchMetadataEntry', [bucket, id, expected, next, { releaseIds, referencePending }]);
        const latest = this.readMetadata();
        if (JSON.stringify(latest[bucket][id] ?? null) !== JSON.stringify(expected ?? null)) return false;
        latest[bucket][id] = clone(next);
        latest.releaseQueue = [...new Set([...latest.releaseQueue, ...releaseIds].filter(Boolean))];
        latest.referencePending ||= referencePending;
        (await this.writeMetadata(latest));
        return true;
    }

    async queueOrphanAssets(ids) {
        if (usesPortRepository(this.storage)) return this.coordinated('queueOrphanAssets', [ids]);
        const latest = this.readMetadata();
        latest.releaseQueue = [...new Set([...latest.releaseQueue, ...ids].filter(Boolean))];
        (await this.writeMetadata(latest));
    }

    currentVisualItem(kind, item) {
        const key = kind === 'gear' ? GEAR_KEY : MY_APPS_KEY;
        const latest = parse(this.storage, key, { items: [] });
        const current = (latest.items || []).find((candidate) => candidate.id === item.id);
        const finalKey = kind === 'gear' ? 'photoId' : 'iconId';
        const sourceKey = kind === 'gear' ? 'photoSourceId' : 'iconSourceId';
        return current && current[finalKey] === item[finalKey] &&
            (current[sourceKey] || null) === (item[sourceKey] || null);
    }

    recordDeletionIntents(keys) {
        if (usesPortRepository(this.storage)) return this.coordinated('recordDeletionIntents', [keys]);
        const intentKey = 'cruisePort.syncDeletionIntent.v1';
        try {
            const intents = JSON.parse(this.storage.getItem(intentKey) || '{}');
            if (!intents || typeof intents !== 'object' || Array.isArray(intents)) return;
            keys.forEach((key) => { intents[key] = true; });
            this.storage.setItem(intentKey, JSON.stringify(intents));
        } catch (_) { /* Missing intent safely prevents a cloud deletion. */ }
    }

    async markLocalRemovals() {
        if (usesPortRepository(this.storage)) return this.coordinated('markLocalRemovals', []);
        const metadata = this.readMetadata();
        const gear = new Map((parse(this.storage, GEAR_KEY, { items: [] }).items || []).map((item) => [item.id, item]));
        const apps = new Map((parse(this.storage, MY_APPS_KEY, { items: [] }).items || []).map((item) => [item.id, item]));
        let changed = false;
        for (const [id, entry] of Object.entries(metadata.gear)) {
            const item = gear.get(id);
            if ((!item || (!item.photoId && !item.photoSourceId)) && entry.published) {
                metadata.releaseQueue.push(...assetIds(entry.published));
                metadata.gear[id] = { ...entry, published: null, binding: null, pending: null };
                changed = true;
            }
        }
        for (const [id, entry] of Object.entries(metadata.myApps)) {
            const item = apps.get(id);
            if ((!item || (!item.iconId && !item.iconSourceId) || item.iconPresetKey) && entry.published) {
                metadata.releaseQueue.push(...assetIds(entry.published));
                metadata.myApps[id] = { ...entry, published: null, binding: null, pending: null };
                changed = true;
            }
        }
        if (changed) {
            metadata.releaseQueue = [...new Set(metadata.releaseQueue)];
            (await this.writeMetadata(metadata));
        }
    }

    bind() {
        if (this.disposed || !this.canSync() || this.bound || !globalThis.addEventListener) return this;
        this.bound = true;
        const unsubscribe = this.controller?.subscribe?.(status => {
            if (status.state === 'unknown') { this.lastErrorCode = null; this.pendingAgain = false; }
        });
        if (unsubscribe) this.listeners.push(unsubscribe);
        const listen = (name, callback) => { globalThis.addEventListener(name, callback); this.listeners.push(() => globalThis.removeEventListener(name, callback)); };
        listen('cruise-port-local-data-changed', async () => {
            try {
                await this.markLocalRemovals();
                this.schedule('local-save');
            } catch (error) {
                this.lastErrorCode = error.code || 'write-failed';
                this.emitStatus('error');
            }
        });
        listen('cruise-port-cloud-data-applied', () => this.schedule('remote-apply'));
        listen('online', () => this.schedule('online'));
        listen('cruise-port-sync-state', (event) => {
            if (event.detail?.state === 'ready') this.schedule('ready');
        });
        this.schedule('startup');
        return this;
    }

    schedule(reason) {
        if (this.blockedAuthority && this.blockedAuthority.owner === this.controller?.runtime)
            return Promise.resolve({ ok: false, code: this.blockedAuthority.code });
        if (!this.canSync()) return Promise.resolve({ ok: false, code: 'pro_required' });
        if (this.disposed || !this.controller?.runtime) return Promise.resolve({ ok: false, code: 'activation_required' });

        if (this.running) { this.pendingAgain = true; return this.running; }
        const owner = this.controller.runtime;
        this.emitStatus('syncing');
        this.running = Promise.resolve().then(async () => {
            if (this.disposed || this.controller.runtime !== owner) throw new Error('account_generation_changed');
            return this.reconcile(reason);
        }).then((result) => {
            if (this.disposed || this.controller.runtime !== owner) return result;
            this.lastErrorCode = result?.ok === false && !result.offline
                ? (result.code || 'asset_sync_failed') : null;
            return result;
        }).catch((error) => {
            if (this.disposed || this.controller.runtime !== owner) return { ok: false, code: 'account_generation_changed' };
            const code = typeof error?.message === 'string' ? error.message : 'asset_sync_failed';
            this.lastErrorCode = code;
            if (typeof globalThis.CustomEvent === 'function') {
                globalThis.dispatchEvent?.(new CustomEvent('cruise-port-asset-sync-error', { detail: { code } }));
            }
            return { ok: false, code };
        })
            .finally(() => {
                this.running = null;
                if (!this.disposed && this.controller.runtime === owner) this.emitStatus(this.lastErrorCode ? 'error' : 'settled');
                const shouldRetry = this.pendingAgain && !this.lastErrorCode;
                this.pendingAgain = false;
                if (!this.disposed && shouldRetry) this.schedule('pending');
            });
        return this.running;
    }

    emitStatus(state) {
        if (typeof globalThis.CustomEvent !== 'function') return;
        globalThis.dispatchEvent?.(new CustomEvent('cruise-port-asset-sync-state', {
            detail: Object.freeze({ state })
        }));
    }

    async status() {
        try {
            const metadata = this.readMetadata();
            const gearItems = parse(this.storage, GEAR_KEY, { items: [] }).items || [];
            const myApps = parse(this.storage, MY_APPS_KEY, { items: [] }).items || [];
            let pendingCount = metadata.releaseQueue.length + metadata.discardQueue.length;
            if (metadata.referencePending) pendingCount += 1;
            for (const item of gearItems) {
                const entry = metadata.gear[item.id];
                if (entry?.pending || (item.photoId && (entry?.binding?.final?.localId !== item.photoId ||
                    (item.photoSourceId || null) !== (entry?.binding?.source?.localId || null)))) pendingCount += 1;
            }
            for (const item of myApps) {
                const entry = metadata.myApps[item.id];
                if (entry?.pending || (!item.iconPresetKey && item.iconId &&
                    (entry?.binding?.final?.localId !== item.iconId ||
                    (item.iconSourceId || null) !== (entry?.binding?.source?.localId || null)))) pendingCount += 1;
            }
            const localAttachments = await this.practiceAttachmentStore?.getAllAttachments?.();
            if (localAttachments && localAttachments.ok !== true) {
                return Object.freeze({ known: false, pendingCount, running: Boolean(this.running), error: Boolean(this.lastErrorCode) });
            }
            for (const record of localAttachments?.records || []) {
                const matched = Object.values(metadata.attachments).some((entry) =>
                    entry.binding?.localId === record.id && entry.published?.availability === 'available');
                if (!matched) pendingCount += 1;
            }
            pendingCount += Object.values(metadata.attachments).filter((entry) => entry?.pending).length;
            return Object.freeze({
                known: true,
                pendingCount,
                running: Boolean(this.running) || this.pendingAgain,
                error: Boolean(this.lastErrorCode)
            });
        } catch (_) {
            return Object.freeze({ known: false, pendingCount: 0, running: Boolean(this.running), error: true });
        }
    }

    async headers(contentType = null) {
        const runtimeOwner = this.controller?.runtime;

        if (!this.canSync()) throw new Error('pro_required');
        const credential = await this.wait(async () => (this.controller?.runtime?.credential?.()), runtimeOwner);
        const qaCredential = await this.wait(async () => (this.controller?.runtime?.qaCredential?.()), runtimeOwner);
        if (typeof credential !== 'string') throw new Error('asset_auth_required');
        const headers = new Headers({ Accept: 'application/json', Authorization: `Bearer ${credential}` });
        const proHeaders = await this.wait(async () => (globalThis.SoundCruiseProBackendEntitlement?.proAuthorizationHeaders?.()), runtimeOwner);
        for (const [name, value] of Object.entries(proHeaders || {})) headers.set(name, value);
        if (this.controller.runtime.admissionMode === 'qa') {
            if (typeof qaCredential !== 'string') throw new Error('asset_qa_required');
            headers.set('X-Sound-Cruise-QA-Authorization', `Bearer ${qaCredential}`);
        }
        if (contentType) headers.set('Content-Type', contentType);
        return headers;
    }

    assertMutationAuthority() {
        if (this.blockedAuthority && this.blockedAuthority.owner === this.controller?.runtime)
            throw new Error(this.blockedAuthority.code);
    }

    rejectMutationAuthority(code, owner) {
        if (/^(?:writer_protocol_|sync_protocol_|dataset_epoch_)/.test(code || '') ||
            ['dataset_authority_unavailable', 'legacy_outbox_needs_migration'].includes(code)) {
            this.blockedAuthority = { owner, code };
        }
    }

    async json(path, body) {
        this.assertMutationAuthority();
        const runtimeOwner = this.controller?.runtime;

        if (!this.canSync()) throw new Error('pro_required');
        const headers = await this.wait(async () => (this.headers('application/json')), runtimeOwner);
        body = runtimeOwner?.writerEnvelope?.(body) || body;
        const response = await this.wait(async () => (this.fetchImpl(`${this.controller.runtime.endpoint}${path}`, {
            method: 'POST', headers,
            body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: runtimeOwner?.lifetime?.signal
        })), runtimeOwner);
        const payload = await this.wait(async () => (response.json().catch(() => null)), runtimeOwner);
        if (!response.ok || payload?.ok !== true) {
            globalThis.SoundCruiseProBackendEntitlement?.rejectProAuthorization?.(payload?.code, headers);
            this.rejectMutationAuthority(payload?.code, runtimeOwner);
            throw new Error(payload?.code || 'asset_request_failed');
        }
        return payload;
    }

    async dimensions(blob, kind) {
        if (kind === 'gear_photo_final') return { width: 512, height: 512 };
        if (kind === 'my_app_icon_final') return { width: 256, height: 256 };
        if (kind === 'practice_attachment_pdf' || kind === 'practice_attachment_text') return { width: 1, height: 1 };
        const image = await globalThis.createImageBitmap(blob);
        try { return { width: image.width, height: image.height }; } finally { image.close?.(); }
    }

    pendingAuthority() {
        const fields = this.controller?.runtime?.writerWireContext?.fields;
        return fields ? { writerAuthority: { ...fields }, ...(this.controller.runtime.writerWireContext.context ?
            { authorityContext: { ...this.controller.runtime.writerWireContext.context } } : {}) } : {};
    }

    async upload(record, kind, pending = null, owner = null) {
        this.assertMutationAuthority();
        const runtimeOwner = this.controller?.runtime;

        if (!this.canSync()) throw new Error('pro_required');
        if (!record?.blob) throw new Error('asset_local_missing');
        const hash = await this.wait(async () => (hashBlob(record.blob, this.cryptoImpl)), runtimeOwner);
        const dimensions = record.width && record.height
            ? { width: record.width, height: record.height }
            : await this.wait(async () => (this.dimensions(record.blob, kind)), runtimeOwner);
        const wireFields = runtimeOwner?.writerWireContext?.fields;
        if (pending && (JSON.stringify(pending.writerAuthority || null) !== JSON.stringify(wireFields || null) ||
            JSON.stringify(pending.authorityContext || null) !== JSON.stringify(runtimeOwner?.writerWireContext?.context || null)))
            throw new Error('legacy_outbox_needs_migration');
        const operation = pending?.localId === record.id && pending?.hash === hash
            ? pending
            : { localId: record.id, assetId: uuid(), operationId: uuid(), hash, ...this.pendingAuthority() };
        const request = {
            appId: 'port', assetId: operation.assetId, operationId: operation.operationId,
            kind, hash, mime: record.mimeType || record.blob.type, byteSize: record.blob.size,
            width: dimensions.width, height: dimensions.height,
            ...(owner ? { ownerRecordId: owner.practiceId, originalFilename: owner.fileName } : {})
        };
        const prepared = await this.wait(async () => (this.json('/v1/sync/assets/prepare', request)), runtimeOwner);
        if (prepared.phase !== 'available') {
            if (prepared.phase !== 'uploaded') {
                const headers = await this.wait(async () => (this.headers(request.mime)), runtimeOwner);
                for (const [name, value] of Object.entries(runtimeOwner?.writerHeaders?.() || {})) headers.set(name, value);
                headers.set('X-Sound-Cruise-Operation-Id', operation.operationId);
                headers.set('X-Content-SHA256', hash);
                const response = await this.wait(async () => (this.fetchImpl(
                    `${this.controller.runtime.endpoint}/v1/sync/assets/${encodeURIComponent(operation.assetId)}/content`,
                    { method: 'PUT', headers, body: record.blob, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: runtimeOwner?.lifetime?.signal }
                )), runtimeOwner);
                const payload = await this.wait(async () => (response.json().catch(() => null)), runtimeOwner);
                if (!response.ok || payload?.ok !== true) {
                    globalThis.SoundCruiseProBackendEntitlement?.rejectProAuthorization?.(payload?.code, headers);
                    this.rejectMutationAuthority(payload?.code, runtimeOwner);
                    throw new Error(payload?.code || 'asset_upload_failed');
                }
            }
            const committed = await this.wait(async () => (this.json('/v1/sync/assets/commit', {
                appId: 'port', assetId: operation.assetId, operationId: operation.operationId, hash
            })), runtimeOwner);
            return { operation, asset: committed.asset };
        }
        return { operation, asset: prepared.asset };
    }

    async download(asset) {
        const runtimeOwner = this.controller?.runtime;

        if (!this.canSync()) throw new Error('pro_required');
        const headers = await this.wait(async () => (this.headers()), runtimeOwner);
        const response = await this.wait(async () => (this.fetchImpl(
            `${this.controller.runtime.endpoint}/v1/sync/assets/${encodeURIComponent(asset.assetId)}`,
            { method: 'GET', headers, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: runtimeOwner?.lifetime?.signal }
        )), runtimeOwner);
        if (!response.ok) {
            const payload = await this.wait(async () => (response.json().catch(() => null)), runtimeOwner);
            globalThis.SoundCruiseProBackendEntitlement?.rejectProAuthorization?.(payload?.code, headers);
            throw new Error(payload?.code || 'asset_download_failed');
        }
        if (response.headers.get('X-Asset-SHA256') !== asset.hash) throw new Error('asset_hash_mismatch');
        const blob = await this.wait(async () => (response.blob()), runtimeOwner);
        if (blob.size !== asset.byteSize || blob.type !== asset.mime || await this.wait(async () => (hashBlob(blob, this.cryptoImpl)), runtimeOwner) !== asset.hash) {
            throw new Error('asset_integrity_failed');
        }
        return blob;
    }

    async uploadPair(item, entry, kind, expected) {
        const finalId = kind === 'gear' ? item.photoId : item.iconId;
        const sourceId = kind === 'gear' ? item.photoSourceId : item.iconSourceId;
        const get = (id) => kind === 'gear' ? this.gearPhotoStore.getPhoto(id) : this.myAppsIconStore.getIcon(id);
        const finalRecord = finalId ? (await get(finalId)).record : null;
        const sourceRecord = sourceId ? (await get(sourceId)).record : null;
        if (!finalRecord) return null;
        entry.pending = entry.pending && entry.pending.final?.localId === finalId &&
            (entry.pending.source?.localId || null) === (sourceId || null) ? entry.pending : {
                final: { localId: finalId, assetId: uuid(), operationId: uuid(), ...this.pendingAuthority(), hash: await hashBlob(finalRecord.blob, this.cryptoImpl) },
                source: sourceRecord ? { localId: sourceId, assetId: uuid(), operationId: uuid(), ...this.pendingAuthority(), hash: await hashBlob(sourceRecord.blob, this.cryptoImpl) } : null
            };
        if (!this.currentVisualItem(kind, item) ||
            !(await this.patchMetadataEntry(kind === 'gear' ? 'gear' : 'myApps', item.id, expected, entry))) return null;
        const sourceKind = kind === 'gear' ? 'gear_photo_source' : 'my_app_icon_source';
        const finalKind = kind === 'gear' ? 'gear_photo_final' : 'my_app_icon_final';
        const source = sourceRecord ? await this.upload(sourceRecord, sourceKind, entry.pending.source) : null;
        const final = await this.upload(finalRecord, finalKind, entry.pending.final);
        return {
            published: {
                version: 1, availability: 'available', final: final.asset,
                source: source?.asset || null,
                crop: clone(kind === 'gear' ? item.photoCrop : item.iconCrop)
            },
            binding: {
                final: { assetId: final.asset.assetId, hash: final.asset.hash, localId: finalId },
                source: source ? { assetId: source.asset.assetId, hash: source.asset.hash, localId: sourceId } : null
            }
        };
    }

    async hydratePair(item, entry, kind) {
        const published = entry?.published;
        if (!published?.final || published.availability !== 'available') return false;
        const finalKey = kind === 'gear' ? 'photoId' : 'iconId';
        const sourceKey = kind === 'gear' ? 'photoSourceId' : 'iconSourceId';
        if (item[finalKey] && entry.binding?.final?.assetId !== published.final.assetId) return false;
        let finalLocal = entry.binding?.final?.assetId === published.final.assetId ? entry.binding.final.localId : null;
        let sourceLocal = published.source && entry.binding?.source?.assetId === published.source.assetId
            ? entry.binding.source.localId : null;
        if (!finalLocal) {
            const blob = await this.download(published.final);
            const saved = kind === 'gear'
                ? await this.gearPhotoStore.cachePhoto(blob, { kind: 'final', width: published.final.width, height: published.final.height })
                : await this.myAppsIconStore.cacheIcon(blob);
            if (!saved.ok) throw new Error('asset_cache_failed');
            finalLocal = saved.record.id;
        }
        if (published.source && !sourceLocal) {
            const blob = await this.download(published.source);
            const saved = kind === 'gear'
                ? await this.gearPhotoStore.cachePhoto(blob, { kind: 'source', width: published.source.width, height: published.source.height })
                : await this.myAppsIconStore.cacheIcon(blob);
            if (!saved.ok) throw new Error('asset_cache_failed');
            sourceLocal = saved.record.id;
        }
        item[finalKey] = finalLocal;
        item[sourceKey] = sourceLocal;
        const cropKey = kind === 'gear' ? 'photoCrop' : 'iconCrop';
        item[cropKey] = clone(published.crop);
        entry.binding = {
            final: { assetId: published.final.assetId, hash: published.final.hash, localId: finalLocal },
            source: published.source ? { assetId: published.source.assetId, hash: published.source.hash, localId: sourceLocal } : null
        };
        return true;
    }

    async cachedBindingMissing(item, entry, kind) {
        const published = entry?.published;
        if (published?.availability !== 'available' || !published.final?.assetId) return false;
        const finalKey = kind === 'gear' ? 'photoId' : 'iconId';
        const sourceKey = kind === 'gear' ? 'photoSourceId' : 'iconSourceId';
        const get = (id) => kind === 'gear' ? this.gearPhotoStore.getPhoto(id) : this.myAppsIconStore.getIcon(id);
        if (!item[finalKey] || entry.binding?.final?.assetId !== published.final.assetId) return false;
        const final = await get(item[finalKey]);
        const source = published.source && item[sourceKey] && entry.binding?.source?.assetId === published.source.assetId
            ? await get(item[sourceKey]) : null;
        if (final?.record && (!published.source || source?.record)) return false;
        item[finalKey] = null;
        item[sourceKey] = null;
        entry.binding = null;
        return true;
    }

    async listPracticeAttachments(practiceId) {
        const local = await this.practiceAttachmentStore?.getAttachments(practiceId);
        if (!local?.ok) return { ok: false, records: [], reason: local?.reason || 'read-failed' };
        const metadata = this.readMetadata();
        const localById = new Map(local.records.map((record) => [record.id, record]));
        const records = [];
        for (const [logicalId, entry] of Object.entries(metadata.attachments)) {
            if (entry.practiceId !== practiceId || !entry.published?.asset || entry.published.availability !== 'available') continue;
            const cached = entry.binding?.localId ? localById.get(entry.binding.localId) : null;
            if (cached) localById.delete(cached.id);
            records.push(cached ? { ...cached, logicalId } : {
                id: logicalId, logicalId, practiceId: entry.practiceId, kind: entry.kind,
                mimeType: entry.mimeType, fileName: entry.fileName, byteSize: entry.byteSize,
                createdAt: entry.createdAt, updatedAt: entry.updatedAt, blob: null, cloudOnly: true
            });
        }
        localById.forEach((record) => records.push({ ...record, logicalId: null }));
        records.sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
        return { ok: true, records };
    }

    async ensurePracticeAttachment(id) {
        const metadata = this.readMetadata();
        const pair = Object.entries(metadata.attachments).find(([logicalId, entry]) =>
            logicalId === id || entry.binding?.localId === id);
        if (!pair) return this.practiceAttachmentStore?.getAttachment(id);
        const [logicalId, entry] = pair;
        if (entry.binding?.localId) {
            const cached = await this.practiceAttachmentStore.getAttachment(entry.binding.localId);
            if (cached?.record) return { ok: true, record: { ...cached.record, logicalId } };
        }
        if (!entry.published?.asset || entry.published.availability !== 'available') {
            return { ok: false, record: null, reason: 'not-available' };
        }
        if (!this.canSync()) return { ok: false, code: 'pro_required' };
        const blob = await this.download(entry.published.asset);
        const saved = await this.practiceAttachmentStore.cacheAttachment(blob, entry);
        if (!saved.ok) return { ok: false, record: null, reason: saved.reason || 'write-failed' };
        entry.binding = { assetId: entry.published.asset.assetId, hash: entry.published.asset.hash, localId: saved.record.id };
        metadata.attachments[logicalId] = entry;
        (await this.writeMetadata(metadata));
        return { ok: true, record: { ...saved.record, logicalId } };
    }

    async removePracticeAttachment({ id, logicalId = null } = {}) {
        if (usesPortRepository(this.storage)) return this.coordinated('removePracticeAttachment', [{ id, logicalId }]);
        const metadata = this.readMetadata();
        const pair = Object.entries(metadata.attachments).find(([candidateId, entry]) =>
            candidateId === logicalId || candidateId === id || entry.binding?.localId === id);
        if (!pair) return false;
        const [candidateId, entry] = pair;
        if (entry.published?.asset?.assetId) metadata.releaseQueue.push(entry.published.asset.assetId);
        delete metadata.attachments[candidateId];
        (await this.recordDeletionIntents([
            `practice_attachment/${candidateId}`,
            ...(!Object.values(metadata.attachments).some((other) => other.practiceId === entry.practiceId)
                ? [`practice_attachment_set/${entry.practiceId}`] : [])
        ]));
        metadata.releaseQueue = [...new Set(metadata.releaseQueue.filter(Boolean))];
        (await this.writeMetadata(metadata));
        this.schedule('attachment-delete');
        return true;
    }

    async removePracticeAttachments(practiceId) {
        if (usesPortRepository(this.storage)) return this.coordinated('removePracticeAttachments', [practiceId]);
        const metadata = this.readMetadata();
        let changed = false;
        const deletedIds = [];
        for (const [logicalId, entry] of Object.entries(metadata.attachments)) {
            if (entry.practiceId !== practiceId) continue;
            if (entry.published?.asset?.assetId) metadata.releaseQueue.push(entry.published.asset.assetId);
            delete metadata.attachments[logicalId];
            deletedIds.push(logicalId);
            changed = true;
        }
        if (changed) {
            (await this.recordDeletionIntents([...deletedIds.map((id) => `practice_attachment/${id}`),
                `practice_attachment_set/${practiceId}`]));
            metadata.releaseQueue = [...new Set(metadata.releaseQueue.filter(Boolean))];
            (await this.writeMetadata(metadata));
            this.schedule('practice-delete');
        }
        return changed;
    }

    async reconcile() {
        const runtimeOwner = this.controller?.runtime;

        if (!this.canSync()) throw new Error('pro_required');
        if (!this.controller?.enabled || !runtimeOwner || globalThis.navigator?.onLine === false) return { ok: false, offline: true };
        await this.wait(async () => (this.controller.reconcileAssetReferences?.()), runtimeOwner);
        const metadata = this.readMetadata();
        const gearData = parse(this.storage, GEAR_KEY, { version: 4, items: [] });
        const appData = parse(this.storage, MY_APPS_KEY, { version: 6, items: [] });
        let publishedChanged = false;
        let hydrated = false;
        const hydratedPatches = { gear: new Map(), myApps: new Map() };
        let processed = 0;
        if (metadata.discardQueue.length && this.practiceAttachmentStore) {
            for (const localId of metadata.discardQueue) await this.wait(async () => (this.practiceAttachmentStore.deleteAttachment(localId)), runtimeOwner);
            const latest = this.readMetadata();
            const processedIds = new Set(metadata.discardQueue);
            latest.discardQueue = latest.discardQueue.filter((id) => !processedIds.has(id));
            (await this.wait(async () => (this.writeMetadata(latest)), runtimeOwner));
        }
        const process = async (items, bucketName, kind) => {
            for (const item of items) {
                if (processed >= MAX_ITEMS_PER_PASS) { this.pendingAgain = true; break; }
                const finalId = kind === 'gear' ? item.photoId : item.iconId;
                const sourceId = kind === 'gear' ? item.photoSourceId : item.iconSourceId;
                const entry = this.readMetadata()[bucketName][item.id] || { published: null, binding: null, pending: null };
                const before = clone(this.readMetadata()[bucketName][item.id] || null);
                const missingCache = await this.wait(async () => (this.cachedBindingMissing(item, entry, kind)), runtimeOwner);
                if (!missingCache && finalId && (!entry.binding || entry.binding.final?.localId !== finalId ||
                    (sourceId || null) !== (entry.binding.source?.localId || null))) {
                    processed += 1;
                    const oldIds = assetIds(entry.published);
                    const uploaded = await this.wait(async () => (this.uploadPair(item, entry, kind, before)), runtimeOwner);
                    if (!uploaded) continue;
                    const uploadedIds = assetIds(uploaded.published);
                    const currentItem = (parse(this.storage, kind === 'gear' ? GEAR_KEY : MY_APPS_KEY,
                        { items: [] }).items || []).find((candidate) => candidate.id === item.id);
                    uploaded.published.crop = clone(currentItem?.[kind === 'gear' ? 'photoCrop' : 'iconCrop'] || null);
                    if (!this.currentVisualItem(kind, item) || !(await this.wait(async () => (this.patchMetadataEntry(bucketName, item.id,
                        entry, { ...entry, ...uploaded, pending: null }, {
                            releaseIds: oldIds.filter((id) => !uploadedIds.includes(id)), referencePending: true
                        })), runtimeOwner))) {
                        (await this.wait(async () => (this.queueOrphanAssets(uploadedIds)), runtimeOwner));
                        continue;
                    }
                    publishedChanged = true;
                } else if ((missingCache || !finalId) && entry.published?.final) {
                    processed += 1;
                    const visualBefore = { finalId, sourceId };
                    if (await this.wait(async () => (this.hydratePair(item, entry, kind)), runtimeOwner)) {
                        if (!(await this.wait(async () => (this.patchMetadataEntry(bucketName, item.id, before, entry)), runtimeOwner))) continue;
                        hydratedPatches[bucketName].set(item.id, {
                            before: visualBefore, finalId: item[kind === 'gear' ? 'photoId' : 'iconId'],
                            sourceId: item[kind === 'gear' ? 'photoSourceId' : 'iconSourceId'],
                            crop: clone(item[kind === 'gear' ? 'photoCrop' : 'iconCrop'])
                        });
                        hydrated = true;
                    }
                }
            }
        };
        await this.wait(async () => (process(gearData.items || [], 'gear', 'gear')), runtimeOwner);
        await this.wait(async () => (process(appData.items || [], 'myApps', 'myApps')), runtimeOwner);
        const localAttachments = await this.wait(async () => (this.practiceAttachmentStore?.getAllAttachments()), runtimeOwner);
        if (localAttachments?.ok) {
            let ownerSynced = false;
            for (const record of localAttachments.records) {
                if (processed >= MAX_ITEMS_PER_PASS) { this.pendingAgain = true; break; }
                let pair = Object.entries(this.readMetadata().attachments).find(([, entry]) =>
                    entry.binding?.localId === record.id || entry.pending?.localId === record.id);
                const logicalId = pair?.[0] || uuid();
                const entryBefore = clone(pair?.[1] || null);
                const entry = pair?.[1] || {
                    practiceId: record.practiceId, kind: record.kind, mimeType: record.mimeType,
                    fileName: record.fileName, byteSize: record.byteSize,
                    createdAt: record.createdAt, updatedAt: record.updatedAt || record.createdAt,
                    published: null, binding: null, pending: null
                };
                if (entry.published?.asset && entry.binding?.localId === record.id &&
                    entry.binding.hash === entry.published.asset.hash) continue;
                const assetKind = practiceAssetKind(record);
                if (!assetKind) continue;
                if (!ownerSynced) {
                    // Preserve completed Gear/My Apps work before the owner
                    // preflight, which may safely pause on a structured conflict.
                    const ownerResult = await this.wait(async () => (this.controller.sync('attachment-owner')), runtimeOwner);
                    if (ownerResult?.ok === false) return { ok: false, code: ownerResult.code || 'attachment_owner_sync_failed' };
                    ownerSynced = true;
                }
                processed += 1;
                entry.pending = entry.pending?.localId === record.id ? entry.pending : {
                    localId: record.id, assetId: uuid(), operationId: uuid(), ...this.pendingAuthority(),
                    hash: await this.wait(async () => (hashBlob(record.blob, this.cryptoImpl)), runtimeOwner)
                };
                const before = this.readMetadata().attachments[logicalId] || null;
                if (JSON.stringify(before) !== JSON.stringify(entryBefore)) continue;
                const freshLocal = await this.wait(async () => (this.practiceAttachmentStore.getAllAttachments()), runtimeOwner);
                if (!freshLocal?.ok) return { ok: false, code: 'attachment_local_read_failed' };
                if (!freshLocal.records.some((item) => item.id === record.id)) continue;
                if (!(await this.wait(async () => (this.patchMetadataEntry('attachments', logicalId, before, entry)), runtimeOwner))) continue;
                const pendingEntry = clone(entry);
                const uploaded = await this.wait(async () => (this.upload(record, assetKind, entry.pending, {
                    practiceId: record.practiceId, fileName: record.fileName
                })), runtimeOwner);
                const stillLocal = await this.wait(async () => (this.practiceAttachmentStore.getAllAttachments()), runtimeOwner);
                if (!stillLocal?.ok) return { ok: false, code: 'attachment_local_read_failed' };
                if (!stillLocal.records.some((item) => item.id === record.id)) {
                    (await this.wait(async () => (this.queueOrphanAssets([uploaded.asset.assetId])), runtimeOwner));
                    continue;
                }
                const previousAssetId = entry.published?.asset?.assetId;
                entry.published = { version: 1, availability: 'available', asset: uploaded.asset };
                entry.binding = { assetId: uploaded.asset.assetId, hash: uploaded.asset.hash, localId: record.id };
                entry.pending = null;
                entry.updatedAt = record.updatedAt || record.createdAt;
                if (!(await this.wait(async () => (this.patchMetadataEntry('attachments', logicalId, pendingEntry, entry,
                    { releaseIds: previousAssetId && previousAssetId !== uploaded.asset.assetId ? [previousAssetId] : [],
                        referencePending: true })), runtimeOwner))) {
                    (await this.wait(async () => (this.queueOrphanAssets([uploaded.asset.assetId])), runtimeOwner));
                    continue;
                }
                publishedChanged = true;
            }
        }
        if (hydrated) {
            const changedKeys = [];
            for (const [kind, key] of [['gear', GEAR_KEY], ['myApps', MY_APPS_KEY]]) {
                const patches = hydratedPatches[kind];
                if (!patches.size) continue;
                const ownerRaw = this.storage.getItem(key);
                const latest = parse(this.storage, key, { version: kind === 'gear' ? 5 : 7, items: [] });
                const finalKey = kind === 'gear' ? 'photoId' : 'iconId';
                const sourceKey = kind === 'gear' ? 'photoSourceId' : 'iconSourceId';
                const cropKey = kind === 'gear' ? 'photoCrop' : 'iconCrop';
                let changed = false;
                for (const item of latest.items || []) {
                    const patch = patches.get(item.id);
                    if (!patch || (item[finalKey] || null) !== (patch.before.finalId || null) ||
                        (item[sourceKey] || null) !== (patch.before.sourceId || null)) continue;
                    item[finalKey] = patch.finalId;
                    item[sourceKey] = patch.sourceId;
                    item[cropKey] = patch.crop;
                    changed = true;
                }
                if (changed) {
                    if (usesPortRepository(this.storage)) {
                        const repo = portRepository(this.storage);
                        const base = await this.wait(async () => (repo.readDatasetState()), runtimeOwner);
                        const saved = await this.wait(async () => (repo.runWrite({ expectedRevision: base.revision, expectedValues: { [key]: ownerRaw } }, tx => {
                            tx.setItem(key, JSON.stringify(latest)); return { ok: true };
                        })), runtimeOwner);
                        if (!saved.ok) throw new Error(saved.reason);
                    } else this.storage.setItem(key, JSON.stringify(latest));
                    changedKeys.push(key);
                }
            }
            if (changedKeys.length) globalThis.SoundCruisePortSync?.acceptRemoteStorageValues?.(this.storage, changedKeys);
            globalThis.dispatchEvent?.(new CustomEvent('cruise-port-assets-applied'));
        }
        const referenceBefore = this.readMetadata();
        const referenceStorageBefore = this.storage.getItem(METADATA_KEY);
        if (publishedChanged || (referenceBefore.referencePending && hasAvailablePublished(referenceBefore))) {
            const result = await this.wait(async () => (this.controller.sync('asset-reference')), runtimeOwner);
            if (result?.ok === false) return { ok: false, code: result.code || 'asset_reference_sync_failed' };
            if (referenceBefore.referencePending) {
                const latest = this.readMetadata();
                if (this.storage.getItem(METADATA_KEY) === referenceStorageBefore) {
                    latest.referencePending = false;
                    (await this.wait(async () => (this.writeMetadata(latest)), runtimeOwner));
                }
            }
        }
        const releaseBefore = this.readMetadata().releaseQueue.slice(0, 20);
        if (releaseBefore.length) {
            const result = await this.wait(async () => (this.controller.sync('asset-release')), runtimeOwner);
            if (result?.ok === false) return { ok: false, code: result.code || 'asset_release_sync_failed' };
            await this.wait(async () => (this.json('/v1/sync/assets/unreference', { appId: 'port', assetIds: releaseBefore })), runtimeOwner);
            const latest = this.readMetadata();
            const released = new Set(releaseBefore);
            latest.releaseQueue = latest.releaseQueue.filter((id) => !released.has(id));
            (await this.wait(async () => (this.writeMetadata(latest)), runtimeOwner));
            if (latest.releaseQueue.length) this.pendingAgain = true;
        }
        return { ok: true, processed, hydrated };
    }
}

export { METADATA_KEY, VERSION as PORT_ASSET_METADATA_VERSION, hashBlob, normalizeMetadata };
