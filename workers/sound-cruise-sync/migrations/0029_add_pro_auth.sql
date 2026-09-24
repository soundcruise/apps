-- S2-A: independent global Pro access. No code, bearer token, IP, or identity is stored here.
CREATE TABLE IF NOT EXISTS pro_auth_state (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  generation INTEGER NOT NULL CHECK (generation > 0),
  active_code_slot TEXT NOT NULL CHECK (active_code_slot IN ('A', 'B')),
  legacy_compat_enabled INTEGER NOT NULL CHECK (legacy_compat_enabled IN (0, 1)),
  legacy_retired_at INTEGER CHECK (legacy_retired_at IS NULL OR legacy_retired_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
  CHECK (legacy_compat_enabled = 1 OR legacy_retired_at IS NOT NULL)
);

INSERT OR IGNORE INTO pro_auth_state
  (singleton_id, generation, active_code_slot, legacy_compat_enabled, legacy_retired_at, updated_at)
VALUES (1, 1, 'A', 1, NULL, 0);

CREATE TABLE IF NOT EXISTS pro_credentials (
  id TEXT PRIMARY KEY,
  verifier TEXT NOT NULL UNIQUE CHECK (length(verifier) = 64),
  generation INTEGER NOT NULL CHECK (generation > 0),
  scope TEXT NOT NULL CHECK (scope = 'global_pro'),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  revoked_at INTEGER CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX IF NOT EXISTS pro_credentials_generation_active_idx
  ON pro_credentials (generation, revoked_at);
