import { clone, equal, fail, recordKey, deleted, sameRecord, graphIssues, assertSyncProvenance, safeEvidence, MIGRATION_RECORD_TYPES, assertIdentity } from './port-migration-contract.mjs';
export function trustedShadow(candidate, cloud) {
    const s=candidate.syncInventory,p=s?.provenance,m=s?.meta;
    try { assertSyncProvenance(s,candidate.provenance); } catch { return false; }
    if(!p?.shadowCheckpoint||!m?.cursor||p.shadowCheckpoint.cursor!==m.cursor||
        p.shadowCheckpoint.datasetId!==cloud.datasetId||!p.shadowCheckpoint.complete||
        !equal([...(m.shadowKeys||[])].sort(),s.shadow.map(recordKey).sort())||
        s.shadow.some(r=>!Number.isSafeInteger(r.revision)||r.revision<1||!r.payloadHash||!r.operationId))return false;
    // A legacy shadow without an explicit, complete base anchor is evidence, never a trusted base.
    return s.outbox.every(op=>{const base=s.shadow.find(r=>recordKey(r)===recordKey(op));return !base||op.baseRevision===base.revision;})&&s.shadow.every(r=>{const a=p.shadowCheckpoint.anchors?.[recordKey(r)];return a&&
        a.localBaseHash===r.payloadHash&&a.localBaseRevision===r.revision&&a.revision===r.revision&&a.payloadHash===r.payloadHash&&a.operationId===r.operationId&&a.deleted===deleted(r);});
}
export function planPortMigration({candidate,cloud=null,decisions=[]}) {
    safeEvidence({candidate:{...candidate,assets:undefined},cloud,decisions});
    if(!candidate.ok||candidate.status!=='candidate-only')throw fail('candidate-not-verified');
    assertIdentity(candidate.provenance);assertSyncProvenance(candidate.syncInventory,candidate.provenance);
    const identity=candidate.provenance,bound=identity.ownership==='bound-account';
    if(!['bound-account','unbound-local'].includes(identity.ownership))throw fail('ownership-review-required');
    if(bound&&(!cloud||cloud.authenticated!==true||cloud.accountId!==identity.accountId||cloud.appId!=='port'||
        cloud.datasetId!==identity.datasetId||cloud.complete!==true||!cloud.checkpoint?.cursor||!cloud.checkpoint?.manifestHash))throw fail('cloud-checkpoint-invalid');
    if(!bound&&cloud)throw fail('unbound-cloud-forbidden');
    const remote=cloud?.records||[],local=candidate.records;
    if(new Set(remote.map(recordKey)).size!==remote.length||remote.some(r=>!MIGRATION_RECORD_TYPES.includes(r.recordType)||r.accountId!==undefined&&r.accountId!==identity.accountId||r.appId!==undefined&&r.appId!=='port'||r.datasetId!==undefined&&r.datasetId!==identity.datasetId||r.schemaVersion!==1||!Number.isSafeInteger(r.revision)||r.revision<1))throw fail('cloud-record-invalid');
    const L=new Map(local.map(r=>[recordKey(r),r])),R=new Map(remote.map(r=>[recordKey(r),r]));
    const trusted=bound&&trustedShadow(candidate,cloud),B=new Map(trusted?candidate.syncInventory.shadow.map(r=>[recordKey(r),r]):[]);
    const entries=[],review=[],chosen=[],proposals=[],checkpoint=clone(cloud?.checkpoint||{localOnly:true});
    const binding={candidateHash:candidate.sourceHash,checkpoint};
    if(new Set(decisions.map(d=>d.key)).size!==decisions.length)throw fail('stale-review');
    for(const d of decisions)if(!equal(d.binding,binding)||!['local','remote'].includes(d.choice))throw fail('stale-review');
    const oldOutbox=candidate.syncInventory?.outbox||[];
    const outbox=oldOutbox.map(op=>{
        const r=R.get(recordKey(op)),echo=r&&r.operationId===op.operationId&&sameRecord(op,r);
        const pendingDelete=op.deleted&&L.has(recordKey(op));
        return {operation:clone(op),classification:echo?'own-echo':pendingDelete?'recreate-review':'review-required'};
    });
    for(const key of new Set([...L.keys(),...R.keys(),...Object.keys(candidate.deleteIntents||{}),...oldOutbox.map(recordKey),...(candidate.syncInventory?.conflicts||[]).map(c=>c.recordKey)])){
        const l=L.get(key)||null,r=R.get(key)||null,b=B.get(key)||null,intent=candidate.deleteIntents?.[key];
        let classification,selected,reason=null;
        if(intent===true){classification='unknown/conflict';reason='legacy-boolean-intent';}
        else if(l&&intent){classification='unknown/conflict';reason='recreate-intent-conflict';}
        else if(!l&&intent){classification='deleted-locally';if(!r||deleted(r))selected=null;else if(trusted&&sameRecord(r,b))selected=null;else reason='delete-base-unknown';}
        else if(l&&r&&sameRecord(l,r)){classification='both-equal';selected=l;}
        else if(l&&!r){classification='local-only';selected=l;}
        else if(!l&&r&&!deleted(r)){classification='cloud-only';selected=r;}
        else if(deleted(r)) {classification='deleted-remotely';if(!l||trusted&&sameRecord(l,b))selected=null;else reason='delete-edit-conflict';}
        else if(l&&r&&trusted&&sameRecord(r,b)){classification='local-newer';selected=l;}
        else if(l&&r&&trusted&&sameRecord(l,b)){classification='cloud-newer';selected=r;}
        else if(l&&r){classification='divergent';reason='both-changed-or-untrusted-base';}
        else {classification='unknown/conflict';reason='unexplained-absence';}
        const pending=outbox.filter(o=>recordKey(o.operation)===key&&o.classification!=='own-echo');
        const conflict=(candidate.syncInventory?.conflicts||[]).some(c=>c.recordKey===key);
        if(pending.length||conflict)reason=reason||'legacy-pending-review';
        const decision=decisions.find(d=>d.key===key);
        if(reason&&decision&&intent!==true&&reason!=='recreate-intent-conflict'&&MIGRATION_RECORD_TYPES.includes(key?.split('/')[0])){selected=decision.choice==='local'?l:r;if(deleted(selected))selected=null;reason=null;}
        if(reason){review.push({key,reason,local:clone(l),remote:clone(r)});selected=l;}
        entries.push({key,classification,review:!!reason});
        if(selected&&!deleted(selected))chosen.push(clone(selected));
        if(!reason&&bound&&!sameRecord(selected||null,deleted(r)?null:r)) {
            if(!selected&&(!intent||typeof intent.generation!=='string')){review.push({key,reason:'delete-generation-required'});continue;}
            const source=selected||r;
            proposals.push({recordType:source.recordType,recordId:source.recordId,schemaVersion:source.schemaVersion,
                payload:selected?clone(selected.payload):null,payloadHash:selected?.payloadHash||null,deleted:!selected,
                baseRevision:r?.revision||0,deleteIntentGeneration:!selected?intent.generation:null,
                legacyOperationIds:pending.map(o=>o.operation.operationId)});
        }
    }
    for(const r of chosen){
        const kind={gear_item:'gear',my_app:'myApps',practice_attachment:'attachments'}[r.recordType];
        if(!kind)continue;
        const owner=kind==='attachments'?r.payload.value.practiceId:r.recordId;
        const inspect=v=>{if(!v||typeof v!=='object')return;
            if(v.assetId&&!candidate.binaryManifest.some(m=>m.kind===kind&&m.hash===v.hash&&m.size===v.byteSize&&m.mime===v.mime&&m.owners.includes(owner)))
                review.push({key:recordKey(r),reason:'asset-ownership-or-binary-review'});
            for(const child of Object.values(v))if(child&&typeof child==='object')inspect(child);};
        inspect(r.payload.value);
    }
    review.push(...graphIssues(chosen));
    return {schemaVersion:1,binding,shadowTrusted:!!trusted,entries,review,outbox,records:chosen,
        proposedOperations:proposals,checkpoint,complete:review.length===0};
}
