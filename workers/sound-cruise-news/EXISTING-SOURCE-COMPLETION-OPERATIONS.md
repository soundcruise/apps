# Existing Source Completion operations — NEWS 0.8.2

## Bounded pending recovery

`src/pending-replay.js` exports `recoverPendingCandidates`. It is an authenticated operator-side function, not a public API. It does not fetch a publisher or ingest new records.

Use only after a separately authorized official Ikebe listing recheck, with memory-only HTML/headlines and `scripts/research-retention.mjs` guarding retained facts. Supply at most nine unique existing pending candidates and exact listing proof: discovery URL, status 200, headerOptOut=false, SHA-256 hash, and timestamp no older than one hour. Preserve canonical URL, published/feed dates, identity and expiry. Missing product/type/event facts remain REVIEW. Do not reuse this sprint's expired proof or infer missing facts from model names.

The function respects legal/source gates and item takedowns, compare-and-set guards prior row facts, and audits each recovered update. Publish only through `publishAutomatic` and its existing publish-time source, facts, duplicate, expiry and decision gates. Close confirmed duplicates through `operatorDecision` / `scripts/review-production.mjs`; never direct-update review status or revive rejected records.

Seven facts were recovered in this sprint; five existing candidates were published, one duplicate rejected, and six total pending remain. See the report/evidence for exact scope.

## One-use Sleepfreaks diagnostic

`scripts/diagnostic-worker.js` is a separate temporary Worker entry point. It is not part of the NEWS production fetch handler and has no Cron. Any future run requires fresh explicit authorization and a new bounded request budget; this sprint's three publisher requests are already consumed.

Deploy only to the same NEWS production Cloudflare account with NEWS_DB bound to the NEWS database, never Sync. Use a high-entropy DIAGNOSTIC_TOKEN supplied privately, a unique DIAGNOSTIC_RUN_ID matching the required UUID pattern, and a short DIAGNOSTIC_EXPIRES_AT. Do not put secrets in tracked files, command-line output or report artifacts.

The `/robots-check` POST requires the secret, expires, and requires Sleepfreaks disabled=1, publication_blocked=0, takedown=0 and valid source evidence. A D1 INSERT OR IGNORE consumes the run identity before network, preventing concurrency/retry from issuing a second GET. Only the fixed official robots URL, declared existing UA and bounded fetch are used. On non-200 the body is cancelled unread. On 200 the robots body stays in memory; only safe headers/status/hash/parsed decisions are returned.

Compare against at most one simultaneous operator-terminal robots GET. Worker403/terminal200 => collection stopped, no feed request, no refusal bypass. Both200 alone is not sufficient: reviewed policy/robots must be unchanged before any separately budgeted Worker feed validation. 403/451/429/redirect/challenge/unknown outcomes remain stopped. Never alter UA, proxy, route, login or source identity to evade refusal.

Delete the temporary Worker after the authorized run. This sprint's `sound-cruise-news-check-cfd6d696` was deleted. Its production diagnostic result was Worker403 / terminal200. Collection remains OFF; previously approved five articles remain visible. A specific WAF/block rule is not confirmed.

## Preserved production boundary

Port remains 1.10.0. NEWS is 0.8.2. Source IDs and Cron expressions are unchanged. No new source, Cloud Sync, Account or AI Support changes. Retention and existing operator judgments remain effective. The report is PARTIAL COMPLETION, not an all-source collection success claim.
