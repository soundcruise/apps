import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationFixture, sealed } from './migration-fixture.mjs';
import { createFixtureLocks } from '../../shared/sync-account/test-fixtures/web-locks.mjs';
import { createOperationBoundary, createProOperationResolver } from '../port-write-readiness.mjs';
import { changeIsolatedIdentity, revokeIsolatedFence } from '../port-authority-migration.mjs';
import { PortDatasetRepository, PORT_DATASET_KEYS } from '../port-dataset-repository.js';
const settings='cruisePort.metronome', presets='cruisePort.metronomePresets';
const actions=['saveBpm','saveAdvanced','createPreset','deletePreset'];
const proActions=new Set(['saveAdvanced','createPreset']);
const wait=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function setup() {
    const locks=createFixtureLocks(), f=await migrationFixture({bound:true,locks}), {e,fence}=await sealed(f);
    await e.publish({fence});const repo=await e.activeRepository({fence});
    const state={wall:1000000,mono:100,revoked:false,auth:{credential:'fixture-pro',generation:1,operationRevision:1},
        context:{generation:1,accountId:'A',accountGeneration:1,membershipId:'port-membership-a',membershipGeneration:1,
            authorityGeneration:'g1',repositoryEpoch:'g1',writerProtocol:1,repositoryProtocol:1,locksAvailable:true,
            accountConfigured:true,appDeviceKnown:true,membershipActive:true,syncActivated:true,online:true,
            pro:{allowed:true,generation:1,credentialIdentity:'fixture-pro',validUntil:1005000}}};
    const resolvePro=createProOperationResolver({readAuth:async()=>({...state.auth}),readAuthSync:()=>({...state.auth}),
        now:()=>state.wall,monotonicNow:()=>state.mono,knownRevoked:()=>state.revoked,
        client:{validate:async()=>({ok:true,offlineRemainingMs:5000})}});
    const boundary=createOperationBoundary({readContext:async()=>state.context,readContextSync:()=>state.context,
        resolvePro,now:()=>state.wall,allWritersCompatible:true});
    return {f,e,fence,repo,state,boundary,resolvePro,locks};
}
function writer(action) {return draft=>{
    if(action==='saveBpm'||action==='saveAdvanced')draft.setItem(settings,JSON.stringify({...JSON.parse(draft.getItem(settings)),[action==='saveBpm'?'bpm':'volume']:action==='saveBpm'?155:35}));
    else {const value=JSON.parse(draft.getItem(presets));value.items=action==='createPreset'?[...value.items,{...JSON.parse(draft.getItem(settings)),id:'fixture-preset',name:'Fixture',createdAt:1,updatedAt:1}]:[];draft.setItem(presets,JSON.stringify(value));}
    return {ok:true};
};}
async function invalidate(x,kind) {
    if(kind==='Pro expiry')x.state.wall=1006000;
    if(kind==='Pro revoke')x.state.revoked=true;
    if(kind==='Pro generation')x.state.auth={...x.state.auth,generation:2};
    if(kind==='suspension')await x.e.suspendWrites();
    if(kind==='fence revoke')await revokeIsolatedFence(x.fence);
    if(kind==='Account change'||kind==='membership change') {
        const next={...x.f.state.identity};if(kind==='Account change')next.accountId='B';else next.membershipGeneration++;
        await changeIsolatedIdentity(x.f.scope,next);
    }
    if(kind==='Authority change')x.state.context={...x.state.context,authorityGeneration:'g2'};
    if(kind==='CAS conflict') {
        const base=x.repo.inspect();await x.repo.runWrite({expectedRevision:base.revision},writer('saveBpm'));
    }
}
for(const action of actions) for(const transition of ['Pro expiry','Pro revoke','Pro generation','suspension','fence revoke','Account change','membership change','Authority change','CAS conflict'])
    for(const checkpoint of ['first validation','final validation','lock wait']) {
        test(`${action} / ${transition} / ${checkpoint}`,async()=>{
            const x=await setup(),before=x.repo.inspect(),targetKeys=[action==='saveBpm'||action==='saveAdvanced'?settings:presets];
            const op=await x.boundary.begin(action,before,{targetKeys}),entered=wait(),release=wait();let checks=0,held;
            if(checkpoint==='lock wait') {
                const native=x.repo.locks.request.bind(x.repo.locks);let blocked=false;
                x.repo.locks={request(name,options,callback){
                    if(!blocked&&options.mode==='exclusive'){blocked=true;held=native(name,options,async()=>{entered.resolve();await release.promise;});}
                    return native(name,options,callback);
                }};
            }
            const saving=x.repo.runWrite({expectedRevision:before.revision,operationId:op.operationId,authorizationContext:op,
                commitGuard:(context,details)=>x.boundary.commitGuard(context,details),assertCurrent:async()=>{
                    await x.boundary.assertCurrent(op);checks++;
                    if(checkpoint==='first validation'&&checks===1||checkpoint==='final validation'&&checks===2){entered.resolve();await release.promise;}
                }},writer(action));
            await Promise.race([entered.promise,saving.then(()=>{throw Error('checkpoint not reached');})]);
            // Authority-changing APIs need that same lock, so queue them ahead of commit
            // rather than waiting while our explicit test holder owns it.
            const lockBound=checkpoint==='lock wait'&&['suspension','fence revoke','Account change','membership change','CAS conflict'].includes(transition);
            let changing;
            if(lockBound){changing=invalidate(x,transition);release.resolve();await changing;}
            else {await invalidate(x,transition);release.resolve();}
            const result=await saving;if(held)await held;
            // During lock-wait, save was already queued before a later cooperative state
            // mutation: the grant order may let it linearize first. Earlier tests prove
            // invalidation-first; never infer order from the invocation timestamps.
            const saveFirst=lockBound&&transition!=='fence revoke';
            const standardPro=transition.startsWith('Pro ')&&!proActions.has(action);
            if(!saveFirst){assert.equal(result.ok,standardPro);if(!standardPro&&transition!=='CAS conflict')assert.equal(x.repo.inspect().revision,before.revision);}
            if(result.ok)assert.equal(result.publish,false);
        });
    }

for(const verdict of [()=>false,()=>({allowed:false}),()=>({ok:false}),()=>{throw Object.assign(Error('denied'),{code:'denied'});},()=>Promise.resolve(true),()=>Promise.reject(Error('denied')),()=>({then(){}})])
    test('generic operation commit guard fails closed: '+String(verdict),async()=>{
        const values=new Map([[settings,JSON.stringify({version:3,bpm:120})]]),repo=new PortDatasetRepository({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},locks:createFixtureLocks()});
        const before=repo.inspect();assert.equal((await repo.runWrite({expectedRevision:before.revision,commitGuard:verdict},writer('saveBpm'))).ok,false);
        assert.equal(repo.inspect().revision,before.revision);
    });
for(const transition of ['wall deadline','monotonic deadline','wall rollback','monotonic reset','credential removal','credential replacement','generation ABA','unknown server revoke'])
    test('formal proof clock/source: '+transition,async()=>{
        const x=await setup(),proof=await x.resolvePro('saveAdvanced');
        if(transition==='wall deadline')x.state.wall=1005000;
        if(transition==='monotonic deadline')x.state.mono=5100;
        if(transition==='wall rollback')x.state.wall=600000;
        if(transition==='monotonic reset')x.state.mono=0;
        if(transition==='credential removal')x.state.auth=null;
        if(transition==='credential replacement')x.state.auth={...x.state.auth,credential:'new'};
        if(transition==='generation ABA')x.state.auth={...x.state.auth,operationRevision:2};
        if(transition==='unknown server revoke')assert.doesNotThrow(()=>x.resolvePro.assertCommit(proof));
        else assert.throws(()=>x.resolvePro.assertCommit(proof));
    });
for(const action of ['queueSync','pushCloud'])for(const transition of ['Pro expiry','Pro revoke','Account change','membership change','Authority change'])
    test(`${action} / ${transition} / pre-publish (no fabricated cloud executor)`,async()=>{
        const x=await setup(),op=await x.boundary.begin(action,x.repo.inspect());
        if(transition==='Account change')x.state.context={...x.state.context,accountId:'B'};
        else if(transition==='membership change')x.state.context={...x.state.context,membershipGeneration:2};
        else await invalidate(x,transition);
        assert.throws(()=>x.boundary.commitGuard(op));
    });
for(const transition of ['Pro expiry','Pro revoke','Pro generation']) test('post-commit keeps fact: '+transition,async()=>{
    const x=await setup(),before=x.repo.inspect(),op=await x.boundary.begin('saveAdvanced',before,{targetKeys:[settings]});
    x.repo.subscribe(()=>{void invalidate(x,transition);});
    const result=await x.repo.runWrite({expectedRevision:before.revision,authorizationContext:op,operationId:op.operationId,
        commitGuard:(t,d)=>x.boundary.commitGuard(t,d)},writer('saveAdvanced'));
    assert.equal(result.status,'committed');assert.equal(result.publish,false);assert.equal(x.repo.inspect().revision,result.revision);
    assert.throws(()=>x.boundary.commitGuard(op));
});

for(const transition of ['Pro expiry','Pro revoke','Pro generation']) test('pre-publication WAL rollback: '+transition,async()=>{
    const x=await setup(),before=x.repo.inspect(),op=await x.boundary.begin('saveAdvanced',before,{targetKeys:[settings]});
    const storage=x.repo.storage;let injected=false;
    x.repo.storage={getItem:key=>storage.getItem(key),removeItem:key=>storage.removeItem(key),setItem(key,value){
        storage.setItem(key,value);
        if(key===settings&&!injected){injected=true;void invalidate(x,transition);}
    }};
    const result=await x.repo.runWrite({expectedRevision:before.revision,authorizationContext:op,operationId:op.operationId,
        commitGuard:(t,d)=>x.boundary.commitGuard(t,d)},writer('saveAdvanced'));
    assert.equal(injected,true);assert.equal(result.status,'rolled-back');assert.equal(result.reason,'pro-required');
    assert.equal(x.repo.inspect().revision,before.revision);
});
for(const remaining of [0,-1,Infinity,7*86400000+1]) test('formal proof rejects invalid offline budget '+remaining,async()=>{
    const auth={credential:'fixture',generation:1};
    const resolve=createProOperationResolver({readAuth:async()=>auth,readAuthSync:()=>auth,now:()=>1000,monotonicNow:()=>10,
        client:{validate:async()=>({ok:true,offlineRemainingMs:remaining})}});
    assert.equal((await resolve('saveAdvanced')).allowed,false);
});
test('operational proof authorizes without a display status grant',async()=>{
    const x=await setup();x.state.context.pro={allowed:false};
    const before=x.repo.inspect(),op=await x.boundary.begin('saveAdvanced',before,{targetKeys:[settings]});
    await x.boundary.assertCurrent(op);
    const result=await x.repo.runWrite({expectedRevision:before.revision,authorizationContext:op,operationId:op.operationId,
        commitGuard:(t,d)=>x.boundary.commitGuard(t,d)},writer('saveAdvanced'));
    assert.equal(result.status,'committed');
});
test('proof clones and another resolver cannot adopt a realm deadline',async()=>{
    const x=await setup(),other=await setup(),proof=await x.resolvePro('saveAdvanced');
    assert.throws(()=>x.resolvePro.assertCommit({...proof}));assert.throws(()=>other.resolvePro.assertCommit(proof));
});
test('expired proof remains blocked after clocks move backwards',async()=>{
    const x=await setup(),proof=await x.resolvePro('saveAdvanced');x.state.wall=1005000;
    assert.throws(()=>x.resolvePro.assertCommit(proof));x.state.wall=1000000;
    assert.throws(()=>x.resolvePro.assertCommit(proof));
});
test('operation sync source cannot return a Promise',async()=>{
    const x=await setup(),boundary=createOperationBoundary({readContext:async()=>x.state.context,
        readContextSync:()=>Promise.resolve(x.state.context),resolvePro:x.resolvePro,allWritersCompatible:true,now:()=>x.state.wall});
    const op=await boundary.begin('saveAdvanced',x.repo.inspect());assert.throws(()=>boundary.commitGuard(op));
});
test('validation cannot retag a mutable auth object to a new credential',async()=>{
    const auth={credential:'original',generation:1};
    const resolve=createProOperationResolver({readAuth:async()=>auth,readAuthSync:()=>auth,now:()=>1000,monotonicNow:()=>10,
        client:{validate:async()=>{auth.credential='replacement';return {ok:true,offlineRemainingMs:1000};}}});
    assert.equal((await resolve('saveAdvanced')).allowed,false);
});
