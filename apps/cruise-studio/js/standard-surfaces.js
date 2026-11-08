/* Native Standard documents own capabilities, Account and persistence.
   This admission permits shell navigation only; it issues no Pro or Sync proof. */
(()=>{
 const C=window.CruiseStudio;
 C.entryAuth=Object.freeze({edition:'standard',isAuthorized:()=>true,check:async()=>true,read:()=>({phase:'ready',accountId:null,revision:0})});
 const surfaces=[];
 function surface(id,slot,url){
  let frame=null,active=false,dirty=false,handle=null,requestedHash=new URL(url,document.baseURI).hash;
  function stop(){if(!frame)return;try{const child=frame.contentWindow;if(['#tuner','#metronome'].includes(child.location.hash))child.location.hash='';child.document.querySelector('[aria-label="練習を一時停止する"]')?.click();}catch{}void C.stopNativePort?.(frame);}
  function mount(){
   if(frame){frame.inert=false;if(['tuner','metronome'].includes(id))frame.contentWindow.location.hash=new URL(url,document.baseURI).hash;return;}
   frame=document.createElement('iframe');frame.className='port-tuner-frame';frame.title='Cruise Studio '+id+' Standard';frame.allow='microphone';frame.referrerPolicy='same-origin';
   frame.addEventListener('load',()=>{try{C.presentNativePort(frame);if(url.startsWith('/apps/cruise-port/'))frame.contentWindow.location.hash=requestedHash;frame.contentWindow.addEventListener('input',()=>dirty=true);frame.contentWindow.addEventListener('change',()=>dirty=true);if(id.startsWith('app_'))C.seriesApps[id.slice(4)].nativeWindow=frame.contentWindow;}catch{}});
   frame.src=url;document.getElementById(slot).append(frame);const status=document.getElementById(slot.replace('-surface','-status'));if(status)status.textContent='';const resume=document.getElementById(slot.replace('-surface','-resume'));if(resume)resume.hidden=true;
  }
  const owner={load(){},attach({audio}){if(audio&&!handle)handle=audio.register({sessionId:'standard-'+id,ownerFeatureId:'standard-'+id,cleanup:stop});},activate(){active=true;mount();},deactivate(){active=false;stop();if(frame)frame.inert=true;if(id.startsWith('app_')){frame?.remove();frame=null;dirty=false;}},pause:stop,refreshLayout(){},claimAudio:()=>true,
   requestLeave(){return id.startsWith('app_')&&dirty&&!confirm('入力内容が変更されています。アプリ内で保存済みか確認してください。画面を閉じますか？');},hasUnsaved:()=>dirty,
   async refresh(){if(dirty&&!confirm('入力内容を保存済みか確認してください。ページを更新しますか？'))return;stop();frame?.remove();frame=null;dirty=false;if(active)mount();},
   whenStopped:async()=>stop(),openCalendar(){requestedHash='#practice-menu/calendar';C.shellHost.navigate('portPractice');if(active){mount();frame.contentWindow.location.hash=requestedHash;}},getState:()=>({active,hasFrame:!!frame})};
  surfaces.push(owner);return owner;
 }
 C.tuner=surface('tuner','port-tuner-surface','/apps/cruise-port/#tuner');
 C.portMetronome=surface('metronome','port-metronome-surface','/apps/cruise-port/#metronome');
 C.portPractice=surface('portPractice','port-practice-surface','/apps/cruise-port/#practice-menu');
 C.portGear=surface('portGear','port-gear-surface','/apps/cruise-port/#wishlist');
 C.portMyApps=surface('portMyApps','port-my-apps-surface','/apps/cruise-port/#my-apps/manage');
 C.portNews=surface('portNews','port-news-surface','/apps/cruise-port/#news');
 C.portSync=surface('portSync','port-sync-surface','/apps/cruise-port/#sync-center');
 C.seriesApps={};for(const [id,dir] of Object.entries({pitch:'pitch-cruise',fretboard:'fretboard_cruise',rhythm:'rhythm-cruise',chord:'chord-cruise'})){
  const owner=C.seriesApps[id]=surface('app_'+id,'series-'+id+'-surface','/apps/'+dir+'/standard/');
  document.querySelector('[data-refresh-series-app="'+id+'"]')?.addEventListener('click',()=>owner.refresh());
 }
 for(const [id,owner] of Object.entries({tuner:C.tuner,metronome:C.portMetronome,practice:C.portPractice,gear:C.portGear,'my-apps':C.portMyApps,news:C.portNews,sync:C.portSync}))document.getElementById('port-'+id+'-resume')?.addEventListener('click',()=>owner.activate());
 document.querySelectorAll('[data-studio-cruise-app]').forEach(link=>{link.href='#app_'+link.dataset.studioCruiseApp;link.removeAttribute('target');link.onclick=e=>{e.preventDefault();C.shellHost.navigate('app_'+link.dataset.studioCruiseApp);};});
 C.standardHasUnsaved=()=>surfaces.some(s=>s.hasUnsaved());
 document.getElementById('shell-audio-stop').addEventListener('click',()=>surfaces.forEach(s=>s.pause()));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)surfaces.forEach(s=>s.pause());});
 window.addEventListener('pagehide',()=>surfaces.forEach(s=>s.pause()));
 window.addEventListener('beforeunload',e=>{if(surfaces.some(s=>s.hasUnsaved())){e.preventDefault();e.returnValue='';}});
 // Run after port-pc has installed the normal hash routing and shell.
 document.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.studioEntry='ready';document.getElementById('studio-shell').inert=false;const id=location.hash.slice(1);if(id)C.shellHost.navigate(id);});
})();
