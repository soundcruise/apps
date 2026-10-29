import { sha256Hex } from './asset-validation.js';
import { assetBucket, reconcileAssetExternal } from './maintenance-asset-owner.js';
import { createIsolatedWriterPolicy } from './writer-fence.js';
import { syncReadOnlySql } from './maintenance-sync-owner.js';
import { handleRequest as handleSyncRequest } from './app.js';
import { createIsolatedMaintenanceBridgeV2, maintenanceCanonical, maintenanceDigest } from './maintenance-bridge-v2.js';
import { maintenanceOwnerRoute, ownerContext, ownerFingerprint, transactionProfile, bridgeOwner } from './maintenance-owner-profiles.js';
import { handleAccountApiRequest, isValidAccountOwnerBookmark } from './account-app.js';
import { handleProAuthRequest } from './pro-auth-app.js';
import { MAX_PUSH_BODY_BYTES, readBodyWithLimit } from './validation.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OP='X-Maintenance-Operation-Id';
const error=(status,code,id)=>new Response(JSON.stringify({ok:false,code,...(id?{operationId:id}:{})}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function stepId(root,label){
 const hex=await maintenanceDigest({purpose:'owner-http-step-v1',root,label});
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);
}
const readonly=sql=>/^\s*SELECT\b/i.test(sql)&&!sql.includes(';');
// Isolated entrypoint factory only. Not imported by normal app/index.
// Existing handlers retain all HMAC/Turnstile/rate/Origin/body validation and business SQL.
export function createIsolatedMaintenanceOwnerHttp({db,env,writerScope,securityScope,dependencies={},assetExternalScopeForAccount=null}){
 if(!db?.prepare||!db?.batch||!writerScope||!securityScope||writerScope===securityScope)throw Error('owner_http_dependencies_missing');
 const deps=Object.fromEntries(['verifyTurnstileToken','verifyProTurnstile','now','cryptoImpl'].filter(k=>dependencies[k]!==undefined).map(k=>[k,dependencies[k]]));
 const stat=async(scope,session)=>{const c=await session.prepare('SELECT epoch,phase FROM sync_maintenance_v2_control WHERE scope=?').bind(scope).first();if(!c||!Number.isSafeInteger(c.epoch))throw Error('maintenance_control_unknown');return c;};
 function native(ctx){return ctx.route.owner==='sync'?handleSyncRequest:ctx.route.owner==='account'?handleAccountApiRequest:handleProAuthRequest;}
 async function prepare(request){
  const url=new URL(request.url),route=maintenanceOwnerRoute(url.pathname,request.method==='OPTIONS'?request.headers.get('Access-Control-Request-Method'):request.method);
  if(!route)return {response:error(503,'owner_route_unconnected_hold')};
  const allowed=String(route.owner==='account'?env.ACCOUNT_ALLOWED_ORIGINS:env.ALLOWED_ORIGINS).split(',').map(x=>x.trim());
  if(!allowed.includes(request.headers.get('Origin')))return {response:error(403,'invalid_origin')};
  if(request.method==='OPTIONS'){
   const h=new Headers(request.headers);const list=(h.get('Access-Control-Request-Headers')||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
   h.set('Access-Control-Request-Headers',list.filter(x=>x!==OP.toLowerCase()).join(','));
   const clean=new Request(request.url,{method:'OPTIONS',headers:h});
   const response=await (route.owner==='sync'?handleSyncRequest:route.owner==='account'?handleAccountApiRequest:handleProAuthRequest)(clean,env,null,deps);
   if(response.status===204){const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Headers',(headers.get('Access-Control-Allow-Headers')||'')+', '+OP);return {response:new Response(null,{status:204,headers})};}
   return {response};
  }
  if(request.method!==route.method)return {response:error(405,'method_not_allowed')};
  if(url.hash||(route.owner==='pro'&&url.search))return {response:error(400,'invalid_url')};
  if(request.headers.has('X-Sound-Cruise-QA-Authorization'))return {response:error(503,'qa_owner_profile_hold')};
  const id=request.headers.get(OP);if(!UUID.test(id||''))return {response:error(400,'maintenance_operation_required')};
  let body=null,text='';
  if(route.asset&&route.method==='PUT'){
   const length=Number(request.headers.get('Content-Length'));if(!Number.isSafeInteger(length)||length<1||length>6*1024*1024)return {response:error(413,'asset_body_limit',id)};
   const reader=request.body?.getReader(),parts=[];let size=0;if(!reader)return {response:error(400,'asset_body_missing',id)};
   while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>length){await reader.cancel();return {response:error(413,'asset_body_limit',id)};}parts.push(r.value);}
   if(size!==length)return {response:error(400,'asset_size_mismatch',id)};text=new Uint8Array(size);let offset=0;for(const part of parts){text.set(part,offset);offset+=part.length;}
   body={appId:'port',binaryDigest:await sha256Hex(text),contentType:request.headers.get('Content-Type'),assetOperationId:request.headers.get('X-Sound-Cruise-Operation-Id'),claimedHash:request.headers.get('X-Content-SHA256'),writerProtocol:request.headers.get('X-Sound-Cruise-Writer-Protocol'),syncProtocol:request.headers.get('X-Sound-Cruise-Sync-Protocol'),expectedEpoch:request.headers.get('X-Sound-Cruise-Write-Epoch')};
  }
  if(['POST','DELETE'].includes(route.method)){
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return {response:error(415,'invalid_content_type',id)};
   const read=await readBodyWithLimit(request,route.owner==='sync'?MAX_PUSH_BODY_BYTES:route.owner==='account'?16384:4096);if(!read.ok)return {response:error(read.tooLarge?413:400,'invalid_input',id)};
   text=read.text;try{body=JSON.parse(text);}catch{return {response:error(400,'invalid_json',id)};}
   if(!body||typeof body!=='object'||Array.isArray(body))return {response:error(400,'invalid_input',id)};
   if(!route.asset&&body.operationId!==undefined&&body.operationId!==id)return {response:error(409,'operation_id_mismatch',id)};
  }
  const ip=request.headers.get('CF-Connecting-IP');
  if(!ip||!env.SYNC_RATE_LIMITER?.limit)return {response:error(503,'maintenance_rate_limiter_unavailable',id)};
  let limited;try{limited=await env.SYNC_RATE_LIMITER.limit({key:'maintenance:'+route.owner+':'+ip});}catch{return {response:error(503,'maintenance_rate_limiter_unavailable',id)};}
  if(limited?.success!==true)return {response:error(429,'rate_limited',id)};
  const bookmark=['account','sync'].includes(route.owner)?request.headers.get('X-D1-Bookmark'):null;
  if(['account','sync'].includes(route.owner)&&!isValidAccountOwnerBookmark(bookmark))return {response:error(400,'invalid_bookmark',id)};
  const session=typeof db.withSession==='function'?db.withSession(bookmark||'first-primary'):db;
  const rebuilt=new Request(request.url,{method:request.method,headers:request.headers,...(['POST','DELETE','PUT'].includes(route.method)?{body:text}:{})});
  const ctx=await ownerContext({request:rebuilt,body,route,operationId:id,env,db:session,dependencies:deps});
  ctx.writer=await stat(writerScope,session);ctx.security=await stat(securityScope,session);
  ctx.assetExternalScopeForAccount=assetExternalScopeForAccount;ctx.writerScope=writerScope;ctx.securityScope=securityScope;ctx.nativeRequest=rebuilt;ctx.ownerBookmark=bookmark||'first-primary';ctx.steps=[];ctx.uncertain=false;ctx.rejected=false;ctx.sequence=new Set();
  return {ctx};
 }
 const frame=(ctx,id,label,scope,epoch,action={})=>({kind:'mutation',operationId:id,scope,expectedEpoch:epoch,identity:ctx.actor,action:{purpose:label,path:ctx.path,requestFingerprint:ctx.fingerprint,...action}});
 async function previous(ctx){
  const row=await ctx.db.prepare('SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(ctx.operationId).first();
  if(!row)return false;
  let actor,receipt;try{actor=JSON.parse(row.binding_json);receipt=row.receipt_json?JSON.parse(row.receipt_json):null;}catch{throw Error('reservation_unknown');}
  if(actor.profile!=='owner-http-v1'||actor.invocationId!==ctx.operationId||actor.requestFingerprint!==ctx.fingerprint||actor.ownerId!==ctx.actor.ownerId||
     (row.phase==='committed'&&receipt?.details?.type!=='http-result-recorded-not-an-authorization'))throw Error('operation_conflict');
  if(row.scope!==securityScope)throw Error('operation_conflict');
  ctx.actor=Object.freeze(actor);
  const core=createIsolatedMaintenanceBridgeV2({db:ctx.db,owner:bridgeOwner(ctx)});
  const checked=await core.reconcile(frame(ctx,ctx.operationId,'request-reservation',securityScope,row.epoch));
  if(!['historical','unknown'].includes(checked.status))throw Error('reservation_unknown');
  return true; // Read-only reconciliation only; never authorizes new SQL.
 }
 async function reserve(ctx){
  const core=createIsolatedMaintenanceBridgeV2({db:ctx.db,owner:bridgeOwner(ctx)});
  const req=frame(ctx,ctx.operationId,'request-reservation',securityScope,ctx.security.epoch);
  return core.reserveOwnerRequest(req);
 }
 async function recordDenial(ctx,label){
  const id=await stepId(ctx.operationId,'denied-'+label),core=createIsolatedMaintenanceBridgeV2({db:ctx.db,owner:bridgeOwner(ctx,null,{parentRequired:true})});
  const req=frame(ctx,id,'maintenance-rejection',securityScope,ctx.security.epoch,{label});
  const out=await core.execute(req,{outcome:{sql:'SELECT CASE WHEN phase<>\'open\' THEN 1 ELSE 0 END AS ok FROM sync_maintenance_v2_control WHERE scope=?',params:[writerScope]},
   receiptDetails:{type:'admission-rejected-no-business-commit',label},run:d=>d.prepare('SELECT 1 AS rejected').run()});
  ctx.steps.push({id,status:out.status,type:'admission-rejected-no-business-commit'});ctx.rejected=true;
 }
 function binding(ctx){
  const specs=new WeakMap();
  let queue=Promise.resolve();
  async function transact(items){
   const plan=transactionProfile(ctx,items);
   if(ctx.sequence.has(plan.label))throw Error('owner_step_replay_hold');ctx.sequence.add(plan.label);
   const isWriter=plan.lane==='writer',scope=isWriter?writerScope:securityScope,c=isWriter?ctx.writer:ctx.security;
   if(isWriter&&c.phase!=='open'){await recordDenial(ctx,plan.label);throw Error('maintenance_writer_stopped');}
   const id=await stepId(ctx.operationId,plan.label);
   const fingerprint=await ownerFingerprint({invocation:ctx.fingerprint,label:plan.label,statements:items},env,ctx.route);
   const core=createIsolatedMaintenanceBridgeV2({db:ctx.db,owner:bridgeOwner(ctx,plan)});
   const req=frame(ctx,id,plan.label,scope,c.epoch,{statementFingerprint:fingerprint,...(plan.witness?{ownerWitnessDigest:await maintenanceDigest(plan.witness)}:{})});
   ctx.steps.push({id,status:'unknown',type:plan.summary.type});
   try{
    const out=await core.execute(req,{outcome:plan.outcome,receiptDetails:{...plan.summary,classification:'owner-transaction-proven'},
     run:async d=>{
      const indexes=[],statements=[];
      for(const [index,s]of items.entries()){indexes.push(statements.length);statements.push(d.prepare(s.sql).bind(...s.values));
       if(plan.requiredChanges?.includes(index))statements.push(d.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('maintenance-required-row-change','$.invalid') END AS required_change"));
      }
      const results=await d.batch(statements);return indexes.map(i=>results[i]);
     }});
    ctx.steps[ctx.steps.length-1].status=out.status;
    if(plan.label==='port-membership-ensure'&&!ctx.membership)ctx.membership=await ctx.db.prepare("SELECT id,state,generation,sync_user_id FROM sync_account_memberships WHERE account_id=? AND app_id='port'").bind(ctx.account.accountId).first();
    if(plan.selfRevocation){ctx.proof[5]=plan.selfRevocation;ctx.selfRevoked=true;}
    if(ctx.route.owner==='sync')ctx.dataset=await ctx.db.prepare('SELECT state,schema_version FROM sync_datasets WHERE user_id=? AND app_id=?').bind(ctx.userId,ctx.appId).first();
    return out.value;
   }catch(e){ctx.uncertain=true;throw Error('owner_transaction_unknown');}
  }
  const schedule=items=>{const running=queue.then(()=>{if(ctx.uncertain)throw Error('prior_result_unknown');return transact(items);});queue=running.catch(()=>{});return running;};
  function prepare(sql,values=[]){
   if(typeof sql!=='string'||sql.includes(';')||/sync_maintenance_v2_|maintenance_v2_/i.test(sql))throw Error('owner_sql_hold');
   const read=readonly(sql)||(ctx.route.owner==='sync'&&syncReadOnlySql(sql));
   if(!read&&!/^\s*(INSERT|UPDATE|DELETE|WITH)\b/i.test(sql))throw Error('owner_sql_hold');
   const spec={sql,values},wrapped=Object.freeze({
    bind(...v){return prepare(sql,v);},
    async run(){return (await schedule([spec]))[0];},
    async all(){return read?ctx.db.prepare(sql).bind(...values).all():(await schedule([spec]))[0];},
    async first(column){if(read)return ctx.db.prepare(sql).bind(...values).first(column);const row=(await schedule([spec]))[0].results?.[0]||null;return column===undefined||row===null?row:row[column];}
   });specs.set(wrapped,spec);return wrapped;
  }
  const bound=Object.freeze({prepare,batch(items){if(!Array.isArray(items)||items.some(x=>!specs.has(x)))throw Error('foreign_statement_hold');return schedule(items.map(x=>specs.get(x)));},
   withSession(bookmark){if(bookmark!==ctx.ownerBookmark&&!(ctx.route.owner==='sync'&&bookmark==='first-primary'))throw Error('session_bookmark_hold');return bound;},getBookmark(){return typeof ctx.db.getBookmark==='function'?ctx.db.getBookmark():null;},exec(){throw Error('raw_exec_hold');}});
  return bound;
 }
 async function finish(ctx,response){
  if(ctx.uncertain)return error(503,'owner_result_unknown_reconcile_required',ctx.operationId);
  if(ctx.rejected)response=error(423,'maintenance_writer_stopped',ctx.operationId);
  const core=createIsolatedMaintenanceBridgeV2({db:ctx.db,owner:bridgeOwner(ctx)});
  const safe={type:'http-result-recorded-not-an-authorization',httpStatus:response.status,businessSteps:ctx.steps.map(x=>({operationId:x.id,type:x.type}))};
  const responseRead=ctx.route.asset&&ctx.route.method==='GET'&&response.status===200?{ok:true,text:'asset-content-not-retained:'+ctx.fingerprint}:await readBodyWithLimit(response.clone(),65536);
  if(!responseRead.ok)return error(503,'owner_response_readback_hold',ctx.operationId);
  const responseFingerprint=await ownerFingerprint({status:response.status,body:responseRead.text},env,ctx.route);
  const ids=ctx.steps.map(x=>x.id),outcome=ids.length?{sql:'SELECT CASE WHEN COUNT(*)=? THEN 1 ELSE 0 END AS ok FROM sync_maintenance_v2_operations WHERE operation_id IN('+ids.map(()=>'?').join(',')+') AND phase=\'committed\'',params:[ids.length,...ids]}:{sql:'SELECT 1 AS ok',params:[]};
  await core.finishOwnerRequest(frame(ctx,ctx.operationId,'request-reservation',securityScope,ctx.security.epoch),{outcome,receiptDetails:{...safe,responseFingerprint},run:d=>d.prepare('SELECT 1 AS observed').run()});
  const headers=new Headers(response.headers);headers.set(OP,ctx.operationId);
  return new Response(response.body,{status:response.status,headers});
 }
 async function reconcile(request){
  let ctx;try{const p=await prepare(request);if(p.response)return p.response;ctx=p.ctx;if(!await previous(ctx))return error(404,'owner_result_unknown',ctx.operationId);
   const rows=(await ctx.db.prepare("SELECT * FROM sync_maintenance_v2_operations WHERE json_extract(binding_json,'$.invocationId')=? ORDER BY created_at,operation_id").bind(ctx.operationId).all()).results;
   for(const row of rows){
    if(row.binding_json!==maintenanceCanonical(ctx.actor)||row.binding_digest!==await maintenanceDigest(ctx.actor))throw Error('owner_fact_corrupt');
    if(row.phase==='committed'&&!row.receipt_json)throw Error('owner_fact_corrupt');
    if(row.receipt_json){const receipt=JSON.parse(row.receipt_json);if(await maintenanceDigest(receipt)!==row.receipt_digest||receipt.type!==row.kind||receipt.operationId!==row.operation_id||receipt.scope!==row.scope||receipt.requestDigest!==row.request_digest||receipt.identityDigest!==row.binding_digest)throw Error('owner_fact_corrupt');}
   }
   const facts=rows.map(r=>{const receipt=r.receipt_json?JSON.parse(r.receipt_json):null;
    const details=receipt?.details||(r.kind==='recovery'&&receipt?{type:'explicit-operation-resolution',sourceOperationId:receipt.sourceOperationId,classification:receipt.outcome?.classification,scope:receipt.outcome?.scope,invocationMayHaveOtherCommittedSteps:true}:null);
    return {operationId:r.operation_id,phase:r.phase,details};});
   // No token, cached response or successful authorization is reconstructed. No handler is replayed.
   return new Response(JSON.stringify({ok:true,classification:'historical-owner-facts-only',operationId:ctx.operationId,facts}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }catch{return error(409,'owner_reconcile_hold',ctx?.operationId);}}
 async function fetch(request){
  let ctx;try{const p=await prepare(request);if(p.response)return p.response;ctx=p.ctx;
   if(await previous(ctx))return error(409,'owner_reconcile_required',ctx.operationId);
   const reservation=await reserve(ctx);if(reservation.status!=='reserved')return error(409,'owner_reconcile_required',ctx.operationId);
   const ownedEnv={...env,SYNC_DB:binding(ctx),...(ctx.route.asset?{SYNC_ASSETS:assetBucket(ctx)}:{})};
   const nativeDeps=ctx.route.owner==='sync'?{...deps,writerPolicy:createIsolatedWriterPolicy(ctx.proof[8])}:deps;
   const response=await native(ctx)(ctx.nativeRequest,ownedEnv,null,nativeDeps);
   return await finish(ctx,response);
  }catch{return error(503,'owner_profile_hold',ctx?.operationId);}
 }
 async function reconcileExternal(request,options){try{const p=await prepare(request);if(p.response)return p.response;return new Response(JSON.stringify(await reconcileAssetExternal(p.ctx,options)),{headers:{'Content-Type':'application/json'}});}catch{return error(409,'asset_external_recovery_hold');}}
 async function resolvePending(request,{sourceOperationId,resolutionOperationId}){
  let ctx;try{
   if(!UUID.test(sourceOperationId||'')||!UUID.test(resolutionOperationId||''))return error(400,'invalid_resolution');
   const p=await prepare(request);if(p.response)return p.response;ctx=p.ctx;
   if(!await previous(ctx))return error(404,'owner_result_unknown',ctx.operationId);
   const source=await ctx.db.prepare('SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(sourceOperationId).first();
   const prior=await ctx.db.prepare('SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(resolutionOperationId).first();
   const replay=source?.phase==='resolved'&&source.resolved_by===resolutionOperationId&&prior?.kind==='recovery'&&prior?.source_id===sourceOperationId;
   if(!source||source.kind!=='mutation'||source.binding_json!==maintenanceCanonical(ctx.actor)||source.pending_json!==null||source.receipt_json!==null||(!replay&&(source.phase!=='registered'||source.resolved_by!==null))||![writerScope,securityScope].includes(source.scope))return error(409,'owner_resolution_hold',ctx.operationId);
   const c=await stat(source.scope,ctx.db),owner=bridgeOwner(ctx);
   owner.verifyRecovery=async(r,s)=>({allowed:s.operation_id===source.operation_id&&s.request_digest===source.request_digest&&s.phase==='registered'&&s.receipt_json===null&&s.pending_json===null,operationFenceOnly:true,sourceDigest:await maintenanceDigest(s),outcomeDigest:await maintenanceDigest(r.outcome)});
   const core=createIsolatedMaintenanceBridgeV2({db:ctx.db,owner});
   const resolution={kind:'recovery',operationId:resolutionOperationId,scope:source.scope,expectedEpoch:replay?prior.epoch:c.epoch,identity:ctx.actor,sourceOperationId,sourceRequestDigest:source.request_digest,pendingDigest:null,outcome:{classification:'no-protected-d1-commit-operation-fenced',scope:'this-operation-only',invocationMayHaveOtherCommittedSteps:true,externalRateOrCaptchaEffects:'not-reversed'}};
   const result=await core.recover(resolution);
   return new Response(JSON.stringify({ok:true,classification:'operation-fenced-not-reexecuted',receipt:result.receipt}),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }catch{return error(409,'owner_resolution_hold',ctx?.operationId);}
 }
 function cors(response,request){
  const route=maintenanceOwnerRoute(new URL(request.url).pathname,request.method==='OPTIONS'?request.headers.get('Access-Control-Request-Method'):request.method),origin=request.headers.get('Origin');
  const allowed=route&&String(route.owner==='account'?env.ACCOUNT_ALLOWED_ORIGINS:env.ALLOWED_ORIGINS).split(',').map(x=>x.trim()).includes(origin);
  const headers=new Headers(response.headers);headers.set('Vary','Origin');headers.set('X-Content-Type-Options','nosniff');
  if(allowed){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Methods',route.method+', OPTIONS');
   headers.set('Access-Control-Expose-Headers',[headers.get('Access-Control-Expose-Headers'),OP,'X-D1-Bookmark'].filter(Boolean).join(', '));
   const id=request.headers.get(OP);if(UUID.test(id||''))headers.set(OP,id);
  }
  return new Response(response.body,{status:response.status,headers});
 }
 return Object.freeze({async fetch(request){return cors(await fetch(request),request);},async reconcile(request){return cors(await reconcile(request),request);},async reconcileExternal(request,options){return cors(await reconcileExternal(request,options),request);},async resolvePending(request,options){return cors(await resolvePending(request,options),request);}});
}
