> Historical JP2B-1 result. JP2B-3 disables every source and changes robots-header handling. See PRE-PRODUCTION-FIX.md for current results.

# NEWS-JP2B-1 local dry-run — 2026-09-28

No production change. Independent collector CLI, actual local Miniflare D1.
One bounded run; no retry to circumvent refusal. The initialization failures before
this run made zero publisher requests. Port retained its 23-item fixture.

| Source | Discovery | Requests | Robots/header result | Candidates | Approved | Pending | Rejected | Duplicate | Time |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|
| Discover chuya | RSS planned | 1 | opt-out header on robots response; source disabled | 0 | 0 | 0 | 0 | 0 | 1521 ms |
| Sleepfreaks | RSS | 2 | robots allow; sitemap declaration recognized but not fetched | 10 | 0 | 7 | 3 | 0 | 1529 ms |

Collector publisher requests: 3 (2 robots + 1 feed). No article/image fetch.
Policy research tools separately opened the two source homepages (web tool + local
HTTP fallback, four attempts total); these were not collector article requests.
Legal/technical documentation requests are separate from publisher collection.

7 retained candidates are classified as Gear/DTM (100%); this is an automatic,
coarse classification, not verified editorial quality. Several URX tutorial URLs
were retained due to instrument keywords. Generic labels repeat by category and
are unsuitable for automatic publication without human product/topic editing.
There are 0 approved records and 0 real candidates shown in the public API.
No titles, bodies, images or raw XML were saved to the report or DB.

Detailed local review metadata: `.local/last-run.json` (ignored; max 90-day policy,
refreshed on review actions and expired at the next local DB opening).
The aggregate counts above contain no article content or article URLs.

Tests: News 12, Port 819, Shared 226, Sync 385, Pitch 30, Fretboard 25,
Rhythm 19, Chord 95. All PASS. Browser 375/393/1024 px, Port publisher requests 0.
Wrangler local migration PASS. /health and /v1/news local HTTP PASS (empty API).
Local runtime compatibility is explicitly 2026-09-18 (installed workerd maximum),
while new Worker target remains 2026-09-28. See README before any deployment.
