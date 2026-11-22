import {appendIllustratedGuide} from './page-help.mjs';
import {bindOutsideDismiss} from '../score-ui.mjs';
// Read-only help. Editing, storage and playback remain owned by the existing editor.
const TOPICS=[
 ['文字・コード・メロディを入力する',[
  ['書き換える','マスを1回クリックして、そのまま文字を打ちます。'],
  ['一部を直す','選んだマスをもう一度クリック。点滅するカーソルを直したい位置に移します。'],
  ['フォーム・鍵盤','コード行の▼でコードとフォームを選べます。メロディ行の▼で鍵盤を開き、選んだマスに音を入れます。']
 ]],
 ['ストロークを入れる・消す',[
  ['↓ ダウン　↑ アップ','マスを選び、Dでダウン、Uでアップ。マウスだけなら、同じマスをクリックするたびに種類が変わります。上下キーでも切り替えられます。'],
  ['× ミュート　〜 伸ばし','Xでミュート。〜で直前のストロークを伸ばします。'],
  ['休符・空欄','RかSpaceで休符を入れ、鳴っている音を止めます。DeleteかBackspaceで空欄にすると、その位置では弦を弾きません。'],
  ['コード入力時','同じ位置のストロークが空欄なら、コードを入れると表・裏に合わせて自動入力されます。']
 ]],
 ['マスの音価を変える',[
  ['行をそろえる','小節の左側で、行名の横の音価を選びます。表示中のすべての小節の同じ行に適用されます。長さが異なると「混在」と表示されます。'],
  ['1マスを変える','マス右下で全音符から32分音符まで選べます。例えば、後半の8分を16分にすると、1拍が8分＋16分＋16分になります。'],
  ['キーで変える','マスを選び、Shift＋プラスで短く、Shift＋マイナスで長くします。ピリオド（.）で付点を付け外しできます。'],
  ['音を伸ばす','メロディは選んだ長さだけ鳴ります。2分なら2拍です。途中に別の入力がある長さは選べません。']
 ]],
 ['マスを選んでコピー・移動する',[
  ['範囲を選ぶ','同じ行をドラッグするか、最初のマスを選んでから最後のマスをShift＋クリックします。'],
  ['コピーして貼る','Ctrl／⌘＋Cでコピー。貼り始めるマスを選んでCtrl／⌘＋V。伸ばしは、音を鳴らすマスから一緒に選びます。'],
  ['移動する','入力済みマスの左下の点をドラッグ。または長押しして浮いたら移動します。移動先の入力は上書きされます。']
 ]],
 ['隣のマス・小節へ移る',[
  ['次へ・前へ','EnterかTabで次のマス、Shift＋Tabで前のマスへ。小節の端を越えると隣の小節に移ります。'],
  ['左右キー','マスの選択中は左右に移動します。メロディはマス内の音を順に選びます。文字の編集中はカーソルが移動します。'],
  ['行を移る','上下キーで行を移ります。ストローク行ではShift＋上下キーを使います。'],
  ['見える範囲','上の「1小節」〜「4小節」で表示数を選びます。−／＋で横幅を変え、中央の倍率を押すと100%に戻ります。']
 ]],
 ['カードの大きさを変える',[
  ['幅だけ調整','右端を左右にドラッグして、カードの幅を変えます。'],
  ['マスや文字も拡大・縮小','右下の斜線をドラッグすると、カードと一緒にマスや文字の大きさが変わります。'],
  ['最大化・元に戻す','右上の最大化ボタンを押すと、作業領域いっぱいに広がります。もう一度押すと、元の大きさと位置に戻ります。']
 ]],
 ['再生・停止する',[
  ['編集中の小節','上の「▶ 再生」を押します。編集画面の余白ではSpaceでも再生・停止できます。鍵盤を開いているときはメロディを試聴します。'],
  ['曲の譜面','小節を選んでSpace。複数選ぶとその範囲を反復します。「音設定」で各パートの音量、メトロノーム、カウントインを調整できます。'],
  ['Spaceで休符が入るとき','ストロークのマスにフォーカスがあります。再生ボタンを押してください。']
 ]],
 ['取り消す・保存する',[
  ['取り消し','Ctrl／⌘＋Z。やり直しはShiftも押します。文字の編集中は、その文字の編集が優先されます。'],
  ['保存','「保存」またはCtrl／⌘＋S。日本語の変換中は先に確定してください。'],
  ['閉じる','ガイドは「閉じる」かEsc。編集画面に戻ります。']
 ]]
];
export function createEditorHelp({document:doc,closed=()=>{}}){
 let dialog=null;
 const node=(tag,text,parent)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(parent)parent.appendChild(e);return e;};
 function close({restoreFocus=true}={}){if(dialog){dialog.restoreHelpFocus=restoreFocus;dialog.close();}}
 function open({host,trigger,returnFocus}={}){
  if(dialog||!host)return false;
  const previous=returnFocus||doc.activeElement,current=node('dialog');dialog=current;
  current.id='sc-editor-help';current.className='sc-editor-help-dialog';current.dataset.editorHelp='';current.setAttribute('aria-labelledby','sc-editor-help-title');current.restoreHelpFocus=true;
  const head=node('header',undefined,current),title=node('h2','編集の操作ガイド',head),dismiss=node('button','閉じる',head);title.id='sc-editor-help-title';dismiss.type='button';dismiss.dataset.editorHelpClose='';
  const body=node('div',undefined,current);body.className='sc-editor-help-body';body.tabIndex=0;body.setAttribute('aria-label','操作一覧');
  appendIllustratedGuide(body,'editor','小節編集');
  for(const [i,[name,rows]] of TOPICS.entries()){
   const topic=node('details',undefined,body);
   topic.name='sc-editor-help-topic';topic.open=i===0;
   node('summary',name,topic);
   const list=node('dl',undefined,topic);
   for(const [label,description] of rows){node('dt',label,list);node('dd',description,list);}
  }
  dismiss.addEventListener('click',()=>close());
  current.addEventListener('keydown',event=>{event.stopPropagation();if(event.isComposing||event.keyCode===229)return;if(event.key==='Tab'){event.preventDefault();const items=Array.from(current.querySelectorAll('button,a[href],summary,[tabindex="0"]')),index=items.indexOf(doc.activeElement),next=(index+(event.shiftKey?-1:1)+items.length)%items.length;items[next].focus();}else if(event.key==='Escape'){event.preventDefault();close();}else if(['Backspace','Delete'].includes(event.key))event.preventDefault();else if((event.ctrlKey||event.metaKey)&&['s','z'].includes(event.key.toLowerCase()))event.preventDefault();});
  current.addEventListener('cancel',event=>{event.preventDefault();close();});
  current.addEventListener('close',()=>{if(dialog===current)dialog=null;current.remove();trigger?.setAttribute('aria-expanded','false');closed();if(current.restoreHelpFocus){const target=previous?.isConnected?previous:trigger?.isConnected?trigger:null;target?.focus({preventScroll:true});}});
  if(!doc.getElementById('sc-editor-help-style')){const style=node('style');style.id='sc-editor-help-style';style.textContent=`
.sc-editor-help-dialog{position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);margin:0;box-sizing:border-box;width:min(860px,calc(100vw - 24px));max-height:88dvh;overflow:auto;padding:20px;border:1px solid var(--studio-border-default);border-radius:14px;background:var(--studio-panel);color:var(--studio-text-primary);font:14px/1.65 sans-serif;}
.sc-editor-help-dialog::backdrop{background:rgba(0,0,0,.45);}.sc-editor-help-dialog header{position:sticky;top:-20px;background:var(--studio-panel);display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;z-index:1;}.sc-editor-help-dialog h2{font-size:19px;margin:0;}.sc-editor-help-dialog button{font:inherit;padding:7px 12px;white-space:nowrap;border:1px solid var(--studio-border-default);border-radius:7px;background:var(--studio-control);color:inherit;}.sc-editor-help-body details{border-top:1px solid var(--studio-border-default);}.sc-editor-help-body summary{padding:11px 4px;font-weight:600;cursor:pointer;}.sc-editor-help-body dl{margin:0 4px 14px 20px;}.sc-editor-help-body dt{font-weight:600;margin-top:9px;}.sc-editor-help-body dd{margin:1px 0 0;line-height:1.55;}.sc-editor-help-body summary:focus-visible{outline:2px solid var(--studio-accent);}.sc-editor-help-body:focus-visible{outline:2px solid var(--studio-accent);outline-offset:2px;}
@media(max-width:480px){.sc-editor-help-dialog{padding:14px;}.sc-editor-help-dialog header{top:-14px;}.sc-editor-help-dialog h2{font-size:17px;}}
@media print{.sc-editor-help-dialog,.sc-editor-help-dialog::backdrop{display:none!important;}}
`;doc.head.appendChild(style);}
  host.appendChild(current);trigger?.setAttribute('aria-expanded','true');bindOutsideDismiss(current,{close});current.showModal();body.focus({preventScroll:true});return true;
 }
 return {open,close,get isOpen(){return !!dialog?.open;}};
}
