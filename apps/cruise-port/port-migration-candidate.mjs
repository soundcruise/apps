import { PORT_DATASET_KEYS, PORT_DATASET_META, PORT_DELETE_INTENTS, PortDatasetRepository } from './port-dataset-repository.js';
import { authorityHash, validatePortAuthorityCandidate } from './port-local-authority.mjs';
import { clone, canonical, equal, fail, safeEvidence, assertIdentity, assertSyncProvenance, graphIssues, MIGRATION_RECORD_TYPES } from './port-migration-contract.mjs';
export const digest = value => authorityHash(canonical(value));
export async function migrationAdapter(values) {
    await import('./port-sync-adapter.js');
    const data = new Map(Object.entries(values));
    const storage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) };
    return { adapter: new globalThis.SoundCruisePortSync.PortSyncAdapter({ storage }), storage,
        values: () => Object.fromEntries(PORT_DATASET_KEYS.map(k => [k, storage.getItem(k)])) };
}
export async function recordsFor(values) {
    const { adapter } = await migrationAdapter(values);
    const snapshot = adapter.readLocalSnapshot();
    globalThis.SoundCruisePortSync.assertFullSnapshot(snapshot);
    const records = await adapter.serializeRecords(snapshot);
    const issues = graphIssues(records); if (issues.length) throw fail(issues[0].reason);
    return records;
}
function refs(values, assets) {
    const found = new Map(assets.map(a => [`${a.kind}:${a.id}`, []]));
    const add = (kind,id,owner) => { if (id) { const key=`${kind}:${id}`; if (!found.has(key)) throw fail('binary-missing'); found.get(key).push(owner); } };
    for (const [kind,key,final,source] of [['gear','cruisePort.gearList','photoId','photoSourceId'],['myApps','cruisePort.myApps','iconId','iconSourceId']])
        for (const item of JSON.parse(values[key] || 'null')?.items || []) { add(kind,item[final],item.id); add(kind,item[source],item.id); }
    const meta=JSON.parse(values['cruisePort.syncAssetMetadata']||'null');
    for (const kind of ['gear','myApps','attachments']) for (const [id,entry] of Object.entries(meta?.[kind]||{})) {
        const walk=v=>{if(!v||typeof v!=='object')return;if(v.localId)add(kind,v.localId,kind==='attachments'?entry.practiceId:id);for(const c of Object.values(v))if(c&&typeof c==='object')walk(c);};
        walk(entry.binding);walk(entry.pending);
        // Published cloud references also require a verified local object in this offline engine.
        const published=(v,role)=>{if(!v||typeof v!=='object')return;
            if(v.assetId){const binding=kind==='attachments'?entry.binding:entry.binding?.[role];
                const a=binding?.assetId===v.assetId&&binding.hash===v.hash&&assets.find(a=>a.kind===kind&&a.id===binding.localId&&a.hash===v.hash&&a.blob?.size===v.byteSize&&a.blob?.type===v.mime);
                if(!a)throw fail('cloud-binary-unavailable');add(kind,a.id,kind==='attachments'?entry.practiceId:id);}
            for(const [key,child] of Object.entries(v))if(child&&typeof child==='object')published(child,key);};
        published(entry.published);
    }
    return found;
}
export async function binaryManifest(values, assets) {
    const references=refs(values,assets), seen=new Map(), manifest=[];
    const menus=new Set((JSON.parse(values['cruisePort.practiceMenus']||'null')?.items||[]).map(v=>v.id));
    for(const a of assets){
        const key=`${a.kind}:${a.id}`, m=a.metadata;
        if(seen.has(key)){const prior=seen.get(key);if(prior.hash!==a.hash||!equal(prior.metadata,m)||await authorityHash(a.blob)!==a.hash)throw fail('binary-duplicate-conflict');continue;}seen.set(key,a);
        if(!['gear','myApps','attachments'].includes(a.kind)||typeof a.id!=='string'||!a.id||!a.blob?.arrayBuffer||!m||m.id!==a.id)throw fail('binary-metadata-invalid');
        const mime=a.blob.type;
        if(!mime||m.mimeType!==mime||m.byteSize!==a.blob.size||a.blob.size<1)throw fail('binary-mime-size-mismatch');
        if((m.version!==undefined&&m.version!==1)||a.hash!==await authorityHash(a.blob))throw fail('binary-hash-or-schema-mismatch');
        let owners=[...new Set(references.get(key)||[])].sort();
        if(a.kind==='attachments'){
            if(typeof m.practiceId!=='string'||!m.practiceId||!m.fileName||!['image','file'].includes(m.kind))throw fail('binary-owner-invalid');
            if(owners.some(id=>id!==m.practiceId))throw fail('binary-owner-mismatch');
            if(menus.has(m.practiceId))owners=[m.practiceId];
        }else if(!['source','final'].includes(m.kind)||!['image/png','image/webp'].includes(mime)||!Number.isInteger(m.width)||m.width<1||!Number.isInteger(m.height)||m.height<1)throw fail('binary-metadata-invalid');
        manifest.push({kind:a.kind,id:a.id,hash:a.hash,size:a.blob.size,mime,metadataHash:await digest(m),owners,deletionState:m.deleted===true?'deleted':owners.length?'referenced':'orphan'});
    }
    return manifest.sort((a,b)=>`${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}
export async function verifyDestination(store, assets, manifest) {
    for(const expected of manifest){
        const actual=await store.get(expected.kind,expected.id);
        if(!actual)throw fail('binary-destination-missing');
        const source=assets.find(a=>a.kind===expected.kind&&a.id===expected.id);
        if(!source||actual.kind!==expected.kind||actual.id!==expected.id||actual.hash!==expected.hash||
            await authorityHash(actual.blob)!==expected.hash||actual.blob.size!==expected.size||actual.blob.type!==expected.mime||
            await digest(actual.metadata)!==expected.metadataHash)throw fail('binary-destination-mismatch');
    }
}
export async function candidateHash(c) {
    return digest({values:c.values,repositoryMetadata:c.repositoryMetadata,provenance:c.provenance,
        syncInventory:c.syncInventory,binaryManifest:c.binaryManifest,records:c.records,deleteIntents:c.deleteIntents,issues:c.issues});
}
export async function captureMigrationCandidate({storage,provenance,readAssets=async()=>[],readSyncInventory=async()=>({inspected:false}),locks}={}) {
    if(!storage)throw fail('migration-storage-required');
    const raw=()=>({values:Object.fromEntries(PORT_DATASET_KEYS.map(k=>[k,storage.getItem(k)])),repositoryMetadata:storage.getItem(PORT_DATASET_META)});
    const capture=async()=>{
        const c={schemaVersion:1,status:'candidate-only',...raw(),provenance:clone(provenance),assets:[],binaryManifest:[],records:[],syncInventory:null,issues:[],consistency:{atomic:false,abaExcluded:false,legacyWriterAbsenceProven:false}};
        const issue=e=>c.issues.push(e.code||e.message||'candidate-invalid');
        try{assertIdentity(c.provenance);}catch(e){issue(e);}
        try{c.assets=clone(await readAssets());}catch(e){issue(e);}
        try{
            const s=clone(await readSyncInventory());
            c.syncInventory={inspected:s.inspected,provenance:s.provenance||null,meta:s.meta||{},outbox:s.outbox||[],shadow:s.shadow||[],conflicts:s.conflicts||[],keys:s.keys||null};
            safeEvidence(c.syncInventory);assertSyncProvenance(c.syncInventory,c.provenance);
            for(const r of [...c.syncInventory.shadow,...c.syncInventory.outbox]){
                if(!MIGRATION_RECORD_TYPES.includes(r.recordType)||r.schemaVersion!==1||!r.recordId||!r.operationId)throw fail('sync-record-unsupported');
                const expected=await digest({appId:'port',payload:r.payload??null,recordId:r.recordId,recordType:r.recordType,schemaVersion:r.schemaVersion});
                if(r.payloadHash!==expected)throw fail('sync-record-hash-mismatch');
            }
        }catch(e){issue(e);if(e.code==='migration-secret-forbidden')c.syncInventory={inspected:false,redacted:true};}
        try{new PortDatasetRepository({storage:{getItem:k=>k===PORT_DATASET_META?c.repositoryMetadata:c.values[k]??null},locks:null}).inspect();
            c.binaryManifest=await binaryManifest(c.values,c.assets);
            c.assets=[...new Map(c.assets.map(a=>[`${a.kind}:${a.id}`,a])).values()];
            await validatePortAuthorityCandidate(c);c.records=await recordsFor(c.values);
        }catch(e){issue(e);}
        try{
            const assetsAfter=await readAssets(),syncAfter=await readSyncInventory();
            const bAfter=await binaryManifest(c.values,assetsAfter);
            const sAfter={inspected:syncAfter.inspected,provenance:syncAfter.provenance||null,meta:syncAfter.meta||{},outbox:syncAfter.outbox||[],shadow:syncAfter.shadow||[],conflicts:syncAfter.conflicts||[],keys:syncAfter.keys||null};
            if(!equal(bAfter,c.binaryManifest)||!equal(sAfter,c.syncInventory)||!equal(raw(),{values:c.values,repositoryMetadata:c.repositoryMetadata}))throw fail('legacy-changing');
        }catch(e){issue(e);}
        if(['unknown-owner','pending-transfer'].includes(c.provenance?.ownership))c.issues.push('ownership-review-required');
        c.deleteIntents=(()=>{try{return JSON.parse(c.values[PORT_DELETE_INTENTS]||'{}');}catch{return null;}})();
        c.sourceHash=await candidateHash(c);
        if(!equal(raw(),{values:c.values,repositoryMetadata:c.repositoryMetadata}))c.issues.push('legacy-changing');
        c.issues=[...new Set(c.issues)];c.sourceHash=await candidateHash(c);c.ok=!c.issues.length;c.reviewRequired=!c.ok;c.status=c.ok?'candidate-only':'review-required';
        return c;
    };
    return locks?.request?locks.request('sound-cruise:port:dataset:v1',{mode:'shared'},capture):capture();
}
// Existing databases only; one read transaction covers all four stores. No schema creation.
export async function readMigrationSyncInventory({indexedDb,databaseName,provenance}) {
    const request=indexedDb.open(databaseName);let absent=false;
    request.onupgradeneeded=()=>{absent=true;request.transaction.abort();};
    const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>absent?resolve(null):reject(request.error);});
    const names=['meta','outbox','shadow','conflicts'];
    if(!db)return {inspected:true,provenance:{...provenance,databaseName,state:'absent'},meta:{},outbox:[],shadow:[],conflicts:[],keys:{outbox:[],shadow:[],conflicts:[]}};
    try{return await new Promise((resolve,reject)=>{
        const tx=db.transaction(names,'readonly'),rows={},keys={};
        for(const name of names){const q=tx.objectStore(name).getAll(),k=tx.objectStore(name).getAllKeys();q.onsuccess=()=>rows[name]=q.result;k.onsuccess=()=>keys[name]=k.result;}
        tx.onabort=tx.onerror=()=>reject(tx.error||fail('sync-inventory-unavailable'));
        tx.oncomplete=()=>{const allowed=new Set(['membership','migrationState','datasetState','cursor','shadowKeys','lastSyncAt']);
            const meta=Object.fromEntries(keys.meta.flatMap((key,i)=>allowed.has(key)?[[key,rows.meta[i]?.value]]:[]));
            resolve({inspected:true,provenance:{...provenance,databaseName,state:'present'},meta,outbox:rows.outbox,shadow:rows.shadow,conflicts:rows.conflicts,keys:{outbox:keys.outbox,shadow:keys.shadow,conflicts:keys.conflicts}});};
    });}finally{db.close();}
}
