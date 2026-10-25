// Pure fixture protocol. No storage, network, authorization or Worker dependency.
export const CUTOVER_CONSUMERS=Object.freeze(['port-bpm-fixture-v1','studio-bpm-readonly-fixture-v1']);
export const isPositive=x=>Number.isSafeInteger(x)&&x>0;
export const isDigest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export const isUUID=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
export const exactKeys=(x,k)=>x&&[Object.prototype,null].includes(Object.getPrototypeOf(x))&&Reflect.ownKeys(x).length===k.length&&k.every(n=>Object.hasOwn(Object.getOwnPropertyDescriptor(x,n)||{},'value'));
const fail=()=>{throw Error('owner-cutover-contract-invalid');};
export function validateConsumer(c){
 if(!exactKeys(c,['schemaVersion','key','owner','id','epoch','authorityGeneration','pointerEpoch','transitionId','publicationDigest','readOnly'])||c.schemaVersion!==1||c.key!=='isolated-consumer'||c.owner!=='port'||!CUTOVER_CONSUMERS.includes(c.id)||!isPositive(c.epoch)||!isPositive(c.pointerEpoch)||typeof c.authorityGeneration!=='string'||!c.authorityGeneration||!isUUID(c.transitionId)||!isDigest(c.publicationDigest)||c.readOnly!==true)fail();return c;
}
export function validateCutoverRequest(q){
 if(!exactKeys(q,['schemaVersion','purpose','transitionId','sourceGeneration','targetGeneration','sourcePointer','sourceControlEpoch','sourceHeadRevision','consumer','targetConsumerId','accountDigest','sourceManifestDigest','sourceAuthorityDigest','backupInventoryDigest','anchorRequest'])||q.schemaVersion!==1||q.purpose!=='owner-pointer-consumer-cutover-v1'||!isUUID(q.transitionId)||q.sourceGeneration===q.targetGeneration||typeof q.sourceGeneration!=='string'||typeof q.targetGeneration!=='string'||!q.targetGeneration||!isPositive(q.sourceControlEpoch)||typeof q.sourceHeadRevision!=='string'||!q.sourceHeadRevision||!CUTOVER_CONSUMERS.includes(q.targetConsumerId)||['accountDigest','sourceManifestDigest','sourceAuthorityDigest','backupInventoryDigest'].some(k=>!isDigest(q[k])))fail();
 validateConsumer(q.consumer);const a=q.anchorRequest,p=q.sourcePointer;
 if(q.consumer.id===q.targetConsumerId||q.consumer.authorityGeneration!==q.sourceGeneration||p?.activeGeneration!==q.sourceGeneration||q.consumer.pointerEpoch!==p.pointerEpoch||a?.contractVersion!==1||a.purpose!=='backend-port-save'||a.localGeneration!==q.sourceGeneration||a.localRevision!==q.sourceAuthorityDigest||a.operation?.operationId!==q.transitionId||JSON.stringify(q).length>16000)fail();return q;
}
export function validateStopReceipt(r,q){
 validateCutoverRequest(q);
 if(!exactKeys(r,['schemaVersion','purpose','transitionId','requestDigest','fencingRevision','registryRevision','ownerObservedAt','historical'])||r.schemaVersion!==1||r.purpose!=='owner-cutover-stop-v1'||r.transitionId!==q.transitionId||!isDigest(r.requestDigest)||!isPositive(r.fencingRevision)||!isPositive(r.registryRevision)||!isPositive(r.ownerObservedAt)||r.historical!==true)fail();return r;
}
