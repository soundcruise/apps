import {MAX_PDF_PAGES,pdfBytes,pdfHash,pdfName} from './pdf-contract.mjs';
import {insist} from './json.mjs';
const assets=new URL('../vendor/pdfjs/',import.meta.url);
let engine;
async function pdfjs(){
    if(!engine)engine=import('../vendor/pdfjs/pdf.min.mjs').catch(error=>{engine=null;throw error;});
    const lib=await engine;lib.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.min.mjs',assets).href;return lib;
}
export function createPDFLoader(){
    let generation=0,pending=null;
    function cancel(){generation++;if(pending){void pending.destroy().catch(()=>{});pending=null;}}
    async function open(input,{name}={}){
        cancel();const ticket=generation,bytes=pdfBytes(input),hash=await pdfHash(bytes),lib=await pdfjs();
        if(ticket!==generation)throw Error('pdf-load-cancelled');
        // Dedicated parser worker, fixed bundled assets, no URL from the file,
        // annotation layer, scripting manager, sandbox, forms or external links.
        const task=lib.getDocument({data:bytes.slice(),cMapUrl:new URL('cmaps/',assets).href,cMapPacked:true,
            standardFontDataUrl:new URL('standard_fonts/',assets).href,wasmUrl:new URL('wasm/',assets).href,
            iccUrl:new URL('iccs/',assets).href,useWorkerFetch:true,useWasm:false,enableScripting:false,enableXfa:false,
            disableWorkerRendering:true,isImageDecoderSupported:false,canvasMaxAreaInBytes:16*1024*1024,
            stopAtErrors:true,verbosity:0});
        pending=task;let password=false,deadline;
        task.onPassword=()=>{password=true;void task.destroy().catch(()=>{});};
        const timeout=new Promise((_,reject)=>{deadline=setTimeout(()=>{void task.destroy().catch(()=>{});reject(Error('pdf-load-timeout'));},30000);});
        try{
            const pdf=await Promise.race([task.promise,timeout]);
            insist(pdf.numPages>0&&pdf.numPages<=MAX_PDF_PAGES,'pdf-page-limit');
            insist(await pdf.getPermissions()===null,'pdf-password');
            // Index dimensions only. Never allocate a canvas for every page.
            const sizes=[];
            for(let i=1;i<=pdf.numPages;i++){
                insist(ticket===generation,'pdf-load-cancelled');const page=await pdf.getPage(i),v=page.getViewport({scale:1});
                insist([v.width,v.height].every(n=>Number.isFinite(n)&&n>=8&&n<=14400)&&v.width*v.height<=50e6,'pdf-page-size');
                sizes.push({width:v.width,height:v.height,rotation:v.rotation});page.cleanup();
            }
            insist(ticket===generation,'pdf-load-cancelled');clearTimeout(deadline);pending=null;
            return Object.freeze({kind:'pdf',pdf,bytes,hash,name:pdfName(name),sizes,dispose:()=>task.destroy()});
        }catch(error){clearTimeout(deadline);if(pending===task)pending=null;await task.destroy().catch(()=>{});throw password?Error('pdf-password'):error;}
    }
    return Object.freeze({open,cancel});
}
