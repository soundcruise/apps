# Studio + Cloud Sync Release Candidate 1

This is an isolated implementation candidate, not a Production rollout approval. Base is PR #49 (`5025f73fcc3763240a4e7b57bb60cffa12ad0390`). The current router, Wrangler configuration, public Studio boot, Client endpoint allowlist, shared migrations and existing Port/4-app authentication/storage are unchanged. Studio stays 0.47.22 / Project schema 2. No frontend/version/cache asset changed.

## Release boundaries

- `studio-release-entry.js` is a separate build entry; no configuration selects it automatically.
- Non-Studio HTTP calls delegate to the exact v137 bundle (`studio-legacy-v137.mjs`, SHA256 `9d880d845b22d7905a5fe5be5b453f074ee28956ce2044ac769c9ee726bbe0b5`). Its recorded source commit is `2a6aec9ee8e41c54425f62eaa3f7831c1340c09d`. This reuses the previously verified artifact; it does not assert a new live Production observation.
- `/v2/studio/*` and `/isolated/studio/*` return `423 studio_off` in the exported entry, independently of headers, query parameters, env flags, absent/partial Studio schema. No request installs schema.
- A process-local fixture capability can instantiate the accepted Owner for synthetic testing. It is not a remotely supplied credential. Production activation code is intentionally absent and requires a separate reviewed candidate.
- Existing shared Account/Pro validation, D1 transaction engine and schema2 validator remain authoritative. No second Sync engine or identity store is created.
- Public Client still rejects arbitrary Production endpoints; normal boot imports no Cloud client. Shared Write OFF / `canWrite=false`; ordinary consumer/writer not connected.
- All expiry assertions linearize at the final SQL assertion, not an assumed Account+IndexedDB transaction or guaranteed credential validity until the storage system's physical commit. Production must explicitly accept that contract or add a backend guarantee before activation.

## Retention and deletion contract candidate

No duration below is approved. `studio-retention-rc.js` implements an internal read-only classification plan; its digest is an observation, never a deletion capability. Public `purge` and trusted physical purge both refuse. It is safe to retain more evidence; retention growth must be capacity-gated before launch.

| State | Purpose / recovery | Default behavior | Deletion authority and future prerequisite |
|---|---|---|---|
| Current document/head/chunks | Read current schema2 document, exact digest/revision | retain | Current authorized Owner logical delete; physical deletion needs policy + reconciled references |
| Tombstone / dataset high-water | Prevent replay and resurrection | retain without expiry | No GC until all eligible device/checkpoint horizons and legal deletion policy are defined |
| Pending / incomplete upload | Resume exact operation/chunk set | HOLD | Explicit Owner discard contract, receipt and offline horizon required; no time-based guess |
| Unknown commit | Resolve exact operation under current authority | HOLD | Reconcile first; never presume success/failure from timeout |
| Typed receipt / adoption event | Historical result, source-to-successor proof | retain | Not current permission; preserve operation/digest/high-water anti-replay evidence |
| Native recovery proof | Re-enroll/re-adopt after native proof cleanup | retain immutable | Current Account/device/Pro/generation/epoch required each use; no automatic proof resurrection |
| Deleted Account orphan | Preserve unresolved work after shared Account deletion | inaccessible HOLD | Separate verified deletion authority and audit; no FK to shared Account, no automatic backfill/reassignment |
| Revoked device | Prevent old qualification reuse | preserve data, reject access | New current Owner + explicit recovery proof; old device alone cannot recover |
| Local Outbox | Offline/UNKNOWN/native local intent evidence | unchanged, never remotely purged | Separate explicit local disposition + current Owner, not server retention timer |

Duration choices for the operator (not constants): completed old-version chunk retention 30/90/180 days; pending/offline recovery window 30/90/365 days; receipt/tombstone/proof horizon at least every supported device/backup restore horizon or indefinitely until a compact anti-replay ledger is designed. Shorter periods reduce cost but remove recovery options. Account deletion notice/cooldown, legal erasure and backup expiry need owner/legal review. An unbounded evidence policy also needs a measured capacity budget. None of these choices enables purge here.

`HISTORICAL_COMMITTED_POLICY_REQUIRED` is only a classification; it does not prove absence of future dependencies. An adoption source is `ADOPTION_EVIDENCE_HOLD`, an orphan is always `ORPHAN_HOLD`. Unknown JSON/generation are not repaired. No new FK blocks or cascades a shared Account purge. Account B is isolated by Owner and row predicates.

## Durable native recovery evidence

The final native recovery SQL is rechecked in the enrollment/adoption batch before a minimal Studio proof row is written. It binds account ID, operation ID, native request fingerprint/result, new device, Account generation/recovery version and a canonical proof digest. It contains no credential/private key. UPDATE/DELETE are rejected by dedicated triggers. The use-site additionally binds current Pro/epoch/credential authorization and final native SQL guards. A historical receipt alone never grants a save.

Native proof disappearance after capture uses the immutable copy, with exact current generation/device and digest checks. A later generation rejects it. An uncaptured native proof is not inferred. If required proof was already deleted, the operation remains HOLD pending an official recoverable path.

The alternate Scheduled wrapper checks known Studio Accounts (enrollment or pending) for uncaptured native recovery operations before calling the unchanged v137 Scheduled handler. One unresolved proof holds the whole legacy Scheduled run. This is conservative and can delay normal legacy retention; it must be operationally accepted/monitored before any deployment. It is not a proof of retroactive enumeration of v137 activity. Default-OFF refers to new Studio purge and routes; accepted evidence retention introduces this documented legacy cleanup guard. Missing/partial Studio metadata holds Scheduled while HTTP legacy routing remains available.

## Formal additive DDL candidate

Namespace: `studio_0001_rc1` in **Studio-only** `studio_document_migrations`; not shared `d1_migrations` 0034. The candidate depends only on exact shared schema/journal 0033. Shared 0034–0037 are not applied, renamed or reused. Actual Production migration promotion/name and rollout approval remain outstanding.

`studio-release-schema.js` is the authoritative trusted installer/renderer. A single native D1 `batch` includes preflight exact schema+journal assertion, all Studio CREATE statements, journal row, marker and disabled control row, and a final marker assertion. No `IF NOT EXISTS` silently absorbs partial state. Replay, unknown schema/journal, preflight drift and partial objects reject. D1 rollback is tested. No HTTP handler calls the installer.

DDL payload hash is SHA256 of canonical `{id, ddl}`. SQL file SHA256 is separate (the SQL contains the payload hash; do not define a circular file hash). Owner `release:true` requires exact Studio object SQL, exact shared0033 schema/journal, journal sequence/id/DDL hash/base fingerprint and marker before/after every business batch. Marker contents cannot be substituted with an unchanged sqlite_master hash. Core isolated prior fixtures remain supported only when explicitly `release:false`; the RC uses release mode. No existing safety assertion was relaxed.

Use `schema-candidates/studio_0001_rc.sql` for review; execution must preserve the single-batch boundary. Never pipe it through a sequential SQL executor or blindly retry after ACK loss. Read back exact schema/journal/marker and disabled control; unknown outcome stops for readback. Do not implement destructive down-migration. A Worker rollback does not undo schema or recover user changes.

## Capacity, rate and cost decisions

Existing valid schema2 maximum stays 24 MiB UTF-8; chunks stay at most 128 KiB and 256 per manifest. This change does not shrink valid documents. A pending manifest is immutable. Configured quota counts per Account distinct documents, retained operations and uploaded logical chunk bytes. Adoption duplicates bytes and must fit the same final SQL quota; a failed quota batch leaves prior pending/evidence intact. Server-side Pro expiry/revocation and native final guards apply to every chunk operation.

The optional durable Account/window rate meter counts one public Owner operation, not its internal reauthorization or reconciliation. Its increment and ceiling assertion are atomic; denied increments roll back. Registration still requires the existing trusted Origin/Turnstile/external limiter; durable Account rate cannot replace pre-auth abuse protection. Rate rows are retained pending an approved bounded compaction policy. Missing RC fixture quota/rate cannot instantiate the enabled fixture adapter. Production enablement remains absent.

Fixture 100 docs / 200 operations / 128 MiB and a test 1-request window are **not Production recommendations**. Candidate sizing inputs requiring decision:

- Small cohort: 10 / 25 / 128–256 MiB, reserve >=48 MiB for one maximum document plus adoption; limited offline/history depth.
- Normal cohort: 50 / 100 / 0.5–1 GiB; greater long-term retention cost.
- Larger paid tier: 100+ / 200+ / 1–2 GiB; cannot be chosen without shared-D1 load/storage measurements.
- Rate must allow one large upload's <=256 chunk calls plus begin/commit/reconcile, across two devices and retry uncertainty. Compare 60/minute with paced/resumable uploads vs 300/minute burst plus stricter per-origin/account concurrency. These are planning alternatives, not deployed values.

Logical bytes undercount SQLite text/index/page overhead, duplicated adoption chunks, manifests/receipts, retained rate/proof rows and backup copies. Schema observation and per-batch guard scans also cost D1 reads and Worker CPU. Measure D1 `meta.rows_read/rows_written`, bytes-on-disk and CPU percentiles with representative synthetic documents before selecting a cohort. Existing shared D1 capacity is also Port's capacity; per-Account limits do not eliminate cross-Account resource exhaustion. No production plan or quotas were queried/changed.

Cost model (USD, current published Paid rates checked 2026-10-29; actual plan unconfirmed):
`D1 = max(0,readRows-25e9)/1e6*0.001 + max(0,writeRows-50e6)/1e6*1 + max(0,storedGB-5)*0.75/month`.
`Workers usage = max(0,requests-10e6)/1e6*0.30 + max(0,cpuMs-30e6)/1e6*0.02`, with a paid-plan minimum separate. Index maintenance adds writes; logical API call counts are not billed rows. D1 per-database maximum is 10GB; physical overhead and shared data must fit. Backup/R2 request/storage and key management are additional costs. No extrapolated fixture throughput is a Production SLO.

Official references: https://developers.cloudflare.com/d1/platform/pricing/ ; https://developers.cloudflare.com/workers/platform/pricing/ ; https://developers.cloudflare.com/d1/reference/faq/ .

## Encrypted synthetic backup and actual independent restore

`studio-fixture-backup.mjs` has no remote API, auth discovery or plaintext SQL export. Explicit synthetic-fixture inputs only. Frozen fixture writers + double observation cover complete application D1 schema/journals/rows/sequences (exact reserved engine tables `_cf_KV` / `_cf_METADATA` excluded, recreated by native runtime) and R2 keys/bytes/httpMetadata/customMetadata. Committed document heads require matching pending/receipt/full chunk digest; incomplete pending is preserved as incomplete rather than fabricated.

AES-256-GCM encrypts the in-memory snapshot. A separately pinned manifest binds ciphertext, plaintext content, schema, sequences and R2 data. The 0600 key is in an OS temporary 0700 key directory outside evidence/backup bundles, passed to the restore process separately. No key value is printed or committed. This is process/file/channel separation on one host, **not independent KMS/admin/physical-failure protection**. Production key escrow, rotation, loss, access audit and secure destruction remain a separate approved design. Retain fixture key while reproducibility is required; do not claim successful restore after key loss.

A different Node process starts a new native workerd/D1/R2 target, authenticates encryption and independent manifest/current pins, restores with deferred FK checks, preserves sqlite_sequence, metadata and exact rows, then compares the full snapshot. Nonempty target, wrong/old external pins, missing key, missing committed chunks and partial ciphertext refuse. D1 restore is one batch. R2 application is a separate phase: interruption means PARTIAL/UNKNOWN, never complete by inference. Never automatically retry restore over that target. A process reopen can independently confirm an ACK-lost RESTORED result without reapplying.

This is a synthetic restore acceptance only. Production backup consistency across old writers/R2, encrypted backup transport, tested isolated Production restore, RPO/RTO, other-owner post-backup changes and lawful retention remain release gates. D1 whole-database restore could discard Account B/Port changes; no automatic rollback is authorized.

## Reproducible isolated tests

Use the already approved local runtime with `miniflare`, `esbuild`, `playwright`, and installed Chrome. Output directory must be new and outside the repo. All outbound network is blocked/routed to synthetic fixtures.

```
STUDIO_TEST_RUNTIME=/absolute/runtime/package.json STUDIO_TEST_OUTPUT=/new/output node workers/sound-cruise-sync/test/studio-release-rc.test.mjs
STUDIO_RC_V137_ONLY=1 STUDIO_TEST_RUNTIME=/absolute/runtime/package.json STUDIO_TEST_OUTPUT=/new/legacy/output node workers/sound-cruise-sync/test/studio-release-rc.test.mjs
STUDIO_TEST_RUNTIME=/absolute/runtime/package.json STUDIO_CLIENT_OUTPUT=/new/browser/output STUDIO_RC_BROWSER_ONLY=1 node workers/sound-cruise-sync/test/studio-release-rc.test.mjs
```

The Browser runner reuses PR49's unmodified 45-case driver, selects release-mode Owner and installs the formal DDL in an isolated copy. It does not relax assertions or rewrite the source test. New native RC tests and rerun Browser regressions are counted separately from saved historical PASS.

## Rollout approval units / shortest next steps

1. Complete candidate review, exact scope gate, topic push and Draft PR only. Existing v2/PR33 formal Git protection HOLD unchanged.
2. Operator decisions: retention/notice/purge disabled policy, cohort quota/rate/capacity, final-SQL linearization contract, durable native proof retention and Scheduled-HOLD operations. No Production duration is selected by fixture tests.
3. Finalize standalone Studio migration promotion and default-OFF deployment manifest (actual bindings/routes/secret references, never values), read-only fresh metadata as explicitly approved. No shared0034–0037 migration prerequisite.
4. Separately approved encrypted Production backup + actual isolated restore + RPO/RTO/other-owner protection. Do this before any DDL.
5. Separately approved Studio additive DDL single batch + exact readback; then default-OFF alternate Worker deploy, legacy Port/4-app canary, cleanup-HOLD monitoring. Unknown result stops; no automatic rerun/rollback.
6. Separate reviewed activation candidate with actual Pro/Account-backed Owner-only canary, bounded cohort/quota/rate, two-device/renewal/recovery/Safari/real-device E2E. Then Studio UI/performance final acceptance.
7. Separate exact cross-owner PR-chain merge/Pages approval; production Cloud activation and formal release need their own explicit acceptance. No new phase starts automatically.
