import {handleOperatorRequest} from './operator-worker.js';
import {initDotReview} from '../operator-ui/dot-review.js';

const page='<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dot候補レビュー — Cruise NEWS</title><link rel="stylesheet" href="/review.css"><script defer src="/dot-review.js"></script></head><body><main><header><p class="eyebrow">CRUISE · 隔離レビュー</p><h1>Dot候補を確認</h1><p>読み取り専用。AI推奨は人間の掲載判断ではありません。</p></header><details id="dot-review" data-show-disabled="true" open><summary>Dot候補（読み取り専用）</summary><p>既存NEWS全状態との重複照合は未完了です。</p><p id="dot-status" role="status" aria-live="polite">接続を確認しています…</p><section id="dot-items" aria-label="Dot候補"></section></details></main></body></html>';
const css=':root{font-family:system-ui,sans-serif;color:#16243b;background:#f4f7fb}*{box-sizing:border-box}body{margin:0}main{max-width:960px;margin:auto;padding:clamp(16px,4vw,40px)}header,details,.dot-card{background:white;border:1px solid #dce4ef;border-radius:12px;padding:20px;margin-bottom:16px}h1{font-size:clamp(1.5rem,4vw,2rem)}.eyebrow{color:#526681;font-size:.8rem}summary{cursor:pointer;font-weight:bold}button{font:inherit;display:block;margin:12px 0;padding:12px;max-width:100%;overflow-wrap:anywhere;border:1px solid #aabbd0;border-radius:8px;background:#fff;color:#16243b}p,a{overflow-wrap:anywhere;line-height:1.6}';
const assets={fetch:async request=>{const path=new URL(request.url).pathname;const files={'/': [page,'text/html; charset=utf-8'],'/index.html':[page,'text/html; charset=utf-8'],'/review.css':[css,'text/css; charset=utf-8'],'/dot-review.js':[`(${initDotReview.toString()})();`,'text/javascript; charset=utf-8']};const entry=files[path];return entry?new Response(entry[0],{headers:{'Content-Type':entry[1]}}):new Response(null,{status:404});}};

// Separate Worker entry point. The only assets are a read-only review shell and its script.
export async function handleIsolatedDotRequest(request,env,now=Date.now(),options={}) {
 const path=new URL(request.url).pathname;
 if(request.method!=='GET'||!(['/','/index.html','/review.css','/dot-review.js','/api/dot-capabilities','/api/dot-candidates'].includes(path)||/^\/api\/dot-candidates\/[A-Za-z0-9_-]{1,128}$/.test(path)))return Response.json({error:'not_found'},{status:404,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 // Do not accept caller-provided D1 or asset bindings even if attached by mistake.
 return handleOperatorRequest(request,{...env,NEWS_DB:{},OPERATOR_ASSETS:assets},now,options);
}
export default {fetch:(request,env)=>handleIsolatedDotRequest(request,env)};
