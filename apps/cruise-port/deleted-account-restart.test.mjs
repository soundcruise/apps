import test from 'node:test';import assert from 'node:assert/strict';import {createSyncCenterController} from './sync-center-controller.js';
function fixture(code='account_deleting'){
 let account={accountId:'A',accountCredential:'fixture-A'},generation=1,error=code;
 const saved={outbox:[{state:'UNKNOWN',operationId:'retain'}],project:'retain-project',raw:'retain-local'};
 class Client{async summary(){if(error)throw Object.assign(Error('fixture'),{code:error,status:error==='network_error'?503:error==='invalid_account_credential'?401:410});return {account:{id:account.accountId,state:'active'},memberships:[]};}async devices(){return {devices:[],appDevices:[]};}}
 const storage={getGeneration:()=>generation,getAccount:async()=>account,changeAccountIfCurrent:async(expected,value)=>{assert.equal(account,expected);account=value;generation++;}};
 const c=createSyncCenterController({config:{enabled:true,endpoint:'https://fixture.invalid'},accountRoot:{storage,AccountClient:Client,core:{}},online:()=>true,readPortCredential:()=>null});
 return {c,saved,get account(){return account;},choose(a){account=a;generation++;},fail(code){error=code;}};
}
for(const code of ['account_deleting','account_deleted'])for(const readOnly of [true,false])test(code+' explicit restart readonly='+readOnly,async()=>{const f=fixture(code),before=JSON.stringify(f.saved);assert((await f.c.load({readOnly})).deletedAccount);assert(f.account);await f.c.releaseDeletedAccount();assert.equal(f.account,null);assert.equal((await f.c.loadLocal()).kind,'unset');assert.equal(JSON.stringify(f.saved),before);});
test('a network error never unlocks credential release',async()=>{const f=fixture('network_error');await f.c.load({readOnly:true});await assert.rejects(()=>f.c.releaseDeletedAccount());assert(f.account);});
test('old A diagnosis cannot remove B',async()=>{const f=fixture();await f.c.load({readOnly:true});f.choose({accountId:'B',accountCredential:'fixture-B'});await assert.rejects(()=>f.c.releaseDeletedAccount());assert.equal(f.account.accountId,'B');});
test('a failed or recovered revalidation preserves the old binding',async()=>{for(const code of ['network_error',null]){const f=fixture();await f.c.load({readOnly:true});f.fail(code);await assert.rejects(()=>f.c.releaseDeletedAccount());assert(f.account);}});

test('server-invalid credential allows explicit restart without claiming deletion',async()=>{const f=fixture('invalid_account_credential');const p=await f.c.load({readOnly:true});assert(p.restartAccount);assert.equal(p.deletedAccount,false);await f.c.releaseDeletedAccount();assert.equal(f.account,null);});
