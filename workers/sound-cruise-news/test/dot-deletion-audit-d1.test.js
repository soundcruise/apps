import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localDatabase} from '../scripts/local-db.mjs';
import {migrationStatements} from '../scripts/migration-statements.mjs';
import {pepper} from './helpers.js';
import {SOURCES} from '../src/registry.js';
import {fictionalInput} from '../dot-phase1/phase4a/preview.mjs';
import {dotSnapshot,saveDotConfirmation} from '../src/dot-human-confirmation.js';
import {admitDotCandidate} from '../src/dot-admission.js';
import {saveDotSourceRecheck} from '../src/dot-source-recheck.js';
import {saveDotHistoryCheck} from '../src/dot-history-check.js';
import {dotPublicationGate} from '../src/dot-publication-gate.js';
import {candidateSnapshot,operatorDecision} from '../src/operator-review.js';
import {effectiveCategory} from '../src/category-editor.js';
import {publicationValidation} from '../src/decision-policy.js';
import {administer} from '../src/admin.js';

const options={compatibilityDate:process.env.NEWS_DOT_TEST_COMPATIBILITY_DATE||'2026-09-18'};
const migration=await readFile(new URL('../migrations/0030_dot_deletion_receipts.sql',import.meta.url),'utf8');
async function isolated(fn){
 const dir=await mkdtemp(join(tmpdir(),'dot-delete-d1-'));
 let rt=await localDatabase(dir,options);
 const restart=async()=>{await rt.mf.dispose();rt=await localDatabase(dir,options);return rt;};
 try{await fn(rt,restart);}finally{await rt.mf.dispose();await rm(dir,{recursive:true,force:true});}
}
async function fixture(rt){
 const {store:s,db}=rt,now=Date.now(),actor={type:'human_operator',id:'access:fixture-human'};
 const url='https://jp.yamaha.com/musical-instruments/guitars-basses-amps/explore/topics/2026/fixture_atomic.html';
 await db.prepare('UPDATE news_controls SET publication_enabled=1').run();
 await db.prepare("INSERT INTO source_state(source_id,disabled) VALUES('yamaha',1)").run();
 const c=fictionalInput().candidate;
 c.candidate_id='fixture-atomic-d1';
 c.entity={manufacturer:'Yamaha',brand:'Yamaha',product:'FG700',models:['FG700'],version:null,product_type:null};
 c.sources=[{url,canonical_url:url}];c.event.type='announcement';c.dates.article_published={value:'2026-10-30',precision:'day'};
 const detail={candidate:c,stagingRevision:'123:4',deliveryKeyHash:'b'.repeat(64),validation:{formalFacts:false,ready:false}};
 const reader={detail:async()=>detail},snap=await dotSnapshot(detail,c.candidate_id);
 const human={url,brand:'Yamaha',product:'FG700',productType:'acoustic_guitar',action:'announcement',publishedAt:'2026-10-30'};
 const observations={source:url+' | official page',identity:'Yamaha / FG700 | heading',event:'announcement | event',date:'2026-10-30 | date',claims:'acoustic_guitar | type',policy:'yamaha-human-facts-20261028 | permission',history:'確認済み（期限切れ履歴は不明）'};
 const confirmation={candidateId:c.candidate_id,digest:snap.digest,revision:snap.revision,observations,outcome:'confirmed',requestId:'d1-confirmation-atomic-0001'};
 await saveDotConfirmation(db,reader,confirmation,actor,now);
 const input={candidateId:c.candidate_id,confirmationId:confirmation.requestId,requestId:'d1-registration-atomic-0001',human};
 const saved=await admitDotCandidate(s,reader,input,actor,now,SOURCES,pepper);
 assert.equal(saved.status,'registered');
 const row=await db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(saved.id).first(),snapshot=await candidateSnapshot(row);
 await saveDotSourceRecheck(s,reader,{id:row.id,snapshot,revision:row.review_revision,requestId:'d1-source-check-atomic-0001',observation:'Synthetic source and date confirmed',checks:{facts:true,original:true,rights:true}},actor,now+1);
 await saveDotHistoryCheck(s,{id:row.id,snapshot,revision:row.review_revision,requestId:'d1-history-check-atomic-0001',basis:'New isolated fixture history reviewed',evidenceRef:'isolated-history-only',checks:{archives:true,identity:true,scope:true}},actor,now+2);
 return {now,actor,reader,input,confirmation,row,snapshot,saved};
}
const count=async(db,table,where='1',args=[])=>Number((await db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE '+where).bind(...args).first()).n);
async function clone(db,row,{id='unrelated',url='https://fixture.invalid/unrelated',sourceId='sleepfreaks',expiry=row.expires_at}={}){
 const copy={...row,id,source_id:sourceId,source_url:url,normalized_url:url,topic_key:id,origin:'automatic_collection',expires_at:expiry};
 return db.prepare('INSERT OR IGNORE INTO candidate_items('+Object.keys(copy).join(',')+') VALUES('+Object.keys(copy).map(()=>'?').join(',')+')').bind(...Object.values(copy)).run();
}
async function erased(rt,f){
 const {db}=rt;
 assert.equal(await count(db,'candidate_items','id=?',[f.saved.id]),0);
 for(const table of ['news_dot_admission_receipts','news_dot_publication_checks','news_dot_history_checks','news_dot_history_exclusions','news_assisted_edits','news_facts_rechecks','news_pending_lifecycle'])assert.equal(await count(db,table,'candidate_id=?',[f.saved.id]),0,table);
 assert.equal(await count(db,'news_dot_confirmations','candidate_id=?',[f.input.candidateId]),0);
 const deleted=await db.prepare('SELECT * FROM news_dot_deleted_receipts WHERE request_id=?').bind(f.input.requestId).first();
 assert.equal(deleted.candidate_id,f.saved.id);assert.equal(deleted.dot_candidate_id,f.input.candidateId);
 assert.equal(deleted.staging_revision,'123:4');assert.match(deleted.candidate_digest,/^[a-f0-9]{64}$/);
 assert.ok(deleted.deleted_at>0);assert.equal(deleted.source_url,f.input.human.url);
 assert.ok(!Object.hasOwn(deleted,'evidence_json'));assert.ok(!Object.hasOwn(deleted,'actor_id'));
 return deleted;
}
async function replay(rt,f){
 // An unavailable external reader proves ACK recovery uses the authoritative D1 receipt.
 const unavailable={detail:async()=>{throw Error('must_not_refetch_deleted_candidate');}};
 const repeat=()=>admitDotCandidate(rt.store,unavailable,f.input,f.actor,f.now+1000,SOURCES,pepper);
 const [a,b]=await Promise.all([repeat(),repeat()]);
 assert.equal(a.status,'deleted');assert.equal(a.replayed,true);assert.deepEqual(a,b);
 await assert.rejects(()=>admitDotCandidate(rt.store,unavailable,{...f.input,requestId:'different-registration-request'},f.actor,f.now,SOURCES,pepper),/idempotency_payload_changed/);
 await assert.rejects(()=>admitDotCandidate(rt.store,unavailable,{...f.input,human:{...f.input.human,product:'changed'}},f.actor,f.now,SOURCES,pepper),/idempotency_payload_changed/);
 await assert.rejects(()=>admitDotCandidate(rt.store,unavailable,f.input,{...f.actor,id:'access:different'},f.now,SOURCES,pepper),/idempotency_payload_changed/);
 assert.deepEqual(await admitDotCandidate(rt.store,unavailable,{...f.input,candidateId:'different-dot-id',requestId:'different-registration-request'},f.actor,f.now,SOURCES,pepper),{status:'excluded',reasons:['deleted_article']});
 assert.equal(await count(rt.db,'candidate_items','id=?',[f.saved.id]),0);
}
for(const mode of ['purge','item-delete','source-delete'])test('workerd D1 deletion succeeds: '+mode,()=>isolated(async(rt,restart)=>{
 const f=await fixture(rt);
 await clone(rt.db,f.row,{id:'audit-unrelated',sourceId:mode==='source-delete'?'yamaha':'sleepfreaks'});
 await clone(rt.db,f.row,{id:'audit-retained',url:'https://fixture.invalid/retained',expiry:f.now+200*86400000});
 if(mode==='purge')assert.equal((await rt.store.purge(f.now+100*86400000)).news,2);
 else{
  if(mode==='source-delete')await rt.db.prepare("UPDATE source_state SET disabled=0 WHERE source_id='yamaha'").run();
  await administer(rt.store,{action:mode,target:mode==='item-delete'?f.saved.id:'yamaha',reason:'owner_request'},f.now,SOURCES);
  assert.equal(await count(rt.db,'news_admin_audit','action=?',[mode]),1);
 }
 const d=await erased(rt,f);
 assert.equal(await count(rt.db,'candidate_items',"id='audit-retained'"),1);
 assert.equal(await count(rt.db,'candidate_items',"id='audit-unrelated'"),mode==='item-delete'?1:0);
 if(mode==='item-delete'){
  assert.equal(d.item_takedown,1);
  assert.equal(await count(rt.db,'news_takedowns','item_id=?',[f.saved.id]),1);
 }
 if(mode==='source-delete'){
  assert.equal(d.source_stopped,1);
  assert.deepEqual(await rt.db.prepare("SELECT disabled,takedown,publication_blocked FROM source_state WHERE source_id='yamaha'").first(),{disabled:1,takedown:1,publication_blocked:1});
 }
 await replay(rt,f);
 rt=await restart();await erased(rt,f);await replay(rt,f);
 if(mode==='item-delete'){
  // The ordinary 90-day takedown may expire; the independent deny key survives.
  await rt.store.purge(f.now+100*86400000);
  assert.equal(await count(rt.db,'news_takedowns','item_id=?',[f.saved.id]),0);
  await replay(rt,f);
 }
}));

test('workerd D1 legacy direct DELETE, reinsertion and approval cannot bypass deletion',()=>isolated(async(rt)=>{
 const f=await fixture(rt);
 await assert.rejects(()=>rt.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id=?").bind(f.saved.id).run(),/dot_scope_protocol_required/);
 await assert.rejects(()=>rt.db.prepare('DELETE FROM news_dot_admission_receipts WHERE candidate_id=?').bind(f.saved.id).run(),/dot_deletion_receipt_required/);
 await assert.rejects(()=>rt.db.prepare('UPDATE news_dot_admission_receipts SET candidate_digest=? WHERE candidate_id=?').bind('a'.repeat(64),f.saved.id).run(),/dot_receipt_immutable/);
 const result=await rt.db.prepare('DELETE FROM candidate_items WHERE id=?').bind(f.saved.id).run();
 assert.ok(result.meta.changes>1);await erased(rt,f);
 for(const id of [f.saved.id,'new-id-same-url'])assert.equal((await clone(rt.db,f.row,{id,url:f.row.source_url})).meta.changes,0);
 assert.equal((await clone(rt.db,f.row,{id:f.saved.id,url:'https://fixture.invalid/changed-url'})).meta.changes,0);
 assert.equal((await clone(rt.db,f.row)).meta.changes,1);
 await assert.rejects(()=>rt.db.prepare("UPDATE candidate_items SET normalized_url=? WHERE id='unrelated'").bind(f.row.source_url).run(),/dot_candidate_deleted/);
 await assert.rejects(()=>rt.db.prepare('DELETE FROM news_dot_deleted_receipts').run(),/dot_deleted_receipt_immutable/);
 await assert.rejects(()=>rt.db.prepare("UPDATE news_dot_deleted_receipts SET source_url='https://fixture.invalid'").run(),/dot_deleted_receipt_immutable/);
 await assert.rejects(()=>saveDotConfirmation(rt.db,f.reader,{...f.confirmation,requestId:'confirmation-after-deletion'},f.actor,f.now),/dot_candidate_deleted/);
 // Old SQL tries to copy the opaque receipt back; the independent guard rejects it first.
 await assert.rejects(()=>rt.db.prepare(`INSERT INTO news_dot_admission_receipts SELECT request_id,dot_candidate_id,delivery_key_hash,candidate_id,confirmation_id,candidate_digest,staging_revision,evidence_hash,admission_hash,'legacy',created_at FROM news_dot_deleted_receipts`).run(),/dot_candidate_deleted/);
 // Existing approval trigger + the new deleted-ID guard reject a legacy ledger INSERT.
 const ledgerColumns=(await rt.db.prepare('PRAGMA table_info(news_decision_ledger)').all()).results.map(x=>x.name);
 const values={decision_id:'legacy-approval',candidate_id:f.saved.id,verdict:'approve',reason:'operator_review',actor_type:'human_operator',actor_id:'legacy',decided_at:f.now,source_id:'yamaha',category:'acoustic_guitar',decision_features_json:'{}',policy_version:'legacy',request_id:'legacy-approval-request',request_payload_hash:'a'.repeat(64),candidate_revision:0,candidate_snapshot:'b'.repeat(64),success_state:'committed',correction_of:null,created_at:f.now,persisted_label:'Yamaha FG700 announcement',checks_json:'{}'};
 await assert.rejects(()=>rt.db.prepare('INSERT INTO news_decision_ledger('+ledgerColumns.join(',')+') VALUES('+ledgerColumns.map(()=>'?').join(',')+')').bind(...ledgerColumns.map(k=>values[k])).run(),/dot_candidate_deleted/);
 await replay(rt,f);
}));

test('workerd D1 source-delete failure rolls back stop, tombstone and payload cleanup together',()=>isolated(async(rt)=>{
 const f=await fixture(rt);
 await rt.db.prepare("UPDATE source_state SET disabled=0 WHERE source_id='yamaha'").run();
 await rt.db.prepare("CREATE TRIGGER test_delete_failure BEFORE DELETE ON news_dot_confirmations BEGIN SELECT RAISE(ABORT,'injected_delete_failure'); END").run();
 await assert.rejects(()=>administer(rt.store,{action:'source-delete',target:'yamaha',reason:'owner_request'},f.now,SOURCES),/injected_delete_failure/);
 assert.equal(await count(rt.db,'news_dot_deleted_receipts'),0);
 assert.equal(await count(rt.db,'candidate_items','id=?',[f.saved.id]),1);
 assert.equal(await count(rt.db,'news_dot_admission_receipts'),1);
 assert.equal(await count(rt.db,'news_dot_publication_checks'),1);
 assert.equal(await count(rt.db,'news_admin_audit',"action='source-delete'"),0);
 assert.deepEqual(await rt.db.prepare("SELECT disabled,takedown,publication_blocked FROM source_state WHERE source_id='yamaha'").first(),{disabled:0,takedown:0,publication_blocked:0});
 await rt.db.prepare('DROP TRIGGER test_delete_failure').run();
 await administer(rt.store,{action:'source-delete',target:'yamaha',reason:'owner_request'},f.now,SOURCES);
 await erased(rt,f);
}));

test('workerd D1 one failing mixed batch rolls back the already deleted Dot row',()=>isolated(async(rt)=>{
 const f=await fixture(rt);await clone(rt.db,f.row);
 await rt.db.prepare("CREATE TRIGGER test_delete_failure BEFORE DELETE ON candidate_items WHEN OLD.id='unrelated' BEGIN SELECT RAISE(ABORT,'injected_delete_failure'); END").run();
 await assert.rejects(()=>rt.db.batch([rt.db.prepare('DELETE FROM candidate_items WHERE id=?').bind(f.saved.id),rt.db.prepare("DELETE FROM candidate_items WHERE id='unrelated'")]),/injected_delete_failure/);
 assert.equal(await count(rt.db,'candidate_items'),2);assert.equal(await count(rt.db,'news_dot_admission_receipts'),1);assert.equal(await count(rt.db,'news_dot_deleted_receipts'),0);
 await rt.db.prepare('DROP TRIGGER test_delete_failure').run();
 await rt.store.purge(f.now+100*86400000);await erased(rt,f);
}));

for(const status of ['approved','rejected'])test('workerd D1 deletes '+status+' payload while retaining the human decision',()=>isolated(async(rt,restart)=>{
 const f=await fixture(rt),base={id:f.saved.id,snapshot:f.snapshot,revision:f.row.review_revision};
 let input={...base,action:'reject',reason:'not_relevant',requestId:'reject-before-deletion-0001'};
 if(status==='approved'){
  assert.equal((await dotPublicationGate(rt.store,f.reader,f.saved.id,f.now+3,SOURCES,pepper)).status,'PASS');
  const v=await publicationValidation(rt.store,f.row,f.now+3,SOURCES,pepper);
  input={...base,action:'approve',reason:'operator_review',requestId:'approve-before-deletion-0001',label:v.publishableLabel,category:await effectiveCategory(rt.store,f.row),publishedAt:f.row.published_at,checks:{factsChecked:true,relevanceChecked:true,duplicateChecked:true,independentLabelChecked:true}};
 }
 await operatorDecision(rt.store,input,f.now+3,SOURCES,pepper,f.actor,{enabled:true,reader:f.reader,clock:()=>f.now+3});
 await administer(rt.store,{action:'item-delete',target:f.saved.id,reason:'owner_request'},f.now+4,SOURCES);
 assert.equal((await erased(rt,f)).prior_status,status);
 const retained=await rt.db.prepare('SELECT verdict,persisted_label FROM news_decision_ledger WHERE candidate_id=?').bind(f.saved.id).first();
 assert.deepEqual(retained,{verdict:status==='approved'?'approve':'reject',persisted_label:null});
 rt=await restart();await replay(rt,f);assert.equal(await count(rt.db,'news_decision_ledger'),1);
}));

test('workerd D1 additive migration upgrades populated schema and reapplies without altering data',()=>isolated(async(rt)=>{
 // Reconstruct the unchanged 0029 schema, then populate it using the real services.
 for(const [,name] of migration.matchAll(/CREATE TRIGGER IF NOT EXISTS (\w+)/g))await rt.db.prepare('DROP TRIGGER '+name).run();
 await rt.db.prepare('DROP TABLE news_dot_deleted_receipts').run();
 const f=await fixture(rt);
 const live=await rt.db.prepare('SELECT * FROM news_dot_admission_receipts').first();
 await rt.db.batch(migrationStatements(migration).map(sql=>rt.db.prepare(sql)));
 assert.deepEqual(await rt.db.prepare('SELECT * FROM news_dot_admission_receipts').first(),live);
 await administer(rt.store,{action:'item-delete',target:f.saved.id,reason:'owner_request'},f.now,SOURCES);
 const before=await erased(rt,f);
 await rt.db.batch(migrationStatements(migration).map(sql=>rt.db.prepare(sql)));
 assert.deepEqual(await erased(rt,f),before);await replay(rt,f);
}));

test('workerd D1 concurrent deletes and lost ACK preserve one deletion receipt',()=>isolated(async(rt,restart)=>{
 const f=await fixture(rt);
 const erase=()=>administer(rt.store,{action:'item-delete',target:f.saved.id,reason:'owner_request'},f.now,SOURCES);
 // Discard responses (ACK loss); two callers and retry must not resurrect payload.
 await Promise.all([erase(),erase()]);await erase();
 assert.equal(await count(rt.db,'news_dot_deleted_receipts'),1);await erased(rt,f);
 rt=await restart();await replay(rt,f);
}));

test('workerd D1 approval racing owner deletion cannot leave published payload',()=>isolated(async(rt,restart)=>{
 const f=await fixture(rt),v=await publicationValidation(rt.store,f.row,f.now+3,SOURCES,pepper);
 const input={id:f.saved.id,snapshot:f.snapshot,revision:f.row.review_revision,action:'approve',reason:'operator_review',requestId:'approve-racing-delete-0001',label:v.publishableLabel,category:await effectiveCategory(rt.store,f.row),publishedAt:f.row.published_at,checks:{factsChecked:true,relevanceChecked:true,duplicateChecked:true,independentLabelChecked:true}};
 const result=await Promise.allSettled([
  operatorDecision(rt.store,input,f.now+3,SOURCES,pepper,f.actor,{enabled:true,reader:f.reader,clock:()=>f.now+3}),
  administer(rt.store,{action:'item-delete',target:f.saved.id,reason:'owner_request'},f.now+4,SOURCES)
 ]);
 assert.equal(result[1].status,'fulfilled');
 await erased(rt,f);assert.equal(await count(rt.db,'news_takedowns','item_id=?',[f.saved.id]),1);
 assert.equal(await count(rt.db,'news_decision_ledger','persisted_label IS NOT NULL'),0);
 rt=await restart();await replay(rt,f);assert.equal(await count(rt.db,'candidate_items'),0);
}));
