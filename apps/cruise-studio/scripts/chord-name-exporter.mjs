import {makeChordNames,MAX_CHORDS} from '../js/modules/sheet-cruise/chord-name-transfer.mjs';

// Explicitly invoked helper on an already-open Chord Pro bookshelf. Reads only
// named bookshelf keys. Never calls storage readers that can normalize/write.
export function installChordNameExporter(win=window){
    function available(){const screen=win.document.getElementById('cc-screen-library');return !!win.ChordCruise?.ui?.library&&!!screen&&!screen.classList.contains('cc-screen--hidden')&&!screen.closest('[inert],[hidden]')&&!win.document.body.classList.contains('pro-gate-active');}
    if(!available())throw Error('通常の認証を済ませ、コードクルーズの本棚を開いてから実行してください');
    if(win.document.getElementById('sc-chord-name-export'))return;
    const read=key=>{const raw=win.localStorage.getItem(key);return raw===null?null:JSON.parse(raw);};
    let index,folders;try{index=read('chordCruise.chords.index');folders=read('chordCruise.folders');}catch{throw Error('本棚の読み取りに失敗しました。保存内容は変更していません');}
    if(!Array.isArray(index)||!Array.isArray(folders)||index.length>10000||folders.length>1000)throw Error('本棚の形式を確認してください。保存内容は変更していません');
    const ids=new Set();for(const c of index){if(typeof c?.id!=='string'||ids.has(c.id))throw Error('本棚の識別情報を確認してください。保存内容は変更していません');ids.add(c.id);}
    const doc=win.document,host=doc.createElement('div');host.id='sc-chord-name-export';const shadow=host.attachShadow({mode:'open'});
    const style=doc.createElement('style');style.textContent=':host{position:fixed;inset:0;z-index:2147483647;background:#0008;display:grid;place-items:center;font:14px sans-serif;color:#f4f1e8}section{background:#141311;border:1px solid #d4af3755;border-radius:16px;padding:24px;width:min(640px,85vw);max-height:80vh;overflow:auto}label{display:flex;gap:8px;align-items:center;padding:8px;border-bottom:1px solid #ffffff15}button{padding:10px 16px;border:1px solid #d4af3766;border-radius:8px;background:#252116;color:inherit;margin:12px 8px 0 0}p{line-height:1.6}';shadow.append(style);
    const section=doc.createElement('section');section.setAttribute('role','dialog');section.setAttribute('aria-modal','true');section.setAttribute('aria-label','譜面へ渡すコード名を書き出す');shadow.append(section);
    const heading=doc.createElement('h2');heading.textContent='譜面へ渡すコードを選択';section.append(heading);
    const help=doc.createElement('p');help.textContent='コード名だけをJSONに書き出します。本棚は変更せず、フォームや認証情報は含めません。';section.append(help);
    const select=doc.createElement('select');select.setAttribute('aria-label','フォルダ');const all=doc.createElement('option');all.value='';all.textContent='すべてのフォルダ';select.append(all);for(const f of folders){if(typeof f?.id!=='string'||typeof f?.name!=='string')continue;const o=doc.createElement('option');o.value=f.id;o.textContent=f.name;select.append(o);}section.append(select);
    const list=doc.createElement('div'),selected=new Set();section.append(list);
    function render(){list.replaceChildren();for(const c of index){if(typeof c?.id!=='string'||typeof c?.chordName!=='string'||typeof c?.folderId!=='string'||select.value&&select.value!==c.folderId)continue;const l=doc.createElement('label'),x=doc.createElement('input');x.type='checkbox';x.checked=selected.has(c.id);x.dataset.exportChord=c.id;x.addEventListener('change',()=>{if(x.checked)selected.add(c.id);else selected.delete(c.id);});l.append(x,doc.createTextNode(c.chordName+' ／ '+(folders.find(f=>f.id===c.folderId)?.name||'不明なフォルダ')));list.append(l);}}
    select.addEventListener('change',render);render();const status=doc.createElement('p');status.setAttribute('role','status');section.append(status);
    function close(){host.remove();previous?.focus?.();}const previous=doc.activeElement;
    const save=doc.createElement('button');save.textContent='選択したコード名をJSON書き出し';save.addEventListener('click',()=>{try{
        if(!available())throw Error('本棚の表示・認証状態を確認してください');
        if(!selected.size||selected.size>MAX_CHORDS)throw Error('1〜'+MAX_CHORDS+'件を選択してください');
        const used=new Set(),chords=[...selected].map(id=>{const row=index.find(c=>c.id===id),full=read('chordCruise.chord.'+id);if(!row||!full||full.id!==id||full.chordName!==row.chordName||full.folderId!==row.folderId)throw Error('本棚の内容が変わりました。閉じて開き直してください');used.add(row.folderId);return {id,folderId:row.folderId,name:full.chordName};});
        const payload=makeChordNames(folders.filter(f=>used.has(f.id)).map(f=>({id:f.id,name:f.name})),chords),url=win.URL.createObjectURL(new win.Blob([JSON.stringify(payload)],{type:'application/json'})),a=doc.createElement('a');a.href=url;a.download='chord-names.json';a.click();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);status.textContent=chords.length+'件を書き出しました。本棚は変更していません。';
    }catch(error){status.textContent=error.message;}});section.append(save);const cancel=doc.createElement('button');cancel.textContent='閉じる';cancel.addEventListener('click',close);section.append(cancel);
    shadow.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='Tab'){const controls=[...shadow.querySelectorAll('select,input,button')],at=controls.indexOf(shadow.activeElement);e.preventDefault();controls[(at+(e.shiftKey?-1:1)+controls.length)%controls.length]?.focus();}});doc.body.append(host);select.focus();
}
