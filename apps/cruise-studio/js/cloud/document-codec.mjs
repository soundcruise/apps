// Shared exact Document encoding; extracted without changing Backend semantics.
const fail=code=>{throw Object.assign(Error(code),{code});};
const utf8=new TextEncoder();
function canonical(x){if(x===null||typeof x==='string'||typeof x==='boolean')return JSON.stringify(x);if(typeof x==='number'&&Number.isFinite(x))return JSON.stringify(x);if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(x&&Object.getPrototypeOf(x)===Object.prototype)return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';fail('invalid_json');}
async function digest(s){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(s))),x=>x.toString(16).padStart(2,'0')).join('');}

// Canonical JSON contains escaped lone surrogates; split only on codepoint boundaries.
async function studioDocumentUpload(project,expectedRevision,operationId=crypto.randomUUID()){
 const text=canonical(project),parts=[];let part='',bytes=0;
 for(const c of text){const n=utf8.encode(c).length;if(bytes+n>128*1024){parts.push(part);part='';bytes=0;}part+=c;bytes+=n;}if(part)parts.push(part);
 const chunks=[];for(const data of parts)chunks.push({digest:await digest(data),bytes:utf8.encode(data).length});
 return{request:{operationId,documentId:project.projectId,expectedRevision,manifest:{digest:await digest(text),bytes:utf8.encode(text).length,chunks,deleted:false}},parts};
}

export {canonical as studioCanonical,digest as studioDigest,studioDocumentUpload};
