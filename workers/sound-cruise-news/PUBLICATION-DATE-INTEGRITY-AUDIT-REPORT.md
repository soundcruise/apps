# NEWS Publication Date Integrity Audit Report

Audit date: 2026-10-03 JST. READ ONLY production inspection; no collection, repair, approve/reject, or deploy invoked.

## Overall Verdict

**AUDIT COMPLETE — H5 stored-date error NOT REPRODUCED against the current first-party page. Publisher redating remains a documented boundary.**

The prior report's assertion that H5's stored date was incorrect is withdrawn. The web search retrieval served a November 12, 2025 version describing H5/H6 v1.20. A direct HTTP request and the rendered browser served October 02, 2026 and H5 v1.70/H6 v1.60 at the same canonical URL. The source listing also explicitly declares October 02, 2026. These are different revisions of publisher content, not proof that ingestion substituted the collection date. The exact publisher revision time cannot be reconstructed from available records.

Starting main = origin/main = actual remote main f6bce87134a43c46278c2a34b91b6411a3e2400b; ahead/behind 0/0; tracked/staged clean; known untracked preserved. Port 1.15.0 / public NEWS 0.13.0 / Operator 0.20.1, measured public health and authenticated UI.

## 1. H5studio Root Cause

- URL: https://zoomcorp.com/ja/jp/news/h6studio-h5studio-update/
- Candidate ID: 350a2104eb054e5067a2e62546abcad8efa59903f8f004314f43b809359608df
- Stored publication and feed publication: 2026-10-01T15:00:00.000Z = 2026-10-02 00:00 JST.
- Collection: 2026-10-02T21:01:05.854Z = 2026-10-03 06:01:05 JST; scheduled run aad44926-f85f-47dd-a009-614195e68f78.
- No date override, migration date rewrite, or current-date fallback found. Current page time datetime=2026-10-02 agrees with written date and current listing.
- The old web retrieval is independent evidence of a prior URL revision, not authoritative evidence of the current revision date. Its original date must not be blindly written into the current candidate.
- Original scheduled response HTML was deliberately not retained. Saved feed date, discovery run, source code, current parser replay, and current rendered page establish the ingress origin; they do not establish the publisher's exact historical edit time.

## 2. Date Trace

| Stage | Date value | Evidence / transformation |
|---|---|---|
| Search retrieval, older article revision | 2025-11-12 | H5/H6 v1.20; differs from current direct page |
| Current official article | 2026-10-02 | visible time and datetime, H5 v1.70 / H6 v1.60 |
| Current official listing | October 02, 2026 | fixed card-local time, not list order or request date |
| parseZoomListing | 2026-10-01T15:00:00.000Z | English calendar date validated and normalized from JST |
| candidateFrom | same UTC value | publishedAt and feedPublishedAt taken from entry.date |
| collectedAt | 2026-10-02T21:01:05.854Z | separate scheduler clock, October 3 JST |
| DB insert | published_at = feed_published_at = entry date | no collected date substitution |
| Rediscovery / dedupe | existing date retained | source+URL/id uniqueness; duplicate facts update does not update dates |
| Automatic publication | original candidate date retained | updates review status only |
| Human takedown | original candidate date retained | reject / minor_update / human_operator, revision 1 |

## 3. ZOOM Audit

All four persisted ZOOM candidates audited; approved 3, pending 0, rejected 1. Current listing 12 cards. No saved-date mismatch against current first-party article/list date.

| Article | Official Date (current direct) | Stored Date JST | Match | Freshness Risk |
|---|---|---|---|---|
| H5studio firmware | 2026-10-02 | 2026-10-02 | YES | older search revision exists; human reject/takedown retained |
| TCA-1 firmware | 2026-08-07 | 2026-08-07 | YES | not fresh 7/14 days; normal 90-day expiry |
| H2essential firmware | 2026-07-10 | 2026-07-10 | YES | not fresh 7/14 days; close to expiry |
| WLM-1 notice | 2026-07-08 | 2026-07-08 | YES | not fresh; unrelated label semantics require separate review |

Source: https://zoomcorp.com/ja/jp/news/ ; individual URLs in appendix / H5 trace. Fixed daily listing-only runtime: robots + one listing, 24-hour interval, 512KB bound, no article fetch added. Current parser validates written English calendar dates and fails closed on structural/calendar errors.

## 4. Cross-Source Audit

No active source uses collection date as article date. Collection time remains a separate field. RSS/Atom use explicit publication fields (pubDate, published, dc:date, news:publication_date); updated/ordinary sitemap lastmod are excluded.

| Source | Current date input | Collection-date fallback | Read-only comparison |
|---|---|---|---|
| 島村 | card date with calendar validation | none | 6 exact current listing matches; other 11 not currently listed |
| Ikebe | Published/list time; product list text and datetime agree | none | 8 exact matches; 5 not currently listed |
| IK | press card written date, UTC normalization | none | 2 exact matches; ReSing legacy date differs by 9h, same Sep17 JST day |
| AGM | interview RSS publication | none | 2 exact matches |
| AT Distribution | written listing calendar date | none | 1 exact match |
| amass | scoped guitarist RSS pubDate | none | 1 exact match |
| キクタニ | card time, written calendar date | none | Godin exact; 信州ギター祭 source date changed Sep26→Oct2, stored Sep26 retained |
| Sleepfreaks | RSS pubDate | none | 3 exact; NOVA legacy date-only vs full feed timestamp, same Sep18 JST day; 1 not listed |

Total current listing/feed exact matches including ZOOM approved: 27/56. Another 2 have matching JST day but date-only timestamp precision. 信州ギター祭 has a changed publisher date, not a DB freshness rewrite. Other rows checked against saved evidence; not all 56 article bodies were re-fetched. Missing/out-of-list evidence is explicitly unverified, never labeled a proven date error.

Legacy backfill uses the immutable approved fixture date (20 current rows match that snapshot), not the backfill execution date. Manual additions require explicit publication date and date checks. Existing review correction requires a date override reason; facts recovery rejects changed dates and does not replace them.

## 5. Stale Re-Surfacing Risk

- Declared old publication date + today's collection: outside 90 days is rejected; in-window old dates remain old and expiry derives from article date.
- Same URL rediscovery, including a publisher-redated listing: existing published/feed/collection dates and expiry are unchanged. Demonstrated by regression test and actual 信州ギター祭 record.
- **Residual boundary**: when the publisher replaces date/content at one URL before its first ingestion, the current declared date may legitimately describe a new firmware revision (H5 case). Without historical publisher evidence, ingestion cannot reconstruct the original URL date or tell a substantive revision from cosmetic redating.
- After candidate expiry, old declared dates are still rejected; if the publisher instead declares a new date, the projection can accept that new metadata. Firmware is REVIEW under the preceding release. Non-firmware redating after expiry is not categorically prevented by a durable original-publication registry. This audit does not claim that broader risk is fixed.
- One-hour physical retention lead and 90-day candidate/takedown retention are existing policy; Decision Ledger retained separately. No retention extension implemented.

## 6. Freshness / Ticker Impact

Counterfactual only: if 2025-11-12 were still the content's actual date but 2026-10-02 were erroneously used, at first ingestion October 3 06:01 JST:

| Window | 2026-10-02 stored date | 2025-11-12 old date |
|---|---|---|
| 24h | NO (already ~30h old) | NO |
| 7 days | eligible | excluded |
| 14 days | eligible | excluded |
| ticker | eligible pool, not guaranteed top 5 | excluded |
| expiry | 2026-12-31 00:00 JST | 2026-02-10 00:00 JST, already expired |

Actual H5 currently declares Oct2 with different firmware versions. Human reject prevents all public exposure regardless of date. Ticker uses 7-day pool, 14-day fallback only when the 7-day pool is empty, max 5; expiry and public visibility use publication date, not discovery clock.

## 7. Existing Published Audit

All 56 approved rows inspected for published/feed date agreement, collection substitution, URL year/month inconsistencies, origin and provenance. Automatic 35 / legacy fixture 20 / operator manual 1. Feed/published mismatches 0; exact collection substitutions 0; URL month mismatches 0. Full row evidence summary appears below.

Current-date differences requiring attention (no state changes):
- 信州ギター祭: stored Sep26, current listing/article time Oct2 and modified_time Oct2. Cannot conclude stored Sep26 was wrong originally. Keeping it old prevents freshness uplift.
- ReSing Vol2: UTC vs JST midnight precision, same Sep17 day; not a stale-date issue.
- NOVA and CenterOne3: legacy date-only midnight vs precise publication timestamps, same JST dates; not a proven wrong publication day.
- AHS 1.0.1 and out-of-list rows: saved approved date exists; current direct extraction did not establish a date. Do not replace with discovery date.

## 8. Fix

No production behavior/source changes. H5 ingestion date error was not established; therefore no speculative parser repair, date fact correction, migration, version bump, commit, push or deploy. Added 11 persistent regression tests only. Source redating provenance/history would require a separately scoped design decision; it is not disguised as a small date patch.

## 9. Tests

NEWS 510/510 PASS (499 existing + 11 date integrity tests); Port NEWS 28/28 PASS. Coverage: old date/new collection; ZOOM calendar rollover; missing/invalid/future date; Atom published vs updated; updated-only/lastmod; rediscovery with changed date; 7/14 ticker; 90-day API/expiry/purge; post-retention redating boundary. Existing human takedown/Ledger/Shadow/duplicate tests included. Syntax and git diff --check PASS. Initial sandbox suite run was blocked by local workerd listen EPERM; authorized local-port rerun passed. No production write testing.

## 10. Production Verification

Read-only D1 before/after: candidates, Ledger, Shadow, source state, ZOOM health and ZOOM collection runs byte-for-byte unchanged. Approved 56 / pending 13 / rejected 20 / human 7 / Shadow 34. Last ZOOM scheduled run Oct3 06:01:05.854 JST: collected, 12 cards, new 1, rejected 8, duplicates 3; healthy/ok, failure count0. Scheduled collection was not manually re-run.

Public API 56; H5 absent; ticker absent; public health 0.13.0 collection/publication/api all true. Authenticated Operator UI version0.20.1 and H5 rejected state remain present. H5 decision e020341d-874b-40fa-9f97-55cd2a68fb72 and takedown unchanged. Read-only D1 OAuth initially returned 7403; normal existing identity check and retry succeeded.

## 11. Remaining Review Candidates

TCA-1, H2essential, Instrument X1.0.1, CenterOne3, LUNA3, TONEX2.0 remain published unchanged; importance judgments are a separate human review. TCA Aug7/H2 Jul10 direct dates match; LUNA Sep15 full RSS time and TONEX Aug7 UTC press time match; CenterOne Sep25 day agrees with precise published_time (modified_time separately differs); AHS Sep17 saved date remains unverified by current date extraction. 信州ギター祭 redating should be understood as source revision provenance, not automatically corrected. WLM-1 postponed-release notice vs existing release label is a separate semantic review candidate, outside this date repair.

## 12. Git

main = origin/main = f6bce871; ahead/behind0/0; no staged or tracked modifications to production files. New uncommitted files: this audit report and test/publication-date.test.js. Known .claude/ and Sync node_modules retained. No prohibited Git operations.

## Appendix — all 56 approved rows

Evidence vocabulary: feed snapshot = saved explicit publication metadata, not independent current article verification; fixture snapshot = approved immutable legacy fixture; current = today's exact known listing/feed or direct publication metadata. Not listed means unavailable on this bounded current surface, not a date error.

| Article | Source | Stored date/time JST | Evidence | Finding |
|---|---|---|---|---|
| [ESP、PA-MF-10を発表](https://www.shimamura.co.jp/update/guitar-bass/2026/09/85289/) | shimamura | 2026-09-26 00:00:00 | saved feed snapshot | saved evidence consistent; current article date not independently verified |
| [Fender、FSR American Acoustasonic Telecasterを発表](https://www.shimamura.co.jp/update/guitar-bass/2026/09/87963/) | shimamura | 2026-09-26 00:00:00 | saved feed snapshot | saved evidence consistent; current article date not independently verified |
| [HISTORY、HSLCシリーズの製品情報](https://www.shimamura.co.jp/update/guitar-bass/2026/09/84675/) | shimamura | 2026-09-25 00:00:00 | saved feed snapshot | saved evidence consistent; current article date not independently verified |
| [Jackson、Flex A-Frame Standを発表](https://www.shimamura.co.jp/update/guitar-bass/2026/09/85571/) | shimamura | 2026-09-25 00:00:00 | saved feed snapshot | saved evidence consistent; current article date not independently verified |
| [BOSS、EX-4を発表](https://www.shimamura.co.jp/update/amp-effector/2026/09/87167/) | shimamura | 2026-09-24 00:00:00 | saved feed snapshot | saved evidence consistent; current article date not independently verified |
| [VOX、AC MINIを発表](https://www.shimamura.co.jp/update/amp-effector/2026/09/81190/) | shimamura | 2026-09-23 00:00:00 | saved feed snapshot | saved evidence consistent; current article date not independently verified |
| [GodinのCentury Maho EQ、総単板アコギの製品情報](https://www.kikutani.co.jp/news/godin-century-maho-eq/) | kikutani | 2026-09-24 00:00:00 | approved fixture snapshot; current listing/feed 2026-09-24 00:00:00 | exact timestamp match |
| [Martin 000JR Eに浜田省吾モデル](https://www.shimamura.co.jp/update/guitar-bass/2026/09/gs-701376/) | shimamura | 2026-09-01 00:00:00 | approved fixture snapshot | saved evidence consistent; current article date not independently verified |
| [Headwayの新モデル、四季と桜をモチーフに](https://www.shimamura.co.jp/update/guitar-bass/2026/09/69253/) | shimamura | 2026-09-01 00:00:00 | approved fixture snapshot | saved evidence consistent; current article date not independently verified |
| [Gibson J-45 StandardにHiFi DNA搭載仕様](https://www.ikebe-gakki.com/blog/gibson-lrbaggs_hifi-dna/) | ikebe | 2026-09-24 00:00:00 | approved fixture snapshot | saved evidence consistent; current article date not independently verified |
| [Gretsch G6138 Bo Diddleyの限定復刻モデル](https://www.ikebe-gakki-pb.com/new_product/172573/) | ikebe | 2026-09-25 00:00:00 | approved fixture snapshot; current listing/feed 2026-09-25 00:00:00 | exact timestamp match |
| [ヤマハRS20MM、Matteo Mancusoシグネチャーモデル](https://www.ikebe-gakki-pb.com/new_product/172547/) | ikebe | 2026-09-25 00:00:00 | approved fixture snapshot; current listing/feed 2026-09-25 00:00:00 | exact timestamp match |
| [Jackson PC1-E、Phil Collenシグネチャーモデル](https://discover.chuya-online.com/20260925/94854/) | chuya | 2026-09-25 00:00:00 | approved fixture snapshot | saved evidence consistent; current article date not independently verified |
| [Fender Player Fusionの限定モデル情報](https://discover.chuya-online.com/20260925/94325/) | chuya | 2026-09-25 00:00:00 | approved fixture snapshot | saved evidence consistent; current article date not independently verified |
| [Xotic XXP-1、エクスプレッションペダルの製品情報](https://www.shimamura.co.jp/update/amp-effector/2026/09/84780/) | shimamura | 2026-09-11 00:00:00 | approved fixture snapshot | saved evidence consistent; current article date not independently verified |
| [CAJ AC/DC Station VII、ペダル用電源の新製品](https://www.shimamura.co.jp/update/amp-effector/2026/09/80794/) | shimamura | 2026-09-05 00:00:00 | approved fixture snapshot | saved evidence consistent; current article date not independently verified |
| [KHAN AUDIO 9VDI、9V電源で動く真空管DI](https://www.shimamura.co.jp/update/amp-effector/2026/09/83690/) | shimamura | 2026-09-12 00:00:00 | approved fixture snapshot | saved evidence consistent; current article date not independently verified |
| [JAM Pedals Wahcko mk.2、ワウペダルの新モデル](https://www.ikebe-gakki-pb.com/new_product/172586/) | ikebe | 2026-09-28 00:00:00 | approved fixture snapshot; current listing/feed 2026-09-28 00:00:00 | exact timestamp match |
| [MXRの新ペダル2機種、グラニュラーとフランジャー](https://www.ikebe-gakki-pb.com/new_product/172516/) | ikebe | 2026-09-24 00:00:00 | approved fixture snapshot; current listing/feed 2026-09-24 00:00:00 | exact timestamp match |
| [Lunacy Audio NOVA、音源ライブラリ向けの新基盤](https://sleepfreaks-dtm.com/dtm-materials/lunacy_nova/) | sleepfreaks | 2026-09-18 00:00:00 | approved fixture snapshot; current listing/feed 2026-09-18 12:49:41 | same day; timestamp precision/timezone differs |
| [AHSがInstrument Xの1.0.1更新版を公開](https://www.ah-soft.com/inst-x/setup/) | ahs | 2026-09-17 00:00:00 | approved fixture snapshot | saved evidence consistent; current article date not independently verified |
| [Rupert Neve Designsからプラグイン3製品](https://hookup.co.jp/blog/1606531) | hookup | 2026-09-19 00:00:00 | approved fixture snapshot | saved evidence consistent; current article date not independently verified |
| [CenterOne 3の更新情報、音像調整機能を強化](https://sonicwire.com/news/blog/2026/09/centerone3) | sonicwire | 2026-09-25 00:00:00 | approved fixture snapshot; current article published 2026-09-25 10:30:06 | same publication day; midnight vs precise time |
| [DOTEC-AUDIO DeeMultiWider、5バンド対応の新製品](https://sonicwire.com/news/blog/2026/09/dotec-audio-5-deemultiwider) | sonicwire | 2026-09-17 00:00:00 | approved fixture snapshot | saved evidence consistent; current article date not independently verified |
| [ReSing向け追加ボイスパックにVol 2](https://www.ikmultimedia.com/news/?item_id=19792) | ik | 2026-09-17 00:00:00 | approved fixture snapshot; current listing/feed 2026-09-17 09:00:00 | same day; timestamp precision/timezone differs |
| [Yamaha、FG7 / FS7シリーズの新モデルを発表](https://jp.yamaha.com/products/musical_instruments/guitars_basses/ac_guitars/fg_series/fg_7/index.html) | yamaha | 2026-09-18 00:00:00 | approved fixture snapshot | saved evidence consistent; current article date not independently verified |
| [信州ギター祭、ギター関連イベントの出展情報](https://www.kikutani.co.jp/news/shinsyu-guitar-2026/) | kikutani | 2026-09-26 00:00:00 | saved feed snapshot; current listing/feed 2026-10-02 00:00:00 | publisher current date differs; original retained |
| [VocAlign 7の製品情報](https://sleepfreaks-dtm.com/dtm-materials/vocalign-7/) | sleepfreaks | 2026-09-24 22:11:40 | saved feed snapshot; current listing/feed 2026-09-24 22:11:40 | exact timestamp match |
| [LUNA 3を更新](https://sleepfreaks-dtm.com/dtm-materials/luna-3/) | sleepfreaks | 2026-09-15 16:05:05 | saved feed snapshot; current listing/feed 2026-09-15 16:05:05 | exact timestamp match |
| [SINPHONICAを発表](https://sleepfreaks-dtm.com/softsynth/sinphonica/) | sleepfreaks | 2026-09-08 18:29:25 | saved feed snapshot; current listing/feed 2026-09-08 18:29:25 | exact timestamp match |
| [LAVA MUSIC、LAVA STUDIOの製品情報](https://sleepfreaks-dtm.com/dtm-materials/lava-studio/) | sleepfreaks | 2026-08-17 11:30:34 | saved feed snapshot | saved evidence consistent; current article date not independently verified |
| [ZOOM、TCA-1のファームウェア更新](https://zoomcorp.com/ja/jp/news/tca-1_v110/) | zoom | 2026-08-07 00:00:00 | saved feed snapshot; current official listing/article 2026-08-07 | exact current date match |
| [ZOOM、H2essentialのファームウェア更新](https://zoomcorp.com/ja/jp/news/h2essential_v210/) | zoom | 2026-07-10 00:00:00 | saved feed snapshot; current official listing/article 2026-07-10 | exact current date match |
| [ZOOM、WLM-1を発売](https://zoomcorp.com/ja/jp/news/wlm1_notice/) | zoom | 2026-07-08 00:00:00 | saved feed snapshot; current official listing/article 2026-07-08 | exact current date match |
| [リック・ニールセン、ギター演奏に関する話題](https://amass.jp/192113/) | amass | 2026-09-29 17:08:00 | saved feed snapshot; current listing/feed 2026-09-29 17:08:00 | exact timestamp match |
| [Ibanez、j.custom RG8570EM-NTを発表](https://www.ikebe-gakki-pb.com/new_product/172605/) | ikebe | 2026-09-29 00:00:00 | saved feed snapshot; current listing/feed 2026-09-29 00:00:00 | exact timestamp match |
| [Fortin Amplification、3.33を発表](https://www.ikebe-gakki-pb.com/new_product/172597/) | ikebe | 2026-09-28 00:00:00 | saved feed snapshot; current listing/feed 2026-09-28 00:00:00 | exact timestamp match |
| [Epiphone、Joan Jett Olympic Specialを発表](https://www.ikebe-gakki-pb.com/new_product/172505/) | ikebe | 2026-09-18 00:00:00 | saved feed snapshot; current listing/feed 2026-09-18 00:00:00 | exact timestamp match |
| [KORG、Nu:Tekt NuTube HIGH GAIN ODを発表](https://www.ikebe-gakki-pb.com/new_product/172492/) | ikebe | 2026-09-18 00:00:00 | saved feed snapshot | saved evidence consistent; current article date not independently verified |
| [KORG、Nu:Tekt NuTube OD-KIT CUSTOM CRAFT BD-Sを発表](https://www.ikebe-gakki-pb.com/new_product/172475/) | ikebe | 2026-09-17 00:00:00 | saved feed snapshot | saved evidence consistent; current article date not independently verified |
| [KLOWRA、Leap Octaveを発表](https://www.ikebe-gakki-pb.com/new_product/172417/) | ikebe | 2026-09-17 00:00:00 | saved feed snapshot | saved evidence consistent; current article date not independently verified |
| [KORG、TM-1を発表](https://www.ikebe-gakki-pb.com/new_product/172461/) | ikebe | 2026-09-17 00:00:00 | saved feed snapshot | saved evidence consistent; current article date not independently verified |
| [IK Multimedia、TONEX Boardを発売](https://www.ikmultimedia.com/news/?item_id=19753) | ik | 2026-09-03 09:00:00 | saved feed snapshot; current listing/feed 2026-09-03 09:00:00 | exact timestamp match |
| [IK Multimedia、TONEX software 2.0を更新](https://www.ikmultimedia.com/news/?item_id=19651) | ik | 2026-08-07 09:00:00 | saved feed snapshot; current listing/feed 2026-08-07 09:00:00 | exact timestamp match |
| [松本孝弘、10月13日〜11月1日にイケシブSHOWCASE（渋谷）で使用ギター・機材展示](https://www.ikebe-gakki.com/blog/20261013-1101-tak-matsumoto/) | manual-ikebe | 2026-09-28 00:00:00 | manual verified date/checks | saved evidence consistent; current article date not independently verified |
| [大石昌良、アコギ表現を語るインタビュー](https://acousticguitarmagazine.jp/interview/2026-0909-oishi-masayoshi/) | agm | 2026-09-09 19:00:00 | saved feed snapshot; current listing/feed 2026-09-09 19:00:00 | exact timestamp match |
| [竹内アンナ、アコギ表現を語るインタビュー](https://acousticguitarmagazine.jp/interview/2026-0824-takeuchi-annna/) | agm | 2026-08-24 19:00:00 | saved feed snapshot; current listing/feed 2026-08-24 19:00:00 | exact timestamp match |
| [阿部学、10月24日にイケシブでギターワークショップ](https://www.ikebe-gakki.com/blog/20261024-eg-workshop/) | ikebe-event | 2026-09-30 00:00:00 | saved feed snapshot | saved evidence consistent; current article date not independently verified |
| [Harrison Audio、FLEX 10を発表](https://atdistribution.net/information/1047/) | at-distribution | 2026-08-19 00:00:00 | saved feed snapshot; current listing/feed 2026-08-19 00:00:00 | exact timestamp match |
| [Gibson、SJ-200 / Hummingbirdを発表](https://www.shimamura.co.jp/update/guitar-bass/2026/10/89963/) | shimamura | 2026-10-01 00:00:00 | saved feed snapshot; current listing/feed 2026-10-01 00:00:00 | exact timestamp match |
| [PRS、Silver Skyを発表](https://www.shimamura.co.jp/update/guitar-bass/2026/10/89868/) | shimamura | 2026-10-01 00:00:00 | saved feed snapshot; current listing/feed 2026-10-01 00:00:00 | exact timestamp match |
| [SHURE、MV6 Gen 2を発売](https://www.shimamura.co.jp/update/dtm-recording/2026/10/90252/) | shimamura | 2026-10-01 00:00:00 | saved feed snapshot; current listing/feed 2026-10-01 00:00:00 | exact timestamp match |
| [Yamaha、RS20MMを発表](https://www.shimamura.co.jp/update/guitar-bass/2026/10/89944/) | shimamura | 2026-10-01 00:00:00 | saved feed snapshot; current listing/feed 2026-10-01 00:00:00 | exact timestamp match |
| [Gretsch、G6136TGQM-59を発表](https://www.shimamura.co.jp/update/guitar-bass/2026/10/90845/) | shimamura | 2026-10-02 00:00:00 | saved feed snapshot; current listing/feed 2026-10-02 00:00:00 | exact timestamp match |
| [Novation、FLpadを発売](https://www.shimamura.co.jp/update/dtm-recording/2026/10/91045/) | shimamura | 2026-10-02 00:00:00 | saved feed snapshot; current listing/feed 2026-10-02 00:00:00 | exact timestamp match |
| [Universal Audio、Volt Gen 2を発売](https://www.ikebe-gakki-pb.com/new_product/172671/) | ikebe | 2026-10-02 00:00:00 | saved feed snapshot; current listing/feed 2026-10-02 00:00:00 | exact timestamp match |
