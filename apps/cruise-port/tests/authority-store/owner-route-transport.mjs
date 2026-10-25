// Test-only transport: no normal consumer installation or credential persistence.
import {exactRequestDigest} from '../../../../workers/sound-cruise-sync/src/account-credential-lifecycle.js';
export function createIsolatedOwnerRouteTransport({url,dispatch,credentials,fixtureOnly=false}={}){
 const target=new URL(url);if(fixtureOnly!==true||!['127.0.0.1','localhost','owner-route.invalid'].includes(target.hostname)||typeof dispatch!=='function'||typeof credentials!=='function')throw Error('transport-isolation-required');
 const pending=new WeakMap();
 async function send(path,body){const c=await credentials(),response=await dispatch(new Request(new URL(path,target),{method:'POST',headers:{'Content-Type':'application/json',Authorization:c.accountAuthorization,'X-Sound-Cruise-App-Authorization':c.appAuthorization,'X-Sound-Cruise-Pro-Authorization':c.proAuthorization},body:JSON.stringify(body)}));const result=await response.json();return response.status===200?result:{ok:false,reason:'owner-route-outcome-unproven',recoveryRequired:true,canWrite:false,operationAuthorized:false};}
 return Object.freeze({fixtureOnly:true,
  async prepare(input){const q=structuredClone(input),binding={contractVersion:1,purpose:'backend-save-receipt-binding',request:q,requestDigest:await exactRequestDigest(q)},handle={ok:true,binding};pending.set(handle,{request:q,requestDigest:binding.requestDigest,attempted:false});return handle;},
  async commit(handle){const p=pending.get(handle);if(!p||p.attempted)return {ok:false,reason:'transport-recovery-required'};p.attempted=true;return send('save',{request:p.request,requestDigest:p.requestDigest});},
  reconcile:binding=>send('reconcile',{binding})
 });
}
