import {
  createEnrollmentCode,
  enrollmentCodeVerifier,
  formatEnrollmentCode
} from '../src/crypto.js';

const pepper = process.env.SYNC_ENROLLMENT_PEPPER;
const lifetimeMinutes = Number(process.env.ENROLLMENT_LIFETIME_MINUTES || 60);

if (typeof pepper !== 'string' || pepper.length < 32) {
  throw new Error('SYNC_ENROLLMENT_PEPPER must be supplied through the environment');
}
if (!Number.isInteger(lifetimeMinutes) || lifetimeMinutes < 1 || lifetimeMinutes > 10_080) {
  throw new Error('ENROLLMENT_LIFETIME_MINUTES must be an integer from 1 to 10080');
}

const code = createEnrollmentCode();
const verifier = await enrollmentCodeVerifier(code, pepper);
const createdAt = Date.now();
const expiresAt = createdAt + lifetimeMinutes * 60 * 1000;

process.stdout.write([
  `Enrollment Code (display once): ${formatEnrollmentCode(code)}`,
  `Verifier: ${verifier}`,
  `App ID: chord`,
  `Created at (ms): ${createdAt}`,
  `Expires at (ms): ${expiresAt}`,
  ''
].join('\n'));
