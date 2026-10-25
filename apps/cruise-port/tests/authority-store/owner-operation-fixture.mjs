import {reauthorizationFixture} from './reauthorization-fixture.mjs';
import {createIsolatedAccountSaveRoutes} from '../../../../workers/sound-cruise-sync/src/account-save-routes-isolated.js';
import {installOperationLeaseFixture} from '../../../../workers/sound-cruise-sync/test/account-operation-lease-fixture.js';
import {createIsolatedOwnerOperation} from '../../port-owner-operation-isolated.mjs';
import {createTestAuthorityScope} from './test-authority.mjs';
import {serialLocks} from './credential-adoption-fixture.mjs';
export async function ownerOperationFixture(t,{checkpoint,ownerCheckpoint,dispatch,timeoutMs}={}){
 const x=await reauthorizationFixture(t),reauthOperationId=crypto.randomUUID(),birth=await x.run(reauthOperationId);if(!birth.ok)throw Error('fixture-reauthorization');
 installOperationLeaseFixture(x.s.db);const routeOptions={...x.routeOptions,enableOperationLease:true,...(ownerCheckpoint?{checkpoint:ownerCheckpoint}:{})},routes=createIsolatedAccountSaveRoutes(routeOptions);t.after(()=>routes.dispose());const locks=serialLocks();
 const make=async(overrides={})=>{const scope=createTestAuthorityScope({indexedDB:x.indexedDB,name:x.scope.name,partitionId:'fixture-partition',now:()=>x.clock.wall,monotonicNow:()=>x.clock.mono,clockIdentity:()=>x.clock.origin});const owner=await createIsolatedOwnerOperation({scope,indexedDB:x.indexedDB,source:x.mutationStore,locks,url:'https://owner-route.invalid/__isolated/account/v1/',getBackendCredentials:()=>x.s.credentials,makeBackendRequest:x.options.makeBackendRequest,dispatch:dispatch?req=>dispatch(req,routes,x):req=>routes.handle(req),checkpoint,timeoutMs,...overrides});t.after(()=>owner.dispose());return owner;};
 const operation=await make();return {...x,operation,operationRoutes:routes,birth,reauthOperationId,makeOperation:make,opHead:()=>x.store.hydrate(birth.generation),opPrepare:(bpm=150,revision=0,id=crypto.randomUUID(),extra={})=>operation.prepare({generation:birth.generation,reauthorizationOperationId:reauthOperationId,operationId:id,bpm,expectedBackendRevision:revision,explicit:true,...extra})};
}
