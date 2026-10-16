// Port owns the data. Only narrow frozen read models cross this boundary.
import { projectPractice } from './practice-projection.mjs?v=0.40.3';
import { projectLibrary } from './library-projection.mjs?v=0.40.3';
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const closedCapabilities = freeze({ canSaveBpm: false, canSaveAdvanced: false, canListPresets: true, canApplyPreset: false, canCreatePreset: false, canDeletePreset: false, canQueueSync: false, canPushCloud: false });
const unknown = generation => freeze({ generation, canRead: true, canWrite: false, account: 'unknown', accountId: null, sync: 'unknown', pro: 'unknown', dataset: null });
export function createPortDataHost({ connect, schema }) {
    let state = unknown(0), generation = 0, disposed = false, connection = null, opening = null, requested = false, requestId = 0, expiryTimer = null;
    const listeners = new Set();
    let readiness = freeze({ state: 'read-only', allowed: false, reason: 'old-build-unknown' });
    const publish = next => { state = freeze(next); for (const fn of listeners) { try { fn(state); } catch { /* An observer cannot invalidate the read. */ } } };
    const invalidate = () => {
        if (disposed) return;
        generation++; requestId++; readiness = freeze({ state: 'read-only', allowed: false, reason: 'old-build-unknown' }); clearTimeout(expiryTimer); expiryTimer = null; publish(unknown(generation));
        connection?.detachConsumer();
        if (requested) void readLocalStatus();
    };
    async function ready() {
        if (!opening) opening = Promise.resolve().then(() => connect(invalidate)).then(value => {
            if (disposed) { value.dispose(); return null; }
            connection = value; return value;
        }).catch(error => { opening = null; throw error; });
        return opening;
    }
    async function readLocalStatus() {
        if (disposed) return state;
        requested = true;
        const epoch = generation, sequence = ++requestId;
        try {
            const source = await ready();
            if (!source || disposed || epoch !== generation || sequence !== requestId) return state;
            const accountEpoch = source.generation();
            const current = () => !disposed && epoch === generation && sequence === requestId && source.generation() === accountEpoch;
            const account = await source.account();
            if (!current()) return state;
            const [local, dataset, pro] = await Promise.all([source.localStatus(), source.dataset(), source.pro()]);
            if (!current()) return state;
            const currentAccount = await source.account();
            if (disposed || epoch !== generation || sequence !== requestId || source.generation() !== accountEpoch) return state;
            if (account?.accountId !== currentAccount?.accountId || account?.accountCredential !== currentAccount?.accountCredential) { invalidate(); return state; }
            const proState = typeof pro === 'string' ? pro : pro.state;
            const proAllowed = proState === 'cached-valid';
            clearTimeout(expiryTimer); expiryTimer = null;
            if (proAllowed && Number.isFinite(pro.validUntil)) expiryTimer = setTimeout(invalidate, Math.max(1, Math.min(2147483647, pro.validUntil - Date.now())));
            const decode = raw => {
                const result = schema.decode(raw);
                if (!result.ok) return { schemaState: result.forwardIncompatible ? 'forward-incompatible' : 'invalid', savedBpm: Number.isInteger(raw?.bpm) ? raw.bpm : null, effective: null };
                return { schemaState: result.migrated ? 'legacy-view' : 'current', savedBpm: result.data.bpm, effective: schema.effective(schema.normalize(result.data), { metronomeAdvanced: proAllowed }) };
            };
            const settings = dataset.metronome === null ? { schemaState: 'absent', savedBpm: null, effective: null } : decode(dataset.metronome);
            const presets = (dataset.presets || []).filter(item => typeof item?.id === 'string' && typeof item?.name === 'string').map((item, order) => ({ id: item.id, name: item.name, order, ...decode({ ...item, version: dataset.presetsSchema > 1 ? 999 : 3 }) }));
            const sync = local.conflictCount ? 'conflict' : local.pendingCount ? 'pending' : local.credentialState === 'usable' ? 'synced' : local.state === 'error' ? 'error' : 'unknown';
            publish({ generation, canRead: true, canWrite: false, account: account?.accountId ? (local.membershipKnown ? 'membership-known' : 'account-known') : 'no-account-known', accountId: account?.accountId || null,
                runtimeGeneration: source.identity()?.generation ?? null, sync, pro: proState,
                dataset: { revision: dataset.revision, repositoryGeneration: dataset.generation, state: dataset.state, settings, presets, practice: projectPractice(dataset.practiceValues), library: projectLibrary(dataset.libraryValues) } });
        } catch (_) {
            if (!disposed && epoch === generation && sequence === requestId) publish({ ...unknown(generation), account: 'unavailable', pro: 'unavailable' });
        }
        return state;
    }
    async function checkWriteReadiness({ action = 'saveBpm' } = {}) {
        if (disposed) return freeze({ state: 'blocked', allowed: false, reason: 'disposed' });
        await readLocalStatus();
        const epoch = generation;
        const { evaluateWriteReadiness } = await import('../../../cruise-port/port-write-readiness.mjs');
        if (disposed || epoch !== generation) return freeze({ state: 'blocked', allowed: false, reason: 'account-generation-changed' });
        const facts = connection?.readiness?.() || {};
        readiness = evaluateWriteReadiness({ ...facts, writerProtocol: 1, repositoryProtocol: facts.repositoryProtocol ?? 1,
            forwardIncompatible: state.dataset?.state === 'forward-incompatible' || facts.forwardIncompatible,
            conflict: state.sync === 'conflict' }, action, { allWritersCompatible: false });
        return readiness;
    }
    return Object.freeze({
        getCapabilities: () => closedCapabilities,
        getWriteReadiness: () => readiness,
        checkWriteReadiness,
        async enableLocalWrites({ userIntent } = {}) {
            if (userIntent !== true) return freeze({ state: 'blocked', allowed: false, reason: 'user-intent-required' });
            return checkWriteReadiness({ action: 'saveBpm' });
        },
        async activateSync({ userIntent } = {}) {
            if (userIntent !== true) return freeze({ state: 'blocked', allowed: false, reason: 'user-intent-required' });
            // No owner acquisition while production compatibility is unproven.
            return checkWriteReadiness({ action: 'pushCloud' });
        },
        canRead: true, canWrite: false, getCachedStatus: () => state.sync === 'synced' && connection?.cachedStatus && connection.cachedStatus().credentialState !== 'usable' ? freeze({ ...state, sync: 'unknown' }) : state, readLocalStatus,
        subscribe(fn) { if (disposed) return () => {}; listeners.add(fn); return () => listeners.delete(fn); },
        dispose() { if (disposed) return; disposed = true; generation++; requestId++; requested = false; clearTimeout(expiryTimer); expiryTimer = null; connection?.dispose(); listeners.clear(); state = unknown(generation); readiness = freeze({ state: 'blocked', allowed: false, reason: 'disposed' }); }
    });
}
