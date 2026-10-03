# NEWS Operator Review — Phase A

## Boundaries

Dedicated `sound-cruise-news-operator` Worker. Only NEWS_DB and authenticated static
assets. No Cron, Sync/Account DB, service binding, crawler, public Port navigation,
recommendation, adaptive rule, bulk review, or free facts/title/category editor.
Port stays 1.13.1; NEWS becomes 0.10.0 (new operator UI/history).

## Decision contract

CLI and browser enter the same decision service in the operator Worker.
Browser uses `/api/decision`; CLI uses `/api/cli-decision`. Only attribution differs;
validation, mutation, idempotency, audit and ledger implementation are identical. Server verifies
Access RS256 signature using the configured team's JWKS, exact issuer/AUD,
exp/iat/sub/email/type, and a private operator-email allowlist. Service identities
are denied. A hidden URL or client-side admin setting never grants access.
All HTML/CSS/JS and API routes go through authentication (`run_worker_first`).

Approve/reject require a pending/reopened, non-legacy candidate, SHA256 snapshot,
revision, durable request ID, and action-specific reason. Approved candidates
cannot be rejected in this initial workflow; use existing separately authorized
operations for withdrawal. Actor comes from verified Access identity, not input.

Approve revalidates current registry/evidence/source health and publication
switch, allowed source URL/path, factual label/provenance/category, 90-day date
and expiry, takedown, sale scope/seller/equipment/end time, actual event date/expiry,
and topic/product/version/launch-family/independently reviewed article duplicates.
`other`, uncertain facts or a REJECT policy are not force-publishable. Four explicit
human checks supplement these server checks, never replace them. The actual
validated factual label is persisted with approval, including placeholder repair.

A conditional INSERT SELECT into the ledger compares every candidate field and
publication/duplicate gates immediately at mutation. One SQL statement's trigger
changes the candidate and inserts audit/feedback and increments public revision.
Any child failure aborts the entire statement. A zero-row insert is an error,
never a success/audit. No remote multi-command pseudo-transaction is used.
`review_revision` increments only in this service; full-row CAS detects changes
from older collectors/recovery paths without changing their UPDATE meta counts.

Exact request ID + canonical payload + authenticated actor replay returns the
saved result. Changed payload/actor rejects. Timeout after commit is recovered
from ledger. UI retains an uncertain request in sessionStorage; explicit retry
resends the exact original payload. Requests are not silently resubmitted.

## Ledger and retention

Additive migration 0011; no historical decisions are backfilled. Ledger has verdict,
reason, actor type/opaque Access subject, timestamp, source/category, coarse features,
policy version, unique request ID/hash, revision/snapshot, committed state and
optional correction_of. No original headline, body, raw HTML, secret, or token.
Features omit product/artist names. Persisted factual label is cleared at 90 days;
coarse ledger and replay evidence expire at 365 days through existing NEWS purge.
Old operator/legacy/automatic records are not relabelled as human training data.
Authenticated browser decisions become `human_operator`; CLI decisions are
conservatively `system_repair` because a human Access session does not prove a
human rather than an agent invoked the CLI. CLI cannot self-promote attribution.
Isolated tests use `fixture` attribution. There is no new automatic approve/reject mechanism.

## Authentication / deployment

Production uses the dedicated Access-protected workers.dev hostname below; preview
URLs stay off and every asset/API also requires verified JWT authorization in the Worker.
Set exact issuer from the actual team. Store the actual app AUD only as
NEWS_ACCESS_AUD in the private secrets file, never in tracked vars or reports.
Allow policy is restricted to the one approved human email, with a six-hour session,
no wildcard, Bypass or Service Auth. NEWS_OPERATOR_EMAILS is also a **secret**.

Ignored `.local/operator-secrets.json` (mode 0600) contains NEWS_HEADLINE_PEPPER
(the existing NEWS pepper, never rotate incidentally), NEWS_ACCESS_AUD and
NEWS_OPERATOR_EMAILS (JSON array string). Never paste these into command arguments.
`.local/operator-access-ready.json` is a recent operator-checked deployment receipt:
origin, issuer, audience, checkedAt, humanPolicyApproved=true,
noBypassOrServiceAuth=true. It is a deployment gate, not runtime authentication.
Server remains fail-closed independently of this receipt.

1. NEWS complete suite + Port NEWS tests + operator/D1/security tests must pass.
2. `node scripts/migrate-operator.mjs` verifies the exact NEWS DB, exports a private
   backup, applies only 0011, compares all previous fields/statuses/controls, verifies
   zero ledger and no historical backfill. Never run against Sync or Account DB.
3. `node scripts/deploy-operator.mjs dry-run`; if Access is unconfigured STOP.
4. `node scripts/deploy-operator.mjs deploy` only after real Access policy approval.
   Assets always pass Worker authentication, including direct JS/CSS requests.
5. Deploy public NEWS with the existing production config/secret preserved, only
   for 0.10.0 health version and ledger retention. No publisher gates/collection
   settings change. Keep schedules/source list/DB binding unchanged.
6. Anonymous operator HTML/JS/API requests must deny or go to Access login. Verify
   real human login, pending/detail GET, and no candidate mutations during smoke.
   Public `/health`, `/v1/news`, ticker and Port NEWS remain normal.

## CLI

`node scripts/review-production.mjs list` remains authenticated read-only D1.
For details and approve/reject, obtain a **human** Access session with cloudflared
(or your authenticated browser), put it only in NEWS_OPERATOR_ACCESS_JWT env,
and set NEWS_OPERATOR_ORIGIN to the exact dedicated URL. Never log the token or
commit session files. Service credentials do not count as human decisions.

`node scripts/review-production.mjs detail candidate_id`
returns current snapshot/revision and publishable label. A decision JSON file
contains id, action, reason, requestId, snapshot, revision; approvals also contain
exact validated label/category/publishedAt and four checks from CHECKS. No actor,
SQL, facts or free text fields are accepted. Same file must be retained for retry.
`approve decision.json` / `reject decision.json` acquire authenticated CSRF and
POST to `/api/cli-decision` in the same service as the browser; no separate CLI
publication rules. CLI decisions never become adaptive human-training examples.

## UI and remaining phases

List supports all pending, REVIEW only, and source filter. Detail shows stored /
publishable labels, facts, blockers, duplicates' source/topic/original link,
quality indicator, expiry and history. Original links use HTTPS + noopener/noreferrer.
No fetch of publishers occurs when viewing or deciding. Buttons open explicit
confirmation; checks start OFF. Facts-incomplete and duplicate approval is disabled
in both UI and server. No existing publication is removed by duplicate review.

Phase B: similar decisions / recommendation. Phase C: shadow evaluation.
Phase D: separately approved limited automation. Deviser after UI operations.

## Phase A acceptance evidence (2026-10-02 JST)

- Start main/origin: c6e6ea0d, clean tracked/staged, 0/0.
- Start Port 1.13.1 / public NEWS 0.9.1, 49 approved / 13 pending / 19 rejected.
- NEWS suite 379 PASS; Port NEWS 27 PASS. Native SQLite and real local workerd/D1
  concurrency, rollback and idempotency; signed RS256 auth and Origin/CSRF tests.
- 375px / 393px / desktop rendering; 13 all / 12 REVIEW; LAVA counterpart shown;
  incomplete approve disabled; isolated fixture approve/reject history verified.
- Production migration 0011 applied after private SQL backup: 81 old rows and
  controls identical to immediate pre-migration snapshot; revision column 0, ledger 0.
- Remote D1 migration parser rejected CASE in the trigger body without applying any
  schema. SQLite-equivalent iif / conditional RAISE passed the remote migration.
- Read-only production snapshot matched all start business fields. Existing hourly
  retention independently increments controls revision; no decisions were submitted.
- Public and operator bundles dry-run PASS. Operator assets remain unpublished until
  the one-human Access policy/application are approved and real AUD is recorded.
- Existing npm audit findings (fast-xml-parser XMLBuilder, dev undici/miniflare/wrangler)
  are unchanged. jose has no reported finding. No unrelated dependency upgrade.

## Production activation and operator handoff (2026-10-02 JST)

- Access application is saved for this exact hostname, one approved email only,
  six-hour application duration, policy inherits that duration. HttpOnly cookie enabled.
- Operator URL: https://sound-cruise-news-operator.cruise-port-requests.workers.dev/
- Operator deployment: 3fbe12cc-9f7f-4d75-bb3c-fff2e849b895.
  Version: 064a8919-d934-4a07-a553-78ae0efb1502.
- Public NEWS deployment: ea600034-3f15-4a75-849b-cc712f456fbb.
  Version: 6867244e-f42c-4a5f-a733-49a34e58a829. Health reports 0.10.0;
  Port remains 1.13.1. Activation changes only deployment config/tooling/docs;
  the already prepared 0.10.0 application code is unchanged.
- Anonymous root, JS/CSS, pending, detail and decision requests redirect to Access;
  no pending content is returned. The allowed Cloudflare identity opens the UI.
- Real JWT signature/issuer/AUD, allowed identity and 21600-second lifetime checked.
  Wrong identity is covered by signed-token tests and a test using actual production
  allowlist configuration; no second person's real login was performed.
- Authenticated read-only checks: 13 pending, 12 REVIEW, one suppressed duplicate,
  source filter, detail, empty history, original links, confirmation and reason choices.
  No judgment was submitted. All 13 currently fail facts/duplicate publication gates.
- Live authenticated invalid Origin, missing/invalid CSRF, malformed JSON and wrong
  content type are denied; decision GET/PUT are denied. Assets contain no secret values.
- 375px/393px/desktop have no horizontal overflow. No operator/Port application console
  errors. The Cloudflare sign-in page emitted its own ViewTransition warning.
- Public list (49) and ticker (5) payloads exactly match before deployment. Events
  display normally and Sale is empty. All 81 candidate rows and source health are
  identical to the activation snapshot; ledger remains 0. No new migration needed.
- NEWS 379 / Port NEWS 27 tests PASS. CLI list and authenticated detail GET PASS.

For everyday use:
1. Open the operator URL and sign in using Cloudflare with the approved account.
2. Browse the pending list; use REVIEW/source filters and open candidate details.
3. Open the original article in a separate tab and check the facts and publication gates.
4. For a publishable candidate, choose 掲載する, complete the four confirmations and
   submit. To reject a reviewable candidate, choose 掲載しない and a reason, then confirm.
5. Check the displayed decision history. On an uncertain network outcome, use the
   explicit same-request retry button rather than starting a different decision.

When 掲載する is disabled, required facts or another publication gate are not satisfied;
operator permission does not override it. The UI does not complete missing facts.
Sign in again after the six-hour Access session expires. CLI tokens must stay private.

## Phase A.5 — facts recheck (NEWS 0.11.0)

See [Facts Completion Report](OPERATOR-FACTS-COMPLETION-REPORT.md) for the
13-candidate audit and explicit readiness limits. No production approve/reject.

- Additive migration 0012 is required before either 0.11.0 Worker deployment.
- Authenticated `POST /api/facts-recheck` accepts only id/snapshot/revision/requestId.
- This operation never writes the decision ledger or decision feedback.
- Verified facts remain pending/PUBLISH_REVIEW; the unchanged publication validator
  decides whether the human approval button may be enabled.
- Listing-only policies remain listing-only. Only the assessed Ikebe Event article
  path supports direct explicit event fields. Unsupported facts are not guessed.
- One source surface verification per 24h, at most robots + one surface request.
  Candidate rechecks reuse the derived facts cache; no HTML/body/headline retained.
- Recheck failures are contained: parser/timeout/structure failure does not rewrite
  a candidate or disable published visibility. Opt-out/access refusal/robots change
  stops the source; 429/5xx enforce source backoff.
- Idempotent retry repeats the exact request ID/payload. Open candidate details
  again after a stale snapshot; never submit old approval after facts update.
- Source cache retention: 24h. Recovery evidence retention: 90 days.
- Rolling Worker code back does not require destructive rollback of additive D1
  tables/column. Preserve recovery evidence and existing decisions.

## Phase A.6 targeted primary evidence (Operator 0.12.0)

The user explicitly authorized evidence checks of four existing pending candidates.
`target-evidence.js` enables original-page rechecks only for the exact existing
Ikebe event, Shimamura SHURE and Ikebe KORG URLs. IK item 19790 remains on the
existing fixed-listing workflow: its current server response does not identify
that article, and localized item 19792 must not supply facts for it.

Each targeted recheck uses the existing auth/Origin/CSRF boundary, candidate
snapshot/revision, source kill/backoff/robots gates, shared source lease, bounded
robots + one primary-page request and atomic facts/provenance transaction.
Its 24-hour cache is keyed by source, parser version and candidate; it neither
invalidates the daily listing cache nor expands scheduled collection. Repeats
use cache and request-id replay. Parser failures keep the candidate unchanged.
No article body, exact headline or image is retained.

SHURE's three agreeing explicit signals (article heading, product heading and
release statement) correct the incomplete MV6 identifier to MV6 Gen 2 on that
one URL only. Other identity changes stay blocked. KORG's model heading and
explicit introduction statement establish new_product without changing its
identity or inventing a release date. The event's labeled instructor columns
can establish a person, but the existing named-guitarist pilot remains unchanged.

Always re-run existing publication validation. Facts recovery is not a decision:
no approve/reject, decision ledger, teacher signal or automatic recommendation.
Public NEWS Worker 0.11.0 and Port 1.13.1 are not redeployed for this phase.

If the event-only Worker fetch rejects a redirect while the requested original
page is accessible to the operator's server, `node scripts/recheck-event-server.mjs`
provides a one-candidate authenticated Wrangler/D1 transport. It invokes the same
facts service against the real DB and records the actor as system_repair, never
human_operator. An event-only server-purpose cache allows one bounded verification
per 24 hours without deleting or overriding the Worker cache. The CLI accepts no
URL, candidate, namespace or decision arguments. HTTP inputs cannot request this
transport; all ordinary robots, redirects, opt-outs, backoff, source leases,
full-row CAS, atomic provenance and publication validation remain enforced.

## Operator UI 0.13.0 — 掲載可 / カード内詳細

- 「表示」の「掲載可」は pending API が返す `validation.valid === true` のみを表示する。facts の有無から掲載可否を推測しない。既存の REVIEW / 情報源フィルターと併用できる。
- 詳細は選んだカード内で1件ずつ展開し、「詳細を閉じる」で折りたたむ。ページ下部へのスクロール・アンカー・フォーカス移動は行わない。
- フィルター変更時は詳細を閉じる。非同期応答が遅れても別カードや閉じた詳細に反映しない。判断済みで一覧から消えた候補の詳細は再表示しない。
- 掲載 / 非掲載・CSRF・送信結果不明時の再送・facts 再確認は既存の手順のまま。カテゴリ・public NEWS・schema は変更なし。
- 回帰確認: NEWS / Operator 417件、Port NEWS 27件 PASS。375px / 393px / 1280pxで横overflowなし、原記事HTTPSリンク、カード内展開・閉じる、掲載確認のチェック未完了時disabledを確認。
- 本番の掲載・非掲載・facts再確認はこのUI確認では実行しない。

## Display category grouping — Port 1.14.0 / Operator 0.13.1

DTM remains separate. Both `recording_audio` and `creator_streaming` display as
「録音・配信」. Port's display-only `recording_streaming` filter selects their
union once per record. Old raw filter state maps to this display group; raw
model keys and public API category filters remain separate and unchanged.
Operator summaries use the same labels; facts/debug detail retain raw keys.
No candidate, decision, classification, ledger or D1 migration is part of this
change. SHURE remains `recording_audio`; KORG remains `amps_effects`, pending
human publication. No production decision is performed for UI verification.
Regression: Port 953 tests and NEWS/Operator 418 tests PASS; 375px, 393px and
1280px union/DTM rendering verified with synthetic creator data.

## Phase B — Operator 0.14.0: read-only insights and human evidence

- Authenticated GET `/api/summary` returns authoritative approved-status, pending/reopened, rejected counts and committed human decisions retained for 365 days. Approved count is not a claim that every record is currently visible through the public API. Filters do not change summary counts.
- Authenticated GET `/api/human-decisions?offset=0` pages 50 human decisions, newest first, with article ID/source/category/verdict/reason/date/policy only. No headline, persisted label, actor identity or auth data is returned.
- Authenticated GET `/api/candidates/:id/similar-decisions` evaluates immutable human ledger features. Optional `revision` and `snapshot` must both match current detail. Missing/stale candidates fail closed. No GET writes any D1 data.
- `structured-human-v1` signals: same source, approved structural URL surface (no article slug), article/event type, user-facing category, verified fact field presence (no values), review reason/blocker set, freshness at review (7/14/90-day buckets). Exact means all signals; strong requires source/surface/type/category/verified structure; weak means category with source or type. Display merge does not change raw keys.
- Only latest committed, unexpired, nonfuture `human_operator` decision per independent candidate is a teacher. New profiles retain hashed article/topic identities to prevent multiple record IDs for one story from inflating evidence; no raw URL slug/topic/name is retained. Fixture, automatic_policy, migration, system_repair and recovery are excluded. The candidate itself is excluded. Historical coarse features remain weak; missing surface/verified shape is never invented from mutable candidate data.
- Recommendation requires 5 independent EXACT/STRONG decisions under the identical current publication policy and one unanimous verdict. Any contrary same-policy similar decision (including weak) suppresses recommendation. A current validation blocker also suppresses approval recommendation. No older policy is approved as compatible yet; obsolete decisions are shown but excluded from recommendation evidence.
- UI shows “まだ判断データが足りません” with sparse evidence. No percentages/accuracy/confidence scores, automatic decisions, adaptive rules or pattern activation are added. Existing publication/CSRF/idempotency/CAS/atomic ledger rules remain authoritative.
- Read-time `news_recommendation_observed` structured logs contain only candidate ID/snapshot/revision, generation time, version, verdict, evidence count, similarity level, policy and decision IDs. They can be joined to the final ledger by candidate/revision. Existing log retention applies; no permanent view tracking table is added.
- Future human decisions append `insightsProfile` and `shadowEvaluation` to the existing JSON feature column in the SAME atomic decision INSERT. The evaluation is recomputed at decision time (may differ from an earlier screen if other decisions arrived), and records final operator verdict/version/evidence/reasons/decision IDs. Nonhuman decisions retain coarse features. Historical ledger rows are not rewritten and have no retrospective shadow result.
- Phase C can measure recommendation coverage/agreement, contradiction and approve-vs-reject mismatches using these envelopes and human verdicts. Mismatches are evaluation proxies, not objective article truth. No meaningful accuracy is claimed from the current two cases. Public Worker/Port/schema unchanged; no migration needed.
- Release verification: NEWS/Operator 431 tests PASS, including actual local workerd/D1 atomic human evidence, JWT/Origin/CSRF, stale context, threshold/contradiction/obsolete policy, text-safe UI and human-only history. Local 375px/393px/desktop checks passed with no horizontal overflow or console errors.

## Phase C — Operator 0.15.0: shadow-only measurement

### Storage and timing

Phase B ledger JSON stores features only when a human actually decides. It cannot
retain an undecided candidate's first/later observation or count NONE coverage.
Additive migration `0013_shadow_evaluation.sql` therefore adds one immutable
`news_shadow_evaluations` table with candidate/revision and version indexes.
It adds no candidate/ledger columns and does not backfill or relabel any record.

Authenticated POST `/api/shadow-evaluate` records a single `{id,revision,snapshot}`
or `{scope:"pending"}` (max 100; larger queues use per-ID calls). Candidate full-row
CAS, exact snapshot and pending status are checked. Only audit rows are inserted.
State + history-watermark + policy/rule + coarse profile determine the review
observation ID; repeats return the first row, not a new record per timestamp.
Detail open also saves an observation after the existing read-only similarity GET.
Dashboard GET does not write. No schedule or collection-hook changes are added.

Human decisions always recompute immediately before the existing decision INSERT.
Their shadow envelope is inserted by a BEFORE ledger trigger in the SAME atomic
statement as candidate/feedback/ledger updates. A failed decision rolls back that
envelope too. Successful retry replays the existing ledger result. Old Operator
versions without an evaluation ID remain supported during additive rollout.

Envelope: evaluation ID, candidate ID/revision/snapshot, evaluated time, contract
`shadow-v1`, policy version, recommendation rule `structured-human-v1`, recommendation
(including NONE), reason, level, evidence/approve/reject/contradiction counts, matched
IDs (first 50, explicit truncation) and full teacher-watermark hash, source/raw
category/type, reviewability, validation error codes and coarse immutable profile.
No body/HTML/original headline, product/artist names, actor identity, tokens or
secrets are stored. Existing structured features remain name-free. Shadow rows
have 365-day query retention and lazy physical expiry on a later insert. They do
not depend on candidate retention or a public Worker redeploy.

### Measurement contract

Authenticated GET `/api/shadow-metrics` aggregates only current policy AND current
recommendation-rule results. Raw human total and recorded-observation total are
separate from eligible matched/independent human denominators. Legacy SHURE/KORG
have no pre-decision shadow envelope: they stay real teachers but UNMATCHED for
shadow comparisons. No retrospective evaluation is invented from current facts.

Matching requires the ledger's own evaluation ID, exact candidate/revision/snapshot,
current versions, evaluation not later than verdict and at most 30 minutes before
it. The latest human decision per candidate is considered; missing/newer evaluations
never fall back to an older verdict. Article/topic hashes collapse cross-source or
duplicate IDs; retries/revisions do not inflate independent evidence. Human-only,
committed, retained ledger cases are used; all automated/fixture/recovery cases
are excluded. Similarity and recommendation threshold 5 remain unchanged.

Six comparison classes distinguish agree approve/reject, false publish direction,
missed publish direction and NONE + human approve/reject. These are comparisons
against operator judgement, not objective truth labels. Coverage = recommendations /
independent matched human cases; agreement = agreement / recommendations; contradiction
rate = contradictory cases / independent matched cases. Empty denominators are null.
Observation NONE counts include undecided candidates and do not enter agreement.
Pattern breakdown: source/surface/display category/type/fact field shape/policy/rule.

### Readiness and UI

N < 10 hides percentages and says evidence is insufficient. N >= 10 still does NOT
establish readiness. Auto-publish and auto-reject risk flags are separate. Any
false-publish direction deserves stricter investigation for publishing; missed-publish
for rejection. Conditions for future Phase D: sufficiently large independent sample
per narrow pattern, stable policy/rule, sustained evidence over time, useful coverage,
low contradiction, no/near-zero asymmetric error with uncertainty review, and explicit
operator approval. Numeric readiness cutoffs need prospective data; do not fit them
to the current two cases. Deterministic duplicate/expiry/out-of-scope rejection would
need its own validation track, not category-wide activation.

UI adds a small Shadow section, observation/comparison totals, low-N notice and optional
pattern detail. It does not announce agreement after decisions or change confirmation
buttons. No auto approve/reject, adaptive rule table, rule promotion, feedback activation
or publication hook is present. Access/JWT/CSRF/Origin/idempotency and existing validation
remain authoritative. Public NEWS and Port are unchanged.

### Production run

Use `node scripts/migrate-shadow.mjs plan`, then `apply` after tests. It checks the
isolated NEWS DB, exports a private backup, requires exactly migration 0013 pending,
and compares all candidate/ledger/control rows after applying. Operator deploy requires
0011/0012/0013 and a freshly verified Access receipt. Generate current pending observations
with the authenticated audit-only button, never with decision/recheck buttons.

Phase C preflight measured 2026-10-03: approved 53 / pending 17 / rejected 19 /
human ledger 2. The 06:01 JST existing scheduled collection added 8 records since
Phase B (2 automatic approvals, 6 pending); none are new human teacher signals.
Release checks: NEWS/Operator 444 tests PASS including actual workerd/D1,
shadow-state idempotency, stale revision/time/version, six verdict comparisons,
independence, low-N UI, auth/CSRF, atomic rollback and 365-day shadow-only expiry.
375px/393px checks: no horizontal overflow; normal decision buttons remain guarded.


## Operator 0.16.0 — Refresh and last successful update

Every refresh freshly requests pending, summary, Shadow metrics and first-page human history, even while history is collapsed. Reads retain browser no-store and authenticated Operator response no-store; public NEWS cache is unchanged. Concurrent refreshes share one promise. Late history pagination responses cannot overwrite a newer refresh.

The header timestamp is successful UI acquisition completion time in Asia/Tokyo (YYYY/MM/DD HH:mm:ss), not candidate modification or cron time. Failed acquisition preserves the last successful timestamp and prior data, and explicitly reports failure. The button shows 更新中… while requesting.

### Read-only production audit — 2026-10-03 07:42 JST

Baseline main/origin 1ad96c18; Port 1.14.0, Operator 0.15.0, public NEWS 0.11.0. Approved 53 / pending 17 / rejected 19 / human decisions 2. Actual approvable count **1**. The pre-change authenticated production UI also displayed one candidate with all sources after refresh. Reported zero is not reproducible here; its prior cause is not established. No publication validation change.

A single remote D1 SELECT snapshot was evaluated with exact repository reviewQueue/publicationValidation/runtimeSources and configured fingerprint pepper in a private in-memory database. No secret output.

| Candidate ID | Status | validation.valid | Reviewability | Blocker | Facts present | Duplicates |
|---|---|---|---|---|---|---|
| 2aa5995986389cd0d7a77695d0e203a49681a9722101212124ba0eea1b1201d9 | pending | false | FACTS_RECOVERY_UNCERTAIN | facts_incomplete | false | 0 |
| 3999b43277c5825c8b96c8a220a7729003a53125c36e751c25128b95bc649e81 | pending | true | READY_FOR_HUMAN_DECISION | none | true | 0 |
| 1b402c7d5e33e32b993c8109787368f3f1a0d5a6052d62d9df01fdd4b6d4ca28 | pending | false | FACTS_RECOVERY_UNCERTAIN | facts_incomplete | false | 0 |
| bd2d0be4e45e696a20ad5a3b7919b8ec3261eb132ded7168d6646ae7ef6d7a4a | pending | false | FACTS_RECOVERY_UNCERTAIN | facts_incomplete | false | 0 |
| 368e218d4d5072a545f671dbf0b50dff5a7a6c21e5e6bf0fe545213cc2b9f3cb | pending | false | FACTS_RECOVERY_UNCERTAIN | facts_incomplete | false | 0 |
| 4020bf1b51afb5a9a6d290f79281834f27d30314282da0a1553d9b8b08fed92f | pending | false | FACTS_RECOVERY_UNCERTAIN | facts_incomplete | false | 0 |
| 4632d340b4ef7ea60e45df539514f767fdbc103aa6c68921d0353235a949b949 | pending | false | DUPLICATE_BLOCKED | duplicate | true | 1 |
| b3462045cf60048fd40ed3efd260453b8d69089647e61538e7f3625d5518c88f | pending | false | FACTS_RECOVERY_UNCERTAIN | facts_incomplete | false | 0 |
| b44fe9ca6a358d9cb333956f9823903f2079b54a8dd240096c262fd5101831d5 | pending | false | FACTS_RECOVERY_UNCERTAIN | facts_incomplete | false | 0 |
| b7cb377c374722cf20bc5b9da2aed032dae4e03984573ac1193eca98fc92d286 | pending | false | FACTS_RECOVERY_UNCERTAIN | facts_incomplete | false | 0 |
| bf0895e2038bdbbef32652e055571dfd47f7a7065e7276f8191cfa37bcfe3c88 | pending | false | FACTS_RECOVERY_UNCERTAIN | facts_incomplete | false | 0 |
| 3a6dd027f7b38e59be5d4f7914d47d278c1794f806409b62d38a81a949571f08 | pending | false | FACTS_RECOVERY_UNCERTAIN | facts_incomplete | true | 0 |
| b5c0c40743312c4f6c874924662b353ee970947208e4e070d12bd3ce0c129c23 | pending | false | FACTS_RECOVERY_UNCERTAIN | facts_incomplete | true | 0 |
| d85da4caddbcc68b4b9cab37d5527ee778675146f721c90116eca60c72254c7c | pending | false | FACTS_RECOVERY_UNCERTAIN | facts_incomplete | true | 0 |
| a740971f365a8fdcce2e32ddd03c6c4f0f7d301db127e50a71a10075b1cc3cdb | pending | false | FACTS_RECOVERY_UNCERTAIN | facts_incomplete | false | 0 |
| c19282ac70cf8692ec98ca9eb974b74c6d87ec5082d0d6c09216387f22edae18 | pending | false | FACTS_RECOVERY_UNCERTAIN | facts_incomplete | false | 0 |
| a9f0b5e8e738478cb114ad64f771573a08541d21cdf2d5beef971b458e89e8f3 | pending | false | FACTS_RECOVERY_UNCERTAIN | facts_incomplete | true | 0 |

Exclusive totals: ready 1 / facts_incomplete 15 / duplicate 1 / policy or other 0. Complete candidate and ledger rows are compared before and after production checks. No production approve/reject/facts recovery/Shadow writes or migration. NEWS/Operator regression suite: 447 pass.

## Operator 0.17.0 — Review information architecture

Cards prioritize the unchanged server-generated `validation.publishableLabel`, then a safe existing label, otherwise a concise missing-title state. Display categories use the existing Port labels; unknown categories are explicitly unresolved. Status and 掲載可 counts use the pending API's authoritative validation/reviewability, never facts presence alone. All / approvable / needs review / duplicate / REVIEW and source filters remain available.

Surface decision buttons fetch a fresh detail snapshot before opening the existing confirmation. Late reads and filter/detail changes cannot substitute another candidate. Existing confirmation checks, category/publishedAt/label payload, CSRF, request ID, retry, server CAS and publication validation are unchanged. No button auto-decides.

Inline detail defaults to 概要; 根拠 holds facts/provenance/internal validation and the existing recheck control; 学習 holds existing similarity/recommendation and Shadow information; 履歴 holds candidate decisions. Similarity loading and the existing idempotent shadow-observation workflow happen when learning is requested, rather than when overview opens. Global Shadow and human history remain accessible in the collapsed operations area. No new recommendation, shadow, decision, facts, auth or schema logic.

UI verification must never submit production decisions or facts recovery. Use synthetic local records for confirmation/learning tests. Public NEWS Worker 0.11.0 and Port 1.14.0 are unchanged; only Operator is deployed.
