// Alternate candidate only. Production activation is intentionally not representable
// by a flag/header/query string. A future reviewed rollout must supply the capability.
import {createIsolatedStudioDocumentOwner} from './studio-owner-document.js';
import {studioScheduledDatabase} from './studio-scheduled-rc2.js';
const isolated=new WeakSet();
export function createStudioReleaseFixtureCapability(config){
 if(config?.syntheticFixture!==true||!config.db||!config.limits||!config.rate||!config.validateProject)throw Error('fixture-capability-required');
 const c=Object.freeze({...config});isolated.add(c);return c;
}
export function createStudioReleaseWorker({legacy,capability=null}){
 if(typeof legacy?.fetch!=='function'||typeof legacy?.scheduled!=='function')throw Error('legacy-dependency');
 const c=isolated.has(capability)?capability:null;
 const owner=c?createIsolatedStudioDocumentOwner({...c,enabled:true,release:true}):null;
 return Object.freeze({
 async fetch(request,env,ctx){const u=new URL(request.url);if(u.pathname.startsWith('/isolated/studio/')||u.pathname.startsWith('/v2/studio/')){
 if(!owner)return new Response(JSON.stringify({ok:false,code:'studio_off'}),{status:423,headers:{'Content-Type':'application/json'}});
 if(u.pathname!=='/isolated/studio/document')return new Response(null,{status:404});return owner.fetch(request);}
 return legacy.fetch(request,env,ctx);},
 async scheduled(event,env,ctx){const gate=await studioScheduledDatabase(env.SYNC_DB);if(!gate.allowed)return gate;return legacy.scheduled(event,{...env,SYNC_DB:gate.db},ctx);}
 });
}
