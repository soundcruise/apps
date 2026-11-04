// Included only in the separately reviewed canary artifact, never normal Jekyll.
import {createStudioCanaryTransport} from './studio-transport.mjs';
import {mountProjectSyncHost} from './project-sync-host.mjs';
export function mountStudioCanary(C=globalThis.CruiseStudio){
 const transport=createStudioCanaryTransport();
 const details=document.createElement('details'),summary=document.createElement('summary'),element=document.createElement('div');
 summary.textContent='Project Cloud Sync';details.hidden=true;details.open=true;details.dataset.projectCanary='';details.append(summary,element);
 document.getElementById('screen-sheet-cruise').append(details);
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('../../cloud-panel.css',import.meta.url).href;document.head.append(css);
 let admitted=false;
 const host=mountProjectSyncHost({C,transport,element,onAdmission(ok,error){
  if(ok){admitted=true;details.hidden=false;}
  else if(!error||/^(?:activation-|studio_off|account_|pro-|pro_|shared-|session-changed|bound-pro)/.test(error.code||'')){admitted=false;details.hidden=true;}
  else details.hidden=!admitted; // Previously admitted owners retain offline/error recovery UI.
 }});
 globalThis.addEventListener('pagehide',e=>{if(!e.persisted)host.dispose();},{once:true});C.projectCloud=host;return host;
}
if(globalThis.location?.origin==='https://soundcruise.jp'){
 const start=()=>{if(globalThis.CruiseStudio?.entryAuth&&!globalThis.CruiseStudio.projectCloud)mountStudioCanary();};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
