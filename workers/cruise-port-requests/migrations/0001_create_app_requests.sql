CREATE TABLE app_requests (
  request_key TEXT PRIMARY KEY,

  platform TEXT NOT NULL
    CHECK (platform IN ('ios', 'android')),

  store_identifier TEXT NOT NULL,

  canonical_store_url TEXT NOT NULL,

  latest_app_name TEXT,

  request_count INTEGER NOT NULL DEFAULT 1
    CHECK (request_count >= 1),

  first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'researching',
        'supported',
        'rejected'
      )
    ),

  app_key TEXT,

  latest_source_version TEXT,

  CHECK (
    status != 'supported'
    OR app_key IS NOT NULL
  )
);

CREATE INDEX app_requests_queue
ON app_requests (
  status,
  request_count DESC,
  last_seen DESC
);
