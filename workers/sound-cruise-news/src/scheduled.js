import {probeMaintenanceRecovery} from './maintenance-recovery.js';
import {runPendingRechecks} from './pending-lifecycle.js';
import {SOURCES,evidenceGate} from './registry.js';
import {NewsStore} from './store.js';
import {scheduledPurge} from './retention.js';
import {runtimeSources,selectedSourceIds} from './runtime.js';
import {collectSource} from './collector.js';
import {recordPreparationMetrics} from './preparation-metrics.js';
import {healthForOutcome,intentionalSourceStop,collectionHealth} from './source-health.js';
export const COLLECTION_CRON='0 21 * * *'; // Cloudflare UTC: daily 06:00 Asia/Tokyo.
export const jstCollectionDay=at=>new Date(at+9*3600000).toISOString().slice(0,10);
export const RETENTION_CRON='17 * * * *';
export async function scheduledNews(event,env,ctx,now=Date.now(),{registry=SOURCES,fetcher=fetch,sleep,clock}={}){
 // Physical retention runs even when collection is stopped, with its own failure signal.
 let recheck=null;
 if(event.cron===RETENTION_CRON&&env.NEWS_COLLECTION_MODE==='production'){
  try{recheck=await runPendingRechecks(new NewsStore(env.NEWS_DB),now,runtimeSources(env,registry,now),env.NEWS_HEADLINE_PEPPER,{fetcher,sleep,resolveObjective:false});}
  catch{console.error(JSON.stringify({event:'news_pending_recheck_failed'}));}
 }
 await scheduledPurge(event,env,ctx,now);
 const store=new NewsStore(env.NEWS_DB);
 if(event.cron!==COLLECTION_CRON){
  const maintenance=event.cron===RETENTION_CRON&&env.NEWS_COLLECTION_MODE==='production'?await recoverDueMaintenance(store,env,now,runtimeSources(env,registry,now),{fetcher,sleep,clock}):[];
  return {purged:true,results:maintenance,recheck};
 }
 const ids=selectedSourceIds(env),active=runtimeSources(env,registry,now),results=[];
 if(env.NEWS_COLLECTION_MODE!=='production'||!(await store.controls()).collection_enabled){
  await store.recordHealth({sourceId:'collection',status:'paused',reasonCode:'global_collection_off',checkedAt:now});return {purged:true,results,stopped:true};
 }
 if(!ids.length||ids.some(id=>!active.some(s=>s.id===id))){
  await store.recordHealth({sourceId:'collection',status:'error',reasonCode:'configuration_invalid',checkedAt:now});throw Error('news_configuration_invalid');
 }
 for(const id of ids){
  const source=active.find(s=>s.id===id),reason=evidenceGate(source,now)||(!source.productionEnabled?'source_disabled':null);
  if(reason){await store.recordHealth({sourceId:id,...healthForOutcome(reason),checkedAt:now});const skipped={sourceId:id,outcome:reason,published:0,requestMode:'scheduled',intentionalDisabled:reason==='source_disabled'&&await intentionalSourceStop(store,id)};try{await recordPreparationMetrics(store,skipped,now,active,env.NEWS_HEADLINE_PEPPER);}catch{console.error(JSON.stringify({event:'news_preparation_metrics_failed',sourceId:id}));}results.push(skipped);continue;}
  const maintenance=await probeMaintenanceRecovery(store,source,now,{fetcher});
  const report=maintenance&&!maintenance.cachedRobots?{sourceId:id,outcome:maintenance.outcome,requests:0,requestMode:'scheduled',requestCounts:{robots:0},pending:0,published:0}:await collectSource(id,store,{mode:'production',now,registry:active,fetcher,sleep,pepper:env.NEWS_HEADLINE_PEPPER,clock,requestMode:'scheduled',jstDay:jstCollectionDay(event.scheduledTime||now),cachedRobots:maintenance?.cachedRobots,requireHumanReview:!!maintenance?.cachedRobots,preparationMaintenance:maintenance});
  if(maintenance){report.requests+=maintenance.requests;report.requestCounts.robots+=maintenance.requests;if(!maintenance.cachedRobots)report.outcome=maintenance.outcome;}
  if(maintenance?.cachedRobots&&!['collected','not_modified'].includes(report.outcome)){
   await store.db.prepare('UPDATE source_state SET disabled=1 WHERE source_id=?').bind(id).run();
   await store.db.prepare('INSERT INTO news_admin_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'maintenance-recovery-denied',id,now,report.outcome).run();
  }
  report.published=0;
  if(report.outcome==='source_disabled')report.intentionalDisabled=await intentionalSourceStop(store,id);
  // Scheduled processing prepares evidence and formal READY only. Publication is human-only.
  if(maintenance&&!maintenance.cachedRobots){report.maintenanceOutcome=maintenance.outcome;try{await recordPreparationMetrics(store,report,now,active,env.NEWS_HEADLINE_PEPPER);}catch{console.error(JSON.stringify({event:'news_preparation_metrics_failed',sourceId:id}));}}
  results.push(report);
 }
 await store.recordHealth({sourceId:'collection',...collectionHealth(results),checkedAt:now,successfulAt:now});
 console.log(JSON.stringify({event:'news_collection',results:results.map(({sourceId,outcome,pending,published,requests,requestCounts,articleCache,backfill})=>({sourceId,outcome,pending,published,...(sourceId==='agm'?{requests,requestCounts,articleCache,backfill}:{})}))}));
 return {purged:true,results};
}
// A reviewed maintenance backoff may expire after 06:00. The existing hourly
// timer checks eligibility without HTTP, then uses the same daily lease/budget.
async function recoverDueMaintenance(store,env,now,registry,{fetcher,sleep,clock}){
 const ids=selectedSourceIds(env),results=[];
 if(!(await store.controls()).collection_enabled||!ids.length||ids.some(id=>!registry.some(s=>s.id===id)))return results;
 for(const id of ids){
  const source=registry.find(s=>s.id===id),maintenance=await probeMaintenanceRecovery(store,source,now,{fetcher});if(!maintenance)continue;
  const report=maintenance.cachedRobots?await collectSource(id,store,{mode:'production',now,registry,fetcher,sleep,clock,pepper:env.NEWS_HEADLINE_PEPPER,requestMode:'scheduled',jstDay:jstCollectionDay(now),cachedRobots:maintenance.cachedRobots,requireHumanReview:true,preparationMaintenance:maintenance}):{sourceId:id,outcome:maintenance.outcome,requests:0,requestCounts:{robots:0},requestMode:'scheduled'};
  report.requests+=maintenance.requests;report.requestCounts.robots+=maintenance.requests;report.published=0;report.maintenanceOutcome=maintenance.outcome;
  if(!maintenance.cachedRobots){try{await recordPreparationMetrics(store,report,now,registry,env.NEWS_HEADLINE_PEPPER);}catch{console.error(JSON.stringify({event:'news_preparation_metrics_failed',sourceId:id}));}}
  else if(!['collected','not_modified','scheduled_day_or_lease_busy'].includes(report.outcome)){
   await store.db.prepare('UPDATE source_state SET disabled=1 WHERE source_id=?').bind(id).run();
   await store.db.prepare('INSERT INTO news_admin_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'maintenance-recovery-denied',id,now,report.outcome).run();
  }
  results.push(report);
 }
 if(results.length){
  const health=await store.sourceHealth(),current=[];
  for(const id of ids){const h=health.find(h=>h.source_id===id);current.push({sourceId:id,outcome:h?.status==='healthy'?'collected':h?.reason_code||'configuration_invalid',intentionalDisabled:h?.reason_code==='source_disabled'&&await intentionalSourceStop(store,id)});}
  const aggregate=collectionHealth(current);await store.recordHealth({sourceId:'collection',...aggregate,checkedAt:now,successfulAt:aggregate.status==='healthy'?now:null});
  console.info(JSON.stringify({event:'news_hourly_maintenance_recovery',results:results.map(r=>({sourceId:r.sourceId,outcome:r.outcome,requests:r.requests,published:0}))}));
 }
 return results;
}
