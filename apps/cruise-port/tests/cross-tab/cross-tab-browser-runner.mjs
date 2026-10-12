// Browser side of the L1 cross-tab harness. Loaded only by cross-tab-fixture.html
// on a loopback origin inside a throwaway browser profile driven by the driver.
import { PortDatasetRepository } from '../../port-dataset-repository.js';
import { cleanValues, migrationFixture, sealed } from '../migration-fixture.mjs';
import * as Migration from '../../port-authority-migration.mjs';
import { KEYS, backendFor, counterLoop, deleteLoop, instrumentLocks, seedDeleteCollections } from './cross-tab-scenarios.mjs';

const MARKER = '__crossTabHarness__';
const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
let session = null, authority = null;

// Refuse any storage the harness did not create: a real Port profile is never cleared.
function assertIsolated(token) {
    if (!loopback) throw Error('cross-tab harness requires a loopback origin');
    if (typeof token !== 'string' || token.length < 16) throw Error('driver token required');
    const marker = localStorage.getItem(MARKER);
    if (marker === null && localStorage.length !== 0) throw Error('storage not empty: refusing to touch existing data');
    if (marker !== null && marker !== token) throw Error('storage owned by another harness run');
}

async function attachAuthority(fresh) {
    const f = await migrationFixture({ bound: true, storage: localStorage, locks: navigator.locks });
    let engine = f.engine(), fence;
    if (fresh) { const s = await sealed(f); engine = s.e; fence = s.fence; await engine.publish({ fence }); }
    else fence = f.fence(f.cloud(await f.capture()));
    const repository = await engine.activeRepository({ fence });
    return { f, engine, fence, repository };
}

globalThis.crossTab = Object.freeze({
    async claim(token) {
        assertIsolated(token);
        localStorage.setItem(MARKER, token);
        session = token;
        return true;
    },
    // Only the primary tab seeds; the peer attaches after the driver confirms seeding.
    async prepare({ scenario, role, iterations }) {
        assertIsolated(session);
        authority = null;
        if (role === 'primary') {
            for (const key of Object.keys(localStorage)) if (key !== MARKER) localStorage.removeItem(key);
            let values = cleanValues();
            if (scenario === 'delete-intent') values = seedDeleteCollections(values, iterations);
            for (const [key, value] of Object.entries(values)) if (value !== null) localStorage.setItem(key, value);
        }
        if (backendFor(scenario) === 'authority-localstorage') authority = await attachAuthority(role === 'primary');
        return { backend: backendFor(scenario), keys: localStorage.length };
    },
    async run({ scenario, role, iterations, payload, changeDelayMs = 120 }) {
        assertIsolated(session);
        const pad = 'x'.repeat(payload);
        if (backendFor(scenario) === 'authority-localstorage') {
            if (role === 'primary') {
                const grants = instrumentLocks(authority.repository, navigator.locks);
                return { commits: await counterLoop({ repository: authority.repository, key: KEYS.a, iterations, pad, grants,
                    durationMs: changeDelayMs + 600 }) };
            }
            await new Promise(done => setTimeout(done, changeDelayMs));
            if (scenario === 'save-suspend') await authority.engine.suspendWrites();
            if (scenario === 'save-fence-revoke') await Migration.revokeIsolatedFence(authority.fence);
            if (scenario === 'save-account-binding')
                await Migration.changeIsolatedIdentity(authority.f.scope, { ...authority.f.state.identity, accountId: 'B' });
            return { changedAt: Date.now() };
        }
        const repository = new PortDatasetRepository({ storage: localStorage, locks: navigator.locks });
        const grants = instrumentLocks(repository, navigator.locks);
        if (scenario === 'delete-intent')
            return deleteLoop({ repository, key: role === 'primary' ? KEYS.deleteA : KEYS.deleteB, iterations, pad });
        const key = scenario === 'save-save-different-keys' && role === 'peer' ? KEYS.b : KEYS.a;
        return { commits: await counterLoop({ repository, key, iterations, pad, grants }) };
    },
    // Raw observation after the driver's settle delay; both tabs must agree.
    observe() {
        assertIsolated(session);
        const read = key => localStorage.getItem(key);
        const counter = key => JSON.parse(read(key) || '{}').probeCounter || 0;
        const ids = key => (JSON.parse(read(key) || '{"items":[]}').items || []).map(item => item.id);
        return { counterA: counter(KEYS.a), counterB: counter(KEYS.b), journal: read(KEYS.intents),
            itemsA: ids(KEYS.deleteA), itemsB: ids(KEYS.deleteB),
            authorityCounter: authority ? JSON.parse(authority.repository.inspect().values[KEYS.a] || '{}').probeCounter || 0 : null };
    },
    release() {
        assertIsolated(session);
        localStorage.clear();
        session = null;
        return true;
    }
});
