import {createPaperLayout} from '../../cruise-studio/js/modules/sheet-cruise/paper-layout.mjs';
import {addInteractionColors} from '../../cruise-studio/js/modules/sheet-cruise/paper-appearance.mjs';
import {METRONOME_SOUNDS} from '../../cruise-studio/js/modules/score-audio.mjs';
import {addCountInSupportOption,bindOutsideDismiss,bindPlaybackButton,syncPlaybackButton} from '../../cruise-studio/js/modules/score-ui.mjs';
import {MAX_PRESET_BYTES} from '../core/preset.mjs';
const copy=value=>JSON.parse(JSON.stringify(value));
export function createViewerSettings({host,read,change,playback,configure,toggle,begin,finish,presetCodec,library,notify,renderPreview,forms,createPreviewAudio,openScroll}){
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
        host.append(d);bindOutsideDismiss(d);return {d,node,button,header,active};
    }
    function display(trigger){
        if(current||!read())return;
        const initial=read(),score=initial.document.score,identity=initial.document.viewerDocumentId+':'+initial.document.revisionId,backup=copy(initial.presentation);
        const same=()=>read()?.document.viewerDocumentId+':'+read()?.document.revisionId===identity;
        const memory={scorePaperDisplayV2:{version:2,layout:{},rows:[],presets:[]}};
        const owner=createPaperLayout({storage:{getAppSetting:key=>memory[key],setAppSetting:(key,value)=>{memory[key]=value;return {ok:true};}},localPaperForms:forms},doc);
        owner.replacePresentation(score,backup);
        let d=null;
        const active=()=>current===d&&d?.open&&same();
        owner.onChange(()=>{if(active()){const {layout,rows}=owner.exportPresentation(score);change({...read().presentation,layout,rows});}});
        function mountPresets(parent){
            const node=(tag,text,target=parent)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;target.append(e);return e;};
            const button=(text,target=parent)=>{const b=node('button',text,target);b.type='button';return b;};
        const presets=parent;presets.classList.add('sv-presets');
        const select=node('select',undefined,presets);select.setAttribute('aria-label','表示プリセット');let records=[];
        async function refresh(){try{records=await library.listPresets();if(!active())return;select.replaceChildren();const o=node('option','プリセットを選ぶ',select);o.value='';for(const r of records){const option=node('option',r.name,select);option.value=r.name;}}catch{if(active())status.textContent='プリセットを読み込めませんでした。ファイルでの共有は利用できます。';}}
        function preview(preset){if(!active())return;owner.replacePresentation(score,{...preset.presentation,rows:[]});change({...read().presentation,zoom:preset.presentation.zoom,flow:preset.presentation.flow});status.textContent='「'+preset.name+'」をプレビュー中です。保存で反映、キャンセルで元に戻せます。';}
        select.onchange=()=>{const r=records.find(r=>r.name===select.value);if(!r)return;try{preview(presetCodec.decode(r.text,read().document.score));}catch{status.textContent='このプリセットを読み込めませんでした。';}};
        const create=button('新規保存',presets),nameRow=node('div',undefined,presets);nameRow.hidden=true;const name=node('input',undefined,nameRow);name.type='text';name.maxLength=40;name.setAttribute('aria-label','プリセット名');const add=button('保存',nameRow);create.onclick=()=>{nameRow.hidden=false;name.focus();};
        add.onclick=async()=>{if(!active())return;try{const file=presetCodec.encode(name.value,read().presentation,read().document.score);await library.savePreset(file.preset.name,file.text);if(!active())return;nameRow.hidden=true;await refresh();status.textContent='プリセットを保存しました。';}catch(error){status.textContent=error.name==='ConstraintError'?'同じ名前があります。別の名前を入力してください。':'保存できませんでした。名前や保存容量を確認してください。';}};
        const exportPreset=button('ファイルに書き出す',presets),importPreset=button('ファイルから読み込む',presets),input=node('input',undefined,presets);input.hidden=true;input.type='file';input.accept='.cruise-view-preset.json,application/json';input.dataset.viewerPresetFile='';
        exportPreset.dataset.viewerPresetExport='';importPreset.dataset.viewerPresetImport='';
        exportPreset.onclick=()=>{if(!active())return;try{const file=presetCodec.encode(name.value.trim()||select.value||'表示プリセット',read().presentation,read().document.score),url=URL.createObjectURL(new Blob([file.text],{type:'application/json'})),a=doc.createElement('a');a.href=url;a.download='display.cruise-view-preset.json';doc.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='表示プリセットを書き出しました。';}catch{status.textContent='書き出せませんでした。プリセット名を確認してください。';}};
        importPreset.onclick=()=>input.click();input.onchange=async()=>{const file=input.files[0];input.value='';if(!file)return;try{if(file.size>MAX_PRESET_BYTES)throw Error();const bytes=new Uint8Array(await file.arrayBuffer());if(active())preview(presetCodec.decode(bytes,read().document.score));}catch{if(active())status.textContent='表示プリセットを読み込めませんでした。現在の表示は保持しています。';}};
        const status=node('p','',presets);status.setAttribute('role','status');status.dataset.viewerPresetStatus='';
            void refresh();
        }
        begin();
        d=owner.open(host,{project:score,storageNote:'このブラウザに保存します。元の譜面ファイルは変わりません。',
            getVisibility:()=>{const s=score.notation.settings;return {chords:s.showChords!==false,strum:s.showStrum!==false,lyrics:s.showLyrics!==false,doremi:s.showDoremi!==false,timingGrid:s.showTimingGrid!==false,gridResolution:s.timingGridResolution===16?16:8,...read().presentation.layout.appearance.visibility};},
            renderSample:(paper,presentation)=>renderPreview?.(paper,presentation),createPreviewAudio,mountPresets,
            onClose:accepted=>{if(current===d)current=null;if(same()&&!accepted)change(backup);finish(accepted&&same());if(trigger?.isConnected)trigger.focus({preventScroll:true});}});
        current=d;if(!d){finish(false);return;}
        d.classList.add('sv-settings','sv-unified-display');d.setAttribute('aria-label','表示設定');
        d.querySelector('[data-layout-cancel]').dataset.viewerDisplayCancel='';d.querySelector('[data-layout-save]').dataset.viewerDisplaySave='';
        const aliases={showTitle:'titleSize',showArtist:'artistSize',showMeta:'metaSize',showParts:'partSize',showNumbers:'numberSize',chords:'chordSize',forms:'formScale',strum:'strumSize',lyrics:'lyricsSize',doremi:'doremiSize',formList:'formListScale'};
        for(const [flag,size]of Object.entries(aliases)){const row=d.querySelector('[data-layout-field="'+size+'"]');row.querySelector('input[type=checkbox]').dataset.viewerVisible=flag;row.querySelector('input[type=range]').dataset.viewerSize=size;}
    }
    function audio(trigger){
        if(!read())return;const ui=shell('音設定',trigger);if(!ui)return;const {d,node,button,header,active}=ui;d.classList.add('sv-audio-panel');
        const preview=button('▶ 再生',header);preview.dataset.viewerAudioPlay='';preview.className='sv-settings-play';bindPlaybackButton(preview,toggle);const help=button('?',header);help.setAttribute('aria-label','音設定の説明');help.setAttribute('aria-expanded','false');const done=button('完了',header);done.onclick=()=>d.close();
        const explanation=node('p','コード・メロディ・拍音は別々に音量を変えられます。0%で消音です。表示を隠しても音は消えません。カウントインは明示的な開始前の1小節で、一時停止からの再開では繰り返しません。設定はこのブラウザだけに保存します。');explanation.hidden=true;help.onclick=()=>{explanation.hidden=!explanation.hidden;help.setAttribute('aria-expanded',String(!explanation.hidden));};
        for(const [key,label]of [['chords','コード'],['melody','メロディ'],['metronome','メトロノーム・カウントイン']]){const row=node('label',label),range=node('input',undefined,row),out=node('output',playback().settings.mix[key]+'%',row);range.type='range';range.min=0;range.max=100;range.value=playback().settings.mix[key];range.dataset.viewerVolume=key;range.setAttribute('aria-label',label+'の音量');range.oninput=()=>{if(active()){out.textContent=range.value+'%';configure({mix:{...playback().settings.mix,[key]:Number(range.value)}});}};}
        for(const [key,label]of [['countIn','カウントイン'],['metronome','メトロノーム']]){const row=node('label',label),check=node('input',undefined,row);check.type='checkbox';check.checked=playback().settings[key];check.dataset.viewerPlayback=key;check.onchange=()=>{if(active())configure({[key]:check.checked});};}
        addCountInSupportOption(d);
        const toneLabel=node('label','メトロノームの音'),tone=node('select',undefined,toneLabel);toneLabel.className='score-metronome-tone';tone.setAttribute('aria-label','メトロノームの音');tone.dataset.metronomeSound='';for(const [id,text]of Object.entries(METRONOME_SOUNDS)){const o=node('option',text,tone);o.value=id;}tone.value=playback().settings.metronomeSound;tone.onchange=()=>{if(active())configure({metronomeSound:tone.value});};
        const sync=node('section');sync.className='sv-audio-sync';node('h3','音と棒の同期',sync);const syncLabel=node('label','音と棒の位置調整',sync),delay=node('input',undefined,syncLabel),delayValue=node('output','',syncLabel);delay.type='range';delay.min=-1000;delay.max=1000;delay.step=10;delay.value=playback().settings.visualDelayMs||0;delay.dataset.viewerDelay='';delay.setAttribute('aria-label','棒の表示タイミング');const refreshDelay=()=>delayValue.textContent=(Number(delay.value)>0?'+':'')+delay.value+' ms';refreshDelay();delay.oninput=()=>{if(active()){configure({visualDelayMs:Number(delay.value)});refreshDelay();}};const auto=button('自動に戻す',sync);auto.onclick=()=>{if(active()){delay.value=0;configure({visualDelayMs:0});refreshDelay();}};
        explanation.textContent+=' 音と棒に一定のずれが残る場合は「音と棒の同期」で表示だけを早めたり遅らせたりします。音のテンポは変わりません。自動に戻すと追加調整を解除します。';
        const reset=button('原曲のテンポに戻す');reset.dataset.viewerOriginalTempo='';reset.className='score-tempo-reset';reset.onclick=()=>{if(active())configure({bpm:read().document.score.songInfo.bpm});};
        reset.disabled=['loading','counting'].includes(playback().phase);
        if(openScroll){
            const link=button('自動スクロール設定');link.className='score-scroll-link';
            link.onclick=()=>{d.addEventListener('close',openScroll,{once:true});d.close();};
        }
        d.showModal();refreshAudio();done.focus();
    }
    function refreshAudio(){const b=current?.querySelector('[data-viewer-audio-play]');if(b)syncPlaybackButton(b,playback().phase);}
    return Object.freeze({display,audio,close,refresh:refreshAudio,get isOpen(){return !!current;}});
}
