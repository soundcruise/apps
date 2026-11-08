import test from 'node:test';import assert from 'node:assert/strict';
import {store} from './helpers.js';
import {manualPermit,manualAvailability} from '../src/web-manual-permit.js';
import {runWebDiscovery,listWebHints} from '../src/web-discovery.js';
import {withManualWebSession} from '../scripts/web-manual-session.mjs';
const at=Date.parse('2026-11-08T04:00:00.000Z'),model='@cf/google/gemma-4-26b-a4b-it';
const grant=(now=at,changes={})=>JSON.stringify({issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString(),maxSearches:3,maxAiCalls:5,model,...changes});
const envFor=(db,now=at,changes={})=>({NEWS_DB:db,NEWS_WEB_ENABLED:'true',NEWS_WEB_MANUAL_ENABLED:'true',NEWS_WEB_MANUAL_PERMIT:grant(now),NEWS_WEB_MODEL:model,NEWS_WEB_EVIDENCE_ENABLED:'false',NEWS_WEB_QUERIES:'["アコギ","仕様","機材"]',...changes});
const estimate={category:'アコギ',brand:'工房',product:'試験モデル',event:'新製品',value:'medium',priority:'low',relevance:'high',duplicate:'unknown',reason:'正式な公開日と仕様の確認が必要'};
const batch=(n=0)=>Array.from({length:5},(_,i)=>({url:`https://fixture.test/news/${n*5+i}`,title:`日本語アコースティックギター 新製品 試験モデル ${n*5+i}`,publishedDate:'2026-11-08'}));
const noCall=()=>assert.fail('external call forbidden');
const row=async s=>s.db.prepare('SELECT * FROM news_web_runs ORDER BY day LIMIT 1').first();

test('permit requires flags, canonical UTC timestamps, bounded TTL/caps and exact selected model',()=>{
 const env=envFor(null);assert.equal(manualPermit(env,at).effective,true);
 for(const extra of [{NEWS_WEB_MANUAL_ENABLED:'false'},{NEWS_WEB_ENABLED:'false'},{NEWS_WEB_MANUAL_PERMIT:undefined},{NEWS_WEB_MANUAL_PERMIT:'{'},{NEWS_WEB_MODEL:'@cf/other'},{NEWS_WEB_MANUAL_PERMIT:grant(at,{maxSearches:4})},{NEWS_WEB_MANUAL_PERMIT:grant(at,{maxAiCalls:6})},{NEWS_WEB_MANUAL_PERMIT:grant(at,{maxSearches:0,maxAiCalls:0})},{NEWS_WEB_MANUAL_PERMIT:grant(at,{expiresAt:new Date(at+900001).toISOString()})},{NEWS_WEB_MANUAL_PERMIT:grant(at,{extra:true})}])assert.equal(manualPermit({...env,...extra},at).effective,false,JSON.stringify(extra));
 assert.equal(manualPermit(env,at-1).reason,'operator_web_permit_not_started');assert.equal(manualPermit(env,at+60000).reason,'operator_web_permit_expired');
});

test('invalid or expired manual authorization never reaches D1 or providers; OFF remains unchanged',async()=>{
 const db={prepare:noCall};
 await assert.rejects(runWebDiscovery(envFor(db),at+60000,{search:noCall,classify:noCall},true),/permit_expired/);
 await assert.rejects(runWebDiscovery(envFor(db,at,{NEWS_WEB_MANUAL_PERMIT:''}),at,{search:noCall},true),/permit_required/);
 assert.deepEqual(await runWebDiscovery({...envFor(db),NEWS_WEB_ENABLED:'false'},at,{search:noCall},true),{disabled:true});
});

test('one session obeys explicit search/AI caps and consumes permission durably without formal NEWS writes',async()=>{
 const s=await store(),env=envFor(s.db,at,{NEWS_WEB_MANUAL_PERMIT:grant(at,{maxSearches:2,maxAiCalls:1})});let searches=0,ai=0;
 const deps={search:async()=>batch(searches++),classify:async hints=>{ai++;assert.equal(hints.length,3);return hints.map(()=>estimate);}};
 assert.equal((await manualAvailability(s.db,env,at)).effective,true);
 const result=await runWebDiscovery(env,at,deps,true);assert.equal(result.searches,2);assert.equal(result.ai_calls,1);assert.equal(searches,2);assert.equal(ai,1);assert.equal(result.processed,3);assert.equal(result.manualAuthorization.effective,false);
 assert.equal((await runWebDiscovery(env,at+1000,{search:noCall,classify:noCall},true)).skipped,true);
 const data=await listWebHints(env,at+1000);assert.equal(data.manualEnabled,false);assert.equal(data.manualAuthorization.reason,'operator_web_permit_spent');
 assert.equal(env.NEWS_WEB_MANUAL_ENABLED,'true','raw configuration is not silently rewritten by the server');
 assert.equal((await row(s)).lock_until,0);assert.equal((await row(s)).manual_started,1);
 for(const t of ['candidate_items','news_decision_ledger','news_takedowns'])assert.equal((await s.db.prepare(`SELECT COUNT(*) n FROM ${t}`).first()).n,0);
});

test('UTC daily cap still bounds the smaller explicit allowance',async()=>{
 const s=await store(),env=envFor(s.db,at,{NEWS_WEB_DAILY_LIMIT:'1'});let searches=0,ai=0;
 const result=await runWebDiscovery(env,at,{search:async()=>batch(searches++),classify:async h=>{ai++;return h.map(()=>estimate);}},true);
 assert.equal(searches,1);assert.equal(ai,1);assert.equal(result.searches,1);assert.equal(result.ai_calls,1);
});

test('search error and ambiguous acknowledgement consume the grant, stop immediately, and do not retry',async()=>{
 const s=await store(),env=envFor(s.db);let calls=0;
 const r=await runWebDiscovery(env,at,{search:async()=>{calls++;throw Error('simulated_timeout_after_request');},classify:noCall},true);
 assert.equal(calls,1);assert.equal(r.errors,1);assert.equal(r.stopped,'search_failed');assert.equal((await runWebDiscovery(env,at,{search:noCall},true)).skipped,true);
});

test('invalid AI output stops the session; no next batch or old failed-hint retry',async()=>{
 const s=await store(),env=envFor(s.db);let searches=0,ai=0;
 const r=await runWebDiscovery(env,at,{search:async()=>batch(searches++),classify:async()=>{ai++;return [{inventedFact:true}];}},true);
 assert.equal(ai,1);assert.equal(r.ai_calls,1);assert.equal(r.processed,0);assert.match(r.stopped,/classification_count_failed/);
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_web_hints').first()).n,15);
 // A separate UTC-day grant must not reattempt yesterday's failed inputs.
 const next=envFor(s.db,at+86400000,{NEWS_WEB_MANUAL_PERMIT:grant(at+86400000,{maxSearches:0,maxAiCalls:5})});
 const failedUrls=(await s.db.prepare("SELECT url FROM news_web_hints WHERE attempts>0").all()).results.map(h=>h.url);let laterCalls=0;
 const later=await runWebDiscovery(next,at+86400000,{search:noCall,classify:async hints=>{laterCalls++;assert(hints.every(h=>!failedUrls.includes(h.url)));return hints.map(()=>estimate);}},true);
 assert.equal(laterCalls,4);assert.equal(later.processed,12);
});

test('expiry after a completed call prevents subsequent searches and AI calls',async()=>{
 const s=await store(),env=envFor(s.db);let clock=at,calls=0;
 const r=await runWebDiscovery(env,at,{clock:()=>clock,search:async()=>{calls++;clock=at+60000;return batch();},classify:noCall},true);
 assert.equal(calls,1);assert.equal(r.ai_calls,0);assert.equal(r.stopped,'operator_web_permit_expired');assert.equal((await row(s)).lock_until,0);
 await assert.rejects(runWebDiscovery(env,clock,{search:noCall},true),/permit_expired/);
});

test('deadline is rechecked after durable reservation and immediately before provider invocation',async()=>{
 const s=await store();let clock=at;
 const wrapped={batch:s.db.batch,prepare(sql){const p=s.db.prepare(sql);return {...p,bind(...args){const b=p.bind(...args);if(sql.startsWith('UPDATE news_web_runs SET searches='))return {...b,first:async()=>{const r=await b.first();clock=at+60000;return r;}};return b;}};}};
 const r=await runWebDiscovery(envFor(wrapped),at,{clock:()=>clock,search:noCall,classify:noCall},true);
 assert.equal(r.searches,1,'reserved but never sent; conservative accounting');assert.equal(r.ai_calls,0);assert.equal(r.stopped,'operator_web_permit_expired');
});

test('an in-flight AI response may finish after expiry, but no additional AI starts',async()=>{
 const s=await store(),env=envFor(s.db);let clock=at,searches=0,ai=0;
 const r=await runWebDiscovery(env,at,{clock:()=>clock,search:async()=>batch(searches++),classify:async h=>{ai++;clock=at+60000;return h.map(()=>estimate);}},true);
 assert.equal(ai,1);assert.equal(r.processed,3);assert.equal(r.stopped,'operator_web_permit_expired');
});

test('crossing UTC midnight ends the original grant without charging the next day',async()=>{
 const s=await store(),start=Date.parse('2026-11-08T23:59:59Z'),env=envFor(s.db,start);let clock=start,calls=0;
 const r=await runWebDiscovery(env,start,{clock:()=>clock,search:async()=>{calls++;clock+=1000;return [];},classify:noCall},true);
 assert.equal(r.stopped,'operator_web_utc_day_changed');assert.equal(calls,1);assert.equal((await row(s)).day,'2026-11-08');
 await assert.rejects(runWebDiscovery(env,clock,{search:noCall},true),/utc_day_changed/);assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_web_runs').first()).n,1);
});

test('manual and cron share the existing global lock and spent-day latch',async()=>{
 const s=await store(),env=envFor(s.db);let release,started;const ready=new Promise(r=>started=r),wait=new Promise(r=>release=r);
 const run=runWebDiscovery(env,at,{search:async()=>{started();await wait;return [];},classify:noCall},true);await ready;
 assert.equal((await runWebDiscovery(env,at,{search:noCall},false)).skipped,true);assert.equal((await runWebDiscovery(env,at,{search:noCall},true)).skipped,true);release();await run;
 assert.equal((await runWebDiscovery(env,at,{search:noCall},false)).skipped,true);
});

const off={newsWeb:false,newsManual:false,newsEvidence:false,operatorView:true,operatorManual:false,manualEffective:false,inFlight:false};
for(const stage of ['success','enable_failure','run_failure','restore_failure','read_failure','still_on'])test('guarded host cleanup: '+stage,async()=>{
 const actions=[],options={expiresAt:Date.now()+60000,enable:async()=>{actions.push('guarded_enable');if(stage==='enable_failure')throw Error('private');},execute:async()=>{actions.push('run_once');if(stage==='run_failure')throw Error('private');},restore:async()=>{actions.push('guarded_restore');if(stage==='restore_failure')throw Error('private');},readState:async()=>{actions.push('readback');if(stage==='read_failure')throw Error('private');return stage==='still_on'?{...off,operatorManual:true}:off;}};
 if(stage==='success'){const r=await withManualWebSession(options);assert.equal(r.offConfirmed,true);}else await assert.rejects(withManualWebSession(options),e=>{assert.equal(e.message,'manual_session_incomplete');assert(!JSON.stringify(e.report).includes('private'));if(stage==='restore_failure')assert.equal(e.report.restoreError,'off_restore_failed');if(stage==='still_on')assert.equal(e.report.offConfirmed,false);return true;});
 assert(actions.includes('guarded_restore'));assert(actions.includes('readback'));if(stage==='enable_failure')assert(!actions.includes('run_once'));
});

test('host expiry aborts waiting, restores OFF, and reports possible in-flight work',async()=>{
 let restored=false;
 await assert.rejects(withManualWebSession({expiresAt:Date.now()+20,enable:async()=>{},execute:()=>new Promise(()=>{}),restore:async()=>{restored=true;},readState:async()=>({...off,inFlight:true})}),e=>e.report.runError==='manual_deadline_reached'&&e.report.mayBeInFlight&&!e.report.offConfirmed);
 assert.equal(restored,true);
});


test('OFF restoration failure remains visible even when the server permission has expired',async()=>{
 await assert.rejects(withManualWebSession({expiresAt:Date.now()+1000,enable:async()=>{},execute:async()=>{},restore:async()=>{throw Error('do not leak credentials');},readState:async()=>({...off,operatorManual:true,manualEffective:false})}),e=>e.report.restoreError==='off_restore_failed'&&!e.report.offConfirmed&&e.report.finalState.manualEffective===false);
});

test('a slow enable is awaited before restoring, and cannot start exploration after expiry',async()=>{
 let clock=at,ran=false,restored=false;
 await assert.rejects(withManualWebSession({clock:()=>clock,expiresAt:at+60000,enable:async()=>{clock=at+60000;},execute:async()=>{ran=true;},restore:async()=>{restored=true;},readState:async()=>off}),e=>e.report.runError==='manual_deadline_reached');
 assert.equal(ran,false);assert.equal(restored,true);
});

test('AI deadline is checked after pending-claim storage and before inference',async()=>{
 const s=await store();let clock=at,searches=0,ai=0;
 const wrapped={prepare:s.db.prepare,batch:async statements=>{const r=await s.db.batch(statements);clock=at+60000;return r;}};
 const r=await runWebDiscovery(envFor(wrapped),at,{clock:()=>clock,search:async()=>batch(searches++),classify:async()=>{ai++;return []; }},true);
 assert.equal(ai,0);assert.equal(r.ai_calls,1);assert.equal(r.stopped,'operator_web_permit_expired');assert.equal((await s.db.prepare('SELECT reason FROM news_web_hints WHERE attempts=1 LIMIT 1').first()).reason,'operator_web_permit_expired');
});

test('post-inference storage failure consumes the session without another batch',async()=>{
 const s=await store();let searches=0,ai=0;
 const wrapped={batch:s.db.batch,prepare(sql){if(sql.startsWith('UPDATE news_web_hints SET estimate_json='))throw Error('simulated_storage_failure');return s.db.prepare(sql);}};
 const r=await runWebDiscovery(envFor(wrapped),at,{search:async()=>batch(searches++),classify:async hints=>{ai++;return hints.map(()=>estimate);}},true);
 assert.equal(ai,1);assert.equal(r.ai_calls,1);assert.match(r.stopped,/classification_storage_failed/);assert.equal((await row(s)).manual_started,1);assert.equal((await row(s)).lock_until,0);
 assert.equal((await runWebDiscovery(envFor(wrapped),at,{search:noCall,classify:noCall},true)).skipped,true);
});

test('host returns only bounded execution counters, never arbitrary response or credentials',async()=>{
 const r=await withManualWebSession({expiresAt:Date.now()+1000,enable:async()=>{},execute:async()=>({day:'2026-11-08',searches:3,ai_calls:1,processed:3,errors:0,csrf:'PRIVATE',response:'PRIVATE'}),restore:async()=>{},readState:async()=>off});
 assert.equal(r.execution.searches,3);assert(!JSON.stringify(r).includes('PRIVATE'));
});

test('Operator distinguishes expired effective permission from an unrestored ON flag',async()=>{
 const {renderWebDiscovery}=await import('../operator-ui/web-discovery.js');
 const document={createElement:()=>({children:[],setAttribute(){},append(...children){this.children.push(...children);}})};
 const html=JSON.stringify(renderWebDiscovery(document,{items:[],manualEnabled:false,manualAuthorization:manualPermit(envFor(null),at+60000)}));
 assert(html.includes('実効許可: OFF'));assert(html.includes('期限切れ'));assert(html.includes('手動フラグはON'));assert(!html.includes('Web探索を1回実行'));
});
