# Isolated Account mutation receipts and recovery v1

This is a dormant, explicitly opted-in Shared owner extension plus Port fixture
coordination. No normal boot, Account entry point, writer, Sync, authentication or
Pro route activates it. Shared Write OFF, Studio `canWrite=false`, StudioProject
schema2 and Authority physical schema2 remain unchanged. Product maintenance
identities are Port1.24.6 / Studio0.47.3; neither is a production release here.

## Canonical owner and compatibility

`apps/shared/sync-account/account-mutation-receipts.mjs` uses the existing Account
owner database `sound-cruise-sync-account`, physical version1 / `meta` store. It
default protocol1 never creates/upgrades a database, and rejects absent/blocked/future schemas.
Protocol2 and explicit fixture-only enrollment are defined in
[ACCOUNT_WRITER_PARTICIPATION](ACCOUNT_WRITER_PARTICIPATION.md). Its
only writers are the explicitly isolated factory's new CAS and its private keys:

- `accountMutationJournal:v1`: strict logical schema1, monotonic local revision,
  append-only receipts (maximum64 / 128KiB, no automatic deletion/GC).
- `accountMutationMarker:v1`: strict version/revision/head checksum mirror. Losing
  just journal or marker refuses; it never resets a surviving journal to zero.

An existing version1 DB with neither private key can be explicitly captured for a
first isolated transition. No load-triggered migration occurs. A future version or
corrupt receipt/chain refuses. Existing classic Account script, pending keys,
HTML cache keys, normal consumers and old APIs are unchanged. This is one Account
DB owner API extension, not a second Account/project/authentication/Sync owner.
The new ESM is not imported into any normal product module graph.

## Receipt and atomic boundary

A private capture token binds the complete Account record and exact journal/marker
snapshot. Credentials stay only in the canonical Account record and the ephemeral
capture; receipt before/after SHA256 digests contain no credential plaintext.
Canonical values accept finite JSON-like records and dense arrays only; holes,
extra array properties, undefined/unsupported values refuse rather than collide.
The existing transient-secret rejection (recovery/handoff/join material and encoded
forms) is retained for replacement Accounts. No Secret is added to metadata.

Binding includes exact Authority scope DB name, partition, generation, operation
ID, full intent fingerprint, Account/server membership identity and generations,
kind and destination. These are captured observations, not server qualification.
A receipt adds before/after local journal revision, before/after full-record
digests, request hash and integrity checksum. These hashes are not authorization
or a tamper-resistant signature; the same-origin environment remains trusted.

The one actual Account `meta` readwrite transaction rechecks the complete Account,
journal and marker against the private capture and writes replacement/removal,
receipt journal and marker atomically. Receipt is returned only on completion.
All hashing/validation awaits occur outside this transaction; final comparison and
writes inside it are synchronous IDB callbacks. Aborting at any write leaves none
of the replacement/receipt/marker. Concurrent renderers do not rely on Web Locks
or subscriptions for CAS. Exact duplicate requests can return historical proof
but never repeat CAS; changed payload with an occupied operation ID refuses.

## Cross-database coordination and recovery

The existing Authority begin transaction installs intent plus irreversible
Control invalidation BEFORE Account mutation. Account/Authority transactions stay
separate. Optional `mutationStore` selects the new path only in the fixture-branded
Port coordinator. The legacy no-provider path retains its existing behavior.
Live successful mutation is read back through the owner receipt reader and its
exact installed Account before the existing same-runtime confirmation is used.
Same-Account credential rotation can now be historically attributed on this path;
without this provider it still requires recovery, as in PR6.

`reconcileTransition({generation,operationId})` after crash/reopen reads the actual
Authority fact/barrier and owner receipt, then rechecks Authority state. It is
strictly read-only: it does NOT mark a reopened intent confirmed, replay CAS,
change pointers/Control/tombstones/receipts or resume anything. Receipt missing,
corrupt, wrong scope/identity/generation, stale read, or unproven outcome refuses
with `mutationProven=false`, `recoveryRequired=true`, `canWrite=false`.

A validated receipt can prove that this exact mutation committed before an ack
was lost. `currentObservation` only reports an atomically observed Account whose
digest matches the tail receipt; superseding state returns false. It is never
current authorization, continuity or permission to resume. `continuityProven=false`
and `recoveryRequired=true` remain even for a matching tail. Thus legacy A→B→A
with matching bytes cannot revive A or become certified uninterrupted ownership.
No wall clock is used as a revision or validity source.

## Deliberate remaining gates

Classic Account writers do not participate in this receipt journal or the new
API's synchronous invalidation protocol. The fixture-only path cannot guarantee
synchronous stops for classic observers, detect every noncooperating ABA, or fence
legacy/offline writers. An unattributed current record mismatching a journal tail
refuses a new capture. Wholesale malicious rollback/deletion of both private
keys is outside local integrity guarantees; receipts are not server evidence.

Before any normal wiring, all Account entry points must join an owner-approved
durable revision/invalidation protocol and legacy writes must be refused/fenced.
Trusted server/provider qualification, actual credential revocation/tombstones,
migration/cutover generation races, binary durability and recovery publication,
and final transaction admission remain separate connected acceptance gates.
Receipt alone unlocks none of them. Normal B's existing receipts/prepared
operations must remain valid, and old A must never retag/clear B.

Tests use fake/native IndexedDB, disposable Chrome and loopback only; no real
Account/Pro credential, Production endpoint, Shared Write or normal writer.

## Isolated follow-up

[ACCOUNT_CUTOVER_BOOTSTRAP](ACCOUNT_CUTOVER_BOOTSTRAP.md) defines explicit physical3
canonical store rename and empty initial enrollment. The preceding protocol1/2
contracts remain unchanged by default. No normal writer or qualification is enabled.
