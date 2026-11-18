import {bindOutsideDismiss} from '../score-ui.mjs';
// Read-only help. Editing, storage and playback remain owned by the existing editor.
const TOPICS=[
 ['入力単位',[
  ['マスの選択','コード・歌詞・ドレミは、クリックで選択、そのまま入力すると文字を置き換えます。もう一度クリックすると文字の途中も編集できます。ドラッグかShift＋クリックで同じ行を範囲選択し、長押しして浮いたらまとめて移動できます。'],
  ['マスの移動・コピー','入力済みマスの左下をドラッグすると、同じ行に移動します。移動先にある入力は上書きされます。マス全体のコピー・貼り付けでは、フォームや音価も保持します。Ctrl／⌘＋Zで取り消せます。'],
  ['横方向の拡大・縮小','編集カードの −／＋ でマスの横幅を調整できます。中央のパーセントを押すと100%に戻ります。'],
  ['行の数字','8分 → 16分 → 4分 → 全（小節全体）→ 2分で切り替えます。表示中の1〜4小節のその行へ適用し、既存の音や歌詞は消しません。'],
  ['拍の右下の数字','その拍だけ細かさを固定します。ロックした拍は行の単位を変えても保持します。全・2分は固定した拍の前後をまとめます。'],
  ['「コード」横の▼','選んだマスのコード入力・運指画面をコード行のすぐ下に開きます。もう一度押すと閉じます。']
 ]],
 ['再生とSpace',[
  ['譜面上でSpace','選択中の小節から再生・停止します。複数の小節を選んでいるときは、その範囲を繰り返します。'],
  ['音量','「音設定」でコード・メロディ・メトロノームの音量を別々に調整できます。再生中にも反映されます。'],
  ['メトロノーム','「音設定」のチェックをオンにすると、譜面の再生中も拍を鳴らします。カウントインとは別に切り替えられます。'],
  ['カウントイン','「音設定」のチェックをオンにすると、譜面の再生前に1小節だけ拍を鳴らします。範囲ループでは最初の1回だけです。'],
  ['編集カードの余白でSpace','表示中の小節を再生・停止します。鍵盤を開いているときは、メロディだけを再生します。'],
  ['ストロークのマスでSpace','そのマスに休符を入力します。'],
  ['文字を入力しているとき','Spaceは文字入力に使われます。再生するときは、再生ボタンを押してください。']
 ]],
 ['マスと小節の移動',[
  ['Enter','次のマスへ進みます。最後のマスでは次の小節へ進みます。曲の最後では同じ位置にとどまります。'],
  ['Tab／Shift＋Tab','次のマス／前のマスへ移動します。小節の端では、隣の小節へ移動します。'],
  ['←／→','前後のマスへ移動します。ドレミでは、マス内の音を順に選んでから隣のマスへ移動します。'],
  ['↑／↓','コード・歌詞・ドレミのマスでは、上下の行へ移動します。'],
  ['マスを選んでいないとき','上下左右キーで小節を選びます。譜面でEnterを押すと編集カードが開きます。']
 ]],
 ['ストロークの入力',[
  ['↓／↑','ストロークの種類を切り替えます。Dでダウン、Uでアップを直接入力できます。'],
  ['Shift＋↑／↓','上下の行へ移動します。'],
  ['R／Space','休符を入力します。'],
  ['X／〜','Xはミュート、〜は前のストロークを伸ばす指定です。'],
  ['Delete／Backspace','そのマスを空欄（未入力）に戻します。']
 ]],
 ['保存・元に戻す・終了',[
  ['Ctrl／⌘＋S','曲を保存します。入力に不備がある場合は、先に修正してください。'],
  ['Ctrl／⌘＋Z','元に戻します。Shiftも押すと、やり直します。文字入力中は、文字の編集操作が優先されます。'],
  ['Escape','ヘルプや補助画面を閉じます。マスの入力中は、まずマスからフォーカスを外します。']
 ]]
];
export function createEditorHelp({document:doc,closed=()=>{}}){
 let dialog=null;
 const node=(tag,text,parent)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(parent)parent.appendChild(e);return e;};
 function close({restoreFocus=true}={}){if(dialog){dialog.restoreHelpFocus=restoreFocus;dialog.close();}}
 function open({host,trigger,returnFocus}={}){
  if(dialog||!host)return false;
  const previous=returnFocus||doc.activeElement,current=node('dialog');dialog=current;
  current.id='sc-editor-help';current.className='sc-editor-help-dialog';current.dataset.editorHelp='';current.setAttribute('aria-labelledby','sc-editor-help-title');current.setAttribute('aria-describedby','sc-editor-help-description');current.restoreHelpFocus=true;
  const head=node('header',undefined,current),title=node('h2','編集の操作ガイド',head),dismiss=node('button','閉じる',head);title.id='sc-editor-help-title';dismiss.type='button';dismiss.dataset.editorHelpClose='';
  const body=node('div',undefined,current);body.className='sc-editor-help-body';body.tabIndex=0;body.setAttribute('aria-label','操作一覧');const intro=node('p','使う場所によって、Spaceや矢印キーの動きが変わります。',body);intro.id='sc-editor-help-description';
  for(const [name,rows]of TOPICS){const section=node('section',undefined,body);node('h3',name,section);const table=node('table',undefined,section);table.setAttribute('aria-label',name);const tbody=node('tbody',undefined,table);for(const [key,explanation]of rows){const row=node('tr',undefined,tbody),label=node('th',undefined,row);label.scope='row';node('span',key,label);node('td',explanation,row);}}
  node('p','日本語の変換中は、変換操作が優先されます。',body);
  dismiss.addEventListener('click',()=>close());
  current.addEventListener('keydown',event=>{event.stopPropagation();if(event.isComposing||event.keyCode===229)return;if(event.key==='Tab'){event.preventDefault();const items=Array.from(current.querySelectorAll('button,[tabindex="0"]')),index=items.indexOf(doc.activeElement),next=(index+(event.shiftKey?-1:1)+items.length)%items.length;items[next].focus({preventScroll:true});}else if(event.key==='Escape'){event.preventDefault();close();}else if(['Backspace','Delete'].includes(event.key))event.preventDefault();else if((event.ctrlKey||event.metaKey)&&['s','z'].includes(event.key.toLowerCase()))event.preventDefault();});
  current.addEventListener('cancel',event=>{event.preventDefault();close();});
  current.addEventListener('close',()=>{if(dialog===current)dialog=null;current.remove();trigger?.setAttribute('aria-expanded','false');closed();if(current.restoreHelpFocus){const target=previous?.isConnected?previous:trigger?.isConnected?trigger:null;target?.focus({preventScroll:true});}});
  if(!doc.getElementById('sc-editor-help-style')){const style=node('style');style.id='sc-editor-help-style';style.textContent=`
.sc-editor-help-dialog{position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);margin:0;box-sizing:border-box;width:min(660px,calc(100vw - 24px));max-height:88dvh;overflow:auto;padding:20px;border:1px solid var(--studio-border-default);border-radius:14px;background:var(--studio-panel);color:var(--studio-text-primary);font:14px/1.65 sans-serif;}
.sc-editor-help-dialog::backdrop{background:rgba(0,0,0,.45);}.sc-editor-help-dialog header{position:sticky;top:-20px;background:var(--studio-panel);display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;z-index:1;}.sc-editor-help-dialog h2{font-size:19px;margin:0;}.sc-editor-help-dialog button{font:inherit;padding:7px 12px;white-space:nowrap;border:1px solid var(--studio-border-default);border-radius:7px;background:var(--studio-control);color:inherit;}.sc-editor-help-dialog h3{font-size:15px;margin:18px 0 5px;color:var(--studio-accent);}.sc-editor-help-dialog p{font-size:12px;color:var(--studio-text-secondary);}.sc-editor-help-dialog table{width:100%;border-collapse:collapse;table-layout:fixed;}.sc-editor-help-dialog th,.sc-editor-help-dialog td{text-align:left;vertical-align:top;padding:9px 6px;border-bottom:1px solid var(--studio-border-default);overflow-wrap:anywhere;}.sc-editor-help-dialog th{width:32%;font-weight:600;font-size:12px;}.sc-editor-help-dialog td{font-size:13px;}.sc-editor-help-body:focus-visible{outline:2px solid var(--studio-accent);outline-offset:2px;}
@media(max-width:480px){.sc-editor-help-dialog{padding:14px;}.sc-editor-help-dialog header{top:-14px;}.sc-editor-help-dialog h2{font-size:17px;}}
@media print{.sc-editor-help-dialog,.sc-editor-help-dialog::backdrop{display:none!important;}}
`;doc.head.appendChild(style);}
  host.appendChild(current);trigger?.setAttribute('aria-expanded','true');bindOutsideDismiss(current,{close});current.showModal();body.focus({preventScroll:true});return true;
 }
 return {open,close,get isOpen(){return !!dialog?.open;}};
}
