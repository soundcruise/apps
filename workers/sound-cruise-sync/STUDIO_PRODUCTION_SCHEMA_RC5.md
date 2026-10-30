# Studio rc5: exact Production schema candidate (No Deploy)

The fixed rc4 SQL expected a local-only `_cf_METADATA` definition. The saved Production schema has the same102 base objects without that table. rc5 resolves this mismatch without filtering arbitrary managed objects or changing shared0034–0037.

## Exact profiles and identity

- Production102 fingerprint: `fac6295ff89f2f6a2a754329baba3f1c2264b48670249def9d0ac7b8886843d1`.
- Fixture103 fingerprint: `a449ac771ca574ad622226e7eea68e9da33afb74d34dd8963e33f1528b750075`.
- Full object definitions and ordered33-entry journal: `src/studio-base-profile-data.js`.
- Count102/103 excludes SQLite internals and `_cf_KV` as in the historical fingerprint. This is not an unchecked exclusion: Production102 separately requires the exact evidenced `_cf_KV` definition; fixture103 requires its absence. No KV business rows are read by these schema guards.
- Fixture103 requires the exact historical `_cf_METADATA` definition. No `_cf_*` wildcard is allowed.
- Shared Maintenance profiles and guards are unchanged. These new profiles are Studio-only.
- Public Production entry and its Scheduled wrapper explicitly pin Production102. The generic isolated factory retains fixture103 compatibility; it cannot substitute for Production identity.

New install ID: `studio_0001_rc5`.
Canonical release hash: `4a6312a07ecea3433f00102b8e8651c62438ee060e05e4e755a4786c5a16e550`.
This hash covers the ID,83 Studio DDL definitions, and both allowed profile fingerprints/platform contracts.
Production SQL SHA256: `8503af5b2475063e76b1c5f73f2816d95e6f35085a001f61a4ad127c08190ebc`.
Fixture103 SQL SHA256: `89ac40a2c85966e51144fac8c1f110886f07f59013c7b1772dc05f888dc2e1d1`.

The renderer is `scripts/studio-release-sql.mjs`. Each SQL file is for one explicit profile and must be executed as one native D1 batch by a separately approved executor. Do not blindly pass a file to an unspecified migration tool. Initial exact schema/journal/platform assertion and final marker/base assertion are in that batch. No new shared-table trigger, ALTER, DROP, backfill or shared migration is included. Seed control is OFF. Duplicate/partial/unknown schema refuses.

Old rc4 SQL remains byte-identical historical evidence. rc5 does not automatically accept or upgrade an existing rc4 install. Existing release/source hashes are not reused.

## Runtime and restore

Installer, inspector, Owner and transaction guard use the same exact profiles. A marker carrying the other known profile's fingerprint is rejected against the current physical catalog. Ordered journal content/IDs, exact Studio definitions, marker and release hash must agree. Owner credential/Pro expiry, revocation, generation, epoch, CAS and receipt SQL are retained.

`scripts/studio-backup-semantic.mjs` reuses the previously reviewed bounded semantic checks. It requires an explicit expected source profile and the committed rc5 inspector; no caller-supplied inspector can bypass it. A103 target cannot masquerade as a102 source. It checks schema/journal, Account/Pro generations, heads/manifests/chunks/receipts, evidence epoch and recovery proofs. The repo-external bounded encryption/paging/binding core is reused without modification.

## Native evidence and its limits

Dedicated tests: `test/studio-production-schema.test.mjs`. Supply all of:
`STUDIO_TEST_OUTPUT` (new repo-external directory), `STUDIO_TEST_RUNTIME` (pinned stock runtime package.json), `STUDIO_TEST_RUNTIME_102` (explicit fixture transport package.json), `STUDIO_BACKUP_CORE` (hash-verified bounded adapter/binding-provider directory). No Production credentials or remote bindings are used.

Stock Miniflare creates `_cf_METADATA` when returning its commit-bookmark header. It also lacks Production's exact KV table. Therefore full102 tests explicitly use a private repo-external copy with precisely that header-generation call omitted. SQL engine, authorizer, query execution, transactions and rollback are unchanged; catalog observations are not filtered. A fresh synthetic physical KV table is initialized offline with its exact evidenced definition, then reopened. Existing states are never repaired by this bootstrap.

This is a modified native-workerd D1 fixture transport, **not stock Miniflare102 or remote D1 parity**. No bookmark/withSession guarantee is inferred. Stock103 control tests remain separate. The old rc4 guard rejection was also reproduced on stock D1 by making it the first call after offline removal of the local metadata table; transaction failure occurs before the header recreates that table.

Separate child processes restore to fresh D1/R2 and reconcile lost ACK by exact manifest, identity, inventory and all page hashes. Incomplete non-head uploads are preserved and explicitly resumed only after successful readback. Wrong profile, missing/tampered pages and D1-success/R2-failure remain fail-closed/PARTIAL_UNKNOWN. Production managed KV contents and a real Production backup are not tested.

Synthetic v137 five-app save/snapshot and real cleanup/purge effects are exercised both before Studio install and after rc5. Test legacy app allowlists and limiter stubs are fixture configuration; they do not change Production client eligibility.

## OFF-only candidate

Backend package patch version0.1.1; frontend/cache unchanged because no frontend file changes.
Candidate `wrangler.studio-candidate.jsonc` retains compatibility date2026-09-01, existing vars, bindings, cron and16 limiter definitions. It adds only:
- `STUDIO_DOCUMENT_RATE_LIMITER`: namespace32017, IP240/60s.
- `STUDIO_REGISTRATION_RATE_LIMITER`: namespace32018, IP5/60s.

These allocations are candidates, not reserved/deployed resources. Account D1 rate/quota remains separate. `STUDIO_RELEASE_ROUTE_ENABLED` stays false. No public activation mutator is added.

OFF-only before Studio schema/enrollment does not require Canary-wide writer排除. It still needs fresh target/config readback, exact bundle/config approval, control-plane serialization, legacy smoke and a code-only recovery owner/window. Do not infer permission from a dry-run.

Code rollback to v137 is only a separately approved option while no Studio schema/native evidence has been introduced and old bindings remain compatible. After schema/proofs/enrollment exist, do not automatically revert to the unprotected Scheduled handler. Never roll back the whole D1 database to discard normal Port/Account B changes.

## Remaining Production gates

A — DDL: technically aligned to the saved102 observation. Fresh schema and full ordered journal, exact target, guarded executor, backup/independent restore acceptance, explicit hash approval and execution window remain required. No Production application occurred.

B — OFF Worker: exact dry-run bundle/config are reviewable. Deploy authorization, target readback and operating window remain absent. Can be approved independently of DDL/Canary; no automatic next stage.

C — Backup/restore: physical R2 metadata, approved encrypted host/volume, independent key custody, fresh D1/R2 target IDs, freeze/cutline, capacity and actual restore are not complete. D1/R2 are not one transaction.

D/E — Legacy coexistence versus Canary: ordinary v137 traffic may coexist while Studio is OFF and empty. Before Canary, exclude old deployed/Version URL/override/service/externally admitted writers that can destroy required proofs, and establish actual in-flight convergence. Current100% deployment, empty registry or cron change alone is not drain evidence.

F — Safari/real devices and production CPU/memory/query budgets remain untested.

G — Dependency-ordered main integration/Pages requires separate publication approval and current cross-owner exact-tree checks. Current main may advance independently in NEWS. v2/PR33 formal protection HOLD is unchanged.

General release still requires retention/deletion/orphan/backup propagation and operator ACK acceptance. No Cloud activation, Shared Write or ordinary consumer/writer cutover is authorized by this candidate.
