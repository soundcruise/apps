import { datasetFixture } from './dataset-fixture.mjs';
import { captureLegacyCandidate, authorityHash } from '../port-local-authority.mjs';
import { createIsolatedMigrationScope, createPortMigrationEngine, issueIsolatedFence } from '../port-authority-migration.mjs';
import { legacySyncName } from '../port-migration-contract.mjs';
export const memoryStorage = (values={}) => {const map=new Map(Object.entries(values));return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};};
export function cleanValues(){const values=datasetFixture();const metadata=JSON.parse(values['cruisePort.syncAssetMetadata']);metadata.gear={};values['cruisePort.syncAssetMetadata']=JSON.stringify(metadata);return values;}
export async function assetFixture(kind='gear',id='photo',practiceId='orphan-owner'){
 const blob=new Blob(['verified-binary-content'],{type:kind==='attachments'?'application/pdf':'image/webp'});
 return {kind,id,blob,hash:await authorityHash(blob),metadata:{id,version:1,mimeType:blob.type,byteSize:blob.size,...(kind==='attachments'?{practiceId,kind:'file',fileName:'practice.pdf'}:{kind:'final',width:1,height:1})}};
}
export async function migrationFixture({bound=false,storage=memoryStorage(cleanValues()),locks={request:async(_n,_o,fn)=>fn()},assets=[],checkpoint=async()=>{},binaryStoreFactory,syncStoreFactory,migrationId='m1',generation='g1'}={}){
 const state={identity:{appId:'port',datasetOwner:'port',sourceNamespace:'legacy',partitionId:'fixture-partition',ownership:bound?'bound-account':'unbound-local',accountId:bound?'A':null,datasetId:bound?'dataset-A':null,...(bound?{accountGeneration:1,membershipGeneration:1,membershipId:'port-membership-a'}:{})},assets,checkpoint};
 state.sync={inspected:true,provenance:bound?{state:'absent',appId:'port',accountId:'A',partitionId:'fixture-partition',datasetId:'dataset-A',databaseName:legacySyncName('A')}:{state:'absent'},outbox:[],shadow:[],conflicts:[],meta:{}};
 state.binary=new Map();state.syncMeta=new Map();
 const binary=gen=>({generation:gen,get:async(k,id)=>state.binary.get(k+':'+id),put:async a=>state.binary.set(a.kind+':'+a.id,structuredClone(a)),list:async()=>[...state.binary.values()]});
 const sync=({accountId,authorityGeneration})=>({accountId,authorityGeneration,databaseName:`sound-cruise-port-authority-sync-v1-account-${encodeURIComponent(accountId)}-generation-${authorityGeneration}`,listOutbox:async()=>[],listShadow:async()=>[],listConflicts:async()=>[],readMeta:async k=>state.syncMeta.get(k),setMeta:async(k,v)=>state.syncMeta.set(k,structuredClone(v))});
 const capture=()=>captureLegacyCandidate({storage,provenance:state.identity,readAssets:async()=>state.assets,readSyncInventory:async()=>state.sync,locks});
 const scope=createIsolatedMigrationScope({storage,partitionId:'fixture-partition',locks,getIdentity:async()=>state.identity,readIdentity:()=>state.identity,setIdentity:value=>{state.identity=value;},binaryStoreFactory:binaryStoreFactory||binary,syncStoreFactory:syncStoreFactory||sync,readSource:capture,checkpoint:(...args)=>state.checkpoint(...args)});
 const engine=()=>createPortMigrationEngine({scope,migrationId,generation});
 const cloud=c=>({authenticated:true,complete:true,appId:'port',accountId:'A',datasetId:'dataset-A',checkpoint:{cursor:'cursor1',manifestHash:'fixture-manifest'},records:c.records.map(r=>({...structuredClone(r),revision:1,operationId:'cloud-'+r.recordId}))});
 const fence=r=>issueIsolatedFence(scope,{transactionalAdmission:true,cutoverBarrier:true,epoch:1,generation,accountId:'A',accountGeneration:1,membershipId:'port-membership-a',membershipGeneration:1,checkpoint:r.checkpoint});
 return {state,storage,scope,capture,engine,cloud,fence,migrationId,generation};
}
export async function prepared(f){const e=f.engine(),c=await f.capture();if(!c.ok)throw Error(JSON.stringify(c.issues));await e.begin(c);await e.stage(c);await e.acknowledgeSource(c.sourceHash);return {e,c};}
export async function sealed(f){const {e,c}=await prepared(f),cloud=f.state.identity.accountId?f.cloud(c):null,fence=cloud?f.fence(cloud):null;await e.reconcile({cloud,fence});await e.seal({fence});return {e,c,cloud,fence};}
