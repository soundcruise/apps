// Pure isolated owner protocol. No router, SQL, storage or credential access.
export const REAUTHORIZATION_KEYS=Object.freeze(['contractVersion','purpose','operationId','accountId','accountDeviceId','accountGeneration','membershipId','membershipGeneration','credentialVersion','credentialLeaseRevision','runtimeGeneration','sourceGeneration','targetGeneration','sourceAuthorityDigest','sourceAccountDigest','sourceManifestDigest','backupInventoryDigest','adoptionOperationId','adoptionReceiptChecksum','expectedPointerEpoch','expectedControlEpoch']);
export function validateReauthorizationRequest(q){
 const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x),positive=x=>Number.isSafeInteger(x)&&x>0;
 if(!q||![Object.prototype,null].includes(Object.getPrototypeOf(q))||Reflect.ownKeys(q).length!==REAUTHORIZATION_KEYS.length||!REAUTHORIZATION_KEYS.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(q,k)||{},'value'))||
 q.contractVersion!==1||q.purpose!=='authority-reauthorization'||!['operationId','accountId','accountDeviceId','membershipId','sourceGeneration','targetGeneration','adoptionOperationId'].every(k=>id(q[k]))||
 !['accountGeneration','membershipGeneration','credentialVersion','credentialLeaseRevision','runtimeGeneration','expectedPointerEpoch','expectedControlEpoch'].every(k=>positive(q[k]))||
 !['sourceAuthorityDigest','sourceAccountDigest','sourceManifestDigest','backupInventoryDigest','adoptionReceiptChecksum'].every(k=>hash(q[k]))||q.sourceGeneration===q.targetGeneration||q.operationId===q.adoptionOperationId||JSON.stringify(q).length>8192)throw Error('reauthorization-request-invalid');
 return q;
}
