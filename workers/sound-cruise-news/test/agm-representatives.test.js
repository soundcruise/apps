import test from 'node:test';
import assert from 'node:assert/strict';
import {AGM_REPRESENTATIVES,agmRepresentativeDuplicate} from '../src/agm-representatives.js';
import {manualCandidate,ingestManual} from '../src/manual-ingestion.js';
import {MANUAL_SOURCES,manualEvidenceGate} from '../src/manual-sources.js';
import {runtimeSources} from '../src/runtime.js';
import {getSource} from '../src/registry.js';
import {handleNewsRequest} from '../src/worker.js';
import {humanDecisions} from '../src/operator-insights.js';
import {REQUIRED_CHECKS,ARTICLE_CHECKS} from '../src/review.js';
import {administer} from '../src/admin.js';
import {store} from './helpers.js';
const now=Date.parse('2026-10-06T03:00:00Z');
const input=r=>({kind:'representative_test',sourceId:'manual-agm-test',officialUrl:r.url,publishedAt:r.publishedAt,
 checks:{...Object.fromEntries(REQUIRED_CHECKS.map(k=>[k,true])),guitarEvidenceChecked:true},
 articleChecks:{...Object.fromEntries(Object.entries(ARTICLE_CHECKS).map(([k,v])=>[k,v[0]])),relevance:'guitar'}});
const setup=async()=>{const s=await store();await administer(s,{action:'publish-on',reason:'review_complete'},now);return s;};
const api=s=>handleNewsRequest(new Request('https://news.example/v1/news?limit=50'),{NEWS_DB:s.db,NEWS_API_MODE:'production'},now,{registry:[],cache:null});
test('exact four independently assessed articles retain attribution, original URL/date and clear event labels',async()=>{
 assert.equal(AGM_REPRESENTATIVES.length,4);
 for(const r of AGM_REPRESENTATIVES){const item=await manualCandidate(input(r),now);assert.equal(item.sourceName,'Acoustic Guitar Magazine');assert.equal(item.sourceUrl,r.url);assert.equal(item.publishedAt,r.publishedAt);assert.equal(item.label,r.label);assert.equal(item.category,r.category);assert.equal(item.origin,'operator_manual_add');assert.equal(item.productFacts.evidence,'owner_reviewed_representative_test');assert.ok(!('body' in item)&&!('images' in item));}
 const [martin,ortega,oshio,gears]=await Promise.all(AGM_REPRESENTATIVES.map(r=>manualCandidate(input(r),now)));
 assert.equal(martin.productFacts.limitedModel,'Custom Shop 000-42 Eric Clapton Ziricote');assert.doesNotMatch(martin.label,/限定.*2モデル/);assert.match(ortega.label,/ナイロン弦.*R24RO \/ RCE24RO.*発表/);assert.equal(oshio.productFacts.releaseDate,'2026-08-26');assert.notEqual(oshio.publishedAt.slice(0,10),oshio.productFacts.releaseDate);assert.match(gears.label,/使用機材を紹介/);assert.doesNotMatch(gears.label,/発表|発売|レビュー|試奏/);
});
test('arbitrary articles, fields, dates, scope borrowing and missing verification cannot gain a manual grant',async()=>{
 const base=input(AGM_REPRESENTATIVES[0]);
 for(const changes of [{officialUrl:'https://acousticguitarmagazine.jp/another-news/'},{publishedAt:'2026-10-02T10:00:00.000Z'},{sourceId:'agm'},{sourceId:'manual-ikebe'},{label:'unreviewed copy'},{body:'raw body'},{images:['https://example.com/a.png']},{checks:{...base.checks,factsChecked:false}},{articleChecks:{...base.articleChecks,primarySource:'no_primary_found'}}])await assert.rejects(manualCandidate({...base,...changes},now));
 await assert.rejects(manualCandidate(base,now+91*86400000));
});
test('no automatic AGM scope expansion, no new automatic source, existing Interview surface unchanged',()=>{
 const s=getSource('agm');assert.equal(s.discoveryUrl,'https://acousticguitarmagazine.jp/interview/feed/');assert.deepEqual(s.allowedPaths,['/interview/']);assert.equal(s.artistOnly,true);
 assert.equal(runtimeSources({NEWS_SOURCE_IDS:'["manual-agm-test"]'},undefined,now).some(s=>s.enabled),false);
 const manual=MANUAL_SOURCES.find(s=>s.id==='manual-agm-test');assert.equal(manual.automaticEnabled,false);assert.equal(manualEvidenceGate(manual,now),null);
});
test('cross-source duplicate event is refused while same-artist interview is preserved',async()=>{
 const s=await setup(),items=await Promise.all(AGM_REPRESENTATIVES.map(r=>manualCandidate(input(r),now)));
 const interview=await manualCandidate(input(AGM_REPRESENTATIVES[3]),now);
 s.db.raw.prepare(`INSERT INTO candidate_items(id,source_id,source_name,source_url,normalized_url,published_at,category,label,topic_key,collected_at,review_status,review_reason,expires_at,product_facts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('existing-interview','agm','Acoustic Guitar Magazine','https://acousticguitarmagazine.jp/interview/2026-0909-oishi-masayoshi/','https://acousticguitarmagazine.jp/interview/2026-0909-oishi-masayoshi/','2026-09-09T10:00:00.000Z','artist_guitar','大石昌良、作曲を語るインタビュー','original-interview','2026-09-09T10:00:00.000Z','approved','structured_review_complete',now+86400000,JSON.stringify({artist:'大石昌良',eventType:'interview'}));
 const before=(await s.candidates())[0];assert.equal(agmRepresentativeDuplicate(interview,[before]),null);
 assert.equal((await ingestManual(s,interview,now)).inserted,true);assert.deepEqual((await s.candidates()).find(r=>r.id===before.id),before);
 const duplicate={id:'other-source',review_status:'approved',label:'Ortega、新製品RCE24ROを発表',product_facts:'{"brand":"Ortega","product":"RCE24RO"}'};
 assert.equal(agmRepresentativeDuplicate(items[1],[duplicate]).id,'other-source');
 s.db.raw.prepare(`UPDATE candidate_items SET label=?,product_facts=? WHERE id='existing-interview'`).run(duplicate.label,duplicate.product_facts);
 const controls=await s.controls();assert.equal((await ingestManual(s,items[1],now)).reason,'duplicate_event');assert.deepEqual(await s.controls(),controls);
});
test('manual insert is idempotent, visible through real API and never changes Ledger/Shadow/teacher/source state',async()=>{
 const s=await setup();
 for(const r of AGM_REPRESENTATIVES){const i=await manualCandidate(input(r),now);assert.equal((await ingestManual(s,i,now)).inserted,true);assert.equal((await ingestManual(s,i,now+1)).inserted,false);}
 const data=await (await api(s)).json();assert.equal(data.items.length,4);assert.equal(data.items.filter(i=>i.sourceName==='Acoustic Guitar Magazine').length,4);
 assert.equal(s.db.raw.prepare('SELECT count(*) n FROM news_decision_ledger').get().n,0);assert.equal(s.db.raw.prepare('SELECT count(*) n FROM news_shadow_evaluations').get().n,0);assert.equal(s.db.raw.prepare('SELECT count(*) n FROM source_state').get().n,0);assert.deepEqual(await humanDecisions(s,now),[]);
 assert.equal(s.db.raw.prepare("SELECT count(*) n FROM news_admin_audit WHERE action='manual-add'").get().n,4);
});
test('existing collection/publication STOP, manual-source takedown and mutation protection remain enforced',async()=>{
 for(const action of ['publish-off','collection-off','source-disable']){const s=await setup(),i=await manualCandidate(input(AGM_REPRESENTATIVES[0]),now);await administer(s,{action,target:action==='source-disable'?i.sourceId:'global',reason:'operator_stop'},now,[{id:i.sourceId}]);assert.equal((await ingestManual(s,i,now)).inserted,false);}
 const s=await setup(),i=await manualCandidate(input(AGM_REPRESENTATIVES[0]),now);i.productFacts.limitedPerColor=100;await assert.rejects(ingestManual(s,i,now),/not_validated/);
});
