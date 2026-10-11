import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWriteReadiness as evaluate, createOperationBoundary, createProOperationResolver } from './port-write-readiness.mjs';
const base = () => ({ locksAvailable:true, repositoryProtocol:1, writerProtocol:1, generation:1, accountGeneration:1,
    accountId:'A', repositoryEpoch:'epoch', accountConfigured:true, appDeviceKnown:true, membershipActive:true,
    syncActivated:true, online:true, pro:{allowed:true,generation:1,validUntil:10000,credentialIdentity:'fixture'} });
const compatible = { allWritersCompatible:true };
for (const action of ['saveBpm','saveAdvanced','applyPreset','createPreset','deletePreset','queueSync','pushCloud'])
    test(`default ${action} remains blocked even with valid Pro/Account`,()=>assert.equal(evaluate(base(),action).reason,'old-build-unknown'));
for (const [patch, reason] of [[{locksAvailable:false},'locks-unavailable'],[{repositoryProtocol:2},'protocol-mismatch'],
    [{writerProtocol:2},'protocol-mismatch'],[{forwardIncompatible:true},'forward-schema'],[{conflict:true},'conflict'],
    [{recoveryRequired:true},'repository-recovery-required'],[{partitionCompatible:false},'storage-partition-mismatch']])
    test(`gate refuses ${reason}`,()=>assert.equal(evaluate({...base(),...patch},'saveBpm',compatible).reason,reason));
for (const [action, allowed] of [['saveBpm',true],['saveAdvanced',false],['listPresets',true],['applyPreset',true],['createPreset',false],['deletePreset',true],['queueSync',false],['pushCloud',false]])
    test(`Standard ${action} action policy`,()=>assert.equal(evaluate({...base(),pro:{allowed:false}},action,compatible).allowed,allowed));
test('local save has no Account requirement; Sync requires all independent evidence',()=>{
    const context={...base(),accountId:null,accountConfigured:false,appDeviceKnown:false,membershipActive:false};
    assert(evaluate(context,'saveBpm',compatible).allowed);assert.equal(evaluate(context,'queueSync',compatible).reason,'account-required');
    assert.equal(evaluate({...base(),membershipActive:false},'pushCloud',compatible).reason,'membership-required');
    assert.equal(evaluate({...base(),online:false},'pushCloud',compatible).reason,'offline');
});
test('checking is local only; blocked begin never invokes formal resolver',async()=>{
    let calls=0;const gate=createOperationBoundary({readContext:async()=>base(),resolvePro:async()=>{calls++;return base().pro;},now:()=>100});
    await gate.check('saveAdvanced');await assert.rejects(gate.begin('saveAdvanced',{}),/old-build-unknown/);assert.equal(calls,0);
});
for(const changed of ['accountGeneration','generation','accountId','repositoryEpoch','writerProtocol'])
    test(`operation captures and fences ${changed}`,async()=>{
        let state=base();const gate=createOperationBoundary({readContext:async()=>state,resolvePro:async()=>state.pro,...compatible,now:()=>100,id:()=> 'op'});
        const op=await gate.begin('saveBpm',{revision:'private'});state={...state,[changed]:'new'};
        await assert.rejects(gate.assertCurrent(op),/account-generation-changed/);
        await assert.rejects(gate.assertCurrent(op,{committed:true}),/local-saved-sync-unconfirmed/);
        assert.deepEqual(Object.keys(op),['operationId','action']);
    });
test('Pro expiry, credential generation change and dispose are rechecked after a wait',async()=>{
    let state=base(),now=100;const gate=createOperationBoundary({readContext:async()=>state,resolvePro:async()=>state.pro,...compatible,now:()=>now,id:()=> 'op'});
    const op=await gate.begin('createPreset',{});now=10000;await assert.rejects(gate.assertCurrent(op),/pro-required/);
    now=100;state.pro={...state.pro,generation:2};await assert.rejects(gate.assertCurrent(op),/pro-required/);
    gate.dispose();await assert.rejects(gate.assertCurrent(op),/operation-invalid/);
});
test('formal operation resolver uses device validation and rejects changed/revoked receipts',async()=>{
    let auth={credential:'fixture',generation:1},revoked=false,calls=0;
    const resolver=createProOperationResolver({readAuth:async()=>auth,knownRevoked:()=>revoked,now:()=>100,
        client:{async validate(_auth,options){calls++;assert.equal(options.force,false);return {ok:true,offline:true,offlineRemainingMs:500};}}});
    assert((await resolver('saveBpm')).allowed);assert.equal(calls,0);
    assert.deepEqual(await resolver('saveAdvanced'),{allowed:true,generation:1,credentialIdentity:'fixture',validUntil:600,offline:true});
    revoked=true;assert.equal((await resolver('createPreset')).allowed,false);
    revoked=false;const switching=createProOperationResolver({readAuth:async()=>auth,client:{async validate(){auth={credential:'new',generation:2};return {ok:true};}}});
    assert.equal((await switching('saveAdvanced')).allowed,false);
});
