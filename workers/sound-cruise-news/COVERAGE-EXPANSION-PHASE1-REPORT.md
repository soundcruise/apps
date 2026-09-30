# Cruise Port NEWS Coverage Expansion Phase 1 Report

## Overall Verdict

**PARTIAL COVERAGE — MORE SOURCES NEEDED**

Production multi-source collection is running. This phase restored old NEWS, enabled a bounded four-source pilot, closed the stored REVIEW queue and deployed daily updates. The product goal remains incomplete: major SALE, broad named-artist coverage, microphones/interfaces/recording coverage need more sources. A source count alone is not a completion criterion.

## 1. Initial Production State

Measured 2026-09-30 JST. Protected original checkout: branch codex/news-1-5-production-infra, HEAD fc57c02c6155608aa9a56f48e6833765ada8379a, main/origin/main f2e568becd8b1ea4021f0b0a6044727ecb6a5e8b, ahead 0 / behind 3, tracked/staged clean. Known .claude/ and workers/sound-cruise-sync/node_modules/ were preserved. Existing release worktree started at f2e568be; work proceeded on codex/news-coverage-phase1, then fast-forwarded main. No unrelated source work was included.

Port 1.5.0; NEWS 0.3.0; Worker version c6731b2b-cd0d-446d-8708-0790c11cb017; NEWS D1 0001–0008; collection/publication/API ON. Allowlist Shimamura only; collection hourly, retention hourly at minute 17. D1 held 11 candidates: 3 AUTO approved, 8 pending REVIEW. Source, collection and retention health were healthy; source disable/takedown/failures were 0. First D1 call returned Cloudflare 7403; OAuth account and read-only D1 were confirmed before mutation. No publisher access preceded the initial stored-data analysis.

## 2. REVIEW 8 Analysis

Initial eight records all had structured facts NULL, label "審査待ち（製品名と出来事の確認が必要）" and reason label_required. Stored-only data was insufficient to approve safely. A single audited official-listing recheck enriched their minimum facts. HISTORY's category changed from a weak DTM guess to electric_guitar_bass; persistence, dates and URL identity were retained. Full original headlines were neither displayed in this report nor retained.

| Candidate id | Independent label after facts verification | Category | Structured facts | AUTO blocker / reason | Publication value / final decision |
|---|---|---|---|---|---|
| 900848fc12e28737966e310655ee723b9dc4ea5749c9707b6983c773c5f9c21a | IS5T-WPの製品情報（要確認） | recording_audio | dBTechnologies / IS5T-WP | initial label_required; now relevance_uncertain | REJECT not_relevant: fixed-installation PA; target relevance weak |
| a7de66f23d8d58f77795c02d9fea728d11a60f278fafbefd7e82402199745ac5 | DS3の製品情報（要確認） | recording_audio | DE / DS3 | initial label_required; now relevance_uncertain | REJECT not_relevant: AV/scaler-oriented; insufficient guitar/recording-use evidence |
| e37575afd92214717855e11d7777bc95db7730791f4c42c56adc463d12328edd | ESP、PA-MF-10を発表 | electric_guitar_bass | ESP / PA-MF-10 | initial label_required; now factual_label_ready | APPROVED automatically; same type AUTO |
| 6743f48dc247ce49cd1e81a3ec52a415eb1fcb1f0051b682e945df88344ac7e4 | HISTORY、HSLCシリーズの製品情報 | electric_guitar_bass | HISTORY / HSLCシリーズ | initial label_required; now factual_label_ready | APPROVED by operator (useful_product); same type now AUTO |
| 6996cda04135ca70f4cb480c90b83aba220499d3158811b6a6b8d43f586aadf8 | Jackson、Flex A-Frame Standを発表 | electric_guitar_bass | Jackson / Flex A-Frame Stand | initial label_required; now factual_label_ready | APPROVED automatically; same type AUTO |
| 808d9cbb754a72828dcf71a37ab9564a3ae5b700c0d7fcb008a063912f483a57 | Jackson、PC1-Eを発表 | electric_guitar_bass | Jackson / PC1-E | initial label_required; now factual_label_ready | REJECT duplicate of restored PC1-E; facts remain AUTO-eligible |
| a8731c2f574414fd1fe26e058bc2abba0aaa55f25c6f63546eeed6c3f2d12a8d | Logo Barstoolの製品情報（要確認） | electric_guitar_bass | Gretsch / Logo Barstool | initial label_required; now relevance_uncertain | REJECT not_relevant: logo furniture; not target equipment news |
| b2abb8b554f8803d44016a5cd464175911e06c72ecf45502e3d9db36da9e6a75 | JAM Pedals、Wahcko mk.2の製品情報 | amps_effects | JAM Pedals / Wahcko mk.2 | initial label_required; now factual_label_ready | REJECT duplicate of restored Wahcko mk.2; facts remain AUTO-eligible |

Useful products now have AUTO templates. Ambiguous AV/installation/furniture cases retained the human safety path until the operator decision; publisher brand alone is not evidence of practical target value. Two rejected candidates were useful news already represented by legacy records, not lost coverage.

## 3. Review Queue / Operator Workflow

Existing Account login has no safe operator role. **CLI only**, authenticated by Wrangler Cloudflare OAuth with NEWS-specific account/DB checks. No public admin page or approval HTTP endpoint. Queue shows independent label, source/category/date, minimal facts, reason and source link. Approve/reject audit and reason-coded feedback are recorded. Approval revalidates policy/robots/provenance/health/90d/controls/source and item kill, exact factual template and duplicate checks. No article verification flags are fabricated. Feedback cannot enable a permanent classifier bypass. Six explicit Shimamura actions (one approval, five rejections) plus the Kikutani bearing rejection were executed with publisher requests 0. Final queue: **0**.

Operations: [COVERAGE-OPERATIONS.md](COVERAGE-OPERATIONS.md).

## 4. AUTO Policy Adjustments

Verified model identifiers, series names and exact curated aliases now support independent product-information templates even when announcement wording is weak. Explicit facts correct weaker title-only categories. Distinctive software models may retain brand NULL rather than inventing a manufacturer; NOVA/LUNA require software context and music-band negatives are tested. Atom/RDF feeds and the fixed Kikutani listing have bounded parsers. Guitar-event facts need explicit guitar relevance; generic celebrity and piano-only cases remain excluded. Only pending rows can gain better facts on observation; approvals/rejections are never silently resurrected. Near-product dedup also compares restored verified facts. Evidence, copyright, robots, takedown, date, source health and provenance gates remain enforced.

## 5. Legacy 23 Backfill

Inserted **20**, skipped duplicates **3**, expired **0**, blocked **0**, publisher requests **0**. The old 23 items are represented by 20 restored rows plus the 3 current approved equivalents. Original dates/categories/independent labels/source URLs were preserved; none was redated to today. Origin legacy_fixture_backfill and completion audit are present. Immutable digest and exact-row grants authorize only this fixture, never a source-wide bypass or live collection. Source/item controls and 90d still apply. Final visible NEWS: **30**. Visible legacy source entries for Ikebe/Yamaha/SONICWIRE/etc do not mean their live collectors are enabled.

## 6. 06:00 JST Schedule

Deployed **0 21 * * *** = **06:00 Asia/Tokyo daily**, verified in Cloudflare API. Cloudflare Cron uses UTC ([official documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/)). Hourly retention **17 * * * *** remains. User UI says "毎朝6:00更新（日本時間）". First future scheduled collection: **2026-10-01 06:00 JST**; configuration is verified, that future run is not claimed as observed. Trigger propagation can take up to 15 minutes.

## 7. Scheduled Guard

Atomic source lease consumes JST collection day before the first network attempt. Duplicate/retry/failure cannot fetch that source again on the same JST day. The next day need not wait an exact 24h, including October 1 transition. Actual failure backoff, 429/Retry-After, 401/403/451, source disable, policy and robots remain effective. Operator validation is separately audited and does not consume scheduled day. Normal legacy calls keep the voluntary 24h guard. Unit/SQLite tests cover day boundaries, parallel leases, consumed failure days, next-day <24h, refusal and manual bypass limits. Source health reports the next actual daily eligibility (October 1 06:00), not a misleading voluntary 24h timestamp.

## 8. Coverage Matrix

All **27 registry candidates**. Product/Sale/Artist/DTM flags express potential value; only ON rows are actual live collection. SALE remains OFF even when potential is Y. First-party manufacturer/distributor/retailer publication and editorial media roles are identified separately.

| Source / domain | Role | Product | Sale potential | Artist/event | DTM | Method | Robots | Terms/policy | Evidence / enabled | Blocker | Coverage value |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Yamaha / jp.yamaha.com | official | Y | — | — | — | unconfigured | robots_unavailable | not established | SAFE / not production-ready; OFF | robots 403; no bypass | HIGH: Gear |
| 島村楽器 / www.shimamura.co.jp | retailer_editorial | Y | Y (OFF) | — | Y | shimamura_listing | PASS (surface-specific checked where enabled) | https://www.shimamura.co.jp/siteusage/ | restricted factual-metadata PASS; documented silence; ON | none; Natalie relevant sample 0 | HIGH: Gear/DTM |
| 音楽ナタリー / natalie.mu | media | — | — | Y | — | rss | PASS (surface-specific checked where enabled) | https://natalie.mu/info/termsofuse | restricted factual-metadata PASS; documented silence; ON | none; Natalie relevant sample 0 | HIGH: guitar events/artists if evidenced |
| Skream! / skream.jp | media | — | — | Y | — | unconfigured | PASS (surface-specific checked where enabled) | not established | SAFE / not production-ready; OFF | applicable terms on other domain and guitar feed proof incomplete | HIGH: guitar events/artists if evidenced |
| Morris / www.morris-guitar.com | official | Y | — | — | — | unconfigured | robots_unavailable | not established | SAFE / not production-ready; OFF | robots 404 not accepted for collection; applicable policy/discovery incomplete | HIGH: Gear |
| Deviser / www.deviser.co.jp | official | Y | — | — | — | rss | PASS (surface-specific checked where enabled) | https://www.deviser.co.jp/privacy-policy | SAFE / not production-ready; OFF | 4 relevant-looking RSS items lack verified structured identifiers; no label path | HIGH: Gear |
| Roland / BOSS / www.roland.com | official | Y | — | — | Y | unconfigured | robots_unparseable | https://www.roland.com/jp/terms_of_use/ | SAFE / not production-ready; OFF | robots response unparseable; discovery/policy incomplete | HIGH: Gear/DTM |
| Audio-Technica / www.audio-technica.co.jp | official | Y | — | — | Y | unconfigured | robots_unavailable | https://www.audio-technica.co.jp/corp/privacypolicy | SAFE / not production-ready; OFF | robots 404 scoped absence review only; feed/parser incomplete | HIGH: Gear/DTM |
| 神田商会 / www.kandashokai.co.jp | distributor | Y | — | — | — | unconfigured | redirect_blocked | https://www.kandashokai.co.jp/terms/ | SAFE / not production-ready; OFF | robots redirect blocked; no bypass | HIGH: Gear |
| ZOOM / zoomcorp.com | official | Y | — | — | Y | unconfigured | PASS (surface-specific checked where enabled) | not established | SAFE / not production-ready; OFF | privacy-focused evidence incomplete; feed/label proof pending | HIGH: Gear/DTM |
| キクタニ / www.kikutani.co.jp | distributor | Y | — | Y | — | official_listing | PASS (surface-specific checked where enabled) | https://www.kikutani.co.jp/privacy-policy/ | restricted factual-metadata PASS; documented silence; ON | none; Natalie relevant sample 0 | HIGH: guitar events/artists if evidenced |
| 池部楽器 / www.ikebe-gakki-pb.com | retailer_editorial | Y | Y (OFF) | — | Y | unconfigured | robots_unavailable | not established | SAFE / not production-ready; OFF | robots 404; applicable aggregation/link evidence not established on PB site | HIGH: Gear + major SALE |
| Discover chuya / discover.chuya-online.com | retailer_editorial | Y | Y (OFF) | — | Y | rss | robots_unparseable | not established | SAFE / not production-ready; OFF | robots response unparseable; no live enable | HIGH: Gear/DTM |
| Hookup / hookup.co.jp | distributor | Y | — | — | Y | unconfigured | robots_unavailable | https://hookup.co.jp/about/tac | SAFE / not production-ready; OFF | robots 404 and discovery proof incomplete | HIGH: Gear/DTM |
| SONICWIRE / sonicwire.com | distributor | Y | Y (OFF) | — | Y | rss | PASS (surface-specific checked where enabled) | https://sonicwire.com/aboutus/terms | SAFE / not production-ready; OFF | RSS X-Robots noindex: stop; no retry after refusal | HIGH: Gear/DTM |
| Sleepfreaks / sleepfreaks-dtm.com | media | Y | — | — | Y | rss | PASS (surface-specific checked where enabled) | https://sleepfreaks-dtm.com/privacy/ | restricted factual-metadata PASS; documented silence; ON | none; Natalie relevant sample 0 | HIGH: Gear/DTM |
| IK Multimedia / www.ikmultimedia.com | official | Y | Y (OFF) | — | Y | unconfigured | PASS (surface-specific checked where enabled) | not established | SAFE / not production-ready; OFF | applicable privacy/policy redirect unresolved; forum automatic access prohibited (forum excluded) | HIGH: Gear/DTM |
| AHS / www.ah-soft.com | official | Y | — | — | Y | unconfigured | robots_unparseable | not established | SAFE / not production-ready; OFF | robots response unparseable; no live enable | HIGH: Gear/DTM |
| AGM / Rittor Music / acousticguitarmagazine.jp | media | — | — | Y | — | unconfigured | not accessed | not established | CONTACT / not production-ready; OFF | CONTACT; publisher permission absent | HIGH: guitar events/artists if evidenced |
| KORG / VOX / www.korg.com | official | Y | — | — | Y | unconfigured | not accessed | not established | CONTACT / not production-ready; OFF | CONTACT; publisher permission absent | HIGH: Gear/DTM |
| ESP / BIGBOSS / espguitars.co.jp | official | Y | — | — | — | unconfigured | not accessed | https://espguitars.co.jp/support/terms/ | CONTACT / not production-ready; OFF | CONTACT; publisher permission absent | HIGH: Gear |
| Yamaha newsroom / www.yamaha.com | official | Y | — | — | — | unconfigured | not accessed | not established | CONTACT / not production-ready; OFF | CONTACT; publisher permission absent | HIGH: Gear |
| amass / amass.jp | media | — | — | Y | — | unconfigured | PASS (surface-specific checked where enabled) | not established | UNKNOWN / not production-ready; OFF | UNKNOWN, first-party terms/discovery/guitar proof pending | HIGH: guitar events/artists if evidenced |
| THE FIRST TIMES / www.thefirsttimes.jp | media | — | — | Y | — | unconfigured | PASS (surface-specific checked where enabled) | not established | UNKNOWN / not production-ready; OFF | UNKNOWN, first-party terms/discovery/guitar proof pending | HIGH: guitar events/artists if evidenced |
| Takamine / www.takamineguitars.co.jp | official | Y | — | — | — | unconfigured | not accessed | not established | DO_NOT_USE / not production-ready; OFF | DO_NOT_USE; no access | HIGH: Gear |
| クロサワ楽器 / www.kurosawagakki.com | retailer_editorial | Y | — | — | — | unconfigured | not accessed | not established | DO_NOT_USE / not production-ready; OFF | DO_NOT_USE; no access | HIGH: Gear |
| サウンドハウス / www.soundhouse.co.jp | retailer_editorial | Y | Y (OFF) | — | Y | unconfigured | The operation was aborted due to timeout | not established | UNKNOWN / not production-ready; OFF | robots timeout; affiliate/member policy discovery is not collection permission | HIGH: Gear + major SALE |

## 9. Legal / Evidence Review

First-party robots, relevant published policy/terms and official discovery surfaces were reviewed in a controlled batch. Shimamura's previous complete documented-silence assessment was retained. Kikutani and Sleepfreaks publish privacy-focused policy pages: reviewed silence about aggregation is recorded explicitly, not presented as permission. Natalie terms preserve copyright/quotation constraints; this pipeline quotes no publisher expression. Restricted public factual metadata only, one daily source cycle, outbound attribution, no frames/bodies/images, expiry and takedown underpin the internal pilot assessment. All enabled sources have reviewed dates, policy and robots digests, valid discovery proof and factual-label path. No explicit automation permission is claimed.

Policy URLs: [Kikutani](https://www.kikutani.co.jp/privacy-policy/), [Sleepfreaks](https://sleepfreaks-dtm.com/privacy/), [Natalie](https://natalie.mu/info/termsofuse). SONICWIRE terms were checked but its RSS X-Robots noindex stops enablement. Search engines were used only for discovery. Sound House affiliate/member terms are not an aggregation grant; its failed robots request was not retried. Ikebe PB linking/aggregation evidence remains insufficient. CONTACT / DO_NOT_USE sources were not fetched.

## 10. Sources Newly Production-Ready

**Kikutani, Sleepfreaks, Music Natalie** added to Shimamura. Actual robots + listing/feed collection succeeded for all four; actual current eligible outputs come from Shimamura, Kikutani and Sleepfreaks. Natalie live feed parsed, and the guitar-specific factual path passed synthetic tests; the live sample had no eligible guitar article. Explicit four-source allowlist, no registry-wide ON.

## 11. Sources Still Blocked

See matrix for all 23 OFF sources. Priority blockers: Sound House robots timeout / applicable evidence unresolved; Ikebe robots 404 and incomplete PB terms/link evidence; Yamaha robots 403; SONICWIRE header opt-out; Deviser insufficient structured identifiers; Roland/chuya/AHS unparseable robots; Kanda redirect; ZOOM/IK applicable policy and discovery gaps; Morris/Audio-Technica/Hookup unaccepted robots absence plus parser/evidence gaps. amass/TFT remain UNKNOWN; AGM/KORG/ESP/Yamaha newsroom CONTACT; Takamine/Kurosawa DO_NOT_USE. No refusal or access control was bypassed.

## 12. Gear Coverage

Current list: acoustic **6**, electric/bass **7**, amps/effects **7**; total Gear/software **29** plus one guitar event. New verified product coverage includes ESP PA-MF-10, HISTORY HSLC series and Jackson Flex A-Frame Stand. The 23 legacy records are restored with original dates. Manufacturer/distributor breadth in the visible archive improved, while fresh live Gear coverage still relies mainly on Shimamura/Kikutani. Microphone/interface/recording and broader maker coverage remain insufficient.

## 13. Sale Coverage

**NOT expanded: 0 live SALE items, all sale acquisition surfaces OFF.** Sale category empty state works; existing large-sale classification, publisher authorization, deadline/caching and expiry tests pass. Sound House/Ikebe are priority evidence work. Do not infer sale readiness from their legacy product rows.

## 14. DTM / Software Coverage

Live Sleepfreaks adds VocAlign 7, LUNA 3 and SINPHONICA; NOVA overlaps the restored legacy URL and is not duplicated. DTM visible **9**. Model-only facts keep manufacturer unknown when not supplied in the official feed. Wider DAW/plugin vendor and update coverage remains incomplete; SONICWIRE/Hookup/IK/AHS are legacy-only until live evidence gaps are resolved.

## 15. Artist / Live / Event Coverage

**1 explicit guitar event** from Kikutani (信州ギター祭); artist category **0**. Natalie production feed is active but current 30 samples were generic/non-guitar under the verified metadata scope; no article body was fetched to force classification. Positive guitar-performance and piano/band/celebrity negatives are tested. Event coverage improved modestly; broad named guitar/弾き語り artist coverage remains a material gap.

## 16. Source Health

Shimamura / Kikutani / Sleepfreaks / Natalie: **healthy / ok**, failure count 0, next daily eligibility **2026-10-01 06:00 JST**. Collection and retention aggregate health healthy. No source disable/takedown was introduced. Per-source failure/backoff/alerts and future policy expiry remain part of normal operations. Existing API controls are ON and independent of Account/Sync.

## 17. Production Collection Results

Audited operator validation, one robots and one bounded discovery GET per source. AUTO/REVIEW/REJECT describe classified live surface; published is new visible increment (includes one operator approval for Shimamura). Duplicate metadata observation is counted separately and never republished.

| Source | Requests | Discovered | AUTO | REVIEW | REJECT | Newly published | URL duplicates / existing rows | Outcome |
|---|---|---|---|---|---|---|---|---|
| shimamura | 2 (robots 1; listing/feed 1) | 11 | 8 | 3 | 0 | 3 | 11 | collected |
| kikutani | 2 (robots 1; listing/feed 1) | 20 | 2 | 1 | 17 | 1 | 1 | collected |
| sleepfreaks | 2 (robots 1; listing/feed 1) | 10 | 4 | 0 | 6 | 3 | 1 | collected |
| natalie | 2 (robots 1; listing/feed 1) | 30 | 0 | 0 | 30 | 0 | 0 | collected |

Total new visible increment **7** after the restored 23 → **30**. Kikutani's existing Godin and Sleepfreaks' NOVA were not duplicated. Two near-product Shimamura duplicate candidates were explicitly rejected. No raw HTML/headline/image acquisition was persisted.

## 18. REVIEW Rate

Shimamura initially **8/11 = 72.7%** REVIEW → current classification **3/11 = 27.3%** REVIEW (five useful previously uncertain models gained factual AUTO paths; two are duplicate articles). Reason: relevance_uncertain ×3. Kikutani: **1/20 = 5%**, label_required ×1 (identifier missing), subsequently operator rejected for relevance after the one necessary article check. Sleepfreaks **0/10**; Natalie **0/30**, with 30 non-guitar source_scope rejections. Combined live sample **4/71 = 5.6% REVIEW**; among 18 retained AUTO/REVIEW candidates **22.2%**. Noise-heavy denominators are not a proof of recall quality. Final production pending/reopened queue **0**. Deviser's 4 incomplete-identifier validation samples remain a future parser/facts gap, not production-approved data.

## 19. API / UI

Production [Cruise Port](https://soundcruise.jp/apps/cruise-port/) uses the dedicated authoritative News API. API returns **30** rows from **10 publisher names**, including restored archive, existing AUTO, operator-approved HISTORY and new automatic data. Categories: acoustic 6, electric/bass 7, amps 7, DTM 9, live guitar 1; sale/artist 0. Home ticker has 5 items inside the real 7-day window; Yamaha September 18 remains outside it and appears on News in the correct date group. No date manipulation. 14-day fallback and 90d boundary tests pass. Cursor/offset pagination, CORS, cache, limit/category validation pass. Public review GET 404 / POST 405; no unauthenticated mutation route. API failure/disabled state cannot resurrect the static fixture.

## 20. Tests

| Suite | PASS | FAIL |
|---|---:|---:|
| Port | 886 | 0 |
| Shared | 226 | 0 |
| Sync | 393 | 0 |
| Pitch | 30 | 0 |
| Fretboard | 25 | 0 |
| Rhythm | 19 | 0 |
| Chord | 95 | 0 |
| News | 146 | 0 |
| **Total** | **1,820** | **0** |

All tests run with publisher network blocked, including actual Miniflare D1. A sandbox localhost EPERM was resolved by running the test under the needed local permission; it was not hidden or skipped. Version assertion failures were updated to 1.6.0. Final changed-JS syntax (32 files), Wrangler bundle/dry-run and git diff --check PASS; secret scan 844 files / 0 matches. No unrelated app source change.

## 21. Production Smoke

Actual production API and Cloudflare account/NEWS DB/vars/secret presence/deployment/Cron verified. Production browser **375 / 393 / 1440 px**: Home ticker, News, category filters, sale empty state, restored dates/old rows, existing AUTO, HISTORY, multiple publishers, outbound HTTPS/noopener/noreferrer, no image/frame, no horizontal overflow. Cursor and offset pagination tested on real API. Exact expiry/sale boundaries and warm-cache kill are isolated automated D1/UI tests; every live row is within 90d. API failure/disabled response injection against production Port showed no stale fallback and left tools working; no live kill switch was toggled for this smoke. Practice Menu, preset selector, Calendar, Gear, Tuner, Metronome, My Apps and Settings routes open. Production browser page errors 0; publisher requests **0**. Standard/Pro HTML and four changed JS files match the deployed release byte-for-byte. A supplemental screenshot-only script timed out waiting for visibility; rerunning the complete production QA passed and produced both equal-scale viewport screenshots. This isolated auxiliary timeout was not reproduced; no source workaround was introduced. Screenshots retained locally in /private/tmp/news-coverage/visual. Physical iPhone/Android acceptance was not requested for this phase and is not claimed.

## 22. Legal / Copyright Safety

All enabled sources retain policy/evidence/robots/health/rate-limit gates. The production pipeline uses no login, access-control bypass, arbitrary crawler, sitemap crawling, article body/excerpt/image storage or full headline storage. One necessary Kikutani article was checked in memory because listing pedal type was ambiguous; only CANOPUS/bearing/no-explicit-guitar-evidence facts and response metadata were retained. No opt-out was overridden. Legacy backfill authorizes exactly the user-approved fixture only. Pending/rejected candidates obey 90d; audit/health/feedback 365d; hourly physical purge continues. An initial research helper briefly wrote news-link anchor labels and image URL references to an intermediate temporary metadata log. Those fields were removed immediately before evidence retention; no publisher image was fetched, and none entered the repository, production D1 or API. A final recursive check of 10 retained research logs found no title/headline/body/HTML/excerpt/image fields. The helper was not used again in that form. Keyed headline sketches remain private and are not in public API/queue. Policy silence is a bounded internal assessment, not publisher permission or a legal guarantee.

## 23. Publisher Request Counts

Controlled attempted first-party requests, including failures: **67** = research/validation 59 + actual acceptance collection 8. Article **1**, images **0**. No requests from backfill/review/API/UI. No retries after Yamaha 403, Sound House timeout, SONICWIRE noindex, or unparseable robots. Generic feed probes were replaced by verified official surfaces before enablement; repeated successful discovery GETs were limited to parser/facts validation. Search-engine discovery queries are not counted as controlled publisher HTTP requests; their underlying index/crawler traffic cannot be measured here. No policy excerpts or original news headlines are included in retained research logs or this report.

| Source | Robots | Policy/discovery-policy | Listing/feed | Article | Total |
|---|---:|---:|---:|---:|---:|
| yamaha | 1 | 0 | 0 | 0 | 1 |
| natalie | 2 | 2 | 4 | 0 | 8 |
| skream | 1 | 1 | 0 | 0 | 2 |
| shimamura | 2 | 0 | 3 | 0 | 5 |
| morris | 1 | 1 | 0 | 0 | 2 |
| audio-technica | 1 | 1 | 0 | 0 | 2 |
| deviser | 1 | 2 | 3 | 0 | 6 |
| roland | 1 | 0 | 0 | 0 | 1 |
| kanda | 1 | 0 | 0 | 0 | 1 |
| ikebe | 1 | 2 | 0 | 0 | 3 |
| zoom | 1 | 2 | 1 | 0 | 4 |
| kikutani | 2 | 2 | 4 | 1 | 9 |
| chuya | 1 | 0 | 0 | 0 | 1 |
| sonicwire | 1 | 1 | 3 | 0 | 5 |
| hookup | 1 | 1 | 0 | 0 | 2 |
| sleepfreaks | 2 | 1 | 4 | 0 | 7 |
| ahs | 1 | 0 | 0 | 0 | 1 |
| ik | 1 | 2 | 1 | 0 | 4 |
| amass | 1 | 0 | 0 | 0 | 1 |
| tft | 1 | 0 | 0 | 0 | 1 |
| soundhouse | 1 | 0 | 0 | 0 | 1 |

AGM, KORG, ESP, Yamaha newsroom, Takamine and Kurosawa: **0**. Collector request counts are also persisted in collection_runs (operator_validation). Validation metadata logs retain timestamp/status/hash/reason/count; no full HTML/body/headline.

## 24. Git / Deploy

Implementation 67946d70; audited recheck follow-up 8dbef9c9; operations 112f719b. main was fast-forwarded normally from f2e568be to 112f719b and pushed without force. Pages built 112f719b successfully; Port **1.6.0**. Worker **0.4.0**, active version **e6dfbfc9-d771-4595-b254-5e8bb75f3d65**, deployment **f2905004-61c7-4d0b-9bad-6f36183fbbb9**, 100%. NEWS D1 additive migration 0009 only. No Sync Worker/D1, Account, AI Support or other app feature changes. Final documentation audit commit follows this report; final HEAD/origin equality is checked after that normal push. Protected original checkout HEAD fc57c02c remains unchanged. Temporary release-worktree dependency symlinks are removed after CLI/QA; original dependency directories remain untouched. No add ., reset --hard, clean, stash or force push.

Rollback: current hard-OFF/no-Cron profile plus audited collection/publication/API controls; retain additive DB schema and old news. Older 0.3 collector positional inserts are not compatible with the added run column, so never resume old collection after migration. Pages rollback uses ordinary revert/push. See current operations for safe targeted content handling. Technical Release Blocking: **0**; coverage gaps are explicitly retained.

## 25. Remaining Coverage Gaps

Major SALE and named guitar/弾き語り artists are absent. Fresh manufacturer Gear, acoustic guitar breadth, mic/interface/recording/streaming and vendor-update coverage are narrow. Archive publisher diversity must not be confused with live collection diversity. Natalie feed volume does not prove artist recall; exact curated performer/event facts need broader verified input surfaces. Deviser product names need a truthful identifier path. Source policy evidence will expire and may change earlier; stop and reassess rather than silently continuing.

## 26. Recommended Next Expansion

1. Sound House and Ikebe: complete applicable first-party terms/linking/robots/discovery evidence for product and broad-sale surfaces; seek publisher clarification if needed, with user authorization before any outreach.
2. Deviser / ZOOM / Audio-Technica / Hookup: reliable official identifier-bearing listing/feed plus current policy/robots evidence, prioritizing recording/interface gaps.
3. Yamaha / Roland / chuya / AHS: resolve actual allowed robots surface/evidence without access-control bypass; keep current live blockers until proven.
4. Broaden guitar-performance/event facts on legally assessed official low-load sources. CONTACT/DO_NOT_USE are not automatically promoted.
5. Observe the next daily run in normal operational health when available; this report does not invent an October 1 outcome. Expansion acceptance should use useful fresh coverage and review recall, not a source-count target alone.

## Final YES / NO

| Check | Result |
|---|---|
| Shimamura is the only production source | NO |
| legacy 23 NEWS restored | YES |
| review candidates can be operator-approved | YES |
| review candidates can be rejected | YES |
| public unauthenticated approval is possible | NO |
| useful official product news unnecessarily remains REVIEW | NO (production-ready queue: 0 pending) |
| daily update is 06:00 JST | YES (deployed; first next-day scheduled run not yet observed) |
| same scheduled source can fetch repeatedly in one JST day | NO |
| multiple production sources active | YES (4 collecting; 3 produced eligible current data) |
| gear coverage expanded | YES |
| sale coverage expanded | NO |
| DTM/software coverage expanded | YES |
| artist/live/event coverage expanded | YES (1 guitar event; named artists still 0) |
| Sound House production-enabled | NO |
| Ikebe production-enabled | NO (legacy-only rows are not live enablement) |
| evidence gate preserved for every enabled source | YES |
| robots policy preserved | YES |
| raw article HTML stored | NO |
| original headlines stored | NO (current repo/D1/retained logs; corrected temporary research-helper issue disclosed above) |
| publisher images stored | NO |
| Source Health covers new sources | YES |
| production API returns multi-source news | YES |
| all tests pass | YES (1,820) |
| production smoke passes | YES |
| Git safety followed | YES |
