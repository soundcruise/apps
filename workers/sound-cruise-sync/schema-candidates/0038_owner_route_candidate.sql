-- CANDIDATE ONLY. Not in configured migrations_dir. No production application.
-- Apply as one D1 batch after exact preflight; no backfill, no activation.
ALTER TABLE sync_account_devices ADD COLUMN credential_issued_at INTEGER;
ALTER TABLE sync_account_devices ADD COLUMN credential_expires_at INTEGER;
ALTER TABLE sync_account_devices ADD COLUMN credential_lease_revision INTEGER;
ALTER TABLE sync_account_devices ADD COLUMN credential_lifecycle TEXT;
ALTER TABLE sync_account_devices ADD COLUMN credential_clock_floor INTEGER;
ALTER TABLE sync_account_devices ADD COLUMN credential_account_generation INTEGER;
ALTER TABLE sync_account_devices ADD COLUMN credential_membership_id TEXT;
ALTER TABLE sync_account_devices ADD COLUMN credential_membership_generation INTEGER;
ALTER TABLE sync_account_devices ADD COLUMN credential_transition_id TEXT;
ALTER TABLE sync_account_devices ADD COLUMN credential_operations_json TEXT;
ALTER TABLE sync_account_devices ADD COLUMN credential_recovery_json TEXT;
ALTER TABLE sync_account_devices ADD COLUMN credential_recovery_until INTEGER;
ALTER TABLE sync_account_devices ADD COLUMN operation_fence_revision INTEGER;
ALTER TABLE sync_account_runtime_control ADD COLUMN account_save_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_account_runtime_control ADD COLUMN credential_lifecycle_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_account_runtime_control ADD COLUMN account_history_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_changes ADD COLUMN isolated_request_digest TEXT;
ALTER TABLE sync_changes ADD COLUMN isolated_account_binding TEXT;
CREATE TABLE sync_account_operation_leases(account_id TEXT NOT NULL,device_id TEXT NOT NULL,operation_id TEXT NOT NULL,envelope_digest TEXT NOT NULL,envelope_json TEXT NOT NULL,request_digest TEXT NOT NULL,authorization_digest TEXT NOT NULL,lease_revision INTEGER NOT NULL,fencing_revision INTEGER NOT NULL,issued_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,credential_expires_at INTEGER NOT NULL,state TEXT NOT NULL,last_owner_now INTEGER NOT NULL,committed_revision INTEGER,payload_hash TEXT,PRIMARY KEY(account_id,operation_id));
CREATE TABLE sync_account_pointer_fences(account_id TEXT NOT NULL,device_id TEXT NOT NULL,dataset_id TEXT NOT NULL,phase TEXT NOT NULL,revision INTEGER NOT NULL,pointer_digest TEXT NOT NULL,consumer_json TEXT NOT NULL,transition_id TEXT,PRIMARY KEY(account_id,device_id,dataset_id));
CREATE TABLE sync_account_cutovers(account_id TEXT NOT NULL,device_id TEXT NOT NULL,dataset_id TEXT NOT NULL,transition_id TEXT NOT NULL,request_digest TEXT NOT NULL,request_json TEXT NOT NULL,fencing_revision INTEGER NOT NULL,registry_revision INTEGER NOT NULL,stopped_at INTEGER NOT NULL,completion_json TEXT,completion_digest TEXT,PRIMARY KEY(account_id,device_id,dataset_id,transition_id));
CREATE TABLE sync_account_authority_reauthorizations(account_id TEXT NOT NULL,operation_id TEXT NOT NULL,request_digest TEXT NOT NULL,request_json TEXT NOT NULL,observed_at INTEGER NOT NULL,PRIMARY KEY(account_id,operation_id));
CREATE TABLE sync_account_two_cycle_history(account_id TEXT NOT NULL,device_id TEXT NOT NULL,packet_json TEXT NOT NULL,packet_digest TEXT NOT NULL,PRIMARY KEY(account_id,device_id));
CREATE TABLE sync_owner_route_candidate(singleton_id INTEGER PRIMARY KEY CHECK(singleton_id=1),schema_version INTEGER NOT NULL CHECK(schema_version=1),enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),epoch INTEGER NOT NULL DEFAULT 1 CHECK(epoch>=1),mode TEXT NOT NULL DEFAULT 'disabled' CHECK(mode IN ('disabled','disposable')));
INSERT INTO sync_owner_route_candidate(singleton_id,schema_version) VALUES(1,1);
