import test from 'node:test';import assert from 'node:assert/strict';
import {store,pepper} from './helpers.js';
import {getSource} from '../src/registry.js';
import {candidateFrom} from '../src/metadata.js';
import {publicationValidation} from '../src/decision-policy.js';
import {collectSource} from '../src/collector.js';
import {hash} from '../src/policy.js';
import {KIKUTANI_LISTING_PARSER,kikutaniListingFacts} from '../src/kikutani-listing-evidence.js';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {localDatabase} from '../scripts/local-db.mjs';
const at=Date.parse('2026-11-10T06:00:28+09:00'),source={...getSource('kikutani'),enabled:true,productionEnabled:true};
const url='https://www.kikutani.co.jp/news/sfida-sps10/';
// Public title/URL replay only. HTML layout, hash, proof and local pepper below
// are synthetic, never production evidence or a production READY assertion.
const title='Sfidaから最大10系統の電源出力を備えたエフェクター用パワーサプライ「SPS-10」登場';
const entry=(t=title,extra={})=>({url,title:t,date:'2026-11-09T00:00:00+09:00',listingSection:'official_news',listingTags:['新製品情報'],listingProof:{sourceId:source.id,sourceUrl:source.discoveryUrl,verifiedAt:at,extractionMethod:'explicit_kikutani_listing_card',parserVersion:KIKUTANI_LISTING_PARSER,responseHash:'a'.repeat(64)},...extra});
const prepared=async()=>{const s=await store();await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();await s.recordHealth({sourceId:source.id,status:'healthy',reasonCode:'ok',checkedAt:at,successfulAt:at});const {item}=await candidateFrom(entry(),source,{isAllowed:()=>true},at,pepper);return {s,item};};
test('explicit pedal power is existing amps/effects scope, with no inferred output specs or release date',async()=>{
 const {s,item}=await prepared();assert.equal(item.productFacts.productType,'pedal_power_supply');assert.equal(item.category,'amps_effects');assert.equal(item.productFacts.brand,'Sfida');assert.equal(item.productFacts.product,'SPS-10');assert.match(item.label,/ペダル用電源「SPS-10」/);assert(!/ギター「|発売|10系統/.test(item.label));assert(!item.productFacts.releaseDate);assert(!item.productFacts.outputs);
 assert(await s.put(item));const row=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(item.id).first();assert((await publicationValidation(s,row,at,[source],pepper)).valid);assert.equal(row.review_status,'pending');
 const old={...row,facts_provenance:row.facts_provenance.replaceAll(KIKUTANI_LISTING_PARSER,'kikutani-listing-product-3')};assert((await publicationValidation(s,old,at,[source],pepper)).errors.includes('facts_provenance_invalid'));
});
test('grammar supports another brand/model without an article ID rule',()=>{const f=kikutaniListingFacts(entry('Example Audioよりペダル用パワーサプライ「PS-200」が登場'),source);assert.equal(f.brand,'Example Audio');assert.equal(f.product,'PS-200');});
for(const t of ['Sfidaから一般家電用パワーサプライ「SPS-10」登場','Sfidaからエフェクター用パワーサプライ対応ケース「SPS-10」登場','Sfidaからエフェクター用パワーサプライ「SPS-10」登場予定','Sfidaからエフェクター用パワーサプライ「SPS-10」と「SPS-20」登場','Sfidaからエフェクター用パワーサプライ「SPS-10」ではない','エフェクター用パワーサプライ「SPS-10」登場','Sfidaから限定色のエフェクター用パワーサプライ「SPS-10」登場','Sfidaから復刻エフェクター用パワーサプライ「SPS-10」登場'])test('unbound or ambiguous power supply stays incomplete: '+t,()=>assert.equal(kikutaniListingFacts(entry(t),source),null));
test('empty existing shell recovers facts AND provenance through existing audited trigger, once only',async()=>{
 const {s,item}=await prepared();await s.put({...item,productFacts:null,factsProvenance:null});const before=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(item.id).first();assert.equal(before.review_revision,0);
 assert.equal(await s.put(item),false);const row=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(item.id).first();assert.equal(row.review_revision,1);assert.equal(row.facts_provenance,item.factsProvenance);assert((await publicationValidation(s,row,at,[source],pepper)).valid);assert.equal(row.review_status,'pending');
 await s.put(item);assert.deepEqual(await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(item.id).first(),row);assert.equal((await s.db.prepare('SELECT count(*) n FROM news_facts_rechecks').first()).n,1);assert.equal((await s.db.prepare("SELECT count(*) n FROM news_admin_audit WHERE action='facts-recheck'").first()).n,1);
 for(const table of ['news_decision_ledger','news_shadow_evaluations','news_operator_feedback'])assert.equal((await s.db.prepare('SELECT count(*) n FROM '+table).first()).n,0);
});
for(const mutation of ['approved','rejected','facts','date','fingerprint','source_stop','takedown','collection_off','bad_proof'])test('listing shell repair protects '+mutation,async()=>{
 const {s,item}=await prepared();await s.put({...item,productFacts:null,factsProvenance:null});let input=item;
 if(['approved','rejected'].includes(mutation))await s.db.prepare('UPDATE candidate_items SET review_status=? WHERE id=?').bind(mutation,item.id).run();
 if(mutation==='facts')await s.db.prepare('UPDATE candidate_items SET product_facts=? WHERE id=?').bind('{"brand":"Other","product":"OLD-1"}',item.id).run();
 if(mutation==='date')input={...item,publishedAt:'2026-11-07T15:00:00.000Z'};
 if(mutation==='fingerprint')input={...item,titleFingerprint:'different'};
 if(mutation==='bad_proof')input={...item,factsProvenance:null};
 if(mutation==='source_stop')await s.db.prepare('INSERT INTO source_state(source_id,disabled) VALUES(?,1)').bind(source.id).run();
 if(mutation==='takedown')await s.db.prepare('INSERT INTO news_takedowns(item_id,expires_at) VALUES(?,?)').bind(item.id,at+86400000).run();
 if(mutation==='collection_off')await s.db.prepare('UPDATE news_controls SET collection_enabled=0').run();
 const before=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(item.id).first();await s.put(input);assert.deepEqual(await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(item.id).first(),before);assert.equal((await s.db.prepare('SELECT count(*) n FROM news_facts_rechecks').first()).n,0);
});
test('normal collector reuses one permitted listing; no detail crawl, repeat registration or human decision',async()=>{
 const s=await store(),robots='User-agent: *\nAllow: /',active={...source,robotsHash:await hash(robots)},calls=[];
 const listing=`<div class="link-card"><a href="${url}"><time>2026/11/09</time><span class="link-card__tag">新製品情報</span><h3 class="link-card__title">${title}</h3></a></div>`;
 const run=now=>collectSource(source.id,s,{mode:'production',requestMode:'scheduled',jstDay:new Date(now+9*3600000).toISOString().slice(0,10),now,clock:()=>now,registry:[active],pepper,sleep:async()=>{},fetcher:async u=>{calls.push(u);assert([active.robotsUrl,active.discoveryUrl].includes(u));return new Response(u===active.robotsUrl?robots:listing,{headers:{'Content-Type':u===active.robotsUrl?'text/plain':'text/html'}});}});
 await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();const r=await run(at);assert.equal(r.outcome,'collected');assert.equal(r.preparation.readyNew,1);assert.equal(calls.length,2);await run(at+86400000);assert.equal((await s.db.prepare('SELECT count(*) n FROM candidate_items').first()).n,1);assert.equal((await s.db.prepare('SELECT count(*) n FROM news_decision_ledger').first()).n,0);
});
test('a concurrent revision change prevents the listing-recovery commit',async()=>{
 const {s,item}=await prepared();await s.put({...item,productFacts:null,factsProvenance:null});const original=s.db.prepare;let raced=false;
 s.db.prepare=sql=>{if(sql.startsWith('INSERT OR IGNORE INTO news_facts_rechecks')&&!raced){raced=true;s.db.raw.prepare('UPDATE candidate_items SET review_revision=review_revision+1 WHERE id=?').run(item.id);}return original(sql);};
 await s.put(item);const row=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(item.id).first();assert(raced);assert.equal(row.review_revision,1);assert.equal(row.product_facts,null);assert.equal(row.facts_provenance,null);assert.equal((await s.db.prepare('SELECT count(*) n FROM news_facts_rechecks').first()).n,0);
});
test('workerd/D1: listing shell repair is atomic and concurrent replay creates one recovery, no Ledger',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'news-listing-repair-'));let runtime;
 try{runtime=await localDatabase(dir);const s=await store(runtime.db),{item}=await candidateFrom(entry(),source,{isAllowed:()=>true},at,pepper);await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();await s.recordHealth({sourceId:source.id,status:'healthy',reasonCode:'ok',checkedAt:at,successfulAt:at});await s.put({...item,productFacts:null,factsProvenance:null});
  await Promise.all([s.put(item),s.put(item)]);const row=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(item.id).first();assert.equal(row.review_revision,1);assert((await publicationValidation(s,row,at,[source],pepper)).valid);assert.equal((await s.db.prepare('SELECT count(*) n FROM news_facts_rechecks').first()).n,1);assert.equal((await s.db.prepare('SELECT count(*) n FROM news_decision_ledger').first()).n,0);
  const next=(await candidateFrom(entry('Example Audioよりペダル用パワーサプライ「PS-200」が登場',{url:source.discoveryUrl+'synthetic-other-power/'}),source,{isAllowed:()=>true},at,pepper)).item;await s.put({...next,productFacts:null,factsProvenance:null});
  await s.db.prepare("CREATE TRIGGER fixture_listing_audit_failure BEFORE INSERT ON news_admin_audit WHEN NEW.action='facts-recheck' BEGIN SELECT RAISE(ABORT,'fixture_audit_failure'); END").run();await assert.rejects(s.put(next));const unchanged=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(next.id).first();assert.equal(unchanged.product_facts,null);assert.equal(unchanged.facts_provenance,null);assert.equal(unchanged.review_revision,0);assert.equal((await s.db.prepare('SELECT count(*) n FROM news_facts_rechecks').first()).n,1);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
