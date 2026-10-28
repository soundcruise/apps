Subsequent isolated membership/grant profiles: [MAINTENANCE_ACCOUNT_MEMBERSHIP](MAINTENANCE_ACCOUNT_MEMBERSHIP.md). The historical results below remain historical; Full Bridge / Production HOLD persists.

# Account lifecycle Maintenance Bridge — isolated extension on PR30

Limited acceptance only. Full Bridge and Production rollout remain HOLD.
No normal router import, schema migration, Account cutover, Cloud Sync,
Shared Write or canWrite activation. Studio0.47.20 / Port1.24.23 / schema2
and private Worker0.1.0 candidate versions remain unchanged: no public asset changed.

## Exact owners and semantics

All four routes use POST and the existing Account HTTP handlers/repositories.

| Route under /v2/accounts | Authentication | Existing business mutation |
| --- | --- | --- |
| recovery-rotation/prepare | Account sca1 HMAC, active Account/device | Exact claim with current Account generation/recovery version and next recovery verifier |
| recovery-rotation/commit | Same Account/device plus claim HMAC | Account recovery_version CAS increments once; replace recovery verifier; commit claim and cancel other pending rotation/recovery claims |
| environments/current/detach | Account sca1 HMAC | Existing current-environment revocation, owned invitation descendants/cancellation and exact lifecycle record |
| apps/current/detach | X-Sound-Cruise-App-Authorization scd1 HMAC | Exact linked App-device and Account-device revocation and lifecycle record |

Rotation is **Recovery Code rotation**, not Account/device credential rotation.
It does not increment Account generation or device credential_version and does
not invalidate valid sca1 credentials. The old Recovery Code cannot create a new
recovery claim; the new code can. A stricter unverified-owner wrapper may return
503/HOLD where the original standalone owner returns400. That is not a successful
recovery or an automatically repaired identity. General credential renewal is
outside these four routes and is not synthesized here.

Detach retains the original Owner scope, including the existing last-Port
environment rule. It does not revoke all members/apps. Body target spoofing
cannot replace authenticated current identity. App detach requires one exact
Account-device link and current membership/user/app relationships. It neither
accepts a forged Account header as App authentication nor adds Account activity
side effects to the original App handler. Revoked subjects cannot perform a new
protected operation. Historical reconcile is not a new authorization.

## Admission, CAS and typed outcome

Reuse maintenance-owner-http, owner-profiles, Bridge v2 metadata and the existing
native D1 transactions. account-app adds only a read-only export of its existing
App-owner inspector; original handler and repository SQL are retained.

Every request binds UUID, method/path/query/origins, body and credential headers
with the existing owner-pepper HMAC. Only App detach adds its App header to this
binding; prior13 fingerprints remain unchanged. No credential, verifier, body,
raw request or response secret is stored in Bridge receipts/evidence.

Final assertions include current active/nondeleted production Account, actual
Account generation/recovery version, device credential version/verifier and
runtime generation. App adds actual member generation, sync-user/app and linked
Account-device state. Missing/unknown counters never receive inferred defaults.
The shared Account assertion now also fences a late deleted/provenance change.

Environment detach snapshots six Account-owned relation sets (devices,
memberships, device links, two invitation kinds and handoffs). Exact snapshot
equality is checked inside its mutation batch, plus relationship validity:
unchanged malformed foreign/missing links do not become trusted. Snapshot values
are transient guards; only a witness digest is retained, not a second Account
data store. Activity timestamps are excluded; oversized/unknown graphs HOLD.

Recovery claim expiry is checked against native SQL time at final admission.
This does not prove a Production Owner clock or expiry through physical commit.
The original recovery-version CAS and changes() sequence remain uninterrupted.
Typed outcomes prove exact UUID/fingerprint/claim or lifecycle target and actual
revoked/rotated rows. Outcome and child receipt commit in the same D1 batch;
zero-row business changes cannot be promoted to semantic success. A failed
assertion rolls back that batch and its success receipt, not earlier legitimate
authentication activity from a separate child transaction.

## Stop, unknown and recovery

All four use the separately admitted security lane. Writer stop still rejects
bootstrap and normal writer work while allowing legitimate rotation, revoke,
detach, recovery and Pro revoke on the open security lane. Security stop fences
these too. None reopens writer or issues a new writer capability.

Parent remains registered until known HTTP completion. Children bind parent,
epoch, exact SQL plan and owner assertions. Duplicate UUID/different request is
rejected. ACK loss or interruption yields unknown, preserves pending and any
committed child facts, and never resends the mutation. Explicit exact-request
reconcile proves history only and returns no credential. Existing operation-only
resolvePending may fence a registered, receipt-less D1 operation; it does not
rollback earlier child effects, resolve external/R2 uncertainty or replay work.
An identity/provenance that cannot currently be verified stays HOLD.

## Evidence and limits

Final direct native workerd/D1 suite:19 PASS. Includes normal rotation/detach,
expired/changed/revoked identity, conflicting CAS, delayed A with healthy B,
App/member relation races, foreign link, actual native zero-row fault rollback,
UUID/digest substitution, ACK loss, concurrent requests, interruption/reopen,
explicit pending fencing and stopped-writer/security behavior.

Current regressions: existing13 native26 PASS; Account/Pro Node81 PASS;
Studio metadata/readonly-host Node31 PASS. Disposable native Chrome9 PASS includes
real CORS/headers and lifecycle paths plus normal Studio no-write. Core23 PASS is
unchanged historical PR30 evidence, not a new run. No skipped required checks.
Fixture-only zero-row injection changes one bound business UPDATE to WHERE0;
production assertions and previous tests are unchanged.

This is native D1/local workerd interruption and independent-request contention,
not physical power-loss, real-user multi-device, Production durability or full
Cloud acceptance. No Production credentials, secrets or data are used.

The historical84 index contains83 HTTP plus one scheduled entry. Now17 HTTP
entries are isolated-connected;66 HTTP and scheduled remain HOLD. Only Pro
policy/session/challenge are confirmed business-DB-readonly among this scope;
Bridge registration still writes metadata. Account GETs may write activity.
See MAINTENANCE_ENTRYPOINT_COVERAGE.json; it is not a Production actor inventory.

Next bounded unit: Account invitation/join/handoff ownership and consumption
transactions, keeping Asset/R2, scheduled cleanup, Sync/migration, membership
deletion, QA/operator and external/admin writers separated by owner boundary.
Full handover requires all relevant ingress/drain/unknown-result proofs, old/raw
writer exclusion, schema promotion, backup/restore and separate Production approval.
