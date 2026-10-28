import {ownerCutoverFixture} from './owner-cutover-fixture.mjs';
import {createTestAuthorityScope} from './test-authority.mjs';
import {createIsolatedAccountSaveRoutes} from '../../../../workers/sound-cruise-sync/src/account-save-routes-isolated.js';
import {createIsolatedOwnerOperation} from '../../port-owner-operation-isolated.mjs';
import {serialLocks} from './credential-adoption-fixture.mjs';
export async function consumerReadmissionFixture(t,options={}){
 const x=await ownerCutoverFixture(t),b=await x.beginCutover();if(!b.ok)throw Error(JSON.stringify(b));
 const pub=await x.cutover.publish({transitionId:b.transitionId,explicit:true});if(!pub.ok)throw Error(JSON.stringify(pub));
 const consumer=(await x.consumer()).consumer,generation=consumer.authorityGeneration,routeOptions={...x.cutoverRouteOptions,enableConsumerReadmission:true,...(options.ownerCheckpoint?{checkpoint:options.ownerCheckpoint}:{})},routes=createIsolatedAccountSaveRoutes(routeOptions);t.after(()=>routes.dispose());const locks=serialLocks();
 const make=async(extra={})=>{const scope=createTestAuthorityScope({indexedDB:x.indexedDB,name:x.scope.name,partitionId:'fixture-partition',now:()=>x.clock.wall,monotonicNow:()=>x.clock.mono,clockIdentity:()=>x.clock.origin});
 const owner=await createIsolatedOwnerOperation({scope,indexedDB:x.indexedDB,source:x.mutationStore,locks,url:'https://owner-route.invalid/__isolated/account/v1/',getBackendCredentials:()=>x.s.credentials,makeBackendRequest:x.options.makeBackendRequest,consumerBinding:true,consumerReadmission:b.transitionId,dispatch:options.dispatch?req=>options.dispatch(req,routes,x):req=>routes.handle(req),checkpoint:options.checkpoint,...extra});t.after(()=>owner.dispose());return owner;};
 const owner=await make();return {...x,owner,readmission:owner,readmissionRoutes:routes,readmissionRouteOptions:routeOptions,transitionId:b.transitionId,generation,makeReadmission:make,headNew:()=>x.store.hydrate(generation),prepareNew:(bpm=161,revision=0,id=crypto.randomUUID())=>owner.prepare({generation,operationId:id,bpm,expectedBackendRevision:revision,explicit:true})};
}

