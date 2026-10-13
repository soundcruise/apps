import assert from 'node:assert/strict';
// Explicit transaction gates prove order even when timestamps are equal.
export async function observedTransactionRace({call,primary,peer,first,second}){
 const poll=async fn=>{for(let n=0;n<250;n++){const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,5));}throw Error('inconclusive: transaction checkpoint missing');};
 for(const actor of [primary,peer])await call(actor,'raceReset');
 await call(primary,'raceHold');
 for(const actor of [primary,peer]){await call(actor,'raceTrace');await call(actor,'raceGate');}
 const queued=s=>s.events.filter(e=>e.phase==='queued'&&e.mode==='readwrite'&&e.stores.includes('pointer'));
 try{
  await call(first.actor,'raceDispatch',{kind:first.kind,id:first.id});await poll(async()=>queued(await call(first.actor,'raceState')).length);
  await call(second.actor,'raceDispatch',{kind:second.kind,id:second.id});await poll(async()=>queued(await call(second.actor,'raceState')).length);
  const before=[await call(primary,'raceState'),await call(peer,'raceState')];assert(before.every(s=>queued(s).length));
  assert(before.every(s=>!s.events.some(e=>e.phase==='request-started')),'both real transactions must be queued behind barrier');
  assert.equal(await call(primary,'raceRelease'),true);
  const firstStarted=await poll(async()=>{const a=await call(first.actor,'raceState'),b=await call(second.actor,'raceState');
   if(b.gate?.active&&!a.gate?.active)throw Error('inconclusive: requested order not established');return a.gate?.active&&[a,b];});
  assert(!firstStarted[1].events.some(e=>e.phase==='request-started'),'second transaction remains blocked by first actual transaction');
  await call(first.actor,'raceGateRelease');
  const secondStarted=await poll(async()=>{const a=await call(first.actor,'raceState'),b=await call(second.actor,'raceState');return b.gate?.active&&[a,b];});
  assert(secondStarted[0].events.some(e=>e.id===firstStarted[0].gate.id&&['completed','aborted'].includes(e.phase)),'first transaction ended before second request');
  await call(second.actor,'raceGateRelease');
  const after=await poll(async()=>{const a=await call(first.actor,'raceState'),b=await call(second.actor,'raceState');return a.results[first.id]&&!a.results[first.id].pending&&b.results[second.id]&&!b.results[second.id].pending&&[a,b];});
  assert(!after.some(s=>s.events.some(e=>e.phase==='gate-expired'||e.phase==='barrier-expired')));
  for(const s of after)assert(s.events.some(e=>e.phase==='completed'||e.phase==='aborted'));
  return {first:after[0].results[first.id],second:after[1].results[second.id],queuedWhileBarrierHeld:before.map(queued),trace:after.map(s=>s.events),orderProven:true,inconclusive:false};
 }finally{for(const actor of [primary,peer])await call(actor,'raceReset');}
}
