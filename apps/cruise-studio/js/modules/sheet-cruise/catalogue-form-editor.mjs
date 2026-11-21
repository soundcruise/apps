import {guardDraft} from './draft-history.mjs';
import {bindOutsideDismiss} from '../score-ui.mjs';

// Each picker write updates this dialog's draft. Only Apply touches the real session.
export function buildCatalogueEditor(dialog,{project,entry,ids,positions,picker,schema,play,stop,previewState,subscribePreview,progression,apply}){
    const doc=dialog.ownerDocument,capo=project.instrument.capo;
    const original=project.materials.forms.find(form=>form.id===entry.materialId);
    const barIndex=project.bars.findIndex(bar=>bar.chords.some(event=>event.id===entry.eventId));
    const selected=new Set(ids),draftMaterialId=schema.newId();
    const initial={symbol:entry.symbol,material:null};
    let draft=initial,activeMount=0,closed=false;
    const history=[],future=[],formEntry={unopened:true};
    const session={snapshotVersion:0,finishTextGroup(){},setInputPending(value){this.inputPending=value;}};

    function node(tag,text,parent=dialog){
        const element=doc.createElement(tag);
        if(text!==null)element.textContent=text;
        parent.append(element);return element;
    }
    const title=node('h2','コードとフォームの一括編集');
    dialog.setAttribute('aria-label',title.textContent);
    const locations=node('details',null);
    node('summary','対象の'+positions.length+'箇所を確認',locations);
    node('p',positions.join('、'),locations);
    const name=node('input',null,node('label',capo?'コード名（Playキー）':'コード名'));
    name.maxLength=64;
    const panel=node('section',null),notice=node('p','');notice.setAttribute('role','status');
    const footer=node('footer',null),cancel=node('button','キャンセル',footer),save=node('button',positions.length+'箇所に反映',footer);
    const discard=guardDraft(dialog,()=>hasChanges()||name.value.trim()!==playName());
    cancel.onclick=discard;
    save.onclick=()=>{
        if(!commitName()||save.disabled||session.inputPending)return;
        const result=apply(draft.symbol,draft.material,draft.range);
        if(!result.ok)notice.textContent=result.error||'一括変更できませんでした。';
    };
    function commitName(){
        const value=name.value.trim(),symbol=schema.chord(value,capo);
        if(!symbol){notice.textContent='コード名を確認してください。';name.focus();return false;}
        if(value!==playName())change({...draft,symbol});
        return true;
    }
    function hasChanges(){return draft.symbol!==initial.symbol||!!draft.material||draft.range!==undefined;}
    function playName(){return schema.chord(draft.symbol,-capo)??draft.symbol;}
    name.oninput=()=>{save.disabled=!name.value.trim()||(name.value.trim()===playName()&&!hasChanges());};
    name.onchange=commitName;
    name.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();if(commitName())name.blur();}};
    function change(next){
        history.push(draft);if(history.length>50)history.shift();
        future.length=0;draft=next;render();
    }
    function undo(redo){
        const from=redo?future:history,to=redo?history:future;
        if(from.length){to.push(draft);draft=from.pop();render();}
    }
    function render(){
        const ticket=++activeMount,scroll=dialog.scrollTop;
        const boardScroll=panel.shadowRoot?.querySelector('#cc-fretboard-host .cc-fb-scroll')?.scrollLeft;
        panel._disposeOwnerChord?.();
        session.snapshotVersion++;notice.textContent='';name.value=playName();
        save.disabled=!hasChanges();
        // Project the group's pending edit into its first measure for audition.
        const sourceBar=project.bars[barIndex],bar={...sourceBar,chords:sourceBar.chords.map(event=>selected.has(event.id)?{...event,symbol:draft.symbol}:event)};
        const bars=project.bars.slice();bars[barIndex]=bar;
        const source=draft.material??original;
        const material={...source,id:draftMaterialId,provenance:{...source.provenance,sourceSymbol:draft.symbol}};
        if(draft.range!==undefined){
            material.snapshot={...material.snapshot};
            if(draft.range)material.snapshot.displayRange=draft.range;else delete material.snapshot.displayRange;
        }
        const bindings=project.performance.formBindings.map(binding=>{
            if(!selected.has(binding.chordEventId)||(!draft.material&&binding.chordEventId!==entry.eventId))return binding;
            const playedStrings=draft.material?material.snapshot.strings.filter(n=>n.kind==='note').map(n=>n.string):binding.playedStrings;
            return {...binding,materialId:draftMaterialId,playedStrings};
        });
        const previewProject={...project,bars,materials:{...project.materials,forms:[...project.materials.forms,material]},
            performance:{...project.performance,formBindings:bindings}};
        const event=bar.chords.find(event=>event.id===entry.eventId);
        const current=()=>!closed&&ticket===activeMount&&dialog.open;
        picker.mount(panel,{draftOnly:true,session,formEntry,project:previewProject,
            bar,tick:event.onsetTick,eventId:event.id,
            current,eligible:()=>current()&&!session.inputPending,
            write:(name,form)=>{
                const symbol=schema.chord(name,capo);
                if(!symbol)return false;
                change(form?{symbol,material:form}:{...draft,symbol});return true;
            },
            writeRange(range){
                const previous=(draft.material??original).snapshot.displayRange??null;
                change({...draft,range:range?.min===previous?.min&&range?.max===previous?.max?undefined:range});
                return true;
            },
            close:discard,undo,preview:play,previewState,subscribePreview,
            progression:()=>progression(previewProject,barIndex)
        });
        const board=panel.shadowRoot?.querySelector('#cc-fretboard-host .cc-fb-scroll');
        if(board&&Number.isFinite(boardScroll))board.scrollLeft=boardScroll;
        dialog.scrollTop=scroll;
    }
    dialog.addEventListener('close',()=>{closed=true;panel._disposeOwnerChord?.();stop();},{once:true});
    dialog.addEventListener('keydown',event=>{
        event.stopPropagation();
        if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.altKey||!(event.ctrlKey||event.metaKey))return;
        const key=event.key.toLowerCase();
        if(key==='s')event.preventDefault();
        if(key==='z'&&!session.inputPending&&!event.target.closest('input,textarea,[contenteditable]')){
            event.preventDefault();undo(event.shiftKey);
        }
    });
    bindOutsideDismiss(dialog,{close:discard});render();
}
