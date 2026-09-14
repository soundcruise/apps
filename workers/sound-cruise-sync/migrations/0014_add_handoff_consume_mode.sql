-- M9 makes Account handoff consumption explicit. New app containers activate a
-- fresh Account-managed data identity; an existing Chord container only claims
-- an Account-device credential and must complete the existing M4 bridge flow.
-- No plaintext handoff or credential material is persisted.

ALTER TABLE sync_membership_handoffs
    ADD COLUMN consume_mode TEXT
        CHECK (consume_mode IS NULL OR consume_mode IN ('new_app', 'existing_chord'));

CREATE INDEX IF NOT EXISTS idx_sync_membership_handoffs_consume_mode
    ON sync_membership_handoffs(account_id, membership_id, consume_mode, consumed_at);
