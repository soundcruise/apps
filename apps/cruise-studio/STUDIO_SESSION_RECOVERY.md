# Studio Session / Owner recovery candidate — default OFF

Direct dependency PR45. Studio patch candidate 0.47.22, schema2 unchanged.
Normal Studio boot, Production entry/config, Account/Pro implementation, Port and
four-app sources are unchanged. This is an isolated product-integration candidate,
not activation, migration, backup/restore or Production retention acceptance.

## Native Session and credentials

`studio-session-adapter.mjs` reuses the existing browser
`SoundCruiseProDeviceSession.createClient`, nonextractable P-256 key, native Pro
challenge/MAC/signature/renew endpoints, native Account credentials/recovery and
the Studio Owner. It does not implement another authentication engine. Session
refresh requires a successful online native proof; offline/cache allowance alone
cannot authorize Cloud. Bound lease/idle/generation/revocation are rechecked by
Backend. Device binding protects renewal; it does not invent per-request
signatures beyond the shared Pro contract.

After proof, the Owner's guarded session query returns the actual Account/device,
recovery/credential/Pro generation and epoch. Client Account/device IDs are not
accepted as alternate authority. Session metadata matches the authenticated
credentials and public device key. `validUntil` comes from native Pro lease,
not a reader freshness timeout. Account0033 has state/revocation/generation checks,
not a fabricated independent Account expiry. Raw credentials stay in memory and
are never written to Outbox, receipt or test logs. Existing host credential/key
backup and native Pro reauthentication remain their owners' responsibility.

`register` uses the accepted Studio-only registration/Turnstile contract and
creates no unrelated app membership. Existing Accounts can enroll. Device addition
and Studio enrollment revocation call the existing Studio Owner paths; Studio
revocation preserves the shared Account device credential. Regular credential
selection remains explicit `setCredentials`; switching invalidates in-flight local
observations before responses arrive. Existing Client checks session at each
request/response and inside the local Project write lock.

## Native recovery and enrollment

`recoverAccount` invokes the unchanged Account recovery prepare/commit endpoints.
The real native repository checks SAR1 recovery verifier, claim, next verifier,
operation fingerprint, CAS and final Account generation; it revokes old devices
and creates a new device using its established contract. No lost key/device is
silently revived. An unavailable recovery code or Pro reauthentication capability
fails closed. Synthetic tests generate credentials; no real user/password/Pro
qualification is used.

`recover-enrollment` requires the committed native Account lifecycle operation and
claim: kind recovery, Account, target/new device, result body, expected generation
and recovery version all match the current authenticated Owner. These assertions
are repeated in the same D1 batch as Studio enrollment. A revoked Studio
enrollment is not silently reset. Recovery ACK loss is reconciled with the SAME
native commit operation/fingerprint; no new recovery identity is generated.

Registration/device identity-history across Pro credential rotation uses CURRENT
Account/Pro authorization and exact operation/target identity. It returns historical
facts and current device status, not an old credential grant or a substitute for
original request digest verification.

Native proof/claim availability is required for recovery-based adoption. If native
Scheduled retention has removed the necessary proof, that adoption remains HOLD
until a fresh official Owner recovery/re-authorization proof is available. Past
claims are not fabricated. Production proof-lineage retention must be coordinated
with pending retention before enablement. Native Account recovery follows existing
shared semantics, including revocation of that Account's linked app devices;
Studio does not introduce a different recovery/revocation engine or execute it on
Production in this task.

## Explicit pending adoption

Original pending, binding, digest, chunks and receipt are immutable and retained.
`adopt` requires exact source Account/op/document/digest and a new operation UUID.
A renewed Pro qualification on the SAME Account/device/recovery/credential
generation uses current Owner proof. Different identity/generation requires the
committed native recovery proof above. A native proof for another Account or
wrong current generation/device cannot be reused.

If the source already committed, adoption returns current-authorized historical
save success (`authorizesNewOperation:false`) and creates no replacement save.
Otherwise one D1 batch rechecks no source receipt, source digest, native proof,
current Owner, quota and exact schema; copies immutable pending/chunks into the
new binding; and records a typed adoption receipt/event unique to the source.
Original commit also asserts no adoption event in its business transaction.
Thus commit/adoption races either observe committed success, adopt and reject the
old commit, or remain UNKNOWN until explicit same-op reconciliation. There is no
independent-DB atomicity assumption, automatic rollback or blanket resend.

Client persists ADOPTION_UNKNOWN with the exact new UUID before sending. It
validates the complete adoption receipt, stores the new Outbox, links it and
retains original source as ADOPTED. Partial IDB progress can replay the SAME
adoption and converge. Duplicate requests cannot create two copies; changed
binding/request/proof/target is refused.

For an additional native recovery after adoption ACK loss, current-authorized
`adoption-history` reconstructs the event against source and adopted pending and
all digests. `recoverAdoption` restores that historical adopted operation only as
PENDING_RECOVERY, never as present permission. A new current native proof can then
explicitly adopt that intermediate pending using a different operation. Tests
cover g2 adoption ACK loss followed by g3 recovery/ACK loss and chained adoption.
Immutable owner events, pending, chunks and original digests are preserved.

Adoption does NOT invent missing local content. If only some chunks survived and
the local draft/Outbox was also lost, neither a recovery code nor an ownership
receipt reconstructs missing bytes. A new device can read committed snapshots;
missing pending bytes need an explicit trusted backup/import path. Otherwise HOLD.
Account deletion is not undone by a stale receipt or old recovery code.

## Capacity and abuse

All HTTP endpoints fail closed without explicitly configured trusted capacity.
The constructor accepts document count, retained-operation count and logical UTF-8
chunk bytes; no request can raise these limits. The minimum allowed byte envelope
is twice the existing24MiB transport envelope so a valid schema2 document and its
adoption copy can fit in an empty Account. Existing schema2 validation is not
reduced. Native D1 checks limits after each guarded batch so races/exhaustion roll
back the attempted write. Exact duplicate chunks do not add storage.

The integration fixture uses100 document IDs,200 retained reservations and128MiB
logical chunk bytes per Account. The exhaustion fixture uses1/1/48MiB. These are
TEST CONFIGURATIONS, not approved Production quotas or prices. Counts include
history/pending/tombstones, not just current heads. Logical bytes exclude SQLite,
metadata/index, backup and billing overhead. Adoption copies consume additional
capacity. Operations stop safely at quota; pending is not auto-purged to make room.
The existing request/registration and native Pro/Account rate bindings are reused;
HTTP rate refusal is tested. Real binding configuration and global/account
admission cost ceilings are release gates. No Cloudflare price quote was inferred.

## Retention, deletion and orphan data

No FK to shared Account is added. Existing deletion is not blocked by Studio and
does not cascade unresolved Studio pending/receipt/adoption events. Native deletion
or purge makes credentials unusable, and current authorization cannot read orphan
content. The new inventory returns only current-Owner counts/logical bytes and
explicit physical-purge HOLD. Deleting a synthetic Account row preserves pending,
receipts and adoption events; this is not authorization for indefinite retention.

Classification:
- live document/current version: owned by current Account, ordinary read/CAS;
- pending/UNKNOWN/upload/adoption: retain original bytes and operation history;
- tombstone/save/adoption receipt/high-water: retain anti-replay/causality evidence;
- deleting/deleted/missing Account: inaccessible quarantine, no reassignment;
- local Outbox: keep snapshots/UNKNOWN/receipts across reopen; no automatic purge.

Production retention duration, backup retention, deletion notices/consent, orphan
recovery roles and physical-purge policy are NOT approved. `purge` explicitly
refuses with retention-policy-unapproved. This is a product/operations BLOCKER,
not a technical defect hidden by fixture PASS. Before physical deletion, an
approved policy must identify terminal versus uncertain operations, audit/receipt
and fence high-water retention, exclusion of active Account B, restore/backup
handling, atomic scope and readback. Existing privacy/deletion obligations require
that policy; no indefinite-retention policy is adopted here.

## Local data, UI and transport

Project remains existing localStorage/Web Locks/raw CAS; IDB is transfer Outbox.
Session/registration/recovery helpers are explicit isolated host APIs, not new
normal UI. SDK states distinguish local saved, queued, uploading, confirmed,
conflict, UNKNOWN, pending/adoption recovery, invalid qualification and tombstone.
Remote responses never automatically remove local drafts. Production hostname
is rejected, redirects/cookies are disabled, and normal boot does not connect.
Shared Write OFF and existing shared canWrite=false are unchanged. Local
repository.canWrite still means existing local save ability.

## Verification and release

New integration file uses native workerd/D1, real native Account/Pro HTTP handlers,
actual browser P-256 signatures and disposable Chrome profiles. Turnstile/anti-abuse
and initial Pro entitlement issuance are synthetic; no Production qualification is
obtained. It includes the previous Client data-flow regressions because the Client,
schema and guards changed, and separately reports new Session/Owner cases. Past
saved PASS is not added. Native core regressions keep their assertions unchanged.
The direct quota-reservation test uses a rejecting validator and never commits an
invalid Project. Client E2E uses the unchanged actual Studio validator throughout.

Before release: approve retention/global quotas; accept actual credential/key
backup/reauth UX and missing-content recovery; finalize additive Studio DDL and
migration marker; qualify old-v137/Port compatibility, encrypted backup and
independent restore; assemble/review default-OFF Worker and isolated UI; separately
approve deployment/canary; test Safari/real devices/networks and Studio UI/performance.
Shared Sync0034–0037 and old Studio Cloud migration are not unconditional prerequisites.
SQL assertion→physical commit expiry, power loss, local/D1 atomicity and Production
configuration remain outside fixture guarantees. v2/PR33 formal protection HOLD,
NEWS/root/originals and existing Production settings are not changed.
