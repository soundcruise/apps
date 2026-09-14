# M10 Multi-App QA Admission Runbook

This gate is separate from Account identity and from the production Legacy Chord admission path.
The Account runtime kill switch and QA admission must both allow a request. Missing schema,
bindings, peppers, runtime state, or credential fails closed for Multi-App while `/v1` Legacy
Chord remains governed by its existing production controls.

## Required Cloudflare configuration (future deployment only)

- Apply `0015_add_account_qa_admission.sql` after migrations `0008`–`0014`.
- Add secrets `SYNC_ACCOUNT_QA_ENROLLMENT_PEPPER` and
  `SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER`. Never reuse any Enrollment, Pairing, Recovery,
  Account Recovery, Handoff, or device credential pepper.
- Add `ACCOUNT_QA_ENROLL_RATE_LIMITER` with a conservative per-IP limit.
- Set `SYNC_QA_ALLOWED_APP_IDS=chord,pitch,rhythm,fretboard`; keep
  `SYNC_ALLOWED_APP_IDS=chord` unchanged.
- Keep `ACCOUNT_ALLOWED_ORIGINS` and `ALLOWED_ORIGINS` restricted to
  `https://soundcruise.jp`; no wildcard and no Pilot origin.
- Configure Turnstile action `sound_cruise_account_qa_enroll` for the production hostname.
- Enable only the necessary Account runtime operations for the QA window. This is independent
  of QA admission and remains the emergency kill switch.

## Issue one enrollment

Export the dedicated enrollment pepper without placing its value in shell history, then run:

```sh
npm run qa:enrollment:create -- --remote --ttl-minutes=60
```

The helper writes only the HMAC verifier to D1 and displays the plaintext enrollment code once,
after the write succeeds. Do not capture terminal output in CI or logs. Give the code directly to
the named tester.

## Enroll and run QA

1. Open Cruise Port using the dedicated activation URL ending in
   `?sound-cruise-qa=1#sync-center`. The query value is not a secret; server admission is the
   boundary. Normal production URLs keep Sync Center hidden.
2. Enter the single-use QA Enrollment Code in the Port prompt and complete Turnstile.
3. Confirm a `port` QA session with a seven-day maximum expiry. D1 stores only its verifier.
4. Create the Account and prepare memberships from Port.
5. Launch each app from Port. Handoff issuance records the authorized Port session; handoff
   consume atomically creates a separate `app` QA credential bound to account, app, and app
   device. Same-origin browser storage keeps Port and each app in separate named admission
   slots; the Port credential is never copied into app data storage.
6. Perform M10 E2E. A missing, expired, revoked, wrong-scope, wrong-app, wrong-account, or
   wrong-device QA credential must be rejected.

## Revoke and close the QA window

Dry-run first, then execute with the exact session UUID:

```sh
npm run qa:session:revoke -- --session-id=00000000-0000-4000-8000-000000000000
npm run qa:session:revoke -- --session-id=00000000-0000-4000-8000-000000000000 --remote
```

Revoking the Port session with the helper also revokes its directly issued child app sessions.
An app-session ID revokes only that app session. Then return Account runtime controls to the
closed/development state. Revocation must not delete local app data. Account/identity cleanup,
Account Recovery, Account device revoke, account-wide delete, and app-scoped delete are separate
phases.
