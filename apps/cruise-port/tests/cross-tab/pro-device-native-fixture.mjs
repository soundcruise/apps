// Disposable browser fixture: actual shared gate/helper/crypto/IDB, local auth transport only.
const nativeWall=Date.now,nativeMono=performance.now.bind(performance);
let installed=false;
let terminalResponses=0;
let serverCredential=null;
let serverMode='healthy',leaseBudget=60000,renewAfter=60000,release,waiting=false;
// One explicit synthetic backend clock, independent of each renderer's client clocks.
let serverTime=100000,requestSequence=0,requests=[];
function setServerTime(value){if(!Number.isSafeInteger(value)||value<0)throw Error('invalid fixture server time');serverTime=value;}

export function proServerMode(options){const mode=typeof options==='string'?options:options.mode;if(typeof options==='object')setServerTime(options.serverTime);serverMode=mode;serverCredential=JSON.parse(localStorage.getItem('soundCruiseProAuth')||'null')?.credential;return true;}
export function proServerState(){return {mode:serverMode,waiting,terminalResponses,serverTime,clientWall:Date.now(),requests:requests.map(r=>({...r}))};}
export function proServerRelease(){release?.();return true;}
export async function installFormalProFixture(clock,{primary=false,budget=60000,revalidateBudget=budget,preservePending=false,serverTime:initialServerTime=100000}={}){
 serverMode='healthy';terminalResponses=0;leaseBudget=budget;renewAfter=revalidateBudget;setServerTime(initialServerTime);requestSequence=0;requests=[];
 Date.now=()=>clock().wall??nativeWall();Object.defineProperty(performance,'now',{configurable:true,value:()=>clock().mono??nativeMono()});
 const authKey='soundCruiseProAuth';
 if(primary){localStorage.removeItem(authKey);if(!preservePending)localStorage.removeItem('soundCruiseProRevokePending');}
 await import('../../../shared/pro-device-session.js');
 if(!installed){
  const originalFetch=window.fetch.bind(window);window.fetch=async(url,options={})=>{
   const u=new URL(url,location.href);
   // Pro routes are synthetic in-process responses, never forwarded to a server.
   if(!u.pathname.startsWith('/v2/pro-auth/')){
    if(!['127.0.0.1','localhost'].includes(u.hostname))throw Error('non-loopback fixture request blocked');
    return originalFetch(url,options);
   }
   const requested=options.headers?.Authorization?.replace(/^Bearer /,'');
   const mode=serverCredential&&requested!==serverCredential?'healthy':serverMode;
   if(mode==='offline')throw Error('isolated offline');
   // Pin response data when issued, before any delivery wait or qualification switch.
   const now=serverTime,responseLease=leaseBudget,responseRenew=renewAfter,body=options.body?JSON.parse(options.body):{},auth=JSON.parse(localStorage.getItem(authKey)||'null');
   const observation={id:++requestSequence,endpoint:u.pathname,issuedServerTime:now,generation:auth?.generation??1,
    status:mode==='terminal'||mode==='delayed-terminal'?401:mode==='503'||mode==='429'?Number(mode):200,pinnedQualification:requested===serverCredential,held:mode==='delayed-terminal',delivered:false};requests.push(observation);
   if(mode==='delayed-terminal'){waiting=true;await new Promise(r=>release=r);waiting=false;}
   observation.delivered=true;

   if(mode==='terminal'||mode==='delayed-terminal'){terminalResponses++;return new Response(JSON.stringify({ok:false,code:'invalid_credential'}),{status:401,headers:{'Content-Type':'application/json'}});}
   if(mode==='503'||mode==='429')return new Response(JSON.stringify({ok:false,code:'server_unavailable'}),{status:Number(mode),headers:{'Content-Type':'application/json'}});
   const result=u.pathname.endsWith('/challenge')?{ok:true,message:'isolated-native-pro-proof',challenge:'fixture',mac:'fixture'}:
    {ok:true,generation:auth?.generation??1,session:{version:3,serverTime:now,issuedAt:now,boundAt:now,lastValidatedAt:now,
     inactiveExpiresAt:now+90*86400000,accessExpiresAt:now+responseLease,offlineUntil:now+responseLease,revalidateAfter:now+responseRenew,devicePublicKey:body.publicKey}};
   return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
  };
  await new Promise((ok,no)=>{const s=document.createElement('script');s.src='/apps/shared/pro-gate.js';s.onload=ok;s.onerror=no;document.head.append(s);});installed=true;
 }
 const client=SoundCruiseProDeviceSession.createClient({isCurrent:a=>JSON.parse(localStorage.getItem(authKey)||'null')?.credential===a.credential});
 const credential='scp1.'+crypto.randomUUID()+'.'+'A'.repeat(43),auth={v:2,credential,generation:1,sessionVersion:3,validatedAt:Date.now()};
 if(primary){localStorage.setItem(authKey,JSON.stringify(auth));localStorage.setItem('soundCruiseProOperationEpoch',crypto.randomUUID());}
 const current=JSON.parse(localStorage.getItem(authKey));if(!current)throw Error('fixture auth missing');
 const now=serverTime;if(primary){const publicKey=await client.publicKey();if(!await client.accept(current,{version:3,serverTime:now,issuedAt:now,boundAt:now,lastValidatedAt:now,
  inactiveExpiresAt:now+90*86400000,accessExpiresAt:now+budget,offlineUntil:now+budget,revalidateAfter:now+revalidateBudget,devicePublicKey:publicKey}))throw Error('fixture receipt rejected');}
 return true;
}

// Observe only public identity, bounded allowance and a digest of the sealed receipt.
// Never return the qualification, device key, plaintext or receipt envelope.
export async function proQualificationCheckpoint(){
 const auth=JSON.parse(localStorage.getItem('soundCruiseProAuth')||'null');
 if(!auth)return {valid:false};
 const identity=await SoundCruiseProDeviceSession.operationIdentity(auth);
 const {digest}=await import('../../port-idb-authority-contract.mjs');
 const allowance=await SoundCruiseProDeviceSession.createReadOnlyClient().allowance(auth);
 const envelope=await new Promise((ok,no)=>{
  const r=indexedDB.open('sound-cruise-pro-device-session-v1',1);
  r.onupgradeneeded=()=>r.transaction.abort();r.onerror=()=>no(r.error);
  r.onsuccess=()=>{const db=r.result,tx=db.transaction('state','readonly'),q=tx.objectStore('state').get(identity.receiptIdentity);
   tx.oncomplete=()=>{db.close();ok(q.result);};tx.onabort=()=>{db.close();no(tx.error);};};
 });
 const hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
 const receiptPresent=!!(envelope?.iv&&envelope?.ciphertext);
 const receiptDigest=receiptPresent?hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([hex(envelope.iv),hex(envelope.ciphertext)])))):null;
 return {valid:allowance.ok===true,generation:auth.generation,sessionVersion:auth.sessionVersion,
  credentialFingerprint:identity.credentialFingerprint,operationCredentialFingerprint:digest(auth.credential),
  operationRevisionFingerprint:digest(JSON.stringify([SoundCruiseProOperationSource.read().revision,localStorage.getItem('soundCruiseProOperationEpoch')])),receiptPresent,receiptDigest,
  offlineRemainingMs:allowance.offlineRemainingMs,clientWall:Date.now(),serverTime};
}
