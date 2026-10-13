import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {observedTransactionRace} from './native-transaction-race.mjs';
export async function runControlSuite({evaluate,primary,peer,rounds=3}){
 const results=[],call=(s,fn,arg)=>evaluate(s,`crossTab.${fn}(${arg===undefined?'':JSON.stringify(arg)})`),id=p=>p+'-'+randomUUID().slice(0,8);
 const pairs=[...['suspendWrites','revokeFence','invalidateIdentity','markRecoveryRequired','pointer'].flatMap(a=>[['save',a],[a,'save']]),
  ['resumeWrites','revokeFence'],['revokeFence','resumeWrites'],['renewFence','revokeFence'],['revokeFence','renewFence'],['suspendWrites','resumeWrites'],['resumeWrites','suspendWrites']];
 for(let round=0;round<rounds;round++)for(const [a,b] of pairs){
  const generation=id('control'),bound=[a,b].includes('renewFence');
  await call(primary,'prepare',{role:'primary',generation,scenario:'save-save-same-key',iterations:1,controlBound:bound});
  await call(peer,'prepare',{role:'peer',generation,scenario:'save-save-same-key',iterations:1,controlBound:bound});
  if([a,b].includes('resumeWrites')&&a!=='suspendWrites'){
   await call(primary,'controlPacket',{id:'initial-suspend',action:'suspendWrites'});assert((await call(primary,'controlPacketCommit','initial-suspend')).ok);
  }
  const first={actor:primary,id:id('first'),kind:a==='save'?'old':a==='pointer'?'publication':'control'},second={actor:peer,id:id('second'),kind:b==='save'?'old':b==='pointer'?'publication':'control'};
  for(const [actor,action,p] of [[primary,a,first],[peer,b,second]]){
   if(action==='save')await call(actor,'controlSavePacket',p.id);
   else if(action==='pointer'){
    const next=id('next'),migrationId=id('m');await call(primary,'pointerStage',{generation:next,migrationId});
    await call(actor,'pointerPacket',{id:p.id,generation:next,migrationId,operationId:p.id,expectedPointerEpoch:(await call(actor,'pointerState')).pointer.pointerEpoch});
   }else await call(actor,'controlPacket',{id:p.id,action,...(a==='suspendWrites'&&b==='resumeWrites'&&action===b?{expectedEpoch:2}:{})});
  }
  const r=await observedTransactionRace({call,primary,peer,first,second});assert(r.first.ok,'first admitted transaction');
  if(a==='save')assert(r.second.ok,'stop/switch after save');
  else if(b==='save')assert.equal(r.second.ok,false,'save after stop/switch must reject');
  else if(['resumeWrites','renewFence'].includes(b)&&a==='revokeFence')assert.equal(r.second.reason,'control-stale');
  else assert(r.second.ok,'valid ordered control');
  if(r.first.status==='control-committed')assert.equal((await call(primary,'controlFact',first.id)).result.historical,true);
  const state=await call(primary,'controlRead');assert(state.ok);assert.equal(state.readOnly,a==='pointer'||b==='pointer'?true:b==='resumeWrites'&&a!=='revokeFence'?false:true);
  if(b==='resumeWrites'&&a==='revokeFence')assert.equal(state.readOnly,true);
  results.push({name:a+' → '+b,round,pass:true,...r});
 }
 return results;
}
