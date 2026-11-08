// Dormant Port-owned L3c adapter. No import-time browser/storage/network work.
import {createProOperationResolver} from './port-write-readiness.mjs';
import {authorityProEnvironment} from './port-indexeddb-authority-store.mjs';
import {digest,equal,fail,frozen,identifier,AUTHORIZATION_MARGIN_MS} from './port-idb-authority-contract.mjs';
const contexts=new WeakMap(),guards=new WeakMap();
let officialHelper;
const proActions=new Set(['saveAdvanced','createPreset','applyPresetAdvanced']);
const AUTH='soundCruiseProAuth',EPOCH='soundCruiseProOperationEpoch',PENDING='soundCruiseProRevokePending';
const credentialPattern=/^scp1\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/;
function receiptReader(indexedDB){
 return Object.freeze({read:key=>new Promise((resolve,reject)=>{
  let settled=false;const request=indexedDB.open('sound-cruise-pro-device-session-v1',1);
  const denied=()=>{settled=true;reject(fail('pro-receipt-unavailable'));};
  request.onupgradeneeded=()=>request.transaction.abort();request.onerror=request.onblocked=denied;
  request.onsuccess=()=>{
   const db=request.result;if(settled){db.close();return;}db.onversionchange=()=>db.close();
   try{const tx=db.transaction('state','readonly'),read=tx.objectStore('state').get(key);
    tx.oncomplete=()=>{db.close();settled=true;resolve(read.result);};tx.onabort=tx.onerror=()=>{db.close();denied();};
   }catch{db.close();denied();}
  };
 })});
}

export function describeTrustedProContext(scope,token){const c=contexts.get(token);return c?.scope===scope?c.identity:null;}
export function invalidateTrustedProClock(scope,token){const c=contexts.get(token);if(c?.scope===scope)c.blocked=true;}
export function captureTrustedProContext(scope,token,p){
 const c=contexts.get(token);if(!c)return;
 if(c.scope!==scope||p.policy!=='pro'||c.generation!==p.generation||c.operationId!==p.operationId||c.action!==p.action||!equal(c.identity,p.authorizationIdentity))throw fail('pro-operation-binding-changed');
 if(c.fingerprint&&c.fingerprint!==p.fingerprint)throw fail('pro-operation-binding-changed');
 c.fingerprint=p.fingerprint;c.targets??=Object.keys(p.changes).sort();
}
export function verifyTrustedProGuard(scope,token,guard,p){
 const c=contexts.get(token);return !!c&&c.scope===scope&&guards.get(guard)===token&&c.generation===p.generation&&
 c.operationId===p.operationId&&c.action===p.action&&c.fingerprint===p.fingerprint&&equal(c.identity,p.authorizationIdentity)&&equal(c.targets,Object.keys(p.changes).sort());
}

export async function createAuthorityProDeviceAdapter({scope,...unsupported}={}){
 if(Object.keys(unsupported).length)throw fail('pro-adapter-options-invalid');
 const env=authorityProEnvironment(scope);env.assertLive();
 // Import the actual helper, rather than trusting a caller-supplied client.
 // Explicit adapter creation only; this has no production boot entry point.
 const helper=await (officialHelper??=import('../shared/pro-device-session.js').then(()=>globalThis.window?.SoundCruiseProDeviceSession));
 const source=globalThis.window?.SoundCruiseProOperationSource;
 if(!helper?.createReadOnlyClient||!source?.read||!source?.validate)throw fail('pro-source-unavailable');
 const receiptStore=receiptReader(globalThis.window.indexedDB);
 let disposed=false;
 function auth(){
  try{
   if(disposed||globalThis.window.SoundCruiseProOperationSource!==source)return null;
   const storage=globalThis.window.localStorage,a=JSON.parse(storage.getItem(AUTH)||'null'),s=source.read(),pending=JSON.parse(storage.getItem(PENDING)||'[]');
   if(!a||a.v!==2||a.sessionVersion!==3||!credentialPattern.test(a.credential)||!Number.isSafeInteger(a.generation)||a.generation<1||
      s.revoked!==false||!Array.isArray(pending)||pending.includes(a.credential)||!equal([a.credential,a.generation,a.sessionVersion],[s.auth?.credential,s.auth?.generation,s.auth?.sessionVersion])||typeof s.revision!=='string')return null;
   return {...a,operationRevision:JSON.stringify([s.revision,storage.getItem(EPOCH)])};
  }catch{return null;}
 }
 return Object.freeze({
  async authorize({generation,operationId,action,expectedIdentity}={}){
   env.assertLive();identifier(generation);identifier(operationId);if(disposed||!proActions.has(action))throw fail('pro-operation-invalid');
   const origin=env.clockIdentity();if(!(typeof origin==='string'&&origin||typeof origin==='number'&&Number.isFinite(origin)))throw fail('pro-clock-origin-invalid');
   const readOnly=helper.createReadOnlyClient({store:receiptStore,now:env.now,monotonicNow:env.monotonicNow,isCurrent:a=>equal(auth(),a)});
   const resolver=createProOperationResolver({readAuth:async()=>auth(),readAuthSync:auth,now:env.now,monotonicNow:env.monotonicNow,knownRevoked:()=>!auth(),
    client:{async validate(a){
     const validated=await source.validate(a,{force:false});if(validated?.ok!==true||validated.generation!==a.generation)return {ok:false};
     const receipt=await readOnly.allowance(a);
     return receipt.ok?{...validated,offlineRemainingMs:Math.min(validated.offlineRemainingMs,receipt.offlineRemainingMs)}:{ok:false};
    }}});
   const a=auth();if(!a)throw fail('pro-required');
   const proof=await resolver(action==='applyPresetAdvanced'?'saveAdvanced':action);
   env.assertLive();if(!proof.allowed||!equal(auth(),a)||env.clockIdentity()!==origin)throw fail('pro-required');
   const identity=frozen({generation:a.generation,credentialFingerprint:digest(a.credential),sessionVersion:a.sessionVersion,operationRevisionFingerprint:digest(a.operationRevision)});
   if(expectedIdentity!==undefined&&!equal(identity,expectedIdentity))throw fail('pro-operation-identity-changed');
   const token=Object.freeze({}),c={scope,generation,operationId,action,identity,origin,resolver,proof,blocked:false};contexts.set(token,c);
   const guard=(context,details)=>{
    try{
     env.assertLive();if(disposed||c.blocked||context!==token||details.operationId!==operationId||details.action!==action||details.generation!==generation||
        !equal(c.targets,[...details.targetKeys].sort())||env.clockIdentity()!==origin)throw fail('pro-operation-invalid');
     const margins=resolver.commitMargins(proof);
     if(margins.wallMarginMs<AUTHORIZATION_MARGIN_MS||margins.monoMarginMs<AUTHORIZATION_MARGIN_MS)throw fail('pro-proof-margin-insufficient');
     return Object.freeze({ok:true,policy:'pro',...identity,...margins});
    }catch(e){c.blocked=true;throw e;}
   };
   guards.set(guard,token);return Object.freeze({authorizationContext:token,commitGuard:guard});
  },
  dispose(){disposed=true;}
 });
}
