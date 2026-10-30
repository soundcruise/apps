// Child process fixture runner. stdin contains SYNTHETIC key material; never logged.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{createHash}from'node:crypto';
import {boot,model,H,makeOwner,headers}from'../test/studio-schema-fixture.mjs';
import {createStudioSemanticValidator}from'./studio-backup-semantic.mjs';
let input='';for await(const c of process.stdin)input+=c;const s=JSON.parse(input),key=Buffer.from(s.key,'base64');input='';
const{restore,verify}=await import(path.join(s.core,'adapter.mjs'));const{createBindingTarget,createBindingSource}=await import(path.join(s.core,'binding-provider.mjs'));
const x=await boot(s.targetProfile??'production102',s.state,{initialize:false});let result;
try{
 const semantic=createStudioSemanticValidator({expectedBaseProfile:'production102',expectedJournalHash:s.journalHash,validateProject:model().validateProject});
 const identity=s.identity,realBucket=x.bucket,bucket=s.failR2?{...realBucket,list:(...a)=>realBucket.list(...a),head:(...a)=>realBucket.head(...a),get:(...a)=>realBucket.get(...a),put:async()=>{throw Error('synthetic-r2-failure')},createMultipartUpload:async()=>{throw Error('synthetic-r2-failure')}}:realBucket;
 const target=createBindingTarget({db:x.db,bucket,identity,claimRoot:s.claims,stagingDirectory:s.staging,semanticValidator:semantic});
 if(s.reconcile){
  const j=JSON.parse(fs.readFileSync(s.journal+'/RESTORE.json'));assert.equal(j.state,'RESTORED');assert.equal(j.manifestHash,s.manifestHash);assert.deepEqual(j.identity,identity);assert.deepEqual(j.scope,s.scope);
  const manifest=await verify({directory:s.directory,scope:s.scope,keyHandle:async()=>Buffer.from(key),manifestHash:s.manifestHash});
  assert.deepEqual(await target.inventory(),manifest.inventory);await semantic(x.db);let index=0;const chain=createHash('sha256');
  for await(const rows of target.pages()){const bytes=Buffer.from(JSON.stringify(rows));assert.equal(H(bytes.toString()),manifest.pages[index++].plainHash);chain.update(bytes);}
  assert.equal(index,manifest.pages.length);assert.equal(chain.digest('hex'),manifest.plainDigest);result={state:'RECONCILED_RESTORED',manifestHash:s.manifestHash};
 }else result=await restore({directory:s.directory,scope:s.scope,keyHandle:async()=>Buffer.from(key),manifestHash:s.manifestHash,target,approvedTarget:identity,forbiddenTargets:[s.scope],journalDirectory:s.journal});
 const schema=await x.db.prepare("SELECT count(*) n FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'_cf_KV'").first();assert.equal(schema.n,185);
 const apps=(await x.db.prepare('SELECT app_id,revision,payload_hash FROM sync_records ORDER BY app_id').all()).results;assert.equal(apps.length,5);
 assert.equal((await x.db.prepare('SELECT generation FROM sync_accounts WHERE id=?').bind(s.normalB).first()).generation,1);
 const proof=await x.db.prepare('SELECT * FROM studio_document_recovery_proofs WHERE operation_id=?').bind(s.proofId).first();assert.deepEqual(proof,s.proof);
 assert.equal(H(Buffer.from(await (await realBucket.get('fixture-r2-small')).arrayBuffer()).toString()),s.smallHash);
 assert.equal((await realBucket.head('fixture-r2-large')).size,6*1024*1024);
 const pending=await x.db.prepare('SELECT * FROM studio_document_pending WHERE operation_id=?').bind(s.pending.row.operation_id).first(),chunks=(await x.db.prepare('SELECT * FROM studio_document_chunks WHERE operation_id=? ORDER BY ordinal').bind(s.pending.row.operation_id).all()).results;
 assert.deepEqual(pending,s.pending.row);assert.deepEqual(chunks,s.pending.chunks);assert.equal((await x.db.prepare('SELECT count(*) n FROM studio_document_receipts WHERE operation_id=?').bind(s.pending.row.operation_id).first()).n,0);
 if(s.continuePending){const owner=await makeOwner(x.db),h=headers({credential:s.pending.credential},{token:s.pending.proToken});await owner.upload(h,s.pending.row.operation_id,1,s.pending.remaining);result.continuedRevision=(await owner.commit(h,s.pending.row.operation_id)).revision;}
 result={...result,profile:'production102',schemaObjects:schema.n,legacyApps:apps.length,proofPreserved:true,normalBPreserved:true};
 fs.writeFileSync(s.result,JSON.stringify(result,null,2));if(!s.dropAck)console.log(JSON.stringify({state:result.state,profile:result.profile}));
}catch(e){result={state:'FAILED',message:e.message};try{result.journal=JSON.parse(fs.readFileSync(s.journal+'/RESTORE.json'));result.appliedTables=(await x.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='studio_document_pending'").first()).n;}catch{}fs.writeFileSync(s.result,JSON.stringify(result,null,2));console.log(JSON.stringify({state:result.state,message:result.message}));process.exitCode=1;}
finally{key.fill(0);await x.mf.dispose();}
