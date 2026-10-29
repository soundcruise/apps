// Synthetic fixture tool only. No remote API, credentials discovery, or SQL export.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const fail=x=>{throw Error(x);};
function fixture(x){if(x!==true)fail('synthetic-only');}
export async function fixtureSnapshot({db,bucket,syntheticFixture=false}){
 fixture(syntheticFixture);
 const schema=(await db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT IN('_cf_KV','_cf_METADATA') ORDER BY type,name").all()).results;
 const tables=[];for(const s of schema.filter(x=>x.type==='table')){const rows=(await db.prepare('SELECT * FROM '+quote(s.name)).all()).results;rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));tables.push({name:s.name,rows});}
 const sequence=(await db.prepare("SELECT name,seq FROM sqlite_sequence ORDER BY name").all()).results;
 const objects=[];if(bucket){let cursor;do{const listed=await bucket.list({cursor});for(const o of listed.objects){const item=await bucket.get(o.key);if(!item)fail('r2-observation-race');objects.push({key:o.key,bytes:Buffer.from(await item.arrayBuffer()).toString('base64'),httpMetadata:JSON.parse(JSON.stringify(item.httpMetadata||{})),customMetadata:item.customMetadata||{}});}cursor=listed.truncated?listed.cursor:undefined;}while(cursor);objects.sort((a,b)=>a.key.localeCompare(b.key));}
 return {type:'studio-synthetic-backup-v1',schema,tables,sequence,objects};
}
export function validateFixtureSnapshot(s){
 if(s?.type!=='studio-synthetic-backup-v1'||!Array.isArray(s.schema)||!Array.isArray(s.tables)||!Array.isArray(s.objects))fail('backup-format');
 const by=new Map(s.tables.map(t=>[t.name,t.rows]));const pending=by.get('studio_document_pending')||[],chunks=by.get('studio_document_chunks')||[],receipts=by.get('studio_document_receipts')||[];
 for(const h of by.get('studio_document_records')||[]){
 const p=pending.find(x=>x.account_id===h.user_id&&x.operation_id===h.last_operation_id),r=receipts.find(x=>x.account_id===h.user_id&&x.operation_id===h.last_operation_id);if(!p||!r)fail('backup-head-proof-missing');
 const m=JSON.parse(p.manifest_json),parts=chunks.filter(x=>x.account_id===p.account_id&&x.operation_id===p.operation_id).sort((a,b)=>a.ordinal-b.ordinal);
 if(parts.length!==m.chunks.length||parts.some((c,i)=>c.ordinal!==i||c.bytes!==Buffer.byteLength(c.data)||hash(c.data)!==c.digest||c.digest!==m.chunks[i].digest||c.bytes!==m.chunks[i].bytes)||hash(parts.map(c=>c.data).join(''))!==m.digest)fail('backup-head-chunk-missing');
 const rr=JSON.parse(r.receipt_json);if(rr.operationId!==h.last_operation_id||rr.revision!==h.revision)fail('backup-receipt-mismatch');
 }
 return hash(s);
}
export async function encryptFixtureBackup({db,bucket,directory,syntheticFixture=false}){
 fixture(syntheticFixture);fs.mkdirSync(directory,{recursive:true,mode:0o700});
 // Test harness freezes its writers. Double observation detects drift; it is not a
 // cross-D1/R2 transaction or a proof that a transient ABA never happened.
 const a=await fixtureSnapshot({db,bucket,syntheticFixture}),b=await fixtureSnapshot({db,bucket,syntheticFixture});if(hash(a)!==hash(b))fail('backup-inconclusive');
 const plainHash=validateFixtureSnapshot(a),key=randomBytes(32),iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from('studio-synthetic-backup-v1'));
 const data=Buffer.concat([iv,c.update(JSON.stringify(a),'utf8'),c.final(),c.getAuthTag()]);
 const keyDir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-rc-key-'));fs.chmodSync(keyDir,0o700);const keyPath=path.join(keyDir,'fixture.key');fs.writeFileSync(keyPath,key,{mode:0o600});key.fill(0);
 const ciphertext=path.join(directory,'fixture.aesgcm');fs.writeFileSync(ciphertext,data,{mode:0o600});
 const manifest={type:'studio-synthetic-encrypted-backup-v1',production:false,cipherHash:hash(data),plainHash,schemaHash:hash(a.schema),sequenceHash:hash(a.sequence),objectHash:hash(a.objects),tables:a.tables.map(t=>({name:t.name,count:t.rows.length})),objects:a.objects.length};
 const manifestPath=path.join(directory,'MANIFEST.json');fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 return {keyPath,ciphertext,manifestPath,manifestHash:hash(fs.readFileSync(manifestPath)),anchor:plainHash};
}
export async function restoreFixtureBackup({db,bucket,manifestPath,ciphertext,keyPath,expectedManifestHash,expectedPlainHash,syntheticFixture=false}){
 fixture(syntheticFixture);const text=fs.readFileSync(manifestPath);if(hash(text)!==expectedManifestHash)fail('backup-manifest-pin');const m=JSON.parse(text);
 if(m.production!==false||m.type!=='studio-synthetic-encrypted-backup-v1'||m.plainHash!==expectedPlainHash)fail('backup-rollback-pin');
 const input=fs.readFileSync(ciphertext);if(hash(input)!==m.cipherHash)fail('backup-cipher-integrity');
 const st=fs.lstatSync(keyPath);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))fail('backup-key-permissions');const key=fs.readFileSync(keyPath);if(key.length!==32)fail('backup-key-length');
 const d=createDecipheriv('aes-256-gcm',key,input.subarray(0,12));d.setAAD(Buffer.from('studio-synthetic-backup-v1'));d.setAuthTag(input.subarray(-16));const s=JSON.parse(Buffer.concat([d.update(input.subarray(12,-16)),d.final()]).toString());key.fill(0);
 if(validateFixtureSnapshot(s)!==m.plainHash||hash(s.schema)!==m.schemaHash||hash(s.sequence)!==m.sequenceHash||hash(s.objects)!==m.objectHash)fail('backup-content-integrity');
 const nonempty=(await db.prepare("SELECT count(*) n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT IN('_cf_KV','_cf_METADATA')").first()).n;if(nonempty)fail('restore-target-not-empty');
 if(bucket&&(await bucket.list({limit:1})).objects.length)fail('restore-r2-not-empty');
 const ss=[db.prepare('PRAGMA defer_foreign_keys=ON'),...s.schema.filter(x=>x.type==='table').map(x=>db.prepare(x.sql))];
 for(const t of s.tables)for(const row of t.rows){const keys=Object.keys(row);ss.push(db.prepare('INSERT INTO '+quote(t.name)+'('+keys.map(quote).join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>row[k])));}
 ss.push(db.prepare('DELETE FROM sqlite_sequence'));for(const r of s.sequence)ss.push(db.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)').bind(r.name,r.seq));
 ss.push(...s.schema.filter(x=>x.type!=='table').map(x=>db.prepare(x.sql)));
 ss.push(db.prepare("SELECT CASE WHEN (SELECT count(*) FROM pragma_foreign_key_check)=0 THEN 1 ELSE json_extract('restore_fk','$.abort') END"));await db.batch(ss);
 // D1 and R2 are not atomic. If R2 application/readback fails this target is
 // PARTIAL/UNKNOWN and cannot be reused by an automatic retry.
 try{for(const o of s.objects)await bucket.put(o.key,Buffer.from(o.bytes,'base64'),{httpMetadata:{...o.httpMetadata,...(o.httpMetadata?.cacheExpiry?{cacheExpiry:new Date(o.httpMetadata.cacheExpiry)}:{})},customMetadata:o.customMetadata});const after=await fixtureSnapshot({db,bucket,syntheticFixture});if(hash(after)!==m.plainHash)fail('restore-readback-mismatch');return {type:'studio-synthetic-restore-v1',state:'RESTORED',plainHash:m.plainHash,productionAcceptance:false};}catch(e){throw Object.assign(Error('restore-partial-unknown'),{cause:e});}
}
// New process + independent workerd/D1/R2. Expected pins arrive separately from
// the backup. No Production discovery. Never restore over an existing target.
if(process.argv[1]===fileURLToPath(import.meta.url)&&process.argv[2]==='restore'){
 const spec=JSON.parse(fs.readFileSync(process.argv[3]));const {Miniflare,convertV4MiniflareOptions}=createRequire(spec.runtime)('miniflare');let mf;
 try{mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response(null,{status:404})}}',compatibilityDate:'2026-09-01',host:'127.0.0.1',port:0,inspectorPort:0,d1Databases:{DB:'restored-fixture'},r2Buckets:{BUCKET:'restored-fixture'},resourcePersistencePath:spec.target,outboundService:()=>{throw Error('network forbidden');}}));
 const result=await restoreFixtureBackup({...spec,db:await mf.getD1Database('DB'),bucket:await mf.getR2Bucket('BUCKET'),syntheticFixture:true});fs.writeFileSync(spec.result,JSON.stringify(result)+'\n');
 }catch(e){fs.writeFileSync(spec.result,JSON.stringify({state:'HOLD',error:e.message})+'\n');process.exitCode=1;}finally{if(mf)await mf.dispose();}
}
