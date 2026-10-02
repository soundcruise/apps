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
