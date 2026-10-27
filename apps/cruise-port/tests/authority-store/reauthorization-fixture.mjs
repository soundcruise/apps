import {credentialAdoptionFixture} from './credential-adoption-fixture.mjs';
import {createTestAuthorityScope} from './test-authority.mjs';
import {createIsolatedAuthorityReauthorization} from '../../port-authority-reauthorization-isolated.mjs';
import {createIsolatedAccountSaveRoutes} from '../../../../workers/sound-cruise-sync/src/account-save-routes-isolated.js';
import {cleanValues} from '../migration-fixture.mjs';
import {bpmHandle} from './pointer-fixture.mjs';
export function installReauthorizationFixture(db){db.raw.exec('CREATE TABLE sync_account_authority_reauthorizations(account_id TEXT NOT NULL,operation_id TEXT NOT NULL,request_digest TEXT NOT NULL,request_json TEXT NOT NULL,observed_at INTEGER NOT NULL,PRIMARY KEY(account_id,operation_id));');}
export async function reauthorizationFixture(t,{checkpoint,dispatch,ownerCheckpoint,afterAdopt=true,clean=true}={}){
 const x=await credentialAdoptionFixture(t);
 // Known empty-material fixture only; no real legacy or user data is changed.
 if(clean){const h=await x.head(),p=x.store.prepare({base:h.snapshot,operationId:'known-empty-material-fixture',action:'fixture-save',changes:{'cruisePort.syncAssetMetadata':cleanValues()['cruisePort.syncAssetMetadata']}});if(!(await x.store.commit(p)).ok)throw Error('fixture-material-setup');}
 const oldPrepared=bpmHandle(x.store,(await x.head()).snapshot,'old-prepared');
 const candidate=await x.inspect(),adoptionOperationId=crypto.randomUUID();if(!candidate.ok)throw Error(candidate.reason);
 if(afterAdopt){const a=await x.owner.adopt({candidate,operationId:adoptionOperationId,explicit:true});if(!a.ok)throw Error(a.reason);}
 installReauthorizationFixture(x.s.db);const routeOptions={...x.s.routeOptions,enableAuthorityReauthorization:true,...(ownerCheckpoint?{checkpoint:ownerCheckpoint}:{})},routes=createIsolatedAccountSaveRoutes(routeOptions);t.after(()=>routes.dispose());
 const options={indexedDB:x.indexedDB,source:x.mutationStore,adoption:x.owner,locks:x.locks||{request:(_n,_o,fn)=>fn()},url:'https://owner-route.invalid/__isolated/account/v1/',getBackendCredentials:()=>x.s.credentials,dispatch:dispatch?req=>dispatch(req,routes,x):req=>routes.handle(req),checkpoint};
 // Native Web Locks and Node's serial equivalent share the Account lock name.
 let queue=Promise.resolve();options.locks={request(_n,_o,fn){const r=queue.then(fn);queue=r.catch(()=>{});return r;}};
 const make=async overrides=>{const scope=createTestAuthorityScope({indexedDB:x.indexedDB,name:x.scope.name,partitionId:'fixture-partition',now:()=>x.clock.wall,monotonicNow:()=>x.clock.mono,clockIdentity:()=>x.clock.origin});const owner=await createIsolatedAuthorityReauthorization({...options,scope,...overrides});t.after(()=>owner.dispose());return owner;};const reauthorization=await make();
 return {...x,routes,routeOptions,oldPrepared,adoptionOperationId,reauthorization,make,run:(operationId=crypto.randomUUID())=>reauthorization.run({adoptionOperationId,sourceGeneration:'g1',operationId,explicit:true})};
}
