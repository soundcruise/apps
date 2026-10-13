// Real shared gate + Device Session + real Worker, isolated SQLite/IDB only.
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {handleRequest} from '../../../../workers/sound-cruise-sync/src/app.js';
import {createSqliteD1} from '../../../../workers/sound-cruise-sync/test/sqlite-d1.js';
import {IDBFactory,IDBObjectStore,dump} from './pointer-fixture.mjs';
import {createTestAuthorityScope} from './test-authority.mjs';
import {openIDBAuthorityStore} from '../../port-indexeddb-authority-store.mjs';
import {createAuthorityProDeviceAdapter} from '../../port-authority-pro-device-adapter.mjs';
import {values,control} from './fixture.mjs';
export {IDBObjectStore,dump};
const gate=readFileSync(new URL('../../../shared/pro-gate.js',import.meta.url),'utf8');
const AUTH='soundCruiseProAuth',EPOCH='soundCruiseProOperationEpoch';
export async function proFixture(t,{bound=false}={}){
 const saved=new Map(),keys=['window','indexedDB','localStorage','performance','location'];for(const k of keys)saved.set(k,Object.getOwnPropertyDescriptor(globalThis,k));
 const dateNow=Date.now,clock={wall:1791900000000,mono:0,origin:'pro-origin'},factory=new IDBFactory(),data=new Map(),db=createSqliteD1();
 let store,adapter;
 t.after(()=>{adapter?.dispose();store?.dispose();db.close();Date.now=dateNow;for(const [k,d]of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];delete globalThis.SoundCruiseProOperationSource;delete globalThis.addEventListener;});
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 globalThis.window=globalThis;globalThis.indexedDB=factory;globalThis.localStorage=storage;
 globalThis.location={hostname:'127.0.0.1',pathname:'/apps/cruise-port/tests/',protocol:'http:',href:'http://127.0.0.1:8766'};
 Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock.mono,timeOrigin:clock.origin}});Date.now=()=>clock.wall;
 await import('../../../shared/pro-device-session.js');
 let offline=false,response=null,hold=null;
 const transport={setResponse:r=>{response=r;},delay(){let release,started;const begun=new Promise(r=>started=r),wait=new Promise(r=>release=r);hold={started,wait};return {begun,release};}};
 const origin='http://127.0.0.1:8766',env={SYNC_DB:db,ALLOWED_ORIGINS:origin,PRO_CREDENTIAL_PEPPER:'isolated-l3c-credential-pepper-at-least-32',
  PRO_LOCKOUT_PEPPER:'isolated-l3c-lockout-pepper-at-least-32',PRO_PASSCODE_SLOT_A:'0007',PRO_VERIFY_RATE_LIMITER:{limit:async()=>({success:true})},SYNC_RATE_LIMITER:{limit:async()=>({success:true})}};
 db.raw.prepare('UPDATE pro_auth_state SET session_lifecycle_started_at=?,unbound_backend_until=?').run(clock.wall,clock.wall+90*86400000);
 const fetcher=async(url,options={})=>{if(String(url).includes('/device-session/')||String(url).endsWith('/session')){if(hold){const h=hold;hold=null;h.started();await h.wait;}const selected=typeof response==='function'?response(String(url)):response;if(selected){if(selected.throw)throw Error(selected.throw);return new Response(JSON.stringify(selected.body),{status:selected.status});}}if(offline)throw Error('isolated offline');return handleRequest(new Request(url,{...options,headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.20',...options.headers}}),env,null,{now:()=>clock.wall,verifyProTurnstile:async()=>({ok:true})});};
 const document={body:null,readyState:'loading',addEventListener(){}};
 const events=()=>{};globalThis.addEventListener=events;
 const reloadSource=()=>vm.runInNewContext(gate,{window:globalThis,document,localStorage:storage,location:{hostname:'127.0.0.1',pathname:'/apps/cruise-port/tests/',protocol:'http:',href:origin},
  crypto:globalThis.crypto,TextEncoder,fetch:fetcher,AbortController,URL,Date,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){}});
 reloadSource();
 const client=SoundCruiseProDeviceSession.createClient({now:()=>clock.wall,monotonicNow:()=>clock.mono,request:async(path,o)=>{const r=await fetcher('https://sync.example/v2/pro-auth'+path,o);return {status:r.status,body:await r.json()};},isCurrent:a=>JSON.parse(storage.getItem(AUTH)||'null')?.credential===a.credential});
 async function login(){
  const r=await fetcher('https://sync.example/v2/pro-auth/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passcode:'0007',turnstileToken:'isolated',devicePublicKey:await client.publicKey()})});
  if(r.status!==201)throw Error('fixture login failed');const body=await r.json(),auth={v:2,credential:body.credential,generation:body.generation,sessionVersion:3};
  storage.setItem(AUTH,JSON.stringify(auth));storage.setItem(EPOCH,crypto.randomUUID());if(!await client.accept(auth,body.session))throw Error('fixture receipt rejected');return auth;
 }
 await login();
 const scope=createTestAuthorityScope({indexedDB:factory,partitionId:'fixture-partition',now:()=>{if(clock.throwWall)throw Error('isolated clock provider failure');return clock.wall;},monotonicNow:()=>{if(clock.throwMono)throw Error('isolated clock provider failure');return clock.mono;},clockIdentity:()=>clock.origin},{fixtureMutations:false});store=await openIDBAuthorityStore(scope);
 const c=control();if(bound)c.identity={...c.identity,ownership:'bound-account',accountId:'A',accountGeneration:2,membershipId:'member-A',membershipGeneration:3};
 const init=await store.initialize({generation:'g1',operationId:'seed',control:c,values:values()});if(!init.ok)throw Error(init.reason);
 adapter=await createAuthorityProDeviceAdapter({scope});
 return {scope,store,adapter,factory,clock,storage,db,client,login,transport,reloadSource,set offline(v){offline=v;},auth(){return JSON.parse(storage.getItem(AUTH));},change(patch){storage.setItem(AUTH,JSON.stringify({...JSON.parse(storage.getItem(AUTH)),...patch}));},
  async prepare({id='advanced',action='saveAdvanced',changes,operationData=null,dependencyKeys=[],authorization,base}={}){
   base??=(await store.hydrate('g1')).snapshot;changes??={'cruisePort.metronome':JSON.stringify({...JSON.parse(base.values['cruisePort.metronome']),volume:85})};
   const proof=authorization??await adapter.authorize({generation:'g1',operationId:id,action});
   const handle=store.prepare({base,operationId:id,action,changes,operationData,dependencyKeys,authorizationContext:proof.authorizationContext});
   const reserved=await store.reserveOperation(handle);return {handle,proof,base,reserved,identity:store.preparedIdentity(handle)};
  }};
}
