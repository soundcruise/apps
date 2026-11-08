// Compose ONLY with the verified deployed entry. No import of unverified main Worker source.
import {handleReports,analyzeReports} from './studio-reports.js';
import {maintainReports} from './studio-report-retention.js';
export function createReportWorker(existing){
 return {
  async fetch(request,env,ctx){return await handleReports(request,env,ctx)||existing.fetch(request,env,ctx)},
  scheduled(event,env,ctx){ctx.waitUntil(Promise.resolve(existing.scheduled(event,env,ctx)));ctx.waitUntil(maintainReports(env));if(env.STUDIO_REPORTS_ENABLED==='true')ctx.waitUntil(analyzeReports(env))}
 };
}
