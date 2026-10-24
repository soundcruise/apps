# Durable Account Transition Intent — isolated v1

This Port-owned API is dormant. No normal Account entry point, Port/Studio boot,
writer, Sync runtime or authentication route imports or activates it. Shared Write
stays OFF; Studio `canWrite=false`. StudioProject schema 2 and Authority physical
schema 2 / nine stores stay unchanged. The reservation **logical union** explicitly
adds the strict version-1 `account-transition` row; unknown fields or future
versions are rejected. Older readers do not understand this row, which is one
reason this isolated work cannot activate a product writer.

## Begin, CAS and acknowledgment

`beginAccountTransition(request + branded control:invalidate capability)` captures
an exact request: generation, operation ID, full bound-Account owner identity,
expected Control epoch, expected pointer epoch, `switch | detach | revoke`, and a
nonsecret destination `{accountId, accountDeviceId}` (or null for detach/revoke).
Generation/operation identifiers retain the existing identifier contract; other
owner identities permit their existing punctuation, bounded to 128 characters.
No Account credential, token, session receipt, capability or authentication claim
is persisted. The typed fact is bounded to 16 KiB.

Within one actual `COMMIT_STORES` readwrite transaction, begin checks the active
pointer, identity and epochs, operation-ID collisions, and capacity. It atomically
adds a typed stopped intent and writes `Control.identityInvalidated=true` with an
incremented epoch. Existing dataset final admission reads this exact irreversible
restriction. No pending reservation, notification, local status or Web Lock stands
in for this transaction. The accepted receipt is returned only after transaction
complete. An abort leaves neither the intent nor the new restriction and never
submits the Account CAS. A save serialized before accepted begin remains history;
a save after it refuses, including an already prepared handle.

The coordinator then calls the existing Shared Account **separate transaction**
`changeAccountIfCurrent`. The private expected key includes the actual credential,
so an old A cannot replace or clear B. There is no cross-database atomicity claim.
After a live successful CAS acknowledgment, the coordinator records
`account-confirmed` using the same begin Store's opaque runtime receipt and branded
capability. A clone, replay lookup, new Store/reopen or old lease cannot obtain this
completion authority. Confirmation is a historical observation of the cooperative
caller, not a server receipt, new authorization, permission to resume, or durable
proof of current Account state. It never clears Control invalidation.

A same-Account credential rotation has no durable Shared mutation receipt contract
for recovery attribution. The isolated CAS may preserve the new credential bytes,
but its intent remains stopped/recovery-required; it is not certified complete.
An Account A→B→A history is never inferred from matching Account IDs. An incomplete
intent is never automatically replayed, cancelled, cleared, retagged or resumed.

## Reopen and bounded recovery diagnostics

`accountTransitions(generation)` validates typed facts and their actual durable
Control restriction. Missing/mismatched restrictions or malformed facts refuse.
Any stopped fact yields `recoveryRequired=true`; confirmed facts remain historical
and the generation remains invalidated. The coordinator hydrates this state and
rechecks liveness, local generation, UI revision and actual Account bytes after
all asynchronous reads before publishing a context. Lost or delayed notifications
cannot create a fresh context from an incomplete intent.

The Store never stores the destination credential or automatically recovers a
saved destination. If CAS committed but its acknowledgment or the confirmation
transaction was lost, current B remains intact and recovery-required remains.
Explicit future owner recovery must acquire fresh qualification and real facts.

There are at most 64 intent facts per generation, no automatic GC, and a 4096-row
per-generation scan budget. The sorted cursor jumps directly to the generation
prefix and stops when it leaves it. Exhaustion rejects without deleting history.
Normal irreversible invalidation admits at most one new transition per generation;
the larger bounded quota accommodates historical/future explicit owner recovery.
Exact operation retries return historical-only status and cannot run CAS again.
A different request with the same operation ID or another reserved/oplog operation
rejects before any mutation. No evidence/publication journal namespace is reused.

## Acceptance and remaining activation blockers

Focused Node tests exercise strict input/fact validation, atomic abort, both save
orders, active Authority B and its prepared save, duplicate/collision behavior,
capacity, missing barrier, Account CAS abort/receipt loss, confirmation abort,
same-Account rotation, post-hydration late B, and reopen with dead/cloned receipts.
Native disposable Chrome tests exercise real IDB transaction completion/abort,
two tabs with dropped notifications, renderer-page teardown before accepted begin,
after accepted stop/before CAS, after CAS/before acknowledgment, and confirmed
reopen. No native case uses an injected fake IndexedDB or production credentials.

An unaccepted transaction abort cannot provide durable evidence that an operation
was attempted; after a crash the prior durable state remains. This is correct
atomic behavior, not completed retirement. Accepted begin is the irreversible
boundary. Noncooperating legacy writers can still mutate legacy storage outside
Authority: these tests do not claim universal fencing. Account entry-point wiring,
legacy/offline writer detection/refusal, trusted server fence provider, migration,
binary durability, recovery publication and final admission remain later gates.
Existing Pro receipts/terminal denial, normal B, CAS/tombstones and final admission
are not relaxed. Worker/D1/R2/Secrets/production Account operations are out of scope.

## Optional receipt extension

The isolated `mutationStore` path and read-only crash reconciliation are specified
in [ACCOUNT_MUTATION_RECEIPTS.md](ACCOUNT_MUTATION_RECEIPTS.md). The earlier
no-provider path remains compatible. Reopened recovery does not obtain the live
confirmation receipt, alter intent phase or clear the irreversible barrier.
