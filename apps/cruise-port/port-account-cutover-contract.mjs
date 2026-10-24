// Typed inert migration evidence in the existing Authority journal; no secrets,
// copied Account/Port payloads, writer permission or independent data source.
import {identifier,fail,canonical,digest,equal,assertJSONEvidence} from './port-idb-authority-contract.mjs';
export const CUTOVER_KIND='account-port-cutover-v1';
export const CUTOVER_STAGES=['stopped','enroll-requested','enrolled','cutover-requested','verified-inert'];
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function validateCutoverJournal(j){
    assertJSONEvidence(j);identifier(j.migrationId);identifier(j.generation);
    if(j.kind!==CUTOVER_KIND||j.schemaVersion!==1||!Number.isSafeInteger(j.revision)||j.revision<1||
        !CUTOVER_STAGES.includes(j.stage)||j.state!==(j.stage==='verified-inert'?'prepared':'staging')||
        !hash(j.manifestHash)||digest(j.manifest)!==j.manifestHash||!hash(j.barrierDigest)||!hash(j.pointerDigest)||
        j.canWrite!==false||j.operationAuthorized!==false||j.continuityProven!==false||j.historical!==true||
        j.manifest?.schemaVersion!==1||j.manifest.partitionId!==j.identity?.partitionId||
        j.manifest.account?.accountId!==j.identity?.accountId||j.identity?.ownership!=='bound-account'||
        !hash(j.manifest.account.dataDigest)||!hash(j.manifest.account.inventoryDigest)||!hash(j.manifest.account.stepDigest)||
        !hash(j.manifest.port?.digest)||j.manifest.account.supported!==true||j.manifest.port.supported!==true||
        !Array.isArray(j.manifest.port.entries)||j.manifest.port.atomic!==false||j.manifest.port.abaExcluded!==false||
        j.manifest.cloud!=='not-connected'||j.manifest.binary!=='not-connected'||j.manifest.rawWriterExcluded!==false)
        throw fail('cutover-journal-invalid');
    if(j.accountSnapshot){const a=j.accountSnapshot,b=j.manifest.account;
        if(!equal([a.accountId,a.accountDeviceId,a.dataDigest],[b.accountId,b.accountDeviceId,b.dataDigest])||
            ![1,2,3].includes(a.physicalVersion)||!a.supported||!hash(a.inventoryDigest)||!hash(a.stepDigest))throw fail('cutover-journal-invalid');}
    if(j.stage==='enrolled'&&j.accountSnapshot?.physicalVersion!==2||j.stage==='verified-inert'&&j.accountSnapshot?.physicalVersion!==3)throw fail('cutover-journal-invalid');
    if(canonical(j).length>131072)throw fail('cutover-capacity');
    return j;
}
export function nextCutoverJournal(j,stage,accountSnapshot){
    validateCutoverJournal(j);
    const allowed={stopped:['enroll-requested','cutover-requested','verified-inert'],
        'enroll-requested':['enrolled'],enrolled:['cutover-requested'],'cutover-requested':['verified-inert'],'verified-inert':[]};
    if(!allowed[j.stage].includes(stage))throw fail('cutover-stage-invalid');
    return validateCutoverJournal({...j,revision:j.revision+1,stage,state:stage==='verified-inert'?'prepared':'staging',accountSnapshot});
}
