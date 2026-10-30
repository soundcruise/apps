import http from 'node:http';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {readReview} from '../phase3f/firestore-store.mjs';
import {findSimilar} from '../phase2e/similarity.mjs';
import {existing} from '../phase2e/existing.mjs';
const candidateId='fictional-moon-guitar-m1-001',receiptKey='dot-drive-fictional-001-moon-guitar-m1';
const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
const sha=x=>createHash('sha256').update(x).digest('hex');
export function createReadOnlyServer(db){
 return http.createServer(async(req,res)=>{
  const host=`127.0.0.1:${res.socket.localPort}`;
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  if(req.headers.host!==host){res.writeHead(403).end();return;}
  const u=new URL(req.url,`http://${host}`);
  if(req.method==='GET'&&files[u.pathname]){const [f,t]=files[u.pathname];res.writeHead(200,{'Content-Type':t});res.end(readFileSync(new URL('../phase2e/public/'+f,import.meta.url)));return;}
  if(req.method==='GET'&&u.pathname==='/api/review'){
   try{
    const [review,receipt,rep,con]=await Promise.all([readReview(db,candidateId),db.collection('receipts').doc(sha(receiptKey)).get(),db.collection('attempts').doc(sha('phase3h-replay-20261030-001')).get(),db.collection('attempts').doc(sha('phase3h-conflict-20261030-001')).get()]);
    if(!review||!receipt.exists||receipt.data().candidateId!==candidateId||receipt.data().idempotencyKey!==receiptKey||!rep.exists||!con.exists||rep.data().status!=='replay'||con.data().status!=='conflict')throw Error('incomplete');
    const item={...review,summary:null,similar:findSimilar(review.input.candidate,existing),delivery:{firstReceived:receipt.data().createdAt,status:'created',replay:rep.data().status,conflict:con.data().status}};
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify({readOnly:true,historyComplete:false,items:[item]}));
   }catch{res.writeHead(503,{'Content-Type':'application/json'}).end('{"error":"unavailable"}');}return;
  }
  res.writeHead(404).end();
 });
}
export function connectIsolated(){
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.GOOGLE_APPLICATION_CREDENTIALS)throw Error('unexpected_auth_override');
 const h=process.env.HOME,env={...process.env,CLOUDSDK_PYTHON:h+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',CLOUDSDK_CONFIG:h+'/.codex/news-drive-isolation-tools/config'},g=h+'/.codex/news-drive-isolation-tools/google-cloud-sdk/bin/gcloud',sa='cruise-news-drive-test-reader@cruise-news-drive-isolation.iam.gserviceaccount.com';
 const token=execFileSync(g,['auth','print-access-token','--impersonate-service-account='+sa,'--scopes=https://www.googleapis.com/auth/cloud-platform','--quiet'],{env,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 const auth=new OAuth2Client();auth.setCredentials({access_token:token,expiry_date:Date.now()+600000});return new Firestore({projectId:'cruise-news-drive-isolation',auth,preferRest:true});
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url){const db=connectIsolated(),server=createReadOnlyServer(db);server.listen(0,'127.0.0.1',()=>console.log(`Isolated review: http://127.0.0.1:${server.address().port}/`));for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>server.close(async()=>{await db.terminate();process.exit(0)}));}
