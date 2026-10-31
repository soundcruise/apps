import { PRACTICE_KEYS } from './practice-projection.mjs?v=0.53.0';
import { LIBRARY_KEYS } from './library-projection.mjs?v=0.53.0';
// All I/O is deferred until explicit local inspection. No writer is exported.
const port = new URL('../../../cruise-port/', import.meta.url);
const shared = new URL('../../../shared/', import.meta.url);
const tokenPattern = /^scp1\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/;
export async function readExisting(indexedDB, name, store, key) {
    // Abort an absent DB's upgrade; inspection must not create its schema.
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        let absent = false;
        request.onupgradeneeded = () => { absent = true; request.transaction.abort(); };
        request.onerror = () => absent ? resolve(null) : reject(request.error);
        request.onblocked = () => reject(Error('storage-unavailable'));
        request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(store)) {
                db.close();
                if (name === 'sound-cruise-sync-account') reject(Error('account-schema-unsupported'));
                else resolve(null);
                return;
            }
            const tx = db.transaction(store, 'readonly'), read = key === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(key);
            tx.oncomplete = () => { const value = read.result ?? null; db.close(); resolve(value); };
            tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
        };
    });
}
export async function connectPortReadOnly(onChange, environment = globalThis) {
    const g = environment;
    // Definitions only: none of these modules activates the runtime.
    for (const [file, exists] of [
        ['sync-account-core.js', () => g.SoundCruiseSyncAccount?.core],
        ['sync-account-db.js', () => g.SoundCruiseSyncAccount?.storage],
        ['sync-account-client.js', () => g.SoundCruiseSyncAccount?.AccountClient],
        ['multi-app-sync-db.js', () => g.SoundCruiseMultiAppSync?.dataStorage],
        ['multi-app-sync-runtime.js', () => g.SoundCruiseMultiAppSync?.MultiAppSyncRuntime]
    ]) { if (!exists()) await import(new URL('sync-account/' + file, shared)); }
    if (!g.SoundCruisePortSync?.PortSyncAdapter) await import(new URL('port-sync-adapter.js', port));
    if (!g.SoundCruisePortSync?.createPortSyncReader) await import(new URL('port-sync-controller.js', port));
    if (!g.SoundCruiseProDeviceSession) await import(new URL('pro-device-session.js?v=5', shared));
    const { PortDatasetRepository } = await import(new URL('port-dataset-repository.js', port));
    let consumer = null, closed = false, offStatus = () => {};
    const reader = () => {
        if (closed) throw Error('host-disposed');
        if (!consumer) { consumer = g.SoundCruisePortSync.createPortSyncReader({ config: { enabled: true, admissionMode: 'production' } });
            offStatus = consumer.subscribe(() => { if (!closed) onChange(); }); }
        return consumer;
    };
    reader();
    let captured = {};
    const storage = { getItem(key) { const raw = g.localStorage.getItem(key); captured[key] = raw; return raw; } };
    const repository = new PortDatasetRepository({ storage, locks: g.navigator?.locks });
    const offRepo = repository.subscribe(onChange);
    const offAccount = g.SoundCruiseSyncAccount.storage.subscribeAccount(onChange);
    const changed = event => { if (event.key === null || event.key?.startsWith('cruisePort.') || event.key === 'soundCruiseProAuth') onChange(); };
    g.addEventListener('storage', changed);
    g.addEventListener('cruise-port-cloud-data-applied', onChange);
    g.addEventListener('cruise-port-local-data-changed', onChange);
    g.addEventListener('online', onChange); g.addEventListener('offline', onChange);
    let receiptReader;
    const readPro = async () => {
        const raw = g.localStorage.getItem('soundCruiseProAuth');
        if (!raw) return 'standard';
        let auth; try { auth = JSON.parse(raw); } catch { return 'unavailable'; }
        if (auth.v !== 2 || !tokenPattern.test(auth.credential) || !Number.isSafeInteger(auth.generation) || auth.generation <= 0) return 'unavailable';
        if (!g.SoundCruiseProDeviceSession.createReadOnlyClient) return 'unavailable';
        const client = receiptReader ||= g.SoundCruiseProDeviceSession.createReadOnlyClient({
            store: { read: key => readExisting(g.indexedDB, 'sound-cruise-pro-device-session-v1', 'state', key) },
            isCurrent: candidate => { try { const current = JSON.parse(g.localStorage.getItem('soundCruiseProAuth')); return !closed && current?.credential === candidate.credential && current?.generation === candidate.generation; } catch { return false; } } });
        const result = await client.allowance(auth);
        return result.ok ? { state: 'cached-valid', validUntil: Date.now() + result.offlineRemainingMs } : result.expired ? 'expired' : result.clockRollback || result.stale ? 'stale' : 'unknown';
    };
    return {
        readiness() {
            try { const state = repository.inspect(); return { repositoryProtocol: state.protocol, locksAvailable: repository.sharedWriteCapable }; }
            catch (error) { return { repositoryProtocol: error.code === 'protocol-mismatch' ? -1 : 1,
                locksAvailable: !!g.navigator?.locks?.request, recoveryRequired: error.code === 'recovery-required', forwardIncompatible: error.code === 'forward-incompatible' }; }
        },
        generation: () => g.SoundCruiseSyncAccount.storage.getGeneration(),
        cachedStatus: () => consumer?.getCachedStatus() || { known: false },
        account: () => readExisting(g.indexedDB, 'sound-cruise-sync-account', 'meta', 'account'),
        async localStatus() {
            const account = await readExisting(g.indexedDB, 'sound-cruise-sync-account', 'meta', 'account');
            if (!account?.accountId) return { known: true };
            const name = 'sound-cruise-sync-data-port-account-' + encodeURIComponent(account.accountId);
            const [credential, membership, runtimeState, outbox, conflicts] = await Promise.all([
                ...['credential', 'membership', 'runtimeState'].map(key => readExisting(g.indexedDB, name, 'meta', key)),
                readExisting(g.indexedDB, name, 'outbox'), readExisting(g.indexedDB, name, 'conflicts')]);
            const cached = reader().getCachedStatus();
            // Local inspection never publishes a Port owner state event. Such an
            // event could wake an active host's asset handlers in the same context.
            return { known: true, state: runtimeState?.value || 'unknown', membershipKnown: !!membership?.value,
                credentialState: membership?.value?.state === 'revoked' ? 'revoked'
                    : g.SoundCruiseSyncAccount.core.validAppCredential(credential?.value) && reader().identity?.accountId === account.accountId
                        ? cached.credentialState : 'unknown',
                pendingCount: outbox?.length || 0, conflictCount: conflicts?.length || 0 };
        }, identity: () => reader().identity,
        async dataset() {
            captured = {};
            let snapshot, state = 'available';
            try { snapshot = await repository.readDatasetState(); }
            catch (error) {
                if (error.code !== 'forward-incompatible') throw error;
                state = 'forward-incompatible';
                snapshot = { values: captured, generation: null, revision: JSON.stringify(captured) };
            }
            const raw = snapshot.values;
            const parse = key => { try { return JSON.parse(raw[key] || 'null'); } catch { return null; } };
            const presets = parse('cruisePort.metronomePresets');
            const digest = await g.crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshot.revision));
            const practiceValues = Object.fromEntries(PRACTICE_KEYS.map(key => [key, raw[key] ?? null]));
            const libraryValues = Object.fromEntries(LIBRARY_KEYS.map(key => [key, raw[key] ?? null]));
            return { revision: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''), generation: snapshot.generation, practiceValues, libraryValues,
                state, presetsSchema: presets?.version ?? null, metronome: parse('cruisePort.metronome'), presets: Array.isArray(presets?.items) ? presets.items : [] };
        },
        pro: readPro,
        detachConsumer() { offStatus(); consumer?.release(); consumer = null; },
        dispose() { if (closed) return; closed = true; offRepo(); offAccount(); offStatus(); consumer?.release(); consumer = null;
            g.removeEventListener('storage', changed); g.removeEventListener('cruise-port-cloud-data-applied', onChange);
            g.removeEventListener('cruise-port-local-data-changed', onChange);
            g.removeEventListener('online', onChange); g.removeEventListener('offline', onChange); }
    };
}
