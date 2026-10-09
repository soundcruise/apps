import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,put,source,now} from './operator-case.js';
import {pepper} from './helpers.js';
import {getSource} from '../src/registry.js';
import {administer} from '../src/admin.js';
import {initializePending,runPendingRechecks} from '../src/pending-lifecycle.js';
import {handleNewsRequest} from '../src/worker.js';
import {scheduledNews,COLLECTION_CRON} from '../src/scheduled.js';
import {collectionHealth,intentionalSourceStop} from '../src/source-health.js';

const amass={...getSource('amass'),enabled:true,productionEnabled:true};
const registry=[source,amass];
const stop=s=>administer(s,{action:'source-collection-stop',target:amass.id,reason:'policy_change'},now,registry);
const publicItems=async s=>(await (await handleNewsRequest(new Request('https://example.invalid/v1/news'),{NEWS_DB:s.db,NEWS_API_MODE:'production'},now,{registry})).json()).items;
const teacherRows=async s=>Promise.all(['news_decision_ledger','news_operator_feedback','news_shadow_evaluations'].map(async table=>(await s.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));

async function fixture(){
 const s=await setup();
 await s.recordHealth({sourceId:amass.id,status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now});
 const url='https://amass.jp/192113/';
 await put(s,'amass-published',{sourceId:amass.id,sourceName:amass.name,sourceUrl:url,normalizedUrl:url,publishedAt:'2026-09-29T08:08:00.000Z',label:'リック・ニールセン、ギターなどの個人コレクションを競売へ',category:'artist_guitar',eventType:'guitar_artist',productFacts:{kind:'guitar_artist',category:'artist_guitar',performer:'リック・ニールセン',evidence:'named_guitarist_and_instrument',action:'guitar_information'}});
 await s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id='amass-published'").run();
 return s;
}

test('amass collection retirement retains every published field, public count, teacher rows and other source state',async()=>{
 const s=await fixture(),candidates=await s.candidates(),feed=await publicItems(s),teachers=await teacherRows(s),controls=await s.controls(),other=await s.state(source.id);
 assert.equal(feed.length,1);await stop(s);
 assert.deepEqual(await s.candidates(),candidates);assert.deepEqual(await publicItems(s),feed);
 assert.deepEqual(await teacherRows(s),teachers);assert.deepEqual(await s.state(source.id),other);
 for(const key of ['api_enabled','collection_enabled','publication_enabled'])assert.equal((await s.controls())[key],controls[key]);
 assert.equal((await s.state(amass.id)).disabled,true);assert.equal((await s.state(amass.id)).publicationBlocked,false);assert.equal(!!(await s.state(amass.id)).takedown,false);
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_pending_lifecycle').first()).n,0);
 const audit=await s.db.prepare("SELECT action,reason_code FROM news_admin_audit WHERE target='amass' ORDER BY occurred_at DESC LIMIT 1").first();
 assert.equal(audit.action,'source-collection-stop');assert.equal(audit.reason_code,'policy_change');
 // Only this collection is stopped; the media/source identity remains available for a future review.
 assert.equal(getSource('amass').legalStatus,'SAFE');assert.equal(getSource('amass').discoveryUrl,'https://amass.jp/rss/3745');
});

test('real scheduled amass collection skips all publisher requests without degrading aggregate health',async()=>{
 const s=await fixture();await stop(s);
 const r=await scheduledNews({cron:COLLECTION_CRON,scheduledTime:now},{NEWS_DB:s.db,NEWS_API_MODE:'production',NEWS_COLLECTION_MODE:'production',NEWS_SOURCE_IDS:'["amass"]',NEWS_HEADLINE_PEPPER:pepper},{waitUntil:()=>{}},now,{registry:[getSource('shimamura'),getSource('amass')],fetcher:async()=>{throw Error('unexpected publisher fetch');},sleep:async()=>{},clock:()=>now});
 assert.equal(r.results.length,1);assert.equal(r.results[0].requests,0);assert.equal(r.results[0].outcome,'source_disabled');assert.equal(r.results[0].intentionalDisabled,true);
 assert.equal(await intentionalSourceStop(s,amass.id),true);
 const health=await s.sourceHealth();assert.equal(health.find(x=>x.source_id==='amass').status,'paused');assert.equal(health.find(x=>x.source_id==='amass').reason_code,'source_disabled');assert.equal(health.find(x=>x.source_id==='collection').status,'healthy');
 assert.equal(collectionHealth([{outcome:'source_disabled',intentionalDisabled:false}]).status,'warning');assert.equal(collectionHealth([{outcome:'request_timeout'}]).status,'warning');
 assert.equal((await s.db.prepare("SELECT COUNT(*) n FROM collection_runs WHERE source_id='amass'").first()).n,0);
});

test('amass pending closes only its operational lifecycle and cannot recheck, lease, fetch or generate teacher/Shadow decisions',async()=>{
 const s=await fixture();await put(s,'amass-pending',{sourceId:amass.id,sourceName:amass.name,sourceUrl:'https://amass.jp/999999/',productFacts:null});await initializePending(s,now);
 const candidates=await s.candidates(),teachers=await teacherRows(s);await stop(s);
 const row=()=>s.db.prepare("SELECT * FROM news_pending_lifecycle WHERE candidate_id='amass-pending'").first();
 const closed=await row();assert.equal(closed.recheck_status,'SOURCE_EXCLUDED');assert.equal(closed.next_recheck_at,null);assert.equal(closed.lease_until,0);assert.equal(closed.lease_token,null);assert.equal(closed.last_recheck_result,'source_policy');
 const event=JSON.parse(closed.history_json).at(-1);assert.equal(event.actor,'source_policy');assert.equal(event.reason,'source_disabled');
 await stop(s);assert.equal((await row()).history_json,closed.history_json);
 await initializePending(s,now+1);
 const result=await runPendingRechecks(s,now+1,registry,pepper,{recover:async()=>{throw Error('unexpected recovery');},shadow:async()=>{throw Error('unexpected Shadow');}});
 assert.equal(result.due,0);assert.equal(result.attempted,0);assert.equal((await row()).recheck_attempt_count,0);assert.equal((await row()).next_recheck_at,null);
 assert.deepEqual(await s.candidates(),candidates);assert.deepEqual(await teacherRows(s),teachers);
});
