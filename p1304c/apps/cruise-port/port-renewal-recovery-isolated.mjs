// Explicit test capability. No Account adoption, consumer installation or Cloud.
import {createIsolatedAccountCutoverSource} from '../shared/sync-account/account-mutation-receipts.mjs';
import {authorityProEnvironment,authorityUsesIndexedDB} from './port-indexeddb-authority-store.mjs';
import {createIsolatedRecoveryBackupStore} from '../shared/sync-account/app-backup-recovery.mjs';
import {digest,equal,frozen,fail} from './port-idb-authority-contract.mjs';
import {createRenewalRecoverySecret,renewalRecoveryCommitment,renewalDigest} from '../../workers/sound-cruise-sync/src/account-renewal-recovery.js';
import {parseAccountCredential} from '../../workers/sound-cruise-sync/src/account-crypto.js';
const closed=x=>frozen({canWrite:false,operationAuthorized:false,productionReady:false,...x}),enc=new TextEncoder();
const id=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/.test(x);
export function createIsolatedRenewalVault({indexedDB,scopeName}={}){
 const store=createIsolatedRecoveryBackupStore({indexedDB,scopeName}),key=id=>{if(!/^[a-f0-9-]{36}$/.test(id||''))throw fail('renewal-vault-id-invalid');return 'renew-'+id;};
 async function read(operationId){const row=await store.read(key(operationId));if(!row)return null;const p=row.packet;
  if(p?.schemaVersion!==1||p.purpose!=='renewal-client-recovery-v1'||p.operationId!==operationId||p.key?.type!=='secret'||p.key.extractable!==false||p.key.algorithm?.name!=='AES-GCM'||p.key.algorithm.length!==256||p.iv?.length!==12||p.ciphertext?.byteLength!==59)throw fail('renewal-vault-invalid');
  const aad={operationId,requestDigest:p.requestDigest,identity:p.identity,sourceDigest:p.sourceDigest,request:p.request};
  const secret=new TextDecoder('utf-8',{fatal:true}).decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:p.iv,additionalData:enc.encode(JSON.stringify(aad))},p.key,p.ciphertext));
  if(await renewalDigest(p.request,p.identity,await renewalRecoveryCommitment(secret))!==p.requestDigest)throw fail('renewal-vault-binding-invalid');return {packet:p,secret};
 }
 return Object.freeze({fixtureOnly:true,read,async claim({operationId,request,identity,sourceDigest,secret,requestDigest}){
  const existing=await read(operationId);if(existing)throw fail('renewal-vault-recovery-required');
  const fixed=structuredClone({operationId,requestDigest,identity,sourceDigest,request}),cryptoKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(JSON.stringify(fixed))},cryptoKey,enc.encode(secret));
  const packet={schemaVersion:1,purpose:'renewal-client-recovery-v1',...fixed,key:cryptoKey,iv,ciphertext};
  try{await store.add(key(operationId),packet);}catch(e){if(e.code!=='recovery-backup-create-raced')throw e;await store.add(key(operationId),packet);}
  const result=await read(operationId);if(!result||result.secret!==secret||!equal(result.packet.request,request)||result.packet.sourceDigest!==sourceDigest)throw fail('renewal-vault-readback-unproven');return result;
 }});
}
export function createIsolatedRenewalRecoveryClient({scope,indexedDB,source,vault,dispatch,url,timeoutMs=1000}={}){
 const env=authorityProEnvironment(scope);env.assertLive();const target=new URL(url);
 if(!env.fixtureOnly||!authorityUsesIndexedDB(scope,indexedDB)||vault?.fixtureOnly!==true||!['127.0.0.1','localhost','owner-route.invalid'].includes(target.hostname)||typeof dispatch!=='function'||['capture','inspect','current'].some(k=>typeof source?.[k]!=='function')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw fail('renewal-client-isolation-required');
 const cutoverSource=createIsolatedAccountCutoverSource({indexedDB,scopeName:scope.name});
 const handles=new WeakMap();let disposed=false;
 const live=()=>{env.assertLive();if(disposed)throw fail('renewal-client-disposed');};
 const attempt=fn=>async(...a)=>{try{live();return await fn(...a);}catch(e){return closed({ok:false,reason:e.code||'renewal-outcome-unproven',recoveryRequired:true});}};
 async function current(context){live();if(!await source.current(context.mutation)||!await cutoverSource.current(context.cutover.context))throw fail('renewal-account-source-stale');live();}
 async function capture(){const mutation=await source.capture(),cutover=await cutoverSource.capture();if(!cutover.manifest?.supported||cutover.manifest.physicalVersion!==3)throw fail('renewal-account-manifest-unconfirmed');const context={mutation,cutover};await current(context);return context;}
 async function send(path,packet,secret,context){await current(context);const record=await source.inspect(context.mutation);let timer;
  const request=new Request(new URL(path,target),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+record.accountCredential,'X-Sound-Cruise-Renewal-Recovery':secret,'X-Sound-Cruise-Renewal-Digest':packet.requestDigest},body:JSON.stringify(path.endsWith('/reconcile')?{operationId:packet.operationId,requestDigest:packet.requestDigest}:packet.request)});
  let outcome;try{outcome=await Promise.race([Promise.resolve().then(async()=>{const r=await dispatch(request);return {status:r.status,result:await r.json()};}),new Promise((_,j)=>{timer=setTimeout(()=>j(fail('renewal-outcome-unknown')),timeoutMs);})]);}finally{clearTimeout(timer);}
  const {result,status}=outcome;await current(context);if(status!==200||result.ok!==true)throw fail('renewal-owner-unproven');
  const receipt=result.receipt||result.renewalReceipt;
  if(receipt?.purpose!=='credential-renewal-result-v1'||receipt.operationId!==packet.operationId||receipt.requestDigest!==packet.requestDigest||receipt.accountId!==packet.identity.accountId||receipt.accountDeviceId!==packet.identity.accountDeviceId||receipt.credentialVersion!==packet.request.expectedCredentialVersion+1||receipt.credentialLeaseRevision!==packet.request.expectedLeaseRevision+1||parseAccountCredential(result.credential)?.deviceId!==packet.identity.accountDeviceId)throw fail('renewal-result-mismatch');
  return closed({ok:true,historical:true,credential:result.credential,receipt,adoptionRequired:true,recoveryRequired:true});
 }
 return Object.freeze({
  prepare:attempt(async({request,identity}={})=>{
   if(!id(request?.operationId))throw fail('renewal-operation-invalid');const context=await capture(),record=await source.inspect(context.mutation);await current(context);
   if(identity?.accountId!==record.accountId||identity.accountDeviceId!==record.accountDeviceId)throw fail('renewal-identity-mismatch');
   const secret=createRenewalRecoverySecret(),requestDigest=await renewalDigest(request,identity,await renewalRecoveryCommitment(secret));
   const {packet}=await vault.claim({operationId:request.operationId,request,identity,sourceDigest:digest(context.cutover.manifest),secret,requestDigest});await current(context);
   const h=closed({ok:true,operationId:request.operationId});handles.set(h,{packet,secret,context,attempted:false});return h;
  }),
  finish:attempt(async(handle)=>{const p=handles.get(handle);if(!p||p.attempted)throw fail('renewal-requires-recovery');p.attempted=true;return send('credential/renew/finish',p.packet,p.secret,p.context);}),
  recover:attempt(async({operationId}={})=>{const value=await vault.read(operationId);if(!value)throw fail('renewal-vault-missing');const context=await capture(),record=await source.inspect(context.mutation);await current(context);const p=value.packet;
   if(p.sourceDigest!==digest(context.cutover.manifest)||record.accountId!==p.identity.accountId||record.accountDeviceId!==p.identity.accountDeviceId)throw fail('renewal-vault-foreign-source');return send('credential/renew/reconcile',p,value.secret,context);}),
  dispose(){disposed=true;}
 });
}
