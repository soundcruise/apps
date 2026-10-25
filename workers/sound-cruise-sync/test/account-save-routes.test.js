import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {ownerRouteFixture} from './account-save-routes-fixture.js';
import {createIsolatedAccountSaveRoutes} from '../src/account-save-routes-isolated.js';
import {createIsolatedWriterPolicy} from '../src/writer-fence.js';
import {exactRequestDigest} from '../src/account-credential-lifecycle.js';
const ok=r=>assert.equal(r.status,200,JSON.stringify(r));
async function setup(t,options){const s=await ownerRouteFixture(options);t.after(()=>s.dispose());return s;}
async function renew(s){const start=await s.send('credential/renew/begin',s.lifecycle());ok(start);assert.equal(start.body.state,'renewing');const finish=await s.send('credential/renew/finish',s.lifecycle({transitionId:start.body.transitionId}));ok(finish);s.adopt(finish);return finish;}
test('authenticated issuance from existing owner credential, save, renew and current-credential historical reconcile',async t=>{
 const s=await setup(t);s.unissue();const old=s.credentials.accountAuthorization,issue=await s.send('credential/issue',s.lifecycle());ok(issue);assert(issue.body.credential);assert.equal(s.row().credential_version,4);s.adopt(issue);
 const q=await s.saveRequest();ok(await s.send('save',q));const before=s.state();ok(await s.send('reconcile',{binding:s.binding(q)}));assert.equal(s.state(),before);
 const finish=await renew(s);assert.equal(finish.body.credentialVersion,5);ok(await s.send('reconcile',{binding:s.binding(q)}));ok(await s.send('save',await s.saveRequest({revision:1,bpm:155})));
 assert.notEqual(s.credentials.accountAuthorization,old);assert(!JSON.stringify(s.row()).includes(finish.body.credential));
});
for(const name of ['forged','tampered','missing','expired','revoked','renewing','failed','generation','member','unbound','no-pro','no-writer','identity','dataset','digest'])test('save route rejects '+name+' without record/revision/receipt mutation',async t=>{
 const s=await setup(t),q=await s.saveRequest(),headers={};
 if(name==='forged')headers.Authorization='Bearer sca1.'+crypto.randomUUID()+'.'+'a'.repeat(43);
 if(name==='tampered')headers.Authorization=s.credentials.accountAuthorization.slice(0,-1)+(s.credentials.accountAuthorization.endsWith('a')?'b':'a');
 if(name==='missing')headers.Authorization='';if(name==='expired')s.clock.server=160000;
 if(name==='revoked')s.db.raw.exec('UPDATE sync_account_devices SET revoked_at=1');
 if(name==='renewing'||name==='failed')s.db.raw.exec("UPDATE sync_account_devices SET credential_lifecycle='"+(name==='failed'?'renewal-failed':'renewing')+"'");
 if(name==='generation')s.db.raw.exec('UPDATE sync_accounts SET generation=generation+1');
 if(name==='member')s.db.raw.exec('UPDATE sync_account_memberships SET generation=generation+1');
 if(name==='unbound')s.db.raw.exec('UPDATE sync_account_devices SET credential_account_generation=NULL');
 if(name==='no-pro')headers['X-Sound-Cruise-Pro-Authorization']='';if(name==='no-writer')headers['X-Sound-Cruise-App-Authorization']='';
 if(name==='identity')q.request.accountId='B';if(name==='dataset')q.request.datasetId='other-user';
 if(name!=='digest')q.requestDigest=await exactRequestDigest(q.request);else q.requestDigest='f'.repeat(64);
 const before=s.state(),r=await s.send('save',q,{headers});assert.notEqual(r.status,200);assert.equal(s.state(),before);assert.equal(r.body.receipt,undefined);
});
for(const stage of ['before-transaction','before-history-read'])test('owner revocation at final '+stage+' denies despite earlier authentication',async t=>{
 let change=false;const s=await setup(t,{checkpoint:p=>{if(change&&p===stage)s.db.raw.exec('UPDATE sync_account_devices SET revoked_at=1');}}),q=await s.saveRequest();
 if(stage==='before-history-read')ok(await s.send('save',q));change=true;const before=s.state(),r=await s.send(stage==='before-transaction'?'save':'reconcile',stage==='before-transaction'?q:{binding:s.binding(q)});assert.notEqual(r.status,200);assert.equal(s.state(),before);assert.equal(r.body.receipt,undefined);
});
test('history permission differs from save permission and Pro; successful history is strictly readonly',async t=>{
 const s=await setup(t),q=await s.saveRequest();ok(await s.send('save',q));s.db.raw.exec('UPDATE sync_account_runtime_control SET account_save_enabled=0');const before=s.db.raw.prepare('SELECT * FROM sync_account_devices').all(),data=s.state();
 ok(await s.send('reconcile',{binding:s.binding(q)},{headers:{'X-Sound-Cruise-Pro-Authorization':''}}));assert.deepEqual(s.db.raw.prepare('SELECT * FROM sync_account_devices').all(),before);assert.equal(s.state(),data);
 assert.notEqual((await s.send('save',await s.saveRequest({revision:1}))).status,200);s.db.raw.exec('UPDATE sync_account_runtime_control SET account_history_enabled=0');assert.notEqual((await s.send('reconcile',{binding:s.binding(q)})).status,200);
});
test('receipt tamper, missing receipt, wrong Account/device/member/dataset cannot leak history',async t=>{
 const s=await setup(t),q=await s.saveRequest();ok(await s.send('save',q));const before=s.state();
 for(const field of ['accountId','accountDeviceId','membershipId','datasetId']){const p=structuredClone(q);p.request[field]='foreign';p.requestDigest=await exactRequestDigest(p.request);const r=await s.send('reconcile',{binding:s.binding(p)});assert.notEqual(r.status,200);assert.equal(r.body.receipt,undefined);}
 const bad=s.binding(q);bad.requestDigest='e'.repeat(64);assert.notEqual((await s.send('reconcile',{binding:bad})).status,200);assert.equal(s.state(),before);
 s.db.raw.exec("UPDATE sync_changes SET isolated_request_digest='bad'");assert.notEqual((await s.send('reconcile',{binding:s.binding(q)})).status,200);s.db.raw.exec('DELETE FROM sync_changes');assert.notEqual((await s.send('reconcile',{binding:s.binding(q)})).status,200);
});
test('CAS/replay/different digest reject and never issue another receipt',async t=>{
 const s=await setup(t),q=await s.saveRequest(),other=await s.saveRequest({bpm:151});ok(await s.send('save',q));const before=s.state();assert.notEqual((await s.send('save',q)).status,200);assert.notEqual((await s.send('save',other)).status,200);
 q.request.operation.payload.value.bpm=159;q.requestDigest=await exactRequestDigest(q.request);assert.notEqual((await s.send('save',q)).status,200);assert.equal(s.state(),before);
});
test('renewing and failed state are durable through reopen; failure/replay never resumes old save',async t=>{
 const s=await setup(t),begin=await s.send('credential/renew/begin',s.lifecycle());ok(begin);assert.notEqual((await s.send('save',await s.saveRequest())).status,200);
 const reopened=createIsolatedAccountSaveRoutes(s.routeOptions);t.after(()=>reopened.dispose());const failed=await s.send('credential/renew/fail',s.lifecycle({transitionId:begin.body.transitionId}),{owner:reopened});ok(failed);assert.equal(s.row().credential_lifecycle,'renewal-failed');
 assert.notEqual((await s.send('credential/renew/finish',s.lifecycle({transitionId:begin.body.transitionId}))).status,200);assert.notEqual((await s.send('save',await s.saveRequest())).status,200);
});
for(const condition of ['revoke','expiry','generation','member','clock-rollback'])test('renew finish cannot revive credential after '+condition,async t=>{
 let change=false;const s=await setup(t,{checkpoint:(p,d)=>{if(change&&p==='before-lifecycle-transaction'&&d.action==='finish-renew'){
  if(condition==='revoke')s.db.raw.exec('UPDATE sync_account_devices SET revoked_at=1');if(condition==='expiry')s.clock.server=160000;if(condition==='generation')s.db.raw.exec('UPDATE sync_accounts SET generation=generation+1');if(condition==='member')s.db.raw.exec('UPDATE sync_account_memberships SET generation=generation+1');if(condition==='clock-rollback')s.clock.server=90000;
 }}});const start=await s.send('credential/renew/begin',s.lifecycle());ok(start);change=true;const before=s.row().credential_verifier,r=await s.send('credential/renew/finish',s.lifecycle({transitionId:start.body.transitionId}));assert.notEqual(r.status,200);assert.equal(r.body.credential,undefined);assert.equal(s.row().credential_verifier,before);assert.equal(s.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);
});
test('renew versus revoke ordering and two renew attempts are serialized without resurrection',async t=>{
 const s=await setup(t),q=s.lifecycle(),both=await Promise.all([s.send('credential/renew/begin',q),s.send('credential/renew/begin',{...q,operationId:crypto.randomUUID()})]);assert.equal(both.filter(r=>r.status===200).length,1);
 ok(await s.send('credential/revoke',s.lifecycle()));assert.equal(s.row().credential_lifecycle,'revoked');assert.notEqual((await s.send('credential/renew/finish',s.lifecycle({transitionId:q.operationId}))).status,200);
});
test('unknown/partial enrollment is preserved and requires owner recovery; operation ledger prevents replay',async t=>{
 const s=await setup(t);s.unissue();s.db.raw.exec('UPDATE sync_account_devices SET credential_expires_at=160000');assert.notEqual((await s.send('credential/issue',s.lifecycle())).status,200);assert.equal(s.row().credential_expires_at,160000);assert.equal(s.row().credential_issued_at,null);
 s.unissue();const q=s.lifecycle(),issue=await s.send('credential/issue',q);ok(issue);s.adopt(issue);assert.notEqual((await s.send('credential/renew/begin',s.lifecycle({operationId:q.operationId}))).status,200);
});
test('backend clock floor/observed expiry survives reopen and browser timestamp is not accepted',async t=>{
 const s=await setup(t),q=await s.saveRequest();q.browserNow=1;assert.equal((await s.send('save',q)).status,400);s.clock.server=160000;assert.notEqual((await s.send('credential/renew/begin',s.lifecycle())).status,200);assert.equal(s.row().credential_lifecycle,'expired');
 s.clock.server=100000;const owner=createIsolatedAccountSaveRoutes(s.routeOptions);t.after(()=>owner.dispose());assert.notEqual((await s.send('save',await s.saveRequest(),{owner})).status,200);
});
test('no product route or boot installs isolated save/lifecycle; malformed and oversized requests deny',async t=>{
 for(const f of ['app.js','account-app.js'])assert.doesNotMatch(await readFile(new URL('../src/'+f,import.meta.url),'utf8'),/account-save-routes-isolated|account-credential-lifecycle/);
 const s=await setup(t);for(const request of [new Request('https://x/__isolated/account/v1/save'),new Request('https://x/__isolated/account/v1/save',{method:'POST',headers:{Authorization:s.credentials.accountAuthorization,'Content-Type':'application/json'},body:'x'.repeat(40001)})])assert.notEqual((await s.routes.handle(request)).status,200);
});
test('late authenticated A response cannot damage current B; B save/history/next save continue',async t=>{
 let entered,release;const arrived=new Promise(r=>entered=r),s=await setup(t,{checkpoint:async(p,d)=>{if(p==='before-transaction'){entered();await new Promise(r=>release=r);}}}),qa=await s.saveRequest(),late=s.send('save',qa);await arrived;
 const b=await s.otherAccount('B');t.after(()=>b.owner.dispose());s.db.raw.prepare("UPDATE sync_account_devices SET credential_account_generation=7,credential_membership_id='member-B',credential_membership_generation=11,credential_operations_json='{}' WHERE account_id='B'").run();
 const routes=createIsolatedAccountSaveRoutes({...s.routeOptions,policy:createIsolatedWriterPolicy('B'),checkpoint:async()=>{}});t.after(()=>routes.dispose());const request=await b.request(),qb={request,requestDigest:await exactRequestDigest(request)};
 ok(await s.send('save',qb,{owner:routes,auth:b.credentials}));const before=s.state();s.db.raw.prepare('UPDATE sync_account_devices SET revoked_at=1 WHERE account_id=?').run('A');release();assert.notEqual((await late).status,200);assert.equal(s.state(),before);
 ok(await s.send('reconcile',{binding:s.binding(qb)},{owner:routes,auth:b.credentials}));const next=await b.request({revision:1,bpm:158});ok(await s.send('save',{request:next,requestDigest:await exactRequestDigest(next)},{owner:routes,auth:b.credentials}));assert.notEqual((await s.send('reconcile',{binding:s.binding(qb)})).status,200);
});
test('renew commit ACK loss never returns a secret or reissues to old credential',async t=>{
 let lose=false;const s=await setup(t,{checkpoint:(p,d)=>{if(lose&&p==='after-lifecycle-transaction'&&d.action==='finish-renew')throw Error('ack-lost');}}),begin=await s.send('credential/renew/begin',s.lifecycle());ok(begin);const q=s.lifecycle({transitionId:begin.body.transitionId}),old=s.row().credential_verifier;lose=true;const result=await s.send('credential/renew/finish',q);assert.notEqual(result.status,200);assert.equal(result.body.credential,undefined);assert.notEqual(s.row().credential_verifier,old);const row=s.row();assert.notEqual((await s.send('credential/renew/finish',q)).status,200);assert.deepEqual(s.row(),row);
});
for(const [field,value] of [['credential_clock_floor',null],['credential_clock_floor',-1],['credential_lease_revision',0],['credential_lease_revision',null]])test('unknown '+field+' '+value+' is not silently repaired by lifecycle or save',async t=>{
 const s=await setup(t);s.db.raw.prepare('UPDATE sync_account_devices SET '+field+'=?').run(value);const before=s.row();assert.notEqual((await s.send('credential/renew/begin',s.lifecycle())).status,200);assert.deepEqual(s.row(),before);
 assert.notEqual((await s.send('save',await s.saveRequest())).status,200);assert.deepEqual(s.row(),before);
});
test('only completely unissued lease permits initializing an absent clock floor',async t=>{
 const s=await setup(t);s.unissue();s.db.raw.exec('UPDATE sync_account_devices SET credential_clock_floor=NULL');const result=await s.send('credential/issue',s.lifecycle());ok(result);assert.equal(s.row().credential_clock_floor,100000);s.adopt(result);ok(await s.send('save',await s.saveRequest()));
});
