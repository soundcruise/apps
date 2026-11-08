import {maintainReports} from './studio-report-retention.js';
// Standalone development deployment: never binds Production Sync/Account databases.
import {handleReports,analyzeReports} from './studio-reports.js';
export default {async fetch(request,env,ctx){if(new URL(request.url).pathname==='/health')return Response.json({ok:true,service:'studio-reports-development',aiEnabled:env.REPORT_AI_ENABLED==='true'});return await handleReports(request,env,ctx)||new Response('Not found',{status:404})},scheduled(event,env,ctx){ctx.waitUntil(maintainReports(env));ctx.waitUntil(analyzeReports(env))}};
