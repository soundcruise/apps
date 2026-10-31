import {createHash} from 'node:crypto';
import {FieldPath} from '@google-cloud/firestore';
import {projectUntrusted} from './preview.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const validCursor=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function withDeadline(operation,ms){let timer;return Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('reader_timeout')),ms)})]).finally(()=>clearTimeout(timer));}
function project(data,now){if(!data||typeof data!=='object'||Object.keys(data).some(k=>!['candidateId','runId','input','validation','createdAt'].includes(k))||Buffer.byteLength(JSON.stringify(data))>131072)throw Error('invalid_candidate');const item=projectUntrusted(data.input,now);if(data.candidateId!==item.input.candidate.candidate_id)throw Error('invalid_candidate');const clean=structuredClone(item.input);delete clean.candidate.idempotency_key;return {candidate:clean.candidate,run:clean.run,validation:item.validation,similar:[],duplicateStatus:'UNCERTAIN',historyComplete:false};}
export function createFirestoreReader(db,{timeoutMs=5000}={}){
 if(!db||!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('reader_config_invalid');
 return {
  async list({limit=10,cursor=null}={},now=new Date().toISOString()){
   if(!Number.isInteger(limit)||limit<1||limit>20||(cursor!==null&&!validCursor(cursor)))throw Error('operator_query_invalid');
   return withDeadline(async()=>{let q=db.collection('candidates').orderBy(FieldPath.documentId()).limit(limit+1);if(cursor)q=q.startAfter(cursor);const snap=await q.get();const selected=snap.docs.slice(0,limit);const items=selected.map(d=>{if(!validCursor(d.id))throw Error('invalid_candidate');const item=project(d.data(),now);if(sha(item.candidate.candidate_id)!==d.id)throw Error('invalid_candidate');return {id:item.candidate.candidate_id,manufacturer:item.candidate.entity.manufacturer,brand:item.candidate.entity.brand,product:item.candidate.entity.product,models:item.candidate.entity.models,event:item.candidate.event.type,validation:item.validation};});return {items,nextCursor:snap.docs.length>limit?selected.at(-1).id:null,historyComplete:false};},timeoutMs);
  },
  async detail(id,now=new Date().toISOString()){
   if(!validId(id))throw Error('operator_query_invalid');
   return withDeadline(async()=>{const doc=await db.collection('candidates').doc(sha(id)).get();if(!doc.exists)return null;const data=doc.data(),item=project(data,now);if(item.candidate.candidate_id!==id)throw Error('invalid_candidate');const receipt=await db.collection('receipts').doc(sha(data.input.candidate.idempotency_key)).get();if(!receipt.exists||receipt.data().candidateId!==id)throw Error('invalid_receipt');const audits=await db.collection('attempts').where('candidateId','==',id).limit(11).get();const t=doc.updateTime,revision=Number.isSafeInteger(t?.seconds)&&Number.isInteger(t?.nanoseconds)&&t.nanoseconds>=0&&t.nanoseconds<1e9?`${t.seconds}:${t.nanoseconds}`:null;return {...item,stagingRevision:revision,deliveryKeyHash:sha(data.input.candidate.idempotency_key),delivery:{createdAt:receipt.data().createdAt??null,attempts:audits.docs.slice(0,10).map(d=>{const a=d.data();return {status:a.status,processedAt:a.processedAt??null,fileId:a.fileId??null,version:a.version??null};}),attemptsTruncated:audits.size>10}};},timeoutMs);
  }
 };
}
