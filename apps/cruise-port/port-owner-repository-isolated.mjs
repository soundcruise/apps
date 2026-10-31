import {isIsolatedPortDatasetAdmission,createDatasetOwnerCommitGuard} from './port-account-save-admission.mjs';
// Explicit isolated adoption connection. Never imported by product boot.
// Reuses Port's Authority/repository; Project credentials cannot enter this API.
import {authorityProEnvironment, authorityUsesIndexedDB, openIDBAuthorityStore} from './port-indexeddb-authority-store.mjs';
import {openIsolatedIDBRepositoryBackend} from './port-indexeddb-repository-backend.mjs';
import {registerIsolatedRepositoryBackend} from './port-repository-backend.mjs?v=1.23.1';
import {PortDatasetRepository, PORT_DATASET_KEYS} from './port-dataset-repository.js?v=1.26.0';
import {digest,equal,frozen,fail} from './port-idb-authority-contract.mjs';
export async function openIsolatedPortOwnerRepository({scope,indexedDB,generation,source,provider,proAdapter,finalAdmission,checkpoint=async()=>{}}={}) {
 const env=authorityProEnvironment(scope);env.assertLive();
 if(!isIsolatedPortDatasetAdmission(finalAdmission)||!env.fixtureOnly||!authorityUsesIndexedDB(scope,indexedDB)||
  ['capture','inspect','current'].some(k=>typeof source?.[k]!=='function')||
  ['refresh','isCurrentObservation'].some(k=>typeof provider?.[k]!=='function')||typeof proAdapter?.authorize!=='function')throw fail('port-owner-isolation-required');
 const backend=await openIsolatedIDBRepositoryBackend({scope,generation}),store=await openIDBAuthorityStore(scope);
 const operations=new WeakMap();let retired=false;
 const live=()=>{env.assertLive();if(retired)throw fail('port-writer-retired');};
 async function pin(){
  live();const context=await source.capture(),account=await source.inspect(context),h=await store.hydrate(generation),s=h.snapshot;
  if(h.readiness!=='writable'||s?.control.identity.ownership!=='bound-account'||account?.accountId!==s.control.identity.accountId||!account.accountDeviceId)throw fail('port-owner-not-adopted');
  const observation=await provider.refresh({generation,operationId:'port-observe-'+crypto.randomUUID()});
  const i=s.control.identity;
  if(observation.status!=='observed'||observation.credentialFreshness!=='owner-confirmed-at-read'||observation.accountId!==i.accountId||observation.accountDeviceId!==account.accountDeviceId||
   observation.serverAccountGeneration!==i.accountGeneration||observation.portMembership?.id!==i.membershipId||observation.portMembership?.generation!==i.membershipGeneration)throw fail('port-owner-unconfirmed');
  const p={context,observation,snapshot:s,account,accountDigest:digest(account)};await current(p);return p;
 }
 async function current(p){
  live();if(!await source.current(p.context)||!await provider.isCurrentObservation(p.observation))throw fail('port-owner-stale');
  const h=await store.hydrate(generation);
  if(h.readiness!=='writable'||!equal(h.snapshot.control,p.snapshot.control)||!equal(h.snapshot.pointer,p.snapshot.pointer)||!await source.current(p.context))throw fail('port-owner-stale');
 }
 const reject=e=>({ok:false,status:'rejected',reason:e.code||'port-owner-unproven',canWrite:false});
 const api={
  async prepare(options,writer){
   const p=await pin(),operationId=options.operationId||crypto.randomUUID();
   const known=await store.lookupOperation(generation,operationId);
   if(!known.ok)throw fail('port-operation-unproven');
   if(known.result)throw fail('port-operation-reconcile-required');
   const auth=await proAdapter.authorize({generation,operationId,action:'savePortDataset'});await current(p);
   const handle=await backend.prepareWrite({...options,source:'savePortDataset',operationId,dependencyKeys:PORT_DATASET_KEYS,
    authorizationContext:auth.authorizationContext,operationData:null,assertCurrent:async()=>{await options.assertCurrent?.();await current(p);}},writer);
   if(handle?.rejected)return handle;
   const final=await finalAdmission.prepare({operationId,action:'savePortDataset',generation,identity:p.snapshot.control.identity,
    account:p.account,baseRevision:p.snapshot.head.revision,credentialVersion:p.observation.credentialVersion,changesDigest:digest(handle.request.changes)});
   const ownerCommitGuard=createDatasetOwnerCommitGuard(scope,final,live);

   const token=Object.freeze({operationId});operations.set(token,{p,handle,auth,final,ownerCommitGuard,attempted:false});return token;
  },
  async commit(token){
   const o=operations.get(token);if(!o||o.attempted)return reject(fail('port-operation-reconcile-required'));o.attempted=true;
   try{live();if(!await source.current(o.p.context))throw fail('port-owner-stale');const fresh=await pin();
    if(fresh.accountDigest!==o.p.accountDigest || fresh.observation.credentialVersion!==o.p.observation.credentialVersion || !equal(fresh.snapshot.control,o.p.snapshot.control))throw fail('port-owner-stale');
    o.p=fresh;await checkpoint('before-commit');await current(o.p);
    // The existing Authority transaction checks the current pointer/control,
    // record versions and branded Pro guard at the local linearization point.
    const result=await backend.commitPreparedWrite(o.handle,{commitGuard:o.auth.commitGuard,ownerCommitGuard:o.ownerCommitGuard});
    await checkpoint('after-commit',result);return result;
   }catch(e){return {ok:false,status:'UNKNOWN',reason:e.code||'port-local-outcome-unknown',operationId:token.operationId,canWrite:false};}
  },
  async reconcile(operationId){
   // Explicit historical lookup only: never executes writer code or retries it.
   const p=await pin(),fact=await store.lookupOperation(generation,operationId);await current(p);
   if(!fact.ok||!fact.result)return frozen({ok:false,status:'UNKNOWN',operationId,canWrite:false});
   const result=await store.readCommittedDataset(generation,operationId);await current(p);
   if(!result.ok)return frozen({ok:false,status:'UNKNOWN',operationId,canWrite:false});
   return frozen({ok:true,status:'HISTORICAL',operationId,result:result.result,canWrite:false,authorizesNewOperation:false});
  },
  async refresh(){await pin();return backend.hydrate();},
  retire(){retired=true;},
  dispose(){retired=true;backend.dispose();store.dispose();}
 };
 const facade=registerIsolatedRepositoryBackend({inspect:()=>backend.inspect(),hydrate:()=>api.refresh(),get sharedWriteCapable(){return !retired&&backend.sharedWriteCapable;},
  async runWrite(options,writer){try{const token=await api.prepare(options,writer);return token?.rejected||await api.commit(token);}catch(e){return reject(e);}}});
 api.repository=new PortDatasetRepository({backend:facade});
 try{await api.refresh();}catch(e){api.dispose();throw e;}
 return Object.freeze(api);
}
