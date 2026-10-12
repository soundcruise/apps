// L1 cross-tab race evidence. Scenario bodies and oracles are shared by the
// browser runner (real Repository, native Web Locks/localStorage in separate
// renderers) and by the Node oracle test. A Node run never counts as evidence.
export const SCENARIOS = Object.freeze(['save-save-same-key', 'save-save-different-keys', 'delete-intent',
    'save-suspend', 'save-fence-revoke', 'save-account-binding']);
export const CONTROL_SCENARIOS = Object.freeze(['save-suspend', 'save-fence-revoke', 'save-account-binding']);
export const PAYLOADS = Object.freeze([0, 20000, 200000]);
// legacy-localstorage: production legacy Repository. authority-localstorage: current dormant
// Authority (localStorage namespace). indexeddb-authority: L2b isolated actual Repository/Store acceptance.
export const BACKENDS = Object.freeze(['legacy-localstorage', 'authority-localstorage', 'indexeddb-authority']);
export const KEYS = Object.freeze({ a: 'cruisePort.metronome', b: 'cruisePort.tuner',
    deleteA: 'cruisePort.metronomePresets', deleteB: 'cruisePort.myApps', intents: 'cruisePort.syncDeletionIntent.v1' });

export const backendFor = scenario => CONTROL_SCENARIOS.includes(scenario) ? 'authority-localstorage' : 'legacy-localstorage';

// Seed collections with synthetic records so each side owns a disjoint delete stream.
export function seedDeleteCollections(values, count) {
    const presets = JSON.parse(values[KEYS.deleteA]), apps = JSON.parse(values[KEYS.deleteB]);
    presets.items = Array.from({ length: count }, (_, i) => ({ ...presets.items[0], id: `ct-a-${i}`, name: `ct a ${i}` }));
    apps.items = Array.from({ length: count }, (_, i) => ({ ...apps.items[0], id: `ct-b-${i}`, name: `ct b ${i}` }));
    return { ...values, [KEYS.deleteA]: JSON.stringify(presets), [KEYS.deleteB]: JSON.stringify(apps), [KEYS.intents]: null };
}

// Read-modify-write of one counter under the Repository's own CAS. `onGrant` is
// called by the instrumented lock wrapper; the last exclusive grant is attributed
// to the write in flight because a single loop never overlaps its own writes.
// With durationMs the loop runs for that long instead, so it spans a peer's control change.
export async function counterLoop({ repository, key, iterations, pad = '', clock = () => Date.now(), grants, durationMs = 0 }) {
    const commits = [], start = clock();
    for (let i = 0; durationMs ? clock() - start < durationMs && i < 100000 : i < iterations; i++) {
        let raw;
        try { raw = repository.inspect().values[key]; }
        catch (e) { commits.push({ ok: false, reason: e.code || 'read-failed', resolvedAt: clock() }); continue; }
        const current = JSON.parse(raw);
        const next = { ...current, probeCounter: (current.probeCounter || 0) + 1, probePad: pad };
        const result = await repository.runWrite({ expectedValues: { [key]: raw } }, draft => {
            draft.setItem(key, JSON.stringify(next));
            return { ok: true };
        });
        commits.push({ ok: result.ok === true && result.status === 'committed', reason: result.reason || null,
            grantAt: result.authorizedAt ?? grants?.last ?? null, resolvedAt: clock(), controlEpoch: result.authorityContext?.controlEpoch ?? null });
    }
    return commits;
}

export async function deleteLoop({ repository, key, iterations, pad = '' }) {
    const deleted = [];
    let rejected = 0;
    for (let i = 0; i < iterations; i++) {
        let raw;
        try { raw = repository.inspect().values[key]; } catch { rejected++; continue; }
        const envelope = JSON.parse(raw);
        const victim = envelope.items[0];
        if (!victim) break;
        const result = await repository.runWrite({ expectedValues: { [key]: raw } }, draft => {
            draft.setItem(key, JSON.stringify({ ...envelope, items: envelope.items.slice(1), probePad: pad }));
            return { ok: true };
        });
        if (result.ok === true && result.status === 'committed') deleted.push(victim.id); else rejected++;
    }
    return { deleted, rejected };
}

// Exclusive-lock grant timestamps for the Repository lock only.
export function instrumentLocks(repository, locks, clock = () => Date.now()) {
    const grants = { last: null };
    repository.locks = { request(name, options, callback) {
        if (typeof options === 'function') { callback = options; options = {}; }
        return locks.request(name, options, (...args) => {
            if (name === repository.lockName && options?.mode === 'exclusive') grants.last = clock();
            return callback(...args);
        });
    } };
    return grants;
}

const okCount = commits => commits.filter(c => c.ok).length;
export const rejections = commits => commits.filter(c => !c.ok)
    .reduce((acc, c) => ({ ...acc, [c.reason || 'unknown']: (acc[c.reason || 'unknown'] || 0) + 1 }), {});

// Oracles. A violation is an observed safety failure; zero is not a proof of safety.
export function classifySameKey({ commitsA, commitsB, finalCounter }) {
    const committed = okCount(commitsA) + okCount(commitsB);
    const lostUpdates = committed - finalCounter;
    return { committedA: okCount(commitsA), committedB: okCount(commitsB), committed, finalCounter, lostUpdates,
        violations: Math.max(0, lostUpdates), rejectedA: rejections(commitsA), rejectedB: rejections(commitsB) };
}

export function classifyDifferentKeys({ commitsA, commitsB, finalA, finalB }) {
    const lostA = okCount(commitsA) - finalA, lostB = okCount(commitsB) - finalB;
    return { committedA: okCount(commitsA), committedB: okCount(commitsB), finalA, finalB,
        lostA, lostB, violations: Math.max(0, lostA) + Math.max(0, lostB),
        rejectedA: rejections(commitsA), rejectedB: rejections(commitsB) };
}

export function classifyDeleteIntents({ deletedA, deletedB, journal, itemsA, itemsB }) {
    const intents = journal ? JSON.parse(journal) : {};
    const missing = [...deletedA.map(id => `metronome_preset/${id}`), ...deletedB.map(id => `my_app/${id}`)]
        .filter(key => !intents[key]);
    const resurrected = [...deletedA.filter(id => itemsA.includes(id)), ...deletedB.filter(id => itemsB.includes(id))];
    return { deleted: deletedA.length + deletedB.length, missingIntents: missing.length, resurrected: resurrected.length,
        violations: missing.length + resurrected.length, sampleMissing: missing.slice(0, 5) };
}

// A commit granted strictly after the other context finished publishing the
// control change must have been rejected. Clock skew can only hide violations.
export function classifyControl({ commits, changedAt }) {
    if (!Number.isFinite(changedAt)) return { changedAt: null, committedAfter: 0, violations: 0, inconclusive: true };
    const after = commits.filter(c => c.ok && Number.isFinite(c.grantAt) && c.grantAt > changedAt);
    // Attempts rejected before the lock (the change was observed) also prove the loop spanned it.
    const spanned = commits.some(c => Number.isFinite(c.resolvedAt) && c.resolvedAt > changedAt);
    return { changedAt, committed: okCount(commits), committedAfter: after.length, violations: after.length,
        // Without a grant after the change the round did not exercise the boundary.
        inconclusive: !spanned, rejected: rejections(commits) };
}

// Characterization never fails on violations; acceptance fails on any violation
// or on an unavailable backend (an absent backend can never pass acceptance).
export function verdict(mode, results) {
    const violations = results.reduce((sum, r) => sum + (r.violations || 0), 0);
    const unavailable = results.filter(r => r.status === 'backend-unavailable').length;
    // A scenario whose every round missed the boundary proves nothing either way.
    const unexercised = results.filter(r => r.rounds > 0 && r.inconclusiveRounds === r.rounds).length;
    if (mode === 'acceptance') return { pass: violations === 0 && unavailable === 0 && unexercised === 0 && results.length > 0,
        violations, unavailable, unexercised };
    return { pass: true, violations, unavailable, unexercised,
        characterization: violations ? 'defect-observed' : 'not-observed-not-proven' };
}
