import test from 'node:test';import assert from 'node:assert/strict';
import {parseDocument,DomUtils} from 'htmlparser2';
import {factFailureKind,safeFactDiagnostics} from '../src/facts-failure.js';
import {validateMorrisArticleDates} from '../src/morris-article-dates.js';
import {parseMorrisArticle} from '../src/morris-evidence.js';
import {MORRIS_LISTING,morrisUrlDate} from '../src/morris-policy.js';
import {collectSource} from '../src/collector.js';import {store,pepper} from './helpers.js';import {getSource} from '../src/registry.js';
import {administer} from '../src/admin.js';import {publicationValidation} from '../src/decision-policy.js';
import {parsePrimaryAnnouncement} from '../src/primary-announcement.js';
import {localDatabase} from '../scripts/local-db.mjs';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const date='2026-10-14T00:00:00+09:00',now=Date.parse('2026-10-14T17:00:00+09:00');
const times=html=>DomUtils.findAll(n=>n.name==='time',parseDocument(html).children);
const url='https://www.morris-guitar.com/information/2026/1014_21.html',peer=url.replace('_21','_22');
const source={...getSource('morris'),enabled:true,productionEnabled:true},registry=[source];
const article=(u=url,extra='')=>`<link rel="canonical" href="${u}"><main><h2 class="serif">試験アコギ「CRAFT-21」の発表</h2><p>Morris Guitarsはアコースティックギター「CRAFT-21」を発表しました。</p>${extra}</main>`;
const listing=(us=[url,peer])=>`<link rel="canonical" href="${MORRIS_LISTING}"><main>${us.map(u=>`<div class="col-9"><h3 class="h5 serif"><a href="${u}">試験モデルの発表</a></h3><time>2026.10.14</time></div>`).join('')}</main>`;
async function setup(db){const s=await store(db);await administer(s,{action:'source-enable',target:'morris',reason:'review_complete'},now,registry);await administer(s,{action:'publish-on',reason:'review_complete'},now,registry);return s;}
const opts=(calls,bad,us)=>({mode:'production',now,registry,pepper,requestMode:'scheduled',jstDay:'2026-10-14',sleep:async()=>{},fetcher:async u=>{calls.push(u);if(u===source.robotsUrl)return new Response(null,{status:404});return new Response(u===MORRIS_LISTING?listing(us):article(u,u===url?bad:''),{headers:{'content-type':'text/html'}});}});
for(const extra of ['<time itemprop="dateModified">2026.10.15</time>','<p>開催日：<time datetime="2026-10-31">2026年10月31日</time></p>','<time itemprop="releaseDate" datetime="2026-11-01"></time>','<time itemprop="datePublished" datetime="2026-10-14">2026年10月14日</time>','<time itemprop="datePublished" datetime="2026-10-13T15:00:00Z">2026.10.14</time>'])test('publication day remains listing-bound while typed dates are separate '+extra,()=>{const p=validateMorrisArticleDates(times(extra),date);assert.equal(p.version,'morris-date-roles-1');assert(!JSON.stringify(p).includes('<time'));});
for(const [extra,code]of [['<time itemprop="datePublished">2026.10.13</time>','facts_date_changed'],['<time itemprop="datePublished" datetime="2026-10-14">2026.10.13</time>','facts_date_changed'],['<time>2026.10.31</time>','facts_date_unconfirmed'],['<time itemprop="datePublished">2026.02.30</time>','facts_date_unconfirmed'],['<time itemprop="datePublished" datetime="tomorrow"></time>','facts_date_unconfirmed']])test('real contradictory or untyped/malformed date is held '+extra,()=>{assert.throws(()=>validateMorrisArticleDates(times(extra),date),e=>{assert.equal(e.message,code);assert.equal(e.factDiagnostics.stage,'article_dates');return true;});});
test('NULL old facts with missing model is extraction failure, not a stored identity conflict',()=>{
 const u='https://www.shimamura.co.jp/update/dtm-recording/2026/10/888801/',row={source_id:'shimamura',source_url:u,review_status:'pending',published_at:'2026-10-13T15:00:00.000Z',product_facts:null};
 const html=`<link rel="canonical" href="${u}"><div class="mb-80"><h1>Craft Audioの新しい音源</h1></div><div>公開：<time datetime="2026-10-14">2026/10/14</time></div><div class="p-content"><p class="wp-block-paragraph">Craft Audioが、新たな音源を発表しました。</p></div>`;
 assert.throws(()=>parsePrimaryAnnouncement(html,{id:'shimamura',baseUrl:'https://www.shimamura.co.jp'},row),e=>{assert.equal(e.message,'facts_extraction_incomplete');assert(e.factDiagnostics.missingFields.includes('models'));assert(!JSON.stringify(e.factDiagnostics).includes('Craft Audio'));return true;});
});
test('diagnostics discard prose, identifiers, private strings and unbounded values',()=>{
 const d=safeFactDiagnostics({stage:'subject_identity',missingFields:['brand','models','secret@example.com'],rawBody:'never store',checks:{brandPresent:false,modelsCount:0,unsafe:'private'},dates:[{role:'event',normalized:'2026-10-31',expected:'2026-10-14',raw:'private'}]});
 assert.deepEqual(d.missingFields,['brand','models']);assert(!JSON.stringify(d).includes('private'));assert(!JSON.stringify(d).includes('never store'));assert.equal(factFailureKind('facts_identity_changed'),'conflict');assert.equal(factFailureKind('facts_identity_unconfirmed'),'extraction');assert.equal(factFailureKind('facts_http_503'),'transport');assert.equal(factFailureKind('facts_http_403'),'policy');
});
test('persistent workerd: one article parser failure does not stop peers, never refetches spent receipt, and survives restart',async()=>{
 const path=await mkdtemp(join(tmpdir(),'news-article-isolation-'));let runtime;
 try{runtime=await localDatabase(path);const s=await setup(runtime.db),calls=[];
 const result=await collectSource('morris',s,opts(calls,'<time itemprop="datePublished">2026.10.13</time>'));assert.equal(result.outcome,'collected');assert.equal(result.articleParserFailures,1);assert.equal((await s.state('morris')).disabled,false);
 const rows=(await s.candidates());assert.equal(rows.length,2);const failed=rows.find(r=>r.source_url===url),good=rows.find(r=>r.source_url===peer);assert.equal(failed.product_facts,null);assert.equal((await publicationValidation(s,good,now,registry,pepper)).valid,true);assert.equal((await publicationValidation(s,failed,now,registry,pepper)).valid,false);
 const receipt=await s.db.prepare("SELECT * FROM news_morris_acquisition WHERE source_url=? AND scope='article'").bind(url).first();assert.equal(receipt.actual_requests,1);assert.equal(receipt.outcome,'facts_date_changed');assert.equal(JSON.parse(receipt.proof_json).diagnostics.stage,'article_dates');assert.match(receipt.response_hash,/^[a-f0-9]{64}$/);assert(!receipt.proof_json.includes('<main>'));
 await runtime.mf.dispose();runtime=await localDatabase(path);const s2=new (s.constructor)(runtime.db);await collectSource('morris',s2,{...opts(calls,''),now:now+86400000,jstDay:'2026-10-15'});assert.equal(calls.filter(u=>u===url).length,1);assert.equal(calls.filter(u=>u===peer).length,1);
 assert.equal((await s2.db.prepare('SELECT COUNT(*) n FROM news_decision_ledger').first()).n,0);assert.equal((await s2.db.prepare("SELECT COUNT(*) n FROM candidate_items WHERE review_status<>'pending'").first()).n,0);
 }finally{await runtime?.mf.dispose();await rm(path,{recursive:true,force:true});}
});
for(const status of [403,451,429,503])test('article HTTP '+status+' is not swallowed as a parser failure; access/backoff remains effective',async()=>{
 const s=await setup(),calls=[],o=opts(calls,'');const fetcher=o.fetcher;o.fetcher=async u=>u===url?new Response(null,{status,headers:{'retry-after':'3600'}}):fetcher(u);
 const r=await collectSource('morris',s,o);assert.notEqual(r.outcome,'collected');assert.equal((await s.state('morris')).disabled,[403,451].includes(status));if([429,503].includes(status))assert((await s.state('morris')).backoffUntil>=now+3600000);assert(!calls.includes(peer));
});
test('Japanese weekday dates normalize, while an impossible ISO timestamp never becomes publication evidence',()=>{
 assert.equal(validateMorrisArticleDates(times('<time itemprop="datePublished">2026年10月14日（水）</time>'),date).dates[0].normalized,'2026-10-14');
 assert.throws(()=>validateMorrisArticleDates(times('<time itemprop="datePublished" datetime="2026-02-30T00:00:00+09:00"></time>'),date),/facts_date_unconfirmed/);
});
test('a valid publication date never consumes event/update/release dates as a publication conflict',async()=>{
 const parsed=await parseMorrisArticle(article(url,'<time itemprop="datePublished">2026.10.14</time><p>開催日：<time datetime="2026-10-31">2026.10.31</time></p><time itemprop="dateModified">2026.10.15</time>'),{url,publishedAt:morrisUrlDate(url)},now,pepper);
 assert.equal(parsed.facts.product,'CRAFT-21');assert.equal(parsed.proof.publishedAt,morrisUrlDate(url));assert.equal(parsed.proof.dateEvidence.dates.length,3);
});
test('formal stored identity conflict remains a conflict and cannot overwrite facts; known successful proof is reused without HTTP',async()=>{
 const {setup:daily,cases,at}=await import('./discovery-case.js');const {recheckFacts}=await import('../src/facts-recheck.js');const {candidateSnapshot}=await import('../src/operator-review.js');
 const x=await daily({list:[cases[0]]});await x.run();const r=await x.s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(cases[0].id).first();const f=JSON.parse(r.product_facts);f.brand='Different Verified Brand';
 await x.s.db.prepare('UPDATE candidate_items SET product_facts=? WHERE id=?').bind(JSON.stringify(f),r.id).run();const changed=await x.s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(r.id).first();
 const result=await recheckFacts(x.s,{id:r.id,revision:r.review_revision,snapshot:await candidateSnapshot(changed),requestId:crypto.randomUUID()},at+1,x.registry,pepper,{type:'fixture',id:'conflict-test'},{fetcher:()=>{throw Error('must reuse proof');}});
 assert.equal(result.outcome,'facts_identity_changed');assert.equal(result.failureKind,'conflict');assert.equal(result.recovered,false);assert(result.diagnostics.conflictingFields.includes('brand'));assert.equal((await x.s.db.prepare('SELECT product_facts FROM candidate_items WHERE id=?').bind(r.id).first()).product_facts,JSON.stringify(f));
});
