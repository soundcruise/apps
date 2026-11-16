import {createMockSync} from '../sync/client.mjs';
import {createSyncInbox} from '../sync/store.mjs';
import {createPresetCodec} from '../core/preset.mjs';
import {createPDFLoader} from '../core/pdf-loader.mjs';

const errors={
    'sync-conflict':'別の変更があります。一覧を更新して、差し替え先を確認してください。',
    'sync-integrity':'ファイル本体が一覧と一致しません。受信し直してください。',
    'sync-mime':'ファイルの種類を確認できません。受信を中止しました。',
    'sync-size':'ファイルの大きさが対応範囲を超えています。',
    'sync-file-missing':'一覧だけを取得した状態です。先にファイル本体を受信してください。',
    'sync-playing':'一時停止してから適用してください。演奏中の譜面は変えていません。',
    'sync-preset-name-conflict':'同じ名前のプリセットがあります。別の名前を入力してください。',
    'sync-remote-quota':'模擬ストアの容量が不足しています。既存のファイルは保持しています。',
    'sync-capability':'対応する模擬Syncの契約を確認できません。',
    'viewer-revision-conflict':'同じ版の異なる内容があります。元の譜面から新しい版を書き出してください。'
};
export function mountMockSync({button,view,contract,library,indexedDB=window.indexedDB}){
    const doc=button.ownerDocument,inbox=createSyncInbox({indexedDB});
    const sync=createMockSync({inbox,library,codec:contract.codec,presetCodec:createPresetCodec((input,score={bars:[]})=>contract.normalizePresentation(input,score)),
        async validatePDF(bytes,metadata){const loader=createPDFLoader(),data=await loader.open(bytes,metadata);try{return data.sizes.length;}finally{await data.dispose();}},
        playback:()=>view.playback(),withReplacement:run=>view.withReplacement(run),openBytes:(...args)=>view.openBytes(...args)});
    let dialog=null,working=false,rows=[],locals=[],selected='',target='',status='',statusError=false;
    const node=(tag,text,parent)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;parent.append(n);return n;};
    const action=(text,name,parent,run)=>{const b=node('button',text,parent);b.type='button';b.dataset.syncAction=name;b.disabled=working;b.onclick=()=>void work(run);return b;};
    let content,notice,renderSequence=0;
    function message(text,error=false){status=text;statusError=error;if(notice){notice.textContent=text;notice.dataset.error=String(error);}}
    async function work(run){if(working)return;working=true;try{await render();await run();}catch(error){message(errors[error.message]||(error.name==='QuotaExceededError'?'端末の保存容量が不足しています。受信完了にはしていません。':'模擬Syncを完了できませんでした。現在の譜面は保持しています。接続を確認し、再試行してください。'),true);}finally{working=false;try{await render();}catch{message('受信記録を読み出せませんでした。このカードを閉じ、保存先を確認してから開き直してください。',true);}}}
    async function localRows(){const files=await library.list(),presets=await library.listPresets();locals=[...files.map(row=>({key:'file:'+row.documentId,kind:row.kind==='pdf'?'viewer_pdf':'viewer_score',row,title:row.title})),...presets.map(row=>({key:'preset:'+row.name,kind:'viewer_preset',row,title:row.name}))];}
    async function render(){
        if(!dialog?.open)return;const d=dialog,sequence=++renderSequence,panel=doc.createDocumentFragment();
        for(const e of content.querySelectorAll('button,input,select'))e.disabled=true;
        const header=node('div',undefined,panel);header.className='sv-sync-controls';action('一覧を更新','refresh',header,async()=>{rows=await sync.refresh();await localRows();message('一覧を取得しました。ファイル本体は「受信」で取得します。');});
        const localBox=node('section',undefined,panel);node('h3','この端末から送る',localBox);
        const select=node('select',undefined,localBox);select.setAttribute('aria-label','模擬Syncに送るファイル');select.dataset.syncLocal='';
        node('option','端末に保存済みのファイルを選択',select).value='';
        for(const item of locals){const o=node('option',(item.kind==='viewer_preset'?'プリセット：':'譜面：')+item.title,select);o.value=item.key;}
        select.value=selected;select.disabled=working;select.onchange=()=>{selected=select.value;target='';void work(async()=>{});};
        const source=locals.find(l=>l.key===selected),destination=node('select',undefined,localBox);destination.setAttribute('aria-label','模擬Syncの送信先');destination.dataset.syncTarget='';
        node('option','新しいファイルとして送る',destination).value='';
        for(const r of rows.filter(r=>source&&r.descriptor.asset.kind===source.kind&&!r.deleted)){const o=node('option','差し替え：'+r.descriptor.title+'（v'+r.version+'）',destination);o.value=r.descriptor.recordId;}
        destination.value=target;if(destination.value!==target)target='';destination.disabled=working||!source;destination.onchange=()=>{target=destination.value;};
        const send=action('送る','publish',localBox,async()=>{
            const source=locals.find(l=>l.key===selected);if(!source)return;const current=rows.find(r=>r.descriptor.recordId===target);
            let bytes;if(source.kind==='viewer_preset')bytes=source.row.text;else bytes=(await library.read(source.row.documentId,source.row.revisionId)).bytes;
            const result=await sync.publish({bytes,title:source.title,kind:source.kind,recordId:current?.descriptor.recordId,baseVersion:current?.version||0});
            rows=await sync.refresh();target=result.descriptor.recordId;message('模擬ストアに送りました。別のブラウザでは「一覧を更新」→「受信」で取得できます。');
        });send.disabled=working||!source;
        node('h3','模擬ストア',panel);const list=node('div',undefined,panel);list.className='sv-sync-list';
        if(!rows.length)node('p','一覧はまだありません。「一覧を更新」で確認できます。',list);
        for(const r of rows){
            const item=node('article',undefined,list);item.dataset.syncRecord=r.descriptor.recordId;node('strong',r.descriptor.title,item);
            const entry=await sync.readInbox(r);if(d!==dialog||!d.open||sequence!==renderSequence)return;
            node('p','v'+r.version+' · '+r.descriptor.asset.kind.replace('viewer_','')+' · '+(r.deleted?'模擬側で削除済み（端末の保存は残ります）':entry?'本体受信済み（適用時に再検証）':'本体未受信'),item);
            if(r.deleted)continue;
            const controls=node('div',undefined,item);controls.className='sv-sync-controls';
            action('受信','download',controls,async()=>{await sync.download(r);message('本体を検証して受信しました。表示中の譜面は変更していません。');});
            let presetName;
            if(r.descriptor.type==='viewer_preset'){presetName=node('input',undefined,item);presetName.value=r.descriptor.title;presetName.maxLength=40;presetName.setAttribute('aria-label','受信プリセットの保存名');presetName.disabled=working;}
            const apply=action(r.descriptor.type==='viewer_preset'?'プリセットを保存':'保存してこの版を開く','apply',controls,async()=>{
                await sync.apply(r,{presetName:presetName?.value});await localRows();message(r.descriptor.type==='viewer_preset'?'プリセットを保存しました。譜面の「表示」から手動で選べます。':'この版を端末に保存して開きました。前の版と端末別の設定は残しています。');
            });apply.disabled=working||!entry||r.descriptor.type==='viewer_document'&&['playing','counting','loading'].includes(view.playback()?.phase);
            const remove=node('button','模擬側から削除',controls);remove.type='button';remove.dataset.syncAction='delete';remove.disabled=working;
            remove.onclick=()=>{remove.textContent='端末の保存は残す · 削除を確定';remove.onclick=()=>void work(async()=>{await sync.remove(r);rows=await sync.refresh();message('模擬側を削除済みにしました。各端末の保存済みファイルは残しています。');});};
        }
        if(d!==dialog||!d.open||sequence!==renderSequence)return;content.replaceChildren(panel);message(status,statusError);
    }
    button.onclick=async()=>{
        if(dialog)return;const d=node('dialog',undefined,doc.body);dialog=d;d.className='sv-mock-sync';d.setAttribute('aria-label','ローカル模擬Sync');
        const header=node('header',undefined,d);node('h2','模擬Sync · LOCAL',header);const close=node('button','閉じる',header);close.type='button';close.onclick=()=>d.close();
        node('p','ローカル検証用です。実アカウントには接続しません。模擬ストアはサーバーを再起動すると消えます。',d);
        notice=node('p','',d);notice.setAttribute('role','status');notice.dataset.syncStatus='';content=node('div',undefined,d);
        d.addEventListener('keydown',e=>e.stopPropagation());d.addEventListener('close',()=>{dialog=null;content=notice=null;d.remove();button.focus({preventScroll:true});});
        d.showModal();await work(async()=>{rows=await sync.catalog();await localRows();message('端末の受信記録を表示しています。最新の状態は「一覧を更新」で確認してください。');});
    };
    return Object.freeze({sync,async dispose(){dialog?.close();await inbox.close();}});
}
