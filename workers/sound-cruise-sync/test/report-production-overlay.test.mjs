import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const baseline=process.env.REPORT_DEPLOYED_BASELINE;
test('frozen deployed artifact retains public/OFF/rejection responses with report overlay', {skip:!baseline},async()=>{
 const require=createRequire(process.env.REPORT_TEST_RUNTIME||new URL('../package.json',import.meta.url));const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
 const main=path.join(baseline,'studio-canary-entry.js'),factory=path.resolve(import.meta.dirname,'../src/report-release-entry.js');
 const legacy=await build({stdin:{contents:`export {default} from ${JSON.stringify(main)};export * from ${JSON.stringify(main)};`,resolveDir:baseline},bundle:true,write:false,format:'esm',platform:'browser'});
 const overlay=await build({stdin:{contents:`import existing from ${JSON.stringify(main)};import {createReportWorker} from ${JSON.stringify(factory)};export * from ${JSON.stringify(main)};export default createReportWorker(existing);`,resolveDir:baseline},bundle:true,write:false,format:'esm',platform:'browser'});
 const options={d1Databases:{SYNC_DB:'synthetic-baseline-only'},modules:true,compatibilityDate:'2026-09-01',bindings:{STUDIO_REPORTS_ENABLED:'false',REPORT_AI_ENABLED:'false',REPORT_RETENTION_ENABLED:'false',STUDIO_RELEASE_ROUTE_ENABLED:'false',AI_SUPPORT_MODE:'off',ALLOWED_ORIGINS:'https://soundcruise.jp'},outboundService:()=>{throw Error('network forbidden')}};
 const a=new Miniflare(convertV4MiniflareOptions({...options,script:legacy.outputFiles[0].text})),b=new Miniflare(convertV4MiniflareOptions({...options,script:overlay.outputFiles[0].text}));try{
 for(const worker of [a,b]){const db=await worker.getD1Database('SYNC_DB');await db.prepare('CREATE TABLE studio_document_control(id INTEGER PRIMARY KEY,enabled INTEGER)').run();await db.prepare('INSERT INTO studio_document_control VALUES (1,0)').run()}
 for(const [p,method] of [['/health','GET'],['/v2/studio/document','POST'],['/isolated/studio/document','POST'],['/v2/pro-auth/session','POST'],['/v2/accounts/summary','POST'],['/v1/sync','POST'],['/v2/ai-support/chat','POST']]){
 const input={method,headers:{Origin:'https://soundcruise.jp','Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})};const x=await a.dispatchFetch('https://worker.fixture'+p,input),y=await b.dispatchFetch('https://worker.fixture'+p,input);assert.equal(y.status,x.status,p);assert(x.status<500,p+' needs a complete synthetic contract');const xt=await x.text(),yt=await y.text();assert.equal(yt,xt,p);console.log('preserved',method,p,x.status)
 }
 assert.equal((await b.dispatchFetch('https://worker.fixture/v1/reports')).status,423);
 }finally{await a.dispose();await b.dispose()}
});
