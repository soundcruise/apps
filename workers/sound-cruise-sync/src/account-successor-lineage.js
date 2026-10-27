// Owner-internal use only. A stored renewal lineage may authenticate OLD history,
// never an issued/current lease. No verifier or credential leaves this module.
import {exactRequestDigest} from './account-credential-lifecycle.js';
import {renewalDigest} from './account-renewal-recovery.js';
const fail=()=>{throw Error('successor-lineage-unproven');};
export async function predecessorVerifier(row,q){
 let packet,ledger;try{packet=JSON.parse(row.credential_recovery_json);ledger=JSON.parse(row.credential_operations_json);}catch{fail();}const b=packet?.binding;
 if(packet?.schemaVersion!==1||b?.purpose!=='credential-renewal-recovery-v1'||!b||b.accountId!==q.accountId||b.accountDeviceId!==q.accountDeviceId||b.membershipId!==q.membershipId||b.accountGeneration!==q.accountGeneration||b.membershipGeneration!==q.membershipGeneration||b.runtimeGeneration!==q.runtimeGeneration||b.newVerifier!==row.credential_verifier||b.newVersion!==row.credential_version||b.newLease!==row.credential_lease_revision||b.newVersion!==b.oldVersion+1||b.newLease!==b.oldLease+1||q.credentialVersion!==b.oldVersion||q.credentialLeaseRevision!==b.oldLease-1||!Number.isSafeInteger(b.oldLease)||b.oldLease<2||typeof b.oldVerifier!=='string'||!b.oldVerifier||b.oldVerifier===b.newVerifier)fail();
 const begin={contractVersion:1,operationId:row.credential_transition_id,expectedCredentialVersion:b.oldVersion,expectedLeaseRevision:b.oldLease-1,expectedAccountGeneration:b.accountGeneration,expectedMembershipGeneration:b.membershipGeneration,expectedRuntimeGeneration:b.runtimeGeneration},finish={...begin,operationId:b.operationId,expectedLeaseRevision:b.oldLease,transitionId:begin.operationId};
 const a=ledger?.[begin.operationId],z=ledger?.[finish.operationId];
 if(a?.action!=='begin-renew'||a.previousVersion!==b.oldVersion||a.previousLease!==b.oldLease-1||a.digest!==await exactRequestDigest({action:'begin-renew',request:begin,accountId:b.accountId,deviceId:b.accountDeviceId,membershipId:b.membershipId})||z?.action!=='finish-renew'||z.previousVersion!==b.oldVersion||z.previousLease!==b.oldLease||z.digest!==b.requestDigest||b.requestDigest!==await renewalDigest(finish,{accountId:b.accountId,accountDeviceId:b.accountDeviceId,membershipId:b.membershipId},b.recoveryCommitment))fail();
 return b.oldVerifier;
}
