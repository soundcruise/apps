# Port Account Context & Invalidation Coordination v1

This foundation is **dormant and isolated**. It does not enable a normal Port or
Studio writer, L3d production wiring, Shared Write, Account enrollment, Sync or a
new authentication system. Port remains the dataset owner; StudioProject remains
the owner of Studio songs. StudioProject schema 2 and Authority physical schema 2
are unchanged.

## Owner APIs and observations

`port-account-coordination.mjs` has no import-time I/O. The explicit
`createIsolatedPortAccountCoordinator({scope,indexedDB,accountStorage,locks})`
requires an existing registered isolated Authority scope, a fixture-named DB,
Shared Account storage and Web Locks. Its Control operation uses the existing
privileged fixture capability provider. It cannot manufacture a production
Control provider. A normal scope cannot adopt a privileged fixture Pointer.
No ordinary route imports or calls this factory.

`observe({generation,summary})` explicitly reads the existing Account DB without
creating an absent DB, hydrates the real Authority Store, and re-reads Account.
The summary shape is the existing AccountClient summary's `account` and
`memberships` objects. Exactly one active `appId='port'` membership and the actual
positive server Account/membership generations are required for an identity
match. Unknown, malformed, duplicate, missing or mismatched values are not
guessed. A supplied summary is an **observation**, not authenticated fresh fence
evidence. The coordinator does not fetch summaries or issue credentials.

The following values have different namespaces:

| Value | Owner and meaning |
| --- | --- |
| `uiRevision` | Coordinator-local invalidation counter, reset for a new runtime |
| `localGeneration` | Existing Shared Account storage notification generation |
| `serverIdentity.accountGeneration` | Observed server Account generation |
| `serverIdentity.membershipGeneration` | Observed server Port membership generation |
| `authorityGeneration`, `controlEpoch` | Existing Authority dataset/Control identity |

An opaque observation binds the private Account ID, credential identity, Account
device ID, local generation and full Authority identity. Raw credentials never
enter display state, notifications, Authority records or reports. Copying a
token does not copy its private binding. `known` means only that the observed
identities match and the local Control is not stopped. **Every public status and
result has `canWrite=false`; none is write authorization.**

## Explicit Account transition and durable barrier

`transition({context,operationId,nextAccount})` is an isolated cooperation API.
`nextAccount=null` is explicit detach; otherwise it is an already supplied Account
record, not a credential generated or authenticated by this module. The caller's
replacement is copied before asynchronous work starts.

1. Acquire the exclusive Port partition Account-coordination Web Lock. It
   serializes participating transitions; it is not a claim about legacy callers.
2. Re-read actual Account identity and local generation. A delayed A operation
   must refuse if B is now current, even with every notification dropped.
3. Irreversibly block the old private observation immediately.
4. Call the real `Store.invalidateIdentity` with its original full identity,
   generation, operation ID and branded `control:invalidate` capability.
5. Await the real Authority transaction **complete**, not request success. A
   refusal/abort prevents any Account publication.
6. Use Shared storage's `changeAccountIfCurrent(expected,next,indexedDB)`.
   That minimal optional owner hook runs `get(account)`, identity comparison and
   `put/delete(account)` in **one Account DB RW transaction**, while retaining
   existing invalidate-before-write, watched transaction and complete semantics.
   An unrelated B installed in the final read-to-write gap wins; stale A cannot
   clear or replace B. Existing `setAccount/clearAccount` behavior is unchanged.
7. Return a historical completion only after Account complete. Do not resume the
   old Control, rebind old operations, move old outbox items, publish a new
   Authority generation, or transfer Pro/cloud permissions.

The lock is held only around local coordination; no network or Sync is performed.
It does not replace existing activation/Sync/dataset locks or their order. Any
future production integration must review the complete lock graph before wiring.

## Failure, concurrency and reopen

- Notifications are UI invalidation hints, never the durable stop proof.
- Existing Store final admission serializes against the durable Control row.
  A save completing before stop remains committed. A queued or subsequent old
  save after stop is refused, including in another tab without notifications.
- If stop completes and Account publication fails, the old Account may remain in
  its DB but its Authority identity stays invalidated. A fresh renderer/reload
  hydrates the latch and cannot recapture it as a usable observation. No rollback
  to the former writable Control is provided.
- If stop itself aborts, Account is not changed and the current private context
  remains blocked. The result is `recovery-required`. This does **not** prove a
  durable retirement happened. After process loss, a fresh observation can only
  retry a stop; it is not an authorization or a successful retirement. A durable
  transition-intent/provider-admission policy is still required before normal
  writers can rely on terminal Account retirement across this earlier crash
  window. Do not enable a writer on the strength of this foundation.
- Shared Account and Authority are separate DBs. There is no claimed atomic
  cross-DB transaction. Account CAS protects the destination; Control protects
  old participating Authority operations. Direct legacy writers that bypass
  Authority remain a production-enablement blocker.
- Dispose/versionchange/unexpected connection loss invalidates existing Store
  capabilities and observations. Reopen requires new scope/runtime observation;
  it never transfers old handles or clock origins.
- A failed transition is not silently retried with a new Account/identity. The
  original operation's reservation and Control fact retain the existing Store's
  collision/replay rules. Historical completion is not current authorization.

## Pro, Cloud and server evidence

The existing Pro source/Device Session/Adapter is not modified. A terminal A
cannot erase a later B's credentials or proof. Local Standard operations retain
their Account-free policy; local Pro does not acquire a new Account requirement.
Cloud needs its existing independent Account/device/membership/Pro/backend
checks. Local counters and the summary above are not server fence evidence.
Unobserved server revocation is not claimed detectable while offline.

No Control resume/renew, fresh-evidence generation, expiry extension, migration,
binary admission, outbox retag, authentication switch, Worker/D1/R2 or production
credential operation is performed by this foundation.

## Studio readonly surface

The existing Tools Port panel consumes
`js/port-data/account-status-projection.mjs`. It displays cached Account presence
with an explicit terminal-local observation/read-only note. Unknown server
generations remain unknown; a known Account is never labeled authorized. The
projection starts no network, storage, Account/Sync provider or writer. Existing
explicit Port inspection controls remain the only local read trigger.

## Acceptance and next writer gate

Targeted Node tests use the actual Shared Account implementation and the existing
Authority Store with isolated fake IndexedDB. Native Chrome tests use actual
IndexedDB, two tabs, real Web Locks, disposable profiles and deliberately dropped
notifications. They cover both save/stop orders, final Account CAS gap, failed
Account publication/reload, and concurrent transitions. They do not substitute
for the accepted L3c native transaction oracle or claim new full L2a acceptance.

Before formal dataset saves: resolve trusted Account/provider freshness and
terminal-intent crash policy, connect all participating Account entry points and
legacy writer fencing, verify migration/recovery/binary/final admission, and keep
old/new identity partitioning. A later explicit Standard Metronome BPM
read → draft → save → reload slice is the smallest product-write integration.
Production write enablement requires its own acceptance and approval.

## Durable transition continuation — isolated v1

The coordinator now uses a typed durable intent plus Control invalidation in one
Authority transaction before the existing separate Account CAS. Reopen and lost
CAS acknowledgment yield recovery-required; no destination replay or resume is
allowed. Historical confirmation requires the same live begin receipt and never
grants authorization. Same-Account credential rotation stays unresolved without a
Shared mutation receipt. See [the exact intent contract](PORT_ACCOUNT_TRANSITION_INTENT.md).
This remains dormant and does not enable a product writer or production Account
change. The previous stop-only behavior is superseded for this isolated API.
