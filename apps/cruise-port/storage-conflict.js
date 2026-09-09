// Detect stale full-payload writes from another tab before touching saved data.
// localStorage has no multi-key transaction; existing rollback still handles write failures.
const snapshots = new WeakMap();

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
        if (expected?.has(key) && storage.getItem(key) !== expected.get(key)) {
            globalThis.dispatchEvent?.(new Event('cruise-port-storage-conflict'));
            throw new Error('storage-write-conflict');
        }
    }
}

export function acceptStorageValues(storage, keys) {
    keys.forEach((key) => readStorageValue(storage, key));
}
