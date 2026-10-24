import {setupProvider,identity} from './account-provider-fixture.mjs';
import {createTestAuthorityScope} from './test-authority.mjs';
import {createIsolatedMetronomeBpmOwner,createIsolatedBpmPendingStore} from '../../port-metronome-bpm-isolated.mjs';
import {createIsolatedBpmController} from '../../../cruise-studio/js/modules/metronome/isolated-bpm-controller.mjs';
import {equal} from '../../port-idb-authority-contract.mjs';
// Synthetic backend verdict only. Distinct from provider observation and its
// five-second budget; never installed by production Account/Port/Studio boot.
export async function setupBpm({indexedDB,root,seed=true,scopeName='sound-cruise-port-authority-v1-fixture-bpm',generation='g1',accountId='A',checkpoint,clock={wall:1000,mono:0,origin:'fixture',server:100000},server={revoked:false,deny:false,membershipGeneration:11,credentialVersion:3}}={}){
 const options={indexedDB,name:scopeName,partitionId:'fixture-partition',now:()=>clock.wall,monotonicNow:()=>clock.mono,clockIdentity:()=>clock.origin};
 const x=await setupProvider({indexedDB,root,scopeName,seed,ownerContext:true,clockOptions:options});
 x.respond(async(url)=>{const q=new URL(url).searchParams;
  if(server.revoked)return {ok:false,status:401,json:async()=>({ok:false,code:'invalid_account_credential'})};
  return {ok:true,status:200,json:async()=>({ok:true,contractVersion:1,purpose:'account-owner-observation',requestId:q.get('requestId'),challenge:q.get('challenge'),operationAuthorized:false,canWrite:false,credentialExpiresAt:null,
   identity:{appId:'port',accountId,accountDeviceId:'device-'+accountId,accountGeneration:7,membershipId:'member-'+accountId,membershipGeneration:server.membershipGeneration,credentialVersion:server.credentialVersion},
   freshness:{kind:'primary-snapshot',snapshotStartedAt:clock.server,observedAt:clock.server,expiresAt:clock.server+5000,remainingMs:5000,runtimeGeneration:1}})};
 });
 const scope=createTestAuthorityScope(options),finalAdmission={fixtureOnly:true,async prepare(request){
  const context=Object.freeze({request}),lease={expires:clock.server+60000,mono:clock.mono,wall:clock.wall,origin:clock.origin,invalid:false};
  const check=()=>{if(lease.invalid)return false;if(clock.mono<lease.mono||clock.wall<lease.wall||clock.origin!==lease.origin){lease.invalid=true;return false;}
   lease.mono=clock.mono;lease.wall=clock.wall;
   return server.revoked===false&&server.deny===false&&clock.server<lease.expires&&server.membershipGeneration===request.identity.membershipGeneration&&server.credentialVersion===3;};
  return {context,assertCurrent:async()=>check(),guard:(c,d)=>c===context&&d.action==='saveBpm'&&d.operationId===request.operationId&&equal(d.control.identity,request.identity)&&check()};
 }};
 const owner=await createIsolatedMetronomeBpmOwner({scope,indexedDB,generation,provider:x.provider,finalAdmission,checkpoint});
 const pending=createIsolatedBpmPendingStore({indexedDB,scopeName}),controller=createIsolatedBpmController({owner,pending});
 return {...x,owner,pending,controller,scope,server,clock,finalAdmission,async setRaw(raw){const h=await x.store.hydrate('g1');return x.store.commit(x.store.prepare({base:h.snapshot,operationId:'fixture-'+crypto.randomUUID(),action:'fixture-save',changes:{'cruisePort.metronome':raw}}));},
  dispose(){owner.dispose();x.dispose();}};
}
