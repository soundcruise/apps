import {readSuccessorSource} from './port-successor-source.mjs';
// Explicit isolated composition of the EXISTING Account owner. No boot import,
// second Account store, writer activation, credential issuance or automatic retry.
import {createIsolatedPortAccountCoordinator,portAccountMutationBinding} from './port-account-coordination.mjs';
import {createIsolatedAccountCutoverSource} from '../shared/sync-account/account-mutation-receipts.mjs';
import {createIsolatedRecoveryBackupStore} from '../shared/sync-account/app-backup-recovery.mjs';
import {openIDBAuthorityStore,authorityProEnvironment,authorityUsesIndexedDB} from './port-indexeddb-authority-store.mjs';
import {digest,equal,frozen,fail} from './port-idb-authority-contract.mjs';
import {parseAccountCredential} from '../../workers/sound-cruise-sync/src/account-crypto.js';
const closed=x=>frozen({canWrite:false,operationAuthorized:false,productionReady:false,recoveryRequired:true,...x});
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x);
const positive=x=>Number.isSafeInteger(x)&&x>0;
// Never reflect codes supplied by a transport, storage hook or coordinator.
const PUBLIC_REASONS=new Set(["adoption-authority-stale", "adoption-authority-stopped", "adoption-backup-unproven", "adoption-barrier-unproven", "adoption-candidate-invalid", "adoption-candidate-missing", "adoption-context-unproven", "adoption-disposed", "adoption-explicit-operation-required", "adoption-identity-source-mismatch", "adoption-isolation-required", "adoption-operation-busy", "adoption-operation-invalid", "adoption-operation-mismatch", "adoption-outcome-unproven", "adoption-owner-timeout", "adoption-owner-unproven", "adoption-receipt-unproven", "adoption-reconcile-required", "adoption-renewal-source-mismatch", "adoption-source-stale"]);
const publicReason=code=>PUBLIC_REASONS.has(code)?code:'adoption-outcome-unproven';

export async function createIsolatedCredentialAdoption({scope,indexedDB,source,vault,accountStorage,locks,dispatch,url,successorRecovery=false,timeoutMs=1000,checkpoint=async()=>{}}={}){
 const env=authorityProEnvironment(scope);env.assertLive();const target=new URL(url);
 if(!env.fixtureOnly||!authorityUsesIndexedDB(scope,indexedDB)||vault?.fixtureOnly!==true||
  !['127.0.0.1','localhost','owner-route.invalid'].includes(target.hostname)||['8765','8766'].includes(target.port)||typeof dispatch!=='function'||typeof checkpoint!=='function'||
  ['capture','inspect','current','mutate','reconcile','matches'].some(k=>typeof source?.[k]!=='function')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw fail('adoption-isolation-required');
 const cutover=createIsolatedAccountCutoverSource({indexedDB,scopeName:scope.name}),backup=createIsolatedRecoveryBackupStore({indexedDB,scopeName:scope.name});
 const store=await openIDBAuthorityStore(scope),handles=new WeakMap();let active=null,disposed=false;
 const live=()=>{env.assertLive();if(disposed)throw fail('adoption-disposed');};
 const attempt=fn=>async(...args)=>{try{live();return await fn(...args);}catch(e){return closed({ok:false,reason:publicReason(e?.code)});}};
 async function current(c){live();if(!await source.current(c.mutation)||!await cutover.current(c.cutover.context))throw fail('adoption-source-stale');live();}
 async function authority(c,stopped=false){
  const h=await store.hydrate(c.generation),facts=await store.accountTransitions(c.generation);live();
  if(c.successor){const p=await readSuccessorSource({store,backup,scopeName:scope.name,generation:c.generation,renewalOperationId:c.renewalOperationId,adoptionOperationId:c.packet?.operationId??null,stopped});const expected=[...c.successor.inventory];if(c.packet){const own=await backup.read('adopt-'+c.packet.operationId);if(!own||!equal(own.packet,c.packet))throw fail('adoption-backup-unproven');expected.push({id:own.id,digest:digest(own)});}expected.sort((a,b)=>a.id.localeCompare(b.id));if(p.publicationDigest!==c.successor.publicationDigest||!equal(p.consumer,c.successor.consumer)||!equal(p.inventory,expected))throw fail('adoption-authority-stale');}
  if(!equal(h.snapshot?.pointer,c.pointer)||!equal(h.snapshot?.control?.identity,c.identity)||!facts.ok)throw fail('adoption-authority-stale');
  if(!stopped){if((c.successor?!h.snapshot.control.suspended||!h.snapshot.control.fenceRevoked:h.readiness!=='writable')||h.snapshot.control.epoch!==c.epoch||facts.recoveryRequired||h.snapshot.control.identityInvalidated)throw fail('adoption-authority-stopped');}
  else{const row=facts.intents.find(r=>r.operationId===c.packet.operationId);
   if(!row||!equal(portAccountMutationBinding(row.accountTransition.request,scope.name),c.packet.binding)||!h.snapshot.control.identityInvalidated||h.snapshot.control.epoch!==c.epoch+1||facts.intents.some(r=>r.operationId!==c.packet.operationId&&r.accountTransition.phase!=='account-confirmed'))throw fail('adoption-barrier-unproven');}
 }
 // Current owner validation, not an observation cache or save grant. The old
 // credential and encrypted recovery key are scoped to this exact renewal only.
 async function qualify(c){
  const value=await vault.read(c.renewalOperationId);live();
  if(!value||!equal(value.packet.request,c.renewal.request)||value.packet.sourceDigest!==c.sourceDigest||!equal(value.packet.identity,c.renewal.identity)||value.packet.requestDigest!==c.renewal.requestDigest)throw fail('adoption-renewal-source-mismatch');
  const req=new Request(new URL('credential/renew/reconcile',target),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+c.record.accountCredential,'X-Sound-Cruise-Renewal-Recovery':value.secret},body:JSON.stringify({operationId:c.renewalOperationId,requestDigest:value.packet.requestDigest})});
  let timer,response;try{response=await Promise.race([Promise.resolve().then(async()=>{const r=await dispatch(req);return {status:r.status,body:await r.json()};}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('adoption-owner-timeout')),timeoutMs);})]);}finally{clearTimeout(timer);}
  live();const r=response.body,q=c.renewal.request,i=c.renewal.identity;
  const expected={purpose:'credential-renewal-result-v1',operationId:c.renewalOperationId,requestDigest:c.renewal.requestDigest,accountId:i.accountId,accountDeviceId:i.accountDeviceId,credentialVersion:q.expectedCredentialVersion+1,credentialLeaseRevision:q.expectedLeaseRevision+1};
  if(response.status!==200||r?.ok!==true||!equal(r.receipt,expected)||parseAccountCredential(r.credential)?.deviceId!==c.record.accountDeviceId||c.credentialDigest&&digest(r.credential)!==c.credentialDigest)throw fail('adoption-owner-unproven');
  return r.credential;
 }
 const wrapped={...source,async mutate(input){
  const c=active;if(!c||!equal(input.binding,c.packet.binding)||digest(input.nextAccount)!==c.packet.afterDigest)throw fail('adoption-operation-mismatch');
  await current(c);await authority(c,true);await qualify(c);await checkpoint('before-adoption-cas');
  await current(c);await authority(c,true);
  // Account CAS, record and receipt are ONE existing Shared IDB transaction.
  // Backend SQL and Authority are NOT included in that transaction.
  const result=await source.mutate(input);await checkpoint('after-adoption-cas');return result;
 }};
 let coordinator;
 try{coordinator=await createIsolatedPortAccountCoordinator({scope,indexedDB,accountStorage,locks,mutationStore:wrapped,accountProtocol:3,readonlyAdoption:successorRecovery});}catch(e){store.dispose();throw e;}
 async function proof(c){
  const result=await coordinator.reconcileTransition({generation:c.generation,operationId:c.packet.operationId});
  const context=await source.capture(),record=await source.inspect(context);
  if(record.accountId!==c.packet.accountId||record.accountDeviceId!==c.packet.accountDeviceId||digest(record)!==c.packet.afterDigest||!result.ok||!result.mutationProven||!result.currentObservation||!equal(result.receipt.binding,c.packet.binding)||result.receipt.beforeDigest!==c.packet.beforeDigest||result.receipt.afterDigest!==c.packet.afterDigest)throw fail('adoption-receipt-unproven');
  await authority(c,true);if(!await source.current(context))throw fail('adoption-source-stale');
  return closed({ok:result.accountIntentPhase==='account-confirmed',status:result.accountIntentPhase==='account-confirmed'?'adopted-stopped':'committed-barrier-unconfirmed',historical:true,accountMutationProven:true,adoptionOperationId:c.packet.operationId,receipt:result.receipt,accountIntentPhase:result.accountIntentPhase});
 }
 return Object.freeze({
  // Decryption/inspection never changes Account, Authority, receipt or backup.
  inspect:attempt(async({renewalOperationId,generation}={})=>{
   if(!uuid(renewalOperationId)||typeof generation!=='string')throw fail('adoption-candidate-invalid');
   const mutation=await source.capture(),captured=await cutover.capture(),record=await source.inspect(mutation),renewal=await vault.read(renewalOperationId),h=await store.hydrate(generation);
   if(!renewal||!captured.manifest?.supported||captured.manifest.physicalVersion!==3)throw fail('adoption-candidate-missing');
   const {packet}=renewal,i=h.snapshot?.control?.identity,q=packet.request;
   if(record.accountId!==packet.identity.accountId||record.accountDeviceId!==packet.identity.accountDeviceId||i?.accountId!==record.accountId||i.membershipId!==packet.identity.membershipId||i.accountGeneration!==q.expectedAccountGeneration||i.membershipGeneration!==q.expectedMembershipGeneration||![q.expectedCredentialVersion,q.expectedLeaseRevision,q.expectedRuntimeGeneration].every(positive)||packet.sourceDigest!==digest(captured.manifest))throw fail('adoption-identity-source-mismatch');
   const c={mutation,cutover:captured,record,renewal:packet,renewalOperationId,generation,identity:structuredClone(i),epoch:h.snapshot.control.epoch,pointer:structuredClone(h.snapshot.pointer),sourceDigest:digest(captured.manifest)};
   if(successorRecovery){const s=await readSuccessorSource({store,backup,scopeName:scope.name,generation,renewalOperationId});c.successor={consumer:s.consumer,publicationDigest:s.publicationDigest,pointer:s.snapshot.pointer,inventory:s.inventory};}
   await current(c);await authority(c);const credential=await qualify(c);await current(c);await authority(c);c.credentialDigest=digest(credential);
   const handle=closed({ok:true,state:'verified-candidate',adoptionRequired:true,renewalOperationId});handles.set(handle,c);return handle;
  }),
  adopt:attempt(async(input={})=>{
   const {candidate,operationId,explicit}=input;
   if(!equal(Object.keys(input).sort(),['candidate','explicit','operationId'])||explicit!==true||!uuid(operationId))throw fail('adoption-explicit-operation-required');const c=handles.get(candidate);if(!c||c.used)throw fail('adoption-candidate-invalid');
   if(active)throw fail('adoption-operation-busy');handles.delete(candidate);c.used=true;active=c;
   try{
    await current(c);await authority(c);const credential=await qualify(c);await current(c);await authority(c);
    const next={...structuredClone(c.record),accountCredential:credential};
    const request={generation:c.generation,operationId,identity:c.identity,expectedEpoch:c.epoch,expectedPointerEpoch:c.pointer.pointerEpoch,kind:'switch',destination:{accountId:next.accountId,accountDeviceId:next.accountDeviceId}};
    c.packet={schemaVersion:c.successor?2:1,purpose:c.successor?'credential-adoption-v2':'credential-adoption-v1',...(c.successor?{successor:c.successor}:{}),operationId,renewalOperationId:c.renewalOperationId,renewalRequestDigest:c.renewal.requestDigest,accountId:next.accountId,accountDeviceId:next.accountDeviceId,generation:c.generation,identity:c.identity,epoch:c.epoch,pointer:c.pointer,sourceDigest:c.sourceDigest,credentialDigest:c.credentialDigest,beforeDigest:digest(c.record),afterDigest:digest(next),binding:portAccountMutationBinding(request,scope.name)};
    if(await backup.read('adopt-'+operationId))throw fail('adoption-reconcile-required');
    await backup.add('adopt-'+operationId,c.packet);await current(c);await authority(c);
    const summary={account:{id:c.identity.accountId,state:'active',generation:c.identity.accountGeneration},memberships:[{appId:'port',id:c.identity.membershipId,state:'active',generation:c.identity.membershipGeneration}]};
    const context=c.successor?await coordinator.observeReadonlyAdoption({generation:c.generation,summary,adoption:{operationId,beforeDigest:c.packet.beforeDigest,afterDigest:c.packet.afterDigest,credentialDigest:c.packet.credentialDigest,consumer:c.successor.consumer}}):await coordinator.observe({generation:c.generation,summary});if(!context)throw fail('adoption-context-unproven');
    await current(c);await checkpoint('before-adoption-stop');await current(c);await authority(c);
    const result=await coordinator.transition({context,operationId,nextAccount:next,kind:'switch'});
    if(!result.ok)return closed({ok:false,reason:publicReason(result.reason),stopped:!!result.stopped});
    // Revalidate after publication: revocation here leaves the committed new
    // Account STOPPED, never rolls back to the old credential or grants access.
    try{await qualify(c);}catch{return closed({ok:false,status:'committed-owner-unconfirmed',accountMutationProven:true});}
    const out=await proof(c);await checkpoint('after-adoption-confirmed');return out;
   }finally{active=null;}
  }),
  // Read-only historical reconciliation. No renewal, CAS, confirm, resume, delete
  // or owner authorization. Unknown/partial publication is never retried.
  reconcile:attempt(async({operationId}={})=>{
   if(!uuid(operationId))throw fail('adoption-operation-invalid');const row=await backup.read('adopt-'+operationId),p=row?.packet;
   if(!(p?.schemaVersion===1&&p.purpose==='credential-adoption-v1'||successorRecovery&&p?.schemaVersion===2&&p.purpose==='credential-adoption-v2')||p.operationId!==operationId||!equal(p.binding?.account,{accountId:p.accountId,accountGeneration:p.identity?.accountGeneration,membershipId:p.identity?.membershipId,membershipGeneration:p.identity?.membershipGeneration})||p.binding.operationId!==operationId||p.binding.authorityScope!==scope.name)throw fail('adoption-backup-unproven');
   return proof({packet:p,generation:p.generation,identity:p.identity,epoch:p.epoch,pointer:p.pointer,successor:p.successor,renewalOperationId:p.renewalOperationId});
  }),
  dispose(){if(disposed)return;disposed=true;coordinator.dispose();store.dispose();}
 });
}
