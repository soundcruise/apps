// Trusted offline migration tool; never called by an HTTP request.
import {STUDIO_DOCUMENT_DDL} from './studio-document-schema.js';
import {maintenanceDigest,maintenanceCanonical} from './maintenance-bridge-v2.js';
import {MAINTENANCE_V2_PROFILES} from './maintenance-v2-profiles.js';
export const STUDIO_RELEASE_ID='studio_0001_rc2';
export const STUDIO_RELEASE_EXTRA=Object.freeze([
 `CREATE TABLE studio_document_migrations (sequence INTEGER PRIMARY KEY CHECK(sequence=1),migration_id TEXT NOT NULL UNIQUE,ddl_hash TEXT NOT NULL,base_fingerprint TEXT NOT NULL)`,
 `CREATE TABLE studio_document_schema_marker (id INTEGER PRIMARY KEY CHECK(id=1),migration_id TEXT NOT NULL,ddl_hash TEXT NOT NULL)`,
 `CREATE TABLE studio_document_recovery_proofs (account_id TEXT NOT NULL,operation_id TEXT NOT NULL,device_id TEXT NOT NULL,generation INTEGER NOT NULL,recovery_version INTEGER NOT NULL,request_fingerprint TEXT NOT NULL,result_json TEXT NOT NULL,proof_hash TEXT NOT NULL,PRIMARY KEY(account_id,operation_id))`,
 `CREATE TRIGGER studio_document_recovery_proofs_immutable BEFORE UPDATE ON studio_document_recovery_proofs BEGIN SELECT RAISE(ABORT,'immutable_recovery_proof'); END`,
 `CREATE TRIGGER studio_document_recovery_proofs_no_delete BEFORE DELETE ON studio_document_recovery_proofs BEGIN SELECT RAISE(ABORT,'retention_policy_unapproved'); END`,
 `CREATE TABLE studio_document_rate (account_id TEXT NOT NULL,window INTEGER NOT NULL,requests INTEGER NOT NULL CHECK(requests>0),PRIMARY KEY(account_id,window))`
]);
export const STUDIO_RC2_DDL=Object.freeze([
 `CREATE TABLE studio_document_rate_policy (id INTEGER PRIMARY KEY CHECK(id=1),window_ms INTEGER NOT NULL,floor_window INTEGER NOT NULL)`,
 `CREATE TABLE studio_document_usage (account_id TEXT PRIMARY KEY,bytes INTEGER NOT NULL DEFAULT 0 CHECK(bytes>=0),operations INTEGER NOT NULL DEFAULT 0 CHECK(operations>=0))`,
 `CREATE TABLE studio_document_resolutions (account_id TEXT NOT NULL,operation_id TEXT NOT NULL,request_digest TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('collected','discarded')),receipt_json TEXT NOT NULL,PRIMARY KEY(account_id,operation_id))`,
 `CREATE TABLE studio_document_maintenance_receipts (account_id TEXT NOT NULL,operation_id TEXT NOT NULL,digest TEXT NOT NULL,result_json TEXT NOT NULL,PRIMARY KEY(account_id,operation_id))`,
 `CREATE TRIGGER studio_document_maintenance_receipts_immutable BEFORE UPDATE ON studio_document_maintenance_receipts BEGIN SELECT RAISE(ABORT,'immutable_maintenance_receipt'); END`,
 `CREATE TRIGGER studio_document_maintenance_receipts_no_delete BEFORE DELETE ON studio_document_maintenance_receipts BEGIN SELECT RAISE(ABORT,'immutable_maintenance_receipt'); END`,
 `CREATE TABLE studio_document_erase_intents (account_id TEXT NOT NULL,operation_id TEXT NOT NULL,binding_json TEXT NOT NULL,scope_json TEXT NOT NULL,scope_digest TEXT NOT NULL,policy_digest TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(account_id,operation_id))`,
 `CREATE TABLE studio_document_erased_accounts (account_id TEXT PRIMARY KEY,operation_id TEXT NOT NULL,receipt_json TEXT NOT NULL)`,
 `CREATE TRIGGER studio_document_usage_pending AFTER INSERT ON studio_document_pending BEGIN INSERT INTO studio_document_usage(account_id,bytes,operations) VALUES(NEW.account_id,0,1) ON CONFLICT(account_id) DO UPDATE SET operations=operations+1; END`,
 `CREATE TRIGGER studio_document_usage_chunk_insert AFTER INSERT ON studio_document_chunks BEGIN INSERT INTO studio_document_usage(account_id,bytes,operations) VALUES(NEW.account_id,NEW.bytes,0) ON CONFLICT(account_id) DO UPDATE SET bytes=bytes+NEW.bytes; END`,
 `CREATE TRIGGER studio_document_usage_chunk_delete AFTER DELETE ON studio_document_chunks BEGIN UPDATE studio_document_usage SET bytes=bytes-OLD.bytes WHERE account_id=OLD.account_id; END`,
 `CREATE TRIGGER studio_document_usage_resolved AFTER INSERT ON studio_document_resolutions BEGIN UPDATE studio_document_usage SET operations=operations-1 WHERE account_id=NEW.account_id; END`,
 `CREATE TRIGGER studio_document_resolutions_immutable BEFORE UPDATE ON studio_document_resolutions BEGIN SELECT RAISE(ABORT,'immutable_resolution'); END`,
 `CREATE TRIGGER studio_document_resolutions_no_delete BEFORE DELETE ON studio_document_resolutions BEGIN SELECT RAISE(ABORT,'immutable_resolution'); END`,
 `CREATE TRIGGER studio_document_erase_intents_immutable BEFORE UPDATE ON studio_document_erase_intents BEGIN SELECT RAISE(ABORT,'immutable_erase_intent'); END`,
 `CREATE TRIGGER studio_document_erase_intents_no_delete BEFORE DELETE ON studio_document_erase_intents BEGIN SELECT RAISE(ABORT,'immutable_erase_intent'); END`,
 `CREATE TRIGGER studio_document_erased_accounts_immutable BEFORE UPDATE ON studio_document_erased_accounts BEGIN SELECT RAISE(ABORT,'immutable_erased_account'); END`,
 `CREATE TRIGGER studio_document_erased_accounts_no_delete BEFORE DELETE ON studio_document_erased_accounts BEGIN SELECT RAISE(ABORT,'immutable_erased_account'); END`,
 `CREATE INDEX studio_document_pending_document ON studio_document_pending(account_id,document_id)`,
 `CREATE INDEX studio_document_records_head ON studio_document_records(user_id,last_operation_id)`,
 `CREATE INDEX studio_document_changes_account_record ON studio_document_changes(user_id,record_id,revision)`
]);
export const STUDIO_RELEASE_DDL=Object.freeze([...STUDIO_DOCUMENT_DDL,...STUDIO_RELEASE_EXTRA,...STUDIO_RC2_DDL]);
export const STUDIO_SCHEMA_SQL="SELECT json_group_array(json_array(type,name,sql)) encoded FROM (SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'_cf_KV' ORDER BY type,name)";
export const STUDIO_JOURNAL_SQL='SELECT json_group_array(json_array(id,name)) encoded FROM (SELECT id,name FROM d1_migrations ORDER BY id)';
const fail=code=>{throw Object.assign(Error(code),{code});};
export async function studioReleaseHash(){return maintenanceDigest({id:STUDIO_RELEASE_ID,ddl:STUDIO_RELEASE_DDL});}
export function releaseAssertion(db,hash){return db.prepare(`SELECT CASE WHEN (SELECT count(*) FROM studio_document_migrations)=1 AND EXISTS(SELECT 1 FROM studio_document_migrations j JOIN studio_document_schema_marker m ON m.id=1 WHERE j.sequence=1 AND j.migration_id=? AND j.ddl_hash=? AND j.base_fingerprint=? AND m.migration_id=j.migration_id AND m.ddl_hash=j.ddl_hash) THEN 1 ELSE json_extract('release_marker','$.abort') END`).bind(STUDIO_RELEASE_ID,hash,Object.values(MAINTENANCE_V2_PROFILES).find(p=>p.stage===33).fingerprint);}
export async function inspectStudioRelease(db){
 const hash=await studioReleaseHash();await releaseAssertion(db,hash).all();
 const base=(await db.prepare(STUDIO_SCHEMA_SQL).first()).encoded;
 const expected=STUDIO_RELEASE_DDL.map(sql=>[(/CREATE (TABLE|TRIGGER|VIEW|INDEX)/.exec(sql)[1]).toLowerCase(),/CREATE (?:TABLE|TRIGGER|VIEW|INDEX) (\w+)/.exec(sql)[1],sql]);
 const actual=JSON.parse(base).filter(r=>r[1].startsWith('studio_document_'));
 if(maintenanceCanonical(actual.sort((a,b)=>a[1].localeCompare(b[1])))!==maintenanceCanonical(expected.sort((a,b)=>a[1].localeCompare(b[1]))))fail('studio_release_schema_unknown');
 const original=JSON.parse(base).filter(r=>!r[1].startsWith('studio_document_')).map(([type,name,sql])=>({type,name,sql:sql.trim().replace(/;$/,'')}));const fp=await maintenanceDigest(original),journal=JSON.parse((await db.prepare(STUDIO_JOURNAL_SQL).first()).encoded),profile=Object.values(MAINTENANCE_V2_PROFILES).find(p=>p.stage===33&&p.fingerprint===fp&&maintenanceCanonical(p.journal)===maintenanceCanonical(journal.map(r=>r[1])));if(!profile||journal.some((r,i)=>r[0]!==i+1))fail('studio_release_base_unknown');
 return {migrationId:STUDIO_RELEASE_ID,ddlHash:hash};
}
export async function studioReleasePlan(db){
 const schema=(await db.prepare(STUDIO_SCHEMA_SQL).first()).encoded,journal=(await db.prepare(STUDIO_JOURNAL_SQL).first()).encoded;
 const objects=JSON.parse(schema);if(objects.some(r=>r[1].startsWith('studio_document_')))fail('studio_migration_partial_or_replay');
 const fingerprint=await maintenanceDigest(objects.map(([type,name,sql])=>({type,name,sql:sql.trim().replace(/;$/,'')})));
 const history=JSON.parse(journal);const profile=Object.values(MAINTENANCE_V2_PROFILES).find(p=>p.stage===33&&p.fingerprint===fingerprint&&maintenanceCanonical(p.journal)===maintenanceCanonical(history.map(x=>x[1])));
 if(!profile||history.some((r,i)=>r[0]!==i+1))fail('studio_migration_base_unknown');
 const hash=await studioReleaseHash();
 return {hash,fingerprint,schema,journal,statements:[
 db.prepare(`SELECT CASE WHEN (SELECT encoded FROM (${STUDIO_SCHEMA_SQL}))=? AND (SELECT encoded FROM (${STUDIO_JOURNAL_SQL}))=? THEN 1 ELSE json_extract('migration_race','$.abort') END`).bind(schema,journal),
 ...STUDIO_RELEASE_DDL.map(sql=>db.prepare(sql)),
 db.prepare('INSERT INTO studio_document_migrations VALUES(1,?,?,?)').bind(STUDIO_RELEASE_ID,hash,fingerprint),
 db.prepare('INSERT INTO studio_document_schema_marker VALUES(1,?,?)').bind(STUDIO_RELEASE_ID,hash),
 db.prepare('INSERT INTO studio_document_control VALUES(1,1,0,1)'),releaseAssertion(db,hash)]};
}
export async function installStudioRelease(db){const p=await studioReleasePlan(db);await db.batch(p.statements);return inspectStudioRelease(db);}
