import {createTestAuthorityScope} from './test-authority.mjs';
import {control,values} from './fixture.mjs';
import {openIDBAuthorityStore} from '../../port-indexeddb-authority-store.mjs';
import {createIsolatedPortAccountProvider} from '../../port-account-provider.mjs';
import {createIsolatedAccountMutationStore,enrollIsolatedAccountWriters,cutoverIsolatedAccountStore} from '../../../shared/sync-account/account-mutation-receipts.mjs';
export const account=id=>({accountId:id,accountDeviceId:'device-'+id,accountCredential:'synthetic-'+id,extra:{keep:true}});
export const identity=id=>({...control().identity,ownership:'bound-account',accountId:id,accountGeneration:7,membershipId:'member-'+id,membershipGeneration:11});
export const summary=id=>({ok:true,account:{id,state:'active',generation:7},memberships:[{appId:'chord',id:'chord-'+id,state:'active',generation:4}]});
export const devices=id=>({ok:true,devices:[{id:'device-'+id,isCurrent:true,revokedAt:null,credentialVersion:3}]});
export async function rows(factory,edit) {
 const db=await new Promise((r,j)=>{const q=factory.open('sound-cruise-sync-account');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
 try{return await new Promise((r,j)=>{const tx=db.transaction('account-meta-v3',edit?'readwrite':'readonly'),s=tx.objectStore('account-meta-v3'),k=s.getAllKeys(),v=s.getAll();v.onsuccess=()=>edit?.(s);tx.oncomplete=()=>r(k.result.map((k,n)=>[k,v.result[n]]));tx.onabort=()=>j(tx.error);});}finally{db.close();}
}
export async function setupProvider({indexedDB,root,scopeName='sound-cruise-port-authority-v1-fixture-provider',seed=true}={}) {
 const scope=()=>createTestAuthorityScope({indexedDB,name:scopeName,partitionId:'fixture-partition'});
 const store=await openIDBAuthorityStore(scope());
 if(seed){await root.storage.setAccount(account('A'),indexedDB);if(!(await store.initialize({generation:'g1',control:{...control(),identity:identity('A')},values:values(),operationId:'seed'})).ok)throw Error('seed-failed');
 await enrollIsolatedAccountWriters({indexedDB,scopeName});await cutoverIsolatedAccountStore({indexedDB,scopeName});}
 const mutationStore=createIsolatedAccountMutationStore({indexedDB,scopeName,protocol:3}),requests=[];
 let currentHook=async()=>{};
 let respond=async(url,options)=>{const id=options.headers.get('Authorization').slice('Bearer synthetic-'.length);return {ok:true,status:200,json:async()=>url.endsWith('/summary')?summary(id):devices(id)};};
 const provider=await createIsolatedPortAccountProvider({scope:scope(),mutationStore:{...mutationStore,async current(c){const r=await mutationStore.current(c);await currentHook(r);return r;}},accountStorage:root.storage,AccountClient:root.AccountClient,
 fetchImpl:(url,options)=>{if(!url.startsWith('https://account-provider.invalid/v2/accounts/')||options.method!=='GET')throw Error('forbidden-network');requests.push({url,method:options.method});return respond(url,options);}});
 return {provider,store,mutationStore,requests,respond:fn=>respond=fn,onCurrent:fn=>currentHook=fn,rows:edit=>rows(indexedDB,edit),
 refresh:()=>provider.refresh({generation:'g1',operationId:'observation-'+requests.length}),
 dispose(){provider.dispose();store.dispose();}};
}
