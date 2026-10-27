import {validateConsumer} from './owner-cutover-contract.mjs';
// Pure operation protocol. No storage, network, authorization or Worker dependency.
const exact=(v,k)=>v&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===k.length&&k.every(n=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,n)||{},'value'));
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),pos=v=>Number.isSafeInteger(v)&&v>0;
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const fail=()=>{throw Error('owner-operation-contract-invalid');};
export function validateOperationEnvelope(e){
 const keys=['schemaVersion','purpose','request','authority','accountDigest','accountManifestDigest','reauthorizationReceiptDigest'];const coordinated=e?.schemaVersion===2&&e.purpose==='owner-operation-lease-envelope-v2';
 if(!(coordinated?exact(e,[...keys,'consumer']):exact(e,keys)&&e.schemaVersion===1&&e.purpose==='owner-operation-lease-envelope-v1')||!hash(e.accountDigest)||!hash(e.accountManifestDigest)||!hash(e.reauthorizationReceiptDigest))fail();
 if(coordinated)validateConsumer(e.consumer);const a=e.authority,q=e.request,o=q?.operation;
 if(!exact(a,['generation','controlEpoch','fenceEpoch','pointer','headRevision','baseDigest','keyRevision'])||typeof a.generation!=='string'||!a.generation||!pos(a.controlEpoch)||!pos(a.fenceEpoch)||!pos(a.keyRevision)||typeof a.headRevision!=='string'||!a.headRevision||!hash(a.baseDigest)||a.pointer?.activeGeneration!==a.generation||!pos(a.pointer.pointerEpoch)||a.pointer.publication?.kind!=='isolated-reauthorization'||q?.contractVersion!==1||q.purpose!=='backend-port-save'||q.localGeneration!==a.generation||q.localRevision!==a.baseDigest||!uuid(o?.operationId)||o.recordType!=='metronome_settings'||o.recordId!=='default'||o.deleted!==false||!Number.isSafeInteger(o.baseRevision)||o.baseRevision<0||!hash(o.payloadHash)||o.payload?.id!=='default'||!Number.isInteger(o.payload.value?.bpm)||o.payload.value.bpm<30||o.payload.value.bpm>240||JSON.stringify(e).length>30000)fail();
 return e;
}
export function validateOperationLease(lease,e){
 validateOperationEnvelope(e);const q=e.request;
 if(!exact(lease,['schemaVersion','purpose','accountId','accountDeviceId','operationId','envelopeDigest','authorizationDigest','leaseRevision','fencingRevision','issuedAt','expiresAt','credentialExpiresAt'])||lease.schemaVersion!==1||lease.purpose!=='owner-operation-lease-v1'||lease.accountId!==q.accountId||lease.accountDeviceId!==q.accountDeviceId||lease.operationId!==q.operation.operationId||!hash(lease.envelopeDigest)||!hash(lease.authorizationDigest)||lease.leaseRevision!==1||!pos(lease.fencingRevision)||!pos(lease.issuedAt)||!pos(lease.expiresAt)||!pos(lease.credentialExpiresAt)||lease.expiresAt<=lease.issuedAt||lease.expiresAt>lease.credentialExpiresAt||lease.expiresAt-lease.issuedAt>30000)fail();return lease;
}
