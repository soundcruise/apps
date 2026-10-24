import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { IDBFactory, IDBObjectStore, bpmHandle } from './authority-store/pointer-fixture.mjs';
import { createTestAuthorityScope } from './authority-store/test-authority.mjs';
import { control, values } from './authority-store/fixture.mjs';
import { openIDBAuthorityStore, createIsolatedIDBAuthorityScope } from '../port-indexeddb-authority-store.mjs';
import { createIsolatedPortAccountCoordinator, readExistingPortAccount, projectPortAccountIdentity } from '../port-account-coordination.mjs';

const sharedSource = await readFile(new URL('../../shared/sync-account/sync-account-db.js', import.meta.url), 'utf8');
const account = id => ({ accountId: id, accountDeviceId: 'device-' + id, accountCredential: 'isolated-credential-' + id });
const summary = (id = 'A') => ({ account: { id, state: 'active', generation: 7 },
    memberships: [{ appId: 'port', id: 'member-' + id, state: 'active', generation: 11 }] });
const identity = (id = 'A') => ({ ...control().identity, ownership: 'bound-account', accountId: id,
    accountGeneration: 7, membershipId: 'member-' + id, membershipGeneration: 11 });
function shared(factory) {
    const environment = { indexedDB: factory, setTimeout, clearTimeout, structuredClone };
    vm.runInNewContext(sharedSource, environment);
    return environment.SoundCruiseSyncAccount.storage;
}
function serialLocks() {
    let queue = Promise.resolve();
    return { request(name, options, fn) { const result = queue.then(fn); queue = result.catch(() => {}); return result; } };
}
async function setup(t, { factory = new IDBFactory(), name = 'sound-cruise-port-authority-v1-fixture-account', locks = serialLocks() } = {}) {
    const storage = shared(factory), scope = createTestAuthorityScope({ indexedDB: factory, partitionId: 'fixture-partition', name });
    const store = await openIDBAuthorityStore(scope);
    assert((await store.initialize({ generation: 'g1', control: { ...control(), identity: identity() }, values: values(), operationId: 'seed' })).ok);
    await storage.setAccount(account('A'), factory);
    const coordinator = await createIsolatedPortAccountCoordinator({ scope, indexedDB: factory, accountStorage: storage, locks });
    t.after(() => { coordinator.dispose(); store.dispose(); });
    return { factory, storage, scope, store, coordinator, locks };
}
const observe = x => x.coordinator.observe({ generation: 'g1', summary: summary() });

test('pure identity projection keeps local and server generations separate, never infers missing fields', () => {
    assert.deepEqual(projectPortAccountIdentity(account('A'), summary()), {
        appId: 'port', accountId: 'A', accountGeneration: 7, membershipId: 'member-A', membershipGeneration: 11 });
    for (const invalid of [null, {}, { ...summary(), memberships: 'unexpected' }, { ...summary(), memberships: {} }, { ...summary(), account: { id: 'A', state: 'active' } },
        { ...summary(), memberships: [...summary().memberships, ...summary().memberships] }, summary('B')]) {
        assert.equal(projectPortAccountIdentity(account('A'), invalid), null);
    }
});
test('readonly Account inspection does not create an absent DB and import has no browser dependencies', async () => {
    const factory = new IDBFactory(); assert.equal(await readExistingPortAccount(factory), null);
    assert.deepEqual(await factory.databases(), []);
    assert.equal(projectPortAccountIdentity(null, null), null);
});
test('observe returns opaque context, reports observation only, does not publish/save/authorize', async t => {
    const x = await setup(t), before = await x.store.hydrate('g1');
    const token = await observe(x), state = x.coordinator.getCachedStatus();
    assert.deepEqual(token, {}); assert.equal(state.localGeneration, x.storage.getGeneration());
    assert.equal(state.serverIdentity.accountGeneration, 7); assert.equal(state.serverIdentity.membershipGeneration, 11);
    assert.equal(state.canWrite, false); assert.equal(state.serverObservationOnly, true);
    assert(!JSON.stringify(state).includes('isolated-credential'));
    assert.deepEqual(await x.store.hydrate('g1'), before);
    assert.deepEqual(await readExistingPortAccount(x.factory), account('A'));
});
test('actual Control stop completes before actual Shared Account publication, old handle rejected', async t => {
    const x = await setup(t), snapshot = (await x.store.hydrate('g1')).snapshot;
    const old = bpmHandle(x.store, snapshot, 'old-save'), context = await observe(x);
    const log = [], original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...args) {
        if (this.name === 'control' && value.identityInvalidated) this.transaction.addEventListener('complete', () => log.push('stop-complete'));
        if (this.name === 'meta' && value?.accountId === 'B') log.push('account-submit');
        return original.call(this, value, ...args);
    };
    try { assert((await x.coordinator.transition({ context, operationId: 'switch', nextAccount: account('B') })).ok); }
    finally { IDBObjectStore.prototype.put = original; }
    assert.deepEqual(log, ['stop-complete', 'account-submit']);
    assert.equal((await x.store.commit(old)).ok, false);
    assert.equal((await x.store.hydrate('g1')).snapshot.control.identityInvalidated, true);
    assert.deepEqual(await readExistingPortAccount(x.factory), account('B'));
    assert.equal((await x.coordinator.transition({ context, operationId: 'revive', nextAccount: account('A') })).reason, 'account-context-stale');
});
test('valid save preceding stop remains committed, later save cannot cross the durable stop', async t => {
    const x = await setup(t), before = (await x.store.hydrate('g1')).snapshot;
    assert((await x.store.commit(bpmHandle(x.store, before, 'earlier-save'))).ok);
    const context = await observe(x);
    assert((await x.coordinator.transition({ context, operationId: 'retire', nextAccount: null })).ok);
    assert.equal(await readExistingPortAccount(x.factory), null);
    assert.equal(JSON.parse((await x.store.hydrate('g1')).snapshot.values['cruisePort.metronome']).bpm, 145);
});
test('dropped cross-realm notification: delayed A cannot clear/replace normal B or stop A authority', async t => {
    const x = await setup(t), token = await observe(x), other = shared(x.factory);
    const local = x.storage.getGeneration();
    await other.setAccount(account('B'), x.factory); // no BroadcastChannel in this fixture
    assert.equal(x.storage.getGeneration(), local);
    const before = await x.store.hydrate('g1');
    const result = await x.coordinator.transition({ context: token, operationId: 'old-A', nextAccount: null });
    assert.equal(result.reason, 'account-context-stale');
    assert.deepEqual(await readExistingPortAccount(x.factory), account('B'));
    assert.deepEqual(await x.store.hydrate('g1'), before);
});
test('two cooperating renderers serialize transition: exactly one publishes, losing old A never erases B', async t => {
    const x = await setup(t), scope = createTestAuthorityScope({ indexedDB: x.factory, name: x.scope.name, partitionId: 'fixture-partition' });
    const other = await createIsolatedPortAccountCoordinator({ scope, indexedDB: x.factory, accountStorage: shared(x.factory), locks: x.locks });
    t.after(() => other.dispose());
    const a = await observe(x), b = await other.observe({ generation: 'g1', summary: summary() });
    const results = await Promise.all([
        x.coordinator.transition({ context: a, operationId: 'to-B', nextAccount: account('B') }),
        other.transition({ context: b, operationId: 'to-C', nextAccount: account('C') })
    ]);
    assert.equal(results.filter(value => value.ok).length, 1); assert.equal(results[1].reason, 'account-context-stale');
    assert.deepEqual(await readExistingPortAccount(x.factory), account('B'));
});
test('stop abort never publishes Account and its same-runtime context stays irreversibly blocked', async t => {
    const x = await setup(t), context = await observe(x), original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...args) {
        if (this.name === 'control' && value.identityInvalidated) { this.transaction.abort(); throw Error('fixture-abort'); }
        return original.call(this, value, ...args);
    };
    try { const result = await x.coordinator.transition({ context, operationId: 'aborted-stop', nextAccount: account('B') });
        assert.equal(result.ok, false); assert.equal(result.stopped, false); assert.equal(result.recoveryRequired, true); }
    finally { IDBObjectStore.prototype.put = original; }
    assert.deepEqual(await readExistingPortAccount(x.factory), account('A'));
    assert.equal((await x.coordinator.transition({ context, operationId: 'retry-old', nextAccount: account('B') })).reason, 'account-context-stale');
});
test('Account write abort preserves durable stop; reopened renderer cannot recapture old A', async t => {
    const x = await setup(t), context = await observe(x), original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...args) {
        if (this.name === 'meta' && value?.accountId === 'B') { this.transaction.abort(); throw Error('fixture-abort'); }
        return original.call(this, value, ...args);
    };
    try { const result = await x.coordinator.transition({ context, operationId: 'stopped-before-abort', nextAccount: account('B') });
        assert.equal(result.ok, false); assert.equal(result.stopped, true); }
    finally { IDBObjectStore.prototype.put = original; }
    assert.deepEqual(await readExistingPortAccount(x.factory), account('A'));
    x.coordinator.dispose();
    const scope = createTestAuthorityScope({ indexedDB: x.factory, name: x.scope.name, partitionId: 'fixture-partition' });
    const reopened = await createIsolatedPortAccountCoordinator({ scope, indexedDB: x.factory, accountStorage: shared(x.factory), locks: x.locks });
    t.after(() => reopened.dispose());
    assert.equal(await reopened.observe({ generation: 'g1', summary: summary() }), null);
    assert.equal(reopened.getCachedStatus().state, 'recovery-required');
    assert.equal(reopened.getCachedStatus().canWrite, false);
});
test('normal isolated scope cannot mint Control provider; forged context and cloned context reject', async t => {
    const x = await setup(t), context = await observe(x);
    for (const token of [{}, structuredClone(context)]) await assert.rejects(
        x.coordinator.transition({ context: token, operationId: 'forged', nextAccount: null }), /account-context-invalid/);
    const scope = createIsolatedIDBAuthorityScope({ indexedDB: new IDBFactory(), name: 'sound-cruise-port-authority-v1-fixture-plain', partitionId: 'fixture-partition' });
    const factory = new IDBFactory();
    await assert.rejects(createIsolatedPortAccountCoordinator({ scope: { ...scope }, indexedDB: factory, accountStorage: shared(factory), locks: serialLocks() }), /isolated-scope-required/);
});
test('late server observation cannot retag another Account or local generation; stop identity must match generations', async t => {
    const x = await setup(t);
    assert.equal(await x.coordinator.observe({ generation: 'g1', summary: summary('B') }), null);
    assert.equal(await x.coordinator.observe({ generation: 'g1', summary: { ...summary(), account: { ...summary().account, generation: 8 } } }), null);
    assert.equal(x.coordinator.getCachedStatus().state, 'identity-mismatch');
});
test('uncoordinated B arriving after the last read but before actual Account CAS is preserved', async t => {
    const x = await setup(t), context = await observe(x), other = shared(x.factory);
    const original = x.storage.changeAccountIfCurrent;
    // This is the exact old read -> await setAccount race window, not a
    // notification simulation. The other realm intentionally emits no hint.
    const scope = createTestAuthorityScope({ indexedDB: x.factory, name: x.scope.name, partitionId: 'fixture-partition' });
    let enter, release;
    const entered = new Promise(resolve => { enter = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const storage = { ...x.storage, async changeAccountIfCurrent(...args) { enter(); await gate; return original(...args); } };
    const contender = await createIsolatedPortAccountCoordinator({ scope, indexedDB: x.factory, accountStorage: storage, locks: x.locks });
    t.after(() => contender.dispose());
    const token = await contender.observe({ generation: 'g1', summary: summary() });
    const pending = contender.transition({ context: token, operationId: 'final-gap', nextAccount: null });
    await entered;
    await other.setAccount(account('B'), x.factory);
    release();
    const result = await pending;
    assert.equal(result.ok, false); assert.equal(result.stopped, true);
    assert.deepEqual(await readExistingPortAccount(x.factory), account('B'));
    assert.equal((await x.store.hydrate('g1')).snapshot.control.identityInvalidated, true);
    // The earlier private observation cannot undo the durable identity latch.
    assert.equal((await x.coordinator.transition({ context, operationId: 'old-A-after-B', nextAccount: account('A') })).ok, false);
});
test('Account CAS after A->B rejects clear/replacement with stale A identity in the actual transaction', async () => {
    const factory = new IDBFactory(), first = shared(factory), second = shared(factory);
    await first.setAccount(account('A'), factory);
    await second.setAccount(account('B'), factory);
    const revision = first.getGeneration();
    await assert.rejects(first.changeAccountIfCurrent(account('A'), null, factory), /account_identity_changed/);
    assert.equal(first.getGeneration(), revision, 'stale A must not invalidate observers of current B');
    assert.deepEqual(await readExistingPortAccount(factory), account('B'));
    await second.changeAccountIfCurrent(account('B'), account('C'), factory);
    assert.deepEqual(await readExistingPortAccount(factory), account('C'));
});
test('missing fixture brand cannot adopt privileged fixture Pointer or publish Account replacement', async t => {
    const factory = new IDBFactory(), storage = shared(factory);
    await storage.setAccount(account('A'), factory);
    // Seed with a privileged scope, then reopen the same DB with a normal scope.
    const seedScope = createTestAuthorityScope({ indexedDB: factory, name: 'sound-cruise-port-authority-v1-fixture-no-provider', partitionId: 'fixture-partition' });
    const seed = await openIDBAuthorityStore(seedScope);
    assert((await seed.initialize({ generation: 'g1', control: { ...control(), identity: identity() }, values: values(), operationId: 'seed' })).ok);
    t.after(() => seed.dispose());
    const scope = createIsolatedIDBAuthorityScope({ indexedDB: factory, name: seedScope.name, partitionId: 'fixture-partition' });
    const coordinator = await createIsolatedPortAccountCoordinator({ scope, indexedDB: factory, accountStorage: storage, locks: serialLocks() });
    t.after(() => coordinator.dispose());
    const token = await coordinator.observe({ generation: 'g1', summary: summary() });
    // Provenance rejects the fixture Pointer before an observation is issued;
    // do not weaken that existing check merely to reach the later provider gate.
    assert.equal(token, null);
    await assert.rejects(coordinator.transition({ context: token, operationId: 'no-provider', nextAccount: account('B') }), /account-context-invalid/);
    assert.deepEqual(await readExistingPortAccount(factory), account('A'));
});
test('same-Account credential rotation preserves new bytes but does not certify ambiguous durable receipt', async t => {
    const x = await setup(t), token = await observe(x);
    const rotated = { ...account('A'), accountCredential: 'isolated-new-credential-A' };
    const result = await x.coordinator.transition({ context: token, operationId: 'same-account-rotation', nextAccount: rotated });
    assert.equal(result.ok, false); assert.equal(result.reason, 'account-transition-receipt-required');
    assert.equal(result.stopped, true); assert.equal(result.recoveryRequired, true);
    assert.deepEqual(await readExistingPortAccount(x.factory), rotated);
    const facts = await x.store.accountTransitions('g1');
    assert.equal(facts.recoveryRequired, true); assert.equal(facts.intents[0].accountTransition.phase, 'stopped');
    assert(!JSON.stringify(facts).includes('isolated-new-credential-A'));
    assert.equal((await x.coordinator.transition({ context: token, operationId: 'never-restore-A', nextAccount: account('A') })).ok, false);
});
test('Account CAS committed but acknowledgment lost: reopen never replays destination or clears B', async t => {
    const x = await setup(t), scope = createTestAuthorityScope({ indexedDB: x.factory, name: x.scope.name, partitionId: 'fixture-partition' });
    const contender = await createIsolatedPortAccountCoordinator({ scope, indexedDB: x.factory, locks: x.locks,
        accountStorage: { ...x.storage, async changeAccountIfCurrent(...args) { await x.storage.changeAccountIfCurrent(...args); throw Error('lost-CAS-receipt'); } } });
    const token = await contender.observe({ generation: 'g1', summary: summary() });
    assert.equal((await contender.transition({ context: token, operationId: 'lost-receipt', nextAccount: account('B') })).recoveryRequired, true);
    contender.dispose();
    assert.deepEqual(await readExistingPortAccount(x.factory), account('B'));
    const reopened = await createIsolatedPortAccountCoordinator({ scope: createTestAuthorityScope({ indexedDB: x.factory, name: x.scope.name, partitionId: 'fixture-partition' }),
        indexedDB: x.factory, accountStorage: shared(x.factory), locks: x.locks });
    t.after(() => reopened.dispose());
    assert.equal(await reopened.observe({ generation: 'g1', summary: summary('B') }), null);
    assert.equal(reopened.getCachedStatus().state, 'recovery-required');
    assert.deepEqual(await readExistingPortAccount(x.factory), account('B'));
    assert.equal((await x.store.accountTransitions('g1')).intents[0].accountTransition.phase, 'stopped');
});
test('completion transaction abort preserves durable stopped intent and new B without retrying CAS', async t => {
    const x = await setup(t), token = await observe(x), original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value,...args) {
        if (value?.accountTransition?.phase === 'account-confirmed') { this.transaction.abort(); throw Error('fixture-confirm-abort'); }
        return original.call(this,value,...args);
    };
    try { const result = await x.coordinator.transition({ context: token, operationId: 'confirm-abort', nextAccount: account('B') });
        assert.equal(result.recoveryRequired, true); assert.equal(result.stopped, true); }
    finally { IDBObjectStore.prototype.put = original; }
    assert.deepEqual(await readExistingPortAccount(x.factory), account('B'));
    assert.equal((await x.store.accountTransitions('g1')).recoveryRequired, true);
});
test('B arriving after intent hydration but before observe publication cannot receive an old-A context', async t => {
    const x = await setup(t), other = shared(x.factory), original = IDBObjectStore.prototype.openCursor;
    let enter, release, armed=true;
    const entered=new Promise(resolve=>{enter=resolve;}), gate=new Promise(resolve=>{release=resolve;});
    IDBObjectStore.prototype.openCursor=function(...args){
        if(this.name==='reservations'&&armed){
            armed=false; const tx=this.transaction,complete=tx.oncomplete;
            tx.oncomplete=async function(event){enter();await gate;complete.call(this,event);};
        }
        return original.apply(this,args);
    };
    try {
        const pending=observe(x);await entered;
        await other.setAccount(account('B'),x.factory); // notification intentionally unavailable
        release();assert.equal(await pending,null);
        assert.equal(x.coordinator.getCachedStatus().state,'stale');
        assert.deepEqual(await readExistingPortAccount(x.factory),account('B'));
    } finally {release();IDBObjectStore.prototype.openCursor=original;}
});
test('explicit Account revocation uses the same irreversible intent barrier without touching Pro source', async t => {
    const x=await setup(t),token=await observe(x);
    assert((await x.coordinator.transition({context:token,operationId:'revoke-A',nextAccount:null,kind:'revoke'})).ok);
    assert.equal(await readExistingPortAccount(x.factory),null);
    const fact=(await x.store.accountTransitions('g1')).intents[0];
    assert.equal(fact.accountTransition.request.kind,'revoke');
    assert.equal(fact.accountTransition.after.identityInvalidated,true);
    assert.equal(fact.accountTransition.phase,'account-confirmed');
});
