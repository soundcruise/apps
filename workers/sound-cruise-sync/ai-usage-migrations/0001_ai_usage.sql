-- Apply ONLY to the independent AI_SUPPORT_USAGE_DB, never SYNC_DB.
-- Money is integer micro-USD. This table is the authoritative, live policy for all Worker versions.
CREATE TABLE ai_usage_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  account_daily INTEGER NOT NULL CHECK (account_daily BETWEEN 1 AND 10000),
  account_monthly INTEGER NOT NULL CHECK (account_monthly BETWEEN 1 AND 100000),
  daily_micros INTEGER NOT NULL CHECK (daily_micros BETWEEN 1 AND 1000000000),
  monthly_micros INTEGER NOT NULL CHECK (monthly_micros BETWEEN 1 AND 10000000000),
  warning_percent INTEGER NOT NULL CHECK (warning_percent BETWEEN 1 AND 99),
  usage_verified INTEGER NOT NULL DEFAULT 0 CHECK (usage_verified IN (0, 1)),
  identity_tag TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);
INSERT INTO ai_usage_policy VALUES (1, 10, 100, 1000000, 10000000, 80, 0, NULL, 1);

CREATE TABLE ai_usage (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  month TEXT NOT NULL,
  account_key TEXT NOT NULL,
  model TEXT NOT NULL CHECK (model = 'gpt-oss-120b'),
  policy_version TEXT NOT NULL,
  reserved_micros INTEGER NOT NULL CHECK (reserved_micros > 0),
  budget_micros INTEGER NOT NULL CHECK (budget_micros >= 0 AND budget_micros <= reserved_micros),
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'settled')),
  model_calls INTEGER NOT NULL DEFAULT 0 CHECK (model_calls BETWEEN 0 AND 4),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_micros INTEGER NOT NULL DEFAULT 0 CHECK (estimated_micros >= 0),
  unknown_calls INTEGER NOT NULL DEFAULT 0 CHECK (unknown_calls BETWEEN 0 AND 4),
  outcome TEXT NOT NULL DEFAULT 'incomplete' CHECK (outcome IN
    ('incomplete', 'ok', 'provider_error', 'diagnostics_error', 'secret_blocked', 'context_limit', 'accounting_error', 'support_error')),
  latency TEXT NOT NULL DEFAULT 'unknown' CHECK (latency IN ('unknown', 'lt5s', '5to15s', '15to30s', 'gte30s')),
  repair INTEGER NOT NULL DEFAULT 0 CHECK (repair IN (0, 1)),
  fallback INTEGER NOT NULL DEFAULT 0 CHECK (fallback IN (0, 1))
);
CREATE INDEX ai_usage_day ON ai_usage(day);
CREATE INDEX ai_usage_month ON ai_usage(month);
CREATE INDEX ai_usage_account ON ai_usage(month, account_key, day);

-- Anonymous aggregates only, no reservation IDs or Account pseudonyms. Retained for 400 days.
CREATE TABLE ai_usage_daily (
  day TEXT NOT NULL,
  model TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  outcome TEXT NOT NULL,
  latency TEXT NOT NULL,
  consultations INTEGER NOT NULL,
  model_calls INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_micros INTEGER NOT NULL,
  budget_micros INTEGER NOT NULL,
  unknown_calls INTEGER NOT NULL,
  incomplete INTEGER NOT NULL,
  repairs INTEGER NOT NULL,
  fallbacks INTEGER NOT NULL,
  PRIMARY KEY (day, model, policy_version, outcome, latency)
);
