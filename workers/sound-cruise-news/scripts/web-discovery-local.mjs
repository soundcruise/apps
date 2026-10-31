// Fixture-only preview. Loopback only; no paid API and no production credentials.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {localDatabase} from './local-db.mjs';
import {runWebDiscovery,listWebHints} from '../src/web-discovery.js';
const runtime=await localDatabase('.local/web-discovery-preview');
const fixtures=JSON.parse(await readFile(new URL('../test/fixtures/web-search-exa.json',import.meta.url)));
let index=0;
const env={NEWS_DB:runtime.db,NEWS_WEB_ENABLED:'true'};
await runWebDiscovery(env,Date.now(),{search:async()=>fixtures[index++%3].items,classify:async hints=>hints.map(h=>({category:'acoustic_guitar',brand:h.title.includes('Emerald')?'Emerald':h.title.includes('Headway')?'Headway':'unknown',product:'確認待ち',event:'announcement',value:'medium',priority:'high',relevance:'high',duplicate:'unknown',reason:'モックAI推定・要確認'}))});
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/api/web-discovery'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await listWebHints(env)));}
 else if(path==='/web-discovery.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('../operator-ui/web-discovery.js',import.meta.url)));}
 else if(path==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main><h1>Web発見 · ローカルfixture確認</h1><p>実Access認証・実モデルの結果ではありません</p></main><script type="module" src="/web-discovery.js"></script>');}
 else {res.statusCode=404;res.end();}
 }catch{res.statusCode=503;res.end('fixture preview unavailable');}});
server.listen(8798,'127.0.0.1',()=>console.log('Fixture preview: http://127.0.0.1:8798'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(async()=>{await runtime.mf.dispose();process.exit(0);}));
