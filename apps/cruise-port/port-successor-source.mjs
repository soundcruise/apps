// Fixture-only predecessor inventory reader. No I/O except injected owner reads.
import {readConsumerReadmissionBasis} from './port-consumer-readmission-contract.mjs';
import {digest,equal,fail} from './port-idb-authority-contract.mjs';
import {validateOperationEnvelope,validateOperationLease} from '../shared/sync-account/owner-operation-lease-contract.mjs';
import {validateCutoverPin} from './port-owner-cutover-contract.mjs';
export async function readSuccessorSource({store,backup,scopeName,generation,renewalOperationId,adoptionOperationId=null,stopped=false}){
 const consumer=await store.readConsumer(),h=await store.hydrate(generation);if(!consumer.ok||!h.ok||!h.snapshot.active)throw fail('successor-source-unproven');
 const c=h.snapshot.control;if(c.state!=='active'||!c.suspended||!c.fenceRevoked||c.recoveryRequired||c.identityInvalidated!==stopped)throw fail('successor-source-unproven');
 const basis=await readConsumerReadmissionBasis({store,backup,generation,transitionId:consumer.consumer.transitionId,scopeName}),pub=await store.lookupOwnerCutoverPublication({generation,transitionId:consumer.consumer.transitionId});
 if(!pub.ok||!equal(pub.fact.pointer,h.snapshot.pointer))throw fail('successor-source-unproven');
 const rows=(await backup.inventory()).sort((a,b)=>a.id.localeCompare(b.id)),known=new Set(basis.known),prefix='port-recovery-v1:'+scopeName+':',items=[];
 const renewal=rows.find(r=>r.id===prefix+'renew-'+renewalOperationId);if(renewal?.packet?.purpose!=='renewal-client-recovery-v1'||renewal.packet.operationId!==renewalOperationId)throw fail('successor-inventory-unproven');known.add(renewal.id);
 if(adoptionOperationId){const a=rows.find(r=>r.id===prefix+'adopt-'+adoptionOperationId);if(a?.packet?.purpose!=='credential-adoption-v2'||a.packet.operationId!==adoptionOperationId||a.packet.renewalOperationId!==renewalOperationId||a.packet.generation!==generation)throw fail('successor-inventory-unproven');known.add(a.id);}
 for(const r of rows){if(known.has(r.id)||r.id.startsWith(prefix+'op-lease-'))continue;const pin=r.packet,id=pin?.operationId,l=rows.find(v=>v.id===prefix+'op-lease-'+id)?.packet;
  if(r.id!==prefix+'op-'+id||pin?.purpose!=='owner-operation-pending-v1'||l?.purpose!=='owner-operation-lease-pin-v1'||l.operationId!==id||pin.envelope?.schemaVersion!==3||pin.envelope.authority.generation!==generation||!equal(pin.envelope.consumer,consumer.consumer))throw fail('successor-inventory-unproven');
  validateOperationEnvelope(pin.envelope);validateOperationLease(l.lease,pin.envelope);validateCutoverPin(pin,{operationId:id,envelope:pin.envelope});
  if(l.schemaVersion!==1||!equal(Object.keys(l).sort(),['schemaVersion','purpose','operationId','lease'].sort())||l.lease.envelopeDigest!==pin.envelopeDigest)throw fail('successor-inventory-unproven');known.add(r.id);known.add(prefix+'op-lease-'+id);items.push({pin,lease:l.lease});
 }
 if(rows.some(r=>!known.has(r.id))||known.size!==rows.length)throw fail('successor-inventory-unproven');
 return {snapshot:h.snapshot,consumer:consumer.consumer,publication:pub.fact,publicationDigest:pub.publicationDigest,basis,items,inventory:rows.map(r=>({id:r.id,digest:digest(r)}))};
}
