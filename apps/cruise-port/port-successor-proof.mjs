import {digest,equal,fail} from './port-idb-authority-contract.mjs';
import {validateSuccessorStopRequest,validateSuccessorStop} from '../shared/sync-account/owner-successor-contract.mjs';
import {validateReauthorizationPublication,REAUTHORIZATION_PUBLICATION} from './port-authority-reauthorization-contract.mjs';
import {validateCutoverPublication,CUTOVER_PUBLICATION} from './port-owner-cutover-contract.mjs';
import {validateOperationEnvelope,validateOperationLease} from '../shared/sync-account/owner-operation-lease-contract.mjs';
import {validateOwnerOperationProof} from './port-owner-operation-contract.mjs';
const need=x=>{if(!x)throw fail('successor-proof-invalid');},exact=(x,k)=>x&&equal(Object.keys(x).sort(),k.sort());
export function validateSuccessorProof(s,q){
 need(exact(s,['request','stop','roster','sourcePublication','consumer'])&&q.backupInventoryDigest===digest(q.successor.inventory));validateSuccessorStopRequest(s.request);validateSuccessorStop(s.stop,s.request);need(equal(s.request.request,q)&&s.stop.requestDigest===digest(s.request));
 const {retained}=validateSuccessorOrigin(s.sourcePublication,s.consumer,q);
 const ro=s.roster;need(exact(ro,['schemaVersion','purpose','requestDigest','items','latest','digest'])&&ro.schemaVersion===1&&ro.purpose==='owner-successor-history-v1'&&ro.requestDigest===digest(s.request)&&Array.isArray(ro.items)&&ro.items.length<=64&&ro.digest===digest({items:ro.items,latest:ro.latest}));const ids=new Set();
 for(const i of ro.items){need(exact(i,['operationId','envelope','lease','state','backendFact','operationLeaseReceipt'])&&!ids.has(i.operationId));ids.add(i.operationId);validateOperationEnvelope(i.envelope);validateOperationLease(i.lease,i.envelope);const a=i.envelope.request;
  need(a.accountId===q.accountId&&a.accountDeviceId===q.accountDeviceId&&a.membershipId===q.membershipId&&a.accountGeneration===q.accountGeneration&&a.membershipGeneration===q.membershipGeneration&&(q.contractVersion!==2||a.credentialVersion===q.credentialVersion-1&&a.credentialLeaseRevision===q.credentialLeaseRevision-2)&&a.datasetId===s.request.anchorRequest.datasetId&&i.lease.envelopeDigest===digest(i.envelope)&&i.lease.fencingRevision<s.stop.fencingRevision);
  if(i.state==='backend-committed')validateOwnerOperationProof({schemaVersion:1,purpose:'owner-committed-bpm-application-v1',envelope:i.envelope,lease:i.lease,backendReceipt:i.backendFact,operationLeaseReceipt:i.operationLeaseReceipt,fingerprint:'0'.repeat(64)});else need(i.state==='fenced-not-committed'&&i.backendFact===null&&i.operationLeaseReceipt===null);
  if(i.envelope.authority.generation!==q.sourceGeneration){const old=retained.find(v=>v.operationId===i.operationId);need(old&&equal(old.envelope,i.envelope)&&equal(old.lease,i.lease)&&(old.state==='backend-committed'?i.state==='backend-committed'&&equal(old.backendFact,i.backendFact)&&equal(old.operationLeaseReceipt,i.operationLeaseReceipt):i.state==='fenced-not-committed'));}else need(a.credentialVersion===q.credentialVersion-1&&a.credentialLeaseRevision===q.credentialLeaseRevision-2&&i.envelope.schemaVersion===3&&equal(i.envelope.consumer,s.consumer)&&equal(i.envelope.authority.pointer,q.successor.sourcePointer));
 }
 need(retained.every(i=>ids.has(i.operationId)));
 if(ro.latest){const i=ro.items.find(i=>i.operationId===ro.latest.last_operation_id);need(i?.state==='backend-committed'&&i.backendFact.revision===ro.latest.revision&&i.backendFact.payloadHash===ro.latest.payload_hash&&equal(JSON.parse(ro.latest.payload_json),s.request.anchorRequest.operation.payload));}else need(ro.items.every(i=>i.state!=='backend-committed'));
 return s;
}

export function validateSuccessorOrigin(f,consumer,q){
 if(q.contractVersion===3)return secondOrigin(f,consumer,q);
 need(q.contractVersion===2);
 const r=f.request,e=f.evidence,row={generation:f.pointer.activeGeneration,operationId:f.pointer.operationId,schemaVersion:1,kind:CUTOVER_PUBLICATION,fingerprint:digest({kind:CUTOVER_PUBLICATION,...r,evidence:e}),action:'publishOwnerCutover',policy:'control:owner-cutover',targetKeys:[],origin:'v2',publication:f};validateCutoverPublication(row);
 need(q.successor.registryRevision===e.cutover.roster.stopFact.registryRevision&&q.successor.stopFenceRevision===e.cutover.roster.stopFact.fencingRevision);
 need(digest(row)===q.successor.publicationDigest&&equal(f.pointer,q.successor.sourcePointer)&&equal(consumer,q.successor.consumer)&&digest(e.cutover.request)===q.successor.previousRequestDigest);
 const oldCompletion={purpose:'readonly-pointer-consumer-completion-v1',transitionId:consumer.transitionId,pointer:f.pointer,pointerDigest:digest(f.pointer),consumer:consumer,publicationDigest:digest(row)};need(digest(oldCompletion)===q.successor.previousCompletionDigest);
 return {e,retained:e.cutover.roster.items};
}

// Exactly one previous v2 birth. q3 cannot be used as a source: bounded two cycles.
function secondOrigin(f,consumer,q){
 const p=f?.evidence?.reauthorization,r=f?.request,e=f?.evidence;
 need(q.successor.cycle===2&&p?.schemaVersion===2&&p.purpose==='adoption-authority-recovery-v2'&&p.request?.contractVersion===2);
 const row={generation:f.pointer.activeGeneration,operationId:f.pointer.operationId,schemaVersion:1,kind:REAUTHORIZATION_PUBLICATION,fingerprint:digest({kind:REAUTHORIZATION_PUBLICATION,...r,evidence:e}),action:'publishReauthorized',policy:'control:reauthorize',targetKeys:[],origin:'v2',publication:f};validateReauthorizationPublication(row);
 const prev=p.request,stop=p.successor.stop;
 need(['accountId','accountDeviceId','accountGeneration','membershipId','membershipGeneration','runtimeGeneration'].every(k=>q[k]===prev[k])&&q.credentialVersion===prev.credentialVersion+1&&q.credentialLeaseRevision===prev.credentialLeaseRevision+2&&q.sourceGeneration===prev.targetGeneration);
 const expected={...p.successor.consumer,id:prev.successor.targetConsumerId,epoch:p.successor.consumer.epoch+1,authorityGeneration:prev.targetGeneration,pointerEpoch:f.pointer.pointerEpoch,transitionId:prev.operationId,publicationDigest:digest(row),readOnly:true};
 need(equal(consumer,expected)&&equal(consumer,q.successor.consumer)&&equal(f.pointer,q.successor.sourcePointer)&&digest(row)===q.successor.publicationDigest&&q.successor.registryRevision===stop.registryRevision&&q.successor.stopFenceRevision===stop.fencingRevision&&q.successor.previousRequestDigest===digest(p.successor.request));
 const completed={purpose:'readonly-pointer-consumer-completion-v1',transitionId:consumer.transitionId,pointer:f.pointer,pointerDigest:digest(f.pointer),consumer,publicationDigest:digest(row)};need(q.successor.previousCompletionDigest===digest(completed));
 return {e,retained:p.successor.roster.items};
}
