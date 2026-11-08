// Host-side cleanup around the existing guarded configuration deployment.
// Callbacks must use the approved tree/artifact guard; no shell commands,
// credentials, raw configuration or provider responses are accepted here.
export async function withManualWebSession({expiresAt,enable,execute,restore,readState,clock=Date.now}){
 if(!Number.isSafeInteger(expiresAt)||expiresAt<=clock()||expiresAt-clock()>900000||[enable,execute,restore,readState].some(f=>typeof f!=='function'))throw Error('manual_session_invalid');
 let timer,execution=null,runError=null,restoreError=null,finalState=null,mayBeInFlight=false;
 const controller=new AbortController();
 try{
  // Never race a configuration mutation: a late enable must not land after
  // restoration. The server deadline still expires if this host is interrupted.
  await enable();if(clock()>=expiresAt)throw Error('manual_deadline_reached');
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{mayBeInFlight=true;controller.abort();reject(Error('manual_deadline_reached'));},Math.max(1,expiresAt-clock()));});
  const result=await Promise.race([Promise.resolve().then(()=>execute(controller.signal)),deadline]);
  execution=Object.fromEntries(['day','searches','ai_calls','processed','errors','skipped','stopped'].filter(k=>Object.hasOwn(result||{},k)&&['string','number','boolean'].includes(typeof result[k])).map(k=>[k,result[k]]));
 }catch(e){runError=e?.message==='manual_deadline_reached'?'manual_deadline_reached':'manual_execution_failed';}
 finally{
  clearTimeout(timer);
  try{await restore();}catch{restoreError='off_restore_failed';}
  try{const s=await readState();finalState=Object.fromEntries(['newsWeb','newsManual','newsEvidence','operatorView','operatorManual','manualEffective','inFlight'].map(k=>[k,typeof s?.[k]==='boolean'?s[k]:null]));}catch{restoreError=restoreError||'off_readback_failed';}
 }
 const offConfirmed=!!finalState&&['newsWeb','newsManual','newsEvidence','operatorManual','manualEffective','inFlight'].every(k=>finalState[k]===false)&&finalState.operatorView===true;
 const report={offConfirmed,execution,runError,restoreError,finalState,mayBeInFlight};
 if(runError||restoreError||!offConfirmed){const error=Error('manual_session_incomplete');error.report=report;throw error;}
 return report;
}
