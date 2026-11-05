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
 heading.textContent='Project Cloud';heading.tabIndex=-1;state.dataset.projectHomeStatus='';state.setAttribute('role','status');open.type=retry.type='button';open.className=retry.className='btn-ghost';open.dataset.openProjectDetails='';open.textContent='Project Cloudを開く';open.disabled=false;open.setAttribute('aria-controls',details.id);retry.textContent='Project接続を再確認';sync.append(heading,open,retry,state,availability);
 document.getElementById('port-sync-surface').before(sync);
 open.addEventListener('click',()=>{C.shellHost.navigate('sheetCruise');if(C.shellHost.getActiveWorkspace()!=='sheetCruise')return;details.open=true;details.scrollIntoView({block:'start'});summary.focus({preventScroll:true});});
 let admitted=false;
 const render=()=>{open.disabled=false;const panel=element.querySelector('.studio-cloud-panel');if(panel)panel.inert=!admitted;const text=element.querySelector('[data-project-sync-status]')?.textContent||'Project接続を確認中…';if(state.textContent!==text)state.textContent=text;availability.textContent=!admitted?'Project Cloudは現在利用できません。ローカル制作は続けられます。':'現在のAccountで許可されたProjectを利用できます。';};
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('../../cloud-panel.css',import.meta.url).href;document.head.append(css);
 const host=mountProjectSyncHost({C,transport,element,onAdmission(ok,error){
  if(ok){admitted=true;}
  else if(!error||/^(?:activation-|studio_off|account_|pro-|pro_|shared-|session-changed|bound-pro)/.test(error.code||'')){admitted=false;}
  // A transient failure retains the existing recovery UI for previously admitted owners.
  render();
 }});
 retry.addEventListener('click',()=>void host.refresh());
 const observer=new MutationObserver(render);observer.observe(element.querySelector('[data-project-sync-status]'),{childList:true,subtree:true,characterData:true});render();
 globalThis.addEventListener('pagehide',e=>{if(!e.persisted){observer.disconnect();host.dispose();}},{once:true});C.projectCloud=host;return host;
}
if(globalThis.location?.origin==='https://soundcruise.jp'){
 const start=()=>{if(globalThis.CruiseStudio?.entryAuth&&!globalThis.CruiseStudio.projectCloud)mountStudioCanary();};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
