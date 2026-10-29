// A dependency-only disposable capability. Production index.js never constructs it.
import {inspectOwnerSchemaCandidate} from './account-owner-schema-candidate.js';
import {createIsolatedAccountSaveRoutes} from './account-save-routes-isolated.js';
import {parseAccountCredential} from './account-crypto.js';
import {CREDENTIAL_OWNER_SELECT} from './account-credential-lifecycle.js';
import {parseDeviceCredential,hmacVerifier} from './crypto.js';
import {inspectProCredentialReadOnly} from './pro-auth-app.js';
import {admitWriter} from './writer-admission.js';
import {policyAllows,fenceQuery,assertion,clearAssertions} from './writer-fence.js';
export const OWNER_CANDIDATE_ROOT='/v2/accounts/owner-candidate/v1/';
const caps=new WeakMap(),positive=n=>Number.isSafeInteger(n)&&n>0;
const paths=new Set(['credential/issue','credential/renew/begin','credential/renew/finish','credential/renew/fail','credential/revoke','credential/renew/reconcile','reconcile','authority/reauthorize','operation/lease','operation/save','operation/reconcile','operation/current','operation/history','successor/stop','successor/inspect','successor/confirm','successor/reconcile','cutover/stop','cutover/inspect','cutover/qualify','cutover/confirm','cutover/reconcile']);
const allowedHeaders=['content-type','authorization','x-sound-cruise-app-authorization','x-sound-cruise-pro-authorization','x-sound-cruise-renewal-recovery','x-sound-cruise-renewal-digest'];
function reply(status,code,origin){return Response.json({ok:false,code,canWrite:false,operationAuthorized:false,productionReady:false},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(origin?{'Access-Control-Allow-Origin':origin,Vary:'Origin'}:{})}});}
export function createDisposableOwnerRouteCapability(options={}){
 if(options.fixtureOnly!==true||typeof options.db?.withSession!=='function'||!policyAllows(options.policy,options.accountId)||!positive(options.credentialTtlMs)||options.credentialTtlMs>3600000||!positive(options.recoveryTtlMs)||options.recoveryTtlMs>options.credentialTtlMs||!positive(options.operationLeaseTtlMs)||options.operationLeaseTtlMs>10000)throw Error('owner-route-capability-invalid');
 const cap=Object.freeze({});caps.set(cap,Object.freeze({...options}));return cap;
}
// Wrap each mutation in the EXISTING database, not a second repository. The
// same batch rechecks marker/runtime/identity + app/Pro/writer fence at both ends.
function mutationBoundary(db,scope){
 const statements=new WeakMap();
 const create=session=>{
  const gate=`EXISTS(SELECT 1 FROM sync_owner_route_candidate g JOIN sync_account_runtime_control c ON c.singleton_id=1
   JOIN sync_account_devices d ON d.id=? JOIN sync_accounts a ON a.id=d.account_id
   JOIN sync_account_memberships m ON m.account_id=a.id AND m.id=?
   WHERE g.singleton_id=1 AND g.schema_version=1 AND g.enabled=1 AND g.mode='disposable' AND g.epoch=?
   AND c.generation=? AND c.credential_lifecycle_enabled=1 AND c.account_save_enabled=1 AND c.account_history_enabled=1
   AND c.account_read_enabled=1 AND c.rollout_mode IN ('cohort','open')
   AND a.id=? AND a.generation=? AND a.state='active' AND a.admission_provenance='production'
   AND m.generation=? AND m.state='active' AND m.deleted_at IS NULL
   AND EXISTS(SELECT 1 FROM sync_membership_device_links l WHERE l.account_id=a.id AND l.membership_id=m.id AND l.account_device_id=d.id AND l.app_device_id=?))`;
  const values=[scope.deviceId,scope.membershipId,scope.epoch,scope.runtime,scope.accountId,scope.accountGeneration,scope.membershipGeneration,scope.appDeviceId];
  const fq=fenceQuery(scope.admission),predicate=gate+` AND EXISTS(SELECT 1 FROM (${fq.sql}) f WHERE f.code='ok')`;
  const wrap=(stmt,sql)=>{
   const out={bind(...v){return wrap(stmt.bind(...v),sql);},async run(){return (await batch([out]))[0];},async all(){return /^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql)?stmt.all():(await batch([out]))[0];},async first(){if(/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql))return stmt.first();return (await out.all()).results?.[0]||null;}};
   statements.set(out,stmt);return out;
  };
  async function batch(list){
   const native=list.map(s=>{const n=statements.get(s);if(!n)throw Error('owner-statement-unproven');return n;});
   const results=await session.batch([assertion(session,predicate,[...values,...fq.values]),...native,assertion(session,predicate,[...values,...fq.values]),clearAssertions(session)]);
   if(!Array.isArray(results)||results.some(r=>r?.success!==true))throw Error('owner-boundary-unproven');return results.slice(1,-2);
  }
  return {prepare(sql){return wrap(session.prepare(sql),sql);},batch,withSession(){return create(db.withSession('first-primary'));}};
 };
 return create(db.withSession('first-primary'));
}
export async function handleOwnerRouteCandidate(request,env={},capability){
 // No flags, URL, JSON, or env bindings can brand a capability.
 const o=caps.get(capability),url=new URL(request.url),path=url.pathname.slice(OWNER_CANDIDATE_ROOT.length);
 if(!o||env.SYNC_OWNER_ROUTE_CANDIDATE!=='disposable-v1'||env.SYNC_OWNER_SCHEMA_CANDIDATE!=='1')return reply(404,'not_found');
 if(!url.pathname.startsWith(OWNER_CANDIDATE_ROOT)||!paths.has(path)||url.search||url.hash)return reply(404,'not_found');
 const origin=request.headers.get('Origin'),origins=String(env.ACCOUNT_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim());
 if(!origin||!origins.includes(origin))return reply(403,'invalid_origin');
 if(request.method==='OPTIONS'){
  const hs=(request.headers.get('Access-Control-Request-Headers')||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(request.headers.get('Access-Control-Request-Method')!=='POST'||hs.some(h=>!allowedHeaders.includes(h)))return reply(403,'invalid_origin',origin);
  return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':allowedHeaders.join(',')}});
 }
 if(request.method!=='POST')return reply(405,'method_not_allowed',origin);
 if(env.SYNC_DB!==o.db||!['SYNC_ACCOUNT_CREDENTIAL_PEPPER','SYNC_CREDENTIAL_PEPPER','PRO_CREDENTIAL_PEPPER'].every(k=>typeof env[k]==='string'&&env[k].length>=32)||typeof env.SYNC_RATE_LIMITER?.limit!=='function')return reply(503,'owner_candidate_unavailable',origin);
 let routes;
 try{
  const limited=await env.SYNC_RATE_LIMITER.limit({key:'owner-candidate:'+String(request.headers.get('CF-Connecting-IP')||'unknown')});
  if(limited?.success!==true)return reply(429,'rate_limited',origin);
  const gate=await inspectOwnerSchemaCandidate(o.db,{enabled:true,details:true});if(!gate)return reply(503,'owner_schema_unproven',origin);
  const accountToken=request.headers.get('Authorization')?.slice(7),deviceId=parseAccountCredential(accountToken)?.deviceId;
  const appToken=request.headers.get('X-Sound-Cruise-App-Authorization')?.replace(/^Bearer /,''),appDeviceId=parseDeviceCredential(appToken)?.deviceId;
  if(!request.headers.get('Authorization')?.startsWith('Bearer ')||!deviceId||!appDeviceId)return reply(401,'invalid_credential',origin);
  const db=o.db.withSession('first-primary'),row=await db.prepare(CREDENTIAL_OWNER_SELECT).bind(deviceId).first();
  if(!row||row.account_id!==o.accountId||!policyAllows(o.policy,row.account_id)||!positive(row.generation)||!positive(row.membership_generation)||!positive(row.runtime_generation)||row.account_state!=='active'||row.admission_provenance!=='production'||row.membership_state!=='active'||row.membership_deleted_at!==null||row.revoked_at!==null||row.device_linked!==1||row.credential_lifecycle_enabled!==1||row.account_history_enabled!==1)return reply(409,'owner_identity_unproven',origin);
  const link=await db.prepare('SELECT 1 valid FROM sync_membership_device_links WHERE account_id=? AND membership_id=? AND account_device_id=? AND app_device_id=?').bind(row.account_id,row.membership_id,deviceId,appDeviceId).first();if(link?.valid!==1)return reply(401,'invalid_credential',origin);
  const pro=await inspectProCredentialReadOnly(request.headers.get('X-Sound-Cruise-Pro-Authorization'),env,{includeWriterProof:true,now:()=>row.owner_now});if(!pro?.ok||!pro.writerProof)return reply(403,'pro_required',origin);
  const admission=await admitWriter(db,{userId:row.sync_user_id,deviceId:appDeviceId,appId:'port'},{writerProtocol:2,syncProtocol:1,expectedWriteEpoch:row.write_epoch},{accountId:row.account_id,membershipId:row.membership_id},{policy:o.policy,deviceVerifier:await hmacVerifier(appToken,env.SYNC_CREDENTIAL_PEPPER),proCredentialId:pro.writerProof.id,proVerifier:pro.writerProof.verifier});if(admission.error)return reply(409,'writer_unproven',origin);
  const guarded=mutationBoundary(o.db,{accountId:row.account_id,deviceId,membershipId:row.membership_id,accountGeneration:row.generation,membershipGeneration:row.membership_generation,appDeviceId,runtime:row.runtime_generation,epoch:gate.epoch,admission});
  routes=createIsolatedAccountSaveRoutes({db:guarded,policy:o.policy,accountPepper:env.SYNC_ACCOUNT_CREDENTIAL_PEPPER,devicePepper:env.SYNC_CREDENTIAL_PEPPER,proPepper:env.PRO_CREDENTIAL_PEPPER,fixtureOnly:true,
   leaseTtlMs:o.credentialTtlMs,recoveryTtlMs:o.recoveryTtlMs,operationLeaseTtlMs:o.operationLeaseTtlMs,enableRenewalRecovery:true,enableAuthorityReauthorization:true,enableOperationLease:true,enableOwnerCutover:true,enableConsumerReadmission:true,enableSuccessorRecovery:true,enableSuccessorTwoCycle:o.enableSuccessorTwoCycle===true,checkpoint:o.checkpoint});
  const target=new URL(request.url);target.pathname='/__isolated/account/v1/'+path;
  const result=await routes.handle(new Request(target,request));const headers=new Headers(result.headers);headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');return new Response(result.body,{status:result.status,headers});
 }catch{return reply(409,'owner_candidate_unproven',origin);}finally{routes?.dispose();}
}
