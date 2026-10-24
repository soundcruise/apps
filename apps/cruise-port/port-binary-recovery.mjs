// Inert recovery archive on existing owners. No live restore, pointer publish,
// normal writer, Cloud, Account mutation or import-time I/O.
import {authorityProEnvironment,authorityUsesIndexedDB,openIDBAuthorityStore,claimPortAuthorityIssuer} from './port-indexeddb-authority-store.mjs';
import {createIsolatedAccountCutoverSource} from '../shared/sync-account/account-mutation-receipts.mjs';
import {createIsolatedRecoveryBackupStore} from '../shared/sync-account/app-backup-recovery.mjs';
import {createPortAuthorityBinaryStore,readLegacyPortAssetInventory} from './port-authority-binary.mjs';
import {binaryManifest,verifyDestination} from './port-migration-candidate.mjs';
import {validatePortAuthorityCandidate} from './port-local-authority.mjs';
import {PORT_DATASET_KEYS,PORT_DATASET_META,PortDatasetRepository} from './port-dataset-repository.js';
import {digest,equal,frozen,identifier,fail} from './port-idb-authority-contract.mjs';
import {safeEvidence} from './port-migration-contract.mjs';
const result=extra=>frozen({historical:true,canWrite:false,operationAuthorized:false,continuityProven:false,recoveryRequired:true,...extra});
const archiveId=id=>{if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw fail('recovery-archive-id-invalid');return id;};
function json(value){
    if(value===null||['string','boolean'].includes(typeof value)||typeof value==='number'&&Number.isFinite(value))return;
    if(!value||typeof value!=='object'||(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value))))throw fail('recovery-value-unsupported');
    if(Reflect.ownKeys(value).length!==Object.keys(value).length+(Array.isArray(value)?1:0))throw fail('recovery-value-unsupported');
    if(Array.isArray(value)&&Array.from({length:value.length},(_,i)=>i).some(i=>!Object.hasOwn(value,i)))throw fail('recovery-value-unsupported');
    for(const d of Object.values(Object.getOwnPropertyDescriptors(value))){if(d.get||d.set)throw fail('recovery-value-unsupported');json(d.value);}
}
function raw(storage){
    const rows=[];if(!storage||typeof storage.key!=='function'||!Number.isSafeInteger(storage.length)||storage.length<0)throw fail('recovery-storage-required');
    const known=new Set([...PORT_DATASET_KEYS,PORT_DATASET_META]);
    for(let i=0;i<storage.length;i++){const k=storage.key(i);if(typeof k!=='string')throw fail('recovery-source-changing');
        if(k.startsWith('cruisePort.')){if(!known.has(k))throw fail('recovery-unknown-port-key');const v=storage.getItem(k);if(typeof v!=='string')throw fail('recovery-source-changing');rows.push([k,v]);}}
    rows.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);if(new Set(rows.map(([k])=>k)).size!==rows.length||JSON.stringify(rows).length>4194304)throw fail('recovery-capacity');return rows;
}
const values=rows=>Object.fromEntries(PORT_DATASET_KEYS.map(k=>[k,new Map(rows).get(k)??null]));
function validateRows(rows){
    const known=new Set([...PORT_DATASET_KEYS,PORT_DATASET_META]);
    if(!Array.isArray(rows)||rows.some(r=>!Array.isArray(r)||r.length!==2||!known.has(r[0])||typeof r[1]!=='string')||new Set(rows.map(r=>r[0])).size!==rows.length)throw fail('recovery-archive-invalid');
    new PortDatasetRepository({storage:{getItem:k=>new Map(rows).get(k)??null},locks:null}).inspect();
}
function packet(row,scopeName,id){
    const p=row?.packet,m=p?.manifest;json(p);safeEvidence(p);
    if(row.kind!=='port-recovery-v1'||row.scopeName!==scopeName||p?.schemaVersion!==1||p.checksum!==digest(m)||
        m?.schemaVersion!==1||m.purpose!=='port-recovery-inert'||m.archiveId!==id||m.scopeName!==scopeName||
        m.binaryGeneration!=='recovery-'+digest([scopeName,id])||!Array.isArray(m.rows)||!Array.isArray(m.assets)||
        m.rawDigest!==digest(m.rows)||m.binding?.account?.physicalVersion!==3||m.binding.account.supported!==true||
        m.canWrite!==false||m.cloudConnected!==false||m.liveRestore!==false||m.rawWriterExcluded!==false||m.atomic!==false||
        JSON.stringify(p).length>8388608)throw fail('recovery-archive-invalid');
    identifier(m.generation);identifier(m.stopOperationId);validateRows(m.rows);return p;
}
export async function createIsolatedPortBinaryRecovery({scope,indexedDB,storage,checkpoint=async()=>{}}={}){
    const env=authorityProEnvironment(scope);env.assertLive();
    if(!env.fixtureOnly||!authorityUsesIndexedDB(scope,indexedDB)||!/^sound-cruise-port-authority-v1-fixture-/.test(scope.name)||typeof checkpoint!=='function')throw fail('recovery-isolation-required');
    const account=createIsolatedAccountCutoverSource({indexedDB,scopeName:scope.name});
    const backup=createIsolatedRecoveryBackupStore({indexedDB,scopeName:scope.name}),authority=await openIDBAuthorityStore(scope);
    let issuer;try{issuer=claimPortAuthorityIssuer(scope);}catch(e){authority.dispose();throw e;}
    const stores=new Map(),live=()=>env.assertLive();
    const binary=m=>{if(!stores.has(m.binaryGeneration))stores.set(m.binaryGeneration,createPortAuthorityBinaryStore({generation:m.binaryGeneration,indexedDb:indexedDB}));return stores.get(m.binaryGeneration);};
    const load=async id=>{archiveId(id);const row=await backup.read(id);live();if(!row)throw fail('recovery-archive-missing');return packet(row,scope.name,id);};
    async function binding(m){
        live();const a=await account.capture(),s=await authority.hydrate(m.generation),f=await authority.lookupControlOperation(m.generation,m.stopOperationId);live();
        if(!equal(a.manifest,m.binding.account)||!s.ok||!s.snapshot?.active||!s.snapshot.control.recoveryRequired||
            digest(s.snapshot.control)!==m.binding.controlDigest||digest(s.snapshot.pointer)!==m.binding.pointerDigest||
            !f.ok||!f.result||f.result.controlEpoch!==s.snapshot.control.epoch||!await account.current(a.context))throw fail('recovery-binding-stale');
    }
    async function snapshot(){
        const rows=raw(storage);validateRows(rows);const assets=await readLegacyPortAssetInventory(indexedDB,{strict:true});live();
        if(assets.length>512||assets.reduce((n,a)=>n+a.blob.size,0)>134217728)throw fail('recovery-capacity');
        for(const a of assets){json(a.metadata);safeEvidence(a.metadata);}
        await validatePortAuthorityCandidate({values:values(rows),assets});const manifest=await binaryManifest(values(rows),assets);
        if(!equal(rows,raw(storage)))throw fail('recovery-source-changing');return {rows,assets,manifest};
    }
    async function verify(id){
        const p=await load(id),m=p.manifest;await binding(m);
        const target=binary(m),assets=await target.entries();
        if(assets.length!==m.assets.length||new Set(assets.map(a=>a.kind+':'+a.id)).size!==assets.length)throw fail('recovery-binary-inventory-mismatch');
        await verifyDestination(target,assets,m.assets);await validatePortAuthorityCandidate({values:values(m.rows),assets});
        const actual=await binaryManifest(values(m.rows),assets);if(!equal(actual,m.assets))throw fail('recovery-reference-mismatch');
        if(!equal((await load(id)),p))throw fail('recovery-archive-changed');await binding(m);
        const orphanCount=m.assets.filter(a=>a.deletionState!=='referenced').length;
        let portSourceMatches=false;try{portSourceMatches=equal(raw(storage),m.rows);}catch{/* archive can be inspected without repairing a damaged source */}
        return result({ok:true,archiveVerified:true,restorePreviewReady:orphanCount===0,orphanCount,
            portSourceMatches,requiresSourceReview:!portSourceMatches||orphanCount>0,manifestHash:p.checksum,archiveId:id,
            // A frozen as-of-read preview, never a setter or a second live source.
            preview:{values:values(m.rows),binary:m.assets.map(a=>({kind:a.kind,id:a.id,hash:a.hash,size:a.size,mime:a.mime}))}});
    }
    const attempt=fn=>async q=>{try{return await fn(q);}catch(e){return result({ok:false,archiveVerified:false,reason:e.code||e.name||'recovery-unresolved'});}};
    return Object.freeze({
        prepare:attempt(async({archiveId:id,generation}={})=>{
            archiveId(id);identifier(generation);live();const old=await backup.read(id);
            if(old){const p=packet(old,scope.name,id);if(p.manifest.generation!==generation)throw fail('recovery-archive-conflict');await binding(p.manifest);return result({ok:true,prepared:true,archiveVerified:false,manifestHash:p.checksum});}
            const a=await account.capture(),c=await snapshot(),s=await authority.hydrate(generation);live();
            if(!a.manifest.supported||a.manifest.physicalVersion!==3||!s.ok||!s.snapshot?.active||s.snapshot.control.identity.accountId!==a.manifest.accountId||!await account.current(a.context))throw fail('recovery-source-stale');
            const stopOperationId='recovery-stop-'+id;
            const prior=await authority.lookupControlOperation(generation,stopOperationId);
            if(!prior.ok)throw fail(prior.reason);
            if(prior.result){
                if(prior.result.action!=='markRecoveryRequired'||prior.result.controlEpoch!==s.snapshot.control.epoch||!s.snapshot.control.recoveryRequired)throw fail('recovery-stop-stale');
            }else{
                if(prior.pending)throw fail('recovery-stop-unproven');
                const stopped=await authority.markRecoveryRequired({generation,operationId:stopOperationId,identity:s.snapshot.control.identity,
                    expectedEpoch:s.snapshot.control.epoch,expectedPointerEpoch:s.snapshot.pointer.pointerEpoch,capability:issuer.issue('control:recovery',{generation})});
                if(!stopped.ok)throw fail(stopped.reason);
            }
            await checkpoint('after-stop');live();
            const now=await authority.hydrate(generation);if(!now.ok||!now.snapshot?.active||!now.snapshot.control.recoveryRequired||!await account.current(a.context))throw fail('recovery-binding-stale');
            const after=await snapshot();if(!equal(c.rows,after.rows)||!equal(c.manifest,after.manifest))throw fail('recovery-source-changing');
            const manifest={schemaVersion:1,purpose:'port-recovery-inert',archiveId:id,scopeName:scope.name,generation,stopOperationId,
                binaryGeneration:'recovery-'+digest([scope.name,id]),binding:{account:a.manifest,controlDigest:digest(now.snapshot.control),pointerDigest:digest(now.snapshot.pointer)},
                rows:c.rows,rawDigest:digest(c.rows),assets:c.manifest,canWrite:false,cloudConnected:false,liveRestore:false,rawWriterExcluded:false,atomic:false};
            const p={schemaVersion:1,manifest,checksum:digest(manifest)};json(p);safeEvidence(p);await binding(manifest);
            await backup.add(id,p);await checkpoint('after-backup');await binding(manifest);
            return result({ok:true,prepared:true,archiveVerified:false,manifestHash:p.checksum});
        }),
        stage:attempt(async({archiveId:id}={})=>{
            const p=await load(id),m=p.manifest;await binding(m);const source=await snapshot();
            if(!equal(source.rows,m.rows)||!equal(source.manifest,m.assets))throw fail('recovery-source-changing');
            const target=binary(m);
            for(const a of source.assets){await binding(m);await target.putImmutable(a);await checkpoint('after-binary:'+a.kind+':'+a.id);}
            const after=await snapshot();if(!equal(after.rows,m.rows)||!equal(after.manifest,m.assets))throw fail('recovery-source-changing');
            await checkpoint('before-readback');return verify(id);
        }),
        recover:attempt(({archiveId:id}={})=>verify(id)),
        dispose(){for(const s of stores.values())s.dispose();authority.dispose();}
    });
}
