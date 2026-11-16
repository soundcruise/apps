// Reparent controls, preserving their listeners and format owner. A short
// landscape screen keeps reading/stop/zoom usable without a multi-row file bar.
export function mountCompactToolbars(host){
    const media=matchMedia('(max-height:500px)'),records=new Map();let frame=null;
    function update(){frame=null;for(const bar of host.querySelectorAll('.sv-toolbar')){
        if(media.matches&&!records.has(bar)){
            const original=Array.from(bar.childNodes),zoom=bar.querySelector('.sv-zoom'),details=document.createElement('details'),summary=document.createElement('summary'),panel=document.createElement('div');
            details.className='sv-short-menu';summary.textContent='ファイル・表示';details.append(summary,panel);bar.replaceChildren(details);for(const child of original)if(child!==zoom)panel.append(child);if(zoom)bar.append(zoom);
            panel.addEventListener('click',e=>{if(e.target.closest('button'))details.open=false;});records.set(bar,{original});
        }else if(!media.matches&&records.has(bar)){bar.replaceChildren(...records.get(bar).original);records.delete(bar);}
    }}
    const schedule=()=>{if(frame===null)frame=requestAnimationFrame(update);};
    const observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:true});media.addEventListener('change',schedule);update();
    return {dispose(){observer.disconnect();media.removeEventListener('change',schedule);if(frame!==null)cancelAnimationFrame(frame);for(const [bar,{original}]of records)bar.replaceChildren(...original);records.clear();}};
}
