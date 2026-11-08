// Explicit fixture-only BPM path on a readonly/fenced reauthorized generation.
// SQL success and local application are separate facts; never auto replay either.
import {authorityProEnvironment,authorityUsesIndexedDB,openIDBAuthorityStore,claimPortAuthorityIssuer} from './port-indexeddb-authority-store.mjs';
import {createIsolatedAccountCutoverSource} from '../shared/sync-account/account-mutation-receipts.mjs';
import {createIsolatedRecoveryBackupStore} from '../shared/sync-account/app-backup-recovery.mjs';
import {digest,equal,frozen,fail} from './port-idb-authority-contract.mjs';
import {validateOperationEnvelope,validateOperationLease} from '../shared/sync-account/owner-operation-lease-contract.mjs';
import {validateOwnerOperationProof} from './port-owner-operation-contract.mjs';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const stopReasons=new Set(['credential-expired','credential-revoked','credential-unverified','owner-generation-changed','lease-or-fence-unproven','pro-or-writer-denied','cas-conflict','owner-admission-unproven']);
const errorCategories=new Map(Object.entries({
 'owner-operation-account-stale':'account-changed','owner-operation-authority-stale':'authority-pointer-or-control-changed',
 'owner-operation-pending-unresolved':'pending-backup-unresolved','owner-operation-pending-raced':'pending-backup-unresolved','owner-operation-source-stale':'account-changed',
 'owner-operation-timeout':'backend-outcome-unproven','owner-operation-replay':'operation-reconcile-required','owner-operation-reconcile-required':'operation-reconcile-required',
 'owner-operation-local-unproven':'local-outcome-unproven','owner-operation-explicit-required':'explicit-operation-required'
}));
const classify=e=>errorCategories.get(e?.code)||(stopReasons.has(e?.code)?e.code:'operation-unproven');
const closed=r=>frozen({canWrite:false,sharedWrite:false,normalWriterConnected:false,productionReady:false,operationAuthorized:false,currentAuthorityVerified:false,...r});
export async function createIsolatedOwnerOperation({scope,indexedDB,source,locks,dispatch,url,getBackendCredentials,makeBackendRequest,consumerBinding=false,timeoutMs=1000,checkpoint=async()=>{}}={}){
 const env=authorityProEnvironment(scope);env.assertLive();const target=new URL(url);
 if(!env.fixtureOnly||!authorityUsesIndexedDB(scope,indexedDB)||!locks?.request||!['127.0.0.1','localhost','owner-route.invalid'].includes(target.hostname)||['8765','8766'].includes(target.port)||typeof dispatch!=='function'||typeof getBackendCredentials!=='function'||typeof makeBackendRequest!=='function'||typeof checkpoint!=='function'||['capture','inspect','current'].some(k=>typeof source?.[k]!=='function')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw fail('owner-operation-isolation-required');
 const store=await openIDBAuthorityStore(scope),cutover=createIsolatedAccountCutoverSource({indexedDB,scopeName:scope.name}),backup=createIsolatedRecoveryBackupStore({indexedDB,scopeName:scope.name});let issuer;
 try{issuer=claimPortAuthorityIssuer(scope);}catch(e){store.dispose();throw e;}
 const handles=new WeakMap();let disposed=false;const live=()=>{env.assertLive();if(disposed)throw fail('owner-operation-disposed');};
 const attempt=fn=>async(...args)=>{try{live();return await fn(...args);}catch(e){return closed({ok:false,status:'operation-unproven',stopReason:classify(e),backendCommitted:null,localCommitted:null,recoveryRequired:true});}};
 const inventory=async()=>{const rows=await backup.inventory();live();return rows.sort((a,b)=>a.id.localeCompare(b.id));};
 async function request(path,p,lease){
  live();const account=await source.inspect(p.context),credentials=await getBackendCredentials();if(digest(account)!==p.envelope.accountDigest)throw fail('owner-operation-account-stale');
  const req=new Request(new URL('operation/'+path,target),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+account.accountCredential,'X-Sound-Cruise-App-Authorization':credentials.appAuthorization,'X-Sound-Cruise-Pro-Authorization':credentials.proAuthorization},body:JSON.stringify({envelope:p.envelope,envelopeDigest:digest(p.envelope),...(lease?{lease}:{})})});
  let timer,out;try{out=await Promise.race([Promise.resolve().then(async()=>{const r=await dispatch(req);return {status:r.status,body:await r.json()};}),new Promise((_,j)=>{timer=setTimeout(()=>j(fail('owner-operation-timeout')),timeoutMs);})]);}finally{clearTimeout(timer);}
  live();if(out.status!==200||out.body?.ok!==true||out.body.canWrite!==false)throw fail(stopReasons.has(out.body?.stopReason)?out.body.stopReason:'owner-admission-unproven');return out.body;
 }
 async function appendPin(p,id,packet,phase){
  await current(p);const added=await backup.add(id,packet);await checkpoint(phase);
  const expected=[...p.inventoryRows,added].sort((a,b)=>a.id.localeCompare(b.id));
  if(digest(await inventory())!==digest(expected))throw fail('owner-operation-pending-raced');
  p.inventoryRows=expected;p.inventoryDigest=digest(expected);await current(p);
 }
 async function current(p,{authority=true}={}){
  live();if(!await source.current(p.context)||!await cutover.current(p.account.context))throw fail('owner-operation-account-stale');if(digest(await inventory())!==p.inventoryDigest)throw fail('owner-operation-pending-unresolved');
  if(p.envelope.schemaVersion===2){const c=await store.readConsumer();if(!c.ok||!equal(c.consumer,p.envelope.consumer))throw fail('owner-operation-authority-stale');}
  if(authority){const h=await store.hydrate(p.envelope.authority.generation);if(!h.ok||digest(h.snapshot)!==p.envelope.authority.baseDigest)throw fail('owner-operation-authority-stale');}live();
 }
 function proof(p,r){const v={schemaVersion:1,purpose:'owner-committed-bpm-application-v1',envelope:p.envelope,lease:p.lease,backendReceipt:r.receipt,operationLeaseReceipt:r.operationLeaseReceipt,fingerprint:p.localIdentity.fingerprint};validateOwnerOperationProof(v);return v;}
 async function contextFor(pin){
  if(pin?.purpose!=='owner-operation-pending-v1'||pin.schemaVersion!==1||!equal(Object.keys(pin).sort(),['schemaVersion','purpose','operationId','envelope','envelopeDigest','localIdentity'].sort())||!uuid(pin.operationId)||pin.envelopeDigest!==digest(pin.envelope)||pin.operationId!==pin.envelope?.request?.operation?.operationId||!pin.localIdentity||!equal(Object.keys(pin.localIdentity).sort(),['generation','operationId','fingerprint','body'].sort())||pin.localIdentity.operationId!==pin.operationId||pin.localIdentity.generation!==pin.envelope?.authority?.generation||pin.localIdentity.fingerprint!==digest(pin.localIdentity.body)||pin.localIdentity.body?.action!=='saveBpm'||pin.localIdentity.body.operationId!==pin.operationId||pin.localIdentity.body.generation!==pin.localIdentity.generation||!equal(Object.keys(pin.localIdentity.body.changes),['cruisePort.metronome'])||!equal(JSON.parse(pin.localIdentity.body.changes['cruisePort.metronome']),pin.envelope.request.operation.payload.value))throw fail('owner-operation-pin-invalid');validateOperationEnvelope(pin.envelope);
  const context=await source.capture(),account=await cutover.capture();if(digest(await source.inspect(context))!==pin.envelope.accountDigest||digest(account.manifest)!==pin.envelope.accountManifestDigest)throw fail('owner-operation-source-stale');return {context,account,envelope:pin.envelope,localIdentity:pin.localIdentity};
 }
 async function resolved(pin,lease){
  const p=await contextFor(pin),l=lease||pin.lease;if(!l)throw fail('owner-operation-lease-unknown');validateOperationLease(l,p.envelope);
  const r=await request('reconcile',p,l);p.lease=l;const receiptProof=proof(p,r);
  const facts={backendCommitted:true,localCommitted:null,historical:true,operationId:pin.operationId,receipt:r.receipt,operationLeaseReceipt:r.operationLeaseReceipt};
  try{const local=await store.reconcileOwnerOperation({identity:p.localIdentity,proof:receiptProof});
   if(!local.ok||local.values['cruisePort.metronome']!==pin.localIdentity.body.changes['cruisePort.metronome']||!await source.current(p.context)||!await cutover.current(p.account.context))return closed({...facts,ok:false,status:'backend-committed-local-unproven',stopReason:'local-outcome-unproven',recoveryRequired:true});
   return closed({...facts,ok:true,status:'historically-applied',localCommitted:true,localReceipt:local.result});
  }catch{return closed({...facts,ok:false,status:'backend-committed-local-unproven',stopReason:'local-outcome-unproven',recoveryRequired:true});}
 }
 // A second immutable pin records only the returned lease (not credentials).
 // It cannot overwrite the pre-request pin or substitute a different envelope.
 async function leaseFor(operationId){const row=await backup.read('op-lease-'+operationId);if(row?.packet?.purpose!=='owner-operation-lease-pin-v1'||row.packet.schemaVersion!==1||!equal(Object.keys(row.packet).sort(),['schemaVersion','purpose','operationId','lease'].sort())||row.packet.operationId!==operationId)throw fail('owner-operation-lease-unknown');return row.packet.lease;}
 return Object.freeze({
  prepare:attempt(async(input={})=>{
   input=frozen(structuredClone(input));if(!equal(Object.keys(input).sort(),['generation','reauthorizationOperationId','operationId','bpm','expectedBackendRevision','explicit'].sort())||input.explicit!==true||!uuid(input.operationId)||!uuid(input.reauthorizationOperationId)||!Number.isInteger(input.bpm)||input.bpm<30||input.bpm>240||!Number.isSafeInteger(input.expectedBackendRevision)||input.expectedBackendRevision<0)throw fail('owner-operation-explicit-required');
   return locks.request('sound-cruise-port-account-coordination-v1:'+scope.partitionId,{mode:'exclusive'},async()=>{
    const birth=await store.lookupReauthorization(input.generation,input.reauthorizationOperationId),h=await store.hydrate(input.generation);if(!birth.ok||!h.ok||!h.snapshot?.active||!equal(h.snapshot.pointer,birth.fact.pointer))throw fail('owner-operation-generation-unproven');
    const recovery=birth.fact.evidence.reauthorization,q0=recovery.request,k=recovery.qualification,context=await source.capture(),record=await source.inspect(context),account=await cutover.capture(),c=h.snapshot.control;
    if(!account.manifest.supported||account.manifest.physicalVersion!==3||digest(record)!==q0.sourceAccountDigest||digest(account.manifest)!==q0.sourceManifestDigest||c.state!=='active'||!c.suspended||!c.fenceRevoked||c.identityInvalidated||c.recoveryRequired||record.accountId!==q0.accountId||record.accountDeviceId!==q0.accountDeviceId)throw fail('owner-operation-source-unproven');
    const rows=await inventory(),prefix='port-recovery-v1:'+scope.name+':',known=new Set(['renew-'+q0.adoptionOperationId]);
    const reauthRow=await backup.read('reauth-'+input.reauthorizationOperationId),adopt=reauthRow?.packet?.adopt;
    if(!adopt||reauthRow.packet.requestDigest!==recovery.requestDigest)throw fail('owner-operation-provenance-unproven');
    known.clear();for(const id of ['renew-'+adopt.renewalOperationId,'adopt-'+adopt.operationId,'reauth-'+input.reauthorizationOperationId])known.add(prefix+id);
    const seen=new Set();for(const row of rows){if(known.has(row.id)){seen.add(row.id);continue;}if(row.id===prefix+'op-'+input.operationId||row.id===prefix+'op-lease-'+input.operationId)throw fail('owner-operation-reconcile-required');
     if(row.id.startsWith(prefix+'op-lease-'))continue;
     if(!row.id.startsWith(prefix+'op-')||row.id!==prefix+'op-'+row.packet?.operationId||row.packet?.envelope?.authority?.generation!==input.generation)throw fail('owner-operation-pending-unresolved');if(!(await resolved(row.packet,await leaseFor(row.packet.operationId))).ok)throw fail('owner-operation-pending-unresolved');
    }
    if(seen.size!==3)throw fail('owner-operation-provenance-unproven');
    // No orphan lease pin may be silently skipped.
    for(const row of rows.filter(r=>r.id.startsWith(prefix+'op-lease-'))){const p=row.packet,op=rows.find(r=>r.id===prefix+'op-'+p?.operationId);
     if(!p||p.schemaVersion!==1||p.purpose!=='owner-operation-lease-pin-v1'||!equal(Object.keys(p).sort(),['schemaVersion','purpose','operationId','lease'].sort())||!uuid(p.operationId)||row.id!==prefix+'op-lease-'+p.operationId||!op||op.packet?.purpose!=='owner-operation-pending-v1'||op.packet.envelopeDigest!==digest(op.packet.envelope))throw fail('owner-operation-pending-unresolved');validateOperationLease(p.lease,op.packet.envelope);if(p.lease.envelopeDigest!==op.packet.envelopeDigest)throw fail('owner-operation-pending-unresolved');
    }
    const next=JSON.stringify({...JSON.parse(h.snapshot.values['cruisePort.metronome']),bpm:input.bpm}),handle=store.prepare({base:h.snapshot,operationId:input.operationId,action:'saveBpm',changes:{'cruisePort.metronome':next}}),localIdentity=store.recoveryIdentity(handle);
    const q=await makeBackendRequest({operationId:input.operationId,bpm:input.bpm,expectedBackendRevision:input.expectedBackendRevision,localTicket:localIdentity});
    // Caller supplies the pure codec, never authorization or identity choices.
    Object.assign(q,{localGeneration:input.generation,localRevision:digest(h.snapshot),accountId:q0.accountId,accountDeviceId:q0.accountDeviceId,accountGeneration:q0.accountGeneration,membershipId:q0.membershipId,membershipGeneration:q0.membershipGeneration,credentialVersion:q0.credentialVersion,credentialLeaseRevision:q0.credentialLeaseRevision,runtimeGeneration:q0.runtimeGeneration,datasetId:k.datasetId,appDeviceId:k.appDeviceId,writeEpoch:k.writeEpoch});
    if(q.operation.operationId!==input.operationId||q.operation.baseRevision!==input.expectedBackendRevision||!equal(q.operation.payload.value,JSON.parse(next)))throw fail('owner-operation-request-mismatch');
    const consumer=consumerBinding?await store.readConsumer():null;if(consumerBinding&&!consumer?.ok)throw fail('owner-operation-source-unproven');
    const envelope=frozen(structuredClone({schemaVersion:consumerBinding?2:1,purpose:consumerBinding?'owner-operation-lease-envelope-v2':'owner-operation-lease-envelope-v1',...(consumerBinding?{consumer:consumer.consumer}:{}),request:q,authority:{generation:input.generation,controlEpoch:c.epoch,fenceEpoch:c.fenceEpoch,pointer:h.snapshot.pointer,headRevision:h.snapshot.head.revision,baseDigest:digest(h.snapshot),keyRevision:h.snapshot.versions['cruisePort.metronome']},accountDigest:digest(record),accountManifestDigest:digest(account.manifest),reauthorizationReceiptDigest:birth.receiptDigest}));validateOperationEnvelope(envelope);
    const p={context,account,envelope,localIdentity,handle,attempted:false,inventoryDigest:digest(rows),inventoryRows:rows};await current(p);await checkpoint('before-operation-pin');await current(p);
    const pin={schemaVersion:1,purpose:'owner-operation-pending-v1',operationId:input.operationId,envelope,envelopeDigest:digest(envelope),localIdentity};await appendPin(p,'op-'+input.operationId,pin,'after-own-operation-pin');p.pin=pin;
    p.lease=(await request('lease',p)).lease;validateOperationLease(p.lease,envelope);await current(p);await appendPin(p,'op-lease-'+input.operationId,{schemaVersion:1,purpose:'owner-operation-lease-pin-v1',operationId:input.operationId,lease:p.lease},'after-own-lease-pin');
    await checkpoint('after-operation-lease');await current(p);const out=closed({ok:true,operationId:input.operationId,generation:input.generation,lease:p.lease});handles.set(out,p);return out;
   });
  }),
  commit:attempt(async(handle)=>{
   const p=handles.get(handle);if(!p||p.attempted)throw fail('owner-operation-replay');p.attempted=true;
   return locks.request('sound-cruise-port-account-coordination-v1:'+scope.partitionId,{mode:'exclusive'},async()=>{
    const facts={backendCommitted:null,localCommitted:null,operationId:p.envelope.request.operation.operationId};try{
    await current(p);await checkpoint('before-operation-backend');await current(p);const r=await request('save',p,p.lease);proof(p,r);Object.assign(facts,{backendCommitted:true,receipt:r.receipt,operationLeaseReceipt:r.operationLeaseReceipt,historical:true});await current(p);
    await checkpoint('after-operation-backend');await current(p);const checked=await request('current',p,p.lease);if(!equal(checked.receipt,r.receipt)||!equal(checked.operationLeaseReceipt,r.operationLeaseReceipt))throw fail('owner-operation-receipt-conflict');await current(p);
    await checkpoint('before-operation-local');await current(p);const local=await store.applyCommittedOwnerOperation({handle:p.handle,capability:issuer.issue('control:apply-owner-operation',{generation:p.envelope.authority.generation}),attestation:issuer.attestFixtureOwnerOperation(proof(p,r))});
    if(!local.ok)throw fail('owner-operation-local-unproven');Object.assign(facts,{localCommitted:true,localReceipt:local});await checkpoint('local-application-result',local);await checkpoint('after-operation-local');await current(p,{authority:false});const reconciled=await resolved(p.pin,p.lease);return reconciled.ok?reconciled:closed({...reconciled,...facts,ok:false,status:'operation-applied-current-unconfirmed',recoveryRequired:true});
    }catch(e){return closed({...facts,ok:false,stopReason:classify(e),status:facts.backendCommitted===true?(facts.localCommitted===true?'operation-applied-current-unconfirmed':'backend-committed-local-unproven'):'operation-unproven',recoveryRequired:true});}
   });
  }),
  recover:attempt(async({operationId}={})=>{if(!uuid(operationId))throw fail('owner-operation-id-invalid');const row=await backup.read('op-'+operationId);return resolved(row?.packet,await leaseFor(operationId));}),
  dispose(){if(disposed)return;disposed=true;store.dispose();}
 });
}
