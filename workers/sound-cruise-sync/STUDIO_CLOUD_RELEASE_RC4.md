# Studio Cloud RC4: finite evidence, activation and isolated Cloud UI

Candidate only. Production entry/router/Wrangler and shared Port/4-app code are unchanged. No migration, deployment, main merge, Pages publication, Account mutation or production traffic is authorized by this document. The adopted v2 contract and PR #33 formal protection HOLD remain unchanged.

## Authorization and finite evidence

The existing Account/Pro authorization, Owner repository, D1 batch, CAS, typed receipt, Session adapter, schema2 Project repository and IndexedDB outbox are reused. An explicit server configuration adds an Account-scoped operation epoch and final evidence budget assertions. The UUIDv4 operation's first 8 hexadecimal digits encode the epoch; all Studio epoch-keyed mutating operations require the current epoch (native Account registration/recovery proofs retain their separate contracts). Compaction increments the epoch atomically with retirement of resolved metadata. A high-water value alone is not used to reject arbitrary UUIDs.

Compaction validates pending/receipt/change/resolution tuples, pins the observed Account revision and epoch in its D1 transaction, and rejects any unresolved operation or live erase intent. It retains current document/tombstone proof and associated resolution, current chunks and enrollments. Historical chunks and resolved proof rows can be retired only at this explicit boundary. Unknown outcomes are never age-purged. Lookups whose operation evidence was retired return `history-retired`, never inferred success/failure; retained current-head receipts remain historical evidence. Old credential authorization is not revived by a checkpoint.

`evidencePolicy` must be supplied explicitly (16–4096 metadata rows, 64 KiB–16 MiB metadata budget are configuration validation bounds, not approved production allocations). Usage counts enrollments and bounded metadata using UTF-8 byte lengths without constructing an unbounded JSON evidence array. Every guarded mutation enforces the selected cap transactionally. Account epoch is limited to uint32 and exhaustion fails closed. Current heads, unresolved operations, tombstones and enrollments are not unconditionally disposable: if the retained set exhausts the budget, writes HOLD. New user-visible compaction/retention orchestration and long-term outbox archival remain release work; repeated arbitrary document/device creation cannot be promised unlimited service under finite storage.

The local outbox retains retired draft content and its unproven outcome. `retainRetiredDraft` requires an explicit user confirmation, fresh Owner reconciliation and a newer current operation epoch. It clears only that Project's active operation link. It neither rewrites local Project content nor guesses the old Cloud result; a later save still uses revision/CAS.

## Activation and deletion

`createStudioActivatedWorker` is a future deployment integration factory. It requires explicit route enablement, limits, rate, evidence and retention policies. D1 activation is mandatory and OFF when absent. `changeStudioActivation` is a trusted control-plane function, has no public HTTP route, and CAS-binds append-only history to the current record. Canary targets exactly Account/device/dataset. Client headers/query/localStorage cannot enable it. Final guarded D1 assertions include activation revision/hash and current Account/Pro/epoch. A concurrent OFF transition rejects the protected commit. A candidate factory is not a deployed route.

Canary is distinct from general activation. Account-wide compaction/destructive lifecycle operations are unavailable in canary. General mode still enforces native authorization. The activation audit is append-only and needs a separately approved long-term control-plane retention policy.

Cloud tombstone deletion preserves the local Project. Authenticated Account erase intents bind the post-intent revision, Account/Device/Owner scope and approved policy digest. Expired intents HOLD; an active current Owner may explicitly cancel, with a typed cancellation receipt, without deleting payloads or reusing the terminal operation ID. Native Account deletion plus a still-valid exact intent allows the internal erasure completion function; lost ACK can reconcile the same terminal result. An unauthenticated orphan, expired intent or changed scope remains HOLD. No automatic reassignment/backfill or destructive expiry extension is provided. Backup-side deletion propagation requires an operator-approved retention/restore policy.

The final SQL authorization is the logical linearization point. Physical commit timing after the final assertion is not a separately guaranteed credential lease. D1 and local IndexedDB, and D1 and R2, are not atomic together.

## UI and current integration limits

Studio 0.48.0 adds a dark Cloud panel. Ordinary boot is display-only, creates no Session/Client, and does not call any production endpoint. An isolated host supplies the existing Session/Client/repository. Visible controls cover enrollment/reauthentication, save, observe, explicit CAS load, pending send, UNKNOWN reconcile, retired-draft preservation and confirmed Cloud-only deletion. Offline and failure states retain local/outbox data. Dirty local editing is rejected until the local Project is saved.

Registration, device enrollment, Account recovery and adoption controls appear only when actual existing identity-action handlers are supplied; they are not fake active buttons. A normal-user host for those handlers, safe Pro credential entry, and a reviewed production-host transport allowlist are still required. Existing native Session flows are regression-tested separately; this does not prove that all identity flows are connected through the new panel. No user Account/recovery code is embedded in the UI.

## DDL and restore

Fresh Studio install candidate: `schema-candidates/studio_0001_rc4.sql`.

- Migration ID: `studio_0001_rc4`
- Canonical DDL SHA256: `9fe8c42228f08df58c165d616780a252b45d7b58590ead1c70e394f6f3de00a9`
- 83 schema objects; exact shared 0033 schema and 33-entry journal required.
- One native D1 batch with initial exact schema/journal assertion; marker/journal and control `enabled=0` are part of the batch.
- 0034–0037 are not a dependency. Existing Studio candidate schema, partial schema, duplicate install or unknown base is rejected. This is not an in-place RC2 upgrade; inspect actual production metadata before any future application.

Encrypted synthetic backup validates head/receipt/chunks, Account epoch/checkpoint, activation hash chain/current record. Operational rate-only pre-enrollment state does not require an enrollment epoch; actual enrollment/evidence does. Restore uses a fresh independent workerd/D1/R2 process, exact marker/schema readback and content hash. Production backup/restore, key custody, retention deletion and cross-DB consistency remain separate acceptance/approval gates.

## Reproduction and result scope

Native direct tests: `test/studio-cloud-release.test.mjs` with dedicated `STUDIO_TEST_OUTPUT` and `STUDIO_TEST_RUNTIME` pointing to an installed synthetic Miniflare/esbuild runtime package.json. Browser panel tests: `apps/cruise-studio/tests/cloud-panel.browser.mjs` with `STUDIO_CLIENT_OUTPUT`, same runtime and installed Google Chrome. Output directories must be newly created outside the product checkout. All credentials and databases are synthetic; outbound networking is blocked. Do not point these scripts at production.

Evidence is retained outside the repo in the task's immutable per-run output directories. Old failed runs are retained as diagnostic evidence and are not counted as PASS. Independent read-only reviewer: separate GPT-6.1 Sol agent; Opus 5.5 was unavailable. Accepted review scope is this isolated implementation, not general release readiness.

## Release order and approvals

1. Complete ordinary-user identity UI/host and exact production transport integration behind OFF; connect explicit bounded retention UX, orphan/operator workflow and policy error UX. No production traffic during this work.
2. Approve operating values: Account document/metadata/operation/device limits, rate windows, retention/notification periods, erase intent lifetime, backup keys/retention, orphan deletion authority, canary identities and stop conditions. Fixture values are not approval.
3. Fresh production metadata, route/version/override/external-writer inventory; verify actual base/schema and publication dependency heads. Do not repeat unrelated historical Git investigation.
4. Separately authorized encrypted production backup and independent isolated restore/readback, including deletion/tombstone and epoch restoration. Preserve Account B and other owners.
5. Separately authorized fresh Studio DDL, then OFF Worker deployment and readback. No blanket 0034–0037 shared migration.
6. Separately authorized scoped Owner canary with kill switch, native credential expiry/recovery, ACK/reopen, multi-device conflicts and real resource measurements. No normal Shared Write enablement.
7. Safari and real device/network acceptance; production canary CPU/memory/query limits and approved capacity. Do not infer Safari PASS from Chrome.
8. Dependency-ordered PR integration/Pages release under explicit publication approval and current cross-owner scope protection. General Studio+Cloud activation only after all gates and explicit approval. No automatic progression from Draft PR or fixture PASS.

Safari manual acceptance (Remote Automation currently disabled; do not change it implicitly): disposable approved test Account/profile; local schema2 save; Web Locks/two-tab CAS; IndexedDB outbox restart; denied storage/quota; offline enqueue/reconnect; ACK loss reconcile; device/Account recovery and Pro expiry; Cloud tombstone/local preservation; retired epoch confirmation; target-excluded canary/OFF rejection; browser console/network. Capture OS/Safari versions and actual outcomes, preserve failed pending operations. Real microphone or unrelated app permissions are not needed for these Cloud tests.
