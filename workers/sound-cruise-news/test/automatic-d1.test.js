import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localDatabase} from '../scripts/local-db.mjs';
import {automaticCase,at} from './automatic-case.js';
import {pepper} from './helpers.js';
import {publishAutomatic} from '../src/automatic.js';
// D1 has a stricter SQL-expression depth limit and counts trigger changes in
// meta.changes. Exercise the actual workerd/D1 transaction, not just Node SQLite.
for(const scope of ['ikebe','shimamura','ikebe-signature-4'])test('local workerd D1: formal transaction, SQL/binding limits and idempotency: '+scope,async()=>{
 const sourceId=scope.startsWith('shimamura')?'shimamura':'ikebe';
 const dir=await mkdtemp(join(tmpdir(),'news-automatic-d1-'));
 const local=await localDatabase(dir);
 try{
  const x=await automaticCase({db:local.db,sourceId,signatureModels:scope.endsWith('signature-4')});
  if(sourceId==='shimamura')await x.add({id:'different-ikebe',sourceId:'ikebe',model:'Studio H210 Limited'});
  const prepare=local.db.prepare.bind(local.db);let metrics;
  x.s.db={prepare:sql=>{const stmt=prepare(sql);if(!sql.startsWith('INSERT INTO news_decision_ledger'))return stmt;return {bind:(...args)=>{
   metrics={sqlBytes:new TextEncoder().encode(sql).length,parameters:args.length,boundDataBytes:args.reduce((n,v)=>n+new TextEncoder().encode(String(v??'')).length,0),largestBoundString:Math.max(...args.filter(a=>typeof a==='string').map(a=>new TextEncoder().encode(a).length))};
   assert(metrics.sqlBytes<100000);assert(metrics.parameters<=100);assert(metrics.largestBoundString<=2000000);
   return stmt.bind(...args);
  }};}};
  assert.equal(await publishAutomatic(x.s,x.source,x.registry,at,pepper),0);
  assert.equal(await publishAutomatic(x.s,x.source,x.registry,at,pepper,{enabled:true}),1);
  assert.equal(await publishAutomatic(x.s,x.source,x.registry,at,pepper,{enabled:true}),0);
  assert.equal((await local.db.prepare("SELECT COUNT(*) n FROM news_decision_ledger WHERE actor_type='automatic_policy'").first()).n,1);
  assert.equal((await local.db.prepare("SELECT COUNT(*) n FROM news_shadow_evaluations").first()).n,5);
  assert(metrics);console.log(JSON.stringify({event:'automatic_d1_sql_metrics',sourceId,scope,...metrics}));
 }finally{await local.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
