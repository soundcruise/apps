// Dedicated short-lived recovery proof, never a replacement Account credential.
import {accountCredentialVerifier,parseAccountCredential} from './account-crypto.js';
import {verifyAccountCredentialSnapshot} from './account-auth.js';
import {timingSafeHexEqual} from './crypto.js';
import {observeOwnerClock,SQL_OWNER_TIME as T} from './account-owner-clock.js';
import {policyAllows} from './writer-fence.js';
import {CREDENTIAL_OWNER_SELECT,exactRequestDigest,ownerBindingSQL} from './account-credential-lifecycle.js';
const enc=new TextEncoder(),fail=()=>{throw Error('renewal-recovery-unproven');};
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function bytes(text){if(typeof text!=='string'||!/^[A-Za-z0-9_-]+$/.test(text))fail();const b=Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4)),c=>c.charCodeAt(0));if(b64(b)!==text)fail();return b;}
export const createRenewalRecoverySecret=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
export async function renewalRecoveryCommitment(secret){if(bytes(secret).length!==32)fail();return exactRequestDigest({purpose:'renewal-recovery-key-v1',secret});}
export async function renewalDigest(request,identity,commitment){return exactRequestDigest({action:'finish-renew',request,accountId:identity.accountId,deviceId:identity.accountDeviceId,membershipId:identity.membershipId,recoveryCommitment:commitment});}
async function key(secret,aad){const raw=await crypto.subtle.importKey('raw',bytes(secret),'HKDF',false,['deriveKey']);return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:enc.encode('sound-cruise-renew-recovery-v1'),info:enc.encode(aad)},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function sealRenewalCredential(secret,credential,binding){const aad=JSON.stringify(binding),iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(aad)},await key(secret,aad),enc.encode(credential));return {iv:b64(iv),ciphertext:b64(new Uint8Array(cipher))};}
async function open(secret,sealed,binding){const iv=bytes(sealed.iv);if(iv.length!==12||bytes(sealed.ciphertext).length>512)fail();const aad=JSON.stringify(binding);return new TextDecoder('utf-8',{fatal:true}).decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:enc.encode(aad)},await key(secret,aad),bytes(sealed.ciphertext)));}
export async function recoverRenewalCredential({db,pepper,policy,request,authorization,secret,checkpoint=async()=>{}}){
 if(!request||Object.keys(request).length!==2||typeof request.operationId!=='string'||!/^[a-f0-9]{64}$/.test(request.requestDigest))fail();
 const token=authorization?.startsWith('Bearer ')?authorization.slice(7):null,id=parseAccountCredential(token)?.deviceId;if(!id)fail();
 let row=await db.withSession('first-primary').prepare(CREDENTIAL_OWNER_SELECT).bind(id).first();if(!row||!policyAllows(policy,row.account_id))fail();
 if(!['credential_version','credential_lease_revision','credential_issued_at','credential_expires_at','credential_recovery_until','credential_clock_floor','owner_now'].every(k=>Number.isSafeInteger(row[k])&&row[k]>0)||row.credential_expires_at<=row.credential_issued_at||row.credential_recovery_until>row.credential_expires_at)fail();
 let record;try{record=JSON.parse(row.credential_recovery_json);}catch{fail();}
 const b=record?.binding;
 if(record?.schemaVersion!==1||b?.purpose!=='credential-renewal-recovery-v1'||b.operationId!==request.operationId||b.requestDigest!==request.requestDigest||
  b.accountId!==row.account_id||b.accountDeviceId!==id||b.membershipId!==row.membership_id||b.accountGeneration!==row.generation||b.membershipGeneration!==row.membership_generation||b.runtimeGeneration!==row.runtime_generation||
  b.newVersion!==row.credential_version||b.newLease!==row.credential_lease_revision||b.newVerifier!==row.credential_verifier||
  !['oldVersion','oldLease','newVersion','newLease'].every(k=>Number.isSafeInteger(b[k])&&b[k]>0)||b.newVersion!==b.oldVersion+1||b.newLease!==b.oldLease+1||
  !timingSafeHexEqual(await renewalRecoveryCommitment(secret),b.recoveryCommitment)||
  !(await verifyAccountCredentialSnapshot({...row,credential_verifier:b.oldVerifier},token,pepper))?.row)fail();
 const ledger=JSON.parse(row.credential_operations_json||'null');if(ledger?.[b.operationId]?.digest!==b.requestDigest||ledger[b.operationId].action!=='finish-renew'||ledger[b.operationId].previousVersion!==b.oldVersion||ledger[b.operationId].previousLease!==b.oldLease)fail();
 await observeOwnerClock(db.withSession('first-primary'),row);
 const proofText=row.credential_recovery_json;
 const predicate=`EXISTS(SELECT 1 FROM (${CREDENTIAL_OWNER_SELECT}) o WHERE o.account_id=? AND o.credential_version=? AND o.credential_verifier=? AND o.credential_lease_revision=? AND o.credential_recovery_json=?
  AND o.generation=? AND o.membership_generation=? AND o.runtime_generation=? AND o.credential_lifecycle_enabled=1 AND o.account_history_enabled=1 AND o.account_state='active' AND o.admission_provenance='production'
  AND o.membership_state='active' AND o.membership_deleted_at IS NULL AND o.device_linked=1 AND o.revoked_at IS NULL AND ${ownerBindingSQL('o')}
  AND typeof(o.credential_clock_floor)='integer' AND o.credential_clock_floor>0 AND o.owner_now>=o.credential_clock_floor
  AND o.credential_lifecycle IN ('active','renewing','expired') AND typeof(o.credential_issued_at)='integer' AND o.credential_issued_at>0 AND o.credential_issued_at<=o.owner_now
  AND typeof(o.credential_expires_at)='integer' AND o.credential_expires_at>o.credential_issued_at
  AND typeof(o.credential_recovery_until)='integer' AND o.credential_recovery_until>0 AND o.credential_recovery_until<=o.credential_expires_at)`;
 const values=[id,b.accountId,b.newVersion,b.newVerifier,b.newLease,proofText,b.accountGeneration,b.membershipGeneration,b.runtimeGeneration];
 async function authorized(){
  const out=await db.withSession('first-primary').prepare(`UPDATE sync_account_devices SET credential_clock_floor=MAX(credential_clock_floor,${T}),
   credential_lifecycle=CASE WHEN credential_lifecycle IN ('active','renewing') AND credential_expires_at<=${T} THEN 'expired' ELSE credential_lifecycle END
   WHERE id=? AND ${predicate} RETURNING CASE WHEN credential_lifecycle='active' AND ${T}<credential_expires_at AND ${T}<credential_recovery_until THEN credential_recovery_json ELSE NULL END AS recovery_json`).bind(id,...values).all();
  if(out?.success!==true||out.results?.length!==1||out.results[0].recovery_json!==proofText)fail();
 }
 await checkpoint('before-renewal-recovery-read');await authorized();const credential=await open(secret,record.sealed,b);
 if(parseAccountCredential(credential)?.deviceId!==id||!timingSafeHexEqual(await accountCredentialVerifier(credential,pepper),b.newVerifier))fail();
 await checkpoint('after-renewal-recovery-decrypt');await authorized();
 return {ok:true,historical:true,credential,receipt:{purpose:'credential-renewal-result-v1',operationId:b.operationId,requestDigest:b.requestDigest,accountId:b.accountId,accountDeviceId:id,credentialVersion:b.newVersion,credentialLeaseRevision:b.newLease},canWrite:false,operationAuthorized:false,productionReady:false};
}
