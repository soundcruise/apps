# Studio Owner / document candidate v1 (default OFF)

This candidate depends directly on PR #41. It is not imported by the production
Worker router, the compatible Worker, or Studio boot. It adds no numbered
migration, binding, deployment flag, public version/cache change, or client
writer. Shared Write remains OFF and existing `canWrite=false` contracts remain
unchanged. The isolated host must explicitly enable the adapter and install the
candidate DDL in a disposable database. Production activation is not accepted.

## Account and admission

`studio-owner-document.js` reuses native Account HMAC/verifiers, the Account
backbone repository and Pro verifier. New registration creates an Account,
Account device and Studio enrollment atomically, with **zero app memberships**.
Existing Accounts explicitly enroll their current device. Request bodies cannot
supply a destination Account or dataset identity: the authenticated Account is
always the user key, and app/dataset audience is always `studio`.

The isolated POST endpoint is `/isolated/studio/document`. It requires an exact
allowed Origin, JSON, a bounded streaming body, a configured request rate limiter,
and Account plus Pro credentials except initial registration (Pro only). Initial
registration additionally requires a registration limiter and the existing
Turnstile verifier with hostname and `studio_account_start` action. Test hosts
supply synthetic limiter/Turnstile bindings, not real services or users.

Account runtime admission/read/device-management flags and runtime generation
are checked. New enrollment, new Account and new device need open admission.
Studio device revocation needs Account DELETE authorization and its final SQL
flag. Revocation disables the **Studio enrollment only**, preserving the shared
Account device credential and other app sessions. Self-revocation is explicitly
HOLD until a separate recovery contract is implemented.

Account state/provenance/deleted status, Account generation, recovery version,
device credential version/verifier/revocation, Pro verifier/generation/scope/
revocation/idle/lease expiry, runtime flags/generation, Studio epoch and schema
are verified again within every native guarded batch. The existing `guardCompatibleD1`
and exact base-0033 fingerprint/journal are reused. Schema and Studio object
validation derive from one observation; exact observed schema/journal are also
asserted by the batch. Missing, partial, unknown or newer schema is HOLD.

The linearization point is the final SQL assertion in the same D1 transaction.
This does not claim wall-clock expiry remains valid through physical commit,
or atomicity with browser local storage. Production clock/lease semantics,
capacity, Turnstile configuration and rate binding still require acceptance.

## Versions, chunks and CAS

`studioDocumentUpload` preserves JSON Unicode, supports finite numeric values,
canonicalizes object keys, and splits on codepoint boundaries into at most 128 KiB
UTF-8 chunks. It computes actual UTF-8 lengths and SHA-256 digests. Pending binds
Account/device/Pro/epoch, operation UUID, document ID, expected revision and full
manifest to a request digest. The adapter allows up to 256 chunks / 24 MiB as a
transport envelope; the unchanged actual Studio schema2 validator is the stricter
product limit. Invalid projects never become heads. No shared 256 KiB push limit
or D1 single-row document write is used.

Chunks and pending cannot be UPDATEd. Exact duplicate uploads are harmless;
different content/operation reuse is rejected. There is no API that deletes
pending or chunks. This is not a claim that a privileged raw SQL writer can never
delete them. Raw writer exclusion is a Production gate.

Commit verifies every chunk ordinal/digest/UTF-8 size, full document digest,
schemaVersion/projectId and the actual Studio validator. Only the existing
`createD1SyncRepository` performs record/change/dataset updates through a fixed
trusted table mapping. A single guarded batch rechecks pending, chunk contents,
CAS and tombstone; executes the reused Sync SQL; checks exact head revision/op;
and writes the typed receipt. Account activity SQL is reused in that transaction.
CAS loss preserves pending and never overwrites a winner. Tombstone is a new CAS
revision, and this v1 never resurrects a tombstoned document.

Receipt verification checks the entire expected typed receipt and its corresponding
immutable operation identity / generic change row. Historical success is explicitly
`historical:true, authorizesNewOperation:false`. Read, snapshot, duplicate and
reconcile all require current credentials. Upload staging is not a readable head.

## Unknown, reopen and identity recovery limits

A response or post-commit check failure does not imply rollback. The caller must
retain its operation UUID and local draft, record UNKNOWN, and explicitly reconcile;
it must not unconditionally replay or generate a replacement operation. Persisted
pending/head/receipt survive native process reopen. Pending with an old credential,
Pro identity or generation is retained as `pending-recovery-required`; it cannot be
committed using the new binding. Historical committed receipts can be reconciled by
another currently authorized Studio device in the same Account.

No automatic Account recovery/renewal engine is introduced. Native Account and Pro
rotation remain their existing owners' responsibility. Initial registration/device
operation retries bind the original credential/Pro generation. **Identity-operation
ACK recovery across rotation**, lost-credential recovery, and explicit adoption of
old pending by a new generation remain unimplemented Production gates. A receipt
does not reactivate old credentials. Self-revoke, undelete and physical purge are
not implemented by this candidate.

## Old Account deletion, activity and v137 coexistence

Candidate tables have no FK to shared Accounts. RESTRICT would block legacy purge;
CASCADE would silently destroy unresolved Studio operations. No FK plus explicit
Owner authorization preserves pending/receipt when the old Account is deleted,
while the deleted Account can no longer read or write it. Successful Studio usage
touches native Account activity, preventing normal Studio-only use from appearing
inactive. No unrelated app membership is created.

Orphan content is inaccessible and retained; it is not automatically repaired,
backfilled or reassigned. Production release requires a specified retention period,
privacy/deletion handling, quarantine/authorized recovery and safe physical purge
for known terminal operations without deleting UNKNOWN/pending. This preservation
mechanism alone is **not full Account deletion / retention acceptance**.

The candidate uses base0033 plus its namespaced additive DDL; it does not require
shared Sync0034–0037 or the Owner0038 candidate. It adds no triggers to existing
tables and no R2 objects. Old asset cleanup has no Studio asset rows to target.
Existing v137 Account/Port/four-app endpoints and Scheduled paths remain bytewise
unchanged. Their constrained synthetic coexistence tests do not replace Production
rollout, backup/restore, data-retention or all-device E2E acceptance.

## Validation and reproducibility

Run the committed native test with `STUDIO_TEST_OUTPUT` set to a new repo-external
output directory and `STUDIO_TEST_RUNTIME` pointing to a package providing Miniflare.
It uses the repository's empty schema33 fixture and synthetic credentials only.
No Production endpoint, profile, data, secret or app port is used.
With neither environment setting, the default Node suite records an explicit skip;
it must not claim this native integration has run.

The task evidence additionally preserves builders for actual workerd HTTP, exact
v137 source-hash coexistence and a disposable Chrome Browser check. Results are
reported separately; direct-native cases overlap HTTP cases and are not a count
of unique product requirements. Test initialization and deterministic fault injection
may alter disposable fixtures only. Real Browser Cloud outbox and multi-device E2E
are deliberately not claimed.

This implementation run: direct-native 28 PASS, actual workerd HTTP 22 PASS,
Browser 6 PASS, exact-v137 coexistence 8 PASS, post-commit process-group SIGKILL
and new-process reconciliation 2 PASS. HTTP and direct-native cases overlap.
The crash test kills only its own disposable process group after commit, before
caller ACK; it does not inject a physical-commit interruption. No actual Turnstile,
Production rate binding, real Pro device or cloud endpoint is used.

## Next release gate

First implement Studio client durable outbox / explicit reconcile with existing
localStorage + Web Locks + CAS, and the pending-adoption/identity recovery paths.
Resolve orphan retention and bounded resource/abuse quotas before enabling this
route. Then qualify the additive DDL and default-OFF bundle with encrypted backup /
actual isolated restore, separately approved deployment, selected-account canary
and multi-device E2E. Shared Sync migration/handover stays a separate scope unless
this coexistence assumption fails. Main/Pages/Production changes need separate
approval; PR #33's formal protection HOLD and adopted v2 remain unchanged.
