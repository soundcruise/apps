import {createHash} from 'node:crypto';
import {processFile} from '../phase3b/relay.mjs';

// Contract v1 is deliberately narrow: the observed Japanese notification form.
// Provider.read must return the exact LF-joined paragraphs, without a final LF.
export function parseNotice(text) {
 if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>8192||text.includes('\r'))throw Error('invalid_notice');
 // Empty paragraphs are allowed only between complete field/value pairs.
 // Never normalize field values or the separately hashed candidate body.
 const raw=text.split('\n'),lines=[];let pos=0;
 for(let pair=0;pair<4;pair++){
  if(pair>0)while(raw[pos]==='')pos++;
  if(pos+1>=raw.length||raw[pos]===''||raw[pos+1]==='')throw Error('invalid_notice');
  lines.push(raw[pos++],raw[pos++]);
 }
 if(pos!==raw.length)throw Error('invalid_notice');
 if(lines.length!==8||lines[0]!=='対象ファイルID：'||lines[2]!=='対象文書：'||lines[4]!=='本文SHA-256：'||lines[6]!=='ハッシュの対象：'||lines[7]!=='Google Docsのget_document_textで得られるparagraphs[].textを順序どおりLF（\\n）で連結し、末尾に改行を追加せずUTF-8で符号化した本文。')throw Error('invalid_notice');
 if(!/^[A-Za-z0-9_-]{10,200}$/.test(lines[1])||!lines[3]||lines[3].length>256||!/^[0-9a-f]{64}$/.test(lines[5]))throw Error('invalid_notice');
 return {fileId:lines[1],name:lines[3],hash:lines[5]};
}
function equalVersion(a,b,folder){return a.folderId===folder&&b.folderId===folder&&a.version&&a.modifiedAt&&a.version===b.version&&a.modifiedAt===b.modifiedAt&&a.name===b.name;}
export function initNotice(db){db.exec('CREATE TABLE IF NOT EXISTS notice_attempts (id INTEGER PRIMARY KEY, notice_id TEXT NOT NULL, target_id TEXT, status TEXT NOT NULL, observed_at TEXT NOT NULL)');}
export async function processNotice(db,provider,folderId,noticeId,now=new Date().toISOString()) {
 let targetId=null;
 const finish=status=>{db.prepare('INSERT INTO notice_attempts (notice_id,target_id,status,observed_at) VALUES (?,?,?,?)').run(noticeId,targetId,status,now);return {status,noticeId,targetId};};
 try {
  const n1=await provider.metadata(noticeId);if(n1.folderId!==folderId||!n1.version||!n1.modifiedAt)throw Error('notice_not_in_folder');
  const noticeText=await provider.read(noticeId);const n2=await provider.metadata(noticeId);if(!equalVersion(n1,n2,folderId))throw Error('notice_changed');
  const notice=parseNotice(noticeText);targetId=notice.fileId;if(targetId===noticeId)throw Error('invalid_target');
  const t1=await provider.metadata(targetId);if(t1.folderId!==folderId||t1.name!==notice.name||!t1.version||!t1.modifiedAt)throw Error('target_mismatch');
  const payload=await provider.read(targetId);if(typeof payload!=='string'||Buffer.byteLength(payload,'utf8')>131072)throw Error('invalid_size');
  const t2=await provider.metadata(targetId);const n3=await provider.metadata(noticeId);
  if(!equalVersion(t1,t2,folderId)||!equalVersion(n2,n3,folderId))throw Error('changed_during_read');
  if(createHash('sha256').update(payload,'utf8').digest('hex')!==notice.hash)throw Error('hash_mismatch');
  const guard={metadata:async id=>{const current=await provider.metadata(id);if(!equalVersion(t2,current,folderId)||current.name!==notice.name)throw Error('changed_during_read');return {...current,published:true};},read:async()=>payload};
  const result=await processFile(db,guard,folderId,targetId,now);return finish(result.status);
 } catch(e) {const known=['invalid_notice','notice_not_in_folder','notice_changed','invalid_target','target_mismatch','invalid_size','changed_during_read','hash_mismatch','auth_failed','transient_error'];return finish(known.includes(e.message)?e.message:'provider_or_storage_error');}
}
