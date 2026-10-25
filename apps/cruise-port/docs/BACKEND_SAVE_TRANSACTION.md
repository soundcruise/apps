# Backend final authorization / local outcome contract (isolated v1)

PR #16 (`c543724b7d475ede233ebde7e59477e1cc6c3b2f`) is the direct parent. Internal patch candidates Studio 0.47.11 / Port 1.24.14; public main remains Studio 0.47.9 / Port 1.24.12. StudioProject schema2 is unchanged. Shared Write OFF, canWrite=false, no production route, migration, writer, Cloud or consumer cutover.

## Decision and guarantees

The protected backend resource is the existing Port `sync_records` row, with the existing `sync_changes` operation log and `sync_datasets` metadata. Account/device/member facts and this resource are in the same existing SQL database. Reuse `createD1SyncRepository`, `admitWriter`, `writerMutationDatabase` and `fenceQuery`; never recreate authentication or a second settings repository.

| Method | What it proves | Limitation / decision |
|---|---|---|
| Owner reauthorization inside backend SQL batch | Account HMAC verifier/version, active identity/generation/member/device, explicit save permission, credential lifecycle/expiry, Pro/device/writeEpoch fence, CAS, digest and exact record/receipt share one rollback boundary | **Chosen for the SQL resource only**. Requires the proposed owner lifecycle columns and explicit production owner rollout, which do not exist in production yet |
| Backend authorization then browser IndexedDB commit | Two separately observable outcomes | Cannot guarantee revocation exclusion between SQL and IndexedDB. Never advertised as atomic |
| Lease / fencing lasting through local commit | Would require owner-enforced lease/fence at every writer and an explicit revocation/expiry linearization contract | Not supplied by current backend. No lease is minted or inferred from 5-second observation TTL |
| Existing local Authority transaction | Local CAS/control/receipt/stop barrier and synchronous fixture admission | Retained as an independent local check. Remote SQL cannot be called atomically inside IndexedDB |
| Distributed commit / authoritative backend write then consumer projection | Requires provider/cutover, durable distributed recovery and owner policy | Future owner decision; not introduced by this patch |

The SQL prefix checks no prior operation and exact expected revision. Existing writer/data statements, request binding, a repeated writer fence and final owner/exact-record assertion execute in one D1 `batch`. NULL facts deny. Any failed assertion rolls back the entire data/log/dataset mutation. Concurrent owner revocation using that same primary DB serializes before or after this transaction. **The final SQL assertion is the authorization linearization point**, not the browser acknowledgement or physical fsync instant. Expiry crossing after that point is ordered after this operation; a stronger deadline-at-physical-commit guarantee is not claimed. No independent Account SQL / local Authority atomicity is assumed.

## Input / output and operation binding

`createIsolatedAccountSaveTransaction` is unrouted and requires `fixtureOnly:true`, an existing opaque isolated writer policy and test-only peppers. `prepare(request, credentials)` verifies the existing sca1 HMAC, scd1 device credential and Pro proof. An opaque in-memory handle is consumed once by `commit`; serialized JSON cannot manufacture it. Malformed/getter/unknown request shapes fail closed. Production routers never import it.

Request contractVersion1 / purpose `backend-port-save`: Account ID/device/generation, membership ID/generation, credentialVersion/credentialLeaseRevision, runtimeGeneration, dataset ID/appDeviceID/writeEpoch, localGeneration/localRevision and existing validated metronome operation. `localRevision` is the exact digest of the existing local recovery ticket's `body.base` (manifestId/seq/key versions/control), not an invented `base.head` property or a server generation. UUID operationID, baseRevision and payloadHash retain existing repository validation. BPM30–240 only; for an existing backend row, all non-BPM fields must exactly match. An absent backend row is fixture initialization from the explicit local source; no real-user initialization is enabled.

SHA256 of the canonical full request includes Account/generation, local base and exact payload. Existing `operation_hash` is preserved; two **fixture-only** nullable columns on the existing `sync_changes` row bind the new digest and canonical request. Production migrations are unchanged. Receipt validation queries the owner DB; it verifies exact operation, request binding, Account/generation/dataset, baseRevision+1, payload bytes/hash and schema. A client success object or copied receipt is not a write grant. Historical success and Account-mutation receipts are distinct. Reuse with different contents, CAS conflict, unknown receipt, invalid credentials, expired lease or missing permission cannot create a protected receipt.

`reconcile(binding, credentials)` is readonly and requires current valid owner credentials before exposing that Account's historical result. Revoked/unknown credentials therefore may leave a prior result unproven; no retry or success inference follows. It cannot authorize a new save.

## Two outcomes and recovery

The Port coordinator reuses the existing local BPM owner/Authority and existing Shared immutable backup owner. It pins the full persistent Account source, records backend request binding plus the local recovery ticket, and reads the immutable per-operation pin back **before issuing backend commit**. Different operation IDs use different keys; no singleton overwrite, cleanup, prune or automatic replay exists. A known owner-DB creation race retries only an immutable metadata add which was not issued, never a dataset save.

Backend commit is followed by owner readback. Local commit still requires its independent original admission; backend receipts are never passed as local permission. Outcomes are `backendCommitted` and `localCommitted`; both must be proven for aggregate success. Exceptions after a proven result preserve that historical fact and its Account/operation binding. Timeout/ack loss remains unknown until readonly recovery. The same prepared handle is never resubmitted. SQL success/local failure is an explicit partial outcome, retains prepared local operation and pending backup, and never deletes or overwrites original data. Reopen compares both owner receipts without writing either dataset. The caller must make a new explicit, newly authorized operation for any later change.

A crash before the immutable pin is confirmed cannot publish a backend mutation; local reservation may remain and must stay fail-closed. A crash after backend commit cannot imply local success. If local commit happened but ack was lost, only the exact local receipt proves it. Account switch is read from the persistent source at every asynchronous boundary, independent of notification delivery. Late A facts are scoped to A and never grant B permission or change B's prepared operation/receipt. Backend cannot infer a browser-only switch until the owner receives its stop/revocation; this patch does not claim to eliminate that distributed visibility limit.

## Time, ownership and non-guarantees

Owner time comes from SQL `julianday('now')`, never client/UI time. The per-device clock floor and terminal observed expiry are restrictive owner facts persisted separately from the protected data transaction; an aborted write cannot roll them back. A crash between protected rollback and that restrictive update returns unknown, and cannot certify durable denial or resume a pending operation. Production clock authority/rollback policy and failover guarantees still need owner acceptance. Tests cover observed expiry persisted through reopen and rollback; physical power loss and an unobserved server-clock reversal are not proven.

Account DB (browser), Authority DB (browser), Shared backup DB and backend SQL are four separate owners. No cross-DB transaction is fabricated. Same-origin raw writers, privileged DB tampering, production credential issuance/renewal routes, provider cutover, binary/Cloud recovery, L3d and final production admission remain gates. Fixture SQL receipt fields are not a cryptographic attestation for an untrusted transport; the owner-readback adapter is trusted injection here, and production needs its authenticated route and server authority. No real credentials, secrets, user data or production bindings are used.

## Acceptance and execution

Direct Node tests: `node --test workers/sound-cruise-sync/test/account-save-transaction.test.js apps/cruise-port/tests/backend-save-isolated.test.mjs`.
Actual local D1: `node --test workers/sound-cruise-sync/test/account-save-transaction-workerd.mjs` with the existing locked Worker dev dependencies installed locally. The fixture adds columns in memory only; no Wrangler operation is executed.
Native Chrome: run `node apps/cruise-port/tests/backend-save-server.mjs`, use its independent loopback URL in `ACCOUNT_COORDINATION_BASE_URL`, then `node apps/cruise-port/tests/backend-save-browser.cjs`. It uses disposable profiles, synthetic Account credentials and real SQLite/IndexedDB. Only local test GET/fixture POST is allowed; production network is blocked. Existing PR #16 browser/native regression is run separately.

Required counterexamples: revoke/switch/generation after prepare; late A while B continues; mismatched operation digest; CAS race; timeout; SQL permission then local abort; SQL/local ack loss; missing/tampered/foreign receipt; crash/reopen; distinct pending tickets; exact expiry boundary (no lease inferred); dropped BroadcastChannel notifications; concurrent tabs; normal readback and subsequent save. Required results and exact source/test hashes are recorded outside the repository. Prior PASS is never counted as a new run. No full unrelated regression or security gate relaxation is required.

## Next gate

Owner review of production SQL lifecycle fields, authenticated save/reconcile routes, expiry/renewal/revocation linearization and consumer projection/cutover is required before any production implementation. This patch is an isolated technical candidate only. Main merge, Pages release and all production changes require separate approval.
