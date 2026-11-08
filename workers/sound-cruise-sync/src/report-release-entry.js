// Optional route wrapper. Existing APIs and schedule remain owned by the current entry.
import existing from './index.js';
import {handleReports,analyzeReports} from './studio-reports.js';
export default {
 async fetch(request,env,ctx){return await handleReports(request,env,ctx)||existing.fetch(request,env,ctx)},
 scheduled(event,env,ctx){existing.scheduled(event,env,ctx);if(env.STUDIO_REPORTS_ENABLED==='true')ctx.waitUntil(analyzeReports(env))}
};
