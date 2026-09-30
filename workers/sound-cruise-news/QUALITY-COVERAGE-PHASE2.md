# NEWS Quality + Coverage Phase 2 — decisions before rollout

## Scope and success metric

Improve useful, unique factual news, not source count. Port 1.7.0 / NEWS Worker 0.5.0. No schema migration, Sync, Account, AI, publisher bodies or images. Initial production: c5d1ab0d, Port 1.6.0, Worker 0.4.0, visible 30. Original 23 fixture-equivalent articles are archive coverage; do not count three pre-Phase-1 AUTO records as new supply merely because their origin is automatic_collection.

## Current source audit

Shimamura: 11 / AUTO 8 / REVIEW 3; latest run duplicate 11; new Phase-1 publications 3. Three installation/AV/furniture records were rejected; two products duplicated legacy.
Kikutani: 20 / AUTO 2 / REVIEW 1 / REJECT 17; fresh publication 1. One explicit guitar mention was a recall lead. A post-rollout metadata-only recheck found no recital/concert/event noun in the listing title; this item remains unresolved, not a confirmed recovered event. The new recital template requires explicit guitar and recital, and blocks piano/cancel/postpone AUTO; only synthetic future-shaped cases passed. Generic artist profiles cannot safely infer instrument, product or event. No performer/event dates are fabricated.
Sleepfreaks: 10 / AUTO 4 / REVIEW 0 / REJECT 6; new publications 3. Five exclusions are AI/general seminar/tutorial paths. LAVA STUDIO has a truthful model/brand alias and is recovered; manufacturer ownership is not inferred from unrelated words.
Natalie: repeated generic feed sample 30 / AUTO 0 / REVIEW 0 / REJECT 30. Rejection is source_scope, not proof that the publisher has no guitar news. Generic feed has no explicit publication date for these Atom entries; updated is not promoted into published. An official topic tag was checked but did not establish a usable guitar-specific surface. Remove it from production allowlist.

## New sources and evidence

ZOOM: fixed `https://zoomcorp.com/ja/jp/news/`, 12 cards. Three eligible recorder/microphone firmware or release facts. Final collection rejected seven on the 90-day date gate and two development/history paths (a historical editorial card is excluded before its age check). Published time is written English date interpreted as JST. Only reviewed manufacturer model nouns can infer ZOOM identity from first-party listing; event must be a release/update/firmware/recall etc. No generic development/history content. First-party privacy policy is privacy-focused, not an automation license. SAFE whitelist plus documented-silence limited factual assessment; robots allow, explicit daily bounds, opt-out and kill remain.

amass: first-party RSS guidance explicitly offers artist/genre tag RSS; `https://amass.jp/rss/3745` is reached from the official Rick Nielsen tag page. 21 entries: one in-window explicitly named guitarist + guitar; 20 old entries. In-window relevant precision 1/1, zero review; no generic feed enable. Internal SAFE scope assessment applies only to this fixed RSS; copyright remains reserved, no publisher license asserted. A single scoped feed is sparse and does not complete singer-songwriter/Artist coverage. One article was manually fetched only to discover its official tags; no article body/excerpt/headline/image was retained. Runtime performs no article fetch.

## Sources deliberately not enabled

- Ikebe PB: prior robots404 and applicable policy gap remain. Alternate official main host robots is valid; trade-law/membership pages do not grant automatic news rights. Sale-category sample had expired, old, shop/used/points/uncertain campaigns, not a current high-quality broad sale. No production host change or permission inference.
- Sound House: one 15-second robots attempt failed again. No alternate user-agent, proxy, authenticated session or denial workaround. OFF.
- IK: official public promos list inspected with legal/trademark pages; displayed news_date contains until/deadline, not reliable publication dates. Offers were principally individual bundles/model deals, not verified broad current manufacturer campaign metadata. OFF; do not publish end dates as new article dates. Forum and Tone.net rules do not authorize the corporate news site.
- Audio-Technica: first-party terms permit identified links with no framing/false affiliation and mandatory takedown. Robots404 was assessed for investigation only, not activated in registry. Official HTML had no article metadata; news bootstrap uses stateful client APIs. No CSRF/API-control workaround. OFF pending fixed public metadata surface.
- Hookup: applicable terms reserve expression rights. Official news is client-rendered, blog RSS mostly interview/how-to rather than product announcement. Support RSS exceeds bounded response; no increasing request cap to chase coverage. OFF.
- Deviser: official RSS exposes known maker categories and fragments (e.g. Headway DSP-OSAMURAISAN); missing model identification for relevant-looking releases remains. Category or finish fragment cannot invent model names/series. OFF.
- SONICWIRE: prior feed header opt-out preserved; no alternate format/path used to evade it. OFF.
- Shimamura fair listing: mostly local shop/wind-instrument promotions; no broad current sale established. Product-only source rules are unchanged.
- Skream: generic/artist index exists but publisher terms are hosted on another official host with robots404 and applicability/metadata narrowing unresolved. OFF.
- TFT: generic entertainment and separate corporate policy, no independently validated guitar-specific surface. OFF.
- AGM/KORG/ESP/Yamaha newsroom: CONTACT remains, no permission received; no outreach.
- Takamine/Kurosawa: DO_NOT_USE preserved; no requests.
- Yamaha403, Roland/AHS/chuya unparseable robots, Kanda redirect and Morris policy gap preserved from fresh same-day Phase 1 evidence. No denial bypass.

## Operations and rollback

Allowlist is immutable-code evidence gated. ZOOM/amass each use one robots + one metadata request per run (2 max), daily06JST. Scheduled day leases, failures/backoff/refusal, health, retention90d and original-date preservation are unchanged. Existing ARTICLE checks/expiry/sale boundaries are retained. UNKNOWN or incomplete sources do not become enabled merely from env IDs.

Immediate source kill: `node scripts/operator.mjs control source-disable SOURCE_ID quality_review`. CLI fails closed with API OFF; after verifying the target state, explicitly restore with `node scripts/operator.mjs control api-on global review_complete`. Do not delete source rows or rebuild D1. Generic Natalie stays out of current allowlist even if its old health last-success remains.

Rollback to previously audited 0.4.0 collection code/config is schema-compatible (no new migrations). Prefer current hard-OFF infrastructure deployment for systemic rollback. Do not roll back a collection-running pre-0009 positional-insert version. Pages uses normal revert/push; no reset or force push. New rows can remain hidden by source allowlist; archive grants and user data are preserved.

## Remaining quality gaps

Sale is NONE. Recording is useful but sample is older firmware/release data, not fresh interface launches. Artist has one actual scoped guitarist story; domestic singer-songwriter breadth and event dates remain poor. Further evidence/discovery work is necessary before claiming a daily all-field news digest. User value remains the expansion criterion.

## Production acceptance — 2026-09-30 18:15 JST

- Code commit `284a2d66`; Port 1.7.0 / NEWS Worker 0.5.0. Worker version ID `3d249ff7-f4fa-4c2b-a273-ac48e0740955`, deployment `b0833ee9-e30a-4181-b590-5fc9378e3d4c` at 100%. No Sync Worker deployment or D1 migration.
- Pages code build [36694577781](https://github.com/soundcruise/apps/actions/runs/36694577781): build/deploy/report jobs success; Pages built. Normal and Pro pages plus four JavaScript assets match local bytes.
- One audited operator validation per enabled source, 10 publisher requests total (one robots + one listing/feed each). Shima 11 candidates / 11 duplicate / 0 published; Kiku 20 / 3 duplicate / 17 rejected / 0 published; Sleep 10 / 4 duplicate / 5 rejected / 1 published; ZOOM 12 / 9 rejected / 3 published; amass 21 / 20 rejected / 1 published.
- Public visible 35 = original 23 archive equivalents + 12 subsequent live records. Original archive includes three earlier AUTO publications, so raw origin `automatic_collection=15` is not fresh coverage=15. Live-only: Shima3/Kiku1/Sleep4/ZOOM3/amass1; AUTO11/operator1. Current review queue0, rejected6. Phase2 newly published5; no new operator approvals.
- Categories: acoustic6/electric7/amps8/recording3/DTM9/artist1/live1/sale0. Current in-window new sources ZOOM3 and amass1 are independently labeled factual rows; editorial utility audit HIGH4/USEFUL6/LOW2/NOISE0 across all12 live records. This is a small sample, not proven future precision.
- All five enabled sources healthy, failures0; Natalie individually disabled and paused with quality_review audit while API/publication/collection stayed ON. Retention healthy. Cron `0 21 * * *` remains; first Oct1 06 JST run is in the future, not observed or claimed.
- Full eight suites 1,833 PASS (Port886/Shared226/Sync393/Pitch30/Fret25/Rhythm19/Chord95/NEWS159); NEWS159 rechecked after strict invalid-calendar-date validation. Syntax21 files, diff check and secret scan848 files/0 matches pass.
- Real production 375/393/1440px: ticker/news/categories/empty-sale/operator-approved legacy/keyset+offset pagination/CORS/no public approval/90d visibility pass. Exact expiry/sale deadline/cache/source-kill tests pass. Injected API unavailable/disabled responses isolate failure from Port tools. Page errors0, publisher requests0 for browser/API QA. Physical device acceptance is not claimed.
- Publisher direct requests88 = research78 (includes one Kiku recall recheck) + production10. Web service additionally performed seven publisher opens, three document-find reads and four searches; origin wire/cache behavior is unobservable and not folded into direct88. One manual amass article request discovered official tags; runtime article requests0, images0. No raw publisher HTML, original headlines, article copy or images retained. Only evidence hashes, bounded classifications and independent factual labels are stored.
- Verdict: COVERAGE IMPROVED — MORE WORK NEEDED. Sale remains NONE despite investigating retailer and manufacturer alternatives. Recording is useful older firmware/release data; sparse guitarist feed does not complete domestic singer-songwriter coverage. Release blocking0; product coverage completion remains outstanding.
