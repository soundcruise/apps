import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {store,pepper} from './helpers.js';
import {getSource} from '../src/registry.js';
import {administer} from '../src/admin.js';
import {hash,DAY} from '../src/policy.js';
import {parseOfficialListing} from '../src/official-listing.js';
import {persistDiscoveredEntries} from '../src/collector.js';
import {recordPreparationMetrics} from '../src/preparation-metrics.js';
import {parseIkebeProductEvidence,IKEBE_PRODUCT_PARSER} from '../src/ikebe-product-evidence.js';
import {sealPrimaryProof} from '../src/primary-provenance.js';
import {reusablePrimaryEvidence} from '../src/facts-recheck.js';
import {inspectIkebeWebEvidence,reconcileWebEvidence} from '../src/web-evidence-bridge.js';
import {saveHint} from '../src/web-discovery.js';
import {publicationValidation} from '../src/decision-policy.js';
import {retail,retailHtml} from './fixtures/pending-november.js';

const at=Date.parse('2026-11-08T01:00:00Z'),robot='User-agent: *\nAllow: /';
const production=JSON.parse(readFileSync(new URL('./fixtures/web-ikebe-production-projection.json',import.meta.url)));
async function setup(){
 const s=await store(),raw={...getSource('ikebe'),enabled:false,productionEnabled:false,robotsHash:await hash(robot)},a={...raw,enabled:true,productionEnabled:true};
 await administer(s,{action:'publish-on',reason:'review_complete'},at,[a]);
 await s.recordHealth({sourceId:a.id,status:'healthy',reasonCode:'ok',checkedAt:at,successfulAt:at});
 await s.db.prepare('INSERT OR REPLACE INTO source_state(source_id,last_discovery_at,robots_hash) VALUES(?,?,?)').bind(a.id,at,a.robotsHash).run();
 const env={NEWS_DB:s.db,NEWS_SOURCE_IDS:'["ikebe"]',NEWS_HEADLINE_PEPPER:pepper,NEWS_WEB_EVIDENCE_ENABLED:'true'};
 return {s,raw,a,env,inspect:url=>inspectIkebeWebEvidence(s,url,at,[a],pepper),run:()=>reconcileWebEvidence(env,at,{registry:[raw]})};
}
async function hint(x,url){await saveHint(x.s.db,{url,title:'検索タイトルは正式証拠に使用しない',provider:'exa',searchedAt:at},at);}
async function listing(x,f=retail[0]){
 // Synthetic permitted listing/card and detail, NOT production publisher HTML.
 const html=`<article class="post-999999 type-post category-accessory"><h2 class="topics_box--h1"><a href="${f.url}">${f.title}</a></h2><time class="sub_info_date2" datetime="${f.day}">${f.day.replace('-','年').replace('-','月')}日</time></article>`;
 const {entries}=parseOfficialListing(html,x.a),report={sourceId:x.a.id,requestMode:'scheduled',outcome:'ok',pending:0,duplicates:0,rejected:0};
 await persistDiscoveredEntries(entries,x.a,x.s,{isAllowed:()=>true},at,pepper,[x.a],report);
 await recordPreparationMetrics(x.s,report,at,[x.a],pepper);
 return x.s.db.prepare('SELECT * FROM candidate_items WHERE source_url=?').bind(f.url).first();
}
async function cache(x,row,f=retail[0]){
 const parsed=parseIkebeProductEvidence(retailHtml(f),x.a,row),item={id:row.id,sourceUrl:row.source_url,...parsed};
 const proof=await sealPrimaryProof({sourceId:x.a.id,sourceUrl:row.source_url,publishedAt:row.published_at,evidenceKey:await hash(row.title_fingerprint),verifiedAt:at-1000,responseHash:await hash(retailHtml(f)),parserVersion:IKEBE_PRODUCT_PARSER,pipelineVersion:'primary-announcement-5',extractionMethod:'explicit_ikebe_product_fields'},item,row);
 await x.s.db.prepare("INSERT INTO news_facts_sources(source_id,lease_token,checked_at,outcome,items_json,proof_json) VALUES(?,'local-fixture',?,'verified_surface',?,?)").bind('ikebe:fixture:'+row.id,at-1000,JSON.stringify([item]),JSON.stringify(proof)).run();
 return {item,proof};
}
const count=async(s,table)=>(await s.db.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n;

test('search → ordinary permitted listing → bound saved proof → official READY, with zero publisher requests',async()=>{
 const x=await setup(),url=retail[0].url;await hint(x,url);
 assert.equal((await x.inspect(url)).view.reason,'formal_candidate_not_created');
 await x.run();assert.equal(await count(x.s,'candidate_items'),0);
 const row=await listing(x);assert(row);assert.equal((await x.inspect(url)).view.path,'C');
 await cache(x,row);assert.equal((await x.inspect(url)).view.path,'B');
 const transportBefore=JSON.stringify(await x.s.db.prepare('SELECT * FROM news_facts_sources').all());
 const result=await x.run();assert.equal(result.attempted,1);assert.equal(result.publisherRequests,0);assert.equal(result.items[0].path,'A',JSON.stringify(result));assert.equal(result.items[0].formalReady,true);
 const saved=await x.s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(row.id).first();
 assert.equal(saved.review_status,'pending');assert.equal(saved.review_revision,row.review_revision+1);
 assert.equal((await publicationValidation(x.s,saved,at,[x.a],pepper)).valid,true);
 assert.equal(JSON.parse(saved.product_facts).productType,'maintenance_tool_kit');
 assert.equal(saved.published_at,row.published_at);assert(saved.facts_provenance);
 assert.equal(JSON.stringify(await x.s.db.prepare('SELECT * FROM news_facts_sources').all()),transportBefore);
 const stable=JSON.stringify(saved),rechecks=await count(x.s,'news_facts_rechecks');
 assert.equal((await x.run()).attempted,0);await listing(x);
 assert.equal(await count(x.s,'candidate_items'),1);assert.equal(await count(x.s,'news_facts_rechecks'),rechecks);
 assert.equal(JSON.stringify(await x.s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(row.id).first()),stable);
 for(const table of ['news_decision_ledger','news_takedowns'])assert.equal(await count(x.s,table),0);
});

test('actual production projection retains decisions and original hashes, not synthetic production READY claims',async()=>{
 const x=await setup();assert.deepEqual(production.inventory,{workRows:29,workEvidenceRows:12,verifiedWorkEvidence:8,cacheRows:3,savedIkebeHints:0});
 for(const observed of production.rows){
  // Unobserved required bookkeeping is explicitly synthetic. The original
  // public facts, hashes, fingerprint and decision columns remain untouched.
  const row={category:'media_other',collected_at:new Date(at).toISOString(),review_reason:'local_projection_only',...observed};
  const keys=Object.keys(row);x.s.db.raw.prepare(`INSERT INTO candidate_items(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));
  const before=JSON.stringify(await x.s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(row.id).first());
  const v=await x.inspect(row.source_url);assert.equal(v.view.path,'A');assert.equal(v.view.reason,'existing_decision_reference');assert.equal(v.view.formalReady,false);assert.equal(v.view.publishedAt,null);
  assert.equal(JSON.stringify(await x.s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(row.id).first()),before);
 }
 const successful=production.cache.find(c=>c.outcome==='verified_surface');
 const row=production.rows.find(r=>r.source_url===JSON.parse(successful.proof_json).sourceUrl);
 assert(await reusablePrimaryEvidence(successful,row,x.a,production.at));
 assert.equal(await count(x.s,'news_facts_rechecks'),0);
});

test('unchanged incompatible identity is diagnosed once; a new proof/snapshot is required for another attempt',async()=>{
 const x=await setup(),row=await listing(x);const {item}=await cache(x,row);await hint(x,row.source_url);
 await x.s.db.prepare('UPDATE candidate_items SET product_facts=?,event_type=? WHERE id=?').bind(JSON.stringify({...item.productFacts,product:'Different Model 9000',models:['Different Model 9000']}),item.eventType,row.id).run();
 const before=JSON.stringify(await x.s.db.prepare('SELECT * FROM candidate_items').all());
 const first=await x.run();assert.equal(first.attempted,1);assert.equal(first.items[0].path,'C');assert.equal(first.items[0].outcome,'facts_identity_changed');
 assert.equal((await x.run()).attempted,0);assert.equal(await count(x.s,'news_facts_rechecks'),1);
 assert.equal(JSON.stringify(await x.s.db.prepare('SELECT * FROM candidate_items').all()),before);
});

test('concurrent cache-only recovery is CAS protected and never duplicates a candidate or decision',async()=>{
 const x=await setup(),row=await listing(x);await cache(x,row);await hint(x,row.source_url);
 await Promise.all([x.run(),x.run()]);
 const saved=await x.s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(row.id).first();
 assert.equal(saved.review_revision,row.review_revision+1);assert.equal(await count(x.s,'news_facts_rechecks'),1);
 assert.equal(await count(x.s,'candidate_items'),1);assert.equal(await count(x.s,'news_decision_ledger'),0);
 assert.equal((await x.inspect(row.source_url)).view.formalReady,true);
});

test('collector retained success survives a newer failed cache entry without any retry or GET',async()=>{
 const x=await setup(),row=await listing(x),{item,proof}=await cache(x,row);await hint(x,row.source_url);
 await x.s.db.prepare('UPDATE news_discovery_work SET evidence_json=? WHERE source_id=? AND normalized_url=?').bind(JSON.stringify({outcome:'verified_surface',items:[item],proof}),'ikebe',row.source_url).run();
 await x.s.db.prepare("UPDATE news_facts_sources SET outcome='facts_parser_failure',items_json='[]',proof_json=NULL").run();
 const before=JSON.stringify(await x.s.db.prepare('SELECT * FROM news_facts_sources').all());
 assert.equal((await x.run()).items[0].formalReady,true);
 assert.equal(JSON.stringify(await x.s.db.prepare('SELECT * FROM news_facts_sources').all()),before);
});

test('formal duplicate validation blocks the same event at another URL, but preserves distinct model/color facts',async()=>{
 const x=await setup(),row=await listing(x);await cache(x,row);await hint(x,row.source_url);await x.run();
 await x.s.db.prepare("UPDATE candidate_items SET review_status='approved' WHERE id=?").bind(row.id).run();
 const other={...retail[0],url:'https://www.ikebe-gakki-pb.com/new_product/999991/'};
 const second=await listing(x,other);
 // Storage may suppress an exact event before a second candidate exists.
 if(second){await cache(x,second,other);await hint(x,other.url);const result=await x.run();assert(result.items.some(v=>v.candidateId===second.id&&v.path==='C'&&v.reason==='duplicate_confirmed'));}
 assert.equal((await x.s.db.prepare("SELECT COUNT(*) n FROM candidate_items WHERE review_status='approved'").first()).n,1);
 const variant=retail[1],third=await listing(x,variant);assert(third);await cache(x,third,variant);await hint(x,variant.url);
 const result=await x.run();assert(result.items.some(v=>v.candidateId===third.id&&v.formalReady),JSON.stringify(result));
 const facts=JSON.parse((await x.s.db.prepare('SELECT product_facts FROM candidate_items WHERE id=?').bind(third.id).first()).product_facts);
 assert(facts.models.some(m=>m.endsWith(' HH')));assert.equal(facts.variants.length,4);
});

test('missing/tampered proofs, missing receipt, unsafe URL, source stop and takedown never fetch or register',async()=>{
 const x=await setup(),row=await listing(x);await hint(x,row.source_url);
 assert.equal((await x.run()).attempted,0);
 await cache(x,row);await x.s.db.prepare("UPDATE news_facts_sources SET proof_json=json_set(proof_json,'$.factsDigest',?)").bind('0'.repeat(64)).run();
 assert.equal((await x.inspect(row.source_url)).view.reason,'facts_saved_evidence_missing');
 await x.s.db.prepare('DELETE FROM news_facts_sources').run();await cache(x,row);
 await x.s.db.prepare('DELETE FROM news_discovery_receipts').run();assert.equal((await x.run()).attempted,0);
 await listing(x);await x.s.db.prepare("UPDATE source_state SET disabled=1 WHERE source_id='ikebe'").run();assert.equal((await x.run()).attempted,0);
 await x.s.db.prepare("UPDATE source_state SET disabled=0 WHERE source_id='ikebe'").run();
 await x.s.db.prepare('INSERT INTO news_takedowns VALUES(?,?)').bind(row.id,at+DAY).run();
 assert.equal((await x.inspect(row.source_url)).view.reason,'candidate_takedown');assert.equal((await x.run()).attempted,0);
 for(const url of ['http://127.0.0.1/','https://www.ikebe-gakki-pb.com/new_product/','https://www.yamaha.com/ja/news_release/2026/26110601/'])assert.equal((await x.inspect(url)).view.path,'C');
 assert.equal(await count(x.s,'candidate_items'),1);assert.equal(await count(x.s,'news_facts_rechecks'),0);
});

test('human decisions and old/unknown official dates cannot be promoted; OFF does not access D1',async()=>{
 assert.deepEqual(await reconcileWebEvidence({NEWS_DB:{prepare(){assert.fail('OFF must not query');}}},at),{disabled:true});
 for(const status of ['approved','rejected']){
  const x=await setup(),row=await listing(x);await cache(x,row);await hint(x,row.source_url);
  await x.s.db.prepare('UPDATE candidate_items SET review_status=? WHERE id=?').bind(status,row.id).run();
  const before=JSON.stringify(await x.s.db.prepare('SELECT * FROM candidate_items').all());
  assert.equal((await x.run()).attempted,0);assert.equal(JSON.stringify(await x.s.db.prepare('SELECT * FROM candidate_items').all()),before);
 }
 for(const date of [null,'2025-01-01T00:00:00.000Z']){
  const x=await setup(),row=await listing(x);await cache(x,row);await hint(x,row.source_url);
  await x.s.db.prepare('UPDATE candidate_items SET published_at=? WHERE id=?').bind(date,row.id).run();
  assert.equal((await x.run()).attempted,0);assert.equal(await count(x.s,'news_facts_rechecks'),0);
 }
});
