import test from 'node:test';import assert from 'node:assert/strict';
import {database,store,pepper,source as synthetic,options} from './helpers.js';
import {getSource,legalGate} from '../src/registry.js';import {runtimeSources} from '../src/runtime.js';
import {jstCollectionDay,COLLECTION_CRON} from '../src/scheduled.js';import {nextDailyCollectionAt,collectSource} from '../src/collector.js';
import {candidateFrom,productFacts,factualLabel,parseMetadata} from '../src/metadata.js';import {parseOfficialListing} from '../src/official-listing.js';
import {robotsPolicy,DAY,hash} from '../src/policy.js';import {backfillLegacy,LEGACY_DIGEST,legacyRows} from '../src/legacy.js';
import {operatorDecision,reviewQueue} from '../src/operator-review.js';import {publishAutomatic} from '../src/automatic.js';
import {handleNewsRequest} from '../src/worker.js';import {administer} from '../src/admin.js';
const now=Date.parse('2026-09-30T21:00:00Z'),robots=robotsPolicy('User-agent: *\nAllow: /',synthetic);
const ready=id=>({...getSource(id),robotsValid:true,discoveryValid:true,sourceRulesReviewed:true,reviewedAt:'2026-09-30',robotsReviewedAt:'2026-09-30',discoveryReviewedAt:'2026-09-30',policyDecision:'approved',enabled:false,productionEnabled:false});
const env={NEWS_COLLECTION_MODE:'production',NEWS_SOURCE_IDS:'["shimamura","sleepfreaks"]'};
const listingSource={...ready('kikutani'),enabled:true,productionEnabled:true};

test('Source Health reports the next daily 06:00 JST eligibility after a manual success',()=>{assert.equal(new Date(nextDailyCollectionAt(Date.parse('2026-09-30T07:00:00Z'))).toISOString(),'2026-09-30T21:00:00.000Z');assert.equal(new Date(nextDailyCollectionAt(Date.parse('2026-09-30T21:00:00Z'))).toISOString(),'2026-10-01T21:00:00.000Z');});
test('coverage: daily UTC Cron maps to 06 JST, day boundary is not UTC midnight',()=>{
 assert.equal(COLLECTION_CRON,'0 21 * * *');assert.equal(jstCollectionDay(now),'2026-10-01');
 assert.equal(jstCollectionDay(Date.parse('2026-09-30T14:59:59Z')),'2026-09-30');assert.equal(jstCollectionDay(Date.parse('2026-09-30T15:00:00Z')),'2026-10-01');
});
test('coverage: scheduled lease is atomic, consumes failure day, next day is independent of 24h',async()=>{
 const s=await store();await s.lease('shimamura',now-DAY/2);await s.publisherAttempt('shimamura',now-DAY/2,DAY);await s.saveState('shimamura',{nextAt:now+DAY/2});
 const config={requestMode:'scheduled',jstDay:'2026-10-01'};
 const results=await Promise.all([s.lease('shimamura',now,DAY,config),s.lease('shimamura',now,DAY,config)]);assert.equal(results.filter(Boolean).length,1);
 await s.saveState('shimamura',{nextAt:now+DAY});assert.equal(await s.lease('shimamura',now+3600001,DAY,config),false);
 assert.equal(await s.lease('shimamura',now+DAY-1000,DAY,{requestMode:'scheduled',jstDay:'2026-10-02'}),true);
});
test('coverage: operator and daily exceptions preserve refusal, health backoff and audit requirement',async()=>{
 const s=await store();await s.lease('shimamura',now);await s.saveState('shimamura',{nextAt:now+DAY,backoffUntil:now+DAY,failures:1});
 for(const requestMode of ['scheduled','operator_validation'])assert.equal(await s.lease('shimamura',now,DAY,{requestMode,jstDay:'2026-10-01'}),false);
 const registry=runtimeSources(env,[ready('shimamura'),ready('sleepfreaks')],now);
 await assert.rejects(collectSource('sleepfreaks',s,{mode:'production',now,registry,pepper,requestMode:'operator_validation'}),/audit_required/);
 assert.equal(legalGate(registry[0],{disabled:true},now,'production',registry,{requestMode:'scheduled'}),'source_disabled');
});
test('coverage: multi-source allowlist never overrides missing evidence or duplicates',()=>{
 const registry=[ready('shimamura'),ready('sleepfreaks')];assert.equal(runtimeSources(env,registry,now).filter(s=>s.enabled).length,2);
 assert.equal(runtimeSources(env,[registry[0],{...registry[1],policyDecision:'incomplete'}],now).filter(s=>s.enabled).length,1);
 for(const ids of ['["shimamura","shimamura"]','["shimamura","unknown"]'])assert.equal(runtimeSources({...env,NEWS_SOURCE_IDS:ids},registry,now).filter(s=>s.enabled).length,0);
 assert.equal(runtimeSources({...env,NEWS_SOURCE_IDS:'["sonicwire"]'},undefined,now).find(s=>s.id==='sonicwire').enabled,false);
});
test('coverage: distinctive software model publishes no invented manufacturer; ambiguous band remains excluded',()=>{
 const f=productFacts('合成DTM情報：VocAlign 7を更新');assert.equal(f.brand,null);assert.equal(factualLabel(f,'update'),'VocAlign 7を更新');
 assert.equal(productFacts('NOVA バンド新曲 MV公開'),null);assert.equal(productFacts('LUNA SEA ライブ'),null);
 assert.equal(factualLabel({...f,product:'<script>evil</script>'},'update'),null);
 assert.equal(factualLabel({...f,brand:'Invented Brand'},'update'),null);
});
test('coverage: explicit brand/model aliases survive trademark glyphs and correct category',async()=>{
 const source={...getSource('shimamura'),enabled:true},p=robotsPolicy('User-agent: *\nAllow: /',source);
 const {item}=await candidateFrom({title:'HISTORY HSLC- 合成の新製品発表',url:'https://www.shimamura.co.jp/update/guitar-bass/2026/09/80000/',date:'2026-09-30T00:00:00+09:00',listingSection:'product_news',listingCategory:'guitar-bass'},source,p,now,pepper);
 assert.equal(item.category,'electric_guitar_bass');assert.equal(item.publicationDecision,'AUTO_PUBLISHABLE');
 assert.equal(productFacts('Jackson PC1™-E 発表').product,'PC1-E');
});
test('coverage: listing opt-out, date and visible card identity fail closed; images never execute',()=>{
 const card='<div class="link-card"><a href="/news/test-case/"><img src="https://invalid.example/a"><h3 class="link-card__title">Godin Century Maho EQ 合成製品情報</h3><time>2026/09/30</time></a></div>';
 assert.equal(parseOfficialListing('<main>'+card+'</main>',listingSource).entries.length,1);
 assert.throws(()=>parseOfficialListing('<meta name="robots" content="noindex">'+card,listingSource),/optout/);
 assert.throws(()=>parseOfficialListing('<nav>'+card+'</nav>',listingSource),/structure/);
 assert.throws(()=>parseOfficialListing(card.replace('2026/09/30','unknown'),listingSource),/structure/);
});
test('coverage: standard Atom and RDF project metadata only, never content or image',()=>{
 const atom='<feed><entry><title>合成ギター情報</title><link href="https://example.invalid/news/a"/><published>2026-09-30T00:00:00Z</published><content>BODY MUST NEVER PERSIST</content></entry></feed>';
 const parsed=parseMetadata(atom,'rss');assert.equal(parsed.length,1);assert.equal(parsed[0].url,'https://example.invalid/news/a');assert.ok(!JSON.stringify(parsed).includes('BODY'));
 const rdf='<rdf:RDF><item><title>合成製品情報</title><link>https://example.invalid/a</link><dc:date>2026-09-30T00:00:00Z</dc:date></item></rdf:RDF>';assert.equal(parseMetadata(rdf,'rss').length,1);
});
test('coverage: guitar event requires explicit named factual evidence; piano/general celebrity stay out',async()=>{
 const source={...ready('natalie'),enabled:true,productionEnabled:true};
 const input={url:'https://natalie.mu/music/news/90000',date:'2026-09-30T00:00:00Z'};
 const a=await candidateFrom({...input,title:'秦基博、ギター弾き語りの公演を開催'},source,robotsPolicy('User-agent: *\nAllow: /',source),now,pepper);assert.equal(a.item.category,'live_guitar');assert.equal(a.item.publicationDecision,'AUTO_PUBLISHABLE');
 for(const title of ['秦基博、新曲のMV公開','合成の芸能ニュース','秦基博、ピアノ弾き語り公演'])assert.equal((await candidateFrom({...input,title},source,robotsPolicy('User-agent: *\nAllow: /',source),now,pepper)).item,undefined);
});
const publishedStore=async()=>{const s=await store();await administer(s,{action:'publish-on',reason:'review_complete'},now);return s;};
test('coverage: exact 23 legacy records restore once, preserve dates, expire normally, no source enable',async()=>{
 const s=await publishedStore();const result=await backfillLegacy(s,now);assert.equal(result.inserted,23);assert.equal(result.publisherRequests,0);assert.equal((await backfillLegacy(s,now)).alreadyCompleted,true);
 const response=await handleNewsRequest(new Request('https://news.example/v1/news?limit=50'),{NEWS_DB:s.db,NEWS_API_MODE:'production'},now,{registry:[],cache:null});const data=await response.json();assert.equal(data.items.length,23);
 const yamaha=data.items.find(i=>i.sourceName==='Yamaha');assert.equal(yamaha.publishedAt,'2026-09-17T15:00:00.000Z');
 assert.equal((await s.state('yamaha')).disabled,undefined);await s.purge(now+91*DAY);assert.equal((await s.candidates()).length,0);assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM legacy_news_grants').first()).n,0);
});
test('coverage: legacy grants cannot authorize a changed label/source, expired row or source takedown',async()=>{
 const s=await publishedStore();await backfillLegacy(s,now);const row=(await s.candidates())[0];
 const request=()=>handleNewsRequest(new Request('https://news.example/v1/news?limit=50'),{NEWS_DB:s.db,NEWS_API_MODE:'production'},now,{registry:[],cache:null});
 await s.db.prepare('UPDATE candidate_items SET label=? WHERE id=?').bind('偽の独立label',row.id).run();assert.equal((await (await request()).json()).items.length,22);
 await s.db.prepare("INSERT INTO source_state(source_id,disabled) VALUES('yamaha',1)").run();assert.ok(!(await (await request()).json()).items.some(i=>i.sourceName==='Yamaha'));
});
test('coverage: legacy backfill deduplicates approved factual products and respects tombstones',async()=>{
 const s=await publishedStore();const i=legacyRows()[0],id=await hash(i.sourceUrl);await s.db.prepare('INSERT INTO news_takedowns VALUES(?,?)').bind(id,now+DAY).run();
 const boss=await candidateFrom({title:'BOSS EX-4 発表',url:'https://sleepfreaks-dtm.com/dtm-materials/boss-ex4/',date:'2026-09-30T00:00:00Z'},synthetic,robots,now,pepper);await s.put(boss.item);await s.db.prepare("UPDATE candidate_items SET review_status='approved'").run();
 const result=await backfillLegacy(s,now);assert.equal(result.skippedDuplicates,1);assert.equal(result.blocked,1);assert.equal(result.inserted,21);
});
test('coverage: operator approval/rejection audit facts without article-check fabrication or public endpoint',async()=>{
 const s=await publishedStore(),source={...ready('sleepfreaks'),enabled:true,productionEnabled:true};
 const {item}=await candidateFrom({title:'Universal Audio LUNA 3 更新',url:'https://sleepfreaks-dtm.com/dtm-materials/luna-test/',date:'2026-09-30T00:00:00Z'},source,robots,now,pepper);await s.put(item);await s.recordHealth({sourceId:source.id,status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now});
 const input={id:item.id,action:'approve',label:item.label,category:item.category,publishedAt:item.publishedAt,reason:'useful_product',checks:{factsChecked:true,relevanceChecked:true,duplicateChecked:true,independentLabelChecked:true}};
 await assert.rejects(operatorDecision(s,{...input,checks:{}},now,[source],pepper),/checks_required/);
 await operatorDecision(s,input,now,[source],pepper);const row=(await s.candidates())[0];assert.equal(row.review_status,'approved');assert.equal(row.article_checks,null);assert.equal(JSON.parse(row.review_checks).basis,'validated_official_surface');
 const other={...item,id:await hash(item.sourceUrl+'other'),sourceUrl:item.sourceUrl+'other',normalizedUrl:item.sourceUrl+'other'};await s.put(other);await operatorDecision(s,{id:other.id,action:'reject',reason:'not_relevant'},now,[source],pepper);
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_operator_feedback').first()).n,2);assert.ok(!(await reviewQueue(s)).some(i=>i.id===other.id));
 assert.equal((await handleNewsRequest(new Request('https://news.example/admin/review',{method:'POST'}),{NEWS_DB:s.db,NEWS_API_MODE:'production'},now)).status,405);
});
test('coverage: daily rate limits retain the next eligible timestamp despite manual exception',async()=>{
 const s=await store(),source={...ready('shimamura'),enabled:true,productionEnabled:true};
 const report=await collectSource(source.id,s,{mode:'production',now,registry:[source],pepper,requestMode:'scheduled',jstDay:'2026-10-01',fetcher:async()=>new Response(null,{status:429,headers:{'retry-after':'172800'}}),sleep:async()=>{},clock:()=>now});
 assert.equal(report.outcome,'rate_limited');const state=await s.state(source.id);assert.ok(state.backoffUntil>=now+2*DAY);
 assert.equal(legalGate(source,state,now+DAY,'production',[source],{requestMode:'operator_validation'}),'backoff');
});
