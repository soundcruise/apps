import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { getSource } from '../src/registry.js';
import { NewsStore } from '../src/store.js';
import { administer } from '../src/admin.js';
import { ARTICLE_CHECKS,REQUIRED_CHECKS } from '../src/review.js';
export const pepper='test-only-news-hmac-secret-never-use-outside-tests';
export const now=Date.parse('2026-09-28T12:00:00Z');
export const source=Object.freeze({...getSource('sleepfreaks'),enabled:true,termsUrl:'https://sleepfreaks-dtm.com/test-policy',linkPolicyUrl:'https://sleepfreaks-dtm.com/test-policy',policySummary:'Synthetic test evidence only',reviewedBy:'operator',reviewedAt:'2026-09-28',robotsReviewedAt:'2026-09-28',discoveryReviewedAt:'2026-09-28',policyDecision:'approved'});
export const registry=[source];
export const robots='User-agent: *\nDisallow: /private\nAllow: /private/public\nCrawl-delay: 2\nSitemap: https://sleepfreaks-dtm.com/sitemap.xml';
export const feed=`<rss><channel><item><title>Universal Audio LUNA 3 新機能アップデートの紹介</title><link>https://sleepfreaks-dtm.com/dtm-materials/luna-3/</link><pubDate>Mon, 28 Sep 2026 00:00:00 GMT</pubDate><description>DO NOT STORE THIS BODY</description></item></channel></rss>`;
export const response=(body,status=200,headers={})=>new Response(body,{status,headers:{'content-type':'application/xml',...headers}});
export const mock=(extra={})=>async url=>url.endsWith('/robots.txt')?response(robots):response(feed,200,{etag:'v1',...extra});
export function database(){
 const db=new DatabaseSync(':memory:');const directory=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(directory).sort())db.exec(readFileSync(new URL(name,directory),'utf8'));
 const wrap=(sql,args=[])=>({bind:(...values)=>wrap(sql,values),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:db.prepare(sql).run(...args)})});
 return {prepare:wrap,batch:async statements=>{db.exec('BEGIN');try {const values=[];for(const s of statements)values.push(await s.run());db.exec('COMMIT');return values;}catch(error){db.exec('ROLLBACK');throw error;}},raw:db};
}
export async function store(db=database()){
 const s=new NewsStore(db);await administer(s,{action:'collection-on',reason:'review_complete'},now);await administer(s,{action:'api-on',reason:'review_complete'},now);return s;
}
export const options=(extra={})=>({mode:'local',now,registry,pepper,fetcher:mock(),sleep:async()=>{},...extra});
export const approval=item=>({id:item.id,action:'approve',label:'LUNA 3の更新情報を確認する',category:'dtm_software',publishedAt:item.published_at,reviewedBy:'operator',checks:Object.fromEntries(REQUIRED_CHECKS.map(k=>[k,true])),articleChecks:Object.fromEntries(Object.entries(ARTICLE_CHECKS).map(([k,values])=>[k,values[0]]))});
export const env=db=>({NEWS_DB:db,NEWS_API_MODE:'local',NEWS_LOCAL_ORIGINS:'["http://localhost:8765"]'});
