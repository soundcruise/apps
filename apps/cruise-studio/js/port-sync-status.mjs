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

if(typeof window!=='undefined'){
    const CS=window.CruiseStudio,root=window.SoundCruiseSyncAccount,node=document.querySelector('[data-port-sync-status]');
    const client=new root.AccountClient({endpoint:'https://sound-cruise-sync.cruise-port-requests.workers.dev',admissionMode:'production',storage:root.storage});
    let requestTimings={};
    async function readStatus(credential){
        const start=performance.now(),stages={summaryMs:null,devicesRequested:false};requestTimings=stages;
        // Home observes Account identity only. The embedded native Port owns all
        // Device, Sync, conflict and action rendering; never repaint its DOM here.
        try { return await client.summary(credential); }
        finally { stages.summaryMs=performance.now()-start; }
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
    const observation=createAccountObservation({storage:root.storage,summary:readStatus,format:root.core.formatAccountDisplayId,allowed:()=>CS.entryAuth?.isAuthorized()===true,changed:s=>renderBox(node,s)});
    node.querySelector('[data-open-sync]').onclick=()=>CS.shellHost.navigate('portSync');
    node.querySelector('[data-check-account]').onclick=()=>void observation.refresh();
    function attachFrame(frame){
        if(frames.has(frame))return;
        const doc=frame.contentDocument,view=doc?.getElementById('sync-center-view');if(!view)return;
        // Diagnostics only: no native status projection, reader, API or controls.
        const record={view,attachedAt:performance.now(),nativeFirstStateMs:view.dataset.syncState?0:null};
        record.observer=new MutationObserver(()=>{
            if(!frame.isConnected){record.observer.disconnect();frames.delete(frame);return;}
            if(record.nativeFirstStateMs===null&&view.dataset.syncState)record.nativeFirstStateMs=performance.now()-record.attachedAt;
        });
        record.observer.observe(view,{attributes:true,attributeFilter:['data-sync-state']});frames.set(frame,record);
        frame.contentWindow.addEventListener('pagehide',event=>{if(event.isTrusted){record.observer.disconnect();frames.delete(frame);}});
    }
    let lastReady=false;
    const entryObserver=new MutationObserver(()=>{const ready=CS.entryAuth?.isAuthorized()===true;if(ready!==lastReady){lastReady=ready;void observation.refresh();}else {renderBox(node,observation.read());}});
    entryObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-studio-entry']});
    const unwatch=root.storage.subscribeAccount(()=>{observation.invalidate();void observation.refresh();});
    CS.accountStatus=Object.freeze({attachFrame,refresh:observation.refresh,diagnostics:()=>({state:observation.read().state,errorCode:observation.read().errorCode,timings:{...observation.read().timings},entry:CS.entryAuth?.diagnostics?.(),requests:{...requestTimings},frames:[...frames].map(([frame,r])=>({iframeReadyMs:frame.studioReadyMs??null,nativeFirstStateMs:r.nativeFirstStateMs,nativeState:r.view.dataset.syncState}))})});
    CS.attachAccountFrame=attachFrame;
    for(const frame of document.querySelectorAll('iframe')){try{attachFrame(frame);}catch{}}
    void observation.refresh();
    window.addEventListener('online',()=>void observation.refresh());
    window.addEventListener('pagehide',()=>{observation.dispose();entryObserver.disconnect();unwatch();for(const r of frames.values()){r.observer.disconnect();}frames.clear();},{once:true});
}
