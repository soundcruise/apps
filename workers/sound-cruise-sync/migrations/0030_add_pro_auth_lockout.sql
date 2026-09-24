-- H1: temporary, pseudonymous IP-scoped Pro verification abuse state.
CREATE TABLE IF NOT EXISTS pro_auth_lockouts (
  ip_key TEXT PRIMARY KEY CHECK (length(ip_key) = 64 AND ip_key NOT GLOB '*[^0-9a-f]*'),
  failure_count INTEGER NOT NULL CHECK (failure_count BETWEEN 0 AND 4),
  lock_level INTEGER NOT NULL CHECK (lock_level BETWEEN 0 AND 2),
  locked_until INTEGER CHECK (locked_until IS NULL OR locked_until >= 0),
  last_failure_at INTEGER NOT NULL CHECK (last_failure_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= last_failure_at)
);

CREATE INDEX IF NOT EXISTS pro_auth_lockouts_last_failure_idx
  ON pro_auth_lockouts (last_failure_at);
