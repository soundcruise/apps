// Pure durable row contract; monotonic values are meaningful only to their owner runtime.
import {digest,equal,frozen,fail,assertJSONEvidence} from './port-idb-authority-contract.mjs';
export const EVIDENCE_PROVIDER_ID='isolated-server-v1';
export const evidenceLifetimeKey=e=>'evidence-'+digest([EVIDENCE_PROVIDER_ID,e.evidenceId]);
export function evidenceLifetimeRow(lifetime){
 const row={schemaVersion:1,generation:lifetime.evidence.generation,operationId:evidenceLifetimeKey(lifetime.evidence),kind:'evidence-lifetime',
  fingerprint:digest(lifetime.evidence),action:'observeEvidence',policy:'control-evidence-lifetime-v1',targetKeys:['control'],origin:'v2',evidenceLifetime:lifetime};
 validateEvidenceLifetimeRow(row);return frozen(row);
}
export function validateEvidenceLifetimeRow(row){
 assertJSONEvidence(row);const l=row.evidenceLifetime,e=l?.evidence;
 const exact=(o,keys)=>o&&Object.getPrototypeOf(o)===Object.prototype&&equal(Object.keys(o).sort(),keys.sort());
 if(!exact(row,['schemaVersion','generation','operationId','kind','fingerprint','action','policy','targetKeys','origin','evidenceLifetime'])||
  row.schemaVersion!==1||row.kind!=='evidence-lifetime'||row.action!=='observeEvidence'||row.policy!=='control-evidence-lifetime-v1'||row.origin!=='v2'||!equal(row.targetKeys,['control'])||
  !exact(l,['schemaVersion','providerId','issuerId','runtimeId','clockId','wallAnchor','monoAnchor','monotonicDeadline','lastObservedWall','lastObservedMonotonic','expired','invalidated','evidence'])||
  l.schemaVersion!==1||l.providerId!==EVIDENCE_PROVIDER_ID||!e||row.generation!==e.generation||row.operationId!==evidenceLifetimeKey(e)||row.fingerprint!==digest(e)||
  ['issuerId','runtimeId','clockId'].some(k=>typeof l[k]!=='string'||!l[k])||['wallAnchor','monoAnchor','monotonicDeadline','lastObservedWall','lastObservedMonotonic'].some(k=>!Number.isFinite(l[k])||l[k]<0)||
  !Number.isSafeInteger(l.wallAnchor)||!Number.isSafeInteger(l.lastObservedWall)||l.lastObservedWall<l.wallAnchor||l.lastObservedMonotonic<l.monoAnchor||
  l.monotonicDeadline!==l.monoAnchor+Math.max(0,e.expiresAt-l.wallAnchor)||typeof l.expired!=='boolean'||typeof l.invalidated!=='boolean')throw fail('evidence-lifetime-invalid');
}
