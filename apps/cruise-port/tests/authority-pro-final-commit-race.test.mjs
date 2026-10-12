// B1-6 v4 integration audit. Uses the dormant Studio facade, active Port
// Authority repository and existing operational Pro resolver, without network
// or real credentials. Pro-only authorization must still hold at local commit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationFixture, sealed } from './migration-fixture.mjs';
import { createFixtureLocks } from '../../shared/sync-account/test-fixtures/web-locks.mjs';
import { createProOperationResolver } from '../port-write-readiness.mjs';
import { createPortMetronomeFacade } from '../../cruise-studio/js/port-data/metronome-facade.mjs';

const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};

for (const action of ['advanced-save', 'preset-create']) {
    for (const change of ['unchanged', 'expired', 'revoked', 'generation-changed']) {
        test(`${action}: Pro ${change} while final Authority commit lock is queued`, async () => {
            const locks = createFixtureLocks();
            const fixture = await migrationFixture({ bound: true, locks });
            const { e: engine, fence } = await sealed(fixture);
            await engine.publish({ fence });
            const repository = await engine.activeRepository({ fence });
            let clock = 100, revoked = false, validations = 0;
            let auth = { credential: 'isolated-pro-fixture', generation: 1 };
            const leaseUntil = 200;
            const proStatus = () => ({
                allowed: !revoked && clock < leaseUntil,
                generation: auth.generation, credentialIdentity: auth.credential,
                validUntil: leaseUntil
            });
            const resolvePro = createProOperationResolver({
                readAuth: async () => ({ ...auth }), readAuthSync: () => ({ ...auth }), now: () => clock, monotonicNow: () => clock,
                knownRevoked: () => revoked,
                client: { async validate() {
                    validations++;
                    return { ok: !revoked && clock < leaseUntil, offlineRemainingMs: Math.max(0, leaseUntil - clock) };
                } }
            });
            const facade = createPortMetronomeFacade({
                host: { subscribe: () => () => {} },
                fixtureExecutor: {
                    repository, resolvePro, now: () => clock, allWritersCompatible: true,
                    readContextSync: () => ({
                        generation: 1, accountGeneration: 1, accountId: 'A',
                        repositoryEpoch: 'g1', writerProtocol: 1, repositoryProtocol: 1,
                        locksAvailable: true, pro: proStatus()
                    }),
                    readContext: async () => ({
                        generation: 1, accountGeneration: 1, accountId: 'A',
                        repositoryEpoch: 'g1', writerProtocol: 1, repositoryProtocol: 1,
                        locksAvailable: true, pro: proStatus()
                    })
                }
            });
            try {
                const loaded = action === 'advanced-save' ? await facade.load() : await facade.listPresets();
                const before = repository.inspect();
                const entered = deferred(), release = deferred();
                let gated = false, blocker;
                // Queue a competing holder just before the repository requests
                // its final exclusive lock. The real FIFO fixture manager then
                // grants commit only after that holder releases the same lock.
                repository.locks = {
                    request(name, options, callback) {
                        if (!gated && name === repository.lockName && options.mode === 'exclusive') {
                            gated = true;
                            blocker = locks.request(name, options, async () => {
                                entered.resolve();
                                await release.promise;
                            });
                        }
                        return locks.request(name, options, callback);
                    }
                };
                const saving = action === 'advanced-save'
                    ? facade.saveSettings({ volume: 35 }, { baseToken: loaded.baseToken })
                    : facade.createPreset({ name: 'Authorization race',
                        settings: JSON.parse(before.values['cruisePort.metronome']) }, { baseToken: loaded.baseToken });
                await Promise.race([entered.promise, saving.then(() => {
                    throw Error('save ended before final lock boundary');
                })]);
                try {
                    assert.equal(validations, 1, 'operational Pro validation succeeded before lock wait');
                    if (change === 'expired') clock = leaseUntil + 1;
                    if (change === 'revoked') revoked = true;
                    if (change === 'generation-changed') auth = { ...auth, generation: 2 };
                } finally {
                    release.resolve();
                }
                const result = await saving;
                await blocker;
                const unchanged = repository.inspect().revision === before.revision;
                assert.deepEqual({ ok: result.ok, datasetUnchanged: unchanged },
                    change === 'unchanged'
                        ? { ok: true, datasetUnchanged: false }
                        : { ok: false, datasetUnchanged: true },
                    `Pro ${change} before commit; localStatus=${result.localStatus}, syncStatus=${result.syncStatus}`);
            } finally {
                facade.dispose();
            }
        });
    }
}
