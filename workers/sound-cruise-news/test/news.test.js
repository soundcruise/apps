import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCES,getSource,legalGate,evidenceGate,phaseOneSourceReady,PHASE_ONE_CANDIDATES} from '../src/registry.js';
import {robotsPolicy,sourceUrl,optOut,retryAt,boundedFetch,DAY} from '../src/policy.js';
import {parseMetadata,candidateFrom,validLabel,classify,contentType} from '../src/metadata.js';
import {collectSource,collectAll} from '../src/collector.js';
import {reviewCandidate,REQUIRED_CHECKS,ARTICLE_CHECKS} from '../src/review.js';
import {handleNewsRequest} from '../src/worker.js';
import {scheduledPurge} from '../src/retention.js';
import {administer,adminStatements} from '../src/admin.js';
import {fingerprint,headlineSimilarity} from '../src/fingerprint.js';
import {publicAddress} from '../scripts/safe-fetch.mjs';
import {pepper,source,registry,now,robots,feed,response,mock,store,options,approval,env} from './helpers.js';
const collect=s=>collectSource(source.id,s,options());
const request=(s,path='/v1/news',opts={},cache)=>handleNewsRequest(new Request('http://localhost'+path,opts),env(s.db),now,{registry,cache});

test('H1: validated Shimamura remains OFF; incomplete evidence cannot collect',()=>{
 assert.equal(SOURCES.filter(s=>s.legalStatus==='SAFE').length,18);assert.ok(SOURCES.every(s=>s.enabled===false));
 for(const s of SOURCES.filter(s=>s.legalStatus==='SAFE')){
  if(s.id==='shimamura'){
   const reviewed=Date.parse(s.discoveryReviewedAt);
   assert.equal(phaseOneSourceReady(s,reviewed),true);
   assert.equal(phaseOneSourceReady({...s,discoveryValid:false},reviewed),false);
   assert.equal(legalGate(s,{},reviewed,'local'),'source_disabled');
   assert.equal(legalGate(s,{},reviewed,'production'),'collection_off');
   assert.equal(s.localPilotEnabled,false);assert.equal(s.productionEnabled,false);
   assert.equal(s.discoveryValid,true);assert.equal(s.listingEvidence.parserLiveValidated,true);
   assert.equal(s.saleCollection,'none');assert.deepEqual(s.contentTypes,['product']);
  }
  else{
   const incomplete={...s,policyDecision:'incomplete'};assert.equal(legalGate(incomplete,{},now,'local',[incomplete]),'evidence_missing');
   assert.equal(legalGate(s,{},now,'local'),s.policyDecision==='approved'?'policy_expired':'evidence_missing');
  }
 }
 assert.deepEqual(PHASE_ONE_CANDIDATES,['shimamura','sleepfreaks','hookup']);
});
test('H1: individual required evidence fields, review expiry and permission gate',()=>{
 assert.equal(legalGate(source,{},now,'local',registry),null);
 for(const field of ['termsUrl','linkPolicyUrl','reviewedBy','reviewedAt','robotsReviewedAt','discoveryReviewedAt','policySummary','policyDecision'])assert.equal(evidenceGate({...source,[field]:null},now),'evidence_missing',field);
 for(const field of ['reviewedAt','robotsReviewedAt','discoveryReviewedAt'])assert.equal(evidenceGate({...source,[field]:'2026-01-01'},now),'policy_expired');
 assert.equal(evidenceGate({...source,reviewedAt:'2030-01-01'},now),'policy_expired');
 assert.equal(evidenceGate({...source,legalStatus:'CONTACT'},now),'permission_required');
 for(const legalStatus of ['CONTACT','UNKNOWN','DO_NOT_USE'])assert.equal(evidenceGate({...source,legalStatus,permissionRef:'explicit-reference'},now),'legal_block');
 assert.equal(legalGate({...source},{},now,'local',registry),'not_registry_source');
 assert.equal(legalGate(source,{},now,'production',registry),'collection_off');
});
for(const ending of ['\n','\r\n','\r'])test('H2: normal robots line endings '+JSON.stringify(ending),()=>{
 const p=robotsPolicy(robots.replaceAll('\n',ending),source);assert.equal(p.isAllowed(source.baseUrl+'feed/','SoundCruiseNewsBot'),true);assert.equal(p.isAllowed(source.baseUrl+'private/a','SoundCruiseNewsBot'),false);assert.equal(p.getCrawlDelay('SoundCruiseNewsBot'),2);assert.equal(p.getSitemaps().length,1);
});
test('H2: malformed/comment-attached/zero-group robots fail closed; empty valid',()=>{
 for(const text of ['User-agent: * Disallow: /','User-agent: * # comment Disallow: /',' # robot User-agent: * Disallow: /','Disallow: /','Sitemap: https://example.com/sitemap.xml','# only comment','broken text','User-agent: *\nAllow: bad','User-agent: *\nCrawl-delay: nope'])assert.throws(()=>robotsPolicy(text,source),/robots_unparseable/);
 assert.equal(robotsPolicy('',source).isAllowed(source.baseUrl,'SoundCruiseNewsBot'),true);
 assert.equal(robotsPolicy(' \r\n',source).isAllowed(source.baseUrl,'SoundCruiseNewsBot'),true);
 assert.throws(()=>robotsPolicy('<html>not found</html>',source),/robots_unavailable/);
 for(const status of [404,401,403,500])assert.throws(()=>robotsPolicy('',source,status),/robots_unavailable/);
 assert.throws(()=>robotsPolicy('x'.repeat(512001),source),/response_too_large/);
});
test('H2: malformed robots persists stop without fetching discovery',async()=>{
 const s=await store();const r=await collectSource(source.id,s,options({fetcher:async()=>response('User-agent: * # Disallow: /')}));assert.equal(r.outcome,'robots_unparseable');assert.equal(r.requests,1);assert.equal((await s.state(source.id)).disabled,true);
});
test('M1: robots noindex ignored; feed refusal blocks; 401/403/451 stop',async()=>{
 const s=await store();const r=await collectSource(source.id,s,options({fetcher:async url=>url.endsWith('/robots.txt')?response(robots,200,{'x-robots-tag':'noindex, follow'}):response(feed)}));assert.equal(r.pending,1);assert.equal((await s.state(source.id)).disabled,false);
 for(const value of ['noindex','none','nosnippet','noarchive','nofollow']){
  assert.equal(optOut(value),true);const st=await store();const run=await collectSource(source.id,st,options({fetcher:mock({'x-robots-tag':value})}));assert.equal(run.outcome,'header_optout');assert.equal((await st.candidates()).length,0);
 }
 for(const status of [401,403,451]){const st=await store();await collectSource(source.id,st,options({fetcher:async()=>response('',status)}));assert.equal((await st.state(source.id)).disabled,true);}
});
test('metadata: RSS Atom News Sitemap, no body, ordinary lastmod not publication',()=>{
 assert.equal(parseMetadata(feed,'rss')[0].description,undefined);
 assert.equal(parseMetadata('<feed><entry><title>DTM</title><link href="https://sleepfreaks-dtm.com/a"/><published>2026-09-28</published></entry></feed>','atom')[0].url,source.baseUrl+'a');
 assert.equal(parseMetadata('<urlset><url><loc>https://sleepfreaks-dtm.com/a</loc><lastmod>2026-09-28</lastmod></url></urlset>','sitemap')[0].date,'');
 assert.equal(parseMetadata('<urlset><url><loc>https://sleepfreaks-dtm.com/a</loc><news:news><news:title>DTM</news:title><news:publication_date>2026-09-28</news:publication_date></news:news></url></urlset>','sitemap')[0].date,'2026-09-28');
 assert.equal(parseMetadata('<rss><channel><item><meta name="robots" content="noarchive"/></item></channel></rss>','rss')[0].optOut,true);
 for(const xml of ['<!DOCTYPE rss SYSTEM "https://bad"><rss/>','<!ENTITY x "boom"><rss/>','<rss>','x'.repeat(1000001)])assert.throws(()=>parseMetadata(xml,'rss'));
});
test('URL, redirect, huge responses and private DNS fail closed',async()=>{
 for(const url of ['http://sleepfreaks-dtm.com/','file:///etc/passwd','https://user:pass@sleepfreaks-dtm.com/','https://127.0.0.1/','https://sleepfreaks-dtm.com.evil.test/','https://sleepfreaks-dtm.com:444/','https://[::1]/'])assert.equal(sourceUrl(url,source),null);
 assert.equal(sourceUrl(source.baseUrl+'a?utm_source=x#frag',source),source.baseUrl+'a');
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','172.16.0.1','100.64.0.1','::1','0.0.0.0'])assert.equal(publicAddress(ip),false);
 assert.equal(publicAddress('8.8.8.8'),true);
 await assert.rejects(boundedFetch(source.baseUrl,{fetcher:async()=>response('',302,{location:'http://127.0.0.1/'})}),/redirect_blocked/);
 await assert.rejects(boundedFetch(source.baseUrl,{maxBytes:2,fetcher:async()=>response('abc')}),/response_too_large/);
});
test('pending only, minimum interval, robots crawl delay, URL dedupe',async()=>{
 const s=await store();const waits=[];let calls=0;const fetcher=async(...a)=>{calls++;return mock()(...a)};
 const r=await collectSource(source.id,s,options({fetcher,sleep:async ms=>waits.push(ms)}));assert.equal(r.pending,1);assert.equal(calls,2);assert.deepEqual(waits,[2000]);
 const saved=await s.candidates();assert.equal(saved[0].review_status,'pending');assert.ok(!JSON.stringify(saved).includes('DO NOT STORE'));assert.ok(!JSON.stringify(saved).includes(parseMetadata(feed,'rss')[0].title));
 assert.equal((await collectSource(source.id,s,options({fetcher}))).outcome,'backoff');assert.equal(calls,2);
 assert.equal((await collectSource(source.id,s,options({now:now+DAY}))).duplicates,1);
});
test('429 Retry-After, 5xx backoff, robots changes',async()=>{
 assert.ok(retryAt(429,'172800',0,now)>=now+2*DAY);assert.ok(retryAt(429,new Date(now+3*DAY).toUTCString(),0,now)>=now+3*DAY);assert.ok(retryAt(500,null,2,now)>retryAt(500,null,1,now));
 for(const status of [429,503]){const s=await store();const r=await collectSource(source.id,s,options({fetcher:async()=>response('',status,{'retry-after':'172800'})}));assert.equal(r.requests,1);assert.ok((await s.state(source.id)).nextAt>=now+DAY);}
 const s=await store();await collect(s);const changed=await collectSource(source.id,s,options({now:now+DAY,fetcher:async()=>response(robots+'\nDisallow: /new')}));assert.equal(changed.outcome,'robots_changed_review');assert.equal(changed.requests,1);
});
test('conditional GET and concurrency lease; mode off never fetches',async()=>{
 const s=await store();await collect(s);let saw=false;
 await collectSource(source.id,s,options({now:now+DAY,fetcher:async(url,opts)=>{if(url.endsWith('/robots.txt'))return response(robots);saw=opts.headers['If-None-Match']==='v1';return new Response(null,{status:304});}}));assert.equal(saw,true);
 const fresh=await store();let concurrent=0,max=0;const fetcher=async()=>{max=Math.max(max,++concurrent);await new Promise(r=>setTimeout(r,5));concurrent--;return response(robots);};
 const runs=await Promise.all([1,2].map(()=>collectSource(source.id,fresh,options({fetcher}))));assert.equal(max,1);assert.ok(runs.some(r=>r.outcome==='lease_busy'));
 await collectAll(['chuya','sleepfreaks'],await store(),options({mode:'off',fetcher:()=>{throw Error('no')}}));
});
test('M2: punctuation, whitespace, NFKC, near copy rejected; independent accepted',async()=>{
 const title='Universal Audio LUNA 3、新機能を追加して大型アップデート';const fp=await fingerprint(title,pepper);
 for(const label of [title,title.replaceAll(' ','　'),title.replace('、','!!')+'。',title.replace('LUNA 3','ＬＵＮＡ ３'),title+'を紹介'])assert.equal(await headlineSimilarity(label,fp,pepper),true,label);
 assert.equal(await headlineSimilarity('LUNA 3の更新情報を確認する',fp,pepper),false);
 assert.equal(await headlineSimilarity('審査できない古い候補',null,pepper),true);
 assert.equal(validLabel('a'.repeat(141)),false);assert.equal(validLabel('<script>bad</script>'),false);
 assert.equal(JSON.stringify(fp).includes(title),false);
});
test('M4: source path tutorial/sale/evergreen filtering and product-specific label',async()=>{
 const base=parseMetadata(feed,'rss')[0],p=robotsPolicy(robots,source);
 for(const url of ['how-to-urx/a','how-to-any/a','tutorial/a'])assert.equal((await candidateFrom({...base,url:source.baseUrl+url},source,p,now,pepper)).item,undefined);
 for(const title of ['LUNA 3 使い方','LUNA 3 セール','LUNA 3 完全ガイド','LUNA 3 tutorial','LUNA 3 coupon'])assert.equal((await candidateFrom({...base,title},source,p,now,pepper)).item,undefined);
 const {item}=await candidateFrom(base,source,p,now,pepper);assert.equal(item.eventType,'update');assert.equal(item.label,'Universal Audio、LUNA 3を更新');assert.equal(item.productFacts.version,'3');
 assert.equal((await candidateFrom({...base,title:'新しいギターエフェクターを発売'},source,p,now,pepper)).item.reviewReason,'label_required');
 assert.equal((await candidateFrom({...base,date:'2026-01-01'},source,p,now,pepper)).item,undefined);
});
test('M4: false-positive words are not instrument/DAW evidence',()=>{
 for(const title of ['logical thinking','reason to travel','Boss at the office','Acoustic drums'])assert.equal(classify(title),null,title);
 assert.equal(classify('Logic Pro update'),'dtm_software');assert.equal(classify('BOSS DS-1 発売'),'amps_effects');assert.equal(classify('ピアノ弾き語りライブ'),null);assert.equal(classify('ギター弾き語りライブ'),'live_guitar');assert.equal(contentType('中古ギター'),'sale');
});
test('M3/M7: reviewer, all structured checks, opt-out codes and date override required',async()=>{
 const s=await store();await collect(s);const item=(await s.candidates())[0],input=approval(item);
 await assert.rejects(reviewCandidate(s,{...input,reviewedBy:'Someone Real'},now,registry,pepper),/reviewer_required/);
 for(const key of REQUIRED_CHECKS)await assert.rejects(reviewCandidate(s,{...input,checks:{...input.checks,[key]:false}},now,registry,pepper),/review_checks_required/);
 for(const key of Object.keys(ARTICLE_CHECKS))await assert.rejects(reviewCandidate(s,{...input,articleChecks:{...input.articleChecks,[key]:'unverified'}},now,registry,pepper),/article_checks_required/);
 await assert.rejects(reviewCandidate(s,{...input,publishedAt:new Date(now-1000).toISOString()},now,registry,pepper),/date_override_reason_required/);
 await assert.rejects(reviewCandidate(s,{...input,label:parseMetadata(feed,'rss')[0].title+'。'},now,registry,pepper),/similarity/);
 await reviewCandidate(s,{...input,publishedAt:new Date(now-1000).toISOString(),dateOverrideReason:'feed_date_incorrect'},now,registry,pepper);
 const saved=(await s.candidates())[0];assert.equal(saved.reviewed_by,'operator');assert.equal(JSON.parse(saved.review_checks).labelChecked,true);
});
test('M3: rejected needs explicit reopen; duplicate topic blocked',async()=>{
 const s=await store();await collect(s);const item=(await s.candidates())[0],input=approval(item);
 await reviewCandidate(s,{id:item.id,action:'reject',reviewedBy:'operator'},now,registry,pepper);
 await assert.rejects(reviewCandidate(s,input,now,registry,pepper),/explicit_reopen/);
 await reviewCandidate(s,{id:item.id,action:'reopen',reviewedBy:'operator'},now,registry,pepper);await reviewCandidate(s,{...input,topicKey:'ua-luna-3'},now,registry,pepper);
 const second=await candidateFrom({...parseMetadata(feed,'rss')[0],url:source.baseUrl+'dtm-materials/second/'},source,robotsPolicy(robots,source),now,pepper);await s.put(second.item);
 const other=(await s.candidates()).find(i=>i.id!==item.id);await assert.rejects(reviewCandidate(s,{...approval(other),topicKey:'ua-luna-3'},now,registry,pepper),/duplicate_topic/);
});
test('H4: global collection OFF before and during request prevents persistence',async()=>{
 const s=await store();await administer(s,{action:'collection-off',reason:'operator_stop'},now);
 const off=await collectSource(source.id,s,options({fetcher:()=>{throw Error('must not fetch')}}));assert.equal(off.outcome,'global_collection_off');assert.equal(off.requests,0);
 await administer(s,{action:'collection-on',reason:'review_complete'},now);
 await collectSource(source.id,s,options({fetcher:async url=>{if(!url.endsWith('robots.txt'))await administer(s,{action:'collection-off',reason:'operator_stop'},now);return mock()(url);}}));assert.equal((await s.candidates()).length,0);
});
test('H4: source disable, delete, item tombstone and safe SQL plans',async()=>{
 const s=await store();await collect(s);const item=(await s.candidates())[0];
 await administer(s,{action:'item-delete',target:item.id,reason:'owner_request'},now);assert.equal((await s.candidates()).length,0);
 const again=await candidateFrom(parseMetadata(feed,'rss')[0],source,robotsPolicy(robots,source),now,pepper);assert.equal(await s.put(again.item),false);
 await administer(s,{action:'source-delete',target:source.id,reason:'owner_request'},now);assert.equal((await s.state(source.id)).disabled,true);
 await assert.rejects(administer(s,{action:'source-enable',target:source.id,reason:'review_complete'},now),/policy_review_required/);
 assert.throws(()=>adminStatements({action:'item-delete',target:"'; DROP TABLE news_controls",reason:'owner_request'}));
 const audits=(await s.db.prepare('SELECT * FROM news_admin_audit').all()).results;assert.ok(audits.some(a=>a.action==='item-delete'));assert.ok(audits.every(a=>!Object.hasOwn(a,'email')));
});
test('H3: scheduled physical purge works with collection/API off; current rows retained',async()=>{
 const s=await store();await collect(s);const item=(await s.candidates())[0];
 await s.db.prepare('UPDATE candidate_items SET expires_at=? WHERE id=?').bind(now,item.id).run();
 const fresh=await candidateFrom({...parseMetadata(feed,'rss')[0],url:source.baseUrl+'dtm-materials/fresh/'},source,robotsPolicy(robots,source),now,pepper);await s.put(fresh.item);
 await administer(s,{action:'global-off',reason:'operator_stop'},now);
 const counts=await scheduledPurge({},env(s.db),{},now);assert.equal(counts.news,1);assert.equal((await s.candidates()).length,1);
});
test('H3: failing purge batch rolls back preceding deletes',async()=>{
 const s=await store();await collect(s);await s.db.prepare('UPDATE candidate_items SET expires_at=?').bind(now).run();
 s.db.raw.exec('DROP TABLE news_admin_audit');
 await assert.rejects(scheduledPurge({},env(s.db),{},now),/physical_purge_failed/);assert.equal((await s.candidates()).length,1);
});
test('M5: CORS restricted; API disabled; public contract hides internal fields',async()=>{
 const s=await store();await collect(s);const item=(await s.candidates())[0];await reviewCandidate(s,approval(item),now,registry,pepper);
 const r=await request(s,'/v1/news',{headers:{Origin:'https://soundcruise.jp'}});assert.equal(r.headers.get('access-control-allow-origin'),'https://soundcruise.jp');assert.equal(r.headers.get('access-control-allow-credentials'),null);
 const payload=await r.json();assert.equal(payload.items.length,1);assert.equal(payload.items[0].publishable,true);assert.deepEqual(Object.keys(payload.items[0]),['id','label','sourceName','sourceUrl','publishedAt','category','publishable']);
 assert.equal((await request(s,'/v1/news',{headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await request(s,'/v1/news',{headers:{Origin:'http://localhost:8765'}})).headers.get('access-control-allow-origin'),'http://localhost:8765');
 for(const path of ['/v1/news?offset=-1','/v1/news?limit=51','/v1/news?limit=NaN'])assert.equal((await request(s,path)).status,400);
 await administer(s,{action:'api-off',reason:'operator_stop'},now);assert.equal((await (await request(s)).json()).disabled,true);
});
test('M5/H4: internal edge cache used; takedown revision immediately bypasses old cache',async()=>{
 const s=await store();await collect(s);const item=(await s.candidates())[0];await reviewCandidate(s,approval(item),now,registry,pepper);
 const map=new Map();let puts=0,hits=0;const cache={put:async(k,v)=>{puts++;assert.match(v.headers.get('cache-control'),/max-age=300/);map.set(k.url,v.clone());},match:async k=>{const v=map.get(k.url);if(v)hits++;return v?.clone();}};
 await request(s,'/v1/news',{},cache);await request(s,'/v1/news',{},cache);assert.equal(puts,1);assert.equal(hits,1);
 await administer(s,{action:'source-disable',target:source.id,reason:'owner_request'},now);
 assert.equal((await (await request(s,'/v1/news',{},cache)).json()).items.length,0);
 await administer(s,{action:'global-off',reason:'operator_stop'},now);assert.equal((await (await request(s,'/v1/news',{},cache)).json()).disabled,true);
});
test('documentation/config: production remains off, independent scheduled handler, no forbidden schema',()=>{
 const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));assert.equal(config.vars.NEWS_COLLECTION_MODE,'off');assert.equal(config.env.production.vars.NEWS_API_MODE,'off');assert.deepEqual(config.triggers.crons,[]);assert.equal(config.workers_dev,false);
 const schema=readFileSync(new URL('../migrations/0002_safety.sql',import.meta.url),'utf8');assert.doesNotMatch(schema,/\b(body|html|image|headline|description)\b/i);
});

test('production CORS excludes local origins, preflight and strict API mode',async()=>{
 const s=await store();const production={...env(s.db),NEWS_API_MODE:'production'};
 const run=(headers={},method='GET')=>handleNewsRequest(new Request('https://news.example/v1/news',{headers,method}),production,now,{registry});
 assert.equal((await run({Origin:'http://localhost:8765'})).status,403);
 assert.equal((await run({Origin:'https://soundcruise.jp'},'OPTIONS')).status,204);
 assert.equal((await run({},'POST')).status,405);
 assert.equal((await handleNewsRequest(new Request('https://news.example/v1/news'),{...production,NEWS_API_MODE:'off'},now)).status,503);
});
test('SQL filters pending/rejected/disabled and individual takedown invalidates cache',async()=>{
 const s=await store();await collect(s);assert.equal((await (await request(s)).json()).items.length,0);
 const item=(await s.candidates())[0];await reviewCandidate(s,approval(item),now,registry,pepper);
 const map=new Map(),cache={put:async(k,v)=>map.set(k.url,v.clone()),match:async k=>map.get(k.url)?.clone()};
 assert.equal((await (await request(s,'/v1/news',{},cache)).json()).items.length,1);
 await administer(s,{action:'item-delete',target:item.id,reason:'owner_request'},now);
 assert.equal((await (await request(s,'/v1/news',{},cache)).json()).items.length,0);
 assert.ok(s.db.raw.prepare("EXPLAIN QUERY PLAN SELECT id FROM candidate_items WHERE review_status='approved' ORDER BY published_at DESC,id LIMIT 5").all().some(row=>row.detail.includes('news_public_order')));
});
test('retention clears all item review data, run logs and old audit without touching fresh metadata',async()=>{
 const s=await store();await collect(s);await reviewCandidate(s,approval((await s.candidates())[0]),now,registry,pepper);
 const counts=await s.purge(now+366*DAY);assert.equal(counts.news,1);assert.ok(counts.runs>=1);assert.ok(counts.audit>=3);assert.equal((await s.candidates()).length,0);
});
test('policy document matches registry status and OFF settings',()=>{
 const doc=readFileSync(new URL('../../../apps/cruise-port/NEWS-LEGAL-COMPLIANCE.md',import.meta.url),'utf8');
 for(const s of SOURCES)assert.ok(doc.split('\n').some(line=>line.startsWith(`| ${s.id} |`)&&line.endsWith(`| ${s.legalStatus} | ${s.enabled} |`)),s.id);
 for(const term of ['evidence_missing','robots_unparseable','Prototype fixture exception','source-policies.js'])assert.ok(doc.includes(term));
});

test('M4: library is not live event; NOVA is recognized with brand context',()=>{
 assert.equal(classify('Lunacy NOVA 音源ライブラリが登場'),'dtm_software');
});

test('runtime publisher stop invalidates cached API, not only operator takedown',async()=>{
 const s=await store();await collect(s);await reviewCandidate(s,approval((await s.candidates())[0]),now,registry,pepper);
 const map=new Map(),cache={put:async(k,v)=>map.set(k.url,v.clone()),match:async k=>map.get(k.url)?.clone()};
 assert.equal((await (await request(s,'/v1/news',{},cache)).json()).items.length,1);
 await s.saveState(source.id,{...(await s.state(source.id)),disabled:true});
 assert.equal((await (await request(s,'/v1/news',{},cache)).json()).items.length,0);
});
test('facts-only equivalent label remains an automatic candidate with advisory similarity',async()=>{
 const entry={...parseMetadata(feed,'rss')[0],title:'Universal Audio LUNA 3を更新！'};
 const {item}=await candidateFrom(entry,source,robotsPolicy(robots,source),now,pepper);
 assert.equal(item.publicationDecision,'AUTO_PUBLISHABLE');assert.equal(item.decisionReason,'factual_label_similarity');
});
