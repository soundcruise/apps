import { createHash } from 'node:crypto';
import { ingest } from '../phase2e/store.mjs';

// An injected provider supplies only metadata and text. It must not fetch URLs in payloads.
// `published` is an explicit producer-side completion marker, not inferred from age.
export function initRelay(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS drive_attempts (
    id INTEGER PRIMARY KEY, folder_id TEXT NOT NULL, file_id TEXT NOT NULL,
    filename TEXT, version TEXT, created_at TEXT, modified_at TEXT,
    payload_digest TEXT, run_id TEXT, candidate_id TEXT, idempotency_key TEXT,
    status TEXT NOT NULL, processed_at TEXT NOT NULL, detail TEXT
  )`);
}
const digest = text => createHash('sha256').update(text).digest('hex');
function log(db, m, status, detail, input, payloadDigest, now) {
  db.prepare(`INSERT INTO drive_attempts (folder_id,file_id,filename,version,created_at,modified_at,payload_digest,run_id,candidate_id,idempotency_key,status,processed_at,detail) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    m.folderId, m.fileId, m.name ?? null, m.version ?? null, m.createdAt ?? null, m.modifiedAt ?? null,
    payloadDigest ?? null, input?.run?.run_id ?? null, input?.candidate?.candidate_id ?? null,
    input?.candidate?.idempotency_key ?? null, status, now, detail ?? null);
}
export async function processFile(db, provider, folderId, fileId, now = new Date().toISOString()) {
  let meta = {folderId, fileId};
  let text, input, hash;
  try {
    const before = await provider.metadata(fileId);
    meta = {...meta, name:before.name, version:before.version, createdAt:before.createdAt, modifiedAt:before.modifiedAt};
    if (before.folderId !== folderId) throw new Error('wrong_folder');
    if (!before.version || !before.modifiedAt || before.published !== true) throw new Error('not_published');
    text = await provider.read(fileId);
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 128 * 1024) throw new Error('invalid_size');
    const after = await provider.metadata(fileId);
    if (after.folderId !== folderId || after.published !== true || after.version !== before.version || after.modifiedAt !== before.modifiedAt) throw new Error('changed_during_read');
    hash = digest(text);
    try { input = JSON.parse(text); } catch { throw new Error('invalid_json'); }
    const result = ingest(db, input, now);
    log(db, meta, result.status, result.status === 'invalid' ? JSON.stringify(result.errors) : null, input, hash, now);
    return {fileId, version:meta.version, ...result};
  } catch (e) {
    const allowed = ['wrong_folder','not_published','changed_during_read','invalid_size','invalid_json','auth_failed','transient_error'];
    const status = allowed.includes(e.message) ? e.message : 'provider_or_storage_error';
    log(db, meta, status, null, input, hash, now);
    return {fileId, status};
  }
}
export async function poll(db, provider, folderId, now) {
  if (!folderId || typeof folderId !== 'string') throw new Error('folder_required');
  const files = await provider.list(folderId); // A listing error must never mean an empty successful run.
  const results = [];
  for (const file of files) results.push(await processFile(db, provider, folderId, file.id, now));
  return results;
}
