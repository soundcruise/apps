// One Studio product. The unchanged transport still requires server operator-canary admission.
import {createStudioCanaryTransport} from './studio-transport.mjs';
import {mountProjectSyncHost} from './project-sync-host.mjs';
export function mountStudioCanary(C=globalThis.CruiseStudio){
 const transport=createStudioCanaryTransport();
 const details=document.createElement('details'),summary=document.createElement('summary'),element=document.createElement('div');
 summary.textContent='Project Cloud Sync';details.hidden=false;details.open=true;details.dataset.projectCanary='';details.append(summary,element);
 const sheet=document.getElementById('screen-sheet-cruise'),score=document.createElement('div');
 score.className='studio-score-content';score.append(...sheet.childNodes);sheet.append(score,details);details.id='studio-project-cloud';
 const sync=document.createElement('section');sync.className='studio-project-sync-summary';sync.setAttribute('aria-label','Project Cloud');
 const heading=document.createElement('h2'),state=document.createElement('p'),availability=document.createElement('p'),open=document.createElement('button'),retry=document.createElement('button');
 heading.textContent='Project Cloud';heading.tabIndex=-1;state.dataset.projectHomeStatus='';state.setAttribute('role','status');open.type=retry.type='button';open.className=retry.className='btn-ghost';open.dataset.openProjectDetails='';open.textContent='クラウド上の制作Projectを見る';open.disabled=false;open.setAttribute('aria-controls',details.id);retry.textContent='Project接続を再確認';sync.append(heading,open,retry,state,availability);
 document.getElementById('port-sync-surface').before(sync);
 open.addEventListener('click',()=>{C.shellHost.navigate('sheetCruise');if(C.shellHost.getActiveWorkspace()!=='sheetCruise')return;details.open=true;details.scrollIntoView({block:'start'});summary.focus({preventScroll:true});});
 let admitted=false,admissionError=null;
 const render=()=>{
  const account=C.accountStatus?.read?.()?.state||'checking',connected=account==='connected';
  open.hidden=!connected||!admitted;open.disabled=!connected||!admitted;
  retry.hidden=!connected;retry.textContent=admitted?'Projectの利用状態を更新':'Projectの利用許可を再確認';
  const panel=element.querySelector('.studio-cloud-panel');if(panel)panel.inert=!admitted;
  const temporary=['offline','error'].includes(account)||(connected&&admissionError&&!/^(activation-|studio_off|account_|pro-|pro_|shared-|bound-pro)/.test(admissionError.code||''));
  state.textContent=temporary?'通信を確認できません。保存内容・未送信データは保持しています。通信復帰後に再確認できます。':!connected?'先に上のCruise SyncでAccount接続を確認してください。':admitted?'このAccountでProject Cloudを利用できます。':'Accountは接続済みです。Project Cloudの利用許可は別途必要です。';
  availability.textContent=connected&&!admitted&&!temporary?'Port・4アプリの通常Syncとローカル制作は引き続き利用できます。Project Cloudは現在、許可された運営者のみ利用できます。':'';
 };
 window.addEventListener('studio-account-observed',render);
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('../../cloud-panel.css',import.meta.url).href;document.head.append(css);
 const host=mountProjectSyncHost({C,transport,element,onAdmission(ok,error){
  admissionError=error||null;
  if(ok){admitted=true;}
  else if(!error||/^(?:activation-|studio_off|account_|pro-|pro_|shared-|session-changed|bound-pro)/.test(error.code||'')){admitted=false;}
  // A transient failure retains the existing recovery UI for previously admitted owners.
  render();
 }});
 retry.addEventListener('click',()=>void host.refresh());
 const observer=new MutationObserver(render);observer.observe(element.querySelector('[data-project-sync-status]'),{childList:true,subtree:true,characterData:true});render();
 globalThis.addEventListener('pagehide',e=>{if(!e.persisted){observer.disconnect();window.removeEventListener('studio-account-observed',render);host.dispose();}},{once:true});C.projectCloud=host;return host;
}
if(globalThis.location?.origin==='https://soundcruise.jp'){
 const start=()=>{if(globalThis.CruiseStudio?.entryAuth&&!globalThis.CruiseStudio.projectCloud)mountStudioCanary();};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
