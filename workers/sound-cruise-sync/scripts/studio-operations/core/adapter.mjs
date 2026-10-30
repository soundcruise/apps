import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
export const MAX_PAGE=256*1024, MAX_PAGES=100000, MAX_MANIFEST=32*1024*1024;
const hash=x=>createHash('sha256').update(x).digest('hex');
const bytes=x=>Buffer.from(JSON.stringify(x));
const fail=x=>{throw Error(x)};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function exists(p){try{await fs.lstat(p);return true}catch(e){if(e.code==='ENOENT')return false;throw e}}
async function read(p,max=MAX_MANIFEST){const s=await fs.lstat(p);if(!s.isFile()||s.isSymbolicLink()||s.size>max)fail('file-type-or-budget');return fs.readFile(p)}
async function atomic(p,obj){const tmp=p+'.new-'+randomBytes(8).toString('hex');const fh=await fs.open(tmp,'wx',0o600);try{await fh.writeFile(bytes(obj));await fh.sync()}finally{await fh.close()}await fs.rename(tmp,p);const dir=await fs.open(path.dirname(p),'r');try{await dir.sync()}finally{await dir.close()}}
function scopeCheck(scope){if(!scope||Object.keys(scope).sort().join('|')!=='cutline|d1|r2'||Object.values(scope).some(x=>typeof x!=='string'||!x))fail('scope')}
function keyCheck(key){if(!Buffer.isBuffer(key)||key.length!==32)fail('key-handle')}
function manifestCheck(m,expectedScope){scopeCheck(m.scope);if(!equal(m.scope,expectedScope)||m.format!=='cruise-paged-backup-v1'||m.state!=='SEALED'||!Array.isArray(m.pages)||m.pages.length<1||m.pages.length>MAX_PAGES)fail('manifest');let total=0;for(let i=0;i<m.pages.length;i++){const p=m.pages[i];if(p.index!==i||p.name!==`page-${String(i).padStart(8,'0')}.aesgcm`||!Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>MAX_PAGE||!Number.isSafeInteger(p.count)||p.count<1)fail('page-coverage');total+=p.bytes}if(total!==m.totalBytes)fail('byte-coverage')}
function aad(scope,index){return bytes({format:'cruise-paged-backup-v1',scope,index})}
async function decryptPage(directory,p,scope,key){const encrypted=await read(path.join(directory,p.name),MAX_PAGE+28);if(hash(encrypted)!==p.cipherHash||encrypted.length!==p.bytes+28)fail('cipher-hash');const d=createDecipheriv('aes-256-gcm',key,encrypted.subarray(0,12));d.setAAD(aad(scope,p.index));d.setAuthTag(encrypted.subarray(-16));const plain=Buffer.concat([d.update(encrypted.subarray(12,-16)),d.final()]);if(hash(plain)!==p.plainHash)fail('plain-hash');const records=JSON.parse(plain);if(!Array.isArray(records)||records.length!==p.count)fail('record-coverage');return {plain,records}}
function sourceCheck(s){if(!s||typeof s.inventory!=='function'||typeof s.pages!=='function'||typeof s.assertCutline!=='function'||typeof s.validate!=='function')fail('source-contract')}
export async function backup({directory,scope,keyHandle,source,resume=false,afterCheckpoint=async()=>{}}){
 scopeCheck(scope);sourceCheck(source);const key=await keyHandle();keyCheck(key);
 try{
  await source.assertCutline(scope);const inventory=await source.inventory();const invHash=hash(bytes(inventory));
  if(!await exists(directory))await fs.mkdir(directory,{mode:0o700});else if(!resume)fail('backup-target-exists');
  const cpPath=path.join(directory,'CHECKPOINT.json');let cp;
  if(resume){cp=JSON.parse(await read(cpPath));if(cp.state!=='OPEN'||!equal(cp.scope,scope)||cp.inventoryHash!==invHash)fail('resume-identity-or-cutline');if(cp.pages.length)manifestCheck({...cp,format:'cruise-paged-backup-v1',state:'SEALED'},scope);}
  else{cp={format:'cruise-backup-checkpoint-v1',scope,inventoryHash:invHash,state:'OPEN',pages:[],totalBytes:0};await atomic(cpPath,cp)}
  const chain=createHash('sha256');let index=0,totalRecords=0;
  for await(const records of source.pages()){
   if(index>=MAX_PAGES||!Array.isArray(records)||records.length<1)fail('page-budget');const plain=bytes(records);if(plain.length>MAX_PAGE)fail('page-budget');chain.update(plain);totalRecords+=records.length;
   if(index<cp.pages.length){const old=await decryptPage(directory,cp.pages[index],scope,key);if(!old.plain.equals(plain))fail('resume-source-drift')}
   else{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(aad(scope,index));const encrypted=Buffer.concat([iv,c.update(plain),c.final(),c.getAuthTag()]);const name=`page-${String(index).padStart(8,'0')}.aesgcm`;const p=path.join(directory,name);
    // A crash before checkpoint leaves an orphan encrypted page. Never overwrite it silently.
    if(await exists(p))fail('orphan-page-requires-new-backup');const fh=await fs.open(p,'wx',0o600);try{await fh.writeFile(encrypted);await fh.sync()}finally{await fh.close()}
    cp.pages.push({index,name,bytes:plain.length,count:records.length,plainHash:hash(plain),cipherHash:hash(encrypted)});cp.totalBytes+=plain.length;await atomic(cpPath,cp);await afterCheckpoint(index);
   }index++;
  }
  if(index!==cp.pages.length||index===0)fail('source-page-coverage');await source.assertCutline(scope);if(hash(bytes(await source.inventory()))!==invHash)fail('inventory-drift');await source.validate();
  const manifest={format:'cruise-paged-backup-v1',state:'SEALED',scope,inventory,inventoryHash:invHash,pages:cp.pages,totalBytes:cp.totalBytes,totalRecords,plainDigest:chain.digest('hex')};manifestCheck(manifest,scope);if(bytes(manifest).length>MAX_MANIFEST)fail('manifest-budget');await atomic(path.join(directory,'MANIFEST.json'),manifest);cp.state='SEALED';await atomic(cpPath,cp);return {manifestHash:hash(await read(path.join(directory,'MANIFEST.json'))),pages:index,totalRecords,totalBytes:manifest.totalBytes};
 }finally{key.fill(0)}
}
export async function verify({directory,scope,keyHandle,manifestHash}){
 const key=await keyHandle();keyCheck(key);try{const raw=await read(path.join(directory,'MANIFEST.json'));if(hash(raw)!==manifestHash)fail('manifest-pin');const m=JSON.parse(raw);manifestCheck(m,scope);if(hash(bytes(m.inventory))!==m.inventoryHash)fail('inventory-hash');const chain=createHash('sha256');let count=0;
 for(const p of m.pages){const {plain,records}=await decryptPage(directory,p,scope,key);chain.update(plain);count+=records.length}
 if(chain.digest('hex')!==m.plainDigest||count!==m.totalRecords)fail('full-coverage');return m;
 }finally{key.fill(0)}
}
export async function restore({directory,scope,keyHandle,manifestHash,target,journalDirectory,approvedTarget,forbiddenTargets,afterApply=async()=>{}}){
 // No target mutation before *every* page has passed AEAD, digest and coverage validation.
 const m=await verify({directory,scope,keyHandle,manifestHash});const identity=await target.identity();if(!identity||typeof identity.d1!=='string'||typeof identity.r2!=='string'||!identity.d1||!identity.r2||identity.d1===scope.d1||identity.r2===scope.r2)fail('production-or-source-target');
 if(!equal(identity,approvedTarget)||!Array.isArray(forbiddenTargets)||forbiddenTargets.some(x=>identity.d1===x.d1||identity.r2===x.r2))fail('target-approval-or-denylist');
 for(const f of ['assertFresh','claimRestore','apply','inventory','pages','validate'])if(typeof target[f]!=='function')fail('target-contract');
 if(await exists(journalDirectory))fail('restore-target-reuse');await target.assertFresh();await target.claimRestore({manifestHash,scope,identity});await fs.mkdir(journalDirectory,{mode:0o700});const journalPath=path.join(journalDirectory,'RESTORE.json');let j={state:'IN_PROGRESS',identity,scope,manifestHash,appliedPages:0};await atomic(journalPath,j);
 const key=await keyHandle();keyCheck(key);
 try{
  for(const p of m.pages){const {records}=await decryptPage(directory,p,scope,key);await target.apply(records,p.index);await afterApply(p.index);j.appliedPages++;await atomic(journalPath,j)}
  if(target.finalize)await target.finalize();await target.validate();if(!equal(await target.inventory(),m.inventory))fail('restore-inventory');const chain=createHash('sha256');let index=0,count=0;for await(const records of target.pages()){if(index>=m.pages.length)fail('readback-extra');const b=bytes(records),page=m.pages[index++];if(b.length>MAX_PAGE||hash(b)!==page.plainHash)fail('readback-page');chain.update(b);count+=records.length}if(index!==m.pages.length||count!==m.totalRecords||chain.digest('hex')!==m.plainDigest)fail('readback-coverage');j.state='RESTORED';await atomic(journalPath,j);return j;
 }catch(e){j.state='PARTIAL_UNKNOWN';j.reason=e.message;await atomic(journalPath,j);throw Object.assign(Error('restore-partial-unknown'),{cause:e})}finally{key.fill(0)}
}
