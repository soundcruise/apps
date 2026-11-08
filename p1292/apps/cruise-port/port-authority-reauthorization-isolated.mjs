// Explicit recovery composition on existing Account / Authority / backup owners.
// Never installed by boot. New generations are born suspended AND writer-fenced.
import {authorityProEnvironment,authorityUsesIndexedDB,openIDBAuthorityStore,claimPortAuthorityIssuer} from './port-indexeddb-authority-store.mjs';
import {createIsolatedAccountCutoverSource} from '../shared/sync-account/account-mutation-receipts.mjs';
import {createIsolatedRecoveryBackupStore} from '../shared/sync-account/app-backup-recovery.mjs';
import {readLegacyPortAssetInventory} from './port-authority-binary.mjs';
import {binaryManifest} from './port-migration-candidate.mjs';
import {validatePortAuthorityCandidate} from './port-local-authority.mjs';
import {digest,equal,frozen,fail} from './port-idb-authority-contract.mjs';
import {validateReauthorizationRequest} from '../shared/sync-account/authority-reauthorization-contract.mjs';
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
const closed=x=>frozen({canWrite:false,operationAuthorized:false,productionReady:false,normalWriterConnected:false,recoveryRequired:true,...x});
// Inventory hashing exposes no credential or key material. Known encrypted vault
// pins are retained, not copied to an Account or reused as authorization.
function inventoryValue(v){
 if(v?.constructor?.name==='CryptoKey')return {type:v.type,extractable:v.extractable,algorithm:v.algorithm,usages:v.usages};
 if(v instanceof ArrayBuffer)return [...new Uint8Array(v)];if(ArrayBuffer.isView(v))return [...new Uint8Array(v.buffer,v.byteOffset,v.byteLength)];
 if(Array.isArray(v))return v.map(inventoryValue);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,inventoryValue(x)]));return v;
}
export async function createIsolatedAuthorityReauthorization({scope,indexedDB,source,adoption,locks,dispatch,url,getBackendCredentials,timeoutMs=1000,checkpoint=async()=>{}}={}){
 const env=authorityProEnvironment(scope);env.assertLive();const target=new URL(url);
 if(!env.fixtureOnly||!authorityUsesIndexedDB(scope,indexedDB)||!locks?.request||!['127.0.0.1','localhost','owner-route.invalid'].includes(target.hostname)||['8765','8766'].includes(target.port)||typeof dispatch!=='function'||typeof getBackendCredentials!=='function'||typeof checkpoint!=='function'||typeof indexedDB.databases!=='function'||typeof adoption?.reconcile!=='function'||['capture','inspect','current','reconcile'].some(k=>typeof source?.[k]!=='function')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw fail('reauthorization-isolation-required');
 const store=await openIDBAuthorityStore(scope),cutover=createIsolatedAccountCutoverSource({indexedDB,scopeName:scope.name}),backup=createIsolatedRecoveryBackupStore({indexedDB,scopeName:scope.name});let issuer,disposed=false;
 try{issuer=claimPortAuthorityIssuer(scope);}catch(e){store.dispose();throw e;}
 const live=()=>{env.assertLive();if(disposed)throw fail('reauthorization-disposed');};
 // Public reasons are deliberately generic: dependency error.code is untrusted.
 const attempt=fn=>async(...args)=>{try{live();return await fn(...args);}catch{return closed({ok:false,reason:'reauthorization-unproven'});}};
 async function inventory(c,{pin=false}={}){
  const rows=await backup.inventory();live();const expected=new Set(['renew-'+c.adopt.renewalOperationId,'adopt-'+c.adopt.operationId]),prefix='port-recovery-v1:'+scope.name+':';let own=null;
  const retained=[];for(const row of rows){if(row.id===prefix+'reauth-'+c.q?.operationId){own=row;continue;}if(!row.id.startsWith(prefix)||!expected.has(row.id.slice(prefix.length)))throw fail('reauthorization-unresolved-backup');retained.push(row);}
  if(retained.length!==2||pin&&(!own||!equal(own.packet,c.pin)))throw fail('reauthorization-backup-unproven');
  const databases=(await indexedDB.databases()).map(d=>({name:d.name,version:d.version})).sort((a,b)=>a.name.localeCompare(b.name));
  if(databases.some(d=>/sync/i.test(d.name)&&!['sound-cruise-sync-account','sound-cruise-sync-app-backups'].includes(d.name)))throw fail('reauthorization-sync-unresolved');
  const state={pins:inventoryValue(retained.sort((a,b)=>a.id.localeCompare(b.id))),databases};return {digest:digest(state),state};
 }
 async function current(c,{pin=true,authority=true}={}){
  live();if(!await source.current(c.context)||!await cutover.current(c.account.context)||(await inventory(c,{pin})).digest!==c.q.backupInventoryDigest)throw fail('reauthorization-source-stale');
  if(authority){const h=await store.hydrate(c.q.sourceGeneration);if(!h.ok||digest(h.snapshot)!==c.q.sourceAuthorityDigest)throw fail('reauthorization-authority-stale');}live();
 }
 async function qualify(c){
  const record=await source.inspect(c.context),credentials=await getBackendCredentials();live();if(digest(record)!==c.q.sourceAccountDigest)throw fail('reauthorization-source-stale');
  const req=new Request(new URL('authority/reauthorize',target),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+record.accountCredential,'X-Sound-Cruise-App-Authorization':credentials.appAuthorization,'X-Sound-Cruise-Pro-Authorization':credentials.proAuthorization},body:JSON.stringify({request:c.q,requestDigest:c.requestDigest})});
  let timer,out;try{out=await Promise.race([Promise.resolve().then(async()=>{const r=await dispatch(req);return {status:r.status,body:await r.json()};}),new Promise((_,j)=>{timer=setTimeout(()=>j(fail('reauthorization-timeout')),timeoutMs);})]);}finally{clearTimeout(timer);}
  live();const k=out.body?.qualification;if(out.status!==200||out.body?.ok!==true||k?.purpose!=='authority-reauthorization-qualification-v1'||!equal(k.request,c.q)||k.requestDigest!==c.requestDigest||k.proChecked!==true||k.writerChecked!==true||k.leaseThroughLocalCommit!==false)throw fail('reauthorization-owner-unproven');return k;
 }
 function proof(c,qualification){return {schemaVersion:1,purpose:'adoption-authority-recovery-v1',request:c.q,requestDigest:c.requestDigest,qualification,sourceControl:c.snapshot.control,sourcePointer:c.snapshot.pointer,adoptionReceipt:c.receipt};}
 async function resolved(p){
  const context=await source.capture(),record=await source.inspect(context),account=await cutover.capture(),c={adopt:p.adopt,q:p.request,pin:p};
  if(digest(record)!==p.request.sourceAccountDigest||digest(account.manifest)!==p.request.sourceManifestDigest||(await inventory(c,{pin:true})).digest!==p.request.backupInventoryDigest)throw fail('reauthorization-source-stale');
  const mutation=await source.reconcile(p.adopt.binding);if(!mutation.ok||!mutation.currentObservation||mutation.receipt.checksum!==p.request.adoptionReceiptChecksum)throw fail('reauthorization-adoption-unproven');
  const r=await store.lookupReauthorization(p.request.targetGeneration,p.operationId),h=await store.hydrate(p.request.targetGeneration),old=await store.hydrate(p.request.sourceGeneration);
  if(!r.ok||!h.ok||!h.snapshot?.active||!equal(h.snapshot.pointer,r.fact.pointer)||h.snapshot.control.epoch!==r.fact.pointer.publication.controlEpoch||!h.snapshot.control.suspended||!h.snapshot.control.fenceRevoked||digest(h.snapshot.values)!==p.valuesDigest||!equal(r.fact.evidence.reauthorization.request,p.request)||r.fact.evidence.reauthorization.requestDigest!==p.requestDigest||!old.ok||!old.snapshot.control.identityInvalidated||old.snapshot.control.state!=='superseded'||!await source.current(context)||!await cutover.current(account.context))throw fail('reauthorization-receipt-unproven');
  return closed({ok:true,status:'generation-readable-stopped',historical:true,generation:p.request.targetGeneration,pointerEpoch:h.snapshot.pointer.pointerEpoch,receiptDigest:r.receiptDigest,ownerAuthorizationCurrent:false,writerFenced:true});
 }
 return Object.freeze({
  run:attempt(async(input={})=>{
   const {adoptionOperationId,sourceGeneration,operationId,explicit}=input;
   if(!equal(Object.keys(input).sort(),['adoptionOperationId','explicit','operationId','sourceGeneration'])||explicit!==true||!uuid(operationId)||!uuid(adoptionOperationId)||typeof sourceGeneration!=='string')throw fail('reauthorization-explicit-required');
   return locks.request('sound-cruise-port-account-coordination-v1:'+scope.partitionId,{mode:'exclusive'},async()=>{
    live();if(await backup.read('reauth-'+operationId))throw fail('reauthorization-reconcile-required');
    const adopted=await adoption.reconcile({operationId:adoptionOperationId}),row=await backup.read('adopt-'+adoptionOperationId),a=row?.packet;
    if(!adopted.ok||adopted.status!=='adopted-stopped'||a?.purpose!=='credential-adoption-v1'||a.generation!==sourceGeneration||a.operationId!==adoptionOperationId||!equal(adopted.receipt?.binding,a.binding))throw fail('reauthorization-adoption-unproven');
    const context=await source.capture(),record=await source.inspect(context),account=await cutover.capture(),h=await store.hydrate(sourceGeneration),renew=await backup.read('renew-'+a.renewalOperationId),rq=renew?.packet?.request;
    if(!h.ok||!h.snapshot?.active||!account.manifest.supported||account.manifest.physicalVersion!==3||record.accountId!==a.accountId||record.accountDeviceId!==a.accountDeviceId||digest(record)!==a.afterDigest||digest(record.accountCredential)!==a.credentialDigest||renew?.packet?.requestDigest!==a.renewalRequestDigest||!rq)throw fail('reauthorization-source-unproven');
    const c={adopt:a,context,account,snapshot:h.snapshot,receipt:adopted.receipt};
    const inv=await inventory(c),generation='reauth-'+crypto.randomUUID(),i=h.snapshot.control.identity;
    c.q={contractVersion:1,purpose:'authority-reauthorization',operationId,accountId:record.accountId,accountDeviceId:record.accountDeviceId,accountGeneration:i.accountGeneration,membershipId:i.membershipId,membershipGeneration:i.membershipGeneration,
     credentialVersion:rq.expectedCredentialVersion+1,credentialLeaseRevision:rq.expectedLeaseRevision+1,runtimeGeneration:rq.expectedRuntimeGeneration,sourceGeneration,targetGeneration:generation,sourceAuthorityDigest:digest(h.snapshot),sourceAccountDigest:digest(record),sourceManifestDigest:digest(account.manifest),backupInventoryDigest:inv.digest,adoptionOperationId,adoptionReceiptChecksum:adopted.receipt.checksum,expectedPointerEpoch:h.snapshot.pointer.pointerEpoch,expectedControlEpoch:h.snapshot.control.epoch};
    validateReauthorizationRequest(c.q);c.requestDigest=digest(c.q);await current(c,{pin:false});
    // Current v1 does not migrate binary or Cloud. Nonempty/unknown material is
    // retained and rejected instead of manufacturing an empty evidence packet.
    const assets=await readLegacyPortAssetInventory(indexedDB,{strict:true});await validatePortAuthorityCandidate({values:h.snapshot.values,assets});const binary=await binaryManifest(h.snapshot.values,assets);
    if(binary.length||assets.length)throw fail('reauthorization-binary-not-connected');
    c.pin={schemaVersion:1,purpose:'authority-reauthorization-pending-v1',operationId,request:c.q,requestDigest:c.requestDigest,adopt:a,valuesDigest:digest(h.snapshot.values)};
    await backup.add('reauth-'+operationId,c.pin);await current(c);
    let qualification=await qualify(c);await current(c);
    const token=issuer.attestFixtureReauthorization(proof(c,qualification)),check=await store.checkReauthorizationSource({reauthorization:token,generation});if(!check.ok)throw fail('reauthorization-source-unproven');
    await checkpoint('before-reauthorization-stage');await current(c);
    const control={...h.snapshot.control,generation,epoch:1,fenceEpoch:h.snapshot.control.fenceEpoch+1,state:'prepared',suspended:true,fenceRevoked:true,identityInvalidated:false,recoveryRequired:false,fenceEvidence:null};
    let result=await store.initialize({generation,control,values:h.snapshot.values,operationId:'reauth-stage-'+operationId});if(!result.ok)throw fail('reauthorization-stage-unproven');
    const migrationId='reauth-'+operationId;result=await store.writeJournal({schemaVersion:1,migrationId,generation,revision:1,state:'prepared',identity:control.identity});if(!result.ok)throw fail('reauthorization-journal-unproven');
    const capability=issuer.issue('migration-publication',{generation}),seal=await store.seal({generation,migrationId,capability});if(!seal.ok)throw fail('reauthorization-seal-unproven');
    qualification=await qualify(c);await current(c);await checkpoint('before-reauthorization-publication');await current(c);
    const reauthorization=issuer.attestFixtureReauthorization(proof(c,qualification));
    const checkpointDigest=digest({purpose:'readonly-owner-qualification',requestDigest:c.requestDigest,datasetId:qualification.datasetId,writeEpoch:qualification.writeEpoch});
    const attestation=issuer.attestFixtureEvidence({generation,migrationId,sealHash:seal.sealHash,binary:{manifestDigest:digest(binary),assetCount:0},sync:{checkpointDigest,outboxPending:0,cloudConnected:false,scope:'local-known-empty-fixture'},fence:null});
    await checkpoint('before-reauthorization-cas');
    result=await store.publishReauthorized({generation,migrationId,operationId,expectedPointerEpoch:c.q.expectedPointerEpoch,expectedControlEpoch:seal.controlEpoch,capability,attestation,reauthorization,recoveryCapability:issuer.issue('control:reauthorize',{generation})});
    if(!result.ok)throw fail('reauthorization-publication-unproven');await checkpoint('after-reauthorization-publication');
    try{await qualify(c);await current(c,{authority:false});}catch{return closed({ok:false,status:'generation-published-owner-unconfirmed',generation,writerFenced:true});}
    const out=await resolved(c.pin);await checkpoint('after-reauthorization-confirmed');return out;
   });
  }),
  reconcile:attempt(async({operationId}={})=>{if(!uuid(operationId))throw fail('reauthorization-operation-invalid');const row=await backup.read('reauth-'+operationId),p=row?.packet;if(p?.schemaVersion!==1||p.purpose!=='authority-reauthorization-pending-v1'||p.operationId!==operationId||p.request?.operationId!==operationId||p.requestDigest!==digest(p.request))throw fail('reauthorization-backup-unproven');validateReauthorizationRequest(p.request);return resolved(p);}),
  dispose(){if(disposed)return;disposed=true;store.dispose();}
 });
}
