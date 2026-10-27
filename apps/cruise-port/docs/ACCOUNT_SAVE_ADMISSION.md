# Account owner final admission — isolated contract v1

Studio 0.47.10 / Port 1.24.13 internal maintenance candidate, based on published
main `d66107c5ef30ca1a0873f0943876c73e745c14b5`. Project schema2, Account physical3,
Authority physical2 and Shared Write OFF / PortDataHost.canWrite=false remain.
This is NOT production save authorization, a routed backend or a consumer cutover.

## Ownership and connection

Existing `sca1` issuance/parsing/HMAC and `verifyAccountCredentialSnapshot` remain
Account owners. `account-save-admission.js` defines an unrouted fixture contract.
Port `port-account-save-admission.mjs` connects its opaque context to the existing
BPM isolated owner. It privately captures/inspects the canonical Account source,
checks it before/after awaits and never exposes a credential to Studio. Official
provider observations still expire after 5 seconds and still report no credential
expiry. They do NOT authorize this adapter. No independent auth, Account DB,
dataset, Sync engine, Project store or Undo stack is added.

The owner constructor requires `fixtureOnly=true`, the explicit
`co-located-owner-fixture` boundary, async `readPrimary`, synchronous `readAtCommit`
and the existing credential verifier. Neither an HTTP response, cached summary,
UI generation nor a Promise can implement the synchronous owner probe. Missing
capability refuses; there is no observation-only or production fallback.

## Request / capability / receipt binding

The exact v1 request is a flat data-only object: contractVersion, purpose,
operationId, action, partitionId, datasetGeneration, targetKey, Account/device IDs,
Account/member/credential generations, sourceDigest, baseRevision and changesDigest.
Only `saveBpm` / `cruisePort.metronome` is supported. Extra fields/accessors, unknown
targets, non-integer generations and invalid IDs/digests refuse. Identity namespaces
remain separate; an Account revision is not a server or membership generation.

Port creates BPM raw through the existing settings owner before requesting
admission. Unknown settings fields remain intact. `changesDigest` binds the exact
raw payload, not merely a displayed BPM. The owner verifies the actual HMAC, its
current row, lifecycle, target and request; after crypto awaits it probes again.
Contexts are private WeakMap capabilities, not serializable bearer credentials.

The public non-secret binding contains requestDigest, credentialVersion,
credentialExpiresAt, credentialLeaseRevision and runtimeGeneration. Port includes
it in the existing authorizationIdentity/fingerprint. Authority's existing guard
details add changesDigest and authorizationIdentity. Within its readwrite
transaction the owner guard matches operation/action, generation/partition,
current head revision, target, exact payload digest, Control identity, Account
source digest, credential version and admission binding, then probes owner state.
No async result, exception, unknown or truthy non-true result can authorize.

Existing Authority reservation/fingerprint, CAS, retained fields, referential
integrity and Control checks remain. Records/manifest/head/oplog receipt commit
together. Existing fingerprints without the optional new binding remain valid.
The in-memory owner collision map supplements, never replaces, durable Authority
reservations: same operation ID with different content refuses. Reopen cannot
erase the durable reservation. The owner map is not a second receipt ledger.

BPM saves do not mutate Account, so no Account mutation receipt is minted. Dataset
receipts retain the exact authorization identity; a different Account, generation,
payload or missing/corrupt receipt cannot prove success. A matching current BPM is
not evidence. Replays/recovery remain historical, canWrite=false and
operationAuthorized=false. There is no automatic save retry or current grant from
an old receipt. Existing immutable Shared backup pending tickets/readback remain.

## Credential lifecycle: explicit fixture extension, NOT deployed schema

The current production Account device schema has no expiry or renewal route.
Tests add proposed fields ONLY to synthetic existing Account device rows:
credential_issued_at, credential_expires_at, credential_lease_revision,
credential_lifecycle and credential_clock_floor. A separate synthetic
account_save_enabled runtime gate defaults closed; account_read_enabled never
qualifies a save. No production migration/config
or existing issuance/renew route is changed. This is an executable proposed owner
contract, not a statement that production credentials now expire.

| State | Admission |
|---|---|
| valid | Requires exact identity/generations, active linked membership, trusted provenance and owner save gate |
| expired / revoked | Refuse; cannot revive via observation or historical receipt |
| renewing / renewal-failed | Refuse; only a separate owner-issued credential transition may resume |
| old-account / generation-mismatch | Refuse without clearing another Account's receipt, authorization or prepared save |
| unknown / missing expiry / invalid clock | Refuse, never invent a lifetime |
| permission-denied | Owner save gate is separate from the observation/read gate; refuse |

The SQL fixture serializes a fresh probe on its canonical owner rows and persists
the owner clock floor and terminal expiry before returning, including denial.
New owner instances read these facts, so expiry denial followed by clock rollback
does not revive the credential. Renewal tests use the existing credential factory
and HMAC with a new owner credential version/lease revision, not a client renewal.
An invalid capability is permanently refused for that instance even after a clock
or row changes. Observation lifetime and credential lifetime are independent.

## Atomicity / TOCTOU boundary — deliberately incomplete for production

The definitive fixture admission point is the synchronous guard inside the
Authority transaction, immediately before its record publication requests. The
fixture can inspect co-located owner state there without an await. Account switch
still uses the existing durable Authority stop intent and Account CAS/receipt.
No transaction spans Account DB, owner SQL DB and Authority IndexedDB.

In particular, owner revocation in a separate DB AFTER that guard is not atomically
serialized with completion of the IndexedDB transaction. Remote HTTP reads cannot
close this window. Fixture PASS must NEVER be presented as solving that production
race. Production requires a reviewed backend mutation/admission boundary which
revalidates owner rights together with its protected operation, or a separately
proven serialization/fencing protocol through commit. This capability is absent
and there is intentionally no product installation. Same-origin schema-aware raw
writers remain outside the guaranteed cooperative protocol; digest/HMAC checks
do not turn local JS/IndexedDB into an origin ACL.

## Tests and rollout

Node uses the existing Account owner SQL/HMAC fixture and IndexedDB fixture for
expiry/revocation/renewal states, clock rollback after reopen, late A while B is
prepared, exact binding, operation collision/CAS, duplicate commit, abort/receipt
loss, timeout, malformed/throwing/Promise results and no boot imports. Existing
Authority/intent/receipt/provider/consumer/backup/BPM cohorts remain applicable.

Native Chrome uses real isolated IndexedDB and the actual HMAC/evaluator with a
co-located synthetic owner model for normal UI, final-guard expiry, async probe
refusal and commit-ack crash/reopen. It does NOT prove owner SQL persistence;
that is a separate Node SQL test. Existing two-renderer BPM races also regress.
No real Account, Secrets, production network, microphone or Cloud is used.
Exact source/test hashes, raw results and independent review are recorded outside
the repository. Assertion/timeout/security gates are not relaxed.

Production dependencies remain: owner router/CORS/rate policy; issuance/renewal/
expiry schema and rollout; backend atomic final admission and operation receipt;
consumer/old-writer cutover; migration/binary/Cloud restoration, retention/export
and capacity; final acceptance and separate activation approval. P3 retirement-only
Issue #3 remains independent. Studio stays 0.x.y until explicit release approval.
