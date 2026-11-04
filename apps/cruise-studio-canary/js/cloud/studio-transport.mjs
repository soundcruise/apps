// Exact destinations only. Production requires the separately packaged canary transport.
export const STUDIO_PRODUCTION_ORIGIN='https://sound-cruise-sync.cruise-port-requests.workers.dev';
const fail=code=>{throw Object.assign(Error(code),{code});};
const instances=new WeakSet();
export function isStudioTransport(value){return instances.has(value);}
const paths=new Set(['/isolated/studio/document','/v2/studio/document','/v2/pro-auth/verify','/v2/pro-auth/session','/v2/pro-auth/device-session/challenge','/v2/pro-auth/device-session/renew','/v2/accounts/recovery/prepare','/v2/accounts/recovery/commit']);
function transportFor({endpoint,fetchImpl=globalThis.fetch},canary=false){
 const u=new URL(endpoint);if(u.username||u.password||u.search||u.hash||!['/isolated/studio/document','/v2/studio/document'].includes(u.pathname))fail('transport-destination');
 const isolated=u.protocol==='https:'&&u.hostname.endsWith('.invalid')||u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname);
 const candidate=u.origin===STUDIO_PRODUCTION_ORIGIN&&u.pathname==='/v2/studio/document';if(!isolated&&!candidate)fail('production-endpoint-forbidden');
 const transport=Object.freeze({endpoint:u.href,origin:u.origin,mode:isolated?'isolated':canary?'production-canary':'production-candidate',async fetch(input,options={}){const v=new URL(typeof input==='string'?input:input.url);if(v.origin!==u.origin||v.username||v.password||v.search||v.hash||!paths.has(v.pathname))fail('transport-destination');if(!isolated&&!canary)fail('production-release-not-authorized');return fetchImpl(v.href,{...options,credentials:'omit',redirect:'error',cache:'no-store'});}});instances.add(transport);return transport;
}

export function createStudioTransport(options={}){return transportFor(options);}
// Formal canary distribution only; server activation remains the authorization boundary.
export function createStudioCanaryTransport({fetchImpl=globalThis.fetch,location=globalThis.location}={}){
 if(location?.origin!=='https://soundcruise.jp')fail('canary-origin');
 return transportFor({endpoint:STUDIO_PRODUCTION_ORIGIN+'/v2/studio/document',fetchImpl},true);
}
