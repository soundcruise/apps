# Account-only / Chord compatibility and first isolated handover

PR39 dependent. Explicit factories only; no normal router/index/config/migration/public
asset/version change. Shared Write OFF, canWrite=false, ordinary consumer/writer/Cloud
not enabled. Adopted v2/PR33 protection HOLD and Full Bridge/Production rollout HOLD remain.

## State classification and original source

| Existing state | Source / identity | Isolated disposition |
|---|---|---|
| Legacy Sync only | Existing Sync user, device HMAC, recovery version, dataset/records/changes | No Account identity is invented. Account proof + existing pending Chord membership must be explicitly provisioned by existing Account Owner before migration. |
| Account-only | Current Account/device HMAC, native generation/recovery/control | Typed readiness observation only; not production Owner adoption. |
| Account + Port | Existing managed Port user/source plus Account graph | Handover manifest includes Port and all active member datasets, never just Chord. |
| Bridge prepared | Existing Chord user/source, pending member, bridge generation1 | Native repository prepare with final SQL Owner/Pro/source/CAS guard. |
| Dual | SAME Chord sync_user_id attached to Account member; recovery_mode dual | No record copy or second Sync source. Conflict/changed source during a transition rejects the complete transaction. |
| Finalized | SAME user/source, Account recovery; native old recovery verifier retired | This factory also revokes all pre-finalize active Chord devices in the same transaction, using the existing Device repository statements. Explicit Account join provisions a successor device. |
| Prepared/Dual rollback | Existing repository's explicit rollback only | Data source unchanged; generations advance rather than revert. No automatic rollback. |
| Imported pre-existing finalized bridge | Native historical state may still have active legacy devices | Observation only until pre-cutover legacy device inventory/receipt is proven; do not guess which current devices are old or indiscriminately revoke newer devices. |
| New Owner adoption pending | Formal backend/consumer admission is not provided here | Handover/readiness/migration receipt is not current save authorization. |
| Pro missing/expired; device/gen mismatch; partial/recovery/unknown | Current native verifier, positive safe counters, exact graph | HOLD. No generation/identity/data backfill or credential revival. |

`inspect()` rejects unknown/unsafe bridge counters, mismatched member/recovery state,
and foreign managed source mapping. Native Account/Pro proof remains mandatory. It
is not a public Legacy-only data inspection endpoint. Future identities are not inferred.

## Necessary compatibility paths, not13 public reconnections

- Existing Legacy start/pair/recovery/delete7: B (transition period and source/recovery
  preservation). Existing users may still call them; production closure is unapproved.
- Chord prepare/Dual/Finalize/Rollback and state5: necessary A/B/C migration capability,
  supplied by the private migration factory reusing the native Bridge repository. Public
  paths remain refused in the Account-only isolated release candidate.
- QA enrollment: D, isolated QA fixture retained; production candidate403.
- Unknown old usage/source/legacy device provenance: E/HOLD. Do not close old clients
  merely because the new isolated candidate returns423/403.

Current request/device/Pro credentials do not become an issuer. Existing Account
membership creation and App join/reconnect owners are reused; no new storage/auth
engine or principal is created by the factory. A successful isolated transition does
not authorize deployment, real client cutover, normal saving or Cloud connection.

## Migration transaction and preservation

The factory delegates prepare, commitDual, finalize and rollback to the existing
`createD1ChordAccountBridgeRepository`. Reads use source-owned SQL; its write plan
is accepted only in one wrapped D1 batch. Required statement changes are asserted
INSIDE the transaction, including all Dual statements and Finalize's required rows.
The old native recovery-attempt DELETE is replaced with a retained observation;
old proof rows are not removed just to complete migration.

Final guards bind current Account HMAC/device/recovery/generation/control, authenticated
App verifier/version/revocation/user recovery state, independent native Pro generation
and SQL expiry, runtime write/read admission, member/bridge graph, and exact raw
source projections, including global sync-user managed mapping and a final SQL precutover managed-mapping absence assertion. Dataset must be ready/known Chord schema1. Uncancelled recovery
or unconsumed delete intents remain HOLD even if their wall-clock deadline passed.
Unknown or related pending and Asset reservations block transition. Unknown metadata
and post-transition generation ceilings fail closed.

Source digest is an exact raw dataset/records/changes/revision preservation proof,
not a claim that every legacy payload_hash was recomputed or all domain fields/images
are semantically valid. No guessed data conversion. Each native projection is limited
to512 KiB; larger sources HOLD rather than truncate. Large-source migration/performance
needs separate acceptance.

Finalize appends the existing Device repository's revoke/cancel-code statements to the
same batch and checks that no old active Chord device remains. Source records are
unchanged. These old credentials fail the existing device authenticator. Native Port
writer fences alone do NOT protect Chord: they return early for non-Port apps. Old
v137 in-flight operations still require exclusion; revocation is not retroactive proof.

Stable Account/device/App identity is separated from mutable pre/post generations in
operation action/receipt. Same UUID never reexecutes. ACK loss may be reconciled by
exact native business ledger plus verified Maintenance receipt; no success guess.
`reconcile` returns historical facts only. Registered receipt/pending-free mutation
may be explicitly operation-fenced; external/committed facts cannot be cleared.
The original request fingerprint and current Pro/Account proof are required: lost App
credential or expired/rotated Pro can leave this API HOLD. General credential-loss
recovery is not completed here. Pending/receipts/source remain preserved.

## Initial handover

Default control starts closed. Existing core stop/handover/open is reused. Handover
requires a trusted explicit `verifyEvidence` provider plus typed isolated evidence:
old HTTP, version URL/override, Scheduled, external writer, in-flight, partial-result,
new-claim, unknown-result exclusions; current inventory/source/schema/journal binding;
encrypted backup and actual restore certificate; valid evidence deadline.

Inventory includes Account Bridge ledgers, membership/device links and every target device; ledger-only changes also invalidate restore evidence. Native recovery/delete pending and all six Account recovery/rotation/delete/handoff/app-join/Port-join pending grant tables are preserved and HOLD, including expired but unresolved entries; both pre-observation and final SQL assertions enforce this per Account.
Inventory member targets and final guards derive from the SAME captured encoded
projection. All active member sources and explicitly authenticated legacy Chord source
are included, with exact current Account/member/app/user managed ownership or Dual-without-managed-map and ready active user guards. Extraneous or mismatched managed mappings HOLD. Schema
and journal digest/guards derive from the SAME encoded observations. Known-profile
migration during admission is rejected, not silently accepted as compatible.
Target/unknown-owner pending, any target Asset claim/reservation/cutover, stale source,
missing/expired/forged evidence, absent verifier or missing restore certificate HOLD.
Open requires the SAME proof digest bound to the stored handover receipt; a new proof
cannot reuse an old handover ID. Changes require new stop/handover. Epoch ceilings HOLD.

The native fixture encrypts synthetic D1 rows using AES-GCM, reads ciphertext back,
decrypts and restores all application tables plus Maintenance operations/pending/
receipts. Control epoch history is reconstructed using verified transition receipts,
then every row and schema/source digest is compared in another native D1. Cloudflare
internal `_cf_*` tables are excluded. Fixture key exists only in process memory:
durable custody, key loss/rotation, another-process restore and production backup
operations are not established. R2 backup/restore is not claimed by this D1 trial.

Actual Worker old-service stand-in tests admission withdrawal plus an explicit
in-flight completion; proof is refused during in-flight and after barrier revision.
It is NOT a full replay of v137 SQL/R2 behavior or retrospective enumeration of all
old actions. Production evidence/provider/ingress enforcement is still absent.
Keep exclusions in force through migration. Registry empty or fixed wait is not drain.
SQL assertion is the D1 authorization boundary; no expiry guarantee at physical commit
or atomicity across D1/R2/clients is claimed.

## Schema and rollout

Chord prepare/source preservation is tested at0033 + exact Maintenance metadata and
0034/35/36/37. Full Dual/Finalize/rollback/successor join/save is directly tested at0037.
Owner candidate schema is exact-profile HOLD, no formal migration number/order chosen.
Existing71 HTTP adapters and PR38 Asset/PR39 retention remain unchanged. Index84+1
remains71 connected,13 refused/migration HOLD, Scheduled PARTIAL. Private alternatives
are not counted as new public HTTP connections.

1. Prepare compatible worker and current exact inventory; define old ingress/version/
   override/Scheduled/manual SQL exclusion and in-flight/partial detection externally.
2. Under a separately approved window, exclude old writers/cleanup, stop new claims;
   retain unknowns, prove drain within known coverage (never infer historic completeness).
3. Approved encrypted backup/key custody and actual isolated restore of D1 + ledger +
   R2 reference/objects; schema/journal readback and restore failure stop conditions.
4. Formal0034→0037 migration promotion/readback and Owner schema promotion only after
   exact production preflight/backup acceptance; no blind SQL rerun on lost ACK.
5. Default-OFF compatible Worker deployment, no old v137 rollback after new claims/
   generations. No D1-wide restore that discards normal B/other-owner later writes.
6. Owner route/service authorization, lease/fencing/clock/TTL/rotation/Pro operations;
   explicit per-user migration and successor admission, then Owner-only BPM canary.
7. Normal consumer/writer and Cloud multi-device E2E with partial/reopen/recovery,
   together with Studio functional/performance/OS/Safari/audio final acceptance.

Only isolated preparation is authorized here. Each real stop/backup/restore/migration/
deploy/canary/cutover is a separate approval. The next engineering unit should assemble
these private Owner factories into a default-OFF candidate with a real evidence/service
authorization adapter, not repeat the design audit or increment endpoint counts.
