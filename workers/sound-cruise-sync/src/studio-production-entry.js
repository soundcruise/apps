// Candidate entry; not selected by existing Wrangler. Server configuration is separate approval.
import legacy from './studio-legacy-v137.mjs';
import {createStudioReleaseWorker,createStudioActivatedWorker} from './studio-release-worker.js';
import {validateStudioProject} from './studio-release-validator.js';
import {maintenanceDigest} from './maintenance-bridge-v2.js';
const off=createStudioReleaseWorker({legacy});
export default Object.freeze({
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/v2/studio/')&&!url.pathname.startsWith('/isolated/studio/'))return off.fetch(request,env,ctx);
  // Never expose the fixture path on this candidate entry.
  if(url.pathname!=='/v2/studio/document')return new Response(null,{status:404});
  if(env.STUDIO_RELEASE_ROUTE_ENABLED!=='true')return off.fetch(request,env,ctx);
  let worker;
  try{
   const policy=JSON.parse(env.STUDIO_RELEASE_POLICY||'null');
   if(!policy||Object.keys(policy).sort().join('|')!==['id','limits','rate','evidencePolicy','retentionPolicy','allowedOrigins'].sort().join('|')||typeof policy.id!=='string'||!policy.id||!Array.isArray(policy.allowedOrigins)||!policy.allowedOrigins.length||policy.allowedOrigins.some(x=>new URL(x).origin!==x)||await maintenanceDigest(policy)!==env.STUDIO_RELEASE_POLICY_SHA256)throw Error('policy');
   worker=createStudioActivatedWorker({legacy,configuration:{...policy,routeEnabled:true,db:env.SYNC_DB,env,validateProject:validateStudioProject}});
  }catch{return new Response(JSON.stringify({status:'HOLD',code:'studio_policy_unapproved'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
  const result=await worker.fetch(request,env,ctx);
  if(result.status===409){const body=await result.json();return new Response(JSON.stringify(body),{status:body.code==='studio_off'?423:409,headers:result.headers});}
  return result;
 },scheduled:off.scheduled
});
