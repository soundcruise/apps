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
- Bind `ACCOUNT_QA_ENROLL_RATE_LIMITER` to namespace `32006` with a conservative
  per-IP limit of 5 requests per 60 seconds. The Enrollment endpoint fails closed
  when this binding is absent; do not weaken that behavior.
- Set `SYNC_QA_ALLOWED_APP_IDS=chord,pitch,rhythm,fretboard`; keep
  `SYNC_ALLOWED_APP_IDS=chord` unchanged.
- Keep `ACCOUNT_ALLOWED_ORIGINS` and `ALLOWED_ORIGINS` restricted to
  `https://soundcruise.jp`; no wildcard and no Pilot origin.
- Configure Turnstile action `sound_cruise_account_qa_enroll` for the production hostname.
- Enable only the necessary Account runtime operations for the QA window. This is independent
  of QA admission and remains the emergency kill switch.

## Issue one enrollment

The preferred production operation is a one-shot helper that rotates only the Enrollment pepper
and issues exactly one Enrollment. It keeps the new pepper in process memory, passes it to
`wrangler secret put` over stdin, and never writes the pepper to stdout, argv, the repository,
the clipboard, or a temporary file. It refuses to rotate while an active unused Enrollment exists.

The command is a non-mutating dry-run by default:

```sh
npm run qa:enrollment:rotate-and-create
```

After confirming that active unused Enrollment count is zero, run the remote operation directly
in the named tester's visible terminal:

```sh
npm run qa:enrollment:rotate-and-create -- --remote --ttl-minutes=60
```

`wrangler secret put` creates and immediately deploys a new Worker version containing the updated
encrypted secret. It does not upload the local Worker source, so do not run a separate source
deploy. The helper then writes one HMAC verifier row to D1 and displays only the plaintext SQA1
Enrollment Code once. Do not capture the live terminal output in CI, logs, screenshots, clipboard,
or automation. Give the code directly to the named tester.

Enrollment pepper rotation invalidates only unused codes created with the previous pepper. Existing
QA sessions continue to authenticate with the separate `SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER`; Account,
Recovery, Join, and app/device credentials do not use the Enrollment pepper. Consumed Enrollment rows
remain audit records and are not revalidated during QA session authentication.

If secret rotation succeeds but Enrollment issuance fails, do not assume the INSERT failed from
Wrangler metadata alone. The helper verifies its generated UUID with a secret-free SELECT before
displaying a code. If an older helper left an orphaned active Enrollment whose plaintext was never
displayed, cancel only that exact UUID with `qa:enrollment:cancel-orphan`; require exactly one row
to change, then re-run the one-shot helper. Never recover or read back the deployed secret.

The older `qa:enrollment:create` helper is only suitable when an operator already possesses the
currently deployed Enrollment pepper through an approved secret-delivery channel. Never attempt to
read that pepper back from Cloudflare.

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

## Sensitive UI automation contract

Join, Recovery, Pairing, Enrollment and Turnstile are sensitive surfaces. Automation must not
capture a full DOM, `body.innerText`, accessibility/AX snapshot, screenshot, OCR, clipboard,
input value, request/response body, console output or storage while a plaintext secret can be
present. A sensitive marker is an avoidance marker, never permission to read the element.

Only the user may copy, enter or save a plaintext secret. Automation may use pre-audited phase
and action selectors, non-secret success/status Booleans and verifier-only server metadata. After
the user reports that a secret was entered or saved, do not rediscover the next action with a
page-wide scan. If the required stable selector is unavailable, stop.

Consumed Join, Pairing and Enrollment inputs are cleared from the DOM before transport. Their
plaintext may remain only in an in-memory closure while an ambiguous network/5xx response is
retryable, and is discarded after confirmed success or a definitive invalid/expired/consumed/
wrong-code response. A successful Join complete phase contains no code input. Recovery input is
removed on successful prepare; a replacement Recovery Code remains visible only until the user
confirms it was saved, then its output is removed before commit. Issue-side one-time codes remain
visible only for the product-defined save or expiry window.

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
