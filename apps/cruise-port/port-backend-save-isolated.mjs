// Two explicit outcomes. A SQL receipt NEVER grants a local IndexedDB write.
import {authorityProEnvironment} from './port-indexeddb-authority-store.mjs';
import {createIsolatedRecoveryBackupStore} from '../shared/sync-account/app-backup-recovery.mjs';
import {digest,equal,frozen,fail} from './port-idb-authority-contract.mjs';
const KEY='cruisePort.metronome';
const closed=v=>frozen({canWrite:false,operationAuthorized:false,productionReady:false,...v});
export function createIsolatedBackendSavePending({indexedDB,scopeName}={}){
 const store=createIsolatedRecoveryBackupStore({indexedDB,scopeName});
 const key=id=>{if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw fail('backend-pending-id-invalid');return 'backend-bpm-'+id;};
 return Object.freeze({fixtureOnly:true,async claim(packet){const value=structuredClone(packet),row={schemaVersion:1,purpose:'backend-local-pending',packet:value};
  try{await store.add(key(value.operationId),row);}catch(e){if(e.code!=='recovery-backup-create-raced')throw e;await store.add(key(value.operationId),row);}return this.read(value.operationId);},
  async read(id){const row=await store.read(key(id));if(!row)return null;const p=row.packet;
   if(p.schemaVersion!==1||p.purpose!=='backend-local-pending'||p.packet?.operationId!==id)throw fail('backend-pending-invalid');return frozen(p.packet);}});
}
export function createIsolatedBackendSaveCoordinator({scope,source,localOwner,pending,backend,makeBackendRequest,timeoutMs=1000,checkpoint=async()=>{}}={}){
 const env=authorityProEnvironment(scope);env.assertLive();
 if(!env.fixtureOnly||pending?.fixtureOnly!==true||backend?.fixtureOnly!==true||
  ['capture','inspect','current'].some(k=>typeof source?.[k]!=='function')||
  ['load','prepare','commit','recover'].some(k=>typeof localOwner?.[k]!=='function')||
  ['prepare','commit','reconcile'].some(k=>typeof backend?.[k]!=='function')||typeof makeBackendRequest!=='function'||
  !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw fail('backend-coordination-isolation-required');
 const prepared=new WeakMap();let disposed=false;
 const live=()=>{env.assertLive();if(disposed)throw fail('backend-coordinator-disposed');};
 const attempt=fn=>async(...args)=>{try{live();return await fn(...args);}catch(e){return closed({ok:false,reason:e.code||e.message,recoveryRequired:true});}};
 async function bounded(fn){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,r)=>{timer=setTimeout(()=>r(fail('backend-outcome-unknown')),timeoutMs);})]);}finally{clearTimeout(timer);}}
 async function current(p){live();if(!await source.current(p.context))throw fail('backend-account-source-stale');live();}
 function validPacket(value){
  const p=structuredClone(value),{checksum,...body}=p;
  if(p.schemaVersion!==1||checksum!==digest(body)||p.operationId!==p.localTicket?.operationId||
   p.operationId!==p.backendBinding?.request?.operation?.operationId||p.accountId!==p.backendBinding.request.accountId||
   p.accountDeviceId!==p.backendBinding.request.accountDeviceId||p.backendBinding.request.localGeneration!==p.localTicket.generation||
   p.backendBinding.request.localRevision!==digest(p.localTicket.body?.base)||
   !equal(p.backendBinding.request.operation.payload?.value,JSON.parse(p.localTicket.body?.changes?.[KEY]||'null')))
    throw fail('backend-pending-binding-invalid');return p;
 }
 function backendReceipt(result,p){
  const r=result?.receipt,q=p.backendBinding.request;
  return result?.ok===true&&result.backendCommitted===true&&result.historical===true&&result.operationAuthorized===false&&result.canWrite===false&&
   r?.requestDigest===p.backendBinding.requestDigest&&r.operationId===p.operationId&&r.accountId===p.accountId&&r.datasetId===q.datasetId&&
   r.accountGeneration===q.accountGeneration&&r.membershipGeneration===q.membershipGeneration&&r.revision===q.operation.baseRevision+1&&r.payloadHash===q.operation.payloadHash;
 }
 return Object.freeze({
  prepare:attempt(async({operationId,bpm,expectedBackendRevision}={})=>{
   if(await pending.read(operationId))throw fail('backend-pending-requires-recovery');
   const context=await source.capture(),account=await source.inspect(context),pin={context};await current(pin);
   const view=await localOwner.load();if(!view.ok)throw fail(view.reason||'local-load-unproven');await current(pin);
   const local=await localOwner.prepare(view,bpm,{operationId});if(!local.ok)throw fail(local.reason||'local-prepare-unproven');await current(pin);
   const request=await makeBackendRequest({operationId,bpm,expectedBackendRevision,localTicket:local.recoveryTicket});await current(pin);
   if(request.accountId!==account.accountId||request.accountDeviceId!==account.accountDeviceId||request.operation?.baseRevision!==expectedBackendRevision||
    request.operation?.operationId!==operationId||request.localGeneration!==local.recoveryTicket.generation||request.localRevision!==digest(local.recoveryTicket.body?.base)||
    !equal(request.operation.payload?.value,JSON.parse(local.recoveryTicket.body.changes[KEY])))throw fail('backend-request-local-mismatch');
   const remote=await bounded(()=>backend.prepare(request));await current(pin);
   if(!remote?.ok||!equal(remote.binding?.request,request))throw fail(remote?.reason||'backend-prepare-unproven');
   const body={schemaVersion:1,operationId,accountId:account.accountId,accountDeviceId:account.accountDeviceId,backendBinding:remote.binding,localTicket:local.recoveryTicket};
   const packet=validPacket({...body,checksum:digest(body)});await pending.claim(packet);
   if(!equal(await pending.read(operationId),packet))throw fail('backend-pending-readback-unproven');await current(pin);
   const h=closed({ok:true,operationId});prepared.set(h,{...pin,remote,local,packet,attempted:false});return h;
  }),
  commit:attempt(async(handle)=>{
   const p=prepared.get(handle);if(!p||p.attempted)throw fail('backend-prepared-requires-recovery');p.attempted=true;
   let backendCommitted=false,localCommitted=false;try{
   await current(p);await checkpoint('before-backend');await current(p);
   const result=await bounded(()=>backend.commit(p.remote));
   backendCommitted=backendReceipt(result,p.packet);await current(p);
   if(!backendReceipt(result,p.packet))return closed({ok:false,reason:result?.reason||'backend-outcome-unknown',recoveryRequired:true});
   const verified=await bounded(()=>backend.reconcile(p.packet.backendBinding));await current(p);
   if(!backendReceipt(verified,p.packet))throw fail('backend-receipt-unproven');
   await checkpoint('before-local');await current(p);
   const local=await localOwner.commit(p.local);localCommitted=local?.ok===true&&local.saved===true&&local.historical===true;await current(p);
   if(!local?.ok||local.saved!==true||local.historical!==true)return closed({ok:false,backendCommitted:true,localCommitted:false,historical:true,accountId:p.packet.accountId,operationId:p.packet.operationId,reason:'local-outcome-unproven',localReason:local?.reason||'unknown',recoveryRequired:true});
   return closed({ok:true,backendCommitted:true,localCommitted:true,historical:true,recoveryRequired:true});
   }catch(e){return closed({ok:false,backendCommitted,localCommitted,historical:backendCommitted||localCommitted,accountId:p.packet.accountId,operationId:p.packet.operationId,reason:e.code||e.message,recoveryRequired:true});}
  }),
  recover:attempt(async({operationId}={})=>{
   const value=await pending.read(operationId);if(!value)throw fail('backend-pending-missing');const packet=validPacket(value);
   let backendCommitted=false,localCommitted=false;try{
   const context=await source.capture(),account=await source.inspect(context),p={context};
   if(account.accountId!==packet.accountId||account.accountDeviceId!==packet.accountDeviceId)throw fail('backend-pending-foreign-account');await current(p);
   const remote=await bounded(()=>backend.reconcile(packet.backendBinding));backendCommitted=backendReceipt(remote,packet);await current(p);
   const local=await localOwner.recover(packet.localTicket);localCommitted=local?.ok===true&&local.saved===true&&local.historical===true;await current(p);
   return closed({ok:backendCommitted&&localCommitted,backendCommitted,localCommitted,historical:true,recoveryRequired:true,
    reason:backendCommitted&&localCommitted?'historical-both-proven':'partial-or-unproven'});
   }catch(e){return closed({ok:false,backendCommitted,localCommitted,historical:backendCommitted||localCommitted,accountId:packet.accountId,operationId:packet.operationId,reason:e.code||e.message,recoveryRequired:true});}
  }),
  dispose(){disposed=true;}
 });
}
