// Owner-only bounded renewal lineage. Verifiers never leave history authorization.
import {exactRequestDigest} from './account-credential-lifecycle.js';
import {renewalDigest} from './account-renewal-recovery.js';
const bad=()=>{throw Error('successor-lineage-unproven');};
const keys=['purpose','accountId','accountDeviceId','membershipId','operationId','requestDigest','accountGeneration','membershipGeneration','runtimeGeneration','oldVersion','oldLease','oldVerifier','newVersion','newLease','newVerifier','recoveryCommitment'];
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),positive=x=>Number.isSafeInteger(x)&&x>0;
export async function validateRenewalLink(b,beginId,ledger){
 if(!b||Object.keys(b).length!==keys.length||!keys.every(k=>Object.hasOwn(b,k))||b.purpose!=='credential-renewal-recovery-v1'||!['oldVersion','oldLease','newVersion','newLease','accountGeneration','membershipGeneration','runtimeGeneration'].every(k=>positive(b[k]))||b.oldLease<2||b.newVersion!==b.oldVersion+1||b.newLease!==b.oldLease+1||!['oldVerifier','newVerifier','requestDigest','recoveryCommitment'].every(k=>hash(b[k]))||b.oldVerifier===b.newVerifier)bad();
 const begin={contractVersion:1,operationId:beginId,expectedCredentialVersion:b.oldVersion,expectedLeaseRevision:b.oldLease-1,expectedAccountGeneration:b.accountGeneration,expectedMembershipGeneration:b.membershipGeneration,expectedRuntimeGeneration:b.runtimeGeneration},finish={...begin,operationId:b.operationId,expectedLeaseRevision:b.oldLease,transitionId:beginId};
 const a=ledger?.[beginId],z=ledger?.[b.operationId];
 if(a?.action!=='begin-renew'||a.previousVersion!==b.oldVersion||a.previousLease!==b.oldLease-1||a.digest!==await exactRequestDigest({action:'begin-renew',request:begin,accountId:b.accountId,deviceId:b.accountDeviceId,membershipId:b.membershipId})||z?.action!=='finish-renew'||z.previousVersion!==b.oldVersion||z.previousLease!==b.oldLease||z.digest!==b.requestDigest||b.requestDigest!==await renewalDigest(finish,{accountId:b.accountId,accountDeviceId:b.accountDeviceId,membershipId:b.membershipId},b.recoveryCommitment))bad();
 return b;
}
export async function currentRenewalLink(row){
 let packet,ledger;try{packet=JSON.parse(row.credential_recovery_json);ledger=JSON.parse(row.credential_operations_json);}catch{bad();}
 if(packet?.schemaVersion!==1)bad();const b=await validateRenewalLink(packet.binding,row.credential_transition_id,ledger);
 if(b.accountId!==row.account_id||b.accountDeviceId!==row.device_id||b.membershipId!==row.membership_id||b.accountGeneration!==row.generation||b.membershipGeneration!==row.membership_generation||b.runtimeGeneration!==row.runtime_generation||b.newVerifier!==row.credential_verifier||b.newVersion!==row.credential_version||b.newLease!==row.credential_lease_revision)bad();return {b,ledger};
}
export async function predecessorVerifier(row,q,archive=null){
 const {b,ledger}=await currentRenewalLink(row);
 if(['accountId','accountDeviceId','membershipId','accountGeneration','membershipGeneration','runtimeGeneration'].some(k=>b[k]!==q[k]))bad();
 if(q.credentialVersion===b.oldVersion&&q.credentialLeaseRevision===b.oldLease-1)return b.oldVerifier;
 const a=archive?.binding;if(!a||archive.nextBeginOperationId!==row.credential_transition_id)bad();await validateRenewalLink(a,archive.beginOperationId,ledger);
 if(['accountId','accountDeviceId','membershipId','accountGeneration','membershipGeneration','runtimeGeneration'].some(k=>a[k]!==b[k])||a.newVerifier!==b.oldVerifier||a.newVersion!==b.oldVersion||a.newLease!==b.oldLease-1||q.credentialVersion!==a.oldVersion||q.credentialLeaseRevision!==a.oldLease-1)bad();return a.oldVerifier;
}
