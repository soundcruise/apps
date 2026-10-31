import http from 'node:http';
import {readFileSync} from 'node:fs';
import {findSimilar} from '../phase2e/similarity.mjs';
import {existing} from '../phase2e/existing.mjs';
const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
// Emulator-only UI. No publication or demo-decision mutation route.
export function createReviewServer(db){
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8789')throw Error('local_emulator_required');
 return http.createServer(async(req,res)=>{
  const host=`127.0.0.1:${res.socket.localPort}`;
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  if(req.headers.host!==host){res.writeHead(403).end();return;}
  const u=new URL(req.url,`http://${host}`);
  if(req.method==='GET'&&files[u.pathname]){const [file,type]=files[u.pathname];res.writeHead(200,{'Content-Type':type});res.end(readFileSync(new URL('../phase2e/public/'+file,import.meta.url)));return;}
  if(req.method==='GET'&&u.pathname==='/api/review'){
   try{const snapshot=await db.collection('candidates').limit(100).get();const items=snapshot.docs.map(doc=>{const v=doc.data();return {input:v.input,validation:v.validation,demo_verdict:null,summary:null,similar:findSimilar(v.input.candidate,existing)};});res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({token:null,historyComplete:false,items}));}catch{res.writeHead(503).end();}return;
  }
  res.writeHead(404).end();
 });
}
