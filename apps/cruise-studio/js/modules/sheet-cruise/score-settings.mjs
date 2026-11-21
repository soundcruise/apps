import {mountScorePresets} from './score-presets.mjs';
import {bindOutsideDismiss,bindScoreZoom} from '../score-ui.mjs';
// Transient editors for the active Project. No storage or account access.
export function createScoreSettings({C,document:doc,getSession,canEdit,execute,changed,createPreviewAudio,loadChordPicker,previewPaperOptions,closed=()=>{}}){
 function zoomablePreview(paper){
    let zoom=1;
    const page=()=>paper.querySelector('.sheet-page');
    function fit(){
        const sheet=page();
        if(sheet?.offsetWidth&&paper.clientWidth)sheet.style.zoom=String(zoom*Math.min(1,paper.clientWidth/sheet.offsetWidth));
    }
    bindScoreZoom(paper,{read:()=>zoom,write:value=>{zoom=value;fit();},paper:page});
    const observer=new ResizeObserver(fit);
    observer.observe(paper);
    paper.closest('dialog').addEventListener('close',()=>observer.disconnect(),{once:true});
    return fit;
 }
 let dialog=null,applying=false,previous=null,parked=null;
 const node=(tag,text,parent)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;if(parent)parent.appendChild(el);return el;};
 function close(){if(dialog)dialog.close();}
 function open(mode,args={}){
  if(dialog||!canEdit())return;
  const owner=getSession(),frame=C.structureOperations.capture(owner),project=owner.workingSnapshot(),view=C.model.toStructureView(project),titles={settings:args.newSong?'新しい曲を作成':'曲情報',sections:'セクション編集',inline:'譜面を編集',slot:'空き枠',instrument:'キー・カポ',chordPreset:'コード一括入力',strumPreset:'ストローク一括入力',rhythm:'基本ストローク',rhythmMaterials:'リズム素材'};
  previous=args.returnFocus||doc.activeElement;previous=previous?.closest('.sc-toolbar-menu')?.querySelector(':scope > summary')||previous;dialog=node('dialog');dialog.className='sc-song-dialog';dialog.dataset.scoreDialog=mode;dialog.setAttribute('aria-label',titles[mode]);
  const current=dialog,head=node('header',undefined,current);node('h2',titles[mode],head);const dismiss=node('button','キャンセル',head);dismiss.type='button';dismiss.dataset.scoreCancel='';
  const body=node('div',undefined,current),status=node('p','',current);status.setAttribute('role','status');status.dataset.scoreStatus='';
  const apply=node('button',mode==='inline'?'確定':'適用',head);apply.type='button';apply.dataset.scoreApply='';apply.className='btn-primary';
  let collect=()=>null,mountPreview,keyEntry,composing=false,navigating=false;
  function input(label,value,key,type='text',parent=body){const wrap=node('label',undefined,parent);node('span',label,wrap);const field=node(type==='textarea'?'textarea':'input',undefined,wrap);if(type!=='textarea')field.type=type;field.value=value;field.dataset.scoreField=key;return field;}
  function button(text,fn,parent=body){const b=node('button',text,parent);b.type='button';b.addEventListener('click',fn);return b;}
  function wholeScoreTools(parent){
   const tools=node('fieldset',undefined,parent);tools.className='sc-song-tools';
   node('legend','譜面の全体編集',tools);
   const actions=node('div',undefined,tools);actions.className='sc-song-tool-buttons';
   for(const child of ['sections','chordPreset','strumPreset']){
    const link=button(titles[child],()=>commit(child),actions);
    if(child===mode){link.disabled=true;link.setAttribute('aria-current','page');}
   }
   return tools;
  }
  function navigate(next){navigating=true;current.addEventListener('close',()=>open(next,{parentCard:args.parentCard}),{once:true});current.close();}
  function commit(next,sectionId){
   if(composing)return;const now=getSession();if(now!==owner||!C.structureOperations.isCurrent(frame,now)){status.textContent='編集対象が変わりました。入力を保持しています。開き直してください。';return;}
   try{const request=collect();if(!request)return;applying=true;let result;try{if(!canEdit())throw Error('入力・保存・競合の状態を確認してください');result=execute(request.kind,request.args,frame);}finally{applying=false;}
    if(!result.ok){status.textContent=result.error||'変更を適用できませんでした';return;}request.onApplied?.();
    if(typeof next==='string'){
     navigating=true;
     const parentCard=mode==='sections'?args.parentCard:{...args,field:args.field==='instrument'?undefined:args.field,selectTitle:false};
     current.addEventListener('close',()=>open(next,{parentCard,barIds:args.barIds,sectionId}),{once:true});
    }
    current.close();changed({mode,previous:project,slot:args.slot});
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
   const modeLabel=node('label',undefined,body);node('span','何を変更しますか？',modeLabel);const choice=node('select',undefined,modeLabel);choice.dataset.scoreField='keyMode';for(const[v,t]of[['preserve','曲の高さを保ってカポを変える'],['transpose','曲の高さを変える（移調）']]){const o=node('option',t,choice);o.value=v;}
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
   function update(){const next=draft();key.disabled=choice.value!=='transpose';explanation.textContent=choice.value==='transpose'?'歌いやすい高さにするには、原曲キーを選びます。カポだけを動かすと、押さえるコードは同じまま曲の高さが変わります。':'カポの位置を選ぶと、同じ高さで演奏するためのPlayキー（押さえるコードのキー）が決まります。';if(next)key.value=next.originalKey;for(const name of Object.keys(cells))cells[name].textContent=next?next[name]:'—';apply.disabled=!next;}
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
   let selected=rows.find(row=>row.id===args.sectionId)?.id??rows[0].id,clipboard=null,dragged=null;
   const flow=node('nav',undefined,body);flow.className='sc-section-flow';flow.setAttribute('aria-label','セクションの流れ');
   const aside=node('aside',undefined,body);aside.append(list);
   body.className='sc-section-workspace';
   button('＋ セクションを追加',()=>{const item={id:C.model.schema2.newId(),name:'新しいセクション',count:4,isNew:true};rows.push(item);selected=item.id;paint();},aside);
   wholeScoreTools(aside);
   const paper=node('div',undefined,body);paper.className='sc-section-preview';
   const fitSectionPaper=zoomablePreview(paper);
   function scrollToSelected(behavior){
      const heading=Array.from(paper.querySelectorAll('.sheet-section-label')).find(el=>el.dataset.sectionId===selected);
      if(heading)paper.scrollBy({top:heading.getBoundingClientRect().top-paper.getBoundingClientRect().top-8,behavior});
   }
   function preview(){
    try{
     flow.replaceChildren();
     function selectSection(id){
      const from=paper.scrollTop;selected=id;paint();paper.scrollTop=from;
      scrollToSelected(matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth');
      flow.querySelector('[aria-pressed=true]')?.focus({preventScroll:true});
     }
     rows.forEach((row,i)=>{
      const group=node('span',undefined,flow);
      if(i)node('span','→ ',group).setAttribute('aria-hidden','true');
      const tab=button(row.name+' '+row.count+'小節',()=>selectSection(row.id),group);tab.setAttribute('aria-pressed',String(row.id===selected));
      tab.draggable=true;
      tab.ondragstart=e=>{dragged=row.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',row.id);};
      const after=e=>e.clientX>tab.getBoundingClientRect().left+tab.offsetWidth/2;
      tab.ondragover=e=>{if(dragged&&dragged!==row.id){e.preventDefault();tab.dataset.drop=after(e)?'after':'before';}};
      tab.ondragleave=()=>delete tab.dataset.drop;
      tab.ondragend=()=>{dragged=null;flow.querySelectorAll('[data-drop]').forEach(b=>delete b.dataset.drop);};
      tab.ondrop=e=>{
       e.preventDefault();if(!dragged||dragged===row.id)return;
       const source=rows.splice(rows.findIndex(r=>r.id===dragged),1)[0];
       rows.splice(rows.indexOf(row)+Number(after(e)),0,source);
       dragged=null;selectSection(source.id);
      };
     });
     const draft=C.structureOperations.previewSections(project,rows,C.model.schema2);
     C.sheetRenderer.render(draft,paper,{...previewPaperOptions(draft),readOnly:true,editableSlots:false});
     C.localPaperLayout?.apply(paper);paper.classList.remove('sc-hide-parts');fitSectionPaper();
     for(const heading of paper.querySelectorAll('.sheet-section-heading')){
      const label=heading.querySelector('[data-section-id]'),row=rows.find(r=>r.id===label.dataset.sectionId);
      label.title='セクションを選択';label.tabIndex=0;label.setAttribute('role','button');
      label.setAttribute('aria-pressed',String(selected===row.id));
      label.onclick=()=>{selected=row.id;paint();};
      label.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();label.click();}};
      const plus=button('＋',()=>{selected=row.id;row.count++;paint();},heading);
      plus.setAttribute('aria-label',row.name+'の末尾に小節を追加');
      const minus=button('−',()=>{const last=draft.bars.filter(b=>b.sectionId===row.id).at(-1);
       const binding=draft.performance.barRhythms.find(r=>r.barId===last?.id);
       const rhythm=binding&&draft.materials.rhythms.find(m=>m.id===binding.materialId);
       const hasStroke=rhythm&&(rhythm.encoding!=='studio-strum-v1'||rhythm.snapshot.slots.length||rhythm.snapshot.leadingSustainTicks);
       const hasData=last&&(last.chords.length||last.lyrics.length||last.melody.length||hasStroke);
       if(!hasData||window.confirm(row.name+'の最後の小節を削除しますか？')){selected=row.id;row.count--;row.keep=Math.min(row.keep??row.count,row.count);paint();}},heading);
      minus.setAttribute('aria-label',row.name+'の最後の小節を削除');minus.disabled=row.count<=1;
     }
     for(const bar of paper.querySelectorAll('.sheet-bar[data-bar-number]')){
      const id=draft.bars[Number(bar.dataset.barNumber)-1].sectionId;
      bar.classList.toggle('sc-section-active',id===selected);bar.onclick=()=>{selected=id;paint();};
     }
     apply.disabled=false;status.textContent='';
    }catch(error){apply.disabled=true;status.textContent=error.message;}
   }
   function paint(){
    list.replaceChildren();const i=rows.findIndex(r=>r.id===selected),s=rows[i];
    const name=input('セクション名',s.name,'section-'+s.id,'text',list);name.oninput=()=>{s.name=name.value;preview();};
    const moves=node('div',undefined,list);moves.className='sc-section-command-row';
    for(const [d,text] of [[-1,'前へ移動'],[1,'後ろへ移動']]){
     const move=button(text,()=>{[rows[i],rows[i+d]]=[rows[i+d],rows[i]];paint();},moves);move.dataset.icon=d<0?'←':'→';move.setAttribute('aria-label',text);move.disabled=!rows[i+d];
    }
    const copies=node('div',undefined,list);copies.className='sc-section-command-row';
    button('コピー',()=>{clipboard=structuredClone(s);paint();},copies).dataset.icon='⧉';
    const paste=button('後ろに貼り付け',()=>{
     if(paste.getAttribute('aria-expanded')==='true'){panel.remove();paste.setAttribute('aria-expanded','false');return;}
     paste.setAttribute('aria-expanded','true');
     panel=node('fieldset');copies.after(panel);
     node('legend','貼り付ける内容',panel);
     node('small','コピー元　'+clipboard.name,panel).className='sc-paste-source';
     const parts=[];
     for(const [key,title] of [['chords','コード'],['strum','ストローク'],['melody','メロディ'],['lyrics','歌詞']]){
      const label=node('label',undefined,panel),check=node('input',undefined,label);
      check.type='checkbox';check.value=key;check.disabled=!!clipboard.parts&&!clipboard.parts.includes(key);
      check.checked=!check.disabled;label.append(title);parts.push(check);
     }
     button('キャンセル',()=>{paste.click();paste.focus();},panel);
     button('実行',()=>{
      const copy={...clipboard,id:C.model.schema2.newId(),isNew:true,name:clipboard.name+' コピー',copyFrom:clipboard.copyFrom||clipboard.id,parts:parts.filter(c=>c.checked).map(c=>c.value)};
      rows.splice(i+1,0,copy);selected=copy.id;paint();
      list.querySelector('input')?.focus();
     },panel).className='btn-primary';
    },copies);
    let panel;
    paste.disabled=!clipboard;paste.setAttribute('aria-expanded','false');
    const remove=button('セクションを削除',()=>{if(window.confirm(s.name+'と中の小節を削除しますか？')){rows.splice(i,1);selected=rows[Math.min(i,rows.length-1)].id;paint();}},list);
    remove.className='sc-section-delete';remove.disabled=rows.length===1;
    preview();
   }
   mountPreview=()=>{paint();if(args.sectionId)scrollToSelected('instant');};
   collect=()=>({kind:'songInfo',args:{values:{},sections:rows}});
  }else{
   body.className='sc-song-workspace';
   const form=node('aside',undefined,body),paper=node('div',undefined,body);paper.className='sc-song-preview';
   const fitSongPaper=zoomablePreview(paper);
   const title=input('曲名',project.songInfo.title,'title','text',form),artist=input('アーティスト名',project.songInfo.artist,'artist','text',form),bpm=input('BPM',project.songInfo.bpm,'bpm','number',form);bpm.min='20';bpm.max='400';
   const meterLabel=node('label',undefined,form);node('span','拍子',meterLabel);
   const meter=node('select',undefined,meterLabel);meter.dataset.scoreField='timeSignature';meter.setAttribute('aria-label','拍子');
   for(const beats of [4,3]){const option=node('option',beats+'/4',meter);option.value=String(beats);}
   meter.value=String(project.songInfo.timeSignature.beats);
   const keys=['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
   function keySelect(label,value){
    const wrap=node('label',undefined,form);node('span',label,wrap);
    const select=node('select',undefined,wrap);
    for(const name of new Set([...keys,project.songInfo.originalKey,view.songInfo.playKey]))node('option',name,select).value=name;
    select.value=value;return select;
   }
   const original=keySelect('原曲キー',project.songInfo.originalKey),playKey=keySelect('Playキー',view.songInfo.playKey);
   const pitch=name=>C.theory.keyToSemitone(name);
   let capo=project.instrument.capo;
   function updatePlayKeys(){
    playKey.replaceChildren();
    for(let position=0;position<=11;position++){
     const name=keys[(pitch(original.value)-position+12)%12];
     node('option',(position?position+'カポ':'カポなし')+' '+name,playKey).value=name;
    }
    playKey.selectedIndex=capo;
   }
   updatePlayKeys();
   const keyLink=button('移調・カポの変更前後を確認',()=>commit('instrument'),form);
   keyLink.className='sc-key-link';
   if(args.field==='instrument'){keyEntry=keyLink;keyLink.classList.add('sc-key-entry');}
   original.addEventListener('input',updatePlayKeys);
   playKey.addEventListener('input',()=>{capo=playKey.selectedIndex;});
   const keyChange=()=>original.value!==project.songInfo.originalKey||capo!==project.instrument.capo?
    {mode:'transpose',originalKey:original.value,capo}:undefined;
   collect=()=>({kind:'songInfo',args:{instrument:keyChange(),values:{title:title.value,artist:artist.value,bpm:Number(bpm.value),
    timeSignature:{beats:Number(meter.value),beatUnit:4}}}});
   const preview=()=>{
    const draft=structuredClone(project),values=collect().args.values;
    try{C.model.schema2.setMeter(draft,values.timeSignature);
     if(keyChange()){C.structureOperations.applyInstrument(draft,keyChange(),C.model.schema2,C.localChordForms?.reconcile);C.localChordForms?.reconcile(draft,project);}
     Object.assign(draft.songInfo,{title:values.title,artist:values.artist,bpm:values.bpm||project.songInfo.bpm});
     C.sheetRenderer.render(draft,paper,{...previewPaperOptions(draft),readOnly:true,editableSlots:false});
     for(const heading of paper.querySelectorAll('.sheet-section-label[data-section-id]')){
      const name=heading.textContent;
      heading.replaceChildren();
      button(name,()=>commit('sections',heading.dataset.sectionId),heading).title='セクション編集を開く';
     }
     C.localPaperLayout?.apply(paper);fitSongPaper();
     status.textContent='';
    }catch(err){status.textContent=err.message;}
   };
   form.addEventListener('input',preview);mountPreview=preview;
   wholeScoreTools(form);

  }
  dismiss.addEventListener('click',()=>current.close());apply.addEventListener('click',commit);
  let applyWasDisabled=false;current.addEventListener('compositionstart',()=>{composing=true;applyWasDisabled=apply.disabled;apply.disabled=true;});current.addEventListener('compositionend',e=>{composing=false;apply.disabled=applyWasDisabled;if(mode==='chordPreset')e.target.dispatchEvent(new Event('input',{bubbles:true}));});
  current.addEventListener('keydown',e=>{e.stopPropagation();if(e.isComposing||composing)return;if(e.key==='Escape'){e.preventDefault();current.close();}else if(e.key==='Enter'&&!args.newSong&&mode!=='chordPreset'&&mode!=='strumPreset'&&e.target.matches('input:not([type=checkbox])')){e.preventDefault();commit();}});
  current.addEventListener('close',()=>{if(parked){parked.parent.insertBefore(parked.node,parked.next?.parentNode===parked.parent?parked.next:null);parked=null;}if(dialog===current)dialog=null;current.remove();closed();if(previous?.isConnected)previous.focus({preventScroll:true});if(!navigating&&args.parentCard&&getSession()===owner)open('settings',args.parentCard);});
  doc.getElementById('screen-sheet-cruise').appendChild(current);bindOutsideDismiss(current,{close,canClose:()=>!applying});current.showModal();mountPreview?.();const initial=keyEntry||current.querySelector('[data-preview-play="score"]')||(mode==='settings'&&current.querySelector('[data-score-field="'+args.field+'"]'))||current.querySelector('input:not([type=checkbox]),select');initial?.focus({preventScroll:!keyEntry});if(args.selectTitle&&initial?.dataset.scoreField==='title')initial.select();
 }
 return {open,close,get isOpen(){return !!dialog?.open&&!applying;}};
}
