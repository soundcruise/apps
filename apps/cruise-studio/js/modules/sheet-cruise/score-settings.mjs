// Transient editors for the active Project. No storage or account access.
export function createScoreSettings({C,document:doc,getSession,canEdit,execute,changed,closed=()=>{}}){
 let dialog=null,applying=false,previous=null,parked=null;
 const node=(tag,text,parent)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;if(parent)parent.appendChild(el);return el;};
 function close(){if(dialog)dialog.close();}
 function open(mode,args={}){
  if(dialog||!canEdit())return;
  const owner=getSession(),frame=C.structureOperations.capture(owner),project=owner.workingSnapshot(),view=C.model.toStructureView(project),titles={settings:'曲の設定',inline:'譜面を編集',slot:'空き枠',instrument:'キー・カポ',rhythm:'基本ストローク',rhythmMaterials:'リズム素材'};
  previous=doc.activeElement;dialog=node('dialog');dialog.className='sc-song-dialog';dialog.dataset.scoreDialog=mode;dialog.setAttribute('aria-label',titles[mode]);
  const current=dialog,head=node('header',undefined,current);node('h2',titles[mode],head);const dismiss=node('button','キャンセル',head);dismiss.type='button';dismiss.dataset.scoreCancel='';
  const body=node('div',undefined,current),status=node('p','',current);status.setAttribute('role','status');status.dataset.scoreStatus='';
  const foot=node('footer',undefined,current),apply=node('button',mode==='inline'?'確定':'適用',foot);apply.type='button';apply.dataset.scoreApply='';apply.className='btn-primary';
  let collect=()=>null,composing=false;
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
   node('p','カポの変更では音の高さを保ちます。曲全体の音を変える場合は「移調」を選んでください。',body);
   const modeLabel=node('label',undefined,body);node('span','変更方法',modeLabel);const choice=node('select',undefined,modeLabel);choice.dataset.scoreField='keyMode';for(const[v,t]of[['preserve','実音を保つ'],['transpose','曲全体を移調']]){const o=node('option',t,choice);o.value=v;}
   const keyLabel=node('label',undefined,body);node('span','原曲キー',keyLabel);const key=node('select',undefined,keyLabel);key.dataset.scoreField='originalKey';for(const name of ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B']){const o=node('option',name,key);o.value=name;}if(![...key.options].some(o=>o.value===project.songInfo.originalKey)){const o=node('option',project.songInfo.originalKey,key);o.value=project.songInfo.originalKey;}key.value=project.songInfo.originalKey;key.disabled=true;
   const capo=input('カポ',project.instrument.capo,'capo','number');capo.min='0';capo.max='11';const maximum=input('楽器のフレット上限',project.instrument.maxAbsoluteFret??'','maxAbsoluteFret','number');maximum.min='0';maximum.max='36';maximum.placeholder='未登録';
   const info=node('p','',body);node('p','変更に合わせて登録フォームを自動で更新します。元に戻すで以前のフォームへ戻せます。',body);
   const update=()=>{key.disabled=choice.value!=='transpose';const oldPc=C.theory.keyToSemitone(project.songInfo.originalKey),newPc=choice.value==='transpose'?C.theory.keyToSemitone(key.value):oldPc,delta=((newPc-oldPc+18)%12)-6;info.textContent='演奏キー：'+C.theory.transposeNote(view.songInfo.playKey,project.instrument.capo-Number(capo.value)+delta);};choice.addEventListener('change',update);key.addEventListener('change',update);capo.addEventListener('input',update);update();
   collect=()=>({kind:'instrument',args:{mode:choice.value,originalKey:key.value,capo:Number(capo.value),...(maximum.value.trim()?{maxAbsoluteFret:Number(maximum.value)}:{}),rebuildForms:true}});
  }else if(mode==='rhythm'){
   const value=C.model.getBasicStrumText(view),field=input('基本ストローク',typeof value==='string'?value:'','basicStrum');field.placeholder='例：↓・↓↑・↑↓↑';field.disabled=typeof value!=='string';node('p','↓ ダウン　↑ アップ　・ 休符　〜 伸ばす　x ミュート',body);
   const panel=doc.getElementById('studio-rhythm-panel');if(panel?.childElementCount)button('リズム素材を選ぶ',()=>{if(field.value!==(typeof value==='string'?value:'')){status.textContent='ストロークの変更を適用してから素材を選んでください。';return;}navigate('rhythmMaterials');});
   if(field.disabled){node('p','採用済みのリズム素材は「リズム素材を選ぶ」から変更できます。',body);apply.disabled=true;}
   collect=()=>({kind:'basicRhythm',args:{text:field.value}});
  }else if(mode==='rhythmMaterials'){
   const panel=doc.getElementById('studio-rhythm-panel');if(panel){parked={node:panel,parent:panel.parentNode,next:panel.nextSibling};body.appendChild(panel);}dismiss.textContent='閉じる';apply.hidden=true;
  }else{
   const tabs=node('div',undefined,body);tabs.className='sc-song-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','曲の設定項目');
   const info=node('div',undefined,body),sections=node('div',undefined,body);info.dataset.songTab='info';sections.dataset.songTab='sections';info.id='sc-song-info-panel';sections.id='sc-song-sections-panel';for(const panel of [info,sections])panel.setAttribute('role','tabpanel');
   function tab(name){info.hidden=name!=='info';sections.hidden=name!=='sections';tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.songTab===name)));}
   for(const[name,text]of[['info','曲情報'],['sections','セクション']]){const b=button(text,()=>tab(name),tabs);b.dataset.songTab=name;b.setAttribute('role','tab');b.setAttribute('aria-controls',name==='info'?info.id:sections.id);}tab(args.tab||'info');
   const title=input('曲名',project.songInfo.title,'title','text',info),artist=input('アーティスト名',project.songInfo.artist,'artist','text',info),bpm=input('BPM',project.songInfo.bpm,'bpm','number',info);bpm.min='20';bpm.max='400';
   function other(next){if(title.value!==project.songInfo.title||artist.value!==project.songInfo.artist||Number(bpm.value)!==project.songInfo.bpm||JSON.stringify(rows.map(s=>[s.id,s.name]))!==JSON.stringify(project.sections.map(s=>[s.id,s.name]))){status.textContent='曲情報の変更を適用してから、次の設定を開いてください。';return;}navigate(next);}
   button('キー・カポ…',()=>other('instrument'),info);button('基本ストローク…',()=>other('rhythm'),info);
   let rows=project.sections.map(s=>({...s,count:project.bars.filter(b=>b.sectionId===s.id).length,isNew:false}));const list=node('div',undefined,sections);list.className='sc-song-section-list';
   function paint(){list.replaceChildren();rows.forEach((s,i)=>{const row=node('div',undefined,list);row.className='sc-song-section-row';const name=input('名前',s.name,'section-'+s.id,'text',row);name.addEventListener('input',()=>s.name=name.value);node('span',s.count+'小節',row);for(const[d,text]of[[-1,'↑'],[1,'↓']]){const move=button(text,()=>{[rows[i],rows[i+d]]=[rows[i+d],rows[i]];paint();},row);move.disabled=i+d<0||i+d>=rows.length;move.setAttribute('aria-label',s.name+(d<0?'を前へ':'を後ろへ'));}const remove=button('削除',()=>{if(!window.confirm('セクション「'+s.name+'」と中の'+s.count+'小節を削除しますか？'))return;rows.splice(i,1);paint();},row);remove.disabled=rows.length<=1;});}
   button('＋ セクションを追加',()=>{rows.push({id:C.model.schema2.newId(),name:'新しいセクション',count:4,isNew:true});paint();},sections);paint();
   collect=()=>({kind:'songInfo',args:{values:{title:title.value,artist:artist.value,bpm:Number(bpm.value)},sections:rows.map(s=>({id:s.id,name:s.name,isNew:s.isNew}))}});
  }
  dismiss.addEventListener('click',()=>current.close());apply.addEventListener('click',commit);
  current.addEventListener('compositionstart',()=>{composing=true;apply.disabled=true;});current.addEventListener('compositionend',()=>{composing=false;apply.disabled=false;});
  current.addEventListener('keydown',e=>{e.stopPropagation();if(e.isComposing||composing)return;if(e.key==='Escape'){e.preventDefault();current.close();}else if(e.key==='Enter'&&e.target.matches('input:not([type=checkbox])')){e.preventDefault();commit();}});
  current.addEventListener('close',()=>{if(parked){parked.parent.insertBefore(parked.node,parked.next?.parentNode===parked.parent?parked.next:null);parked=null;}if(dialog===current)dialog=null;current.remove();closed();if(previous?.isConnected)previous.focus({preventScroll:true});});
  doc.getElementById('screen-sheet-cruise').appendChild(current);current.showModal();const initial=current.querySelector('input:not([type=checkbox]),select');initial?.focus({preventScroll:true});if(args.selectTitle&&initial?.dataset.scoreField==='title')initial.select();
 }
 return {open,close,get isOpen(){return !!dialog?.open&&!applying;}};
}
