# Phase 4B independent audit — HOLD

Baseline: PR #108 head `4c41ac3b265c0885ed5f054847c0b37f49e3e725`, tree `2761f1a3f16ae7b7abe01c2643bfaa362e66cde7`; PR #105 head `7b3a53e7291d04d5007dc7097d9390f165b2d4c1`; GitHub main `5c07c7b3d05bc99153113f214babd3a161514bf1`. All dependency heads listed in `CANDIDATE-SCOPE-HANDOFF.md` matched GitHub on this audit. The starting clone was clean.

## Blocking finding: retained receipt breaks existing deletion

Migration 0026 defines `news_dot_admission_receipts.candidate_id REFERENCES candidate_items(id)` without a delete action. `NewsStore.purge` deletes expired `candidate_items` without first resolving that reference, in the same D1 batch as other cleanup. `administer` also directly deletes candidates for `item-delete` and `source-delete`, in a batch with the respective takedown or source disable operation.

Added regression `AUDIT: retained Dot receipt blocks the existing expiry purge batch`: a real registered fictional Dot candidate and receipt, actual migrations and actual `NewsStore.purge`; SQLite foreign keys enabled. The purge throws `FOREIGN KEY constraint failed`; candidate and receipt remain. This test demonstrates the failure; a passing test does not mean the product behavior is acceptable.

A separate temporary workerd D1 test used a minimal parent/receipt FK with the same NO ACTION semantics: a batch deleting a referenced and an unrelated parent fails, and both parents remain. This proves D1 batch rollback under the model; it does **not** substitute for an actual-schema workerd purge E2E. D1 enforces foreign keys by default: https://developers.cloudflare.com/d1/sql-api/foreign-keys/ . Earlier standalone purge operations execute before the failing cleanup batch and may already have committed; do not describe the entire purge as atomic.

In particular, do not assume an `item-delete` takedown insertion or `source-delete` disable survives the failing admin batch without testing the exact path. This is a production gate: a receipt can prevent intended cleanup and potentially stop an intended takedown/source-delete operation. No production writes were made.

### Required repair

Design and implement a transactional delete/tombstone contract that simultaneously preserves deletion/takedown intent, idempotency, old/new Worker behavior, and needed audit/retention policy. Blindly applying `ON DELETE CASCADE`, deleting receipts, or skipping protected candidates can lose replay protection or thwart deletion requests. Test actual 0025–0029 schema using workerd D1: expiry purge with mixed candidates, item-delete and source-delete, batch failure and rollback, retained replay/tombstone, restart, and old Worker operation. Verify what pre-batch cleanup already committed. Review protection for previously approved and rejected records. Do not apply a migration remotely until this is resolved and separately approved.

## Other observations and unfinished audit

- `dot-publication-gate.js` invokes the candidate fence at the start and end; the approval path re-runs the gate and embeds its conditions inside the final Ledger INSERT. This is source inspection, not a completed independent proof of every SQL/TOCTOU case.
- Migration 0029 adds SELECT-only Ledger and candidate triggers intended to deny old Dot approval paths. Their compatibility with **all** old Worker/direct write paths has not been fully independently verified. Previous fixture coverage is recorded in the handoff, not claimed as newly repeated here.
- The archived subject API records a signed-in human's attestation and checks source URL hash when available; it does not itself establish that the independent archival source is authentic or that submitted brand/product/event are true. Unverifiable archive evidence remains HOLD; human attestation cannot override known exact rejection, takedown or policy violation. 262 synthetic records are not real media evidence.
- Prior local benchmark: 561 rows, 1,114,620 ledger bytes, about 153,574 rows read for one gate and 28 queries. New scaling tests, EXPLAIN/index audit, total approval-path query count and production account plan were **not** verified. The gate is called again before approval, so do not equate one gate's 28 calls with the total invocation. Official D1 limits document 50 read subrequests per Free Worker invocation, 1000 on Paid, and 100 bind parameters per SQL statement: https://developers.cloudflare.com/d1/platform/limits/ . Applicability and batching must be measured in the actual integration; do not infer production failure or success from the single-gate measurement alone. Retained legacy duplicate compatibility has a separate 512-row/1 MiB guard.
- Cloud Run IAM/ingress/revision, Firestore and Operator current state were not queried during this partial audit. The handoff's Cloud Run revision and OFF/Invoker settings are historical, not fresh evidence.
- Fresh execution of the whole NEWS/Operator suite, Port suite, scale E2E, full trigger/race matrix, migration rollback, and dry-runs was not completed in this audit. Do not report them as new PASS. Existing 1,582/60 evidence applies only to the prior run at PR #108.

## Conditional future acceptance plan — not executable or approved

First fix and verify the deletion finding and complete the independent SQL/security/scale audit. Freeze the new head, main and final tree; review the full stacked PR delta and migrations 0025→0026→0027→0028→0029 and any repair migration. Read-only check production D1 schema/migration history, access plan, backup and restore point, current deployment, Cloud Run IAM/ingress/revision and Firestore reader. Identify an actual source and one candidate, validate policy/rights and original evidence, and enumerate exact target rows and before/after state. Moon Guitar M1 remains unverified and is not an authorized real publication target.

Only then prepare one explicit approval for an exact merge, migrations, Dot OFF deployment, authenticated read/limited candidate registration if specifically authorized, and any short-lived connection with monitoring and a deadline. Publishing a real article needs explicit, separate scope and human judgment. A Worker rollback cannot restore D1 data; fix/tombstone/Time Travel recovery and the impact on other records must be reviewed separately before any write. Failure means stop, turn Dot OFF, restore Cloud Run Invoker protection if changed, and verify each resource independently.

Phase 4B is the D1 admission and approval-gate acceptance. Phase 4C is the permanent keyless Cloudflare-to-Google connection and ingress protection. A short Phase 4B test does not establish Phase 4C's operational readiness.
