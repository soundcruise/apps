# Account + PC UI integration and next persistence boundary

## Integrated candidate

Base main: `40808692694aee7cd930730920c517ee02b5335a`.

- A: `475fbc97e8700240ed784160586b645aa8ce042d` — Port isolated Account
  coordination, optional Shared Account CAS, Studio cached readonly observation.
- B: `78e1e87f2140c5ccb5ed56ae6e596060fc86ccd9` — Home, owner NEWS provider
  presentation, explicit My Apps launch using the owner resolver.

This topic preserves both source commits as merge parents. It does not integrate
into main. Studio candidate **0.46.0**, Port maintenance candidate **1.24.2**,
StudioProject **schema 2**, Authority physical schema **2**. These version
namespaces are independent. This is an unpublished development candidate.

Six merge conflicts are resolved by keeping both roadmap entries, B's HTML/launch
imports and readonly launch projection, A's Account panel import, and A's current
Port cache expectations. NEWS's three owner references follow Port `1.24.2`.
There is no change to either workstream's Account/UI logic. The full conflict,
source/hash and test receipts are recorded outside the repository and summarized
in the Draft PR. Existing historical roadmap sections are retained.

Port owns its dataset and services; StudioProject remains the song owner. Home
and Account labels consume cached observations. NEWS acquisition begins on NEWS
activation and is cancelled on exit; My Apps launch requires explicit current
user action. These UI paths never acquire a Port writer or start Account/Sync.
The Account coordinator remains a dormant **isolated** API; a server summary is
not a fresh fence. **Shared Write OFF / PortDataHost.canWrite=false** remain.
No normal writer, L3d production wiring, authentication switch, Worker/D1/R2 or
production Account operation is part of this candidate.

## Current proven boundary and remaining gap

The current order is private-context invalidation, actual Authority
`invalidateIdentity` transaction complete, then the Shared Account DB's atomic
identity compare-and-set. A stale A cannot overwrite current B even if
notifications are absent or B arrives after the coordinator's final read.
Account publication failure after a durable stop preserves that stop on reopen.

If the stop transaction itself aborts, no Account update occurs. The live context
remains blocked, but process loss has no durable transition-intent marker to
recover. This is not completed retirement. Existing Control preparation reserves
an operation in `reservations`, but that pending reservation alone does not block
normal final admission: current admission reads the Control restrictions. A
notification, in-memory flag or pending operation is not a durable write barrier.

See the owner contracts:
[Account coordination](../../cruise-port/docs/PORT_ACCOUNT_COORDINATION.md),
[Control](../../cruise-port/docs/AUTHORITY_CONTROL.md),
[Repository](../../cruise-port/docs/PORT_DATASET_REPOSITORY.md),
[Migration](../../cruise-port/docs/PORT_AUTHORITY_MIGRATION.md), and
[write readiness](../../cruise-port/docs/PORT_WRITE_READINESS.md).

## Next implementation unit

**Durable Account Transition Intent & Crash Recovery — Isolated v1** is the next
cohesive implementation unit. It may implement an Authority-owned intent contract,
its transaction/admission integration, coordinator recovery diagnostics and
fault-injection tests together. It must remain isolated and cannot enable a
product writer. This document plans that work; it implements no persistence code.

Required behavior:

1. Define and validate a versioned, bounded intent record within the existing
   Port Authority ownership boundary. Bind operation ID, source partition,
   generation, full ownership identity, relevant epochs, transition kind and
   non-secret intended destination. Do not persist raw credentials, recovery
   secrets, tokens, in-memory capability objects or new authorization claims.
2. Atomically commit the intent and a restrictive Control state in the **same
   Authority transaction**. Existing final admission must read that restriction;
   a new unobserved journal flag is insufficient. Return an accepted begin receipt
   only after transaction complete. If the entire transaction aborts, it has not
   accepted a transition and must not submit any Account change. Saves serialized
   before the begin commit remain historical facts; old saves after it refuse.
3. Specify the identity meaning before choosing storage. Existing Control
   reservations/facts, journal and validation have contracts; do not hide a new
   record in an arbitrary field or reuse an evidence/publication namespace.
   Prefer existing stores only when their owner schema can explicitly support the
   new typed record. Any required physical schema migration must be separately
   documented/tested in this unit; never silently change StudioProject schema 2.
4. Keep the Account CAS in its own existing DB transaction. Do not claim atomicity
   across Account and Authority DBs. Retrying an operation must verify its original
   identity/payload, preserve reservation collisions and not retag it to B.
5. On reopen, hydrate the durable restriction before any participating admission
   or recovery action. Lost notifications cannot clear it. Old handles, clock
   origins and fixture capabilities do not survive reopen. A fresh observation
   or operation lookup is not permission to resume.
6. Recover by inspecting actual durable facts and current owner state. If Account
   CAS committed but the completion receipt was lost, preserve the Account record
   and remain `recovery-required` unless existing owner evidence can unambiguously
   attribute that mutation. Matching Account IDs alone do not prove the credential
   generation, an ABA history or successful completion. Do not add a second
   Account canonical record, synthesize a credential, auto-login, auto-clear B or
   automatically replay a saved destination. Fresh qualification/explicit recovery
   may be required; a new trusted mutation-revision/receipt contract, if needed,
   must be an explicit Shared owner extension with its own acceptance.
7. Distinguish intent accepted, Authority stopped, Account CAS confirmed,
   completion historical, superseded/mismatched and recovery-required. No state
   or cancellation clears irreversible identity invalidation or implicitly
   resumes the old generation. Keep quotas, bounded retention and operation-ID
   collision behavior explicit; do not GC unresolved evidence automatically.

Expected code ownership is the Port Authority/coordinator and their tests;
Shared Account may receive only a necessary explicit CAS/receipt extension,
and Studio may expose readonly recovery status. No Worker product change, server
credential mutation, normal boot connection, outbox processing, migration publish,
binary deletion or production setting belongs in this first unit.

## Dependency and acceptance sequence

| Step | Depends on | Required evidence before advancing |
| --- | --- | --- |
| Durable intent / fail-closed recovery | Current A barrier and CAS | Real transaction begin/admission ordering; all crash cuts; readonly diagnostic state; old A cannot overwrite B |
| Complete Account entry-point and old-writer coordination | Intent/recovery; explicit owner/lock graph | Every participating switch/detach/revoke path; missed notifications; old/protocol-incompatible writer refusal, including local/offline cases |
| Trusted Account/cloud admission provider | Account binding, existing server fence contract | Actual Account/membership/device generations and freshness; no local counter/summary substitution; preserved Pro terminal denial and B |
| Migration / recovery / binary readiness | Writer fencing plus required provider | Full source provenance/raw rescue, exact revisions, delete/outbox intent, binary manifest/readback, journal/seal/pointer consistency, interrupted-copy recovery |
| Product persistence slice | All applicable gates above | Standard Metronome BPM read → draft → explicit save → reload; stale/conflict/quota/response-loss refusal and preservation |

Provider design and legacy-writer inventory can be investigated alongside the
first isolated unit. Product write activation cannot run ahead of their evidence.
Some legacy builds do not cooperate with locks or notifications; if they cannot
be safely fenced, retain compatibility mode and block activation. Merely waiting
for tabs to close, observing equal reads twice, or introducing a new Web Lock does
not prove old writers are absent. No backend enforcement switch is authorized here.

Migration must reuse the owner planner/candidate/engine and preserve unknown/future
data, raw rescue, source hashes, stable IDs, delete intent and original operation
identities. Binary bytes must be durable and verified before their references can
be admitted. Metadata-only success cannot certify binary durability. Existing
Sync/outbox/asset work must not move to a new Account by changing an ID.

Local Standard remains Account-free; local Pro and cloud authorization remain
separate. Preserve observed terminal credential A denial after rollback/reopen,
normal B, final synchronous admission and existing evidence clock/margin rules.
P3 retirement-only tracking remains separate and cannot replace an actual native
test completion. Shared Write and L3d product activation require later approval.

## Required next-unit tests

- Node contract/state tests: malformed/duplicate intent, exact identity/epoch,
  operation-ID/payload collision, idempotent historical lookup, unknown/future
  format, capacity failure and no secret serialization.
- Native IDB/two-renderer/Web Locks tests with dropped and delayed notifications:
  save-before-begin and begin-before-save proven by transaction gates; abort before
  intent complete; crash after intent complete/before stop; stop complete/Account
  CAS pending; CAS abort; CAS complete/receipt loss; completion/reopen;
  concurrent A→B and old A terminal response; same-Account credential changes/ABA.
- Each interruption must leave either an unaccepted unchanged operation or a
  durable blocked/recovery state. Verify current B bytes, old handles refused,
  no duplicate mutation and no implicit resume/Account retag.
- Demonstrate the cooperative boundary with an injected old noncooperating writer;
  detection/refusal or an explicit activation blocker is required. Do not simulate
  universal fencing with a notification or fixture-only boolean.
- Targeted existing Account/Control/Pro/Repository and Studio readonly regressions;
  new production-style startup remains storage/network/write-free. Use disposable
  loopback profiles and preserve assertion/timeouts. No routine full L2a rerun or
  production security probe is required for this isolated unit.

## Publication boundary

The present operation publishes only this topic and a **Draft PR**. main merge,
auto-merge and production deployment remain unauthorized. A future main update
triggers the repository's Pages publication path; that requires separate approval
and fresh-main/integration acceptance. Unpublished topic tests are not a claim of
production Account, real-IME, Safari or physical-printer acceptance.
