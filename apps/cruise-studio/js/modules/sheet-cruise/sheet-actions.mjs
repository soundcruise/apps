import {addPageHelp} from './page-help.mjs';
import {basisKey} from '../chord/form-snapshot.mjs';
// New document identity, same canonical content/references. Never mutate the source.
export function copyProject(project,title,newId,now){
 const p=JSON.parse(JSON.stringify(project));p.projectId=newId;p.songInfo.title=title.trim();p.createdAt=p.updatedAt=now;
 const events=new Map(p.bars.flatMap(b=>b.chords).map(e=>[e.id,e])),materials=new Map(p.materials.forms.map(m=>[m.id,m]));
 for(const binding of p.performance.formBindings){const original=project.performance.formBindings.find(b=>b.id===binding.id),event=events.get(binding.chordEventId),material=materials.get(binding.materialId);if(original.confirmation.status==='confirmed'&&original.confirmation.basisKey===basisKey(project,event,material,original.playedStrings))binding.confirmation.basisKey=basisKey(p,event,material,binding.playedStrings);}
 return p;
}
export function createSheetActions({document:doc,host,closed}){
 let dialog=null;
 function close(restore=false){if(dialog){dialog.restore=restore;dialog.close();}}
 function shell(title,trigger){
  if(dialog)return null;const d=doc.createElement('dialog');dialog=d;d.restore=true;d.className='sc-actions-dialog';d.dataset.sheetActions='';d.setAttribute('aria-label',title);const previous=doc.activeElement;
  const node=(tag,text,parent=d)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;parent.appendChild(e);return e;};
  const header=node('header');node('h2',title,header);const dismiss=node('button','閉じる',header);dismiss.type='button';dismiss.dataset.actionClose='';dismiss.onclick=()=>{if(!d.busy)close(true);};
  let outside=false;const out=e=>{const r=d.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};d.addEventListener('pointerdown',e=>outside=out(e));d.addEventListener('click',e=>{if(outside&&out(e)&&!d.busy){e.stopPropagation();close(true);}outside=false;});
  d.addEventListener('keydown',e=>{e.stopPropagation();if(e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();if(!d.busy)close(true);}if((e.metaKey||e.ctrlKey)&&['s','z'].includes(e.key.toLowerCase()))e.preventDefault();});d.addEventListener('cancel',e=>{e.preventDefault();if(!d.busy)close(true);});
  d.addEventListener('close',()=>{if(dialog===d)dialog=null;d.cleanup?.();d.remove();closed();if(d.restore)(previous?.isConnected?previous:trigger)?.focus({preventScroll:true});});host.appendChild(d);return {d,node,dismiss,show:()=>d.showModal()};
 }
 function history(trigger,session,restore,preview){
  const ui=shell('変更履歴',trigger);if(!ui)return;const {d,node,dismiss}=ui,h=session.getHistory(),ticket={sessionId:session.sessionId,snapshotVersion:session.snapshotVersion,epoch:h.epoch};
  d.classList.add('sc-history-dialog');dismiss.hidden=true;
  let selected=h.cursor,confirming=false;const buttons=[];
  const status=node('p','履歴を選ぶと、その時点の譜面を確認できます。');status.setAttribute('role','status');status.dataset.historyStatus='';
  const list=node('ol');list.className='sc-history-list';
  const warning=node('p','');warning.hidden=true;warning.dataset.historyWarning='';warning.setAttribute('role','alert');
  const header=d.querySelector('header'),cancel=node('button','キャンセル',header),apply=node('button','決定',header);cancel.type=apply.type='button';cancel.dataset.historyCancel='';apply.dataset.historyApply='';apply.disabled=true;
  addPageHelp(d,cancel,'history');
  cancel.onclick=()=>close(true);
  function stale(){status.textContent='履歴が変わりました。開き直してください。現在の内容は保持しています。';apply.disabled=true;preview?.(null);}
  if(!h.entries.length)status.textContent=h.status==='overflow'?'この変更は履歴の容量を超えたため、巻き戻しできません。':'この曲の変更履歴はまだありません。';
  else{const start=Math.max(0,Math.min(h.cursor-10,h.entries.length-20)),end=Math.min(h.entries.length,start+20);
   for(let cursor=end;cursor>=start;cursor--){const row=node('li',undefined,list),label=cursor===0?'履歴の開始時':h.entries[cursor-1].label,b=node('button',label,row);b.type='button';b.dataset.historyCursor=cursor;b.setAttribute('aria-pressed',String(cursor===selected));b.setAttribute('aria-current',cursor===h.cursor?'step':'false');node('small',cursor===h.cursor?'現在':cursor>h.cursor?'やり直し可能':'',b);buttons.push(b);
    b.onclick=()=>{if(!d.open||!d.isConnected)return;const result=session.previewHistory(cursor,ticket);if(!result.ok){stale();return;}selected=cursor;confirming=false;warning.hidden=true;apply.textContent='決定';delete apply.dataset.historyConfirm;apply.disabled=selected===h.cursor&&selected===h.entries.length;buttons.forEach(el=>el.setAttribute('aria-pressed',String(+el.dataset.historyCursor===selected)));status.textContent=cursor===h.cursor?'現在の譜面を表示中です。':label+' の譜面を表示中です。';preview?.(result.snapshot);};
   }
  }
  apply.addEventListener('keydown',e=>{if(e.repeat||e.isComposing||e.keyCode===229)e.preventDefault();});
  apply.onclick=e=>{
   if(e.detail>1||!d.open||!d.isConnected||apply.disabled)return;
   if(!session.previewHistory(selected,ticket).ok){stale();return;}
   if(!confirming){confirming=true;warning.textContent='この時点に戻すと、以後の変更履歴'+(h.entries.length-selected)+'件が失われ、やり直しでは戻せません。保存済みの曲は「保存」を押すまで変更されません。';warning.hidden=false;apply.textContent='この時点に戻す';apply.dataset.historyConfirm='';return;}
   close(false);restore(selected,ticket);
  };
  // Dragging moves only the palette, never the sheet or a history entry.
  const events=new AbortController();header.tabIndex=0;header.title='ドラッグで移動（Alt＋矢印キーでも移動できます）';header.setAttribute('aria-label','変更履歴。ドラッグで移動');
  function move(x,y){const r=d.getBoundingClientRect();d.style.transform='none';d.style.left=Math.max(8,Math.min(innerWidth-r.width-8,x))+'px';d.style.top=Math.max(8,Math.min(innerHeight-r.height-8,y))+'px';}
  header.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;e.preventDefault();const r=d.getBoundingClientRect(),x=e.clientX,y=e.clientY,id=e.pointerId;header.setPointerCapture(id);const drag=e=>{if(e.pointerId===id)move(r.left+e.clientX-x,r.top+e.clientY-y);};const end=e=>{if(e.pointerId!==id)return;header.removeEventListener('pointermove',drag);header.removeEventListener('pointerup',end);header.removeEventListener('pointercancel',end);header.removeEventListener('lostpointercapture',end);if(header.hasPointerCapture(id))header.releasePointerCapture(id);};header.addEventListener('pointermove',drag);header.addEventListener('pointerup',end);header.addEventListener('pointercancel',end);header.addEventListener('lostpointercapture',end);});
  header.addEventListener('keydown',e=>{if(e.isComposing||!e.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const r=d.getBoundingClientRect();move(r.left+(e.key==='ArrowLeft'?-16:e.key==='ArrowRight'?16:0),r.top+(e.key==='ArrowUp'?-16:e.key==='ArrowDown'?16:0));});
  doc.defaultView.addEventListener('resize',()=>{if(d.open){const r=d.getBoundingClientRect();move(r.left,r.top);}},{signal:events.signal});
  const observer=new ResizeObserver(()=>{if(d.open){const r=d.getBoundingClientRect();move(r.left,r.top);}});observer.observe(d);d.cleanup=()=>{events.abort();observer.disconnect();preview?.(null);};ui.show();header.focus({preventScroll:true});
 }
 function duplicate(trigger,title,save){
  const ui=shell('曲を複製',trigger);if(!ui)return;const {d,node,dismiss}=ui;dismiss.textContent='キャンセル';node('p','編集中の内容を、このブラウザに別の曲として保存します。');const label=node('label','複製後の曲名'),input=node('input',undefined,label);input.type='text';input.maxLength=160;input.value=title+' のコピー';input.dataset.duplicateName='';let composing=false,justComposed=false;input.addEventListener('compositionstart',()=>{composing=true;justComposed=false;});input.addEventListener('compositionend',()=>{composing=false;justComposed=true;});const status=node('p','');status.setAttribute('role','status');const apply=node('button','複製する',dismiss.parentNode);apply.type='button';apply.dataset.duplicateApply='';
  async function submit(){if(!d.open||d.busy||!d.isConnected||composing)return;const name=input.value.trim();if(!name){status.textContent='曲名を入力してください';return;}d.busy=true;input.disabled=apply.disabled=dismiss.disabled=true;try{const result=await save(name);if(result.ok){close(false);return;}status.textContent=result.error||'保存できませんでした。元の曲と編集中の内容は保持しています。';}catch(_){status.textContent='保存できませんでした。内容は保持しています。';}finally{d.busy=false;input.disabled=apply.disabled=dismiss.disabled=false;}}
  apply.addEventListener('pointerdown',e=>{if(composing)e.preventDefault();});apply.onclick=submit;input.addEventListener('keydown',e=>{if(e.key!=='Enter'){justComposed=false;return;}if(composing||e.isComposing||e.keyCode===229||justComposed){justComposed=false;return;}e.preventDefault();void submit();});ui.show();input.focus({preventScroll:true});input.select();
 }
 return {history,duplicate,close,get isOpen(){return !!dialog?.open;}};
}
