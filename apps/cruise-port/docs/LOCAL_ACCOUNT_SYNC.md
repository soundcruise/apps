# Local Port Account attribution (candidate 1.28.0)

Port retains one local dataset and the existing `/v1/sync/push` / Asset Sync paths. No SQL Owner route, new Account store or binary engine is enabled.

The existing Sync Center offers three explicit choices after inspecting the selected Account and a digest of current structured values plus existing photo/icon/attachment bytes:

- Adopt into the current Account, after confirmation.
- Retain as previous-Account data, without syncing.
- Retain locally, without syncing.

`cruisePort.syncLocalAccount.v1` is device-local consent metadata, outside managed Sync records. It is not a credential or proof of server authorization. A known Account cannot be reassigned to another Account through these choices. No records, binaries or Outboxes are deleted or moved. Unknown legacy/anonymous content requires explicit confirmation rather than automatic bootstrap. Account changes invalidate consent and the existing writer context; reload before confirming again. A different Account must not edit the retained dataset; using a separate browser profile keeps its dataset separate without inventing another Port source of truth.

Existing dataset Web Locks serialize confirmation and cooperative binary transactions. Account readonly transactions and existing local generation/Pro checks guard publication. Existing Account Outboxes remain separate. Server authentication, per-record CAS and operation IDs still apply; local locks are not a server authorization fence.

Old builds/raw storage or direct IDB writes can bypass cooperation. Already-sent requests cannot be retroactively cancelled. Full binary hashing occupies the dataset lock during an explicit inspection/confirmation and scales with local binary size. Do not treat this candidate as general release approval.

The previous delete-ACK failure was a test registry mismatch: registration imported `port-dataset-storage` under an old query URL while the store used the current URL. The corrected fixture uses the product graph and additionally requires a generation-bearing intent; the original ACK assertion is retained. No runtime retry rule or expected outcome was weakened.

Tests: adapter/controller, repository/binary/Asset Sync/orchestrator regressions; runtime regressions; Sync Center/writer-context tests; cache graph checks; and `tests/sync-attribution-native.mjs` using a disposable test runtime with Playwright/Miniflare. The latter uses real Chrome/IDB/Web Locks and local native D1/R2. UI runtime, Project model and shared-Identity lifecycle are fixtures; native push uses the real existing HTTP handler. It is not an authenticated Studio entry or complete Asset Sync E2E.

Production deployment, activation, schema changes and authenticated Studio Port adoption remain separate HOLD boundaries. Project schema2/client and the existing SQL Owner isolation code are unchanged.


## Remaining-product E2E candidate

Port uses the same `/v1/sync/push`, Account-keyed IndexedDB Outbox, snapshot and changes API. Before every Port push chunk (including bootstrap/order/conflict direct paths), it durably records the exact operation as UNKNOWN. A missing/malformed ACK cannot trigger timer, own-echo or fresh-ID replay. The existing Sync Center offers an explicit read-only reconciliation action. It requires the same Account and exact operation ID, record key, payload hash and deleted state. If another device advanced the head, it checks existing change history from the saved cursor (at most ten pages). Missing/expired evidence stays UNKNOWN. A historical acknowledgement advances only the old shadow; it does not overwrite a newer remote head or local draft. Delete acknowledgements use the captured intent generation on both normal and lost ACK paths.

A definitive Pro refusal before mutation is preserved as a terminal retryable local intent before native qualification invalidation. Reauthenticate normally and use the existing explicit retry action. An ambiguous transport result is not reclassified as a definite refusal. A retired qualification cannot publish state from the asynchronous save-error callback.

Existing Port push now carries only an internal proof from the existing successful Pro verifier. The existing record INSERT/UPDATE SQL rechecks credential verifier, generation, revocation and lease using shared schema0033 at the mutation statement. This narrows the authentication-to-commit race; no new API, table, credential or Owner is added. The SQL clock conservatively rounds up by at most one second, so a request may be rejected slightly before lease expiry. Existing Device/user and CAS predicates remain in place. This does not claim an atomic D1/R2 transaction or fencing of every Asset/Scheduled side effect.

Explicit local Gear/My Apps visual removal retires its published references and queues the previous pair inside the existing dataset publication. Missing remote cache and text-only edits retain the published reference. Asset release remains the existing soft-unreference plus delayed cleanup; this change does not prove every concurrent hard-delete/claim race.

`apps/cruise-studio/tests/port-remaining-e2e.browser.mjs` uses the real Port Pro document and Studio iframe in separate persistent Chrome profiles, actual native workerd/D1/R2 and synthetic credentials. It tests simultaneous CAS/UI resolution, commit ACK loss and history readback, entry-to-commit Pro generation/lease loss, native Gear/My Apps/attachment byte roundtrips and conflict, Device revocation, and measured binary lock cost. No real production endpoint is contacted. The 15MiB UI input is normalized by the existing image processor; stored-binary hashing is measured separately with 1MiB and 15MiB synthetic PNG byte payloads written through the existing binary store (separate from UI image processing). These are local samples, not universal latency guarantees.

Old non-cooperative clients/raw writes can bypass the local consent marker and locks. Server Account authentication and CAS reject foreign credentials/stale revisions, but cannot infer the previous local owner of an arbitrary payload sent with valid current credentials. General-release acceptance must explicitly address old open tabs/build/cache rollout. No claim of complete old-build exclusion is made. Project schema2, Account DB, Project client/outbox and production resources remain unchanged.

The candidate patches `studio-legacy-v137.mjs` only as the existing compatibility-runtime entry used by these fixtures. It is no longer byte-identical to the preserved original v137 snapshot. The fixed parent commit and prior evidence retain the original bytes; this is not a Production v137/v138 change or deployment authorization.
