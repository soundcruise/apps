# Official Owner Route / Schema Connection Candidate v1

PR28 (`d21282ef43bbf77d597326e5ca4d957c0d4d00af`) direct child. Default OFF / No Deploy.
This is an isolated Production-compatible candidate, not production saving approval.
Studio0.47.20 / Port1.24.23 / Project schema2 are retained: no browser product module,
asset, cache key or public version changed. Worker package version stays the existing0.1.0.

## Actual production topology and compatibility classification

| Responsibility | Actual implementation | Classification / remaining boundary |
| --- | --- | --- |
| Entrypoint | `src/index.js` → `app.handleRequest` / scheduled | reused; index never constructs or accepts candidate capability |
| Account management | `/v2/accounts/*`, account-app origin/method/rate/rollout | legacy branch unchanged; new reserved namespace has explicit equivalent controls |
| Account identity | sca1 parser / HMAC verifier / Account state & generation | existing verifier reused, never client identity as authority |
| Port device | scd1 verifier + membership-device link | exact authenticated linked device required independently of Account |
| Pro / writer | global Pro/session, membership write epoch/protocol, `fenceQuery` | reused; SQL pre/post fence also protects lifecycle and recovery mutations |
| Storage | existing SYNC_DB, sync_records/changes repository | reused; receipt digest/binding columns added to existing changes, no second dataset |
| Schema | configured migrations0001..0037 | additive0038 CANDIDATE outside migrations_dir, not auto-applied |
| Owner lifecycle/history | PR16..28 isolated contracts | adapters connect to production dispatcher in fixtures, finite2cycle remains finite |
| Clock | SQL julianday(now), durable monotonic floor, terminal expired fact | mechanics reused; production clock/skew/physical commit guarantee still missing |
| Legacy users | old credential/Account route and existing dataset shapes | unchanged; new nullable columns never infer enrollment/fence/lineage |
| Existing feature flags | account runtime, Pro/writer policy | unchanged; new namespace needs independent capability + exact env + DB gates |

## Route and activation contract

Namespace `/v2/accounts/owner-candidate/v1/` precedes the existing Account dispatcher.
The actual production `index.fetch(request,env,ctx)` supplies no dependencies. It returns404
for this namespace even with every candidate env flag/binding present. No env/JSON/header
can brand the WeakMap-backed `ownerRouteCandidate` capability. Only a separate disposable
test entrypoint constructs it. This is code separation, not a claim of sandboxing trusted
server code or raw SQL. A future production capability implementation needs separate review.

The test capability requires fixtureOnly, exact DB object, approved Account-scoped existing
writer capability and explicit bounded TTLs. All must also hold on every request:

- exact env `SYNC_OWNER_ROUTE_CANDIDATE=disposable-v1`, `SYNC_OWNER_SCHEMA_CANDIDATE=1`;
- existing SYNC_DB binding + existing Account/device/Pro peppers + working rate limiter;
- exact candidate schema / version and DB marker enabled=1, mode=disposable, positive epoch;
- existing runtime Account read/rollout/lifecycle/save/history gates;
- allowed Origin, POST, known path, bounded JSON40KB; strict CORS OPTIONS;
- linked Account/member/device HMAC plus separate Pro and existing writer fence.

Supported candidate dispatch: credential issue/enrollment, begin/finish/fail/revoke,
renewal reconcile, Authority reauthorize, operation lease/save/current/reconcile/history,
cutover stop/inspect/qualify/confirm/reconcile and successor stop/inspect/confirm/reconcile.
The outer route has no unleased save dispatch; valid requests to it return404. The inner existing owner also rejects commit without its required lease. It is not a
shortcut around the lease. Initial issuance enrolls an already authenticated existing
Account device; it is not unauthenticated Account creation.

The adapter derives policy scope from owner SQL and parsed authenticated device ids.
Every mutation (including UPDATE RETURNING and renewal/recovery) uses the SAME D1 binding
and existing batch API. It inserts marker/runtime/Account/member/device-link and existing
app/Pro/writer assertions before/after the original mutation statements. All rollback together.
Legacy services still perform their original HMAC, expiry, generation, lineage, digest,
CAS/operation/receipt checks. The outer adapter does not turn owner observations into grants.

ACK recovery deliberately delegates old-token+secret proof to the existing recovery verifier.
A normal-current-token precheck must not replace that contract. The additional linked app/Pro
proof is still checked, including the final SQL fence. Old token cannot save after renewal.

The older isolated renewal/adoption clients send only Account/recovery headers. The new
integration test transport explicitly supplies separate disposable app/Pro headers, retaining
the client's original Account token. This is a TEST adapter, not consumer migration or a
claim that current public clients already support this new route.

## Candidate DDL and deployment sequence (not executed)

`schema-candidates/0038_owner_route_candidate.sql` is deliberately OUTSIDE `migrations/`.
No wrangler config, original migration or Production DB is changed.

Adds13 nullable device fields: lifecycle issue/expiry/lease/state/floor, Account/member binding,
transition/operations ledger, encrypted recovery/until, operation fence. Adds3 runtime flags
NOT NULL DEFAULT0. Adds2 nullable request-digest/Account-binding fields to sync_changes.
Adds6 tables: operation leases, pointer fences, cutovers, Authority reauthorizations,
finite two-cycle archive, candidate schema marker. Marker enabled0/mode disabled by default.
No UPDATE/backfill, credential creation, fence initialization, data copy, replace, deletion,
new dataset, R2 binding or independent sync engine. Unknown existing columns/rows preserved.

Test installer requires known old schema or exact completed candidate. One D1 batch applies
all additive DDL and final marker; abort rolls back all. Exact completed reapplication is a
read-only no-op. Partial/unknown schema rejects without repair. Raw SQL file itself is NOT
idempotent: duplicate application errors; do not rerun blindly. Production migration registry
would need a separately reviewed promotion of this candidate, exact hash and approval.

Before any disabled infra rollout:
1. User approves exact Worker/DDL/config hashes, target identity and rollout/backup plan.
2. Read-only inventory original schema0001..0037, old/unknown rows and all writers; capture
   restoration-capable backup/digests plus tested restore and secret/key retention.
3. Keep route capability absent, all client/write gates OFF. Validate origin/rate/bindings and
   exact marker/runtime gates; do NOT enable by changing one flag.
4. Apply reviewed additive migration on target only after separate approval. Readback every
   required column/default/new table, legacy auth/routes and row/digest preservation.
5. Partial failure/unknown ACK: STOP, readback authoritative schema/state; no blind retry,
   rollback/drop, backfill, key rotation or gate weakening. Keep disabled and evidence intact.
6. Any mismatch in legacy behavior/schema/backup/fence/clock → STOP. Restore is separately
   authorized maintenance, never automatic. Schema promotion is not writer/canary approval.

## Authorization linearization and clock limits

D1 batch is the existing SQL transaction boundary. Final owner/Pro/writer/lease assertion,
CAS, data row, changes/receipt and consumed lease are committed or aborted together.
The outer gate's pre/post assertions add candidate marker/epoch/runtime/fence protection.
That defines the observable SQL decision point IN THE BATCH; it does not prove the wall-clock
instant of physical persistence. SQLite now is stable per step, not a promise through physical
commit. SQL expiry at the last assertion and credential validity until physical commit are
separate requirements. This candidate does not redefine expiry or approve a weaker policy.
Production activation remains blocked until the owner provides an approved linearization /
fencing model that meets the agreed expiry contract. No speculative safety margin chosen.

SQL primary time is not browser/UI/5-second reader observation time. Durable per-device floor
and terminal expiry prevent an OBSERVED expiry from reviving through rollback. They do not
prove fleet clock accuracy, detect unobserved rollback, rotate secrets, coordinate every
Worker's wall clock, or make independently observed Account/Authority IDB atomic with SQL.
Concurrent D1 mutations use CAS/final assertions; delayed oldAccount responses do not acquire
newAccount authority. Current credentials remain distinct from historical success receipts.

TTL parameters are explicit only in disposable capability (tests60s/120s credential,
30s/60s recovery,10s operation). They are NOT production recommendations. Production owner
must supply: credential TTL and skew assumptions, renewal lead time, recovery window<=TTL,
operation lease bound<=credential expiry, clock source/rollback policy, pepper/key-id rotation,
old-key and encrypted backup retention, recovery-secret loss response, revocation/drain order,
ledger/archive retention and repeated renewal policy. No invented default values accepted.

## Remaining release gates

- Physical-commit expiry guarantee / trusted owner clock / TTL & rotation/key operations.
- Production capability and authenticated route deployment, rate/provenance/rollout validation.
- Old credential enrollment and operation_fence initialization with actual migration/cutover
  evidence. Nullable rows safely refuse until an explicitly reviewed contract proves them.
- Repeated production renewal/history beyond the finite2cycle fixture.
- Same-origin raw writer containment; API-level rejection does not block arbitrary origin
  code/raw IndexedDB or trusted raw SQL. Old writer entrypoint/drain/backup policy still needed.
- Real provider/consumer/writer opt-in, Account/Authority/SQL partial-state recovery; no cross-DB
  atomicity assumption; immutable pending/backup retained and explicit recovery only.
- Binary/Cloud/multi-device, real Pro and hardware/Safari/OS acceptance remain separate.

BPM canary needs ALL relevant gates above plus approved dataset/Account/device scope,
readback/receipt/restore, conflict/expiry/revocation/crash rehearsals, monitoring & stop plan,
separate user approval. Normal boot / Shared Write / canWrite=false are unchanged.
No Production Account/Worker/D1/R2/Secrets deployment or use occurred in this task.

D1 batch transaction and migration behavior verified against official documentation:
https://developers.cloudflare.com/d1/worker-api/d1-database/
https://developers.cloudflare.com/d1/reference/migrations/
