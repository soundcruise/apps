import {
    createMyApp,
    deleteMyApp,
    saveMyApps,
    updateMyApp
} from './my-apps-store.js?v=2.0.0';

async function deleteIconBestEffort(iconStore, iconId) {
    if (!iconId || !iconStore?.deleteIcon) return;
    try {
        await iconStore.deleteIcon(iconId);
    } catch (_) {
        // Metadata is authoritative; targeted orphan cleanup is best effort.
    }
}

export async function createMyAppEntry({
    items,
    values,
    iconBlob = null,
    storage,
    iconStore,
    now = new Date(),
    appIdFactory,
    iconIdFactory
}) {
    const createResult = createMyApp(values, items, now, appIdFactory);
    if (!createResult.ok) return createResult;

    let item = createResult.item;
    let newIconId = null;
    if (iconBlob) {
        const iconResult = await iconStore.saveIcon(iconBlob, { now, idFactory: iconIdFactory });
        if (!iconResult.ok) return { ok: false, reason: 'icon-write-failed' };
        newIconId = iconResult.record.id;
        item = { ...item, iconId: newIconId };
    }

    const nextItems = [...items.map((entry) => ({ ...entry })), item];
    const saveResult = saveMyApps(nextItems, storage);
    if (!saveResult.ok) {
        await deleteIconBestEffort(iconStore, newIconId);
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
    storage,
    iconStore,
    now = new Date(),
    iconIdFactory
}) {
    const currentItem = items.find((item) => item.id === id) || null;
    if (!currentItem) return { ok: false, reason: 'not-found' };
    const updateResult = updateMyApp(items, id, values, now);
    if (!updateResult.found) return { ok: false, reason: 'not-found' };

    const oldIconId = currentItem.iconId;
    let newIconId = null;
    let nextIconId = oldIconId;
    if (iconAction === 'replace') {
        if (!iconBlob) return { ok: false, reason: 'invalid-icon-action' };
        const iconResult = await iconStore.saveIcon(iconBlob, { now, idFactory: iconIdFactory });
        if (!iconResult.ok) return { ok: false, reason: 'icon-write-failed' };
        newIconId = iconResult.record.id;
        nextIconId = newIconId;
    } else if (iconAction === 'remove') {
        nextIconId = null;
    } else if (iconAction !== 'keep') {
        return { ok: false, reason: 'invalid-icon-action' };
    }

    const nextItems = updateResult.items.map((item) => (
        item.id === id ? { ...item, iconId: nextIconId } : item
    ));
    const saveResult = saveMyApps(nextItems, storage);
    if (!saveResult.ok) {
        await deleteIconBestEffort(iconStore, newIconId);
        return { ok: false, reason: 'metadata-write-failed' };
    }

    if ((iconAction === 'replace' || iconAction === 'remove') && oldIconId && oldIconId !== nextIconId) {
        await deleteIconBestEffort(iconStore, oldIconId);
    }
    return { ok: true, items: nextItems };
}

export async function deleteMyAppEntry({ items, id, storage, iconStore }) {
    const currentItem = items.find((item) => item.id === id) || null;
    if (!currentItem) return { ok: false, reason: 'not-found' };
    const deleteResult = deleteMyApp(items, id);
    const saveResult = saveMyApps(deleteResult.items, storage);
    if (!saveResult.ok) return { ok: false, reason: 'metadata-write-failed' };
    await deleteIconBestEffort(iconStore, currentItem.iconId);
    return { ok: true, items: deleteResult.items };
}
