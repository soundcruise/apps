# Studio 0.69.2 / Port 1.28.1 — existing runtime recovery

Base #141 head `32a25ec0b3d09375c55b5ea26ffd7bf6fd605950`, tree `f04dac3018140484ff9ccb1542ee82eddb0fbb82` matched before work. New isolated branch; no source PR/main/other worktree update or Production operation.

## Causes and minimal changes

1. `port-sync-controller.js`: startup `push_outcome_unknown` propagated into generic activation failure, which called `stop()` and disposed the very runtime needed for explicit reconcile. Treat only this existing recovery result as a live, guarded activation outcome. Bind normal lifecycle and preserve Outbox; all other errors retain the original retirement behavior. Account/Pro guards remain active; changing Account still retires this runtime. No automatic resend or new authority.
2. `port-sync-adapter.js` / shared runtime: ordinary remote apply intentionally preserves pending local images. The same policy was incorrectly used for explicit remote conflict choice, so pending source/final IDs could override the selected remote removal and verification returned failure/attention. Forward the selected record key through the existing apply options. Only that explicitly chosen Gear/My Apps entry retires pending metadata; ordinary pull and all unrelated pending edits remain protected. Existing repository transaction, backup, CAS/readback and verification still run, with current-snapshot checking before publication. No binary store is deleted or replaced by this patch.

The image regression unit deterministically compares ordinary pull versus explicit remote removal while pending remains, including unrelated metadata preservation. Runtime unit covers UNKNOWN startup and subsequent Account retirement. Product tests still demand actual conflict dialog completion and verify source/final hashes and exact replacement attachment bytes.

Fixture distinction: a separate `Execution context was destroyed` occurred while reading image hashes across Port's normal cloud-apply reload. Use existing bounded `readStable` for that read only; no saved operation, click or mutation is retried. No timeout increase or weakened expected result.

## Synthetic acceptance

- Final `port-remaining-e2e`: **17/17 twice**, separate disposable copies/profiles. Earlier runtime-only iterations also completed three times, but they are not substituted for final-code acceptance.
- Native Port/Studio product entry: **16/16**, including explicit attribution, bidirectional sync, Account switch, Device/Pro refusal and Project UNKNOWN preservation.
- Project client: **32/32**, including CAS/Outbox/UNKNOWN/reconcile/offline and retained drafts. Session dedicated suite not rerun.
- Port/Shared/Worker focused Node: **323 pass, 0 fail/skip** (controller, adapter, repository, runtime, edition/cache, Worker Account/credential crypto).
- Product Chrome: **21 pass**, five themes/four widths, five tools, four apps, independent pane/single frame/dirty guards, NEWS, score save/JSON/A4 PDF. Real microphone/Safari/phone/physical devices remain untested.
- Studio Node result is recorded in `recovery-0692/test-summary.json`; dedicated-environment skips are explicit.

The final remaining suite tests two-device CAS, ACK loss and reload, no automatic resend/own echo, explicit read-only reconcile, final SQL Pro generation/lease and Device fences, image recrop/removal conflict, source/final binary readback and attachment deletion/replacement. Product suite separately tests Account replacement and Project noninterference. These are whole suites, not individual case passes.

## DDL restriction and verification exception

Product/Project E2Es now copy previously provisioned, completely synthetic local Miniflare state and inspect existing schema; they do not run application schema DDL or change the seed. All subsequent fixture state changes are DML in the disposable copy; remote traffic is intercepted/local and workerd outbound traffic is blocked. These seeds must be retained or supplied separately; this task does not authorize reprovisioning them via DDL.

Exception: the first Node batch mistakenly included `asset-policy.test.js` (4 tests); its helper created schema in fresh in-memory SQLite. This violated this task's DDL prohibition even though it never touched remote/shared/real data. The four tests are excluded from acceptance and were not rerun. The final 323-test list excludes this helper. No Production Worker/D1/R2 or real identity/data was used.

## Scope, complexity and release limits

Three existing product files carry the behavioral changes. Existing apply options gained one transient record-key field; no persisted schema/key, new adapter/service/Worker/DB/DO/Control/Freeze/second Owner was added. Before coordinated cache-version edits, those three files total +24/-9 lines. Queries advance to shared runtime 34, Port 1.28.1 and Studio 0.69.2; many changed files contain cache/release assertions only. Public four-app feature/auth/schema/CSS/SW logic is unchanged.

Port common Sync is synthetically accepted for these recovery scenarios, separately from Project Sync. This does not authorize lifting all historical writer P2, native midnight Sync enum or final entrance entitlement holds. Independent review was not performed. Next: independent review of the narrow lifecycle/selected-record changes, final entrance trusted Pro source integration, dedicated real test identities on Mac Chrome and two devices, then Safari/physical microphone. Release operations need a separate decision; no main merge, publish or deployment occurred.

Preview uses the existing synthetic localhost server fixture on port 18811; never enter real credentials.
