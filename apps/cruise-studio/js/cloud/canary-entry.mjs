// Included only in the separately reviewed canary artifact, never normal Jekyll.
import {createStudioCanaryTransport} from './studio-transport.mjs';
import {mountProjectSyncHost} from './project-sync-host.mjs';
export function mountStudioCanary(C=globalThis.CruiseStudio){
 const transport=createStudioCanaryTransport();
 const details=document.createElement('details'),summary=document.createElement('summary'),element=document.createElement('div');
 summary.textContent='Project Cloud Sync';details.hidden=true;details.open=true;details.dataset.projectCanary='';details.append(summary,element);
 const sheet=document.getElementById('screen-sheet-cruise'),score=document.createElement('div');
 score.className='studio-score-content';score.append(...sheet.childNodes);sheet.append(score,details);
 const note=document.querySelector('.home-project-storage-note'),label=document.createElement('span'),state=document.createElement('span'),open=document.createElement('button');
 note.dataset.projectCanaryHome='';label.textContent='Project Cloud（運営者限定）';state.dataset.projectHomeStatus='';state.setAttribute('role','status');open.type='button';open.className='btn-ghost';open.dataset.openProjectCloud='';open.textContent='Project Cloudを開く';open.disabled=true;note.replaceChildren(label,state,open);
 details.id='studio-project-cloud';open.setAttribute('aria-controls',details.id);
 open.addEventListener('click',()=>{if(details.hidden)return;C.shellHost.navigate('sheetCruise');if(C.shellHost.getActiveWorkspace()!=='sheetCruise')return;details.open=true;details.scrollIntoView({block:'start'});summary.focus({preventScroll:true});});
 const renderHome=()=>{open.disabled=details.hidden;const value=element.querySelector('[data-project-sync-status]')?.textContent||'Project接続を確認中…';if(state.textContent!==value)state.textContent=value;};
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('../../cloud-panel.css',import.meta.url).href;document.head.append(css);
 let admitted=false;
 const host=mountProjectSyncHost({C,transport,element,onAdmission(ok,error){
  if(ok){admitted=true;details.hidden=false;}
  else if(!error||/^(?:activation-|studio_off|account_|pro-|pro_|shared-|session-changed|bound-pro)/.test(error.code||'')){admitted=false;details.hidden=true;}
  else details.hidden=!admitted; // Previously admitted owners retain offline/error recovery UI.
  renderHome();
 }});
 const observer=new MutationObserver(renderHome);observer.observe(element.querySelector('[data-project-sync-status]'),{childList:true,subtree:true,characterData:true});renderHome();
 globalThis.addEventListener('pagehide',e=>{if(!e.persisted){observer.disconnect();host.dispose();}},{once:true});C.projectCloud=host;return host;
}
if(globalThis.location?.origin==='https://soundcruise.jp'){
 const start=()=>{if(globalThis.CruiseStudio?.entryAuth&&!globalThis.CruiseStudio.projectCloud)mountStudioCanary();};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
