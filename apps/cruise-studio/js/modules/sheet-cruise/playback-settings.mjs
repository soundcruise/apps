import {addPageHelp} from './page-help.mjs';
import {METRONOME_SOUNDS} from '../score-audio.mjs';
import {bindOutsideDismiss,bindPlaybackButton,syncPlaybackButton} from '../score-ui.mjs';
// Browser preferences only. Never write playback controls into a Project.
export function normalizeMix(value){return Object.fromEntries(['chords','melody','metronome'].map(key=>[key,typeof value?.[key]==='number'&&Number.isFinite(value[key])&&value[key]>=0&&value[key]<=100?value[key]:100]));}
export function createPlaybackSettings({document:doc,host,read,change,toggle,closed,resetTempo,partChecks,syncPartChecks}){
 let dialog=null,refresh=()=>{};
 function close(restore=true){if(dialog){dialog.restore=restore;dialog.close();}}
 function open(trigger){
  if(dialog)return;const previous=doc.activeElement,d=doc.createElement('dialog');dialog=d;d.className='sc-playback-dialog';d.dataset.playbackSettings='';d.setAttribute('aria-labelledby','sc-playback-title');d.restore=true;const active=()=>dialog===d&&d.open&&d.isConnected;
  const node=(tag,text,parent=d)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;parent.appendChild(e);return e;};
  const head=node('header'),title=node('h2','音設定',head),play=node('button','▶ 再生',head),done=node('button','完了',head);play.type='button';play.dataset.playbackSettingsPlay='';bindPlaybackButton(play,()=>{if(active())toggle();});refresh=()=>syncPlaybackButton(play,read().phase,{stop:true});refresh();title.id='sc-playback-title';addPageHelp(d,done,'audio',title.textContent);done.type='button';done.dataset.playbackDone='';done.onclick=()=>close();
  const parts=node('section');node('h3','再生する音',parts);const checks=partChecks();parts.append(checks);
  const values=read(),mix=normalizeMix(values.mix),audio=node('section');audio.setAttribute('aria-label','音量');node('h3','音量',audio);
  const fields={};for(const [key,label]of [['chords','コード'],['melody','メロディ'],['metronome','メトロノーム・カウントイン']]){const row=node('label',undefined,audio),caption=node('span',label,row),output=node('output',mix[key]+'%',caption),input=node('input',undefined,row);row.className='sc-volume-row';input.type='range';input.min=0;input.max=100;input.step=1;input.value=mix[key];input.dataset.playbackVolume=key;input.setAttribute('aria-label',label+'の音量');input.oninput=()=>{if(!active())return;mix[key]=Number(input.value);output.textContent=mix[key]+'%';change('scorePlaybackMix',{...mix},notice);refresh();};fields[key]={input,output};}
  refresh=()=>{
   syncPlaybackButton(play,read().phase,{stop:true});syncPartChecks(checks);
   const current=read().mix;
   for(const key of Object.keys(fields)){
    mix[key]=current[key];fields[key].input.value=current[key];fields[key].output.textContent=current[key]+'%';
   }
  };
  const reset=node('button','音量を戻す',audio);reset.type='button';reset.className='sc-playback-reset';reset.onclick=()=>{if(!active())return;for(const key of Object.keys(mix)){mix[key]=100;fields[key].input.value=100;fields[key].output.textContent='100%';}change('scorePlaybackMix',{...mix},notice);refresh();};
  const timing=node('section');node('h3','拍のガイド',timing);for(const [id,key,label,help]of [['sc-count-in','scoreCountIn','カウントイン','再生前に1小節。ループでは初回だけ。']]){const row=node('label',undefined,timing),input=node('input',undefined,row);row.className='sc-playback-option '+id;input.type='checkbox';input.id=id;input.checked=values[key]===true;node('span',label,row);input.onchange=()=>{if(active())change(key,input.checked,notice);};}
  const toneLabel=node('label','メトロノームの音'),tone=node('select',undefined,toneLabel);toneLabel.className='score-metronome-tone';tone.setAttribute('aria-label','メトロノームの音');tone.dataset.metronomeSound='';for(const [id,text]of Object.entries(METRONOME_SOUNDS)){const o=node('option',text,tone);o.value=id;}tone.value=values.metronomeSound||'click';tone.onchange=()=>{if(active())change('scoreMetronomeSound',tone.value,notice);};
  const sync=node('section');sync.className='sc-audio-sync';node('h3','音と棒の同期',sync);const label=node('label','音と棒の位置調整',sync),delay=node('input',undefined,label),output=node('output','',label);delay.type='range';delay.min=-1000;delay.max=1000;delay.step=10;delay.value=values.visualDelayMs||0;delay.dataset.playbackDelay='';delay.setAttribute('aria-label','棒の表示タイミング');const updateDelay=()=>{output.textContent=(Number(delay.value)>0?'+':'')+delay.value+' ms';};updateDelay();delay.oninput=()=>{if(active()){change('scoreVisualDelayMs',Number(delay.value),notice);updateDelay();}};const automatic=node('button','自動に戻す',sync);automatic.type='button';automatic.onclick=()=>{if(active()){delay.value=0;change('scoreVisualDelayMs',0,notice);updateDelay();}};
  if(resetTempo){const original=node('button','原曲のテンポに戻す');original.type='button';original.className='score-tempo-reset';original.onclick=()=>{if(active())resetTempo();};}
  const notice=node('p','');notice.setAttribute('role','status');notice.dataset.playbackSettingsNotice='';
  bindOutsideDismiss(d,{close:()=>close()});d.addEventListener('keydown',e=>{e.stopPropagation();if(e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();close();}if((e.metaKey||e.ctrlKey)&&['s','z'].includes(e.key.toLowerCase()))e.preventDefault();});
  d.addEventListener('close',()=>{if(dialog===d)dialog=null;refresh=()=>{};d.remove();closed();if(d.restore)(previous?.isConnected?previous:trigger)?.focus({preventScroll:true});});host.appendChild(d);d.showModal();done.focus({preventScroll:true});
 }
 return {open,close,refresh(){refresh();},get isOpen(){return !!dialog?.open;}};
}
