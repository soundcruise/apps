# Coverage Expansion Phase 1 operations (NEWS 0.4.0 / Port 1.6.0)

This document supersedes the 1.5.0 hourly/single-source operation profile. Historical initial-launch commands must not be rerun.

## Identity / safety

All operator mutations authenticate with Wrangler OAuth against account `a9f2a3e9fcb6d0f68fd2eaa9df909e33`, Worker `sound-cruise-news`, D1 `13267817-d259-4fde-80d3-37766f8f3f11`. `remote-db.mjs` rejects a mismatching configuration. Account end-user login is not an operator role. There is no public review UI or HTTP approve/reject route. CLI requires Cloudflare write privileges; private `.local/production-secrets.json` is ignored and must never be staged or printed.

## Schedule / request modes

`0 21 * * *` is 06:00 Asia/Tokyo daily. Cloudflare Cron uses UTC ([official documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/)). Retention remains hourly `17 * * * *`. Scheduled collection atomically consumes a source's JST day before its first request; duplicates, retries and failures cannot collect that source again that JST day. The next day is independent of the voluntary strict 24h interval, so 2026-10-01 06:00 JST can run after today's acceptance collection. Actual backoff, disable/takedown, robots, policy, health and 401/403/451/429 gates still apply.

Normal legacy/manual calls retain the voluntary 24h guard. `collect:production` uses separately audited `operator_validation` and reason `coverage_validation`; it does not consume a scheduled day. A robots proof can be reused only when its original timestamp is <=1h old and its hash matches the reviewed source; never refresh its timestamp artificially. Cron fetches fresh robots. No pagination, articles or publisher images are fetched by collectors.

Production allowlist: Shimamura, Kikutani, Sleepfreaks, Music Natalie. Enablement is a restricted factual metadata pilot based on first-party evidence and documented policy silence; it is not an explicit publisher automation license. Other sources, including Sound House/Ikebe and all automatic SALE surfaces, stay OFF. Policy evidence expires after 90 days and requires renewed assessment.

## Review workflow

Run from `workers/sound-cruise-news`:

```sh
node scripts/review-production.mjs list
node scripts/review-production.mjs approve /private/tmp/decision.json
node scripts/review-production.mjs reject /private/tmp/decision.json
```

Queue exposes independent label, source/date/category, minimal facts, reason and official link; it omits original headlines and headline fingerprints. Approve JSON includes `action`, `id`, exact factual `label`, `category`, `publishedAt`, `reason` and `checks` with `factsChecked`, `relevanceChecked`, `duplicateChecked`, `independentLabelChecked` all true after operator review. Facts must already be supported by the validated official surface. Approval rechecks evidence, healthy source, pending state, keyed provenance, category, date/90d, source/item kill and publication controls. It does not fabricate article-check flags. Reject JSON needs `action`, `id`, `reason`. Allowed reasons: `facts_identifier_missing`, `date_uncertain`, `category_uncertain`, `not_relevant`, `duplicate`, `useful_product`, `policy_concern`, `operator_review`.

Each action records audit and bounded reason feedback. Feedback is not a persistent classifier bypass. Rejected rows remain subject to existing retention, and re-fetch cannot resurrect approved/rejected rows. Pending REVIEW is never silently discarded before the existing retention deadline.

## Legacy restoration

```sh
node scripts/review-production.mjs backfill-legacy
```

Only the unchanged, user-approved 23-record fixture with compiled digest is eligible. No publisher request occurs. Original dates/categories/labels/URLs are preserved. URL, topic and known product facts suppress duplicates. Exact per-row grants make approved legacy records visible without granting live collection permission to those publishers. Grants match label/source/URL/date/category plus fixture digest; source/item takedown, controls and 90d expiration still apply. Completion audit prevents an ordinary repeat. Do not change this command into a generic manual publication bypass.

## Collection / publication acceptance

```sh
node scripts/collect-production.mjs shimamura
NEWS_PUBLISH_AFTER_COLLECTION=yes node scripts/collect-production.mjs kikutani
NEWS_PUBLISH_AFTER_COLLECTION=yes node scripts/collect-production.mjs sleepfreaks
NEWS_PUBLISH_AFTER_COLLECTION=yes node scripts/collect-production.mjs natalie
```

Inspect queue before approval. Operator validation may happen more than once on a day only when necessary; report all attempted requests, including failures. Stop that source on refusal/opt-out/policy change rather than retrying it blindly. The collection report's pending count means newly inserted candidates, not AUTO count. Reassess stored candidate decisions to measure AUTO/REVIEW and publish only actual eligible candidates. Metadata/article HTML and original titles are transient; persistent data is independent labels, dates, identifiers, URLs, keyed fingerprints, health and counts.

## Rollout / rollback

Before rollout verify diff, all eight suites, secret scan, syntax/bundle, publisher request accounting and this rollback path. Apply additive migration 0009 to NEWS_DB only; validate the existing production API still works. Restore legacy and perform audited collection. Deploy the reviewed production Worker with four-source allowlist and daily/retention triggers; verify deployed account/DB/vars/Cron/secret presence/health. Push Port through normal `main` fast-forward and GitHub Pages deployment; verify production version, API and 375/393/desktop views.

On a source issue, stop that source using existing operator controls and explicitly re-enable the API after the fail-closed control command if appropriate. On a collector issue, disable collection/publication via audited controls, then explicitly re-enable API to serve retained approved news. On unsafe content, stop API too. `scripts/operator.mjs control ACTION TARGET REASON` intentionally switches API OFF before applying changes; consult `src/admin.js` for supported actions and re-enable explicitly.

Historical baseline Worker version: `c6731b2b-cd0d-446d-8708-0790c11cb017` (NEWS 0.3.0). Do not resume collection on that old version after migration 0009: its positional collection_runs insert predates the additive request_mode column. Use the current hard-OFF profile for emergency rollback. A historical version may serve the old API with collection OFF only; checking/restoring triggers/vars remains mandatory. The hard-OFF/no-Cron `wrangler.infrastructure.jsonc` profile is the emergency fallback; inspect metadata and controls after deployment. Keep additive 0009 schema in place: never drop tables/columns to roll back code. Legacy rows are identifiable by `origin=legacy_fixture_backfill`; any content rollback must be targeted and audited, preserving initial AUTO/news data. Roll back Pages with a normal Git revert and push; never reset/force-push. Review partial deployment outcomes before retrying.

Cron configuration is verified at release. The first 2026-10-01 06:00 JST scheduled production run is a future observation; do not claim it has already happened. Cloudflare notes trigger propagation can take up to 15 minutes.
