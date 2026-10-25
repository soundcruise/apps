// Dependency injection only. Product boot never installs this controller.
export function createIsolatedBpmController({owner,pending}={}){
 if(['load','prepare','commit','recover'].some(k=>typeof owner?.[k]!=='function')||['read','claim'].some(k=>typeof pending?.[k]!=='function'))throw Error('bpm-controller-dependencies');
 let view=null,draft=null,busy=false,status='unloaded',pendingId=null;
 const snapshot=()=>Object.freeze({bpm:view?.bpm??null,draft,dirty:view!==null&&draft!==view.bpm,busy,status,pendingId,canWrite:false});
 return Object.freeze({snapshot,
  async reload(){if(busy)return {ok:false,reason:'busy'};busy=true;try{const r=await owner.load();if(r.ok){view=r;draft=r.bpm;status='loaded';}else{view=null;status=r.reason;}return r;}finally{busy=false;}},
  edit(bpm){if(busy||!view||!Number.isInteger(bpm)||bpm<30||bpm>240)return false;draft=bpm;status='draft';return true;},
  async save({operationId}={}){if(busy||!view)return {ok:false,reason:'bpm-not-ready'};busy=true;try{
   if(pendingId!==null||await pending.read(operationId))return {ok:false,reason:'bpm-pending-recovery'};
   const p=await owner.prepare(view,draft,{operationId});if(!p.ok){status=p.reason;return p;}
   await pending.claim(p.recoveryTicket);pendingId=operationId;
   if(JSON.stringify(await pending.read(operationId))!==JSON.stringify(p.recoveryTicket))throw Error('bpm-pending-readback-mismatch');
   const r=await owner.commit(p);status=r.ok?'saved-historical':r.reason;
   if(r.ok)view=null;return r;
  }catch(e){status=e.message;return {ok:false,reason:e.message};}finally{busy=false;}},
  async recover({operationId=pendingId}={}){if(busy)return {ok:false,reason:'busy'};busy=true;try{if(!operationId)return {ok:false,reason:'bpm-ticket-missing'};const q=await pending.read(operationId);if(!q)return {ok:false,reason:'bpm-ticket-missing'};const r=await owner.recover(q);status=r.ok?'saved-historical':r.reason;return r;}finally{busy=false;}},
  async acknowledgeRecovery({operationId=pendingId}={}){if(busy||!operationId)return false;busy=true;try{const q=await pending.read(operationId);if(!q)return false;const r=await owner.recover(q);if(!r.ok)return false;if(pendingId===operationId){pendingId=null;status='recovery-acknowledged';}return true;}finally{busy=false;}}
 });
}
