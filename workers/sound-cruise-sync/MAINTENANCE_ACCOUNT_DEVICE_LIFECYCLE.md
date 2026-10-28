# Account / membership / device lifecycle — isolated Maintenance Owner

Direct parent PR #32 `0e993c31b35d36d4c8b023b841acc2fe0fc6be50`, tree `f72a6839b552e78ba375bf437757993fe77050de`. Dependency #26 → #27 → #28 → #29 → #30 → #31 → #32 → this topic. **Full Bridge / Production rollout HOLD.**

## Exact scope

27 additional concrete HTTP entries (9 route templates):

| Method | Path | Lane |
|---|---|---|
| POST | `/v2/accounts/devices/name` | writer |
| POST | `/v2/accounts/delete-intent` | security |
| DELETE | `/v2/accounts` | security |
| POST | `/v2/accounts/memberships/{app}/devices/name` | writer |
| POST | `/v2/accounts/memberships/{app}/devices/revoke` | security |
| POST | `/v2/accounts/memberships/{app}/detach` | security |
| POST | `/v2/accounts/memberships/{app}/delete-intent` | security |
| DELETE | `/v2/accounts/memberships/{app}` | security |
| POST | `/v2/accounts/memberships/{app}/delete/cancel` | writer |

`{app}` is exactly chord, pitch, fretboard or rhythm, never port or caller-selected arbitrary app. Account-wide deletion nevertheless includes its Port membership. Existing30 routes are reused, not counted again. Inventory now57 isolated HTTP,26 HTTP +1 Scheduled HOLD (83 HTTP +1 Scheduled total). Counts are not a release percentage.

No new Account-wide cancellation or intent-cancel endpoint is invented. Existing app `delete/cancel` restores an already logically deleted membership and canonical user during its grace period; it is not cancellation of an unconsumed intent. A cancelled/expired intent, including a concurrent Owner cancellation, cannot be committed. A consumed intent cannot be reused after membership restoration. Account deletion has no restoration route in this scope. Deleted membership reprepare, QA and legacy/dual migration modes remain HOLD.

## Existing Owner and transaction

The original Account handler, validators, HMAC, origin, rate limit, public app allowlist, repository and business SQL are unchanged. Only the isolated factory imports the new Owner profile. Normal boot/router, Worker configuration, migrations, Studio/Port assets and cache values are unchanged (Studio0.47.20, Port1.24.23, schema2, private Worker0.1.0 candidate convention).

DELETE uses the same bounded JSON, content type, exact operation UUID and keyed method/path/body/Authorization fingerprint as POST. Native rename bodies retain their original schema; the Bridge operation UUID is the header. A display label is never identity. Source-owned mutation table sequences reject unclassified SQL; no public raw-SQL adapter exists.

Account HMAC identity, recovery/device version, current generation, runtime control and Maintenance epoch are checked in the business D1 transaction. A bounded relationship projection pins all scoped members/users/devices/links/managed-user mappings/dataset state/grant cancellation state. Reverse references reject foreign or missing Account/member/user/App-device/Account-device relationships. Unlinked devices on canonical managed users and legacy/dual graphs are HOLD, not silently repaired. Graphs over64KiB per projection or256KiB total are HOLD. Activity timestamps are excluded. Snapshot parameters remain in memory; no raw credential/verifier or graph payload is written to Bridge receipts.

All captured generations and device credential versions must be positive safe integers. Incremented Account/member counters must also remain safe integers. Unknown/fractional/overflow counters are not normalized. A legitimate active membership with no initialized dataset is not globally rejected: ready dataset is required only for the native detach and deletion-cancel targets.

Same-transaction postconditions prove the complete expected state transition and exact lifecycle record, intent consumption, generation and revocations. A zero-row update cannot commit partial business state or a success receipt. The pre- and post-fence use the D1 SQL clock for intent and grace deadlines. This SQL assertion is the isolated linearization boundary; no new physical-commit expiry or cross-D1/R2 atomicity guarantee is claimed.

## Deletion, revocation and restoration

- Intent issuance records a scoped HMAC proof, requesting device and Account generation. It does not delete data or grant writer permission.
- App deletion marks membership/user deleting, records existing grace/purge dates, advances Account/member generation, revokes linked App devices and cancels eligible grants. Account-device credentials remain subject to their original Owner policy.
- Account deletion marks active members deleting and pending members deleted, revokes Account/App devices and cancels the original Owner's eligible pending grants. Already revoked credentials remain revoked. It is logical deletion, not physical purge.
- Detach advances Account/member generations and revokes all target membership App devices. One-App-device revoke advances Account generation and preserves the linked Account-device credential. No ownership transfer/unlink API is invented.
- App deletion cancel restores membership and canonical user, advancing both generations, but never clears device revocation. It requires writer scope open. New Join preparation/consumption remains the prior writer-gated Owner route.
- Rename is writer management. Intent/delete/revoke/detach use the separately open security lane. A writer stop does not silently open security; both scopes retain independent durable controls.

Business commit and typed child receipt are atomic in native D1. HTTP root completion is a separate transaction. ACK loss may leave committed business facts with an incomplete root: return unknown, preserve evidence and require explicit reconcile. Same UUID replay never reruns the handler. After self-deletion, exact original credential/request binding may read historical facts; this is not current authorization. Account mutation/lifecycle records and Bridge receipts remain distinct.

## Retention / purge / external boundaries

No physical DELETE, R2 call, scheduled invocation, backup deletion, pending resolution or cleanup consumer is added. Existing Bridge metadata has no Account FK cascade. Account logical deletion preserves unresolved Bridge operations and receipts. The native test retains R2 sentinel bytes and dataset rows; it does not prove real cleanup safety or R2/D1 atomic recovery.

Scheduled retention, R2 asset/reference authenticity, unknown JSON/reference, legacy NULL generation, cleanup claims/reservations, real backup retention and partial-result reconciliation remain separate Owner gates. Old v137 R2-delete-before-D1 behavior is unresolved; this adapter does not fence nonparticipants, administrators, raw same-origin writers or old deployments. Do not resume old cleanup or roll back to v137 after new claims on this evidence.

## Tests and remaining release path

Run `scripts/maintenance-account-device-native.mjs` only with explicit disposable evidence/runtime paths. `MAINTENANCE_DEVICE_BROWSER=true` adds actual Chrome CORS/DELETE/history and normal Studio no-write checks. Native workerd/D1/R2 data are synthetic. Reopen is orderly runtime dispose/reopen, not an OS power-loss attestation. Concurrent requests share native D1; real multi-device Cloud is untested.

Current evidence records exact run identities and failure development logs separately. Prior30-route native regressions, targeted existing Owner Node tests and Studio cache/readonly tests are required; unchanged core evidence is historical only. Review findings must be resolved before commit/push/Draft PR.

Next combined implementation unit: remaining Sync/Asset Owner write admission and cleanup claim/external-intent/readback recovery, preserving migration/journal profiles and unknown references. Plan common transaction boundaries together; keep physical deletion disabled until source manifest/backup/readback, old ingress exclusion and first handover/drain are proven. QA/legacy migration may require distinct profiles. Production bootstrap/schema promotion, encrypted backup/restore, external/admin/old-version exclusion, consumer cutover and full Cloud/device acceptance remain separate approvals and release gates.
