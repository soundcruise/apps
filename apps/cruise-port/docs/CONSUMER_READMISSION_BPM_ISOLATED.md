# New consumer operation Admission / BPM isolation

Candidate: Studio 0.47.18 / Port 1.24.21 / StudioProject schema 2.
Base: bbaab206cded382d49190335540a1bd1711bbede.
This is an isolated technical contract. Normal boot, Account, Sync and writer
connections remain unchanged. Shared Write OFF; canWrite=false.

## Owner responsibilities and prerequisites

PR23 publishes a new Authority pointer and a registered readonly consumer, while
preserving suspended/fenceRevoked and the old stop history. The SQL registry stays
readonly. It is never reopened, cleared or reset by this feature.

The isolated transaction factory accepts `enableConsumerReadmission` only with
`enableOwnerCutover`, operation lease and credential lifecycle binding enabled.
The flag defaults OFF. The public Worker router does not import these routes.
Fixture initialization supplies the existing Port Account source, IDB Authority,
immutable backup owner and exact isolated route dependencies. No additional
Account/storage source or Sync engine exists.

## Envelope v3 and SQL Admission

Envelope purpose `owner-consumer-readmission-envelope-v1`, schemaVersion 3, adds
`readmission` to the existing v2 contract. It contains exact transitionId,
requestDigest, completionDigest, registryRevision and stopFenceRevision.
The pointer must be `isolated-owner-cutover`; the registered consumer must be
readonly and match the pointer generation/epoch/transition. Consumer identity and
epoch are part of the full envelope digest. These are integrity values, not
standalone authorization credentials.

Local provenance verifies the typed publication, original cutover inventory,
renew/adopt/reauthorization history, immutable publication intent and any typed
partial recovery. Unknown or altered backup rows stop preparation. Previous
new-consumer operation pins must have exact backend AND local historical proof.
Current Account snapshot and manifest, Authority head/control/pointer and consumer
are checked again at asynchronous boundaries and inside the IDB application.

The owner SQL gate joins the exact readonly registry and immutable completed
cutover. It binds transition, request/completion hashes, pointer digest, canonical
consumer JSON, registry revision and original stop fence. The old v2 open-scope
gate remains unchanged. E3 fails when this feature flag is absent, even through
an older transaction factory.

Existing HMAC Account/device authentication, member/Account generation,
credential version/lease revision, durable expiry/revocation, Pro credential,
writer epoch and operation fencing remain mandatory. The existing operation
lease increments the device fence monotonically. Its envelope/authentication
digests bind operation UUID, exact dataset payload, expected revision/CAS and the
new pointer/consumer. Altered old leases and old prepared handles cannot move to
the new generation. Backend save repeats the final assertions in its SQL batch.
No consumer-wide writer permission is granted by a successful operation.

## BPM and explicit recovery

`createIsolatedOwnerOperation.load` reads current Port owner values without
normalization or storage writes. `createIsolatedConsumerBpm` connects this owner
to Studio's existing dependency-injected draft controller. The revision reader is
a CAS hint only; it cannot authorize a save. Views and prepared handles are bound
in memory, never adopted by shape. BPM changes spread the exact existing settings
object and preserve other/unknown fields; no UI or normal boot installs this path.

The controller's pending adapter references the original immutable operation and
lease pins. It validates their readback instead of creating another backup or
second data source. Reload/edit cause no save; only explicit save prepares a new
UUID and requests a new owner lease. Acknowledging a successful historical result
never deletes or consumes an immutable pin.

Linearization points are separate:
1. SQL batch atomically asserts owner/lease/CAS, writes dataset and change receipt,
   and consumes the operation lease.
2. IDB transaction applies only that exact SQL result to the exact readonly base,
   with its typed owner-operation receipt and unchanged control/pointer.

SQL and IndexedDB do not form one atomic transaction. A backend success with a
local failure is a partial result, not success. ACK loss is unknown until exact
reconciliation. `recover` only reads historical facts. `recoverPending` requires
an explicit gesture, the same consumer, original immutable envelope/local
identity/lease, still-exact base and current owner receipt. It NEVER resends save.
It cannot repair a missing/corrupt typed receipt over an existing local operation.
Already-applied results are read-only historical successes. Checkpoint failure
retains known backend/local commit facts; no automatic retry, rollback or pin loss.
A new operation remains blocked by an unresolved predecessor.

## Actual renewal and limits

Tests run the existing owner renew begin/finish/reconcile routes, not fake expiry
mutation alone. Renewing refuses old lease use. After finish, even the new bearer
cannot revive the old envelope/lease. A new request with current credential
counters can receive a new fenced lease and perform an isolated SQL operation.
ACK recovery, revocation before/after finish and pointer-registry changes are
covered. Old A cannot alter B's credential, prepared save or receipt.

This backend success is distinct from adopting the new secret into the old local
consumer. Local Account digest and original cutover provenance remain fixed.
Renewal therefore stops that local path until explicit credential adoption and
new Authority recovery/cutover. This feature does not transplant credentials or
old prepared saves into another generation. A full repeated renewal/adoption/
cutover consumer lifecycle remains a later vertical integration gate.

## Tests and production limits

Direct Node tests exercise exact bindings, pointer/consumer/Account ABA, missing
registration, expiry/revocation/Pro/writer denial, CAS/replay, corrupted provenance,
missing/altered backend/local receipts, partial result/ACK/crash, two tabs, unknown
fields, normal B and Studio draft/reload/consecutive saves. Local workerd with
disposable D1 verifies real SQL batch rollback and registry assertion races.
Native Chrome uses native IndexedDB/Web Locks plus Studio's draft controller;
network is confined to an owned ephemeral loopback server.

No fixture PASS proves production Account routes, real Pro qualification, secret
rotation, SQL physical-commit expiry, cross-DB atomicity, same-origin raw-writer
exclusion, consumer cutover, Cloud/multi-device/binary recovery or final production
admission. Existing migration/binary/legacy-writer gates remain mandatory. Real
Safari, OS IME, microphone and printer acceptance is not included. Pages/Worker
publication and main merge require a separate explicit approval.
