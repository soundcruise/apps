# Automatic publication completion candidate — NEWS 0.53.0

## Deployment boundary

PR #248 / 0.52.2 was separately accepted in production on 2026-11-09.
This 0.53.0 branch is an **offline completion candidate**. It has no Worker,
HTTP or cron caller, no new environment flags, no migration, no deployment, and
no change to ordinary collection. `publishAutomatic(..., {enabled:true})` is an
internal future integration boundary; omission (including old callers) performs
no database access or external communication. It must not be connected to cron
or enabled in production under this PR's current authorization.

## Existing path reused

`automatic.js` replaces its old direct candidate UPDATE with `operatorDecision`.
That existing service re-runs **current** `publicationValidation`, checks the
full-row snapshot/revision, and conditionally inserts the existing Ledger row.
The existing D1 trigger atomically changes the candidate, creates audit/feedback,
and increments controls revision. Trigger failure rolls everything back. The
existing duplicate predicate and legacy duplicate fence remain unchanged.
No publisher request, model call, new registration engine or automatic rejection
rule is added. `pending-resolution.js`, collectors and formal validators are unchanged.

The automatic actor may only approve with `useful_product`, and requires an
internal server authorization callback. Operator HTTP requests cannot supply
that callback or override their Access identity. Existing human request/replay
contracts are unchanged. The callback evaluates fresh formal/editorial context
inside the decision boundary; the final INSERT fences the evidence it used.

## Initial eligible scope

All of the following are required; READY or a historical Shadow match alone is
insufficient:

- Pending, never-decided Ikebe/Shimamura typed product/launch news.
- Current full validation PASS: source/URL, date, expiry, facts, provenance,
  fingerprint, identity, relevance, duplicate/takedown and publication controls.
- Healthy permitted source, publisher-structured field evidence, explicit models,
  no human-confirmed facts or manual category override.
- Existing `sourcePreferenceIdentity` can establish the exact dated product event
  (or explicit co-development notice). Model/version/color/edition/event qualifiers
  remain significant; uncertain identity is excluded.
- Existing structured-human-v3 recommends approve from at least five independent,
  compatible prior human editorial decisions without contradiction. Historical
  editorial compatibility never supplies current proof. Existing technical,
  duplicate and source-policy learning exclusions remain unchanged.
- If a formally valid unjudged Ikebe equivalent exists, Shimamura is excluded.
  Invalid or absent Ikebe does not impose a waiting period. Previously published
  or human-decided articles are never replaced. AGM editorial/book articles,
  Morris events, sales and firmware remain outside this initial automatic scope.

## Atomic concurrency and audit

The existing controls revision fences normal decision/edit history changes.
Bounded snapshots additionally fence insert/delete/change of pending retail peers,
source health/stops and category overrides during preference evaluation. Context
is bounded to 512 rows / 1 MB per set; exceeding it stops rather than publishes.
These snapshots are query parameters only, not new retained article data.
Full-row CAS and current duplicate/takedown SQL remain authoritative. Condition
conjunctions are balanced to stay within workerd D1's expression-depth limit.

The request key binds policy, candidate and full snapshot. Concurrent/repeated
invocations can create at most one decision. The returned count uses ownership
of the unique decision ID, **not D1 `meta.changes`**, which includes trigger writes.
An unexpected failure propagates without an automatic retry; any prior committed
items are discoverable in the existing Ledger. An in-flight SQL request is not
claimed cancellable by an OFF switch.

The Ledger uses `actor_type=automatic_policy` and records policy/rule versions,
evaluation ID, history watermark, evidence count, recommendation and coarse
proof context in `automaticEvaluation`. It has no human insights profile or
human Shadow envelope. Existing `humanDecisions` excludes it from training;
automatic approval is not independent human evidence.

## Validation and historical limits

- Dedicated tests cover the real local workerd/D1 transaction and Node SQLite
  negative/race cases: no permission, insufficient/contradictory editorial
  history, invalid facts/date/provenance, human judgment/category protection,
  source stops, takedown, preference, peer insertion, full-row CAS, controls
  changes, child-trigger rollback, concurrent invocation and repeat invocation.
- Legacy tests that equated `AUTO_PUBLISHABLE` with approval now assert OFF.
  API expiry/source-kill fixtures remain explicitly approved **test fixtures**;
  they are not claimed automatic-publication evidence.
- Final NEWS/Operator regression: 1,878 PASS; Port NEWS: 60 PASS; both
  Worker dry-runs PASS. The new automatic boundary adds 32 cases, including
  local workerd/D1 and formally READY human-confirmation exclusion.
- Saved history: 191 decisions; 163 old-policy records, 78 compatible contracts,
  76 independent effective old teachers. Prior-only replay: 185 cases, four
  approve recommendations matching human approvals, zero false-publish direction.
  Current-policy 28 cases produced zero recommendations. These are editorial
  replay results, not publication success rates.
- All 191 historical decision frames lack recorded evidence-origin classification;
  current publisher-only eligibility cannot be certified retrospectively. Current
  production pending count is zero. Do not reopen decided candidates, invent
  targets, re-sign production evidence with a fixture secret, or lower thresholds.

## Independent audit and next minimal acceptance

Recommend a second independent review with Claude Code Opus 5.5 before approval:

1. Does the automatic authorization + existing Ledger transaction leave a bypass,
   stale-context race or human decision overwrite?
2. Are current proof, no-human-assistance, exact dated identity and Ikebe preference
   sufficient? Are coarse five-example editorial patterns too broad?
3. Do D1 expression/binding limits, triggers, replay/counting and rollback behave
   correctly? Is any new code unnecessary?
4. Can automatic actions enter human teaching or mutate old Shadow records?
5. Confirm no collector/cron changes and no production enabling in this branch.

After audit fixes and separately approved merge/deploy, first inspect real newly
collected READY candidates prospectively with the same read-only eligibility
function. Compare with actual human judgments and measure scope, false-publish
risk and abstentions. A further explicit authorization must identify the initial
narrow scope, invocation/kill boundary and limited actual publication acceptance.
Do not treat this Draft's synthetic transactions or historical four matches as
sufficient approval to start daily automatic publication.
