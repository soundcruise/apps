import {diagramBarres} from './form-cycle.mjs';
import {bindOutsideDismiss} from '../score-ui.mjs';

// Work on a detached fingering until the user applies the entire group.
export function buildCatalogueEditor(dialog,{project,entry,positions,forms,schema,paper,apply}){
    const doc=dialog.ownerDocument,capo=project.instrument.capo;
    const previous=project.materials.forms.find(form=>form.id===entry.materialId);
    const original=schema.chord(entry.symbol,-capo)??entry.symbol;
    let draft=structuredClone(entry.snapshot),shape=previous.provenance.shape;
    function node(tag,text,parent=dialog){
        const element=doc.createElement(tag);
        if(text!==null)element.textContent=text;
        parent.append(element);return element;
    }
    function option(select,text,value){
        const item=node('option',text,select);item.value=value;
    }
    function button(parent,text,click){
        const element=node('button',text,parent);element.type='button';element.onclick=click;return element;
    }
    const title=node('h2','コードとフォームの一括編集');
    dialog.setAttribute('aria-label',title.textContent);
    node('p',original+' の同じフォームを使っている'+positions.length+'箇所に反映します。');
    const locations=node('details',null);
    node('summary','対象の小節を確認',locations);
    node('p',positions.join('、'),locations);
    const codeLabel=node('label',capo?'コード名（カポ'+capo+'・Playキー）':'コード名');
    const name=node('input',null,codeLabel);name.type='text';name.maxLength=64;name.value=original;
    const body=node('div',null);body.className='sc-bulk-form-body';
    const preview=node('figure',null,body),table=node('table',null,body);
    const headers=node('tr',null,node('thead',null,table));
    for(const text of ['弦','フレット','運指'])node('th',text,headers).scope='col';
    const controls=[],rows=node('tbody',null,table);
    for(let string=1;string<=6;string++){
        const row=node('tr',null,rows);node('th',string+'弦',row).scope='row';
        const fret=node('select',null,node('td',null,row)),finger=node('select',null,node('td',null,row));
        fret.setAttribute('aria-label',string+'弦のフレット');finger.setAttribute('aria-label',string+'弦の運指');
        option(fret,'× ミュート','x');option(fret,'○ 開放','0');
        for(let i=1;i<=draft.maxAbsoluteFret-capo;i++)option(fret,i+' F',String(i));
        for(const [value,label] of [['','未指定'],['1','人差し指'],['2','中指'],['3','薬指'],['4','小指'],['T','親指']])option(finger,label,value);
        controls.push({fret,finger});
        fret.onchange=finger.onchange=()=>{
            const old=draft.strings[string-1],n=Number(fret.value);
            draft.strings[string-1]=fret.value==='x'?{string,kind:'muted'}:{
                string,kind:'note',relativeFret:n,
                finger:n&&finger.value?(finger.value==='T'?'T':Number(finger.value)):null,
                fingeringWarning:false
            };
            if(old.kind!==draft.strings[string-1].kind||old.relativeFret!==n)shape=null;
            draft.barres=diagramBarres(draft);
            draft.playability='unknown';draft.ownerWarning='変更した押さえ方は未確認';
            notice.textContent='';refresh();
        };
    }
    button(dialog,'コードに合うフォームを使う',()=>{
        const symbol=sounding(),suggestion=symbol&&forms.recommend(project,symbol);
        if(!suggestion){notice.textContent='このコードのフォーム候補はありません。弦ごとに指定できます。';return;}
        draft=structuredClone(suggestion.snapshot);shape=suggestion.provenance.shape;notice.textContent='';refresh();
    });
    const notice=node('p','');notice.setAttribute('role','status');
    const footer=node('footer',null);button(footer,'キャンセル',()=>dialog.close());
    const save=button(footer,positions.length+'箇所に反映',()=>{
        const symbol=sounding();
        if(!symbol){notice.textContent='コード名を確認してください。';name.focus();return;}
        const result=apply(symbol,hasNewForm()?{snapshot:draft,provenance:{shape}}:null);
        if(!result.ok)notice.textContent=result.error||'一括変更できませんでした。';
    });
    function sounding(){return schema.chord(name.value.trim(),capo);}
    function hasNewForm(){return JSON.stringify(draft)!==JSON.stringify(entry.snapshot)||shape!==previous.provenance.shape;}
    function refresh(){
        for(const [i,{fret,finger}] of controls.entries()){
            const note=draft.strings[i];
            fret.value=note.kind==='note'?String(note.relativeFret):'x';
            finger.disabled=note.kind==='muted'||note.relativeFret===0;finger.value=String(note.finger??'');
        }
        const any=draft.strings.some(note=>note.kind==='note');
        preview.innerHTML=any?paper.diagram(draft).svg:'';
        if(!any)preview.textContent='鳴らす弦を選んでください。';
        save.disabled=!any||!name.value.trim()||(original===name.value.trim()&&!hasNewForm());
    }
    name.oninput=()=>{notice.textContent='';refresh();};
    dialog.addEventListener('keydown',event=>{event.stopPropagation();if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s')event.preventDefault();});
    bindOutsideDismiss(dialog);refresh();
}
