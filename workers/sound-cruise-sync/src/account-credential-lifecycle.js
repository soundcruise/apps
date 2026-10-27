// Unrouted owner capability. Columns/gates are installed by fixtures only.
import {verifyAccountCredentialSnapshot} from './account-auth.js';
import {createAccountCredential,parseAccountCredential,accountCredentialVerifier} from './account-crypto.js';
import {canonicalJson} from './records.js';
import {assertion,clearAssertions,policyAllows} from './writer-fence.js';
export const OWNER_SQL_TIME="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
export const ownerBindingSQL=alias=>`${alias}.credential_account_generation=${alias}.generation
 AND ${alias}.credential_membership_id=${alias}.membership_id AND ${alias}.credential_membership_generation=${alias}.membership_generation`;
const positive=x=>Number.isSafeInteger(x)&&x>0,uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x);
const fail=code=>Object.assign(Error(code),{code}),closed=v=>Object.freeze({canWrite:false,operationAuthorized:false,productionReady:false,...v});
export async function exactRequestDigest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export const CREDENTIAL_OWNER_SELECT=`SELECT d.*,d.id AS device_id,a.state AS account_state,a.generation,a.admission_provenance,
 m.id AS membership_id,m.state AS membership_state,m.generation AS membership_generation,m.deleted_at AS membership_deleted_at,
 m.sync_user_id,m.write_epoch,c.generation AS runtime_generation,c.credential_lifecycle_enabled,c.account_history_enabled,
 ${OWNER_SQL_TIME} AS owner_now,
 EXISTS(SELECT 1 FROM sync_membership_device_links l JOIN sync_devices p ON p.id=l.app_device_id
 WHERE l.account_id=a.id AND l.membership_id=m.id AND l.account_device_id=d.id AND p.user_id=m.sync_user_id AND p.app_id='port' AND p.revoked_at IS NULL) AS device_linked
 FROM sync_account_devices d JOIN sync_accounts a ON a.id=d.account_id
 LEFT JOIN sync_account_memberships m ON m.account_id=a.id AND m.app_id='port'
 LEFT JOIN sync_account_runtime_control c ON c.singleton_id=1 WHERE d.id=?`;
export function createIsolatedCredentialLifecycle({db,pepper,policy,fixtureOnly=false,leaseTtlMs=60000,checkpoint=async()=>{}}={}){
 if(fixtureOnly!==true||typeof db?.withSession!=='function'||typeof pepper!=='string'||pepper.length<32||!positive(leaseTtlMs)||leaseTtlMs>3600000)throw fail('credential-isolation-required');
 let disposed=false;
 async function authenticated(authorization){
  if(disposed)throw fail('credential-disposed');const token=typeof authorization==='string'&&authorization.startsWith('Bearer ')?authorization.slice(7):null;
  const id=parseAccountCredential(token)?.deviceId;if(!id)throw fail('credential-unauthorized');
  const row=await db.withSession('first-primary').prepare(CREDENTIAL_OWNER_SELECT).bind(id).first();
  if(!(await verifyAccountCredentialSnapshot(row,token,pepper))?.row||!policyAllows(policy,row.account_id))throw fail('credential-unauthorized');
  return {row,token};
 }
 function request(input,action){
  const keys=['contractVersion','operationId','expectedCredentialVersion','expectedLeaseRevision','expectedAccountGeneration','expectedMembershipGeneration','expectedRuntimeGeneration',...(action==='finish-renew'||action==='fail-renew'?['transitionId']:[])];
  if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.getOwnPropertySymbols(input).length||Object.keys(input).length!==keys.length||
   !keys.every(k=>Object.hasOwn(input,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(input,k),'value'))||input.contractVersion!==1||!uuid(input.operationId)||
   !['expectedCredentialVersion','expectedAccountGeneration','expectedMembershipGeneration','expectedRuntimeGeneration'].every(k=>positive(input[k]))||
   !Number.isSafeInteger(input.expectedLeaseRevision)||input.expectedLeaseRevision<0||keys.includes('transitionId')&&!uuid(input.transitionId))throw fail('credential-request-invalid');
  return {...input};
 }
 function validOwner(row,q){return row&&row.account_state==='active'&&row.revoked_at===null&&row.admission_provenance==='production'&&row.membership_state==='active'&&row.membership_deleted_at===null&&row.device_linked===1&&row.credential_lifecycle_enabled===1&&
  positive(row.owner_now)&&row.generation===q.expectedAccountGeneration&&row.membership_generation===q.expectedMembershipGeneration&&row.runtime_generation===q.expectedRuntimeGeneration&&row.credential_version===q.expectedCredentialVersion&&
  positive(row.credential_clock_floor)&&row.owner_now>=row.credential_clock_floor;}
 const bound=row=>row.credential_account_generation===row.generation&&row.credential_membership_id===row.membership_id&&row.credential_membership_generation===row.membership_generation;
 const unissued=row=>['credential_issued_at','credential_expires_at','credential_lease_revision','credential_account_generation','credential_membership_id','credential_membership_generation','credential_operations_json','credential_transition_id'].every(k=>row[k]===null)&&row.credential_lifecycle===null;
 const liveLease=row=>bound(row)&&positive(row.credential_issued_at)&&positive(row.credential_expires_at)&&row.credential_issued_at<=row.owner_now&&row.owner_now<row.credential_expires_at&&row.credential_expires_at>row.credential_issued_at;
 async function clockFact(row,allowUnissued=false){
  const result=await db.withSession('first-primary').prepare(`UPDATE sync_account_devices SET credential_clock_floor=CASE WHEN credential_clock_floor IS NULL THEN ${OWNER_SQL_TIME} ELSE MAX(credential_clock_floor,${OWNER_SQL_TIME}) END,
   credential_lifecycle=CASE WHEN credential_lifecycle IN ('active','renewing') AND typeof(credential_expires_at)='integer' AND credential_expires_at<=${OWNER_SQL_TIME} THEN 'expired' ELSE credential_lifecycle END
   WHERE id=? AND account_id=? AND credential_version=? AND credential_verifier=? AND
   ((typeof(credential_clock_floor)='integer' AND credential_clock_floor>0) ${allowUnissued?"OR (credential_clock_floor IS NULL AND credential_lifecycle IS NULL AND credential_issued_at IS NULL AND credential_expires_at IS NULL AND credential_lease_revision IS NULL AND credential_account_generation IS NULL AND credential_membership_id IS NULL AND credential_membership_generation IS NULL AND credential_operations_json IS NULL AND credential_transition_id IS NULL)":''})`).bind(row.device_id,row.account_id,row.credential_version,row.credential_verifier).run();
  if(result?.success!==true||Number(result.meta?.changes)!==1)throw fail('credential-clock-unproven');
 }
 async function mutate(action,input,authorization){
  const q=request(input,action),first=await authenticated(authorization),bootstrap=action==='issue'&&unissued(first.row);
  if(!positive(first.row.credential_clock_floor)&&!(bootstrap&&first.row.credential_clock_floor===null))throw fail('credential-clock-unknown');
  if(action==='issue'&&!bootstrap)throw fail('credential-enrollment-conflict');
  if(action!=='issue'&&(!positive(first.row.credential_lease_revision)||!positive(q.expectedLeaseRevision)))throw fail('credential-lease-unknown');
  await clockFact(first.row,bootstrap);const {row}=await authenticated(authorization);
  if(!validOwner(row,q))throw fail('credential-owner-stale');
  const unenrolled=unissued(row);
  if(action==='issue'&&(!unenrolled||q.expectedLeaseRevision!==0))throw fail('credential-enrollment-conflict');
  if(action!=='issue'&&(!bound(row)||row.credential_lease_revision!==q.expectedLeaseRevision))throw fail('credential-lease-stale');
  if(action==='begin-renew'&&(row.credential_lifecycle!=='active'||!liveLease(row)))throw fail('credential-renew-unavailable');
  if(['finish-renew','fail-renew'].includes(action)&&(row.credential_lifecycle!=='renewing'||row.credential_transition_id!==q.transitionId||!liveLease(row)))throw fail('credential-renew-unavailable');
  if(action==='revoke'&&['revoked','unknown'].includes(row.credential_lifecycle))throw fail('credential-revoke-unavailable');
  const digest=await exactRequestDigest({action,request:q,accountId:row.account_id,deviceId:row.device_id,membershipId:row.membership_id});
  let ledger=Object.create(null);if(!unenrolled){try{ledger=JSON.parse(row.credential_operations_json);}catch{throw fail('credential-ledger-unknown');}
   if(!ledger||Array.isArray(ledger)||Object.getPrototypeOf(ledger)!==Object.prototype||Object.keys(ledger).some(k=>!uuid(k)))throw fail('credential-ledger-unknown');}
  if(Object.values(ledger).some(v=>!v||Object.keys(v).length!==4||!['issue','begin-renew','finish-renew','fail-renew','revoke'].includes(v.action)||typeof v.digest!=='string'||!/^[a-f0-9]{64}$/.test(v.digest)||!positive(v.previousVersion)||v.previousLease!==null&&!positive(v.previousLease)))throw fail('credential-ledger-unknown');
  if(Object.hasOwn(ledger,q.operationId))throw fail('credential-operation-replay');if(Object.keys(ledger).length>=64&&action!=='revoke')throw fail('credential-ledger-capacity');
  ledger[q.operationId]={action,digest,previousVersion:row.credential_version,previousLease:row.credential_lease_revision};
  const issue=action==='issue'||action==='finish-renew';let material,verifier=row.credential_verifier;
  if(issue){material=createAccountCredential({randomUUID:()=>row.device_id,getRandomValues:crypto.getRandomValues.bind(crypto)});verifier=await accountCredentialVerifier(material.credential,pepper);}
  const version=row.credential_version+(issue?1:0),lease=(row.credential_lease_revision||0)+1,state=issue?'active':action==='begin-renew'?'renewing':action==='fail-renew'?'renewal-failed':'revoked';
  if(!positive(version)||!positive(lease)||!positive(row.owner_now+leaseTtlMs))throw fail('credential-counter-exhausted');
  const session=db.withSession('first-primary'),owner=`EXISTS(SELECT 1 FROM (${CREDENTIAL_OWNER_SELECT}) o WHERE o.account_id=? AND o.credential_verifier=? AND o.credential_version=? AND o.generation=? AND o.membership_generation=? AND o.runtime_generation=?
   AND o.credential_lifecycle_enabled=1 AND o.account_state='active' AND o.membership_state='active' AND o.membership_deleted_at IS NULL AND o.device_linked=1 AND o.revoked_at IS NULL AND o.admission_provenance='production'
   AND o.owner_now>=o.credential_clock_floor AND o.credential_clock_floor>0)`;
  const values=[row.device_id,row.account_id,row.credential_verifier,row.credential_version,row.generation,row.membership_generation,row.runtime_generation];
  const statePin=`credential_verifier=? AND credential_version=? AND credential_lease_revision IS ? AND credential_lifecycle IS ? AND credential_operations_json IS ? AND credential_transition_id IS ?`;
  const pins=[row.credential_verifier,row.credential_version,row.credential_lease_revision,row.credential_lifecycle,row.credential_operations_json,row.credential_transition_id];
  const expiry=['begin-renew','finish-renew','fail-renew'].includes(action)?` AND ${OWNER_SQL_TIME}<credential_expires_at AND ${OWNER_SQL_TIME}>=credential_issued_at`:'';
  const update=session.prepare(`UPDATE sync_account_devices SET credential_version=?,credential_verifier=?,credential_lease_revision=?,credential_lifecycle=?,
   credential_issued_at=${issue?OWNER_SQL_TIME:'credential_issued_at'},credential_expires_at=${issue?OWNER_SQL_TIME+'+?':'credential_expires_at'},
   credential_clock_floor=${OWNER_SQL_TIME},credential_account_generation=?,credential_membership_id=?,credential_membership_generation=?,
   credential_transition_id=?,credential_operations_json=?,revoked_at=${action==='revoke'?OWNER_SQL_TIME:'revoked_at'}
   WHERE id=? AND ${statePin}${expiry} AND ${owner}`)
   .bind(version,verifier,lease,state,...(issue?[leaseTtlMs]:[]),row.generation,row.membership_id,row.membership_generation,action==='begin-renew'?q.operationId:row.credential_transition_id,JSON.stringify(ledger),row.device_id,...pins,...values);
  const after=`EXISTS(SELECT 1 FROM (${CREDENTIAL_OWNER_SELECT}) o WHERE o.account_id=? AND o.credential_version=? AND o.credential_verifier=? AND o.credential_lease_revision=? AND o.credential_lifecycle=? AND o.credential_operations_json=?
   AND o.generation=? AND o.membership_generation=? AND o.runtime_generation=? AND o.credential_lifecycle_enabled=1 AND o.account_state='active' AND o.membership_state='active' AND o.membership_deleted_at IS NULL AND o.device_linked=1
   AND ${ownerBindingSQL('o')} AND o.owner_now>=o.credential_clock_floor ${state==='active'?"AND o.revoked_at IS NULL AND o.owner_now<o.credential_expires_at":''})`;
  await checkpoint('before-lifecycle-transaction',{action,accountId:row.account_id});
  try{const results=await session.batch([assertion(session,owner,values),update,assertion(session,after,[row.device_id,row.account_id,version,verifier,lease,state,JSON.stringify(ledger),row.generation,row.membership_generation,row.runtime_generation]),clearAssertions(session)]);
   if(!Array.isArray(results)||results.length!==4||results.some(r=>r?.success!==true))throw fail('credential-transaction-unproven');}
  catch(e){await clockFact(row);throw e;}
  await checkpoint('after-lifecycle-transaction',{action,accountId:row.account_id});
  const actual=await db.withSession('first-primary').prepare(`SELECT credential_issued_at,credential_expires_at FROM sync_account_devices
   WHERE id=? AND account_id=? AND credential_version=? AND credential_verifier=? AND credential_lease_revision=? AND credential_lifecycle=? AND credential_operations_json=?
   ${issue?`AND revoked_at IS NULL AND ${OWNER_SQL_TIME}<credential_expires_at`:''}`).bind(row.device_id,row.account_id,version,verifier,lease,state,JSON.stringify(ledger)).first();
  if(!actual)throw fail('credential-readback-unproven');
  // Secret is returned once, after the successful atomic owner transition.
  return closed({ok:true,historical:true,state,accountId:row.account_id,accountDeviceId:row.device_id,credentialVersion:version,credentialLeaseRevision:lease,credentialIssuedAt:actual.credential_issued_at,credentialExpiresAt:actual.credential_expires_at,transitionId:action==='begin-renew'?q.operationId:row.credential_transition_id,...(issue?{credential:material.credential}:{})});
 }
 return Object.freeze({fixtureOnly:true,async mutate(action,input,{authorization}={}){try{if(!['issue','begin-renew','finish-renew','fail-renew','revoke'].includes(action))throw fail('credential-action-invalid');return await mutate(action,input,authorization);}catch(e){return closed({ok:false,reason:e.code||'credential-outcome-unproven',recoveryRequired:true});}},dispose(){disposed=true;}});
}
