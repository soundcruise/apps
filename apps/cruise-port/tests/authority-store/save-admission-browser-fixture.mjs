// Browser owner model only; SQL durability/clock-floor tests live in the Node
// fixture. This is not an HTTP authorization service or a production owner DB.
import {setupProvider} from './account-provider-fixture.mjs';
import {createTestAuthorityScope} from './test-authority.mjs';
import {createAccountCredential,accountCredentialVerifier} from '../../../../workers/sound-cruise-sync/src/account-crypto.js';
import {handleIsolatedAccountOwnerContext} from '../../../../workers/sound-cruise-sync/src/account-owner-context.js';
import {createIsolatedAccountSaveAdmissionOwner} from '../../../../workers/sound-cruise-sync/src/account-save-admission.js';
import {createIsolatedPortSaveAdmission} from '../../port-account-save-admission.mjs';
import {createIsolatedMetronomeBpmOwner,createIsolatedBpmPendingStore} from '../../port-metronome-bpm-isolated.mjs';
import {createIsolatedBpmController} from '../../../cruise-studio/js/modules/metronome/isolated-bpm-controller.mjs';
export async function setupBrowserSaveAdmission({indexedDB,root,name,seed=true,checkpoint,record}={}){
 const clock={server:100000,wall:1000,mono:0,origin:'browser-fixture'},pepper='isolated-browser-owner-admission-test-pepper';
 const a=createAccountCredential(),options={indexedDB,name,partitionId:'fixture-partition',now:()=>clock.wall,monotonicNow:()=>clock.mono,clockIdentity:()=>clock.origin};
 const x=await setupProvider({indexedDB,root,scopeName:name,seed,record:record||{accountId:'A',accountDeviceId:a.deviceId,accountCredential:a.credential},ownerContext:true,clockOptions:options});
 const actual=await x.mutationStore.inspect(await x.mutationStore.capture());
 const row={device_id:actual.accountDeviceId,account_id:'A',credential_version:3,credential_verifier:await accountCredentialVerifier(actual.accountCredential,pepper),revoked_at:null,
  account_state:'active',generation:7,admission_provenance:'production',membership_id:'member-A',membership_state:'active',membership_generation:11,membership_deleted_at:null,
  rollout_mode:'open',account_read_enabled:1,runtime_generation:1,device_linked:1,save_enabled:1,credential_issued_at:99000,credential_expires_at:160000,
  credential_lease_revision:1,credential_lifecycle:'active',credential_clock_floor:100000};
 const state={expireAtGuard:false,asyncGuard:false};
 const probe=()=>{if(clock.server>=row.credential_clock_floor){row.credential_clock_floor=clock.server;if(row.credential_lifecycle==='active'&&clock.server>=row.credential_expires_at)row.credential_lifecycle='expired';}return structuredClone(row);};
 const backend={fixtureOnly:true,boundary:'co-located-owner-fixture',readPrimary:async()=>probe(),readAtCommit(){if(state.expireAtGuard)clock.server=row.credential_expires_at;return state.asyncGuard?Promise.resolve(probe()):probe();}};
 const server=createIsolatedAccountSaveAdmissionOwner({backend,pepper,now:()=>clock.server});
 x.respond((url,options)=>handleIsolatedAccountOwnerContext(new Request(url,{headers:options.headers}),{pepper,now:()=>clock.server,
  db:{withSession(mode){if(mode!=='first-primary')throw Error('replica-forbidden');return {prepare(){return {bind(){return {first:async()=>probe()};}};}};}}}));
 const scope=createTestAuthorityScope(options),admission=createIsolatedPortSaveAdmission({scope,mutationStore:x.mutationStore,owner:server});
 const owner=await createIsolatedMetronomeBpmOwner({scope,indexedDB,generation:'g1',provider:x.provider,finalAdmission:admission,checkpoint});
 const pending=createIsolatedBpmPendingStore({indexedDB,scopeName:name}),controller=createIsolatedBpmController({owner,pending});
 return {...x,owner,controller,state,clock,scope,async rows(){return x.rows();},dispose(){owner.dispose();admission.dispose();server.dispose();x.dispose();}};
}
