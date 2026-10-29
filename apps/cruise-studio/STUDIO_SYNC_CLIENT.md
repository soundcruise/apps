# Isolated Studio Cloud Client v1 — default OFF

Direct dependency: PR #43. The client is an explicit ES module factory, not
imported by normal Studio boot or exposed as a new regular UI. Only localhost
HTTP and HTTPS `.invalid` fixture endpoints are accepted, with an exact candidate
path, no credentials in URLs, no redirect and `credentials:omit`. Production
hostnames are rejected even when enabled. Production activation needs a reviewed
transport change and separate approval.

## Source of truth and storage

The existing localStorage Project remains the local source of truth. The client
uses `projectRepository.read/save`, the unchanged schema2 validator, the existing
`cruiseStudio.projects.write` Web Lock, and exact raw JSON CAS. `save.precondition`
is checked inside that existing lock and again immediately before the first
write. Cloud import supplies a synchronous current-session predicate. No local
Project is implicitly removed; remote tombstones preserve local drafts.

IndexedDB `cruiseStudio.isolatedCloud.v1` is a transfer journal, not a new Project
repository or a second Sync engine. Its sealed records contain the immutable
sending snapshot/chunks, raw local revision/digest, Account/device/Pro/epoch
binding, operation UUID/request digest, next chunk, phase, state and receipt.
Credentials are never persisted to the outbox. Pending snapshots are retained
until a future separately accepted retention contract; there is no auto-purge.
Seals detect corruption, not malicious privileged same-origin rewriting.

A per-document Web Lock `cruiseStudio.cloud.document.<id>` serializes outbox
operations across tabs, including different Account sessions using the same
local document. IDB writes additionally compare record versions. No time-based
lease pretends to prove remote commit. Network calls have bounded cancellation;
a browser/tab ending releases its Web Lock, while COMMITTING/UNKNOWN remains
persisted and blocks automatic send. Only cooperative callers are covered; raw
localStorage/IDB writers and same-UID arbitrary mutation are outside this client
contract.

## Trusted session and Account boundary

The isolated host supplies synchronous `readSession()` with a verified Owner
binding (`audience, accountId, deviceId, generation, recoveryVersion,
credentialVersion, proId, proGeneration, epoch`), nonsecret session ID, validUntil,
Account credential and Pro credential. This is not a new authentication provider.
Binding/source verification and real Account/Pro lifecycle integration remain
owned by the existing Account/Pro host. Fixtures inject synthetic sessions.

Every request and response checks the current session, expiry and exact credentials
in memory. Backend independently reauthorizes. A late A response can only mark
A's operation for recovery; it never mutates B's Project or link. Per-document
Account affinity prevents reusing A's local Project as B's Cloud document. A user
can later implement an explicit validated copy with a new Project ID; the client
does not silently reassign ownership. `list()` and `inspect()` return only the
current Account's sealed operations and require a live session.

## Sending and explicit recovery

`enqueue(id)` reads/validates local snapshot and records one operation, then links
it. Two tabs cannot enqueue over a nonterminal linked operation. If op persistence
succeeds but link persistence fails, the error includes the operation ID and
`list(id)` can rediscover it after reopen. `recoverIndex(id)` explicitly attaches
it only when no different nonterminal operation/local apply intent is active.

`send(op)` enrolls, begins, uploads, persists COMMITTING, commits and validates the
entire typed receipt before a current-authorized snapshot readback. The codec is
extracted from PR #43 unchanged and reused by Backend and Browser: sorted canonical
JSON, exact Unicode, UTF-8 bytes, 128KiB chunks and SHA256. No validator/budget is
reduced. A matching receipt plus head is required; HTTP200 alone is insufficient.
Local draft bytes stay unchanged. A local edit during the transfer yields
LOCAL_CHANGED. A later remote head yields REMOTE_ADVANCED, and CAS loss yields
CONFLICT with the sending snapshot retained. There is no automatic merge.

Transport ambiguity is UNKNOWN with original op/phase retained. Owner refusal is
PENDING_RECOVERY. Neither can be sent automatically. Explicit `reconcile(op)`
queries the original operation plus request digest. The Backend adds an optional
exact requestDigest to the existing reconcile contract: legacy callers retain
legacy missing-pending rejection; opted-in callers can obtain current-authorized,
Account-bound typed absence. Only precommit phases with identical binding/session
can requeue that SAME UUID. Missing pending after a commit attempt remains HOLD.
No replacement operation is inferred from UNKNOWN.

Existing pending can restart immutable chunk uploads explicitly. Old binding or
session returns PENDING_RECOVERY; it cannot be silently adopted. Historical
receipts are not current permission. Old receipt reconciliation never erases a
newer active op or local apply intent; it becomes HISTORICAL_RECEIPT. Lost keys,
new-generation pending adoption and registration/device rotation ACK recovery
remain Backend/Owner gates, not fabricated client authority.

## Receiving, local conflicts and non-atomic boundaries

`observe(id)` reads without changing the Project. `applyRemote(id, exactLocalRaw)`
is an explicit caller action with raw CAS, not a background overwrite. It stores
an IDB intent, saves through the existing Project repository and session guard,
then stores the new link. LocalStorage and IDB are NOT one transaction.

Known failed local saves clear their intent; `result-unknown` is retained.
`recoverLocal(id)` has three cases: unchanged pre-save raw means no application
and clears only the intent; exact material plus a newly authorized matching
remote head means completed application and repairs only the link; any different
current draft remains a conflict. `preserveLocal(id, exactCurrentRaw)` is explicit
conflict resolution: after Owner reauthorization it clears the intent while
preserving local bytes and the previous Cloud baseline. No remote adoption or
silent success is inferred. Material comparison excludes only the repository's
normal `updatedAt/appVersion` stamps; all other schema2 fields are preserved.
Remote may advance after any readback; the next write still uses CAS.

Cloud deletion uses the same outbox/CAS/receipt/reconcile flow with a tombstone.
A returned remote tombstone updates Cloud state only and never calls repository
remove. This version refuses resurrection; undelete and cross-Account reassignment
are not implemented. States are client API data: local saved, queued, uploading,
UNKNOWN, PENDING_RECOVERY, CONFLICT, SYNCED, LOCAL_CHANGED and remote deleted.
No regular UI claims Cloud enabled or synced merely from HTTP status.

## Version and ownership gates

Studio patch candidate is 0.47.21, schema2 unchanged; Port remains its dependency
version. Existing save API gains a trusted precondition but normal UI behavior is
unchanged; Cloud code stays isolated. Studio HTML/internal versioned ESM/cache
mirrors and strict version expectations are updated together. No Port/four-app
source, shared Account module, Production entry, binding or migration changes.

The unchanged Studio-only releasedBoundary test rejects the explicitly authorized
Backend file; it is NOT weakened. Functional metadata/version tests are run
separately. The repo-external exact multi-owner Gate permits this one Backend
file plus the client/contract/tests and proven version-only changes, while checking
formal root HEAD/index, originals, immutable manifests and dependency heads.
This is limited independent-clone acceptance, not adopted v2 protection PASS.

## Validation and release limits

The committed E2E file uses native workerd/D1, persistent disposable Chrome profiles,
real Web Locks/localStorage/IndexedDB/WebCrypto and synthetic credentials/anti-abuse.
All browser traffic is intercepted for local fixture delivery; other destinations
are blocked. Run with STUDIO_CLIENT_OUTPUT pointing to an empty repo-external
output folder and STUDIO_TEST_RUNTIME to the existing Miniflare/Playwright/esbuild
runtime. Without both, the normal test runner explicitly skips the integration.

Tests cover two-device round trip, offline/reconnect, CAS, two tabs, editing during
responses, ACK loss, profile reopen, tab termination after remote commit before ACK,
local/IDB partial success, orphan outbox discovery, Account switch/delayed response,
Pro/device/session/generation refusal, pending recovery, tombstones and invalid
chunk/manifest, large Unicode over 8MB and normal boot no Cloud writes. Tab
termination is not a physical-commit crash or power-loss simulation.

Remaining release gates: real session provider/registration UI and entitlement
operations; explicit Owner-authorized recovery/adoption; orphan/outbox retention
and deletion; quota/rate/abuse; raw writer exclusion; formal Studio additive DDL;
encrypted backup and independent actual restore; default-OFF bundle/deployment;
selected-Owner canary; Safari, real independent devices/networks and Studio UI/
performance acceptance. Shared0034–0037 is not required by this candidate.
Main/Pages/Production operations need separate approval. Shared Write OFF,
existing shared `canWrite=false`, v2 and PR33 protection HOLD remain in effect.
