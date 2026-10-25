import {backendSaveFixture} from './backend-save-fixture.mjs';
import {clockRecoveryFixture} from '../../../../workers/sound-cruise-sync/test/account-clock-recovery-fixture.js';
import {createIsolatedRenewalVault,createIsolatedRenewalRecoveryClient} from '../../port-renewal-recovery-isolated.mjs';
import {createIsolatedCredentialAdoption} from '../../port-credential-adoption-isolated.mjs';
import {createTestAuthorityScope} from './test-authority.mjs';
export function serialLocks(){let queue=Promise.resolve();return {request(name,options,fn){const r=queue.then(fn);queue=r.catch(()=>{});return r;}};}
export async function credentialAdoptionFixture(t,{checkpoint,dispatch,vaultOverride,timeoutMs}={}){
 const x=await backendSaveFixture(t),s=await clockRecoveryFixture({existing:x.f});t.after(()=>s.dispose());
 const vault=createIsolatedRenewalVault({indexedDB:x.indexedDB,scopeName:x.scope.name}),url='https://owner-route.invalid/__isolated/account/v1/';
 const base={indexedDB:x.indexedDB,source:x.mutationStore,vault:vaultOverride?vaultOverride(vault):vault,dispatch:dispatch?req=>dispatch(req,s):req=>s.routes.handle(req),url};
 const recovery=createIsolatedRenewalRecoveryClient({...base,scope:x.scope});t.after(()=>recovery.dispose());
 const begin=await s.send('credential/renew/begin',s.lifecycle());if(begin.status!==200)throw Error('begin');
 const h=await recovery.prepare({request:s.lifecycle({transitionId:begin.body.transitionId}),identity:{accountId:'A',accountDeviceId:s.account.accountDeviceId,membershipId:'member-A'}});
 if(!h.ok)throw Error(h.reason);const renewed=await recovery.finish(h);if(!renewed.ok)throw Error(renewed.reason);
 const locks=serialLocks(),make=async options=>{const scope=createTestAuthorityScope({indexedDB:x.indexedDB,name:x.scope.name,partitionId:'fixture-partition',now:()=>x.clock.wall,monotonicNow:()=>x.clock.mono,clockIdentity:()=>x.clock.origin});const owner=await createIsolatedCredentialAdoption({...base,scope,accountStorage:x.root.storage,locks,checkpoint,timeoutMs,...options});t.after(()=>owner.dispose());return owner;};
 const owner=await make();
 return {...x,s,vault,recovery,h,renewed,owner,make,inspect:()=>owner.inspect({renewalOperationId:h.operationId,generation:'g1'}),record:async()=>x.mutationStore.inspect(await x.mutationStore.capture())};
}
