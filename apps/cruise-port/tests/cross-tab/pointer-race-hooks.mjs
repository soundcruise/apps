// Isolated test instrumentation. A held native RW transaction blocks both actual
// Store RW transactions until the driver observes their queued/no-request state.
export function pointerRaceHooks({name,commitOld,commitPublication,commitControl}) {
 let events=[],results={},sequence=0,releaseBarrier,barrierDone,originalTransaction,originalGet,gate=null;
 const stamp=(phase,id,extra={})=>events.push({phase,id,at:Date.now(),...extra});
 function reset(){if(originalTransaction)IDBDatabase.prototype.transaction=originalTransaction;if(originalGet)IDBObjectStore.prototype.get=originalGet;
  originalTransaction=originalGet=null;events=[];results={};sequence=0;gate=null;return true;}
 function trace(){
  originalTransaction=IDBDatabase.prototype.transaction;originalGet=IDBObjectStore.prototype.get;const identities=new WeakMap(),started=new WeakSet();
  IDBDatabase.prototype.transaction=function(...args){const tx=originalTransaction.apply(this,args),id=++sequence;identities.set(tx,id);
   stamp('queued',id,{mode:tx.mode,stores:[...tx.objectStoreNames]});
   tx.addEventListener('complete',()=>stamp('completed',id));tx.addEventListener('abort',()=>stamp('aborted',id));return tx;};
  IDBObjectStore.prototype.get=function(...args){const r=originalGet.apply(this,args),tx=this.transaction,id=identities.get(tx);
   r.addEventListener('success',()=>{if(id&&!started.has(tx)){started.add(tx);stamp('request-started',id);}},{once:true});
   if(id&&gate&&!gate.claimed&&tx.mode==='readwrite'&&[...tx.objectStoreNames].includes('pointer')){
    const held=gate;held.claimed=true;const descriptor=Object.getOwnPropertyDescriptor(IDBRequest.prototype,'onsuccess');
    Object.defineProperty(r,'onsuccess',{set(handler){descriptor.set.call(r,event=>{
     held.active=true;held.id=id;stamp('gate-started',id);const deadline=performance.now()+15000;
     const keep=()=>{const request=originalGet.call(tx.objectStore('pointer'),'namespace');request.onsuccess=()=>{
      if(held.released){held.active=false;stamp('gate-released',id);handler.call(r,event);}
      else if(performance.now()>deadline){stamp('gate-expired',id);tx.abort();}else keep();
     };};keep();
    });},get(){return descriptor.get.call(r);}});
   }
   return r;};return true;
 }
 async function hold(){
  const db=await new Promise((ok,no)=>{const r=indexedDB.open(name());r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
  const tx=db.transaction(['pointer','head','control','manifests','records','oplog','journal','reservations'],'readwrite');let stop=false,first=true;
  let resolveDone;barrierDone=new Promise(r=>resolveDone=r);releaseBarrier=()=>{stop=true;stamp('barrier-release',0);};
  tx.oncomplete=()=>{db.close();stamp('barrier-completed',0);resolveDone(true);};tx.onabort=()=>{db.close();resolveDone(false);};
  return new Promise((ok,no)=>{const startedAt=Date.now(),loop=()=>{const r=tx.objectStore('pointer').get('namespace');r.onerror=()=>no(r.error);r.onsuccess=()=>{
   if(first){first=false;stamp('barrier-started',0);ok(true);}if(stop)tx.commit?.();else if(Date.now()-startedAt>15000){stamp('barrier-expired',0);tx.abort();}else loop();
  };};loop();});
 }
 const dispatch=(kind,id)=>{results[id]={pending:true};const p=kind==='old'?commitOld(id):kind==='control'?commitControl(id):commitPublication(id);
  Promise.resolve(p).then(result=>{results[id]=result;stamp('result',0,{operation:id,outcome:result.ok?'applied-or-replayed':'rejected',reason:result.reason??null});},error=>results[id]={error:String(error)});return true;};
 return {raceReset:reset,raceTrace:trace,raceHold:hold,raceGate:()=>{gate={claimed:false,active:false,released:false};return true;},raceGateRelease:()=>{if(!gate?.active)throw Error('inactive gate');gate.released=true;return true;},raceRelease:async()=>{releaseBarrier();return barrierDone;},raceDispatch:({kind,id})=>dispatch(kind,id),raceState:()=>({events:[...events],results:{...results},gate:gate&&{...gate}})};
}
