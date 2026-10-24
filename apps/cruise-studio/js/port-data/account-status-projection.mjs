// Display-only projection of the existing Port Host cache. Local observation
// counters are never presented as Account/membership server generations.
export function describeAccountObservation(state = {}) {
    const labels = { unknown: '未確認', unavailable: '確認できません',
        'no-account-known': '保存済みAccountなし', 'account-known': '保存済みAccountあり',
        'membership-known': '保存済みmembershipあり' };
    const observed = ['no-account-known', 'account-known', 'membership-known'].includes(state.account);
    return Object.freeze({
        label: Object.hasOwn(labels, state.account) ? labels[state.account] : labels.unknown,
        detail: observed ? '端末内の観測・読み取り専用。サーバーの資格状態・世代は未確認です。'
            : '読み取り専用。Accountの接続・資格確認は行っていません。',
        localObservationRevision: Number.isSafeInteger(state.generation) && state.generation >= 0 ? state.generation : null,
        runtimeRevision: Number.isSafeInteger(state.runtimeGeneration) && state.runtimeGeneration >= 0 ? state.runtimeGeneration : null,
        serverAccountGeneration: null, serverMembershipGeneration: null,
        canWrite: false, authorizationConfirmed: false
    });
}
