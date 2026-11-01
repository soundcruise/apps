/* Studio owns lifetime; application markup and controllers remain owned by each app. */
(function(){
 const CS=window.CruiseStudio;CS.seriesApps={};
 for(const id of ['pitch','fretboard','rhythm','chord']){
  let mounted=null,epoch=0,handle=null;const host=()=>document.getElementById('series-'+id+'-surface');
  const silence=()=>{if(!mounted)epoch++;mounted?.iframe.contentWindow?.studioAppStop?.();if(mounted)reload.hidden=false;};
  const stop=()=>{epoch++;mounted?.dispose();mounted=null;host()?.replaceChildren();if(handle)CS.audio.cleanup(handle,'app-leave');};
  CS.seriesApps[id]={pause:silence,refreshLayout(){mounted?.refreshLayout();},claimAudio(){if(!CS.audio||!CS.entryAuth?.isAuthorized())return false;if(!handle)handle=CS.audio.register({sessionId:'series-'+id,ownerFeatureId:'series-'+id,cleanup:silence});const lease=CS.audio.request(handle,'audio-output/session');return !!lease&&CS.audio.grant(handle,lease);},activate(){if(mounted)return;reload.hidden=true;const turn=++epoch;host().textContent='読み込み中…';import('./internal-app.mjs').then(m=>m.mount(id,host(),()=>epoch===turn)).then(result=>{if(epoch===turn)mounted=result;else result?.dispose();}).catch(()=>{if(epoch===turn)host().textContent='アプリを読み込めません。もう一度開いてください。';});},deactivate:stop,requestLeave(){return !!mounted?.iframe.contentWindow?.studioAppDirty&&!confirm('入力内容が変更されています。アプリ内で保存済みか確認してください。画面を閉じますか？');}};
  document.getElementById('studio-refresh').addEventListener('click',e=>{if(mounted?.iframe.contentWindow?.studioAppDirty){e.preventDefault();e.stopImmediatePropagation();document.getElementById('studio-refresh-status').textContent='アプリ内の変更を保存し、画面を閉じてから更新してください。';}},true);
  const reload=document.createElement('button');reload.type='button';reload.className='series-reopen btn-ghost btn-compact';reload.hidden=true;reload.textContent='再開';reload.title='停止した音声を再開するためアプリを開き直す';reload.setAttribute('aria-label','アプリを開き直す');host().before(reload);reload.addEventListener('click',()=>{if(CS.seriesApps[id].requestLeave())return;stop();CS.seriesApps[id].activate();});
  document.getElementById('shell-audio-stop').addEventListener('click',silence);
  window.addEventListener('beforeunload',e=>{if(mounted?.iframe.contentWindow?.studioAppDirty){e.preventDefault();e.returnValue='';}});
  window.addEventListener('pagehide',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden){silence();if(handle)CS.audio.cleanup(handle,'hidden');}});
 }
})();
