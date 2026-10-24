// Dormant isolated coordinator. Never installs a writer, copies a canonical
// dataset, publishes an Authority pointer, opens Cloud or restores old bytes.
import {authorityProEnvironment,openIDBAuthorityStore,claimPortAuthorityIssuer} from './port-indexeddb-authority-store.mjs';
import {createIsolatedAccountCutoverSource} from '../shared/sync-account/account-mutation-receipts.mjs';
import {PORT_DATASET_KEYS,PORT_DATASET_META} from './port-dataset-repository.js';
import {validatePortAuthorityCandidate} from './port-local-authority.mjs';
import {digest,equal,identifier,fail,frozen} from './port-idb-authority-contract.mjs';
import {CUTOVER_KIND,validateCutoverJournal} from './port-account-cutover-contract.mjs';
const closed=extra=>frozen({historical:true,operationAuthorized:false,continuityProven:false,recoveryRequired:true,canWrite:false,...extra});
function portRows(storage){
    const rows=[];
    for(let n=0;n<storage.length;n++){const k=storage.key(n);if(typeof k!=='string')throw fail('cutover-port-changing');
        if(k.startsWith('cruisePort.')){const v=storage.getItem(k);if(typeof v!=='string')throw fail('cutover-port-changing');rows.push([k,v]);}}
    rows.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
    if(new Set(rows.map(([k])=>k)).size!==rows.length||JSON.stringify(rows).length>4194304)throw fail('cutover-port-capacity');return rows;
}
export async function capturePortCutoverManifest(storage){
    if(!storage||typeof storage.key!=='function'||typeof storage.getItem!=='function'||!Number.isSafeInteger(storage.length)||storage.length<0)throw fail('cutover-port-source-required');
    const rows=portRows(storage),known=new Set([...PORT_DATASET_KEYS,PORT_DATASET_META]);
    const unknownCount=rows.filter(([k])=>!known.has(k)).length,values=Object.fromEntries(PORT_DATASET_KEYS.map(k=>[k,new Map(rows).get(k)??null]));
    let supported=unknownCount===0,reason=unknownCount?'unknown-port-keys':null;
    try{await validatePortAuthorityCandidate({values});const meta=new Map(rows).get(PORT_DATASET_META);if(meta){const m=JSON.parse(meta);if(m.protocol!==1||m.pending)throw fail('repository-recovery-required');}}
    catch(e){supported=false;reason=e.code||'port-data-invalid';}
    if(!equal(rows,portRows(storage)))throw fail('cutover-port-changing');
    return frozen({schemaVersion:1,digest:digest(rows),entries:rows.map(([key,raw])=>({key,hash:digest(raw),length:raw.length})),
        unknownCount,supported,reason,retainedInPlace:true,atomic:false,abaExcluded:false});
}
export async function createIsolatedAccountPortCutover({scope,indexedDB,storage,checkpoint=async()=>{}}={}){
    const env=authorityProEnvironment(scope);env.assertLive();
    if(!env.fixtureOnly||!/^sound-cruise-port-authority-v1-fixture-/.test(scope.name)||typeof checkpoint!=='function')throw fail('cutover-isolation-required');
    const source=createIsolatedAccountCutoverSource({indexedDB,scopeName:scope.name}),store=await openIDBAuthorityStore(scope);
    let issuer;try{issuer=claimPortAuthorityIssuer(scope);}catch(e){store.dispose();throw e;}
    const live=()=>env.assertLive();
    const check=async j=>{
        live();validateCutoverJournal(j);const s=await store.hydrate(j.generation);live();
        if(!s.ok||!s.snapshot?.active||digest(s.snapshot.control)!==j.barrierDigest||digest(s.snapshot.pointer)!==j.pointerDigest||!s.snapshot.control.recoveryRequired)throw fail('cutover-barrier-stale');
        const p=await capturePortCutoverManifest(storage);live();if(!p.supported||!equal(p,j.manifest.port))throw fail('cutover-port-source-stale');
    };
    const read=async id=>{identifier(id);const r=await store.readJournal(id);if(!r.ok||!r.journal)throw fail(r.reason||'cutover-missing');validateCutoverJournal(r.journal);return r.journal;};
    const step=async(j,stage,a)=>{
        await check(j);const r=await store.advanceDataCutover({migrationId:j.migrationId,expectedRevision:j.revision,stage,accountSnapshot:a});
        if(!r.ok)throw fail(r.reason);return r.journal;
    };
    const matching=(a,b)=>a.supported&&equal([a.accountId,a.accountDeviceId,a.dataDigest],[b.accountId,b.accountDeviceId,b.dataDigest]);
    async function process(migrationId,allowUpgrade){
        let j;
        try{
            j=await read(migrationId);
            for(let n=0;n<6;n++){
                await check(j);let a=await source.capture();live();
                if(!matching(a.manifest,j.manifest.account))throw fail('cutover-account-source-stale');
                if(j.stage==='verified-inert'){
                    if(!equal(a.manifest,j.accountSnapshot)||!await source.current(a.context))throw fail('cutover-account-source-stale');
                    await check(j);return closed({ok:true,migrationProven:true,status:'verified-inert',journal:j});
                }
                if(j.stage==='stopped'||j.stage==='enrolled'){
                    if(!allowUpgrade)return closed({ok:false,migrationProven:false,reason:'cutover-explicit-continue-required',journal:j});
                    const expected=j.accountSnapshot??j.manifest.account;
                    if(!equal(a.manifest,expected))throw fail('cutover-account-source-stale');
                    j=await step(j,a.manifest.physicalVersion===1?'enroll-requested':a.manifest.physicalVersion===2?'cutover-requested':'verified-inert',a.manifest);
                    await checkpoint('authority-'+j.stage);continue;
                }
                const from=j.stage==='enroll-requested'?1:2,expected=j.accountSnapshot;
                if(a.manifest.physicalVersion===from){
                    if(!equal(a.manifest,expected))throw fail('cutover-account-source-stale');
                    if(!allowUpgrade)return closed({ok:false,migrationProven:false,reason:'cutover-account-step-unproven',journal:j});
                    await checkpoint('before-account-'+from);await check(j);live();
                    a=await source.advance(a.context);live();await checkpoint('after-account-'+from);
                }
                const b=a.manifest;
                if(b.physicalVersion!==from+1||!matching(b,j.manifest.account)||b.fence?.legacyDigest!==expected.stepDigest||
                    b.fence.scopeName!==scope.name||b.fence.revision!==(expected.fence?.revision??0)||!await source.current(a.context))throw fail('cutover-account-proof-unresolved');
                j=await step(j,from===1?'enrolled':'verified-inert',b);await checkpoint('authority-'+j.stage);
                if(!allowUpgrade&&j.stage!=='verified-inert')return closed({ok:false,migrationProven:false,reason:'cutover-explicit-continue-required',journal:j});
            }
            throw fail('cutover-state-invalid');
        }catch(e){return closed({ok:false,migrationProven:false,reason:e.code||'cutover-interrupted',...(j?{journal:j}:{})});}
    }
    return Object.freeze({
        async prepare({migrationId,generation}={}){
            try{
                identifier(migrationId);identifier(generation);live();
                const a=await source.capture(),port=await capturePortCutoverManifest(storage);live();
                if(!a.manifest.supported||!port.supported)throw fail('cutover-source-review-required');
                const s=await store.hydrate(generation);live();
                if(!s.ok||s.readiness!=='writable'||s.snapshot?.control.identity.accountId!==a.manifest.accountId||!await source.current(a.context))throw fail('cutover-source-stale');
                if(!equal(port,await capturePortCutoverManifest(storage)))throw fail('cutover-port-source-stale');
                const manifest={schemaVersion:1,partitionId:scope.partitionId,account:a.manifest,port,binary:'not-connected',cloud:'not-connected',rawWriterExcluded:false};
                const j={schemaVersion:1,kind:CUTOVER_KIND,migrationId,generation,revision:1,state:'staging',stage:'stopped',
                    identity:s.snapshot.control.identity,manifest,manifestHash:digest(manifest),accountSnapshot:null,
                    canWrite:false,operationAuthorized:false,continuityProven:false,historical:true};
                const r=await store.beginDataCutover({journal:j,expectedControl:s.snapshot.control,expectedPointer:s.snapshot.pointer,
                    capability:issuer.issue('control:recovery',{generation})});if(!r.ok)throw fail(r.reason);
                await checkpoint('authority-stopped');return closed({ok:true,migrationProven:false,journal:r.journal});
            }catch(e){return closed({ok:false,migrationProven:false,reason:e.code||'cutover-prepare-failed'});}
        },
        run:({migrationId}={})=>process(migrationId,true),
        recover:({migrationId}={})=>process(migrationId,false),
        dispose(){store.dispose();}
    });
}
