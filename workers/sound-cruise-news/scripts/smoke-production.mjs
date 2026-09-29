import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {checkedConfig,remoteSql} from './remote-db.mjs';
import {hash} from '../src/policy.js';
await checkedConfig();
const base='https://sound-cruise-news.cruise-port-requests.workers.dev';
const request=path=>fetch(base+path,{headers:{Origin:'https://soundcruise.jp'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
const health=await (await request('/health')).json();assert.equal(health.ok,true);assert.equal(health.collection,true);assert.equal(health.publication,true);
const newsResponse=await request('/v1/news?limit=50');assert.equal(newsResponse.status,200);assert.equal(newsResponse.headers.get('access-control-allow-origin'),'https://soundcruise.jp');
const news=await newsResponse.json();assert.equal(news.contractVersion,1);assert.ok(news.items.length>0);
const ticker=await (await request('/v1/news/ticker')).json();assert.equal(ticker.contractVersion,1);
assert.ok(news.items.every(i=>i.publishable&&i.label&&i.category&&new URL(i.sourceUrl).hostname==='www.shimamura.co.jp'));
const denied=await fetch(base+'/v1/news',{headers:{Origin:'https://untrusted.example'},redirect:'error'});assert.equal(denied.status,403);
try{
 await remoteSql('UPDATE news_controls SET api_enabled=0,revision=revision+1 WHERE id=1;');
 const stopped=await request('/v1/news');assert.equal(stopped.status,503);assert.equal((await stopped.json()).disabled,true);
}finally{await remoteSql('UPDATE news_controls SET api_enabled=1,revision=revision+1 WHERE id=1;');}
assert.equal((await request('/v1/news')).status,200);
// A reserved, nonexistent QA ID exercises the production tombstone without deleting a real item.
const id=await hash('sound-cruise-news-production-smoke-reserved');
await remoteSql(`INSERT INTO news_takedowns(item_id,expires_at) VALUES('${id}',${Date.now()+86400000}) ON CONFLICT(item_id) DO NOTHING;`);
const tombstone=await remoteSql(`SELECT COUNT(*) AS count FROM news_takedowns WHERE item_id='${id}';`);assert.equal(tombstone[0].results[0].count,1);
const states=await remoteSql('SELECT * FROM source_health; SELECT COUNT(*) AS expired FROM candidate_items WHERE expires_at <= '+Date.now()+';');
assert.equal(states[1].results[0].expired,0);
const report={at:new Date().toISOString(),health,items:news.items,sourceHealth:states[0].results,api:true,cors:true,kill:true,tombstone:true,expiredItems:0};
await writeFile('.local/production-smoke.json',JSON.stringify(report,null,2),{mode:0o600});
if(process.argv.includes('--connect-port')){
 const config=new URL('../../../apps/cruise-port/news-config.js',import.meta.url),text=await readFile(config,'utf8');
 if(!text.includes(base))throw Error('port_endpoint_mismatch');
 await writeFile(config,text.replace("NEWS_PROVIDER = 'fixture'","NEWS_PROVIDER = 'api'"));
}
console.log(JSON.stringify(report,null,2));
