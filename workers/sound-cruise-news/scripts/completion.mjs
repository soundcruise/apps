// Authenticated operator only. No HTTP or Cron override entry point.
import {readFile,writeFile} from 'node:fs/promises';
import {NewsStore} from '../src/store.js';
import {runtimeSources} from '../src/runtime.js';
import {publishAutomatic} from '../src/automatic.js';
import {collectSource} from '../src/collector.js';
import {scheduledNews,COLLECTION_CRON,RETENTION_CRON} from '../src/scheduled.js';
import {administer} from '../src/admin.js';
import {checkedConfig,wrangler} from './remote-db.mjs';
import {remoteDatabase} from './remote-store.mjs';
const [action]=process.argv.slice(2),config=await checkedConfig(),now=Date.now();
const store=new NewsStore(remoteDatabase()),registry=runtimeSources(config.vars),source=registry.find(s=>s.id==='shimamura');
const {NEWS_HEADLINE_PEPPER:pepper}=JSON.parse(await readFile('.local/production-secrets.json','utf8'));
if(typeof pepper!=='string'||pepper.length<32)throw Error('private_secret_required');
if(action==='publish-stored'){
 if((await store.controls()).collection_enabled!==0)throw Error('collection_must_remain_off');
 await administer(store,{action:'publish-on',reason:'review_complete'},now,registry);
 const published=await publishAutomatic(store,source,registry,now,pepper);
 console.log(JSON.stringify({published,publisherRequests:0,collection:(await store.controls()).collection_enabled}));
}else if(action==='guard-check'){
 const before=await store.controls(),state=await store.state('shimamura');
 if(!state.lastPublisherRequestAt||state.nextAt<state.lastPublisherRequestAt+86400000||now>=state.nextAt)throw Error('recent_actual_attempt_required');
 let calls=0;const fetcher=async()=>{calls++;throw Error('publisher_request_forbidden');};
 try{
 if(!before.collection_enabled)await administer(store,{action:'collection-on',reason:'review_complete'},now,registry);
 const manual=await collectSource('shimamura',store,{mode:'production',now,registry,pepper,fetcher});
 const scheduled=await scheduledNews({cron:COLLECTION_CRON},{...config.vars,NEWS_COLLECTION_MODE:'production',NEWS_DB:store.db,NEWS_HEADLINE_PEPPER:pepper},{},now,{fetcher});
 if(calls||manual.outcome!=='backoff'||scheduled.results[0]?.outcome!=='backoff')throw Error('production_guard_failed');
 const report={at:now,manual:manual.outcome,cron:scheduled.results[0].outcome,publisherRequests:calls,lastPublisherRequestAt:state.lastPublisherRequestAt,nextEligibleAt:state.nextAt};
 await writeFile('.local/guard-check.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
 }finally{if(!before.collection_enabled)await administer(store,{action:'collection-off',reason:'operator_stop'},Date.now(),registry);}
}else if(action==='deploy-running'){
 const proof=JSON.parse(await readFile('.local/guard-check.json','utf8')),initial=JSON.parse(await readFile('.local/initial-collection.json','utf8'));
 const state=await store.state('shimamura'),controls=await store.controls(),health=(await store.sourceHealth()).find(s=>s.source_id==='shimamura');
 const rows=await store.candidates();
 if(!initial.ready||initial.wireRequests!==1||initial.requests.listing!==1||!proof||proof.publisherRequests!==0||proof.lastPublisherRequestAt!==state.lastPublisherRequestAt||now>=state.nextAt||state.disabled||health?.status!=='healthy'||!rows.some(r=>r.review_status==='approved'&&r.publication_decision==='AUTO_PUBLISHABLE'))throw Error('initial_and_guard_acceptance_required');
 if(!controls.collection_enabled||!controls.publication_enabled||!controls.api_enabled||config.vars.NEWS_COLLECTION_MODE!=='production'||JSON.stringify(config.triggers.crons)!==JSON.stringify([COLLECTION_CRON,RETENTION_CRON]))throw Error('running_configuration_required');
 console.log(wrangler(['deploy','--secrets-file','.local/production-secrets.json']));
}else throw Error('Use publish-stored | guard-check | deploy-running');
