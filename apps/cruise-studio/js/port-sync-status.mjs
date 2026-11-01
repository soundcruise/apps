import {normalizeSyncCenterSummary, readSyncCenterConfig, createUnavailablePresentation} from '../../cruise-port/sync-center-controller.js?v=1.24.20';
import {renderSyncCenter} from '../../cruise-port/sync-center-ui.js?v=1.24.24';

/* Studio presentation only: native Account DB/API remain the sole owners. */
export function createAccountObservation({storage, summary, format=id=>id, allowed=()=>true, changed=()=>{}, now=()=>performance.now()}) {
    let revision=0, flight=null, disposed=false, confirmed=null;
    let state=Object.freeze({state:'checking',displayId:null,errorCode:null,timings:{}});
    const publish=next=>{state=Object.freeze(next);changed(state);return state;};
    function invalidate(){revision++;flight=null;confirmed=null;publish({state:'checking',displayId:null,errorCode:null,timings:{}});}
    async function refresh(){
        if(disposed)return state;
        if(flight)return flight;
        const turn=revision,generation=storage.getGeneration(),start=now();
        confirmed=null;publish({...state,state:'checking',errorCode:null});
        let operation;operation=(async()=>{
            const current=()=>!disposed&&turn===revision&&generation===storage.getGeneration();
            let displayId=null,readMs=0,requestStart;
            try{
                const account=await storage.getAccount();readMs=now()-start;
                if(!current())return state;
                if(!account?.accountCredential)return publish({state:'disconnected',displayId:null,errorCode:null,timings:{readMs,totalMs:now()-start}});
                displayId=format(account.accountId);
                if(!allowed())return publish({state:'stored',displayId:null,errorCode:null,timings:{readMs,totalMs:now()-start}});
                requestStart=now();const response=await summary(account.accountCredential);
                if(!current())return state;
                if(!allowed())return publish({state:'stored',displayId:null,errorCode:null,timings:{readMs,requestMs:now()-requestStart,totalMs:now()-start}});
                const after=await storage.getAccount();
                if(!current())return state;
                if(after?.accountId!==account.accountId||after?.accountCredential!==account.accountCredential)return publish({state:'attention',displayId:null,errorCode:'account_changed',timings:{readMs,totalMs:now()-start}});
                if(response?.account?.id!==account.accountId)throw Object.assign(Error('Account mismatch'),{code:'account_mismatch'});
                confirmed={response,generation};
                return publish({state:response.account.state==='active'?'connected':'attention',displayId,errorCode:null,timings:{readMs,requestMs:now()-requestStart,totalMs:now()-start}});
            }catch(error){
                if(!current())return state;
                const code=/^[a-z][a-z0-9_]{0,63}$/.test(error.code||'')?error.code:'account_check_failed';
                const terminal=error.status===401||error.status===403||error.status===410||code==='account_mismatch';
                return publish({state:terminal?'attention':globalThis.navigator?.onLine===false?'offline':'error',displayId,errorCode:code,timings:{readMs,...(requestStart===undefined?{}:{requestMs:now()-requestStart}),totalMs:now()-start}});
            }
        })().finally(()=>{if(flight===operation)flight=null;});flight=operation;return operation;
    }
    return Object.freeze({read:()=>state,confirmed:()=>confirmed,refresh,invalidate,dispose(){disposed=true;revision++;}});
}

export function portObservation(local,running,online=true){
    if(!local?.known)return {state:'unknown',label:'データ同期の状態は未取得'};
    if(!running)return local.credentialExists?{state:'stopped',label:'データ同期は停止中'}:{state:'unstarted',label:'データ同期は未開始'};
    if(!online||['paused','credential_invalid','not_connected'].includes(local.runtimeState))return {state:'stopped',label:'データ同期は停止中'};
    if(local.conflictCount>0||local.terminalCount>0||local.runtimeState==='attention')return {state:'attention',label:'データ同期に確認が必要'};
    return {state:'observed',label:'データ同期は稼働中（詳細はPort欄で確認）'};
}

if(typeof window!=='undefined'){
    const CS=window.CruiseStudio,root=window.SoundCruiseSyncAccount,node=document.querySelector('[data-port-sync-status]');
    const client=new root.AccountClient({endpoint:'https://sound-cruise-sync.cruise-port-requests.workers.dev',admissionMode:'production',storage:root.storage});
    let requestTimings={};
    async function readStatus(credential){
        const inspect=[...frames].some(([f,r])=>f.isConnected&&!f.inert&&!r.view.hidden);
        const start=performance.now(),stages={summaryMs:null,devicesMs:null,devicesRequested:inspect};requestTimings=stages;
        const [summary,devices]=await Promise.allSettled([
            client.summary(credential).finally(()=>{stages.summaryMs=performance.now()-start;}),
            inspect?client.devices(credential).finally(()=>{stages.devicesMs=performance.now()-start;}):Promise.resolve(null)
        ]);
        if(summary.status==='rejected')throw summary.reason;
        if(devices.status==='rejected'&&[401,403,410].includes(devices.reason?.status))throw devices.reason;
        // Local Sync metadata must not hold a successful Account reply hostage.
        // Reuse the native reader; it has no ensure/bootstrap/pull/push methods.
        if(inspect)for(const [f,r] of frames){
            if(!f.isConnected||f.inert||r.view.hidden)continue;
            if(!r.reader&&f.contentDocument.body.dataset.componentState==='ready')r.reader=f.contentWindow.SoundCruisePortSync?.createPortSyncReader({config:readSyncCenterConfig(f.contentWindow)});
            if(!r.reader?.status||r.localFlight)continue;
            const generation=root.storage.getGeneration();
            r.localFlight=r.reader.status().catch(()=>null).then(local=>{
                if(generation!==root.storage.getGeneration()||!f.isConnected||frames.get(f)!==r)return;
                r.local=local;applyNativeState(f,r,observation.read(),true);
            }).finally(()=>{r.localFlight=null;});
        }
        return {...summary.value,devices:devices.status==='fulfilled'?devices.value:null,deviceError:devices.status==='rejected'?devices.reason?.code:null,observedDeviceId:root.core.accountDeviceIdFromCredential(credential)};
    }
    const labels={checking:'接続先を確認中…',disconnected:'未接続',stored:'端末内に接続情報があります。Pro認証後に確認します。',connected:'接続先を確認しました',error:'通信失敗。接続情報・端末内データは保持しています。',offline:'オフライン。接続情報・端末内データは保持しています。',attention:'接続資格の確認が必要です。接続情報は変更していません。'};
    const frames=new Map();
    const guide='<details data-account-guide><summary>スマホのAccountに接続するには</summary><ol><li>スマホのPortと、このPCに表示されるAccount番号を比較してください。Pro認証の番号とAccount番号は別です。</li><li>異なる場合、いまのPCのAccount・未同期データ・未保存入力をそのまま残してください。</li><li>別のブラウザprofileでStudioまたはPort Proを開きます。既存PCのデータがない環境なら、別Accountへの混在を避けられます。</li><li>スマホのPortの「アカウントを同期」からCruise Portの追加コードを発行し、新しいprofileの「既存のアカウントに接続」へ入力します。Account新規作成や復旧コード更新は使いません。</li><li>同じAccount番号になったことを確認し、既存の初回同期手順で受信内容を確認してください。</li></ol><p>同じprofileで切り替える場合も、PCに残る別Accountのデータは自動移管しません。未同期データを保全してから、既存Portの正規手順で判断してください。</p></details>';
    node.innerHTML='<h2>Account・Cruise Sync</h2><p data-account-status role="status"></p><p data-account-target></p><p data-account-origin>このPCのPortで接続したAccountを使用します。新規作成やデータ移管は自動では行いません。</p><p>Accountの確認と、Portデータの同期完了は別です。</p><button type="button" class="btn-ghost" data-open-sync>Account・Syncを開く</button> <button type="button" class="btn-ghost" data-check-account>接続先を確認</button>'+guide;
    function text(node,value){if(node.textContent!==value)node.textContent=value;}
    function renderBox(box,s){
        box.dataset.studioAccountState=s.state;
        text(box.querySelector('[data-account-status]'),CS.entryAuth?.isAuthorized()?'Studio：Pro認証済み'+(CS.entryAuth.read().offline?'（オフライン猶予）':''):'Studio：Pro認証を確認してください。入力内容は保持しています。');
        text(box.querySelector('[data-account-target]'),'Cruise Sync：'+(s.displayId?s.displayId+' — ':'')+labels[s.state]);
        box.querySelector('[data-check-account]').disabled=s.state==='checking';
    }
    function updateFrame(frame,record,s){
        if(!frame.isConnected){record.observer.disconnect();record.reader?.dispose();frames.delete(frame);return;}
        const view=record.view;
        if(frame.inert){text(record.box.querySelector('[data-account-target]'),'前のAccountの画面は停止しています。未保存入力を保持しています。');return;}
        renderBox(record.box,s);
        applyNativeState(frame,record,s);
    }
    function applyNativeState(frame,record,s,force=false){
        const child=frame.contentWindow,view=record.view;
        if(view.ownerDocument!==frame.contentDocument||view.hidden||frame.inert||!CS.entryAuth?.isAuthorized()||view.ownerDocument.querySelector('dialog[open]')||view.querySelector('#port-sync-activate')?.disabled)return;
        // Native explicit operations own their live ready/error presentation.
        // On DOM notifications reapply only over the cold/local placeholder,
        // not over our own render (including errors) or an ongoing native action.
        if(!force&&view.dataset.syncState&&view.dataset.syncState!=='unknown')return;
        const proof=observation.confirmed();
        if(s.state==='checking'){
            const label=view.querySelector('#sync-center-account-status');if(label)text(label,'確認中…');
            return;
        }
        let presentation;
        if(s.state==='connected'&&proof?.generation===root.storage.getGeneration()){
            presentation=normalizeSyncCenterSummary(proof.response,proof.response.devices,root.core.formatAccountDisplayId,proof.response.observedDeviceId);
        }else if(['error','offline','attention'].includes(s.state))presentation=createUnavailablePresentation(s.state==='offline'?'offline':'error');
        else return;
        const local=record.reader?.getCachedStatus?.()||record.local;
        const runtime=child.SoundCruiseMultiAppSync?.runtimes?.port;
        const running=record.reader?.identity!=null;
        const sync=portObservation(local,running,child.navigator.onLine!==false);
        const existing=view.querySelector('#sync-center-port-status-chip');
        const nativeLive=running&&runtime&&view.dataset.syncState==='ready'&&existing&&['synced','syncing','attention'].includes(existing.dataset.syncPortStatus);
        const portStatus=nativeLive?{state:existing.dataset.syncPortStatus,label:existing.textContent}:sync;
        record.rendering=true;
        try{renderSyncCenter(view,{...presentation,portStatus,portConflictCount:local?.conflictCount||0,legacyRetryCount:view.querySelector('#sync-center-port-legacy-retry:not([hidden])')?1:0},{edition:child.document.documentElement.dataset.edition,orchestrationEnabled:readSyncCenterConfig(child).enabled,onRecheck:()=>observation.refresh()});}
        finally{record.rendering=false;}
        const label=view.querySelector('#sync-center-account-status');
        if(label)text(label,s.state==='connected'?'Account確認済み':s.state==='offline'?'オフライン':'確認失敗（再確認できます）');
        const line=record.box.querySelector('[data-sync-observation]');
        text(line,s.state==='connected'?'Accountは確認済み／'+sync.label+(proof.response.deviceError?'。端末一覧は取得できませんでした。再確認できます。':''):'同期状態は確認できません。接続情報と未同期データは保持しています。');
        record.syncState=sync.state;
    }

    const observation=createAccountObservation({storage:root.storage,summary:readStatus,format:root.core.formatAccountDisplayId,allowed:()=>CS.entryAuth?.isAuthorized()===true,changed:s=>{renderBox(node,s);for(const [frame,record]of frames){updateFrame(frame,record,s);applyNativeState(frame,record,s,true);}}});
    node.querySelector('[data-open-sync]').onclick=()=>CS.shellHost.navigate('portSync');
    node.querySelector('[data-check-account]').onclick=()=>void observation.refresh();
    function attachFrame(frame){
        if(frames.has(frame))return;
        const doc=frame.contentDocument,view=doc?.getElementById('sync-center-view');if(!view)return;
        const box=doc.createElement('section');box.dataset.studioAccountSummary='';box.innerHTML='<p data-account-status></p><p data-account-target role="status"></p><p data-sync-observation>データ同期は未照会です。</p><button type="button" data-check-account>接続先を確認</button>'+guide;
        if(!doc.getElementById('studio-account-summary-style')){const style=doc.createElement('style');style.id='studio-account-summary-style';style.textContent='[data-studio-account-summary] button{min-height:40px;padding:8px 16px;border:1px solid var(--border,#777);border-radius:10px;background:transparent;color:inherit;font:inherit}[data-studio-account-summary] details{margin-top:12px}[data-studio-account-summary] li{margin-block:8px}';doc.head.append(style);}
        box.style.cssText='padding:12px;margin:12px 0;border:1px solid var(--border,#777);border-radius:10px';view.prepend(box);
        box.querySelector('[data-check-account]').onclick=()=>void observation.refresh();
        const intent=doc.createElement('p');intent.dataset.studioSyncIntent='';intent.textContent='「同期を開始」は、このAccountの初回同期・データ送受信へ進む操作です。';view.append(intent);
        const record={box,view,attachedAt:performance.now(),nativeFirstStateMs:view.dataset.syncState?0:null,wasVisible:!view.hidden};
        record.observer=new MutationObserver(()=>{
            const visible=!view.hidden;if(visible&&!record.wasVisible&&!frame.inert)void observation.refresh();record.wasVisible=visible;
            if(record.nativeFirstStateMs===null&&view.dataset.syncState)record.nativeFirstStateMs=performance.now()-record.attachedAt;
            if(!record.rendering)updateFrame(frame,record,observation.read());
        });record.observer.observe(view,{attributes:true,attributeFilter:['data-sync-state','data-sync-account-state','hidden'],childList:true,subtree:true});frames.set(frame,record);updateFrame(frame,record,observation.read());if(record.wasVisible&&!frame.inert)void observation.refresh();
        frame.contentWindow.addEventListener('studio-port-ready',()=>{if(!view.hidden&&!record.reader)void observation.refresh();});
        frame.contentWindow.addEventListener('pagehide',event=>{if(event.isTrusted){record.observer.disconnect();record.reader?.dispose();frames.delete(frame);}});
    }
    let lastReady=false;
    const entryObserver=new MutationObserver(()=>{const ready=CS.entryAuth?.isAuthorized()===true;if(ready!==lastReady){lastReady=ready;void observation.refresh();}else {renderBox(node,observation.read());}});
    entryObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-studio-entry']});
    const unwatch=root.storage.subscribeAccount(()=>{observation.invalidate();void observation.refresh();});
    CS.accountStatus=Object.freeze({attachFrame,refresh:observation.refresh,diagnostics:()=>({state:observation.read().state,errorCode:observation.read().errorCode,timings:{...observation.read().timings},entry:CS.entryAuth?.diagnostics?.(),requests:{...requestTimings},frames:[...frames].map(([frame,r])=>({iframeReadyMs:frame.studioReadyMs??null,nativeFirstStateMs:r.nativeFirstStateMs,nativeState:r.view.dataset.syncState,syncState:r.syncState}))})});
    CS.attachAccountFrame=attachFrame;
    for(const frame of document.querySelectorAll('iframe')){try{attachFrame(frame);}catch{}}
    void observation.refresh();
    window.addEventListener('online',()=>void observation.refresh());
    window.addEventListener('pagehide',()=>{observation.dispose();entryObserver.disconnect();unwatch();for(const r of frames.values()){r.observer.disconnect();r.reader?.dispose();}frames.clear();},{once:true});
}
