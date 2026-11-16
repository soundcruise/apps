const scope=new URL('./',import.meta.url).href,script=new URL('sw.js',scope).href;
function rpc(worker,type){return new Promise((resolve,reject)=>{if(!worker){reject(Error('worker-unavailable'));return;}const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('offline-timeout'));},120000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();e.data?.ok?resolve(e.data):reject(Error('offline-unavailable'));};worker.postMessage({type},[channel.port2]);});}
async function installed(registration){
    const worker=registration.installing;if(!worker)return;
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('offline-timeout')),120000);const check=()=>{if(['installed','activated'].includes(worker.state)){clearTimeout(timer);worker.removeEventListener('statechange',check);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);worker.removeEventListener('statechange',check);reject(Error('offline-install-failed'));}};worker.addEventListener('statechange',check);check();});
}
export function mountOfflineControls({button,status,navigator:nav=window.navigator}){
    let disposed=false,busy=false,playing=false;
    const show=text=>{if(!disposed)status.textContent=text;};
    async function inspect(){if(!nav.serviceWorker||!window.isSecureContext){show('この環境ではオフライン準備を利用できません。');button.disabled=true;return null;}
        try{const reg=await nav.serviceWorker.getRegistration(scope);if(!reg?.active){show('オフライン未準備');return null;}const result=await rpc(reg.active,'STATUS');show(result.ready?(reg.waiting?'現在の版は準備済み。新版を使うには、このローカルのビューワー・Port画面をすべて閉じて開き直してください。':'オフライン準備済み（本体・PDF描画・音源）'):'準備が不足しています。「オフラインの準備」で修復してください。');return result;}catch{show('オフライン状態を確認できません。保存した譜面と準備状態を確認してください。');return null;}}
    button.onclick=async()=>{if(busy||disposed||playing)return;if(nav.onLine===false){const current=await inspect();if(!current?.ready)show('準備できませんでした。通信を戻して再試行してください。以前の保存データは残しています。');return;}busy=true;button.disabled=true;show('本体・PDF描画・音源を準備しています…');
        try{let reg=await nav.serviceWorker.register(script,{scope,updateViaCache:'none'});await reg.update();await installed(reg);
            if(reg.waiting){await inspect();return;}
            for(let i=0;i<100&&!reg.active;i++)await new Promise(r=>setTimeout(r,30));
            await rpc(reg.active,'PREPARE');await inspect();
        }catch{show('準備できませんでした。通信・空き容量を確認して再試行してください。以前に準備したデータは消していません。');}
        finally{busy=false;if(!disposed)button.disabled=playing;}
    };
    void inspect();return {inspect,setPlaying(value){playing=value===true;button.disabled=busy||playing;},dispose(){disposed=true;button.onclick=null;}};
}
