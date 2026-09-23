// Detect stale full-payload writes from another tab before touching saved data.
// localStorage has no multi-key transaction; existing rollback still handles write failures.
const snapshots = new WeakMap();
const remotelyChanged = new WeakMap();
const DELETION_INTENT_KEY = 'cruisePort.syncDeletionIntent.v1';
const COLLECTIONS = Object.freeze({
    'cruisePort.metronomePresets': ['metronome_preset', 'items'],
    'cruisePort.practiceCalendar': ['calendar_event', 'notes'],
    'cruisePort.practiceMenus': ['practice_menu', 'items'],
    'cruisePort.practiceHistory': ['practice_history_event', 'events'],
    'cruisePort.gearCategories': ['gear_category', 'categories'],
    'cruisePort.gearList': ['gear_item', 'items'],
    'cruisePort.myApps': ['my_app', 'items']
});

function collectionIds(raw, field) {
    if (raw === null) return new Set();
    try {
        const items = JSON.parse(raw)?.[field];
        if (!Array.isArray(items) || items.some((item) => typeof item?.id !== 'string')) return null;
        return new Set(items.map((item) => item.id));
    } catch (_) { return null; }
}

function updateDeletionIntents(storage, keys, expected) {
    const relevant = keys.filter((key) => COLLECTIONS[key] && expected?.has(key));
    if (!relevant.length) return;
    try {
        const parsed = JSON.parse(storage.getItem(DELETION_INTENT_KEY) || '{}');
        const intents = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        for (const key of relevant) {
            const [type, field] = COLLECTIONS[key];
            const before = collectionIds(expected.get(key), field);
            const after = collectionIds(storage.getItem(key), field);
            if (!before || !after) continue;
            for (const id of after) delete intents[`${type}/${id}`];
            for (const id of before) if (!after.has(id)) intents[`${type}/${id}`] = true;
            if (key === 'cruisePort.gearList') {
                const oldItems = JSON.parse(expected.get(key) || '{"items":[]}').items;
                const newItems = JSON.parse(storage.getItem(key) || '{"items":[]}').items;
                for (const status of ['owned', 'wishlist', 'sold']) {
                    const orderKey = `gear_order/${status}`;
                    if (newItems.some((item) => item.status === status)) delete intents[orderKey];
                    else if (oldItems.some((item) => item.status === status)) intents[orderKey] = true;
                }
            }
        }
        storage.setItem(DELETION_INTENT_KEY, JSON.stringify(intents));
    } catch (_) { /* Missing intent blocks cloud deletion without blocking local save. */ }
}

function snapshotFor(storage) {
    if (!snapshots.has(storage)) snapshots.set(storage, new Map());
    return snapshots.get(storage);
}

export function readStorageValue(storage, key) {
    const value = storage.getItem(key);
    snapshotFor(storage).set(key, value);
    return value;
}

export function assertStorageUnchanged(storage, keys) {
    const expected = snapshots.get(storage);
    for (const key of keys) {
        if (remotelyChanged.get(storage)?.has(key) ||
            (expected?.has(key) && storage.getItem(key) !== expected.get(key))) {
            globalThis.dispatchEvent?.(new Event('cruise-port-storage-conflict'));
            throw new Error('storage-write-conflict');
        }
    }
}

export function acceptStorageValues(storage, keys) {
    updateDeletionIntents(storage, keys, snapshots.get(storage));
    keys.forEach((key) => readStorageValue(storage, key));
    keys.forEach((key) => remotelyChanged.get(storage)?.delete(key));
    let defaultStorage = null;
    try { defaultStorage = globalThis.localStorage; } catch (_) { /* storage remains usable through the explicit handle */ }
    if (defaultStorage && storage === defaultStorage) {
        const managed = globalThis.SoundCruisePortSync?.MANAGED_KEYS || [];
        if (keys.some((key) => managed.includes(key))) {
            globalThis.dispatchEvent?.(new CustomEvent('cruise-port-local-data-changed', {
                detail: Object.freeze({ keys: keys.filter((key) => managed.includes(key)) })
            }));
            globalThis.SoundCruiseMultiAppSync?.notifyLocalSave?.('port');
        }
    }
}

export function acceptRemoteStorageValues(storage, keys) {
    if (!remotelyChanged.has(storage)) remotelyChanged.set(storage, new Set());
    keys.forEach((key) => remotelyChanged.get(storage).add(key));
}

export function hasRemoteStorageChange(storage, key) {
    return remotelyChanged.get(storage)?.has(key) === true;
}

globalThis.SoundCruisePortSync = globalThis.SoundCruisePortSync || {};
globalThis.SoundCruisePortSync.acceptRemoteStorageValues = acceptRemoteStorageValues;
