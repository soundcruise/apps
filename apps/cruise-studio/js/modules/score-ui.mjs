export {startCountInSupport,COUNT_IN_OUTPUT_SETTLE_SECONDS,GUITAR_LEAD_SECONDS,outputContextTime,trimSampleAttack,metronomeSample,METRONOME_SOUNDS,normalizeMetronomeSound} from './score-audio.mjs';
// Presentation helpers shared by the score editor and the read-only viewer.
// They own no music, transport, storage or account state.
// This preference belongs to the output device's browser, across songs and views.
const countSupportKey = 'cruise.score.countInOutputSupport';
let temporaryCountSupport;
export function countInSupportEnabled() {
    if (temporaryCountSupport !== undefined) return temporaryCountSupport;
    try { return localStorage.getItem(countSupportKey) === '1'; }
    catch { return false; }
}
export function addCountInSupportOption(parent) {
    const doc = parent.ownerDocument, row = doc.createElement('label'), input = doc.createElement('input');
    row.className = 'sc-playback-option';
    input.type = 'checkbox';
    input.checked = countInSupportEnabled();
    input.dataset.countInSupport = '';
    row.title = '次のカウントインから、最初の拍の少し前と拍の間に小さな準備音を流します。';
    input.onchange = () => {
        try {
            localStorage.setItem(countSupportKey, input.checked ? '1' : '0');
            temporaryCountSupport = undefined;
        } catch { temporaryCountSupport = input.checked; }
    };
    const caption = doc.createElement('span');
    caption.textContent = 'カウントインの音切れ対策（HDMIなど）';
    row.append(input, caption);
    parent.append(row);
}
// Browsers deliver trackpad pinch as either a modified wheel or a native gesture.
export const MIN_SCORE_ZOOM=.25, MAX_SCORE_ZOOM=4;
export function playbackRowTop(top,bottom,height){
    return top+Math.max(0,bottom-top-height)*.3;
}
export function bindScoreZoom(surface,{read,write,paper,scrollX,scrollY,enabled=()=>true,min=MIN_SCORE_ZOOM,max=MAX_SCORE_ZOOM,signal}){
    const win=surface.ownerDocument.defaultView, options={passive:false,signal};
    let start=null, pending=1, frame=0, x,y;
    function schedule(value,event){
        pending=Math.max(min,Math.min(max,value));
        x=event.clientX;y=event.clientY;
        if(frame)return;
        frame=win.requestAnimationFrame(()=>{
            frame=0;
            if(!surface.isConnected||signal?.aborted||pending===read())return;
            const element=paper?.(), before=element?.getBoundingClientRect();
            write(pending);
            if(!before?.width)return;
            const after=element.getBoundingClientRect(),ratio=after.width/before.width;
            const sx=scrollX?.()??surface,sy=scrollY?.()??surface;
            if(Number.isFinite(x))sx.scrollLeft+=after.left+(x-before.left)*ratio-x;
            if(Number.isFinite(y))sy.scrollTop+=after.top+(y-before.top)*ratio-y;
        });
    }
    surface.addEventListener('wheel',event=>{
        if(event.defaultPrevented||!(event.ctrlKey||event.metaKey)||!event.deltaY||!enabled(event))return;
        event.preventDefault();
        if(start!==null)return;
        const unit=event.deltaMode===1?16:event.deltaMode===2?surface.clientHeight:1;
        schedule((frame?pending:read())*Math.exp(-event.deltaY*unit*.008),event);
    },options);
    surface.addEventListener('gesturestart',event=>{
        if(event.defaultPrevented||!enabled(event))return;
        event.preventDefault();start=frame?pending:read();
    },options);
    surface.addEventListener('gesturechange',event=>{
        if(start===null||!(event.scale>0))return;
        event.preventDefault();schedule(start*event.scale,event);
    },options);
    surface.addEventListener('gestureend',event=>{
        if(start!==null)event.preventDefault();
        start=null;
    },options);
}
export const defaultHighlightOpacity=.12;
export const scoreColors=Object.freeze({line:'#286780',border:'#408aa7',fill:'rgba(64,138,167,.12)',ink:'#265d72'});
export function applyScoreTheme(root,colors={}){const valid=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c),highlight=valid(colors.highlight)?colors.highlight:null;const opacity=typeof colors.opacity==='number'&&Number.isFinite(colors.opacity)?Math.max(0,Math.min(1,colors.opacity)):defaultHighlightOpacity;const fillColor=highlight||scoreColors.border;const fill=highlight||opacity!==defaultHighlightOpacity?fillColor+Math.round(opacity*255).toString(16).padStart(2,'0'):scoreColors.fill;const values={...scoreColors,fill,...(highlight?{border:highlight,ink:highlight}:{}),...(valid(colors.playhead)?{line:colors.playhead}:{})};for(const [key,value]of Object.entries(values))if(root.style.getPropertyValue('--score-'+key)!==value)root.style.setProperty('--score-'+key,value);}
export function placePlayhead(line,parent,{x,y=0,height}){
 if(line.parentElement!==parent)parent.append(line);
 Object.assign(line.style,{left:'0px',top:'0px',bottom:'auto',height:Math.max(0,height)+'px',transform:'translate3d('+x+'px,'+y+'px,0)',willChange:'transform',pointerEvents:'none'});
}
// Let the compositor traverse a musical segment even if a UI frame is missed.
const playheadMotions = new WeakMap();
export function movePlayhead(line, parent, {left, width, y, height, fraction, seconds, segment, nextSegment}) {
 const x = left + width * fraction;
 const duration = seconds * 1000;
 const elapsed = duration * fraction;
 const motion = playheadMotions.get(line);
 // Scrolling a scaled score can change DOMRect differences by fractions of a CSS pixel.
 // Compare against the original geometry so small real layout changes still accumulate.
 if (motion && line.parentElement === parent && motion.segment === segment && motion.duration === duration &&
     Math.abs(motion.left-left)<.25 && Math.abs(motion.width-width)<.25 &&
     Math.abs(motion.y-y)<.25 && Math.abs(motion.height-height)<.25 && fraction>0 && fraction<1) {
   if (Math.abs(motion.animation.currentTime-elapsed)>=35) motion.animation.currentTime=elapsed;
   return;
 }
 motion?.animation.cancel();
 playheadMotions.delete(line);
 placePlayhead(line, parent, {x, y, height});
 if (!line.animate || !(duration > 0) || !(fraction > 0 && fraction < 1)) return;
 const transform = (x, top) => 'translate3d('+x+'px,'+top+'px,0)';
 const frames = [{offset:0, transform:transform(left,y)}, {offset:1, transform:transform(left+width,y)}];
 let total = duration;
 // Queue the actual next bar before the boundary. Equal offsets jump to a new
 // row without drawing a diagonal line or waiting for another main-thread frame.
 const next = nextSegment?.();
 if (next && next.seconds > 0 && height > 0) {
   total += next.seconds * 1000;
   const boundary = duration / total;
   frames[1].offset = boundary;
   line.style.transformOrigin = 'top left';
   const scale = ' scaleY('+next.height/height+')';
   frames.push({offset:boundary, transform:transform(next.left,next.y)+scale},
               {offset:1, transform:transform(next.left+next.width,next.y)+scale});
 }
 const animation = line.animate(frames, {duration:total, easing:'linear', fill:'both'});
 animation.currentTime = elapsed;
 playheadMotions.set(line, {segment, left, width, y, height, duration, animation});
}
export function movePaperPlayhead(line,paper,bar,bounds,{fraction,seconds,nextBar}){
 const root=paper.getBoundingClientRect();
 const sx=root.width/paper.offsetWidth||1,sy=root.height/paper.offsetHeight||sx;
 const geometry=r=>({left:(r.left-root.left)/sx,y:(r.top-root.top)/sy,width:r.width/sx,height:r.height/sy});
 movePlayhead(line,paper,{...geometry(bounds),segment:bar,fraction,seconds,nextSegment:()=>{
   const following=nextBar();
   return following&&{...geometry(following.getBoundingClientRect()),seconds};
 }});
}
export function bindPlaybackButton(button,toggle){button.addEventListener('pointerdown',e=>{if(e.button===0)e.preventDefault();});button.onclick=toggle;}
export function syncPlaybackButton(button,phase,{stop=false,disabled=false,idle='▶ 再生'}={}){
 const moving=['playing','counting','loading'].includes(phase),text=phase==='loading'?'■ 中止':phase==='counting'?'■ カウント中':phase==='playing'?(stop?'■ 停止':'Ⅱ 一時停止'):idle;
 // Replacing unchanged text during pointer focus cancels clicks in WebKit.
 if(button.textContent!==text)button.textContent=text;if(button.disabled!==disabled)button.disabled=disabled;
 for(const [key,value]of [['aria-pressed',String(moving)],['aria-label',moving?(stop?'停止':'一時停止'):idle.replace('▶ ','')]])if(button.getAttribute(key)!==value)button.setAttribute(key,value);
}
// Both ends of a click must be outside. A slider drag beginning inside never
// dismisses its panel. Consume the click so it cannot also operate the score.
export function bindOutsideDismiss(dialog,{close=()=>dialog.close(),canClose=()=>true}={}){
 const doc=dialog.ownerDocument,events=new doc.defaultView.AbortController();let beganOutside=false;
 function outside(e){if(e.target!==dialog&&dialog.contains(e.target))return false;const r=dialog.getBoundingClientRect();return !dialog.contains(e.target)||e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;}
 function eligible(e){return dialog.open&&canClose()&&![...doc.querySelectorAll('dialog[open]')].some(other=>other!==dialog&&other.contains(e.target));}
 doc.addEventListener('pointerdown',e=>{beganOutside=e.button===0&&eligible(e)&&outside(e);},{capture:true,signal:events.signal});
 doc.addEventListener('pointercancel',()=>beganOutside=false,{capture:true,signal:events.signal});
 doc.addEventListener('click',e=>{const dismiss=beganOutside&&eligible(e)&&outside(e);beganOutside=false;if(dismiss){e.preventDefault();e.stopImmediatePropagation();close();}},{capture:true,signal:events.signal});
 dialog.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing&&e.keyCode!==229&&canClose()){e.preventDefault();e.stopPropagation();close();}},{signal:events.signal});
 dialog.addEventListener('close',()=>events.abort(),{once:true});return ()=>events.abort();
}

// Shared presentation of optional transport slots; each host keeps its own clock.
export function installScoreUI(doc){
 if(!doc.defaultView||doc.getElementById('score-ui-style'))return;
 const regions='#screen-sheet-cruise,#sc-slot-overlay,.sv-viewer,.sv-settings,.sc-layout-dialog,.sc-form-dialog,.sc-playback-dialog,dialog[class^="sc-"],dialog[class^="sv-"]';
 const controls='button,summary,input:not([type=hidden]),select,textarea,a[href],[role=button],[role=switch],[role=slider],[role=tab],[role=menuitem],[draggable=true]';
 const help={'表示':'譜面に表示する項目を選びます','詳細設定':'文字・フォームのサイズや色、線、配置を調整します','音設定':'音量・カウントイン・メトロノーム・音と棒の同期を調整します','ライブラリ':'この端末の譜面を開いて整理します','履歴':'変更前の譜面を確認し、選んだ時点へ戻します','適用':'選んだ範囲にパターンを仮適用します','メニュー':'曲の操作や表示・音の設定を開きます'};
 const generated=new WeakMap();
 function explain(event){
    const path=event.composedPath();
    if(!path.some(node=>node.matches?.(regions)))return;
    const el=path.find(node=>node.matches?.(controls));
    if(!el||el.title && el.title!==generated.get(el))return;
    const label=el.labels?.[0];
    const name=el.getAttribute('aria-label')||el.ownerDocument.getElementById(el.getAttribute('aria-labelledby'))?.textContent?.trim()||
        label?.querySelector('span')?.textContent?.trim()||Array.from(label?.childNodes||[]).filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).filter(Boolean).join(' ')||
        el.placeholder||el.textContent?.trim();
    if(!name)return;
    const value=help[name]||name;
    el.title=value;generated.set(el,value);
 }
 doc.addEventListener('pointerover',explain,true);doc.addEventListener('focusin',explain,true);
 const style=doc.createElement('style');style.id='score-ui-style';style.textContent=`
.score-transport{box-sizing:border-box;display:flex!important;align-items:center!important;justify-content:center!important;flex-wrap:nowrap!important;gap:10px!important;padding:8px 12px!important;min-height:62px;border:1px solid var(--studio-border-default,#62717e);border-radius:10px;background:#1e2832;color:#f5f1e8}
.score-transport .score-transport-main,.score-transport .score-transport-options{display:flex!important;align-items:center;flex-wrap:nowrap;gap:8px;min-width:0}
.score-transport .score-play{box-sizing:border-box;min-height:44px!important;min-width:108px;font:650 14px/1.3 system-ui!important;padding:8px 14px!important;border:1px solid #cdb474!important;border-radius:8px!important;background:linear-gradient(135deg,#e6d29b,#cdb474)!important;color:#201b11!important;white-space:nowrap}
.score-transport .score-audio-button{box-sizing:border-box;display:flex;align-items:center;gap:6px;justify-content:center;min-height:44px;min-width:44px;font:14px system-ui;padding:8px 12px;border:1px solid var(--studio-border-default,#62717e);border-radius:8px;background:var(--studio-control,#25313c);color:inherit;white-space:nowrap}
.score-transport .score-tempo{box-sizing:border-box;height:44px;padding:8px 12px;display:flex;gap:8px;align-items:center;border:1px solid var(--studio-border-default,#62717e);border-radius:8px;font:13px system-ui;white-space:nowrap}
.score-form-header{display:grid!important;grid-template-columns:76px minmax(0,1fr) 76px;gap:6px!important;align-items:center!important;margin-bottom:8px!important}
.score-form-header h2{grid-column:2;grid-row:1;min-width:0;margin:6px 0!important;text-align:center!important;font:650 34px/1.15 system-ui!important;overflow-wrap:anywhere}
.score-form-header [data-paper-form-edit]{grid-column:1;grid-row:1;justify-self:start}
.score-form-header [data-form-close],.score-form-header>button:last-child{grid-column:3;grid-row:1;justify-self:end}
.sc-form-dialog.sc-unified-form{inset:0;margin:auto;transform:none;height:fit-content;max-height:calc(100dvh - 32px);box-sizing:border-box;width:min(400px,calc(100vw - 32px));padding:18px;background:#fffdf7;color:#29251f;border-radius:14px;border:1px solid #8b857a}
.score-form-header [data-form-close]{white-space:nowrap;padding-inline:6px!important}
.score-form-header button{font:14px system-ui!important;padding:8px 10px!important;min-height:36px}
.score-display-menu>div{width:230px;min-width:230px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 130px);overflow:auto;box-sizing:border-box;padding:12px!important;gap:9px!important}.score-display-menu .sc-paper-visibility{display:grid!important;gap:9px!important;margin:0!important;padding:0!important;border:0!important}.score-display-menu .sc-paper-visibility>span{display:none!important}.score-display-menu label{display:flex!important;align-items:center;gap:10px!important;font:13px/1.5 system-ui!important;padding:3px!important;margin:0!important;white-space:nowrap}.score-display-menu input[type=checkbox]{width:16px!important;height:16px!important;margin:0!important;accent-color:#cdb474}.score-display-menu [id=sc-paper-settings]{margin-top:2px;border-top:1px solid #71839066!important;padding-top:12px!important}
.score-tempo-reset{display:block;margin-top:14px!important}
.score-metronome-tone{display:flex!important;align-items:center;flex-wrap:wrap;gap:10px 14px!important;margin:16px 0!important;line-height:1.5}
[data-metronome-sound]{box-sizing:border-box;min-height:44px!important;height:44px!important;min-width:140px;font:14px system-ui!important;padding:8px 12px!important;border:1px solid #718390;border-radius:7px;background:var(--studio-control,#25313c);color:inherit}
.sc-layout-playing{background:var(--score-fill,rgba(64,138,167,.12))!important;box-shadow:inset 0 0 0 1px var(--score-border,#408aa7)!important}
[data-layout-playhead]{position:absolute;top:0;left:0;width:2px;background:var(--score-line,#286780);pointer-events:none;z-index:5;will-change:transform}
@media(max-width:700px){.score-transport{gap:6px!important;padding:6px 8px!important;min-height:58px}.score-transport .score-transport-main,.score-transport .score-transport-options{gap:5px}.score-transport .score-play{min-width:88px;font-size:12px!important;padding:8px!important}.score-transport .score-audio-label{display:none}.score-transport .score-audio-button{padding:8px;min-width:38px}.score-transport .score-tempo{font-size:12px;padding:8px}}

.score-transport .sv-sound-modes{display:flex;gap:2px;padding:3px;border:1px solid #71839066;border-radius:9px;white-space:nowrap;align-items:center}
.score-transport .sv-sound-modes>span{display:none}.score-transport .sv-sound-modes button{min-height:36px!important;height:36px!important;padding:6px 10px!important;font:13px system-ui!important;border:1px solid transparent!important;border-radius:6px;background:transparent;color:inherit;white-space:nowrap}
.score-transport .sv-sound-modes button[aria-pressed=true]{color:#ead8a2!important;background:#cdb47425!important;border-color:#b49a55!important}
.score-transport .sv-sound-select{display:none;min-height:44px;border:1px solid #71839066;border-radius:8px;background:var(--studio-control,#25313c);color:inherit;font:12px system-ui;padding:4px;width:68px}
.score-transport .score-tempo{padding:0 8px 0 12px;gap:6px;font:11px system-ui}.score-transport .score-tempo input{box-sizing:border-box;width:56px;min-height:40px;height:40px;font:14px system-ui!important;padding:4px;border:0;background:transparent;color:inherit}
.score-transport .score-repeat{display:inline-flex;align-items:center;justify-content:center;min-height:44px!important;height:44px!important;min-width:40px;width:40px;padding:8px;border:1px solid #71839066;border-radius:8px;background:transparent;color:inherit}.score-transport .score-repeat[aria-pressed=true]{border-color:#b49a55;color:#ead8a2;background:#cdb47425}
.score-fullscreen-exit{position:absolute;right:14px;top:14px;z-index:30;min-height:40px;padding:8px 10px;background:#25313ce8;color:#f5f1e8;border:1px solid #718390;border-radius:8px}
.score-focus-actions{display:none}
.score-fullscreen>.score-focus-actions{display:flex;justify-content:flex-end;align-items:center;gap:6px;flex:none;position:sticky;top:0;z-index:30;background:#111b23}
.score-fullscreen .score-focus-actions>.score-fullscreen-exit{position:static}
.score-focus-settings{min-height:40px;padding:0 10px;border-radius:8px;background:#25313c;color:white}
.sc-layout-dialog [data-layout-field=barsPerLine]{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px}
.sc-layout-dialog [data-layout-field=barsPerLine]>span{grid-column:1/-1}
.sc-layout-dialog [data-layout-field=barsPerLine]>label{display:flex;align-items:center;gap:4px;white-space:nowrap}
.score-fullscreen .score-fullscreen-exit{right:calc(env(safe-area-inset-right) + 14px);top:calc(env(safe-area-inset-top) + 14px)}
#screen-sheet-cruise{container-type:inline-size;container-name:score}
#screen-sheet-cruise.sc-focused{position:fixed!important;inset:0!important;z-index:100000;width:100vw!important;height:100dvh!important;max-width:none;margin:0!important;padding:calc(12px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left))!important;box-sizing:border-box;overflow:auto!important;background:#111b23}
#screen-sheet-cruise.sc-focused>.screen-header,#screen-sheet-cruise.sc-focused>.workspace-local-nav,#screen-sheet-cruise.sc-focused>.sheet-toolbar,#screen-sheet-cruise.sc-focused>#sc-editor-drawer{display:none!important}
#screen-sheet-cruise.sc-focused #sc-transport{position:sticky;bottom:0}.score-fullscreen-exit[hidden]{display:none!important}
#screen-sheet-cruise #sc-fullscreen{min-height:44px;height:44px;width:44px;padding:10px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #71839066;border-radius:8px;background:var(--studio-control,#25313c);color:inherit}
.sc-layout-example-paper>.sv-sheet{position:relative!important;left:auto;top:auto}.sc-layout-example-paper .sv-sheet>.sheet-page{padding:56px}.sc-layout-dialog button,.sc-layout-dialog select{min-height:36px}.sc-layout-controls [data-layout-field=timingGrid]{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px}.sc-layout-controls [data-layout-field=timingGrid]>select{grid-column:1/-1}.sc-layout-controls [data-layout-field=timingGrid] input[type=checkbox]{margin:0}
.sv-unified-display.sc-layout-dialog{width:min(1080px,calc(100vw - 32px));padding:20px;max-height:90dvh}.sv-unified-display .sc-layout-controls{display:block}.sv-unified-display .sc-layout-field{margin:0 0 14px}.sv-unified-display .sc-layout-field input[type=range]{width:auto!important}.sv-unified-display .sc-text-size input{width:100%!important}.sv-unified-display .sc-layout-actions{display:flex;flex-wrap:nowrap}.sv-unified-display .sc-text-heading details select{width:155px!important}.sv-unified-display .sc-layout-example p{margin:6px 0 12px}.sv-unified-display.sc-layout-dialog .sc-layout-storage-note{font-size:12px}
@media(max-width:1050px){.score-transport .sv-sound-modes{display:none!important}.score-transport .sv-sound-select{display:block!important}.score-transport .score-audio-label{display:none}.score-transport .score-audio-button{padding:8px;min-width:38px}}
@container(max-width:1050px){.score-transport .sv-sound-modes{display:none!important}.score-transport .sv-sound-select{display:block!important}.score-transport .score-audio-label{display:none}.score-transport .score-audio-button{padding:8px;min-width:38px}}
@media(max-width:440px){.score-transport{gap:4px!important;padding:6px!important;min-height:58px}.score-transport .score-transport-main,.score-transport .score-transport-options{gap:4px!important}.score-transport .score-play{min-width:82px!important;padding:8px!important}.score-transport .score-repeat{min-width:36px;width:36px;padding:6px}.score-transport .score-audio-label{display:none}.score-transport .score-audio-button{min-width:36px;width:36px;padding:6px}.score-transport .score-tempo{width:64px;min-width:64px;padding:2px 4px;font-size:10px;gap:2px}.score-transport .score-tempo input{width:30px;min-width:30px;padding:0;font-size:12px!important;appearance:textfield;-moz-appearance:textfield}.score-transport .score-tempo input::-webkit-inner-spin-button,.score-transport .score-tempo input::-webkit-outer-spin-button{appearance:none;margin:0}.score-transport .sv-sound-select{display:block!important;width:50px;min-width:50px;padding:3px;font-size:11px}.score-transport .sv-sound-modes{display:none!important}}
@container(max-width:440px){.score-transport{gap:4px!important;padding:6px!important;min-height:58px}.score-transport .score-transport-main,.score-transport .score-transport-options{gap:4px!important}.score-transport .score-play{min-width:82px!important;padding:8px!important}.score-transport .score-repeat{min-width:36px;width:36px;padding:6px}.score-transport .score-audio-label{display:none}.score-transport .score-audio-button{min-width:36px;width:36px;padding:6px}.score-transport .score-tempo{width:64px;min-width:64px;padding:2px 4px;font-size:10px;gap:2px}.score-transport .score-tempo input{width:30px;min-width:30px;padding:0;font-size:12px!important;appearance:textfield;-moz-appearance:textfield}.score-transport .score-tempo input::-webkit-inner-spin-button,.score-transport .score-tempo input::-webkit-outer-spin-button{appearance:none;margin:0}.score-transport .sv-sound-select{display:block!important;width:50px;min-width:50px;padding:3px;font-size:11px}.score-transport .sv-sound-modes{display:none!important}}
@media(max-width:360px){.score-transport .score-play{min-width:74px!important}.score-transport .score-tempo{width:60px;min-width:60px;padding:2px}.score-transport .sv-sound-select{width:46px;min-width:46px}}
@container(max-width:360px){.score-transport .score-play{min-width:74px!important}.score-transport .score-tempo{width:60px;min-width:60px;padding:2px}.score-transport .sv-sound-select{width:46px;min-width:46px}}
/* iOS zooms focused controls with small text. Keep touch input readable
   without disabling pinch zoom or widening the one-line transport. */
@media(pointer:coarse){
.score-transport .score-tempo input,.score-transport .sv-sound-select{font-size:16px!important}
@container(max-width:440px){.score-transport .score-play{min-width:78px!important}.score-transport .score-tempo{width:60px;min-width:60px}.score-transport .score-tempo input{width:32px;min-width:32px}.score-transport .sv-sound-select{width:58px;min-width:58px}}
}
@media(pointer:coarse) and (max-width:440px){.score-transport .score-play{min-width:78px!important}.score-transport .score-tempo{width:60px;min-width:60px}.score-transport .score-tempo input{width:32px;min-width:32px}.score-transport .sv-sound-select{width:58px;min-width:58px}}
@media print{.score-transport,[data-layout-playhead]{display:none!important}.sc-layout-playing{background:transparent!important;box-shadow:none!important}}
`;doc.head.append(style);
}
export function styleAudioButton(button){button.classList.add('score-audio-button');button.setAttribute('aria-label','音設定');button.title='音設定';button.textContent='';const icon=button.ownerDocument.createElement('span'),label=button.ownerDocument.createElement('span');icon.textContent='♫';icon.setAttribute('aria-hidden','true');label.textContent='音設定';label.className='score-audio-label';button.append(icon,label);}

export function mountScoreFullscreen(host,parent,{className='sv-focused',attribute='viewerFocus',openSettings}={}){
 const doc=host.ownerDocument,win=doc.defaultView;let enabled=false,disposed=false;
 const button=doc.createElement('button'),exit=doc.createElement('button');button.type=exit.type='button';button.dataset[attribute]='';parent.append(button);exit.className='sv-focus-exit score-fullscreen-exit';exit.hidden=true;host.append(exit);
 const settings=doc.createElement('button');
 const focusActions=doc.createElement('div');
 if(openSettings){settings.type='button';settings.textContent='表示設定';settings.className='score-focus-settings';settings.onclick=openSettings;focusActions.className='score-focus-actions';focusActions.append(settings,exit);host.prepend(focusActions);}
 function icon(b,collapse,text){const path=collapse?'M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5':'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5';b.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="'+path+'" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';b.setAttribute('aria-label',text);b.title=text;b.classList.add('sv-icon-button');}
 function paint(){host.classList.toggle(className,enabled);host.classList.toggle('score-fullscreen',enabled);host.dispatchEvent(new win.Event('scorefullscreenchange'));settings.hidden=exit.hidden=!enabled;button.setAttribute('aria-pressed',String(enabled));icon(button,enabled,enabled?'全画面モードを終了':'全画面モード');icon(exit,true,'全画面モードを終了');win.dispatchEvent(new win.Event('resize'));}
 async function toggle(value){enabled=value;paint();if(value){try{await host.requestFullscreen?.();if(!enabled&&doc.fullscreenElement===host)await doc.exitFullscreen();}catch{}}else if(doc.fullscreenElement===host)try{await doc.exitFullscreen();}catch{}}
 button.onclick=()=>void toggle(!enabled);exit.onclick=()=>void toggle(false);
 const key=e=>{if(enabled&&e.key==='Escape'&&!doc.querySelector('dialog[open]')){e.preventDefault();e.stopPropagation();void toggle(false);}},full=()=>{if(!doc.fullscreenElement&&enabled){enabled=false;paint();}};
 doc.addEventListener('keydown',key,true);doc.addEventListener('fullscreenchange',full);paint();
 return {button,exit(){if(!disposed)void toggle(false);},dispose(){void toggle(false);disposed=true;doc.removeEventListener('keydown',key,true);doc.removeEventListener('fullscreenchange',full);}};
}

export function mountSoundModes({parent,button,read,change}){
    const group=parent.ownerDocument.createElement('div');group.className='sv-sound-modes';group.setAttribute('role','group');group.setAttribute('aria-label','再生する音');parent.append(group);
    const buttons=new Map(),label=parent.ownerDocument.createElement('span');label.textContent='音';group.append(label);
    const doc=parent.ownerDocument;
    const picker=doc.createElement('div'),compact=doc.createElement('select'),caption=doc.createElement('span');
    picker.className='sv-sound-picker';
    compact.className='sv-sound-select';
    compact.setAttribute('aria-label','再生する音');
    caption.setAttribute('aria-hidden','true');
    picker.append(compact,caption);
    group.after(picker);
    for(const [mode,text,short] of [['mute','ミュート','消音'],['click','メトロノーム','拍音'],['all','全部鳴らす','全部']]){
        const option=doc.createElement('option');
        option.value=mode;
        option.textContent=text;
        option.dataset.short=short;
        compact.append(option);
        const b=button(text,'sound-'+mode,group);buttons.set(mode,b);b.title=mode==='mute'?'音を鳴らさず画面だけ送る':text;
        b.onclick=()=>{const s=read();if(!s)return;change({metronome:mode!=='mute',mix:{chords:mode==='all'?100:0,melody:mode==='all'?100:0,metronome:mode==='mute'?0:100}});};
    }
    compact.onchange=()=>buttons.get(compact.value).click();
    return ()=>{const s=read(),m=s?.settings.mix;const mode=!m?null:m.chords>0||m.melody>0?'all':s.settings.metronome&&m.metronome>0?'click':'mute';compact.disabled=!s;if(mode)compact.value=mode;caption.textContent=compact.selectedOptions[0].dataset.short;for(const [key,b]of buttons){b.disabled=!s;b.setAttribute('aria-pressed',String(key===mode));}};
}


export function styleRepeatButton(button){button.classList.add('score-repeat');button.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';}
