# NEWS-FINAL production operations

Preparation status (2026-09-29, offline SALE safety closure): **Production Port
baseline = 1.4.3 (`be28371f`); NEWS candidate / uncommitted WIP = 1.5.0**.
News Worker candidate is 0.2.0. No News Worker/D1/Cron has been created in this phase.
The provider remains `fixture` (23 items) until the production API passes smoke checks.

Offline verification: News 120, Port 885, Shared 226, Sync 394, Pitch 30,
Fretboard 25, Rhythm 19, Chord 95 = **1,794 PASS**. Tests and synthetic reproductions
ran with OS outbound blocking and Node connection monitoring: publisher requests 0,
external attempts 0. The previous browser acceptance belongs to the earlier phase;
this phase tested deadline rendering/timers/wake with an injected clock and DOM.

SALE closure now rechecks current source + SALE authorization before automatic
approval, rejects benefit-only and single-item promotions ahead of scope, and keeps
uncertain store/brand scope in review. Approved rows have a nullable inclusive
`sale_ends_at` display deadline, separate from retention. Migration 0007 backfills
legacy date-only SALE facts; bootstrap includes the projected field. No production
migration has been executed.

The old `news-final` automatic continuation remains PAUSED. Live validation is a
separate next phase; do not resume the stale automatic release prompt implicitly.

## Authorized rollout

Run in `workers/sound-cruise-news`. Use installed Wrangler 4.131.1 and the existing
Cloudflare OAuth account. Never point these commands at the Sync Worker/DB.

1. At/after **2026-09-30 08:16:26 JST**, run `npm run validate:final` once.
   The script checks the stored interval and robots digest and creates a persistent
   attempt guard before one listing GET. It never follows articles/images/pagination.
   Only projected candidates, derived facts and keyed sketches persist. The secret
   is generated in the ignored `.local/production-secrets.json` with mode 0600.
   Do not remove the attempt guard to retry. On failure, inspect the structural
   counts and follow the user's alternative SAFE-source instruction; no second GET.
2. Inspect `.local/final-validation.json` and all derived labels. Require `ready=true`,
   reasonable counts and no compliance error. `npm run rollout -- provision` then
   creates/reuses **sound-cruise-news** and applies migrations. The script is gated
   by successful live evidence. The binding UUID is not a secret; the pepper is.
3. Run `npm run deploy:production`. The production config names only the independent
   **sound-cruise-news** Worker. The dedicated DB still has all three controls OFF.
4. `npm run rollout -- bootstrap` imports the accepted first collection metadata,
   including its next eligible time. This avoids a second listing request at launch.
   The same collector sink/automatic publisher ran on that snapshot during validation.
5. `npm run rollout -- enable` requires at least one automatic item, then enables
   collection, automatic publication and API in one SQL update.
6. `node scripts/smoke-production.mjs --connect-port` checks own API, CORS, kill,
   tombstone and retained data, then switches Port's provider to `api`. It does not
   fetch publisher article URLs. Confirm returned Worker URL matches Port config.
7. Run all eight suites, browser acceptance, diff/check and secret scan. Explicitly
   stage only the reviewed NEWS/Port/config files. Commit, then normal push to main.
   GitHub Pages builds from `main:/`; wait for the successful `pages-build-deployment`
   run. Smoke Port and ensure `/workers/sound-cruise-news/wrangler.jsonc` now returns
   404 after `_config.yml` excludes `workers/` from Pages. The public repository must
   also contain no secret files; Pages exclusion is not a replacement for that rule.

## Runtime and publication

One allowlisted, live-validated source may run. Registry compliance/robots/discovery
evidence, global D1 controls, source kill, interval and lease all precede requests.
Production uses the same bounded collector as local tests. Successful runs permit
only `AUTO_PUBLISHABLE` candidates with a verified facts-only template and a valid
current-key fingerprint to be approved. Policy/date/URL/category/source health and
DB kill/tombstone/topic uniqueness checks apply again at publication.

Fact-only headline similarity is advisory. Unknown brands/products/events, mixed
campaign announcements and uncertain records remain `PUBLISH_REVIEW`, never silently
deleted for low confidence. Review candidates are visible through the operator CLI.
Sale items (NEWS 1.5.0, category `sale`) follow the same boundary. A sale can be
`AUTO_PUBLISHABLE` only from a source whose sale capability is approved
(`saleCollection: approved`); Ikebe and Sound House are `pending_evidence`, so their
sales can at most wait for review. Publication re-derives the facts-only sale label and
rechecks current SALE authorization and skips any sale whose deadline (JST) has passed.
A missing/malformed capability, stale common evidence, disabled source or unhealthy
source cannot approve an old AUTO candidate; the candidate remains pending. Coupon/points/shipping-only, single
items and small shop promotions are rejected before storage.
No human action is needed for ordinary automatic items. Article-level HTML/meta was
not fetched or claimed checked: automatic publication is limited to approved listing
metadata, robots paths, response headers and listing opt-out signals. Existing manual
review retains its more detailed checklist; the automatic path does not forge it.

## Schedule and retention

`0 21 * * *` means 06:00 JST; `17 * * * *` is an independent hourly purge.
[Cloudflare documents UTC schedules and up to 15-minute trigger propagation](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
Both triggers run physical retention before other work. A one-hour lead avoids
retaining items beyond 90 days between hourly purges. Published/query dates remain
bounded to 90 days. Source alerts/audit (structured operational codes only) have a
365-day lifetime; raw publisher HTML/title/body/image is never stored.

The first 06:00 run after an 08:16 validation may be skipped because 24 hours have
not elapsed. Do not lower the interval to force it. Initial accepted news is already
imported, and the following eligible daily run resumes collection.

## Operator visibility and controls

`npm run operator -- status` reads controls, source health and the last 30 alerts.
`npm run operator -- candidates` shows pending/review/automatic decisions and links.
`npm run operator -- runs` shows bounded collection outcomes. These use Cloudflare
OAuth and the dedicated production D1 binding, not public admin HTTP endpoints.
No safe reusable operator email channel exists in the NEWS boundary, so no email
provider/secret has been introduced. Abnormal state and deduped transition alerts
are durable in D1; the CLI and Cloudflare failed Cron events are the operator check.
Pro membership or Account sign-in does not grant NEWS administration.

Examples (reason codes are required):

```
npm run operator -- control global-off global operator_stop
npm run operator -- control source-disable shimamura policy_change
npm run operator -- control item-delete ITEM_SHA256 owner_request
npm run operator -- control api-on global review_complete
```

CLI mutations first stop the API to fail closed if execution is interrupted. After
a source/item takedown, inspect status and explicitly re-enable the API if appropriate.
Source enabling still requires current evidence. `publish-off` stops new automatic
publication; `collection-off` stops acquisition. `global-off` stops all three.
Item tombstones survive 90 days, preventing rediscovery from restoring deleted news.
Public API checks controls before its short internal cache; cache revision changes
are atomic in Worker writes. Browsers use `no-store` and never reuse hidden news.

## Port fallback and secrets

Port API failures/kill responses hide the ticker and show a NEWS-only message. They
do not affect practice/gear/sync and do not fall back to potentially withdrawn data.
The original fixture stays available for explicit development mode, filtered by the
existing 7/14-day ticker and 90-day list rules.

Never print or commit the pepper, OAuth token or `.local/` files. Upload the pepper
with the protected Wrangler `--secrets-file` path only. All migration/deploy scripts
are gated on live acceptance and validate the independent Worker/account/DB target.
[D1 migration behavior](https://developers.cloudflare.com/workers/wrangler/commands/d1/#d1-migrations-apply)
was checked against installed command help before preparing the rollout.

## SALE visibility and pagination (1.5.0 WIP)

Migration `0007_sale_visibility.sql` adds `sale_ends_at` (inclusive epoch ms).
Date-only deadlines include the entire JST day; an explicit HH:mm / H時M分 wins.
The exact deadline is visible, +1 ms is expired. Unknown end dates use normal NEWS
windows and require human review (not AUTO). Expiry never deletes the D1 row:
existing 90-day physical retention, takedown and audit rules remain unchanged.

The API filters expired rows in SQL before LIMIT/OFFSET and ticker 7/14-day fallback.
Additive `nextCursor` (published_at + id) supports stable continuation when earlier
rows expire between requests; Port prefers it over legacy offsets. Each edge-cache
entry has an explicit validity deadline, also checked on cache hits, capped by the
next sale transition. The public sale projection adds nullable `saleEndsAt`.
Port validates it, filters list/category/ticker, updates open screens at expiry and
on wake, and cancels old rendering timers before another API load/kill/error.

Shimamura final live validation passed on 2026-09-30 08:39:30 JST (one GET).
See FINAL-LIVE-VALIDATION.md. Source and production controls remain OFF.
Next, upon separate production authorization: News D1/migrations,
Worker + Cron deployment, initial metadata bootstrap, collection/publication/API
controls, API smoke and Port integration, production smoke, 1.5.0 release.
