import{digest,fail,same}from'./contracts.mjs';import{cutlineProvider}from'./cutline.mjs';
export const WRITER_KINDS=Object.freeze(['http','workers-dev','version-override','service','scheduled','r2-cleanup','external-d1','external-r2','manual']);
const HEX=/^[a-f0-9]{64}$/;
// Verifier only: no signer, issuer, mutator, network discovery or default evidence.
// Trusted external issuers/complete ingress instrumentation are deployment prerequisites.
export function verifiedCutlineProvider({authority,scope,operationId,inventory,source,readWindow,readWitness,readReceipt,expectedWindowHash}){
 ({scope,inventory,source}=structuredClone({scope,inventory,source}));
 if(!HEX.test(expectedWindowHash||''))fail('external-window-pin-required');
 if(!authority||[readWindow,readWitness,readReceipt].some(f=>typeof f!=='function'))fail('external-cutline-provider-required');
 if(!Array.isArray(inventory)||!inventory.length||new Set(inventory.map(x=>x.id)).size!==inventory.length||WRITER_KINDS.some(k=>!inventory.some(x=>x.kind===k))||inventory.some(x=>!x.id||!x.ownerId||!WRITER_KINDS.includes(x.kind)))fail('writer-inventory-incomplete');
 if(!source||!source.d1||!source.r2||source.d1.includes('UNVERIFIED')||source.r2.includes('UNVERIFIED'))fail('source-identity-required');
 const sourceDigest=digest(source),inventoryDigest=digest(inventory);let initialWindow;
 function common(p,w){if(p.operationId!==operationId||p.windowId!==w.windowId||p.sequence!==w.sequence||p.cutlineId!==w.cutlineId||p.sourceDigest!==sourceDigest||p.inventoryDigest!==inventoryDigest)fail('cutline-receipt-binding')}
 function window(e){same(digest(e),expectedWindowHash,'external-window-pin');const p=authority.check(e,'freeze-window',scope);if(p.operationId!==operationId||p.environment!=='production'||p.state!=='CLOSED'||!Number.isSafeInteger(p.openedAt)||p.openedAt>p.issued||!HEX.test(p.windowId||'')||!Number.isSafeInteger(p.sequence)||p.sequence<1||!p.cutlineId||p.sourceDigest!==sourceDigest||p.inventoryDigest!==inventoryDigest||p.coverage!=='complete'||p.registryCoverage!=='from-admission'||p.legacyInflight!=='independently-resolved')fail('cutline-window-incomplete');return p}
 async function checkedRead(){
  const beforeEnvelope=structuredClone(await readWindow()),before=window(beforeEnvelope);if(initialWindow)same(digest(beforeEnvelope),initialWindow,'cutline-window-drift');
  const freeze=structuredClone(await readWitness()),p=authority.check(freeze,'freeze',scope);common(p,before);same(p.windowHash,digest(beforeEnvelope),'cutline-window-binding');if(p.issued<before.issued)fail('freeze-before-window-seal');if(!Array.isArray(p.writers)||p.writers.length!==inventory.length||new Set(p.writers.map(w=>w.id)).size!==p.writers.length)fail('writer-receipt-coverage');
  for(const writer of inventory){
   const w=p.writers.find(x=>x.id===writer.id);if(!w||!HEX.test(w.effectReceiptHash||'')||!HEX.test(w.admissionReceiptHash||'')||!HEX.test(w.invocationReceiptHash||''))fail('writer-receipts-missing');
   async function receipt(kind,hash){const e=structuredClone(await readReceipt(hash));same(digest(e),hash,'external-receipt-tampered');const x=authority.check(e,kind,scope);common(x,before);if(x.writerId!==writer.id||x.ownerId!==writer.ownerId)fail('receipt-owner');if(x.expires<before.expires)fail('receipt-window-expiry');return x}
   const admission=await receipt('writer-admission',w.admissionReceiptHash);if(!['STOPPED','PROVEN_NO_PATH'].includes(admission.status)||admission.status!==w.admission||!HEX.test(admission.mechanismEvidenceHash||'')||!Number.isSafeInteger(admission.closedAt)||admission.closedAt<before.openedAt||admission.closedAt>admission.issued||admission.issued>before.issued)fail('writer-admission-unproved');
   const invocation=await receipt('writer-invocations',w.invocationReceiptHash);if(invocation.coverage!=='complete-from-admission'||invocation.legacyDisposition!=='independently-resolved'||invocation.admissionReceiptHash!==w.admissionReceiptHash||invocation.issued<admission.issued||!Number.isSafeInteger(invocation.observedThrough)||invocation.observedThrough<admission.closedAt||invocation.observedThrough>invocation.issued||!HEX.test(invocation.legacyEvidenceHash||''))fail('legacy-or-registry-unproved');
   const starts=invocation.startedOperationIds,ends=invocation.completedOperationIds;if(!Array.isArray(starts)||!Array.isArray(ends)||starts.some(x=>typeof x!=='string'||!x)||ends.some(x=>typeof x!=='string'||!x)||new Set(starts).size!==starts.length||new Set(ends).size!==ends.length||digest([...starts].sort())!==digest([...ends].sort()))fail('inflight-unresolved');
   const effect=await receipt('writer-effects',w.effectReceiptHash);if(effect.state!=='CONFIRMED'||effect.issued<invocation.issued||effect.issued>before.issued||effect.partial!==false||effect.unknown!==false||effect.invocationReceiptHash!==w.invocationReceiptHash||!['NONE','CONFIRMED'].includes(effect.d1)||!['NONE','CONFIRMED'].includes(effect.r2)||w.inflight!==0||w.partial!==false||w.unknown!==false)fail('effects-partial-or-unknown');
  }
  const after=structuredClone(await readWindow());window(after);same(after,beforeEnvelope,'cutline-observation-race');if(!initialWindow)initialWindow=digest(beforeEnvelope);return freeze;
 }
 return cutlineProvider({authority,scope,operationId,inventory,readWitness:checkedRead});
}
