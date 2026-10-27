// Explicit fixture-only vertical slice. No boot import, normal writer or Cloud.
import {authorityProEnvironment,authorityUsesIndexedDB,openIDBAuthorityStore} from './port-indexeddb-authority-store.mjs';
import {createIsolatedAccountCutoverSource} from '../shared/sync-account/account-mutation-receipts.mjs';
import {createIsolatedRecoveryBackupStore} from '../shared/sync-account/app-backup-recovery.mjs';
import {METRONOME_STORAGE_KEY as KEY,loadMetronomeSettings,saveMetronomeSettings,normalizeMetronomeSettings} from './metronome-store.js';
import {digest,equal,frozen,identifier,fail} from './port-idb-authority-contract.mjs';
const closed=fields=>frozen({canWrite:false,operationAuthorized:false,productionReady:false,...fields});
export async function createIsolatedMetronomeBpmOwner({scope,indexedDB,generation,provider,finalAdmission,checkpoint=async()=>{}}={}){
 const env=authorityProEnvironment(scope);env.assertLive();identifier(generation);
 if(!env.fixtureOnly||!authorityUsesIndexedDB(scope,indexedDB)||
  typeof provider?.refresh!=='function'||typeof provider?.isCurrentObservation!=='function'||
  finalAdmission?.fixtureOnly!==true||typeof finalAdmission.prepare!=='function')throw fail('bpm-isolation-required');
 const store=await openIDBAuthorityStore(scope),source=createIsolatedAccountCutoverSource({indexedDB,scopeName:scope.name});
 const drafts=new WeakMap(),prepared=new WeakMap();let disposed=false;
 const live=()=>{env.assertLive();if(disposed)throw fail('bpm-disposed');};
 function settings(snapshot){
  const raw=snapshot.values[KEY],parsed=raw===null?null:JSON.parse(raw);
  // Never migrate or normalize the canonical data as a side effect of loading.
  if(parsed!==null&&!normalizeMetronomeSettings(parsed))throw fail('bpm-source-needs-migration');
  const r=loadMetronomeSettings({getItem:k=>snapshot.values[k],setItem(){throw fail('bpm-readonly');}});
  if(!r.ok||r.migrated)throw fail('bpm-source-invalid');return r.settings;
 }
 async function current(p){
  live();if(!await source.current(p.source.context)||!await provider.isCurrentObservation(p.observation))return false;
  const h=await store.hydrate(generation),t=await store.accountTransitions(generation);live();
  return h.readiness==='writable'&&t.ok&&!t.recoveryRequired&&equal(h.snapshot.control,p.snapshot.control)&&equal(h.snapshot.pointer,p.snapshot.pointer)&&await source.current(p.source.context)&&await provider.isCurrentObservation(p.observation);
 }
 const attempt=fn=>async(...a)=>{try{return await fn(...a);}catch(e){return closed({ok:false,reason:e.code||e.message||'bpm-unresolved'});}};
 function ticket(value){
  if(!value||!equal(Object.keys(value).sort(),['accountDigest','body','bpm','checksum','fingerprint','generation','operationId','schemaVersion','scopeName'])||
   value.schemaVersion!==1||value.scopeName!==scope.name||value.generation!==generation||!Number.isInteger(value.bpm)||value.bpm<30||value.bpm>240||!/^[a-f0-9]{64}$/.test(value.accountDigest))throw fail('bpm-ticket-invalid');
  identifier(value.operationId);if(value.body?.action!=='saveBpm'||!equal(Object.keys(value.body.changes||{}),[KEY])||JSON.parse(value.body.changes[KEY]).bpm!==value.bpm||value.body.authorizationIdentity?.accountDigest!==value.accountDigest)throw fail('bpm-ticket-invalid');const {checksum,...body}=value;if(digest(body)!==checksum)throw fail('bpm-ticket-invalid');return value;
 }
 async function reconcile(input){
  live();const fixed=ticket(structuredClone(input)),r=await store.reconcileOperation(fixed);live();
  if(!r.ok||!r.result)throw fail(r.reason||'bpm-save-unproven');
  if(JSON.parse(r.values[KEY]||'null')?.bpm!==fixed.bpm)throw fail('bpm-receipt-value-mismatch');
  return closed({ok:true,saved:true,historical:true,replayed:false,bpm:fixed.bpm,receipt:r.result,recoveryRequired:true});
 }
 return Object.freeze({
  load:attempt(async()=>{
   live();const captured=await source.capture();if(!captured.manifest.supported||captured.manifest.physicalVersion!==3)throw fail('bpm-account-unconfirmed');
   const h=await store.hydrate(generation),t=await store.accountTransitions(generation);
   if(h.readiness!=='writable'||!t.ok||t.recoveryRequired||h.snapshot.control.identity.ownership!=='bound-account'||h.snapshot.control.identity.accountId!==captured.manifest.accountId)throw fail('bpm-barrier-required');
   const observation=await provider.refresh({generation,operationId:'bpm-observe-'+crypto.randomUUID()});
   const i=h.snapshot.control.identity;
   if(observation.status!=='observed'||observation.credentialFreshness!=='owner-confirmed-at-read'||observation.accountId!==i.accountId||
    observation.serverAccountGeneration!==i.accountGeneration||observation.portMembership?.id!==i.membershipId||observation.portMembership?.generation!==i.membershipGeneration)throw fail('bpm-owner-unconfirmed');
   const p={source:captured,snapshot:h.snapshot,observation};if(!await current(p))throw fail('bpm-source-stale');
   const view=closed({ok:true,bpm:settings(h.snapshot).bpm,revision:h.snapshot.head.revision,keyRevision:h.snapshot.versions[KEY],generation});drafts.set(view,p);return view;
  }),
  prepare:attempt(async(view,bpm,{operationId}={})=>{
   live();identifier(operationId);const p=drafts.get(view);if(!p||!Number.isInteger(bpm)||bpm<30||bpm>240)throw fail('bpm-draft-invalid');
   if(!await current(p))throw fail('bpm-source-stale');
   const before=p.snapshot.values[KEY],baseSettings=settings(p.snapshot);let next=before;
   const mem={getItem:k=>k===KEY?before:null,setItem(k,v){if(k!==KEY)throw fail('bpm-target-invalid');next=v;}};
   if(!saveMetronomeSettings({...baseSettings,bpm},mem).ok)throw fail('bpm-settings-invalid');
   // Preserve unknown fields without inventing a second settings model.
   next=JSON.stringify({...JSON.parse(before||'{}'),...JSON.parse(next)});
   const auth=await finalAdmission.prepare(frozen({operationId,action:'saveBpm',generation,bpm,identity:p.snapshot.control.identity,
    account:p.source.manifest,baseRevision:p.snapshot.head.revision,credentialVersion:p.observation.credentialVersion,changesDigest:digest({[KEY]:next})}));
   if(!auth||!Object.isFrozen(auth.context)||typeof auth.guard!=='function'||typeof auth.assertCurrent!=='function')throw fail('bpm-final-admission-missing');
   const check=async()=>{if(!await current(p)||await auth.assertCurrent()!==true)throw fail('bpm-final-admission-stale');};await check();
   const guard=(context,details)=>{live();if(context!==auth.context)return false;const verdict=auth.guard(context,details);if(verdict?.then){verdict.catch?.(()=>{});return false;}return verdict===true;};
   const handle=store.prepare({base:p.snapshot,operationId,action:'saveBpm',changes:{[KEY]:next},dependencyKeys:[KEY],authorizationContext:auth.context,authorizationIdentity:{accountDigest:digest(p.source.manifest),identity:p.snapshot.control.identity,credentialVersion:p.observation.credentialVersion,...(auth.binding?{admission:auth.binding}:{})}});
   const reserved=await store.reserveOperation(handle);if(!reserved.ok)throw fail(reserved.reason);await check();
   const body={schemaVersion:1,scopeName:scope.name,...store.recoveryIdentity(handle),bpm,accountDigest:digest(p.source.manifest)},recoveryTicket=frozen({...body,checksum:digest(body)});
   const value=closed({ok:true,operationId,recoveryTicket});prepared.set(value,{handle,guard,check,recoveryTicket});await checkpoint('after-prepare');return value;
  }),
  commit:attempt(async(value)=>{
   const p=prepared.get(value);if(!p)throw fail('bpm-prepared-invalid');live();await p.check();await checkpoint('before-commit');await p.check();
   const r=await store.commit(p.handle,{commitGuard:p.guard});if(!r.ok)throw fail(r.reason);
   await checkpoint('after-commit');return reconcile(p.recoveryTicket);
  }),
  recover:attempt(reconcile),
  dispose(){disposed=true;store.dispose();}
 });
}

// Pending recovery metadata on the EXISTING backup owner, one immutable pin per
// operation. No singleton overwrite/clear; concurrent tabs cannot erase evidence.
export function createIsolatedBpmPendingStore({indexedDB,scopeName}={}){
 const owner=createIsolatedRecoveryBackupStore({indexedDB,scopeName});
 const key=id=>{if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(id))throw fail('bpm-pending-id-invalid');return 'bpm-'+id;};
 return Object.freeze({
  async claim(ticket){const fixed=structuredClone(ticket),packet={schemaVersion:1,purpose:'bpm-pending',ticket:fixed};
   try{await owner.add(key(fixed.operationId),packet);}catch(e){
    // Two first users may create the shared owner DB concurrently. This retries
    // only an immutable metadata add which was not issued by the losing open;
    // it never retries a BPM mutation or relaxes the owner's schema validator.
    if(e.code!=='recovery-backup-create-raced')throw e;await owner.add(key(fixed.operationId),packet);
   }return this.read(fixed.operationId);},
  async read(operationId){const row=await owner.read(key(operationId));if(!row)return null;const p=row.packet;if(p?.schemaVersion!==1||p.purpose!=='bpm-pending'||p.ticket?.operationId!==operationId)throw fail('bpm-pending-invalid');return frozen(p.ticket);}
 });
}
