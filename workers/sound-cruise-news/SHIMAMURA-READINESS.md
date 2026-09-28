# Sound Cruise NEWS-JP2B-5 Shimamura Readiness Report

## Overall Verdict

**SOURCE STILL NOT READY**

N-1/N-2/N-3 fixes pass regression checks. Current Feed validation and current
site-structure evidence are incomplete. No candidate collection or publication.

## 1. Baseline

2026-09-28: branch main; HEAD = origin/main =
`7a320062cd55bdccaccbd8e33b28efbb09a468f7`; ahead/behind 0/0; staged 0.
Port 1.3.0 candidate / News Worker 0.1.0 retained. 13 tracked modifications and
existing untracked JP2A/JP2B files preserved. Known .claude/ and Sync node_modules
untouched. No release/version change for this unpublished safety-fix phase.

## 2. N-1 Fingerprint Fix

Secret-injected HMAC-SHA256; separate exact/key-ID/gram domains; normalized
NFKC/case/space/punctuation; at most 64 bottom-k keyed trigrams. Missing/short
pepper or wrong key ID fails closed. Test-only deterministic key stays in tests.
No actual pepper was generated or persisted in this session.
Migration 0003 removes active title_hash, clears legacy signatures and prevents
old approvals. No attempted conversion. Local CLI D1: 3 legacy pending, 4 legacy
rejected; 0 approvals; collection/API both 0. Wrangler local D1 migration also
completed. Historical migration SQL references remain only for ordered upgrades.
This does not erase historical backups or promise forensic page wiping.

## 3. N-2 False Fact Fix

Dictionary extraction requires explicit brand AND product. LUNA does not imply
Universal Audio. Unknown facts/events remain pending/label_required. No inference
from common words; explicit event terms only. LUNA SEA and Luna guitar probes
never generate UA facts. BOSS requires explicit uppercase brand and known product.

## 4. N-3 Evidence Corrections

- Kanda: https://www.kandashokai.co.jp/terms/ replaces obsolete notice.html evidence.
- ESP: https://espguitars.co.jp/support/link prohibits deep links; CONTACT/OFF.
- Audio-Technica: https://www.audio-technica.co.jp/corp/privacypolicy contains
  website terms plus link conditions; both fields point there. No framing or
  misleading affiliation; comply with removal requests. Automation unapproved.

## 5. Shimamura Policy Evidence

Official terms and link policy: https://www.shimamura.co.jp/siteusage/ . Same URL
because that page contains the link conditions. Commercial/noncommercial links
generally unrestricted; source must be identifiable; no frames; separate window;
top URL recommended, other URLs not categorically forbidden.
No explicit automated collection permission found: **documented silence**.
Internal limited-pilot rationale: public Feed, robots, once daily, metadata only,
no source headline/body/image publication, independent labels, 100% human review,
direct source links, kill/takedown. Not publisher permission or a legal verdict.
reviewedBy=operator, reviewedAt=2026-09-28. policyDecision remains incomplete
because technical discovery evidence is incomplete.

## 6. Shimamura Robots

https://www.shimamura.co.jp/robots.txt : one GET, 200, valid.
Observed 2026-09-28T13:17:10.266Z. SHA256:
`7483de89e6e58bf2a2b555a443d477bca2a40e1cf6720d52b32d2c92ef5d2447`.
No Crawl-delay. Explicit refusals /p/test.xml and /originalbrand/ryoga/member.html;
Update! and candidate Feed paths allowed. No bypass or special exception.

## 7. Shimamura Discovery

https://www.shimamura.co.jp/update/feed/ : one request attempted; no validated
response. Report records network_or_local_failure, no confirmed HTTP status or
Feed contents. discoveryReviewedAt=null, discoveryValid=false. No retry and no
alternative Feed guessed. Separate Update! listing request also failed to yield
usable evidence. Robots 1 + Feed 1; listing probe 1; no article/image requests.

## 8. Source-Specific Rules

Provisionally allow /update/guitar-bass/ and /update/amp-effector/, whose direct
links were verified in JP2A fixtures. Do not add unverified dtm-recording/PA paths.
Reject shop/sale/campaign/event/lesson/recruit/coupon/used path segments and
metadata, generic shop notices and non-Gear categories. Latest site-structure
verification remains incomplete: sourceRulesReviewed=false.

## 9. Phase-1 Gate

**READY NO**. Gate tests require complete/current SAFE evidence, valid robots and
Feed, source rules, >=12h interval and source production OFF. Final gate also
requires global collection/API OFF and empty Cron. Config remains 24h, all source
enabled=false, productionEnabled=false. localPilotEnabled=false.
Sleepfreaks/Hookup remain disabled/incomplete.

## 10. Live Dry Run

Not executed: evidence gate did not pass. Only bounded evidence probes occurred.
0 collected/approved/published candidates. No raw Feed/headline was persisted.

## 11. Candidate Examples

No actual candidates: Feed validation failed. Regression-only synthetic examples:

| Independent label | Category | Event | Confidence | Status |
|---|---|---|---|---|
| Universal Audio、LUNA 3を更新 | dtm_software | update | explicit brand/product/event | pending |
| 審査待ち（製品名と出来事の確認が必要） | electric_guitar_bass | new_product | low / label_required | pending |

These are test outputs, not live Shimamura news.

## 12. N-1 Security Probe

Pass: raw/pepper/unsalted digest absent from saved candidates; legacy column absent;
old rows quarantined; public API projection excludes fingerprints. Punctuation,
whitespace, NFKC, case and reordered near copies rejected; independent label
accepted. Long reordered input exercises actual 64-gram sampling. Public unkeyed
hashes do not match signatures; different secret changes signatures and blocks
approval. DB-only enumeration using the stored salt is no longer possible because
there is no stored salt/key enabling verification. Security assumes a strong,
separately held secret; length/equality leak and key compromise remain limitations.
Similarity is heuristic, not exhaustive proof of non-copying.

## 13. N-2 False Attribution Probe

Pass: explicit UA+LUNA and BOSS+GX-1 extract; LUNA SEA, Luna guitar, LUNA alone,
BOSS alone, lowercase common-word boss, Reason/Logic/Studio and unknown products
do not supply inferred brands/products. Unknown event remains other/label_required.

## 14. Tests

| Suite | Passed |
|---|---:|
| News | 43 |
| Port | 821 |
| Shared | 226 |
| Sync | 385 |
| Pitch | 30 |
| Fretboard | 25 |
| Rhythm | 19 |
| Chord | 95 |
| Total | 1644 |

All pass, zero skipped/failing. News includes real Miniflare D1 migrations/API,
legacy migration, security, false-attribution and readiness cases. Syntax,
`git diff --check` and scoped secret-pattern scan PASS. No real credentials used.
Test outputs: /tmp/news-jp2b5/{news,port,shared,sync,pitch,fretboard,rhythm,chord}.log.
The persistent local Miniflare inspection stalled and was stopped; its migration
was applied transactionally to the offline local SQLite using the same SQL and
migration tracker. Real D1 regression and Wrangler local migration also PASS.

## 15. Existing System Isolation

This phase changes only News Worker source/tests/operations docs and Port's NEWS
legal document. Port UI/23-item fixture, Sync Worker, Account, AI Support and four
app sources unchanged against start hashes. Historical uncommitted work preserved.

## 16. Production Changed

**NO**. No production D1/Cron, Worker/Pages deploy, push or commit.
No publisher contact, no approval, no live candidate publication.

## 17. Git State

main = origin/main = `7a320062cd55bdccaccbd8e33b28efbb09a468f7`; ahead/behind 0/0;
staged 0. Existing 13 tracked modifications retained, News changes remain
uncommitted/untracked. No forbidden Git command. No known-untracked cleanup.

| Check | YES/NO |
|---|---|
| N-1 fixed | YES |
| raw headline persisted | NO |
| unsalted title hash remains (active schema/data) | NO |
| secret pepper persisted | NO |
| near-copy protection preserved | YES |
| N-2 fixed | YES |
| product brand inference without evidence possible | NO (dictionary requires both) |
| N-3 corrected | YES |
| Shimamura official link policy recorded | YES |
| Shimamura robots reviewed | YES |
| Shimamura Feed reviewed / validated | NO |
| Shimamura source rules implemented | YES (narrow provisional paths; latest review incomplete) |
| Shimamura PHASE-1 READY | NO |
| Shimamura production enabled | NO |
| Sleepfreaks enabled | NO |
| Hookup enabled | NO |
| Production changed | NO |
| Sync Worker changed | NO |
| Git safety followed | YES |
