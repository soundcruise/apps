// Typed unbound stop reservation. No credential or fabricated bound identity.
import {identifier,validateControl,fail,frozen,equal,digest} from './port-idb-authority-contract.mjs';
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&equal(Object.keys(v).sort(),keys.slice().sort());
const positive=n=>Number.isSafeInteger(n)&&n>0,hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export function captureAccountBootstrap(input){
    const q=structuredClone(input);
    if(!exact(q,['generation','operationId','identity','expectedEpoch','expectedPointerEpoch','kind','destination','source','candidateDigest']))throw fail('account-bootstrap-invalid');
    identifier(q.generation);identifier(q.operationId);
    if(!positive(q.expectedEpoch)||!positive(q.expectedPointerEpoch)||!['create','recover'].includes(q.kind)||!hash(q.candidateDigest)||
       !exact(q.identity,['appId','datasetOwner','partitionId','ownership','accountId'])||q.identity.ownership!=='unbound-local'||q.identity.accountId!==null||
       !exact(q.destination,['accountId','accountDeviceId'])||typeof q.destination.accountId!=='string'||!q.destination.accountId||q.destination.accountId.length>128||
       (q.destination.accountDeviceId!==null&&(typeof q.destination.accountDeviceId!=='string'||!q.destination.accountDeviceId||q.destination.accountDeviceId.length>128))||
       !exact(q.source,['epoch','revision'])||typeof q.source.epoch!=='string'||!q.source.epoch||!Number.isSafeInteger(q.source.revision)||q.source.revision<0)throw fail('account-bootstrap-invalid');
    validateControl({schemaVersion:1,generation:q.generation,repositoryProtocol:1,writerProtocol:2,epoch:1,fenceEpoch:1,state:'active',suspended:false,fenceRevoked:false,identityInvalidated:false,recoveryRequired:false,identity:q.identity});
    return frozen(q);
}
export const accountBootstrapFingerprint=q=>digest({kind:'account-bootstrap',request:q});
export function validateAccountBootstrap(row){
    if(!exact(row,['generation','operationId','schemaVersion','kind','fingerprint','action','policy','targetKeys','origin','accountTransition'])||row.schemaVersion!==1||row.kind!=='account-bootstrap'||row.action!=='account-bootstrap'||row.policy!=='control:invalidate'||row.origin!=='v2'||!equal(row.targetKeys,['control'])||JSON.stringify(row).length>16384)throw fail('account-bootstrap-invalid');
    const f=row.accountTransition;if(!exact(f,['schemaVersion','request','before','after','phase'])||f.schemaVersion!==1||f.phase!=='stopped')throw fail('account-bootstrap-invalid');
    const q=captureAccountBootstrap(f.request);validateControl(f.before);validateControl(f.after);
    if(row.generation!==q.generation||row.operationId!==q.operationId||row.fingerprint!==accountBootstrapFingerprint(q)||!equal(f.before.identity,q.identity)||
       f.before.generation!==q.generation||f.before.epoch!==q.expectedEpoch||f.before.state!=='active'||f.before.recoveryRequired||f.before.identityInvalidated||
       !equal(f.after,{...f.before,identityInvalidated:true,epoch:f.before.epoch+1}))throw fail('account-bootstrap-invalid');
    return row;
}
export function accountBootstrapRow(q,before){const row={generation:q.generation,operationId:q.operationId,schemaVersion:1,kind:'account-bootstrap',fingerprint:accountBootstrapFingerprint(q),action:'account-bootstrap',policy:'control:invalidate',targetKeys:['control'],origin:'v2',accountTransition:{schemaVersion:1,request:q,before,after:{...before,identityInvalidated:true,epoch:before.epoch+1},phase:'stopped'}};validateAccountBootstrap(row);return row;}
