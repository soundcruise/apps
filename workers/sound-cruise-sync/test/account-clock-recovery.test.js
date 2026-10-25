import test from 'node:test';import assert from 'node:assert/strict';
import {clockRecoveryFixture} from './account-clock-recovery-fixture.js';
import {createIsolatedAccountSaveRoutes} from '../src/account-save-routes-isolated.js';
import {createRenewalRecoverySecret} from '../src/account-renewal-recovery.js';
const ok=r=>assert.equal(r.status,200,JSON.stringify({...r,body:r.body?.credential?{...r.body,credential:'[redacted]'}:r.body}));
async function setup(t,options){const s=await clockRecoveryFixture(options);t.after(()=>s.dispose());return s;}
for(const first of ['save','reconcile'])test(first+' expiry observation is durable across clock rollback / new instance',async t=>{
 const s=await setup(t),q=await s.saveRequest();ok(await s.send('save',q));const before=s.state();s.clock.server=160000;assert.notEqual((await s.send(first,first==='save'?await s.saveRequest({revision:1}):{binding:s.binding(q)})).status,200);assert.equal(s.row().credential_lifecycle,'expired');assert.equal(s.row().credential_clock_floor,160000);
 s.clock.server=100000;const reopened=createIsolatedAccountSaveRoutes(s.routeOptions);t.after(()=>reopened.dispose());for(const path of ['save','reconcile'])assert.notEqual((await s.send(path,path==='save'?await s.saveRequest({revision:1}):{binding:s.binding(q)},{owner:reopened})).status,200);assert.equal(s.state(),before);
});
test('expiry at atomic history read persists even if readback ACK is lost',async t=>{
 let expire=false;const s=await setup(t,{checkpoint:p=>{if(expire&&p==='before-history-read')s.clock.server=160000;}}),q=await s.saveRequest();ok(await s.send('save',q));expire=true;
 const prepare=s.db.prepare.bind(s.db);s.db.prepare=sql=>{const st=prepare(sql),bind=st.bind;st.bind=(...v)=>{const b=bind.apply(st,v);if(sql.includes('AS receipt_json')){const all=b.all.bind(b);b.all=async()=>{await all();throw Error('response-lost');};}return b;};return st;};
 assert.notEqual((await s.send('reconcile',{binding:s.binding(q)})).status,200);assert.equal(s.row().credential_lifecycle,'expired');s.clock.server=100000;assert.notEqual((await s.send('save',await s.saveRequest({revision:1}))).status,200);
});
test('trusted first owner observation is not erased by rollback before its persistence step',async t=>{
 const s=await setup(t),q=await s.saveRequest();ok(await s.send('save',q));s.clock.server=160000;const prep=s.db.prepare.bind(s.db);let once=true;
 s.db.prepare=sql=>{const st=prep(sql),bind=st.bind;st.bind=(...v)=>{const b=bind.apply(st,v);if(once&&sql.includes('AS owner_now')){const first=b.first.bind(b);b.first=async()=>{const row=await first();s.clock.server=100000;once=false;return row;};}return b;};return st;};
 assert.notEqual((await s.send('reconcile',{binding:s.binding(q)})).status,200);assert.equal(s.row().credential_lifecycle,'expired');assert.equal(s.row().credential_clock_floor,160000);
});
test('two owner instances and concurrent history requests never lower floor or revive expiry',async t=>{
 const s=await setup(t),q=await s.saveRequest();ok(await s.send('save',q));const other=createIsolatedAccountSaveRoutes(s.routeOptions);t.after(()=>other.dispose());s.clock.server=159999;ok(await s.send('reconcile',{binding:s.binding(q)}));s.clock.server=160000;
 const results=await Promise.all([s.send('reconcile',{binding:s.binding(q)}),s.send('reconcile',{binding:s.binding(q)},{owner:other})]);assert(results.every(r=>r.status!==200));assert.equal(s.row().credential_clock_floor,160000);s.clock.server=159999;assert.notEqual((await s.send('reconcile',{binding:s.binding(q)})).status,200);
});
test('renewal ACK loss recovers exact existing token idempotently; new credential saves and reads old receipt',async t=>{
 let lost=false;const s=await setup(t,{checkpoint:(p,d)=>{if(lost&&p==='after-lifecycle-transaction'&&d.action==='finish-renew')throw Error('ack-lost');}}),q=await s.saveRequest();ok(await s.send('save',q));const ticket=await s.prepare();lost=true;assert.notEqual((await s.finish(ticket)).status,200);const row=s.row();assert.equal(row.credential_version,4);assert.equal(row.credential_lifecycle,'active');
 const a=await s.recover(ticket);ok(a);const b=await s.recover(ticket);ok(b);assert.equal(a.body.credential,b.body.credential);assert.deepEqual(a.body.receipt,b.body.receipt);assert.equal(s.row().credential_version,4);assert(!JSON.stringify(row).includes(a.body.credential));assert(!JSON.stringify(a.body.receipt).includes(a.body.credential));
 s.adopt(a);ok(await s.send('save',await s.saveRequest({revision:1,bpm:155})));ok(await s.send('reconcile',{binding:s.binding(q)}));
});
for(const kind of ['wrong-secret','wrong-digest','wrong-operation','wrong-account','wrong-device','tamper-cipher','unknown-floor','unknown-lease','unknown-expiry','unknown-deadline','deadline-outside-lease','generation','member','revoke','expiry','recovery-timeout','renewing-next'])test('renew recovery rejects '+kind+' without reissue or dataset mutation',async t=>{
 const s=await setup(t),ticket=await s.prepare(),finish=await s.finish(ticket);ok(finish);const t2={...ticket,request:{...ticket.request}},overrides={};
 if(kind==='wrong-secret')t2.secret=createRenewalRecoverySecret();if(kind==='wrong-digest')t2.requestDigest='f'.repeat(64);if(kind==='wrong-operation')t2.request.operationId=crypto.randomUUID();
 if(kind==='wrong-account'||kind==='wrong-device')overrides.headers={Authorization:'Bearer sca1.'+crypto.randomUUID()+'.'+'a'.repeat(43),'X-Sound-Cruise-Renewal-Recovery':ticket.secret};
 if(kind==='tamper-cipher'){const packet=JSON.parse(s.row().credential_recovery_json);packet.sealed.ciphertext='a'.repeat(43);s.db.raw.prepare('UPDATE sync_account_devices SET credential_recovery_json=?').run(JSON.stringify(packet));}
 if(kind==='unknown-floor')s.db.raw.exec('UPDATE sync_account_devices SET credential_clock_floor=NULL');if(kind==='unknown-lease')s.db.raw.exec('UPDATE sync_account_devices SET credential_lease_revision=0');
 if(kind==='unknown-expiry')s.db.raw.exec("UPDATE sync_account_devices SET credential_expires_at='unknown'");if(kind==='unknown-deadline')s.db.raw.exec("UPDATE sync_account_devices SET credential_recovery_until='unknown'");if(kind==='deadline-outside-lease')s.db.raw.exec('UPDATE sync_account_devices SET credential_recovery_until=credential_expires_at+1');
 if(kind==='generation')s.db.raw.exec('UPDATE sync_accounts SET generation=generation+1');if(kind==='member')s.db.raw.exec('UPDATE sync_account_memberships SET generation=generation+1');if(kind==='revoke')s.db.raw.exec('UPDATE sync_account_devices SET revoked_at=1');
 if(kind==='expiry')s.clock.server=160000;if(kind==='recovery-timeout')s.clock.server=130000;if(kind==='renewing-next'){s.adopt(finish);ok(await s.send('credential/renew/begin',s.lifecycle()));}
 const data=s.state(),version=s.row().credential_version,r=await s.recover(t2,overrides);assert.notEqual(r.status,200);assert.equal(r.body.credential,undefined);assert.equal(s.row().credential_version,version);assert.equal(s.state(),data);
});
test('renewal rollback / missing result stays unproven and never auto-replays',async t=>{
 let abort=true;const s=await setup(t,{checkpoint:(p,d)=>{if(abort&&p==='before-lifecycle-transaction'&&d.action==='finish-renew')throw Error('sql-timeout');}}),ticket=await s.prepare(),before=s.row().credential_verifier;assert.notEqual((await s.finish(ticket)).status,200);assert.equal(s.row().credential_verifier,before);assert.equal(s.row().credential_lifecycle,'renewing');assert.equal(s.row().credential_recovery_json,null);assert.notEqual((await s.recover(ticket)).status,200);assert.equal(s.row().credential_version,3);abort=false;
});
test('different operation from same old revision cannot rotate again; identical result lookup is readonly for datasets',async t=>{
 const s=await setup(t),ticket=await s.prepare();ok(await s.finish(ticket));const row=s.row(),data=s.state();assert.notEqual((await s.finish({...ticket,request:{...ticket.request,operationId:crypto.randomUUID()}})).status,200);ok(await s.recover(ticket));assert.equal(s.row().credential_version,row.credential_version);assert.equal(s.row().credential_expires_at,row.credential_expires_at);assert.equal(s.state(),data);
});
test('a subsequent completed secret rotation invalidates old recovery and does not extend old lease',async t=>{
 const s=await setup(t),old=await s.prepare(),finished=await s.finish(old);ok(finished);s.adopt(finished);const next=await s.prepare();ok(await s.finish(next));const row=s.row();assert.equal(row.credential_version,5);assert.notEqual((await s.recover(old)).status,200);assert.deepEqual(s.row(),row);ok(await s.recover(next));
});
test('real SQL abort after renewal update rolls back secret/cipher/receipt together',async t=>{
 const s=await setup(t),ticket=await s.prepare(),before=s.row(),data=s.state(),batch=s.db.batch.bind(s.db);s.db.batch=statements=>batch([...statements,s.db.prepare('UPDATE sync_datasets SET record_count=-1')]);assert.notEqual((await s.finish(ticket)).status,200);assert.equal(s.row().credential_version,before.credential_version);assert.equal(s.row().credential_verifier,before.credential_verifier);assert.equal(s.row().credential_recovery_json,null);assert.equal(s.state(),data);assert.notEqual((await s.recover(ticket)).status,200);
});
test('revocation after decrypt but before final owner read prevents secret delivery',async t=>{
 let revoke=false;const s=await setup(t,{checkpoint:p=>{if(revoke&&p==='after-renewal-recovery-decrypt')s.db.raw.exec("UPDATE sync_account_devices SET revoked_at=1 WHERE account_id='A'");}}),ticket=await s.prepare();ok(await s.finish(ticket));revoke=true;const r=await s.recover(ticket);assert.notEqual(r.status,200);assert.equal(r.body.credential,undefined);assert.equal(s.row().credential_version,4);
});
