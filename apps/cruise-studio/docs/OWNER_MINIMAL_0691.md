# Native Port Owner minimum integration — Studio 0.69.1 / Port 1.28.0

Development draft only; no release/merge approval. Fixed #138 and #132 heads and bases matched remote at start. New isolated branch; original PRs/worktrees/main untouched. No production resource or real identity was used.

## Root cause / change

#138 treated any Studio Project presence as an unconditional Port rejection, including the native attribution operation. That prevented the existing Sync Center from confirming the local Account. No new Owner is required: the existing Port local attribution, Account DB publication transaction, dataset Web Lock and `/v1/sync/push` remain authoritative.

`assertCurrent` now allows attribution only with the native shared Account credential (not just a database API), matching device ID when supplied, and a matching live Pro source (credential/generation/sessionVersion/operationRevision, not timestamp metadata). `assertLocalAccount` independently requires the existing explicit sync-mode binding to that Account before repository or binary writes. Project-only and database-only cases stay rejected. Exact Account-row comparison inside the existing IDB transaction and generation invalidation are retained. Pro validation-cache timestamps do not retire an otherwise identical qualification. No saved key, schema, second SQL Owner path, new database, Worker, key, Control, floor or operational service was added.

The added unit test covers no binding, wrong Account, valid binding/save, mismatched/revoked Pro and old generation. Existing cross-tab Account replacement and publication serialization tests remain.

## Selective #132 adoption

Adopted functional changes: Port UNKNOWN persisted before dispatch, no automatic resend or own-echo acceptance, explicit existing Sync Center reconcile control; captured deletion-intent generation for ACK; source/final asset-reference retirement; no state notification from revoked runtimes; final Pro scope/generation/lease conditions in existing sync SQL and verified proof propagation. No new SQL owner or table. Existing Port dataset and asset stores/runtime are reused.

Skipped #132's old Studio UI/version rewrites and its permissive Project+DB-only writer behavior. Studio 0.69 design, five themes, central/right single frame, score and existing Pro components stay intact. Coordinated existing asset-version queries advanced for Port 1.28 and shared runtime 33. Public app changes are HTML cache references only; no app feature/auth/schema/SW/CSS logic changes.

## Acceptance and limits

Native product E2E on the final credential checks: 16 checks PASS, including correct Owner save, Cloud push/pull, explicit attribution on both synthetic devices, real native Gear edits, settings/presets/calendar, source/final photo and attachment hashes, offline recovery, Account replacement refusal with bytes retained, Device revoke and Pro revoke. Project client E2E: 32 PASS. Anonymous synthetic Studio UI regression: 10 PASS (five themes, four apps, sidebar/right-pane ownership, dirty/crop protection, controls, images and score save/JSON/A4 PDF).

Additional #132 suite is NOT accepted: one run passed 12 checks including CAS, UNKNOWN/no resend/read-only reconcile, final SQL generation/lease rejection, reauthentication, near-limit data and image generation/removal. It stopped while resolving the re-edit/removal image conflict: the dialog stayed in failure/attention. A repeat stopped earlier waiting for the Port runtime after lost ACK. The initial direct access before native resume was replaced by an explicit ready/runtime wait; that exposes a remaining runtime-resume instability rather than silently retrying a mutation. Local content was retained in observed failures; absence of data loss in all cases is not proven. Do not claim this as a full #132 product PASS. Sanitized results are under `owner-0691/`.

Focused Port writer/edition/shared runtime Node: 209 PASS, plus final stricter writer unit 15 PASS. Earlier broad Node run had 7 failures in stale release/automatic-retry expectations; those assertions were updated to #132's explicit UNKNOWN/reconcile behavior (not skipped or relaxed). Final broad Port/shared Node rerun: 2,828 PASS / 0 FAIL / 0 SKIP. Studio Node: 1,938 PASS / 2 dedicated-environment skips (Project E2E explicitly executed; Session E2E was not rerun in this task).

## Remaining HOLD and shortest next step

1. Reproduce ACK-loss runtime retirement/resume and image conflict-resolution failure using `port-remaining-e2e.browser.mjs`; inspect existing controller/runtime lifecycle and conflict state, not a new safety foundation. Require repeated full suite completion before accepting #132.
2. Independent review is not performed. Review this small qualification/binding split and existing SQL changes separately, especially cross-tab publication and source/final retirement. Owner-specific synthetic progress does not retire every historical writer P2 case.
3. Native midnight Sync enum, final Studio entrance entitlement, real Account/Pro, physical two-device acceptance, Safari/phone and real microphone remain separate. No production release, remote DDL, freeze or operations are authorized.

Operational cost: unchanged services and databases. Added maintenance is an explicit reconcile action, a small local qualification check and regression tests; cache coordination remains existing release work. Historical dormant Owner experiments remain inherited but were neither extended nor activated.

Preview: run `python3 apps/cruise-studio/tests/fixtures/serve-local-pro.py --port 18810` in this checkout. This is synthetic localhost-only; never enter real Account/Pro credentials.


Existing source duplication: #132 updates both modular Sync handlers and the inherited legacy worker snapshot used by the candidate. Both remain existing entry implementations, not new routes/Owners. Their Pro SQL predicates must stay aligned. Selecting the final release build entry and reducing that inherited duplication is release packaging work, not justification for another authorization service.
