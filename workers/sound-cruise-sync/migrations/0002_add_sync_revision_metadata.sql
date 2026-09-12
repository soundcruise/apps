ALTER TABLE sync_records
    ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1
        CHECK (schema_version >= 1);

ALTER TABLE sync_changes
    ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1
        CHECK (schema_version >= 1);

ALTER TABLE sync_datasets
    ADD COLUMN last_change_seq INTEGER NOT NULL DEFAULT 0
        CHECK (last_change_seq >= 0);
