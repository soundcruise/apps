# Managed Sync Owner — isolated HTTP/D1 connection

Parent #33 `f052942f496473205a27ab4b2d13d22a4a1b56a0` (tree `5e15b459a15cccfe38d77cd293146e1f5fe0c64f`, parent `0e993c31b35d36d4c8b023b841acc2fe0fc6be50`). Dependency #26 → #27 → #28 → #29 → #30 → #31 → #32 → #33 → this topic. **Full Bridge / Production rollout HOLD.** The adopted B+C v2 protection HOLD is unchanged; independent-clone scope checks are not v2 acceptance.

## Exact route and mode scope

| Method | Existing route | Lane | Native prerequisites |
|---|---|---|---|
| POST | `/v1/sync/bootstrap` | writer | schema0037 |
| POST | `/v1/sync/push` | writer | schema0037; structured records without unresolved external references |
| POST | `/v1/sync/migration/complete` | writer | schema0037; existing manifest/count/last-sequence CAS |
| GET | `/v1/sync/changes` | security | canonical managed Account/device; ready dataset |
| GET | `/v1/sync/snapshot` | security | canonical managed Account/device |
| GET | `/v1/sync/devices` | security | canonical managed Account/device; native Pro exemption retained |
| POST | `/v1/sync/devices/revoke` | security | canonical managed Account/device; native Pro exemption retained |
| POST | `/v1/sync/removal-safety` | writer | schema0037; native table supports chord/pitch/fretboard/rhythm only; **Port HOLD** |
| GET | `/v1/sync/writer-authority` | security | schema0037; native Port-only query |

These are existing production route definitions, not new production endpoints. The former83 HTTP +1 Scheduled index omitted writer-authority even though app.js already dispatched it. Correct current inventory: **84 HTTP +1 Scheduled**, **66 isolated connected HTTP**, **18 HTTP +1 Scheduled HOLD**. Of the old26 HOLD HTTP entries,8 gain managed profiles; one supplemental existing route is also connected. Counts are not a release percentage or a claim that every app/mode works.

All connections require production-provenance Account-managed canonical (`recovery_mode=account`) users and linked Account/App devices. Here that provenance is a synthetic database fixture label, not a real Production Account. Legacy/unmanaged/dual, QA enrollment, old Chord bridge modes, physical retention, Asset/R2 and Scheduled remain separate HOLD boundaries. No legacy recovery/backfill or owner adoption endpoint is invented.

## Existing Owner reuse and SQL boundary

The isolated factory alone calls existing `handleRequest`, HMAC/Pro verifiers, validation, rollout gates, sync/device repositories, writer admission/fence, record capabilities and CAS logic. app.js/index.js, those repositories, Bridge core, migrations and Worker configuration are unchanged. No second Sync store or authentication issuer is added.

The keyed HTTP fingerprint includes method/path/query/Origin/body/device Authorization, **independent Pro Authorization**, invocation UUID and service origin. Account/device/member/user/link/managed-user relationships, generations/credential versions, membership authority metadata, Sync runtime control and Account control generation are frozen in memory and asserted inside each protected business D1 batch. Pro id/verifier and observed generation are independently rechecked with SQL clock idle/lease deadlines. Verifiers/payload are not stored in receipts. Native device credentials have revocation/version checks; no absolute device credential expiry is invented.

Each captured source-owned mutation plan has a typed outcome. Bootstrap, records/change/dataset updates, migration completion, safety report and device revoke require a row change. A trusted conditional SQLite JSON-error assertion immediately after each required statement aborts the entire batch on zero changes; bookkeeping statements cannot mask the row count. Results are projected back to the original repository statement order. Legitimate auth/activity throttling/no-op and already-present state observations remain explicitly distinguished from a dataset save.

The isolated Sync invocation constructs the existing code-branded Account-scoped writer policy; normal boot never constructs it. Native final fence checks cannot take the compatibility bypass. Paused authority is HOLD; prepared/enforced require coherent existing Owner ledger evidence. No native fence assertion or protocol requirement is relaxed.

The exact read-only SQL emitted by existing `fenceQuery` is recognized by full normalized template equality. Arbitrary WITH statements are not upgraded to readonly. Causal bookmarks remain bound to the Owner wrapper; the native Pro verifier's logical first-primary request can use that same bound session, never a raw DB/session escape. Final SQL guards remain authoritative.

Business mutation plus typed child receipt share a native D1 transaction. HTTP root completion is a later transaction. Root receipt records the HTTP outcome; it does not turn a native invalid/conflict response into a successful save. Dataset change ledger receipts and Maintenance receipts remain different types. One request can have committed activity steps and an unknown business/root result.

Final SQL assertion is the isolated linearization point. Physical commit-time expiry, cross-D1/IndexedDB or D1/R2 atomicity are **not proven**. The runtime can only fence participating calls through this explicit factory. Old v137, administrators/raw writers and ordinary consumers are not excluded by this evidence.

## Unknown, replay and explicit recovery

A repeated root operation never invokes the native handler again. Changed device/Pro/body binding cannot reuse that root or its historical facts. Dataset operation UUID/hash matching remains owned by the existing repository. CAS loss or a zero-row failure never commits record/change data or a successful business child receipt; it may leave a registered operation requiring explicit reconciliation. This isolated boundary can fail closed with503 rather than return the compatibility API's per-item conflict after a transaction fence failure.

ACK loss preserves committed child facts and unknown root state. Reopen reads durable facts; no cached credential, payload or response is recreated. Exact-request historical reconcile is not current authorization. Explicit `resolvePending` can fence only the exact registered, receipt-less, pending-less operation with same request/actor binding; it never resolves an external pending backup or reexecutes SQL. Historical/recovery proof can be read after revocation, but cannot admit a new save. Self-revoke completion is a typed terminal result; further business statements under that invocation fail.

Unknown/pending facts and synthetic backup bytes are preserved. Pre-existing invalid JSON may make native snapshot decoding fail; it is retained without silent repair. The push adapter conservatively rejects binary/asset/attachment/object-key payload paths and binary-associated record types until the separate Asset Owner can prove their references. It does not claim full binary backup/restore validation. Unknown raw data outside this scoped path requires the existing migration/source-manifest gate before release.

## Schema compatibility

Production is still0033; nothing here applies a migration. Current native Port writer-fence SQL references the authority generation columns introduced by0037. The isolated adapter checks these structural prerequisites **before writes**. Thus0033–0036 dataset writer and writer-authority routes HOLD rather than assuming compatibility; management/read paths retain their existing supported schema behavior. Exact0033 structural fixture + repository0034–0037 migrations/journal are tested locally. Bridge core continues rejecting unknown schema/journal profiles.

The native removal-safety table deliberately excludes Port. The adapter refuses Port before mutation and exercises the four-app contract without altering the constraint. This Port release gap requires a separate Owner/schema decision; it is not fixed by accepting a new table shape here.

## Verification and remaining release gates

Invoke `scripts/maintenance-sync-owner-native.mjs` only with explicit disposable evidence/runtime paths. `MAINTENANCE_SYNC_BROWSER=true` adds real Chrome CORS against the isolated API plus normal Studio no-write checks. Miniflare resources are synthetic and outbound service throws; never use real credentials/data.

Current evidence distinguishes new native Sync cases, Browser cases, existing57-route native regression and focused Node regression. Development failures are retained. The zero-update fault injector targets the qualifying final WHERE, not a count subquery; B preservation compares business rows, not mutable D1 storage/last-row-id metadata. Assertions/timeouts were not relaxed. Reopen is runtime dispose/reopen, not OS power-loss certification. Real multi-device Cloud, microphone/OS/Safari and real Pro sessions remain untested.

Shortest release critical path:

1. Complete or explicitly close the remaining legacy7 + QA/bridge6 ingress modes in the0033-compatible maintenance/handover design. No duplicate Account Owner.
2. Implement Asset/R2's5 HTTP and Scheduled/cleanup external-intent/claim/readback/unknown recovery together, with retained manifests and binary verification. R2 deletion and D1 commit are not atomic.
3. Finish full ingress exclusion/old-version in-flight drain, protected backup/key custody and an actual isolated restore. These precede Production schema changes. Old v137 rollback after new claims remains prohibited without proof.
4. Separately approve schema promotion/journal,0034–0037 rollout, Owner schema and default-OFF Worker deployment. No migration/deploy is authorized by this topic.
5. Explicit Owner credential/clock/key/Pro operations and final admission → BPM canary with readback/reopen/multiple tabs/devices → ordinary consumer/writer cutover and Cloud end-to-end.
6. Studio PC feature/data compatibility, performance and real OS/browser/audio acceptance can progress in parallel in isolated clones. Release Studio + Cloud together only after both acceptance gates are complete.

Main integration/Pages, Production maintenance/deploy/schema/backup, canary and ordinary Cloud enablement retain separate approval boundaries. Historical Git protection investigations are not a prerequisite for implementation tests in this independent clone; the adopted v2 HOLD is not silently removed.
