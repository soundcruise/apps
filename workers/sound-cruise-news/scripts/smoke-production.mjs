// Infrastructure acceptance only: empty DB, collection/publication hard OFF, no publisher request.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {checkedConfig,infrastructureConfig,remoteSql} from './remote-db.mjs';
import {deploymentMetadata} from './cloudflare-metadata.mjs';
import {hash} from '../src/policy.js';
infrastructureConfig(await checkedConfig());
const base='https://sound-cruise-news.cruise-port-requests.workers.dev';
const request=(path,origin='https://soundcruise.jp',method='GET')=>fetch(base+path,{method,headers:{Origin:origin},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
const empty=async path=>{const response=await request(path);assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'https://soundcruise.jp');assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.deepEqual(body,{contractVersion:1,items:[],nextOffset:null,nextCursor:null});return body;};
const status=await remoteSql('SELECT * FROM news_controls; SELECT COUNT(*) AS count FROM candidate_items; SELECT COUNT(*) AS count FROM collection_runs;');
assert.equal(status[0].results[0].collection_enabled,0);assert.equal(status[0].results[0].publication_enabled,0);assert.equal(status[0].results[0].api_enabled,1);
assert.equal(status[1].results[0].count,0);assert.equal(status[2].results[0].count,0);
const health=await (await request('/health')).json();assert.equal(health.ok,true);assert.equal(health.collection,false);assert.equal(health.publication,false);assert.equal(health.api,true);
for(const path of ['/v1/news','/v1/news','/v1/news/ticker','/v1/news?category=sale','/v1/news?limit=1&offset=1','/v1/news?cursor='+encodeURIComponent(JSON.stringify(['2026-09-28T00:00:00.000Z','qa']))])await empty(path);
assert.equal((await request('/v1/news?category=invalid')).status,400);
assert.equal((await request('/v1/news?cursor=invalid')).status,400);
assert.equal((await request('/v1/news?limit=51')).status,400);
for(const origin of ['https://untrusted.example','http://localhost:8765'])assert.equal((await request('/v1/news',origin)).status,403);
assert.equal((await request('/v1/news',undefined,'OPTIONS')).status,204);
assert.equal((await request('/admin/collect')).status,404);assert.equal((await request('/admin/collect',undefined,'POST')).status,405);
try{
 await remoteSql('UPDATE news_controls SET api_enabled=0,revision=revision+1 WHERE id=1;');
 for(const path of ['/v1/news','/v1/news/ticker']){const stopped=await request(path);assert.equal(stopped.status,503);assert.equal((await stopped.json()).disabled,true);}
}finally{await remoteSql('UPDATE news_controls SET api_enabled=1,revision=revision+1 WHERE id=1;');}
await empty('/v1/news');
const id=await hash('sound-cruise-news-infrastructure-smoke-reserved');
// Use the real operator statements against an empty News DB; no existing item is removed.
const {adminStatements}=await import('../src/admin.js');
const {runtimeSources}=await import('../src/runtime.js');
const {sqlLiteral}=await import('./remote-db.mjs');
for(const action of ['collection-off','publish-off','source-disable','source-delete','source-enable','item-delete']){
 const target=action.startsWith('source')?'shimamura':action==='item-delete'?id:'global';
 const reason=action==='source-enable'?'review_complete':'operator_stop';
 const statements=adminStatements({action,target,reason},Date.now(),runtimeSources((await checkedConfig()).vars));
 await remoteSql(statements.map(s=>{let i=0;return s.sql.replace(/\?/g,()=>sqlLiteral(s.args[i++]));}).join(';\n')+';');
}
const evidence=(await import('../src/shimamura-evidence.js')).SHIMAMURA_EVIDENCE;
await remoteSql(`UPDATE source_state SET robots_hash=${sqlLiteral(evidence.robotsHash)},next_at=MAX(next_at,${Date.parse(evidence.nextListingAccessAt)}) WHERE source_id='shimamura';
 UPDATE source_health SET status='paused',reason_code='global_collection_off',next_eligible_run_at=${Date.parse(evidence.nextListingAccessAt)},last_successful_run_at=NULL WHERE source_id='shimamura';`);
const metadata=await deploymentMetadata();
assert.deepEqual(metadata.schedules.schedules??metadata.schedules,[]);
assert.equal(metadata.bindings.find(b=>b.name==='NEWS_COLLECTION_MODE').value,'off');
assert.ok(metadata.bindings.some(b=>b.name==='NEWS_HEADLINE_PEPPER'&&b.type==='secret_text'));
assert.equal(metadata.bindings.find(b=>b.name==='NEWS_DB').id,(await checkedConfig()).d1_databases[0].database_id);
const final=await remoteSql('SELECT * FROM news_controls; SELECT * FROM source_health; SELECT COUNT(*) AS count FROM news_admin_audit; SELECT COUNT(*) AS count FROM news_takedowns; SELECT COUNT(*) AS count FROM collection_runs; SELECT COUNT(*) AS count FROM candidate_items;');
assert.equal(final[0].results[0].collection_enabled,0);assert.equal(final[0].results[0].publication_enabled,0);assert.equal(final[0].results[0].api_enabled,1);assert.equal(final[4].results[0].count,0);assert.equal(final[5].results[0].count,0);
const report={at:new Date().toISOString(),health,api:true,empty:true,cors:true,kill:true,operators:true,sourceHealth:final[1].results,auditCount:final[2].results[0].count,takedowns:final[3].results[0].count,collectionRuns:0,candidates:0,metadata,publisherRequests:0};
await writeFile('.local/infrastructure-smoke.json',JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(report,null,2));
