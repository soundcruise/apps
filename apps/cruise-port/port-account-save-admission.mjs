import {isIsolatedDatasetAdmissionOwner} from '../../workers/sound-cruise-sync/src/account-save-admission.js';
const datasetAdmissions = new WeakSet(), datasetPrepared = new WeakMap(), datasetGuards = new WeakMap();
export const isIsolatedPortDatasetAdmission = value => datasetAdmissions.has(value);
// Explicit isolated owner connection. No boot import, HTTP route, credentials
// exposed to Studio, independent Account store or replacement Sync engine.
import {authorityProEnvironment} from './port-indexeddb-authority-store.mjs';
import {digest,frozen,fail} from './port-idb-authority-contract.mjs';

export function createIsolatedPortSaveAdmission({scope,mutationStore,owner,timeoutMs=1000,allowPortDataset=false}={}) {
 const env=authorityProEnvironment(scope);env.assertLive();
 if(!env.fixtureOnly||owner?.fixtureOnly!==true||allowPortDataset&&!isIsolatedDatasetAdmissionOwner(owner)||
  ['prepare','assertCurrent','guard'].some(k=>typeof owner?.[k]!=='function')||
  ['capture','inspect','current'].some(k=>typeof mutationStore?.[k]!=='function')||
  !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw fail('save-admission-isolation-required');
 let disposed=false;
 const live=()=>{env.assertLive();if(disposed)throw fail('save-admission-disposed');};
 async function bounded(fn) {
  let timer;
  try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('save-admission-timeout')),timeoutMs);})]);}
  finally{clearTimeout(timer);}
 }
 const admission = Object.freeze({fixtureOnly:true,
  async prepare(input) {
   live();const context=await mutationStore.capture(),account=await mutationStore.inspect(context),i=input.identity;
   if(account?.accountId!==i.accountId||account.accountDeviceId!==input.account.accountDeviceId||
     typeof account.accountCredential!=='string'||!await mutationStore.current(context))throw fail('save-admission-source-stale');
   const q=frozen({contractVersion:1,purpose:'port-dataset-save',operationId:input.operationId,action:input.action,
    partitionId:i.partitionId,datasetGeneration:input.generation,targetKey:allowPortDataset&&input.action==='savePortDataset'?'*':'cruisePort.metronome',
    accountId:i.accountId,accountDeviceId:account.accountDeviceId,accountGeneration:i.accountGeneration,
    membershipId:i.membershipId,membershipGeneration:i.membershipGeneration,credentialVersion:input.credentialVersion,
    sourceDigest:digest(input.account),baseRevision:input.baseRevision,changesDigest:input.changesDigest});
   const result=await bounded(()=>owner.prepare(q,{authorization:'Bearer '+account.accountCredential}));live();
   if(!await mutationStore.current(context)||!result||!Object.isFrozen(result.context)||!Object.isFrozen(result.binding)||
    result.binding?.owner!=='account'||result.binding.contractVersion!==1)throw fail('save-admission-result-invalid');
   let invalid=false;
   const prepared=Object.freeze({context:result.context,binding:result.binding,
    async assertCurrent(){
     if(invalid||disposed)return false;
     try{live();if(!await mutationStore.current(context)||await bounded(()=>owner.assertCurrent(result.context))!==true||
       !await mutationStore.current(context))throw fail('save-admission-source-stale');live();return true;}
     catch{invalid=true;return false;}
    },
    guard(c,details){
     if(invalid||disposed||c!==result.context)return false;
     try{live();const verdict=owner.guard(c,details);if(verdict?.then){verdict.catch?.(()=>{});invalid=true;return false;}
      if(verdict!==true)invalid=true;return verdict===true;}
     catch{invalid=true;return false;}
    }
   });
   if(allowPortDataset&&input.action==='savePortDataset')datasetPrepared.set(prepared,{scope,operationId:input.operationId,generation:input.generation,action:input.action,baseRevision:input.baseRevision,changesDigest:input.changesDigest,identity:frozen({accountDigest:digest(input.account),identity:i,credentialVersion:input.credentialVersion,admission:result.binding})});
   return prepared;
  },
  dispose(){disposed=true;}
 });
 if(allowPortDataset)datasetAdmissions.add(admission);
 return admission;
}

// Only a genuine, exact Account admission can mint a store-verifiable guard.
export function createDatasetOwnerCommitGuard(scope, prepared, beforeCommit) {
 const p=datasetPrepared.get(prepared);
 if(!p||p.scope!==scope||typeof beforeCommit!=='function')throw fail('owner-guard-admission-required');
 const guard=details=>{beforeCommit();return prepared.guard(prepared.context,{...details,authorizationIdentity:p.identity})===true;};
 datasetGuards.set(guard,p);return guard;
}
export function verifyDatasetOwnerCommitGuard(scope,guard,request) {
 const p=datasetGuards.get(guard);
 return !!p&&p.scope===scope&&p.operationId===request.operationId&&p.generation===request.generation&&
 p.action===request.action&&p.baseRevision===request.base?.head?.revision&&p.changesDigest===digest(request.changes);
}
