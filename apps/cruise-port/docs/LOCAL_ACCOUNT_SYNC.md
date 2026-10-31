# Local Port Account attribution (candidate 1.27.0)

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
