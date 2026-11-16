export function createScrollSettings({host,read,change,toggle,playback}){
 const doc=host.ownerDocument;let dialog,refresh=()=>{};
 return {open(){if(dialog){dialog.focus();return;}const d=doc.createElement('dialog');dialog=d;d.className='sv-settings sv-modeless';d.dataset.viewerNonmodal='';d.setAttribute('aria-label','譜面の送り設定');
 const node=(tag,text,parent=d)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;parent.append(e);return e;};const h=node('header'),title=node('h2','送り設定',h),play=node('button','▶ 再生／一時停止',h),close=node('button','閉じる',h);play.type=close.type='button';play.onclick=toggle;close.onclick=()=>d.close();
 const note=node('p','標準はBPMに追従します。カスタムは音のテンポを変えず、画面だけを送ります。');note.className='sv-settings-note';
 const state=node('p',''),label=node('label','送り速度'),slider=node('input',undefined,label),output=node('output','',label);slider.type='range';slider.min=0;slider.max=100;slider.step=1;slider.dataset.nativeScrollSpeed='';slider.setAttribute('aria-label','譜面の送り速度');
 const ticks=node('div');ticks.className='sv-speed-ticks';for(const text of ['遅い','普通','速い'])node('span',text,ticks);
 state.dataset.nativeScrollMode='';const reset=node('button','BPMに戻す');reset.type='button';reset.dataset.scrollReset='';
 const update=()=>{const s=read(),base=240/playback().settings.bpm;state.textContent=s.mode==='bpm'?'BPMに追従中':'カスタム速度';slider.value=s.mode==='bpm'?50:Math.max(0,Math.min(100,50+Math.log2(base/s.secondsPerBar)*25));output.textContent=s.mode==='bpm'?'BPM '+playback().settings.bpm:Math.round(s.secondsPerBar*100)/100+'秒／小節';};
 refresh=update;slider.oninput=()=>{const base=240/playback().settings.bpm;change({mode:'custom',secondsPerBar:base/Math.pow(2,(Number(slider.value)-50)/25)});update();};reset.onclick=()=>{change({mode:'bpm'});update();};
 d.addEventListener('keydown',e=>e.stopPropagation());d.addEventListener('close',()=>{dialog=null;refresh=()=>{};d.remove();});host.append(d);d.show();update();},refresh(){refresh();},close(){dialog?.close();},get isOpen(){return !!dialog?.open;}};
}
