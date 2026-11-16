// Visible pages and their neighbors only, <=20MP total and <=4MP / 4096px per
// canvas. Very short/wide pages can occupy more tiles without exceeding budget.
// Placeholders retain geometry when canvases are evicted.
export function createPDFPaper({document:doc,pdf,sizes,onError=()=>{},onRendered=()=>{}}){
    const root=doc.createElement('div');root.className='sv-pdf-paper';
    const frames=sizes.map((_,i)=>{const f=doc.createElement('section');f.className='sv-pdf-page';f.dataset.pdfPage=i+1;f.setAttribute('aria-label',(i+1)+'ページ');root.append(f);return f;});
    const entries=new Map(),failed=new Set();let geometry=[],version=0,wanted=new Set(),running=false,disposed=false,pixelLimit=4e6;
    function release(i){const entry=entries.get(i);if(!entry)return;entries.delete(i);delete frames[i].dataset.pdfReady;entry.task?.cancel();entry.canvas.width=entry.canvas.height=0;entry.canvas.remove();if(entry.page)void Promise.resolve(entry.task?.promise).catch(()=>{}).then(()=>entry.page.cleanup());}
    function layout(width,zoom,dpr){
        version++;for(const i of [...entries.keys()])release(i);wanted.clear();failed.clear();let top=12;
        const base=Math.max(100,Math.min(1600,width-24));root.style.width=Math.ceil(base*zoom+24)+'px';
        geometry=sizes.map((s,i)=>{const w=base*zoom,h=w*s.height/s.width,g={top,width:w,height:h,dpr:Math.min(2,dpr||1)};frames[i].style.width=w+'px';frames[i].style.height=h+'px';frames[i].replaceChildren();delete frames[i].dataset.pdfReady;top+=h+16;return g;});
        root.style.minHeight=Math.ceil(top-4)+'px';
    }
    const extent=i=>(geometry[i+1]?.top??geometry[i].top+geometry[i].height)-geometry[i].top;
    function positionAt(top){let i=0;while(i<geometry.length-1&&geometry[i+1].top<=top)i++;const g=geometry[i];return Math.max(0,Math.min(sizes.length,i+(top-g.top)/extent(i)));}
    function topAt(position){const i=Math.min(sizes.length-1,Math.floor(position)),ratio=position===sizes.length?1:position%1,g=geometry[i];return g.top+extent(i)*ratio;}
    async function render(i){
        if(disposed||entries.has(i)||failed.has(i))return;
        const generation=version,canvas=doc.createElement('canvas'),entry={canvas,page:null,task:null};entries.set(i,entry);
        try{
            const page=await pdf.getPage(i+1);entry.page=page;
            if(disposed||version!==generation||entries.get(i)!==entry){page.cleanup();return;}
            const g=geometry[i],density=Math.min(g.dpr,4096/g.width,4096/g.height,Math.sqrt(pixelLimit/(g.width*g.height)));
            canvas.width=Math.max(1,Math.floor(g.width*density));canvas.height=Math.max(1,Math.floor(g.height*density));
            canvas.setAttribute('aria-label',(i+1)+'ページのPDF');canvas.setAttribute('role','img');frames[i].append(canvas);
            const view=page.getViewport({scale:canvas.width/sizes[i].width});
            entry.task=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport:view,background:'#ffffff',annotationMode:1});
            let timer;try{await Promise.race([entry.task.promise,new Promise((_,reject)=>{timer=setTimeout(()=>{entry.task.cancel();reject(Error('pdf-render-timeout'));},15000);})]);}finally{clearTimeout(timer);}
            if(version===generation&&entries.get(i)===entry){frames[i].dataset.pdfReady='true';onRendered(i);}
        }catch(error){
            if(disposed||version!==generation||entries.get(i)!==entry)return;
            release(i);failed.add(i);frames[i].dataset.pdfReady='false';
            const retry=doc.createElement('button');retry.type='button';retry.textContent=(i+1)+'ページを再試行';retry.dataset.pdfRetry=i+1;
            retry.onclick=()=>{failed.delete(i);retry.remove();void render(i);};frames[i].append(retry);onError(i,error);
            throw error;
        }
    }
    async function pump(){if(running||disposed)return;running=true;try{while(!disposed){const i=[...wanted].find(i=>!entries.has(i)&&!failed.has(i));if(i===undefined)break;await render(i).catch(()=>{});}}finally{running=false;}}
    function update(top,height){if(!geometry.length||disposed)return;const first=Math.max(0,Math.floor(positionAt(top))-1),last=Math.min(sizes.length-1,Math.floor(positionAt(top+height))+1);wanted=new Set();for(let i=first;i<=last;i++)wanted.add(i);
        pixelLimit=Math.min(4e6,20e6/wanted.size);
        for(const [i,e]of [...entries])if(!wanted.has(i)||e.canvas.width*e.canvas.height>pixelLimit)release(i);void pump();}
    return {root,layout,render,update,positionAt,topAt,hasErrors:()=>failed.size>0,
        stats:()=>({canvases:entries.size,pixels:[...entries.values()].reduce((n,e)=>n+e.canvas.width*e.canvas.height,0),pages:sizes.length}),
        dispose(){disposed=true;version++;for(const i of [...entries.keys()])release(i);wanted.clear();root.remove();}};
}
