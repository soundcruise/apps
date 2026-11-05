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

export function describeSyncConnection(s={}) {
 const rows={
 checking:['接続を確認中','保存済みの接続情報を確認しています。','同期状況を見る'],
 disconnected:['未接続','このブラウザにはAccountの接続情報がありません。接続済みのPortで追加コードを発行し、ここで入力してください。新規作成は不要です。','既存Accountに接続'],
 connected:['接続済み','Accountを確認しました。各アプリの同期状況は下のPort Sync Centerで確認できます。','同期状況を見る'],
 stored:['接続情報あり','以前の接続情報を保持しています。Pro認証後に確認できます。','接続を復旧する'],
 attention:['接続情報あり・再確認が必要','以前の接続情報と未送信データを保持しています。再確認で解消しない場合は、下のPort Sync Centerの接続・復旧手順を確認してください。','接続を復旧する'],
 offline:['オフライン','接続情報・ローカル保存・未送信データを保持しています。通信復帰後に再確認してください。','同期状況を見る'],
 error:['一時的に接続を確認できません','通信に失敗しました。未接続や資格失効とは判定していません。保存情報を保持しています。通信を確認して再試行してください。','同期状況を見る']
 };
 const [title,detail,action]=rows[s.state]||rows.checking;
 return {title,detail,action,recheck:!['checking','disconnected'].includes(s.state)};
}

// Explicit read-only operator diagnostic. Never return identifiers, credentials, bodies or messages.
export async function inspectSyncConnection({storage,summary,devices,readPortCredential,deviceId,online=true,nativeState=null,ownerSessionPresent=false}) {
 const result={category:'unconfirmed',stage:'storage',online,accountCredentialPresent:null,portCredentialPresent:null,deviceState:'unconfirmed',nativeState,ownerSessionPresent,requests:[]};
 const generation=storage.getGeneration?.();
 let account;
 try{account=await storage.getAccount();result.accountCredentialPresent=!!account?.accountCredential;}
 catch{return {...result,storageReadable:false};}
 result.storageReadable=true;
 if(!result.accountCredentialPresent)return {...result,category:'account-unconnected',stage:'complete'};
 try{result.portCredentialPresent=!!await readPortCredential(account);}catch{result.portCredentialPresent=null;}
 if(!online)return {...result,category:'communication',stage:'offline'};
 const record=async(stage,fn)=>{try{const value=await fn(account.accountCredential);result.requests.push({stage,status:200,code:null});return {ok:true,value};}catch(e){const status=Number.isInteger(e?.status)&&e.status>=100&&e.status<=599?e.status:null,code=/^[a-z][a-z0-9_-]{0,63}$/.test(e?.code||'')?e.code:null;result.requests.push({stage,status,code});return {ok:false,status,code};}};
 const a=await record('summary',summary),d=await record('devices',devices);
 const latest=await storage.getAccount().catch(()=>null);
 if(storage.getGeneration?.()!==generation||latest?.accountId!==account.accountId||latest?.accountCredential!==account.accountCredential)return {...result,category:'unconfirmed',stage:'account-changed'};
 const failure=[a,d].find(x=>!x.ok&&([401,403,410].includes(x.status)||/^(account_device_|account_credential_|invalid_account)/.test(x.code||'')))||[a,d].find(x=>!x.ok);
 if(failure)return {...result,category:([401,403,410].includes(failure.status)||/^(account_device_|account_credential_|invalid_account)/.test(failure.code||''))?'credential-attention':'communication',stage:result.requests.find(x=>x.status!==200)?.stage||'summary'};
 if(a.value?.account?.id!==account.accountId)return {...result,category:'credential-attention',stage:'account-match'};
 if(a.value?.account?.state&&a.value.account.state!=='active')return {...result,category:'credential-attention',stage:'account-state'};
 const rows=d.value?.devices,id=deviceId(account.accountCredential);
 if(Array.isArray(rows)&&id){const current=rows.find(x=>x.id===id);result.deviceState=current?(current.revokedAt==null?'active':'revoked'):'not-listed';}
 // A successful Account read is not a claim that app Sync or Project admission succeeded.
 result.category=result.deviceState==='revoked'?'credential-attention':result.deviceState==='not-listed'?'unconfirmed':'account-confirmed';result.stage=result.deviceState==='not-listed'?'device-list':'complete';
 return result;
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
    const guide='<details data-account-guide><summary>いつものAccountに接続するには</summary><ol><li>iPhoneのPort（ホーム画面）とSafariでは、接続情報・保存データが別になる場合があります。Safariで未接続でも、PortのAccountが消えたわけではありません。</li><li>いつものPortの「アカウントを同期」から追加コードを発行します。</li><li>このStudioの「Account・Syncを開く」から「既存のアカウントに接続」を選び、追加コードを入力します。新しいAccountの作成や復旧コードの更新は不要です。</li><li>両方のAccount番号が同じことを確認します。Pro認証の番号とは別です。</li></ol><p>このブラウザに別Accountや未同期データがある場合は、先に内容を保全して既存の正規手順で判断してください。自動切替・移管・統合はしません。Macでは別のブラウザprofileを使う方法も選べます。</p></details>';
    node.innerHTML='<h2>Account・Cruise Sync</h2><p data-account-status role="status"></p><p data-account-target></p><p data-account-origin>このブラウザで接続したAccountを使用します。新規作成やデータ移管は自動では行いません。</p><p>Accountの確認と、保存データの同期完了は別です。</p><button type="button" class="btn-ghost" data-open-sync>Account・Syncを開く</button> <button type="button" class="btn-ghost" data-check-account>接続先を確認</button>'+guide;
    function text(node,value){if(node.textContent!==value)node.textContent=value;}
    function renderBox(box,s){
        box.dataset.studioAccountState=s.state;
        window.dispatchEvent(new CustomEvent('studio-account-observed',{detail:{state:s.state}}));
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
        renderBox(node,observation.read());
        const record={view,attachedAt:performance.now(),nativeFirstStateMs:view.dataset.syncState?0:null};
        record.observer=new MutationObserver(()=>{
            if(!frame.isConnected){record.observer.disconnect();frames.delete(frame);return;}
            renderBox(node,observation.read());
            if(record.nativeFirstStateMs===null&&view.dataset.syncState)record.nativeFirstStateMs=performance.now()-record.attachedAt;
        });
        record.observer.observe(view,{attributes:true,subtree:true,attributeFilter:['data-sync-state','hidden','disabled']});frames.set(frame,record);
        frame.contentWindow.addEventListener('pagehide',event=>{if(event.isTrusted){record.observer.disconnect();frames.delete(frame);}});
    }
    let lastReady=false;
    const entryObserver=new MutationObserver(()=>{const ready=CS.entryAuth?.isAuthorized()===true;if(ready!==lastReady){lastReady=ready;void observation.refresh();}else {renderBox(node,observation.read());}});
    entryObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-studio-entry']});
    const unwatch=root.storage.subscribeAccount(()=>{observation.invalidate();void observation.refresh();});
    CS.accountStatus=Object.freeze({attachFrame,read:observation.read,refresh:observation.refresh,
        inspectConnection:()=>{
            const frame=document.querySelector('#port-sync-surface iframe'),native=frame?.contentWindow?.SoundCruiseMultiAppSync;
            let ownerSessionPresent=false;try{ownerSessionPresent=!!CS.projectCloud?.session.readSession();}catch{}
            return inspectSyncConnection({storage:root.storage,summary:credential=>client.summary(credential),devices:credential=>client.devices(credential),deviceId:root.core.accountDeviceIdFromCredential,
                readPortCredential:async account=>native?.dataStorage?.createStore('port',{accountId:account.accountId}).readMeta('credential'),online:navigator.onLine!==false,
                nativeState:frame?.contentDocument?.querySelector('#sync-center-view')?.dataset.syncState||null,ownerSessionPresent});
        },diagnostics:()=>({state:observation.read().state,errorCode:observation.read().errorCode,timings:{...observation.read().timings},entry:CS.entryAuth?.diagnostics?.(),requests:{...requestTimings},frames:[...frames].map(([frame,r])=>({iframeReadyMs:frame.studioReadyMs??null,nativeFirstStateMs:r.nativeFirstStateMs,nativeState:r.view.dataset.syncState}))})});
    CS.attachAccountFrame=attachFrame;
    for(const frame of document.querySelectorAll('iframe')){try{attachFrame(frame);}catch{}}
    void observation.refresh();
    window.addEventListener('online',()=>void observation.refresh());
    window.addEventListener('pagehide',()=>{observation.dispose();entryObserver.disconnect();unwatch();for(const r of frames.values()){r.observer.disconnect();}frames.clear();},{once:true});
}
