// Disposable browser profile only. Account/Pro server admission is synthetic; storage is native.
import { portRepository } from '../port-dataset-storage.js?v=1.29.2';
import { loadPracticeHistory, createEmptyPracticeHistory, createPracticeCompletedEvent } from '../practice-menu-history-store.js?v=1.29.2';
import { loadPracticeProgress, createEmptyPracticeProgress } from '../practice-menu-progress-store.js?v=1.29.2';
import { commitPracticeActivity } from '../practice-dataset-writes.js?v=1.29.2';
if (!['127.0.0.1','localhost','[::1]'].includes(location.hostname)) throw Error('local-fixture-only');
const accountRoot=globalThis.SoundCruiseSyncAccount, root=globalThis.SoundCruisePortSync;
accountRoot.core={validAccountCredential:v=>v?.startsWith('sca1.'),validAppCredential:v=>v?.startsWith('scd1.'),
 validQaCredential:()=>true,createOperationId:()=>crypto.randomUUID()};
accountRoot.AccountClient=class {async devices(){return {devices:[{revokedAt:null,portAppDeviceIds:['synthetic-port']}]};}};
const storage=accountRoot.storage;
async function seed(accountId){
 await storage.setAccount({accountId,accountDeviceId:'synthetic-native',accountCredential:'sca1.'+accountId+'.synthetic'});
 const s=SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId});
 for(const [key,value]of Object.entries({credential:'scd1.synthetic-port.synthetic',membership:{id:'synthetic-member',appId:'port',state:'active'},migrationState:'complete',datasetState:'ready',lastSyncAt:1,legacyInspected:true,runtimeState:'ready'}))await s.setMeta(key,value);
}
if(!await storage.getAccount())await seed('synthetic-A');
const controller=root.createPortSyncController({config:{enabled:true,environment:'production',endpoint:location.origin},canSync:()=>true});
const repository=portRepository();
async function inspect(){
 const a=await storage.getAccount(),s=SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:a.accountId});
 const state=await controller.status();
 return {active:!!controller.runtime,checking:state.checking,code:state.autoResumeCode,
  anchors:repository.inspect().pendingSync?.records.length||0,outbox:(await s.listOutbox()).length,shadow:(await s.listShadow()).length,
  history:loadPracticeHistory().history.events.length};
}
globalThis.journalFixture={
 async save(){loadPracticeHistory();loadPracticeProgress();return (await commitPracticeActivity(createEmptyPracticeProgress(new Date('2026-11-08T00:00:00Z')),
  {...createEmptyPracticeHistory(),events:[createPracticeCompletedEvent({id:'synthetic-menu',name:'Synthetic',durationMinutes:15,appId:null},'synthetic-cycle',new Date('2026-11-08T00:00:00Z'))]})).ok;},
 start(){controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0})}});},
 pagehide(){dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));},
 pageshow(){dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));},
 async switchAccount(){await seed('synthetic-B');},inspect
};
