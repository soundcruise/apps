// Port-owned local operations. No Studio owner acquisition, Sync activation or import-time I/O.
import { createOperationBoundary, createProOperationResolver } from './port-write-readiness.mjs?v=1.22.10';
import { portRepository } from './port-dataset-storage.js?v=1.22.10';
export function createPortMetronomeAuthorization({ storage, source = () => globalThis.SoundCruiseProOperationSource,
    now = Date.now, monotonicNow = () => globalThis.performance?.now?.() } = {}) {
    const auth = () => { const value=source()?.read(); return value?.auth && {...value.auth,operationRevision:value.revision}; };
    const context = () => ({generation:1,repositoryEpoch:'port-legacy',writerProtocol:1,repositoryProtocol:1,
        locksAvailable:portRepository(storage).sharedWriteCapable,pro:{allowed:false}});
    const resolvePro=createProOperationResolver({readAuth:async()=>auth(),readAuthSync:auth,now,monotonicNow,
        knownRevoked:()=>source()?.read().revoked!==false,
        client:{validate:(a,o)=>source()?.validate(a,o)||Promise.resolve({ok:false})}});
    // Existing Port local owner, not compatible-writer evidence for Studio/shared adoption.
    const boundary=createOperationBoundary({readContext:async()=>context(),readContextSync:context,resolvePro,
        allWritersCompatible:true,now});
    return Object.freeze({async prepare(action,targetKeys){
        const base=await portRepository(storage).readDatasetState();
        const operation=await boundary.begin(action,base,{targetKeys});
        return {operationId:operation.operationId,authorizationContext:operation,
            commitGuard:(token,details)=>boundary.commitGuard(token,details),
            assertCurrent:()=>boundary.assertCurrent(operation)};
    }});
}
