import {SOURCES,evidenceGate} from './registry.js';
import {NewsStore} from './store.js';
import {scheduledPurge} from './retention.js';
import {runtimeSources,selectedSourceIds} from './runtime.js';
import {collectSource} from './collector.js';
import {publishAutomatic} from './automatic.js';
import {healthForOutcome} from './source-health.js';
export const COLLECTION_CRON='0 21 * * *'; // Cloudflare UTC: daily 06:00 Asia/Tokyo.
export const jstCollectionDay=at=>new Date(at+9*3600000).toISOString().slice(0,10);
export const RETENTION_CRON='17 * * * *';
export async function scheduledNews(event,env,ctx,now=Date.now(),{registry=SOURCES,fetcher=fetch,sleep,clock}={}){
 // Physical retention runs even when collection is stopped, with its own failure signal.
 await scheduledPurge(event,env,ctx,now);
 const store=new NewsStore(env.NEWS_DB);
 if(event.cron!==COLLECTION_CRON)return {purged:true,results:[]};
 const ids=selectedSourceIds(env),active=runtimeSources(env,registry,now),results=[];
 if(env.NEWS_COLLECTION_MODE!=='production'||!(await store.controls()).collection_enabled){
  await store.recordHealth({sourceId:'collection',status:'paused',reasonCode:'global_collection_off',checkedAt:now});return {purged:true,results,stopped:true};
 }
 if(!ids.length||ids.some(id=>!active.some(s=>s.id===id))){
  await store.recordHealth({sourceId:'collection',status:'error',reasonCode:'configuration_invalid',checkedAt:now});throw Error('news_configuration_invalid');
 }
 for(const id of ids){
  const source=active.find(s=>s.id===id),reason=evidenceGate(source,now)||(!source.productionEnabled?'source_disabled':null);
  if(reason){await store.recordHealth({sourceId:id,...healthForOutcome(reason),checkedAt:now});results.push({sourceId:id,outcome:reason,published:0});continue;}
  const report=await collectSource(id,store,{mode:'production',now,registry:active,fetcher,sleep,pepper:env.NEWS_HEADLINE_PEPPER,clock,requestMode:'scheduled',jstDay:jstCollectionDay(event.scheduledTime||now)});
  report.published=0;
  if(['collected','not_modified'].includes(report.outcome))report.published=await publishAutomatic(store,source,active,now,env.NEWS_HEADLINE_PEPPER);
  results.push(report);
 }
 await store.recordHealth({sourceId:'collection',status:results.some(r=>!['collected','not_modified','backoff','scheduled_day_or_lease_busy'].includes(r.outcome))?'warning':'healthy',reasonCode:results.some(r=>!['collected','not_modified','backoff','scheduled_day_or_lease_busy'].includes(r.outcome))?'network_or_internal_error':'ok',checkedAt:now,successfulAt:now});
 console.log(JSON.stringify({event:'news_collection',results:results.map(({sourceId,outcome,pending,published})=>({sourceId,outcome,pending,published}))}));
 return {purged:true,results};
}
