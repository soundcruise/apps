/* Lazy owner material loader. Only the pinned bytes are executed; no owner import at boot. */
import {createOfficialRhythmAdapter} from './official-pattern-adapter.mjs?v=0.70.0';
export const OWNER_PIN=Object.freeze({ownerApp:'rhythm-cruise',ownerAppVersion:'1.21.0',commit:'c1f99ff68e61da57f52a8dfe14ebcfa298659120',tree:'7d1bcf9bee610ba809c4808d7c48eb067dc6984d',modulePath:'apps/rhythm-cruise/js/official-patterns.mjs',moduleSha256:'e2f89b27261035b80d6eb4b50e810456b3446c714c5f32b62622418f354c97cd',versionSource:Object.freeze({path:'apps/rhythm-cruise/script.js',symbol:'RHYTHM_CRUISE_VERSION',sha256:'d93ed5932fe9aaceacb5a596f005acedd9e42877dc505caaf133c3c193664716'}),verification:'fixed-git-object'});
async function executeBytes(bytes){
    const url=URL.createObjectURL(new Blob([bytes],{type:'text/javascript'}));
    try{return await import(url);}finally{URL.revokeObjectURL(url);}
}
export function createOwnerLoader({fetchBytes=globalThis.fetch?.bind(globalThis),crypto=globalThis.crypto,execute=executeBytes,url=new URL('../../../../rhythm-cruise/js/official-patterns.mjs?v=1.21.0',import.meta.url).href}={}){
    let ready=null,pending=null;
    return Object.freeze({load(){
        if(ready)return Promise.resolve(ready);if(pending)return pending;
        pending=(async()=>{try{
            if(!fetchBytes||!crypto?.subtle)throw Error('owner-unavailable');
            const response=await fetchBytes(url,{credentials:'omit',redirect:'error',cache:'no-cache'});
            if(!response.ok||response.redirected||response.url&&response.url!==url)throw Error('owner-unavailable');
            const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>128*1024)throw Error('owner-source-mismatch');
            const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
            if(hash!==OWNER_PIN.moduleSha256)throw Error('owner-source-mismatch');
            // No URL re-fetch or separately injected callback: the verified buffer itself is the module.
            const module=await execute(bytes);
            const adapter=createOfficialRhythmAdapter({listOfficialPatterns:module.listOfficialPatterns,getOfficialPattern:module.getOfficialPattern,ownerVersion:OWNER_PIN.ownerAppVersion,sourceEvidence:OWNER_PIN,expectedSource:{commit:OWNER_PIN.commit,moduleSha256:hash}});
            if(!adapter.ok)throw Error('owner-invalid');const list=adapter.listOfficialPatterns();if(!list.ok)throw Error('owner-invalid');
            ready=Object.freeze({ok:true,adapter,patterns:list.patterns});return ready;
        }catch(error){return Object.freeze({ok:false,code:error.message==='owner-source-mismatch'?'owner-source-mismatch':'owner-unavailable'});}finally{pending=null;}})();
        return pending;
    }});
}
