import { createD1AccountQaRepository } from './account-qa-database.js';
import { parseQaCredential, qaCredentialVerifier } from './account-qa-crypto.js';

export function readQaAuthorization(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const match = /^Bearer ([^\s]+)$/.exec(headerValue);
  return match ? match[1] : null;
}

export async function authenticateQaRequest(db, headerValue, env, constraints = {}, dependencies = {}) {
  if (!db || !env.SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER) return null;
  const credential = readQaAuthorization(headerValue);
  const parsed = parseQaCredential(credential);
  if (!parsed) return null;
  const verifier = await (dependencies.qaCredentialVerifier || qaCredentialVerifier)(
    credential,
    env.SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER
  );
  const repository = (dependencies.createAccountQaRepository || createD1AccountQaRepository)(db);
  return repository.authenticate({
    sessionId: parsed.sessionId,
    credentialVerifier: verifier,
    now: Date.now(),
    ...constraints
  });
}
