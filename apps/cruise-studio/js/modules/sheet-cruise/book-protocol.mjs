import {MAX_BYTES,parseChordNames} from './chord-name-transfer.mjs';
import {FORM_FORMAT,parseChordForms} from './chord-form-transfer.mjs';
export const BOOK_LOCAL_ORIGIN='http://127.0.0.1:18874';
export const BOOK_PRO_ORIGIN='https://soundcruise.jp';
export const BOOK_PRO_URL=BOOK_PRO_ORIGIN+'/apps/chord-cruise/pro_k7m4q9v2x8/';
export const BOOK_CHANNEL='sound-cruise/book-picker/1/';
export function bookEnvelope(data,kind,keys=[]){return !!data&&typeof data==='object'&&!Array.isArray(data)&&data.type===BOOK_CHANNEL+kind&&data.version===1&&typeof data.nonce==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.nonce)&&Object.keys(data).every(k=>['type','version','nonce',...keys].includes(k));}
export function readBookCatalogue(text,withForms){
    if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)throw Error('本棚から受け取ったデータの大きさを確認してください');
    const root=JSON.parse(text);if(withForms?root?.format!==FORM_FORMAT:root?.format===FORM_FORMAT)throw Error('本棚の送信形式が選択した条件と異なります');
    return withForms?parseChordForms(text):parseChordNames(text);
}

export function readBookSelection(text,withForms){const payload=readBookCatalogue(text,withForms);if(payload.chords.length!==1)throw Error('入力するコードを1件選んでください');return payload.chords[0];}
