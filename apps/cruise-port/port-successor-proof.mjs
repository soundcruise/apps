import {digest,equal,fail} from './port-idb-authority-contract.mjs';
import {validateSuccessorStopRequest,validateSuccessorStop} from '../shared/sync-account/owner-successor-contract.mjs';
import {validateCutoverPublication,CUTOVER_PUBLICATION} from './port-owner-cutover-contract.mjs';
import {validateOperationEnvelope,validateOperationLease} from '../shared/sync-account/owner-operation-lease-contract.mjs';
import {validateOwnerOperationProof} from './port-owner-operation-contract.mjs';
const need=x=>{if(!x)throw fail('successor-proof-invalid');},exact=(x,k)=>x&&equal(Object.keys(x).sort(),k.sort());
export function validateSuccessorProof(s,q){
 need(exact(s,['request','stop','roster','sourcePublication','consumer'])&&q.backupInventoryDigest===digest(q.successor.inventory));validateSuccessorStopRequest(s.request);validateSuccessorStop(s.stop,s.request);need(equal(s.request.request,q)&&s.stop.requestDigest===digest(s.request));
 const {e}=validateSuccessorOrigin(s.sourcePublication,s.consumer,q);
 const ro=s.roster;need(exact(ro,['schemaVersion','purpose','requestDigest','items','latest','digest'])&&ro.schemaVersion===1&&ro.purpose==='owner-successor-history-v1'&&ro.requestDigest===digest(s.request)&&Array.isArray(ro.items)&&ro.items.length<=64&&ro.digest===digest({items:ro.items,latest:ro.latest}));const ids=new Set();
 for(const i of ro.items){need(exact(i,['operationId','envelope','lease','state','backendFact','operationLeaseReceipt'])&&!ids.has(i.operationId));ids.add(i.operationId);validateOperationEnvelope(i.envelope);validateOperationLease(i.lease,i.envelope);const a=i.envelope.request;
  need(a.accountId===q.accountId&&a.accountDeviceId===q.accountDeviceId&&a.membershipId===q.membershipId&&a.accountGeneration===q.accountGeneration&&a.membershipGeneration===q.membershipGeneration&&a.credentialVersion===q.credentialVersion-1&&a.credentialLeaseRevision===q.credentialLeaseRevision-2&&a.datasetId===s.request.anchorRequest.datasetId&&i.lease.envelopeDigest===digest(i.envelope)&&i.lease.fencingRevision<s.stop.fencingRevision);
  if(i.state==='backend-committed')validateOwnerOperationProof({schemaVersion:1,purpose:'owner-committed-bpm-application-v1',envelope:i.envelope,lease:i.lease,backendReceipt:i.backendFact,operationLeaseReceipt:i.operationLeaseReceipt,fingerprint:'0'.repeat(64)});else need(i.state==='fenced-not-committed'&&i.backendFact===null&&i.operationLeaseReceipt===null);
  if(i.envelope.authority.generation!==q.sourceGeneration){const old=e.cutover.roster.items.find(v=>v.operationId===i.operationId);need(old&&equal(old.envelope,i.envelope)&&equal(old.lease,i.lease)&&(old.state==='backend-committed'?i.state==='backend-committed'&&equal(old.backendFact,i.backendFact)&&equal(old.operationLeaseReceipt,i.operationLeaseReceipt):i.state==='fenced-not-committed'));}else need(i.envelope.schemaVersion===3&&equal(i.envelope.consumer,s.consumer)&&equal(i.envelope.authority.pointer,q.successor.sourcePointer));
 }
 need(e.cutover.roster.items.every(i=>ids.has(i.operationId)));
 if(ro.latest){const i=ro.items.find(i=>i.operationId===ro.latest.last_operation_id);need(i?.state==='backend-committed'&&i.backendFact.revision===ro.latest.revision&&i.backendFact.payloadHash===ro.latest.payload_hash&&equal(JSON.parse(ro.latest.payload_json),s.request.anchorRequest.operation.payload));}else need(ro.items.every(i=>i.state!=='backend-committed'));
 return s;
}

export function validateSuccessorOrigin(f,consumer,q){
 const r=f.request,e=f.evidence,row={generation:f.pointer.activeGeneration,operationId:f.pointer.operationId,schemaVersion:1,kind:CUTOVER_PUBLICATION,fingerprint:digest({kind:CUTOVER_PUBLICATION,...r,evidence:e}),action:'publishOwnerCutover',policy:'control:owner-cutover',targetKeys:[],origin:'v2',publication:f};validateCutoverPublication(row);
 need(q.successor.registryRevision===e.cutover.roster.stopFact.registryRevision&&q.successor.stopFenceRevision===e.cutover.roster.stopFact.fencingRevision);
 need(digest(row)===q.successor.publicationDigest&&equal(f.pointer,q.successor.sourcePointer)&&equal(consumer,q.successor.consumer)&&digest(e.cutover.request)===q.successor.previousRequestDigest);
 const oldCompletion={purpose:'readonly-pointer-consumer-completion-v1',transitionId:consumer.transitionId,pointer:f.pointer,pointerDigest:digest(f.pointer),consumer:consumer,publicationDigest:digest(row)};need(digest(oldCompletion)===q.successor.previousCompletionDigest);
 return {e};
}
