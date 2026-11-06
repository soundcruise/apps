import {getAttentionGuide} from '../../../../cruise-port/sync-attention-ui.mjs';
import {attachPresentation} from './presentation.mjs?v=0.85.0';
import {createPortProBoundary} from '../../core/port-pro-boundary.mjs';
import {resolveCruiseAppHref} from '../../../../cruise-port/cruise-app-links.js';

// Connection/lifetime glue only. Native clients own grants, merge, CAS, Outbox,
// records and UI; the existing shared Account DB remains the sole Account source.
export function createNativeSyncHost(id, current, entry, root, url) {
 const storage=root.storage, owner=entry.read().accountId, generation=storage.getGeneration();
 const life=new AbortController();let owned=null, verified=null, failure=null,reviewRequired=false,unwatch=()=>{};
 const fail=code=>Object.assign(new Error(code),{code});
 function assertCurrent(){if(life.signal.aborted||!current()||!entry.isAuthorized()||entry.read().accountId!==owner||storage.getGeneration()!==generation)throw fail('studio_account_changed');}
 function assertSyncCurrent(){assertCurrent();if(reviewRequired)throw fail('studio_app_review_required');}
 async function check(){assertCurrent();const account=await storage.getAccount();assertCurrent();if(account?.accountId!==owner||!root.core.validAccountCredential(account.accountCredential))throw fail('account_auth_required');return account;}
 const client=new root.AccountClient({endpoint:'https://sound-cruise-sync.cruise-port-requests.workers.dev',admissionMode:'production',storage,assertCurrent,signal:life.signal});
 const accountStorage={...storage,
  // Same-container handoff must not replace Port's current Account Device. The
  // native grant's AppDevice is saved by its native client; no second Account is saved.
  async setAccount(value){const account=await check();if(value?.accountId!==account.accountId)throw fail('studio_account_mismatch');return {generation:storage.getGeneration()};},
  clearAccount(){throw fail('account_change_requires_port');}
 };
 async function verifyDevice(credential){
  const account=await check(),deviceId=credential?.split('.')[1];
  if(!deviceId)throw fail('app_auth_required');
  if(verified===credential)return;
  const result=await client.devices(account.accountCredential);await check();
  if(!result.appDevices?.some(d=>d.id===deviceId&&d.appId===id&&d.revokedAt==null))throw fail('studio_app_account_mismatch');
  verified=credential;
 }
 async function fetchSync(input,options={}){
  await check();const address=new URL(typeof input==='string'?input:input.url),headers=new Headers(options.headers||input.headers);
  if(address.pathname.startsWith('/v1/sync/')){assertSyncCurrent();await verifyDevice(headers.get('Authorization')?.replace(/^Bearer\s+/i,''));}
  const signal=options.signal?AbortSignal.any([options.signal,life.signal]):life.signal;
  const response=await fetch(input,{...options,signal});await check();return response;
 }
 const messages={sync_storage_schema_invalid:'このアプリの同期DBの構成を確認できません。保存内容は削除していません。データを消去せず、端末の状態を確認してください。',studio_app_account_mismatch:'このアプリには別Accountまたは失効した端末の接続情報があります。保存内容と未送信操作は保持し、同期を停止しています。',studio_account_changed:'Accountまたは資格が変更されました。入力は保持しています。現在の接続先を確認してから開き直してください。',app_connection_pending:'前のアプリ接続を復旧してから、もう一度確認してください。'};
 const host={
  // Reuse the native guide for explicit review; opening a workspace never steals its start screen.
  attentionWindow:{[Symbol.for('soundCruise.syncAttentionGuide')]:{mark:key=>getAttentionGuide(globalThis).mark(key),open:(issue,automatic=false)=>automatic?Promise.resolve(false):getAttentionGuide(globalThis).open(issue,false)}},
  get failure(){return failure;},
  set failure(error){failure=error;},
  message(error){const code=error?.code||error?.message;return messages[code]||'接続を確認できません。保存内容は保持しています。通信・Account・Pro資格を確認してください。';},
  retry(){const app=globalThis.CruiseStudio.seriesApps[id];if(app.requestLeave())return;app.deactivate();app.activate();},
  storeOptions:{assertCurrent,signal:life.signal},
  guardedStorage(target){return new Proxy(target,{get(target,key){if(key==='setItem'||key==='removeItem'||key==='clear')return(...args)=>{assertCurrent();return target[key](...args);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});},
  get chordOptions(){return {assertCurrent,beforeSync:assertSyncCurrent,signal:life.signal,fetch:fetchSync,retainTerminalIdentity:true,
   onRemoteApplied(){assertCurrent();const child=globalThis.CruiseStudio.seriesApps[id].nativeWindow,app=child.ChordCruise;app.state.settings=app.storage.loadSettings();app.ui.settings.refresh();},
   localStorage:host.guardedStorage(globalThis.CruiseStudio.seriesApps[id].nativeWindow.localStorage)};},
  own(value){owned=value;},
  reportUpdated(){assertCurrent();globalThis.dispatchEvent(new CustomEvent('soundcruise:sync-report',{detail:{appId:id,ok:true}}));},
  present({state,status}){if(life.signal.aborted||!current())return;const node=document.querySelector('[data-series-sync-status="'+id+'"]');if(node){node.textContent=status;node.dataset.nativeSyncState=state;}},
  async prepare({appId,adapter,store,client:chord}){
   try{
    if(appId!==id)throw fail('studio_app_account_mismatch');
    if(adapter)adapter.storage=host.guardedStorage(adapter.storage);
    const account=await check(),summary=await client.summary(account.accountCredential);await check();
    if(summary.account?.id!==owner||summary.account.state!=='active')throw fail('account_auth_required');
    const membership=summary.memberships?.find(m=>m.appId===id);
    if(!membership||!['active','pending'].includes(membership.state))throw fail('membership_state_invalid');
    const nativeStore=store||await chord.openStore();
    const credential=store?await store.readMeta('credential'):(await nativeStore.getMeta('deviceCredential'))?.credential;
    if(credential)await verifyDevice(credential);
    const pending=await nativeStore.listOutbox(),conflicts=await nativeStore.listConflicts(),shadow=await nativeStore.listShadow();
    let meaningful;
    if(adapter)meaningful=adapter.isMeaningfulLocalData(adapter.readLocalSnapshot());
    else meaningful=globalThis.CruiseStudio.seriesApps[id].nativeWindow.ChordCruiseSync.merge.hasMeaningfulLocalData(await chord.captureSnapshot());
    if(!credential&&(pending.length||conflicts.length||shadow.length))throw fail('studio_app_account_mismatch');
    // A valid AppDevice identifies the Cloud owner, not arbitrary local bytes.
    // Only the native shadow or an exact native pending operation attributes a
    // local difference. Untracked legacy/local-only edits need explicit review.
    let untracked=false;
    if(credential){
     const initialChordJoin=!adapter&&await nativeStore.getMeta('accountManagedSetup')===true&&await nativeStore.getMeta('migrationState')==='pair_pending';
     const local=adapter?await adapter.serializeRecords(adapter.readLocalSnapshot()):(await chord.captureSnapshot()).records;
     const key=r=>r.recordType+'/'+r.recordId,live=r=>r&&!r.deleted&&r.deletedAt==null;
     const map=new Map(local.map(r=>[key(r),r])),base=new Map(shadow.map(r=>[key(r),r]));
     for(const k of new Set([...map.keys(),...base.keys()])){
      const l=map.get(k),s=base.get(k);
      if((!l&&!live(s))||(l&&live(s)&&(l.payloadHash===s.payloadHash||adapter?.sameRecordForSync?.(l,s))))continue;
      if(initialChordJoin&&l&&!s&&l.recordType==='folder'&&globalThis.CruiseStudio.seriesApps[id].nativeWindow.ChordCruiseSync.merge.isInitialFolder(l.payload))continue;
      if(!pending.some(o=>key(o)===k&&(l?o.payloadHash===l.payloadHash&&!o.deleted:o.deleted===true)))untracked=true;
     }
    }
    reviewRequired=credential?untracked:meaningful;
    return {
     connected:!!credential,get review(){return reviewRequired;},
     approveReview(){assertCurrent();reviewRequired=false;},
     accountStorage,accountOptions:{assertCurrent,signal:life.signal},
     runtimeOptions:{assertCurrent:assertSyncCurrent,assertCurrentAsync:async()=>{assertSyncCurrent();return check();},fetchImpl:fetchSync,retainTerminalIdentity:true,captureOfflineSaves:true},
     async connect(operation){return navigator.locks.request('sound-cruise:account-consume:'+owner,{signal:life.signal},async()=>{await check();const p=await storage.getPendingConsume();if(p&&p.appId!==id)throw fail('app_connection_pending');return operation();});},
     async grant(){
      await check();
      if(membership.state==='pending'){
       const material=root.core.createJoinMaterial(),issued=await client.issueJoinInvitation({accountCredential:account.accountCredential,appId:id,material});await check();return {joinCode:issued.displayJoinCode};
      }
      const material=root.core.createHandoffMaterial();await client.issueHandoff({accountCredential:account.accountCredential,appId:id,appUrl:url.href,material});await check();return {handoffToken:material.handoffToken};
     }
    };
   }catch(error){failure=error;throw error;}
  },
  dispose(){if(life.signal.aborted)return;life.abort();owned?.dispose?.();unwatch();}
 };
 unwatch=storage.subscribeAccount(()=>host.dispose());
 return host;
}
export async function mount(id, host, current) {
 const boundary=createPortProBoundary();
 const verdict=await boundary.authorize();
 if(!current()){boundary.dispose();return null;}
 if(!verdict.ok){host.textContent='Studio入口の認証を確認してください。';boundary.dispose();return null;}
 const admittedAccount=globalThis.CruiseStudio.entryAuth.read().accountId;
 const url=new URL(resolveCruiseAppHref(id,'pro'),location.origin);
 const syncHost=createNativeSyncHost(id,current,CruiseStudio.entryAuth,globalThis.SoundCruiseSyncAccount,url);
 const status=document.querySelector('[data-series-sync-status="'+id+'"]');
 if(status)status.textContent='同期を確認中…';
 CruiseStudio.seriesApps[id].syncHost=syncHost;
 let response;try{response=await fetch(url,{cache:'no-store',signal:syncHost.storeOptions.signal});if(!response.ok)throw Error('アプリを読み込めません');}catch(error){syncHost.dispose();boundary.dispose();throw error;}
 const parsed=new DOMParser().parseFromString(await response.text(),'text/html');
 // Keep native Sync and adapters, replacing only the app's duplicate Pro gate.
 for(const script of parsed.querySelectorAll('script')){
  if(!script.getAttribute('src')){if(script.parentElement===parsed.head&&script.textContent.includes("document.documentElement.setAttribute('data-theme'"))continue;script.remove();continue;}
  const path=new URL(script.getAttribute('src'),url).pathname;
  if(path.includes('/shared/pro-gate')||path.includes('/shared/pro-device-session')||path.includes('/shared/sync-account/sync-account-turnstile')){script.remove();continue;}
  script.src=new URL(script.getAttribute('src'),url).href;
 }
 parsed.querySelectorAll('base,link[rel=manifest],link[rel=preconnect],link[href*="pro-gate"]').forEach(e=>e.remove());
 parsed.documentElement.dataset.studioApp=id;
 const base=parsed.createElement('base');base.href=url.href;parsed.head.prepend(base);
 const style=parsed.createElement('style');style.textContent='#pro-gate-reset{display:none!important} html,body{min-width:0} body{margin:0} .app-container{max-width:1200px;margin-inline:auto} a[href*="cruise-port/"]{display:none!important}';parsed.head.append(style);
 const runtime=parsed.createElement('script');runtime.textContent=`(()=>{window.SoundCruiseNativeSyncHost=parent.CruiseStudio.seriesApps['${id}'].syncHost;window.addEventListener('pagehide',()=>window.SoundCruiseNativeSyncHost.dispose(),{once:true});parent.CruiseStudio.seriesApps['${id}'].nativeWindow=window;window.__soundCruiseRejectProBackendAuth=(...a)=>parent.__soundCruiseRejectProBackendAuth?.(...a);const entry=parent.CruiseStudio.entryAuth,current=()=>entry.isAuthorized()&&entry.read().accountId===${JSON.stringify(admittedAccount)};window.SoundCruiseProOperationSource=Object.freeze({read(){return current()?parent.SoundCruiseProOperationSource.read():{auth:null,revoked:true};},async validate(auth){if(!await entry.check()||!current())return {ok:false,revoked:true};return parent.SoundCruiseProOperationSource.validate(auth);}});window.__soundCruiseEnsureProSession=()=>entry.check();document.addEventListener('click',e=>{if(!e.target.closest('.js-reload-app,.cc-refresh-app'))return;e.preventDefault();e.stopImmediatePropagation();if(current())parent.CruiseStudio.seriesApps['${id}'].refresh();},true);const contexts=new Set(),streams=new Set();let stopped=false;if(navigator.mediaDevices){const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...args)=>{if(stopped||!current()||!parent.CruiseStudio.seriesApps['${id}'].claimAudio())throw new DOMException('Studio audio unavailable','AbortError');const stream=await get(...args);if(stopped||!current()){stream.getTracks().forEach(t=>t.stop());throw new DOMException('Studio audio stopped','AbortError');}streams.add(stream);return stream;};}for(const key of ['AudioContext','webkitAudioContext']){const Native=window[key];if(Native)window[key]=class extends Native{constructor(...args){if(stopped||!current()||!parent.CruiseStudio.seriesApps['${id}'].claimAudio())throw Error('Studio audio is stopped or owned by another tool');super(...args);contexts.add(this);}};}try{Object.defineProperty(navigator,'serviceWorker',{value:{getRegistrations:async()=>[],getRegistration:async()=>undefined,ready:new Promise(()=>{}),addEventListener(){}}});}catch{}window.studioAppStop=()=>{stopped=true;for(const stream of streams)stream.getTracks().forEach(t=>t.stop());for(const c of contexts)c.close().catch(()=>{});document.querySelectorAll('audio,video').forEach(e=>e.pause());};window.addEventListener('pagehide',window.studioAppStop);document.addEventListener('visibilitychange',()=>{if(document.hidden)window.studioAppStop();});document.addEventListener('input',()=>{window.studioAppDirty=true;});document.addEventListener('change',()=>{window.studioAppDirty=true;});document.addEventListener('click',e=>{if(!e.target.closest('[data-sync-join-entry-host]')&&e.target.closest('[id*=settings],[class*=settings],[role=dialog]'))window.studioAppDirty=true;});})();`;parsed.head.insertBefore(runtime,base.nextSibling);
 if(!current()||!CruiseStudio.entryAuth.isAuthorized()||CruiseStudio.entryAuth.read().accountId!==admittedAccount){syncHost.dispose();boundary.dispose();return null;}
 const iframe=document.createElement('iframe');iframe.title=id+' Pro';iframe.className='studio-series-frame';const presentation=attachPresentation(iframe);
 iframe.srcdoc='<!doctype html>'+parsed.documentElement.outerHTML;host.replaceChildren(iframe);
 return {iframe,refreshLayout:presentation.refresh,dispose(){syncHost.dispose();presentation.dispose();boundary.dispose();iframe.contentWindow?.studioAppStop?.();iframe.remove();if(CruiseStudio.seriesApps[id].syncHost===syncHost){delete CruiseStudio.seriesApps[id].syncHost;delete CruiseStudio.seriesApps[id].nativeWindow;}}};
}
