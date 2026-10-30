import {handleOperatorRequest} from './operator-worker.js';

// Separate Worker entry point. No D1, static assets, decision or publication routes.
export async function handleIsolatedDotRequest(request,env,now=Date.now(),options={}) {
 const path=new URL(request.url).pathname;
 if(request.method!=='GET'||!(path==='/api/dot-capabilities'||path==='/api/dot-candidates'||/^\/api\/dot-candidates\/[A-Za-z0-9_-]{1,128}$/.test(path)))return Response.json({error:'not_found'},{status:404,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 // Do not accept a caller-provided D1 binding even if one is attached by mistake.
 return handleOperatorRequest(request,{...env,NEWS_DB:{},OPERATOR_ASSETS:undefined},now,options);
}
export default {fetch:(request,env)=>handleIsolatedDotRequest(request,env)};
