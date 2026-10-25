// Loopback-only test runner. Synthetic Accounts, in-memory SQLite, no bindings.
import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {ownerRouteFixture} from '../../../workers/sound-cruise-sync/test/account-save-routes-fixture.js';
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url))),fixtures=new Map();
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://'+req.headers.host);
 if(req.headers.origin&&req.headers.origin!==url.origin)throw Error('foreign-origin');
 if(req.method==='POST'){
  let raw='';for await(const b of req){raw+=b;if(raw.length>50000)throw Error('fixture-body-limit');}
  if(url.pathname.startsWith('/__isolated/account/v1/')){const s=fixtures.get(req.headers['x-isolated-fixture']);if(!s)throw Error('fixture-missing');const response=await s.routes.handle(new Request(url,{method:'POST',headers:req.headers,body:raw}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}
  if(url.pathname!=='/__owner_fixture')throw Error('fixture-path-invalid');const q=JSON.parse(raw);if(!/^sound-cruise-port-authority-v1-fixture-[A-Za-z0-9_-]+$/.test(q.name))throw Error('fixture-name-required');
  let s=fixtures.get(q.name);if(!s&&q.action==='init'){s=await ownerRouteFixture();fixtures.set(q.name,s);}if(!s)throw Error('fixture-missing');let value;
  if(q.action==='init')value={account:s.account,credentials:s.credentials};else if(q.action==='request')value=await s.saveRequest({id:q.operationId,bpm:q.bpm,revision:q.revision});else if(q.action==='lifecycle')value=s.lifecycle(q.extra);
  else if(q.action==='state')value=JSON.parse(s.state());else if(q.action==='expire'){s.clock.server=160000;value={ok:true};}else throw Error('fixture-action-invalid');
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));return;
 }
 if(req.method!=='GET')throw Error('fixture-method-denied');const f=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!f.startsWith(root+path.sep+'apps'+path.sep)&&!f.startsWith(root+path.sep+'workers/sound-cruise-sync/src/'))throw Error('fixture-path-denied');
 res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(f));
 }catch{res.writeHead(400,{'Content-Type':'application/json'});res.end('{"ok":false,"code":"fixture-unavailable"}');}});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({pid:process.pid,base:'http://127.0.0.1:'+server.address().port+'/'})));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>{for(const s of fixtures.values())s.dispose();process.exit();}));
