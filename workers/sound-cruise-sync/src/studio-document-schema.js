// Candidate only. Not a numbered migration; never installed by a request.
export const STUDIO_DOCUMENT_DDL = Object.freeze([
 `CREATE TABLE studio_document_enrollments (account_id TEXT NOT NULL,device_id TEXT NOT NULL,generation INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN(0,1)),PRIMARY KEY(account_id,device_id))`,
 `CREATE TABLE studio_document_identity_operations (account_id TEXT NOT NULL,operation_id TEXT NOT NULL,digest TEXT NOT NULL,result_json TEXT NOT NULL,PRIMARY KEY(account_id,operation_id))`,
 `CREATE TABLE studio_document_control (id INTEGER PRIMARY KEY CHECK(id=1), epoch INTEGER NOT NULL CHECK(epoch>0), enabled INTEGER NOT NULL CHECK(enabled IN(0,1)), version INTEGER NOT NULL CHECK(version=1))`,
 `CREATE TABLE studio_document_pending (account_id TEXT NOT NULL, operation_id TEXT NOT NULL, device_id TEXT NOT NULL, generation INTEGER NOT NULL, epoch INTEGER NOT NULL, document_id TEXT NOT NULL, expected_revision INTEGER NOT NULL, request_digest TEXT NOT NULL, manifest_json TEXT NOT NULL, binding_json TEXT NOT NULL, PRIMARY KEY(account_id,operation_id))`,
 `CREATE TRIGGER studio_document_pending_immutable BEFORE UPDATE ON studio_document_pending BEGIN SELECT RAISE(ABORT,'immutable_pending'); END`,
 `CREATE TABLE studio_document_chunks (account_id TEXT NOT NULL, operation_id TEXT NOT NULL, ordinal INTEGER NOT NULL, data TEXT NOT NULL, digest TEXT NOT NULL, bytes INTEGER NOT NULL, PRIMARY KEY(account_id,operation_id,ordinal))`,
 `CREATE TRIGGER studio_document_chunks_immutable BEFORE UPDATE ON studio_document_chunks BEGIN SELECT RAISE(ABORT,'immutable_chunk'); END`,
 `CREATE TABLE studio_document_receipts (account_id TEXT NOT NULL, operation_id TEXT NOT NULL, binding_json TEXT NOT NULL, receipt_json TEXT NOT NULL, PRIMARY KEY(account_id,operation_id))`,
 `CREATE TABLE studio_document_records (user_id TEXT NOT NULL,app_id TEXT NOT NULL CHECK(app_id='studio'),record_type TEXT NOT NULL CHECK(record_type='project'),record_id TEXT NOT NULL,payload_json TEXT,payload_hash TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL,deleted_at INTEGER,updated_by_device_id TEXT,last_operation_id TEXT NOT NULL,schema_version INTEGER NOT NULL,PRIMARY KEY(user_id,app_id,record_type,record_id))`,
 `CREATE TABLE studio_document_changes (change_seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,app_id TEXT NOT NULL CHECK(app_id='studio'),record_type TEXT NOT NULL,record_id TEXT NOT NULL,revision INTEGER NOT NULL,operation_id TEXT NOT NULL,operation_hash TEXT NOT NULL,payload_json TEXT,payload_hash TEXT NOT NULL,deleted_at INTEGER,changed_at INTEGER NOT NULL,schema_version INTEGER NOT NULL,UNIQUE(user_id,app_id,operation_id))`,
 `CREATE TABLE studio_document_datasets (user_id TEXT NOT NULL,app_id TEXT NOT NULL CHECK(app_id='studio'),state TEXT NOT NULL,schema_version INTEGER NOT NULL,record_count INTEGER NOT NULL DEFAULT 0,manifest_hash TEXT,min_change_seq INTEGER NOT NULL DEFAULT 0,last_change_seq INTEGER NOT NULL DEFAULT 0,initialized_at INTEGER,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,app_id))`,
 `CREATE VIEW studio_document_users AS SELECT id,state FROM sync_accounts`,
 `CREATE VIEW studio_document_devices AS SELECT id,account_id AS user_id,'studio' AS app_id,revoked_at FROM sync_account_devices`
]);
// Deliberately no FK to shared Accounts: legacy purge must neither fail nor erase unresolved operations.
// Orphan rows stay inaccessible. Production retention/deletion policy remains a separate gate.
