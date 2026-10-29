// DI facade for the existing Studio draft controller. No product boot import.
// The revision reader is a CAS hint, never an authorization or successful-save proof.
import {digest,equal,frozen} from './port-idb-authority-contract.mjs';
export function createIsolatedConsumerBpm({fixtureOnly,operation,backup,readBackendRevision}={}){
 if(fixtureOnly!==true||['load','prepare','commit','recover','recoverPending'].some(k=>typeof operation?.[k]!=='function')||typeof backup?.read!=='function'||typeof readBackendRevision!=='function')throw Error('consumer-bpm-isolation-required');
 const views=new WeakMap(),prepared=new WeakMap();
 const denied=reason=>({ok:false,reason,canWrite:false,sharedWrite:false});
 async function ticket(operationId){
  const p=(await backup.read('op-'+operationId))?.packet,l=(await backup.read('op-lease-'+operationId))?.packet;
  if(!p&&!l)return null;
  if(p?.purpose!=='owner-operation-pending-v1'||p.operationId!==operationId||p.envelopeDigest!==digest(p.envelope)||p.envelope.schemaVersion!==3||l?.purpose!=='owner-operation-lease-pin-v1'||l.operationId!==operationId||l.lease.envelopeDigest!==p.envelopeDigest)throw Error('consumer-bpm-pending-unproven');
  return frozen({purpose:'consumer-bpm-existing-pins-v1',operationId,envelopeDigest:p.envelopeDigest,localFingerprint:p.localIdentity.fingerprint,leaseDigest:digest(l.lease)});
 }
 const owner=Object.freeze({
  async load(){const r=await operation.load();if(!r.ok)return denied(r.stopReason);const revision=await readBackendRevision();if(!Number.isSafeInteger(revision)||revision<0)return denied('backend-revision-unproven');const v=frozen({...r,expectedBackendRevision:revision});views.set(v,{revision,snapshotDigest:r.snapshotDigest});return v;},
  async prepare(view,bpm,{operationId}={}){const v=views.get(view),now=await operation.load();if(!v||!now.ok||v.snapshotDigest!==now.snapshotDigest)return denied('consumer-bpm-view-stale');
   const p=await operation.prepare({generation:view.generation,operationId,bpm,expectedBackendRevision:v.revision,explicit:true});if(!p.ok)return denied(p.stopReason);
   const out=frozen({ok:true,operationId,recoveryTicket:await ticket(operationId),canWrite:false});prepared.set(out,p);return out;},
  async commit(p){const h=prepared.get(p);if(!h)return denied('consumer-bpm-prepared-unproven');const r=await operation.commit(h);return {...r,reason:r.stopReason};},
  async recover(q){if(!equal(q,await ticket(q?.operationId)))return denied('consumer-bpm-pending-unproven');const r=await operation.recover({operationId:q.operationId});return {...r,reason:r.stopReason};}
 });
 return Object.freeze({owner,pending:Object.freeze({read:ticket,async claim(q){if(!equal(q,await ticket(q?.operationId)))throw Error('consumer-bpm-pending-unproven');return q;}}),recoverPending:input=>operation.recoverPending(input)});
}
