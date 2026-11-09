import test from 'node:test';import assert from 'node:assert/strict';
import {automaticCase,at} from './automatic-case.js';
import {pepper} from './helpers.js';
import {publishAutomatic,assessAutomatic,AUTOMATIC_POLICY_VERSION} from '../src/automatic.js';
import {operatorDecision,candidateSnapshot} from '../src/operator-review.js';
import {humanDecisions} from '../src/operator-insights.js';
import {CHECKS,publicationValidation} from '../src/decision-policy.js';
const on={enabled:true};
const run=x=>publishAutomatic(x.s,x.source,x.registry,at,pepper,on);
const current=x=>x.s.db.prepare("SELECT * FROM candidate_items WHERE id='target'").first();
const n=async(x,t)=>(await x.s.db.prepare('SELECT COUNT(*) n FROM '+t).first()).n;

test('OFF is a complete no-op, including no database, pepper, or external API access',async()=>{
 const never=new Proxy({},{get(){throw Error('OFF touched store');}});assert.equal(await publishAutomatic(never,null,null,0,null),0);assert.equal(await publishAutomatic(never,null,null,0,null,{enabled:'true'}),0);
});
test('formal READY plus five independent editorial approvals publishes through the existing atomic Ledger, once',async()=>{
 const x=await automaticCase(),before=await n(x,'news_shadow_evaluations'),p=await assessAutomatic(x.s,x.row,x.registry,at,pepper);
 assert.equal(p.eligible,true,JSON.stringify(p));assert.equal(p.shadow.evidenceCount,5);
 assert.equal(await run(x),1);assert.equal(await run(x),0);
 const row=await current(x);assert.equal(row.review_status,'approved');assert.equal(row.review_revision,x.row.review_revision+1);assert.equal(row.reviewed_by,'automatic_policy');
 const d=await x.s.db.prepare("SELECT * FROM news_decision_ledger WHERE candidate_id='target'").first(),f=JSON.parse(d.decision_features_json);
 assert.equal(d.actor_type,'automatic_policy');assert.equal(d.actor_id,AUTOMATIC_POLICY_VERSION);assert.equal(f.operation,'automatic_publication');assert.equal(f.automaticEvaluation.recommendation,'RECOMMEND_APPROVE');assert.equal(f.automaticEvaluation.evidenceContext.evidenceOrigin,'publisher_structured');assert(!f.insightsProfile);assert(!f.shadowEvaluation);
 assert.equal(await n(x,'news_decision_ledger'),6);assert.equal((await humanDecisions(x.s,at)).length,5);assert.equal(await n(x,'news_shadow_evaluations'),before);assert.equal(await n(x,'news_operator_feedback'),6);assert.equal((await publicationValidation(x.s,row,at,x.registry,pepper)).valid,true);
});
test('READY alone is insufficient; four approvals do not lower the editorial threshold',async()=>{const x=await automaticCase({teachers:4});assert((await publicationValidation(x.s,x.row,at,x.registry,pepper)).valid);assert.equal((await assessAutomatic(x.s,x.row,x.registry,at,pepper)).reasons[0],'editorial_evidence_insufficient_or_conflicting');assert.equal(await run(x),0);});
for(const [name,sql]of Object.entries({missingFacts:"UPDATE candidate_items SET product_facts=NULL WHERE id='target'",badProvenance:"UPDATE candidate_items SET facts_provenance='[]' WHERE id='target'",unknownDate:"UPDATE candidate_items SET published_at=NULL WHERE id='target'",takedown:"INSERT INTO news_takedowns VALUES('target',1791000000000)",stopped:"UPDATE source_state SET publication_blocked=1 WHERE source_id='ikebe'",health:"UPDATE source_health SET status='soft_failure' WHERE source_id='ikebe'",publicationOff:'UPDATE news_controls SET publication_enabled=0',humanCategory:"INSERT INTO news_category_overrides VALUES('target','recording_audio',0,'human_operator','fixture')"}))test('does not publish: '+name,async()=>{const x=await automaticCase();await x.s.db.prepare(sql).run();assert.equal(await run(x),0);assert.equal((await current(x)).review_status,'pending');assert.equal(await n(x,'news_decision_ledger'),5);});
test('a formally valid human-confirmed or unclassified proof is never automatic authority',async()=>{
 const {shadowEvidenceContext}=await import('../src/operator-shadow.js');
 for(const f of [{kind:'human_product_notice'},{identifierBasis:'human_confirmation'},{evidence:'human_verified'}])assert.equal(shadowEvidenceContext({...f,product_facts:JSON.stringify(f)}, {valid:true},[],at).evidenceOrigin,'human_confirmation');
 const x=await automaticCase();assert.equal(await publishAutomatic(x.s,{id:'agm'},x.registry,at,pepper,on),0);assert.equal(await publishAutomatic(x.s,{id:'morris'},x.registry,at,pepper,on),0);
});
test('a human decision is preserved even after reopening; no approval can be learned from automatic history',async()=>{
 const x=await automaticCase();await x.s.db.prepare("UPDATE candidate_items SET review_status='pending' WHERE id='teacher0'").run();const old=await x.s.db.prepare("SELECT * FROM candidate_items WHERE id='teacher0'").first();assert.equal((await assessAutomatic(x.s,old,x.registry,at,pepper)).reasons[0],'existing_decision');await run(x);assert.deepEqual(await x.s.db.prepare("SELECT * FROM candidate_items WHERE id='teacher0'").first(),old);
});
test('direct automatic actor without the internal eligibility capability is refused',async()=>{const x=await automaticCase({teachers:0});await assert.rejects(operatorDecision(x.s,{action:'approve'},at,x.registry,pepper,{type:'automatic_policy',id:'test'}),/automatic_authorization_required/);});

test('formally valid Ikebe is preferred; Shimamura is immediately usable when Ikebe is not valid',async()=>{
 const x=await automaticCase({sourceId:'shimamura'});const ikebe=await x.add({id:'ikebe-peer',sourceId:'ikebe'});
 assert.equal((await publicationValidation(x.s,ikebe,at,x.registry,pepper)).valid,true);
 assert.equal((await assessAutomatic(x.s,x.row,x.registry,at,pepper)).reasons[0],'preferred_verified_ikebe');assert.equal(await run(x),0);
 await x.s.db.prepare("UPDATE source_state SET publication_blocked=1 WHERE source_id='ikebe'").run();assert.equal(await run(x),1);
});
test('different exact models/events do not block Shimamura for an unrelated Ikebe peer',async()=>{
 const x=await automaticCase({sourceId:'shimamura'});await x.add({id:'different-peer',sourceId:'ikebe',model:'Studio H210 Limited'});assert.equal(await run(x),1);
});
// Inject at the final statement, after all JS validation, as in existing CAS tests.
function raceAtCommit(x,mutation){const original=x.s.db.prepare.bind(x.s.db);let fired=false;x.s.db.prepare=sql=>{const stmt=original(sql);return sql.startsWith('INSERT INTO news_decision_ledger')?{bind:(...args)=>({run:async()=>{if(!fired){await mutation();fired=true;}return stmt.bind(...args).run();}})}:stmt;};return ()=>fired;}
for(const [name,mutation]of Object.entries({
 revision:x=>x.s.db.raw.exec("UPDATE candidate_items SET review_revision=review_revision+1 WHERE id='target'"),
 fullSnapshot:x=>x.s.db.raw.exec("UPDATE candidate_items SET label='changed during validation' WHERE id='target'"),
 sourceStop:x=>x.s.db.raw.exec("UPDATE source_state SET publication_blocked=1 WHERE source_id='ikebe'"),
 sourceHealth:x=>x.s.db.raw.exec("UPDATE source_health SET status='http_blocked' WHERE source_id='ikebe'"),
 takedown:x=>x.s.db.raw.exec("INSERT INTO news_takedowns VALUES('target',1791000000000)"),
 controls:x=>x.s.db.raw.exec('UPDATE news_controls SET publication_enabled=0'),
 peerInsertion:x=>{const row={...x.s.db.raw.prepare("SELECT * FROM candidate_items WHERE id='target'").get()};row.id='late-peer';row.source_url+='?peer=1';row.normalized_url=row.source_url;row.topic_key+='p';row.review_status='approved';x.s.db.raw.prepare('INSERT INTO candidate_items('+Object.keys(row).join(',')+') VALUES('+Object.keys(row).map(()=>'?').join(',')+')').run(...Object.values(row));}
}))test('final transaction refuses concurrent '+name,async()=>{const x=await automaticCase();const fired=raceAtCommit(x,()=>mutation(x));assert.equal(await run(x),0);assert(fired());assert.equal((await current(x)).review_status,'pending');assert.equal(await n(x,'news_decision_ledger'),5);});
test('trigger child failure rolls back approval, Ledger, feedback and audit together',async()=>{
 const x=await automaticCase(),before=JSON.stringify(await current(x));x.s.db.raw.exec("CREATE TRIGGER fixture_fail BEFORE INSERT ON news_operator_feedback WHEN NEW.candidate_id='target' BEGIN SELECT RAISE(ABORT,'injected'); END");
 await assert.rejects(run(x),/decision_transaction_failed/);assert.equal(JSON.stringify(await current(x)),before);assert.equal(await n(x,'news_decision_ledger'),5);assert.equal(await n(x,'news_operator_feedback'),5);
});
test('two concurrent explicit invocations cannot publish twice',async()=>{
 const x=await automaticCase();await Promise.allSettled([run(x),run(x)]);assert.equal(await n(x,'news_decision_ledger'),6);assert.equal((await current(x)).review_revision,x.row.review_revision+1);assert.equal(await run(x),0);
});
test('compatible old editorial teachers do not substitute for current formal provenance',async()=>{
 const x=await automaticCase();// Reconstruct an explicitly bound old decision envelope in this synthetic DB.
 for(const d of (await x.s.db.prepare('SELECT * FROM news_decision_ledger').all()).results){const f=JSON.parse(d.decision_features_json);f.shadowEvaluation.ruleVersion='structured-human-v1';f.shadowEvaluation.policyVersion='operator-publication-1';f.shadowEvaluation.publicationValidation.policyVersion='operator-publication-1';await x.s.db.prepare("UPDATE news_decision_ledger SET policy_version='operator-publication-1',decision_features_json=? WHERE decision_id=?").bind(JSON.stringify(f),d.decision_id).run();}
 let p=await assessAutomatic(x.s,x.row,x.registry,at,pepper);assert.equal(p.eligible,true,JSON.stringify(p.reasons));
 await x.s.db.prepare("UPDATE candidate_items SET facts_provenance='[]' WHERE id='target'").run();assert.equal(await run(x),0);
});
for(const reason of ['facts_identifier_missing','duplicate','policy_concern'])test('technical/duplicate/policy rejections do not teach general low value: '+reason,async()=>{
 const x=await automaticCase();await x.s.db.prepare("UPDATE news_decision_ledger SET verdict='reject',reason=? WHERE candidate_id='teacher0'").bind(reason).run();
 const p=await assessAutomatic(x.s,x.row,x.registry,at,pepper);assert.equal(p.eligible,false);assert.equal(p.shadow.evidenceCount,4);assert.equal(p.shadow.contradictionCount,0);assert.equal(await run(x),0);
});
test('real editorial disagreement suppresses automatic publication',async()=>{
 const x=await automaticCase();await x.s.db.prepare("UPDATE news_decision_ledger SET verdict='reject',reason='not_relevant' WHERE candidate_id='teacher0'").run();assert.equal(await run(x),0);
});

test('unrelated source/category/retention changes do not cancel a valid candidate',async()=>{
 const x=await automaticCase();raceAtCommit(x,async()=>{
  await x.s.purge(at); // Real hourly retention increments controls revision.
  x.s.db.raw.exec("INSERT OR IGNORE INTO source_state(source_id) VALUES('agm');UPDATE source_state SET lease_until=lease_until+100,last_discovery_at=last_discovery_at+1 WHERE source_id='agm';INSERT INTO news_category_overrides VALUES('unrelated','media_other',0,'human_operator','fixture');UPDATE source_health SET last_checked_at=last_checked_at+1 WHERE source_id='shimamura'");
 });assert.equal(await run(x),1);
});
test('own healthy heartbeat and acquisition lease updates are not publication stops',async()=>{
 const x=await automaticCase();raceAtCommit(x,()=>x.s.db.raw.exec("UPDATE source_health SET last_checked_at=last_checked_at+1 WHERE source_id='ikebe';UPDATE source_state SET lease_until=lease_until+100,etag='changed',last_discovery_at=last_discovery_at+1 WHERE source_id='ikebe'"));assert.equal(await run(x),1);
});
for(const [name,mutation]of Object.entries({
 category:x=>x.s.db.raw.exec("INSERT INTO news_category_overrides VALUES('target','recording_audio',0,'human_operator','fixture')"),
 backoff:x=>x.s.db.raw.prepare("UPDATE source_state SET backoff_until=? WHERE source_id='ikebe'").run(at+60000),
 transientHealth:x=>x.s.db.raw.exec("UPDATE source_health SET status='warning',reason_code='upstream_error' WHERE source_id='ikebe'"),
 robots:x=>x.s.db.raw.exec("UPDATE source_state SET robots_hash='changed' WHERE source_id='ikebe'"),
 healthReason:x=>x.s.db.raw.exec("UPDATE source_health SET reason_code='robots_disallow' WHERE source_id='ikebe'")
}))test('target-specific final guards retain '+name+' protection',async()=>{const x=await automaticCase();raceAtCommit(x,()=>mutation(x));assert.equal(await run(x),0);assert.equal((await current(x)).review_status,'pending');});

test('relevant Ikebe competitor becoming pending after validation blocks Shimamura',async()=>{
 const x=await automaticCase({sourceId:'shimamura'});await x.add({id:'late-ikebe',sourceId:'ikebe'});await x.s.db.prepare("UPDATE candidate_items SET review_status='rejected' WHERE id='late-ikebe'").run();
 raceAtCommit(x,()=>x.s.db.raw.exec("UPDATE candidate_items SET review_status='pending' WHERE id='late-ikebe'"));assert.equal(await run(x),0);assert.equal((await current(x)).review_status,'pending');
});
for(const kind of ['health','source','category'])test('Ikebe preference detects a formerly invalid competitor becoming valid: '+kind,async()=>{
 const x=await automaticCase({sourceId:'shimamura'});await x.add({id:'ikebe-peer',sourceId:'ikebe'});
 const sql=kind==='health'?"UPDATE source_health SET status='http_blocked' WHERE source_id='ikebe'":kind==='source'?"UPDATE source_state SET publication_blocked=1 WHERE source_id='ikebe'":"INSERT INTO news_category_overrides VALUES('ikebe-peer','media_other',0,'human_operator','fixture')";
 await x.s.db.prepare(sql).run();
 const reset=kind==='health'?"UPDATE source_health SET status='healthy' WHERE source_id='ikebe'":kind==='source'?"UPDATE source_state SET publication_blocked=0 WHERE source_id='ikebe'":"DELETE FROM news_category_overrides WHERE candidate_id='ikebe-peer'";
 raceAtCommit(x,()=>x.s.db.raw.exec(reset));assert.equal(await run(x),0);
});

test('new committed human editorial evidence is fenced, while persisted-label retention is irrelevant',async()=>{
 const x=await automaticCase();raceAtCommit(x,()=>x.s.db.raw.exec("UPDATE news_decision_ledger SET persisted_label=NULL"));assert.equal(await run(x),1);
 const y=await automaticCase();raceAtCommit(y,()=>{
  const d={...y.s.db.raw.prepare("SELECT * FROM news_decision_ledger WHERE candidate_id='teacher0'").get()};d.decision_id=crypto.randomUUID();d.request_id=crypto.randomUUID();d.candidate_id='new-human';
  // A real human decision for an unrelated formal candidate; trigger requires CAS.
  const c={...y.s.db.raw.prepare("SELECT * FROM candidate_items WHERE id='teacher0'").get()};c.id='new-human';c.source_url+='?human=1';c.normalized_url=c.source_url;c.topic_key='new-human';c.review_status='pending';c.review_revision=d.candidate_revision;d.candidate_snapshot='b'.repeat(64);d.decision_features_json='{}';
  y.s.db.raw.prepare('INSERT INTO candidate_items('+Object.keys(c).join(',')+') VALUES('+Object.keys(c).map(()=>'?').join(',')+')').run(...Object.values(c));
  y.s.db.raw.prepare('INSERT INTO news_decision_ledger('+Object.keys(d).join(',')+') VALUES('+Object.keys(d).map(()=>'?').join(',')+')').run(...Object.values(d));
 });assert.equal(await run(y),0);
});

for(const error of ['candidate_changed','already_decided','duplicate','stale_decision'])test('known candidate outcome '+error+' abstains and a different candidate still publishes',async()=>{
 const x=await automaticCase({additionalFixtureSlots:1});await x.add({id:'zz-next',model:'Studio H220',num:90022});
 const original=x.s.db.prepare.bind(x.s.db);let fired=false;x.s.db.prepare=sql=>{const stmt=original(sql);if(sql!=='SELECT * FROM candidate_items WHERE id=?')return stmt;return {bind:(...args)=>({first:async()=>{if(args[0]==='target'&&!fired){fired=true;throw Error(error);}return stmt.bind(...args).first();}})};};
 assert.equal(await run(x),1);assert(fired);assert.equal((await current(x)).review_status,'pending');assert.equal((await x.s.db.prepare("SELECT review_status FROM candidate_items WHERE id='zz-next'").first()).review_status,'approved');
});
for(const error of ['database_unavailable','unrecognised_programming_error'])test('unexpected '+error+' stops before other candidates',async()=>{
 const x=await automaticCase({additionalFixtureSlots:1});await x.add({id:'zz-next',model:'Studio H220',num:90022});
 const original=x.s.db.prepare.bind(x.s.db);let fired=false;x.s.db.prepare=sql=>{const stmt=original(sql);if(sql!=='SELECT * FROM candidate_items WHERE id=?')return stmt;return {bind:(...args)=>({first:async()=>{if(args[0]==='target'&&!fired){fired=true;throw Error(error);}return stmt.bind(...args).first();}})};};
 await assert.rejects(run(x),new RegExp(error));assert.equal((await current(x)).review_status,'pending');assert.equal((await x.s.db.prepare("SELECT review_status FROM candidate_items WHERE id='zz-next'").first()).review_status,'pending');
});
test('real first-candidate CAS conflict does not stop an independent next candidate',async()=>{
 const x=await automaticCase({additionalFixtureSlots:1});await x.add({id:'zz-next',model:'Studio H220',num:90022});
 raceAtCommit(x,()=>x.s.db.raw.exec("UPDATE candidate_items SET review_revision=review_revision+1 WHERE id='target'"));assert.equal(await run(x),1);assert.equal((await current(x)).review_status,'pending');assert.equal((await x.s.db.prepare("SELECT review_status FROM candidate_items WHERE id='zz-next'").first()).review_status,'approved');
});
