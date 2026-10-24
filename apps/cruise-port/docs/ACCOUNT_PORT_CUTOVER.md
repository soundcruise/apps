# Isolated Account / Port cutover and recovery v1

Studio0.47.7 / Port1.24.10 internal candidate, StudioProject schema2. Dependency:
PR #10 -> #11 -> #12 -> this topic. No production installation or route, writer,
Cloud, Shared Write, Account qualification or Port active pointer publication.
Studio remains 0.x.y until explicit first-release approval.

## Ownership / actual migration scope

Shared Account DB `sound-cruise-sync-account` remains the ONE Account source.
Its existing owner validates Account/journal/marker/bootstrap/fence and performs
physical1->2 enrollment then physical2->3 atomic in-place rename meta ->
account-meta-v3. No Account row, pending row, mutation receipt or journal is copied
to another canonical DB. Exact expected inventory digest is checked before an
upgrade; the existing versionchange transaction compares every entry again.
The only intended data changes are existing writer-fence metadata and store name.

Port Authority owns existing Control, pointer, reservations/tombstones, receipts
and migration journals. A new typed `account-port-cutover-v1` fact in that SAME
journal store is committed atomically WITH Control recoveryRequired=true and its
epoch increment. Authority physical schema stays2; no new DB/store is created.
The target generation remains recovery-required even after successful migration.
Existing final admission rejects prepared work for that stopped target; it does
not resume it. Distinct, subsequently active B generations/receipts/prepared work
are never changed by delayed A migration/recovery.

Port legacy localStorage remains the ONE local dataset source for this scope.
The coordinator keeps original strings IN PLACE and records hashes, lengths and
key inventory only. It neither copies Port data into a second active repository
nor updates the Port active Authority pointer. Port localStorage publication,
binary copy/reference transfer and Cloud outbox/shadow/conflict reconciliation
are NOT part of this v1. `verified-inert` means Account physical migration plus
unchanged local Port manifest were observed, NOT full Port migration/activation.
Existing Port migration/cloud/binary engines are inventoried, not auto-invoked.

## Manifest / restoration contract

Account manifest binds physical schema, Account/device identity, all entries,
content excluding the changing fence, and the exact expected fence/revision/scope.
Existing receipt chain/marker/bootstrap validation is reused; unattributed Account
content is rejected. No credential or raw Account payload enters Authority evidence.
Port manifest includes every cruisePort.* raw string, repository metadata and
delete intent rows. Known legacy loaders validate only an in-memory projection;
unknown fields in supported envelopes and raw whitespace remain unchanged.
Unknown keys, pending Account operations, future/unknown physical schema, malformed
rows, non-JSON IndexedDB values, corrupt data or binary references cause stop.
Original data is NEVER deleted or repaired to make validation pass.

Restoration means per-step atomic abort preserves the preceding entries, and a
committed upgrade can be read back exactly (except the specified fence) and rolled
FORWARD after proof. Downgrade, byte rollback, Account resurrection and destructive
restore are not exposed. A manifest is not a backup of user payloads; if the retained
original is lost/corrupt the hashes detect loss but cannot reconstruct bytes.
Explicit owner-approved offline backup/export is required before a future destructive
migration, binary cleanup or production cutover. This v1 has no destructive step.

Port scan is atomic:false / abaExcluded:false. Web Locks/notifications cannot prove
absence of noncooperating raw writers. Same-origin new-store-aware raw IndexedDB
access remains possible; full-source checks detect visible differences, not a raw
writer restoring ALL original bytes and provenance. Digests are integrity checks,
not authorization signatures. Historical completion never grants current continuity.

## Persistent protocol / failure boundaries

1. prepare captures/validates Account + Port manifest and exact Authority Control/
   pointer/identity. Unknown data stops before writes. The typed stop intent and
   Control recovery barrier commit in ONE Authority transaction or both abort.
2. Before changing Account, persist enroll-requested (physical1) or cutover-requested
   (physical2) with the exact expected source snapshot. Physical3 can be verified
   without touching Account. Each journal change uses revision CAS and rechecks
   the exact stopped Control/pointer; duplicate migration IDs cannot overwrite facts.
3. Account owner executes ONE schema step. It rechecks every row in the atomic
   versionchange transaction. Its fence legacyDigest links to the exact prior rows.
4. Re-read Account data/ledger and fence, local Port raw manifest, and Authority
   barrier. Record enrolled, then the next requested step, then verified-inert.
   There is NO transaction spanning Account DB, Authority DB and localStorage.
5. All returns have canWrite=false, operationAuthorized=false, continuityProven=false,
   recoveryRequired=true. stop remains durable, including after complete response loss.

`run` is an explicit isolated continuation of an identified operation. `recover`
never executes an Account upgrade: it only reconciles persistent evidence. If a
requested schema step has not committed, it returns step-unproven; it does not
retry it. If commit occurred but its acknowledgement was lost, the new physical
version, unchanged dataDigest, linked legacyDigest, scope, revision and stopped
Authority prove that particular historical step. Enrollment recovery may record
its proof, but requires explicit continuation before the next Account step.
Missing journal, stale CAS, inconsistent source, wrong stage, supersession, lost
barrier or corruption retains stop and returns unresolved; never assume success.

Typical crash positions: stop commit/ack, request journal commit, Account upgrade
abort, Account step commit/ack, completion journal commit/ack. Reopen uses new owner
instances and persistent facts, not runtime WeakMaps. Old A and delayed responses
cannot adopt B by Account ID alone; exact data/ledger, stopped generation/control/
pointer identity and manifest must still match. Credential validity, Pro and backend
authorization remain independent and unchanged.

## Integration and privileged boundary

New coordinator requires the existing branded privileged isolated Authority scope
and supplied disposable Account IndexedDB + Port storage. Browser fixture provider
installation requires the real loopback /apps/cruise-port/tests/ route. No ambient
fallback, normal boot import, network transport, migration of real data or implicit
Save exists. Generic writeJournal cannot create/overwrite typed cutover journals.
Product version/cache bump does not activate the new modules.

Existing stop intent, mutation receipt, revision/CAS, writer fencing, Authority
Control/pointer/provenance/tombstones and Pro/backend gates are unchanged. Fixture
mutation ability is NOT a JS sandbox or an origin ACL. No real credentials, Secrets,
Account, Worker/D1/R2, production Cloud or authentication switch are used.

## Tests / next admission gates

Node: normal physical1/2/3, exact row preservation, known legacy/unknown fields,
unknown/future schema/type/pending/binary rejection, expected-source CAS, cooperative
ABA, raw writer limits, duplicate and concurrent cutover, stop transaction abort,
upgrade abort, missing journal, retired A, seven crash/reopen points, normal B
receipt/prepared preservation. Existing Account/Authority/owner/consumer/cache/PC
cohorts remain targeted regression, with no assertion/timeout weakening.
Native Chrome: actual IndexedDB, two renderers with notifications dropped, stop/
enrollment/cutover commit acknowledgement loss + renderer close/reopen, concurrent
cutover, unknown rows, raw source change, delayed A vs real B CAS/receipt/prepared.
No-write asserts original Port strings, Account content, receipt and unrelated B.

Remaining, separate approvals/implementation:
- Production owner route/router/CORS/rate contract; credential issuance/renew/expiry;
  server-side reauthorization inside each real protected transaction.
- Complete normal consumer cutover/pending handling and retention/export policy;
  raw writer constraints must remain explicit, never claim complete rejection.
- Port cloud inventory/provenance, migration conflict reconciliation and fencing;
  binary inventory/hash/reference durability, interrupted transfers and restoration.
- Final Account/Authority/Pro/backend admission and explicit production rollout
  approval before writers, Cloud, Shared Write, pointer activation or auth switch.

P3 retirement-only Issue #3 remains separate. Safari, OS IME, real Accounts and
hardware power-loss are not established by these isolated tests.
