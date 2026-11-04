// Explicit reviewed deployment entry. Neither env flags nor HTTP can enable it.
// Account/Device/Project targets live only in the existing audited D1 activation.
import legacy from './index.js';
import {createStudioActivatedWorker,createStudioReleaseWorker} from './studio-release-worker.js';
import {validateStudioProject} from './studio-release-validator.js';
export const STUDIO_CANARY_POLICY=Object.freeze({
 routeEnabled:true,activationMode:'canary',allowedOrigins:Object.freeze(['https://soundcruise.jp']),
 limits:Object.freeze({documents:100,operations:2048,bytes:134217728}),
 rate:Object.freeze({requests:600,windowMs:60000}),
 evidencePolicy:Object.freeze({maxRows:4096,maxBytes:16777216}),
 retentionPolicy:Object.freeze({id:'studio-operator-canary-v1',physicalDelete:true,minHistoryAgeMs:2592000000,rateKeepMs:86400000,intentLifetimeMs:600000})
});
const off=createStudioReleaseWorker({legacy});
export default Object.freeze({
 async fetch(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/v2/studio/')||path.startsWith('/isolated/studio/')){
   const c=await env.SYNC_DB.prepare('SELECT enabled FROM studio_document_control WHERE id=1').first();
   if(c?.enabled!==1)return off.fetch(request,env,ctx);
   const a=await env.SYNC_DB.prepare('SELECT mode FROM studio_document_activation WHERE id=1').first();
   if(!a||a.mode==='off')return off.fetch(request,env,ctx);
  }
  return createStudioActivatedWorker({legacy,configuration:{...STUDIO_CANARY_POLICY,
   db:env.SYNC_DB,env:{...env,STUDIO_DOCUMENT_RATE_LIMITER:env.SYNC_RATE_LIMITER},validateProject:validateStudioProject
  }}).fetch(request,env,ctx);
 },scheduled:off.scheduled
});
