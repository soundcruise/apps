import test from 'node:test';import assert from 'node:assert/strict';
import {collectSource} from '../src/collector.js';
import {AGM_SURFACES,agmArticleUrl} from '../src/agm-sections.js';
import {AGM_DEFERRED,planAgmNews} from '../src/agm-backfill.js';
import {publicationValidation} from '../src/decision-policy.js';
import {getSource} from '../src/registry.js';import {DAY,hash} from '../src/policy.js';
import {store,pepper} from './helpers.js';
import {scheduledNews,COLLECTION_CRON} from '../src/scheduled.js';
import {probeMaintenanceRecovery} from '../src/maintenance-recovery.js';
const base='https://acousticguitarmagazine.jp',t=Date.parse('2026-10-23T00:00:00Z'),date='2026-10-22T00:00:00.000Z',robot='User-agent: *\nAllow: /';
const url=n=>`${base}/2026-1022-backfill-${n}/`,title=n=>`シンガー・ソングライターの合成奏者がEP『合成の歌${n}』をリリース`;
const card=n=>`<div class="post-wrap"><a class="post-obj" href="${url(n)}"><div class="post-obj-title">${title(n)}</div></a></div>`;
const article=n=>`<link rel="canonical" href="${url(n)}"><h1>${title(n)}</h1><meta property="article:published_time" content="${date}"><main class="post-item"><article><p>${title(n)}する。NEVER_PERSIST_BODY</p></article></main>`;
async function setup(){
 const s=await store(),source={...getSource('agm'),enabled:true,productionEnabled:true,robotsHash:await hash(robot)},calls=[],state={ids:Array.from({length:30},(_,i)=>i),feedCount:12,status:200};
 await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();
 const fetcher=async(u,o)=>{calls.push(u);assert.equal(o.redirect,'manual');if(u===source.robotsUrl)return new Response(robot);
  const surface=AGM_SURFACES.find(x=>x.url===u);if(surface)return new Response(surface.type==='html'?state.ids.map(card).join(''):`<rss><channel>${Array.from({length:state.feedCount},(_,i)=>`<item><title>アコギのadd9を詳しく解説</title><link>${base}/${surface.section}/2026-1022-backfill-${i}/</link><pubDate>Thu, 22 Oct 2026 00:00:00 GMT</pubDate></item>`).join('')}</channel></rss>`,{headers:{'content-type':surface.type==='rss'?'application/rss+xml':'text/html'}});
  assert(agmArticleUrl(u,'news'));const n=Number(u.match(/backfill-(\d+)/)[1]);return new Response(state.status===200?article(n):null,{status:state.status,headers:{'content-type':'text/html'}});
 };
 const collect=now=>collectSource('agm',s,{mode:'production',registry:[source],now,clock:()=>now,pepper,requestMode:'scheduled',jstDay:new Date(now+9*3600000).toISOString().slice(0,10),fetcher,sleep:async()=>{}});
 return {s,source,calls,state,collect,fetcher};
}
async function stopped(){const c=await setup();await c.s.db.prepare('INSERT INTO source_state(source_id,disabled,robots_hash,next_at,last_discovery_at) VALUES(?,1,?,?,?)').bind('agm',c.source.robotsHash,t,t-3*DAY).run();await c.s.recordRedirect('agm',{status:302,sourceUrl:c.source.robotsUrl,location:base+'/',timestamp:new Date(t-DAY).toISOString()});await c.s.log({sourceId:'agm',startedAt:t-DAY,requests:1,candidates:0,pending:0,rejected:0,duplicates:0,outcome:'redirect_blocked',durationMs:0,requestMode:'scheduled'});return c;}
test('AGM maintenance recovery reuses its one robots response and prepares backlog without publication',async()=>{
 const {s,source,calls,fetcher}=await stopped();const r=await scheduledNews({cron:COLLECTION_CRON,scheduledTime:t},{NEWS_DB:s.db,NEWS_COLLECTION_MODE:'production',NEWS_SOURCE_IDS:'["agm"]',NEWS_HEADLINE_PEPPER:pepper},{},t,{registry:[{...source,enabled:false,productionEnabled:false}],fetcher,sleep:async()=>{},clock:()=>t});
 assert.equal(r.results[0].outcome,'collected');assert.equal(r.results[0].robotsCached,true);assert.equal(r.results[0].requests,16);assert.equal(r.results[0].backfill.deferredUrls,21);assert.equal(calls.filter(u=>u===source.robotsUrl).length,1);assert.equal((await s.state('agm')).disabled,false);assert.equal((await s.db.prepare("SELECT COUNT(*) n FROM candidate_items WHERE review_status='approved'").first()).n,0);
});
test('AGM continuing maintenance never follows the home-page redirect or retries the same day',async()=>{
 const {s,source}=await stopped();let count=0;const options={fetcher:async u=>{count++;assert.equal(u,source.robotsUrl);return new Response(null,{status:302,headers:{Location:base+'/'}});}};
 assert.equal((await probeMaintenanceRecovery(s,source,t,options)).outcome,'redirect_blocked');assert.equal(await probeMaintenanceRecovery(s,source,t+1000,options),null);assert.equal(count,1);assert.equal((await s.state('agm')).disabled,true);
});
test('all same-response RSS entries and News URLs are observed; only nine details, no extra surface',async()=>{
 const {s,source,calls,collect}=await setup(),r=await collect(t);
 assert.equal(r.outcome,'collected');assert.equal(r.requests,16);assert.equal(r.requestCounts.article,9);assert.equal(r.candidates,90);assert.equal(r.backfill.listingUrls,30);assert.equal(r.backfill.deferredUrls,21);
 assert.equal(r.preparation.observedUrls,90);assert.equal(r.preparation.newUrls,90);assert.equal(r.preparation.backfill.deferredUrls,21);
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_discovery_receipts WHERE reason_code=?').bind(AGM_DEFERRED).first()).n,21);
 assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM news_agm_article_cache').first()).n,9);
 const row=await s.db.prepare('SELECT * FROM candidate_items WHERE source_url=?').bind(url(8)).first();assert.equal((await publicationValidation(s,row,t,[source],pepper)).valid,true);
 const extra=await s.db.prepare('SELECT * FROM candidate_items WHERE source_url=?').bind(base+'/lesson/2026-1022-backfill-11/').first();assert(extra);assert.equal((await publicationValidation(s,extra,t,[source],pepper)).valid,true);
 assert(calls.every(u=>u===source.robotsUrl||AGM_SURFACES.some(x=>x.url===u)||agmArticleUrl(u,'news')));assert(!calls.some(u=>/page\/|jpg|wp-json/.test(u)));
});
test('deferred URLs recover after leaving the listing, drain over daily runs, then warm run costs seven',async()=>{
 const {s,source,calls,state,collect}=await setup();await collect(t);state.ids=Array.from({length:9},(_,i)=>i);
 for(let day=1;day<=3;day++){calls.length=0;const r=await collect(t+day*DAY);assert.equal(r.outcome,'collected');assert(r.requests<=16);assert(r.requestCounts.article<=9);assert.equal(new Set(calls).size,calls.length);}
 const row=await s.db.prepare('SELECT * FROM candidate_items WHERE source_url=?').bind(url(29)).first();assert(row);assert.equal(row.published_at,date);assert.equal(row.review_status,'pending');assert.equal((await publicationValidation(s,row,t+3*DAY,[source],pepper)).valid,true);
 calls.length=0;assert.equal((await collect(t+4*DAY)).requests,7);
 for(const table of ['news_decision_ledger','news_operator_feedback','news_shadow_evaluations','news_presentation_days','news_category_overrides'])assert.equal((await s.db.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n,0);
 assert(!JSON.stringify((await s.db.prepare('SELECT * FROM news_discovery_receipts').all()).results).includes('合成の歌'));
 assert(!JSON.stringify(await s.candidates()).includes('NEVER_PERSIST_BODY'));
});
test('new discovery outranks expired known evidence within unchanged daily budget',async()=>{
 const {s,state,calls,collect}=await setup();state.ids=Array.from({length:9},(_,i)=>i);await collect(t);state.ids=[...state.ids,30];calls.length=0;
 const r=await collect(t+7*DAY);assert.equal(r.outcome,'collected');assert.equal(r.requests,16);assert(calls.includes(url(30)));assert.equal(r.backfill.deferredUrls,1);
 assert(await s.db.prepare('SELECT id FROM candidate_items WHERE source_url=?').bind(url(30)).first());
});
test('queue cannot widen scope, reuse old/future observations, or create evidence without a detail',async()=>{
 const {s,source}=await setup();for(const [n,u,at] of [[0,url(50),t-91*DAY],[1,url(51),t+DAY],[2,base+'/news/page/2/',t-DAY],[3,'https://jp.yamaha.com/sitemap.xml',t-DAY]])await s.db.prepare('INSERT INTO news_discovery_receipts VALUES(?,?,?,?,?,?,?,NULL)').bind('agm',u,at,at,null,'not_candidate',AGM_DEFERRED).run();
 assert.equal((await planAgmNews(s,source,[],t,pepper)).length,0);
 await assert.rejects(planAgmNews(s,{...source,explicitAutomationPermission:false},[],t,pepper),/permission/);
});
test('403 halts detail processing without alternate requests or automatic publication',async()=>{
 const {s,state,calls,collect}=await setup();state.status=403;const r=await collect(t);assert.equal(r.outcome,'http_403');assert.equal(calls.filter(u=>agmArticleUrl(u,'news')).length,1);assert.equal((await s.state('agm')).disabled,true);assert.equal((await s.db.prepare("SELECT COUNT(*) n FROM candidate_items WHERE review_status='approved'").first()).n,0);
});
test('deferred queue write failure cannot advance a successful discovery watermark',async()=>{
 const {s,collect}=await setup(),prepare=s.db.prepare.bind(s.db);s.db.prepare=sql=>{if(sql.startsWith('INSERT INTO news_discovery_receipts('))throw Error('synthetic_write_failure');return prepare(sql);};
 const r=await collect(t);assert.notEqual(r.outcome,'collected');assert.equal((await s.state('agm')).lastDiscoveryAt,0);
});
