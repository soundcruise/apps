/* One Studio entrance. Native Account DB, Pro gate and device session are the owners. */
export function createStudioEntry({storage, source, validatePro, summary, gateReady, changed=()=>{}, rejectPro=()=>{}, now=()=>performance.now()}) {
    let epoch=0, proof=null, pending=null, pendingEpoch=-1, phase='locked';
    const same=(a,b)=>!!a&&!!b&&a.revision===b.revision&&a.revoked===false&&b.revoked===false&&
        a.auth?.credential===b.auth?.credential&&a.auth?.generation===b.auth?.generation&&a.auth?.sessionVersion===b.auth?.sessionVersion;
    function isAuthorized(){return !!proof&&gateReady()&&proof.epoch===epoch&&
        proof.generation===storage.getGeneration()&&now()<proof.expiresAt&&same(proof.pro,source.read());}
    function invalidate(reason='locked'){epoch++;proof=null;phase=reason;changed(read());}
    function read(){return {phase:isAuthorized()?'ready':phase==='ready'?'locked':phase,accountId:proof?.account.accountId||null,revision:epoch,offline:!!proof?.offline};}
    async function check(){
        if(pending&&pendingEpoch===epoch)return pending;
        const turn=epoch,previous=isAuthorized()?proof:null;
        let flight;flight=(async()=>{
            try{
                if(!gateReady())throw Error('pro-required');
                const pro=source.read(),generation=storage.getGeneration();
                if(pro?.revoked!==false||!pro.auth)throw Error('pro-required');
                const account=await storage.getAccount();
                if(!account?.accountId||!account.accountCredential)throw Error('account-required');
                const result=await validatePro({...pro.auth,operationRevision:pro.revision});
                if(result?.terminal===true&&same(pro,source.read()))rejectPro(pro.auth.credential);
                const allowance=Number.isFinite(result?.offlineRemainingMs)&&result.offlineRemainingMs>0;
                const retained=previous&&previous.generation===generation&&same(previous.pro,pro)&&
                    previous.account.accountId===account.accountId&&previous.account.accountCredential===account.accountCredential;
                if(result?.ok!==true||(result.online!==true&&!(result.offline===true&&allowance&&retained)))throw Error('pro-required');
                const expiresAt=allowance?now()+result.offlineRemainingMs:Infinity;
                let remote,accountUnavailable=false,offline=result.online!==true;
                try{remote=await summary(account.accountCredential);}
                catch(error){
                    // A network failure is not a new Account grant. Only the same
                    // in-memory, previously verified owner may retain native Pro grace.
                    const transient=(error.status===0&&['network_error','account_request_timeout'].includes(error.code))||error.status===429||error.status>=500;
                    if(!retained||!allowance||!transient)throw error;
                    accountUnavailable=true;offline=true;
                }
                const after=await storage.getAccount();
                if(turn!==epoch||generation!==storage.getGeneration()||!gateReady()||!same(pro,source.read())||
                    after?.accountId!==account.accountId||after?.accountCredential!==account.accountCredential||(!accountUnavailable&&remote?.account?.id!==account.accountId)||now()>=expiresAt)
                    throw Error('session-changed');
                proof={epoch:turn,generation,pro,account,offline,expiresAt};phase='ready';changed(read());return true;
            }catch(error){if(turn===epoch)invalidate(error.message||'locked');return false;}
        })().finally(()=>{if(pending===flight)pending=null;});
        pending=flight;pendingEpoch=turn;return flight;
    }
    return Object.freeze({check,isAuthorized,read,invalidate});
}

if(typeof window!=='undefined'&&document.getElementById('studio-shell')){
    const CS=window.CruiseStudio,storage=window.SoundCruiseSyncAccount.storage;
    const source=window.SoundCruiseProOperationSource;
    const root=document.getElementById('studio-shell');
    const panel=document.createElement('section');panel.id='studio-entry-account';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
    panel.innerHTML='<div><h1>Cruise Studio</h1><p role="status"></p><button type="button" data-entry-connect>Accountを接続</button> <button type="button" data-entry-retry>確認する</button> <button type="button" data-entry-pro hidden>Pro認証をやり直す</button><div data-entry-account-frame></div></div>';
    document.body.append(panel);
    const owners=new WeakMap();let accountFrame=null,retriedRevision=null,modalOwner=null,lastReadyOwner=null;
    function stop(){
        if(CS.shellHost?.modal.getActive()){modalOwner=lastReadyOwner;CS.shellHost.modal.suspend();}
        // Stop media without removing any document, form, crop or Project draft.
        for(const frame of root.querySelectorAll('iframe')){try{CS.stopNativePort?.(frame);frame.contentWindow?.studioAppStop?.();}catch{}}
        for(const app of Object.values(CS.seriesApps||{}))app.pause?.();
        void CS.tunerRuntime?.stop('entry-locked');
        void CS.tunerReference?.stop();
        void CS.metronomeM1?.stop();
    }
    const gateReady=()=>typeof window.__soundCruiseEnsureProSession==='function'&&
        !document.body.classList.contains('pro-gate-active')&&!document.getElementById('pro-gate-overlay');
    const device=window.SoundCruiseProDeviceSession.createClient({
        isCurrent:auth=>{const p=source.read();return p.revoked===false&&p.revision===auth.operationRevision&&p.auth?.credential===auth.credential&&p.auth?.generation===auth.generation;},
        request:async(path,options)=>{
            const response=await fetch('https://sound-cruise-sync.cruise-port-requests.workers.dev/v2/pro-auth'+path,{...options,credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
            return {status:response.status,body:await response.json()};
        }
    });
    const accountClient=new window.SoundCruiseSyncAccount.AccountClient({endpoint:'https://sound-cruise-sync.cruise-port-requests.workers.dev',admissionMode:'production',storage});
    const entry=createStudioEntry({storage,source,gateReady,
        validatePro:auth=>device.validate(auth,{force:true}),summary:credential=>accountClient.summary(credential),
        rejectPro:credential=>window.__soundCruiseRejectProBackendAuth(credential),
        changed(state){
            const ready=state.phase==='ready';document.documentElement.dataset.studioEntry=ready?'ready':'locked';root.inert=!ready||!!CS.shellHost?.modal.getActive();
            CS.sheetCruise?.refreshAuthorization?.();
            panel.hidden=ready||!gateReady();
            panel.querySelector('[data-entry-pro]').hidden=state.phase!=='pro-required';
            panel.querySelector('p').textContent=state.phase==='account-required'?'既存のAccountを接続してください。':'認証を確認できません。編集中の内容は保持しています。';
            if(!ready)stop();
            if(state.phase==='session-changed'&&gateReady()){
                const revision=source.read().revision;
                if(revision!==retriedRevision){retriedRevision=revision;queueMicrotask(()=>void entry.check());}
            }
            if(ready){
                if(modalOwner===state.accountId){CS.shellHost?.modal.resume();modalOwner=null;}
                lastReadyOwner=state.accountId;
                if(!CS.shellHost?.modal.getActive())root.removeAttribute('aria-hidden');
                accountFrame?.remove();accountFrame=null;
                for(const frame of root.querySelectorAll('iframe'))bindFrame(frame);
            }
        }
    });
    CS.entryAuth=entry;
    function bindFrame(frame){
        if(!entry.isAuthorized()){if(!owners.has(frame))owners.set(frame,'unverified');frame.inert=true;return;}
        const owner=entry.read().accountId,previous=owners.get(frame);
        if(!previous){owners.set(frame,owner);frame.inert=false;}
        else if(previous===owner)frame.inert=false;
        else if(previous!==owner){
            frame.inert=true;frame.setAttribute('aria-label','前のAccountの入力を保持しています。閉じる前に内容を確認してください。');
            let notice=frame.parentElement.querySelector('[data-entry-owner-hold]');
            if(!notice){notice=document.createElement('p');notice.dataset.entryOwnerHold='';notice.setAttribute('role','status');notice.textContent='前のAccountの入力を保持しています。保存は停止しています。';const close=document.createElement('button');close.type='button';close.textContent='未保存内容を破棄して閉じる';close.onclick=()=>{if(CS.toolWindow.discardLockedFrame(frame))notice.remove();};notice.append(close);frame.before(notice);}
        }
    }
    const accountUnwatch=storage.subscribeAccount(()=>{entry.invalidate('account-changed');queueMicrotask(()=>void entry.check());});
    const observer=new MutationObserver(()=>{
        if(!gateReady()){if(entry.isAuthorized()||document.documentElement.dataset.studioEntry==='ready')entry.invalidate('pro-required');}
        else if(!entry.isAuthorized())void entry.check();
    });
    observer.observe(document.body,{attributes:true,attributeFilter:['class'],childList:true});
    const frames=new MutationObserver(()=>{for(const frame of root.querySelectorAll('iframe'))bindFrame(frame);});
    frames.observe(root,{childList:true,subtree:true});
    panel.querySelector('[data-entry-retry]').onclick=()=>void entry.check();
    panel.querySelector('[data-entry-pro]').onclick=()=>{entry.invalidate('pro-required');void window.__soundCruiseClearGate();};
    panel.querySelector('[data-entry-connect]').onclick=()=>{
        if(accountFrame)return;accountFrame=document.createElement('iframe');accountFrame.title='既存Accountの接続';
        accountFrame.onload=()=>{
            const child=accountFrame?.contentWindow;if(!child||child.location.origin!==location.origin)return;
            const style=child.document.createElement('style');style.textContent='.port-view:not(#sync-center-view){display:none!important} #sync-center-view>[data-action=home]{display:none!important}';child.document.head.append(style);
            const center=()=>{if(child.location.hash!=='#sync-center')child.location.hash='#sync-center';};
            child.addEventListener('studio-port-ready',center);child.addEventListener('hashchange',center);center();
        };
        accountFrame.src='../cruise-port/pro_9a3943176561/#sync-center';panel.querySelector('[data-entry-account-frame]').append(accountFrame);
    };
    window.addEventListener('storage',event=>{if(['soundCruiseProAuth','soundCruiseProRevokePending','soundCruiseProOperationEpoch',null].includes(event.key)&&!entry.isAuthorized()){entry.invalidate('pro-changed');void entry.check();}});
    for(const event of ['focus','online'])window.addEventListener(event,()=>void entry.check());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else void entry.check();});
    const timer=setInterval(()=>{if(!document.hidden)void entry.check();},60000);
    window.addEventListener('pagehide',()=>{clearInterval(timer);observer.disconnect();frames.disconnect();accountUnwatch();entry.invalidate('closed');},{once:true});
    if(gateReady())void entry.check();
}
