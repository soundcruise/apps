import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {candidateFixture,installCandidate,candidateSQL} from './account-owner-route-candidate-fixture.js';
import {createSqliteD1} from './sqlite-d1.js';
import {inspectOwnerSchemaCandidate,OWNER_SCHEMA_SHA256} from '../src/account-owner-schema-candidate.js';
import {OWNER_CANDIDATE_ROOT,createDisposableOwnerRouteCapability} from '../src/account-owner-route-candidate.js';
import entrypoint from '../src/index.js';
import {exactRequestDigest} from '../src/account-credential-lifecycle.js';
import {createRenewalRecoverySecret,renewalRecoveryCommitment,renewalDigest} from '../src/account-renewal-recovery.js';
const snapshot=async db=>JSON.stringify((await db.prepare('SELECT * FROM sync_records').all()).results);
test('candidate DDL digest, atomic installation, duplicate no-op and NULL/default-OFF preservation',async t=>{
 const db=createSqliteD1();t.after(()=>db.close());db.raw.exec("ALTER TABLE sync_account_devices ADD COLUMN future_owner_field TEXT");
 assert.equal(crypto.createHash('sha256').update(candidateSQL).digest('hex'),OWNER_SCHEMA_SHA256);
 await assert.rejects(()=>installCandidate(db,{failAt:10}));assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM pragma_table_info('sync_account_devices') WHERE name='credential_issued_at'").get().n,0);
 assert.equal(await installCandidate(db),'installed');const schema=db.raw.prepare("SELECT sql FROM sqlite_master ORDER BY name").all();assert.equal(await installCandidate(db),'already-installed');assert.deepEqual(db.raw.prepare("SELECT sql FROM sqlite_master ORDER BY name").all(),schema);
 assert.equal((await db.prepare('SELECT * FROM sync_owner_route_candidate').first()).enabled,0);assert.equal((await db.prepare('SELECT account_save_enabled FROM sync_account_runtime_control').first()).account_save_enabled,0);
 assert(db.raw.prepare("SELECT name FROM pragma_table_info('sync_account_devices') WHERE name='future_owner_field'").get());
});
for(const fault of ['partial-column','partial-table','unknown-version'])test('schema refuses '+fault+' without repair',async t=>{
 const db=createSqliteD1();t.after(()=>db.close());if(fault==='partial-column')db.raw.exec('ALTER TABLE sync_account_devices ADD COLUMN credential_issued_at TEXT');
 else if(fault==='partial-table')db.raw.exec('CREATE TABLE sync_account_two_cycle_history(unknown TEXT)');
 else{await installCandidate(db);db.raw.exec('PRAGMA ignore_check_constraints=ON;UPDATE sync_owner_route_candidate SET schema_version=9');}
 const before=db.raw.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all();await assert.rejects(()=>installCandidate(db));assert.deepEqual(db.raw.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all(),before);assert.equal(await inspectOwnerSchemaCandidate(db),false);
});
test('production index cannot open route with flags, forged env capability, headers or missing DB',async()=>{
 let touches=0;const env={SYNC_OWNER_ROUTE_CANDIDATE:'disposable-v1',SYNC_OWNER_SCHEMA_CANDIDATE:'1',ownerRouteCandidate:{},SYNC_DB:new Proxy({},{get(){touches++;throw Error('unexpected-db');}})};
 const r=await entrypoint.fetch(new Request('https://worker.invalid'+OWNER_CANDIDATE_ROOT+'save',{method:'POST',body:'{}'}),env,{});assert.equal(r.status,404);assert.equal(touches,0);
 assert.equal((await entrypoint.fetch(new Request('https://worker.invalid/health'),env,{})).status,200);
});
for(const [name,extraEnv,cap] of [['absent',{SYNC_OWNER_ROUTE_CANDIDATE:undefined}],['true',{SYNC_OWNER_ROUTE_CANDIDATE:'true'}],['boolean',{SYNC_OWNER_ROUTE_CANDIDATE:true}],['wrong-schema',{SYNC_OWNER_SCHEMA_CANDIDATE:'2'}],['forged',{},{}],['missing-cap',{},null]])test('OFF/refusal '+name,async t=>{
 const s=await candidateFixture();t.after(()=>s.dispose());const before=await snapshot(s.db);assert.equal((await s.operation('lease',await s.envelope(),null,{extraEnv,...(cap!==undefined?{cap}:{})})).status,404);assert.equal(await snapshot(s.db),before);
});
for(const [name,extraEnv] of [['db',{SYNC_DB:null}],['pepper',{SYNC_ACCOUNT_CREDENTIAL_PEPPER:'bad'}],['limiter',{SYNC_RATE_LIMITER:null}],['limit',{SYNC_RATE_LIMITER:{limit:async()=>({success:false})}}]])test('bindings/rate refuses '+name,async t=>{
 const s=await candidateFixture();t.after(()=>s.dispose());const before=await snapshot(s.db);assert.notEqual((await s.operation('lease',await s.envelope(),null,{extraEnv})).status,200);assert.equal(await snapshot(s.db),before);
});
for(const sql of ["UPDATE sync_owner_route_candidate SET enabled=0,mode='disabled'","DROP TABLE sync_account_two_cycle_history","UPDATE sync_account_runtime_control SET account_history_enabled=0","UPDATE sync_account_devices SET credential_expires_at=1","UPDATE sync_account_devices SET revoked_at=1","UPDATE sync_account_devices SET credential_membership_generation=99","UPDATE sync_account_memberships SET authority_state='paused'","UPDATE pro_credentials SET revoked_at=1"])test('schema/lifecycle/Pro/writer failure '+sql,async t=>{
 const s=await candidateFixture();t.after(()=>s.dispose());const e=await s.envelope(),before=await snapshot(s.db);s.db.raw.exec(sql);assert.notEqual((await s.operation('lease',e)).status,200);assert.equal(await snapshot(s.db),before);assert.equal(s.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);
});
for(const headers of [{Origin:'https://evil.invalid'},{Authorization:'Bearer bad'},{'X-Sound-Cruise-App-Authorization':'Bearer bad'},{'X-Sound-Cruise-Pro-Authorization':'Bearer bad'}])test('transport/credential refusal '+JSON.stringify(headers),async t=>{
 const s=await candidateFixture();t.after(()=>s.dispose());assert.notEqual((await s.operation('lease',await s.envelope(),null,{headers})).status,200);assert.equal(s.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);
});
test('authenticated lease/save route uses same repository; CAS/replay/tamper refusal',async t=>{
 const s=await candidateFixture();t.after(()=>s.dispose());const e=await s.envelope(),p={request:e.request,requestDigest:await exactRequestDigest(e.request)};
 assert.notEqual((await s.send('save',p)).status,200);const lease=await s.operation('lease',e);assert.equal(lease.status,200,JSON.stringify(lease));assert.equal((await s.operation('save',e,lease.body.lease)).status,200);assert.equal((await s.operation('reconcile',e,lease.body.lease)).status,200);
 assert.notEqual((await s.operation('save',e,lease.body.lease)).status,200);assert.notEqual((await s.operation('lease',await s.envelope({revision:0,bpm:170}))).status,200);
 const changed=structuredClone(e);changed.request.operation.payload.value.bpm=180;assert.notEqual((await s.operation('save',changed,lease.body.lease)).status,200);
 const bad=structuredClone(lease.body.lease);bad.fencingRevision++;assert.notEqual((await s.operation('reconcile',e,bad)).status,200);assert.equal(s.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,1);
});
test('Renewal finish ACK loss uses old proof recovery then current history; stale token never saves',async t=>{
 let lose=false;const s=await candidateFixture({checkpoint(p,d){if(lose&&p==='after-lifecycle-transaction'&&d.action==='finish-renew')throw Error('ack-lost');}});t.after(()=>s.dispose());
 const e=await s.envelope(),p={request:e.request,requestDigest:await exactRequestDigest(e.request)},lease=await s.operation('lease',e);assert.equal(lease.status,200,JSON.stringify(lease));assert.equal((await s.operation('save',e,lease.body.lease)).status,200);const begin=await s.send('credential/renew/begin',await s.lifecycle());assert.equal(begin.status,200,JSON.stringify(begin));
 const request=await s.lifecycle({transitionId:begin.body.transitionId}),secret=createRenewalRecoverySecret(),identity={accountId:'A',accountDeviceId:s.old.account.accountDeviceId,membershipId:'member-A'},digest=await renewalDigest(request,identity,await renewalRecoveryCommitment(secret));
 const headers={'X-Sound-Cruise-Renewal-Recovery':secret,'X-Sound-Cruise-Renewal-Digest':digest};lose=true;assert.notEqual((await s.send('credential/renew/finish',request,{headers})).status,200);
 const recover=await s.send('credential/renew/reconcile',{operationId:request.operationId,requestDigest:digest},{headers});assert.equal(recover.status,200,JSON.stringify(recover));const stale=await s.operation('lease',await s.envelope({revision:1}));assert.equal(stale.status,409);assert.equal(stale.body.stopReason,'credential-unverified');s.adopt(recover);assert.equal((await s.send('reconcile',{binding:s.binding(p)})).status,200);
});
for(const mutate of ["UPDATE pro_credentials SET revoked_at=1","UPDATE sync_owner_route_candidate SET epoch=epoch+1","UPDATE sync_account_runtime_control SET account_save_enabled=0"])test('final transaction fence aborts late change '+mutate,async t=>{
 let s;let trigger=false;s=await candidateFixture({checkpoint(p){if(trigger&&p==='before-transaction')s.db.raw.exec(mutate);}});t.after(()=>s.dispose());const e=await s.envelope(),lease=await s.operation('lease',e);assert.equal(lease.status,200,JSON.stringify(lease));trigger=true;assert.notEqual((await s.operation('save',e,lease.body.lease)).status,200);assert.equal(s.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);
});
test('lifecycle final writer fence rejects Pro revoked after preflight',async t=>{
 let s;s=await candidateFixture({checkpoint(p){if(p==='before-lifecycle-transaction')s.db.raw.exec('UPDATE pro_credentials SET revoked_at=1');}});t.after(()=>s.dispose());const before=await s.row();assert.notEqual((await s.send('credential/renew/begin',await s.lifecycle())).status,200);const after=await s.row();assert.equal(after.credential_lifecycle,before.credential_lifecycle);assert.equal(after.credential_operations_json,before.credential_operations_json);
});
test('capability has explicit TTL bounds, no guessed production defaults',()=>{assert.throws(()=>createDisposableOwnerRouteCapability({}));});
test('explicit enrollment and revocation retain ordinary Account verifier boundary',async t=>{
 const s=await candidateFixture();t.after(()=>s.dispose());s.db.raw.exec(`UPDATE sync_account_devices SET credential_issued_at=NULL,credential_expires_at=NULL,credential_lease_revision=NULL,credential_lifecycle=NULL,credential_clock_floor=NULL,credential_account_generation=NULL,credential_membership_id=NULL,credential_membership_generation=NULL,credential_transition_id=NULL,credential_operations_json=NULL`);
 const issue=await s.send('credential/issue',await s.lifecycle());assert.equal(issue.status,200,JSON.stringify(issue));s.adopt(issue);const revoked=await s.send('credential/revoke',await s.lifecycle());assert.equal(revoked.status,200,JSON.stringify(revoked));assert.equal((await s.row()).credential_lifecycle,'revoked');assert.notEqual((await s.send('credential/issue',await s.lifecycle())).status,200);
});
test('legacy authenticated Account reader unchanged across additive schema; no credentials inferred',async t=>{
 const {ownerRouteFixture}=await import('./account-save-routes-fixture.js');const {inspectAccountCredentialReadOnly}=await import('../src/account-auth.js');const source=await ownerRouteFixture();t.after(()=>source.dispose());const db=createSqliteD1();t.after(()=>db.close());
 // Preserve full old rows including an unknown column; no new-column seed/backfill.
 db.raw.exec('ALTER TABLE sync_account_devices ADD COLUMN future_owner_field TEXT');
 for(const name of ['sync_accounts','sync_account_devices']){const cols=db.raw.prepare('PRAGMA table_info('+name+')').all().map(c=>c.name);for(const row of source.db.raw.prepare('SELECT * FROM '+name).all()){const keys=Object.keys(row).filter(k=>cols.includes(k));db.raw.prepare(`INSERT INTO ${name} (${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));}}
 db.raw.exec("UPDATE sync_account_devices SET future_owner_field='unknown-preserved'");const before=db.raw.prepare('SELECT * FROM sync_account_devices').all(),auth=await inspectAccountCredentialReadOnly(db,source.credentials.accountAuthorization,source.pepper);assert(auth?.identity);
 await installCandidate(db);assert.deepEqual(await inspectAccountCredentialReadOnly(db,source.credentials.accountAuthorization,source.pepper),auth);const after=db.raw.prepare('SELECT * FROM sync_account_devices').all();for(const k of Object.keys(before[0]))assert.equal(after[0][k],before[0][k]);assert.equal(after[0].credential_issued_at,null);assert.equal(after[0].operation_fence_revision,null);
});
for(const kind of ['timeout','revocation','expiry','runtime-generation','account-generation'])test('leased save '+kind+' denies without receipt/data loss',async t=>{
 let s;s=await candidateFixture({checkpoint(p){if(p==='before-transaction'){
 if(kind==='timeout')throw Error('timeout');
 const sql={revocation:'UPDATE sync_account_devices SET revoked_at=1',expiry:'UPDATE sync_account_devices SET credential_expires_at=1','runtime-generation':'UPDATE sync_account_runtime_control SET generation=generation+1','account-generation':'UPDATE sync_accounts SET generation=generation+1'}[kind];if(sql)s.db.raw.exec(sql);
 }}});t.after(()=>s.dispose());const e=await s.envelope(),l=await s.operation('lease',e);assert.equal(l.status,200,JSON.stringify(l));assert.notEqual((await s.operation('save',e,l.body.lease)).status,200);assert.equal(s.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);assert.equal(s.db.raw.prepare('SELECT state FROM sync_account_operation_leases').get().state,'issued');
});
for(const [field,value] of [['accountId','B'],['membershipId','member-B'],['datasetId','user-B'],['accountDeviceId','123e4567-e89b-42d3-a456-426614174111'],['membershipGeneration',12],['accountGeneration',8]])test('client cannot substitute owner '+field,async t=>{
 const s=await candidateFixture();t.after(()=>s.dispose());const e=await s.envelope();e.request[field]=value;assert.notEqual((await s.operation('lease',e)).status,200);assert.equal(s.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);assert.equal(s.db.raw.prepare('SELECT COUNT(*) n FROM sync_account_operation_leases').get().n,0);
});
test('valid leased request remains usable after foreign Account and invalid replay rejection',async t=>{
 const s=await candidateFixture();t.after(()=>s.dispose());const e=await s.envelope(),bad=structuredClone(e);bad.request.accountId='old-A';assert.notEqual((await s.operation('lease',bad)).status,200);const lease=await s.operation('lease',e);assert.equal(lease.status,200);assert.equal((await s.operation('save',e,lease.body.lease)).status,200);assert.equal((await s.operation('reconcile',e,lease.body.lease)).status,200);
});
test('strict method/CORS/size refuses without data writes',async t=>{
 const s=await candidateFixture();t.after(()=>s.dispose());assert.equal((await s.send('operation/lease',{}, {method:'GET'})).status,405);
 assert.equal((await s.send('operation/lease',{}, {method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}})).status,204);
 assert.equal((await s.send('operation/lease',{}, {method:'OPTIONS',headers:{'Access-Control-Request-Method':'DELETE'}})).status,403);
 assert.equal((await s.send('operation/lease',{padding:'x'.repeat(40001)})).status,400);assert.equal(s.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);
});
