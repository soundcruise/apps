/* Studio owner boundary for shared Port components. No authority is minted here. */
import { isProAccessReady } from '../../../cruise-port/cruise-port-capabilities.js?v=1.28.2';

// An Account/device writer admission does not exist in this integration yet.
// This must not become a boolean inferred from Pro, UI state or stored data.
function writerAdmission() { return null; }

export function createPortProBoundary() {
    let disposed = false, generation = 0;
    function invalidate() { generation++; }
    async function authorize() {
        if (disposed) return { ok: false, reason: 'disposed' };
        const current = generation;
        const source = globalThis.SoundCruiseProOperationSource;
        if (!isProAccessReady() || !source || typeof source.read !== 'function' || typeof source.validate !== 'function')
            return { ok: false, reason: 'pro-source-unavailable' };
        let before, verdict, after;
        try {
            before = source.read();
            if (!before || before.revoked !== false || !before.auth || !before.revision)
                return { ok: false, reason: 'pro-source-revoked' };
            verdict = await source.validate({ ...before.auth, operationRevision: before.revision });
            after = source.read();
        } catch (_) { return { ok: false, reason: 'pro-validation-failed' }; }
        if (disposed || generation !== current || globalThis.SoundCruiseProOperationSource !== source ||
            !isProAccessReady() || after?.revoked !== false || after?.revision !== before.revision ||
            after?.auth?.credential !== before.auth.credential || after?.auth?.generation !== before.auth.generation ||
            after?.auth?.sessionVersion !== before.auth.sessionVersion || verdict?.ok !== true)
            return { ok: false, reason: 'pro-source-stale' };
        // The existing Port controller can write immediately. Do not mount even
        // a read-only-looking UI until every write is covered by admission.
        if (!writerAdmission()) return { ok: false, reason: 'writer-admission-unavailable' };
        return { ok: false, reason: 'component-admission-not-implemented' };
    }
    return Object.freeze({ authorize, invalidate, dispose() { disposed = true; invalidate(); } });
}
