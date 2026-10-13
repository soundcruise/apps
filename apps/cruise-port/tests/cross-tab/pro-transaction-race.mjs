import assert from 'node:assert/strict';
// Formal dataset operations first reserve identity in a separate transaction.
// Gate the actual mutation transaction, never infer its order from reserve queue order.
export async function observedProTransactionRace({call,primary,peer,first,second,beforeRelease}){
 const poll=async fn=>{for(let n=0;n<250;n++){const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,5));}throw Error('inconclusive: Pro mutation checkpoint missing');};
 for(const actor of [primary,peer]){await call(actor,'raceReset');await call(actor,'raceTrace');await call(actor,'raceGate');}
 try{
  await call(first.actor,'raceDispatch',{kind:first.kind,id:first.id});
  const admitted=await poll(async()=>{const s=await call(first.actor,'raceState');return s.gate?.active&&s;});
  await call(second.actor,'raceDispatch',{kind:second.kind,id:second.id});
  const queued=await poll(async()=>{const s=await call(second.actor,'raceState');return s.events.some(e=>e.phase==='queued'&&e.mode==='readwrite')&&s;});
  assert(!queued.gate?.active);assert(!queued.events.some(e=>e.phase==='request-started'),'second real transaction waits behind first mutation');
  if(beforeRelease)await beforeRelease();
  await call(first.actor,'raceGateRelease');
  await poll(async()=>{const b=await call(second.actor,'raceState');return b.gate?.active;});
  const firstEnded=await call(first.actor,'raceState');
  if(!firstEnded.events.some(e=>e.id===admitted.gate.id&&['completed','aborted'].includes(e.phase)))throw Error('inconclusive: first Pro completion not observed after second request');
  assert(firstEnded.events.some(e=>e.id===admitted.gate.id&&['completed','aborted'].includes(e.phase)));
  await call(second.actor,'raceGateRelease');
  const after=await poll(async()=>{const a=await call(first.actor,'raceState'),b=await call(second.actor,'raceState');return a.results[first.id]&&!a.results[first.id].pending&&b.results[second.id]&&!b.results[second.id].pending&&[a,b];});
  assert(!after.some(s=>s.events.some(e=>e.phase==='gate-expired'||e.phase==='barrier-expired')));
  return {first:after[0].results[first.id],second:after[1].results[second.id],queuedWhileFirstMutationHeld:queued.events.filter(e=>e.phase==='queued'),trace:after.map(s=>s.events),orderProven:true,inconclusive:false};
 }finally{for(const actor of [primary,peer])await call(actor,'raceReset');}
}
