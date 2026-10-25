// Test runner only: loopback, ephemeral port, in-memory synthetic Account/SQL.
// It is never imported by app/Worker routers and uses no production config.
import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import path from 'node:path';
import {fileURLToPath} from 'node:url';import {backendFixture} from '../../../workers/sound-cruise-sync/test/account-save-transaction-fixture.js';
const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url))),fixtures=new Map();
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wav':'audio/wav'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://'+req.headers.host);
 if(req.method==='POST'&&url.pathname==='/__backend_fixture'){
  if(req.headers.origin&&req.headers.origin!==url.origin)throw Error('foreign-origin');let raw='';for await(const b of req){raw+=b;if(raw.length>100000)throw Error('fixture-request-too-large');}
  const q=JSON.parse(raw);if(!/^sound-cruise-port-authority-v1-fixture-[A-Za-z0-9_-]+$/.test(q.name))throw Error('fixture-scope-required');
  let s=fixtures.get(q.name);if(!s&&q.action==='init'){s=await backendFixture({synchronousBatch:true});s.handles=new Map();fixtures.set(q.name,s);}if(!s)throw Error('fixture-missing');
  let result;if(q.action==='init')result={account:s.account};else if(q.action==='request')result=await s.request({id:q.operationId,bpm:q.bpm,revision:q.revision});
  else if(q.action==='prepare'){const h=await s.owner.prepare(q.q,s.credentials);if(h.ok){const id=crypto.randomUUID();s.handles.set(id,h);result={...h,id};}else result=h;}
  else if(q.action==='commit')result=await s.owner.commit(s.handles.get(q.id));else if(q.action==='reconcile')result=await s.owner.reconcile(q.binding,s.credentials);
  else if(q.action==='revoke'){s.db.raw.prepare('UPDATE sync_account_devices SET revoked_at=1 WHERE id=?').run(s.account.accountDeviceId);result={ok:true};}
  else if(q.action==='expire'){s.clock.server=160000;result={ok:true};}else if(q.action==='state')result={data:JSON.parse(s.state()),canWrite:false,productionReady:false};else throw Error('fixture-action-invalid');
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));return;
 }
 if(req.method!=='GET')throw Error('fixture-method-denied');const f=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!f.startsWith(root+path.sep))throw Error('fixture-path-denied');
 const bytes=await readFile(f);res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
 }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,reason:e.message}));}});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({pid:process.pid,base:'http://127.0.0.1:'+server.address().port+'/'})));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{for(const s of fixtures.values())s.dispose();process.exit();}));
