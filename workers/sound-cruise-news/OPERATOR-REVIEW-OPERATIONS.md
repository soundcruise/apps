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

Operator config starts fail-closed: actual team issuer / unset app AUD, workers.dev and preview off.
After the real Access app is approved, set exact team issuer and app AUD from the
actual dashboard. Use a dedicated protected operator hostname, no wildcard,
Allow policy restricted to one approved human email, no Bypass or Service Auth.
NEWS_OPERATOR_EMAILS is a **secret**, not a public repo variable.

Ignored `.local/operator-secrets.json` (mode 0600) contains NEWS_HEADLINE_PEPPER
(the existing NEWS pepper, never rotate incidentally) and NEWS_OPERATOR_EMAILS
(JSON array string). Never paste either into a browser UI or command arguments.
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
