/* Reuse the existing native product fixture verbatim; no additional Worker/schema. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const out=process.env.STUDIO_CLIENT_OUTPUT;assert(out&&out.startsWith('/private/tmp/'),'disposable local output required');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(here,'port-product-sync.browser.mjs'),'utf8');
const start=source.indexOf(" await check('public Studio restores"),helpers=source.indexOf(" const A=await profile('Port-A');"),end=source.indexOf(" for(const id of ['pitch','fretboard','rhythm','chord'])await check('native '+id+' first connection",helpers);
assert(start>0&&helpers>start&&end>helpers,'existing product fixture shape changed');
let run=source.slice(0,start)+source.slice(helpers,end)+`
 await(await import(${JSON.stringify(path.join(here,process.env.STUDIO_ATTENTION_SCENARIO==='stale-report'?'stale-report-product.acceptance.mjs':'sync-attention-product.acceptance.mjs'))})).acceptSyncAttentionProduct({A,B,appSource,port,nativeRuntime,openNativeApp,editApp,syncApp,go,ready,offlineLabels,result,OUT,check,db,network});
 assert.deepEqual(errors,[]);result.status='PASS';result.realCredentialsUsed=false;
}catch(error){result.status='FAIL';result.error=String(error.stack||error);console.error(result.error);process.exitCode=1;}
finally{fs.writeFileSync(OUT+'/ATTENTION-PRODUCT.json',JSON.stringify(result,null,2));for(const context of contexts)await context.close();await browser?.close();await mf?.dispose();stopBuildService();}
process.exit(result.status==='PASS'?0:1);`;
run=run.replace(/const W=.*?,OUT=/,`const W=${JSON.stringify(root)},OUT=`).replace("from './fixtures/port-pc-profile.mjs'",`from '${here}/fixtures/port-pc-profile.mjs'`);
// Every production-shaped URL is intercepted by the same local fixture. The
// native standalone Pro app requires its normal origin; no real request escapes.
run=run.replaceAll('https://studio.fixture.invalid','https://soundcruise.jp').replace('entry=workerWithoutProject(entry,src);',"entry=workerWithoutProject(entry,src).replaceAll('https://studio.fixture.invalid','https://soundcruise.jp');");
const file=path.join(out,'attention-product-run.mjs');fs.writeFileSync(file,run);execFileSync(process.execPath,[file],{stdio:'inherit',env:process.env});
