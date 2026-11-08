// Additive owner client contract. No storage/auth/runtime and no import I/O.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x);
const positive=x=>Number.isSafeInteger(x)&&x>0;
export function requestAccountOwnerContext(client,credential,{requestId,challenge}) {
    if(typeof client?.request!=='function'||!uuid(requestId)||!uuid(challenge))throw Error('account-owner-request-invalid');
    return client.request('/v2/accounts/owner-context?'+new URLSearchParams({requestId,challenge}),{accountCredential:credential});
}
export function validateAccountOwnerContext(value,{requestId,challenge,account,identity}) {
    const i=value?.identity,f=value?.freshness;
    if(!uuid(requestId)||!uuid(challenge)||!account||!identity||identity.appId!=='port'||
        typeof i?.membershipId!=='string'||!i.membershipId||value?.ok!==true||value.contractVersion!==1||value.purpose!=='account-owner-observation'||
        value.requestId!==requestId||value.challenge!==challenge||value.operationAuthorized!==false||value.canWrite!==false||
        value.credentialExpiresAt!==null||i?.appId!=='port'||i.accountId!==account.accountId||i.accountDeviceId!==account.accountDeviceId||
        !positive(i.credentialVersion)||!positive(i.accountGeneration)||!positive(i.membershipGeneration)||
        i.accountGeneration!==identity.accountGeneration||i.membershipId!==identity.membershipId||i.membershipGeneration!==identity.membershipGeneration||
        f?.kind!=='primary-snapshot'||!positive(f.snapshotStartedAt)||!positive(f.observedAt)||!positive(f.expiresAt)||
        !positive(f.remainingMs)||!positive(f.runtimeGeneration)||f.observedAt<f.snapshotStartedAt||f.expiresAt<=f.observedAt||
        f.expiresAt-f.snapshotStartedAt!==5000||f.remainingMs!==f.expiresAt-f.observedAt)return null;
    return {accountId:i.accountId,accountDeviceId:i.accountDeviceId,serverAccountGeneration:i.accountGeneration,
        credentialVersion:i.credentialVersion,portMembership:{id:i.membershipId,generation:i.membershipGeneration,state:'active'},
        credentialFreshness:'owner-confirmed-at-read',credentialExpiresAt:null,expiresAt:f.expiresAt,
        serverObservedAt:f.observedAt,serverRuntimeGeneration:f.runtimeGeneration,remainingMs:f.remainingMs};
}
