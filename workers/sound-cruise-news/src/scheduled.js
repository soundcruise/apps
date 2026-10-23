import {probeMaintenanceRecovery,maintenanceRecoveryPlan} from './maintenance-recovery.js';
import {runPendingRechecks} from './pending-lifecycle.js';
import {SOURCES,evidenceGate} from './registry.js';
import {NewsStore} from './store.js';
import {scheduledPurge} from './retention.js';
import {runtimeSources,selectedSourceIds} from './runtime.js';
import {collectSource} from './collector.js';
import {recordPreparationMetrics} from './preparation-metrics.js';
import {healthForOutcome,intentionalSourceStop,collectionHealth} from './source-health.js';
import {COLLECTION_CRON,jstCollectionDay,nextDailyCollectionAt} from './collection-clock.js';
export {COLLECTION_CRON,jstCollectionDay} from './collection-clock.js';
export const RETENTION_CRON='17 * * * *';
export async function scheduledNews(event,env,ctx,now=Date.now(),{registry=SOURCES,fetcher=fetch,sleep,clock}={}){
 const wallStarted=Date.now();
 // Physical retention runs even when collection is stopped, with its own failure signal.
 let recheck=null;
 if(event.cron===RETENTION_CRON&&env.NEWS_COLLECTION_MODE==='production'){
  try{recheck=await runPendingRechecks(new NewsStore(env.NEWS_DB),now,runtimeSources(env,registry,now),env.NEWS_HEADLINE_PEPPER,{fetcher,sleep,resolveObjective:false});}
  catch{console.error(JSON.stringify({event:'news_pending_recheck_failed'}));}
 }
 await scheduledPurge(event,env,ctx,now);
 const store=new NewsStore(env.NEWS_DB);
 if(event.cron!==COLLECTION_CRON)return {purged:true,results:[],recheck};
 const scheduledAt=event.scheduledTime||now;
 const ids=selectedSourceIds(env),active=runtimeSources(env,registry,now),results=[];
 if(env.NEWS_COLLECTION_MODE!=='production'||!(await store.controls()).collection_enabled){
  await store.recordHealth({sourceId:'collection',status:'paused',reasonCode:'global_collection_off',checkedAt:now});return {purged:true,results,stopped:true};
 }
 if(!ids.length||ids.some(id=>!active.some(s=>s.id===id))){
  await store.recordHealth({sourceId:'collection',status:'error',reasonCode:'configuration_invalid',checkedAt:now});throw Error('news_configuration_invalid');
 }
 for(const id of ids){
  const sourceStartedAt=now+Date.now()-wallStarted;
  const source=active.find(s=>s.id===id),reason=evidenceGate(source,now)||(!source.productionEnabled?'source_disabled':null);
  if(reason){await store.recordHealth({sourceId:id,...healthForOutcome(reason),checkedAt:now});const skipped={sourceId:id,outcome:reason,published:0,requestMode:'scheduled',intentionalDisabled:reason==='source_disabled'&&await intentionalSourceStop(store,id),schedule:{scheduledAt,startedAt:sourceStartedAt,nextCollectionAt:nextDailyCollectionAt(now),nextRecoveryAt:null}};try{await recordPreparationMetrics(store,skipped,now,active,env.NEWS_HEADLINE_PEPPER);}catch{console.error(JSON.stringify({event:'news_preparation_metrics_failed',sourceId:id}));}results.push(skipped);continue;}
  const maintenance=await probeMaintenanceRecovery(store,source,now,{fetcher});
  const report=maintenance&&!maintenance.cachedRobots?{sourceId:id,outcome:maintenance.outcome,requests:0,requestMode:'scheduled',requestCounts:{robots:0},pending:0,published:0}:await collectSource(id,store,{mode:'production',now,registry:active,fetcher,sleep,pepper:env.NEWS_HEADLINE_PEPPER,clock,requestMode:'scheduled',jstDay:jstCollectionDay(scheduledAt),cachedRobots:maintenance?.cachedRobots,requireHumanReview:!!maintenance?.cachedRobots,preparationMaintenance:maintenance});
  if(maintenance){report.requests+=maintenance.requests;report.requestCounts.robots+=maintenance.requests;if(!maintenance.cachedRobots)report.outcome=maintenance.outcome;}
  if(maintenance?.cachedRobots&&!['collected','not_modified','scheduled_day_or_lease_busy'].includes(report.outcome)){
   await store.db.prepare('UPDATE source_state SET disabled=1 WHERE source_id=?').bind(id).run();
   await store.db.prepare('INSERT INTO news_admin_audit VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'maintenance-recovery-denied',id,now,report.outcome).run();
  }
  report.published=0;
  if(report.outcome==='source_disabled')report.intentionalDisabled=await intentionalSourceStop(store,id);
  // Scheduled processing prepares evidence and formal READY only. Publication is human-only.
  if(maintenance&&!maintenance.cachedRobots){report.maintenanceOutcome=maintenance.outcome;try{await recordPreparationMetrics(store,report,now,active,env.NEWS_HEADLINE_PEPPER);}catch{console.error(JSON.stringify({event:'news_preparation_metrics_failed',sourceId:id}));}}
  const recoveryPlan=await maintenanceRecoveryPlan(store,source,now);
  if(recoveryPlan)await store.recordHealth({sourceId:id,...healthForOutcome('maintenance_redirect'),checkedAt:now,nextEligibleAt:recoveryPlan.nextAt});
  if(id==='agm'){try{report.backlogRemaining=(await store.db.prepare("SELECT COUNT(*) n FROM news_discovery_receipts WHERE source_id='agm' AND reason_code='agm_detail_budget_deferred' AND candidate_id IS NULL AND first_seen_at>?").bind(now-90*86400000).first()).n;}catch{console.error(JSON.stringify({event:'news_backlog_metrics_failed',sourceId:id}));}}
  report.schedule={scheduledAt,startedAt:sourceStartedAt,nextCollectionAt:nextDailyCollectionAt(now),nextRecoveryAt:recoveryPlan?.nextAt||null};
  report.maintenanceOutcome=maintenance?.outcome||null;
  results.push(report);
 }
 await store.recordHealth({sourceId:'collection',...collectionHealth(results),checkedAt:now,successfulAt:now});
 console.log(JSON.stringify({event:'news_collection',scheduledAt,startedAt:now,nextCollectionAt:nextDailyCollectionAt(now),results:results.map(({sourceId,outcome,candidates,pending,published,requests,requestCounts,articleCache,backfill,preparation,maintenanceOutcome,schedule,backlogRemaining})=>({sourceId,outcome,candidates,pending,published,requests,newCandidates:preparation?.candidateCreated??null,ready:preparation?.ready??null,readyNew:preparation?.readyNew??null,maintenanceOutcome,schedule,...(sourceId==='agm'?{requestCounts,articleCache,backfill,backlogRemaining}:{})}))}));
 return {purged:true,results};
}
