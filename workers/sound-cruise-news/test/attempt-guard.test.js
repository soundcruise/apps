import test from 'node:test';
import assert from 'node:assert/strict';
import {getSource,legalGate} from '../src/registry.js';
import {collectSource} from '../src/collector.js';
import {scheduledNews,COLLECTION_CRON} from '../src/scheduled.js';
import {publishAutomatic} from '../src/automatic.js';
import {runtimeSources} from '../src/runtime.js';
import {administer} from '../src/admin.js';
import {DAY,hash} from '../src/policy.js';
import {consumeInitialOverride,INITIAL_REASON} from '../scripts/initial-override.mjs';
import {database,store,pepper,source as feedSource} from './helpers.js';
const at=Date.parse('2026-09-30T13:00:00+09:00');
const robots='User-agent: *\nAllow: /';
const source={...getSource('shimamura'),robotsHash:await hash(robots),discoveryValid:true,localPilotEnabled:true};
const html='<main><section><h1>製品ニュース 記事一覧</h1></section><a href="/update/amp-effector/2026/09/90000/"><h3>BOSS EX-4 新製品を発表</h3><date>2026/09/30</date></a><a href="/update/amp-effector/2026/09/90001/"><h3>未知のギター用エフェクターのお知らせ</h3><date>2026/09/30</date></a></main>';
const config={NEWS_COLLECTION_MODE:'production',NEWS_API_MODE:'production',NEWS_SOURCE_IDS:'["shimamura"]',NEWS_HEADLINE_PEPPER:pepper};
const active=runtimeSources(config,[source],at);
const options={mode:'production',now:at,clock:()=>at,registry:active,pepper,sleep:async()=>{},fetcher:async url=>new Response(url.endsWith('robots.txt')?robots:html,{headers:{'content-type':url.endsWith('robots.txt')?'text/plain':'text/html'}})};

test('attempt guard: normal manual retains 24h; scheduled uses JST day and does not repeat',async()=>{
 const s=await store();await s.lease('shimamura',at);await s.publisherAttempt('shimamura',at,DAY);
 await s.db.prepare("UPDATE source_state SET next_at=0,lease_until=0 WHERE source_id='shimamura'").run();
 let calls=0;const fetcher=async()=>{calls++;throw Error('must not request');};
 assert.equal((await collectSource('shimamura',s,{...options,now:at+1000,fetcher})).outcome,'backoff');
 await s.db.prepare("UPDATE source_state SET lease_until=0 WHERE source_id='shimamura'").run();
 const result=await scheduledNews({cron:COLLECTION_CRON},{...config,NEWS_DB:s.db},{},at+2000,{registry:[source],fetcher:options.fetcher,sleep:async()=>{},clock:()=>at+2000});
 assert.equal(result.results[0].outcome,'collected');
 const repeated=await scheduledNews({cron:COLLECTION_CRON},{...config,NEWS_DB:s.db},{},at+3000,{registry:[source],fetcher});
 assert.equal(repeated.results[0].outcome,'scheduled_day_or_lease_busy');assert.equal(calls,0);
 assert.equal(legalGate(active[0],await s.state('shimamura'),at+DAY+2000,'production',active),null);
});

test('attempt guard: HTTP 500 and timeout start 24h; immediate retry never reaches fetch',async()=>{
 for(const timeout of [false,true]){
  const s=await store();let calls=0;const attemptedAt=at+2500;
  const fetcher=async()=>{calls++;if(timeout)throw new DOMException('synthetic timeout','TimeoutError');return new Response(null,{status:500});};
  const result=await collectSource('shimamura',s,{...options,clock:()=>attemptedAt,fetcher});
  assert.equal(result.outcome,timeout?'request_timeout':'upstream_error');assert.equal(calls,1);
  const state=await s.state('shimamura');assert.equal(state.lastPublisherRequestAt,attemptedAt);assert.equal(state.nextAt,attemptedAt+DAY);
  assert.equal((await collectSource('shimamura',s,{...options,now:attemptedAt+DAY-1,fetcher})).outcome,'source_disabled');assert.equal(calls,1);
  assert.equal(legalGate(active[0],state,attemptedAt+DAY,'production',active),'source_disabled');
 }
});

test('attempt guard: lease is atomic and source intervals are independent',async()=>{
 const s=await store();assert.equal(await s.lease('shimamura',at,DAY),true);await s.publisherAttempt('shimamura',at,DAY);
 assert.equal(await s.lease('shimamura',at+1000,DAY),false);
 const other={...feedSource,id:'future-approved-source',enabled:true};
 assert.equal(legalGate(other,await s.state(other.id),at,'local',[other]),null);
 assert.equal(await s.lease(other.id,at,6*3600000),true);
});

test('initial override: explicit same-day reason, empty/stopped DB and one-shot audit are mandatory',async()=>{
 const s=await store();await s.lease('shimamura',at);await s.saveState('shimamura',{nextAt:at+DAY});
 await administer(s,{action:'collection-off',reason:'operator_stop'},at);
 await assert.rejects(consumeInitialOverride(s,at,'operator_stop'),/explicit/);
 await assert.rejects(consumeInitialOverride(s,at+2*DAY,INITIAL_REASON),/explicit/);
 await consumeInitialOverride(s,at,INITIAL_REASON);
 await assert.rejects(consumeInitialOverride(s,at+1,INITIAL_REASON),/already_used/);
 assert.equal((await s.db.prepare('SELECT COUNT(*) AS n FROM news_admin_audit WHERE action=?').bind('initial-interval-override').first()).n,1);
 assert.equal((await s.state('shimamura')).nextAt,at+DAY);
});

test('stored publication: collection OFF still publishes AUTO only, preserving REVIEW and attempt time',async()=>{
 const s=await store();await collectSource('shimamura',s,options);
 await administer(s,{action:'collection-off',reason:'operator_stop'},at);
 await administer(s,{action:'publish-on',reason:'review_complete'},at);
 const before=await s.state('shimamura');
 assert.equal(await publishAutomatic(s,active[0],active,at+1000,pepper),1);
 const rows=await s.candidates();assert.equal(rows.filter(r=>r.review_status==='approved').length,1);assert.equal(rows.filter(r=>r.publication_decision==='PUBLISH_REVIEW'&&r.review_status==='pending').length,1);
 assert.equal((await s.controls()).collection_enabled,0);assert.deepEqual(await s.state('shimamura'),before);
});
