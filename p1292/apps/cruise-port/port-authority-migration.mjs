import { AUTHORITY_WRITER_PROTOCOL, SYNC_WIRE_PROTOCOL } from '../shared/sync-account/writer-authority.mjs';
// Dormant B1-4 engine. No production caller, global Storage fallback or network API.
import { PortDatasetRepository, PORT_DATASET_KEYS, PORT_DATASET_META, PORT_DELETE_INTENTS, PORT_DATASET_CATALOG, preservePortFields } from './port-dataset-repository.js';
import { authorityPhysicalKey, authorityMarkerKey, authorityLockName, PORT_AUTHORITY_POINTER, validatePortAuthorityCandidate } from './port-local-authority.mjs';
import { candidateHash, digest, binaryManifest, verifyDestination, recordsFor, migrationAdapter } from './port-migration-candidate.mjs';
import { planPortMigration } from './port-migration-planner.mjs';
import { MIGRATION_SCHEMA, MIGRATION_STATES, clone, equal, fail, safeEvidence, assertIdentity, assertSyncProvenance, deleted, recordKey, sameRecord } from './port-migration-contract.mjs';
import { authorityWriteControlKey, readWriteControl, publishWriteControl, initializeWriteControl, assertIdentitySnapshot } from './port-authority-write-control.mjs';
const scopes=new WeakMap(),fences=new WeakMap();
const prefix='soundCruise.portMigration.v1.';
const id=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw fail('migration-id-invalid');return value;};
function isolatedHost(){
    // Uses actual execution context, never a caller-supplied origin/debug flag.
    if(globalThis.location&&!['127.0.0.1','localhost','[::1]'].includes(globalThis.location.hostname))throw fail('production-publication-disabled');
}
export function createIsolatedMigrationScope({storage,partitionId,locks,getIdentity,readIdentity,setIdentity,binaryStoreFactory,syncStoreFactory,readSource,checkpoint=async()=>{}}={}){
    isolatedHost();
    if(!storage||!partitionId||!locks?.request||!getIdentity||!binaryStoreFactory||!readSource)throw fail('migration-dependencies-required');
    const scope=Object.freeze({kind:'isolated-migration-scope'});
    scopes.set(scope,{storage,partitionId,locks,getIdentity,readIdentity,setIdentity,binaryStoreFactory,syncStoreFactory,readSource,checkpoint});
    return scope;
}
export function issueIsolatedFence(scope,evidence){
    isolatedHost();if(!scopes.has(scope))throw fail('publication-capability-required');
    if(evidence?.transactionalAdmission!==true||evidence.cutoverBarrier!==true||!evidence.checkpoint||
        !Number.isSafeInteger(evidence.epoch)||evidence.epoch<1||!evidence.generation||!evidence.accountId)throw fail('fence-evidence-invalid');
    const ticket=Object.freeze({kind:'isolated-fence'});fences.set(ticket,{scope,evidence:clone(evidence)});return ticket;
}
export function revokeIsolatedFence(ticket){
    const f=fences.get(ticket);fences.delete(ticket); // immediately reject this context's ticket
    if(!f)return Promise.resolve();
    const env=scopes.get(f.scope),generation=f.evidence.generation;
    const pending=env.locks.request(authorityLockName(generation),{mode:'exclusive'},()=>{
        const raw=env.storage.getItem(PORT_AUTHORITY_POINTER);if(!raw)return;
        const p=JSON.parse(raw);if(p.generation!==generation)return;
        const control=readWriteControl(env.storage,generation,p.migrationId);
        if(equal(control.fence,f.evidence))publishWriteControl(env.storage,generation,{...control,fenceRevoked:true});
    });
    // Existing callers may request revocation without awaiting it. Completion
    // means the shared epoch has linearized; write failures remain fail-closed locally.
    void pending.catch(()=>{});return pending;
}
export async function changeIsolatedIdentity(scope,next){
    isolatedHost();const env=scopes.get(scope);if(!env||typeof env.setIdentity!=='function')throw fail('authority-identity-unavailable');
    assertIdentity(next);
    return env.locks.request(`sound-cruise:port:migration:v1:${env.partitionId}`,{mode:'exclusive'},async()=>{
        const raw=env.storage.getItem(PORT_AUTHORITY_POINTER),p=raw&&JSON.parse(raw);
        const update=()=>{
            if(env.storage.getItem(PORT_AUTHORITY_POINTER)!==raw)throw fail('stale-authority-handle');
            if(p){const control=readWriteControl(env.storage,p.generation,p.migrationId);
                publishWriteControl(env.storage,p.generation,{...control,identityInvalidated:true});}
            // A synchronous owner source is required. The durable invalidation
            // is published first, so a source failure cannot reopen the old gate.
            const result=env.setIdentity(clone(next));if(result?.then)throw fail('authority-identity-unavailable');
        };
        return p?env.locks.request(authorityLockName(p.generation),{mode:'exclusive'},update):update();
    });
}
export function createPortMigrationEngine({scope,migrationId,generation}={}){
    if(!scopes.has(scope))throw fail('production-publication-disabled');isolatedHost();id(migrationId);id(generation);
    const env=scopes.get(scope),{storage,locks}=env,journalKey=prefix+migrationId;
    const view={getItem:k=>storage.getItem(authorityPhysicalKey(generation,k)),setItem:(k,v)=>storage.setItem(authorityPhysicalKey(generation,k),v),removeItem:k=>storage.removeItem(authorityPhysicalKey(generation,k))};
    const binary=env.binaryStoreFactory(generation);if(binary.generation!==generation)throw fail('binary-authority-mismatch');
    let sync=null,disposed=false,currentFence=null;
    function check(){isolatedHost();if(disposed)throw fail('migration-disposed');}
    async function readJournal(){
        check();const raw=storage.getItem(journalKey);if(raw===null)return null;
        try{const packet=JSON.parse(raw),j=packet.value;
            if(j.schemaVersion!==MIGRATION_SCHEMA||j.migrationId!==migrationId||j.generation!==generation||!MIGRATION_STATES.includes(j.state)||
                packet.hash!==await digest(j))throw fail('journal-invalid');return j;
        }catch{throw fail('recovery-required');}
    }
    async function save(j){check();safeEvidence(j);const packet={value:clone(j),hash:await digest(j)};check();storage.setItem(journalKey,JSON.stringify(packet));}
    function pointer(){
        const raw=storage.getItem(PORT_AUTHORITY_POINTER);if(raw===null)return null;
        try{const p=JSON.parse(raw);if(p.schemaVersion!==1||!p.migrationId||!p.generation||!p.sealHash)throw fail('invalid');return p;}
        catch{throw fail('recovery-required');}
    }
    const expectedPointer=j=>({schemaVersion:1,migrationId,generation,sealHash:j.sealHash,ownership:j.identity.ownership,accountId:j.identity.accountId});
    async function current(j){check();const who=await env.getIdentity();check();if(!equal(who,j.identity)||who.partitionId!==env.partitionId)throw fail('migration-account-changed');}
    async function sourceUnchanged(j){const latest=await env.readSource();check();if(!latest.ok||latest.sourceHash!==j.sourceHash||await candidateHash(latest)!==j.sourceHash)throw fail('legacy-changing');}
    async function step(name,j){await env.checkpoint(name,clone(j));check();await current(j);}
    async function task(action){check();return locks.request(`sound-cruise:port:migration:v1:${env.partitionId}`,{mode:'exclusive'},async()=>{
        check();try{return await action();}catch(e){
            const j=await readJournal().catch(()=>null);if(j){
                j.resumeFrom=j.state;j.state=e.code==='legacy-changing'||e.code==='migration-account-changed'?'review-required':'recovery-required';j.error=e.code||'migration-interrupted';
                await save(j).catch(()=>{});
            }throw e;
        }
    });}
    async function verifyCandidate(c){
        assertIdentity(c.provenance);assertSyncProvenance(c.syncInventory,c.provenance);
        if(!c.ok||c.issues.length||c.sourceHash!==await candidateHash(c))throw fail('candidate-not-verified');
        if(c.provenance.partitionId!==env.partitionId)throw fail('storage-partition-mismatch');
        await validatePortAuthorityCandidate(c);
        if(!equal(await binaryManifest(c.values,c.assets),c.binaryManifest)||!equal(await recordsFor(c.values),c.records))throw fail('candidate-manifest-mismatch');
    }
    function evidence(c){return safeEvidence({...clone(c),assets:c.assets.map(({blob,...rest})=>rest)});}
    async function begin(c){return task(async()=>{
        const existing=await readJournal();if(existing){if(existing.sourceHash!==c.sourceHash||!equal(existing.identity,c.provenance))throw fail('migration-source-or-owner-changed');return existing;}
        safeEvidence(evidence(c));
        const j={schemaVersion:MIGRATION_SCHEMA,migrationId,generation,sourceHash:c.sourceHash,identity:clone(c.provenance),candidate:evidence(c),
            state:c.ok?'candidate-captured':'review-required',completedStages:[],decisions:[],cloudCheckpoint:null,fenceEvidence:null,
            operationMapping:[],sealedManifest:null,error:null,sourceAcknowledgement:null};
        await current(j);await save(j);await step('candidate-captured',j);return clone(j);
    });}
    function syncStore(j){
        if(j.identity.ownership==='unbound-local')return null;
        if(!sync){if(!env.syncStoreFactory)throw fail('sync-store-required');sync=env.syncStoreFactory({accountId:j.identity.accountId,authorityGeneration:generation});}
        const expected=`sound-cruise-port-authority-sync-v1-account-${encodeURIComponent(j.identity.accountId)}-generation-${generation}`;
        if(sync.databaseName!==expected||sync.accountId!==j.identity.accountId||sync.authorityGeneration!==generation)throw fail('sync-authority-mismatch');return sync;
    }
    async function stage(c){return task(async()=>{
        await verifyCandidate(c);let j=await readJournal();if(!j||j.sourceHash!==c.sourceHash||!equal(j.identity,c.provenance))throw fail('migration-source-or-owner-changed');
        if(j.writeDisabled)throw fail('authority-write-disabled');
        if(j.sealedManifest||j.state==='active')throw fail('migration-already-sealed');
        await current(j);await sourceUnchanged(j);
        return locks.request(authorityLockName(generation),{mode:'exclusive'},async()=>{
            const raw=storage.getItem(authorityMarkerKey(generation));
            if(raw){let m;try{m=JSON.parse(raw);}catch{throw fail('recovery-required');}if(m.migrationId!==migrationId)throw fail('authority-already-exists');}
            else if([...PORT_DATASET_KEYS,PORT_DATASET_META].some(k=>view.getItem(k)!==null))throw fail('authority-unowned-data');
            if(j.preparedRevision&&!j.sealDraft&&repo().inspect().revision!==j.preparedRevision)throw fail('stale-prepared-revision');
            j.state='staging';j.error=null;await save(j);await step('staging-journal',j);
            storage.setItem(authorityMarkerKey(generation),JSON.stringify({schemaVersion:1,migrationId,generation,state:'staging'}));
            for(const key of PORT_DATASET_KEYS){check();const expected=c.values[key];if(view.getItem(key)!==expected){if(expected===null)view.removeItem(key);else view.setItem(key,expected);}await step('dataset:'+key,j);}
            // Old WAL is retained in evidence; never made live. Stable migration-owned initial revisions.
            const meta={protocol:1,generation,revision:`migration:${migrationId}`,keyRevisions:Object.fromEntries(PORT_DATASET_KEYS.map(k=>[k,`migration:${migrationId}`]))};
            if(view.getItem(PORT_DATASET_META)!==JSON.stringify(meta))view.setItem(PORT_DATASET_META,JSON.stringify(meta));
            for(const asset of c.assets){const existing=await binary.get(asset.kind,asset.id);
                if(existing)await verifyDestination(binary,[asset],c.binaryManifest.filter(m=>m.kind===asset.kind&&m.id===asset.id));
                else await binary.put(asset);
                await step('binary:'+asset.kind+':'+asset.id,j);
            }
            await verifyDestination(binary,c.assets,c.binaryManifest);
            const store=syncStore(j);if(store){
                if((await store.listOutbox()).length||(await store.listShadow()).length||(await store.listConflicts()).length)throw fail('migration-sync-not-empty');
                const expected={migrationId,generation,sourceHash:j.sourceHash,sendEnabled:false};
                const old=await store.readMeta('migrationPreparation');if(old&&!equal(old,expected))throw fail('migration-sync-mismatch');
                await store.setMeta('migrationPreparation',expected);await step('sync-preparation',j);
                if(!equal(await store.readMeta('migrationPreparation'),expected))throw fail('migration-sync-mismatch');
            }
            if(PORT_DATASET_KEYS.some(k=>view.getItem(k)!==c.values[k]))throw fail('dataset-copy-mismatch');
            await sourceUnchanged(j);await current(j);
            j.completedStages=['dataset','binary','sync'];j.state='prepared';j.preparedRevision=repo().inspect().revision;
            await save(j);storage.setItem(authorityMarkerKey(generation),JSON.stringify({schemaVersion:1,migrationId,generation,state:'prepared'}));return clone(j);
        });
    });}
    function repo(){return new PortDatasetRepository({storage:view,locks});}
    async function acknowledgeSource(candidateHashValue){return task(async()=>{
        const j=await readJournal();if(!j||j.state!=='prepared'||candidateHashValue!==j.sourceHash)throw fail('source-review-required');
        await current(j);await sourceUnchanged(j);
        // Explicit acceptance of the captured candidate, NOT proof that legacy writers are absent.
        j.sourceAcknowledgement={candidateHash:candidateHashValue,atomic:false,abaExcluded:false};await save(j);return clone(j);
    });}
    function validateFence(ticket,j,checkpoint){
        const f=fences.get(ticket);if(!f||f.scope!==scope||f.evidence.generation!==generation||f.evidence.accountId!==j.identity.accountId||
            !equal(f.evidence.checkpoint,checkpoint))throw fail('cloud-fence-required');if(j.fenceEvidence&&j.fenceEvidence.epoch!==f.evidence.epoch)throw fail('cloud-fence-changed');currentFence=ticket;return clone(f.evidence);
    }
    async function reconcile({cloud=null,decisions=[],fence=null}={}){return task(async()=>{
        const j=await readJournal();if(!j||j.writeDisabled||j.sealedManifest||!['prepared','awaiting-cloud-fence','reconciling','review-required','recovery-required'].includes(j.state)||!j.completedStages.includes('sync'))throw fail('migration-state-invalid');
        await current(j);await sourceUnchanged(j);
        if(j.identity.ownership==='bound-account'){
            j.state='awaiting-cloud-fence';await save(j);await step('before-fence',j);
            j.fenceEvidence=validateFence(fence,j,cloud?.checkpoint);await save(j);try{await step('after-fence',j);}catch(e){revokeIsolatedFence(fence);throw e;}
            // Recompute every live payload hash and validate the full supported record graph.
            for(const r of cloud?.records||[])if(r.payloadHash!==await digest({appId:'port',payload:r.payload??null,recordId:r.recordId,recordType:r.recordType,schemaVersion:r.schemaVersion}))throw fail('cloud-hash-mismatch');
            const live=(cloud?.records||[]).filter(r=>!deleted(r));
            const {adapter}=await migrationAdapter(j.candidate.values);
            const serialized=await adapter.serializeRecords(adapter.deserializeRecords(live));
            if(serialized.some(r=>cloud.records.find(v=>recordKey(v)===recordKey(r))?.payloadHash!==r.payloadHash))throw fail('cloud-hash-mismatch');
        }
        j.state='reconciling';await save(j);
        const plan=planPortMigration({candidate:j.candidate,cloud,decisions});
        const binding={...plan.binding,migrationId};
        if(decisions.some(d=>d.migrationId!==migrationId))throw fail('stale-review');
        j.plan=plan;j.cloudCheckpoint=plan.checkpoint;j.decisions=clone(decisions);j.reviewBinding=binding;
        j.state=plan.complete?'reconciling':'review-required';await save(j);return clone(plan);
    });}
    async function materialize(j){
        const original=j.candidate.values,{adapter,values}=await migrationAdapter(original);
        // Avoid rewriting equal snapshots (and their unknown raw fields).
        let next=clone(original);
        if(!equal(j.plan.records,j.candidate.records)){
            await adapter.applyRemoteSnapshot(adapter.deserializeRecords(j.plan.records));next=values();
            for(const key of Object.keys(PORT_DATASET_CATALOG))if(next[key]!==null&&original[key]!==null)
                next[key]=JSON.stringify(preservePortFields(JSON.parse(original[key]),JSON.parse(next[key])));
        }
        // A legacy ACK must never match an intent in the new authority.
        const oldIntents=JSON.parse(original[PORT_DELETE_INTENTS]||'{}');
        j.deleteIntentMapping||={};const newIntents={};
        for(const [key,intent] of Object.entries(oldIntents)){
            if(!intent||intent===true||typeof intent.generation!=='string')throw fail('delete-generation-required');
            const newGeneration=await digest({migrationId,generation,key,legacyGeneration:intent.generation});
            j.deleteIntentMapping[key]={legacyGeneration:intent.generation,generation:newGeneration};
            newIntents[key]={...intent,generation:newGeneration};
        }
        next[PORT_DELETE_INTENTS]=original[PORT_DELETE_INTENTS]===null?null:JSON.stringify(newIntents);
        const assets=[];for(const m of j.candidate.binaryManifest){const a=await binary.get(m.kind,m.id);if(!a)throw fail('binary-destination-missing');assets.push(a);}
        await validatePortAuthorityCandidate({values:next,assets});
        const actualRecords=await recordsFor(next);
        if(actualRecords.length!==j.plan.records.length||actualRecords.some(r=>!sameRecord(r,j.plan.records.find(p=>recordKey(p)===recordKey(r)))))throw fail('reconciled-roundtrip-mismatch');
        const manifest=await binaryManifest(next,assets);
        // Cloud reference changes need an explicit asset migration; never silently drop/rebind local bytes.
        if(!equal(manifest,j.candidate.binaryManifest))throw fail('binary-owner-review-required');
        return {next,assets,manifest};
    }
    async function seal({fence=null}={}){return task(async()=>{
        const j=await readJournal();if(!j||j.writeDisabled||!j.plan?.complete||!j.sourceAcknowledgement||j.sealedManifest||j.state!=='reconciling')throw fail('publication-gate-incomplete');
        await current(j);await sourceUnchanged(j);if(j.identity.ownership==='bound-account')validateFence(fence,j,j.cloudCheckpoint);
        return locks.request(authorityLockName(generation),{mode:'exclusive'},async()=>{
            if(repo().inspect().revision!==j.preparedRevision)throw fail('stale-prepared-revision');
            const {next,assets,manifest}=await materialize(j);await verifyDestination(binary,assets,j.candidate.binaryManifest);
            await step('before-seal',j);
            // Persist fixed operation IDs before any later step can fail. Never enqueue legacy operations.
            const operationPlanHash=await digest({proposals:j.plan.proposedOperations,checkpoint:j.cloudCheckpoint});
            if(j.operationPlanHash&&j.operationPlanHash!==operationPlanHash)throw fail('operation-plan-changed');
            if(!j.operationPlanHash){j.operationMapping=await Promise.all(j.plan.proposedOperations.map(async p=>({...p,
                payloadHash:p.deleted?await digest({appId:'port',payload:null,recordId:p.recordId,recordType:p.recordType,schemaVersion:p.schemaVersion}):p.payloadHash,
                operationId:crypto.randomUUID(),deleteIntentGeneration:p.deleted?j.deleteIntentMapping[recordKey(p)]?.generation:null,context:{accountId:j.identity.accountId,appId:'port',generation,writerProtocol:AUTHORITY_WRITER_PROTOCOL,syncProtocol:SYNC_WIRE_PROTOCOL,expectedWriteEpoch:j.fenceEvidence?.epoch??null}})));
                j.operationPlanHash=operationPlanHash;}
            j.sealDraft={values:next,binaryManifest:manifest};await save(j);await step('seal-draft',j);
            for(const key of PORT_DATASET_KEYS){if(next[key]===null)view.removeItem(key);else view.setItem(key,next[key]);}
            const state=repo().inspect();
            const store=syncStore(j);if(store){
                await store.setMeta('migrationCheckpoint',{migrationId,checkpoint:j.cloudCheckpoint,sendEnabled:false});
                if((await store.listOutbox()).length||(await store.listShadow()).length||(await store.listConflicts()).length)throw fail('migration-sync-not-empty');
            }
            await current(j);await sourceUnchanged(j);
            j.sealedManifest={schemaVersion:1,migrationId,generation,sourceHash:j.sourceHash,identity:j.identity,
                datasetHash:await digest(state.values),binaryHash:await digest(manifest),repositoryRevision:state.revision,
                checkpoint:j.cloudCheckpoint,operationHash:await digest(j.operationMapping),protocol:{repository:1,writer:AUTHORITY_WRITER_PROTOCOL,sync:SYNC_WIRE_PROTOCOL},recoveryJournal:journalKey};
            j.sealHash=await digest(j.sealedManifest);j.state='ready-to-publish';j.error=null;await save(j);await step('seal-journal',j);
            storage.setItem(authorityMarkerKey(generation),JSON.stringify({schemaVersion:1,migrationId,generation,state:'sealed',sealHash:j.sealHash}));return clone(j);
        });
    });}
    async function validateSealed(j,fence){
        if(!j.sealedManifest||j.sealHash!==await digest(j.sealedManifest))throw fail('seal-invalid');
        await current(j);if(j.identity.ownership==='bound-account')validateFence(fence,j,j.cloudCheckpoint);
        const state=repo().inspect();if(state.revision!==j.sealedManifest.repositoryRevision||await digest(state.values)!==j.sealedManifest.datasetHash)throw fail('sealed-data-changed');
        const assets=[];for(const m of j.candidate.binaryManifest)assets.push(await binary.get(m.kind,m.id));
        await verifyDestination(binary,assets,j.candidate.binaryManifest);
        if(await digest(await binaryManifest(state.values,assets))!==j.sealedManifest.binaryHash||await digest(j.operationMapping)!==j.sealedManifest.operationHash)throw fail('sealed-manifest-changed');
        await recordsFor(state.values);
        const store=syncStore(j);if(store){
            if(!equal(await store.readMeta('migrationCheckpoint'),{migrationId,checkpoint:j.cloudCheckpoint,sendEnabled:false}))throw fail('sync-checkpoint-missing');
            if((await store.listOutbox()).length||(await store.listShadow()).length||(await store.listConflicts()).length)throw fail('migration-sync-not-empty');
        }
    }
    async function publish({fence=null}={}){return task(async()=>{
        const j=await readJournal();if(!j||!['ready-to-publish','recovery-required','active'].includes(j.state))throw fail('migration-state-invalid');
        const p=pointer();if(p){if(!equal(p,expectedPointer(j)))throw fail('active-authority-exists');await current(j);await verifyMarker(j);j.state='active';await save(j);return {status:'already-published',generation};}
        await sourceUnchanged(j);
        return locks.request(authorityLockName(generation),{mode:'exclusive'},async()=>{
            await validateSealed(j,fence);await verifyMarker(j);await step('before-pointer',j);
            await validateSealed(j,fence);await sourceUnchanged(j);await current(j);
            if(j.identity.ownership==='bound-account')validateFence(fence,j,j.cloudCheckpoint);
            // No await from the last revision/identity check through the pointer write.
            if(repo().inspect().revision!==j.sealedManifest.repositoryRevision||pointer())throw fail('stale-publication');
            initializeWriteControl(storage,j);
            storage.setItem(PORT_AUTHORITY_POINTER,JSON.stringify(expectedPointer(j)));
            await step('after-pointer',j);j.state='active';await save(j);return {status:'published',generation};
        });
    });}
    async function recover({fence=null}={}){return task(async()=>{
        const j=await readJournal();if(!j)throw fail('journal-missing');await current(j);
        const p=pointer();if(p){if(!equal(p,expectedPointer(j)))throw fail('recovery-required');
            await verifyMarker(j);j.state='active';j.error=null;await save(j);return clone(j);}
        if(j.sealedManifest){await validateSealed(j,fence);storage.setItem(authorityMarkerKey(generation),JSON.stringify({schemaVersion:1,migrationId,generation,state:'sealed',sealHash:j.sealHash}));j.state='ready-to-publish';j.error=null;await save(j);}
        // Pre-seal partial writes resume by restaging the same source, retaining operation IDs.
        return clone(j);
    });}
    async function verifyMarker(j){
        let m;try{m=JSON.parse(storage.getItem(authorityMarkerKey(generation)));}catch{throw fail('recovery-required');}
        if(!m||m.state!=='sealed'||m.migrationId!==migrationId||m.sealHash!==j.sealHash||!j.sealedManifest)throw fail('recovery-required');
        if(view.getItem(PORT_DATASET_META)===null||PORT_DATASET_KEYS.some(k=>j.sealDraft.values[k]!==null&&view.getItem(k)===null))throw fail('recovery-required');repo().inspect();
        const assets=[];for(const m of j.candidate.binaryManifest)assets.push(await binary.get(m.kind,m.id));await verifyDestination(binary,assets,j.candidate.binaryManifest);
    }
    async function preparedRepository(){
        const j=await readJournal();if(!j||j.state!=='prepared')throw fail('migration-state-invalid');
        const guard=()=>{check();const packet=JSON.parse(storage.getItem(journalKey)||'null');if(packet?.value?.state!=='prepared'||pointer())throw fail('stale-authority-handle');};
        return new PortDatasetRepository({authorityProvider:{storage:view,lockName:authorityLockName(generation),assertReadable:guard,assertWritable(){guard();throw fail('prepared-read-only');}},locks});
    }
    async function activeRepository({fence=currentFence}={}){
        const j=await readJournal();await current(j);const p=pointer();if(!p||!equal(p,expectedPointer(j)))throw fail('recovery-required');await verifyMarker(j);
        const guard=()=>{check();const actual=pointer();if(!equal(actual,p))throw fail('stale-authority-handle');
            const packet=JSON.parse(storage.getItem(journalKey)||'null');if(packet?.value?.state!=='active')throw fail('recovery-required');
            if(!storage.getItem(authorityMarkerKey(generation))||!view.getItem(PORT_DATASET_META))throw fail('recovery-required');};
        const writable=()=>{guard();if(j.identity.ownership==='bound-account')validateFence(fence,j,j.cloudCheckpoint);if(JSON.parse(storage.getItem(journalKey)).value.writeDisabled)throw fail('authority-write-disabled');};
        const capture=()=>{writable();return {control:clone(readWriteControl(storage,generation,migrationId)),journalRaw:null};};
        const validate=async context=>{
            const raw=storage.getItem(journalKey),live=await readJournal();
            if(raw!==storage.getItem(journalKey)||live?.state!=='active'||!equal(live.identity,j.identity))throw fail('recovery-required');
            context.journalRaw=raw;
        };
        const final=context=>{
            writable();assertIdentitySnapshot(env,j.identity);
            const control=readWriteControl(storage,generation,migrationId);
            if(control.suspended)throw fail('authority-write-disabled');
            if(control.fenceRevoked)throw fail('cloud-fence-required');
            if(control.identityInvalidated||!equal(control.identity,j.identity))throw fail('migration-account-changed');
            if(!equal(control,context.control)||context.journalRaw!==storage.getItem(journalKey))throw fail('authority-context-stale');
            if(j.identity.ownership==='bound-account'){
                const proof=validateFence(fence,j,j.cloudCheckpoint);
                if(!equal(proof,control.fence)||proof.accountGeneration!==j.identity.accountGeneration||
                    proof.membershipGeneration!==j.identity.membershipGeneration||proof.membershipId!==j.identity.membershipId)
                    throw fail('cloud-fence-required');
            }
            const meta=JSON.parse(view.getItem(PORT_DATASET_META)||'null');
            if(meta?.generation!==generation||meta.protocol!==1)throw fail('stale-authority-handle');
            const marker=JSON.parse(storage.getItem(authorityMarkerKey(generation))||'null');
            if(marker?.schemaVersion!==1||marker.generation!==generation||marker.migrationId!==migrationId||
                marker.state!=='sealed'||marker.sealHash!==j.sealHash)throw fail('recovery-required');
            return Object.freeze({generation,migrationId,controlEpoch:control.epoch,identity:Object.freeze(clone(j.identity)),
                fenceEpoch:control.fence?.epoch??null});
        };
        const provider={storage:view,lockName:authorityLockName(generation),assertReadable:guard,assertWritable:writable,
            captureCommitContext:capture,validateCommitContext:validate,assertCommitCurrent:final};
        const active=new PortDatasetRepository({authorityProvider:provider,locks});
        const write=active.runWrite.bind(active);
        active.runWrite=(options,writer)=>write({...options,assertCurrent:async()=>{await current(j);writable();await options?.assertCurrent?.();}},writer);
        return active;
    }
    async function setWrites(suspended,{fence=currentFence}={}){return task(async()=>{
        const j=await readJournal();await current(j);j.writeDisabled=suspended;safeEvidence(j);
        const packet=JSON.stringify({value:clone(j),hash:await digest(j)});
        return locks.request(authorityLockName(generation),{mode:'exclusive'},()=>{
            check();assertIdentitySnapshot(env,j.identity);
            if(storage.getItem(authorityWriteControlKey(generation))===null){
                if(!suspended||pointer())throw fail('recovery-required');
                storage.setItem(journalKey,packet);return {writeEnabled:false};
            }
            const control=readWriteControl(storage,generation,migrationId);
            if(!suspended){
                if(j.state!=='active'||!equal(pointer(),expectedPointer(j))||control.identityInvalidated||control.fenceRevoked)throw fail('recovery-required');
                if(j.identity.ownership==='bound-account')validateFence(fence,j,j.cloudCheckpoint);
                storage.setItem(journalKey,packet); // old suspended control still closes writes
            }
            publishWriteControl(storage,generation,{...control,suspended});
            if(suspended)storage.setItem(journalKey,packet);
            return {writeEnabled:!suspended};
        });
    });}
    const suspendWrites=()=>setWrites(true),resumeWrites=options=>setWrites(false,options);
    async function abandon(){return task(async()=>{const j=await readJournal();if(pointer()||j.fenceEvidence)throw fail('rollback-forbidden');j.state='review-required';j.writeDisabled=true;j.error='stage-abandoned';await save(j);return clone(j);});}
    async function rescue(candidate){return task(async()=>{const j=await readJournal();if(!pointer()||j.state!=='active')throw fail('active-required');await current(j);
        if(!equal(candidate.provenance,j.identity)||candidate.sourceHash!==await candidateHash(candidate))throw fail('migration-source-or-owner-changed');
        const changedKeys=PORT_DATASET_KEYS.filter(k=>candidate.values[k]!==j.candidate.values[k]);
        const rescueId=await digest({migrationId,sourceHash:candidate.sourceHash});j.rescues||=[];
        if(!j.rescues.some(r=>r.rescueId===rescueId))j.rescues.push({rescueId,candidate:evidence(candidate),changedKeys,status:'review-required',targetRevision:repo().inspect().revision,imported:false});
        await save(j);return clone(j.rescues.find(r=>r.rescueId===rescueId));
    });}
    return Object.freeze({begin,stage,acknowledgeSource,reconcile,seal,publish,recover,preparedRepository,activeRepository,suspendWrites,resumeWrites,abandon,rescue,
        inspect:readJournal,exportEvidence:readJournal,dispose(){disposed=true;binary.dispose?.();sync?.dispose?.();}});
}
