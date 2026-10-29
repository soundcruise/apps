-- Isolated candidate only: schema0033 plus explicit metadata. No formal number or implicit open.
CREATE TABLE sync_maintenance_v2_control (
 scope TEXT PRIMARY KEY NOT NULL,
 contract_version INTEGER NOT NULL CHECK(contract_version=2),
 epoch INTEGER NOT NULL CHECK(epoch BETWEEN 1 AND 9007199254740991),
 phase TEXT NOT NULL CHECK(phase IN ('closed','open','hold')),
 stop_id TEXT, handover_id TEXT, transition_id TEXT, updated_at INTEGER NOT NULL,
 CHECK(phase<>'open' OR (stop_id IS NOT NULL AND handover_id IS NOT NULL))
);

CREATE TABLE sync_maintenance_v2_operations (
 operation_id TEXT PRIMARY KEY NOT NULL,
 scope TEXT NOT NULL REFERENCES sync_maintenance_v2_control(scope) ON DELETE RESTRICT,
 epoch INTEGER NOT NULL CHECK(epoch BETWEEN 1 AND 9007199254740991),
 kind TEXT NOT NULL CHECK(kind IN ('mutation','external','stop','handover','open','recovery')),
 request_digest TEXT NOT NULL CHECK(length(request_digest)=64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
 binding_json TEXT NOT NULL CHECK(json_valid(binding_json)),
 binding_digest TEXT NOT NULL CHECK(length(binding_digest)=64),
 phase TEXT NOT NULL CHECK(phase IN ('registered','external_pending','external_proven','unknown','committed','resolved')),
 pending_json TEXT CHECK(pending_json IS NULL OR json_valid(pending_json)),
 pending_digest TEXT,
 receipt_json TEXT CHECK(receipt_json IS NULL OR json_valid(receipt_json)),
 receipt_digest TEXT, source_id TEXT, resolved_by TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 CHECK((receipt_json IS NULL AND receipt_digest IS NULL) OR
       (receipt_json IS NOT NULL AND length(receipt_digest)=64)),
 CHECK(phase<>'committed' OR receipt_json IS NOT NULL)
);

CREATE INDEX idx_maintenance_v2_pending ON sync_maintenance_v2_operations(scope,phase,epoch);

CREATE TABLE sync_maintenance_v2_assertions (id TEXT PRIMARY KEY NOT NULL, ok INTEGER NOT NULL CHECK(ok=1));

CREATE TRIGGER maintenance_v2_control_delete BEFORE DELETE ON sync_maintenance_v2_control
BEGIN SELECT RAISE(ABORT,'maintenance control retained'); END;

CREATE TRIGGER maintenance_v2_control_epoch BEFORE UPDATE ON sync_maintenance_v2_control
WHEN NEW.scope IS NOT OLD.scope OR NEW.contract_version IS NOT OLD.contract_version OR NEW.epoch<>OLD.epoch+1
BEGIN SELECT RAISE(ABORT,'maintenance epoch CAS required'); END;

CREATE TRIGGER maintenance_v2_operation_identity BEFORE UPDATE ON sync_maintenance_v2_operations
WHEN NEW.operation_id IS NOT OLD.operation_id OR NEW.scope IS NOT OLD.scope OR NEW.epoch IS NOT OLD.epoch OR NEW.kind IS NOT OLD.kind OR
 NEW.request_digest IS NOT OLD.request_digest OR NEW.binding_json IS NOT OLD.binding_json OR NEW.binding_digest IS NOT OLD.binding_digest OR
 NEW.created_at IS NOT OLD.created_at OR NEW.source_id IS NOT OLD.source_id
BEGIN SELECT RAISE(ABORT,'maintenance operation immutable'); END;

CREATE TRIGGER maintenance_v2_operation_delete BEFORE DELETE ON sync_maintenance_v2_operations
BEGIN SELECT RAISE(ABORT,'maintenance pending retained'); END;

CREATE TRIGGER maintenance_v2_receipt_immutable BEFORE UPDATE ON sync_maintenance_v2_operations
WHEN (OLD.receipt_json IS NOT NULL AND (NEW.receipt_json IS NOT OLD.receipt_json OR NEW.receipt_digest IS NOT OLD.receipt_digest)) OR
 (OLD.pending_json IS NOT NULL AND (NEW.pending_json IS NOT OLD.pending_json OR NEW.pending_digest IS NOT OLD.pending_digest))
BEGIN SELECT RAISE(ABORT,'maintenance evidence immutable'); END;

CREATE TRIGGER maintenance_v2_phase BEFORE UPDATE ON sync_maintenance_v2_operations
WHEN NOT(NEW.phase=OLD.phase OR
 (OLD.phase='registered' AND NEW.phase IN('external_pending','committed','unknown','resolved')) OR
 (OLD.phase='external_pending' AND NEW.phase IN('external_proven','unknown','resolved')) OR
 (OLD.phase='external_proven' AND NEW.phase IN('committed','unknown','resolved')) OR
 (OLD.phase='unknown' AND NEW.phase='resolved'))
BEGIN SELECT RAISE(ABORT,'maintenance invalid transition'); END;

CREATE TRIGGER maintenance_v2_receipt_binding BEFORE INSERT ON sync_maintenance_v2_operations
WHEN NEW.receipt_json IS NOT NULL AND
 (json_extract(NEW.receipt_json,'$.operationId') IS NOT NEW.operation_id OR
  json_extract(NEW.receipt_json,'$.scope') IS NOT NEW.scope OR
  json_extract(NEW.receipt_json,'$.requestDigest') IS NOT NEW.request_digest)
BEGIN SELECT RAISE(ABORT,'maintenance receipt mismatch'); END;

CREATE TRIGGER maintenance_v2_receipt_update BEFORE UPDATE ON sync_maintenance_v2_operations
WHEN NEW.receipt_json IS NOT NULL AND
 (json_extract(NEW.receipt_json,'$.operationId') IS NOT NEW.operation_id OR
  json_extract(NEW.receipt_json,'$.scope') IS NOT NEW.scope OR
  json_extract(NEW.receipt_json,'$.requestDigest') IS NOT NEW.request_digest)
BEGIN SELECT RAISE(ABORT,'maintenance receipt mismatch'); END;

CREATE TRIGGER maintenance_v2_control_bootstrap BEFORE INSERT ON sync_maintenance_v2_control
WHEN NEW.epoch<>1 OR NEW.phase<>'closed' OR NEW.stop_id IS NOT NULL OR NEW.handover_id IS NOT NULL OR NEW.transition_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'maintenance bootstrap closed only'); END;

CREATE TRIGGER maintenance_v2_control_receipt BEFORE UPDATE ON sync_maintenance_v2_control
WHEN NOT EXISTS(
 SELECT 1 FROM sync_maintenance_v2_operations o
 WHERE o.operation_id=NEW.transition_id AND o.scope=NEW.scope AND o.epoch=OLD.epoch AND o.phase='committed'
 AND json_extract(o.receipt_json,'$.nextEpoch')=NEW.epoch
 AND (
  (o.kind='stop' AND NEW.phase='closed' AND NEW.stop_id=o.operation_id AND NEW.handover_id IS NULL) OR
  (o.kind='handover' AND NEW.phase='closed' AND NEW.stop_id=OLD.stop_id AND NEW.handover_id=o.operation_id AND
   json_extract(o.receipt_json,'$.stopOperationId')=NEW.stop_id) OR
  (o.kind='open' AND OLD.phase='closed' AND NEW.phase='open' AND NEW.stop_id=OLD.stop_id AND NEW.handover_id=OLD.handover_id AND
   json_extract(o.receipt_json,'$.handoverOperationId')=NEW.handover_id)
 ))
BEGIN SELECT RAISE(ABORT,'maintenance transition receipt required'); END;

CREATE TRIGGER maintenance_v2_resolution BEFORE UPDATE ON sync_maintenance_v2_operations
WHEN NEW.phase='resolved' AND (NEW.resolved_by IS NULL OR NOT EXISTS(
 SELECT 1 FROM sync_maintenance_v2_operations r WHERE r.operation_id=NEW.resolved_by
 AND r.source_id=OLD.operation_id AND r.kind='recovery' AND r.phase='committed'
 AND r.scope=OLD.scope AND r.binding_digest=OLD.binding_digest
 AND json_extract(r.receipt_json,'$.sourceOperationId')=OLD.operation_id
 AND json_extract(r.receipt_json,'$.sourceRequestDigest')=OLD.request_digest
))
BEGIN SELECT RAISE(ABORT,'explicit recovery receipt required'); END;

CREATE TRIGGER maintenance_v2_resolution_immutable BEFORE UPDATE ON sync_maintenance_v2_operations
WHEN OLD.resolved_by IS NOT NULL AND NEW.resolved_by IS NOT OLD.resolved_by
BEGIN SELECT RAISE(ABORT,'recovery linkage immutable'); END;
