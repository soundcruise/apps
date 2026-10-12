// Isolated Authority control plane. State changes and final dataset commit use
// the same existing dataset lock; this module introduces no lock hierarchy.
import { authorityMarkerKey } from './port-local-authority.mjs';
import { clone, equal, fail } from './port-migration-contract.mjs';
export const authorityWriteControlKey = generation => authorityMarkerKey(generation) + '.writeControl';
export function readWriteControl(storage, generation, migrationId) {
    let value;
    try { value = JSON.parse(storage.getItem(authorityWriteControlKey(generation))); } catch { throw fail('recovery-required'); }
    if (!value || value.protocol !== 1 || value.generation !== generation || value.migrationId !== migrationId ||
        !Number.isSafeInteger(value.epoch) || value.epoch < 1 || typeof value.suspended !== 'boolean' ||
        typeof value.fenceRevoked !== 'boolean' || typeof value.identityInvalidated !== 'boolean' || !value.identity)
        throw fail('recovery-required');
    return value;
}
export function publishWriteControl(storage, generation, value) {
    if (value.epoch >= Number.MAX_SAFE_INTEGER) throw fail('recovery-required');
    storage.setItem(authorityWriteControlKey(generation), JSON.stringify({ ...value, epoch: value.epoch + 1 }));
}
export function initializeWriteControl(storage, j) {
    const key = authorityWriteControlKey(j.generation);
    if (storage.getItem(key) !== null) {
        const old = readWriteControl(storage, j.generation, j.migrationId);
        if (!equal(old.identity, j.identity) || !equal(old.fence, j.fenceEvidence)) throw fail('recovery-required');
        return; // retry/recovery never resurrects a disabled gate
    }
    storage.setItem(key, JSON.stringify({ protocol: 1, migrationId: j.migrationId, generation: j.generation,
        epoch: 1, identity: clone(j.identity), fence: clone(j.fenceEvidence),
        suspended: !!j.writeDisabled, fenceRevoked: false, identityInvalidated: false }));
}
export function assertIdentitySnapshot(env, identity) {
    if (typeof env.readIdentity !== 'function') throw fail('authority-identity-unavailable');
    const current = env.readIdentity();
    if (current?.then) throw fail('authority-identity-unavailable');
    if (!equal(current, identity)) throw fail('migration-account-changed');
    if (identity.ownership === 'bound-account') {
        if (!Number.isSafeInteger(identity.accountGeneration) || identity.accountGeneration < 1 ||
            !Number.isSafeInteger(identity.membershipGeneration) || identity.membershipGeneration < 1 || !identity.membershipId)
            throw fail('authority-identity-unavailable');
    }
}
