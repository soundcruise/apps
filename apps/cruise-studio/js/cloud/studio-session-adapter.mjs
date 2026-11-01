import {createStudioTransport,isStudioTransport} from './studio-transport.mjs';
/* Explicit isolated host adapter. Native Account/Pro remain the only authentication owners. */
const fail=code=>{throw Object.assign(Error(code),{code});};
const clone=x=>JSON.parse(JSON.stringify(x));
export function createStudioSessionAdapter({enabled=false,ownerEndpoint,fetchImpl=fetch,proSessionFactory=globalThis.SoundCruiseProDeviceSession?.createClient,proStore,transport=null,accountStorage=null,localStorage=globalThis.localStorage}={}){
 transport ||= createStudioTransport({endpoint:ownerEndpoint,fetchImpl});if(!isStudioTransport(transport))fail('untrusted-transport');fetchImpl=transport.fetch;const owner=new URL(transport.endpoint),origin=owner.origin;if(typeof proSessionFactory!=='function')fail('session-dependencies');
 let credentials=null,verified=null,epoch=0,authId=null,selected=null;
 const shared=accountStorage;
 const unwatch=shared?.subscribeAccount?.(()=>{selected=null;invalidate();});
 function nativePro(){try{return JSON.parse(localStorage.getItem('soundCruiseProAuth')||'null');}catch{return null;}}
 function proRevision(){return shared?JSON.stringify([localStorage.getItem('soundCruiseProOperationEpoch'),0,false]):String(epoch);}
 function proCurrent(a){
  const p=nativePro();let pending;
  try{pending=JSON.parse(localStorage.getItem('soundCruiseProRevokePending')||'[]');}catch{return false;}
  if(!Array.isArray(pending)||pending.includes(a.credential))return false;
  const source=globalThis.SoundCruiseProOperationSource;
  if(source){const state=source.read?.();if(!state||state.revoked!==false||state.auth?.credential!==a.credential)return false;}
  return p?.credential===a.credential&&p.generation===a.generation&&a.operationRevision===proRevision();
 }
 async function sharedAccount(){
  if(!shared)return;
  const generation=shared.getGeneration?.(), account=await shared.getAccount();
  if(generation!==shared.getGeneration?.())fail('session-changed');
  if(!account?.accountCredential||!account.accountId)fail('shared-account-required');
  const p=nativePro();if(!p?.credential||!Number.isSafeInteger(p.generation))fail('shared-pro-required');
  if(credentials?.credential!==account.accountCredential||credentials?.proCredential!==p.credential||credentials?.proGeneration!==p.generation)invalidate();
  credentials={credential:account.accountCredential,proCredential:p.credential,proGeneration:p.generation};
  selected={accountId:account.accountId,credential:account.accountCredential,generation};
 }
 async function assertShared(){
  if(!shared)return;
  const observed=selected, account=await shared.getAccount();
  if(!observed||observed.generation!==shared.getGeneration?.()||account?.accountCredential!==observed.credential||account.accountId!==observed.accountId){invalidate();fail('session-changed');}
 }

 function on(){if(!enabled)fail('session-off');}
 function invalidate(){epoch++;verified=null;authId=null;}
 function setCredentials(value){on();invalidate();if(!value||typeof value.credential!=='string'||typeof value.proCredential!=='string'||!Number.isSafeInteger(value.proGeneration)||value.proGeneration<1)fail('credential-input');credentials={...value};}
 async function request(path,options={}){on();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const r=await fetchImpl(origin+path,{...options,credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal});return{status:r.status,body:await r.json()};}finally{clearTimeout(timer);}}
 const pro=proSessionFactory({...(proStore?{store:proStore}:{}),isCurrent:a=>Boolean(credentials&&a.credential===credentials.proCredential&&a.operationRevision===proRevision()&&(!shared||proCurrent(a))),request:(path,options)=>request('/v2/pro-auth'+path,options)});
 async function ownerCall(kind,payload,requireAccount=true){on();
 const sharedPro=shared?{credential:credentials?.proCredential,generation:credentials?.proGeneration,operationRevision:['session','enroll'].includes(kind)?proRevision():verified?.proOperationRevision}:null;
 if(shared){await assertShared();if(!proCurrent(sharedPro))fail('shared-pro-changed');}if(!credentials)fail('credentials-required');const captured=epoch,c=credentials;const r=await request(owner.pathname,{method:'POST',headers:{'Content-Type':'application/json',...(requireAccount?{Authorization:'Bearer '+c.credential}:{}),'X-Sound-Cruise-Pro-Authorization':'Bearer '+c.proCredential},body:JSON.stringify({kind,payload})});if(shared){await assertShared();if(!proCurrent(sharedPro))fail('shared-pro-changed');}if(captured!==epoch)fail('session-changed');if(r.status!==200){verified=null;throw Object.assign(Error(r.body.code||'owner-hold'),{code:r.body.code||'owner-hold'});}return r.body;}
 async function authenticatePro(passcode,turnstileToken){on();if(shared){await sharedAccount();return renewPro();}if(!/^[0-9]{4}$/.test(passcode)||typeof turnstileToken!=='string'||!turnstileToken)fail('pro-input');invalidate();const captured=epoch,publicKey=await pro.publicKey();if(captured!==epoch)fail('session-changed');const r=await request('/v2/pro-auth/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passcode,turnstileToken,devicePublicKey:publicKey})});if(captured!==epoch)fail('session-changed');if(r.status!==201||r.body.ok!==true||!/^scp1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(r.body.credential)||!Number.isSafeInteger(r.body.generation)||r.body.generation<1)fail('pro-authentication-failed');credentials={credential:credentials?.credential||'',proCredential:r.body.credential,proGeneration:r.body.generation};const accepted=await pro.accept({credential:credentials.proCredential,generation:credentials.proGeneration,operationRevision:proRevision()},r.body.session);if(captured!==epoch||!accepted){verified=null;fail('pro-device-binding');}return{status:'pro-authenticated'};}
 function useAccount(credential){on();if(shared)return sharedAccount().then(()=>{if(credential&&credential!==credentials.credential)fail('use-shared-account-management');});if(typeof credential!=='string'||!/^sca1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(credential)||!credentials?.proCredential)fail('account-input');invalidate();credentials={...credentials,credential};}
 async function renewPro(){on();if(!credentials)fail('credentials-required');const captured=epoch;const result=await pro.validate({credential:credentials.proCredential,generation:credentials.proGeneration,operationRevision:proRevision()},{force:true});if(captured!==epoch)fail('session-changed');if(!result.ok||result.online!==true){verified=null;fail(result.revoked?'pro-revoked':'online-pro-proof-required');}return result;}
 async function refresh(){await sharedAccount();const captured=epoch;verified=null;await renewPro();const info=await ownerCall('session',{publicKey:await pro.publicKey()});if(captured!==epoch||info.type!=='studio-owner-session-v1'||info.binding?.audience!=='studio-document-v1'||info.binding.deviceId!==credentials.credential.split('.')[1]||info.binding.proId!==credentials.proCredential.split('.')[1]||info.binding.proGeneration!==credentials.proGeneration||!Number.isSafeInteger(info.serverTime)||!Number.isSafeInteger(info.validUntil)||info.validUntil<=info.serverTime||info.validUntil<=Date.now())fail('session-response');await assertShared();if(shared&&info.binding.accountId!==selected.accountId)fail('shared-account-mismatch');const identity=JSON.stringify(info.binding);if(identity!==authId){authId=identity;}verified={proOperationRevision:proRevision(),binding:clone(info.binding),sessionId:String(epoch)+':'+identity,validUntil:info.validUntil,credential:credentials.credential,proCredential:credentials.proCredential};return{type:info.type,binding:clone(info.binding),validUntil:info.validUntil,capacity:info.capacity};}
 async function enroll(){await sharedAccount();await renewPro();await ownerCall('enroll',{});return refresh();}
 async function register(input,turnstileToken){if(shared)fail('use-shared-account-management');await renewPro();const r=await ownerCall('register',{input,turnstileToken},false);invalidate();credentials={...credentials,credential:input.credential};await refresh();return r;}
 async function device(input){const r=await ownerCall('device',input);verified=null;return r;}
 async function reconcileIdentity(input){await renewPro();const r=await ownerCall('identity-history',input);if(r.type!=='studio-identity-history-v1'||r.kind!==input.kind||r.operationId!==input.operationId||r.targetDeviceId!==input.targetDeviceId||r.historical!==true||r.authorizesNewOperation!==false)fail('identity-history-mismatch');return r;}
 async function recoverAccount({prepare,commit}){if(shared)fail('use-shared-account-management');on();invalidate();const captured=epoch;await renewPro();for(const [path,payload]of [['prepare',prepare],['commit',commit]]){if(captured!==epoch)fail('session-changed');const r=await request('/v2/accounts/recovery/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(captured!==epoch)fail('session-changed');if(![200,201].includes(r.status)||!r.body.ok)fail(r.body.code||'account-recovery-failed');}
 credentials={...credentials,credential:commit.accountCredential};await ownerCall('recover-enrollment',{proofOperationId:commit.operationId});await refresh();return{status:'recovered',proofOperationId:commit.operationId};}
 // Reconcile a lost Account recovery ACK by resubmitting the SAME native recovery commit,
 // which is keyed by its native operation fingerprint. No new claim or device is generated.
 async function reconcileRecovery(commit){if(shared)fail('use-shared-account-management');on();invalidate();const captured=epoch;await renewPro();const r=await request('/v2/accounts/recovery/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(commit)});if(captured!==epoch||![200,201].includes(r.status)||!r.body.ok)fail('recovery-unknown');credentials={...credentials,credential:commit.accountCredential};await ownerCall('recover-enrollment',{proofOperationId:commit.operationId});await refresh();return{status:'recovered',proofOperationId:commit.operationId};}
 return Object.freeze({authenticatePro,useAccount,setCredentials,refresh,enroll,register,device,reconcileIdentity,recoverAccount,reconcileRecovery,async retention(){return ownerCall('retention',{});},async evidence(){return ownerCall('evidence',{});},async compact(input){const r=await ownerCall('compact',input);verified=null;return r;},async devices(){return ownerCall('devices',{});},readSession(){on();if(shared&&(!selected||selected.generation!==shared.getGeneration?.()||!proCurrent({credential:credentials?.proCredential,generation:credentials?.proGeneration,operationRevision:verified?.proOperationRevision})))fail('session-changed');if(!verified||verified.validUntil<=Date.now())fail('session-required');return{...verified,binding:clone(verified.binding)};},commitLocal(expected,publish){
  if(!shared)return publish();
  const observed=selected;if(!observed||!shared.commitIfAccountCurrent)fail('shared-account-fence-required');
  return shared.commitIfAccountCurrent({accountId:observed.accountId,accountCredential:observed.credential},()=>{
   const now=this.readSession();if(now.sessionId!==expected.sessionId||now.binding.accountId!==expected.binding.accountId)fail('session-changed');return publish();
  });
 },async assertCurrent(expected){await assertShared();const s=this.readSession();if(expected&&(s.sessionId!==expected.sessionId||s.binding.accountId!==expected.binding.accountId))fail('session-changed');},invalidate,dispose(){unwatch?.();invalidate();credentials=null;selected=null;},clear(){invalidate();credentials=null;}});
}
