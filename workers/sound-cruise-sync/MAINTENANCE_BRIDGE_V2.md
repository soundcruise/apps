Current additional27 lifecycle entries: [Account / Membership / Device contract](MAINTENANCE_ACCOUNT_DEVICE_LIFECYCLE.md). Inventory57 HTTP isolated,26 HTTP +1 Scheduled HOLD. Earlier counts/results below describe their historical stage. Full Bridge / Production HOLD.

Subsequent isolated membership/grant profiles: [MAINTENANCE_ACCOUNT_MEMBERSHIP](MAINTENANCE_ACCOUNT_MEMBERSHIP.md). The historical results below remain historical; Full Bridge / Production HOLD persists.

# Maintenance / Quiescence Bridge v2 — isolated candidate

Status: core + trusted BPM repository adapter accepted in isolation. **Full Bridge HOLD.**
No normal boot import, production HTTP dispatcher, scheduled handler, production binding, writer activation or Cloud connection is added.
Studio/Port assets and cache versions remain unchanged. This is an unpublished Worker candidate following the existing private 0.1.0 candidate convention.

## Schema and ownership

The candidate is schema0033 **plus** explicit maintenance metadata. It is not strict0033.
Three tables, one index, twelve triggers retain control, operation and transient assertion metadata.
The additional triggers compared with v1 bind control transitions to typed receipts, preserve pending/receipt fields and bind explicit recovery.
No Account FK cascade, inferred generation, dataset copy, secondary authentication issuer or Sync engine is introduced.

The SQL remains in schema-candidates/maintenance_bridge_v2.sql. It is not in migrations/.
Formal numbering is undecided. Do not rename/replace 0034-0037 or candidate0038, and do not apply a later numbered migration out of order as an implicit bootstrap.
A separate approved bootstrap/promotion contract must settle journal ordering before Production.
Current structural profiles accept the verified 0033 journal plus the exact optional0034-0037 sequence and this metadata; an extra journal name requires a reviewed profile update.
Unknown objects, changed SQL literals, missing triggers and partial metadata fail closed.

## Owner and request boundary

createIsolatedMaintenanceBridgeV2 requires a trusted existing owner verifier with a fixed owner id.
The verifier must validate current HMAC, Account/device/member/Pro rights and return SQL assertions binding the same identity and requested purpose.
An owner response alone is not the final save authorization: its assertions execute in the business D1 transaction.
The audit clock is not a credential clock or expiry authority.
The native tests use a synthetic owner + existing Account/member/device/Pro tables. They do not prove Production HMAC or full owner-route readiness.

Generic execute is an internal trusted-adapter API. Its outcome and callback are NOT client inputs.
maintenance-v2-bpm-adapter snapshots every operation/identity field, fixes the exact sync_changes + sync_records outcome, and reuses createD1SyncRepository.
It is not an HTTP endpoint or normal Port writer connection. The subsequent isolated Account/Pro adapter connects17 isolated HTTP entries. The historical84 index contains83 HTTP entries
plus one scheduled entry; remaining66 HTTP plus scheduled remain unconnected/HOLD.
MAINTENANCE_ENTRYPOINT_COVERAGE.json records this count correction and owner boundaries.
See MAINTENANCE_OWNER_HTTP_ISOLATED.md for that limited scope, existing-owner HMAC verification, recovery/revocation security lane and per-transaction outcomes. This does not connect the normal router.

## Stop, commit and receipt

A stop has a fixed UUID, request digest, scope, identity, expected epoch, durable typed receipt and control epoch CAS.
The operation receipt and control transition commit in one D1 batch. A zero-row CAS aborts.
Replaying the exact stop returns historical evidence, without incrementing epoch again.
A lost ACK is unknown to its caller until explicit readback. No automatic resubmission or rollback occurs.

Mutations register durably before execution and use owner assertions + epoch + operation binding immediately before the business statements in the same D1 batch.
The business sequence is uninterrupted; guard results are removed before returning repository results.
Only one mutation batch is supported per operation. The isolated Account/Pro adapter supplies separate typed child plans and retains a registered parent until HTTP completion; unprofiled multi-step owners remain HOLD.
run/first/all RETURNING are guarded; native statements, exec, session and DDL/PRAGMA/transaction control cannot escape.
Metadata SQL is not available through the protected binding.
A typed outcome and maintenance receipt commit atomically with business SQL. Historical success is not current authorization.

## Handover and opening

A stop receipt must precede handover. The owner must verify exact source/inventory and eight proof digests:
old ingress, old versions/override, scheduled, external writers, old in-flight, partial results, absent new claims and absent unknown results.
The core rejects an empty registry or fixed wait as sufficient evidence.
The current handover API accepts only an explicitly isolated evidence tag. It cannot issue a Production-ready handover.
Opening requires the exact retained handover + stop receipt chain and no unresolved operation.

The old v137/other direct writers do not participate. Closing this controller does not cancel or fence them.
Traffic/version/scheduled/admin exclusion and old partial-result reconciliation require separately approved Production evidence.
The empty-registry nonparticipant counterexample remains part of the tests.

## R2 and explicit recovery

externalIntent durably registers exact pending bytes/digest BEFORE the Asset owner may perform an external side effect.
Pending digest is part of the request and reaches owner verification. A different object/manifest cannot be substituted.
Participating external intents are exclusive within scope; they do not exclude old/raw/external writers.
This module does not delete/upload R2 or authorize deletion. No real cleanup consumer is implemented.
Source-manifest authenticity, object readback, other-owner references, unknown JSON, claims/reservations and immutable backup retention remain Asset-owner responsibilities.

Unknown external ACK retains the pending metadata. Explicit recovery has a new UUID, exact original request/identity/scope/pending, and an owner-verified typed result.
The recovery receipt and original row's resolved_by link commit together. The original pending evidence remains.
Recovery classifies a historical result; it never re-executes the original external action.
The tests' synthetic owner readback is not a Production recovery attestation.

## Acceptance and release boundary

The original native tests cover core, the trusted BPM adapter, schema classification, SQL races and orderly dispose/reopen.
The Account/Pro adapter adds its own HTTP/native restart/Browser evidence. Neither test set covers all route families, real cleanup, all Account/Pro endpoints, OS power loss, or the full stage-specific business matrix.
Do not label these results Full Bridge PASS.

No commit/push/PR until all required work and independent review pass.
No Production stop/migration/backup/deploy, main merge, Pages, canWrite activation, Shared Write or Cloud cutover is authorized by this candidate.

## Sync Owner isolated extension

Managed Sync dataset/device operations now reuse the same protected D1 transaction and typed child/root receipts. The native schema0037 writer dependency and Port removal-safety exclusion are explicit, not relaxed. See MAINTENANCE_SYNC_OWNER.md. The current route inventory adds the already-existing writer-authority GET previously absent from the historical83-HTTP list. Full Bridge, old-worker exclusion, Asset/R2, Scheduled, formal schema, backup/restore and Cloud cutover remain HOLD. Independent-clone scope acceptance does not release the adopted B+C v2 formal protection HOLD.
