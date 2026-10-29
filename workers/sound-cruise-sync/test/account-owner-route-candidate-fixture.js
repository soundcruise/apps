import fs from 'node:fs';
import {createSqliteD1} from './sqlite-d1.js';
import {ownerRouteFixture} from './account-save-routes-fixture.js';
import {createDisposableOwnerRouteCapability,OWNER_CANDIDATE_ROOT} from '../src/account-owner-route-candidate.js';
import {inspectOwnerSchemaCandidate} from '../src/account-owner-schema-candidate.js';
import {DEVICE_PEPPER} from './account-save-transaction-fixture.js';
import {TEST_PRO_PEPPER} from './pro-entitlement-fixture.js';
import {canonicalJson} from '../src/records.js';
import {handleRequest} from '../src/app.js';
import {exactRequestDigest} from '../src/account-credential-lifecycle.js';
export const candidateSQL=fs.readFileSync(new URL('../schema-candidates/0038_owner_route_candidate.sql',import.meta.url),'utf8');
export const candidateStatements=candidateSQL.replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);
// Test-only installer: one batch, exact old schema or exact completed candidate.
export async function installCandidate(db,{failAt=-1}={}){
 if(await inspectOwnerSchemaCandidate(db))return 'already-installed';
 const partial=await db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'sync_owner_route_candidate' OR name IN ('sync_account_operation_leases','sync_account_pointer_fences','sync_account_cutovers','sync_account_two_cycle_history','sync_account_authority_reauthorizations')").all();
 if(partial.results.length)throw Error('partial-schema');
 for(const t of ['sync_account_devices','sync_account_runtime_control','sync_changes']){
  const c=(await db.prepare('PRAGMA table_info('+t+')').all()).results;
  if(c.some(c=>['credential_issued_at','credential_lifecycle_enabled','isolated_request_digest'].includes(c.name)))throw Error('partial-schema');
 }
 const list=candidateStatements.map((s,i)=>db.prepare(i===failAt?'INSERT INTO nonexistent_candidate_table VALUES(1)':s));await db.batch(list);
 if(!await inspectOwnerSchemaCandidate(db))throw Error('migration-readback-unproven');return 'installed';
}
export async function candidateFixture({checkpoint,db:target}={}){
 const old=await ownerRouteFixture({clock:{server:Date.now()}}),db=target||createSqliteD1();
 if(db.raw){let tail=Promise.resolve();db.batch=list=>{const next=tail.then(()=>{db.raw.exec('BEGIN IMMEDIATE');try{const result=list.map(s=>{const p=db.raw.prepare(s.sql),read=/^\s*(SELECT|PRAGMA|WITH)\b/i.test(s.sql)||/\bRETURNING\b/i.test(s.sql);return read?{success:true,results:p.all(...s.values)}:{success:true,meta:{changes:Number(p.run(...s.values).changes)}};});db.raw.exec('COMMIT');return result;}catch(e){db.raw.exec('ROLLBACK');throw e;}});tail=next.catch(()=>{});return next;};}
 await installCandidate(db);
 // Disposable rows only. This is explicit fixture initialization, never migration backfill.
 const tables=old.db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
 const list=[];for(const {name} of tables){const targetCols=(await db.prepare('PRAGMA table_info('+name+')').all()).results.map(c=>c.name);if(!targetCols.length)continue;
  list.push(db.prepare('DELETE FROM '+name));for(const row of old.db.raw.prepare('SELECT * FROM '+name).all()){
   const keys=Object.keys(row).filter(k=>targetCols.includes(k));list.push(db.prepare(`INSERT INTO ${name} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...keys.map(k=>row[k])));
  }
 }await db.batch([db.prepare('PRAGMA defer_foreign_keys=ON'),...list]);
 await db.batch([db.prepare("UPDATE sync_owner_route_candidate SET enabled=1,mode='disposable'"),db.prepare('UPDATE sync_account_devices SET credential_recovery_json=NULL,credential_recovery_until=NULL,operation_fence_revision=1')]);
 const env={SYNC_DB:db,SYNC_ACCOUNT_CREDENTIAL_PEPPER:old.pepper,SYNC_CREDENTIAL_PEPPER:DEVICE_PEPPER,PRO_CREDENTIAL_PEPPER:TEST_PRO_PEPPER,ACCOUNT_ALLOWED_ORIGINS:'https://studio-fixture.invalid',SYNC_OWNER_ROUTE_CANDIDATE:'disposable-v1',SYNC_OWNER_SCHEMA_CANDIDATE:'1',SYNC_RATE_LIMITER:{async limit(){return {success:true};}}};
 const options={db,policy:old.routeOptions.policy,accountId:'A',fixtureOnly:true,credentialTtlMs:60000,recoveryTtlMs:30000,operationLeaseTtlMs:10000,checkpoint};
 const capability=createDisposableOwnerRouteCapability(options),credentials={...old.credentials};
 const row=()=>db.prepare('SELECT * FROM sync_account_devices WHERE id=?').bind(old.account.accountDeviceId).first();
 async function lifecycle(extra={}){const d=await row();return {contractVersion:1,operationId:crypto.randomUUID(),expectedCredentialVersion:d.credential_version,expectedLeaseRevision:d.credential_lease_revision||0,expectedAccountGeneration:7,expectedMembershipGeneration:11,expectedRuntimeGeneration:1,...extra};}
 async function saveRequest(opts){const q=await old.saveRequest(opts),d=await row();q.request.credentialVersion=d.credential_version;q.request.credentialLeaseRevision=d.credential_lease_revision;q.requestDigest=await exactRequestDigest(q.request);return q;}
 async function send(path,input,{extraEnv={},headers={},cap=capability,method='POST',url}={}){
  const req=new Request(url||'https://worker-fixture.invalid'+OWNER_CANDIDATE_ROOT+path,{method,headers:{Origin:'https://studio-fixture.invalid','Content-Type':'application/json',Authorization:credentials.accountAuthorization,'X-Sound-Cruise-App-Authorization':credentials.appAuthorization,'X-Sound-Cruise-Pro-Authorization':credentials.proAuthorization,...headers},...(['GET','HEAD','OPTIONS'].includes(method)?{}:{body:JSON.stringify(input)})});
  const res=await handleRequest(req,{...env,...extraEnv},null,{ownerRouteCandidate:cap});return {status:res.status,body:res.status===204?null:await res.json()};
 }
 async function envelope(opts){const p=await saveRequest(opts),q=p.request;q.localGeneration='reauth-fixture';q.localRevision='a'.repeat(64);
 const e={schemaVersion:2,purpose:'owner-operation-lease-envelope-v2',request:q,authority:{generation:q.localGeneration,controlEpoch:1,fenceEpoch:2,pointer:{activeGeneration:q.localGeneration,pointerEpoch:2,publication:{kind:'isolated-reauthorization'}},headRevision:'fixture-head',baseDigest:q.localRevision,keyRevision:1},accountDigest:'b'.repeat(64),accountManifestDigest:'c'.repeat(64),reauthorizationReceiptDigest:'d'.repeat(64),consumer:{schemaVersion:1,key:'isolated-consumer',owner:'port',id:'port-bpm-fixture-v1',epoch:1,authorityGeneration:q.localGeneration,pointerEpoch:2,transitionId:'123e4567-e89b-42d3-a456-426614174000',publicationDigest:'f'.repeat(64),readOnly:true}};
 const found=await db.prepare('SELECT * FROM sync_account_pointer_fences WHERE account_id=? AND device_id=? AND dataset_id=?').bind(q.accountId,q.accountDeviceId,q.datasetId).first();if(!found)await db.prepare("INSERT INTO sync_account_pointer_fences(account_id,device_id,dataset_id,phase,revision,pointer_digest,consumer_json) VALUES(?,?,?,'open',1,?,?)").bind(q.accountId,q.accountDeviceId,q.datasetId,await exactRequestDigest(e.authority.pointer),canonicalJson(e.consumer)).run();return e;}
 async function operation(path,e,lease,opts){return send('operation/'+path,{envelope:e,envelopeDigest:await exactRequestDigest(e),...(lease?{lease}:{})},opts);}
 return {old,db,env,options,capability,credentials,row,lifecycle,saveRequest,send,envelope,operation,binding:old.binding,adopt(result){credentials.accountAuthorization='Bearer '+result.body.credential;},dispose(){old.dispose();if(!target)db.close();}};
}
export async function installBase(db){const src=createSqliteD1();try{const rows=src.raw.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all();for(const r of rows)await db.prepare(r.sql).run();}finally{src.close();}}
export async function copyDisposableRows(source,db){const tables=source.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all(),list=[];
 for(const {name} of tables){const columns=(await db.prepare('PRAGMA table_info('+name+')').all()).results.map(c=>c.name);if(!columns.length)throw Error('fixture-schema-missing:'+name);list.push(db.prepare('DELETE FROM '+name));
  for(const row of source.raw.prepare('SELECT * FROM '+name).all()){const keys=Object.keys(row);if(keys.some(k=>!columns.includes(k)))throw Error('fixture-column-missing:'+name);list.push(db.prepare(`INSERT INTO ${name} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...Object.values(row)));}}
 await db.batch([db.prepare('PRAGMA defer_foreign_keys=ON'),...list]);await db.prepare("UPDATE sync_owner_route_candidate SET enabled=1,mode='disposable'").run();
}
