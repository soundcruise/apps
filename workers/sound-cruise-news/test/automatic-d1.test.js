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
test('local workerd D1: bounded formal transaction commits once and counts its own decision ID',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'news-automatic-d1-'));
 const local=await localDatabase(dir);
 try{
  const x=await automaticCase({db:local.db});
  assert.equal(await publishAutomatic(x.s,x.source,x.registry,at,pepper),0);
  assert.equal(await publishAutomatic(x.s,x.source,x.registry,at,pepper,{enabled:true}),1);
  assert.equal(await publishAutomatic(x.s,x.source,x.registry,at,pepper,{enabled:true}),0);
  assert.equal((await local.db.prepare("SELECT COUNT(*) n FROM news_decision_ledger WHERE actor_type='automatic_policy'").first()).n,1);
  assert.equal((await local.db.prepare("SELECT COUNT(*) n FROM news_shadow_evaluations").first()).n,5);
 }finally{await local.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
