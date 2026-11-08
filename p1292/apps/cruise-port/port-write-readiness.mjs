// Action policy and operation fences. No storage, network or owner acquisition.
export const PORT_WRITER_PROTOCOL = 1;
export const PORT_REPOSITORY_PROTOCOL = 1;
export const ACTIONS = Object.freeze(['saveBpm', 'saveAdvanced', 'listPresets', 'applyPreset', 'createPreset', 'deletePreset', 'queueSync', 'pushCloud']);
const proActions = new Set(['saveAdvanced', 'createPreset', 'queueSync', 'pushCloud']);
const cloudActions = new Set(['queueSync', 'pushCloud']);
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
const failure = reason => Object.assign(new Error(reason), { code: reason });

export function evaluateWriteReadiness(context, action, { allWritersCompatible = false } = {}) {
    if (!ACTIONS.includes(action)) return frozen({ state: 'blocked', allowed: false, reason: 'unknown-action' });
    if (context.disposed) return frozen({ state: 'blocked', allowed: false, reason: 'disposed' });
    if (action === 'listPresets') return frozen({ state: 'read-only', allowed: true, reason: null });
    let reason = context.disposed ? 'disposed' : context.partitionCompatible === false ? 'storage-partition-mismatch'
        : context.locksAvailable !== true ? 'locks-unavailable'
        : context.repositoryProtocol !== PORT_REPOSITORY_PROTOCOL || context.writerProtocol !== PORT_WRITER_PROTOCOL ? 'protocol-mismatch'
        : context.recoveryRequired ? 'repository-recovery-required'
        : context.forwardIncompatible ? 'forward-schema'
        : context.conflict ? 'conflict'
        : !allWritersCompatible ? 'old-build-unknown' : null;
    if (!reason && proActions.has(action) && context.pro?.allowed !== true) reason = 'pro-required';
    if (!reason && cloudActions.has(action)) {
        if (!context.accountId || !context.accountConfigured || !context.appDeviceKnown) reason = 'account-required';
        else if (!context.membershipActive) reason = 'membership-required';
        else if (!context.syncActivated) reason = 'activation-required';
        else if (action === 'pushCloud' && context.online !== true) reason = 'offline';
    }
    return frozen({ state: reason === 'repository-recovery-required' ? 'recovery-required' : reason ? 'blocked' : 'ready-local',
        allowed: !reason, reason });
}

// Uses the existing operational device-session client, not a display badge.
// validate(false) honors the existing cached/offline lease and renewal policy.
// Never called by cached readiness or by a production-blocked write.
export function createProOperationResolver({ readAuth, readAuthSync, client, now = Date.now,
    monotonicNow = () => globalThis.performance?.now?.(), knownRevoked = () => false }) {
    const proofs = new WeakMap();
    const fingerprint = auth => JSON.stringify([auth?.credential, auth?.generation, auth?.operationRevision, auth?.sessionVersion]);
    const resolver = async action => {
        if (!proActions.has(action)) return { allowed: true, generation: null, validUntil: null };
        const sourceAuth = await readAuth();
        const auth = sourceAuth && { ...sourceAuth }, wall = now(), mono = monotonicNow();
        if (!auth || typeof auth.credential !== 'string' || !auth.credential || !Number.isSafeInteger(auth.generation) || auth.generation < 1 || knownRevoked(auth)) return { allowed: false, generation: auth?.generation ?? null };
        const result = await client.validate(auth, { force: false });
        const current = await readAuth();
        if (!result.ok || fingerprint(current) !== fingerprint(auth) || knownRevoked(auth) ||
            !Number.isFinite(result.offlineRemainingMs) || result.offlineRemainingMs <= 0 || result.offlineRemainingMs > 7 * 86400000 ||
            !Number.isFinite(wall) || wall < 0 || !Number.isFinite(mono) || mono < 0 ||
            !Number.isFinite(wall + result.offlineRemainingMs) || !Number.isFinite(mono + result.offlineRemainingMs)) return { allowed: false, generation: auth.generation };
        // Anchor before validation: processing time can shorten, never extend, the lease.
        const proof = Object.freeze({ allowed: true, generation: auth.generation, credentialIdentity: auth.credential,
            validUntil: wall + result.offlineRemainingMs, offline: result.offline === true });
        proofs.set(proof, { fingerprint: fingerprint(auth), wallDeadline: proof.validUntil,
            monoDeadline: mono + result.offlineRemainingMs, wallHigh: wall, monoHigh: mono,
            wallAnchor: wall, monoAnchor: mono, blocked: false });
        return proof;
    };
    resolver.assertCommit = proof => {
        const record = proofs.get(proof);
        if (!record || typeof readAuthSync !== 'function') throw failure('pro-proof-unavailable');
        const auth = readAuthSync();
        if (auth?.then || !auth || fingerprint(auth) !== record.fingerprint || knownRevoked(auth)) throw failure('pro-required');
        const wall = now(), mono = monotonicNow();
        if (!Number.isFinite(wall) || !Number.isFinite(mono) || mono < record.monoHigh) record.blocked = true;
        const high = Math.max(record.wallHigh, wall, record.wallAnchor + Math.max(0, mono - record.monoAnchor));
        // Same five-minute rollback tolerance as Pro Device Session; the independent
        // monotonic deadline still prevents extending a lease by a small rollback.
        if (wall < high - 300000 || wall >= record.wallDeadline || mono >= record.monoDeadline) record.blocked = true;
        record.wallHigh = high; record.monoHigh = Math.max(record.monoHigh, mono);
        if (record.blocked) throw failure('pro-required');
    };
    // Read-only view of the existing private operation budget, for the dormant
    // Authority adapter. Legacy guards retain their existing return contract.
    resolver.commitMargins = proof => {
        resolver.assertCommit(proof);
        const record = proofs.get(proof);
        return Object.freeze({ wallMarginMs: record.wallDeadline - record.wallHigh,
            monoMarginMs: record.monoDeadline - record.monoHigh });
    };
    return Object.freeze(resolver);
}

// Dependency injection is for isolated integration tests / future owner wiring.
// Production Studio never passes compatible-writer evidence or a write executor.
export function createOperationBoundary({ readContext, readContextSync, resolvePro, allWritersCompatible = false, now = Date.now, id = () => crypto.randomUUID() }) {
    let disposed = false;
    const operations = new WeakMap();
    async function inspect(action, authorize = false) {
        const context = { ...await readContext(), disposed };
        const infrastructure = evaluateWriteReadiness({ ...context, pro: { allowed: true }, accountConfigured: true,
            appDeviceKnown: true, membershipActive: true, syncActivated: true, online: true, accountId: context.accountId || 'inspection' }, action, { allWritersCompatible });
        if (!infrastructure.allowed) return { context, readiness: infrastructure };
        // Status-only inspection must never renew or create credentials.
        context.pro = authorize && proActions.has(action) ? await resolvePro(action) : context.pro;
        if (authorize && proActions.has(action) && context.pro?.allowed && (!Number.isFinite(context.pro.validUntil) || now() >= context.pro.validUntil)) context.pro = { ...context.pro, allowed: false };
        return { context, readiness: evaluateWriteReadiness(context, action, { allWritersCompatible }) };
    }
    return Object.freeze({
        async check(action) { return (await inspect(action)).readiness; },
        async begin(action, base, { targetKeys = [] } = {}) {
            const { context, readiness } = await inspect(action, true);
            if (!readiness.allowed) throw failure(readiness.reason);
            const token = Object.freeze({ operationId: id(), action });
            operations.set(token, { context: frozen({ ...structuredClone({ ...context, pro: undefined }), pro: context.pro }),
                base: frozen(structuredClone(base)), targetKeys: Object.freeze([...targetKeys]) });
            return token;
        },
        async assertCurrent(token, { committed = false } = {}) {
            const original = operations.get(token);
            if (!original || disposed) throw failure('operation-invalid');
            const { context } = await inspect(token.action);
            const same = ['generation','accountGeneration','accountId','membershipId','membershipGeneration','authorityGeneration','repositoryEpoch','writerProtocol','repositoryProtocol']
                .every(key => context[key] === original.context[key]);
            if (!same) throw failure(committed ? 'local-saved-sync-unconfirmed' : 'account-generation-changed');
            if (proActions.has(token.action)) {
                const proof = original.context.pro;
                if (!proof?.allowed || !Number.isFinite(proof.validUntil) || now() >= proof.validUntil ||
                    (context.pro?.generation !== undefined && context.pro.generation !== proof.generation) ||
                    (context.pro?.credentialIdentity !== undefined && context.pro.credentialIdentity !== proof.credentialIdentity)) throw failure('pro-required');
                resolvePro.assertCommit?.(proof);
            }
            const readiness = evaluateWriteReadiness({ ...context,
                pro: proActions.has(token.action) ? original.context.pro : context.pro }, token.action, { allWritersCompatible });
            if (!readiness.allowed) throw failure(readiness.reason);
            return original.base;
        },
        commitGuard(token, details = {}) {
            const original = operations.get(token);
            if (!original || disposed) throw failure('operation-invalid');
            if (typeof readContextSync !== 'function') throw failure('operation-source-unavailable');
            const current = readContextSync();
            if (!current || current.then) throw failure('operation-source-unavailable');
            for (const key of ['generation','accountId','accountGeneration','membershipId','membershipGeneration',
                'authorityGeneration','repositoryEpoch','writerProtocol','repositoryProtocol'])
                if (current[key] !== original.context[key]) throw failure('account-generation-changed');
            if (details.operationId !== undefined && details.operationId !== token.operationId) throw failure('operation-invalid');
            if (details.changedKeys?.some(key => key !== 'cruisePort.syncDeletionIntent.v1' && !original.targetKeys.includes(key)))
                throw failure('operation-target-changed');
            for (const key of original.targetKeys) {
                if (details.before && (details.before.values[key] !== original.base.values?.[key] ||
                    (details.before.keyRevisions[key] ?? null) !== (original.base.keyRevisions?.[key] ?? null))) throw failure('stale');
            }
            if (proActions.has(token.action)) {
                if (typeof resolvePro.assertCommit !== 'function') throw failure('pro-proof-unavailable');
                resolvePro.assertCommit(original.context.pro);
            }
            const readiness = evaluateWriteReadiness({ ...current, disposed,
                pro: proActions.has(token.action) ? original.context.pro : current.pro }, token.action, { allWritersCompatible });
            if (!readiness.allowed) throw failure(readiness.reason);
        },
        dispose() { disposed = true; }
    });
}
