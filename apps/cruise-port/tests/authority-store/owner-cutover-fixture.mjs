import {ownerOperationFixture} from './owner-operation-fixture.mjs';
import {createIsolatedAccountSaveRoutes} from '../../../../workers/sound-cruise-sync/src/account-save-routes-isolated.js';
import {installOwnerCutoverFixture,seedOwnerCutoverFixture} from '../../../../workers/sound-cruise-sync/test/account-owner-cutover-fixture.js';
import {createTestAuthorityScope} from './test-authority.mjs';
import {openIDBAuthorityStore,claimPortAuthorityIssuer} from '../../port-indexeddb-authority-store.mjs';
import {createIsolatedOwnerCutover} from '../../port-owner-cutover-isolated.mjs';
import {createIsolatedOwnerOperation} from '../../port-owner-operation-isolated.mjs';
import {serialLocks} from './credential-adoption-fixture.mjs';
import {digest} from '../../port-idb-authority-contract.mjs';
import {createIsolatedRecoveryBackupStore} from '../../../shared/sync-account/app-backup-recovery.mjs';
export async function ownerCutoverFixture(t,{checkpoint,ownerCheckpoint,dispatch,timeoutMs}={}){
 const x=await ownerOperationFixture(t),options={indexedDB:x.indexedDB,name:x.scope.name,partitionId:'fixture-partition',now:()=>x.clock.wall,monotonicNow:()=>x.clock.mono,clockIdentity:()=>x.clock.origin},bootstrapScope=createTestAuthorityScope(options),bootstrap=await openIDBAuthorityStore(bootstrapScope),bootstrapIssuer=claimPortAuthorityIssuer(bootstrapScope);t.after(()=>bootstrap.dispose());
 const b=await bootstrap.fixtureBootstrapConsumer({generation:x.birth.generation,capability:bootstrapIssuer.issue('control:fixture-consumer',{generation:x.birth.generation})});if(!b.ok)throw Error('bootstrap '+b.reason);installOwnerCutoverFixture(x.s.db);
 const source=(await x.opHead()).snapshot,q=await x.options.makeBackendRequest({operationId:crypto.randomUUID(),bpm:140,expectedBackendRevision:0,localTicket:{generation:x.birth.generation,body:{base:source,changes:{'cruisePort.metronome':source.values['cruisePort.metronome']}}}});await seedOwnerCutoverFixture(x.s.db,{request:q,authority:{pointer:source.pointer},consumer:b.consumer});
 const routeOptions={...x.routeOptions,enableOperationLease:true,enableOwnerCutover:true,...(ownerCheckpoint?{checkpoint:ownerCheckpoint}:{})},routes=createIsolatedAccountSaveRoutes(routeOptions);t.after(()=>routes.dispose());const locks=serialLocks();
 const make=async(overrides={})=>{const scope=createTestAuthorityScope(options),owner=await createIsolatedOwnerCutover({scope,indexedDB:x.indexedDB,source:x.mutationStore,locks,url:'https://owner-route.invalid/__isolated/account/v1/',getBackendCredentials:()=>x.s.credentials,makeBackendRequest:x.options.makeBackendRequest,checkpoint,timeoutMs,dispatch:dispatch?req=>dispatch(req,routes,x):req=>routes.handle(req),...overrides});t.after(()=>owner.dispose());return owner;};
 const makeBoundOperation=async(overrides={})=>{const scope=createTestAuthorityScope(options),operation=await createIsolatedOwnerOperation({scope,indexedDB:x.indexedDB,source:x.mutationStore,locks,url:'https://owner-route.invalid/__isolated/account/v1/',getBackendCredentials:()=>x.s.credentials,makeBackendRequest:x.options.makeBackendRequest,dispatch:req=>routes.handle(req),consumerBinding:true,...overrides});t.after(()=>operation.dispose());return operation;};const cutover=await make(),operation=await makeBoundOperation();
 const prepare=(bpm=155,revision=0,id=crypto.randomUUID())=>operation.prepare({generation:x.birth.generation,reauthorizationOperationId:x.reauthOperationId,operationId:id,bpm,expectedBackendRevision:revision,explicit:true});
 const begin=(transitionId=crypto.randomUUID(),extra={})=>cutover.begin({sourceGeneration:x.birth.generation,reauthorizationOperationId:x.reauthOperationId,targetConsumerId:'studio-bpm-readonly-fixture-v1',transitionId,explicit:true,...extra});
 return {...x,cutover,cutoverOperation:operation,prepareBound:prepare,beginCutover:begin,makeCutover:make,makeBoundOperation,cutoverRoutes:routes,cutoverRouteOptions:routeOptions,consumer:()=>bootstrap.readConsumer(),backup:createIsolatedRecoveryBackupStore({indexedDB:x.indexedDB,scopeName:x.scope.name}),digest};
}
