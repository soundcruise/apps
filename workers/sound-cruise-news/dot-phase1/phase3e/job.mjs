import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {driveProvider} from '../phase3b/drive-provider.mjs';
import {initRelay} from '../phase3b/relay.mjs';
import {initNotice,processNotice} from '../phase3d/notice.mjs';
import {openStore,list} from '../phase2e/store.mjs';
import {saveDelivery,recordFailure} from '../phase3f/firestore-store.mjs';

// This smoke test accepts exactly the previously approved fictional document pair.
export const FOLDER='1UzzhEnH0uSGadK5zIg1XBCqcfAf7q1q-';
export const NOTICE='1Hpebm5PuJGHFrrwylHorP88l0gVV-qBFxgt0FGgoSfA';
export const TARGET='16wSYmnhNNk9gXC29pq0J9ZRQEL1FIXi76W82gevhr4k';
export const CANDIDATE='fictional-moon-guitar-m1-001';
export const EXPECTED_HASH='45a4a6e6b6c5489d3ff091bce861791f2b1d2e5f6bf5a77d9e7a9c5834ff83bf';

export function paragraphs(doc){
 const contents=doc?.body?.content;
 if(!Array.isArray(contents)||contents.some(c=>!c.paragraph&&!c.sectionBreak))throw Error('invalid_document');
 return contents.filter(c=>c.paragraph).map(c=>{
  if(!Array.isArray(c.paragraph.elements))throw Error('invalid_document');
  let s='';for(const e of c.paragraph.elements){if(typeof e.textRun?.content!=='string')throw Error('invalid_document');s+=e.textRun.content;}
  return s.endsWith('\n')?s.slice(0,-1):s;
 }).join('\n');
}
export function docsProvider(token,fetchImpl=fetch,expectedHash=EXPECTED_HASH){
 const base=driveProvider({token,fetchImpl});
 async function read(id){
  if(![NOTICE,TARGET].includes(id))throw Error('invalid_target');
  let response;try{response=await fetchImpl('https://docs.googleapis.com/v1/documents/'+encodeURIComponent(id),{headers:{Authorization:`Bearer ${token}`},redirect:'error'});}catch{throw Error('transient_error');}
  if([401,403].includes(response.status))throw Error('auth_failed');if(!response.ok)throw Error('transient_error');
  const declared=Number(response.headers.get('content-length'));if(declared>262144)throw Error('invalid_size');
  const raw=await response.text();if(Buffer.byteLength(raw)>262144)throw Error('invalid_size');
  const text=paragraphs(JSON.parse(raw));if(Buffer.byteLength(text)>131072)throw Error('invalid_size');
  if(id===TARGET){let d;try{d=JSON.parse(text)}catch{throw Error('invalid_json')};if(d?.candidate?.candidate_id!==CANDIDATE||createHash('sha256').update(text).digest('hex')!==expectedHash)throw Error('invalid_target');}
  return text;
 }
 return {list:base.list,async metadata(id){if(![NOTICE,TARGET].includes(id))throw Error('invalid_target');const m=await base.metadata(id);if(m.mimeType!=='application/vnd.google-apps.document')throw Error('invalid_target');return m},read};
}
export async function run(db,provider){
 initRelay(db);initNotice(db);
 const files=await provider.list(FOLDER);if(files.filter(f=>f.id===NOTICE).length!==1)return {status:'notice_missing_or_duplicate'};
 const result=await processNotice(db,provider,FOLDER,NOTICE);
 const rows=list(db);return {status:result.status,count:rows.length,ready:rows.some(r=>r.validation.ready),persistent:false};
}
export async function metadataToken(fetchImpl=fetch){
 if(process.env.GOOGLE_APPLICATION_CREDENTIALS)throw Error('key_file_not_allowed');
 const r=await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},redirect:'error'});
 if(!r.ok)throw Error('metadata_auth_failed');const d=await r.json();if(typeof d.access_token!=='string'||!d.access_token||!(d.expires_in>0))throw Error('metadata_auth_failed');return d.access_token;
}
export async function persistRun(store,db,result,attemptId,now,expectedHash=EXPECTED_HASH){
 if(result.status!=='created')return recordFailure(store,{attemptId,status:result.status,noticeId:NOTICE,now});
 const rows=list(db),audit=db.prepare('SELECT * FROM drive_attempts ORDER BY id DESC LIMIT 1').get();
 if(rows.length!==1||!audit||audit.file_id!==TARGET||audit.status!=='created'||audit.payload_digest!==expectedHash||!audit.version)throw Error('invalid_pipeline_evidence');
 return saveDelivery(store,{input:rows[0].input,delivery:{fileId:audit.file_id,version:audit.version,noticeId:NOTICE,bodySha256:audit.payload_digest,hashVerified:true},attemptId,now});
}
async function main(){const dir=mkdtempSync(join(tmpdir(),'dot2e-'));let db,store;try{const token=await metadataToken();db=openStore(join(dir,'staging.sqlite'));const result=await run(db,docsProvider(token));if(process.env.DOT_STAGE==='firestore'){if(process.env.DOT_FIRESTORE_PROJECT!=='cruise-news-drive-isolation')throw Error('invalid_project');const {Firestore}=await import('@google-cloud/firestore');store=new Firestore({projectId:process.env.DOT_FIRESTORE_PROJECT});const saved=await persistRun(store,db,result,randomUUID(),new Date().toISOString());console.log(JSON.stringify({status:saved.status,ready:false,persistent:['created','replay'].includes(saved.status)}));if(!['created','replay'].includes(saved.status))process.exitCode=1;}else if(!process.env.DOT_STAGE||process.env.DOT_STAGE==='ephemeral'){console.log(JSON.stringify(result));if(result.status!=='created'||result.ready)process.exitCode=1;}else throw Error('invalid_stage');}catch{console.error('isolated_job_failed');process.exitCode=1;}finally{await store?.terminate();db?.close();rmSync(dir,{recursive:true,force:true});}}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
