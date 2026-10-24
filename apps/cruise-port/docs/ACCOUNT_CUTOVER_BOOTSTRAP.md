# Isolated Account canonical cutover and initial bootstrap v1

PR dependency: #5 → #6 → #7 → #8 → this change. Candidate maintenance identities:
Port1.24.6 / Studio0.47.3. No production publication. StudioProject2, Authority2,
mutation receipt logical1, Shared Write OFF and Studio canWrite=false remain.

## Threat boundary and choice

The canonical Account owner remains Shared; Port owns coordination with Authority.
No second Account/authentication/Sync owner is introduced. Same-origin IndexedDB
has **no per-script ACL**. A normal API check cannot prevent arbitrary direct IDB
access. The following alternatives were compared:

| Approach | What it enforces | Limit / decision |
|---|---|---|
| API-only revision / UI / notification / Web Lock | cooperating callers | cannot stop raw writer; insufficient |
| PR8 physical2, same meta store | classic explicit version1 open refusal | no-version meta raw still reaches Account |
| new Account DB + duplicated data | old literal DB-name path isolation | cross-DB publication/recovery and second正本 risk; not selected |
| **in-place store rename in physical3** | known old meta access fails after one atomic versionchange | selected; one DB/store/row set, no Account copy |
| separate origin / server-enforced authority | potentially stronger isolation | changes deployment/provider/auth architecture; separate future decision |

The selected cutover prevents known literal `meta` writers (including versionless
open) from reaching the new canonical store. It does **not** prevent a raw writer
that enumerates/knows the new store, recreates an old DB, or rewrites every local
integrity row. It is legacy-path isolation, not a sandbox or tamper-proof storage.
Raw changes to the new store that contradict an observed receipt fail closed; a
matching complete raw ABA remains unprovable. Never report complete raw rejection.

## Single canonical store and migration

`cutoverIsolatedAccountStore` is explicit, fixture-only and requires Account DB2.
It validates Account/journal/marker/fence, snapshots **all** meta keys/values,
bounds the JSON-like snapshot to1MiB, and computes digest outside transactions.
Physical versionchange2→3 rechecks all rows and exactly one store, then renames
`meta` to `account-meta-v3` and rotates the fence epoch/protocol/digest. No row is
copied, deleted or assigned to a second正本. Account/pending/QA/history/unknown
supported rows retain the same values. Old `meta` no longer exists.

A v1/v2 open gets VersionError. Versionless open succeeds but transaction('meta')
gets NotFoundError. Pending old connections may block; we do not force close them.
Already accepted old transactions precede upgrade; changed rows are retained in
the new snapshot or cause upgrade CAS refusal. On blocked/abort/race the old DB
and rows remain. After rejection, a delayed unblock aborts the abandoned upgrade;
there is no background cutover, destructive reset or automatic retry.
Unknown/future/unsupported/corrupt schema or value refuses unchanged.

`protocol:3` must be explicit on owner mutation store, Port isolated writer adapter
and Port readExistingPortAccount. Default old readers do not auto-follow a new
store or interpret unsupported layout as 'no account'. Studio's existing generic
read-only Account reader now reports account-schema-unsupported when meta is
missing; absent DB inspection still returns null without creation. Normal AccountClient and
classic DB code are unchanged and not connected to3. Normal-consumer rollout,
recovery UX, coexistence and binary acceptance remain prerequisites.

For a genuinely absent database, `provisionEmptyIsolatedAccountStore` explicitly
creates physical3 with only a scope-bound fence at revision0. It creates **no
Account, receipt, qualification or dataset ownership**. Existing databases are
never reinitialized. An existing empty v1 DB can instead explicitly enroll2 and
cutover3; migration retains its actual rows. The DB name remains the sole Shared
Account DB. No new Account is inferred just by opening/reading a DB.

## Initial create / recover contract

The bootstrap path accepts exactly the canonical fence-only state at revision0.
Missing Account with any pending/QA/history/receipt/unknown row is not initial.
In particular, a detached/revoked Account whose journal remains is **not** reset.
A prior retirement/null state or partial key loss remains recovery-required.
Initial `recover` means recovering into a genuinely empty local enrollment after
an owner qualification; it is not reviving previously retired local credentials.

The new typed bootstrap intent uses the real `unbound-local` identity with
accountId=null. It never invents bound-account IDs/server generations to reuse
PR7's bound transition. Request pins generation, operationId, pointer/control
CAS epochs, kind(create/recover), destination IDs, source Account fence epoch and
revision, and SHA256 of the full candidate Account. Credentials remain in the
canonical Account record/private memory, not Authority reservations or receipts.
All caller-owned candidate/source inputs are copied before their first await.

`createIsolatedAccountBootstrapCoordinator` requires an existing branded Authority
scope with an explicitly installed test provider, a fixture namespace and /tests/
route on loopback in a browser. A normal scope/provider cannot instantiate it.
`fixtureProof.capture/verify` are synchronous synthetic fixture observations, **not
Account authentication** and not reusing Pro qualification. The proof is pinned
to the full request/candidate plus fixture generation, can be invalidated/retired,
and is rechecked immediately before Authority stop and in final Account CAS.
False/throw/Promise denies. No real server endpoint, credential, auth change or
new product qualification protocol is implemented.

1. Capture an actual writable **unbound** Authority control/pointer and exact
   empty Account epoch/revision. Bound B or mismatched/stopped source refuses.
2. Consume the private operation token once. Validate synthetic candidate proof.
   Recheck Account source before submitting stop; no recapture of a foreign B.
3. `beginAccountBootstrap` atomically writes typed reservation + irreversible
   Control identityInvalidated/epoch increment in **one Authority transaction**,
   using the existing privileged Control capability. Its synchronous fixture guard
   is checked in that transaction. No tombstone/fence is relaxed or cleared.
4. In a **separate Account transaction**, compare the complete captured empty row
   set, then add Account + bootstrap receipt + fence revision0→1 atomically. Check
   the live fixture proof again in that exact callback. Abort commits none of them.
5. Authority remains unbound and stopped, with phase='stopped'. No ownership
   transfer of existing Port datasets, confirmation/resume, implicit save or
   current authorization follows. `operationAuthorized=false`, `canWrite=false`,
   `continuityProven=false`, `recoveryRequired=true` remain.

The Shared bootstrap store is a low-level owner transaction helper, not a public
capability/authenticator. Its direct API must not be connected to normal routes.
Only the fixture coordinator demonstrates stop-before-CAS. A trusted real Account
provider/source binding and server qualification are mandatory before normal use.

## Receipt, chain and recovery

`accountBootstrapReceipt:v1` in the single canonical store binds request, digest,
before/after revision and checksum. Hashes are integrity evidence, not signatures.
The initial receipt afterDigest anchors the first ordinary journal beforeDigest;
a journal-less capture compares current Account against this initial tail. Scope,
cutover epoch and fence revision lower bound are checked. Detectable raw mismatch
or history/fence rollback refuses rather than becoming a new valid CAS source.

Reopen recovery reads the real typed Authority reservation/barrier and Shared
receipt. It matches the validated snapshot to the exact rows used for proof and
rechecks both Account rows and Authority facts after asynchronous reads/hashes.
Missing/corrupt receipt or uncertain result is never success and is not retried.
Committed receipt can prove history after ack loss; it cannot certify continuity,
recreate qualification, confirm an intent or reactivate a writer. No wall clock
is used for revision. B receipts/Authority/prepared operations are unaffected by
an old null-source context. Any race stopping an old unbound generation cannot
change a new B generation, and Account CAS independently refuses changed state.

## Inventory and remaining gates

Existing AccountClient local writers17, PortJoin consume/resume, Sync Center
terminal clear, Bridge pending writers and Shared storage API remain inventoried
in ACCOUNT_WRITER_PARTICIPATION.md. Source scan of literal Account DB references
identifies classic DB VERSION1/meta, Shared owner versionless inspection, Port readonly versionless inspection, and Studio read-only Account status inspection; raw writes in tests are intentional adversarial
fixtures. No other product has a separate direct Account writer. Server-only
membership/recovery/device operations remain outside local DB certification.

What this adds: enforceable legacy **meta path** refusal, exclusive in-place
canonical cutover, explicit empty storage provisioning, typed null-source initial
create/recover transactions and historical crash recovery in an isolated fixture.
The actual AccountClient.startAccount, PortJoin consume, unbound recovery UI,
QA qualification and production consumer rollout are still blocked/not rewired.
No claim that they authenticate against a real server is made.

Before formal provider / binary / final admission:

- Real Account owner qualification/source/argument binding and observed retirement
  must be enforced. Fixture proof is never substituted for a server credential.
- All consumers must explicitly select3; deployment/version/entrypoint gating,
  old cached/offline code, schema/cutover recovery and compatibility need connected
  acceptance. No automatic fallback to meta or empty DB after unsupported layout.
- Decide threat coverage for arbitrary new-store raw access. A local checksum/fence
  cannot solve same-origin hostile code or wholesale rollback. Stronger isolation
  and/or trusted server/provider anchor requires a separate architecture decision.
- Migration/cutover generation fencing, binary durability/publication, and final
  admission in the actual mutation transaction must pass, including crash/reopen.
- Shared Write/normal Studio writer/L3d production/auth switch remain OFF. P3
  retirement-only Issue3 stays open. Main merge/Pages release need separate approval.

Tests cover fake/native IDB, no-version old raw + classic schema, rename rollback,
blocked delayed lifecycle, complete legacy preservation, initial create/recover,
retired A, old null vs B, two tabs/notification loss, proof invalidation, atomic
abort, ack loss/page close/reopen, corrupt chain and observation race, and honest
new-store raw/ABA limits. These are synthetic tests, not real Account/OS crash or
production authorization acceptance. No normal graph imports the bootstrap path.
