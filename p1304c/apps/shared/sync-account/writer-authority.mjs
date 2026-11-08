// Pure wire contract; no credentials, storage, feature metadata or activation.
export const AUTHORITY_WRITER_PROTOCOL = 2;
export const SYNC_WIRE_PROTOCOL = 1;
export const WRITER_FIELDS = Object.freeze(['writerProtocol', 'syncProtocol', 'expectedWriteEpoch']);
export const WRITER_HEADERS = Object.freeze({ writerProtocol: 'x-sound-cruise-writer-protocol',
    syncProtocol: 'x-sound-cruise-sync-protocol', expectedWriteEpoch: 'x-sound-cruise-write-epoch' });
export const AUTHORITY_ERROR_CODES = Object.freeze(['writer_protocol_required', 'writer_protocol_outdated',
    'writer_protocol_unsupported', 'sync_protocol_unsupported', 'writer_protocol_invalid',
    'sync_protocol_invalid', 'dataset_epoch_invalid', 'dataset_epoch_stale', 'dataset_authority_unavailable']);

export function parseWriterFields(input) {
    const value = {};
    for (const field of WRITER_FIELDS) {
        if (!Object.hasOwn(input, field)) continue;
        const number = input[field];
        const code = field === 'expectedWriteEpoch' ? 'dataset_epoch_invalid'
            : field === 'syncProtocol' ? 'sync_protocol_invalid' : 'writer_protocol_invalid';
        if (!Number.isSafeInteger(number) || number < 1) return { ok: false, code, status: 400 };
        if (field !== 'expectedWriteEpoch' && number > (field === 'writerProtocol' ? AUTHORITY_WRITER_PROTOCOL : SYNC_WIRE_PROTOCOL))
            return { ok: false, code: field === 'writerProtocol' ? 'writer_protocol_unsupported' : 'sync_protocol_unsupported', status: 409 };
        value[field] = number;
    }
    return { ok: true, value: Object.freeze(value) };
}

export function writerFieldsFromHeaders(headers) {
    const value = {};
    for (const [field, name] of Object.entries(WRITER_HEADERS)) {
        const raw = headers.get(name);
        if (raw !== null) value[field] = /^[1-9][0-9]*$/.test(raw) ? Number(raw) : NaN;
    }
    return value;
}

// Explicit injection only. B1-1 production uses no wire context: the old Worker
// has not been deployed, and legacy local storage is not a new authority.
export function createWriterWireContext({ expectedWriteEpoch, accountId, appId, authorityState = 'protocol-capable', localAuthorityGeneration = null } = {}) {
    if (accountId !== undefined && (typeof accountId !== 'string' || !accountId || appId !== 'port' ||
        !['protocol-capable', 'authority-prepared'].includes(authorityState) ||
        (authorityState === 'authority-prepared' && (expectedWriteEpoch === undefined || typeof localAuthorityGeneration !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(localAuthorityGeneration))) ||
        (authorityState === 'protocol-capable' && localAuthorityGeneration !== null)))
        throw Object.assign(new Error('dataset_authority_unavailable'), { code: 'dataset_authority_unavailable' });
    const fields = { writerProtocol: AUTHORITY_WRITER_PROTOCOL, syncProtocol: SYNC_WIRE_PROTOCOL,
        ...(expectedWriteEpoch === undefined ? {} : { expectedWriteEpoch }) };
    const parsed = parseWriterFields(fields);
    if (!parsed.ok) throw Object.assign(new Error(parsed.code), { code: parsed.code });
    return Object.freeze({
        fields: parsed.value,
        context: accountId === undefined ? null : Object.freeze({ accountId, appId, authorityState, localAuthorityGeneration }),
        envelope(body) { return { ...body, ...parsed.value }; },
        headers() { return Object.fromEntries(Object.entries(parsed.value).map(([key, value]) => [WRITER_HEADERS[key], String(value)])); }
    });
}

export function authorityFailureState(code) {
    return code === 'dataset_epoch_stale' ? 'stale-epoch'
        : /(?:required|outdated|unsupported)$/.test(code) ? 'needs-upgrade' : 'blocked-authority';
}

// Explicit owner action in a compatible environment. Normal Port boot never calls this.
// The authenticated runtime is the only network boundary; no credential enters metadata.
export function createWriterAuthorityClient({ runtime, readLocalAuthority = () => ({ state: 'legacy' }) }) {
    let state = Object.freeze({ state: 'protocol-capable', wireMode: 'legacy', expectedWriteEpoch: null });
    return Object.freeze({
        snapshot: () => state,
        async prepare(currentRuntime = runtime) {
            const accountId = currentRuntime.executionAccountId, appId = currentRuntime.appId;
            if (!accountId || appId !== 'port') throw Object.assign(new Error('sync_identity_required'), { code: 'sync_identity_required' });
            await currentRuntime.assertCurrentAsync(); currentRuntime.assertActive();
            const response = await currentRuntime.request('GET', `/v1/sync/writer-authority?appId=${encodeURIComponent(appId)}`);
            await currentRuntime.assertCurrentAsync(); currentRuntime.assertActive();
            const server = response.authority;
            if (server?.accountId !== accountId || server?.appId !== appId ||
                !Number.isSafeInteger(server.writeEpoch) || server.writeEpoch < 1 ||
                !['legacy', 'prepared', 'enforced', 'paused'].includes(server.state) ||
                !Number.isSafeInteger(server.minimumWriterProtocol) || server.minimumWriterProtocol < 0)
                throw Object.assign(new Error('dataset_authority_unavailable'), { code: 'dataset_authority_unavailable' });
            if (server.minimumWriterProtocol > AUTHORITY_WRITER_PROTOCOL || server.state === 'paused')
                throw Object.assign(new Error('dataset_authority_unavailable'), { code: 'dataset_authority_unavailable' });
            const local = await readLocalAuthority();
            await currentRuntime.assertCurrentAsync(); currentRuntime.assertActive();
            if (local.state !== 'legacy' && (local.state !== 'prepared' ||
                local.owner !== 'port' || local.accountId !== accountId || !local.generation))
                throw Object.assign(new Error('dataset_authority_unavailable'), { code: 'dataset_authority_unavailable' });
            const prepared = local.state === 'prepared';
            const context = createWriterWireContext({ accountId, appId, authorityState: prepared ? 'authority-prepared' : 'protocol-capable',
                localAuthorityGeneration: prepared ? local.generation : null,
                ...(prepared ? { expectedWriteEpoch: server.writeEpoch } : {}) });
            // Prepared never means active. Adoption cannot retag old outbox entries.
            state = Object.freeze({ state: context.context.authorityState, wireMode: 'protocol',
                expectedWriteEpoch: context.fields.expectedWriteEpoch ?? null, serverWriteEpoch: server.writeEpoch });
            return context;
        }
    });
}
