// The native Chord Cruise screen owns folder selection, permissions and the final write.
import {bookDraftKey} from '/apps/cruise-studio/js/modules/sheet-cruise/book-save.mjs';
const pending=sessionStorage.getItem(bookDraftKey);
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
