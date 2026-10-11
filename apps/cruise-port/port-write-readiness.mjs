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
export function createProOperationResolver({ readAuth, client, now = Date.now, knownRevoked = () => false }) {
    return async action => {
        if (!proActions.has(action)) return { allowed: true, generation: null, validUntil: null };
        const auth = await readAuth();
        if (!auth || knownRevoked(auth)) return { allowed: false, generation: auth?.generation ?? null };
        const result = await client.validate(auth, { force: false });
        const current = await readAuth();
        if (!result.ok || current?.credential !== auth.credential || current?.generation !== auth.generation || knownRevoked(auth))
            return { allowed: false, generation: auth.generation };
        return { allowed: true, generation: auth.generation, credentialIdentity: auth.credential,
            validUntil: Number.isFinite(result.offlineRemainingMs) ? now() + result.offlineRemainingMs : now(), offline: result.offline === true };
    };
}

// Dependency injection is for isolated integration tests / future owner wiring.
// Production Studio never passes compatible-writer evidence or a write executor.
export function createOperationBoundary({ readContext, resolvePro, allWritersCompatible = false, now = Date.now, id = () => crypto.randomUUID() }) {
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
        async begin(action, base) {
            const { context, readiness } = await inspect(action, true);
            if (!readiness.allowed) throw failure(readiness.reason);
            const token = Object.freeze({ operationId: id(), action });
            operations.set(token, { context, base });
            return token;
        },
        async assertCurrent(token, { committed = false } = {}) {
            const original = operations.get(token);
            if (!original || disposed) throw failure('operation-invalid');
            const { context, readiness } = await inspect(token.action);
            const same = ['generation', 'accountGeneration', 'accountId', 'repositoryEpoch', 'writerProtocol']
                .every(key => context[key] === original.context[key]);
            if (!same) throw failure(committed ? 'local-saved-sync-unconfirmed' : 'account-generation-changed');
            if (!readiness.allowed) throw failure(readiness.reason);
            if (proActions.has(token.action)) {
                const proof = original.context.pro;
                if (!proof?.allowed || !Number.isFinite(proof.validUntil) || now() >= proof.validUntil || context.pro?.generation !== proof.generation ||
                    (context.pro?.credentialIdentity !== undefined && context.pro.credentialIdentity !== proof.credentialIdentity)) throw failure('pro-required');
            }
            return original.base;
        },
        dispose() { disposed = true; }
    });
}
