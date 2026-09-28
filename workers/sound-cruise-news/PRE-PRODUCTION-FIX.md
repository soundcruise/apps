# Historical JP2B-3 report

JP2B-5 supersedes the salted signatures and partial policy URLs below. See SHIMAMURA-READINESS.md for current state.

# Sound Cruise NEWS-JP2B-3 Pre-Production Fix Report

2026-09-28. Overall: **NEEDS FIX — evidence / acceptance incomplete**.
Requested code fixes and regression tests are complete. This is not permission to
collect or deploy. The original JP2B-2 audit was not found in supplied attachments,
repo or reports, and has been requested. Only the findings in the JP2B-3 instruction
were available. Sleepfreaks lacks complete policy evidence; a real dry-run correctly
stopped with evidence_missing and zero publisher requests. Do not bypass this gate.

## Baseline / preservation

main, HEAD=origin/main=7a320062cd55bdccaccbd8e33b28efbb09a468f7, ahead/behind0/0.
Port1.3.0 candidate / News0.1.0 unchanged. JP2A+JP2B-1 uncommitted work retained.
23-item fixture hash unchanged. No staged files, commit, push, deployment or remote DB.
Existing .claude/ and Sync node_modules retained. Sync/shared/other apps unchanged.

## Fix map

| Finding | Implementation | Verification |
|---|---|---|
| H1 | Complete policy evidence, dates, decision; nonSAFE hard gate; all real sources OFF | missing/expired/CONTACT/UNKNOWN/DO_NOT_USE tests |
| H2 | Raw robots structure validation, CR/CRLF, malformed persistent stop | valid/empty/malformed/comment/soft404/status/size tests |
| H3 | Independent scheduled purge, D1 atomic batch, counts-only log | local scheduled HTTP200, real D1, rollback/current-row tests |
| H4 | D1 controls, source/item takedown, audit, revision; safe remote SQL-plan generator | global/source/item/cache/refetch tests; remote not executed |
| M1 | Ignore indexing header on robots itself; conservative Feed refusal | noindex robots succeeds, Feed refusals stop |
| M2 | normalized salted hash + salted3-gram similarity; no original persistence | exact/space/punctuation/NFKC/near-copy/independent tests |
| M3 | reviewer/checks/state machine/date reason/unique approved topic | reject/reopen/approve, duplicates, dates tests |
| M4 | path/event filter, product dictionary, label_required fallback | archived metadata replay; false-positive regression |
| M5 | exact CORS, SQL pagination, internal5min cache after D1 control read, explicit contract | API/cache/kill/browser-provider tests |
| M7 | ten article checklist codes, manual review mandatory | missing/unverified codes rejected |
| M6 | fixture exception and production transition policy | legal doc updated, fixture unchanged |
| LOW | 451 source stop; Natalie/Skream artist+guitar scope | implemented |

## Registry / evidence

26 records, 18SAFE / 4CONTACT / 2UNKNOWN / 2DO_NOT_USE. All disabled.
Partial policy URLs recorded for Shimamura, Roland, Audio-Technica, Kanda, Hookup,
ESP, SONICWIRE. None has every evidence gate satisfied. Other evidence remains
unknown; do not treat a privacy policy or a different shop/service's Terms as permission.
Phase1 candidates: Shimamura, Sleepfreaks, Hookup; still OFF.
chuya not re-enabled or fetched. Its previous refusal remains persisted.

## Dry-run before / after

| Check | Candidates | Pending | Rejected | Publisher requests |
|---|---:|---:|---:|---:|
| Historical JP2B-1 live Sleepfreaks | 10 | 7 | 3 | 2 |
| JP2B-3 real collection attempt | 0 | 0 new | 0 new | 0 (evidence_missing) |
| JP1-A2 archived Feed metadata replay | 10 | 4 | 6 | 0 |

Replay is offline quality assessment, not a current-feed collection or policy/robots
approval. It used the pre-existing research JSON outside repo. It did not store any
raw title/body in repo or the new D1. Four tutorial URLs were also rejected from the
existing7 local candidates, leaving3 pending and4 rejected. Legacy candidates lack
fingerprints and remain unapprovable without a future authorized recollection.

### Replay labels

- Lunacy Audio、NOVAを発表 — new_product, pending structured review
- Universal Audio、LUNA 3を更新 — update, pending structured review
- SINPHONICAを発表 — new_product, pending structured review
- LAVA STUDIOの製品情報（要確認） — other, pending label_required

First3 are candidate facts, not human-approved publication. The last does not assert
an unsupported release/update. Counts were not forced to the expected number.
The earlier classifier mistook ライブラリ for ライブ; corrected with a regression test.
All fixture UI still displays only the23 manually approved JP2A items.

## Retention / emergency operations

Hourly scheduled-handler design, no configured production trigger. NEWS expiring in
the next hour is purged early so a healthy hourly job stays within90days. Current
rows protected by transactional batch rollback. Reviews/fingerprints delete with item.
Diagnostics90days, item tombstones90days, content-free control audit365days.
The local endpoint /__scheduled ran successfully while collection/API were OFF.

Remote SQL plans begin with global OFF and are not executed here. Commands, target
verification, reason codes and restart criteria are documented in README. D1 binding
operations use atomic batch; remote multi-statement file execution is deliberately
not claimed atomic. An interrupted plan leaves global OFF for operator verification.
API control read precedes cache, revisions invalidate source/item/publication changes,
and browser responses are no-store. Internal edge cache <=300sec only. Open tabs
update on next provider refresh; no new polling/push was added.

## Tests

| Suite | PASS |
|---|---:|
| News | 33 |
| Port | 821 |
| Shared | 226 |
| Sync | 385 |
| Pitch | 30 |
| Fretboard | 25 |
| Rhythm | 19 |
| Chord | 95 |

Browser375/393/1024PASS: fixture23, ticker/category/links/date windows preserved,
publisher requests0, page errors0; API-disabled fallback hides ticker/cards.
Local D1 migration0002PASS, actual Miniflare D1 round tripPASS, scheduled HTTP200,
CORS rejected origin403 / disabled response503PASS. Syntax/diff-checkPASS.
Logs: /tmp/news-jp2b3. Runtime tests use2026-09-18 because installed workerd does not
support config target2026-09-28; no dependency silently upgraded.

## Remaining acceptance

1. Read original JP2B-2 audit and reconcile any reproduction details not quoted in user request.
2. Complete reviewed Sleepfreaks Terms/link/automation/discovery/robots evidence;
   perform one low-load authorized live dry-run only after the gate passes.
3. Human approval remains required; no actual candidate approved in this phase.
4. Production runtime compatibility, resource provisioning, Cron activation and
   operational alerting belong to a later explicitly authorized release.

Production changed: NO. Existing Sync Worker changed: NO. Git safety: YES.
