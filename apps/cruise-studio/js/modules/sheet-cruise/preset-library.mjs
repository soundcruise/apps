import {bindOutsideDismiss} from '../score-ui.mjs';

// Keep one ordered catalogue per instrument part on this device. Initially seed it
// from the shipped patterns, the previous custom list and Rhythm Cruise's presets.
export function presetLibrary(storage, key, defaults, legacy, rhythm, valid) {
    const libraryKey = key.replace(/V1$/, 'LibraryV2');
    let stored = storage.getAppSetting(libraryKey);
    let revision = JSON.stringify(stored);
    const tagged = (items, kind) => items.map((item, i) => ({...item, id:kind + ':' + i}));
    const external = rhythm.map(item => ({...item, id:'rhythm:' + JSON.stringify([item.name,item.rows])}));
    const known = new Set(stored?.knownRhythms || []);
    let items = Array.isArray(stored?.items) ? stored.items.filter(valid) :
        [...tagged(defaults,'default'), ...tagged(legacy,'custom')];
    for (const entry of external) {
        if (!known.has(entry.id)) items.push(entry);
        known.add(entry.id);
    }
    return {
        get items() { return items; },
        write(next) {
            if (next.length > 512) throw Error('プリセットは512件まで保存できます');
            if (JSON.stringify(storage.getAppSetting(libraryKey)) !== revision)
                throw Error('別の画面で一覧が変更されました。一括入力を開き直してください');
            const value = {items:next, knownRhythms:[...known]};
            if (!storage.setAppSetting(libraryKey,value)?.ok) throw Error('端末に保存できませんでした');
            revision = JSON.stringify(value);
            items = next;
        }
    };
}

export function presetWindow(parent, title, className = '') {
    const doc = parent.ownerDocument;
    const dialog = doc.createElement('dialog');
    dialog.className = 'sc-song-dialog sc-preset-window ' + className;
    dialog.setAttribute('aria-label',title);
    parent.parentElement.append(dialog);
    const header = doc.createElement('header'), heading = doc.createElement('h2');
    heading.textContent = title;
    header.append(heading);
    const close = doc.createElement('button');
    close.type = 'button';
    close.textContent = '閉じる';
    close.onclick = () => dialog.close();
    header.append(close);
    dialog.append(header);
    const onParentClose = () => dialog.close();
    parent.addEventListener('close',onParentClose,{once:true});
    dialog.addEventListener('close',() => {
        parent.removeEventListener('close',onParentClose);
        dialog.remove();
    },{once:true});
    bindOutsideDismiss(dialog);
    dialog.addEventListener('keydown',event => event.stopPropagation());
    dialog.showModal();
    return dialog;
}

export function managePresets(parent, library, initial, editContent, partName) {
    const dialog=presetWindow(parent,'プリセット一覧を編集','sc-preset-catalog');
    const doc=dialog.ownerDocument, list=doc.createElement('select');
    list.size=12;
    list.setAttribute('aria-label','プリセット一覧');
    for(const item of library.items) list.add(new doc.defaultView.Option(item.name,item.id));
    list.selectedIndex=list.length ? Math.max(0,library.items.findIndex(e=>e.id===initial?.id)) : -1;
    const edit=doc.createElement('button');
    edit.type='button';edit.className='sc-preset-primary';
    edit.textContent='この'+partName+'を編集';edit.disabled=!list.length;
    function select(){const item=library.items[list.selectedIndex];if(item){dialog.close();editContent(item);}}
    edit.onclick=select;list.ondblclick=select;
    list.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();select();}};
    dialog.append(list,edit);list.focus();
}

export function mountPresetActions(area,library,initial,changed) {
    const doc=area.ownerDocument;
    const summary=doc.createElement('summary');summary.textContent='このプリセットの整理';area.append(summary);
    const actions=doc.createElement('div'),detail=doc.createElement('div'),status=doc.createElement('p');
    actions.className='sc-preset-list-actions';status.setAttribute('role','status');area.append(actions,detail,status);
    let item=initial;
    function button(text, action, host=actions) {
        const b=doc.createElement('button');b.type='button';b.textContent=text;
        b.onclick=()=>{try{action();}catch(e){status.textContent=e.message;}};host.append(b);return b;
    }
    const index=()=>library.items.findIndex(e=>e.id===item.id);
    function write(next,selected,message,removed=false){
        library.write(next);item=selected;changed(selected,removed);
        if(removed)return;
        detail.replaceChildren();status.textContent=message;
        up.disabled=index()<=0;down.disabled=index()>=next.length-1;
    }
    button('名前を変更',()=>{
        detail.replaceChildren();
        const input=doc.createElement('input');input.value=item.name;input.maxLength=80;input.setAttribute('aria-label','新しいプリセット名');detail.append(input);
        const save=button('変更を保存',()=>{
            const name=input.value.trim();
            if(!name||library.items.some(e=>e.id!==item.id&&e.name===name))throw Error('未使用の名前を入力してください');
            const renamed={...item,name};
            write(library.items.map(e=>e.id===item.id?renamed:e),renamed,'名前を変更しました。');
        },detail);
        input.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229)save.click();};input.select();
    });
    function move(offset){
        const next=library.items.slice(),i=index();next.splice(i,1);next.splice(i+offset,0,item);
        write(next,item,'一覧の'+(i+offset+1)+'番目に移動しました。');
    }
    const up=button('↑ 上へ',()=>move(-1)),down=button('↓ 下へ',()=>move(1));
    up.disabled=index()<=0;down.disabled=index()>=library.items.length-1;
    button('複製',()=>{
        let n=2,name;
        do{name=item.name.slice(0,72)+' ('+n+')'; n++;}while(library.items.some(e=>e.name===name));
        const copy={...structuredClone(item),id:crypto.randomUUID(),name},next=library.items.slice();
        next.splice(index()+1,0,copy);write(next,copy,'複製を編集中です。');
    });
    button('削除',()=>{
        detail.replaceChildren();const prompt=doc.createElement('p');prompt.textContent='「'+item.name+'」を削除しますか？';detail.append(prompt);
        button('削除する',()=>{const next=library.items.filter(e=>e.id!==item.id);write(next,next[0],null,true);},detail);
        button('キャンセル',()=>detail.replaceChildren(),detail);
    });
}
