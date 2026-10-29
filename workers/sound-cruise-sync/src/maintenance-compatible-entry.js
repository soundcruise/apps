import {createCompatibleWorkerCandidate} from './maintenance-compatible-worker.js';
// Alternate, unconfigured entrypoint. wrangler/index/Production remain unchanged.
// No public HTTP request or env flag constructs an internal Owner capability.
export default {
 fetch(request,env,ctx){return createCompatibleWorkerCandidate({db:env.SYNC_DB,env}).fetch(request,ctx);},
 scheduled(event,env,ctx){ctx.waitUntil(createCompatibleWorkerCandidate({db:env.SYNC_DB,env}).scheduled(event));}
};
