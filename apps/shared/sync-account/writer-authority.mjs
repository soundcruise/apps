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
export function createWriterWireContext({ expectedWriteEpoch } = {}) {
    const fields = { writerProtocol: AUTHORITY_WRITER_PROTOCOL, syncProtocol: SYNC_WIRE_PROTOCOL,
        ...(expectedWriteEpoch === undefined ? {} : { expectedWriteEpoch }) };
    const parsed = parseWriterFields(fields);
    if (!parsed.ok) throw Object.assign(new Error(parsed.code), { code: parsed.code });
    return Object.freeze({
        fields: parsed.value,
        envelope(body) { return { ...body, ...parsed.value }; },
        headers() { return Object.fromEntries(Object.entries(parsed.value).map(([key, value]) => [WRITER_HEADERS[key], String(value)])); }
    });
}
