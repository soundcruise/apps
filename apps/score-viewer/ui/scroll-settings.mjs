import {bindOutsideDismiss,bindPlaybackButton} from '../../cruise-studio/js/modules/score-ui.mjs';

export function createScrollSettings({host,read,change,toggle,playback,setTempo,horizontal,following,resume,playingLabel='Ⅱ 一時停止'}){
    const doc=host.ownerDocument;
    let dialog,refresh=()=>{};
    function open(){
        if(dialog){dialog.focus();return;}
        const d=doc.createElement('dialog');
        dialog=d;
        d.className='sv-settings sv-modeless sv-scroll-settings';
        d.dataset.viewerNonmodal='';
        d.setAttribute('aria-label','譜面の自動スクロール設定');
        function node(tag,text,parent=d){
            const el=doc.createElement(tag);
            if(text!==undefined)el.textContent=text;
            parent.append(el);
            return el;
        }
        function button(text,parent,run){
            const b=node('button',text,parent);b.type='button';b.onclick=run;return b;
        }
        function select(title,entries,key){
            const field=node('label',title,content),input=node('select',undefined,field);
            for(const [value,text] of entries)node('option',text,input).value=value;
            input.onchange=()=>change({[key]:input.value});
            return input;
        }
        const h=node('header');
        node('h2','自動スクロール設定',h);
        const help=button('?',h,()=>{
            note.hidden=!note.hidden;
            help.setAttribute('aria-expanded',String(!note.hidden));
        });
        help.setAttribute('aria-label','自動スクロール設定のヘルプ');
        help.setAttribute('aria-expanded','false');
        button('×',h,()=>d.close()).setAttribute('aria-label','閉じる');
        const note=node('p','「今の画面から流す」は、再生を押した位置から譜面が流れます。「演奏位置を追う」では、演奏中の行を置く位置を選べます。自分でスクロールしたら「スクロール再開」で再び流せます。');
        note.hidden=true;note.className='sv-settings-note';
        const autoLabel=node('label','自動スクロール'),auto=node('input',undefined,autoLabel);
        auto.type='checkbox';auto.dataset.autoScroll='';autoLabel.className='sv-auto-scroll';autoLabel.prepend(auto);
        auto.onchange=()=>change({enabled:auto.checked});
        const content=node('div');content.className='sv-scroll-content';
        const origin=select('スクロールの動き',[['score','演奏位置を追う'],['viewport','今の画面から流す']],'origin');
        const position=select('演奏位置の表示',[['smooth','なめらかに追う（従来）'],['start','上側'],['center','中央'],['end','下側']],'position');
        const modes=node('div',undefined,content);modes.className='sv-scroll-modes';
        const bpm=button('BPM',modes,()=>change({mode:'bpm'}));bpm.dataset.scrollReset='';
        const custom=button('カスタム',modes,()=>change({mode:'custom'}));
        const tempoField=node('label','演奏とスクロールのBPM',content),tempo=node('input',undefined,tempoField);
        tempo.type='number';tempo.min=20;tempo.max=400;tempo.step=1;tempo.required=true;
        tempo.onchange=()=>{
            if(!tempo.reportValidity())return;
            setTempo(tempo.valueAsNumber);
        };
        tempo.onblur=()=>{tempo.value=playback().settings.bpm;};
        const label=node('label','画面だけの送り速度',content),slider=node('input',undefined,label),output=node('output','',label);
        slider.type='range';slider.min=0;slider.max=100;slider.step=1;slider.dataset.nativeScrollSpeed='';
        slider.setAttribute('aria-label','譜面の送り速度');
        const ticks=node('div',undefined,content);ticks.className='sv-speed-ticks';
        for(const text of ['遅い','普通','速い'])node('span',text,ticks);
        function baseSeconds(p){return p.ticksPerBar/480*60/p.settings.bpm;}
        slider.oninput=()=>change({mode:'custom',secondsPerBar:baseSeconds(playback())/Math.pow(2,(Number(slider.value)-50)/25)});
        const footer=node('footer');
        const resumeButton=button('スクロール再開',footer,resume);resumeButton.dataset.scrollResume='';
        const play=button('▶ 再生',footer,toggle);bindPlaybackButton(play,toggle);
        function update(){
            const s=read(),p=playback();
            auto.checked=s.enabled;content.hidden=!s.enabled;
            origin.value=s.origin;position.value=s.position;
            position.parentElement.hidden=s.origin!=='score';
            position.options[1].textContent=horizontal()?'左側':'上側';
            position.options[3].textContent=horizontal()?'右側':'下側';
            bpm.setAttribute('aria-pressed',String(s.mode==='bpm'));
            custom.setAttribute('aria-pressed',String(s.mode==='custom'));
            tempoField.hidden=s.mode!=='bpm';
            tempo.disabled=['loading','counting'].includes(p.phase);
            if(doc.activeElement!==tempo)tempo.value=p.settings.bpm;
            label.hidden=ticks.hidden=s.mode!=='custom';
            slider.value=s.mode==='bpm'?50:Math.max(0,Math.min(100,50+Math.log2(baseSeconds(p)/s.secondsPerBar)*25));
            output.textContent=Math.round(s.secondsPerBar*100)/100+'秒／小節';
            resumeButton.hidden=!s.enabled||following();
            const playLabel=['playing','counting','loading'].includes(p.phase)?playingLabel:'▶ 再生';
            if(play.textContent!==playLabel)play.textContent=playLabel;
        }
        refresh=update;
        d.addEventListener('keydown',e=>e.stopPropagation());
        d.addEventListener('close',()=>{dialog=null;refresh=()=>{};d.remove();});
        host.append(d);bindOutsideDismiss(d);d.show();update();
    }
    return {open,refresh(){refresh();},close(){dialog?.close();},get isOpen(){return !!dialog?.open;}};
}
