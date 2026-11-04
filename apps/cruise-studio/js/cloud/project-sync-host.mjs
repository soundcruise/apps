/* Connection glue for the retained Project protocol, not a second Sync engine.
 * Only isolated development origins/endpoints. Production transport stays refused. */
import {createStudioTransport} from './studio-transport.mjs';
import {createStudioSessionAdapter} from './studio-session-adapter.mjs';
import {createIsolatedStudioSyncClient} from './studio-sync-client.mjs';
import {mountStudioCloudPanel} from './cloud-panel.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function isolatedProjectOrigin(location){
 return location?.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)||location?.protocol==='https:'&&location.hostname.endsWith('.invalid');
}
// An existing Account-bound link is required; arbitrary old local Projects are
// never adopted merely because the current Account/Pro entrance is authorized.
export async function resumeTrackedProject({client,repository,projectId,dirty=false}){
 if(dirty)return {state:'LOCAL_DRAFT_UNSAVED'};
 const link=await client.tracking(projectId);
 if(!link)return {state:'LOCAL_UNTRACKED'};
 if(link.intent)return {state:'LOCAL_APPLY_UNKNOWN'};
 const unresolved=(await client.list(projectId)).filter(o=>!['SYNCED','LOCAL_CHANGED','HISTORICAL_RECEIPT','ADOPTED','DISCARDED_LOCAL_RETAINED'].includes(o.state));
 if(unresolved.length){
  if(unresolved.length===1&&['QUEUED','UPLOADING'].includes(unresolved[0].state))return client.send(unresolved[0].operationId);
  return {state:unresolved[0].state};
 }
 const here=repository.read({type:'project',projectId});
 if(!here.ok)fail('local-read');
 if(!here.exists)return {state:'LOCAL_MISSING'};
 const observed=await client.observe(projectId);
 if(observed.state==='REMOTE_DELETED')return observed;
 if(observed.state!=='REMOTE_AVAILABLE')return observed;
 const localChanged=here.revision!==link.lastLocalRevision;
 const remoteChanged=observed.head.revision!==link.cloudRevision;
 if(localChanged&&remoteChanged)return {state:'CONFLICT'};
 if(remoteChanged)return client.applyRemote(projectId,here.revision);
 if(localChanged){const operation=await client.enqueue(projectId);return client.send(operation.operationId);}
 return {state:'SYNCED'};
}
export function mountProjectSyncHost({C=globalThis.CruiseStudio,endpoint,element,location=globalThis.location,storage=globalThis.SoundCruiseSyncAccount?.storage}={}){
 if(!isolatedProjectOrigin(location))fail('project-production-disabled');
 const transport=createStudioTransport({endpoint});
 if(transport.mode!=='isolated')fail('project-production-disabled');
 if(!C?.repository||!storage||!element)fail('project-host-dependencies');
 let epoch=0,disposed=false,pending=null,selectedId=null,again=false;
 let session,client,panel;
 const doc=element.ownerDocument;
 element.classList.add('studio-cloud-panel');
 const status=doc.createElement('p');status.dataset.projectSyncStatus='';status.setAttribute('role','status');element.append(status);
 const idInput=doc.createElement('input');idInput.placeholder='別端末のProject ID';idInput.setAttribute('aria-label','Cloudから取得するProject ID');element.append(idInput);
 const body=doc.createElement('div');element.append(body);
 const messages={SYNCED:'Project同期済み',LOCAL_UNTRACKED:'ローカルProjectです。初回のCloud保存は明示操作で行います。',LOCAL_DRAFT_UNSAVED:'編集中の内容をローカル保存してください。',CONFLICT:'確認が必要：両端末で更新されています。草稿をJSONへ保存してから取得・保存を選んでください。',UNKNOWN:'保存結果が不明です。未送信・復旧操作から結果を照合してください。',PENDING_RECOVERY:'資格を確認してください。未送信データは保持しています。',REMOTE_DELETED:'Cloudは削除済みです。ローカルProjectは保持しています。',LOCAL_SAVED_FROM_CLOUD:'Cloudを取得しました',LOCAL_APPLY_UNKNOWN:'中断したローカル取得の復旧が必要です。',LOCAL_MISSING:'ローカルProjectはありません。明示的にCloudを取得できます。'};
 const show=r=>{if(!disposed)status.textContent=messages[r?.state]||r?.state||'Project Syncを確認しています…';};
 function active(){const f=C.documents?.capture();return f?.ok?{projectId:f.project.projectId,dirty:f.dirty}:null;}
 function current(){const a=active();return selectedId?{projectId:selectedId,dirty:a?.projectId===selectedId&&a.dirty}:a;}
 function assertEntry(){if(disposed||!C.entryAuth?.isAuthorized())fail('studio-entry-required');}
 function rebuild(){
  panel?.dispose();session?.dispose();void client?.dispose();
  session=createStudioSessionAdapter({enabled:true,transport,accountStorage:storage});
  const read=()=>{assertEntry();return session.readSession();};
  client=createIsolatedStudioSyncClient({enabled:true,transport,repository:C.repository,model:C.model,readSession:read,
   assertSessionCurrent:async c=>{assertEntry();await session.assertCurrent(c);assertEntry();},commitSessionCurrent:(c,publish)=>session.commitLocal(c,()=>{assertEntry();return publish();})});
  panel=mountStudioCloudPanel({element:body,session:{enroll:connect,refresh:connect,readSession:read},client,repository:C.repository,getProject:current,onResult:r=>{if(r)show(r.receipt?.deleted?{state:'REMOTE_DELETED'}:r);}});
 }
 async function run(){
  const turn=epoch;assertEntry();
  status.textContent='Project Syncを確認しています…';
  try{session.readSession();await session.assertCurrent();}catch{await session.enroll();}
  if(turn!==epoch||disposed)fail('session-changed');assertEntry();
  const p=current();if(!p){status.textContent='Projectを開くか、別端末のProject IDを入力してください。';return;}
  try{const result=await resumeTrackedProject({client,repository:C.repository,...p});if(turn===epoch&&!disposed)show(result);return result;}
  finally{if(turn===epoch&&!disposed)await panel.refresh();}
 }
 function connect(){
  if(disposed)return Promise.resolve();
  if(pending){again=true;return pending;}
  const turn=epoch;
  let task;task=run().catch(e=>{if(turn===epoch&&!disposed)status.textContent=navigator.onLine===false?'Offline：ローカル保存・未送信データを保持しています。':'Project Syncを停止：'+(/^[a-z0-9_-]{1,64}$/i.test(e.code||e.message)?e.code||e.message:'通信失敗')+'。接続を再確認してください。';}).finally(()=>{if(pending===task){pending=null;if(again){again=false;void connect();}}});pending=task;return task;
 }
 function changed(){epoch++;pending=null;again=false;session.invalidate();rebuild();void connect();}
 idInput.addEventListener('change',()=>{selectedId=idInput.value.trim()||null;void connect();});
 const retry=doc.createElement('button');retry.type='button';retry.textContent='Project接続を再確認';retry.addEventListener('click',()=>{session.invalidate();void connect();});element.insertBefore(retry,body);
 const offAccount=storage.subscribeAccount?.(changed);
 const offSaved=C.repository.subscribe(()=>void connect());
 let activeId=C.documents?.getSession()?.target.projectId;
 const offDocument=C.documents?.subscribe(()=>{
  const id=C.documents.getSession()?.target.projectId;
  if(id===activeId)return;
  activeId=id;selectedId=null;idInput.value='';void connect();
 });
 const onOnline=()=>void connect();globalThis.addEventListener('online',onOnline);globalThis.addEventListener('focus',onOnline);
 const observer=new MutationObserver(()=>{if(!C.entryAuth?.isAuthorized()){epoch++;session.invalidate();status.textContent='Studio認証待ち：ローカルProject・未送信データを保持しています。';}else void connect();});
 observer.observe(doc.documentElement,{attributes:true,attributeFilter:['data-studio-entry']});
 rebuild();void connect();
 return Object.freeze({refresh:connect,get client(){return client;},get session(){return session;},dispose(){disposed=true;epoch++;observer.disconnect();offAccount?.();offSaved();offDocument?.();session.dispose();panel.dispose();void client.dispose();globalThis.removeEventListener('online',onOnline);globalThis.removeEventListener('focus',onOnline);element.replaceChildren();}});
}
export function mountIsolatedProjectSync(C,config){
 if(!config?.endpoint||!isolatedProjectOrigin(globalThis.location))return null;
 const details=document.createElement('details'),summary=document.createElement('summary'),element=document.createElement('div');
 summary.textContent='Project Cloud Sync（合成開発環境）';details.open=true;details.append(summary,element);
 document.getElementById('screen-sheet-cruise').append(details);
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('../../cloud-panel.css',import.meta.url).href;document.head.append(css);
 const host=mountProjectSyncHost({C,endpoint:config.endpoint,element});
 globalThis.addEventListener('pagehide',e=>{if(!e.persisted)host.dispose();},{once:true});return host;
}
