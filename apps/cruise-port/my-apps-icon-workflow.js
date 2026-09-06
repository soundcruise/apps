import {
    createMyApp,
    deleteMyApp,
    saveMyApps,
    updateMyApp
} from './my-apps-store.js?v=5.0.0';
import { isValidIconCrop } from './my-apps-crop.js?v=1.1.0';

async function deleteIconBestEffort(iconStore, iconId) {
    if (!iconId || !iconStore?.deleteIcon) return;
    try {
        await iconStore.deleteIcon(iconId);
    } catch (_) {
        // Metadata is authoritative; targeted orphan cleanup is best effort.
    }
}

async function deleteIconsBestEffort(iconStore, iconIds) {
    for (const iconId of new Set(iconIds.filter(Boolean))) {
        await deleteIconBestEffort(iconStore, iconId);
    }
}

async function saveBlob(iconStore, blob, now, idFactory) {
    if (!blob) return { ok: false };
    return iconStore.saveIcon(blob, { now, idFactory });
}

export async function createMyAppEntry({
    items,
    values,
    iconBlob = null,
    iconSourceBlob = null,
    iconCrop = null,
    storage,
    iconStore,
    now = new Date(),
    appIdFactory,
    iconIdFactory,
    sourceIdFactory
}) {
    const createResult = createMyApp(values, items, now, appIdFactory);
    if (!createResult.ok) return createResult;

    let item = createResult.item;
    const newIds = [];
    if (iconBlob) {
        if (!iconSourceBlob || !isValidIconCrop(iconCrop)) {
            return { ok: false, reason: 'invalid-icon-action' };
        }
        const sourceResult = await saveBlob(iconStore, iconSourceBlob, now, sourceIdFactory);
        if (!sourceResult.ok) return { ok: false, reason: 'icon-write-failed' };
        newIds.push(sourceResult.record.id);
        const iconResult = await saveBlob(iconStore, iconBlob, now, iconIdFactory);
        if (!iconResult.ok) {
            await deleteIconsBestEffort(iconStore, newIds);
            return { ok: false, reason: 'icon-write-failed' };
        }
        newIds.push(iconResult.record.id);
        item = {
            ...item,
            iconId: iconResult.record.id,
            iconSourceId: sourceResult.record.id,
            iconCrop: { ...iconCrop }
        };
    }

    const nextItems = [...items.map((entry) => ({
        ...entry,
        iconCrop: entry.iconCrop ? { ...entry.iconCrop } : null
    })), item];
    const saveResult = saveMyApps(nextItems, storage);
    if (!saveResult.ok) {
        await deleteIconsBestEffort(iconStore, newIds);
        return { ok: false, reason: 'metadata-write-failed' };
    }
    return { ok: true, item, items: nextItems };
}

export async function updateMyAppEntry({
    items,
    id,
    values,
    iconAction = 'keep',
    iconBlob = null,
    iconSourceBlob = null,
    iconCrop = null,
    useCurrentIconAsSource = false,
    storage,
    iconStore,
    now = new Date(),
    iconIdFactory,
    sourceIdFactory
}) {
    const currentItem = items.find((item) => item.id === id) || null;
    if (!currentItem) return { ok: false, reason: 'not-found' };
    const updateResult = updateMyApp(items, id, values, now);
    if (!updateResult.found) return { ok: false, reason: 'not-found' };

    const oldIds = [currentItem.iconId, currentItem.iconSourceId];
    const newIds = [];
    let nextImageState = {
        iconId: currentItem.iconId,
        iconSourceId: currentItem.iconSourceId,
        iconCrop: currentItem.iconCrop ? { ...currentItem.iconCrop } : null
    };

    if (iconAction === 'replace') {
        if (!iconBlob || !iconSourceBlob || !isValidIconCrop(iconCrop)) {
            return { ok: false, reason: 'invalid-icon-action' };
        }
        const sourceResult = await saveBlob(iconStore, iconSourceBlob, now, sourceIdFactory);
        if (!sourceResult.ok) return { ok: false, reason: 'icon-write-failed' };
        newIds.push(sourceResult.record.id);
        const iconResult = await saveBlob(iconStore, iconBlob, now, iconIdFactory);
        if (!iconResult.ok) {
            await deleteIconsBestEffort(iconStore, newIds);
            return { ok: false, reason: 'icon-write-failed' };
        }
        newIds.push(iconResult.record.id);
        nextImageState = {
            iconId: iconResult.record.id,
            iconSourceId: sourceResult.record.id,
            iconCrop: { ...iconCrop }
        };
    } else if (iconAction === 'readjust') {
        if (!iconBlob || !isValidIconCrop(iconCrop) || !currentItem.iconId) {
            return { ok: false, reason: 'invalid-icon-action' };
        }
        const iconResult = await saveBlob(iconStore, iconBlob, now, iconIdFactory);
        if (!iconResult.ok) return { ok: false, reason: 'icon-write-failed' };
        newIds.push(iconResult.record.id);
        nextImageState = {
            iconId: iconResult.record.id,
            iconSourceId: useCurrentIconAsSource || !currentItem.iconSourceId
                ? currentItem.iconId
                : currentItem.iconSourceId,
            iconCrop: { ...iconCrop }
        };
    } else if (iconAction === 'remove') {
        nextImageState = { iconId: null, iconSourceId: null, iconCrop: null };
    } else if (iconAction !== 'keep') {
        return { ok: false, reason: 'invalid-icon-action' };
    }

    const nextItems = updateResult.items.map((item) => (
        item.id === id ? { ...item, ...nextImageState } : item
    ));
    const saveResult = saveMyApps(nextItems, storage);
    if (!saveResult.ok) {
        await deleteIconsBestEffort(iconStore, newIds);
        return { ok: false, reason: 'metadata-write-failed' };
    }

    const nextReferencedIds = new Set([nextImageState.iconId, nextImageState.iconSourceId].filter(Boolean));
    await deleteIconsBestEffort(iconStore, oldIds.filter((oldId) => !nextReferencedIds.has(oldId)));
    return { ok: true, items: nextItems };
}

export async function deleteMyAppEntry({ items, id, storage, iconStore }) {
    const currentItem = items.find((item) => item.id === id) || null;
    if (!currentItem) return { ok: false, reason: 'not-found' };
    const deleteResult = deleteMyApp(items, id);
    const saveResult = saveMyApps(deleteResult.items, storage);
    if (!saveResult.ok) return { ok: false, reason: 'metadata-write-failed' };
    await deleteIconsBestEffort(iconStore, [currentItem.iconId, currentItem.iconSourceId]);
    return { ok: true, items: deleteResult.items };
}
