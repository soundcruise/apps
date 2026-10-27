# Owner Credential Lifecycle / Authenticated Save-Reconcile (isolated v1)

Direct parent: PR #17 `9256c9fea6d207fbb4cf27473a85dc4fd7f1c810`, tree `86cbe03c7b20d79eee87acc928b849964fcb5252`. Dependency: main → PR #16 → PR #17 → this topic. Internal candidates Studio0.47.12 / Port1.24.15, StudioProject schema2 unchanged; published main remains Studio0.47.9 / Port1.24.12. No production router/config/migration, Account cutover, ordinary writer, Cloud, L3d or Shared Write activation. `canWrite=false` / `productionReady=false` always.

## Existing owners and isolation

Reuse existing sca1 credential parser/CSPRNG/HMAC verifier, Account/device/member rows, Pro/app-device writer fence, `createD1SyncRepository`, existing SQL record/change receipt, local Authority and Shared immutable backup owner. No new Account database, auth engine, settings source or Sync engine. New columns exist only in disposable fixtures. Neither `app.js` nor `account-app.js` imports these routes. Client JSON cannot select an isolation capability or bypass a gate.

`createIsolatedAccountSaveRoutes` requires explicit trusted fixture-only injection. Routes under `/__isolated/account/v1/` accept bounded JSON POST only, use Bearer Account credentials, return no-store JSON and have no cookie authentication. Save additionally requires existing app-device and Pro headers. Errors do not return credential/record/receipt/SQL details. Missing header gives401; failed owner operations give generic409, not successful empties. No CORS, production origin configuration, public endpoint, Secrets or bindings are installed.

## Credential states and transitions

| State | Entry / exit | Save / history |
|---|---|---|
| Unissued lease | Existing Account owner already issued and authenticates a sca1 credential; all lease/binding/transition/ledger fields NULL. Explicit `credential/issue` only | Deny until owner enrollment completes |
| Active | Atomic issue/renew-finish, new secret + credential_version + lease_revision, owner-issued timestamps and Account/member binding | Final SQL permission still required |
| Expired | Owner SQL time reaches expires_at; mutation paths persist restrictive terminal fact | Deny; old observations/receipt cannot renew it |
| Revoked | Owner self-revoke atomically marks lifecycle/revoked_at | Deny; renewal cannot resurrect it |
| Renewing | `credential/renew/begin` durably changes active→renewing, increases lease revision, pins attempt UUID | Deny even if former TTL remains |
| Renew success | `credential/renew/finish` CAS rotates secret on same device ID, increases credential/lease revisions; active with new TTL | New credential can save and read that identity's old receipt |
| Renewal failed | Explicit `credential/renew/fail`; no restoration to active | Deny; existing owner recovery required |
| Old Account / owner/member generation mismatch | HMAC-derived identity, bound generations or persistent client source differ | Deny; no implicit adoption of a new generation |
| Unknown / partial / corrupt | Missing floor, zero/unknown lease, partial enrollment, malformed ledger, missing gate or counter exhaustion | Fail closed without repairing credential state |

Issuance is **enrollment of an existing authenticated owner credential**, not anonymous Account creation, re-registration, or an alternative recovery system. Only completely unissued lease permits initializing a NULL clock floor; partial lease data is preserved. Nonissue lease revisions must be positive safe integers. Unknown/negative floors are rejected before mutation and cannot be silently normalized. A complete old Account bootstrap outside this contract still belongs to the existing Account owner.

Every lifecycle body contains contractVersion1, operation UUID, expected credential version, expected lease revision, expected Account/member/runtime generations; finish/fail additionally pin the begin transition UUID. Account/device/member IDs come from the authenticated owner row, not body privileges. Runtime `credential_lifecycle_enabled` is independent of read/save permission and defaults closed in the proposed fixture schema. LeaseTTL is an owner option (fixture60seconds), not a browser value or the provider's5second observation TTL.

Existing `createAccountCredential` uses secure randomness; rotation preserves the device ID and changes the secret/HMAC verifier. Raw secrets are never persisted in SQL, ledger, pending backup or logs. One successful response returns the new secret and owner issued/expires timestamps only after exact transaction/readback; this is a historical issuance fact, not a save grant. If ACK/readback is lost, the old secret cannot replay to recover/reissue a new token. Recovery remains fail-closed and belongs to the existing owner; this patch adds no recovery route.

The fixture adds a bounded operation ledger on the existing device row (UUID/action/digest/previous version/lease only), not a second auth source. Reused operation IDs deny even after later transitions; the exact prior ledger, state, verifier, version, lease, transition and owner generations participate in SQL CAS. At64 entries, further issue/renew transitions fail closed without eviction. One restrictive revoke may still append; retention/compaction is a future owner decision. Existing lifecycle operations table/kind constraints and production schema remain untouched.

## SQL linearization and clocks

Lifecycle prefix owner assertion, exact-row CAS update and final assertion execute in one existing D1 batch. Renewal and revoke serialize at that transaction. If revoke/expiry/generation change wins first, finish cannot publish a new usable secret. If renewal wins first, the former secret is invalid and cannot perform a later self-revoke; the newly valid credential or existing formal owner revoke path is required. No successful revoke is undone. Concurrent renew attempts cannot both consume the same lease.

Owner time is SQL `julianday('now')`. Positive durable per-device floor is checked; mutations persist increasing floor and observed terminal expiry separately from the protected mutation, including after a failed batch when that fact can be proven. Corrupt floors never become authorization by repair. Unknown DB response/abort/readback/clock/overflow returns unproven without a secret. Crash before restrictive fact completion cannot certify durable denial and never resumes an operation automatically.

The final SQL assertion is the authorization linearization point. Expiry/revocation ordered after this point does not invalidate the historical operation. No guarantee is made for expiry at later physical commit/fsync/response time. Cross-DB atomicity is not claimed.

**Readonly history clock limitation:** Reconcile never writes a floor or terminal expiry, even when denying an expired credential. A history-only expiry observation followed by an unrecorded backend-clock rollback/reopen is not guaranteed to remain terminal by the existing floor alone. This is not a production-ready clock contract. A trustworthy monotonic owner time source **or a separately approved durable restrictive-expiry design** is a mandatory production history publication gate. Fixture tests prove boundary checks and rollback below an already durable floor, not that ordinary D1 wall time itself has that stronger guarantee. A reavailable historical read is never a new save grant: save checks its own current permission and persists/rechecks owner facts. No past receipt restores an expired/revoked credential in a save operation.

## Authenticated save

POST `save`: exact `{request, requestDigest}`; the request is the PR #17 full operation contract. Digest is SHA256 of canonical exact request. Bearer-derived Account/device plus current member/dataset/link must match all claimed IDs/generations. Client fields are assertions, not trusted identity. Unknown fields, hash mismatch, invalid credential, partial lease, missing owner binding, stale generation/lease, wrong dataset or missing Pro/app-device authorization deny.

PR #17 transaction is reused with mandatory `requireLifecycleBinding:true` in these routes. Strict mode adds the owner-issued Account/member binding and known clock/lease checks at authentication **and final SQL guard**. Legacy isolated factory defaults retain their original tested contract; request JSON cannot disable strict mode in the route. Final owner permission/lifecycle/expiry, repeated Pro/writer fence, operationID, digest, CAS, protected Port record update and exact receipt remain one rollback boundary. Normal backend routes are unchanged.

## Authenticated readonly reconcile

POST `reconcile`: exact `{binding}` with full historical request and digest. `reconcileCurrent` authenticates the **current** active HMAC/lease and requires the same Account/device/member and currently mapped dataset. A different device is conservatively denied even within one Account. Credential version may have advanced through valid renewal; the old operation's request/digest/version remain unchanged and are not rewritten to the new credential.

Runtime `account_history_enabled` is independent of save/lifecycle/read observation gates. History requires current identity, current owner/member generation binding, active unexpired lifecycle and live app-device link. It does not require new-save permission or Pro, because it returns only this identity's existing operation proof. Expired/revoked/renewing/failed/unverifiable credentials receive no receipt. One final authorized SQL SELECT joins current owner predicate with the requested operation log; preflight authentication alone cannot disclose the row after owner revoke. Exact request, operationID/dataset/digest and payload/hash/revision are then validated using the existing receipt code. Missing/tampered/foreign receipt gives generic failure; never success inference or resend. No Account activity touch, floor update, save, receipt mutation or backup change occurs during reconcile.

## Local recovery / consumer boundary

The test-only transport prepares a memory handle without sending a save. Existing coordinator reads immutable per-operation backup back before invoking authenticated Save; history uses current injected credentials and sends no automatic retry. The backend request/receipt is still distinct from the local ticket/receipt and Account mutation receipt. Local Authority commit retains its independent existing admission/CAS/barrier. SQL success/local failure or unknown result stays partial, known historical facts remain scoped to Account/operation, and all pending pins survive. Reconcile never publishes a local change or deletes a ticket.

Credential renewal does not silently rewrite the browser Account DB or migrate a normal consumer. Existing Account CAS/intent/receipt cutover is still necessary before a local consumer may use a new credential. Tests prove backend continuation with the new credential, late A denial and normal B preservation; an old local context cannot be resumed by a renewed backend token. Same-origin raw writers, privileged SQL tampering, physical power loss, old-writer/consumer cutover and Cloud/binary final admission remain unguaranteed.

## Verification and acceptance

Direct tests cover issuance/renew/revoke/expiry/unknown states, malformed/fake/missing credentials, strict Account/member/dataset identity, old generation, two renews, renew-vs-revoke/expiry, operation replay/digest/CAS, history-only permission, wrong Account receipt, readonly history, delayed A/current B, ACK loss, partial local outcome, crash/reopen/pending retention, clock skew and no boot installation. Unknown floor/zero lease counterexamples from independent review have fixed expectations. Existing safety assertions/timeouts are not relaxed.

Commands: `node --test workers/sound-cruise-sync/test/account-save-routes.test.js apps/cruise-port/tests/owner-route-save.test.mjs`; actual local D1: `node --test workers/sound-cruise-sync/test/account-save-routes-workerd.mjs`. Native Chrome: start `node apps/cruise-port/tests/owner-route-server.mjs` on its ephemeral loopback port, then run `owner-route-browser.cjs` with `ACCOUNT_COORDINATION_BASE_URL`. It uses synthetic credentials, actual SQLite and disposable native IndexedDB; notification delivery is dropped. Expected409 responses from negative tests (and matching browser HTTP-console entries) are counted separately, not hidden as zero errors. Unexpected JS/HTTP/404/network errors must remain0. Production boot/cache/readonly Browser tests run separately and require no-write.

Exact source/test hashes, raw failures during development, final results, independent review and scope gates are stored outside the repo. Isolated technical PASS is not production readiness. Production lifecycle schema, authenticated routing/CORS/rate limits, monotonic clock proof, durable expiry policy, lost-token owner recovery, consumer cutover and final operational rollout require separate owner design and approval. Main merge / Pages release / deployment are not authorized here.
