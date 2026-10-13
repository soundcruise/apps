// L2b isolated adapter. Explicit scope/open only; no product boot or cloud publish.
import { registerIsolatedRepositoryBackend } from './port-repository-backend.mjs?v=1.22.13';
import { openIDBAuthorityStore } from './port-indexeddb-authority-store.mjs';
import { PORT_DATASET_KEYS, PORT_DATASET_CATALOG, PORT_DATASET_PROTOCOL, preservePortFields } from './port-dataset-repository.js?v=1.22.13';
import { frozen, fail, identifier, validateDataset } from './port-idb-authority-contract.mjs';
import { validatePortLocalCollections } from './port-sync-local-validation.js?v=1.22.13';
import { loadMetronomeSettings } from './metronome-store.js?v=1.22.13';
import { loadTunerSettings } from './tuner-store.js?v=1.22.13';
const rejected = e => ({ ok: false, status: 'rejected', reason: e.code || 'read-failed' });
function validateDomainValues(values) {
    validateDataset(values);
    const view = { getItem: key => values[key] ?? null, setItem() {}, removeItem() {} };
    try { validatePortLocalCollections(view); } catch { throw fail('domain-invalid'); }
    if (!loadMetronomeSettings(view).ok || !loadTunerSettings(view).ok) throw fail('domain-invalid');
}
const stateOf = (snapshot, capable) => frozen({ protocol: PORT_DATASET_PROTOCOL, generation: snapshot.generation,
    revision: snapshot.head?.revision || snapshot.result.revision, values: { ...snapshot.values },
    keyRevisions: { ...snapshot.versions }, sharedWriteCapable: capable,
    cache: 'hydrated-display', seq: snapshot.head?.seq || snapshot.result.seq });

export async function openIsolatedIDBRepositoryBackend({ scope, generation, token = () => crypto.randomUUID(),
    channelFactory = name => typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null } = {}) {
    identifier(generation);
    const store = await openIDBAuthorityStore(scope);
    let snapshot = null, issue = 'authority-hydrating', disposed = false, refreshSerial = 0;
    const prepared = new WeakMap();
    let channel = null;
    try { channel = channelFactory(`sound-cruise:authority:${scope.name}:${generation}`); } catch {}
    function inspect() {
        if (disposed || store.status !== 'open') throw fail(disposed ? 'disposed' : store.status);
        if (issue || !snapshot) throw fail(issue || 'authority-hydrating');
        // Writable only when the partition pointer names this generation (schema v2).
        return stateOf(snapshot, snapshot.active === true && !snapshot.control.suspended && !snapshot.control.fenceRevoked &&
            !snapshot.control.identityInvalidated && !snapshot.control.recoveryRequired && snapshot.control.state === 'active');
    }
    async function hydrate() {
        if (disposed) throw fail('disposed');
        const serial = ++refreshSerial;
        const result = await store.hydrate(generation);
        if (serial !== refreshSerial) return inspect(); // never regress a newer refresh
        if (!result.ok || !result.snapshot) {
            snapshot = null; issue = result.reason || 'authority-absent'; throw fail(issue);
        }
        snapshot = result.snapshot; issue = null; return inspect();
    }
    // Missing notifications affect display freshness only. Writes always use the
    // Store's current head in its transaction, never a channel message/cache CAS.
    if (channel) channel.onmessage = () => { hydrate().catch(() => {}); };
    function captureRequest(request, authorizationContext, systemCapability) {
        let fixed = frozen(structuredClone(request));
        if (fixed.base?.generation !== generation) throw fail('base-generation-mismatch');
        validateDomainValues({ ...fixed.base.values, ...fixed.changes });
        const handle = store.prepare({ ...fixed, authorizationContext, systemCapability });
        fixed=frozen({...fixed,...store.preparedIdentity(handle)});
        const opaque = Object.freeze({ operationId: fixed.operationId, request: fixed });
        prepared.set(opaque, { handle, request: fixed, authorizationContext });
        return opaque;
    }
    async function prepareWrite({ expectedRevision, expectedValues, expectedKeyRevisions, source = 'local',
        preserveUnknown = true, assertCurrent = () => {}, operationId = token(), authorizationContext,
        dependencyKeys = [], acknowledgements = [], operationData = null, systemCapability } = {}, writer) {
        inspect(); // no fallback before hydration / after lifecycle failure
        const base = snapshot; // fixed before any caller await or notification
        const fixedDependencies = structuredClone(dependencyKeys), fixedAcknowledgements = structuredClone(acknowledgements),fixedOperationData=structuredClone(operationData);
        const expectedVersionKeys = Object.keys(expectedKeyRevisions || {});
        if (expectedRevision === undefined && expectedValues === undefined) throw fail('base-required');
        if (expectedRevision !== undefined && expectedRevision !== base.head.revision) throw fail('stale');
        for (const [key, raw] of Object.entries(expectedValues || {})) if (base.values[key] !== raw) throw fail('stale');
        for (const [key, version] of Object.entries(expectedKeyRevisions || {})) if (base.versions[key] !== version) throw fail('stale');
        await assertCurrent();
        const values = { ...base.values }, reads = new Set(Object.keys(expectedValues || {}));
        const view = { getItem(key) {
            if (!PORT_DATASET_KEYS.includes(key)) throw fail('unmanaged-key');
            reads.add(key); return values[key];
        }, setItem(key, value) {
            if (!PORT_DATASET_KEYS.includes(key)) throw fail('unmanaged-key'); values[key] = String(value);
        }, removeItem(key) {
            if (!PORT_DATASET_KEYS.includes(key)) throw fail('unmanaged-key'); values[key] = null;
        } };
        const result = await writer(view);
        await assertCurrent();
        if (result?.ok === false) return { rejected: { ...result, status: 'rejected' } };
        validateDataset(values);
        const changes = {};
        for (const key of PORT_DATASET_KEYS) if (values[key] !== base.values[key]) {
            if (preserveUnknown && PORT_DATASET_CATALOG[key] && !PORT_DATASET_CATALOG[key].scalar &&
                values[key] !== null && base.values[key] !== null) {
                values[key] = JSON.stringify(preservePortFields(JSON.parse(base.values[key]), JSON.parse(values[key])));
            }
            changes[key] = values[key];
        }
        const request = { base, operationId, action: source, changes,
            dependencyKeys: [...new Set([...fixedDependencies, ...reads, ...expectedVersionKeys,
                ...(expectedRevision !== undefined ? PORT_DATASET_KEYS : [])])], acknowledgements: fixedAcknowledgements,
            operationData:fixedOperationData,requiresAuthorization: authorizationContext !== undefined };
        const handle = captureRequest(request, authorizationContext, systemCapability);
        const reservation=await store.reserveOperation(prepared.get(handle).handle);
        if(!reservation.ok)return {rejected:reservation};
        prepared.get(handle).writerResult = result;
        return handle;
    }
    async function commitPreparedWrite(opaque, { commitGuard } = {}, notify = () => {}) {
        if (opaque?.rejected) return opaque.rejected;
        const p = prepared.get(opaque);
        if (!p) return rejected(fail('prepared-handle-invalid'));
        const fact = await store.commit(p.handle, { commitGuard });
        if (!fact.ok) {
            await hydrate().catch(() => {});
            return fact;
        }
        // This read refers to the committed immutable manifest, not current head.
        const historical = await store.readCommittedDataset(generation, fact.operationId);
        await hydrate().catch(() => {});
        const exactState = historical.ok && historical.result ? stateOf({ ...historical, generation }, false) : null;
        // A committed fact is never changed into a rejection after publication.
        const result = { ...p.writerResult, ...fact, state: exactState, retryRequest: p.request,
            ...(exactState ? {} : { recoveryRequired: true }) };
        if (!fact.replayed) {
            try { channel?.postMessage({ hint: 'head-changed' }); } catch {}
            try { notify(frozen({ source: p.request.action, operationId: fact.operationId, revision: fact.revision,
                generation, keys: Object.keys(p.request.changes), publish: false, operationAuthorized: false })); } catch {}
        }
        return result;
    }
    const backend = {
        kind: 'indexeddb-authority', store,
        get sharedWriteCapable() { try { return inspect().sharedWriteCapable; } catch { return false; } },
        inspect, hydrate, prepareWrite, commitPreparedWrite,
        async runWrite(options, writer, notify) {
            const commitGuard = options.commitGuard; // fixed at dispatch, before writer awaits
            try { return await commitPreparedWrite(await prepareWrite(options, writer), { commitGuard }, notify); }
            catch (e) { return { ...rejected(e), operationId: options.operationId }; }
        },
        // Reopen/response-loss retry requires the original serialized request.
        // No new base, context retag, or writer execution is inferred from an ID.
        async retryWrite(request, { authorizationContext, commitGuard, systemCapability } = {}) {
            try { return await commitPreparedWrite(captureRequest(request, authorizationContext, systemCapability), { commitGuard }); }
            catch (e) { return rejected(e); }
        },
        lookupOperation: operationId => store.lookupOperation(generation, operationId),
        dispose() { if (!disposed) { disposed = true; channel?.close(); store.dispose(); snapshot = null; issue = 'disposed'; } }
    };
    return Object.freeze(registerIsolatedRepositoryBackend(backend));
}
