// B1-6 v3 safety audit: a completed gate invalidation must fence a pending
// local commit. No production storage/network/credentials are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationFixture, sealed } from './migration-fixture.mjs';
import { revokeIsolatedFence } from '../port-authority-migration.mjs';
import { createFixtureLocks } from '../../shared/sync-account/test-fixtures/web-locks.mjs';

const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};

for (const change of ['suspend-writes', 'revoke-fence', 'switch-account']) {
    for (const checkNumber of [1, 2]) {
        test(`${change} during ${checkNumber === 1 ? 'initial' : 'final'} async validation rejects pending Authority commit`, async () => {
            const fixture = await migrationFixture({ bound: true, locks: createFixtureLocks() });
            const { e: engine, fence } = await sealed(fixture);
            await engine.publish({ fence });
            const repository = await engine.activeRepository({ fence });
            const before = repository.inspect();
            const entered = deferred(), resume = deferred();
            let checks = 0;
            const saving = repository.runWrite({
                expectedRevision: before.revision,
                assertCurrent: async () => {
                    if (++checks === checkNumber) {
                        entered.resolve();
                        await resume.promise;
                    }
                }
            }, draft => {
                const key = 'cruisePort.metronome';
                draft.setItem(key, JSON.stringify({ ...JSON.parse(draft.getItem(key)), bpm: 166 }));
                return { ok: true };
            });
            // Also fail if saving unexpectedly finishes before reaching the
            // intended await, rather than leaving a hanging test.
            await Promise.race([entered.promise, saving.then(() => {
                throw Error('write ended before validation barrier');
            })]);
            try {
                if (change === 'suspend-writes') {
                    await engine.suspendWrites();
                    assert.equal((await engine.inspect()).writeDisabled, true);
                } else if (change === 'revoke-fence') {
                    revokeIsolatedFence(fence);
                } else {
                    fixture.state.identity = { ...fixture.state.identity, accountId: 'B' };
                    assert.equal(fixture.state.identity.accountId, 'B');
                }
            } finally {
                resume.resolve();
            }
            const result = await saving;
            const after = repository.inspect();
            assert.deepEqual({
                ok: result.ok,
                datasetUnchanged: after.revision === before.revision
            }, { ok: false, datasetUnchanged: true },
            `${change} completed before the pending save resumed; result=${result.status}, checks=${checks}`);
        });
    }
}
