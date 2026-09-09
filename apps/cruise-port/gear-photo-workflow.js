import { getCapabilities } from './cruise-port-capabilities.js?v=0.26.0';

async function deleteReferences(photoStore, references) {
    const ids = [references?.photoId, references?.photoSourceId].filter(Boolean);
    const results = await Promise.all(ids.map((id) => photoStore.deletePhoto(id)));
    return results.every(({ ok }) => ok);
}

export async function savePendingGearPhoto(photoStore, pending) {
    if (!pending?.sourceBlob || !pending?.finalBlob || !pending?.crop) {
        return { ok: false, reason: 'invalid-photo' };
    }
    const source = await photoStore.savePhoto(pending.sourceBlob, {
        kind: 'source', width: pending.sourceWidth, height: pending.sourceHeight
    });
    if (!source.ok) return { ok: false, reason: 'write-failed' };
    const final = await photoStore.savePhoto(pending.finalBlob, {
        kind: 'final', width: 512, height: 512
    });
    if (!final.ok) {
        await photoStore.deletePhoto(source.record.id);
        return { ok: false, reason: 'write-failed' };
    }
    return {
        ok: true,
        references: {
            photoId: final.record.id,
            photoSourceId: source.record.id,
            photoCrop: { ...pending.crop }
        }
    };
}

export async function commitGearPhotoChange({ photoStore, pending, previousReferences, buildItems, persist, canWrite = () => getCapabilities().gearPhotoWrite }) {
    if (!canWrite()) return { ok: false, reason: 'pro-required' };
    const saved = await savePendingGearPhoto(photoStore, pending);
    if (!saved.ok) return saved;
    if (!canWrite()) {
        await deleteReferences(photoStore, saved.references);
        return { ok: false, reason: 'pro-required' };
    }
    const candidateItems = buildItems(saved.references);
    const persisted = persist(candidateItems);
    if (!persisted.ok) {
        await deleteReferences(photoStore, saved.references);
        return { ok: false, reason: 'metadata-write-failed' };
    }
    const cleanupOk = await deleteReferences(photoStore, previousReferences);
    return { ok: true, items: candidateItems, references: saved.references, cleanupOk };
}

export async function commitGearPhotoRemoval({ photoStore, previousReferences, buildItems, persist }) {
    const candidateItems = buildItems();
    const persisted = persist(candidateItems);
    if (!persisted.ok) return { ok: false, reason: 'metadata-write-failed' };
    const cleanupOk = await deleteReferences(photoStore, previousReferences);
    return { ok: true, items: candidateItems, cleanupOk };
}

export async function commitGearItemDeletion({ photoStore, references, buildItems, persist }) {
    const candidateItems = buildItems();
    const persisted = persist(candidateItems);
    if (!persisted.ok) return { ok: false, reason: 'metadata-write-failed' };
    const cleanupOk = await deleteReferences(photoStore, references);
    return { ok: true, items: candidateItems, cleanupOk };
}
