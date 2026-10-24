import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seedAccountOwnerContext} from './account-owner-context-fixture.js';
import {readAccountOwnerContext,handleIsolatedAccountOwnerContext} from '../src/account-owner-context.js';
import {createAccountCredential,accountCredentialVerifier} from '../src/account-crypto.js';
import {inspectAccountCredentialReadOnly} from '../src/account-auth.js';
const ids=()=>({requestId:crypto.randomUUID(),challenge:crypto.randomUUID()});
async function setup(t){const x=await seedAccountOwnerContext();t.after(()=>x.db.close());return {...x,read:(options={})=>readAccountOwnerContext({db:x.db,pepper:x.pepper,authorization:'Bearer '+x.account.accountCredential,...ids(),now:()=>100000,...options})};}
test('owner single primary SELECT supplies exact server identity; read-only and no credential expiry invention',async t=>{
 const x=await setup(t),before=x.db.raw.prepare('SELECT * FROM sync_account_devices').all(),queries=[];
 const db={withSession(mode){assert.equal(mode,'first-primary');return {prepare(sql){queries.push(sql);return x.db.prepare(sql);}};}};
 const r=await x.read({db});assert(r.ok);assert.equal(queries.length,1);assert.match(queries[0],/JOIN sync_account_memberships/);assert.equal(r.identity.accountGeneration,7);assert.equal(r.identity.membershipGeneration,11);assert.equal(r.identity.credentialVersion,3);
 assert.equal(r.freshness.expiresAt,105000);assert.equal(r.freshness.remainingMs,5000);assert.equal(r.credentialExpiresAt,null);assert.equal(r.canWrite,false);
 assert(!JSON.stringify(r).includes(x.account.accountCredential));assert.deepEqual(x.db.raw.prepare('SELECT * FROM sync_account_devices').all(),before);assert.equal(x.db.raw.prepare('SELECT count(*) n FROM sync_account_activity').get().n,0);
});
for(const [name,sql,code] of [
 ['membership generation changed','UPDATE sync_account_memberships SET generation=12',null],
 ['account generation changed','UPDATE sync_accounts SET generation=8',null],
 ['member deleted',"UPDATE sync_account_memberships SET state='deleted',deleted_at=2",'account_owner_identity_unresolved'],
 ['no membership','DELETE FROM sync_membership_device_links; DELETE FROM sync_account_memberships','account_owner_identity_unresolved'],
 ['unlinked','DELETE FROM sync_membership_device_links','account_owner_identity_unresolved'],
 ['app device revoked','UPDATE sync_devices SET revoked_at=2','account_owner_identity_unresolved'],
 ['credential revoked','UPDATE sync_account_devices SET revoked_at=2','account_device_revoked'],
 ['account deleting',"UPDATE sync_accounts SET state='deleting'",'account_deleting'],
 ['QA mismatch',"UPDATE sync_accounts SET admission_provenance='qa'",'account_admission_mismatch'],
 ['read paused','UPDATE sync_account_runtime_control SET account_read_enabled=0','account_owner_read_paused'],
 ['rollout closed',"UPDATE sync_account_runtime_control SET rollout_mode='closed'",'account_owner_read_paused']
])test('owner current state: '+name,async t=>{const x=await setup(t);x.db.raw.exec(sql);const r=await x.read();assert.equal(r.ok,code===null);if(code)assert.equal(r.code,code);else assert.equal(name.startsWith('membership')?r.identity.membershipGeneration:r.identity.accountGeneration,name.startsWith('membership')?12:8);});
test('credential rotation refuses old A and accepts replacement B, same device',async t=>{const x=await setup(t),newToken=createAccountCredential().credential,secret=newToken.split('.')[2],replacement='sca1.'+x.account.accountDeviceId+'.'+secret;
 x.db.raw.prepare('UPDATE sync_account_devices SET credential_verifier=?,credential_version=4').run(await accountCredentialVerifier(replacement,x.pepper));
 assert.equal((await x.read()).code,'invalid_account_credential');const b=await x.read({authorization:'Bearer '+replacement});assert.equal(b.identity.credentialVersion,4);
});
test('query/HMAC latency consumes server budget; rollback/expiry fail closed',async t=>{const x=await setup(t);for(const end of [99999,105000,NaN]){let n=0;assert.equal((await x.read({now:()=>++n===1?100000:end})).code,'account_owner_observation_expired');}});
test('unknown generation/type or absent session never becomes an owner proof',async t=>{const x=await setup(t);assert.equal((await x.read({db:{prepare:x.db.prepare}})).code,'account_owner_unavailable');
 for(const field of ['generation','membership_generation','credential_version','runtime_generation'])for(const bad of [null,0,'7',1.5,Number.MAX_SAFE_INTEGER+1]){
  const db={withSession:()=>({prepare:sql=>({bind:id=>({first:async()=>({...await x.db.prepare(sql).bind(id).first(),[field]:bad})})})})};assert.equal((await x.read({db})).ok,false);
 }
});
test('new contract leaves existing read-only authentication contract intact',async t=>{const x=await setup(t),r=await inspectAccountCredentialReadOnly(x.db,'Bearer '+x.account.accountCredential,x.pepper);assert.equal(r.identity.accountId,'A');assert.equal(r.identity.generation,7);});
test('isolated HTTP validates method/query, no-store and fixed request binding; product routing absent',async t=>{
 const x=await setup(t),p=ids(),url='https://account-provider.invalid/v2/accounts/owner-context?'+new URLSearchParams(p),request=new Request(url,{headers:{Authorization:'Bearer '+x.account.accountCredential}});
 const r=await handleIsolatedAccountOwnerContext(request,{db:x.db,pepper:x.pepper,now:()=>100000});assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal((await r.json()).challenge,p.challenge);
 for(const bad of [url+'&challenge='+p.challenge,url+'&extra=1',url.replace(p.challenge,'invalid')])assert.equal((await handleIsolatedAccountOwnerContext(new Request(bad),x)).status,400);
 for(const file of ['account-app.js','app.js','index.js'])assert(!readFileSync(new URL('../src/'+file,import.meta.url),'utf8').includes('account-owner-context'));
});
