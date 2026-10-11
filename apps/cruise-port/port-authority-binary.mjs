import { authorityHash, PORT_AUTHORITY_NAMESPACE_VERSION } from './port-local-authority.mjs';
const fail = code => Object.assign(new Error(code), { code });
export const LEGACY_PORT_BINARY_STORES = Object.freeze([
    { kind: 'gear', database: 'cruisePortGear', store: 'photos' },
    { kind: 'myApps', database: 'cruisePortMyApps', store: 'icons' },
    { kind: 'attachments', database: 'cruisePortPractice', store: 'attachments' }
]);
const result = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const done = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error || fail('binary-storage-failed')); });
export function createPortAuthorityBinaryStore({ generation, indexedDb = globalThis.indexedDB } = {}) {
    if (typeof generation !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(generation)) throw fail('authority-generation-invalid');
    const databaseName = `sound-cruise-port-authority-binary-v${PORT_AUTHORITY_NAMESPACE_VERSION}-${generation}`;
    let disposed = false; const transactions = new Set();
    const check = () => { if (disposed) throw fail('authority-disposed'); };
    async function open() {
        check();
        const request = indexedDb.open(databaseName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('binary');
        const db = await result(request); if (disposed) { db.close(); check(); } return db;
    }
    async function operation(mode, action) {
        const db = await open();
        let tx, completion;
        try { check(); tx = db.transaction('binary', mode); transactions.add(tx); completion = done(tx);
            completion.catch(() => {}); const value = await result(action(tx.objectStore('binary'))); await completion; check(); return value;
        } catch (error) { await completion?.catch(() => {}); throw error; }
        finally { transactions.delete(tx); db.close(); }
    }
    return Object.freeze({ generation, databaseName,
        async put(asset) {
            check();
            if (!LEGACY_PORT_BINARY_STORES.some(v => v.kind === asset.kind) || !asset.id || !asset.blob?.arrayBuffer || asset.hash !== await authorityHash(asset.blob)) throw fail('binary-hash-mismatch');
            check(); return operation('readwrite', store => store.put(asset, `${asset.kind}:${asset.id}`));
        },
        get: (kind, id) => operation('readonly', store => store.get(`${kind}:${id}`)),
        list: () => operation('readonly', store => store.getAll()),
        async verify(kind, id) {
            const asset = await operation('readonly', store => store.get(`${kind}:${id}`));
            if (!asset) throw fail('binary-missing');
            if (asset.hash !== await authorityHash(asset.blob)) throw fail('binary-hash-mismatch');
            return asset;
        },
        dispose() { disposed = true; for (const tx of transactions) { try { tx.abort(); } catch {} } }
    });
}
// Explicit candidate capture. Aborting upgrade keeps an absent legacy DB absent.
export async function readLegacyPortAssetInventory(indexedDb = globalThis.indexedDB) {
    const assets = [];
    for (const spec of LEGACY_PORT_BINARY_STORES) {
        const request = indexedDb.open(spec.database); let absent = false;
        request.onupgradeneeded = () => { absent = true; request.transaction.abort(); };
        let db;
        try { db = await result(request); } catch (e) { if (absent) continue; throw e; }
        try {
            if (!db.objectStoreNames.contains(spec.store)) throw fail('binary-inventory-invalid');
            const tx = db.transaction(spec.store, 'readonly'), completion = done(tx);
            const records = await result(tx.objectStore(spec.store).getAll()); await completion;
            for (const record of records) {
                if (!record.blob?.arrayBuffer) throw fail('binary-missing');
                const { blob, ...metadata } = record;
                assets.push({ kind: spec.kind, id: record.id, blob, metadata, hash: await authorityHash(blob) });
            }
        } finally { db.close(); }
    }
    return assets;
}
