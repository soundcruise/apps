import {handleRequest} from './app.js';
import {OWNER_CANDIDATE_ROOT} from './account-owner-route-candidate.js';
import {compatibleSchemaSnapshot,guardLegacyD1,guardCompatibleD1} from './maintenance-compatible-schema.js';
import {createIsolatedMaintenanceOwnerHttp} from './maintenance-owner-http.js';
import {createIsolatedInitialHandover} from './maintenance-initial-handover.js';
import {createIsolatedChordMigration} from './maintenance-chord-migration.js';
import {createIsolatedMaintenanceRetentionOwner} from './maintenance-retention-owner.js';
import {createIsolatedMaintenanceAssetScheduled} from './maintenance-asset-scheduled.js';
import {createIsolatedMaintenanceBridgeV2,maintenanceCanonical,maintenanceDigest} from './maintenance-bridge-v2.js';
import {ownerContext,accountOwnerAssertions,ownerFingerprint} from './maintenance-owner-profiles.js';
import {readAssetContext} from './maintenance-asset-owner.js';
import {syncOwnerAssertions} from './maintenance-sync-owner.js';
import {legacy33AdmissionDependencies} from './maintenance-compatible-legacy.js';

const caps=new WeakMap(),UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const q=(sql,...params)=>({sql:'SELECT CASE WHEN ('+sql+') THEN 1 ELSE 0 END AS ok',params});
const reply=(status,code,extra={})=>Response.json({ok:false,code,...extra},{status,headers:{'Cache-Control':'no-store'}});
const notFound=()=>reply(404,'not_found');
// Trusted code only; not an authentication issuer or a Production service identity.
// WeakMap identity cannot be recreated from env/headers/query/serialized payload.
export function createIsolatedCompatibleCapability(options){
 if(options?.fixtureOnly!==true||!options.db?.batch||!options.env||typeof options.verifyService!=='function'||typeof options.verifyEvidence!=='function'||!options.writerScope||!options.securityScope||options.writerScope===options.securityScope||typeof options.scopeForAccount!=='function')throw Error('compatible_capability_invalid');
 const cap=Object.freeze({});caps.set(cap,Object.freeze({...options}));return cap;
}
const publicInternal=path=>path.startsWith(OWNER_CANDIDATE_ROOT)||/^\/(?:__maintenance|__owner|__compatible)(?:\/|$)/.test(path);
function readOnlyBucket(bucket){return bucket?Object.freeze({get:bucket.get.bind(bucket),head:bucket.head.bind(bucket),list:bucket.list.bind(bucket),put(){throw Error('compatible_r2_write_off');},delete(){throw Error('compatible_r2_delete_off');}}):undefined;}

export function createCompatibleWorkerCandidate({db,env}){
 async function authorized(cap,purpose,request,payload){
  const o=caps.get(cap);if(!o||o.db!==db||o.env!==env)throw Error('compatible_capability_required');
  const clone=request.clone(),reader=clone.body?.getReader(),parts=[];let size=0;if(reader)while(true){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;if(size>6*1024*1024+16384){await reader.cancel();throw Error('compatible_service_body_limit');}parts.push(x.value);}const bytes=new Uint8Array(size);let offset=0;for(const x of parts){bytes.set(x,offset);offset+=x.byteLength;}const bodyDigest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const digest=await ownerFingerprint({purpose,url:request.url,method:request.method,headers:[...request.headers].sort(([x],[y])=>x.localeCompare(y)),bodyDigest,payload},env,{owner:'account'});
  const state=await compatibleSchemaSnapshot(db);if(state.metadata!=='exact')throw Error('compatible_metadata_required');const proof=await o.verifyService({purpose,requestDigest:digest,schemaDigest:state.handoverSchemaDigest});if(proof?.allowed!==true||proof.environment!=='isolated'||proof.requestDigest!==digest||proof.schemaDigest!==state.handoverSchemaDigest)throw Error('compatible_service_hold');
  const binding=guardCompatibleD1(db,state),isolated={...env,SYNC_DB:binding};
  return{o,binding,isolated,state};
 }
 function http(c){return createIsolatedMaintenanceOwnerHttp({db:c.binding,env:c.isolated,writerScope:c.o.writerScope,securityScope:c.o.securityScope,dependencies:c.o.dependencies||{},assetExternalScopeForAccount:id=>c.o.scopeForAccount(id,'asset')});}
 async function ownerHttp(action,request,cap,options={}){try{if(!['fetch','reconcile','reconcileExternal','resolvePending'].includes(action))throw Error('compatible_action_hold');const c=await authorized(cap,'owner-http-'+action,request,options);return http(c)[action](request,options);}catch{return reply(503,'compatible_owner_hold');}}
 async function handover(action,request,job,evidence,cap,lane='writer'){
  if(!['inspect','stop','handover','open'].includes(action)||!['writer','security','chord','asset','retention'].includes(lane))throw Error('compatible_handover_action');
  const c=await authorized(cap,'handover-'+action,request,{job,lane,evidenceDigest:evidence?await maintenanceDigest(evidence):null}),scope=id=>lane==='writer'?c.o.writerScope:lane==='security'?c.o.securityScope:c.o.scopeForAccount(id,lane);
  return createIsolatedInitialHandover({db:c.binding,env:c.isolated,scopeForAccount:scope,verifyEvidence:c.o.verifyEvidence})[action](request,job,evidence);
 }
 async function chord(action,request,job,cap,options={}){if(!['inspect','run','reconcile','resolveUnknown'].includes(action))throw Error('compatible_chord_action');const c=await authorized(cap,'chord-'+action,request,{job,options});return createIsolatedChordMigration({db:c.binding,env:c.isolated,scopeForAccount:id=>c.o.scopeForAccount(id,'chord')})[action](request,job,options);}
 async function retention(action,request,job,cap,options={}){if(!['run','reconcile','resolveUnknown'].includes(action))throw Error('compatible_retention_action');const c=await authorized(cap,'retention-'+action,request,{job,options});return createIsolatedMaintenanceRetentionOwner({db:c.binding,env:c.isolated,scopeForAccount:id=>c.o.scopeForAccount(id,'retention')})[action](request,job,options);}
 async function assetCleanup(action,request,job,cap,options={}){
  if(!['run','reconcile'].includes(action)||!UUID.test(job?.operationId||'')||!UUID.test(job?.assetId||''))throw Error('compatible_cleanup_job');
  const c=await authorized(cap,'asset-cleanup-'+action,request,{job,options});if(c.o.enableAssetJobs!==true)throw Error('compatible_new_claim_off');
  const a=await ownerContext({request,body:{...job,appAuthorization:request.headers.get('X-Sound-Cruise-App-Authorization')||'',proAuthorization:request.headers.get('X-Sound-Cruise-Pro-Authorization')||''},route:{owner:'account',state:'account-device',lane:'security',method:'GET'},operationId:job.operationId,env:c.isolated,db:c.binding,dependencies:{}});
  if(!a.account)throw Error('compatible_cleanup_account');
  const headers=new Headers(request.headers);headers.set('Authorization',request.headers.get('X-Sound-Cruise-App-Authorization')||'');
  const s=await readAssetContext({request:new Request(request.url,{headers}),body:{appId:'port'},route:{asset:'download',assetId:job.assetId,owner:'sync',method:'GET',lane:'security'},operationId:job.operationId,env:c.isolated,db:c.binding,dependencies:{},fingerprint:a.fingerprint});
  if(s.proof[8]!==a.account.accountId)throw Error('compatible_cleanup_owner');if(s.dataset?.state!=='ready'||s.dataset.schema_version!==1)throw Error('compatible_cleanup_dataset');if(action==='run'&&(!s.authority||s.authority[0]!==0||s.authority[1]!==1||s.authority[2]!=='legacy'))throw Error('compatible_cleanup_authority_hold');
  const asset=s.assets[0],actor=Object.freeze({...a.actor,purpose:'compatible-scheduled-asset',assetId:asset.asset_id}),scope=c.o.scopeForAccount(a.account.accountId,'asset');
  const rowSql='SELECT * FROM sync_assets WHERE asset_id=?',row=await c.binding.prepare(rowSql).bind(job.assetId).first(),encoded=JSON.stringify(Object.entries(row).sort(([x],[y])=>x.localeCompare(y)));
  // Full native proofs below guard the claim and recovery batch. R2 remains non-atomic.
  const columns=Object.keys(row).sort();if(columns.some(k=>!/^[_a-z]+$/.test(k)))throw Error('compatible_asset_schema');const guards=[...accountOwnerAssertions(a),...syncOwnerAssertions(s),q("EXISTS(SELECT 1 FROM sync_datasets WHERE user_id=? AND app_id='port' AND state='ready' AND schema_version=1) AND NOT EXISTS(SELECT 1 FROM sync_authority_cutovers WHERE account_id=?)",s.userId,a.account.accountId),...(action==='run'?[q("EXISTS(SELECT 1 FROM sync_account_memberships WHERE id=? AND account_id=? AND minimum_writer_protocol=0 AND write_epoch=1 AND authority_state='legacy')",s.proof[9],a.account.accountId)]:[]),q('(SELECT json_array('+columns.join(',')+') FROM sync_assets WHERE asset_id=?)=?',job.assetId,JSON.stringify(columns.map(k=>row[k]))),q("EXISTS(SELECT 1 FROM sync_runtime_control WHERE singleton_id=1 AND rollout_mode='open' AND data_write_enabled=1 AND data_read_enabled=1)")];
  const owner={id:actor.ownerId,validateIdentity:i=>maintenanceCanonical(i)===maintenanceCanonical(actor),async verify(r){return{allowed:maintenanceCanonical(r.identity)===maintenanceCanonical(actor),identityDigest:await maintenanceDigest(actor),assertions:guards};},async verifyHandover(){return false;},async verifyCleanup(r,current){return{allowed:maintenanceCanonical(r.identity)===maintenanceCanonical(actor)&&current.asset_id===asset.asset_id&&current.account_id===a.account.accountId&&current.membership_id===s.proof[9]&&current.sync_user_id===s.userId,assetDigest:await maintenanceDigest(current)};}};
  // Identity proof is captured once by existing readAssetContext; never replace it with a later row.
  if(JSON.stringify(Object.entries({...asset}).filter(([k])=>k!=='_proof').sort(([x],[y])=>x.localeCompare(y)))!==encoded)throw Error('compatible_cleanup_row_race');
  const control=await c.binding.prepare('SELECT epoch FROM sync_maintenance_v2_control WHERE scope=?').bind(scope).first(),original=action==='reconcile'?await c.binding.prepare('SELECT epoch FROM sync_maintenance_v2_operations WHERE operation_id=? AND scope=?').bind(job.operationId,scope).first():null;if(action==='reconcile'&&(!original||(job.expectedEpoch!==undefined&&job.expectedEpoch!==original.epoch)))throw Error('compatible_cleanup_original_epoch');
  const input={kind:'external',operationId:job.operationId,scope,expectedEpoch:action==='reconcile'?original.epoch:job.expectedEpoch??control?.epoch,identity:actor,action:{purpose:'compatible-scheduled-asset',assetId:job.assetId}};
  if(action==='reconcile'){
   const source=await c.binding.prepare('SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(job.operationId).first();
   if(source?.phase==='resolved'){
    if(source.kind!=='external'||source.scope!==scope||source.binding_json!==maintenanceCanonical(actor)||!UUID.test(options.resolutionOperationId||'')||source.resolved_by!==options.resolutionOperationId)throw Error('compatible_cleanup_history_scope');
    const fact=await c.binding.prepare('SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(source.resolved_by).first(),pending=JSON.parse(source.pending_json),receipt=fact?.receipt_json?JSON.parse(fact.receipt_json):null;
    if(!receipt||fact.kind!=='recovery'||fact.phase!=='committed'||fact.source_id!==source.operation_id||fact.scope!==scope||fact.binding_json!==maintenanceCanonical(actor)||await maintenanceDigest(receipt)!==fact.receipt_digest||await maintenanceDigest(pending)!==source.pending_digest||pending.kind!=='asset-delete'||pending.assetId!==asset.asset_id||pending.objectKey!==asset.object_key||pending.objectVersion!==asset.object_version||pending.objectDigest!==asset.content_hash||receipt.outcome?.classification!=='asset-absence-readback-lifecycle-completed'||receipt.sourceRequestDigest!==source.request_digest)throw Error('compatible_cleanup_history_unknown');
    return createIsolatedMaintenanceBridgeV2({db:c.binding,owner}).recover({kind:'recovery',operationId:fact.operation_id,scope,expectedEpoch:fact.epoch,identity:actor,sourceOperationId:source.operation_id,sourceRequestDigest:source.request_digest,pendingDigest:source.pending_digest,outcome:receipt.outcome});
   }
  }
  return createIsolatedMaintenanceAssetScheduled({db:c.binding,bucket:env.SYNC_ASSETS,owner,scope})[action](input,action==='run'?{assetId:job.assetId}:options);
 }
 return Object.freeze({
  async fetch(request,ctx){
   const path=new URL(request.url).pathname;if(publicInternal(path))return notFound();
   let state;try{state=await compatibleSchemaSnapshot(db);}catch{return reply(503,'compatible_unknown_schema_hold');}
   if(state.stage!==33||state.metadata!=='absent')return reply(423,'compatible_explicit_maintenance_window',{stage:state.stage,metadata:state.metadata});
   if(path.startsWith('/v1/sync/assets/')&&request.method!=='GET'&&request.method!=='OPTIONS')return reply(423,'compatible_r2_mutation_off');
   const legacyEnv={...env,SYNC_DB:guardLegacyD1(db,state),SYNC_ASSETS:readOnlyBucket(env.SYNC_ASSETS)};
   try{return await handleRequest(request,legacyEnv,ctx,legacy33AdmissionDependencies({request,env:legacyEnv}));}catch{return reply(503,'compatible_legacy_unknown');}
  },
  async scheduled(){return{status:'HOLD',reason:'legacy_scheduled_explicitly_disabled',retained:['asset-cleanup','purges','lockouts','recovery-claims','receipts','tombstones'],productionClosure:false};},
  ownerHttp,handover,chord,retention,assetCleanup,
  async inspectSchema(){return compatibleSchemaSnapshot(db);},async assessLegacyRollback(){try{const s=await compatibleSchemaSnapshot(db);return{status:s.stage===33&&s.metadata==='absent'?'CONDITIONAL':'HOLD',reason:s.metadata==='absent'?'external-inflight-and-claim-exclusion-still-required':'maintenance-history-or-new-schema-no-v137-rollback',deploymentEnforced:false};}catch{return{status:'HOLD',reason:'unknown-schema',deploymentEnforced:false};}}
 });
}
