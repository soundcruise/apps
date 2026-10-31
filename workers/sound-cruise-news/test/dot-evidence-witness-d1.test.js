import test from 'node:test';import assert from 'node:assert/strict';
import {isolated,fixture} from './dot-witness-fixture.js';
import {dotPublicationGate} from '../src/dot-publication-gate.js';
import {saveDotHistoryExclusion,historySubjects} from '../src/dot-history-exclusion.js';
import {operatorDecision} from '../src/operator-review.js';
import {publicationValidation} from '../src/decision-policy.js';
import {effectiveCategory} from '../src/category-editor.js';
import {SOURCES} from '../src/registry.js';import {pepper} from './helpers.js';

async function archives(rt,f){
 for(const id of ['archive-a','archive-b'])await rt.db.prepare('INSERT INTO news_takedowns VALUES(?,?)').bind(id,f.now+600000).run();
 for(const subject of (await historySubjects(rt.store,f.saved.id)).items){
  const id=subject.subject_key.slice('takedown:'.length);
  await saveDotHistoryExclusion(rt.store,{id:f.saved.id,snapshot:f.snapshot,revision:f.row.review_revision,requestId:'evidence-for-'+id+'-000001',subjectKey:subject.subject_key,subjectToken:subject.subject_token,archive:{url:'https://fixture.invalid/'+id,brand:'OtherFixture',product:'UNRELATED-'+id,event:'independent_announcement',evidenceRef:'independent synthetic archive for '+id}},f.actor,f.now+2);
 }
 await rt.db.prepare("DELETE FROM news_takedowns WHERE item_id='archive-b'").run();
}
async function approval(rt,f,requestId='approval-with-witness-00001'){
 const validation=await publicationValidation(rt.store,f.row,f.now+3,SOURCES,pepper);
 return {id:f.saved.id,snapshot:f.snapshot,revision:f.row.review_revision,action:'approve',reason:'operator_review',requestId,label:validation.publishableLabel,category:await effectiveCategory(rt.store,f.row),publishedAt:f.row.published_at,checks:{factsChecked:true,relevanceChecked:true,duplicateChecked:true,independentLabelChecked:true}};
}
const gate=(rt,f)=>dotPublicationGate(rt.store,f.reader,f.saved.id,f.now+3,SOURCES,pepper);
async function late(rt,f,mutation){
 const input=await approval(rt,f),native=rt.db.prepare.bind(rt.db);let hit=false;
 rt.store.db={prepare(sql){const stmt=native(sql);if(!sql.startsWith('INSERT INTO news_decision_ledger'))return stmt;return {bind(...args){const bound=stmt.bind(...args);return {async run(){hit=true;rt.store.db=rt.db;await mutation();return bound.run();}};}};}};
 try{await assert.rejects(()=>operatorDecision(rt.store,input,f.now+3,SOURCES,pepper,f.actor,{enabled:true,reader:f.reader,clock:()=>f.now+3}),/stale_decision|dot_publication_gate_pending|decision_transaction_failed|candidate_takedown|duplicate/);assert.equal(hit,true);}finally{rt.store.db=rt.db;}
 assert.equal((await rt.db.prepare("SELECT COUNT(*) n FROM news_decision_ledger WHERE verdict='approve'").first()).n,0);
}

test('workerd exact witness rejects A deletion/B insertion at final approval, and fresh revalidation succeeds',()=>isolated(async(rt)=>{
 const f=await fixture(rt);await archives(rt,f);const before=await gate(rt,f);assert.equal(before.status,'PASS');
 await late(rt,f,()=>rt.db.batch([rt.db.prepare("DELETE FROM news_takedowns WHERE item_id='archive-a'"),rt.db.prepare("INSERT INTO news_takedowns VALUES('archive-b',?)").bind(f.now+600000)]));
 const part=before.fence.snapshotParts[0];assert.notEqual((await rt.db.prepare(`SELECT (${part.sql}) value`).bind(...part.args).first()).value,part.value);
 assert.equal((await gate(rt,f)).status,'PASS');
 await operatorDecision(rt.store,await approval(rt,f,'fresh-revalidated-approval-001'),f.now+3,SOURCES,pepper,f.actor,{enabled:true,reader:f.reader,clock:()=>f.now+3});
 const row=await rt.db.prepare('SELECT decision_id,state FROM news_dot_scope_witnesses WHERE decision_id IS NOT NULL').first();assert.ok(row.decision_id);assert.ok(JSON.parse(row.state).evidence.length>0);
 await dotPublicationGate(rt.store,f.reader,f.saved.id,f.now+400000,SOURCES,pepper);
 assert.equal((await rt.db.prepare('SELECT COUNT(*) n FROM news_dot_scope_witnesses WHERE decision_id=?').bind(row.decision_id).first()).n,1);
}));

for(const mode of ['revoke','recreate_same_id','expire','target_takedown','formal_duplicate','reject'])test('workerd final INSERT rejects late '+mode,()=>isolated(async(rt)=>{
 const f=await fixture(rt);await archives(rt,f);assert.equal((await gate(rt,f)).status,'PASS');
 const evidence=await rt.db.prepare("SELECT * FROM news_dot_history_exclusions WHERE subject_key='takedown:archive-a'").first();
 await late(rt,f,async()=>{
  if(mode==='target_takedown')return rt.db.prepare('INSERT INTO news_takedowns VALUES(?,?)').bind(f.saved.id,f.now+600000).run();
  if(mode==='formal_duplicate'){
   const copy={...f.row,review_status:'approved',origin:'automatic_collection',id:'late-related',source_url:'https://fixture.invalid/duplicate',normalized_url:'https://fixture.invalid/duplicate',topic_key:'late-related'};
   return rt.db.prepare('INSERT INTO candidate_items('+Object.keys(copy).join(',')+') VALUES('+Object.keys(copy).map(()=>'?').join(',')+')').bind(...Object.values(copy)).run();
  }
  if(mode==='reject')return operatorDecision(rt.store,{id:f.saved.id,snapshot:f.snapshot,revision:f.row.review_revision,action:'reject',reason:'not_relevant',requestId:'late-human-reject-000001'},f.now+3,SOURCES,pepper,f.actor);
  await rt.db.prepare('DELETE FROM news_dot_history_exclusions WHERE request_id=?').bind(evidence.request_id).run();
  if(mode==='revoke')return;
  const copy={...evidence,...(mode==='expire'?{expires_at:f.now+2}:{})};
  return rt.db.prepare('INSERT INTO news_dot_history_exclusions('+Object.keys(copy).join(',')+') VALUES('+Object.keys(copy).map(()=>'?').join(',')+')').bind(...Object.values(copy)).run();
 });
 if(mode==='formal_duplicate')assert.ok((await publicationValidation(rt.store,f.row,f.now+3,SOURCES,pepper)).errors.includes('duplicate'));
}));

test('workerd witnesses reject tampering, disappear on candidate deletion, and cleanup leaves committed proofs',()=>isolated(async(rt)=>{
 const f=await fixture(rt);await archives(rt,f);const proof=await gate(rt,f);assert.equal(proof.status,'PASS');
 await assert.rejects(()=>rt.db.prepare("UPDATE news_dot_history_exclusions SET evidence_ref='changed'").run(),/history_evidence_immutable/);
 await assert.rejects(()=>rt.db.prepare("UPDATE news_dot_scope_witnesses SET state='{}'").run(),/dot_witness_immutable/);
 await rt.db.prepare('DELETE FROM candidate_items WHERE id=?').bind(f.saved.id).run();
 assert.equal((await rt.db.prepare('SELECT COUNT(*) n FROM news_dot_scope_witnesses').first()).n,0);
 assert.equal((await rt.db.prepare('SELECT COUNT(*) n FROM news_dot_deleted_receipts').first()).n,1);
}));

test('workerd witness upgrade preserves populated receipts and reapplies safely',()=>isolated(async(rt)=>{
 const {readFile}=await import('node:fs/promises'),{migrationStatements}=await import('../scripts/migration-statements.mjs');
 const apply=async(name)=>rt.db.batch(migrationStatements(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8')).map(sql=>rt.db.prepare(sql)));
 // Reconstruct the schema immediately before 0032, with existing evidence.
 for(const trigger of ['news_dot_scope_witness_commit','news_dot_scope_witness_immutable','news_dot_scope_protocol','news_dot_scope_candidate_approval'])await rt.db.prepare('DROP TRIGGER '+trigger).run();
 await rt.db.prepare('DROP TABLE news_dot_scope_witnesses').run();
 await apply('0029_dot_history_scope.sql');
 const f=await fixture(rt);await archives(rt,f);
 const receipt=await rt.db.prepare('SELECT * FROM news_dot_admission_receipts').first();
 assert.equal((await gate(rt,f)).status,'HOLD');
 await apply('0032_dot_scope_witness.sql');assert.equal((await gate(rt,f)).status,'PASS');
 await apply('0031_dot_evidence_events.sql');await apply('0032_dot_scope_witness.sql');
 assert.equal((await gate(rt,f)).status,'PASS');assert.deepEqual(await rt.db.prepare('SELECT * FROM news_dot_admission_receipts').first(),receipt);
}));
