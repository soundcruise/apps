import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import worker from '../src/worker.js';import {store} from './helpers.js';
import {scheduledWebPermit,WEB_DISCOVERY_CRON,SCHEDULED_WEB_MODEL,WEB_RUN_WINDOW} from '../src/web-schedule.js';
import {runWebDiscovery,saveHint} from '../src/web-discovery.js';
const slots=['2026-11-12T23:30:00.000Z','2026-11-15T23:30:00.000Z','2026-11-17T23:30:00.000Z'],at=Date.parse(slots[0]);
const envFor=db=>({NEWS_DB:db,NEWS_WEB_ENABLED:'true',NEWS_WEB_MODEL:SCHEDULED_WEB_MODEL,NEWS_WEB_SCHEDULE:JSON.stringify({starts:slots}),NEWS_WEB_DAILY_LIMIT:'5',NEWS_WEB_MANUAL_ENABLED:'false',NEWS_WEB_EVIDENCE_ENABLED:'false',NEWS_WEB_QUERIES:'["アコギ","限定仕様","録音機材"]'});
const estimate={category:'acoustic_guitar',brand:'Fixture',product:'FG-101',event:'発表',value:'medium',priority:'low',relevance:'high',duplicate:'unknown',reason:'日付と内容の確認が必要'};
const batch=(n=0)=>Array.from({length:5},(_,i)=>({url:`https://fixture.test/news/${n*5+i}`,title:`日本語の工房アコギ 新モデル FG-${n*5+i} 発表`,lastModifiedDate:'2026-11-12T00:00:00Z'}));
const noCall=()=>assert.fail('unapproved operation');
const run=(env,now=at,deps={})=>runWebDiscovery(env,now,{clock:()=>now,search:async()=>[],classify:async hs=>hs.map(()=>estimate),...deps,scheduledTime:now});
const protectedTables=['candidate_items','news_decision_ledger','news_shadow_evaluations','news_takedowns','news_controls','source_state','source_health','collection_runs'];
const snapshot=async db=>JSON.stringify(await Promise.all(protectedTables.map(t=>db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all())));

test('finite plan: at most three ordered UTC dates within one week, exact Gemma model, 15-minute windows',()=>{
 const env=envFor(null);assert(scheduledWebPermit(env,at,at).effective);assert.equal(WEB_DISCOVERY_CRON,'30 23 * * *');assert.equal(new Date(at+9*3600000).toISOString(),'2026-11-13T08:30:00.000Z');
 for(const schedule of [undefined,'{','{}',JSON.stringify({starts:[]}),JSON.stringify({starts:[...slots,'2026-11-18T23:30:00.000Z']}),JSON.stringify({starts:[slots[1],slots[0]]}),JSON.stringify({starts:[slots[0],slots[0]]}),JSON.stringify({starts:['invalid']}),JSON.stringify({starts:['2026-11-12T23:31:00.000Z']}),JSON.stringify({starts:[slots[0],'2026-11-19T23:30:00.000Z']}),JSON.stringify({starts:slots,unlimited:true})])assert.equal(scheduledWebPermit({...env,NEWS_WEB_SCHEDULE:schedule},at,at).effective,false);
 for(const model of ['@cf/qwen/qwen3-30b-a3b-fp8','@cf/other',undefined])assert.equal(scheduledWebPermit({...env,NEWS_WEB_MODEL:model},at,at).reason,'web_schedule_model_mismatch');
 assert.equal(scheduledWebPermit(env,at,at-1).effective,false);assert.equal(scheduledWebPermit(env,at,at+WEB_RUN_WINDOW).effective,false);assert.equal(scheduledWebPermit(env,at+86400000,at+86400000).effective,false);
});

test('OFF, missing plan, old model and unplanned cron never touch D1 or providers',async()=>{
 for(const patch of [{NEWS_WEB_ENABLED:'false'},{NEWS_WEB_SCHEDULE:''},{NEWS_WEB_MODEL:'@cf/qwen/qwen3-30b-a3b-fp8'}])await worker.scheduled({cron:WEB_DISCOVERY_CRON,scheduledTime:at},{...envFor({prepare:noCall}),...patch},{},at,{webDiscoveryDependencies:{search:noCall,classify:noCall}});
 await worker.scheduled({cron:WEB_DISCOVERY_CRON,scheduledTime:at+86400000},envFor({prepare:noCall}),{},at+86400000,{webDiscoveryDependencies:{search:noCall,classify:noCall}});
});

test('three slots consume at most 9 searches/15 AI calls, no fourth run, no formal NEWS writes',async()=>{
 const s=await store(),env=envFor(s.db),before=await snapshot(s.db);let searches=0,ai=0;
 for(const slot of slots){const now=Date.parse(slot),result=await worker.scheduled({cron:WEB_DISCOVERY_CRON,scheduledTime:now},env,{},now,{webDiscoveryDependencies:{clock:()=>now,search:async()=>batch(searches++),classify:async hs=>{ai++;assert(hs.length<=3);return hs.map(()=>estimate);}}});assert.equal(result.webDiscovery.searches,3);assert.equal(result.webDiscovery.ai_calls,5);assert.equal(result.webDiscovery.errors,0);assert.equal((await run(env,now,{search:noCall,classify:noCall})).skipped,true);}
 assert.equal(searches,9);assert.equal(ai,15);assert.equal(await snapshot(s.db),before);
 const next=Date.parse(slots.at(-1))+86400000;assert.equal((await run(env,next,{search:noCall,classify:noCall})).reason,'web_schedule_not_planned');assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_web_runs').first()).n,3);
});

test('one atomic day claim wins concurrent deliveries and blocks a same-day manual permit',async()=>{
 const s=await store(),env=envFor(s.db);let calls=0,release,started;const gate=new Promise(r=>release=r),ready=new Promise(r=>started=r);
 const first=run(env,at,{search:async()=>{calls++;started();await gate;return [];}});await ready;
 assert((await run(env,at,{search:noCall})).skipped);Object.assign(env,{NEWS_WEB_MANUAL_ENABLED:'true',NEWS_WEB_MANUAL_PERMIT:JSON.stringify({issuedAt:slots[0],expiresAt:new Date(at+60000).toISOString(),maxSearches:3,maxAiCalls:5,model:SCHEDULED_WEB_MODEL})});assert((await runWebDiscovery(env,at,{clock:()=>at,search:noCall},true)).skipped);release();await first;assert.equal(calls,3);
});

test('search/model/schema failures stop paid calls, consume the slot and stop the remaining plan',async()=>{
 for(const mode of ['search','model','schema']){const s=await store(),env=envFor(s.db);let searches=0,models=0;
  const result=await run(env,at,{search:async()=>{searches++;if(mode==='search')throw Error('fixture transport');return batch(searches);},classify:async()=>{models++;if(mode==='model')throw Error('fixture model');return [];}});
  assert.equal(searches,mode==='search'?1:3);assert.equal(models,mode==='search'?0:1);assert.equal(result.errors,1);assert(result.stopped);assert.equal((await run(env,Date.parse(slots[1]),{search:noCall,classify:noCall})).reason,'web_schedule_previous_error_or_incomplete');
 }
});

test('expired/changed permission is rechecked after reservation and before every paid call',async()=>{
 for(const mode of ['clock','model','plan','off']){const s=await store(),env=envFor(s.db);let clock=at,calls=0;
  const result=await runWebDiscovery(env,at,{scheduledTime:at,clock:()=>clock,search:async()=>{calls++;if(mode==='clock')clock=at+WEB_RUN_WINDOW;if(mode==='model')env.NEWS_WEB_MODEL='@cf/other';if(mode==='plan')env.NEWS_WEB_SCHEDULE=JSON.stringify({starts:[slots[0]]});if(mode==='off')env.NEWS_WEB_ENABLED='false';return batch();},classify:noCall});
  assert.equal(calls,1);assert.match(result.stopped,/web_schedule_/);
 }
 const s=await store(),base=s.db.prepare;let clock=at;
 const wrapped={...s.db,prepare:sql=>{const st=base(sql);if(!sql.startsWith('SELECT searches FROM'))return st;return {bind:(...args)=>({first:async()=>{const row=await st.bind(...args).first();clock=at+WEB_RUN_WINDOW;return row;}})};}};
 const result=await runWebDiscovery(envFor(wrapped),at,{scheduledTime:at,clock:()=>clock,search:noCall,classify:noCall});assert.equal(result.searches,1);assert.equal(result.errors,1);
});

test('interruption before any paid call leaves an incomplete claim; expiration cannot restart it',async()=>{
 const s=await store(),base=s.db.prepare;let failed=false;
 const wrapped={...s.db,prepare:sql=>{if(!failed&&sql.startsWith('DELETE FROM news_web_hints')){failed=true;throw Error('fixture process interruption');}return base(sql);}};
 await assert.rejects(run(envFor(wrapped)),/interruption/);const row=await s.db.prepare('SELECT * FROM news_web_runs').first();assert(row.lock_until>0);assert.equal(row.searches,0);assert.equal((await run(envFor(s.db),Date.parse(slots[1]),{search:noCall})).reason,'web_schedule_previous_error_or_incomplete');
});

test('daily limit stays smaller than session caps; failed old hints never get another inference',async()=>{
 const s=await store(),env={...envFor(s.db),NEWS_WEB_DAILY_LIMIT:'1'};await saveHint(s.db,{url:'https://fixture.test/failed',title:'日本語の旧失敗記事',provider:'exa',searchedAt:at},at);await s.db.prepare("UPDATE news_web_hints SET attempts=1,status='hold',reason='classification_failed'").run();let searches=0,models=0;
 const r=await run(env,at,{search:async()=>{searches++;return batch();},classify:async hs=>{models++;assert(hs.every(h=>!h.url.endsWith('/failed')));return hs.map(()=>estimate);}});assert.equal(searches,1);assert.equal(models,1);assert.equal(r.searches,1);assert.equal(r.ai_calls,1);
});

test('dedicated Web Cron bypasses normal collectors; normal daily Cron no longer launches Web',async()=>{
 const s=await store(),env=envFor(s.db);await worker.scheduled({cron:WEB_DISCOVERY_CRON,scheduledTime:at},env,{},at,{fetcher:noCall,webDiscoveryDependencies:{clock:()=>at,search:async()=>[],classify:noCall}});
 const normal=await worker.scheduled({cron:'0 21 * * *',scheduledTime:at-9000000},{...env,NEWS_COLLECTION_MODE:'off'}, {},at-9000000,{fetcher:noCall,webDiscoveryDependencies:{search:noCall,classify:noCall}});assert(normal.stopped);assert.equal((await s.db.prepare('SELECT searches FROM news_web_runs').first()).searches,3);
 const config=JSON.parse(await readFile(new URL('../wrangler.production.jsonc',import.meta.url),'utf8'));assert.deepEqual(config.triggers.crons,['0 21 * * *','17 * * * *',WEB_DISCOVERY_CRON]);assert.equal(config.vars.NEWS_WEB_ENABLED,'false');assert.equal(config.vars.NEWS_WEB_SCHEDULE,'');assert.equal(config.vars.NEWS_WEB_MODEL,SCHEDULED_WEB_MODEL);
});

test('real local workerd/D1 retains the consumed day across restart; no migration required',async()=>{
 const {localDatabase}=await import('../scripts/local-db.mjs'),dir=await mkdtemp(join(tmpdir(),'web-three-slots-'));let runtime;
 try{runtime=await localDatabase(dir);let calls=0;await run(envFor(runtime.db),at,{search:async()=>{calls++;return [];}});assert.equal(calls,3);await runtime.mf.dispose();runtime=await localDatabase(dir);assert((await run(envFor(runtime.db),at,{search:noCall})).skipped);assert.equal((await runtime.db.prepare('SELECT COUNT(*) n FROM news_web_runs').first()).n,1);}finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
