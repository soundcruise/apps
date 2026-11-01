import {attachPresentation} from './presentation.mjs';
import {createPortProBoundary} from '../../core/port-pro-boundary.mjs';
import {resolveCruiseAppHref} from '../../../../cruise-port/cruise-app-links.js';
export async function mount(id, host, current) {
 const boundary=createPortProBoundary();
 const verdict=await boundary.authorize();
 if(!current()){boundary.dispose();return null;}
 if(!verdict.ok){host.textContent='Studio入口の認証を確認してください。';boundary.dispose();return null;}
 const admittedAccount=globalThis.CruiseStudio.entryAuth.read().accountId;
 const url=new URL(resolveCruiseAppHref(id,'pro'),location.origin);
 const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('アプリを読み込めません');
 const parsed=new DOMParser().parseFromString(await response.text(),'text/html');
 // Load the original local application, but not another Account/Sync/gate owner.
 for(const script of parsed.querySelectorAll('script')){
  if(!script.getAttribute('src')){if(script.parentElement===parsed.head&&script.textContent.includes("document.documentElement.setAttribute('data-theme'"))continue;script.remove();continue;}
  const path=new URL(script.getAttribute('src'),url).pathname;
  if(!path.startsWith(url.pathname.split('/').slice(0,-2).join('/')+'/')||/\/sync\//.test(path)){script.remove();continue;}
  script.src=new URL(script.getAttribute('src'),url).href;
 }
 parsed.querySelectorAll('base,link[rel=manifest],link[rel=preconnect],link[href*="pro-gate"],link[href*="sync-account"]').forEach(e=>e.remove());
 parsed.documentElement.dataset.studioApp=id;
 const base=parsed.createElement('base');base.href=url.href;parsed.head.prepend(base);
 const style=parsed.createElement('style');style.textContent='#pro-gate-reset,[data-sync-join-entry-host]{display:none!important} html,body{min-width:0} body{margin:0} .app-container{max-width:1200px;margin-inline:auto} a[href*="cruise-port/"]{display:none!important}';parsed.head.append(style);
 const runtime=parsed.createElement('script');runtime.textContent=`(()=>{const entry=parent.CruiseStudio.entryAuth,current=()=>entry.isAuthorized()&&entry.read().accountId===${JSON.stringify(admittedAccount)};window.SoundCruiseProOperationSource=Object.freeze({read(){return current()?parent.SoundCruiseProOperationSource.read():{auth:null,revoked:true};},async validate(auth){if(!await entry.check()||!current())return {ok:false,revoked:true};return parent.SoundCruiseProOperationSource.validate(auth);}});window.__soundCruiseEnsureProSession=()=>entry.check();const contexts=new Set(),streams=new Set();let stopped=false;if(navigator.mediaDevices){const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...args)=>{if(stopped||!current()||!parent.CruiseStudio.seriesApps['${id}'].claimAudio())throw new DOMException('Studio audio unavailable','AbortError');const stream=await get(...args);if(stopped||!current()){stream.getTracks().forEach(t=>t.stop());throw new DOMException('Studio audio stopped','AbortError');}streams.add(stream);return stream;};}for(const key of ['AudioContext','webkitAudioContext']){const Native=window[key];if(Native)window[key]=class extends Native{constructor(...args){if(stopped||!current()||!parent.CruiseStudio.seriesApps['${id}'].claimAudio())throw Error('Studio audio is stopped or owned by another tool');super(...args);contexts.add(this);}};}try{Object.defineProperty(navigator,'serviceWorker',{value:{getRegistrations:async()=>[],getRegistration:async()=>undefined,ready:new Promise(()=>{}),addEventListener(){}}});}catch{}window.studioAppStop=()=>{stopped=true;for(const stream of streams)stream.getTracks().forEach(t=>t.stop());for(const c of contexts)c.close().catch(()=>{});document.querySelectorAll('audio,video').forEach(e=>e.pause());};window.addEventListener('pagehide',window.studioAppStop);document.addEventListener('visibilitychange',()=>{if(document.hidden)window.studioAppStop();});document.addEventListener('input',()=>{window.studioAppDirty=true;});document.addEventListener('change',()=>{window.studioAppDirty=true;});document.addEventListener('click',e=>{if(e.target.closest('[id*=settings],[class*=settings],[role=dialog]'))window.studioAppDirty=true;});})();`;parsed.head.insertBefore(runtime,base.nextSibling);
 if(!current()||!CruiseStudio.entryAuth.isAuthorized()||CruiseStudio.entryAuth.read().accountId!==admittedAccount){boundary.dispose();return null;}
 const iframe=document.createElement('iframe');iframe.title=id+' Pro';iframe.className='studio-series-frame';const presentation=attachPresentation(iframe);iframe.srcdoc='<!doctype html>'+parsed.documentElement.outerHTML;host.replaceChildren(iframe);
 return {iframe,refreshLayout:presentation.refresh,dispose(){presentation.dispose();boundary.dispose();iframe.contentWindow?.studioAppStop?.();iframe.remove();}};
}
