// Display-only projection of the existing Port Host cache. Local observation
// counters are never presented as Account/membership server generations.
export function describeAccountObservation(state = {}) {
    const owner=state.accountObservation;
    if(state.account==='owner-observed-readonly'&&owner?.status==='observed-readonly'&&owner.asOfRead===true&&
        owner.authorizationConfirmed===false&&owner.operationAuthorized===false&&owner.canWrite===false&&
        Number.isSafeInteger(owner.serverAccountGeneration)&&owner.serverAccountGeneration>0&&
        Number.isSafeInteger(owner.membershipGeneration)&&owner.membershipGeneration>0)
        return Object.freeze({label:'Accountを観測済み（読み取り専用）',
            detail:'サーバー読取り時点の世代です。継続認可・資格expiry・保存許可ではありません。',
            localObservationRevision:state.generation,runtimeRevision:state.runtimeGeneration??null,
            serverAccountGeneration:owner.serverAccountGeneration,serverMembershipGeneration:owner.membershipGeneration,
            canWrite:false,authorizationConfirmed:false});
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
