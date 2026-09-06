export const UPSERT_APP_REQUEST_SQL = `
INSERT INTO app_requests (
  request_key,
  platform,
  store_identifier,
  canonical_store_url,
  latest_app_name,
  request_count,
  first_seen,
  last_seen,
  status,
  latest_source_version
)
VALUES (?1, ?2, ?3, ?4, ?5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'pending', ?6)
ON CONFLICT(request_key) DO UPDATE SET
  request_count = app_requests.request_count + 1,
  last_seen = CURRENT_TIMESTAMP,
  canonical_store_url = excluded.canonical_store_url,
  latest_app_name = COALESCE(
    NULLIF(excluded.latest_app_name, ''),
    app_requests.latest_app_name
  ),
  latest_source_version = excluded.latest_source_version
RETURNING request_key
`;

export async function upsertAppRequest(database, requestData) {
  return database
    .prepare(UPSERT_APP_REQUEST_SQL)
    .bind(
      requestData.requestKey,
      requestData.platform,
      requestData.identifier,
      requestData.canonicalStoreUrl,
      requestData.appName,
      requestData.requestSourceVersion
    )
    .first();
}
