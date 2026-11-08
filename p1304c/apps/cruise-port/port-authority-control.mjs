// Dormant Control contract. No Account/Pro lookup or production provider.
import {identifier,fail,frozen,equal,digest,validateControl,assertJSONEvidence} from './port-idb-authority-contract.mjs';
export const CONTROL_OPERATIONS=frozen({suspendWrites:'control:suspend',revokeFence:'control:revoke',
 invalidateIdentity:'control:invalidate',markRecoveryRequired:'control:recovery',resumeWrites:'control:resume',renewFence:'control:renew'});
export const stoppingControl=action=>['suspendWrites','revokeFence','invalidateIdentity','markRecoveryRequired'].includes(action);
const positive=n=>Number.isSafeInteger(n)&&n>0;
const keys=(o,k)=>o&&Object.getPrototypeOf(o)===Object.prototype&&equal(Object.keys(o).sort(),[...k].sort());
export function captureControlRequest(action,input,evidence=null){
 if(!Object.hasOwn(CONTROL_OPERATIONS,action))throw fail('control-action-invalid');
 if(!keys(input,Object.keys(input))||Object.keys(input).some(k=>!['generation','operationId','identity','expectedEpoch','expectedPointerEpoch','capability','evidence'].includes(k)))throw fail('control-request-invalid');
 const {generation,operationId,identity,expectedEpoch=null,expectedPointerEpoch=null}=input;
 identifier(generation);identifier(operationId);
 if(expectedEpoch!==null&&!positive(expectedEpoch)||expectedPointerEpoch!==null&&!positive(expectedPointerEpoch)||
  !stoppingControl(action)&&(!positive(expectedEpoch)||!positive(expectedPointerEpoch)))throw fail('control-request-invalid');
 assertJSONEvidence(identity);if(!identity)throw fail('control-identity-required');
 validateControl({schemaVersion:1,generation,repositoryProtocol:1,writerProtocol:2,epoch:1,fenceEpoch:1,state:'active',suspended:false,fenceRevoked:false,identityInvalidated:false,recoveryRequired:false,identity});
 if(stoppingControl(action)&&evidence!==null)throw fail('control-evidence-unexpected');
 return frozen(structuredClone({action,generation,operationId,target:'control',identity,expectedEpoch,expectedPointerEpoch,evidence}));
}
export const controlFingerprint=request=>digest({kind:'control',request});
export function transitionControl(old,request){
 const next={...old};
 if(request.action==='suspendWrites')next.suspended=true;
 if(request.action==='revokeFence')next.fenceRevoked=true;
 if(request.action==='invalidateIdentity')next.identityInvalidated=true;
 if(request.action==='markRecoveryRequired'){next.recoveryRequired=true;next.state='recovery-required';}
 if(request.action==='resumeWrites')next.suspended=false;
 if(request.action==='renewFence'){next.fenceRevoked=false;next.fenceEpoch=request.evidence.fenceEpoch;next.fenceEvidence=structuredClone(request.evidence);}
 const changed=!equal(old,next);if(changed)next.epoch=old.epoch+1;validateControl(next);return {next,changed};
}
export function validateControlFact(row){
 const f=row.control,q=f?.request,r=f?.result;
 if(row.kind!=='control'||row.origin!=='v2'||!keys(f,['schemaVersion','request','before','after','result'])||f.schemaVersion!==1||
  !keys(q,['action','generation','operationId','target','identity','expectedEpoch','expectedPointerEpoch','evidence'])||
  !Object.hasOwn(CONTROL_OPERATIONS,q.action)||q.target!=='control'||row.action!==q.action||row.policy!==CONTROL_OPERATIONS[q.action]||
  !equal(row.targetKeys,['control'])||row.fingerprint!==controlFingerprint(q)||q.generation!==row.generation||q.operationId!==row.operationId)throw fail('control-fact-invalid');
 captureControlRequest(q.action,{generation:q.generation,operationId:q.operationId,identity:q.identity,expectedEpoch:q.expectedEpoch,expectedPointerEpoch:q.expectedPointerEpoch},q.evidence);
 if(f.before===null&&f.after===null&&r===null)return;
 validateControl(f.before);validateControl(f.after);
 if(f.before.generation!==q.generation||f.after.generation!==q.generation||!equal(f.before.identity,q.identity)||!equal(f.after.identity,q.identity))throw fail('control-fact-invalid');
 const {next,changed}=transitionControl(f.before,q);
 if(!equal(next,f.after)||!keys(r,['ok','status','generation','operationId','action','controlEpoch','changed','publish','operationAuthorized','historical'])||
  r.ok!==true||r.status!=='control-committed'||r.generation!==q.generation||r.operationId!==q.operationId||r.action!==q.action||r.controlEpoch!==next.epoch||
  r.changed!==changed||r.publish!==false||r.operationAuthorized!==false||r.historical!==true)throw fail('control-fact-invalid');
}
export function controlReadiness(snapshot){
 if(!snapshot.active)return snapshot.control.state==='superseded'?'superseded':'inactive';const c=snapshot.control;
 if(c.recoveryRequired||c.state==='recovery-required')return 'recovery-required';
 if(c.identityInvalidated)return 'identity-invalidated';if(c.fenceRevoked)return 'fence-revoked';if(c.suspended)return 'suspended';return 'writable';
}
