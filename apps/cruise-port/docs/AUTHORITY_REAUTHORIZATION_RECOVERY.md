# Explicit owner reauthorization / readonly Authority generation recovery v1

Direct parent PR #20 `7908324472ed8febe81ac3e5f55db03f48f98791`, tree `4675734bc6acaeedacb7d6e3f1df81b7bf57654f`. Dependencies: main → #16 → #17 → #18 → #19 → #20 → this topic. Internal maintenance candidates Studio **0.47.15**, Port **1.24.18**, StudioProject schema **2** unchanged. Public main remains `d66107c5ef30ca1a0873f0943876c73e745c14b5` / Studio0.47.9 / Port1.24.12.

## Scope and state

This phase recovers a **readable, explicitly reauthorized historical Authority generation which is still stopped**. It does not resume saving or synchronization. The factory `createIsolatedAuthorityReauthorization` is absent from normal boot. It requires a privileged isolated Authority scope, explicit Account owner, existing adoption reconciliation, existing Shared backup owner, Web Locks and loopback/fixture-only authenticated transport. Import performs no I/O.

States: adopted → owner unknown / writes stopped → explicit reauthorization pending → owner qualified / Authority unchanged → prepared and sealed inactive new generation → pointer committed → exact receipt reconciled → generation-readable-stopped. Any denial, missing proof, timeout, conflict or ambiguity remains fail-closed. Public results always retain canWrite=false, operationAuthorized=false, productionReady=false, normalWriterConnected=false. No caller flag or observed provider response authorizes a save.

`run({adoptionOperationId,sourceGeneration,operationId,explicit:true})` is the only initiating operation. Exact request keys and unique operation UUID are required. A pre-existing immutable operation pin requires readonly reconciliation, not retry. `reconcile({operationId})` cannot qualify the owner, publish a pointer, confirm an adoption, resume or delete. It proves a historical local generation transition only; ownerAuthorizationCurrent=false.

## Account / owner / Authority responsibility

- Existing canonical Account capture/inspect/current, journal/CAS revision and official full-source manifest remain the Account owner. The credential adoption receipt must be current and confirmed, with identical target Account/device/credential digest. This phase does **not** mutate Account or mint a second Account receipt.
- Existing authenticated backend Account HMAC, app-device HMAC, credential lifecycle/expiry, owner Account/member/runtime generations, Pro entitlement and writer fence are reused. A separate isolated `authority/reauthorize` route is default OFF and absent from the product router. It is not the five-second observation reader or an adoption receipt replay.
- The pure request schema lives in [Shared protocol](../../shared/sync-account/authority-reauthorization-contract.mjs), so the Port Authority graph does not import Worker source. A purpose-bound qualification request includes source/target Authority generations, pointer/Control epochs, full Authority/Account/manifest/backup digests, adoption receipt checksum and the exact operation ID. Dataset/app-device/write epoch are derived and revalidated by the owner, not trusted from UI values.
- The existing backend save transaction owner shares its authentication/writer checks without changing ordinary save semantics. A fixture-only `sync_account_authority_reauthorizations` table binds Account + operation + exact request digest/JSON. Repeated qualification checks current authorization again; changed digest conflicts. Account/lifecycle, Account-mutation, dataset-save and Authority-publication receipts remain distinct.
- SQL qualification uses existing Account and writer assertions in one D1 batch, including a final single-step joint Account/Pro/writer/operation-binding assertion. The record is **not a lease through a later IDB commit**. Current clock/expiry restrictive facts may be written; this is not all-DB readonly.
- No production migration/column/table/route is installed. No credential is issued, renewed or restored by reauthorization. Secrets stay in existing canonical storage/transport memory; request/backup/receipts contain no token. Public dependency errors use a fixed generic reason.

## Authority publication and linearization

Normal `publish()` continues to reject an invalidated/recovery-required active generation. `resumeWrites` never clears identityInvalidated. Neither generic fixture `updateControl` nor fixture initialization is used to erase the old stop.

A separate `publishReauthorized` entrypoint requires a distinct scoped `control:reauthorize` capability and noncopyable fixture attestation. Plain DTOs, copied tokens and wrong scopes fail. The old Account coordinator's confirmed adoption stop must be the **exact** current old Control, with matching receipt fingerprint/identity. Old pointer, full snapshot and epochs are pinned. Unresolved reservations (no matching oplog), independent stops, unfinished journals or non-adoption Account transitions reject publication inside the same existing Authority transaction.

The new generation receives a new ID and fresh Control/fence epochs. Existing dataset values are retained in the existing Authority store's new generation; old records/history/stop facts remain. Prepared old-generation saves are never transplanted. Inactive preparation, journal and seal use existing APIs and full manifest/record/referential checks. The final transaction atomically validates old source, sealed new state, pointer CAS and typed provenance; supersedes old Control **without clearing any stop flag**; activates the new generation; and writes pointer, journal and typed publication receipt together. This is the Authority transition linearization point.

The new Control is born `suspended=true` **and** `fenceRevoked=true`. It is readable, but neither old nor new prepared operations acquire a write qualification from this transition. The typed reservation `reauthorization-publication` and pointer kind `isolated-reauthorization` are validated on every read. Non-test scopes reject this fixture pointer as fixture-pointer-untrusted; normal publication/old provenance checks are not relaxed.

## Evidence is not a Cloud fence

The new typed evidence explicitly has `fence:null` and a separate `readonlyFence` with purpose owner-qualification-only-v1, exclusive=false and cloudConnected=false. It cannot be confused with a migration/exclusive Cloud lease. `sync.scope=local-known-empty-fixture` and cloudConnected=false state the limited meaning of the checkpoint digest. It references the tested owner qualification / locally absent Sync databases, **not** a remote Cloud outbox, exclusive cutover, old-writer exclusion or Cloud restoration proof. Normal migration publication still requires its original binary/Sync/server-fence evidence.

v1 requires known empty local binary material and no connected Sync database. Existing formal binary manifest/reference validation is used; nonempty assets, published Cloud references, unknown stores/data and pending backup are retained and rejected. This phase performs no binary transfer, dataset-schema migration, Cloud reconciliation or live restore. Supporting such material requires a separate owner-verified path; there is no empty-evidence fallback for unknown data.

## Stop / backup / non-atomic boundaries

Only the **confirmed adoption-derived** old stop can be the source of this transition; it remains in old history. Revocation, Account-switch, recovery-required, suspended, fence-revoked, pointer conflict, unknown save outcome, unconfirmed adoption and unfinished journals are not cleared. Shared backup inventory is readonly, bounded, and preserves unknown rows. Only the exact retained renewal/adoption pins and this operation's immutable request pin are accepted; BPM/backend/unknown pending pins block completion. The immutable reauthorization request is read back before the owner SQL call. No backup pruning, old pending resend, secret copy, inferred data repair or rollback occurs.

Account IDB, Authority IDB, backup IDB and backend SQL are independent transactions. Account source/revision/full manifest and backup inventory are checked before and after owner calls/publication; Authority source/pending/pointer checks are atomic inside its transaction. They do not make cross-DB checks atomic. A remote revocation, Account change or new pending pin in the remaining window can leave a new pointer published. Its **read-only birth** prevents that window becoming a write/resume permission. Postcheck failure returns generation-published-owner-unconfirmed and retains all facts/stops. If normal B already has a new active Authority pointer, the old A CAS rejects and preserves B's prepared operation/receipt; if only Account changed, the published A generation is still fenced and never certifies current B authorization.

## Crash / ACK loss

- Before publication: request pin and inactive candidate may remain. Old active pointer/stop stay; no automatic publish/retry/cleanup.
- After publication, before/after postcheck: exact typed receipt, current pointer/generation/Control, source Account/manifest and backup inventory can prove historical local publication. It does not prove current backend rights. Missing/corrupt/mismatched facts remain unproven.
- Current canonical Account/device/CAS/source or pointer changes invalidate reconciliation; old A must not modify B. No stale owner response resumes a generation, no old receipt becomes a new grant.

## Acceptance and follow-up

Node covers the 24 requested conditions plus malformed/timeout owner results, qualification digest collision, new pending racing publication, ordinary-scope fixture refusal and typed provenance corruption. Disposable workerd/D1 executes real owner SQL/HMAC/Pro/writer guards. Native Chrome tests real IndexedDB/CryptoKey/Web Locks, dropped notifications, concurrent renderers and page reopen. Relevant Authority publication/control/provenance/CAS, Account/adoption/receipt, backend/save, Shared backup and Studio cache/readonly tests are regressions. No assertion/timeout is relaxed. Exact candidate hashes/raw evidence are kept outside the repository.

Remaining: a real backend qualification/lease/fencing service and explicitly approved per-operation writer/consumer cutover, binary-aware and Cloud-aware recovery, same-origin malicious raw writer containment, production rollout and physical power-loss guarantees. Old same-origin raw access is not cryptographically fenced by client hashes. This phase is **not production saving complete**. OS-native IME, Safari, real printer and new performance measurements are not claimed. Studio stays 0.x.y until user-approved 1.0 release.
