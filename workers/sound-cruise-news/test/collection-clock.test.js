import test from 'node:test';import assert from 'node:assert/strict';
import {COLLECTION_CRON,jstCollectionDay,nextDailyCollectionAt,maintenanceRecoveryAt} from '../src/collection-clock.js';
import {maintenanceRecoveryEligible,probeMaintenanceRecovery} from '../src/maintenance-recovery.js';
import {setup} from './operator-case.js';import {getSource} from '../src/registry.js';import {DAY,robotsEvidence,redirectEvidence} from '../src/policy.js';
const robots='User-agent: *\nAllow: /',stoppedAt=Date.parse('2026-10-23T08:11:50.666+09:00'),morning=Date.parse('2026-10-24T06:00:00+09:00');
const iso=at=>new Date(at).toISOString();
async function stopped(){const s=await setup(),source={...getSource('agm'),enabled:true,productionEnabled:true,robotsHash:(await robotsEvidence(robots)).digest};
 await s.db.prepare('INSERT INTO source_state(source_id,disabled,robots_hash,next_at,backoff_until,last_publisher_request_at) VALUES(?,1,?,?,?,?)').bind(source.id,source.robotsHash,stoppedAt+DAY,stoppedAt+DAY,stoppedAt).run();
 const evidence={status:302,sourceUrl:source.robotsUrl,location:'https://acousticguitarmagazine.jp/',timestamp:iso(stoppedAt)};await s.recordRedirect(source.id,evidence);
 await s.log({sourceId:source.id,startedAt:stoppedAt,requests:1,candidates:0,pending:0,rejected:0,duplicates:0,outcome:'redirect_blocked',durationMs:0,requestMode:'scheduled'});return {s,source,evidence};}
test('06:00 JST is previous UTC day 21:00; strict next day and JST date boundary',()=>{
 assert.equal(COLLECTION_CRON,'0 21 * * *');assert.equal(iso(nextDailyCollectionAt(Date.parse('2026-10-23T23:59:00+09:00'))),'2026-10-23T21:00:00.000Z');
 assert.equal(jstCollectionDay(morning),'2026-10-24');assert.equal(iso(nextDailyCollectionAt(morning)),'2026-10-24T21:00:00.000Z');
 assert.equal(iso(nextDailyCollectionAt(Date.parse('2026-12-31T23:59:00+09:00'))),'2026-12-31T21:00:00.000Z');
});
for(const hour of ['08:11:50','23:59:59','00:01:00','05:59:59'])test('maintenance at '+hour+' is due next 06:00, not rolling 24h',()=>{
 const at=Date.parse('2026-10-23T'+hour+'+09:00'),e={timestamp:iso(at)};
 assert.equal(maintenanceRecoveryAt({lastPublisherRequestAt:at,nextAt:at+DAY,backoffUntil:at+DAY},e),nextDailyCollectionAt(at));
});
test('actual legacy AGM state can recover at next 06:00 <24h, with exact robots reused and source still stopped before then',async()=>{
 const {s,source}=await stopped();assert.equal(await maintenanceRecoveryEligible(s,source,morning-1),false);assert.equal(await maintenanceRecoveryEligible(s,source,morning),true);
 let calls=0;const result=await probeMaintenanceRecovery(s,source,morning,{fetcher:async(u,o)=>{calls++;assert.equal(u,source.robotsUrl);assert.equal(o.redirect,'manual');assert.equal(o.credentials,'omit');return new Response(robots);}});
 assert(result.cachedRobots);assert.equal(calls,1);assert.equal((await s.state(source.id)).nextAt,0);assert.equal(await probeMaintenanceRecovery(s,source,morning+1),null);
});
test('continuing AGM 302 waits until following normal morning; no repeated same-day GET',async()=>{
 const {s,source}=await stopped();let calls=0;const fetcher=async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://acousticguitarmagazine.jp/'}})};
 const first=await probeMaintenanceRecovery(s,source,morning,{fetcher});assert.equal(first.outcome,'redirect_blocked');
 assert.equal((await s.state(source.id)).nextAt,morning+DAY);assert.equal(await probeMaintenanceRecovery(s,source,morning+1000,{fetcher}),null);
 assert.equal(await maintenanceRecoveryEligible(s,source,morning+DAY-1),false);assert.equal(await maintenanceRecoveryEligible(s,source,morning+DAY),true);
 await probeMaintenanceRecovery(s,source,morning+DAY,{fetcher});assert.equal(calls,2);assert.equal((await s.state(source.id)).disabled,true);
});
for(const header of ['172800','Mon, 26 Oct 2026 09:00:00 GMT'])test('publisher Retry-After '+header+' wins over next morning, retained in redirect proof',async()=>{
 const {s,source}=await stopped();await probeMaintenanceRecovery(s,source,morning,{fetcher:async()=>new Response(null,{status:302,headers:{Location:'https://acousticguitarmagazine.jp/','Retry-After':header}})});
 const proof=JSON.parse((await s.db.prepare("SELECT reason_code FROM news_admin_audit WHERE action='redirect-blocked' ORDER BY occurred_at DESC LIMIT 1").first()).reason_code);
 assert(proof.retryAfterAt>=morning+2*DAY);assert.equal(await maintenanceRecoveryEligible(s,source,morning+DAY),false);
});
test('unexplained longer existing hold is preserved; no publisher fetch occurs',async()=>{
 const {s,source}=await stopped();await s.db.prepare('UPDATE source_state SET backoff_until=? WHERE source_id=?').bind(morning+2*DAY,source.id).run();
 assert.equal(await maintenanceRecoveryEligible(s,source,morning),false);assert.equal(await probeMaintenanceRecovery(s,source,morning,{fetcher:async()=>{throw Error('must not fetch')}}),null);
});
test('302 evidence never infers a permission or saves a header/body; only valid Retry-After deadline is stored',()=>{
 const r=redirectEvidence('https://example.com/robots.txt',new Response('private',{status:302,headers:{Location:'/?token=secret','Retry-After':'invalid'}}),morning);
 assert.equal(r.retryAfterAt,undefined);assert.equal(r.location,'https://example.com/');assert(!JSON.stringify(r).includes('private'));assert(!JSON.stringify(r).includes('secret'));
});
test('old future execution is never manufactured; future recovery remains ineligible without HTTP',async()=>{
 const {s,source}=await stopped();let calls=0;assert.equal(await probeMaintenanceRecovery(s,source,stoppedAt+1,{fetcher:async()=>{calls++;throw Error('not due')}}),null);assert.equal(calls,0);
});
test('normal pending recheck interval, unrelated source state and all publication/teacher data are untouched by a maintenance probe',async()=>{
 const {s,source}=await stopped();await s.db.prepare("INSERT OR IGNORE INTO source_state(source_id,disabled,next_at,backoff_until) VALUES('morris',0,123,456)").run();
 const before=await s.db.prepare("SELECT * FROM source_state WHERE source_id='morris'").first();
 await probeMaintenanceRecovery(s,source,morning,{fetcher:async()=>new Response(robots)});
 assert.deepEqual(await s.db.prepare("SELECT * FROM source_state WHERE source_id='morris'").first(),before);
 for(const table of ['candidate_items','news_decision_ledger','news_operator_feedback','news_shadow_evaluations','news_category_overrides','news_category_edits','news_presentation_days','news_presentation_requests'])assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,0);
});
test('429 Retry-After is retained even though non-302 failure requires review and never auto-resumes',async()=>{
 const {s,source}=await stopped();await probeMaintenanceRecovery(s,source,morning,{fetcher:async()=>new Response(null,{status:429,headers:{'Retry-After':'172800'}})});
 assert.equal((await s.state(source.id)).backoffUntil,morning+2*DAY);assert.equal(await maintenanceRecoveryEligible(s,source,morning+3*DAY),false);
});
test('a concurrent operator hold is never cleared or shortened after a successful robots response',async()=>{
 const {s,source}=await stopped();const hold=morning+5*DAY;
 const r=await probeMaintenanceRecovery(s,source,morning,{fetcher:async()=>{await s.db.prepare('UPDATE source_state SET backoff_until=? WHERE source_id=?').bind(hold,source.id).run();return new Response(robots);}});
 assert.equal(r.cachedRobots,null);assert.equal((await s.state(source.id)).disabled,true);assert.equal((await s.state(source.id)).backoffUntil,hold);
});
