import {draftHistory,guardDraft} from './draft-history.mjs';
import {bindOutsideDismiss} from '../score-ui.mjs';
import {cycleFormNote,playedSnapshot,validBarres} from './form-cycle.mjs';
export {automaticVoicingSnapshot} from '../chord/form-voicing.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const labels={1:'人',2:'中',3:'薬',4:'小',T:'親'};
export function createFormDraft(snapshot,playedStrings,detectBarres){
 const draft={snapshot:clone(playedSnapshot(snapshot,playedStrings)),playedStrings:playedStrings.slice().sort((a,b)=>a-b)};
 function rebuild(){draft.snapshot.barres=detectBarres?detectBarres(draft.snapshot.strings.filter(n=>n.kind==='note').map(n=>({string:n.string,fret:n.relativeFret,finger:n.finger}))).map(b=>({finger:b.finger,relativeFret:b.fret,fromString:b.fromString,toString:b.toString})):validBarres(draft.snapshot);}
 return {draft,
  cycle(string){const n=draft.snapshot.strings.find(n=>n.string===string);if(!n)return false;if(n.kind==='muted'){draft.snapshot.strings[string-1]={string,kind:'note',relativeFret:0,finger:null,fingeringWarning:false};}
   else{const next=cycleFormNote({fret:n.relativeFret,finger:n.finger,fingeringWarning:n.fingeringWarning});if(next.deleted&&draft.snapshot.strings.filter(n=>n.kind==='note').length===1)return false;draft.snapshot.strings[string-1]=next.deleted?{string,kind:'muted'}:{...n,finger:next.finger,fingeringWarning:next.fingeringWarning};}
   rebuild();draft.playedStrings=draft.snapshot.strings.filter(n=>n.kind==='note').map(n=>n.string);return true;
  },
  place(string,fret){if(!Number.isInteger(fret)||fret<0||fret+draft.snapshot.capo>draft.snapshot.maxAbsoluteFret||!draft.snapshot.strings[string-1])return false;draft.snapshot.strings[string-1]={string,kind:'note',relativeFret:fret,finger:fret===0?null:'T',fingeringWarning:false};rebuild();draft.playedStrings=draft.snapshot.strings.filter(n=>n.kind==='note').map(n=>n.string);return true;},
  finger(string,finger){const n=draft.snapshot.strings.find(n=>n.string===string);if(!n||n.kind!=='note'||!n.relativeFret)return;
   const barres=draft.snapshot.barres.filter(b=>b.relativeFret===n.relativeFret&&string>=b.fromString&&string<=b.toString&&String(b.finger)===String(n.finger));
   for(const b of barres){for(const linked of draft.snapshot.strings)if(linked.kind==='note'&&linked.relativeFret===b.relativeFret&&linked.string>=b.fromString&&linked.string<=b.toString&&String(linked.finger)===String(b.finger))linked.finger=finger;if([1,2,3,4].includes(finger))b.finger=finger;else draft.snapshot.barres=draft.snapshot.barres.filter(x=>x!==b);}
   n.finger=finger;n.fingeringWarning=false;
  },
  toggle(string){const at=draft.playedStrings.indexOf(string);if(at>=0){if(draft.playedStrings.length===1)return false;draft.playedStrings.splice(at,1);}else{const n=draft.snapshot.strings.find(n=>n.string===string);if(n.kind==='muted')Object.assign(n,{kind:'note',relativeFret:0,finger:null,fingeringWarning:false});draft.playedStrings.push(string);draft.playedStrings.sort((a,b)=>a-b);}return true;}
 };
}
export function createFormPopup({document:doc,dialog,diagram,snapshot,playedStrings,symbol,apply,detectBarres,onEdit,applyFingers,positions}){

 const original=JSON.stringify([playedSnapshot(snapshot,playedStrings),playedStrings.slice().sort((a,b)=>a-b)]),edit=createFormDraft(snapshot,playedStrings,detectBarres),node=(tag,text,parent=dialog)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;parent.appendChild(e);return e;};let editing=false,fingersOnly=false;
 const initialSnapshot=clone(edit.draft.snapshot);
 const head=node('header'),title=node('h2',symbol,head),actions=node('div',undefined,head),start=node('button','編集',actions),close=node('button','閉じる',actions);actions.className='sc-form-actions';head.classList.add('score-form-header');head.replaceChildren(start,title,close);start.type=close.type='button';start.dataset.paperFormEdit='';close.dataset.formClose='';const history=draftHistory(()=>edit.draft,state=>{
  const data=doc.activeElement?.dataset,string=data?.quickFinger||data?.formFinger||data?.popupString;
  Object.assign(edit.draft,state);
  render(string?'[data-quick-finger="'+string+'"],[data-form-finger="'+string+'"],[data-popup-string="'+string+'"]':null);
  if(!dialog.contains(doc.activeElement))close.focus({preventScroll:true});
 });
 const dismiss=guardDraft(dialog,history.dirty);close.onclick=dismiss;bindOutsideDismiss(dialog,{close:dismiss});
 dialog.addEventListener('keydown',e=>{if(editing)history.shortcut(e);});
 let scope;
 if(positions?.length>1){
  const label=node('label','編集する位置 ');
  scope=node('select',undefined,label);
  for(const item of [{id:'',label:'全て'},...positions]){
   const option=node('option',item.label,scope);option.value=item.id;
  }
 }
 function selectedIds(){return positions?(scope?.value?[scope.value]:positions.map(p=>p.id)):null;}
 const figure=node('div');figure.className='sc-form-touch';const hint=node('p','押さえている位置をクリックすると指が順に変わり、ミュートにもなります。');hint.className='sc-form-hint';
 const quick=onEdit&&!positions?node('button','ここで運指を調整'):null;
 if(quick){quick.type='button';quick.className='sc-form-quick-edit';quick.onclick=()=>{editing=true;render('[data-form-finger]');};}
 const status=node('p','');status.setAttribute('role','status');status.className='sc-form-hint';const footer=node('footer'),save=node('button','譜面に反映',footer);save.type='button';save.dataset.formApply='';
 function cycle(string,selector){if(!editing||!dialog.open)return;if(!edit.cycle(string))status.textContent='1音以上、残してください。';else status.textContent='';render(selector);}
 function render(focus){
  history.checkpoint();
  const {snapshot}=edit.draft,parts=diagram(snapshot);figure.replaceChildren();figure.dataset.formEditing=String(editing);figure.classList.toggle('is-editing',editing);const board=node('div',undefined,figure);board.className='sc-form-board';board.innerHTML=parts.svg;const svg=board.querySelector('svg'),[x,y,w,h]=svg.getAttribute('viewBox').split(/\s+/).map(Number);
  if(applyFingers&&(!editing||fingersOnly)){
   for(const marker of parts.model.markers){
    const note=snapshot.strings.find(n=>n.string===marker.string);
    if(note?.kind!=='note'||note.relativeFret<=0)continue;
    const b=node('button',undefined,board);b.type='button';b.className='sc-form-finger-hit';
    b.dataset.quickFinger=note.string;
    b.style.left=(marker.x-x)/w*100+'%';b.style.top=(marker.y-y)/h*100+'%';
    b.setAttribute('aria-label',note.string+'弦の運指：'+(labels[note.finger]||'未指定')+'。クリックで変更');
    b.onclick=()=>{
     if(!dialog.open)return;
     editing=fingersOnly=true;
     const fingers=[1,2,3,4,'T'];
     note.finger=fingers[(fingers.indexOf(note.finger)+1)%fingers.length];
     note.fingeringWarning=false;snapshot.barres=validBarres({...snapshot,barres:initialSnapshot.barres});
     render('[data-quick-finger="'+note.string+'"]');
    };
   }
  }
  if(editing&&!fingersOnly){for(const slot of parts.slots||[]){const n=snapshot.strings[slot.string-1];if((n.kind==='note'&&n.relativeFret===slot.fret)||(n.kind==='muted'&&slot.fret===0))continue;const b=node('button',undefined,board);b.type='button';b.className='sc-form-empty-hit';b.dataset.formSlot=slot.string+':'+slot.fret;b.style.left=(slot.x-x)/w*100+'%';b.style.top=(slot.y-y)/h*100+'%';b.setAttribute('aria-label',slot.string+'弦 '+slot.fret+'フレットに音を追加');b.onclick=()=>{if(editing&&dialog.open&&edit.place(slot.string,slot.fret))render('[data-form-finger="'+slot.string+'"]');};}
   for(const marker of parts.model.markers){const b=node('button',undefined,board);b.type='button';b.dataset.formFinger=marker.string;b.className='sc-form-finger-hit';b.style.left=(marker.x-x)/w*100+'%';b.style.top=(marker.y-y)/h*100+'%';b.setAttribute('aria-label',marker.string+'弦の指：'+(labels[snapshot.strings[marker.string-1].finger]||'なし')+'。クリックで変更');b.onclick=()=>cycle(marker.string,'[data-form-finger="'+marker.string+'"]');}
   for(const row of parts.rows.filter(row=>snapshot.strings[row.string-1].kind==='muted')){const b=node('button','×',board);b.type='button';b.className='sc-form-mute-hit';b.dataset.popupString=row.string;b.setAttribute('aria-label',row.string+'弦のミュートを開放弦に変更');b.style.top=(row.y-y)/h*100+'%';b.style.left=(parts.model.muteX-x)/w*100+'%';b.onclick=()=>cycle(row.string,'[data-form-finger="'+row.string+'"]');}
  }
  if(quick)quick.hidden=editing;hint.hidden=false;hint.textContent=editing&&!fingersOnly?'押さえている位置をクリックすると指が順に変わり、ミュートにもなります。':'押さえている指をクリックすると、運指を変更できます。';
  if(scope)scope.disabled=editing;
  footer.hidden=!editing;start.hidden=editing;save.disabled=JSON.stringify([snapshot,edit.draft.playedStrings])===original;close.textContent=editing?'キャンセル':'閉じる';if(focus)figure.querySelector(focus)?.focus({preventScroll:true});
 }
 start.onclick=onEdit?()=>onEdit(selectedIds()):(()=>{editing=true;render();});save.onclick=()=>{if(!editing||!dialog.open||!dialog.isConnected)return;const changes=edit.draft.snapshot.strings.filter((n,i)=>n.kind==='note'&&(n.finger!==initialSnapshot.strings[i].finger||n.fingeringWarning!==initialSnapshot.strings[i].fingeringWarning));
  const result=fingersOnly?applyFingers(selectedIds(),changes):apply(clone(edit.draft));if(!result?.ok){status.textContent=result?.error||'フォームを反映できませんでした';return;}dialog.close();};render();return edit;
}
