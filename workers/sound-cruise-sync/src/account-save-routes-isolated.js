// No product router import. The caller must supply the isolated owner capability.
import {createIsolatedCredentialLifecycle,exactRequestDigest} from './account-credential-lifecycle.js';
import {recoverRenewalCredential} from './account-renewal-recovery.js';
import {createIsolatedAccountSaveTransaction} from './account-save-transaction.js';
const ROOT='/__isolated/account/v1/';
const paths=Object.freeze({'credential/issue':'issue','credential/renew/begin':'begin-renew','credential/renew/finish':'finish-renew','credential/renew/fail':'fail-renew','credential/revoke':'revoke'});
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(status,value)=>new Response(JSON.stringify({canWrite:false,operationAuthorized:false,productionReady:false,...value}),{status,headers});
async function body(req){
 if(req.headers.get('Content-Type')?.split(';')[0]!=='application/json'||Number(req.headers.get('Content-Length')||0)>40000)throw Error('body-invalid');
 const reader=req.body?.getReader();if(!reader)throw Error('body-invalid');let n=0,parts=[];
 try{while(true){const r=await reader.read();if(r.done)break;n+=r.value.length;if(n>40000){await reader.cancel();throw Error('body-limit');}parts.push(r.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(n);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
const shape=(x,keys)=>x&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
export function createIsolatedAccountSaveRoutes(options={}){
 if(options.fixtureOnly!==true)throw Error('route-isolation-required');
 const lifecycle=createIsolatedCredentialLifecycle({...options,pepper:options.accountPepper}),transaction=createIsolatedAccountSaveTransaction({...options,requireLifecycleBinding:true});
 return Object.freeze({fixtureOnly:true,async handle(req){
  const url=new URL(req.url),path=url.pathname.slice(ROOT.length);
  if(!url.pathname.startsWith(ROOT)||!Object.hasOwn(paths,path)&&!['save','reconcile','credential/renew/reconcile'].includes(path))return reply(404,{ok:false,code:'not-found'});
  if(req.method!=='POST'||url.search||url.hash)return reply(405,{ok:false,code:'method-denied'});
  if(!req.headers.get('Authorization')?.startsWith('Bearer '))return reply(401,{ok:false,code:'authentication-required'});
  let input;try{input=await body(req);}catch{return reply(400,{ok:false,code:'request-invalid'});}
  const credentials={accountAuthorization:req.headers.get('Authorization'),appAuthorization:req.headers.get('X-Sound-Cruise-App-Authorization'),proAuthorization:req.headers.get('X-Sound-Cruise-Pro-Authorization')};
  try{let result;
   if(path==='credential/renew/reconcile'){
    if(options.enableRenewalRecovery!==true)return reply(404,{ok:false,code:'not-found'});
    result=await recoverRenewalCredential({db:options.db,pepper:options.accountPepper,policy:options.policy,request:input,authorization:credentials.accountAuthorization,secret:req.headers.get('X-Sound-Cruise-Renewal-Recovery'),checkpoint:options.checkpoint});
   }else if(Object.hasOwn(paths,path))result=await lifecycle.mutate(paths[path],input,{authorization:credentials.accountAuthorization,
    ...(req.headers.has('X-Sound-Cruise-Renewal-Recovery')?{recovery:{secret:req.headers.get('X-Sound-Cruise-Renewal-Recovery'),requestDigest:req.headers.get('X-Sound-Cruise-Renewal-Digest')}}:{})});
   else if(path==='save'){
    if(!shape(input,['request','requestDigest'])||!/^[a-f0-9]{64}$/.test(input.requestDigest)||await exactRequestDigest(input.request)!==input.requestDigest)return reply(400,{ok:false,code:'request-invalid'});
    const p=await transaction.prepare(input.request,credentials);result=p.ok?await transaction.commit(p):p;
   }else{
    if(!shape(input,['binding']))return reply(400,{ok:false,code:'request-invalid'});result=await transaction.reconcileCurrent(input.binding,credentials);
   }
   // Authentication failures never expose rows, operation existence or raw SQL.
   return result.ok?reply(200,result):reply(409,{ok:false,code:'owner-operation-unproven',recoveryRequired:true});
  }catch{return reply(409,{ok:false,code:'owner-operation-unproven',recoveryRequired:true});}
 },dispose(){lifecycle.dispose();transaction.dispose();}});
}
