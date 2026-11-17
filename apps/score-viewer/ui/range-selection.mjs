// Pointer capture allows a range to start in paper margins and cross rows.
// Touch keeps native pan/zoom; taps select a bar. Music bytes are never edited.
export function bindRangeSelection(viewport,{bars,enabled,select,clear}){
 const doc=viewport.ownerDocument;let drag=null,suppress=false;
 function nearest(x,y){let best=null,distance=Infinity;for(const b of bars()){const r=b.getBoundingClientRect(),dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom),d=dx*dx+dy*dy;if(d<distance){distance=d;best=b;}}return best;}
 const number=b=>Number(b.dataset.barNumber)-1;
 const down=e=>{if(e.button!==0||e.pointerType==='touch'||!enabled()||e.target.closest('button,input,select,dialog,.sheet-form-event'))return;const b=e.target.closest('.sheet-bar[data-bar-number]')||nearest(e.clientX,e.clientY);if(!b)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,index:number(b),moved:false,shift:e.shiftKey};};
 const move=e=>{if(!drag||drag.id!==e.pointerId)return;if(!enabled()){drag=null;return;}if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;if(!drag.moved){drag.moved=true;viewport.setPointerCapture(e.pointerId);}e.preventDefault();doc.getSelection()?.removeAllRanges();const b=nearest(e.clientX,e.clientY);if(b)select(drag.index,number(b),false);const r=viewport.getBoundingClientRect();if(e.clientY>r.bottom-24)viewport.scrollTop+=12;if(e.clientY<r.top+24)viewport.scrollTop-=12;if(e.clientX>r.right-24)viewport.scrollLeft+=12;if(e.clientX<r.left+24)viewport.scrollLeft-=12;};
 const up=e=>{if(!drag||drag.id!==e.pointerId)return;if(drag.moved){suppress=true;setTimeout(()=>suppress=false,0);}drag=null;};
 const click=e=>{if(suppress){e.preventDefault();e.stopPropagation();return;}if(!enabled()||e.target.closest('button,input,select,dialog,.sheet-form-event'))return;const b=e.target.closest('.sheet-bar[data-bar-number]');if(b)select(number(b),number(b),e.shiftKey);else clear();};
 const cancel=()=>{drag=null;};viewport.addEventListener('pointerdown',down);viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',up);viewport.addEventListener('pointercancel',cancel);viewport.addEventListener('lostpointercapture',cancel);viewport.addEventListener('click',click);
 return ()=>{for(const [name,fn]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel],['click',click]])viewport.removeEventListener(name,fn);};
}
