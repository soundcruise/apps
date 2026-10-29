import {maintenanceCanonical,maintenanceDigest} from './maintenance-bridge-v2.js';
export const COMPATIBLE_EXCLUSIONS=Object.freeze(['oldIngressExcluded','oldVersionsExcluded','oldScheduledExcluded','externalWritersExcluded','oldInflightExcluded','partialResultsExcluded','newClaimsAbsent','unknownResultsAbsent']);
const HEX=/^[a-f0-9]{64}$/;
// Explicit external dependencies, not an issuer. No Production provider/credential exists here.
// The external exclusion window MUST remain held until commit/readback; DB and it are not atomic.
export function createIsolatedHandoverEvidenceProvider({readWindow,verifyReceipt,verifyRestore}){
 if([readWindow,verifyReceipt,verifyRestore].some(x=>typeof x!=='function'))throw Error('handover_evidence_dependencies');
 return async function verifyEvidence(e,manifest){
  const before=await readWindow();
  const valid=w=>w?.environment==='isolated'&&w.state==='sealed'&&w.scope===manifest.scope&&w.accountId===manifest.accountId&&Number.isSafeInteger(w.revision)&&w.revision>0&&Number.isSafeInteger(w.expiresAt)&&Date.now()<w.expiresAt&&HEX.test(w.windowId||'')&&w.inflight===0&&w.partial===0&&w.unknown===0&&COMPATIBLE_EXCLUSIONS.every(k=>w.exclusions?.[k]===true);
  if(!valid(before)||e.windowId!==before.windowId||e.windowRevision!==before.revision||e.expiresAt>before.expiresAt)return{allowed:false};
  for(const kind of COMPATIBLE_EXCLUSIONS){const receipt=e.exclusions?.[kind];if(receipt?.status!=='verified'||!HEX.test(receipt.receiptDigest||''))return{allowed:false};
   const checked=await verifyReceipt(kind,receipt.receiptDigest,{windowId:before.windowId,windowRevision:before.revision,scope:manifest.scope,accountId:manifest.accountId,sourceDigest:manifest.sourceDigest,inventoryDigest:manifest.inventoryDigest,schemaDigest:manifest.schemaDigest});
   if(checked?.verified!==true||checked.kind!==kind||checked.receiptDigest!==receipt.receiptDigest)return{allowed:false};
  }
  const restored=await verifyRestore(e.backup,manifest);if(restored?.verified!==true||restored.restoreReceiptDigest!==e.backup?.restoreReceiptDigest)return{allowed:false};
  const after=await readWindow();if(!valid(after)||maintenanceCanonical(before)!==maintenanceCanonical(after))return{allowed:false};
  return{allowed:true,environment:'isolated',evidenceDigest:await maintenanceDigest(e)};
 };
}

// Metadata + HEAD observation only. Absence is NOT attributed to an earlier cleanup.
// Rows/objects are neither repaired nor deleted. This is not a full binary backup.
export async function observeLegacyAssetPartials({db,bucket,accountId,limit=100}){
 if(typeof accountId!=='string'||!accountId||!Number.isSafeInteger(limit)||limit<1||limit>1000)throw Error('legacy_asset_observation_scope');
 const sql="SELECT asset_id,account_id,object_key,object_version,content_hash,state,uploaded_at,updated_at FROM sync_assets WHERE account_id=? AND state IN('uploaded','available','unreferenced') ORDER BY asset_id";
 const rows=(await db.prepare(sql).bind(accountId).all()).results;if(rows.length>limit)return{status:'HOLD',reason:'bounded-observation-exceeded'};
 const observations=[];for(const row of rows){const head=await bucket.head(row.object_key);observations.push({assetId:row.asset_id,sourceDigest:await maintenanceDigest(row),objectPresent:Boolean(head),classification:head?'present-now-not-content-proof':'absent-now-unattributed-partial'});}
 const after=(await db.prepare(sql).bind(accountId).all()).results;if(maintenanceCanonical(rows)!==maintenanceCanonical(after))return{status:'INCONCLUSIVE',reason:'asset-observation-race',observations};
 return{status:observations.some(x=>!x.objectPresent)?'HOLD':'OBSERVED',observations,atomicSnapshot:false,fullContentVerified:false};
}
