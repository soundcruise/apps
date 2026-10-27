// Local provenance reader only; SQL owner remains the authority for each lease.
// No stopped scope is reopened and no backup row is consumed or rewritten.
import {digest,equal,fail} from './port-idb-authority-contract.mjs';
import {validateCutoverRequest,validateConsumer,exactKeys,isUUID} from '../shared/sync-account/owner-cutover-contract.mjs';
import {validateCutoverIntent} from './port-owner-cutover-contract.mjs';
export async function readConsumerReadmissionBasis({store,backup,generation,transitionId,scopeName}){
 if(!isUUID(transitionId))throw fail('owner-operation-source-unproven');
 const pub=await store.lookupOwnerCutoverPublication({generation,transitionId}),consumer=await store.readConsumer();
 if(!pub.ok||!consumer.ok)throw fail('owner-operation-source-unproven');
 const proof=pub.fact.evidence.cutover,q=proof.request;validateCutoverRequest(q);validateConsumer(consumer.consumer);
 if(q.targetGeneration!==generation||pub.fact.pointer.operationId!==transitionId||pub.fact.pointer.previousGeneration!==q.sourceGeneration||consumer.consumer.publicationDigest!==pub.publicationDigest||consumer.consumer.transitionId!==transitionId)throw fail('owner-operation-source-unproven');
 const cutover=await backup.read('cutover-'+transitionId),pin=cutover?.packet;
 if(!pin||!exactKeys(pin,['schemaVersion','purpose','transitionId','request','requestDigest','history','inventory'])||pin.schemaVersion!==1||pin.purpose!=='owner-cutover-pending-v1'||pin.transitionId!==transitionId||!equal(pin.request,q)||pin.requestDigest!==digest(q)||!exactKeys(pin.history,['renewalOperationId','adoptionOperationId','reauthorizationOperationId'])||!Object.values(pin.history).every(isUUID)||!Array.isArray(pin.inventory)||q.backupInventoryDigest!==digest(pin.inventory))throw fail('owner-operation-pending-unresolved');
 const rows=(await backup.inventory()).sort((a,b)=>a.id.localeCompare(b.id)),prefix='port-recovery-v1:'+scopeName+':',known=new Set([cutover.id]);
 for(const item of pin.inventory){const row=rows.find(r=>r.id===item.id);if(!exactKeys(item,['id','digest'])||!row||digest(row)!==item.digest||known.has(item.id))throw fail('owner-operation-pending-unresolved');known.add(item.id);}
 const lineage=rows.find(r=>r.id===prefix+'reauth-'+pin.history.reauthorizationOperationId)?.packet;
 if(lineage?.purpose!=='authority-reauthorization-pending-v1'||lineage.request?.targetGeneration!==q.sourceGeneration||lineage.adopt?.operationId!==pin.history.adoptionOperationId||lineage.adopt?.renewalOperationId!==pin.history.renewalOperationId||!['renew-'+pin.history.renewalOperationId,'adopt-'+pin.history.adoptionOperationId,'reauth-'+pin.history.reauthorizationOperationId].every(id=>known.has(prefix+id)))throw fail('owner-operation-pending-unresolved');
 const publication=await backup.read('publish-cutover-'+transitionId),p=publication?.packet;
 if(!p||!exactKeys(p,['schemaVersion','purpose','transitionId','requestDigest','intent','intentDigest'])||p.schemaVersion!==1||p.purpose!=='owner-cutover-publication-pending-v1'||p.transitionId!==transitionId||p.requestDigest!==digest(q)||p.intentDigest!==digest(p.intent)||!equal(p.intent,proof.intent))throw fail('owner-operation-pending-unresolved');
 validateCutoverIntent(p.intent,q);known.add(publication.id);
 for(const row of rows){if(known.has(row.id)||!row.id.startsWith(prefix+'recover-cutover-'))continue;const p=row.packet;
  if(!p||!exactKeys(p,['schemaVersion','purpose','transitionId','operationId','requestDigest','intent','intentDigest','localIdentity'])||p.schemaVersion!==1||p.purpose!=='owner-cutover-recovery-pending-v1'||p.transitionId!==transitionId||row.id!==prefix+'recover-cutover-'+p.operationId||p.requestDigest!==digest(q)||p.intentDigest!==digest(p.intent)||!isUUID(p.operationId)||p.localIdentity?.operationId!==p.operationId||p.localIdentity?.fingerprint!==digest(p.localIdentity?.body))throw fail('owner-operation-pending-unresolved');
  validateCutoverIntent(p.intent,q);const r=await store.lookupOwnerCutoverRecovery({generation:q.sourceGeneration,operationId:p.operationId});if(!r.ok||!equal(r.row.proof.intent,p.intent)||r.row.fingerprint!==p.localIdentity?.fingerprint)throw fail('owner-operation-pending-unresolved');known.add(row.id);
 }
 const completion={purpose:'readonly-pointer-consumer-completion-v1',transitionId,pointer:pub.fact.pointer,pointerDigest:digest(pub.fact.pointer),consumer:consumer.consumer,publicationDigest:pub.publicationDigest};
 const stop=proof.roster.stopFact;
 return {pointer:pub.fact.pointer,receiptDigest:pub.publicationDigest,
  q0:{...q.anchorRequest,sourceAccountDigest:q.accountDigest,sourceManifestDigest:q.sourceManifestDigest},k:q.anchorRequest,known,
  readmission:{transitionId,requestDigest:digest(q),completionDigest:digest(completion),registryRevision:stop.registryRevision,stopFenceRevision:stop.fencingRevision}};
}

