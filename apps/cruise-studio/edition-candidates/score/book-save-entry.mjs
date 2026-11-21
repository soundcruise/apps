// The native Chord Cruise screen owns folder selection, permissions and the final write.
import {bookDraftKey} from '/apps/cruise-studio/js/modules/sheet-cruise/book-save.mjs';
import {savedChordForm,makeChordForms} from '/apps/cruise-studio/js/modules/sheet-cruise/chord-form-transfer.mjs';
const choosing=new URLSearchParams(location.search).get('export')==='form';
const pending=!choosing && sessionStorage.getItem(bookDraftKey);
if(pending){
    const owner=window.ChordCruise;
    const form=JSON.parse(pending);
    const home=document.getElementById('cc-go-library');
    function open(){
        sessionStorage.removeItem(bookDraftKey);
        owner.ui.saveEditor.openScoreForm({chord:form,onSaved:()=>home.click()});
    }
    if(document.documentElement.dataset.appEdition==='Pro'){
        const button=document.createElement('button');
        button.type='button';button.className='cc-btn cc-btn-primary';
        button.textContent='譜面のフォームをコード本棚に保存';home.before(button);
        button.onclick=async()=>{
            if(await window.__soundCruiseEnsureProSession?.()){button.remove();open();}
        };
    }else open();
}

if(choosing){
    const library=document.getElementById('cc-screen-library');
    const hint=document.createElement('p');
    hint.setAttribute('role','status');hint.className='cc-fb-hint';
    hint.textContent='本棚を開いてコードを選ぶと、譜面クルーズ用のフォームを書き出します。';
    library.before(hint);
    library.addEventListener('click',async event=>{
        const card=event.target.closest('.cc-chordthumb-card[data-chord-id]');
        if(!card||event.target.closest('[data-chord-manage-id]')||card.classList.contains('cc-chordthumb-card--sorting'))return;
        event.preventDefault();event.stopImmediatePropagation();
        try{
            if(document.documentElement.dataset.appEdition==='Pro' && !await window.__soundCruiseEnsureProSession?.())return;
            if(library.closest('[inert],[hidden],.cc-screen--hidden')||!card.isConnected)return;
            const owner=window.ChordCruise,record=owner.storage.loadChord(card.dataset.chordId);
            const folder=owner.storage.loadFolders().find(f=>f.id===record?.folderId);
            if(!folder)throw Error('本棚を開き直してコードを選んでください。');
            const form=savedChordForm(record,owner.caged.detectBarres);
            const file=makeChordForms([{id:folder.id,name:folder.name}],[{id:record.id,folderId:folder.id,name:record.chordName,form}]);
            const url=URL.createObjectURL(new Blob([JSON.stringify(file)],{type:'application/json'}));
            const link=document.createElement('a');link.href=url;link.download='chord-forms.json';link.click();
            setTimeout(()=>URL.revokeObjectURL(url),1000);
            hint.textContent='「'+record.chordName+'」を書き出しました。譜面クルーズでこのJSONファイルを選んでください。';
        }catch(error){hint.textContent=error.message;}
    },true);
    if(document.documentElement.dataset.appEdition!=='Pro'){
        const showLibrary=()=>document.getElementById('cc-go-library').click();
        if(document.readyState==='complete')showLibrary();
        else window.addEventListener('load',showLibrary,{once:true});
    }
}
