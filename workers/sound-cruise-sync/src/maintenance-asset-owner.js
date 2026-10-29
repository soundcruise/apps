import { readSyncContext, syncTransactionProfile, syncOwnerAssertions, syncBridgeOwner } from './maintenance-sync-owner.js';
import { createIsolatedMaintenanceBridgeV2, maintenanceCanonical, maintenanceDigest } from './maintenance-bridge-v2.js';
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const normal=s=>s.replace(/\s+/g,' ').trim();
const q=(sql,...params)=>({sql:'SELECT CASE WHEN ('+sql+') THEN 1 ELSE 0 END AS ok',params});
const combine=a=>({sql:'SELECT CASE WHEN '+a.map(x=>'(SELECT ok FROM ('+x.sql+'))=1').join(' AND ')+' THEN 1 ELSE 0 END AS ok',params:a.flatMap(x=>x.params)});
export function assetRoute(path,method){
 let m=method,pathKind=null,id=null;
 for(const kind of ['prepare','commit','unreference'])if(path==='/v1/sync/assets/'+kind){pathKind=kind;m='POST';}
 const match=new RegExp('^/v1/sync/assets/('+UUID+')(\/content)?$','i').exec(path);
 if(match){id=match[1];pathKind=match[2]?'upload':'download';m=match[2]?'PUT':'GET';}
 return pathKind?{method:m,owner:'sync',state:'sync-managed-asset',lane:m==='GET'?'security':'writer',asset:pathKind,assetId:id}:null;
}
const rowSql="SELECT json_array(asset_id,account_id,membership_id,sync_user_id,kind,state,content_hash,mime_type,byte_size,width,height,object_key,object_version,updated_at,created_by_device_id,owner_record_type,owner_record_id,storage_category) proof FROM sync_assets WHERE asset_id=?";
function rowGuard(row){return q('(SELECT proof FROM ('+rowSql+'))=?',row.asset_id,row._proof);}
export async function readAssetContext(input){
 const {body,route,request,operationId}=input;
 const ctx=await readSyncContext({...input,body:{...body,appId:'port'}});
 if(!ctx.valid||ctx.dataset?.state!=='ready')throw Error('asset_owner_unavailable');
 if(['prepare','commit'].includes(route.asset)&&!new RegExp('^'+UUID+'$','i').test(body?.operationId||''))throw Error('asset_operation_required');
 const ids=route.asset==='prepare'?[]:route.asset==='unreference'?body?.assetIds:[route.assetId||body?.assetId];
 if(!Array.isArray(ids)||ids.length>100||ids.some(x=>!new RegExp('^'+UUID+'$','i').test(x||'')))throw Error('asset_ids_hold');
 ctx.assets=[];
 for(const id of ids){const row=await ctx.db.prepare('SELECT * FROM sync_assets WHERE asset_id=?').bind(id).first();
  if(!row||row.account_id!==ctx.proof[8]||row.membership_id!==ctx.proof[9]||row.sync_user_id!==ctx.userId||!Number.isSafeInteger(row.object_version)||row.object_version<1)throw Error('asset_identity_hold');
  row._proof=JSON.stringify(['asset_id','account_id','membership_id','sync_user_id','kind','state','content_hash','mime_type','byte_size','width','height','object_key','object_version','updated_at','created_by_device_id','owner_record_type','owner_record_id','storage_category'].map(k=>row[k]));ctx.assets.push(row);
 }
 if(route.asset==='upload'&&body.assetOperationId===operationId)throw Error('asset_upload_phase_hold');
 if(route.asset==='prepare'&&body.operationId===operationId)throw Error('asset_root_operation_must_be_distinct');
 ctx.actor=Object.freeze({...ctx.actor,ownerId:'maintenance-sync-owner-v1',purpose:'sync-managed-asset'});
 return ctx;
}
function assetAssertions(ctx){return [...syncOwnerAssertions(ctx),q("EXISTS(SELECT 1 FROM sync_datasets WHERE user_id=? AND app_id='port' AND state='ready' AND schema_version=?)",ctx.userId,ctx.dataset.schema_version)];}
export function assetTransactionProfile(ctx,items){
 let core=[...items],offset=0;
 if(/^INSERT INTO sync_writer_fence_assertion\b/i.test(normal(core[0].sql))){if(!/^DELETE FROM sync_writer_fence_assertion$/i.test(normal(core.at(-1).sql)))throw Error('asset_fence_shape');core=core.slice(1,-1);offset=1;}
 else if(/^SELECT minimum_writer_protocol, write_epoch, authority_state FROM sync_account_memberships/i.test(normal(core[0].sql))){core=core.slice(1);offset=1;}
 const sql=core.map(x=>normal(x.sql)),a=assetAssertions(ctx);let label,type,outcome,required=[];
 if(!sql.length)throw Error('asset_plan_hold');
 if(sql[0].startsWith('UPDATE sync_devices SET last_seen_at')||sql[0].startsWith('INSERT OR IGNORE INTO sync_account_activity')||sql[0].startsWith('UPDATE sync_account_activity SET'))return syncTransactionProfile(ctx,items);
 a.push(...ctx.assets.map(rowGuard));
 const id=ctx.assets[0]?.asset_id||ctx.body?.assetId;
 if(ctx.route.asset==='prepare'&&core.length===7&&sql[0].startsWith('INSERT INTO sync_asset_daily_variant_counts')&&sql[4].startsWith('INSERT INTO sync_assets')&&sql[6].startsWith('INSERT INTO sync_asset_operations')){
  label='asset-prepare';type='asset-prepared';required=core.map((_,i)=>i+offset);
  const p=core[4].values,op=core[6].values;if(p[0]!==id||p[1]!==ctx.proof[8]||p[2]!==ctx.proof[9]||p[3]!==ctx.userId||op[0]!==ctx.body.operationId||op[4]!==ctx.deviceId)throw Error('asset_prepare_scope');
  outcome=q("EXISTS(SELECT 1 FROM sync_assets a JOIN sync_asset_operations o ON o.asset_id=a.asset_id WHERE a.asset_id=? AND a.account_id=? AND a.membership_id=? AND a.sync_user_id=? AND a.state='prepared' AND a.content_hash=? AND a.object_key=? AND o.operation_id=? AND o.app_device_id=?)",id,ctx.proof[8],ctx.proof[9],ctx.userId,ctx.body.hash,p[11],ctx.body.operationId,ctx.deviceId);
 }else if(ctx.route.asset==='upload'&&core.length===1&&sql[0].startsWith("UPDATE sync_assets SET state = 'uploaded'")){
  if(!ctx.externalFact)throw Error('asset_pending_required');label='asset-uploaded';type='asset-upload-d1-recorded-external-pending-retained';required=[offset];
  const p=core[0].values;if(p[2]!==id)throw Error('asset_upload_scope');
  a.push(q("EXISTS(SELECT 1 FROM sync_maintenance_v2_operations WHERE operation_id=? AND scope=? AND kind='external' AND phase='external_pending' AND pending_digest=?)",ctx.externalFact.operationId,ctx.externalFact.scope,ctx.externalFact.pendingDigest));
  outcome=q("changes()=1 AND EXISTS(SELECT 1 FROM sync_assets WHERE asset_id=? AND state='uploaded' AND content_hash=?)",id,ctx.assets[0].content_hash);
 }else if(ctx.route.asset==='commit'&&core.length===1&&sql[0].startsWith("UPDATE sync_assets SET state = 'available'")){
  label='asset-commit';type='asset-available';required=[offset];if(core[0].values[2]!==id)throw Error('asset_commit_scope');outcome=q("changes()=1 AND EXISTS(SELECT 1 FROM sync_assets WHERE asset_id=? AND state='available' AND content_hash=?)",id,ctx.assets[0].content_hash);
 }else if(ctx.route.asset==='unreference'&&core.length===ctx.assets.length&&sql.every(s=>s.startsWith("UPDATE sync_assets SET state = 'unreferenced'"))){
  label='asset-unreference';type='asset-logical-unreference';required=core.map((_,i)=>offset+i);
  for(const [i,s] of core.entries())if(s.values[2]!==ctx.assets[i].asset_id||s.values[3]!==ctx.proof[8]||s.values[4]!==ctx.userId||s.values[5]!==ctx.proof[9])throw Error('asset_unreference_scope');
  outcome=combine(ctx.assets.map(r=>q("EXISTS(SELECT 1 FROM sync_assets WHERE asset_id=? AND state='unreferenced')",r.asset_id)));
 }else throw Error('asset_statement_plan_hold');
 return{label,type,lane:'writer',assertions:a,outcome:combine([outcome,...assetAssertions(ctx)]),requiredChanges:required,summary:{type}};
}
async function externalContext(ctx){
 if(typeof ctx.assetExternalScopeForAccount!=='function')throw Error('asset_external_scope_hold');
 const scope=ctx.assetExternalScopeForAccount(ctx.proof[8]);if(typeof scope!=='string'||!scope||[ctx.writerScope,ctx.securityScope].includes(scope))throw Error('asset_external_scope_hold');
 const c=await ctx.db.prepare('SELECT epoch,phase FROM sync_maintenance_v2_control WHERE scope=?').bind(scope).first();if(!c)throw Error('asset_external_scope_missing');
 const asset=ctx.assets[0],pending={sourceManifestDigest:await maintenanceDigest({asset:asset._proof,actor:ctx.actor}),objectDigest:asset.content_hash,objectKey:asset.object_key,assetId:asset.asset_id,objectVersion:asset.object_version,kind:'asset-upload',businessOperationId:ctx.body.assetOperationId};
 const h=await maintenanceDigest({root:ctx.operationId,label:'asset-r2-put'}),id=h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);
 // Persist the original epoch in the immutable request; recovery may use a later closed epoch.
 const old=await ctx.db.prepare('SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(id).first();
 if(old){if(old.binding_json!==maintenanceCanonical(ctx.actor)||await maintenanceDigest(JSON.parse(old.pending_json))!==old.pending_digest)throw Error('asset_pending_binding');Object.assign(pending,JSON.parse(old.pending_json));}
 const request={kind:'external',operationId:id,scope,expectedEpoch:old?.epoch||c.epoch,identity:ctx.actor,action:{purpose:'asset-r2-put',root:ctx.operationId,requestFingerprint:ctx.fingerprint},pendingDigest:await maintenanceDigest(pending)};
 return{scope,control:c,pending,request,core:createIsolatedMaintenanceBridgeV2({db:ctx.db,owner:syncBridgeOwner(ctx)})};
}
async function checkGuards(ctx){for(const a of [...assetAssertions(ctx),...ctx.assets.map(rowGuard),q("EXISTS(SELECT 1 FROM sync_maintenance_v2_control WHERE scope=? AND epoch=? AND phase='open')",ctx.writerScope,ctx.writer.epoch)]){if((await ctx.db.prepare(a.sql).bind(...a.params).first())?.ok!==1)throw Error('asset_external_final_hold');}}
export function assetBucket(ctx){
 const b=ctx.env.SYNC_ASSETS;if(!b)return null;
 const target=key=>{const row=ctx.assets[0];if(!row||key!==row.object_key)throw Error('asset_object_scope');return row;};
 return Object.freeze({
  async put(key,value,options){const row=target(key);if(ctx.route.asset!=='upload'||!['prepared','uploaded'].includes(row.state))throw Error('asset_put_hold');await checkGuards(ctx);
   const x=await externalContext(ctx);await x.core.externalIntent(x.request,x.pending);ctx.externalFact={operationId:x.request.operationId,scope:x.scope,pendingDigest:x.request.pendingDigest};
   // A durable pending must exist BEFORE R2. A stop/revocation race may still occur after this check.
   await checkGuards(ctx);
   try{return await b.put(key,value,options);}catch(e){await x.core.recordExternalUnknown(x.request).catch(()=>{});throw e;}
  },
  async head(key){target(key);await checkGuards(ctx);return b.head(key);},
  async get(key){target(key);await checkGuards(ctx);return b.get(key);},
  delete(){throw Error('asset_http_delete_hold');}
 });
}
export async function reconcileAssetExternal(ctx,{resolutionOperationId}={}){
 if(ctx.route.asset!=='upload')throw Error('asset_recovery_scope');
 const x=await externalContext(ctx),old=await ctx.db.prepare('SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(x.request.operationId).first();
 if(!old||old.binding_json!==maintenanceCanonical(ctx.actor)||old.pending_digest!==x.request.pendingDigest)throw Error('asset_recovery_binding');
 // Pending's original row proof survives the legitimate uploaded/available lifecycle change.
 const pending=JSON.parse(old.pending_json);if(pending.kind!=='asset-upload'||pending.assetId!==ctx.assets[0].asset_id||pending.objectVersion!==ctx.assets[0].object_version||pending.businessOperationId!==ctx.body.assetOperationId||pending.objectKey!==ctx.assets[0].object_key||pending.objectDigest!==ctx.assets[0].content_hash)throw Error('asset_recovery_object');
 const head=await ctx.env.SYNC_ASSETS.head(pending.objectKey);
 const fact={classification:head&&head.size===ctx.assets[0].byte_size&&head.customMetadata?.hash===pending.objectDigest?'r2-present-d1-'+ctx.assets[0].state:'unknown-preserve',sourceOperationId:old.operation_id};
 // This endpoint is observation-only unless the external scope is explicitly closed.
 if(!resolutionOperationId)return{status:'unknown',fact,pendingRetained:true};
 if(fact.classification==='unknown-preserve'||!['uploaded','available','unreferenced'].includes(ctx.assets[0].state))throw Error('asset_partial_result_retained');
 const owner=syncBridgeOwner(ctx),sourceDigest=await maintenanceDigest(old);
 const verify=owner.verify.bind(owner);owner.verify=async(r,purpose)=>{const proof=await verify(r,purpose);return{...proof,assertions:[...proof.assertions,...assetAssertions(ctx),...ctx.assets.map(rowGuard)]};};
 owner.verifyRecovery=async r=>({allowed:r.sourceOperationId===old.operation_id,sourceDigest,outcomeDigest:await maintenanceDigest(r.outcome)});
 const core=createIsolatedMaintenanceBridgeV2({db:ctx.db,owner});
 return core.recover({kind:'recovery',operationId:resolutionOperationId,scope:x.scope,expectedEpoch:x.control.epoch,identity:ctx.actor,sourceOperationId:old.operation_id,sourceRequestDigest:old.request_digest,pendingDigest:old.pending_digest,outcome:fact});
}
