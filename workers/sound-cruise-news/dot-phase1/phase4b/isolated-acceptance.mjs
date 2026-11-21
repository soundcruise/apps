// Isolated acceptance harness: always owns an in-memory SQLite DB. Never accepts
// D1, Cloud Run, Firestore credentials, a real human identity or publisher fetch.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NewsStore} from '../../src/store.js';
import {prepareAssisted,saveAssisted} from '../../src/assisted-entry.js';
import {publicationValidation} from '../../src/decision-policy.js';
import {reviewQueue,operatorDecision,candidateSnapshot} from '../../src/operator-review.js';
import {validateInput} from '../engine.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
export function createIsolatedAcceptance({registry,pepper,now}){
 const raw=new DatabaseSync(':memory:'), migrations=new URL('../../migrations/',import.meta.url);
 for(const f of readdirSync(migrations).sort())raw.exec(readFileSync(new URL(f,migrations),'utf8'));
 raw.exec('CREATE TABLE dot_fixture_receipts(delivery_key TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,review_hash TEXT NOT NULL,request_id TEXT NOT NULL UNIQUE,candidate_id TEXT NOT NULL,status TEXT NOT NULL)');
 const wrap=(sql,args=[])=>({bind:(...v)=>wrap(sql,v),first:async()=>raw.prepare(sql).get(...args)||null,all:async()=>({results:raw.prepare(sql).all(...args)}),run:()=>({meta:raw.prepare(sql).run(...args)})});
 const db={prepare:wrap,batch:async statements=>{raw.exec('BEGIN');try{const r=statements.map(x=>x.run());raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}}},store=new NewsStore(db);
 const actor={type:'human_operator',id:'fixture-human-only'};
 async function ingest(snapshot,human){
  const checked=validateInput(snapshot?.input);if(!checked.valid)return {status:'needs_confirmation',reasons:['invalid_dot_json']};
  const c=checked.data.candidate, key=c.idempotency_key, payloadHash=sha(JSON.stringify(stable(checked.data))), requestId='dot-fixture-'+sha(key).slice(0,40);
  const prior=raw.prepare('SELECT * FROM dot_fixture_receipts WHERE delivery_key=?').get(key);
  if(prior&&prior.payload_hash!==payloadHash)return {status:'conflict'};
  // Human input is separate from Dot; no claim or self-reported evidence is
  // converted into confirmation. This harness uses a synthetic human only.
  if(!human||human.confirmed!==true||human.sourceId!=='yamaha')return {status:'needs_confirmation',reasons:['independent_human_confirmation_required']};
  const reviewHash=sha(JSON.stringify(stable(human)));if(prior&&prior.review_hash!==reviewHash)return {status:'conflict'};
  if(prior?.status==='saved')return {status:'replay',id:prior.candidate_id};
  if(prior?.status==='reserved'&&await db.prepare('SELECT request_id FROM news_assisted_edits WHERE request_id=?').bind(requestId).first()){raw.prepare("UPDATE dot_fixture_receipts SET status='saved' WHERE delivery_key=?").run(key);return {status:'replay',id:prior.candidate_id};}
  if(!c.sources.some(s=>s.url===human.url&&s.canonical_url===human.url))return {status:'needs_confirmation',reasons:['source_binding_mismatch']};
  if(![c.entity.brand,c.entity.manufacturer].includes(human.brand)||![c.entity.product,...c.entity.models].includes(human.product))return {status:'needs_confirmation',reasons:['identity_binding_mismatch']};
  if(c.event.type!=='unknown'&&c.event.type!==human.action)return {status:'needs_confirmation',reasons:['event_binding_mismatch']};
  if(c.dates.article_published.precision==='day'&&c.dates.article_published.value!==human.publishedAt)return {status:'needs_confirmation',reasons:['date_binding_mismatch']};
  const input={...human,requestId};const prepared=await prepareAssisted(store,input,now,registry,pepper);
  if(!prepared.valid)return {status:'needs_confirmation',reasons:prepared.errors};
  if(prepared.duplicates.length)return {status:'excluded',reason:'formal_duplicate',duplicates:prepared.duplicates.map(x=>x.id)};
  const target=prepared.row.id;
  const protectedRow=await db.prepare("SELECT id,review_status FROM candidate_items WHERE id=? OR normalized_url=? OR source_url=?").bind(target,human.url,human.url).first();
  if(protectedRow)return {status:'excluded',reason:'existing_candidate'};
  if(await db.prepare('SELECT item_id FROM news_takedowns WHERE item_id=?').bind(target).first())return {status:'excluded',reason:'takedown'};
  if(await db.prepare('SELECT candidate_id FROM news_decision_ledger WHERE candidate_id=?').bind(target).first())return {status:'excluded',reason:'retained_decision'};
  if(await db.prepare('SELECT normalized_url FROM news_discovery_work WHERE normalized_url=?').bind(human.url).first())return {status:'needs_confirmation',reasons:['existing_discovery_history']};
  if(!prior){raw.prepare('INSERT OR IGNORE INTO dot_fixture_receipts VALUES(?,?,?,?,?,?)').run(key,payloadHash,reviewHash,requestId,target,'reserved');const reservation=raw.prepare('SELECT * FROM dot_fixture_receipts WHERE delivery_key=?').get(key);if(!reservation||reservation.payload_hash!==payloadHash||reservation.review_hash!==reviewHash)return {status:'conflict'};}
  let saved;try{saved=await saveAssisted(store,input,now,registry,pepper,actor);}catch(e){if(await db.prepare('SELECT request_id FROM news_assisted_edits WHERE request_id=?').bind(requestId).first()){raw.prepare("UPDATE dot_fixture_receipts SET status='saved' WHERE delivery_key=?").run(key);return {status:'replay',id:target};}throw e;}if(!saved.saved)return {status:'needs_confirmation',reasons:saved.errors||['official_save_failed']};
  raw.prepare("UPDATE dot_fixture_receipts SET status='saved' WHERE delivery_key=? AND payload_hash=?").run(key,payloadHash);
  const row=await db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(target).first();return {status:'pending',id:target,validation:await publicationValidation(store,row,now,registry,pepper)};
 }
 async function simulateReject(id){const row=await db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(id).first();if(!row)throw Error('not_found');return operatorDecision(store,{id,action:'reject',reason:'not_relevant',requestId:'fixture-reject-'+sha(id).slice(0,24),revision:row.review_revision,snapshot:await candidateSnapshot(row)},now,registry,pepper,actor);}
 return {ingest,queue:()=>reviewQueue(store,{now,registry,pepper}),simulateReject,store,raw,close:()=>raw.close()};
}
