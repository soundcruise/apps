// Optional pure consumer of the Port owner observation contract. Normal Host
// boot remains on its legacy readonly reader; no provider/network starts here.
export function describeProviderObservation(value = {}) {
    const observed=value.contractVersion===1&&value.status==='observed'&&value.authorizationConfirmed===false&&
        value.canWrite===false&&Number.isSafeInteger(value.serverAccountGeneration)&&value.serverAccountGeneration>0;
    return Object.freeze({label:observed?'Accountの状態を観測済み':'Accountは未確認',
        detail:'読み取り専用。資格の現在性・Port membership・保存許可は未確認です。',
        serverAccountGeneration:observed?value.serverAccountGeneration:null,
        portMembershipGeneration:null,credentialFreshness:'unconfirmed',authorizationConfirmed:false,canWrite:false});
}
