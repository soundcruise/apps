import http from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validateInput,assessEvidence} from '../engine.mjs';
import {findSimilar} from '../phase2e/similarity.mjs';
import {existing} from '../phase2e/existing.mjs';

// Isolated local preview only. No real Operator API, D1 or cloud credentials.
export function projectUntrusted(input,now){
 const result=validateInput(input);if(!result.valid)throw Error('invalid_candidate');
 const candidate=result.data.candidate;
 const validation=assessEvidence(candidate,[],now);
 if(validation.ready!==false||validation.formalFacts!==false)throw Error('invalid_validation');
 return {input:result.data,validation,summary:null,similar:findSimilar(candidate,existing),demo_verdict:null};
}
export function fictionalInput(){
 const input=JSON.parse(readFileSync(new URL('../fixtures/dot-report-14.json',import.meta.url),'utf8'))[0];
 const c=input.candidate;c.candidate_id='fictional-moon-guitar-m1-001';c.idempotency_key='phase4a-isolated-moon-guitar';c.entity={manufacturer:'Moon Guitar',brand:null,product:'M1',models:['M1'],version:null,product_type:null};c.event={type:'announcement',qualifiers:[],market:null};c.sources=[];c.claims=[];c.recommendation={level:'unknown',rationale:'架空の配送検証',requires_human_verification:true};c.unresolved_questions=['架空候補。原記事・公開日・根拠はありません'];c.duplicate_candidates=[];c.dedupe_status='unchecked';for(const k of Object.keys(c.dates))c.dates[k]={value:null,precision:'unknown',timezone:null,evidence_ids:[]};
 return input;
}
const page='<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>NEWS Operator — 隔離プレビュー</title><link rel="stylesheet" href="/review.css"><link rel="stylesheet" href="/style.css"><script defer src="/app.js"></script></head><body><main><header><p class="eyebrow">CRUISE · 隔離プレビュー</p><h1>NEWS Review</h1><p>ローカルの架空データです。Access認証・実Firestore・本番NEWSには接続していません。</p></header><details open><summary>Dot候補の確認（読み取り専用）</summary><p id="summary">読込中</p><section id="items"></section></details></main></body></html>';
export function createPreview(input=fictionalInput()){
 const item=projectUntrusted(input,new Date().toISOString());
 return http.createServer((req,res)=>{
  const host=`127.0.0.1:${res.socket.localPort}`;res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");if(req.headers.host!==host){res.writeHead(403).end();return;}
  const u=new URL(req.url,`http://${host}`);
  if(req.method==='GET'&&u.pathname==='/api/review'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify({readOnly:true,historyComplete:false,items:[item]}));return;}
  if(req.method==='GET'&&u.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(page);return;}
  const files={'/review.css':['../../operator-ui/review.css','text/css; charset=utf-8'],'/style.css':['../phase2e/public/style.css','text/css; charset=utf-8'],'/app.js':['../phase2e/public/app.js','text/javascript; charset=utf-8']};
  if(req.method==='GET'&&files[u.pathname]){const [f,t]=files[u.pathname];res.writeHead(200,{'Content-Type':t}).end(readFileSync(new URL(f,import.meta.url)));return;}
  res.writeHead(404).end();
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const s=createPreview();s.listen(0,'127.0.0.1',()=>console.log(`Local-only preview: http://127.0.0.1:${s.address().port}/`));}
