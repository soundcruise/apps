// Port-owned Authority capabilities (L3b-1). Not a JavaScript sandbox: brands
// reject data-shaped forgeries (plain objects, structuredClone/JSON copies),
// purpose confusion and reuse across scopes or generations. Product boot never
// imports this module; the Store obtains an issuer only for a registered scope.
import {safeEvidence} from './port-migration-contract.mjs';
import { fail, identifier, frozen, validateControl, assertJSONEvidence } from './port-idb-authority-contract.mjs';
export const CAPABILITY_PURPOSES = Object.freeze(['migration-publication', 'authority-control', 'system-ack', 'pro-provider', 'recovery', 'control:suspend', 'control:revoke', 'control:invalidate', 'control:recovery', 'control:resume', 'control:renew']);
// L3b-2 opens six Control purposes for isolated providers; ACK/Pro/recovery remain closed.
const ISSUABLE = new Set(['migration-publication', ...CAPABILITY_PURPOSES.filter(p=>p.startsWith('control:'))]);
const registered=new WeakMap(),fenceAttestations=new WeakMap();
export function registerCapabilityScope(scope,lifecycle,fixtureEnabled){
 if(registered.has(scope))throw fail('capability-scope-already-registered');registered.set(scope,{lifecycle,fixtureEnabled});
}
const live=scope=>{const r=registered.get(scope),lease=r?.lifecycle();if(!lease?.active)throw fail('capability-invalid');return lease;};
const claimed = new WeakSet();
const capabilities = new WeakMap();
const attestations = new WeakMap();
const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

// Called only through the Store's scope check. One issuer per scope: a second
// claimant (or a later boot path) cannot mint capabilities for the same scope.
export function claimCapabilityIssuer(scope) {
    if (!scope || typeof scope !== 'object' || !Object.isFrozen(scope) || claimed.has(scope)) throw fail('capability-issuer-unavailable');
    if(!registered.has(scope))throw fail('capability-issuer-unavailable');
    claimed.add(scope);
    return Object.freeze({
        issue(purpose, { generation } = {}) {
            if (!CAPABILITY_PURPOSES.includes(purpose)) throw fail('capability-purpose-invalid');
            if (!ISSUABLE.has(purpose)) throw fail('capability-purpose-unavailable');
            if(purpose.startsWith('control:')&&!registered.get(scope).fixtureEnabled())throw fail('control-provider-unavailable');
            const lease=live(scope);identifier(generation);
            const capability = Object.freeze({ purpose, generation });
            capabilities.set(capability, Object.freeze({ scope, purpose, generation, lease }));
            return capability;
        },
        // L4 evidence (binary verification, Sync reconciliation, server fence) is
        // not connected. Only an isolated fixture may model it; the Store refuses
        // this kind unless its scope carries the privileged test provider.
        attestFixtureEvidence({ generation, migrationId, sealHash, binary, sync, fence = null }) {
            const lease=live(scope);identifier(generation); identifier(migrationId);
            if (!hex64(sealHash) || !binary || !hex64(binary.manifestDigest) || !Number.isSafeInteger(binary.assetCount) || binary.assetCount < 0 ||
                !sync || !hex64(sync.checkpointDigest) || sync.outboxPending !== 0) throw fail('publication-evidence-invalid');
            if (fence !== null) {
                for (const field of ['accountId', 'membershipId', 'barrierId', 'migrationId']) if (typeof fence[field] !== 'string' || !fence[field]) throw fail('publication-evidence-invalid');
                for (const field of ['accountGeneration', 'membershipGeneration', 'writeEpoch']) if (!Number.isSafeInteger(fence[field]) || fence[field] < 1) throw fail('publication-evidence-invalid');
                if (!hex64(fence.checkpointDigest) || fence.migrationId !== migrationId) throw fail('publication-evidence-invalid');
            }
            const token = Object.freeze({ kind: 'isolated-fixture', generation, migrationId });
            attestations.set(token, Object.freeze({ scope, lease, kind: 'isolated-fixture', generation, migrationId, sealHash,
                binary: Object.freeze({ ...binary }), sync: Object.freeze({ ...sync }), fence: fence && Object.freeze({ ...fence }) }));
            return token;
        },
        attestFixtureFence(evidence){
            if(!registered.get(scope).fixtureEnabled())throw fail('control-provider-unavailable');
            const lease=live(scope),e=frozen(structuredClone(evidence));assertJSONEvidence(e);safeEvidence(e);
            if(Object.keys(e).sort().join(',')!==['source','evidenceId','generation','pointerEpoch','controlEpoch','identity','fenceEpoch','issuedAt','expiresAt'].sort().join(','))throw fail('control-evidence-invalid');
            if(e?.source!=='isolated-server'||typeof e.evidenceId!=='string'||!e.evidenceId||
                !Number.isSafeInteger(e.controlEpoch)||e.controlEpoch<1||!Number.isSafeInteger(e.fenceEpoch)||e.fenceEpoch<1||!Number.isSafeInteger(e.pointerEpoch)||e.pointerEpoch<1||
                !Number.isSafeInteger(e.issuedAt)||!Number.isSafeInteger(e.expiresAt)||e.issuedAt<0||e.expiresAt<=e.issuedAt||e.expiresAt-e.issuedAt>60000)throw fail('control-evidence-invalid');
            identifier(e.generation);validateControl({schemaVersion:1,generation:e.generation,repositoryProtocol:1,writerProtocol:2,epoch:1,fenceEpoch:1,
                state:'active',suspended:false,fenceRevoked:false,identityInvalidated:false,recoveryRequired:false,identity:e.identity});
            if(e.identity.ownership!=='bound-account')throw fail('control-evidence-invalid');
            const token=Object.freeze({kind:'isolated-fence'});fenceAttestations.set(token,{scope,lease,evidence:e});return token;
        }
    });
}
export function verifyCapability(capability, { scope, purpose, generation, lease }) {
    const record = capabilities.get(capability);
    if (!record || record.scope !== scope || record.purpose !== purpose || record.generation !== generation || record.lease!==live(scope) || lease&&record.lease!==lease) throw fail('capability-invalid');
}
export function readAttestation(token, { scope, generation, migrationId, sealHash, lease }) {
    const record = attestations.get(token);
    if (!record || record.scope !== scope || record.generation !== generation || record.migrationId !== migrationId || record.sealHash !== sealHash || record.lease!==live(scope) || lease&&record.lease!==lease)
        throw fail('publication-evidence-invalid');
    return record;
}

export function readFenceAttestation(token,{scope,generation,lease}){
 const r=fenceAttestations.get(token);if(!r||r.scope!==scope||r.evidence.generation!==generation||r.lease!==live(scope)||lease&&r.lease!==lease)throw fail('control-evidence-invalid');return r.evidence;
}
