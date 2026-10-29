# Isolated default-OFF compatible Worker / initial handover

This candidate is based on PR #40. It assembles existing native Account/Pro/Sync, Maintenance Bridge v2, Chord migration, Asset pending/recovery, and limited Retention Owners. It is not deployed, not Full Bridge acceptance, and not a Production handover receipt.

## Entry and authentication

`src/maintenance-compatible-entry.js` is an alternate public entry. Existing `src/index.js` and `wrangler.jsonc` are unchanged. It calls the current `handleRequest` implementation, not the reconstructed deployed v137 bundle. v137 is used only as the exact-byte old participant in native tests (source `2a6aec9ee8e41c54425f62eaa3f7831c1340c09d`, bundle SHA256 `9d880d845b22d7905a5fe5be5b453f074ee28956ce2044ac769c9ee726bbe0b5`). This does not identify the historical deployer or original CLI invocation.

The two optional `app.js` dependency hooks default to the existing native functions; the Production entry supplies neither hook. Only trusted candidate code supplies a strict schema0033 admission/database pair. Neither JSON, headers, query nor environment flags can supply functions or fabricate the WeakMap-branded private capability. Native Origin, rate, HMAC, device/account/member/revocation, Pro and payload checks remain in the original router/repositories. No second authentication issuer or data source is created.

Pure0033 cannot read writer-protocol columns added in0034. Its compatibility adapter accepts only genuinely legacy protocol-less callers, existing native Device verifier and read-only managed identity/standalone proof; newer protocol-bearing callers HOLD rather than receive invented epochs. Identity, native Pro, runtime control/generation and all runtime flags are asserted again with the actual business SQL. Schema/journal exact assertions run before AND after native batch statements in the same D1 transaction. A schema transition or permission/runtime change cannot silently authorize a stale mutation. Zero-row/failure behavior remains the native repository's fail-closed contract.

## Schema/entry matrix

| Schema | Public entry | Private capability | Scheduled |
| --- | --- | --- | --- |
| Exact0033, no Maintenance metadata | Current native Account/Pro/legacy router; strict legacy save admission; R2 mutation HOLD | HOLD (metadata required) | HOLD |
| Exact0033 + exact Maintenance metadata | Explicit public maintenance423 | Stop/evidence/handover and qualified Account/Pro subset | HOLD |
| Exact0034/0035/0036 + metadata | Explicit public maintenance423 | Account/Pro subset; Sync writer HOLD | HOLD |
| Exact0037 + metadata | Explicit public maintenance423 | Existing qualified Account/Sync/Chord/Asset/Retention subsets under per-operation service + Owner proof | HOLD |
| Partial/unknown schema or journal, Owner candidate schema |503 | HOLD | HOLD |

This is an explicit **client write/read maintenance interval** after metadata installation, not uninterrupted compatibility across0034–0037. Successful samples do not qualify every legacy route/payload. Legacy7/old Chord native pure0033 paths are preserved, while the private isolated release profile retains the prior refusal policy. QA/legacy native authentication is not bypassed. Closing Production clients requires a separate maintenance-window/compatibility decision.

Public Owner candidate/internal routes stay404. Private methods exist only in the imported factory; the alternate public entry never constructs or exports a capability. A service verifier must bind purpose, complete URL/query, method, keyed all-header/body/payload digest, exact current schema/journal digest and fixture identity. Every private mutation retains the captured schema guard. No Production verifier, scheduler identity or secret binding is supplied. The external exclusion window must remain effective through SQL commit/readback; a verifier callback alone does not make platform changes atomic with D1.

## Claims, partial success and recovery

New claim/reservation/cutover and old cleanup are never enabled by a public flag. Asset cleanup additionally needs an explicit trusted `enableAssetJobs`, current native Account/App/Pro proof, ready schema1 dataset and no cutover. A new physical deletion is limited to exact legacy authority protocol0/epoch1; bare paused/prepared/enforced authority is not permission. Dataset/runtime/schema/authority and exact asset row are checked in final SQL. Other authority modes require a later explicit contract.

R2 deletion and D1 lifecycle updates are non-atomic. Existing permanent reservation and immutable external-pending data are retained. Timeout or ACK loss is not inferred success. Explicit recovery binds original external epoch/operation and a current stopped scope. A verified committed recovery receipt can subsequently be read historically without R2 deletion or SQL replay. Wrong Account, operation, object/version/digest or resolution identity is refused. Dataset stop or missing credentials can still block reconciliation; such pending states remain HOLD, not auto-cleared.

The old exact v137 can delete R2 before its D1 update fails under0036. Metadata/HEAD observation detects an unattributed inconsistency; it cannot infer the deleter or repair bytes. Native tests deliberately retain this state over reopen. No claim is permitted merely because the new registry is empty. After metadata/history/new claims, returning to v137 is HOLD; `assessLegacyRollback` is advisory and explicitly `deploymentEnforced:false`.

## Initial handover proof

The evidence adapter consumes explicit trusted window/receipt/restore verifiers. Required exclusions: old HTTP, versions/override/service invocation, Scheduled, external writers, old in-flight, partial results, new claims and unknown results. All receipts bind exact window/revision, Account/scope, schema, source and inventory digest. It re-observes the sealed window and rejects changes/expiry. The fixture tracks only known local invocations; it cannot enumerate historical Production v137 requests.

The integration tests start the byte-pinned v137 in native workerd, observe a noncooperating in-flight old write after a new Bridge stop, close each known invocation channel, then qualify the synthetic handover. Tests also reopen an old version path and show its write still bypasses new fencing. Thus zero traffic weight, empty registry and elapsed time are insufficient evidence.

Synthetic backup is captured by sequential D1/R2 reads under the known fixture window; it is not a generally atomic cross-store snapshot under concurrent writers. It is AES-GCM encrypted, read back, restored into another native D1/R2, and compared by exact schema/journal/all-row data and R2 bytes/metadata plus active asset content hashes. Keys are nonextractable **same-process fixture keys**. This is neither a Production backup nor durable key custody/crash-key recovery. Restore preserves triggers, constraints and pending/receipt data; it must use dependency ordering rather than disabling protection. Production full restore, RPO/RTO, partial asset quarantine and other-Owner concurrent updates remain separate gates.

## Production transition (not executed)

1. Establish authorized execution window, exact deployment/version/routes/bindings and all writer/scheduler/admin actors; do not infer current Production configuration from repository defaults.
2. Exclude old HTTP, workers.dev, version URLs, override paths and service callers, stop old Scheduled starts, and prove or quarantine in-flight/unknown effects. Remove old versions from the active deployment: an override may target an active version at0% traffic. Retain unknown operations; do not auto-retry/rollback.
3. Verify D1/R2 consistency, obtain approved encrypted backup with separately durable keys, and accept an independent restore before first schema change. No Production data were read here.
4. Promote and apply the separately reviewed Maintenance and0034–0037 migrations with exact journal/profile readback, one approved stage at a time. Partial schema/ACK loss stops execution; do not replay DDL blindly. Maintain public maintenance interval.
5. Promote the alternate candidate with explicit config/service identity review, deploy default OFF only after approval, then read back actual entry/bindings, owner routes closed, old invocations excluded and no cleanup/new claims.
6. Complete Owner candidate schema profile/promotion and trusted Production service/exclusion-provider contract. Current factory supports fixture-only capability; it cannot be enabled by merely changing an env flag.
7. Read-only observation, Owner-limited canary, explicit reconciliation/reopen/repeated renewal and multi-tab/device E2E follow separate approvals; then normal consumer/writer activation, Studio final acceptance and simultaneous release approval.

Never combine these approvals. Worker rollback cannot restore deleted R2 bytes, D1 restore can discard normal Account B/other-owner changes, and new reservation/history rules may make an old Worker unsafe. Prefer stopped explicit forward recovery; no automatic revert, oldcleanup restart or whole-DB restore.

D1 batch transaction guarantee: https://developers.cloudflare.com/d1/worker-api/d1-database/
Version override limits: https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/
Version URL configuration: https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/

## Acceptance and retained boundaries

Run `scripts/maintenance-compatible-native.mjs` with the explicit existing local runtime package and byte-pinned reconstructed v137. Test-only `test/maintenance-compatible-worker-entry.js` is not a deployable service entry. Native synthetic Account/Pro credentials and a locally answered exact Turnstile URL are used; no real credentials. Run the affected existing Owner native and Browser no-write regression without changing their assertions/timeouts.

This task changes neither published Studio/Port assets nor normal Worker deployment configuration/migrations. No public app version/cache bump is needed for an unpublished alternate Worker adapter and tests; Studio remains0.x and Project schema2. Exact-scope independent-clone Gate is not formal B+C v2 PASS. PR #33 formal Git HOLD, Full Bridge/Production HOLD, Shared Write OFF, canWrite=false and normal Cloud/consumer disconnection remain unchanged.
