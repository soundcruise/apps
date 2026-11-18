import {createChordPicker} from './chord-picker.mjs';

// The picker writes only to this window's pattern. The score remains owned by OK.
export function presetChordCells({C,doc,host,read,write,project,play,preview,previewState,subscribePreview,closeAudio,notice}) {
    host.tabIndex=-1;
    const picker=createChordPicker(C,doc.defaultView.ChordCruise);
    const session={snapshotVersion:0,finishTextGroup(){},setInputPending(value){this.inputPending=value;}};
    const grid=doc.createElement('div');grid.className='sc-author-cell-grid';
    const toggle=doc.createElement('button');
    toggle.type='button';toggle.setAttribute('aria-label','コード・フォームを編集');
    const panel=doc.createElement('section');
    const toolbar=doc.createElement('div');toolbar.className='sc-author-cell-tools';
    const tools=doc.createElement('div');tools.className='sc-pattern-length-tools';
    const name=doc.createElement('strong');name.textContent='コード';
    toolbar.append(name,toggle);host.append(toolbar,grid,panel,tools);
    let bar=0,tick=0,opened=false,drag=null,epoch=0,revision=0;
    function control(label,fn){const b=doc.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;toolbar.append(b);return b;}
    const add=control('＋ 小節',()=>{if(read().length<64)apply([...read(),[]]);});
    const remove=control('末尾の空小節を削除',()=>{if(read().length>1&&!read().at(-1).length)apply(read().slice(0,-1));});
    tools.append(add,remove);
    const history=[],future=[];
    function select(b,t){
        bar=b;tick=t;
        for(const input of grid.querySelectorAll('input')) input.toggleAttribute('data-active',+input.dataset.bar===bar && +input.dataset.tick===tick);
        renderPanel();
    }
    function apply(next){
        history.push(read());if(history.length>50)history.shift();
        future.length=0;session.snapshotVersion++;write(next);render();
    }
    function undo(redo=false){
        const from=redo?future:history,to=redo?history:future;
        if(!from.length)return;
        to.push(read());session.snapshotVersion++;write(from.pop());render();
    }
    function setEvent(symbol,material,playedStrings){
        if(symbol && !C.theory.parseBasicChordSymbol(symbol)){notice('コード名を確認してください');return false;}
        const old=read()[bar].find(e=>e.tick===tick);
        const event={...old,tick,symbol};
        if(old?.symbol!==symbol)delete event.form;
        if(material){
            const prior=old?.symbol===symbol && old?.form;
            const strings=material.snapshot.strings.filter(s=>s.kind==='note');
            const played=playedStrings || strings.filter(s=>!prior || prior.playedStrings.includes(s.string) ||
                prior.material.snapshot.strings.find(n=>n.string===s.string)?.kind!=='note').map(s=>s.string);
            event.form={playSymbol:symbol,material:structuredClone(material),playedStrings:played};
        }
        const next=read().map((events,b)=>b===bar?events.filter(e=>e.tick!==tick):events);
        if(symbol)next[bar].push(event);
        next[bar].sort((a,b)=>a.tick-b.tick);notice('');apply(next);return true;
    }
    function renderPanel() {
        const ticket=++epoch;
        panel._disposeOwnerChord?.();panel._disposeOwnerChord=null;panel.hidden=!opened;
        toggle.textContent=opened?'▲':'▼';toggle.setAttribute('aria-expanded',String(opened));
        if(!opened)return;
        try{
            const draft=project(),selected=draft.bars[bar];
            picker.mount(panel,{draftOnly:true,cellKey:[revision,bar,tick].join(':'),session,project:draft,bar:selected,tick,
                eligible:()=>!session.inputPending,current:()=>host.isConnected && !host.hidden && ticket===epoch,
                write:(symbol,m)=>setEvent(symbol,m), undo, progression:play,preview,previewState,subscribePreview,
                close:()=>{opened=false;closeAudio();renderPanel();}});
        }catch(error){notice(error.message);opened=false;renderPanel();}
    }
    toggle.onclick=()=>{opened=!opened;renderPanel();};
    function render(){
        grid.replaceChildren();add.disabled=read().length>=64;remove.disabled=read().length<2||!!read().at(-1).length;
        if(bar>=read().length){bar=0;tick=0;}
        read().forEach((events,b)=>{
            const measure=doc.createElement('div');measure.className='sc-author-measure';
            const label=doc.createElement('strong');label.textContent=(b+1)+'小節';measure.append(label);
            const row=doc.createElement('div');row.className='sc-author-beats';measure.append(row);grid.append(measure);
            row.style.gridTemplateColumns='repeat(4,minmax(0,1fr))';
            measure.style.minWidth='104px';
            for(let beat=0;beat<4;beat++){
                const slot=doc.createElement('div');slot.className='sc-pattern-slot';row.append(slot);
                const mark=doc.createElement('small');mark.textContent=(beat+1)+'拍';slot.append(mark);
                // Captured subdivisions stay at their exact onset inside their quarter-note box.
                const ticks=[...new Set([beat*480,...events.filter(e=>Math.floor(e.tick/480)===beat).map(e=>e.tick)])].sort((a,b)=>a-b);
                for(const t of ticks){
                    const e=events.find(e=>e.tick===t),input=doc.createElement('input');
                    input.type='text';input.defaultValue=e?.symbol||'';input.maxLength=24;input.autocomplete='off';
                    input.dataset.bar=b;input.dataset.tick=t;input.draggable=!!e;
                    if(e)input.dataset.presetChordCell='';
                    input.title=(b+1)+'小節 '+(t/480+1)+'拍のコード';
                    input.setAttribute('aria-label',input.title);
                    const eventBox=doc.createElement('div');eventBox.className='sc-pattern-onset';slot.append(eventBox);
                    input.toggleAttribute('data-active',b===bar&&t===tick);eventBox.append(input);
                    input.onfocus=()=>{if(b!==bar||tick!==t)select(b,t);input.select();};
                    input.onchange=()=>{
                        if(input.value.trim()===(e?.symbol||''))return;
                        bar=b;tick=t;
                        if(!setEvent(input.value.trim()))input.value=input.defaultValue;
                    };
                    input.onkeydown=ev=>{if(ev.key==='Enter'&&!ev.isComposing&&ev.keyCode!==229){ev.preventDefault();input.blur();}};
                    const handle=doc.createElement('span');
                    if(e){handle.className='sc-pattern-grip';handle.textContent='⠿';handle.draggable=true;handle.title='ドラッグでコードとフォームを移動';eventBox.append(handle);}
                    handle.ondragstart=input.ondragstart=ev=>{if(!e)return;drag={b,t,e};ev.dataTransfer.setData('text/plain',e.symbol);};
                    input.ondragover=ev=>{if(drag)ev.preventDefault();};
                    input.ondrop=ev=>{
                        ev.preventDefault();const source=drag;drag=null;
                        if(!source||source.b===b&&source.t===t)return;
                        const next=read().map((items,i)=>items.filter(item=>
                            !(i===b&&item.tick===t)&&!(i===source.b&&item===source.e)));
                        const moved={...source.e,tick:t};if(moved.durationTicks)moved.durationTicks=Math.min(moved.durationTicks,1920-t);
                        next[b].push(moved);next[b].sort((a,b)=>a.tick-b.tick);bar=b;tick=t;apply(next);
                    };
                    handle.ondragend=input.ondragend=()=>{drag=null;};
                }
            }
        });
        renderPanel();
    }
    host.addEventListener('keydown',e=>{
        if ((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!e.isComposing&&e.keyCode!==229 &&
            !(e.target.matches('input')&&e.target.value!==e.target.defaultValue&&e.target===doc.activeElement)){
            e.preventDefault();undo(e.shiftKey);
        }
    });
    return {render,reset(){revision++;opened=false;bar=tick=0;drag=null;history.length=future.length=0;renderPanel();}};
}
