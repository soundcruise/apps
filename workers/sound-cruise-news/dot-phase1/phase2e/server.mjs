import http from 'node:http';import {randomBytes} from 'node:crypto';import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openStore,ingest,list,demoDecision} from './store.mjs';import {findSimilar} from './similarity.mjs';import {existing} from './existing.mjs';
// Disposable local demo only. Never listens publicly and never connects to production.
const dir=mkdtempSync(join(tmpdir(),'dot2e-')),db=openStore(join(dir,'staging.sqlite')),token=randomBytes(32).toString('hex');
const records=JSON.parse(readFileSync(new URL('../fixtures/dot-report-14.json',import.meta.url),'utf8'));for(const x of records)ingest(db,x,'2026-10-29T16:30:00+09:00');
const summaries=JSON.parse(readFileSync(new URL('../fixtures/dot-report-summaries.json',import.meta.url),'utf8'));
const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
const server=http.createServer(async(req,res)=>{const host=`127.0.0.1:${server.address().port}`;res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");if(req.headers.host!==host){res.writeHead(403).end();return;}
 const u=new URL(req.url,`http://${host}`);const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 if(req.method==='GET'&&files[u.pathname]){const [file,type]=files[u.pathname];res.writeHead(200,{'Content-Type':type});res.end(readFileSync(new URL('./public/'+file,import.meta.url)));return;}
 if(req.method==='GET'&&u.pathname==='/api/review'){json(200,{token,historyComplete:false,items:list(db).map(x=>({...x,summary:summaries[x.input.candidate.candidate_id]||null,similar:findSimilar(x.input.candidate,existing)}))});return;}
 if(req.method==='POST'&&u.pathname==='/api/demo-decision'){if(req.headers.origin!==`http://${host}`||req.headers['x-demo-token']!==token||req.headers['content-type']!=='application/json'){json(403,{error:'forbidden'});return;}let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048){json(413,{error:'too_large'});return;}}try{const v=JSON.parse(raw);if(!v||Object.keys(v).sort().join(',')!=='id,verdict')throw Error();json(200,demoDecision(db,v.id,v.verdict));}catch{json(400,{error:'invalid'});}return;}
 json(404,{error:'not_found'});
});server.listen(0,'127.0.0.1',()=>console.log(`Isolated demo: http://127.0.0.1:${server.address().port}/`));

function stop(){server.close(()=>{db.close();rmSync(dir,{recursive:true,force:true});process.exit(0);});}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
