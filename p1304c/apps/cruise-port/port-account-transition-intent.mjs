// Pure typed reservation contract. No Account credentials, timers or I/O.
import { identifier, fail, frozen, equal, digest, validateControl } from './port-idb-authority-contract.mjs';
export const ACCOUNT_TRANSITION_INTENT_VERSION = 1;
export const ACCOUNT_TRANSITION_INTENT_LIMIT = 64;
const keys = (value, names) => value && Object.getPrototypeOf(value) === Object.prototype &&
    equal(Object.keys(value).sort(), [...names].sort());
const boundedIdentity = value => { if (typeof value !== 'string' || !value || value.length > 128) throw fail('account-intent-identity-invalid'); };
const positive = value => Number.isSafeInteger(value) && value > 0;
export function captureAccountTransition(input) {
    if (!keys(input, ['generation', 'operationId', 'identity', 'expectedEpoch', 'expectedPointerEpoch', 'kind', 'destination']))
        throw fail('account-intent-invalid');
    const q = structuredClone(input);
    identifier(q.generation); identifier(q.operationId);
    if (!positive(q.expectedEpoch) || !positive(q.expectedPointerEpoch) || !['switch', 'detach', 'revoke'].includes(q.kind))
        throw fail('account-intent-invalid');
    validateControl({ schemaVersion: 1, generation: q.generation, repositoryProtocol: 1, writerProtocol: 2,
        epoch: 1, fenceEpoch: 1, state: 'active', suspended: false, fenceRevoked: false,
        identityInvalidated: false, recoveryRequired: false, identity: q.identity });
    if (q.identity.ownership !== 'bound-account' || !keys(q.identity, ['appId', 'datasetOwner', 'partitionId', 'ownership',
        'accountId', 'accountGeneration', 'membershipId', 'membershipGeneration'])) throw fail('account-intent-identity-invalid');
    for (const field of ['partitionId', 'accountId', 'membershipId']) boundedIdentity(q.identity[field]);
    if (q.kind === 'switch') {
        if (!keys(q.destination, ['accountId', 'accountDeviceId'])) throw fail('account-intent-destination-invalid');
        boundedIdentity(q.destination.accountId);
        if (q.destination.accountDeviceId !== null) boundedIdentity(q.destination.accountDeviceId);
    } else if (q.destination !== null) throw fail('account-intent-destination-invalid');
    return frozen(q);
}
export const accountTransitionFingerprint = request => digest({ kind: 'account-transition', request });
export function validateAccountTransition(row) {
    if (!keys(row, ['generation', 'operationId', 'schemaVersion', 'kind', 'fingerprint', 'action', 'policy', 'targetKeys', 'origin', 'accountTransition']) ||
        row.schemaVersion !== 1 || row.kind !== 'account-transition' || row.action !== 'account-transition' ||
        row.policy !== 'control:invalidate' || row.origin !== 'v2' || !equal(row.targetKeys, ['control'])) throw fail('account-intent-invalid');
    if (JSON.stringify(row).length > 16384) throw fail('account-intent-capacity');
    const fact = row.accountTransition;
    if (!keys(fact, ['schemaVersion', 'request', 'before', 'after', 'phase']) || fact.schemaVersion !== 1 ||
        !['stopped', 'account-confirmed'].includes(fact.phase)) throw fail('account-intent-invalid');
    const q = captureAccountTransition(fact.request);
    validateControl(fact.before); validateControl(fact.after);
    const expected = { ...fact.before, identityInvalidated: true, epoch: fact.before.epoch + 1 };
    if (q.generation !== row.generation || q.operationId !== row.operationId || row.fingerprint !== accountTransitionFingerprint(q) ||
        !equal(fact.before.identity, q.identity) || !equal(fact.after, expected) || fact.before.identityInvalidated ||
        fact.before.generation !== q.generation || fact.before.epoch !== q.expectedEpoch || fact.before.state !== 'active' ||
        fact.before.recoveryRequired) throw fail('account-intent-invalid');
    return row;
}
export function accountTransitionRow(request, before) {
    const row = { generation: request.generation, operationId: request.operationId, schemaVersion: 1,
        kind: 'account-transition', fingerprint: accountTransitionFingerprint(request), action: 'account-transition',
        policy: 'control:invalidate', targetKeys: ['control'], origin: 'v2', accountTransition: {
            schemaVersion: 1, request, before, after: { ...before, identityInvalidated: true, epoch: before.epoch + 1 }, phase: 'stopped' } };
    validateAccountTransition(row);
    return row;
}
