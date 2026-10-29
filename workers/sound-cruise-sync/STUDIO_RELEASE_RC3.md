# Studio RC3: bounded upload batch and integrated acceptance

Scope: isolated candidate only; Production and general-release acceptance remain HOLD.

The authenticated upload-batch route accepts one operation, 1–4 unique chunk ordinals,
maximum 128 KiB each / 512 KiB raw total. Shape, bytes and digest are checked before
mutation. All inserts, exact collision checks, activity, terminal and final current
Account/device/Pro/epoch/schema/journal/quota assertions share the existing D1 batch.
Single upload delegates to the same implementation. Final commit still verifies the
complete manifest and enforces revision CAS, receipt, tombstone and adoption fences.
ACK binds operation ID, ordered ordinals and manifest digest. Client shrinks batches
until encoded JSON is <=900 KiB, preserving the existing 1 MiB HTTP ceiling. Durable
cursor advances only after an exact ACK. Failed ACK/local write remains UNKNOWN and
requires explicit current-Owner reconciliation; no unconditional resend.

Studio candidate 0.47.23; Port version unchanged. DDL is unchanged studio_0001_rc2,
42 objects, canonical SHA256
3201e91464eb9ee32e1aaf7a7f29738fde3c32b93d3687901c36bbb0da97544e.
Only exact shared0033 + fresh Studio installation is supported; shared0034–0037 are
not required. Do not apply RC1+RC2 SQL together or rerun after an unknown result.
Production entry/wrangler unchanged. Alternate entry returns 423 for Studio paths
without the unforgeable synthetic fixture capability. This is not production activation.

New native batch tests require STUDIO_TEST_OUTPUT and STUDIO_TEST_RUNTIME (existing
isolated Miniflare/esbuild package). Run test/studio-release-rc3.test.mjs. Release
Browser regression uses STUDIO_RC_BROWSER_ONLY=1 / STUDIO_CLIENT_OUTPUT through
studio-release-rc2.test.mjs. It injects a clearly synthetic retention policy, so the
retention inventory must report EXPLICIT_OWNER_OPERATION_ONLY; generic purge still
fails. Base session test without policy continues asserting HOLD_POLICY_UNAPPROVED.
ACK mismatch is rejected earlier than full-manifest commit; no-publication assertions
remain and backend full-manifest rejection tests are retained. Dropped-ACK harness
consumes the native Response before aborting transport, preventing teardown hangs.

Operational boundary: explicit current-Owner collection/discard can replace automatic
purge for a controlled canary, only with approved policy, operator coverage and deletion
SLA. UNKNOWN is never expired by a timer. Body collection preserves replay/recovery
metadata. Current retained manifests/receipts/proofs are not a completed finite-retention
policy: historical metadata and retention scope JSON grow, can exceed D1 row limits,
and require bounded admission plus an audited archival/retirement protocol before
unrestricted public release. Account erase needs immutable pre-deletion intent and
exact scope; unknown orphan / expired intent remains HOLD, never automatically deleted.

SQL authorization linearizes at final SQL assertion. Physical commit-time credential
validity is not guaranteed. D1/IndexedDB/R2 are not atomic. Old v137 direct/version URL,
override and external writers require proven exclusion before Studio activation.
Default-OFF alone does not prove that future activation or Scheduled rollout is safe.

Required remaining release gates: production activation/configuration and frontend
endpoint capability; bounded retained evidence/deletion administration; approved TTL,
retention/rate/quota/budget; real Safari; production-like CPU/memory/network load;
shared backend readback, quiescence, encrypted backup and actual isolated restore;
exact-source DDL/default-OFF rollout; limited-owner canary and two-device E2E; fresh
cross-owner Git scope/parent/tree gates and separately authorized Pages publication.
Do not merge/deploy/enable from this document or fixture PASS.
