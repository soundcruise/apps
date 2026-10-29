# Isolated Account-only release boundary and Scheduled retention Owner

PR38 dependent. No normal app/index/Scheduled/config/schema/public asset change.
Shared Write OFF, canWrite=false, ordinary writer/consumer/Cloud disconnected.
Existing v2/PR33 protection HOLD and Full Bridge/Production rollout HOLD remain.
Private explicit factories only; these are NOT deployed routes or a production
scheduler service identity. Existing71 HTTP adapters/Asset cleanup are reused.

## All13 source routes and disposition

The source caller references below are evidence of reachable code, NOT usage counts.
No production user rows/traffic/Cloudflare metadata were queried. A production closure
or irreversible removal requires actual migration/handover proof and separate approval.

| Method/path | Class | Caller and current Owner | Effects / credential / migration |
|---|---|---|---|
| POST /v1/sync/start | B candidate, HOLD | Chord sync-client.js start (613) / legacy Sync | Creates user/device/dataset/recovery verifier; Turnstile+Pro. Chord new start already gated default OFF. Account admission/app join replacement needs adoption proof. |
| POST /v1/sync/pairing-codes | B candidate, HOLD | Chord client (808) / legacy Sync | Device HMAC, pairing code metadata+activity; move to Account environment/app-device join. |
| POST /v1/sync/pair | B candidate, HOLD | Chord client (827) / legacy Sync | Pairing proof, user/device link and code consumption; move to Account environment/app-device join. |
| POST /v1/sync/recover | B candidate, HOLD | Chord client (879/1015) / legacy recovery | Recovery prepare/commit, claim/new verifiers/device revocation. Legacy/dual may use it; Account recovery mode already denies it. Retain until migrated. |
| POST /v1/sync/recovery-codes | B candidate, HOLD | Chord client (1052) / legacy recovery | Device HMAC+recovery rotation; Account recovery rotation replacement needs persisted adoption. |
| POST /v1/sync/account/delete-intent | B candidate, HOLD | Chord client (1114) / legacy deletion | Device HMAC, delete intent. Account/dual have different ownership; move to Account/membership delete intent. |
| DELETE /v1/sync/account | B candidate, HOLD | Chord client (1137) / legacy deletion | Intent consumption, deleting/revocation/purge scheduling. No automatic conversion to Account deletion. |
| POST /v2/accounts/qa/enroll | C | shared AccountClient admissionMode==='qa' / QA Owner | QA enrollment/credential/Turnstile, QA provenance; production release candidate rejects. QA fixture retained; no normal backend deletion. |
| GET /v2/accounts/bridges/chord | B candidate, HOLD | shared ChordAccountBridgeClient / bridge Owner | Account+App credential, auth activity/state observation. Production and QA provenance branches exist; not QA-only. |
| POST .../bridges/chord/prepare | B candidate, HOLD | Chord orchestration / bridge Owner | Bridge claim/provision/link/recovery metadata. Existing source preservation and account generation required. |
| POST .../bridges/chord/dual | B candidate, HOLD | Chord orchestration / bridge Owner | Dual recovery transition; client recovery evidence required. |
| POST .../bridges/chord/finalize | B candidate, HOLD | Chord orchestration / bridge Owner | Account recovery adoption; destructive legacy credential changes require exact transition receipt. |
| POST .../bridges/chord/rollback | B candidate, HOLD | shared bridge client / bridge Owner | Existing rollback contract; cannot erase pending/new authority evidence. |

Legacy7 call sites are in apps/chord-cruise/js/sync/sync-client.js. Bridge5 calls
are in apps/shared/sync-account/chord-account-bridge.js and Chord orchestration loaded
by Pro HTML; it supports production too. QA enroll is in shared sync-account-client.js.
Existing normal router and source handlers remain unchanged. Legacy source uses old
schema/credential policy and is not a participating Maintenance/writer-fence owner.
Old Worker version URL/override and Scheduled can still be reachable: unproven exclusion.

`isolatedReleaseRefusal` refuses these exact existing paths before DB/credential access
in the isolated Account-only candidate (12 legacy/bridge423, QA403; wrong method405,
OPTIONS also refused). This is NOT production closure, a usage conclusion, a migration
receipt, or an implementation of the13 old business handlers. Other modern paths are
not intercepted. Existing QA/development source fixtures remain available independently.

## Scheduled effect inventory and Owner decisions

| Existing effect | Owner and preservation contract | This implementation |
|---|---|---|
| pairing_codes retention; orphan sync_devices; recovery_claims/attempts; pairing_attempts; delete_intents | Legacy Sync, proof/consumption/other-device dependencies | HOLD; no broad legacy cleanup call |
| Account handoffs/app joins/Port joins | Membership/grant Owner, consumed/expired not sufficient for historical proof removal | HOLD |
| Account activity ensure/dormant | Account Owner, current HMAC/member/control; no new activity invented | Only existing active row -> dormant after365d, unchanged last_activity_at and Account/member generation |
| inactivity -> deleting/revoke | Account lifecycle Owner, cascade/other devices/backup/claims | HOLD; no deletion or revocation scheduling |
| Account recovery_attempts | Current Account recovery-verifier Owner, SQL-time old first AND last attempt, exact row CAS | Expired Account-specific attempt1 row only; 30min base retention reused |
| Account recovery_claims/delete_intents/lifecycle_operations | Account recovery/lifecycle Owner, pending/reconcile/receipt/renewal dependencies | HOLD; historical rows retained |
| membership/user/account purge; QA grants/invitations cascade | Account/Sync Owners and external Asset owner, full-source backup/restore and R2 manifest needed | HOLD; no FK cascade initiated |
| prepared Chord bridge timeout rollback | Bridge Owner, source and transition receipt dependencies | HOLD |
| sync_changes and min_change_seq | Sync Owner, all-device acknowledgement/full source/backup/pending proofs | HOLD; high water never advanced/decreased here |
| tombstones/deleted users | Sync Owner, old-device replay/backup/dependencies | HOLD; no tombstone removal |
| Pro lockouts/session proofs | Global Pro Owner; expiry not equivalent to safe proof deletion | HOLD; Account credential cannot select global Pro cleanup |
| Asset pending/reservations/delete | Existing PR38 Asset Owner + non-atomic R2/D1 | Reused unchanged; no retention of its facts |

The adapter does NOT wrap/call existing `handleScheduled` or `repository.cleanup()`.
`account-preservation-plan` and `sync-preservation-plan` record typed HOLD observations
without deleting anything. Their digest is a NON-ATOMIC observed metadata digest,
not full source, atomic snapshot, backup, causal proof or future deletion permission.

## Current Owner and transaction contract

`createIsolatedMaintenanceRetentionOwner` explicitly takes a per-Account scope map and
existing credentials, reuses read-only Account provider + owner profiles. It creates no
new issuer/Account DB/Sync engine. Each job has a v4 operation UUID, fixed kind, optional
appId only for Sync planning; arbitrary Account/table/IDs/purge jobs are refused.
The request fingerprint is keyed and binds current Account credential, independent
App/Pro authorization and exact job. Credentials/verifiers are not copied to receipts.
Sync planning additionally requires the managed App/device/account graph and Pro,
existing generation-bound writer fence/authority proof and dataset metadata.

Real mutation requires current native Account generation/recovery/device/provenance
and runtime controls in the final SQL batch. Exact activity/attempt snapshot is CAS
checked; first AND last attempts must exceed the inherited retention interval using
D1 SQL clock. Required changes()=1 and typed receipt belong to the business transaction.
Owner evidence does not turn an expired/foreign credential into authorization.

Unresolved related Account operations or unclassifiable Owner pending prohibit actual
retention. The job's own registration is excluded precisely. Other known Account B's
pending does not authorize/erase A and does not globally block healthy B. Preservation
observations may inspect related pending without clearing it or granting deletion.
No source job may act on a foreign Account/device/app. A current credential alone
is not production scheduler/operator authorization; that service boundary is absent.

Same UUID never reexecutes a business handler. Lost D1 ACK -> explicit reconcile of the
exact stored action/receipt/identity, no credential/response restoration. Uncommitted
registered mutation with no pending/receipt can be explicitly operation-fenced through
existing core recovery; it cannot resolve external pending or a committed operation.
Source data and registered unknown facts survive stop/reopen.

Logical dormancy can cause a nonparticipating v137 Scheduled worker to purge later.
Thus even dormancy requires verified oldScheduled/in-flight exclusion before production;
'no direct delete' is NOT safe coexistence proof. Synthetic handover is contract-only.
SQL authorization is not a guarantee of credential expiry at physical commit.

## Schema, rollout and counts

Account subset tested on0033 + exact Maintenance metadata, then0034/35/36/37. Missing or
unknown/partial schema fails closed; full Owner candidate schema is exact-profile HOLD.
Sync planning uses0037 because current source writer SQL requires cutover generation
columns; it does not enable ordinary writes. No migration number/order/DDL was changed.
Existing Asset HTTP writer still0037, Asset Scheduled subset still limited as PR38.

84 HTTP +1 Scheduled index preserved. 71 HTTP business adapters connected. Remaining
13 have explicit isolated refusal coverage, NOT13 newly connected/migrated handlers.
Scheduled is PARTIAL: two Account actions + preservation planning + existing Asset subset;
other effects above remain HOLD. These numbers are not release readiness percentages.

Real blockers: decide/finalize Legacy/bridge compatibility and client migration; specify
full-source/receipt/tombstone/device-ack preservation and global Pro retention; provide
production scheduler authorization; prove all old ingress/version/Scheduled/in-flight
exclusion; encrypted backup/key custody and actual isolated restore; approved migrations
and default-OFF rollout; Owner clock/TTL/key rotation/Pro operations; BPM canary and Cloud
multi-device E2E; Studio functional/performance/OS/browser/audio acceptance. Group by Owner
and transaction domain, not one endpoint at a time. No main/Pages/Production action here.

Destructive purge does not have to be implemented just to reduce endpoint counts. A
retain-all policy can be a release candidate choice only after capacity/retention
operations approval and proof that ALL old destructive Scheduled paths are excluded.
It is not adopted here. The next unit should combine Account-only handover candidate
assembly and Legacy/bridge migration acceptance, rather than implement13 old routes
individually. Future/invalid activity clocks and malformed attempt timestamp ordering
fail closed; dormancy never moves updated_at backwards.
