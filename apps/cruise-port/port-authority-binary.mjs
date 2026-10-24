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
    async function open(strict=false) {
        check();
        const request = indexedDb.open(databaseName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('binary');
        const db = await result(request); if (disposed) { db.close(); check(); }
        if(strict){const valid=db.version===1&&db.objectStoreNames.length===1&&db.objectStoreNames.contains('binary');
            if(!valid){db.close();throw fail('binary-schema-unsupported');}
            const s=db.transaction('binary','readonly').objectStore('binary');if(s.keyPath!==null||s.autoIncrement||s.indexNames.length){db.close();throw fail('binary-schema-unsupported');}}
        return db;
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
        // Recovery archives use a dedicated inert generation. Never overwrite a
        // previous object; request success is not transaction completion.
        async putImmutable(asset) {
            check();const fixed=structuredClone(asset);
            if(!LEGACY_PORT_BINARY_STORES.some(v=>v.kind===fixed?.kind)||typeof fixed.id!=='string'||!fixed.id||
                !fixed.blob?.arrayBuffer||fixed.hash!==await authorityHash(fixed.blob))throw fail('binary-hash-mismatch');
            const db=await open(true);let tx,completion;
            try {
                check();tx=db.transaction('binary','readwrite');transactions.add(tx);completion=done(tx);completion.catch(()=>{});
                const s=tx.objectStore('binary'),q=s.get(`${fixed.kind}:${fixed.id}`);let conflict=false,failure;
                q.onsuccess=()=>{
                    try{if(q.result){conflict=true;tx.abort();}else s.add(fixed,`${fixed.kind}:${fixed.id}`);}
                    catch(e){failure=e;try{tx.abort();}catch{}}
                };
                try{await completion;}catch(e){if(!conflict)throw failure||e;}
            }finally{transactions.delete(tx);db.close();}
            // Reopen/readback validates bytes, not a caller's asserted hash.
            const actual=await operation('readonly',s=>s.get(`${fixed.kind}:${fixed.id}`));
            if(!actual||actual.kind!==fixed.kind||actual.id!==fixed.id||actual.hash!==fixed.hash||
                actual.blob?.size!==fixed.blob.size||actual.blob.type!==fixed.blob.type||await authorityHash(actual.blob)!==fixed.hash||
                JSON.stringify(actual.metadata)!==JSON.stringify(fixed.metadata))throw fail('binary-immutable-conflict');
            return {ok:true,historical:true,canWrite:false};
        },
        async entries(){const db=await open(true);try{const tx=db.transaction('binary','readonly'),c=done(tx),s=tx.objectStore('binary'),k=s.getAllKeys(),v=s.getAll();await c;
            const rows=k.result.map((key,n)=>[key,v.result[n]]);if(rows.some(([key,a])=>typeof key!=='string'||key!==`${a?.kind}:${a?.id}`))throw fail('binary-key-mismatch');return rows.map(([,a])=>a);
        }finally{db.close();}},
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
export async function readLegacyPortAssetInventory(indexedDb = globalThis.indexedDB,{strict=false}={}) {
    const assets = [];
    for (const spec of LEGACY_PORT_BINARY_STORES) {
        const request = indexedDb.open(spec.database); let absent = false;
        request.onupgradeneeded = () => { absent = true; request.transaction.abort(); };
        let db;
        try { db = await result(request); } catch (e) { if (absent) continue; throw e; }
        try {
            if (!db.objectStoreNames.contains(spec.store)) throw fail('binary-inventory-invalid');
            const tx = db.transaction(spec.store, 'readonly'), completion = done(tx);completion.catch(()=>{});
            const s=tx.objectStore(spec.store);
            if(strict&&(db.version!==1||db.objectStoreNames.length!==1||s.keyPath!=='id'||s.autoIncrement||
                (spec.kind==='attachments'?s.indexNames.length!==1||!s.indexNames.contains('practiceId')||s.index('practiceId').keyPath!=='practiceId'||s.index('practiceId').unique||s.index('practiceId').multiEntry:s.indexNames.length!==0)))throw fail('binary-schema-unsupported');
            const keys=result(s.getAllKeys());keys.catch(()=>{});const records=await result(s.getAll());await completion;
            const actualKeys=await keys;
            if(strict&&records.some((r,n)=>r.id!==actualKeys[n]))throw fail('binary-key-mismatch');
            for (const record of records) {
                if (!record.blob?.arrayBuffer) throw fail('binary-missing');
                const { blob, ...metadata } = record;
                assets.push({ kind: spec.kind, id: record.id, blob, metadata, hash: await authorityHash(blob) });
            }
        } finally { db.close(); }
    }
    return assets;
}
