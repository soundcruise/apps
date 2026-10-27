import {validateSuccessorProof} from './port-successor-proof.mjs';
// Port-owned typed recovery publication, separate from normal migration publish.
import {digest,equal,fail,validateControl,validatePointer} from './port-idb-authority-contract.mjs';
import {validateReauthorizationRequest} from '../shared/sync-account/authority-reauthorization-contract.mjs';
export const REAUTHORIZATION_PUBLICATION='reauthorization-publication';
const exact=(x,k)=>x&&Object.getPrototypeOf(x)===Object.prototype&&equal(Object.keys(x).sort(),[...k].sort());
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function validateReauthorizationProof(p){
 const successor=p?.schemaVersion===2&&p.purpose==='adoption-authority-recovery-v2';
 if(!exact(p,['schemaVersion','purpose','request','requestDigest','qualification','sourceControl','sourcePointer','adoptionReceipt',...(successor?['successor']:[])])||!successor&&(p.schemaVersion!==1||p.purpose!=='adoption-authority-recovery-v1'))throw fail('reauthorization-proof-invalid');
 validateReauthorizationRequest(p.request);const q=p.request,r=p.adoptionReceipt,k=p.qualification;
 validateControl(p.sourceControl);validatePointer(p.sourcePointer);
 if(p.requestDigest!==digest(q)||p.sourceControl.generation!==q.sourceGeneration||p.sourcePointer.activeGeneration!==q.sourceGeneration||p.sourceControl.epoch!==q.expectedControlEpoch||p.sourcePointer.pointerEpoch!==q.expectedPointerEpoch||
 !p.sourceControl.identityInvalidated||p.sourceControl.recoveryRequired||(successor?!p.sourceControl.suspended||!p.sourceControl.fenceRevoked:p.sourceControl.suspended||p.sourceControl.fenceRevoked)||p.sourceControl.state!=='active'||
 p.sourceControl.identity.accountId!==q.accountId||p.sourceControl.identity.accountGeneration!==q.accountGeneration||p.sourceControl.identity.membershipId!==q.membershipId||p.sourceControl.identity.membershipGeneration!==q.membershipGeneration||
 !exact(r,['schemaVersion','binding','beforeRevision','afterRevision','beforeDigest','afterDigest','requestHash','checksum'])||r.schemaVersion!==1||r.afterRevision!==r.beforeRevision+1||r.afterDigest!==q.sourceAccountDigest||r.checksum!==q.adoptionReceiptChecksum||
 r.binding?.operationId!==q.adoptionOperationId||r.binding.authorityGeneration!==q.sourceGeneration||r.binding.kind!=='switch'||r.binding.destination?.accountId!==q.accountId||r.binding.destination.accountDeviceId!==q.accountDeviceId||
 r.binding.account.accountId!==q.accountId||r.binding.account.accountGeneration!==q.accountGeneration||r.binding.account.membershipId!==q.membershipId||r.binding.account.membershipGeneration!==q.membershipGeneration||
 r.requestHash!==digest({binding:r.binding,beforeDigest:r.beforeDigest,afterDigest:r.afterDigest})||r.checksum!==digest(Object.fromEntries(Object.entries(r).filter(([key])=>key!=='checksum')))||
 !exact(k,['purpose','request','requestDigest','datasetId','appDeviceId','writeEpoch','credentialExpiresAt','proChecked','writerChecked','leaseThroughLocalCommit'])||k.purpose!=='authority-reauthorization-qualification-v1'||!equal(k.request,q)||k.requestDigest!==p.requestDigest||
 typeof k.datasetId!=='string'||!k.datasetId||typeof k.appDeviceId!=='string'||!k.appDeviceId||!Number.isSafeInteger(k.writeEpoch)||k.writeEpoch<1||!Number.isSafeInteger(k.credentialExpiresAt)||k.credentialExpiresAt<1||k.proChecked!==true||k.writerChecked!==true||k.leaseThroughLocalCommit!==false)throw fail('reauthorization-proof-invalid');
 if(successor){if(q.contractVersion!==2)throw fail('reauthorization-proof-invalid');validateSuccessorProof(p.successor,q);}else if(q.contractVersion!==1)throw fail('reauthorization-proof-invalid');
 return p;
}
export function validateReauthorizationPublication(r){
 const f=r.publication,p=f?.pointer,q=f?.request,e=f?.evidence;
 if(!exact(r,['generation','operationId','schemaVersion','kind','fingerprint','action','policy','targetKeys','origin','publication'])||r.kind!==REAUTHORIZATION_PUBLICATION||r.schemaVersion!==1||r.action!=='publishReauthorized'||r.policy!=='control:reauthorize'||r.origin!=='v2'||!equal(r.targetKeys,[])||
 !exact(f,['schemaVersion','pointer','identity','request','evidence'])||f.schemaVersion!==1||!exact(q,['generation','migrationId','operationId','expectedPointerEpoch','expectedControlEpoch'])||
 !exact(e,['kind','sealHash','binary','sync','fence','reauthorization','readonlyFence'])||e.kind!=='isolated-reauthorization')throw fail('reauthorization-fact-invalid');
 validatePointer(p);validateReauthorizationProof(e.reauthorization);const a=e.reauthorization.request,k=e.reauthorization.qualification;
 if(p.publication.kind!==e.kind||p.activeGeneration!==r.generation||q.generation!==r.generation||a.targetGeneration!==r.generation||q.operationId!==r.operationId||a.operationId!==r.operationId||p.operationId!==r.operationId||q.migrationId!==p.migrationId||
 q.expectedPointerEpoch!==a.expectedPointerEpoch||p.pointerEpoch!==q.expectedPointerEpoch+1||p.previousGeneration!==a.sourceGeneration||p.publication.controlEpoch!==q.expectedControlEpoch+1||e.sealHash!==p.publication.sealHash||
 !equal(f.identity,e.reauthorization.sourceControl.identity)||!hash(e.binary?.manifestDigest)||e.binary.assetCount!==0||!hash(e.sync?.checkpointDigest)||e.sync.outboxPending!==0||e.sync.cloudConnected!==false||e.sync.scope!=='local-known-empty-fixture'||e.fence!==null||
 !exact(e.readonlyFence,['purpose','requestDigest','datasetId','appDeviceId','writeEpoch','exclusive','cloudConnected'])||e.readonlyFence.purpose!=='owner-qualification-only-v1'||e.readonlyFence.requestDigest!==e.reauthorization.requestDigest||e.readonlyFence.datasetId!==k.datasetId||e.readonlyFence.appDeviceId!==k.appDeviceId||e.readonlyFence.writeEpoch!==k.writeEpoch||e.readonlyFence.exclusive!==false||e.readonlyFence.cloudConnected!==false||
 r.fingerprint!==digest({kind:REAUTHORIZATION_PUBLICATION,...q,evidence:e}))throw fail('reauthorization-fact-invalid');
}
