import {icon} from '../../../../score-viewer/ui/icons.mjs';
import {guardDraft} from './draft-history.mjs';
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

export function presetWindow(parent, title, className = '', dirty = null) {
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
    const dismiss=dirty?guardDraft(dialog,dirty):()=>dialog.close();
    close.onclick=dismiss;
    header.append(close);
    dialog.append(header);
    const onParentClose = () => dialog.close();
    parent.addEventListener('close',onParentClose,{once:true});
    dialog.addEventListener('close',() => {
        parent.removeEventListener('close',onParentClose);
        dialog.remove();
    },{once:true});
    bindOutsideDismiss(dialog,{close:dismiss});
    dialog.addEventListener('keydown',event => event.stopPropagation());
    dialog.showModal();
    return dialog;
}

export function managePresets(parent, library, initial, editContent, changed) {
    const dialog=presetWindow(parent,'プリセット一覧を編集','sc-preset-catalog');
    const doc=dialog.ownerDocument;
    const list=doc.createElement('ul'),status=doc.createElement('p');
    list.setAttribute('aria-label','プリセット一覧');
    status.setAttribute('role','status');
    dialog.append(list,status);
    function button(host,label,content,action) {
        const b=doc.createElement('button');
        b.type='button';b.append(content);b.title=label;b.setAttribute('aria-label',label);
        b.onclick=()=>{status.textContent='';try{action();}catch(error){status.textContent=error.message;}};
        host.append(b);
        return b;
    }
    function write(items, focusId) {
        library.write(items);
        changed();
        render(focusId);
    }
    function render(focusId) {
        list.replaceChildren();
        if(!library.items.length) status.textContent='プリセットはありません。';
        library.items.forEach((item,index)=>{
            const row=doc.createElement('li'),name=doc.createElement('strong'),actions=doc.createElement('div'),detail=doc.createElement('div');
            row.setAttribute('aria-label',item.name);name.textContent=item.name;
            actions.className='sc-preset-list-actions';detail.className='sc-preset-row-detail';
            row.append(name,actions,detail);list.append(row);
            const edit=button(actions,'編集','編集',()=>{dialog.close();editContent(item);});
            edit.className='sc-preset-primary';
            button(actions,'名前を変更',icon(doc,'edit'),()=>{
                detail.replaceChildren();
                const input=doc.createElement('input');input.value=item.name;input.maxLength=80;
                input.setAttribute('aria-label','新しいプリセット名');detail.append(input);
                const save=button(detail,'変更を保存','保存',()=>{
                    const value=input.value.trim();
                    if(!value||library.items.some(e=>e.id!==item.id&&e.name===value))throw Error('未使用の名前を入力してください');
                    write(library.items.map(e=>e.id===item.id?{...item,name:value}:e),item.id);
                });
                input.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229)save.click();};
                button(detail,'キャンセル','キャンセル',()=>{detail.replaceChildren();edit.focus();});
                input.select();
            });
            function move(offset) {
                const items=library.items.slice();
                items.splice(index,1);items.splice(index+offset,0,item);write(items,item.id);
            }
            button(actions,'上へ','↑',()=>move(-1)).disabled=index===0;
            button(actions,'下へ','↓',()=>move(1)).disabled=index===library.items.length-1;
            button(actions,'複製',icon(doc,'copy'),()=>{
                let n=2, name;
                do{name=item.name.slice(0,72)+' ('+n+')';n++;}while(library.items.some(e=>e.name===name));
                const copy={...structuredClone(item),id:crypto.randomUUID(),name},items=library.items.slice();
                items.splice(index+1,0,copy);write(items,copy.id);
            });
            const remove=button(actions,'削除',icon(doc,'trash'),()=>{
                detail.replaceChildren();
                const prompt=doc.createElement('span');prompt.textContent='「'+item.name+'」を削除しますか？';detail.append(prompt);
                const cancel=button(detail,'キャンセル','キャンセル',()=>{detail.replaceChildren();remove.focus();});
                button(detail,'削除する','削除する',()=>{
                    const items=library.items.filter(e=>e.id!==item.id);
                    write(items,items[Math.min(index,items.length-1)]?.id);
                });cancel.focus();
            });
            remove.className='sc-preset-delete';
            for(const b of actions.children){
                const action=b.getAttribute('aria-label');
                const verb={編集:'内容を編集',上へ:'一覧の一つ上へ移動',下へ:'一覧の一つ下へ移動',複製:'コピーを作成',削除:'一覧から削除','名前を変更':'名前を変更'}[action];
                b.title=item.name+' — '+verb;
            }
            if(item.id===focusId)edit.focus();
        });
    }
    render(initial?.id);
}
