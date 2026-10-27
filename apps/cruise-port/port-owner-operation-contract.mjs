// Fixture-only materialization of ONE already committed owner operation.
// Integrity hashes are not authorization; only the scoped opaque attestation is.
import {validateOperationEnvelope,validateOperationLease} from '../shared/sync-account/owner-operation-lease-contract.mjs';
import {digest,equal,fail,validatePointer,validateControl,assertJSONEvidence} from './port-idb-authority-contract.mjs';
export const OWNER_OPERATION_ROW='owner-operation-receipt';
export function validateOwnerOperationProof(p){
 assertJSONEvidence(p);if(!p||!equal(Object.keys(p).sort(),['schemaVersion','purpose','envelope','lease','backendReceipt','operationLeaseReceipt','fingerprint'].sort())||p.schemaVersion!==1||p.purpose!=='owner-committed-bpm-application-v1'||!/^([a-f0-9]{64})$/.test(p.fingerprint))throw fail('owner-operation-proof-invalid');
 const e=p.envelope,q=e?.request,r=p.backendReceipt,l=p.lease,k=p.operationLeaseReceipt;validateOperationEnvelope(e);validateOperationLease(l,e);validatePointer(e.authority.pointer);
 if(l.envelopeDigest!==digest(e)||k?.purpose!=='owner-operation-consumed-v1'||k.historical!==true||!equal(k.lease,l)||k.envelopeDigest!==digest(e)||!equal(k.backendReceipt,r)||r?.operationId!==q.operation.operationId||r.requestDigest!==digest(q)||r.accountId!==q.accountId||r.accountGeneration!==q.accountGeneration||r.membershipGeneration!==q.membershipGeneration||r.datasetId!==q.datasetId||r.revision!==q.operation.baseRevision+1||r.payloadHash!==q.operation.payloadHash||!Number.isSafeInteger(r.changeSeq)||r.changeSeq<1)throw fail('owner-operation-receipt-invalid');
 return p;
}
export function assertOwnerOperationApplication(p,prepared,current){
 validateOwnerOperationProof(p);const e=p.envelope,a=e.authority,q=e.request,c=current?.control;validateControl(c);
 if(prepared.initialControl||prepared.action!=='saveBpm'||prepared.policy!=='standard'||prepared.authorizationContext!==undefined||prepared.operationId!==q.operation.operationId||prepared.generation!==a.generation||prepared.fingerprint!==p.fingerprint||!equal(Object.keys(prepared.changes),['cruisePort.metronome'])||!equal(JSON.parse(prepared.changes['cruisePort.metronome']),q.operation.payload.value)||!current.active||c.state!=='active'||!c.suspended||!c.fenceRevoked||c.identityInvalidated||c.recoveryRequired||c.epoch!==a.controlEpoch||c.fenceEpoch!==a.fenceEpoch||c.identity.accountId!==q.accountId||c.identity.accountGeneration!==q.accountGeneration||c.identity.membershipId!==q.membershipId||c.identity.membershipGeneration!==q.membershipGeneration||!equal(current,prepared.base)||!equal(current.pointer,a.pointer)||current.head.revision!==a.headRevision||digest(current)!==a.baseDigest||current.versions['cruisePort.metronome']!==a.keyRevision)throw fail('owner-operation-base-stale');
}
export function ownerOperationRow(p,prepared){const row={schemaVersion:1,kind:OWNER_OPERATION_ROW,generation:prepared.generation,operationId:prepared.operationId,fingerprint:prepared.fingerprint,proof:p,proofDigest:digest(p)};validateOwnerOperationRow(row);return row;}
export function validateOwnerOperationRow(r){
 if(!r||!equal(Object.keys(r).sort(),['schemaVersion','kind','generation','operationId','fingerprint','proof','proofDigest'].sort())||r.schemaVersion!==1||r.kind!==OWNER_OPERATION_ROW)throw fail('owner-operation-reservation-invalid');
 validateOwnerOperationProof(r.proof);if(r.generation!==r.proof.envelope.authority.generation||r.operationId!==r.proof.envelope.request.operation.operationId||r.fingerprint!==r.proof.fingerprint||r.proofDigest!==digest(r.proof))throw fail('owner-operation-reservation-invalid');
}
