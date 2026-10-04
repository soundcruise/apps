import { handleRequest, handleScheduled } from '../src/app.js';
import { hmacVerifier } from '../src/crypto.js';

export { handleScheduled };
export const TEST_PRO_PEPPER = 'isolated-only-pro-entitlement-pepper-at-least-32';
export const TEST_PRO_TOKEN = `scp1.123e4567-e89b-42d3-a456-426614174999.${'T'.repeat(43)}`;

export async function seedTestPro(db, pepper = TEST_PRO_PEPPER) {
  db.raw.prepare(`INSERT OR IGNORE INTO pro_credentials
    (id, verifier, generation, scope, created_at, revoked_at)
    VALUES (?, ?, 1, 'global_pro', 1, NULL)`).run(
    TEST_PRO_TOKEN.split('.')[1], await hmacVerifier(`sound-cruise-pro:v1:${TEST_PRO_TOKEN}`, pepper)
  );
  return TEST_PRO_TOKEN;
}

// Existing data-plane regression cases represent Pro users. SQLite cases use
// the real verifier; repository unit doubles explicitly stub only entitlement.
// Authorization-denial cases in pro-entitlement.test.js use the unwrapped API.
export async function handleProAuthorizedRequest(request, env = {}, ctx, dependencies = {}) {
  if (!new URL(request.url).pathname.startsWith('/v1/sync/')) {
    return handleRequest(request, env, ctx, dependencies);
  }
  const headers = new Headers(request.headers);
  headers.set('X-Sound-Cruise-Pro-Authorization', `Bearer ${TEST_PRO_TOKEN}`);
  const nextEnv = { ...env, PRO_CREDENTIAL_PEPPER: env.PRO_CREDENTIAL_PEPPER || TEST_PRO_PEPPER };
  if (env.SYNC_DB?.raw) {
    await seedTestPro(env.SYNC_DB, nextEnv.PRO_CREDENTIAL_PEPPER);
  } else {
    dependencies = { ...dependencies, inspectProCredentialReadOnly: async () => ({ ok: true }) };
  }
  return handleRequest(new Request(request, { headers }), nextEnv, ctx, dependencies);
}
