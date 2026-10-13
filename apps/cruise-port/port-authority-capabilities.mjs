// Port-owned Authority capabilities (L3b-1). Not a JavaScript sandbox: brands
// reject data-shaped forgeries (plain objects, structuredClone/JSON copies),
// purpose confusion and reuse across scopes or generations. Product boot never
// imports this module; the Store obtains an issuer only for a registered scope.
import { fail, identifier } from './port-idb-authority-contract.mjs';
export const CAPABILITY_PURPOSES = Object.freeze(['migration-publication', 'authority-control', 'system-ack', 'pro-provider', 'recovery']);
// L3b-1 opens only publication. Control/ack/Pro/recovery stay closed until their phases.
const ISSUABLE = new Set(['migration-publication']);
const claimed = new WeakSet();
const capabilities = new WeakMap();
const attestations = new WeakMap();
const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

// Called only through the Store's scope check. One issuer per scope: a second
// claimant (or a later boot path) cannot mint capabilities for the same scope.
export function claimCapabilityIssuer(scope) {
    if (!scope || typeof scope !== 'object' || !Object.isFrozen(scope) || claimed.has(scope)) throw fail('capability-issuer-unavailable');
    claimed.add(scope);
    return Object.freeze({
        issue(purpose, { generation } = {}) {
            if (!CAPABILITY_PURPOSES.includes(purpose)) throw fail('capability-purpose-invalid');
            if (!ISSUABLE.has(purpose)) throw fail('capability-purpose-unavailable');
            identifier(generation);
            const capability = Object.freeze({ purpose, generation });
            capabilities.set(capability, Object.freeze({ scope, purpose, generation }));
            return capability;
        },
        // L4 evidence (binary verification, Sync reconciliation, server fence) is
        // not connected. Only an isolated fixture may model it; the Store refuses
        // this kind unless its scope carries the privileged test provider.
        attestFixtureEvidence({ generation, migrationId, sealHash, binary, sync, fence = null }) {
            identifier(generation); identifier(migrationId);
            if (!hex64(sealHash) || !binary || !hex64(binary.manifestDigest) || !Number.isSafeInteger(binary.assetCount) || binary.assetCount < 0 ||
                !sync || !hex64(sync.checkpointDigest) || sync.outboxPending !== 0) throw fail('publication-evidence-invalid');
            if (fence !== null) {
                for (const field of ['accountId', 'membershipId', 'barrierId', 'migrationId']) if (typeof fence[field] !== 'string' || !fence[field]) throw fail('publication-evidence-invalid');
                for (const field of ['accountGeneration', 'membershipGeneration', 'writeEpoch']) if (!Number.isSafeInteger(fence[field]) || fence[field] < 1) throw fail('publication-evidence-invalid');
                if (!hex64(fence.checkpointDigest) || fence.migrationId !== migrationId) throw fail('publication-evidence-invalid');
            }
            const token = Object.freeze({ kind: 'isolated-fixture', generation, migrationId });
            attestations.set(token, Object.freeze({ scope, kind: 'isolated-fixture', generation, migrationId, sealHash,
                binary: Object.freeze({ ...binary }), sync: Object.freeze({ ...sync }), fence: fence && Object.freeze({ ...fence }) }));
            return token;
        }
    });
}
export function verifyCapability(capability, { scope, purpose, generation }) {
    const record = capabilities.get(capability);
    if (!record || record.scope !== scope || record.purpose !== purpose || record.generation !== generation) throw fail('capability-invalid');
}
export function readAttestation(token, { scope, generation, migrationId, sealHash }) {
    const record = attestations.get(token);
    if (!record || record.scope !== scope || record.generation !== generation || record.migrationId !== migrationId || record.sealHash !== sealHash)
        throw fail('publication-evidence-invalid');
    return record;
}
