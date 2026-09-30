-- Publisher attempts, including failed GETs, start the source minimum interval.
ALTER TABLE source_state ADD COLUMN last_publisher_request_at INTEGER NOT NULL DEFAULT 0;
UPDATE source_state SET last_publisher_request_at=COALESCE(
 (SELECT last_successful_run_at FROM source_health WHERE source_health.source_id=source_state.source_id),0);
UPDATE source_state SET next_at=MAX(next_at,last_publisher_request_at+86400000)
 WHERE source_id='shimamura' AND last_publisher_request_at>0;
