import {mountScorePresets} from './score-presets.mjs';
import {bindOutsideDismiss} from '../score-ui.mjs';
// Transient editors for the active Project. No storage or account access.
export function createScoreSettings({C,document:doc,getSession,canEdit,execute,changed,createPreviewAudio,loadChordPicker,previewPaperOptions,closed=()=>{}}){
 let dialog=null,applying=false,previous=null,parked=null;
 const node=(tag,text,parent)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;if(parent)parent.appendChild(el);return el;};
 function close(){if(dialog)dialog.close();}
 function open(mode,args={}){
  if(dialog||!canEdit())return;
  const owner=getSession(),frame=C.structureOperations.capture(owner),project=owner.workingSnapshot(),view=C.model.toStructureView(project),titles={settings:'曲情報',sections:'セクション',inline:'譜面を編集',slot:'空き枠',instrument:'キー・カポ',chordPreset:'コード一括入力',strumPreset:'ストローク一括入力',rhythm:'基本ストローク',rhythmMaterials:'リズム素材'};
  previous=args.returnFocus||doc.activeElement;previous=previous?.closest('.sc-toolbar-menu')?.querySelector(':scope > summary')||previous;dialog=node('dialog');dialog.className='sc-song-dialog';dialog.dataset.scoreDialog=mode;dialog.setAttribute('aria-label',titles[mode]);
  const current=dialog,head=node('header',undefined,current);node('h2',titles[mode],head);const dismiss=node('button','キャンセル',head);dismiss.type='button';dismiss.dataset.scoreCancel='';
  const body=node('div',undefined,current),status=node('p','',current);status.setAttribute('role','status');status.dataset.scoreStatus='';
  const foot=node('footer',undefined,current),apply=node('button',mode==='inline'?'確定':'適用',foot);apply.type='button';apply.dataset.scoreApply='';apply.className='btn-primary';
  let collect=()=>null,mountPreview,composing=false;
  function input(label,value,key,type='text',parent=body){const wrap=node('label',undefined,parent);node('span',label,wrap);const field=node(type==='textarea'?'textarea':'input',undefined,wrap);if(type!=='textarea')field.type=type;field.value=value;field.dataset.scoreField=key;return field;}
  function button(text,fn,parent=body){const b=node('button',text,parent);b.type='button';b.addEventListener('click',fn);return b;}
  function navigate(next){current.addEventListener('close',()=>open(next),{once:true});current.close();}
  function commit(){
   if(composing)return;const now=getSession();if(now!==owner||!C.structureOperations.isCurrent(frame,now)){status.textContent='編集対象が変わりました。入力を保持しています。開き直してください。';return;}
   try{const request=collect();if(!request)return;applying=true;let result;try{if(!canEdit())throw Error('入力・保存・競合の状態を確認してください');result=execute(request.kind,request.args,frame);}finally{applying=false;}
    if(!result.ok){status.textContent=result.error||'変更を適用できませんでした';return;}current.close();changed({mode,previous:project,slot:args.slot});
   }catch(e){applying=false;status.textContent=e.message;}
  }
  if(mode==='slot'){
   node('p','空き枠を通常の空の小節に戻し、編集画面を開きます。再生にも含まれるようになります。',body);
   apply.textContent='編集画面を起動';
   collect=()=>({kind:'restoreSlot',args:{slot:args.slot,values:{},activateEmpty:true}});
  }else if(mode==='inline'){
   const labels={title:'曲名',artist:'アーティスト名',bpm:'BPM',section:'セクション名'},value=args.field==='section'?project.sections.find(s=>s.id===args.sectionId)?.name:project.songInfo[args.field];
   const field=input(labels[args.field],value??'',args.field,args.field==='bpm'?'number':'text');if(args.field==='bpm'){field.min='20';field.max='400';}
   collect=()=>args.field==='section'?{kind:'renameSection',args:{sectionId:args.sectionId,name:field.value}}:{kind:'songInfo',args:{values:{[args.field]:args.field==='bpm'?Number(field.value):field.value}}};
  }else if(mode==='instrument'){
   const modeLabel=node('label',undefined,body);node('span','変更方法',modeLabel);const choice=node('select',undefined,modeLabel);choice.dataset.scoreField='keyMode';for(const[v,t]of[['preserve','実音を保つ'],['transpose','曲全体を移調']]){const o=node('option',t,choice);o.value=v;}
   const explanation=node('p','',body);explanation.dataset.keyModeHelp='';
   const keyLabel=node('label',undefined,body);node('span','原曲キー（実音）',keyLabel);const key=node('select',undefined,keyLabel);key.dataset.scoreField='originalKey';for(const name of ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B']){const o=node('option',name,key);o.value=name;}if(![...key.options].some(o=>o.value===project.songInfo.originalKey)){const o=node('option',project.songInfo.originalKey,key);o.value=project.songInfo.originalKey;}key.value=project.songInfo.originalKey;
   const capo=input('カポ',project.instrument.capo,'capo','number');capo.min='0';capo.max='11';
   const comparison=node('table',undefined,body);comparison.className='sc-key-comparison';comparison.dataset.keyComparison='';comparison.setAttribute('aria-label','キー・カポの変更前と変更後');
   const header=node('tr',undefined,node('thead',undefined,comparison));for(const text of ['','変更前','変更後']){const th=node('th',text,header);th.scope='col';}
   const cells={};const tableBody=node('tbody',undefined,comparison);for(const[name,label,value]of[['originalKey','原曲キー（実音）',project.songInfo.originalKey],['playKey','Playキー',view.songInfo.playKey],['capo','カポ',project.instrument.capo]]){const row=node('tr',undefined,tableBody),th=node('th',label,row);th.scope='row';node('td',value,row);cells[name]=node('td','',row);cells[name].dataset.keyAfter=name;}
   const advanced=node('details',undefined,body);node('summary','楽器の詳細',advanced);const maximum=input('楽器のフレット上限',project.instrument.maxAbsoluteFret??'','maxAbsoluteFret','number',advanced);maximum.min='0';maximum.max='36';maximum.placeholder='未登録';
   node('p','登録フォームも自動で更新します。「元に戻す」で変更前に戻せます。',body);
   // Manual key changes choose the pitch shift; capo changes retain the chosen Play key.
   let shapeShift=0;
   function nameAt(name,shift){const value=C.theory.transposeNote(name,shift);return shift%12===0?name:([...key.options].find(o=>C.theory.keyToSemitone(o.value)===C.theory.keyToSemitone(value))?.value||value);}
   function draft(){const n=capo.value.trim()?Number(capo.value):NaN;if(!Number.isInteger(n)||n<0||n>11)return null;const shift=choice.value==='transpose'?shapeShift+n-project.instrument.capo:0;return {capo:n,shift,originalKey:choice.value==='transpose'?nameAt(project.songInfo.originalKey,shift):project.songInfo.originalKey,playKey:nameAt(view.songInfo.playKey,project.instrument.capo-n+shift)};}
   function update(){const next=draft();key.disabled=choice.value!=='transpose';explanation.textContent=choice.value==='transpose'?'カポを上げると曲全体の音も上がり、Playキーは変わりません。':'曲の音の高さは変えず、カポに合わせてPlayキーを変えます。';if(next)key.value=next.originalKey;for(const name of Object.keys(cells))cells[name].textContent=next?next[name]:'—';apply.disabled=!next;}
   choice.addEventListener('change',update);capo.addEventListener('input',update);key.addEventListener('change',()=>{const n=Number(capo.value),oldPc=C.theory.keyToSemitone(project.songInfo.originalKey),newPc=C.theory.keyToSemitone(key.value);if(Number.isInteger(n)&&n>=0&&n<=11)shapeShift=((newPc-oldPc+18)%12)-6-(n-project.instrument.capo);update();});update();
   collect=()=>{const next=draft();if(!next)throw Error('カポは0〜11で指定してください');return {kind:'instrument',args:{mode:choice.value,originalKey:next.originalKey,capo:next.capo,...(choice.value==='transpose'?{transposeSemitones:next.shift}:{}),...(maximum.value.trim()?{maxAbsoluteFret:Number(maximum.value)}:{}),rebuildForms:true}};};
  }else if(mode==='chordPreset'||mode==='strumPreset'){
   current.classList.add('sc-batch-dialog');body.classList.add('sc-preset-dialog-body');
   mountPreview=()=>{collect=mountScorePresets({C,doc,node,body,status,apply,project,view,args,mode,navigate,createPreviewAudio,loadChordPicker,previewPaperOptions});};
  }else if(mode==='rhythm'){
   const value=C.model.getBasicStrumText(view),field=input('基本ストローク',typeof value==='string'?value:'','basicStrum');field.placeholder='例：↓・↓↑・↑↓↑';field.disabled=typeof value!=='string';node('p','↓ ダウン　↑ アップ　・ 休符　〜 伸ばす　x ミュート',body);
   const panel=doc.getElementById('studio-rhythm-panel');if(panel?.childElementCount)button('リズム素材を選ぶ',()=>{if(field.value!==(typeof value==='string'?value:'')){status.textContent='ストロークの変更を適用してから素材を選んでください。';return;}navigate('rhythmMaterials');});
   if(field.disabled){node('p','採用済みのリズム素材は「リズム素材を選ぶ」から変更できます。',body);apply.disabled=true;}
   collect=()=>({kind:'basicRhythm',args:{text:field.value}});
  }else if(mode==='rhythmMaterials'){
   const panel=doc.getElementById('studio-rhythm-panel');if(panel){parked={node:panel,parent:panel.parentNode,next:panel.nextSibling};body.appendChild(panel);}dismiss.textContent='閉じる';apply.hidden=true;
  }else if(mode==='sections'){
   let rows=project.sections.map(s=>({...s,count:project.bars.filter(b=>b.sectionId===s.id).length,isNew:false}));const list=node('div',undefined,body);list.className='sc-song-section-list';
   let clipboard=null;
   const parts=new Map();
   const controls=node('fieldset',undefined,body);node('legend','貼り付ける内容',controls);
   for(const [key,title] of [['chords','コード'],['strum','ストローク'],['melody','メロディ'],['lyrics','歌詞']]){
    const label=node('label',undefined,controls),check=node('input',undefined,label);
    check.type='checkbox';check.checked=true;parts.set(key,check);label.append(title);
   }
   button('＋ セクションを追加',()=>{rows.push({id:C.model.schema2.newId(),name:'新しいセクション',count:4,isNew:true});paint();});
   const paper=node('div',undefined,body);paper.className='sc-section-preview';
   function preview(){
    try{
     const draft=C.structureOperations.previewSections(project,rows,C.model.schema2);
     C.sheetRenderer.render(draft,paper,{...previewPaperOptions(draft),readOnly:true,editableSlots:false});
     C.localPaperLayout?.apply(paper);apply.disabled=false;status.textContent='';
    }catch(error){apply.disabled=true;status.textContent=error.message;}
   }
   function paint(){
    list.replaceChildren();
    rows.forEach((s,i)=>{
     const row=node('div',undefined,list);row.className='sc-song-section-row';
     const name=input('名前',s.name,'section-'+s.id,'text',row);name.oninput=()=>{s.name=name.value;preview();};
     node('span',s.count+'小節',row);
     button('＋ 小節',()=>{s.count++;paint();},row);
     for(const [d,text] of [[-1,'↑'],[1,'↓']]){
      const move=button(text,()=>{[rows[i],rows[i+d]]=[rows[i+d],rows[i]];paint();},row);
      move.disabled=i+d<0||i+d>=rows.length;move.setAttribute('aria-label',s.name+(d<0?'を前へ':'を後ろへ'));
     }
     button('コピー',()=>{clipboard=structuredClone(s);paint();},row);
     const paste=button('後ろに貼り付け',()=>{
      const selected=[...parts].filter(([k,c])=>c.checked&&(!clipboard.parts||clipboard.parts.includes(k))).map(([k])=>k);
      rows.splice(i+1,0,{id:C.model.schema2.newId(),isNew:true,name:clipboard.name+' コピー',count:clipboard.count,
       copyFrom:clipboard.copyFrom||clipboard.id,parts:selected});paint();
     },row);paste.disabled=!clipboard;
     const remove=button('削除',()=>{if(window.confirm('セクション「'+s.name+'」と中の'+s.count+'小節を削除しますか？')){rows.splice(i,1);paint();}},row);remove.disabled=rows.length<=1;
    });preview();
   }
   mountPreview=paint;
   collect=()=>({kind:'songInfo',args:{values:{},sections:rows}});
  }else{
   const title=input('曲名',project.songInfo.title,'title'),artist=input('アーティスト名',project.songInfo.artist,'artist'),bpm=input('BPM',project.songInfo.bpm,'bpm','number');bpm.min='20';bpm.max='400';
   const meterLabel=node('label',undefined,body);node('span','拍子',meterLabel);
   const meter=node('select',undefined,meterLabel);meter.dataset.scoreField='timeSignature';meter.setAttribute('aria-label','拍子');
   for(const beats of [4,3]){const option=node('option',beats+'/4',meter);option.value=String(beats);}
   meter.value=String(project.songInfo.timeSignature.beats);
   collect=()=>({kind:'songInfo',args:{values:{title:title.value,artist:artist.value,bpm:Number(bpm.value),
    timeSignature:{beats:Number(meter.value),beatUnit:4}}}});
  }
  dismiss.addEventListener('click',()=>current.close());apply.addEventListener('click',commit);
  let applyWasDisabled=false;current.addEventListener('compositionstart',()=>{composing=true;applyWasDisabled=apply.disabled;apply.disabled=true;});current.addEventListener('compositionend',e=>{composing=false;apply.disabled=applyWasDisabled;if(mode==='chordPreset')e.target.dispatchEvent(new Event('input',{bubbles:true}));});
  current.addEventListener('keydown',e=>{e.stopPropagation();if(e.isComposing||composing)return;if(e.key==='Escape'){e.preventDefault();current.close();}else if(e.key==='Enter'&&mode!=='chordPreset'&&mode!=='strumPreset'&&e.target.matches('input:not([type=checkbox])')){e.preventDefault();commit();}});
  current.addEventListener('close',()=>{if(parked){parked.parent.insertBefore(parked.node,parked.next?.parentNode===parked.parent?parked.next:null);parked=null;}if(dialog===current)dialog=null;current.remove();closed();if(previous?.isConnected)previous.focus({preventScroll:true});});
  doc.getElementById('screen-sheet-cruise').appendChild(current);bindOutsideDismiss(current,{close,canClose:()=>!applying});current.showModal();mountPreview?.();const initial=current.querySelector('[data-preview-play="score"]')||current.querySelector('input:not([type=checkbox]),select');initial?.focus({preventScroll:true});if(args.selectTitle&&initial?.dataset.scoreField==='title')initial.select();
 }
 return {open,close,get isOpen(){return !!dialog?.open&&!applying;}};
}
