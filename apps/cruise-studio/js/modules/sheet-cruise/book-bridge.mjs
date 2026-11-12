import {BOOK_LOCAL_ORIGIN,BOOK_PRO_ORIGIN,BOOK_PRO_URL,BOOK_CHANNEL,bookEnvelope,readBookSelection,readBookCatalogue} from './book-protocol.mjs';
// Navigation is explicit. No fetch, credentials, backend or shared storage.
export function openBookPicker({window:win=window,isCurrent,onSelect,onStatus,withForms=false,catalogue=false}){
    if(win.location.origin!==BOOK_LOCAL_ORIGIN)throw Error('本棚連携は専用ローカル入口だけで利用できます');
    const popup=win.open('about:blank','_blank');if(!popup){onStatus('ポップアップを許可してから、もう一度本棚を開いてください');return {cancel(){}};}
    popup.opener=null;popup.location.href=BOOK_PRO_URL;
    const nonce=win.crypto.randomUUID(),deadline=Date.now()+600000;
    let done=false,connected=false,applying=false,timer;
    const post=(kind,extra={})=>{try{popup.postMessage({type:BOOK_CHANNEL+kind,version:1,nonce,...extra},BOOK_PRO_ORIGIN);}catch{/* closed or policy-separated tab */}};
    function finish(message,cancel=true){if(done)return;if(cancel&&!applying)post('cancel');done=true;win.clearInterval(timer);win.removeEventListener('message',receive);if(message)onStatus(message);}
    function receive(event){
        if(done||event.origin!==BOOK_PRO_ORIGIN||event.source!==popup||event.data?.nonce!==nonce)return;
        if(!isCurrent()||Date.now()>deadline){finish('編集先が変わったか、接続期限を過ぎました。本棚を開き直してください');return;}
        if(bookEnvelope(event.data,'closed')){finish('本棚の選択を閉じました',false);return;}
        if(bookEnvelope(event.data,'ready')){connected=true;onStatus(catalogue?'本棚で使うコードを選び「譜面の本棚へ取り込む」を押してください':'本棚で1件選び「譜面へ入力」を押してください');return;}
        if(!bookEnvelope(event.data,'select',['payloadJSON']))return;
        try{const chord=(catalogue?readBookCatalogue:readBookSelection)(event.data.payloadJSON,withForms);applying=true;const ok=onSelect(chord,withForms)===true;post('result',{ok});finish(ok?(catalogue?'本棚を取り込みました。この画面でコードを選んでください。譜面はまだ変更していません。':'本棚のコードを入力しました。保存は譜面の「保存」から。'):'入力できませんでした。元の内容を保持しています。',false);}
        catch{post('result',{ok:false});finish('受け取ったコードを反映できませんでした。元の内容を保持しています。',false);}
        finally{applying=false;}
    }
    function tick(){if(done)return;if(!isCurrent()){finish('編集先が変わりました。本棚を開き直してください');return;}if(popup.closed||Date.now()>deadline){finish('本棚との接続が終了しました。必要ならJSONでも取り込めます');return;}if(!connected)post('hello',{forms:!!withForms,...(catalogue?{catalogue:true}:{})});}
    win.addEventListener('message',receive);timer=win.setInterval(tick,600);tick();onStatus('Proタブで通常の認証後に本棚を開き、登録した読取り専用ブックマークを実行してください');
    return {cancel(){finish('',true);}};
}
