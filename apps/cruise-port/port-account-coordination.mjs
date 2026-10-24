// Dormant, explicitly isolated Account/Authority coordination. Importing this
// module performs no I/O and installs no writer, credential or Sync runtime.
import { openIDBAuthorityStore, claimPortAuthorityIssuer, authorityProEnvironment } from './port-indexeddb-authority-store.mjs';
import { equal, frozen, fail, identifier } from './port-idb-authority-contract.mjs';

export const PORT_ACCOUNT_CONTEXT_VERSION = 1;
const positive = value => Number.isSafeInteger(value) && value > 0;
const accountKey = account => account && typeof account.accountId === 'string' && account.accountId &&
    typeof account.accountCredential === 'string' && account.accountCredential
    ? [account.accountId, account.accountCredential, account.accountDeviceId ?? null] : null;

// Explicit inspection only. In particular, an absent Account database is never
// upgraded/created just to display a badge or to capture a context.
export function readExistingPortAccount(indexedDB) {
    return new Promise((resolve, reject) => {
        let absent = false, settled = false;
        const request = indexedDB.open('sound-cruise-sync-account');
        const finish = (value, error) => {
            if (settled) return;
            settled = true;
            error ? reject(fail('account-context-storage-unavailable')) : resolve(value);
        };
        request.onupgradeneeded = () => { absent = true; request.transaction.abort(); };
        request.onerror = () => finish(null, !absent);
        request.onblocked = () => finish(null, true);
        request.onsuccess = () => {
            const db = request.result;
            if (settled) { db.close(); return; }
            db.onversionchange = () => db.close();
            try {
                if (!db.objectStoreNames.contains('meta')) { db.close(); finish(null, true); return; }
                const tx = db.transaction('meta', 'readonly'), read = tx.objectStore('meta').get('account');
                tx.oncomplete = () => { db.close(); finish(read.result ?? null); };
                tx.onabort = tx.onerror = () => { db.close(); finish(null, true); };
            } catch { db.close(); finish(null, true); }
        };
    });
}

// A server summary is only an observation, never a fence, capability or proof.
// The two server generations must not be synthesized from the UI generation.
export function projectPortAccountIdentity(account, summary) {
    const membership = Array.isArray(summary?.memberships) ? summary.memberships.filter(value => value?.appId === 'port') : null;
    if (!accountKey(account) || summary?.account?.id !== account.accountId || summary.account.state !== 'active' ||
        !positive(summary.account.generation) || membership?.length !== 1 || membership[0].state !== 'active' ||
        typeof membership[0].id !== 'string' || !membership[0].id || !positive(membership[0].generation)) return null;
    return frozen({ appId: 'port', accountId: account.accountId, accountGeneration: summary.account.generation,
        membershipId: membership[0].id, membershipGeneration: membership[0].generation });
}

/**
 * Fixture-only cooperation boundary. Callers explicitly provide the existing
 * Shared Account storage and Web Locks from their disposable environment. The
 * actual Control provider still requires the Store's privileged fixture brand.
 * No ordinary route imports/calls this factory. No arbitrary onStop callback is
 * accepted as durable evidence. No value returned here grants write access.
 */
export async function createIsolatedPortAccountCoordinator({ scope, indexedDB, accountStorage, locks } = {}) {
    if (!/^sound-cruise-port-authority-v1-fixture-[A-Za-z0-9_-]+$/.test(scope?.name ?? '') ||
        !indexedDB?.open || !locks?.request ||
        ['getGeneration', 'subscribeAccount', 'changeAccountIfCurrent'].some(name => typeof accountStorage?.[name] !== 'function')) {
        throw fail('account-coordination-isolation-required');
    }
    const environment = authorityProEnvironment(scope);
    environment.assertLive();
    const store = await openIDBAuthorityStore(scope);
    let issuer;
    try { issuer = claimPortAuthorityIssuer(scope); }
    catch (error) { store.dispose(); throw error; }
    const contexts = new WeakMap(), listeners = new Set();
    let disposed = false, revision = 0;
    let status = frozen({ contractVersion: 1, state: 'unknown', uiRevision: revision, canWrite: false });
    const publish = value => {
        status = frozen({ contractVersion: 1, ...value, uiRevision: revision, canWrite: false });
        for (const listener of listeners) { try { listener(status); } catch { /* observer only */ } }
    };
    const invalidate = () => { revision++; publish({ state: 'stale' }); };
    const unsubscribe = accountStorage.subscribeAccount(invalidate);
    const live = () => { environment.assertLive(); if (disposed) throw fail('account-context-disposed'); };
    const localGeneration = () => {
        const value = accountStorage.getGeneration();
        if (!Number.isSafeInteger(value) || value < 0) throw fail('account-context-generation-invalid');
        return value;
    };
    const read = () => readExistingPortAccount(indexedDB);
    async function current(context) {
        live();
        if (context.blocked || context.revision !== revision || context.localGeneration !== localGeneration()) return false;
        const record = await read();
        live();
        return !context.blocked && context.revision === revision && context.localGeneration === localGeneration() &&
            equal(accountKey(record), context.accountKey);
    }
    const lockName = 'sound-cruise-port-account-coordination-v1:' + scope.partitionId;
    return Object.freeze({
        getCachedStatus: () => status,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        async observe({ generation, summary } = {}) {
            live(); identifier(generation);
            const version = revision, local = localGeneration(), account = await read();
            live();
            const identity = projectPortAccountIdentity(account, summary);
            const hydrated = await store.hydrate(generation);
            const record = await read(); live();
            if (version !== revision || local !== localGeneration() || !equal(accountKey(account), accountKey(record))) {
                publish({ state: 'stale' }); return null;
            }
            const transitions = await store.accountTransitions(generation);
            const finalRecord = await read(); live();
            if (version !== revision || local !== localGeneration() || !equal(accountKey(record), accountKey(finalRecord))) {
                publish({ state: 'stale' }); return null;
            }
            if (!transitions.ok || transitions.recoveryRequired) {
                publish({ state: 'recovery-required', authorityGeneration: generation }); return null;
            }
            const control = hydrated.snapshot?.control;
            if (transitions.controlEpoch !== (control?.epoch ?? null)) {
                publish({ state: 'stale' }); return null;
            }
            const compatible = identity && control?.identity?.ownership === 'bound-account' &&
                Object.keys(identity).every(key => control.identity[key] === identity[key]);
            const state = !accountKey(record) ? 'no-account' : !identity ? 'unknown' : !compatible ? 'identity-mismatch'
                : hydrated.readiness === 'writable' ? 'known' : hydrated.readiness;
            publish({ state, localGeneration: local, serverIdentity: identity,
                authorityGeneration: generation, controlEpoch: control?.epoch ?? null,
                serverObservationOnly: true });
            if (!compatible || state !== 'known') return null;
            const token = Object.freeze({});
            contexts.set(token, { revision, localGeneration: local, accountKey: accountKey(record),
                generation, controlEpoch: control.epoch, pointerEpoch: hydrated.snapshot.pointer.pointerEpoch,
                identity: frozen(structuredClone(control.identity)), blocked: false });
            return token;
        },
        // Stop is durable BEFORE an Account publication is submitted. Notifications
        // can invalidate a local observation sooner but are not this barrier.
        async transition({ context: token, operationId, nextAccount, kind = nextAccount === null ? 'detach' : 'switch' } = {}) {
            identifier(operationId);
            const context = contexts.get(token);
            if (!context || !['switch', 'detach', 'revoke'].includes(kind) ||
                (kind === 'switch' ? !accountKey(nextAccount) : nextAccount !== null)) throw fail('account-context-invalid');
            // Copy before the first await; callers cannot retag the destination.
            const replacement = nextAccount === null ? null : structuredClone(nextAccount);
            return locks.request(lockName, { mode: 'exclusive' }, async () => {
                if (!await current(context)) return frozen({ ok: false, reason: 'account-context-stale', canWrite: false });
                context.blocked = true; // irreversible even on abort/failure
                revision++; publish({ state: 'stopping' });
                let stopped;
                try {
                    const capability = issuer.issue('control:invalidate', { generation: context.generation });
                    stopped = await store.beginAccountTransition({ generation: context.generation, operationId,
                        identity: context.identity, expectedEpoch: context.controlEpoch, expectedPointerEpoch: context.pointerEpoch,
                        kind, destination: replacement === null ? null :
                            { accountId: replacement.accountId, accountDeviceId: replacement.accountDeviceId ?? null }, capability });
                    live();
                    if (!stopped.ok || stopped.replayed) throw fail(stopped.reason || 'account-intent-historical-only');
                    // Re-read even if a cross-tab notification was lost. A delayed
                    // A response must never replace/clear a newly installed B.
                    const record = await read(); live();
                    if (!equal(accountKey(record), context.accountKey) || context.localGeneration !== localGeneration()) {
                        publish({ state: 'stale' });
                        return frozen({ ok: false, reason: 'account-context-stale', stopped: true, canWrite: false });
                    }
                    await accountStorage.changeAccountIfCurrent({ accountId: context.accountKey[0],
                        accountCredential: context.accountKey[1], accountDeviceId: context.accountKey[2] }, replacement, indexedDB);
                    live();
                    // Without a durable Shared mutation receipt a same-Account
                    // credential rotation cannot be attributed after an ABA/reopen.
                    // Preserve the completed CAS, but do not certify the intent.
                    if (replacement?.accountId === context.accountKey[0]) throw fail('account-transition-receipt-required');
                    const confirmed = await store.confirmAccountTransition({ generation: context.generation, operationId, capability, receipt: stopped });
                    live();
                    if (!confirmed.ok) throw fail(confirmed.reason);
                    publish({ state: 'stopped', authorityGeneration: context.generation, controlEpoch: stopped.controlEpoch });
                    return frozen({ ok: true, status: 'account-transition-complete', stopped: true,
                        historical: true, operationAuthorized: false, canWrite: false });
                } catch (error) {
                    publish({ state: 'recovery-required' });
                    return frozen({ ok: false, reason: error.code || 'account-transition-storage-failed',
                        stopped: !!stopped?.ok, recoveryRequired: true, canWrite: false });
                }
            });
        },
        dispose() {
            if (disposed) return;
            disposed = true; revision++; unsubscribe(); listeners.clear(); store.dispose();
            status = frozen({ contractVersion: 1, state: 'disposed', uiRevision: revision, canWrite: false });
        }
    });
}
