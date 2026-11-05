import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyncCenterController} from './sync-center-controller.js';
import {accountRestartFailureDiagnostic} from './sync-center-ui.js';

function fixture(code = 'account_deleting') {
    let account = {accountId:'fixture-A',accountCredential:'fixture-secret-A',accountDeviceId:'device-A'};
    let generation = 1, responseCode = code, gate = null, casFailure = null;
    const calls = {cas:0};
    const saved = {outbox:[{state:'UNKNOWN',value:'retained'}],project:'retained',local:'retained'};
    class Client {
        async summary() {
            const pending = gate; gate = null;
            if (pending) { pending.entered(); await pending.wait; }
            if (responseCode) throw Object.assign(new Error('fixture'), {code:responseCode,
                status:responseCode==='network_error'?503:responseCode==='invalid_account_credential'?401:410});
            return {account:{id:account.accountId,state:'active'},memberships:[]};
        }
        async devices() { return {devices:[],appDevices:[]}; }
    }
    const storage = {
        getGeneration:()=>generation,
        getAccount:async()=>structuredClone(account),
        async changeAccountIfCurrent(expected, value) {
            calls.cas++;
            if(casFailure)throw typeof casFailure==='string'?new Error(casFailure):casFailure;
            assert.deepEqual(expected,account);
            account=value; generation++;
        }
    };
    const c = createSyncCenterController({config:{enabled:true,endpoint:'https://fixture.invalid'},
        accountRoot:{storage,AccountClient:Client,core:{}},online:()=>true,readPortCredential:()=>null});
    return {c,calls,saved,storage,get account(){return account;},
        holdNext(){let enter,finish;const entered=new Promise(r=>enter=r),wait=new Promise(r=>finish=r);gate={entered:enter,wait};return {entered,finish};},
        choose(value,notify=true){account=value;if(notify)generation++;},
        fail(value){responseCode=value;},casFail(value){casFailure=value;}};
}

for(const code of ['account_deleting','account_deleted','invalid_account_credential'])
for(const readOnly of [true,false])test(`${code}: same binding observation during release (readonly=${readOnly})`,async()=>{
    const f=fixture(code),saved=structuredClone(f.saved);
    await f.c.load({readOnly:true});
    const hold=f.holdNext(),release=f.c.releaseDeletedAccount();await hold.entered;
    // A real read returns a fresh Account object, without changing identity or generation.
    assert((await f.c.load({readOnly})).restartAccount);
    hold.finish();await release;
    assert.equal(f.calls.cas,1);assert.equal(f.account,null);assert.deepEqual(f.saved,saved);
    assert.deepEqual(f.c.getRestartDiagnostic(),{stage:'released',code:null,status:code==='invalid_account_credential'?401:410,
        generationMatches:true,bindingMatches:true,casAttempted:true,casSucceeded:true});
});

for(const notify of [true,false])test(`A→B during server confirmation preserves B (generation notification=${notify})`,async()=>{
    const f=fixture();await f.c.load({readOnly:true});
    const hold=f.holdNext(),release=f.c.releaseDeletedAccount();await hold.entered;
    f.choose({accountId:'fixture-B',accountCredential:'fixture-secret-B',accountDeviceId:'device-B'},notify);
    await f.c.load({readOnly:true});hold.finish();await assert.rejects(release);
    assert.equal(f.calls.cas,0);assert.equal(f.account.accountId,'fixture-B');
});

test('same credential but newer generation is rejected',async()=>{
    const f=fixture();await f.c.load({readOnly:true});
    const hold=f.holdNext(),release=f.c.releaseDeletedAccount();await hold.entered;
    f.choose(structuredClone(f.account));await f.c.load({readOnly:true});hold.finish();
    await assert.rejects(release);assert.equal(f.calls.cas,0);assert(f.account);
});

test('generation cancellation during summary retains the precise failure diagnostic',async()=>{
    const f=fixture();await f.c.load({readOnly:true});
    const hold=f.holdNext(),release=f.c.releaseDeletedAccount();await hold.entered;
    f.choose(structuredClone(f.account));f.fail('account_generation_changed');hold.finish();
    await assert.rejects(release,/account_generation_changed/);
    const d=f.c.getRestartDiagnostic();assert.equal(d.stage,'summary');assert.equal(d.generationMatches,false);
    assert.equal(d.code,'account_generation_changed');assert.equal(d.casAttempted,false);assert(f.account);
});

test('same Account but changed credential or Device is rejected',async()=>{
    for(const patch of [{accountCredential:'fixture-secret-replaced'},{accountDeviceId:'device-replaced'}]){
        const f=fixture();await f.c.load({readOnly:true});
        const hold=f.holdNext(),release=f.c.releaseDeletedAccount();await hold.entered;
        f.choose({...f.account,...patch},false);await f.c.load({readOnly:true});hold.finish();
        await assert.rejects(release);assert.equal(f.calls.cas,0);assert(f.account);
    }
});

for(const code of ['network_error','account_request_timeout',null])test(`failed/recovered summary preserves credential (${code})`,async()=>{
    const f=fixture();await f.c.load({readOnly:true});f.fail(code);
    await assert.rejects(f.c.releaseDeletedAccount());assert.equal(f.calls.cas,0);assert(f.account);
});

for(const code of ['account_storage_transaction_failed','account_storage_timeout','untrusted-secret-message'])
test('CAS diagnostic whitelist: '+(code.startsWith('account_')?code:'unknown'),async()=>{
    const f=fixture();await f.c.load({readOnly:true});
    f.casFail(Object.assign(new Error(code),{name:'AccountStorageError',code}));
    await assert.rejects(f.c.releaseDeletedAccount());
    const d=f.c.getRestartDiagnostic();assert.equal(d.stage,'cas');assert.equal(d.casAttempted,true);
    assert.equal(d.casSucceeded,false);assert.equal(d.errorName,'AccountStorageError');
    assert.equal(d.code,code.startsWith('account_')?code:'account_release_failed');
    assert(!JSON.stringify(d).includes('untrusted-secret-message'));assert(f.account);
});

test('active observation supersedes a pending terminal confirmation',async()=>{
    const f=fixture();await f.c.load({readOnly:true});
    const hold=f.holdNext(),release=f.c.releaseDeletedAccount();await hold.entered;
    f.fail(null);await f.c.load({readOnly:true});f.fail('account_deleting');hold.finish();
    await assert.rejects(release);assert.equal(f.calls.cas,0);assert(f.account);
});

test('CAS refusal is propagated without deleting retained data',async()=>{
    const f=fixture(),before=structuredClone(f.saved);await f.c.load({readOnly:true});
    f.casFail('account_identity_changed');await assert.rejects(f.c.releaseDeletedAccount(),/account_identity_changed/);
    assert.equal(f.calls.cas,1);assert(f.account);assert.deepEqual(f.saved,before);
    const d=f.c.getRestartDiagnostic();assert.equal(d.stage,'cas');assert.equal(d.code,'account_identity_changed');
    assert.equal(d.casSucceeded,false);
});

test('failure diagnostics never leak arbitrary messages, codes or properties',()=>{
    const d=accountRestartFailureDiagnostic({message:'secret',restartDiagnostic:{
        stage:'secret',code:'secret',errorName:'secret',status:410,generationMatches:true,
        accountId:'secret',credential:'secret',body:'secret'}});
    assert(!JSON.stringify(d).includes('secret'));
    assert.equal(d.stage,'unknown');assert.equal(d.code,'account_release_failed');
    assert.equal(d.status,410);assert.equal(d.generationMatches,true);
});
