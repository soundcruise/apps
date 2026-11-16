// One shortcut owner per visible reader. Never routes music input from the
// editor into a right-hand viewer, nor Space from an input or open dialog.
export function bindPlaybackKeys(host,{active,toggle,select}){
    const doc=host.ownerDocument;
    function key(e){
        if(!active()||e.defaultPrevented||e.isComposing||e.keyCode===229||e.repeat||e.ctrlKey||e.metaKey||e.altKey||doc.querySelector('dialog[open]:not([data-viewer-nonmodal])'))return;
        if(e.target.closest?.('input,select,textarea,summary,dialog,[contenteditable]'))return;
        const inside=host.contains(e.target),screen=host.closest('#screen-score-viewer');
        const neutral=e.target===doc.body||e.target===doc.documentElement||e.target===screen;
        if(!inside&&!(neutral&&!host.closest('#studio-tool-window')))return;
        if(e.code==='Space'||e.key===' '){
            if(e.target.closest?.('button')&&!e.target.matches('[data-viewer-action=play],[data-pdf-action=play]'))return;
            e.preventDefault();e.stopPropagation();toggle();
        }else if(inside&&['ArrowLeft','ArrowRight'].includes(e.key)&&!e.target.closest?.('button')){e.preventDefault();select?.(e.key==='ArrowRight'?1:-1);}
    }
    doc.addEventListener('keydown',key);
    return ()=>doc.removeEventListener('keydown',key);
}

export function createLeavePrompt(host){
    const doc=host.ownerDocument;let pending=null;
    return function ask(){
        if(pending)return pending;
        pending=new Promise(resolve=>{
            const d=doc.createElement('dialog');d.className='sv-library sv-leave';d.setAttribute('aria-label','未保存の譜面');
            const title=doc.createElement('h2');title.textContent='この端末に保存しますか？';
            const text=doc.createElement('p');text.textContent='このファイルはライブラリに保存されていません。保存すると後から開き直せます。';d.append(title,text);
            let choice='cancel';
            for(const [value,label]of [['save','保存して続ける'],['discard','保存せず続ける'],['cancel','キャンセル']]){const b=doc.createElement('button');b.type='button';b.dataset.viewerLeave=value;b.textContent=label;b.onclick=()=>{choice=value;d.close();};d.append(b);}
            d.addEventListener('keydown',e=>e.stopPropagation());d.addEventListener('close',()=>{d.remove();pending=null;resolve(choice);},{once:true});host.append(d);d.showModal();
        });return pending;
    };
}

export function mountSoundModes({parent,button,read,change}){
    const group=parent.ownerDocument.createElement('div');group.className='sv-sound-modes';group.setAttribute('role','group');group.setAttribute('aria-label','再生する音');parent.append(group);
    const buttons=new Map(),label=parent.ownerDocument.createElement('span');label.textContent='音';group.append(label);
    for(const [mode,text]of [['mute','ミュート'],['click','メトロノーム'],['all','全部鳴らす']]){
        const b=button(text,'sound-'+mode,group);buttons.set(mode,b);b.title=mode==='mute'?'音を鳴らさず画面だけ送る':text;
        b.onclick=()=>{const s=read();if(!s)return;change({metronome:mode!=='mute',mix:{chords:mode==='all'?100:0,melody:mode==='all'?100:0,metronome:mode==='mute'?0:100}});};
    }
    return ()=>{const s=read(),m=s?.settings.mix;const mode=!m?null:m.chords>0||m.melody>0?'all':s.settings.metronome&&m.metronome>0?'click':'mute';for(const [key,b]of buttons){b.disabled=!s;b.setAttribute('aria-pressed',String(key===mode));}};
}

export function downloadViewerFile(doc,bytes,name,pdf=false){
    const win=doc.defaultView,url=win.URL.createObjectURL(new win.Blob([bytes],{type:pdf?'application/pdf':'application/json'})),a=doc.createElement('a');
    a.href=url;a.download=(name||'譜面').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g,'_').slice(0,100)+(pdf?/\.pdf$/i.test(name||'')?'':'.pdf':'.cruise-score.json');doc.body.append(a);a.click();a.remove();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);
}
