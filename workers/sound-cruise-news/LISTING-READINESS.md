# Sound Cruise NEWS-JP2B-6 Shimamura Listing Readiness

## Overall Verdict

**SOURCE STILL NOT READY**

Official unified product-news listing verified. Dedicated adapter implemented,
with synthetic tests passing. The live validation stopped safely on a non-card
h3 caption. The corrected selector has not been live revalidated because the
session's three-listing-request budget was reached. No candidates persisted.

## 1. Baseline

2026-09-29 JST: main = origin/main =
`7a320062cd55bdccaccbd8e33b28efbb09a468f7`, ahead/behind 0/0, staged 0.
13 pre-existing tracked modifications, 92 insertions / 22 deletions, preserved.
Existing untracked JP2A-JP2B-5 work retained. .claude/ and Sync node_modules untouched.
Port 1.3.0 candidate and News Worker 0.1.0 retained: this extends the same
unpublished/uncommitted NEWS feature candidate, not an additional release.
Start diff/hashes captured in /tmp/news-jp2b6-start.diff and
/tmp/news-jp2b6/start-hashes.json. The tracked diff was captured before edits and remains byte-identical at completion.

## 2. Why Feed Was Abandoned

User-directed switch following inconclusive Feed validation in JP2B-5. No Feed
requests or further Feed searches this phase. Shimamura registry now uses
`discoveryType=shimamura_listing`. Other sources' Feed code remains unchanged.

## 3. Official Listing URLs

Adopted: https://www.shimamura.co.jp/update/common/new-item/

Discovered through a visible product-news link on the official category page:
https://www.shimamura.co.jp/update/guitar-bass/

Unified listing returned 200 twice, 126358 bytes, with 12 visible publication
dates and article URLs in guitar-bass, amp-effector, dtm-recording (plus excluded
drums). These three Gear path families suffice; no three-page daily crawl needed.
No pagination was requested. Category page returned 200 / 284212 bytes.

## 4. Legal / Policy Evidence

Official: https://www.shimamura.co.jp/siteusage/ . Rechecked 2026-09-29 JST.
Commercial/noncommercial links generally unrestricted; source must be identifiable;
no frames; separate window requested. Top URL recommended, other URLs not generally
prohibited. Terms and linkPolicyUrl refer to that same applicable official page.

Automatic listing access remains **DOCUMENTED SILENCE**, not explicit permission.
`policyDecision=approved` is the user-authorized internal limited-pilot judgment:
public listing metadata, robots respect, minimal daily requests, independent labels,
no articles/images, human approval, attribution/source traffic, kill/takedown.
It does not claim publisher permission or a legal determination.
reviewedBy=operator; precise UTC timestamps stored (2026-09-29 in JST).

## 5. Robots

One GET, 200, valid. Content matches the prior review:
`7483de89e6e58bf2a2b555a443d477bca2a40e1cf6720d52b32d2c92ef5d2447`.
No Crawl-delay. Product listing and target Update! paths allowed. The prior policy
body was matched to this fresh digest and reused to avoid another robots request.
A changed digest, Disallow, malformed data or refused access stops collection.
Robots' own noindex remains distinct from listing opt-out.

## 6. Listing Adapter

`src/shimamura-listing.js`, server-side htmlparser2 10.0.0; no script execution or
resource loading. Exact official source/listing URL only, no arbitrary URL API.
Product-news heading plus ul/li/a article cards, visible h3/date and category badge.
Non-card h3 captions are excluded after the observed live failure. Class-independent
heading/list/link/date relationships are required; badge family is also checked.
URL path and visible category must agree. Missing/ambiguous structure fails closed.

## 7. Raw HTML Handling

- memory only: YES
- persisted: NO
- cached: NO
- logged: NO
- archived: NO

No raw publisher HTML/headlines were written as tests, fixtures, snapshots or debug
output. Structural probes output only tag relationships, dates, URLs and booleans.
Parser clears HTML references; pending sink clears transient title entries.
No browser/headless execution, article HTML/body, image or OGP fetching.

Persistence audit: isolated local D1/SQLite/WAL plus session JSON/log/report files,
15 files at the live checkpoint, zero HTML-marker hits. No extracted title reached
the persistence sink on the failing live parse. Consequently no live title corpus
was retained for a later content scan; this is not claimed as a successful nonempty
title scan. Tests verify sensitive-data absence with authored synthetic inputs.
No live trace/cache/snapshot writer exists in this Node execution path.

## 8. Load / Requests

Total session publisher discovery requests: robots 1, listings 3:
category inspection 1 + unified listing inspection 1 + unified parser validation 1.
Siteusage was separately reviewed. Feed/article/image/OGP requests: 0.

Normal collector: robots 1 + unified listing 1 per 24h, max 512000 bytes, 15s timeout,
HTTPS/host/DNS/private-IP/redirect checks, conditional validators, 304 skips parsing.
No pagination. Successful watermark overlaps one JST day because dates lack time.
No response-body caching; only validators and successful timestamp persist.

## 9. Live Dry Run

Final read-only validation returned 200 but raised `listing_structure_changed`.
The page contains a non-card h3 caption alongside its article h3 headings. This
triggered the intended fail-closed path before a complete discovery gate or any
candidate write. Selector corrected and synthetic regression extended. No fourth
listing request. Gated candidate-ingestion dry run therefore did not execute.

## 10. Candidates

| Cruise label | category | eventType | status |
|---|---|---|---|
| No live candidate saved | — | — | — |

Synthetic regression exercises BOSS EX-4, explicit UA+LUNA and unknown-product
pending labels. These are test outputs, not claimed live Shimamura news.

## 11. Rejected Content

Live article-level counts unavailable because structural validation stopped first.
Tested exclusion reasons: tutorial, sale_campaign, event_or_shop,
comparison_evergreen, artist_or_lifestyle, url_or_category, duplicate_url,
date_outside_window. Normal catalog/affiliate/external URLs are not accepted.

## 12. N-1 Regression

PASS: secret HMAC/bottom-k guard unchanged; no raw title/pepper/unsalted title hash
in active candidate schema/data; missing or mismatched pepper fails closed;
punctuation/whitespace/NFKC/case/reordered near copies rejected; independent label
accepted. No real pepper generated: the live parse failed before ingestion.
Synthetic tests inject the existing deterministic test-only key.

## 13. N-2 Regression

PASS: brand AND product must be explicit; event from explicit metadata only.
LUNA SEA/Luna guitar/common-word boss do not invent brands. Unknown products remain
label_required. Added product patterns contain product names, not source headlines,
and all require their brands. No brand is supplied from a product alone.

## 14. Listing Structure Safety

PASS in synthetic tests: actual observed caption shape, product-section boundaries,
missing/malformed date, hidden fields, invalid/external URLs, duplicates, date order,
old/future articles, size limit, timeout, conditional GET/304, request cap, no assets,
changed/disallowed/malformed robots and robots noindex distinction.
The corrected adapter still requires one future authorized live validation.

## 15. Policy Gate

Legal/policy record complete as an internal documented-silence decision. Robots and
allowed paths reviewed. `discoveryValid=false` and `parserLiveValidated=false`
explicitly preserve the remaining technical uncertainty. Local pilot remains OFF.
Missing/expired evidence and nonlocal mode block collection. Approval still requires
all existing manual article checks; no automatic approvals were introduced.

## 16. PHASE-1 READY

**NO**. Corrected parser has not passed real-page validation. Follow-up should use
the unified listing once in a later authorized session, with current robots review;
no Feed work or broader source expansion is needed.

## 17. Production State

**OFF**. Source enabled=false / productionEnabled=false / localPilotEnabled=false.
Production NEWS_COLLECTION_MODE=off, NEWS_API_MODE=off, Cron=[] unchanged.
Isolated local D1: collection_enabled=0, api_enabled=0, candidate count=0.
Sleepfreaks/Hookup remain disabled. No deploy, production D1, staging, commit or push.

## 18. Tests

| Suite | Pass |
|---|---:|
| News | 55 |
| Port | 821 |
| Shared | 226 |
| Sync | 385 |
| Pitch | 30 |
| Fretboard | 25 |
| Rhythm | 19 |
| Chord | 95 |
| Total | 1656 |

All pass, zero failed/skipped. Real local D1 tests include ordered migrations;
0004 also applied in isolated local acceptance DB. Syntax, git diff --check,
scoped secret-pattern scan and start-hash isolation PASS.

npm audit: 1 pre-existing moderate fast-xml-parser XMLBuilder advisory
(GHSA-gh4j-gqv2-49f6); XMLBuilder is not used. New htmlparser2 dependencies show no
reported advisory in this run. No unrelated forced upgrades.

## 19. Existing System Isolation

Start-hash comparison: no changes to Sync Worker, Cloud Sync, Account, Pro Auth,
AI Support, other Cruise apps, Port runtime/UI or its 23-item fixture. Only NEWS
Worker implementation/tests/docs and Port NEWS legal documentation changed.

## 20. Legal Doc Update

NEWS-LEGAL-COMPLIANCE.md records the listing URL, memory-only/no-cache handling,
no article/image fetching, documented silence, daily limit, robots/manual approval,
structure-change stop and the current unverified corrected-parser limitation.
README describes the source-specific design and current OFF state.

## 21. Files Changed

New:
- workers/sound-cruise-news/src/shimamura-listing.js
- workers/sound-cruise-news/migrations/0004_listing_watermark.sql
- workers/sound-cruise-news/test/listing.test.js
- workers/sound-cruise-news/LISTING-READINESS.md

Updated:
- workers/sound-cruise-news/src/{collector,metadata,registry,shimamura-evidence,source-policies,store}.js
- workers/sound-cruise-news/test/{news,safety}.test.js
- workers/sound-cruise-news/package.json and package-lock.json
- workers/sound-cruise-news/README.md
- apps/cruise-port/NEWS-LEGAL-COMPLIANCE.md

## 22. Git State

main = origin/main = `7a320062cd55bdccaccbd8e33b28efbb09a468f7`; ahead/behind 0/0;
staged 0; pre-existing tracked/untracked work preserved. No forbidden Git commands,
commit, push or deploy. Known untracked directories left untouched.

## Final YES / NO

| Check | Result |
|---|---|
| Feed dependency removed for Shimamura | YES |
| Official listing discovery implemented | YES; corrected parser live revalidation pending |
| Listing HTML processed in memory only | YES |
| Raw listing HTML persisted | NO |
| Raw listing HTML cached | NO |
| Raw listing HTML logged | NO |
| Article bodies fetched | NO |
| Article HTML fetched | NO |
| External images fetched | NO |
| OGP fetched | NO |
| Exact headlines persisted | NO |
| Raw listing titles persisted | NO |
| Secret pepper persisted | NO |
| Product-news filtering works | YES in tests; corrected live acceptance pending |
| Tutorial filtering works | YES in tests |
| Sale/campaign filtering works | YES in tests |
| Malformed listing fails closed | YES, including observed live stop |
| Robots valid | YES |
| Policy evidence complete | YES for internal policy; technical discovery gate incomplete |
| Documented silence accurately recorded | YES |
| Automatic collection explicitly permitted by Shimamura | NO |
| Low-frequency design enforced | YES in collector; this bounded session used 3 authorized probes |
| Manual approval mandatory | YES |
| N-1 protection preserved | YES |
| N-2 protection preserved | YES |
| Shimamura PHASE-1 READY | NO |
| Shimamura production enabled | NO |
| Global collection enabled | NO |
| Production changed | NO |
| Existing Sync Worker changed | NO |
| Git safety followed | YES |
