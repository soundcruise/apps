import {MOCK_NAMESPACE,MOCK_TYPES,ASSETS,descriptor,remoteRecord,hash} from './contract.mjs';
import {insist,canonicalJSON} from '../core/json.mjs';

const endpoint='http://127.0.0.1:18874/apps/score-viewer/local/mock-sync/v1/';
// Only this loopback fixture can be contacted. No configurable URL, bearer,
// cookie, Account ID, production transport or editor repository is accepted.
export function createMockSync({fetch:send=globalThis.fetch,inbox,library,codec,presetCodec,validatePDF,playback=()=>null,withReplacement,openBytes}){
    let busy=false;
    async function exclusive(run){insist(!busy,'sync-busy');busy=true;try{return await run();}finally{busy=false;}}
    async function request(path,{method='GET',body,mime='application/json',responseMime=mime,max=1024*1024}={}){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
        try{
            const response=await send(endpoint+path,{method,body,signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store',headers:{'X-Viewer-Mock':'1',...(body!==undefined?{'Content-Type':mime}:{})}});
            if(!response.ok){await response.body?.cancel();throw Error(response.status===409?'sync-conflict':response.status===507?'sync-remote-quota':response.status===426?'sync-capability':'sync-http-'+response.status);}
            insist((response.headers.get('content-type')||'').split(';')[0]===responseMime,'sync-mime');
            const declared=response.headers.get('content-length');insist(!declared||Number(declared)<=max,'sync-size');
            const reader=response.body.getReader(),chunks=[];let length=0;
            try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;insist(length<=max,'sync-size');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
            const bytes=new Uint8Array(length);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
            return responseMime==='application/json'?JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)):bytes;
        }finally{clearTimeout(timer);}
    }
    const json=(path,body)=>request(path,{method:'POST',body:JSON.stringify(body)});
    async function capabilities(){const c=await request('capabilities');insist(c.protocol===1&&c.namespace===MOCK_NAMESPACE&&Array.isArray(c.types)&&MOCK_TYPES.every(t=>c.types.includes(t)),'sync-capability');return c;}
    async function refresh(){return exclusive(async()=>{await capabilities();const result=await request('records?types='+MOCK_TYPES.join(','));insist(Array.isArray(result.records)&&result.records.length<=500,'sync-index');
        // Unknown future types are ignored, never mirrored back or deleted.
        const records=result.records.filter(r=>MOCK_TYPES.includes(r?.descriptor?.type)).map(remoteRecord);insist(new Set(records.map(r=>r.descriptor.recordId)).size===records.length,'sync-index');await inbox.saveCatalog(records);return records;});}
    async function validate(bytes,d){
        insist(bytes.byteLength===d.asset.size&&await hash(bytes)===d.asset.sha256,'sync-integrity');
        if(d.asset.kind==='viewer_score'){const decoded=await codec.decode(bytes);insist(decoded.document.viewerDocumentId===d.documentId&&decoded.document.revisionId===d.revisionId,'sync-source-mismatch');return {decoded};}
        if(d.asset.kind==='viewer_pdf'){insist(d.documentId==='pdf:'+d.asset.sha256&&d.revisionId===d.asset.sha256,'sync-source-mismatch');const pages=await validatePDF(bytes,{name:d.title});return {pages};}
        const preset=presetCodec.decode(bytes);insist(d.documentId==='preset:'+d.asset.sha256&&d.revisionId===d.asset.sha256,'sync-source-mismatch');return {preset};
    }
    async function publish({bytes,title,recordId,baseVersion=0,kind}){return exclusive(async()=>{
        await capabilities();bytes=typeof bytes==='string'?new TextEncoder().encode(bytes):new Uint8Array(bytes).slice();insist(Object.hasOwn(ASSETS,kind)&&bytes.length<=ASSETS[kind].max,'sync-size');
        const digest=await hash(bytes);let documentId,revisionId;
        if(kind==='viewer_score'){const {document:d}=await codec.decode(bytes);documentId=d.viewerDocumentId;revisionId=d.revisionId;title=d.score.songInfo.title||'無題';}
        else{documentId=(kind==='viewer_pdf'?'pdf:':'preset:')+digest;revisionId=digest;if(kind==='viewer_preset')title=presetCodec.decode(bytes).name;}
        // Persist a new publication's identity until ACK. Closing/reloading after
        // a lost commit response must not create a duplicate remote document.
        const publicationKey=!recordId?kind+':'+digest:null;
        if(publicationKey){insist(baseVersion===0,'sync-version');recordId=await inbox.publicationId(publicationKey);}
        const d=descriptor({namespace:MOCK_NAMESPACE,appId:'score-viewer',recordId,type:kind==='viewer_preset'?'viewer_preset':'viewer_document',title,documentId,revisionId,asset:{kind,mime:ASSETS[kind].mime,size:bytes.length,sha256:digest}});
        await validate(bytes,d);
        const intent=await hash(new TextEncoder().encode(canonicalJSON({descriptor:d,baseVersion}))),prepared=await json('prepare',{protocol:1,descriptor:d,baseVersion,intent});
        insist(prepared.uploadId===intent,'sync-upload-id');
        if(!prepared.committed)await request('uploads/'+prepared.uploadId,{method:'PUT',body:bytes,mime:d.asset.mime,responseMime:'application/json',max:1024});
        const result=remoteRecord(await json('commit',{protocol:1,uploadId:prepared.uploadId}));insist(canonicalJSON(result.descriptor)===canonicalJSON(d)&&result.version===baseVersion+1&&!result.deleted,'sync-commit');if(publicationKey)await inbox.finishPublication(publicationKey);return result;
    });}
    async function download(input){return exclusive(async()=>{const r=remoteRecord(input);insist(!r.deleted,'sync-deleted');const d=r.descriptor;
        const bytes=await request('assets/'+d.asset.sha256,{mime:d.asset.mime,max:d.asset.size});await validate(bytes,d);
        await inbox.save({recordId:d.recordId,version:r.version,record:r,bytes});return r;
    });}
    async function apply(input,{presetName}={}){return exclusive(async()=>{
        const r=remoteRecord(input);insist(!r.deleted,'sync-deleted');const entry=await inbox.read(r.descriptor.recordId,r.version);insist(entry&&canonicalJSON(entry.record)===canonicalJSON(r),'sync-file-missing');
        const bytes=new Uint8Array(entry.bytes),validated=await validate(bytes,r.descriptor);
        if(r.descriptor.type==='viewer_preset'){
            const name=presetName||validated.preset.name,existing=(await library.listPresets()).find(p=>p.name===name);
            const text=new TextDecoder().decode(bytes);if(existing){insist(existing.text===text,'sync-preset-name-conflict');return {preset:true,name};}
            await library.savePreset(name,text);return {preset:true,name}; // never auto-applies to the current score
        }
        const idle=()=>insist(!['playing','counting','loading'].includes(playback()?.phase),'sync-playing');idle();
        return withReplacement(async()=>{idle();if(r.descriptor.asset.kind==='viewer_pdf')await library.savePDF(bytes,{name:r.descriptor.title,pages:validated.pages},{select:false});else await library.save(bytes,{select:false});
            idle();insist(await openBytes(bytes,{name:r.descriptor.asset.kind==='viewer_pdf'?r.descriptor.title:undefined,saved:true}),'sync-open-failed');return {opened:true};});
    });}
    async function remove(input){return exclusive(async()=>{const r=remoteRecord(input);await capabilities();return remoteRecord(await json('delete',{protocol:1,recordId:r.descriptor.recordId,baseVersion:r.version,type:r.descriptor.type}));});}
    async function catalog(){const records=await inbox.catalog();insist(Array.isArray(records)&&records.length<=500,'sync-index');return records.map(remoteRecord);}
    return Object.freeze({refresh,publish,download,apply,remove,readInbox:r=>inbox.read(r.descriptor.recordId,r.version),catalog,get busy(){return busy;}});
}
