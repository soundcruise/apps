# Renewal successor lifecycle — isolated contract v1

Studio 0.47.19 / Port 1.24.22 candidate, Project schema 2 unchanged.
Direct parent: PR #26 `e01c061a7c5fa2b26c5997ef580e38d0b3ceef61`.
This contract is fixture-only. Normal boot does not install any new component.
Shared Write remains OFF; `canWrite=false`, no normal writer, consumer cutover,
production Account route, Cloud connection or backend deployment is enabled.

## Three distinct permissions

1. **Credential Adoption** changes the existing canonical Account credential via
   the existing Account CAS/mutation receipt and durable Authority stop intent.
   A new opaque readonly-adoption context binds exact Account/member/device,
   source pointer/consumer, before/after Account hashes, recovered credential hash,
   operation UUID and immutable backup inventory. The normal writable `observe()`
   contract is unchanged. This narrow switch capability cannot detach/revoke an
   Account, change identity or write a consumer dataset. All stop flags survive.
2. **Historical reconcile** authenticates the current owner HMAC, credential
   expiry/revocation, Account/member/device generations, history permission and
   current app/Pro/writer credentials. It checks exact historical operation,
   envelope, dataset, digest, old credential/lease generation and receipt.
   Direct renewal lineage is verified against the trusted owner recovery binding
   and the exact begin/finish ledger digests; the begin fence means an old issued
   envelope lease revision is `binding.oldLease - 1`. Old verifier material stays
   private inside the owner. History never issues/extends/consumes a lease or
   grants current write authorization. Ordinary matching/save/current are unchanged.
3. **New operation Admission** requires the new typed readonly publication,
   exact successor owner registry completion, current credential and per-operation
   V3 lease. An adoption receipt or old success receipt grants no write authority.

## State transitions and atomicity

`renew → recover candidate → explicit readonly adoption → owner reauthorization
→ SQL successor stop → exact historical roster → local staged/sealed generation
→ atomic pointer+consumer publication → separate owner readonly confirmation
→ immutable completion pin → new V3 operation Admission → explicit Studio BPM save`.

The existing Authority IndexedDB publication transaction checks old pointer,
consumer, control epoch and typed history, then publishes pointer and consumer
registry together. Consumer epoch and pointer epoch increment monotonically.
It retains old generations, typed receipts, immutable pins, unknown setting fields
and history. It never transfers an old prepared operation or reactivates its lease.
The new generation stays readonly/suspended/fenceRevoked.

Account SQL, backend SQL, Account IndexedDB, Authority IndexedDB and backup DB are
independent. No cross-DB atomicity is claimed. SQL successor stop CAS increments
registry and device fence and retains the prior cutover row. Exact previous row
counters are checked by SQL itself. Backend completion and local completion pin
are separate durable facts; V3 Admission is held until both are proven.

## Partial outcomes and explicit recovery

- Pending initial/history/completion pins are strict typed immutable packets.
  Missing, altered or unknown fields and inventory drift stop recovery and Admission.
- `reconcile()` observes only; it does not resend stop, confirm, save or add pins.
- Explicit `recover()` can resume a proven SQL-stopped transition through local
  staging/publication and owner confirmation, or finish a proven publication.
  Stop is never blindly resent. A crash after the initial pin but before a proven
  SQL stop remains held; a separate exact cancel/restart decision is needed.
- ACK loss after stop or confirm is reconciled against exact persistent SQL rows.
  Local publication success is distinct from owner confirmation success.
- Account CAS success before stop-intent confirmation remains held under the
  existing adoption contract. It is not automatically completed or retried.
  ACK loss after confirmed adoption is proven by its exact current receipt.
- Backend success/local-unapplied is preserved and requires the existing explicit
  single-operation local recovery. No automatic SQL replay or cleanup occurs.
- Unknown result, pending backup, binary assets, expired/revoked permissions,
  CAS/ABA, lost key and unsupported history fail closed without deleting evidence.

## Deliberate initial limits and production gates

This version supports **one direct renewal from PR #26's completed original
CUTOVER_PUBLICATION**. A further renewal from the successor reauthorization birth,
distant renewal lineage, unknown prior generation, or changed app/Pro verifier
lineage is unsupported and stops. Consecutive BPM saves in the new generation
are supported; this is not a claim of unlimited renewal cycles.

The successor path is limited to the existing known-empty binary/Sync fixture
and single BPM dataset. Unapplied old history is not silently imported; it must
be explicitly resolved in the predecessor contract before successor publication.
No second Account, storage authority or Sync engine is created.

Production still requires owner route/migration and secret/clock rotation
operations, physical expiry-through-commit guarantees, real consumer/provider
cutover, same-origin raw-writer containment, binary/Cloud/multi-device recovery
and final admission acceptance under separate authorization. Fixture PASS does
not establish production save readiness. Safari, real IME/microphone/Pro/Cloud
and physical power-loss durability are not claimed.

## Acceptance evidence

Direct regression suite: `tests/successor-lifecycle.test.mjs`.
Local workerd/disposable D1: Worker `test/account-successor-workerd.mjs`.
Native Chrome IndexedDB/Web Locks: `tests/successor-browser.cjs`, served only by
`tests/successor-server.mjs` on an independently allocated loopback port.
The native fixture reuses Port owners and Studio's existing injected draft BPM
controller. Production `src/index.js`, configuration, migrations and normal boot
imports remain unchanged. Source hashes and raw reports are retained outside repo.
