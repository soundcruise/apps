// Candidate contract for the LOCAL fixture. No real Account/Sync entitlement is
// inferred from this protocol. IDs belong to one mock namespace, not a Project.
import {record,insist,clone,freeze} from '../core/json.mjs';
import {MAX_FILE_BYTES} from '../core/file-format.mjs';
import {MAX_PDF_BYTES} from '../core/pdf-contract.mjs';
export const MOCK_NAMESPACE='viewer-local-fixture-v1';
export const MOCK_TYPES=Object.freeze(['viewer_document','viewer_preset']);
export const ASSETS=Object.freeze({viewer_score:{mime:'application/vnd.sound-cruise.score+json',max:MAX_FILE_BYTES},viewer_pdf:{mime:'application/pdf',max:MAX_PDF_BYTES},viewer_preset:{mime:'application/vnd.sound-cruise.view-preset+json',max:65536}});
export const id=v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(v);
export const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
export function descriptor(value){
    record(value,['namespace','appId','recordId','type','title','documentId','revisionId','asset']);
    insist(value.namespace===MOCK_NAMESPACE&&value.appId==='score-viewer','sync-namespace');
    insist(id(value.recordId)&&id(value.documentId)&&id(value.revisionId),'sync-id');
    insist(MOCK_TYPES.includes(value.type),'sync-unknown-type');
    insist(typeof value.title==='string'&&value.title.trim().length>0&&value.title.length<=180&&!/[\u0000-\u001f\u007f]/.test(value.title),'sync-title');
    const a=value.asset;record(a,['kind','mime','size','sha256']);
    insist(Object.hasOwn(ASSETS,a.kind)&&a.mime===ASSETS[a.kind].mime&&Number.isSafeInteger(a.size)&&a.size>0&&a.size<=ASSETS[a.kind].max&&sha(a.sha256),'sync-asset');
    insist((value.type==='viewer_preset')===(a.kind==='viewer_preset'),'sync-asset-type');
    return freeze(clone(value));
}
export function remoteRecord(value){
    record(value,['descriptor','version','deleted']);descriptor(value.descriptor);
    insist(Number.isSafeInteger(value.version)&&value.version>0&&typeof value.deleted==='boolean','sync-version');
    return freeze(clone(value));
}
