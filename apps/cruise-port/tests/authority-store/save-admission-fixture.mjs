import {setupProvider} from './account-provider-fixture.mjs';
import {createTestAuthorityScope} from './test-authority.mjs';
import {seedSaveAdmissionOwner} from '../../../../workers/sound-cruise-sync/test/account-save-admission-fixture.js';
import {handleIsolatedAccountOwnerContext} from '../../../../workers/sound-cruise-sync/src/account-owner-context.js';
import {createIsolatedPortSaveAdmission} from '../../port-account-save-admission.mjs';
import {createIsolatedMetronomeBpmOwner,createIsolatedBpmPendingStore} from '../../port-metronome-bpm-isolated.mjs';
import {createIsolatedBpmController} from '../../../cruise-studio/js/modules/metronome/isolated-bpm-controller.mjs';
export async function setupSaveAdmission({indexedDB,root,clock={server:100000,wall:1000,mono:0,origin:'fixture'},scopeName='sound-cruise-port-authority-v1-fixture-save-admission',checkpoint,backendHook,ownerWrapper,timeoutMs=1000}={}){
 const server=await seedSaveAdmissionOwner({clock}),options={indexedDB,name:scopeName,partitionId:'fixture-partition',now:()=>clock.wall,monotonicNow:()=>clock.mono,clockIdentity:()=>clock.origin};
 const x=await setupProvider({indexedDB,root,scopeName,record:{...server.account,extra:{keep:true}},ownerContext:true,clockOptions:options});
 x.respond((url,options)=>handleIsolatedAccountOwnerContext(new Request(url,{headers:options.headers}),{db:server.db,pepper:server.pepper,now:()=>clock.server}));
 if(backendHook)backendHook(server.backend);
 server.owner=server.createOwner();
 const scope=createTestAuthorityScope(options),admission=createIsolatedPortSaveAdmission({scope,mutationStore:x.mutationStore,owner:ownerWrapper?ownerWrapper(server.owner):server.owner,timeoutMs});
 const owner=await createIsolatedMetronomeBpmOwner({scope,indexedDB,generation:'g1',provider:x.provider,finalAdmission:admission,checkpoint});
 const pending=createIsolatedBpmPendingStore({indexedDB,scopeName}),controller=createIsolatedBpmController({owner,pending});
 return {...x,server,clock,scope,admission,owner,pending,controller,async reopen(){owner.dispose();admission.dispose();server.owner.dispose();
   const reopenedScope=createTestAuthorityScope(options),a=createIsolatedPortSaveAdmission({scope:reopenedScope,mutationStore:x.mutationStore,owner:server.createOwner(),timeoutMs});
   const o=await createIsolatedMetronomeBpmOwner({scope:reopenedScope,indexedDB,generation:'g1',provider:x.provider,finalAdmission:a});
   return {owner:o,admission:a,controller:createIsolatedBpmController({owner:o,pending}),dispose(){o.dispose();a.dispose();}};},
  dispose(){owner.dispose();admission.dispose();server.owner.dispose();x.dispose();server.db.raw.close();}};
}
