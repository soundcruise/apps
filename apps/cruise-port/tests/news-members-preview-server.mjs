// Isolated NEWS surface from the actual Standard/Pro HTML and CSS. No app boot,
// authentication, Sync, production API or persistence. This is NOT a full-app or
// Pro authentication acceptance test. Drive UI through the connected browser.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root=resolve(import.meta.dirname,'../../..');
const boot=`import {renderNews} from '/apps/cruise-port/news-ui.js?v=1.36.1';
import {CRUISE_APPS_NEWS_ITEMS} from '/apps/cruise-port/news-articles.js?v=1.36.0';
document.querySelectorAll('.port-view').forEach(el=>el.hidden=el.id!=='news-view');
document.querySelector('#news-view .view-kicker').textContent='Cruise Port・隔離'+(location.pathname.includes('pro_')?'Pro':'通常版');
renderNews({items:[...CRUISE_APPS_NEWS_ITEMS,{id:'isolated-normal-news',label:'通常NEWSのリンク確認用',sourceName:'隔離fixture',sourceUrl:'https://example.com/news',category:'acoustic_guitar',publishedAt:'2026-11-18T00:00:00.000Z',displayOrder:0,createdAt:'2026-11-16T00:00:00.000Z',updatedAt:'2026-11-16T00:00:00.000Z',topicKey:'isolated:normal',sourceKind:'media',sourceSafety:'safe',manualReviewStatus:'approved'}],mode:'on',now:Date.parse('2026-11-18T03:00:00Z'),clock:()=>Date.parse('2026-11-18T03:00:00Z')});`;
http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; connect-src 'none'; img-src 'self' data:; style-src 'self'");
 if(u.pathname==='/__members_preview.js'){res.setHeader('Content-Type','text/javascript');res.end(boot);return;}
 const file=resolve(root,'.'+decodeURIComponent(u.pathname));
 if(!file.startsWith(root+'/apps/')){res.writeHead(404).end();return;}
 try{
  let bytes=await readFile(file);
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream';
  if(type==='text/html'){
   if(!['/apps/cruise-port/index.html','/apps/cruise-port/pro_9a3943176561/index.html'].includes(u.pathname)){res.writeHead(404).end();return;}
   bytes=bytes.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script type="module" src="/__members_preview.js"></script></body>');
  }
  res.setHeader('Content-Type',type);res.end(bytes);
 }catch{res.writeHead(404).end();}
}).listen(8786,'127.0.0.1',()=>console.log('Isolated NEWS only: http://127.0.0.1:8786/apps/cruise-port/index.html'));
