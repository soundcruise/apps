const METADATA_KEY = 'cruisePort.syncAssetMetadata';
const GEAR_KEY = 'cruisePort.gearList';
const MY_APPS_KEY = 'cruisePort.myApps';
const VERSION = 3;
const MAX_ITEMS_PER_PASS = 4;

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function parse(storage, key, fallback) {
    try { return JSON.parse(storage.getItem(key) || '') || clone(fallback); } catch (_) { return clone(fallback); }
}
function emptyMetadata() {
    return { version: VERSION, gear: {}, myApps: {}, attachments: {}, releaseQueue: [], discardQueue: [] };
}
function normalizeMetadata(value) {
    if (!value || ![2, VERSION].includes(value.version)) return emptyMetadata();
    return {
        version: VERSION,
        gear: value.gear && typeof value.gear === 'object' ? clone(value.gear) : {},
        myApps: value.myApps && typeof value.myApps === 'object' ? clone(value.myApps) : {},
        attachments: value.attachments && typeof value.attachments === 'object' ? clone(value.attachments) : {},
        releaseQueue: Array.isArray(value.releaseQueue) ? [...new Set(value.releaseQueue.filter(Boolean))] : [],
        discardQueue: Array.isArray(value.discardQueue) ? [...new Set(value.discardQueue.filter(Boolean))] : []
    };
}
function assetIds(asset) {
    return [asset?.final?.assetId, asset?.source?.assetId].filter(Boolean);
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
        fetchImpl = globalThis.fetch?.bind(globalThis), cryptoImpl = globalThis.crypto } = {}) {
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
    }

    readMetadata() { return normalizeMetadata(parse(this.storage, METADATA_KEY, emptyMetadata())); }
    writeMetadata(metadata) { this.storage.setItem(METADATA_KEY, JSON.stringify(normalizeMetadata(metadata))); }

    markLocalRemovals() {
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
            this.writeMetadata(metadata);
        }
    }

    bind() {
        if (this.bound || !globalThis.addEventListener) return this;
        this.bound = true;
        globalThis.addEventListener('cruise-port-local-data-changed', () => {
            this.markLocalRemovals();
            this.schedule('local-save');
        });
        globalThis.addEventListener('cruise-port-cloud-data-applied', () => this.schedule('remote-apply'));
        globalThis.addEventListener('online', () => this.schedule('online'));
        globalThis.addEventListener('cruise-port-sync-state', (event) => {
            if (event.detail?.state === 'ready') this.schedule('ready');
        });
        this.schedule('startup');
        return this;
    }

    schedule(reason) {
        if (this.running) { this.pendingAgain = true; return this.running; }
        this.running = Promise.resolve().then(() => this.reconcile(reason)).catch((error) => {
            const code = typeof error?.message === 'string' ? error.message : 'asset_sync_failed';
            if (typeof globalThis.CustomEvent === 'function') {
                globalThis.dispatchEvent?.(new CustomEvent('cruise-port-asset-sync-error', { detail: { code } }));
            }
            return { ok: false, code };
        })
            .finally(() => {
                this.running = null;
                if (this.pendingAgain) { this.pendingAgain = false; this.schedule('pending'); }
            });
        return this.running;
    }

    async headers(contentType = null) {
        const credential = await this.controller?.runtime?.credential?.();
        const qaCredential = await this.controller?.runtime?.qaCredential?.();
        if (typeof credential !== 'string') throw new Error('asset_auth_required');
        const headers = new Headers({ Accept: 'application/json', Authorization: `Bearer ${credential}` });
        if (this.controller.runtime.admissionMode === 'qa') {
            if (typeof qaCredential !== 'string') throw new Error('asset_qa_required');
            headers.set('X-Sound-Cruise-QA-Authorization', `Bearer ${qaCredential}`);
        }
        if (contentType) headers.set('Content-Type', contentType);
        return headers;
    }

    async json(path, body) {
        const response = await this.fetchImpl(`${this.controller.runtime.endpoint}${path}`, {
            method: 'POST', headers: await this.headers('application/json'),
            body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok !== true) throw new Error(payload?.code || 'asset_request_failed');
        return payload;
    }

    async dimensions(blob, kind) {
        if (kind === 'gear_photo_final') return { width: 512, height: 512 };
        if (kind === 'my_app_icon_final') return { width: 256, height: 256 };
        if (kind === 'practice_attachment_pdf' || kind === 'practice_attachment_text') return { width: 1, height: 1 };
        const image = await globalThis.createImageBitmap(blob);
        try { return { width: image.width, height: image.height }; } finally { image.close?.(); }
    }

    async upload(record, kind, pending = null, owner = null) {
        if (!record?.blob) throw new Error('asset_local_missing');
        const hash = await hashBlob(record.blob, this.cryptoImpl);
        const dimensions = record.width && record.height
            ? { width: record.width, height: record.height }
            : await this.dimensions(record.blob, kind);
        const operation = pending?.localId === record.id && pending?.hash === hash
            ? pending
            : { localId: record.id, assetId: uuid(), operationId: uuid(), hash };
        const request = {
            appId: 'port', assetId: operation.assetId, operationId: operation.operationId,
            kind, hash, mime: record.mimeType || record.blob.type, byteSize: record.blob.size,
            width: dimensions.width, height: dimensions.height,
            ...(owner ? { ownerRecordId: owner.practiceId, originalFilename: owner.fileName } : {})
        };
        const prepared = await this.json('/v1/sync/assets/prepare', request);
        if (prepared.phase !== 'available') {
            if (prepared.phase !== 'uploaded') {
                const headers = await this.headers(request.mime);
                headers.set('X-Sound-Cruise-Operation-Id', operation.operationId);
                headers.set('X-Content-SHA256', hash);
                const response = await this.fetchImpl(
                    `${this.controller.runtime.endpoint}/v1/sync/assets/${encodeURIComponent(operation.assetId)}/content`,
                    { method: 'PUT', headers, body: record.blob, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' }
                );
                const payload = await response.json().catch(() => null);
                if (!response.ok || payload?.ok !== true) throw new Error(payload?.code || 'asset_upload_failed');
            }
            const committed = await this.json('/v1/sync/assets/commit', {
                appId: 'port', assetId: operation.assetId, operationId: operation.operationId, hash
            });
            return { operation, asset: committed.asset };
        }
        return { operation, asset: prepared.asset };
    }

    async download(asset) {
        const response = await this.fetchImpl(
            `${this.controller.runtime.endpoint}/v1/sync/assets/${encodeURIComponent(asset.assetId)}`,
            { method: 'GET', headers: await this.headers(), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' }
        );
        if (!response.ok) throw new Error('asset_download_failed');
        if (response.headers.get('X-Asset-SHA256') !== asset.hash) throw new Error('asset_hash_mismatch');
        const blob = await response.blob();
        if (blob.size !== asset.byteSize || blob.type !== asset.mime || await hashBlob(blob, this.cryptoImpl) !== asset.hash) {
            throw new Error('asset_integrity_failed');
        }
        return blob;
    }

    async uploadPair(item, entry, kind) {
        const finalId = kind === 'gear' ? item.photoId : item.iconId;
        const sourceId = kind === 'gear' ? item.photoSourceId : item.iconSourceId;
        const get = (id) => kind === 'gear' ? this.gearPhotoStore.getPhoto(id) : this.myAppsIconStore.getIcon(id);
        const finalRecord = finalId ? (await get(finalId)).record : null;
        const sourceRecord = sourceId ? (await get(sourceId)).record : null;
        if (!finalRecord) return null;
        entry.pending = entry.pending && entry.pending.final?.localId === finalId &&
            (entry.pending.source?.localId || null) === (sourceId || null) ? entry.pending : {
                final: { localId: finalId, assetId: uuid(), operationId: uuid(), hash: await hashBlob(finalRecord.blob, this.cryptoImpl) },
                source: sourceRecord ? { localId: sourceId, assetId: uuid(), operationId: uuid(), hash: await hashBlob(sourceRecord.blob, this.cryptoImpl) } : null
            };
        const metadata = this.readMetadata();
        metadata[kind === 'gear' ? 'gear' : 'myApps'][item.id] = clone(entry);
        this.writeMetadata(metadata);
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
        const blob = await this.download(entry.published.asset);
        const saved = await this.practiceAttachmentStore.cacheAttachment(blob, entry);
        if (!saved.ok) return { ok: false, record: null, reason: saved.reason || 'write-failed' };
        entry.binding = { assetId: entry.published.asset.assetId, hash: entry.published.asset.hash, localId: saved.record.id };
        metadata.attachments[logicalId] = entry;
        this.writeMetadata(metadata);
        return { ok: true, record: { ...saved.record, logicalId } };
    }

    removePracticeAttachment({ id, logicalId = null } = {}) {
        const metadata = this.readMetadata();
        const pair = Object.entries(metadata.attachments).find(([candidateId, entry]) =>
            candidateId === logicalId || candidateId === id || entry.binding?.localId === id);
        if (!pair) return false;
        const [candidateId, entry] = pair;
        if (entry.published?.asset?.assetId) metadata.releaseQueue.push(entry.published.asset.assetId);
        delete metadata.attachments[candidateId];
        metadata.releaseQueue = [...new Set(metadata.releaseQueue.filter(Boolean))];
        this.writeMetadata(metadata);
        this.schedule('attachment-delete');
        return true;
    }

    removePracticeAttachments(practiceId) {
        const metadata = this.readMetadata();
        let changed = false;
        for (const [logicalId, entry] of Object.entries(metadata.attachments)) {
            if (entry.practiceId !== practiceId) continue;
            if (entry.published?.asset?.assetId) metadata.releaseQueue.push(entry.published.asset.assetId);
            delete metadata.attachments[logicalId];
            changed = true;
        }
        if (changed) {
            metadata.releaseQueue = [...new Set(metadata.releaseQueue.filter(Boolean))];
            this.writeMetadata(metadata);
            this.schedule('practice-delete');
        }
        return changed;
    }

    async reconcile() {
        if (!this.controller?.enabled || globalThis.navigator?.onLine === false) return { ok: false, offline: true };
        const metadata = this.readMetadata();
        const gearData = parse(this.storage, GEAR_KEY, { version: 4, items: [] });
        const appData = parse(this.storage, MY_APPS_KEY, { version: 6, items: [] });
        let changedMetadata = false;
        let publishedChanged = false;
        let hydrated = false;
        let processed = 0;
        if (metadata.discardQueue.length && this.practiceAttachmentStore) {
            for (const localId of metadata.discardQueue) await this.practiceAttachmentStore.deleteAttachment(localId);
            metadata.discardQueue = [];
            changedMetadata = true;
        }
        const process = async (items, bucketName, kind) => {
            for (const item of items) {
                if (processed >= MAX_ITEMS_PER_PASS) { this.pendingAgain = true; break; }
                const finalId = kind === 'gear' ? item.photoId : item.iconId;
                const sourceId = kind === 'gear' ? item.photoSourceId : item.iconSourceId;
                const entry = metadata[bucketName][item.id] || { published: null, binding: null, pending: null };
                const missingCache = await this.cachedBindingMissing(item, entry, kind);
                if (!missingCache && finalId && (!entry.binding || entry.binding.final?.localId !== finalId ||
                    (sourceId || null) !== (entry.binding.source?.localId || null))) {
                    processed += 1;
                    const oldIds = assetIds(entry.published);
                    const uploaded = await this.uploadPair(item, entry, kind);
                    if (!uploaded) continue;
                    metadata[bucketName][item.id] = { ...entry, ...uploaded, pending: null };
                    metadata.releaseQueue.push(...oldIds.filter((id) => !assetIds(uploaded.published).includes(id)));
                    changedMetadata = true;
                    publishedChanged = true;
                } else if ((missingCache || !finalId) && entry.published?.final) {
                    processed += 1;
                    if (await this.hydratePair(item, entry, kind)) {
                        metadata[bucketName][item.id] = entry;
                        hydrated = true;
                        changedMetadata = true;
                    }
                }
            }
        };
        await process(gearData.items || [], 'gear', 'gear');
        await process(appData.items || [], 'myApps', 'myApps');
        const localAttachments = await this.practiceAttachmentStore?.getAllAttachments();
        if (localAttachments?.ok) {
            let ownerSynced = false;
            for (const record of localAttachments.records) {
                if (processed >= MAX_ITEMS_PER_PASS) { this.pendingAgain = true; break; }
                let pair = Object.entries(metadata.attachments).find(([, entry]) =>
                    entry.binding?.localId === record.id || entry.pending?.localId === record.id);
                const logicalId = pair?.[0] || uuid();
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
                    const ownerResult = await this.controller.sync('attachment-owner');
                    if (ownerResult?.ok === false) return { ok: false, code: ownerResult.code || 'attachment_owner_sync_failed' };
                    ownerSynced = true;
                }
                processed += 1;
                entry.pending = entry.pending?.localId === record.id ? entry.pending : {
                    localId: record.id, assetId: uuid(), operationId: uuid(),
                    hash: await hashBlob(record.blob, this.cryptoImpl)
                };
                metadata.attachments[logicalId] = entry;
                this.writeMetadata(metadata);
                const uploaded = await this.upload(record, assetKind, entry.pending, {
                    practiceId: record.practiceId, fileName: record.fileName
                });
                if (entry.published?.asset?.assetId && entry.published.asset.assetId !== uploaded.asset.assetId) {
                    metadata.releaseQueue.push(entry.published.asset.assetId);
                }
                entry.published = { version: 1, availability: 'available', asset: uploaded.asset };
                entry.binding = { assetId: uploaded.asset.assetId, hash: uploaded.asset.hash, localId: record.id };
                entry.pending = null;
                entry.updatedAt = record.updatedAt || record.createdAt;
                metadata.attachments[logicalId] = entry;
                changedMetadata = true;
                publishedChanged = true;
            }
        }
        if (changedMetadata) {
            metadata.releaseQueue = [...new Set(metadata.releaseQueue.filter(Boolean))];
            this.writeMetadata(metadata);
        }
        if (hydrated) {
            this.storage.setItem(GEAR_KEY, JSON.stringify(gearData));
            this.storage.setItem(MY_APPS_KEY, JSON.stringify(appData));
            globalThis.SoundCruisePortSync?.acceptRemoteStorageValues?.(this.storage, [GEAR_KEY, MY_APPS_KEY]);
            globalThis.dispatchEvent?.(new CustomEvent('cruise-port-assets-applied'));
        }
        if (publishedChanged) {
            const result = await this.controller.sync('asset-reference');
            if (result?.ok === false) return { ok: false, code: result.code || 'asset_reference_sync_failed' };
        }
        if (metadata.releaseQueue.length) {
            const result = await this.controller.sync('asset-release');
            if (result?.ok === false) return { ok: false, code: result.code || 'asset_release_sync_failed' };
            await this.json('/v1/sync/assets/unreference', { appId: 'port', assetIds: metadata.releaseQueue.slice(0, 20) });
            metadata.releaseQueue = metadata.releaseQueue.slice(20);
            this.writeMetadata(metadata);
            if (metadata.releaseQueue.length) this.pendingAgain = true;
        }
        return { ok: true, processed, hydrated };
    }
}

export { METADATA_KEY, VERSION as PORT_ASSET_METADATA_VERSION, hashBlob, normalizeMetadata };
