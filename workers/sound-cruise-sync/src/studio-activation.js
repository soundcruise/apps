// Trusted server control plane. No HTTP handler calls changeStudioActivation.
import {maintenanceCanonical as canonical,maintenanceDigest as digest} from './maintenance-bridge-v2.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
export const ACTIVATION_DDL=Object.freeze([
 `CREATE TABLE studio_document_activation (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL CHECK(revision>0),mode TEXT NOT NULL CHECK(mode IN('off','canary','general')),targets_json TEXT NOT NULL,operation_id TEXT NOT NULL,record_hash TEXT NOT NULL)`,
 `CREATE TABLE studio_document_activation_log (revision INTEGER PRIMARY KEY,operation_id TEXT NOT NULL UNIQUE,previous_hash TEXT NOT NULL,record_json TEXT NOT NULL,record_hash TEXT NOT NULL)`,
 `CREATE TRIGGER studio_document_activation_log_immutable BEFORE UPDATE ON studio_document_activation_log BEGIN SELECT RAISE(ABORT,'activation_history'); END`,
 `CREATE TRIGGER studio_document_activation_log_no_delete BEFORE DELETE ON studio_document_activation_log BEGIN SELECT RAISE(ABORT,'activation_history'); END`
]);
export async function changeStudioActivation(db,{expectedRevision,operationId,mode,targets,reason}){
 await (await import('./studio-release-schema.js')).inspectStudioRelease(db);
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!['off','canary','general'].includes(mode)||!/^[0-9a-f-]{36}$/.test(operationId)||typeof reason!=='string'||!reason||reason.length>200||!Array.isArray(targets)||targets.length>32||((mode==='canary')!==(targets.length>0)))fail('activation-request');
 for(const t of targets)if(Object.keys(t).sort().join('|')!=='accountId|datasetId|deviceId'||!['accountId','deviceId'].every(k=>/^[0-9a-f-]{36}$/.test(t[k]))||typeof t.datasetId!=='string'||!t.datasetId||t.datasetId.length>200)fail('activation-target');
 const old=await db.prepare('SELECT * FROM studio_document_activation WHERE id=1').first();if((old?.revision??0)!==expectedRevision)fail('activation-cas');
 const record={type:'studio-activation-v1',revision:expectedRevision+1,operationId,mode,targets,reason,previousHash:old?.record_hash??'0'.repeat(64)},text=canonical(record),hash=await digest(record);
 await db.batch([db.prepare("SELECT CASE WHEN COALESCE((SELECT revision FROM studio_document_activation WHERE id=1),0)=? THEN 1 ELSE json_extract('activation_cas','$.abort') END").bind(expectedRevision),db.prepare('INSERT INTO studio_document_activation_log VALUES(?,?,?,?,?)').bind(record.revision,operationId,record.previousHash,text,hash),db.prepare('INSERT INTO studio_document_activation VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,mode=excluded.mode,targets_json=excluded.targets_json,operation_id=excluded.operation_id,record_hash=excluded.record_hash').bind(record.revision,mode,canonical(targets),operationId,hash)]);
 const actual=await db.prepare('SELECT * FROM studio_document_activation WHERE id=1').first();if(actual.record_hash!==hash)fail('activation-result-unknown');return{...record,recordHash:hash};
}
export async function activationGuard(db,account,device){
 const row=await db.prepare('SELECT * FROM studio_document_activation WHERE id=1').first();if(!row||row.mode==='off')fail('studio_off');
 const log=await db.prepare('SELECT * FROM studio_document_activation_log WHERE revision=?').bind(row.revision).first();if(!log||await digest(JSON.parse(log.record_json))!==row.record_hash||log.record_hash!==row.record_hash)fail('activation-audit');
 const record=JSON.parse(log.record_json);if(record.revision!==row.revision||record.mode!==row.mode||canonical(record.targets)!==row.targets_json||record.operationId!==row.operation_id)fail('activation-audit');
 const targets=JSON.parse(row.targets_json);if(row.mode==='canary'&&!targets.some(t=>t.accountId===account&&t.deviceId===device))fail('activation-scope');
 return {mode:row.mode,assertDataset(dataset){if(row.mode==='canary'&&!targets.some(t=>t.accountId===account&&t.deviceId===device&&t.datasetId===dataset))fail('activation-dataset');},wrap(underlying,dataset=null){if(dataset!==null&&row.mode==='canary'&&!targets.some(t=>t.accountId===account&&t.deviceId===device&&t.datasetId===dataset))fail('activation-dataset');return{prepare:sql=>underlying.prepare(sql),async batch(ss){const check=()=>underlying.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM studio_document_activation WHERE id=1 AND revision=? AND record_hash=? AND mode<>'off') THEN 1 ELSE json_extract('activation_changed','$.abort') END").bind(row.revision,row.record_hash);const r=await underlying.batch([check(),...ss,check()]);return r.slice(1,-1);}};}};
}
