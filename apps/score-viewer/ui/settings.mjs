import {MAX_PRESET_BYTES} from '../core/preset.mjs';
const fields=[['曲名','title','titleSize','showTitle',18,40],['アーティスト名','artist','artistSize','showArtist',10,26],['曲情報','meta','metaSize','showMeta',9,18],['セクション名','part','partSize','showParts',10,22],['小節番号','number','numberSize','showNumbers',8,16],['コード','chord','chordSize','chords',12,28],['フォーム',null,'formScale','forms',60,140],['ストローク','strum','strumSize','strum',10,24],['歌詞','lyrics','lyricsSize','lyrics',10,24],['メロディ（ドレミ）','doremi','doremiSize','doremi',10,24]];
const copy=value=>JSON.parse(JSON.stringify(value));
export function createViewerSettings({host,read,change,playback,configure,begin,finish,presetCodec,library,notify}){
    const doc=host.ownerDocument;let current=null;
    function close(){current?.close();}
    function shell(title,trigger){
        if(current)return null;const d=doc.createElement('dialog');current=d;d.className='sv-settings';d.setAttribute('aria-label',title);
        const previous=doc.activeElement,identity=read()?.document.viewerDocumentId+':'+read()?.document.revisionId;
        const node=(tag,text,parent=d)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;parent.append(e);return e;};
        const button=(text,parent=d)=>{const b=node('button',text,parent);b.type='button';return b;};
        const header=node('header');node('h2',title,header);
        const active=()=>current===d&&d.open&&read()?.document.viewerDocumentId+':'+read()?.document.revisionId===identity;
        d.addEventListener('keydown',e=>e.stopPropagation());
        d.addEventListener('close',()=>{if(current===d)current=null;d.onFinish?.(active());d.remove();if(previous?.isConnected)previous.focus({preventScroll:true});else trigger?.focus({preventScroll:true});});
        host.append(d);return {d,node,button,header,active};
    }
    function display(trigger){
        if(!read())return;const ui=shell('表示',trigger);if(!ui)return;
        const {d,node,button,header,active}=ui,backup=copy(read().presentation);let accepted=false;
        begin();d.onFinish=()=>{const same=read()?.document.viewerDocumentId+':'+read()?.document.revisionId===d.identity;if(!accepted&&same)change(backup);finish(accepted);};d.identity=read().document.viewerDocumentId+':'+read().document.revisionId;
        const syncs=[];
        const actions=node('div',undefined,header),cancel=button('キャンセル',actions),save=button('保存',actions);cancel.dataset.viewerDisplayCancel='';save.dataset.viewerDisplaySave='';cancel.onclick=()=>d.close();save.onclick=()=>{accepted=true;d.close();};
        node('p','このブラウザに保存します。元の譜面ファイルは変わりません。').className='sv-settings-note';
        const update=fn=>{if(!active())return;const value=copy(read().presentation);fn(value);change(value);};
        for(const [label,textKey,size,flag,min,max]of fields){
            const row=node('section');row.className='sv-display-row';const heading=node('div',undefined,row),check=node('input',undefined,heading),caption=node('span',label,heading);
            check.type='checkbox';check.dataset.viewerVisible=flag;check.setAttribute('aria-label',label+'を表示');
            const visible=()=>Object.hasOwn(read().presentation.layout,flag)?read().presentation.layout[flag]:(read().presentation.layout.appearance.visibility[flag]??read().document.score.notation.settings[({chords:'showChords',strum:'showStrum',lyrics:'showLyrics',doremi:'showDoremi'})[flag]])!==false;
            check.checked=visible();check.onchange=()=>update(p=>{if(Object.hasOwn(p.layout,flag))p.layout[flag]=check.checked;else p.layout.appearance.visibility[flag]=check.checked;});
            syncs.push(()=>check.checked=visible());
            if(textKey){const font=node('select',undefined,heading);font.setAttribute('aria-label',label+'の書体');for(const [value,title]of [['default','Aa 標準'],['gothic','ゴシック'],['serif','明朝'],['rounded','丸ゴシック'],['mono','等幅']]){const o=node('option',title,font);o.value=value;}
                font.value=read().presentation.layout.appearance.text[textKey]?.font||'default';font.onchange=()=>update(p=>{p.layout.appearance.text[textKey]={...p.layout.appearance.text[textKey],font:font.value};});
                const color=node('input',undefined,heading);color.type='color';color.setAttribute('aria-label',label+'の色');color.value=read().presentation.layout.appearance.text[textKey]?.color||(['chord','doremi'].includes(textKey)?'#c0392b':'#29251f');color.oninput=()=>update(p=>{p.layout.appearance.text[textKey]={...p.layout.appearance.text[textKey],color:color.value};});
                syncs.push(()=>{font.value=read().presentation.layout.appearance.text[textKey]?.font||'default';color.value=read().presentation.layout.appearance.text[textKey]?.color||(['chord','doremi'].includes(textKey)?'#c0392b':'#29251f');});
            }
            const range=node('input',undefined,row),output=node('output',read().presentation.layout[size]+(size==='formScale'?'%':'px'),row);range.type='range';range.min=min;range.max=max;range.value=read().presentation.layout[size];range.setAttribute('aria-label',label+(size==='formScale'?'の大きさ':'の文字サイズ'));range.dataset.viewerSize=size;
            range.oninput=()=>{output.textContent=range.value+(size==='formScale'?'%':'px');update(p=>p.layout[size]=Number(range.value));};
            syncs.push(()=>{range.value=read().presentation.layout[size];output.textContent=range.value+(size==='formScale'?'%':'px');});
        }
        const line=node('label','1行の小節数（元の配置）'),cols=node('select',undefined,line);cols.setAttribute('aria-label','1行の小節数');for(const value of [1,2,3,4]){const o=node('option',value+'小節',cols);o.value=value;}cols.value=read().presentation.layout.barsPerLine||4;cols.onchange=()=>update(p=>{p.flow='source';p.rows=[];p.layout.barsPerLine=Number(cols.value);});
        const presets=node('section');presets.className='sv-presets';node('h3','プリセット',presets);
        const select=node('select',undefined,presets);select.setAttribute('aria-label','表示プリセット');let records=[];
        async function refresh(){try{records=await library.listPresets();if(!active())return;select.replaceChildren();const o=node('option','プリセットを選ぶ',select);o.value='';for(const r of records){const option=node('option',r.name,select);option.value=r.name;}}catch{if(active())status.textContent='プリセットを読み込めませんでした。ファイルでの共有は利用できます。';}}
        function preview(preset){if(!active())return;change({...preset.presentation,rows:[]});syncs.forEach(fn=>fn());cols.value=read().presentation.layout.barsPerLine||4;status.textContent='「'+preset.name+'」をプレビュー中です。保存で反映、キャンセルで元に戻せます。';}
        select.onchange=()=>{const r=records.find(r=>r.name===select.value);if(!r)return;try{preview(presetCodec.decode(r.text,read().document.score));}catch{status.textContent='このプリセットを読み込めませんでした。';}};
        const create=button('新規保存',presets),nameRow=node('div',undefined,presets);nameRow.hidden=true;const name=node('input',undefined,nameRow);name.type='text';name.maxLength=40;name.setAttribute('aria-label','プリセット名');const add=button('保存',nameRow);create.onclick=()=>{nameRow.hidden=false;name.focus();};
        add.onclick=async()=>{if(!active())return;try{const file=presetCodec.encode(name.value,read().presentation,read().document.score);await library.savePreset(file.preset.name,file.text);if(!active())return;nameRow.hidden=true;await refresh();status.textContent='プリセットを保存しました。';}catch(error){status.textContent=error.name==='ConstraintError'?'同じ名前があります。別の名前を入力してください。':'保存できませんでした。名前や保存容量を確認してください。';}};
        const exportPreset=button('ファイルに書き出す',presets),importPreset=button('ファイルから読み込む',presets),input=node('input',undefined,presets);input.hidden=true;input.type='file';input.accept='.cruise-view-preset.json,application/json';input.dataset.viewerPresetFile='';
        exportPreset.dataset.viewerPresetExport='';importPreset.dataset.viewerPresetImport='';
        exportPreset.onclick=()=>{if(!active())return;try{const file=presetCodec.encode(name.value.trim()||select.value||'表示プリセット',read().presentation,read().document.score),url=URL.createObjectURL(new Blob([file.text],{type:'application/json'})),a=doc.createElement('a');a.href=url;a.download='display.cruise-view-preset.json';doc.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='表示プリセットを書き出しました。';}catch{status.textContent='書き出せませんでした。プリセット名を確認してください。';}};
        importPreset.onclick=()=>input.click();input.onchange=async()=>{const file=input.files[0];input.value='';if(!file)return;try{if(file.size>MAX_PRESET_BYTES)throw Error();const bytes=new Uint8Array(await file.arrayBuffer());if(active())preview(presetCodec.decode(bytes,read().document.score));}catch{if(active())status.textContent='表示プリセットを読み込めませんでした。現在の表示は保持しています。';}};
        const status=node('p','',presets);status.setAttribute('role','status');status.dataset.viewerPresetStatus='';
        d.showModal();void refresh();cancel.focus();
    }
    function audio(trigger){
        if(!read())return;const ui=shell('音設定',trigger);if(!ui)return;const {d,node,button,header,active}=ui;
        const help=button('?',header);help.setAttribute('aria-label','音設定の説明');help.setAttribute('aria-expanded','false');const done=button('完了',header);done.onclick=()=>d.close();
        const explanation=node('p','コード・メロディ・拍音は別々に音量を変えられます。0%で消音です。表示を隠しても音は消えません。カウントインは明示的な開始前の1小節で、一時停止からの再開では繰り返しません。設定はこのブラウザだけに保存します。');explanation.hidden=true;help.onclick=()=>{explanation.hidden=!explanation.hidden;help.setAttribute('aria-expanded',String(!explanation.hidden));};
        for(const [key,label]of [['chords','コード'],['melody','メロディ'],['metronome','メトロノーム・カウントイン']]){const row=node('label',label),range=node('input',undefined,row),out=node('output',playback().settings.mix[key]+'%',row);range.type='range';range.min=0;range.max=100;range.value=playback().settings.mix[key];range.dataset.viewerVolume=key;range.setAttribute('aria-label',label+'の音量');range.oninput=()=>{if(active()){out.textContent=range.value+'%';configure({mix:{...playback().settings.mix,[key]:Number(range.value)}});}};}
        for(const [key,label]of [['countIn','カウントイン'],['metronome','メトロノーム']]){const row=node('label',label),check=node('input',undefined,row);check.type='checkbox';check.checked=playback().settings[key];check.dataset.viewerPlayback=key;check.onchange=()=>{if(active())configure({[key]:check.checked});};}
        const reset=button('原曲のテンポに戻す');reset.dataset.viewerOriginalTempo='';reset.onclick=()=>{if(active())configure({bpm:read().document.score.songInfo.bpm});};
        reset.disabled=['loading','counting'].includes(playback().phase);
        d.showModal();done.focus();
    }
    return Object.freeze({display,audio,close,get isOpen(){return !!current;}});
}
