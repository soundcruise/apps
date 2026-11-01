/* Studio presentation only: native Account DB/API remain the sole owners. */
export function createAccountObservation({storage, summary, format=id=>id, allowed=()=>true, changed=()=>{}, now=()=>performance.now()}) {
    let revision=0, flight=null, disposed=false;
    let state=Object.freeze({state:'checking',displayId:null,errorCode:null,timings:{}});
    const publish=next=>{state=Object.freeze(next);changed(state);return state;};
    function invalidate(){revision++;flight=null;publish({state:'checking',displayId:null,errorCode:null,timings:{}});}
    async function refresh(){
        if(disposed)return state;
        if(flight)return flight;
        const turn=revision,generation=storage.getGeneration(),start=now();
        publish({...state,state:'checking',errorCode:null});
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
                return publish({state:response.account.state==='active'?'connected':'attention',displayId,errorCode:null,timings:{readMs,requestMs:now()-requestStart,totalMs:now()-start}});
            }catch(error){
                if(!current())return state;
                const code=/^[a-z][a-z0-9_]{0,63}$/.test(error.code||'')?error.code:'account_check_failed';
                const terminal=error.status===401||error.status===403||error.status===410||code==='account_mismatch';
                return publish({state:terminal?'attention':globalThis.navigator?.onLine===false?'offline':'error',displayId,errorCode:code,timings:{readMs,...(requestStart===undefined?{}:{requestMs:now()-requestStart}),totalMs:now()-start}});
            }
        })().finally(()=>{if(flight===operation)flight=null;});flight=operation;return operation;
    }
    return Object.freeze({read:()=>state,refresh,invalidate,dispose(){disposed=true;revision++;}});
}

if(typeof window!=='undefined'){
    const CS=window.CruiseStudio,root=window.SoundCruiseSyncAccount,node=document.querySelector('[data-port-sync-status]');
    const client=new root.AccountClient({endpoint:'https://sound-cruise-sync.cruise-port-requests.workers.dev',admissionMode:'production',storage:root.storage});
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
        if(!frame.isConnected){record.observer.disconnect();frames.delete(frame);return;}
        const view=record.view;
        if(frame.inert){text(record.box.querySelector('[data-account-target]'),'前のAccountの画面は停止しています。未保存入力を保持しています。');return;}
        renderBox(record.box,s);
        const label=view.querySelector('#sync-center-account-status');
        // Presentation correction only. Native state attributes/action guards stay intact.
        if(label && !label.dataset.syncAccountState){if(label.textContent!=='同期情報を確認中…')label.textContent='同期情報を確認中…';}
        else if(label?.dataset.syncAccountState==='unset'){if(label.textContent!=='未接続')label.textContent='未接続';}
        else if(label?.dataset.syncAccountState==='unknown'){
            const kind=view.dataset.syncState;
            const text=kind==='error'?'通信失敗':kind==='offline'?'オフライン':'同期情報は未確認';
            if(label.textContent!==text)label.textContent=text;
        }else if(label?.dataset.syncAccountState==='active'&&label.textContent!=='Account接続済み')label.textContent='Account接続済み';
    }
    const observation=createAccountObservation({storage:root.storage,summary:c=>client.summary(c),format:root.core.formatAccountDisplayId,allowed:()=>CS.entryAuth?.isAuthorized()===true,changed:s=>{renderBox(node,s);for(const [frame,record]of frames)updateFrame(frame,record,s);}});
    node.querySelector('[data-open-sync]').onclick=()=>CS.shellHost.navigate('portSync');
    node.querySelector('[data-check-account]').onclick=()=>void observation.refresh();
    function attachFrame(frame){
        if(frames.has(frame))return;
        const doc=frame.contentDocument,view=doc?.getElementById('sync-center-view');if(!view)return;
        const box=doc.createElement('section');box.dataset.studioAccountSummary='';box.innerHTML='<p data-account-status></p><p data-account-target role="status"></p><p>データ同期の状態は下のPort欄で確認してください。</p><button type="button" data-check-account>接続先を確認</button>'+guide;
        if(!doc.getElementById('studio-account-summary-style')){const style=doc.createElement('style');style.id='studio-account-summary-style';style.textContent='[data-studio-account-summary] button{min-height:40px;padding:8px 16px;border:1px solid var(--border,#777);border-radius:10px;background:transparent;color:inherit;font:inherit}[data-studio-account-summary] details{margin-top:12px}[data-studio-account-summary] li{margin-block:8px}';doc.head.append(style);}
        box.style.cssText='padding:12px;margin:12px 0;border:1px solid var(--border,#777);border-radius:10px';view.prepend(box);
        box.querySelector('[data-check-account]').onclick=()=>void observation.refresh();
        const record={box,view,attachedAt:performance.now(),nativeFirstStateMs:view.dataset.syncState?0:null,wasVisible:!view.hidden};
        record.observer=new MutationObserver(()=>{
            const visible=!view.hidden;if(visible&&!record.wasVisible&&!frame.inert)void observation.refresh();record.wasVisible=visible;
            if(record.nativeFirstStateMs===null&&view.dataset.syncState)record.nativeFirstStateMs=performance.now()-record.attachedAt;
            updateFrame(frame,record,observation.read());
        });record.observer.observe(view,{attributes:true,attributeFilter:['data-sync-state','data-sync-account-state','hidden'],childList:true,subtree:true});frames.set(frame,record);updateFrame(frame,record,observation.read());if(record.wasVisible&&!frame.inert)void observation.refresh();
        frame.contentWindow.addEventListener('pagehide',event=>{if(event.isTrusted){record.observer.disconnect();frames.delete(frame);}});
    }
    let lastReady=false;
    const entryObserver=new MutationObserver(()=>{const ready=CS.entryAuth?.isAuthorized()===true;if(ready!==lastReady){lastReady=ready;void observation.refresh();}else {renderBox(node,observation.read());}});
    entryObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-studio-entry']});
    const unwatch=root.storage.subscribeAccount(()=>{observation.invalidate();void observation.refresh();});
    CS.accountStatus=Object.freeze({attachFrame,refresh:observation.refresh,diagnostics:()=>({state:observation.read().state,errorCode:observation.read().errorCode,timings:{...observation.read().timings},entry:CS.entryAuth?.diagnostics?.(),frames:[...frames].map(([frame,r])=>({iframeReadyMs:frame.studioReadyMs??null,nativeFirstStateMs:r.nativeFirstStateMs,nativeState:r.view.dataset.syncState}))})});
    CS.attachAccountFrame=attachFrame;
    for(const frame of document.querySelectorAll('iframe')){try{attachFrame(frame);}catch{}}
    void observation.refresh();
    window.addEventListener('online',()=>void observation.refresh());
    window.addEventListener('pagehide',()=>{observation.dispose();entryObserver.disconnect();unwatch();for(const r of frames.values())r.observer.disconnect();frames.clear();},{once:true});
}
