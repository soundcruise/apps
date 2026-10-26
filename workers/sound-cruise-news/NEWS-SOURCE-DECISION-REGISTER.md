# NEWS Source Decision Register

## Purpose and status

**Operational / Historical Reference**。既存repo記録の索引・整理であり、legal opinion、新しいauthorization、再審査、source設定変更ではありません。2026-10-01の記録整理ではpublisherアクセス／Web検索／robots・規約再取得はすべて0。Balanced Source Policyを維持します。

最新production acceptance：2026-10-02（[scheduled evidence](#production-acceptance-20261002)）。以下の開始baselineは記録整理時の履歴。

記録整理日：2026-10-01。開始baseline：Port 1.11.0／NEWS 0.9.1、HEAD `92b7fc05`。既存source判断日とこの文書作成日は別です。

## Current-state precedence

**最新の連絡方針・問い合わせ証拠区分： [2026-10-21 final contact policy](#contact-policy-20261021)。** 先行する全件監査HTMLのZOOM・キクタニ「未問い合わせ」判定は同追記で訂正。許諾記録・当時の判断は歴史として保持し、Gmail不在だけで未問い合わせと断定しない。

1. 本番allowlist（[wrangler.production.jsonc](wrangler.production.jsonc)）＋D1 source_stateのread-only実測をcurrentとして扱う。registryのdefault enabled=falseだけでOFFと判定しない。
2. [registry](src/registry.js)に合成される最新のsource-specific evidenceと、[manual scopes](src/manual-sources.js)を参照する。
3. [Balanced Source Policy](BALANCED-SOURCE-POLICY.md)、[High-Value supplement](HIGH-VALUE-SOURCE-POLICY.md)と後続reportを優先。古いCONTACT／OFF一覧は当時の履歴。
4. permission不足だけで既存OKを再BLOCKしない。approved＝内部bounded assessment、明示publisher許諾とは別。権利制限、robots/access、quality、facts不足を区別する。

開始時D1 read-only実測（2026-10-01）：global collection/publication/API=1。production allowlist10 source、実収集可能9、Sleepfreaksだけcollection stopped。Natalieはallowlist外＋disabled/publication_blocked/takedown各1。9 collecting sourceはhealthy／failure0。collection全体healthに既存warning(network_or_internal_error)の記録あり。この文書は障害診断や収集成功保証ではない。

**29 registry surface entries＋追加研究／manual補助4 entries＝33 entries。** Ikebe PB/Event、Yamaha jp/newsroomは同publisherの別scopeとして別行。manual-ikebeはIkebe Event項に併記。registry内：ON 9／collection stopped 1／OFF 19。追加4：TASCAM、Steinberg、APU、KVR補助投稿。

## Shared internal boundaries

原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。

OFF／candidate-only行ではこの共通原則が将来利用を承認するものではありません。manual scopeは自動collector承認ではありません。legacy承認済みarticleの表示とsource全体のcollection ONを分けます。

## Source index

| ID | Source / Publisher | Current State | Decision |
|---|---|---|---|
| [yamaha](#source-yamaha) | Yamaha（日本製品サイト） | OFF／legacy承認済み記事は表示対象 | NEEDS EVIDENCE — ACCESS |
| [shimamura](#source-shimamura) | 島村楽器 | ON | ALLOWED WITH BOUNDS |
| [natalie](#source-natalie) | 音楽ナタリー | OFF／D1 disabled=1・publication_blocked=1・takedown=1 | COLLECTION / PUBLICATION STOPPED — QUALITY / DATE |
| [skream](#source-skream) | Skream! | OFF | NEEDS EVIDENCE — QUALITY / POLICY SCOPE |
| [morris](#source-morris) | Morris Guitars | OFF — activation hold | CONDITIONAL PUBLISHER PERMISSION — LISTING ONLY; IMPLEMENTATION REQUIRED |
| [deviser](#source-deviser) | Deviser | OFF | BOUNDED ASSESSMENT COMPLETE / TECHNICAL-QUALITY INCOMPLETE |
| [roland](#source-roland) | Roland / BOSS | OFF | NEEDS EVIDENCE — PARSER / SUPPLY / SCOPE |
| [audio-technica](#source-audio-technica) | Audio-Technica（日本メーカーサイト） | OFF | NEEDS EVIDENCE — CLIENT METADATA / VALUE |
| [kanda](#source-kanda) | 神田商会 | OFF | NEEDS EVIDENCE — REDIRECT / DISCOVERY |
| [zoom](#source-zoom) | ZOOM | ON | ALLOWED WITH BOUNDS |
| [kikutani](#source-kikutani) | キクタニ | ON | ALLOWED WITH BOUNDS |
| [ikebe-event](#source-ikebe-event) | 池部楽器 Events | ON | ACCEPTED WITH OBSERVATION |
| [at-distribution](#source-at-distribution) | AT Distribution（公式代理店） | ON | ACCEPTED WITH OBSERVATION |
| [ikebe](#source-ikebe) | 池部楽器 新製品情報局（PB） | ON（Product）／自動Sale OFF | ALLOWED WITH BOUNDS |
| [chuya](#source-chuya) | Discover chuya | OFF／legacy承認済み記事は表示対象 | NEEDS EVIDENCE — ROBOTS AMBIGUITY |
| [hookup](#source-hookup) | Hookup | OFF／legacy承認済み記事は表示対象 | BOUNDED ASSESSMENT COMPLETE / QUALITY INCOMPLETE |
| [sonicwire](#source-sonicwire) | SONICWIRE | OFF／legacy承認済み記事は表示対象 | STOPPED — FEED OPT-OUT |
| [sleepfreaks](#source-sleepfreaks) | Sleepfreaks | COLLECTION STOPPED／approved 5件visible | ALLOWED WITH BOUNDS history / STOPPED — WORKER HTTP 403 |
| [ik](#source-ik) | IK Multimedia | collection OFF／公開維持 | SOURCE POLICY EXCLUDED |
| [ahs](#source-ahs) | AHS | OFF／legacy承認済み記事は表示対象 | NEEDS EVIDENCE — PARSER / POLICY SCOPE |
| [agm](#source-agm) | AGM / Rittor Music | ON（Interview限定） | ACCEPTED |
| [korg](#source-korg) | KORG / VOX（メーカー公式） | OFF | NEEDS EVIDENCE — APPLICABLE SCOPE / DISCOVERY |
| [esp](#source-esp) | ESP / BIGBOSS | OFF | EXPLICIT PERMISSION REQUIRED — DEEP LINK EXCEPTION |
| [yamaha-newsroom](#source-yamaha-newsroom) | Yamaha newsroom | OFF | NEEDS EVIDENCE — APPLICABLE SCOPE / DISCOVERY |
| [amass](#source-amass) | amass | OFF（現行Rick Nielsen tag） | COLLECTION RETIRED |
| [tft](#source-tft) | THE FIRST TIMES | OFF | NEEDS EVIDENCE — RELEVANCE / POLICY SCOPE |
| [takamine](#source-takamine) | Takamine | OFF | DO NOT USE — EXISTING WHITELIST CLASSIFICATION |
| [kurosawa](#source-kurosawa) | クロサワ楽器 | OFF | DO NOT USE — EXISTING WHITELIST CLASSIFICATION |
| [soundhouse](#source-soundhouse) | サウンドハウス | OFF | NEEDS EVIDENCE — ROBOTS TIMEOUT / POLICY |
| [tascam](#source-tascam) | TASCAM（追加研究候補、registry未登録） | OFF／candidate-only | NOT ENABLED — USEFUL CANDIDATE NOT VERIFIED |
| [steinberg](#source-steinberg) | Steinberg（追加研究候補、registry未登録） | OFF／candidate-only | NOT ADOPTED — EXPIRED CAMPAIGN |
| [manual-apu](#source-manual-apu) | APU Software（manual-only） | MANUAL-ONLY scope／automatic OFF／既存Sale candidate REJECT・非公開 | BOUNDED MANUAL SCOPE / ITEM REJECTED — INSUFFICIENT FACTS |
| [kvr-apu-support](#source-kvr-apu-support) | KVR Audio（APU補助告知surface） | OFF／補助根拠候補の採用撤回、collector未構成 | NOT ACCEPTED AS VERIFIED SUPPORT — IDENTITY INCOMPLETE |

<a id="source-yamaha"></a>

## Yamaha（日本製品サイト） — yamaha

| Item | Existing decision record |
|---|---|
| Source / Publisher | Yamaha（日本製品サイト） |
| Surface | jp.yamaha.com 製品／guitars_basses新着候補 |
| Current State | OFF／legacy承認済み記事は表示対象 |
| Current Scope | FG7/FS7等の公式製品facts。旧fixture個別判断のみ。 |
| Decision | NEEDS EVIDENCE — ACCESS |
| Why | robots 403で自動取得停止。旧記事の掲載をlive collection承認と混同しない。 |
| Explicit Restriction | robots取得403。403回避不可。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [LEGACY-BETA-ACQUISITION-REPORT.md](LEGACY-BETA-ACQUISITION-REPORT.md)、[LEGACY-BETA-ACQUISITION-EVIDENCE.json](LEGACY-BETA-ACQUISITION-EVIDENCE.json)、[COVERAGE-EXPANSION-PHASE1-REPORT.md](COVERAGE-EXPANSION-PHASE1-REPORT.md) |
| Decision Date | 2026-09-28〜09-30 |
| Notes | Yamaha newsroomとは別host／別scope。製品ページ閲覧可でも自動アクセス可を推定しない。 |

<a id="source-shimamura"></a>

## 島村楽器 — shimamura

| Item | Existing decision record |
|---|---|
| Source / Publisher | 島村楽器 |
| Surface | https://www.shimamura.co.jp/update/common/new-item/ 固定新製品listing |
| Current State | ON |
| Current Scope | アコギ、ギター／ベース、アンプ／エフェクター、DTM／Recordingの製品ニュース。 |
| Decision | ALLOWED WITH BOUNDS |
| Why | 公式cardの日付・category・製品factsと適用条件を検証。内部bounded判断で採用。 |
| Explicit Restriction | 出典識別、frame禁止、別windowのリンク条件。shops／sale／campaign／event等は今回scope外。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | documented silence／明示的automation許諾なし。既存の限定内部判断であり、許諾の不在だけを利用不可の理由にしない。 |
| Evidence | [src/shimamura-evidence.js](src/shimamura-evidence.js)、[src/source-policies.js](src/source-policies.js)、[COVERAGE-EXPANSION-PHASE1-REPORT.md](COVERAGE-EXPANSION-PHASE1-REPORT.md) |
| Decision Date | 2026-09-28〜09-30 |
| Notes | 条件付きリンク案内はautomation grantではない。 |

<a id="source-natalie"></a>

## 音楽ナタリー — natalie

| Item | Existing decision record |
|---|---|
| Source / Publisher | 音楽ナタリー |
| Surface | https://natalie.mu/music/feed/news RSS |
| Current State | OFF／D1 disabled=1・publication_blocked=1・takedown=1 |
| Current Scope | 過去はギター根拠のあるArtist／Event限定。現在generic feedを再開しない。 |
| Decision | COLLECTION / PUBLICATION STOPPED — QUALITY / DATE |
| Why | 内部限定審査後、generic sampleのrelevance不足・日付問題により個別停止。これはpublisherの新しい禁止認定ではない。 |
| Explicit Restriction | 権利侵害・引用条件を尊重。停止flagは内部運用であり、publisherからの法的takedown通知を示すものではない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | documented silence／明示的automation許諾なし。既存の限定内部判断であり、許諾の不在だけを利用不可の理由にしない。 |
| Evidence | [src/coverage-evidence.js](src/coverage-evidence.js)、[MORNING-COVERAGE-SPRINT-REPORT.md](MORNING-COVERAGE-SPRINT-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-REPORT.md](BLOCKED-SOURCE-RECOVERY-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-EVIDENCE.json](BLOCKED-SOURCE-RECOVERY-EVIDENCE.json) |
| Decision Date | 2026-09-30 |
| Notes | 過去ON記述は当時の履歴。currentはD1とproduction allowlist優先。 |

<a id="source-skream"></a>

## Skream! — skream

| Item | Existing decision record |
|---|---|
| Source / Publisher | Skream! |
| Surface | https://skream.jp/news/index.xml 汎用RSS／artist・live入口候補 |
| Current State | OFF |
| Current Scope | guitar／SSW専用surfaceは未確定。汎用feedは採用しない。 |
| Decision | NEEDS EVIDENCE — QUALITY / POLICY SCOPE |
| Why | sample10件で明示ギター関連0。別運営hostの規約scopeも未完。 |
| Explicit Restriction | 転載等の条件を留保。個別automation／facts禁止を既存記録で確定したものではない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [BLOCKED-SOURCE-RECOVERY-REPORT.md](BLOCKED-SOURCE-RECOVERY-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-EVIDENCE.json](BLOCKED-SOURCE-RECOVERY-EVIDENCE.json)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-09-30〜10-01 |
| Notes | バンド名から楽器／弾き語りを推定しない。 |

<a id="source-morris"></a>

## Morris Guitars — morris

| Item | Current permission / activation record |
|---|---|
| Source / Publisher | Exact attribution **Morris Guitars**; internal ID `morris`. Responding company: 株式会社モリダイラ楽器, 情報推進室, which manages the official website. |
| Surface | One public listing: https://www.morris-guitar.com/information/ . Only newly discovered, fresh, date-bound `/information/YYYY/MMDD_NN.html` details may be checked once. |
| Decision | **SPECIFIC OPERATION CONFIRMED BY PUBLISHER / ACTIVE**. The earlier listing-only technical hold is superseded by the later assent below, within its explicit scope. |
| Evidence | Initial conditions: thread/message `1a137cb715dc72cc`, 2026-10-14 09:23:30 JST. Owner's actually SENT explanation: `1a1390041cb2f0bc`, 15:01:20 JST. Final publisher assent to that explanation: `1a1391d419b252c5`, 15:32:29 JST, same thread. All three actual Gmail messages were verified together. No email body, postal address, phone or signature is stored here. |
| Current Scope | Acoustic-guitar product/performer/event/competition/exhibition facts under existing publication quality checks. Discovery and eligibility are separate; unsupported facts remain pending. |
| Acquisition | Public Information listing at most once per JST day across scheduler/manual paths. Only new, date-consistent articles within a 48-hour publication freshness window, one detail request per canonical URL for its lifetime. Up to 3 new details per day as an additional internal low-load limit. A spent reservation remains spent after errors/crashes/deploys. Operator/autonomous recheck only reuse durable acquired facts; neither can initiate another Morris detail/listing request. |
| Initial Baseline | The listing was already audited once today; do not request it again. Import that spent daily budget plus the one new 10/14 article's actual once-only evidence before enablement. Only this known fresh article is initially processed; older 10/01 and earlier entries are outside the freshness window. Future listing observations register older URLs as `baseline_old` without requesting details. No historical backfill. |
| Robots / Redirect | Today's separate robots observation returned 404 without redirects. Explicit publisher permission and reviewed robots absence are separate facts. Future daily runs check robots once before the listing; any newly installed policy requires manual review. Zero redirect destinations, images, PDFs, embeds, product pages, archive/pagination or RSS requests. |
| Presentation | Facts-only independent short labels + exact source attribution + direct article links. No original headline/body/images/logos, long quotation, official recognition or partnership implication. Only bounded facts, provenance, response hashes and keyed title fingerprints persist. |
| Publication / Learning | All new Morris candidates require the owner's final publication decision. Permission, discovery and source policy are not editorial approval, rejection or human teacher signals. Existing published articles, Ledger, feedback and teacher data are preserved. |
| Correction / Deletion / Stop | Promptly honor correction, removal and stop requests. Existing source stop/publication-block/takedown controls remain available; acquisition checks the stop/global switches before each request. |
| Production | Source starts OFF in the additive migration. Only enable after regression, Worker builds, normal Git publication, deployment and receipt initialization. Final activation/health/version evidence is recorded below after live verification. |
| Formal Launch Status | PERMISSION RECEIVED / SPECIFIC ACQUISITION AND PRESENTATION METHOD CONFIRMED. This does not authorize unrestricted crawling, repeated recovery or media reproduction. |

### 2026-10-14 — Final assent and implementation boundary

The owner sent the concrete daily-listing / once-per-new-article method at 15:01 JST. The publisher's 15:32 JST reply explicitly accepted the method in that sent email. This is the affirmative confirmation missing from the morning listing-only record, not permission inferred from silence or from an unsent draft. RSS stays excluded. Earlier observations and interpretations below remain historical; their former “no detail permission / draft only” status must not be read as the current state.

Implementation: `src/morris-policy.js`, `src/morris-evidence.js`, `src/morris-collector.js`, additive `0016_morris_acquisition.sql`. D1's atomic daily request key and permanent article URL key are shared by both Workers and CLI collectors. Morris repair/recheck is cache-only. Failed detail requests become safe pending evidence and never reset their spent receipts; HTTP/robots/parser failures stop this source for explicit review. No changes to unrelated source scope, scheduler times or public article data.

### Production acceptance — 2026-10-14

- Activated **2026-10-14 16:46 JST**, after NEWS **0.27.0** / Operator **0.26.0** deployment and additive migration `0016_morris_acquisition.sql`. Source config: `morris`, `morris_listing`, exact **Morris Guitars** attribution, permission reference `morris-permission-2026-10-14`. Both Worker allowlists include only this additional ID; existing cron times and other source states are unchanged.
- Imported the already-spent 10/14 daily budget (one listing observation and one separate robots-404 observation) and the actual single fresh detail request for `/information/2026/1014_01.html`. Original listing HTML/hash and exact listing request time were not retained by the morning audit; no timestamp/hash is fabricated and no replacement listing GET is made. Its verified URL/day observation supplies only this one initial entry. The detail receipt retains its real attempt timestamp, response hash, `og:url` identity, structured facts, proof and keyed headline fingerprint. No publisher HTML/body/original headline/media is stored.
- First production collection **16:46 JST**: `collected`, one new **pending** candidate, zero rejects, zero duplicate insertions, **zero additional publisher HTTP requests**. Today's network observations total one listing, one robots check and one permitted new detail; the first production sink reuses that evidence. Older entries are not fetched/backfilled. Same-day production replay: zero additional HTTP requests, zero insertions, one existing URL recognized.
- Candidate `a7eb4c92147a070881ccc147634a50dd831ca53204f54d84c4dba4bce005acfc`: independent label **Morris Guitars、「東京楽器博 2026」への出展を告知**; publication day **10/14 JST**, event **10/31–11/1**, venue **科学技術館**, Morris exhibitor. `live_guitar`, `PUBLISH_REVIEW`, `pending`; authenticated production Operator reports **掲載可**, validation `valid=true`, no errors/duplicates. No publish/reject action was performed.
- Source health **healthy / ok**, failures 0. The public API's existing **130** visible articles and ticker are exactly unchanged. All **170** pre-existing candidate records, **92** Decision Ledger rows, **114** feedback rows and **239** pre-existing Shadow rows compare unchanged. Other source states and health also compare unchanged.
- Regression: NEWS/Operator **906/906**, Port NEWS **46/46**, both Worker builds, syntax/diff and secret scan PASS. A real isolated D1 test covers atomic concurrent claims and immutable provenance. No human teacher signal is created by permission, activation or acquisition.
- First full scheduled publisher acquisition from the Cloudflare runtime is the next daily 06:00 JST run; it was not forced early. The initial live acceptance confirms the imported once-only evidence and production candidate/validation path. New layouts, unsupported facts, new robots policies, failures or freshness conflicts remain fail-closed; exhausted detail evidence does not schedule repeated external recovery.

### Listing Recovery release — 2026-10-14

NEWS 0.28.0 / Operator 0.27.0 adds primary listing evidence and bounded article-type recovery. This is the same publisher-assented daily Information surface; no additional publisher request, RSS, archive-detail visit, permission extension, automatic approval or new source is authorized by this release. The production migration remains 0016; no new migration or rewrite of existing receipts/candidates is required.

- The next permitted daily fetch saves its actual listing URL, attempt timestamp, response hash, parser version, permission reference and canonical identity, plus each exact linked article URL, original publication day, keyed heading fingerprint, structured recovered facts/type/provenance or an explicit unresolved assessment. No original heading, description/body, raw HTML, images or logos persist.
- Historical discovery uses only verified stored listing facts, including URLs previously marked `baseline_old`; it never resets or consumes a historical detail request. New detail discovery keeps the original 48h date binding, daily budget and permanent once-per-URL receipt. Operator/autonomous facts recovery remains cache-only.
- A listing-only report/feature/support/catalogue is not a future launch or scheduled event. Unsupported/ambiguous identities remain unresolved. Event dates, expiration, release status, source policy, duplicate and publication-quality gates still apply. Shared persons or broad themes alone do not collapse independent articles.
- Keep the existing 90-day publication/retention window. Valuable older reports or explanations are future product-policy candidates, not eligible fresh NEWS in this release. Preserve the original `publishedAt`, existing human decisions, Ledger, feedback and source attribution.
- No new listing fetch is performed during release. The 10/14 imported daily observation remains spent and unchanged; its missing original hash/time is not fabricated. The next expected regular collection is **2026-10-15 06:00 JST** (unchanged `0 21 * * *` UTC). Execution, evidence quality and recovered article counts are not confirmed by release/build success.
- After that run, read `collection_runs` and `news_morris_acquisition` for the JST day, verify one listing fetch, per-card proof/URL/day, and no historical detail requests. In Operator select source **Morris Guitars** and **掲載可**. Newly valid stored candidates appear there automatically and await the owner's decision; no repair click or forced collection is required. Existing pending rows, if any, use the ordinary cache-only autonomous recheck. Missing facts must remain unresolved rather than trigger archive requests.
- Rollback is code/config only; never delete acquired receipts, reset spent budgets or undo human decisions. Earlier validators may not recognize the new editorial candidate types; they must fail closed. No destructive DB rollback is needed.

<a id="morris-permission-20261014"></a>

### 2026-10-14 — Conditions and listing-only compatibility audit

**Primary-email interpretation.** The reply permits factual information such as product names, performer names, release dates and event dates. Independent labels must remain within those facts. It explicitly requires `Morris Guitars` attribution and a direct original-article link, excludes images/logos absent a separate prior application, forbids implied official approval, restricts automated new-information checking to generally public listings in principle **no more than once per day**, and requires prompt response to correction, removal and cessation requests. The original inquiry also proposed RSS and additional checks of new articles; the narrower reply governs. No legal conclusion beyond that recorded scope is asserted.

**Site observation.** One bounded read-only GET of the intended listing on 2026-10-14 returned HTTP 200, 27,962 bytes, with a matching listing canonical, one `main`, repeated `h3.h5.serif` / `div.col-9` items, written dates in `time`, short descriptions and direct `/information/YYYY/MMDD_NN.html` links. It includes a new 10/14 item; the web-search representation was six days old and must not be used as a current discovery baseline. Listing facts can support a subset of short introductions, but do not universally provide complete product identities, event venues, deadlines or release dates. A displayed publication date is **not** a product release/event date. The cached listing also contains a Sound Messe event-year discrepancy; uncertain or conflicting facts must be held/skipped without following a detail link to resolve them automatically. No article page, RSS, image or PDF was fetched/saved for this audit. A separate technical robots check returned HTTP 404 without following redirects; absence is not a denial or permission and requires an explicit reviewed handling decision before production.

| Path / Concern | Current behavior and compatibility finding |
|---|---|
| Registry / collection policy | `src/registry.js`, `src/source-policies.js`, `src/runtime.js`: Morris is unconfigured, evidence incomplete and outside the production allowlist. Adding the ID alone cannot enable it. Runtime name is still `Morris`; before activation it must use the exact permitted display name `Morris Guitars` without changing internal IDs. |
| Listing fetch / extraction | `src/collector.js`, `src/official-listing.js`: existing official-listing collector can restrict request URLs to robots + one listing, but its parser does not support Morris. A dedicated fixed listing extraction route is required; do not copy an article-fetching source's behavior. |
| Article recovery / autonomous recheck | `src/facts-readiness.js`, `src/facts-recheck.js`, `src/pending-lifecycle.js`: Morris currently has no recovery surface. Preserve this fail-closed boundary; any future recovery may only reuse verified listing facts/cache or the same permitted daily listing request, with no article/official-product/RSS fallback. Cache, retry and parser changes cannot broaden permission. |
| Once/day / manual Operator | `legalGate`, `NewsStore.lease`, collector and facts recheck have `operator_validation` / scheduled paths that do not enforce the normal `nextAt` / last-request interval in the same way. The recheck budget is separate from collection. `crawlIntervalHours=24` alone cannot guarantee one listing check per day across all paths. A shared atomic Morris-specific daily budget, consumed for attempted listing requests (including errors/304), must cover scheduled/manual/Operator/retry/recovery paths. An Operator click must return cached information or a deferred/no-supported-surface result without extra publisher traffic. |
| Redirect / canonical | `src/policy.js` blocks redirects before requesting their destination. Keep exact HTTPS listing URL checks before every request. Canonical is validated/recorded, never followed to an article/product/RSS/other host. Reading an item URL for a direct user-facing link does not authorize fetching it. |
| Duplicate / labels | Existing duplicate checks compare stored structured identities/events; they do not fetch publishers. Use existing validation only when explicit listing facts meet it. Independently generate facts-only labels; missing identity/type/event/date is not an excuse to relax validation or fetch details. |
| Health | `src/source-health.js` projects stored outcomes; it does not probe publisher URLs. Monitoring must remain DB/cache based, without extra listing/article access. Keep genuine HTTP/parser/robots failures distinct from intentional OFF. Current Morris has no live health row; do not create one merely to represent permission. |
| Attribution / images / endorsement | Future candidate/API/Port source label must be exactly `Morris Guitars`; current registry name needs a later scoped change. Preserve direct article links, no publisher images/logos/embedded pages and no official-endorsement wording. Permission is not an editorial approve/teacher signal. |

**Activation prerequisites (not implemented here):** fixed listing-only parser and facts provenance; exact attribution; permission/evidence and robots-absence review; shared once/day guard across every request path; zero article/RSS/product/PDF/image/redirect-destination requests; cache-only/deferred Operator and recheck behavior; tests for manual retry, concurrent calls, budget exhaustion, error/304 handling, direct-link/date integrity, duplicates, opt-out, health and publisher stop/correction requests. Explicit activation approval and normal source acceptance remain separate. Until all are satisfied, Morris remains OFF.

**Read-only verification:** seven local assertions passed for production OFF, unconfigured discovery, null recovery surface and unsupported listing parser, with zero publisher fetches in those checks. Production D1 SELECTs returned zero Morris state/candidate/health records and zero writes. Only this canonical register is updated; historical coverage reports and unrelated publishers are unchanged.

<a id="source-deviser"></a>

## Deviser — deviser

| Item | Existing decision record |
|---|---|
| Source / Publisher | Deviser |
| Surface | https://www.deviser.co.jp/feed/ 公式RSS、/information/ |
| Current State | OFF |
| Current Scope | メーカー新製品のモデル／series facts限定候補。 |
| Decision | BOUNDED ASSESSMENT COMPLETE / TECHNICAL-QUALITY INCOMPLETE |
| Why | 限定内部policy/robots審査済み。構造化製品識別と具体的label pathが不足しdiscoveryValid=false。 |
| Explicit Restriction | 原文／画像再利用なし。shop／support等は対象外。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | documented silence／明示的automation許諾なし。既存の限定内部判断であり、許諾の不在だけを利用不可の理由にしない。 |
| Evidence | [src/coverage-evidence.js](src/coverage-evidence.js)、[COVERAGE-EXPANSION-PHASE1-REPORT.md](COVERAGE-EXPANSION-PHASE1-REPORT.md)、[LEGACY-BETA-ACQUISITION-REPORT.md](LEGACY-BETA-ACQUISITION-REPORT.md)、[LEGACY-BETA-ACQUISITION-EVIDENCE.json](LEGACY-BETA-ACQUISITION-EVIDENCE.json) |
| Decision Date | 2026-09-30 |
| Notes | policyDecision=approvedはproduction ONでもpublisher許諾でもない。 |

<a id="source-roland"></a>

## Roland / BOSS — roland

| Item | Existing decision record |
|---|---|
| Source / Publisher | Roland / BOSS |
| Surface | https://www.roland.com/global/company/press_releases/ 公開Press一覧・公式PDFリンク |
| Current State | OFF |
| Current Scope | ギター／Recording製品のPress metadata候補。PDF本文は取得対象外。 |
| Decision | NEEDS EVIDENCE — PARSER / SUPPLY / SCOPE |
| Why | 他bot名のrobots validator非対応を研究で識別。group維持の改善候補はあるが本番修正未実施。sample新規有用供給0。 |
| Explicit Restriction | リンク条件・誤認frame禁止。各botの拒否ルールを保存し、自botへの規則を緩和しない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | リンク条件の記録あり／自動metadata利用の明示許諾未取得。許諾不在だけがOFF理由ではない。 |
| Evidence | [BLOCKED-SOURCE-RECOVERY-REPORT.md](BLOCKED-SOURCE-RECOVERY-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-EVIDENCE.json](BLOCKED-SOURCE-RECOVERY-EVIDENCE.json)、[LEGACY-BETA-ACQUISITION-REPORT.md](LEGACY-BETA-ACQUISITION-REPORT.md)、[LEGACY-BETA-ACQUISITION-EVIDENCE.json](LEGACY-BETA-ACQUISITION-EVIDENCE.json) |
| Decision Date | 2026-09-30 |
| Notes | EX-4は島村経由の既存NEWSで代替。 |

<a id="source-audio-technica"></a>

## Audio-Technica（日本メーカーサイト） — audio-technica

| Item | Existing decision record |
|---|---|
| Source / Publisher | Audio-Technica（日本メーカーサイト） |
| Surface | www.audio-technica.co.jp /news/、/corp/news/、home静的card |
| Current State | OFF |
| Current Scope | Mic／Interface／Recording新製品候補。 |
| Decision | NEEDS EVIDENCE — CLIENT METADATA / VALUE |
| Why | 専用NEWSはclient描画。home6cardに確認済みの有用Mic／Interface記事0。parser／dated surface未完。 |
| Explicit Restriction | 誤認・frame禁止、削除要望遵守。robots404は研究用reviewのみ。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [BLOCKED-SOURCE-RECOVERY-REPORT.md](BLOCKED-SOURCE-RECOVERY-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-EVIDENCE.json](BLOCKED-SOURCE-RECOVERY-EVIDENCE.json)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md)、[src/source-policies.js](src/source-policies.js) |
| Decision Date | 2026-09-30〜10-01 |
| Notes | AT Distributionとは別source／host。private APIやCSRF回避なし。 |

<a id="source-kanda"></a>

## 神田商会 — kanda

| Item | Existing decision record |
|---|---|
| Source / Publisher | 神田商会 |
| Surface | www.kandashokai.co.jp 新着／terms候補 |
| Current State | OFF |
| Current Scope | メーカー／代理店Gearの固定dated discovery候補。 |
| Decision | NEEDS EVIDENCE — REDIRECT / DISCOVERY |
| Why | robots redirectとcanonical host確認不足。固定surface審査未完。 |
| Explicit Restriction | 法定許容外の複製・再利用制限。redirectを盲目的に許可しない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [COVERAGE-EXPANSION-PHASE1-REPORT.md](COVERAGE-EXPANSION-PHASE1-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-REPORT.md](BLOCKED-SOURCE-RECOVERY-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-EVIDENCE.json](BLOCKED-SOURCE-RECOVERY-EVIDENCE.json)、[src/source-policies.js](src/source-policies.js) |
| Decision Date | 2026-09-28〜09-30 |
| Notes | 既存判断の整理のみ。新しい安全性判定・source変更なし。 |

<a id="source-zoom"></a>

## ZOOM — zoom

| Item | Existing decision record |
|---|---|
| Source / Publisher | ZOOM |
| Surface | https://zoomcorp.com/ja/jp/news/ 固定公式listing |
| Current State | ON |
| Current Scope | recorder等の製品発表、実用的な更新。開発話・generic story・support-onlyは除外。 |
| Decision | ALLOWED WITH BOUNDS |
| Why | first-party policy/robots、日付、具体的製品名と独自labelを検証。 |
| Explicit Restriction | 原文／画像なし、開発story等のdeniedPathsを維持。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | documented silence／明示的automation許諾なし。既存の限定内部判断であり、許諾の不在だけを利用不可の理由にしない。 |
| Evidence | [src/quality-evidence.js](src/quality-evidence.js)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-09-30〜10-01 |
| Notes | 既存3件を維持。小更新を件数目的で追加しない。 |

<a id="source-kikutani"></a>

## キクタニ — kikutani

| Item | Existing decision record |
|---|---|
| Source / Publisher | キクタニ |
| Surface | https://www.kikutani.co.jp/news/ 固定公式listing |
| Current State | ON |
| Current Scope | 代理店製品facts、明示ギター根拠のあるイベント。 |
| Decision | ALLOWED WITH BOUNDS |
| Why | 公開policyのsilenceを明記し、robots／date／facts／labelの実sampleとテストで限定採用。 |
| Explicit Restriction | privacyは転載licenseではない。一般how-to／店舗等を除外。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | documented silence／明示的automation許諾なし。既存の限定内部判断であり、許諾の不在だけを利用不可の理由にしない。 |
| Evidence | [src/coverage-evidence.js](src/coverage-evidence.js)、[COVERAGE-EXPANSION-PHASE1-REPORT.md](COVERAGE-EXPANSION-PHASE1-REPORT.md) |
| Decision Date | 2026-09-30 |
| Notes | 無関係なbearing・吹奏楽用途等をギター向けと推測しない。 |

<a id="source-ikebe-event"></a>

## 池部楽器 Events — ikebe-event

| Item | Existing decision record |
|---|---|
| Source / Publisher | 池部楽器 Events |
| Surface | https://www.ikebe-gakki.com/blog/category/event/ 固定Event一覧 |
| Current State | ON |
| Current Scope | 名前のあるギタリスト、イベント種別、明示年月日、会場、ギター関連性があるケース。 |
| Decision | ACCEPTED WITH OBSERVATION — production acceptance（既存ALLOWED WITH BOUNDS scopeを維持） |
| Why | PBと別scopeでrobots/policy/qualityを確認。阿部学ワークショップは公式facts確認後operator承認。 |
| Explicit Restriction | generic blog全体・paginationなし。店舗tagだけでは会場確定不可。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | **GRANTED WITH CONDITIONS — 2026-10-15**. 株式会社池部楽器店・広報室。Gmail thread `1a13324557722b42`, formal message `1a13e3f7691fbf79`。下記の正式許諾記録と5条件を適用。既存scope・取得頻度は維持。 |
| Evidence | [src/high-value-evidence.js](src/high-value-evidence.js)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-10-01 |
| Notes | manual-ikebe：別途既存承認されたmain-hostの個別Event facts/link scopeも存在。自動化grantと混同しない。 |

### Production acceptance — 2026-10-02

- Previous verdict: ALLOWED WITH BOUNDS（2026-10-01の限定policy/quality判断）。New verdict: **ACCEPTED WITH OBSERVATION**。collection scope・許諾判断・source設定は変更しない。
- Source type / intended coverage: retailer_editorial / 明示factsのあるギターイベント。
- Primary evidence: 2026-10-02 06:00 JST production scheduled run、D1 request_mode=scheduled、actual start 06:00:51.350 JST、run ID `f713a68f-0d31-41d5-84f6-78179092f68b`。outcome=collected、2 publisher requests、4 candidates／2 reject／2 dedupe／新規0。
- Observed articles: 阿部学10/24ワークショップ（公開日9/30、operator承認済み）を再取得。10/21アコギワークショップ（9/18）は既存REVIEWのまま、公開しない。
- False positives: 公開記事では0。False negatives: 現行bounded scopeに合致する未取得候補0（意図的scope除外・既存REVIEW・既存manual公開を区別）。同日の元surface照合件数はscheduled candidate件数と一致。
- Duplicate behavior: 上記dedupeは既存URLへの再取得。既存ID・公開日・承認を維持。公開URL/topicの二重掲載0。
- Reason: 有用な実イベント1件をscheduled runで再取得し、直接URL・公開日・人物・開催日・会場を確認。店舗tagから会場を断定しない既存guardも維持。
- Follow-up: 10/21案件は人物・会場factsの通常operator審査が必要。本日のQAでは承認操作しない。named guitarist/workshop/exhibitionに限定したpilotで、Friedmanのブランド催事は範囲外。松本孝弘の展示はmanual-ikebe承認記事1件として既に公開されており、一覧側rejectを未掲載と誤認しない。
- Common evidence / limitations: [2026-10-02 run summary](#production-acceptance-20261002)。

### Representative test display — 2026-10-06

- User-authorized manual editorial display of four exact articles, not a source collection expansion: Martin / Eric Clapton signature models (10/1), Ortega R24RO / RCE24RO (9/28), 押尾コータロー album + tour (9/30), 大石昌良 Yamaha owned equipment (9/16).
- Separate `manual-agm-test` scope; immutable individually assessed URL/date/facts/independent label records. Existing `agm` Interview RSS, registry evidence, collector, schedule and source state remain unchanged. No general News/Gears parser or discovery permission is granted.
- Public direct article access, canonical URLs, publication metadata, no article opt-out, and robots for the exact paths verified on 10/6. Publisher author field for the three News items is AGMW-03; Gears credits 角 佳音. Parent [terms](https://www.rittor-music.co.jp/agreement/) preserve expression rights and welcome links; the latter is not automation authorization. This bounded facts/link assessment does not claim publisher permission or settle the pending use inquiry.
- Facts-only attribution: `Acoustic Guitar Magazine`; no publisher headline/body/image/long summary stored. Martin's per-color 50-unit limit applies only to the 000-42 model; article publication dates do not substitute for product release dates.
- Current approved candidates checked for matching products/artist-events before addition; existing Interview 2 records retained. Normal manual quality/verification/STOP/takedown/90-day retention gates apply. Origin `operator_manual_add`, reason `manual_facts_verified`, existing admin audit only; no Decision Ledger/Shadow/human teacher signal.

<a id="source-at-distribution"></a>

## AT Distribution（公式代理店） — at-distribution

| Item | Existing decision record |
|---|---|
| Source / Publisher | AT Distribution（公式代理店） |
| Surface | https://atdistribution.net/information/ 固定listing |
| Current State | OFF — intentional collection retirement（2026-10-05） |
| Current Scope | Collection OFF。既存の検証済みRecording公開記事は維持。 |
| Decision | COLLECTION RETIRED（2026-10-05）。過去のACCEPTED WITH OBSERVATIONは取得停止判断で更新。 |
| Why | 固定1ページでHarrison FLEX 10の有用な型名・種類・公開日を検証し独自label採用。 |
| Explicit Restriction | privacy内のsite termsは表現再利用を制限。製品説明・本文・画像を使わない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | documented silence／明示的automation許諾なし。既存の限定内部判断であり、許諾の不在だけを利用不可の理由にしない。 |
| Evidence | [src/high-value-evidence.js](src/high-value-evidence.js)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-10-01 |
| Notes | FLEX 10は発表であり出荷を断定しない。日本Audio-Technicaの承認を流用していない。 |

### Production acceptance — 2026-10-02

- Previous verdict: ALLOWED WITH BOUNDS（2026-10-01の限定policy/quality判断）。New verdict: **ACCEPTED WITH OBSERVATION**。collection scope・許諾判断・source設定は変更しない。
- Source type / intended coverage: distributor / 検証済み録音機器発表。
- Primary evidence: 2026-10-02 06:00 JST production scheduled run、D1 request_mode=scheduled、actual start 06:00:51.350 JST、run ID `a6aa1c03-74ca-4526-96dd-7db605e62d17`。outcome=collected、2 publisher requests、12 candidates／11 reject／1 dedupe／新規0。
- Observed articles: Harrison Audio、FLEX 10を発表（8/19）。公開済み1件を再取得、録音・オーディオ。
- False positives: 公開記事では0。False negatives: 現行bounded scopeに合致する未取得候補0（意図的scope除外・既存REVIEW・既存manual公開を区別）。同日の元surface照合件数はscheduled candidate件数と一致。
- Duplicate behavior: 上記dedupeは既存URLへの再取得。既存ID・公開日・承認を維持。公開URL/topicの二重掲載0。
- Reason: 実在する録音機器発表の型名・種類・公開日・直接URLが一致。発売・出荷開始とは断定しない。古い公開日は保持され、7/14日新着へ浮上しない。
- Follow-up: 現行parserの自動facts対象は検証済みHarrison FLEX 10のみ。他モデルの包括的自動採用ではない。今回の新着供給増分は0なので、将来の対象新着と供給量は継続観察。
- Common evidence / limitations: [2026-10-02 run summary](#production-acceptance-20261002)。

### Collection retirement — 2026-10-05

- Decision: **collection OFF** via existing `source-collection-stop`, reason `policy_change`. This supersedes acquisition approval only; publication is not blocked.
- Evidence: retained 2026-10-01〜10-05 collection logs show 5 runs, 60 repeated item observations, 1 unique saved candidate, 55 pre-save exclusions and 4 repeat-URL deduplications. Current approved 1, pending/reopened 0, rejected 0; human approve/reject 0. These are retained observations, not lifetime unique article counts.
- Why: low current yield and low unique coverage, installation/promotion/corporate content predominance, and remaining secondary-use clarification cost. Harrison FLEX 10 has alternative reporting at https://www.shimamura.co.jp/update/dtm-recording/2026/08/dl-167427/ . Alternative reporting availability does not guarantee automatic ingestion by the current parser.
- Product boundary: AT-distributed products are **not globally excluded**. Eligible products discovered through Shimamura, Ikebe or another approved source remain subject to ordinary publication validation.
- Preservation: retain the existing Harrison Audio FLEX 10 article, headline, category, publication date, URL, facts and provenance. No candidate approve/reject, deletion, migration or human teacher decision.
- Pending/recheck: verified pending/reopened 0 before execution. Existing stop operation closes any pending operational lifecycle as `SOURCE_EXCLUDED` / `source_disabled`, actor `source_policy`, without a human reject or teacher signal; no further fetch/lease/Shadow evaluation is warranted for this source.
- Health: intentional `paused` / `source_disabled`; exclude from overall health warnings using the existing explicit-stop audit classification. Actual failures and unexpected disables remain abnormal.
- Other sources, global collection/publication/API switches and public article content remain unchanged. No new permission claim is made and no publisher inquiry was sent.
- Production verification: explicit stop audit recorded; `disabled=1`, `publication_blocked=0`, `takedown=0`, health `paused/source_disabled`, failure count 0, AT due/leased rechecks 0. All 90 candidate rows, 10 Ledger rows, 60 Shadow rows, 32 feedback rows and other-source states were identical before/after. Public API 58 articles and ticker 5 items were identical, including FLEX 10.
- Regression: NEWS suite 582/582 PASS, including 3 AT-specific retirement cases. No runtime/config change, version bump or Worker redeploy required; production reflects the existing administration operation.

<a id="source-ikebe"></a>

## 池部楽器 新製品情報局（PB） — ikebe

| Item | Existing decision record |
|---|---|
| Source / Publisher | 池部楽器 新製品情報局（PB） |
| Surface | https://www.ikebe-gakki-pb.com/new_product/ 固定listing |
| Current State | ON（Product）／自動Sale OFF |
| Current Scope | ギター・アンプ・関連製品／更新の識別済みfacts。未知用途・発売contextはREVIEW。 |
| Decision | ALLOWED WITH BOUNDS |
| Why | PB404をhost限定review。親会員／購入規約の適用scopeとPB関係を確認し固定facts/link採用。 |
| Explicit Restriction | 権利侵害禁止。category/page/sale/used/lesson等を除外。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | **GRANTED WITH CONDITIONS — 2026-10-15**. 株式会社池部楽器店・広報室。Gmail thread `1a13324557722b42`, formal message `1a13e3f7691fbf79`。下記の正式許諾記録と5条件を適用。既存scope・取得頻度は維持。 |
| Evidence | [src/recovery-evidence.js](src/recovery-evidence.js)、[LEGACY-SOURCE-RECOVERY-REPORT.md](LEGACY-SOURCE-RECOVERY-REPORT.md)、[LEGACY-SOURCE-RECOVERY-EVIDENCE.json](LEGACY-SOURCE-RECOVERY-EVIDENCE.json)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-09-30〜10-01 |
| Notes | 拡大時contactはRECOMMENDED、確認済み必須条項ではない。Eventは別source。 |

### 2026-10-05 — Generic pending product evidence recovery

既存Ikebe pending/reopened candidateのcanonical数値記事URLだけを、既存facts再確認／Autonomous Pending Recheckの取得範囲へ追加。新しいdiscovery、巡回、source追加、掲載基準の緩和ではない。単一 `article#main` の一次見出し・公開日・メーカーtag・直下製品見出し（メーカー＋モデル）・直下説明段落を照合する。複数モデルは同一メーカー／共通製品familyの最大4件。publisherカテゴリと明示用途、出来事と近接説明の一致が必要。canonical・日付・identityが不一致、比較／再入荷／セール／旧製品／曖昧な将来情報、関連商品欄由来の情報はfactsを作らない。

代表一次URL：Fulltone https://www.ikebe-gakki-pb.com/new_product/172640/ 、MONSTER CABLE https://www.ikebe-gakki-pb.com/new_product/172649/ 。両記事の公開日は10/1（JST）で保持。特定メーカー・製品のwhitelistを追加しない。前者は2モデルと日本限定発売、後者は2モデルと電源タップ新製品の明示情報を構造化。HTML／本文／原見出し／画像は永続化しない。robots・opt-out・URL制限・bounded fetch・source lease・日次記事cache・CAS・provenanceを維持。既存publication validation／duplicate／人間の最終判断を通す。再確認でREADYになってもpendingを維持し、approve/rejectを自動実行しない。複数モデルの各モデルについても既存published duplicate抑止を維持。

実装・回帰証拠： [src/ikebe-product-evidence.js](src/ikebe-product-evidence.js)、[test/ikebe-product-evidence.test.js](test/ikebe-product-evidence.test.js)。既存KORGの限定一次ページrecoveryを優先し、他sourceのrecoveryは変更しない。

<a id="source-chuya"></a>

## Discover chuya — chuya

| Item | Existing decision record |
|---|---|
| Source / Publisher | Discover chuya |
| Surface | discover.chuya-online.com /feed/・月別一覧（旧Beta） |
| Current State | OFF／legacy承認済み記事は表示対象 |
| Current Scope | 旧個別facts/linkのみ。live復旧未実施。 |
| Decision | NEEDS EVIDENCE — ROBOTS AMBIGUITY |
| Why | 改行なしで連結したrobotsのgroup境界を安全に確定できない。 |
| Explicit Restriction | publisherの明示全面拒否を確定したものではない。groupを推測復元してallowにしない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [LEGACY-BETA-ACQUISITION-REPORT.md](LEGACY-BETA-ACQUISITION-REPORT.md)、[LEGACY-BETA-ACQUISITION-EVIDENCE.json](LEGACY-BETA-ACQUISITION-EVIDENCE.json)、[LEGACY-SOURCE-RECOVERY-REPORT.md](LEGACY-SOURCE-RECOVERY-REPORT.md)、[LEGACY-SOURCE-RECOVERY-EVIDENCE.json](LEGACY-SOURCE-RECOVERY-EVIDENCE.json) |
| Decision Date | 2026-09-30 |
| Notes | 今回もpublisherアクセスなし。 |

<a id="source-hookup"></a>

## Hookup — hookup

| Item | Existing decision record |
|---|---|
| Source / Publisher | Hookup |
| Surface | https://hookup.co.jp/blog/feed.rss 製品発表候補 |
| Current State | OFF／legacy承認済み記事は表示対象 |
| Current Scope | 新製品／代理店発表factsのみ。tutorial・interview・supportを除外。 |
| Decision | BOUNDED ASSESSMENT COMPLETE / QUALITY INCOMPLETE |
| Why | 転載制限とfacts/linkを分離済み。RSS技術取得可だが具体的な新規製品facts／有用供給が不足。 |
| Explicit Restriction | 無断複製等の制限、法定例外。oversized support feedの上限を増やさない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | documented silence／明示的automation許諾なし。既存の限定内部判断であり、許諾の不在だけを利用不可の理由にしない。 |
| Evidence | [src/recovery-evidence.js](src/recovery-evidence.js)、[LEGACY-SOURCE-RECOVERY-REPORT.md](LEGACY-SOURCE-RECOVERY-REPORT.md)、[LEGACY-SOURCE-RECOVERY-EVIDENCE.json](LEGACY-SOURCE-RECOVERY-EVIDENCE.json)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-09-30〜10-01 |
| Notes | Apollo無償plugin特典は割引Sale扱いしない。 |

<a id="source-sonicwire"></a>

## SONICWIRE — sonicwire

| Item | Existing decision record |
|---|---|
| Source / Publisher | SONICWIRE |
| Surface | https://sonicwire.com/news/blog/feed RSS |
| Current State | OFF／legacy承認済み記事は表示対象 |
| Current Scope | 旧2件の個別fixture。live feed停止。 |
| Decision | STOPPED — FEED OPT-OUT |
| Why | 内部policy審査と別に、feedのX-Robots opt-outを現project方針で尊重し停止。 |
| Explicit Restriction | 内容の権利留保。feed opt-outを同記事categoryで迂回しない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | documented silenceの限定内部審査履歴あり。opt-out遵守は維持。販売Termsを集約licenseとしない。 |
| Evidence | [src/coverage-evidence.js](src/coverage-evidence.js)、[LEGACY-BETA-ACQUISITION-REPORT.md](LEGACY-BETA-ACQUISITION-REPORT.md)、[LEGACY-BETA-ACQUISITION-EVIDENCE.json](LEGACY-BETA-ACQUISITION-EVIDENCE.json) |
| Decision Date | 2026-09-30 |
| Notes | 索引指定と法的な全facts/link禁止は同義にしない。 |

<a id="source-sleepfreaks"></a>

## Sleepfreaks — sleepfreaks

| Item | Existing decision record |
|---|---|
| Source / Publisher | Sleepfreaks |
| Surface | https://sleepfreaks-dtm.com/feed/ RSS、DTM製品scope |
| Current State | COLLECTION STOPPED／approved 5件visible |
| Current Scope | /dtm-materials/、/softsynth/の既存承認記事。tutorial/Saleは除外。 |
| Decision | ALLOWED WITH BOUNDS history / STOPPED — WORKER HTTP 403 |
| Why | 以前の限定審査後、Workerからrobots403。terminal200との差は確認済みだが具体的WAFルール／意図は未確定。 |
| Explicit Restriction | Worker access refusalを尊重。proxy／UA変更／IP迂回／再開なし。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | documented silence／明示的automation許諾なし。既存の限定内部判断であり、許諾の不在だけを利用不可の理由にしない。 |
| Evidence | [src/coverage-evidence.js](src/coverage-evidence.js)、[EXISTING-SOURCE-COMPLETION-REPORT.md](EXISTING-SOURCE-COMPLETION-REPORT.md)、[EXISTING-SOURCE-COMPLETION-EVIDENCE.json](EXISTING-SOURCE-COMPLETION-EVIDENCE.json) |
| Decision Date | 2026-09-30〜10-01 |
| Notes | D1 disabled=1／publication_blocked=0／takedown=0。今回の記録作業による停止ではない。 |

<a id="source-ik"></a>

## IK Multimedia — ik

| Item | Existing decision record |
|---|---|
| Source / Publisher | IK Multimedia |
| Surface | https://www.ikmultimedia.com/press/ 固定Press listing |
| Current State | collection OFF（2026-10-04）／既存公開3件維持 |
| Current Scope | guitar／DTM／Recording製品・主要software更新。公開日とpromo終了日を区別。 |
| Decision | SOURCE POLICY EXCLUDED（収集のみ停止。従来の限定評価記録は保持） |
| Why | General Termsを実読し販売／software義務と公開Press facts/linkを分離。固定parserと独自label検証済み。 |
| Explicit Restriction | expression rights保持。forum、Tone.net、promos、supportへscope拡張なし。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | documented silence／明示的automation許諾なし。既存の限定内部判断であり、許諾の不在だけを利用不可の理由にしない。 |
| Evidence | [src/recovery-evidence.js](src/recovery-evidence.js)、[LEGACY-SOURCE-RECOVERY-REPORT.md](LEGACY-SOURCE-RECOVERY-REPORT.md)、[LEGACY-SOURCE-RECOVERY-EVIDENCE.json](LEGACY-SOURCE-RECOVERY-EVIDENCE.json)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 限定収集：2026-09-30〜10-01。収集停止：2026-10-04 |
| Notes | item_idだけidentity query許可。汎用一覧が返る個別candidateはREVIEW維持。 |


### 2026-10-04 performance audit / acquisition retirement

理由：メーカー単独監視を広く行わない編集方針と、保留率・review負担。ZOOMもメーカー単独sourceなのでIKだけが唯一とは判断しない。従来のTerms・parser評価を否定する安全性再判定ではない。

保存17件（自動収集16＋旧fixture1）：公開3／保留7／非掲載7。公開率17.6%、保留率41.2%。収集分のみは公開2/16＝12.5%、保留7/16＝43.8%。retention内の観測値であり全運用期間のユニーク取得総数ではない。

収集ログ5回、延べ60 candidate sightings：新規pending挿入16、policy/parser blocked 28、duplicate16（26.7%）。duplicateは同じURLの再発見も含み、別記事の重複率とは区別。最新runは12候補／duplicate7。最新保存済みserver-side publication validationは保留7件すべてfacts_incomplete、掲載可0、duplicate-blocked0。これは過去の診断であり今回の終了理由はfacts不足ではなくsource_policy。

Human Decision Ledger：IK approve0／reject0。旧operator記録は公開2（旧fixture1含む）／非掲載7でhuman_operator教師へ再分類しない。Shadowは7 candidateに21 evaluations。各保留は2回再確認済みで進展なし。手動確認負担は現時点7件。

| Source | 保存 | 公開 | 保留 | 非掲載 | 保留率 | sightings / duplicate | Shadow |
|---|---:|---:|---:|---:|---:|---:|---:|
| 島村 | 24 | 17 | 1 | 6 | 4.2% | 78 / 31 | 10 |
| Ikebe PB | 22 | 13 | 4 | 5 | 18.2% | 89 / 59 | 17 |
| AGM | 2 | 2 | 0 | 0 | 0% | 30 / 4 | 0 |
| AT Distribution | 1 | 1 | 0 | 0 | 0% | 48 / 3 | 0 |
| ZOOM | 4 | 3 | 0 | 1 | 0% | 60 / 13 | 0 |
| amass | 1 | 1 | 0 | 0 | 0% | 105 / 4 | 0 |
| キクタニ | 3 | 2 | 0 | 1 | 0% | 120 / 13 | 0 |
| Ikebe Events | 2 | 1 | 1 | 0 | 50% | 18 / 6 | 4 |
| IK | 17 | 3 | 7 | 7 | 41.2% | 60 / 16 | 21 |

島村・Ikebeは複数メーカー、AGM・amassはメディア、AT・キクタニは複数ブランド取扱、Eventsは催事。ZOOMはメーカー公式の限定scope。低サンプル・収集範囲の違いがあるため率だけで順位付けしない。IKは全保留13件の7件（53.8%）、Shadow52件中21件（40.4%）を占め、停止方針は妥当。

IK製品自体は対象外ではない。他source経由のIK製品ニュースは通常評価を継続。D1 disabled=1／publication_blocked=0／takedown=0。公開維持のためruntime source allowlistは削除しない。

運用：source-collection-stopを使用。candidate記事・review_status・公開日・facts/provenance・Ledger・Shadowは変更しない。保留7件のoperational lifecycleのみSOURCE_EXCLUDED／source_disabled、history actor=source_policy、next_recheck_at=NULL、lease解除。保留件数は保存記録として残るが自動再確認は終了。human reject／feedback／Shadow評価は追加しない。health=paused/source_disabled、publication/API/他source/Cronは維持。再開には別途source方針レビューとlifecycle再開判断が必要。

<a id="source-ahs"></a>

## AHS — ahs

| Item | Existing decision record |
|---|---|
| Source / Publisher | AHS |
| Surface | www.ah-soft.com /history/、/inst-x/setup/（旧fixture） |
| Current State | OFF／legacy承認済み記事は表示対象 |
| Current Scope | Instrument X更新の個別facts。live dated metadata未構成。 |
| Decision | NEEDS EVIDENCE — PARSER / POLICY SCOPE |
| Why | 他bot UAのcolonをstrict validatorが拒否。自bot全面拒否ではないが本番parser・適用scope・更新metadata未完。 |
| Explicit Restriction | 他botへの拒否は維持。trial/EULA/販促素材条件をNEWSへ自動転用しない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [LEGACY-BETA-ACQUISITION-REPORT.md](LEGACY-BETA-ACQUISITION-REPORT.md)、[LEGACY-BETA-ACQUISITION-EVIDENCE.json](LEGACY-BETA-ACQUISITION-EVIDENCE.json)、[BLOCKED-SOURCE-RECOVERY-REPORT.md](BLOCKED-SOURCE-RECOVERY-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-EVIDENCE.json](BLOCKED-SOURCE-RECOVERY-EVIDENCE.json) |
| Decision Date | 2026-09-30 |
| Notes | SAFE whitelistだけでlive enableしない。 |

<a id="source-agm"></a>

## AGM / Rittor Music — agm

| Item | Existing decision record |
|---|---|
| Source / Publisher | AGM / Rittor Music |
| Surface | https://acousticguitarmagazine.jp/interview/feed/ 国内アコギInterview RSS |
| Current State | ON（Interview限定） |
| Current Scope | 検証済み国内人物＋明示アコギinterview。その他News/Gears/Lesson未構成。 |
| Decision | ACCEPTED — production acceptance（既存ALLOWED WITH BOUNDS scopeを維持） |
| Why | 2026-10-01の限定補足審査・sampleで国内Artist gapに有用な2件を確認。 |
| Explicit Restriction | copyright保護、表現再利用なし。親siteの「リンク歓迎」はautomation許可ではない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | documented silence／明示的automation許諾なし。既存の限定内部判断であり、許諾の不在だけを利用不可の理由にしない。 |
| Evidence | [src/high-value-evidence.js](src/high-value-evidence.js)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-10-01 |
| Notes | 旧CONTACT計画はこのInterview surfaceだけ補足判断で更新。他surfaceへの包括承認ではない。 |

### Production acceptance — 2026-10-02

- Previous verdict: ALLOWED WITH BOUNDS（2026-10-01の限定policy/quality判断）。New verdict: **ACCEPTED**。collection scope・許諾判断・source設定は変更しない。
- Source type / intended coverage: media / 国内アコギinterview。
- Primary evidence: 2026-10-02 06:00 JST production scheduled run、D1 request_mode=scheduled、actual start 06:00:51.350 JST、run ID `c7cb11b0-3bb2-409f-b423-efaf1c4343c9`。outcome=collected、2 publisher requests、10 candidates／8 reject／2 dedupe／新規0。
- Observed articles: 大石昌良のアコギinterview（9/9）と竹内アンナのアコギinterview（8/24）。公開済み2件を再取得、アーティスト。
- False positives: 公開記事では0。False negatives: 現行bounded scopeに合致する未取得候補0（意図的scope除外・既存REVIEW・既存manual公開を区別）。同日の元surface照合件数はscheduled candidate件数と一致。
- Duplicate behavior: 上記dedupeは既存URLへの再取得。既存ID・公開日・承認を維持。公開URL/topicの二重掲載0。
- Reason: 国内アコギinterviewの実記事2件をscheduled runで識別。RSS pubDateと保存日付が一致し、原記事URLはHTTP 200、同一記事の再登録・新着化なし。
- Follow-up: Interview固定RSS・検証済み国内人物・明示アコギinterviewの現行scopeのみ。今回は新規公開0、7/14日内の供給は0。将来の対象新着を通常scheduled runで観察し、News/Gears/Lessonへ拡張しない。
- Common evidence / limitations: [2026-10-02 run summary](#production-acceptance-20261002)。

<a id="source-korg"></a>

## KORG / VOX（メーカー公式） — korg

| Item | Existing decision record |
|---|---|
| Source / Publisher | KORG / VOX（メーカー公式） |
| Surface | www.korg.com 製品／Press候補、固定surface未構成 |
| Current State | OFF |
| Current Scope | Gear／Interface／DTMの公式発表候補。 |
| Decision | NEEDS EVIDENCE — APPLICABLE SCOPE / DISCOVERY |
| Why | 旧CONTACT分類。適用scopeと固定dated surfaceの内部審査が未完。 |
| Explicit Restriction | 今回方式の明示許諾必須条項は既存資料で未確定。報道資格を装ってPress窓口を使わない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [BLOCKED-SOURCE-RECOVERY-REPORT.md](BLOCKED-SOURCE-RECOVERY-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-EVIDENCE.json](BLOCKED-SOURCE-RECOVERY-EVIDENCE.json)、[LEGACY-BETA-ACQUISITION-REPORT.md](LEGACY-BETA-ACQUISITION-REPORT.md)、[LEGACY-BETA-ACQUISITION-EVIDENCE.json](LEGACY-BETA-ACQUISITION-EVIDENCE.json) |
| Decision Date | 2026-09-28〜09-30 |
| Notes | CONTACTは内部escalation。池部等のKORG記事掲載はKORG site collection ONを意味しない。 |

<a id="source-esp"></a>

## ESP / BIGBOSS — esp

| Item | Existing decision record |
|---|---|
| Source / Publisher | ESP / BIGBOSS |
| Surface | espguitars.co.jp 公式NEWS／製品deep link候補 |
| Current State | OFF |
| Current Scope | 個別NEWS facts＋直接link候補。BIGBOSSを自動包含しない。 |
| Decision | EXPLICIT PERMISSION REQUIRED — DEEP LINK EXCEPTION |
| Why | 既存確認のlink policyにdeep link禁止。今回用途には個別例外許諾が必要との既存判断。 |
| Explicit Restriction | deep link禁止。営業目的の問い合わせ条件も尊重。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | 明示例外許諾未取得。具体的link制限に基づく判断であり一般permission不足ではない。 |
| Evidence | [src/source-policies.js](src/source-policies.js)、[BLOCKED-SOURCE-RECOVERY-REPORT.md](BLOCKED-SOURCE-RECOVERY-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-EVIDENCE.json](BLOCKED-SOURCE-RECOVERY-EVIDENCE.json)、[LEGACY-BETA-ACQUISITION-REPORT.md](LEGACY-BETA-ACQUISITION-REPORT.md)、[LEGACY-BETA-ACQUISITION-EVIDENCE.json](LEGACY-BETA-ACQUISITION-EVIDENCE.json) |
| Decision Date | 2026-09-28〜09-30 |
| Notes | 島村経由のESP製品NEWSは別source。 |

<a id="source-yamaha-newsroom"></a>

## Yamaha newsroom — yamaha-newsroom

| Item | Existing decision record |
|---|---|
| Source / Publisher | Yamaha newsroom |
| Surface | www.yamaha.com /ja/news_release/ 候補 |
| Current State | OFF |
| Current Scope | メーカーPress候補。日本製品siteとは別scope。 |
| Decision | NEEDS EVIDENCE — APPLICABLE SCOPE / DISCOVERY |
| Why | 旧CONTACT計画。metadata／直接link／固定配信の審査未完。 |
| Explicit Restriction | 今回方式への具体的必須許諾条項は既存記録で未確定。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [BLOCKED-SOURCE-RECOVERY-REPORT.md](BLOCKED-SOURCE-RECOVERY-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-EVIDENCE.json](BLOCKED-SOURCE-RECOVERY-EVIDENCE.json)、[LEGACY-BETA-ACQUISITION-REPORT.md](LEGACY-BETA-ACQUISITION-REPORT.md)、[LEGACY-BETA-ACQUISITION-EVIDENCE.json](LEGACY-BETA-ACQUISITION-EVIDENCE.json) |
| Decision Date | 2026-09-28〜09-30 |
| Notes | このCONTACTをjp.yamaha.comの禁止根拠へ転用しない。 |

<a id="source-amass"></a>

## amass — amass

| Item | Existing decision record |
|---|---|
| Source / Publisher | amass |
| Surface | https://amass.jp/rss/3745 単一ギタリストtag RSS |
| Current State | OFF — intentional current-scope retirement（2026-10-09） |
| Current Scope | Rick Nielsen tag collection OFF。既存公開1件は維持。 |
| Decision | COLLECTION RETIRED（2026-10-09）。過去のALLOWED WITH BOUNDSを現行scopeの取得停止判断で更新。 |
| Why | 現行Rick Nielsen単一tagの低yield／低relevance。過去の限定審査（公式RSS案内・policy・robots・sample）は履歴として維持。 |
| Explicit Restriction | 権利留保。full-music generic RSS、tag一括拡張、原文再利用なし。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | Current collection retired before permission contact; NOT_APPLICABLE to the active-source formal launch campaign. No inquiry sent. Historic official tag RSS / documented-silence assessment is retained, not publisher permission. Existing published use is retained without a new permission claim. |
| Evidence | [src/quality-evidence.js](src/quality-evidence.js)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-09-30〜10-01（限定審査）；2026-10-09（現行scope停止） |
| Notes | Brian May等の未承認追加tagはOFF。 |

### Current-scope retirement / formal launch campaign — 2026-10-09

- User decision: retire the **current Rick Nielsen single-tag source** after the read-only value re-audit. Use the existing `source-collection-stop` operation, reason `policy_change`, with a system/source-policy administration record; not a human/editorial reject.
- Evidence: 2026-09-30〜10-09 retained logs contain 10 runs, 210 repeated RSS item observations, 200 pre-save exclusions and 9 repeat-URL deduplications; 1 unique saved/published article. Current pending/reopened 0, rejected 0, human approve/reject 0 and amass Shadow evaluations 0. Last 5 runs added 0 candidates. The current RSS contains 1 article inside 90 days and 20 older articles; the recent acoustic/singing-guitar A/B contribution of this scope is 0. This is not a 90-day continuous operating history or an audit of all amass content.
- Rationale: low yield and low direct relevance of the current Rick Nielsen scope to Cruise Port's acoustic/singing-guitar focus. The retained collection-auction article is a C-value contribution for this focus. Technical instability or a high pending/review burden is **not** the reason for retirement.
- Preservation: keep published article `48c3f8944f4eb7011e8a8d86ca10b9f1695ce382cee506f2bdb916b7dc6618fd` (https://amass.jp/192113/), including headline, source, URL, publication date, facts/provenance and approved state. Do not block publication, take down, delete or migrate candidates. No Ledger, Shadow, feedback or human teacher signal is added or modified.
- Pending/recheck: confirm the production count again before execution. The existing stop closes any pending/reopened operational lifecycle as `SOURCE_EXCLUDED`, reason `source_disabled`, actor/result `source_policy`, next recheck NULL and leases released. Existing article review states are retained. No further recovery fetch, retry/backoff or Shadow evaluation is scheduled for this source.
- Health: explicit administration audit classifies `paused/source_disabled` as an intentional stop, excluded from aggregate warnings. Actual failures and unexpected disables remain abnormal. Global collection/publication/API switches, cron and all other source states remain unchanged.
- Media boundary: **amass is not globally or permanently banned**. A future acoustic-performance, singing-guitar-video or acoustic-live scope may be independently re-evaluated with its own relevance, technical and permission evidence. Verified Beck tag/RSS (https://amass.jp/tag/2111 , https://amass.jp/rss/2111) includes acoustic performance examples, but is not approved or enabled by this decision. Do not expand or replace the current tag automatically.
- Formal launch: remove amass from `WAITING_PERMISSION` and active permission-contact targets because this collection is retired before inquiry. The user confirms other target-source inquiries were sent; their permission outcomes are not changed or treated as granted here. The prepared amass form must **not** be submitted; no Gmail inquiry is sent. This retirement does not remove the NEWS test badge or settle conditions for the retained article.
- Production execution: existing administration operation applied with audit ID `d9f0e766-fda2-4904-9c77-2b92e4a82cc8`, reason `policy_change`. Verified `disabled=1`, `publication_blocked=0`, `takedown=0`, `paused/source_disabled`, failures 0 and pending/lifecycle/leased rechecks 0. No candidate reject was performed.
- Production comparison: all 148 candidate rows, 70 Ledger rows, 178 Shadow rows and 92 feedback rows were identical before/after. All other source-state and health rows, global enable switches, deployed bindings, cron and Worker deployment were unchanged. Public API 116 articles and ticker 5 items were identical, including the amass article. Collection logs remain at 10 runs. The actual production scheduled gate returns `source_disabled` and the audit is recognized as intentional; the next 06:00 scheduled run has not yet occurred. The isolated real scheduled-handler test verifies zero publisher requests and healthy aggregate status.
- Regression / release: NEWS and Operator full suite 812/812 PASS (including 3 amass retirement tests), Port NEWS 46/46 PASS, changed-file syntax, diff check and secret scan PASS. Existing administrative capability required no runtime/config changes: NEWS 0.26.0, Operator 0.25.1 and Port 1.19.6 remain unchanged; no Worker redeploy or migration required. Commit only this canonical register and the source-specific regression test.

| Source | Current Status | Evidence | Contact Needed | Formal Launch Status |
|---|---|---|---|---|
| amass — current Rick Nielsen scope | COLLECTION RETIRED / OFF | User-approved low-yield, low-relevance retirement; published article retained | NO — do not submit prepared form or send email | NOT_APPLICABLE / EXCLUDED — removed from active permission campaign, not WAITING_PERMISSION |

<a id="source-tft"></a>

## THE FIRST TIMES — tft

| Item | Existing decision record |
|---|---|
| Source / Publisher | THE FIRST TIMES |
| Surface | www.thefirsttimes.jp Artist／Event候補、固定guitar surface未構成 |
| Current State | OFF |
| Current Scope | guitar／SSW関連の明示facts候補。 |
| Decision | NEEDS EVIDENCE — RELEVANCE / POLICY SCOPE |
| Why | guitar専用surface・別host規約scope・人物識別根拠が未完。 |
| Explicit Restriction | 権利・転載条件は留保。具体的な当該利用禁止／許諾は既存資料未確定。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [COVERAGE-EXPANSION-PHASE1-REPORT.md](COVERAGE-EXPANSION-PHASE1-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-REPORT.md](BLOCKED-SOURCE-RECOVERY-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-EVIDENCE.json](BLOCKED-SOURCE-RECOVERY-EVIDENCE.json) |
| Decision Date | 2026-09-30 |
| Notes | 既存判断の整理のみ。新しい安全性判定・source変更なし。 |

<a id="source-takamine"></a>

## Takamine — takamine

| Item | Existing decision record |
|---|---|
| Source / Publisher | Takamine |
| Surface | www.takamineguitars.co.jp 旧candidate |
| Current State | OFF |
| Current Scope | 現在許可されたcollection scopeなし。 |
| Decision | DO NOT USE — EXISTING WHITELIST CLASSIFICATION |
| Why | ユーザー提供の旧独立監査／whitelistのDO_NOT_USEを保持。禁止理由の具体条項は本作業の既存資料から復元していない。 |
| Explicit Restriction | 具体的条項はUNKNOWN。旧分類だけで新しい法令違反を認定しない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [COVERAGE-EXPANSION-PHASE1-REPORT.md](COVERAGE-EXPANSION-PHASE1-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-REPORT.md](BLOCKED-SOURCE-RECOVERY-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-EVIDENCE.json](BLOCKED-SOURCE-RECOVERY-EVIDENCE.json)、[../../apps/cruise-port/NEWS-LEGAL-COMPLIANCE.md](../..//apps/cruise-port/NEWS-LEGAL-COMPLIANCE.md) |
| Decision Date | 2026-09-28 |
| Notes | 既存分類の記録のみ。再アクセス・再審査なし。 |

<a id="source-kurosawa"></a>

## クロサワ楽器 — kurosawa

| Item | Existing decision record |
|---|---|
| Source / Publisher | クロサワ楽器 |
| Surface | www.kurosawagakki.com 旧candidate |
| Current State | OFF |
| Current Scope | 現在許可されたcollection scopeなし。 |
| Decision | DO NOT USE — EXISTING WHITELIST CLASSIFICATION |
| Why | 旧独立監査／whitelistのDO_NOT_USEを保持。具体的禁止条項は既存資料から復元していない。 |
| Explicit Restriction | 具体的条項はUNKNOWN。法令違反との新しい判断はしない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [COVERAGE-EXPANSION-PHASE1-REPORT.md](COVERAGE-EXPANSION-PHASE1-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-REPORT.md](BLOCKED-SOURCE-RECOVERY-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-EVIDENCE.json](BLOCKED-SOURCE-RECOVERY-EVIDENCE.json)、[../../apps/cruise-port/NEWS-LEGAL-COMPLIANCE.md](../../apps/cruise-port/NEWS-LEGAL-COMPLIANCE.md) |
| Decision Date | 2026-09-28 |
| Notes | 既存分類の記録のみ。再アクセス・再審査なし。 |

<a id="source-soundhouse"></a>

## サウンドハウス — soundhouse

| Item | Existing decision record |
|---|---|
| Source / Publisher | サウンドハウス |
| Surface | www.soundhouse.co.jp 公式News／具体的Sale候補 |
| Current State | OFF |
| Current Scope | 高価値multi-product Sale、明確な割引・期限のあるcandidateのみ。 |
| Decision | NEEDS EVIDENCE — ROBOTS TIMEOUT / POLICY |
| Why | 既存timeout。10/1新しい具体的UJAM surface discovery後のrobots1回もtimeout、article0。 |
| Explicit Restriction | access refusal／robots未確認時の収集なし。affiliate／会員規約を集約許可にしない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [BLOCKED-SOURCE-RECOVERY-REPORT.md](BLOCKED-SOURCE-RECOVERY-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-EVIDENCE.json](BLOCKED-SOURCE-RECOVERY-EVIDENCE.json)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-09-30〜10-01 |
| Notes | 検索snippetを公開根拠にしない。retry loopなし。 |

<a id="source-tascam"></a>

## TASCAM（追加研究候補、registry未登録） — tascam

| Item | Existing decision record |
|---|---|
| Source / Publisher | TASCAM（追加研究候補、registry未登録） |
| Surface | 公式Recording／recorder新着候補。具体的採用surfaceは未確定。 |
| Current State | OFF／candidate-only |
| Current Scope | first-party Recording新製品候補。 |
| Decision | NOT ENABLED — USEFUL CANDIDATE NOT VERIFIED |
| Why | 既存研究とdiscoveryで条件を満たす新しい公式candidateを確保できなかった。 |
| Explicit Restriction | 新しい明示制限を認定していない。policy／robotsの承認結果はUNKNOWN。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-10-01 |
| Notes | direct GET0、enable0の過去結論を記録。 |

<a id="source-steinberg"></a>

## Steinberg（追加研究候補、registry未登録） — steinberg

| Item | Existing decision record |
|---|---|
| Source / Publisher | Steinberg（追加研究候補、registry未登録） |
| Surface | https://www.steinberg.net/promotion/ 公式campaign候補 |
| Current State | OFF／candidate-only |
| Current Scope | DTMの高価値Sale候補。 |
| Decision | NOT ADOPTED — EXPIRED CAMPAIGN |
| Why | 既存調査でcampaign終了済み。新しい有効Saleとして不採用。 |
| Explicit Restriction | 今回方式の明示禁止は記録未確定。期限切れ掲載はしない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [MORNING-COVERAGE-SPRINT-REPORT.md](MORNING-COVERAGE-SPRINT-REPORT.md)、[MORNING-COVERAGE-RESEARCH-EVIDENCE.json](MORNING-COVERAGE-RESEARCH-EVIDENCE.json) |
| Decision Date | 2026-10-01 |
| Notes | 自動source承認を示す記録ではない。 |

<a id="source-manual-apu"></a>

## APU Software（manual-only） — manual-apu

| Item | Existing decision record |
|---|---|
| Source / Publisher | APU Software（manual-only） |
| Surface | https://apu.software/ 製品価格facts／独立manual scope |
| Current State | MANUAL-ONLY scope／automatic OFF／既存Sale candidate REJECT・非公開 |
| Current Scope | 既存manual structured Sale workflow。対象・割引・期限・publisher identityの検証必須。 |
| Decision | BOUNDED MANUAL SCOPE / ITEM REJECTED — INSUFFICIENT FACTS |
| Why | manual scopeの内部審査は保持。個別Saleは補助投稿者の公式identityと具体的製品価値を確定できずCore Repairで除外。 |
| Explicit Restriction | 価格factsのみ。原文・画像なし。coupon／single SKU等拒否、終了日必須。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | 明示automation許諾なし。manual bounded internal assessmentと個別記事採用を区別。 |
| Evidence | [src/manual-sources.js](src/manual-sources.js)、[CORE-QUALITY-REPAIR-REPORT.md](CORE-QUALITY-REPAIR-REPORT.md)、[CORE-QUALITY-REPAIR-EVIDENCE.json](CORE-QUALITY-REPAIR-EVIDENCE.json)、[MORNING-COVERAGE-SPRINT-REPORT.md](MORNING-COVERAGE-SPRINT-REPORT.md)、[MORNING-COVERAGE-RESEARCH-EVIDENCE.json](MORNING-COVERAGE-RESEARCH-EVIDENCE.json) |
| Decision Date | 2026-10-01 |
| Notes | 承認scopeは変更しない。Sale 0回避のためにrejected itemを復活させない。 |

<a id="source-kvr-apu-support"></a>

## KVR Audio（APU補助告知surface） — kvr-apu-support

| Item | Existing decision record |
|---|---|
| Source / Publisher | KVR Audio（APU補助告知surface） |
| Surface | https://www.kvraudio.com/forum/viewtopic.php?t=633574 既存補助URL |
| Current State | OFF／補助根拠候補の採用撤回、collector未構成 |
| Current Scope | APU Sale終了条件の補助factsとして過去参照された個別投稿。 |
| Decision | NOT ACCEPTED AS VERIFIED SUPPORT — IDENTITY INCOMPLETE |
| Why | Core Repair時に補助投稿者のofficial identityを確立できなかった。KVR全体への禁止判断ではない。 |
| Explicit Restriction | forum全体の自動収集やログイン取得を承認したものではない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [MORNING-COVERAGE-SPRINT-REPORT.md](MORNING-COVERAGE-SPRINT-REPORT.md)、[MORNING-COVERAGE-RESEARCH-EVIDENCE.json](MORNING-COVERAGE-RESEARCH-EVIDENCE.json)、[CORE-QUALITY-REPAIR-REPORT.md](CORE-QUALITY-REPAIR-REPORT.md)、[CORE-QUALITY-REPAIR-EVIDENCE.json](CORE-QUALITY-REPAIR-EVIDENCE.json) |
| Decision Date | 2026-10-01 |
| Notes | 本文・原見出しを再収録しない。 |

## Reference map and historical limitations

- [BALANCED-SOURCE-POLICY.md](BALANCED-SOURCE-POLICY.md)：現行の判断意味。許諾・facts/link・転載・accessを分離。
- [LEGACY-BETA-ACQUISITION-REPORT.md](LEGACY-BETA-ACQUISITION-REPORT.md)：旧23件／10publisherの取得と、過度なpermission説明の訂正。
- [BLOCKED-SOURCE-RECOVERY-REPORT.md](BLOCKED-SOURCE-RECOVERY-REPORT.md)：当時のアクセス／parser／surface／quality課題。現在ON/OFF一覧ではない。
- [LEGACY-SOURCE-RECOVERY-REPORT.md](LEGACY-SOURCE-RECOVERY-REPORT.md)：Ikebe・IKの限定復旧、chuya・HookupのOFF理由。
- [EXISTING-SOURCE-COMPLETION-REPORT.md](EXISTING-SOURCE-COMPLETION-REPORT.md)：Sleepfreaks403診断とcollection停止／5件表示の分離。
- [HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)と[scope supplement](HIGH-VALUE-SOURCE-POLICY.md)：AGM・Ikebe Event・AT Distributionの最新限定判断。
- [NEWS-LEGAL-COMPLIANCE.md](../../apps/cruise-port/NEWS-LEGAL-COMPLIANCE.md)：歴史的分類・retention・takedown・公開境界。旧default false／CONTACT表だけで現在の許可範囲を判断しない。
- [PRODUCTION-OPERATIONS.md](PRODUCTION-OPERATIONS.md)、[COVERAGE-OPERATIONS.md](COVERAGE-OPERATIONS.md)、[CORE-QUALITY-OPERATIONS.md](CORE-QUALITY-OPERATIONS.md)、[MANUAL-INGESTION-OPERATIONS.md](MANUAL-INGESTION-OPERATIONS.md)：段階別運用、停止・review・manual・event expiry。旧phaseのOFF設定を現行設定へ適用しない。

各evidence JSONとsrc evidenceは日付／URL／hash／scope／結果を辿る参照です。規約原文の大量転載なし。UNKNOWNは記録未復元を示し、新しい拒否判定ではありません。

既存未コミットのBalanced／Beta／Blocked資料5ファイル、およびlegal/prototypeの既存編集は保持し、今回のcommitへ混ぜません。ローカル参照として存在しますが、これら未コミット資料の公開repoへの反映を本書で保証しません。

既存repo記録中に今回新しく確認した重大な法令違反・明示禁止・publisher takedown・evidence contradictionはありません。過去phaseのON/OFF変遷、内部takedown flagとpublisher要請の区別、UNKNOWNを明示して整理しました。source registry、policyDecision、authorization、D1 source stateは変更していません。

<a id="production-acceptance-20261002"></a>

## Production acceptance evidence — 2026-10-02 06:00 JST

**Overall: ACCEPTED WITH OBSERVATIONS**。対象はregistryのHIGH_VALUE_EVIDENCE、既存各source判断、NEWS commit `9d155a83`・venue guard `abb74370`からAGM Interview RSS／Ikebe Event／AT Distributionの3つと特定。今回の正式判断は上の各source項。既存sourceの再審査・削減はしていない。

### Measured baseline and scheduled evidence

- main = origin/main = `8a4004d22a0c2c5b14cb08841ed2f4a96c86d5b0`、ahead/behind 0/0。開始tracked/staged clean。既知untracked `.claude/`、`workers/sound-cruise-sync/node_modules/`を保持。Port **1.13.1**、NEWS **0.9.1**。
- Production Worker deployment `ee689313-05f7-4311-827a-963aecdfaefa`、version `2c426635-de88-49a2-b927-9177be65a978`、100%、2026-10-01 12:12:05.264 JST以後のdeploymentなし。runのWorker版はdeployment履歴との時系列照合。
- Remote Cron: daily `0 21 * * *`（06:00 JST）、retention `17 * * * *`、変更なし。scheduled JST day=2026-10-02。D1 collection_runsの同一startedAt **1790888451350**（06:00:51.350 JST）で9 sourceのrequest_mode=scheduled記録を確認。manual/operator_validationと区別。
- 全9 collecting source: collected / healthy / failures 0、18 publisher requests、118 candidates、10 new pending insert、1 automatic approval、最終公開 **49**（前日48）。Sleepfreaksはsource_disabledでアクセスせず、承認済み5件の表示維持。allowlist10 / collecting9 / stopped1。
- 対象3 sourceは全てcollected（304でなく取得・parse成功）：AGM 10/8 reject/2 dedupe、Ikebe Event 4/2 reject/2 dedupe、AT 12/11 reject/1 dedupe。対象新規公開0、既存公開4＋REVIEW1を再識別。新規0をfetch失敗・NO_MATCHと混同しない。
- 各source health・全9collection_runsではfetch/parser/timeout/繰り返し失敗なし。collection全体に既存warning `network_or_internal_error`あり。`scheduled.js`は意図的停止のSleepfreaks `source_disabled`もwarning集計するため、実際のネットワーク障害とは区別する。source別成功と停止状態に問題なし。この既存集計表示の改善は本Acceptanceの修正対象に広げない。
- 詳細Cloudflare telemetry読み取りAPIはHTTP 403（authentication error）。console log/exceptionの独立全量確認は未完。D1の9成功記録・全体last_successful_run_at・deployment履歴・公開APIを主証拠とし、ログ閲覧できたとは報告しない。

### Original/source and publication quality

- 同日15:47 JSTの補助read-only照合で固定3surface HTTP 200、10/4/12 entries。scheduled件数・accepted URL/dateと一致。全5target candidate直接URLとFriedman境界URLもHTTP 200、redirectなし。原見出し・raw HTML・本文・画像は保存せず、照合factsだけを扱った。補助アクセスはcollection/manual runではない。現在surfaceとの比較は過去06:00のraw body完全一致を証明するものではない。
- 公開対象4件：大石9/9、竹内8/24、阿部9/30、FLEX 10 8/19。AGM feed時刻は19:00 JST、listingの日付は00:00 JSTとして保存。未来日・updated日再浮上なし。開催日10/24を公開日9/30と混同しない。90日公開/retention境界、pilot60日lookbackは既存のまま。
- Ikebe Eventの10/21ワークショップはfact不足REVIEWのまま。松本孝弘10/13–11/1展示はmanual-ikebe承認済みの単一URLで表示（一覧filter除外をexpected missと誤判定しない）。Friedmanブランド催事はnamed guitarist pilotの範囲外で不掲載。AT他モデルも現在の検証済みFLEX 10 scopeの範囲外。包括的イベント/録音製品coverageの承認ではない。
- 公開URL49 / unique49、approved topic key重複0、同一イベントの二重掲載0。新規Shimamura LAVA STUDIOは既存Sleepfreaks同topicの公開を尊重してpendingに留まる（AUTO_PUBLISHABLE1件、要人手REVIEWと区別）。
- 公開category: acoustic_guitar7、electric_guitar_bass10、amps_effects12、recording_audio4、dtm_software10、artist_guitar3、live_guitar3、sale0、creator_streaming0、media_other0。表示名は**イベント**、internal key live_guitarを維持。旧表示「ライブ」はカテゴリfilter/cardに残らない。Sale0は正常な0件。
- 前日final audit（2026-10-01 12:13:46 JST）48 approved / 4 pending / 19 rejected → 49 / 13 / 19、総候補71→81。pending増分9はIkebe4、IK1、Shimamura4（うち上記duplicate-publication抑止1）。対象3 source由来のREVIEW増分0。新規公開はShimamura Yamaha RS20MM1件、facts templateが正常承認。
- 本日06:00基準fresh useful（news-quality.jsのHIGH VALUE / USEFULのみ）7日=9、14日=21、24時間=0。前日の時点では7日14／14日24だが時間窓の移動による自然減。同じ本日cutoffで前日承認分だけを数えると7日8→9、14日20→21（正当な新規公開+1）。LOW VALUEを含む公開件数は7日10／14日24。全49件のquality内訳はHIGH VALUE33／USEFUL12／LOW VALUE4／NOISE0。対象3sourceの本日公開増分0、7日内既存1（阿部）、古いAGM/ATを新着化していない。
- 10/1→10/2既存active6 source候補件数：Shimamura11→11、Ikebe16→16、IK12→12、Kikutani20→20、amass21→21、ZOOM12→12。全てcollected。候補数・category体系・retention・既存approved・Sleepfreaks表示に観測された回帰なし。

### Verification and safety

- NEWS full suite **327/327 PASS**（local D1のloopback起動制限による初回環境失敗後、権限付きで正常実行）。Port NEWS data/provider/sale **27/27 PASS**。fixture/test/source変更なし。対象外アプリfull suiteの再実行はしていない。
- 本番Portを独立した空のChrome contextでread-only確認：Ver1.13.1、Home ticker、全49card、対象4件各1card、pending非表示、イベントfilter/card3件、Sale空表示、375/393px横はみ出しなし、direct href + target=_blank + noopener noreferrer、console/page/HTTP errors0。通信116 GET／mutation0。
- production D1の照会は全てSELECT、rows_written0。collector/manual run・operator審査・user data変更・source state変更・schedule変更なし。OAuth/secret値・fingerprint内容は記録しない。
- Code fixes **NONE**、version bump / commit / push / deploy **NOT REQUIRED・未実行**。変更は本正本のみ。別source decision文書・repo scratchを作成していない。残る観察は限定coverage/将来の新着供給、イベントREVIEW、集計warning、telemetry権限。

<a id="agm-permission-2026-10-08"></a>

## 2026-10-08 — AGM publisher permission and six-section scope

This entry supersedes the earlier AGM Interview-only / permission-pending assessment **for the described use only**. Earlier evidence remains historical. It does not enable other publishers or license copied publisher expression.

### Primary permission evidence

- Sender: 橋本修一, `hasimo-s@rittor-music.co.jp` (株式会社リットーミュージック).
- Subject: `ACOUSTIC GUITAR MAGAZINE WEBの記事紹介について`.
- Sent: 2026-10-08 20:17:44 JST; received 20:17:56 JST.
- Gmail message: `msg-f:1878480153720233947` (hex `1a11b3bf481d9fdb`); thread: `FMfcgzQhWntKcxjfthNsBmMqbNzcZsNz`.
- RFC Message-ID: `<CACt9YyDSaOOmNrhOcVY9tEvOEOg6X+HtuBEo3pXU_c6x09iyWg@mail.gmail.com>`.
- Gmail original-message view: SPF, DKIM (`rittor-music.co.jp`), DMARC PASS. Message body is **not** copied into this repository.
- Actual inquiry receipt: `info@rittor-music.co.jp`, 2026-10-07 08:32:38 JST, subject `当ホームページの内容／出版物についてのお問い合わせありがとうございます`, thread `FMfcgzQhWnrzfhxxplWWxDZxBljmvNNw`. This sent receipt, not an earlier unsent draft, describes useful public articles throughout AGM WEB and checking about once daily. It is not limited to three named sections.

**Permission: granted, conditional.** The reply approves the use described in that inquiry: objective information from selected useful public articles, independently written short labels, attribution and direct original-article links. Required attribution is exactly **ACOUSTIC GUITAR MAGAZINE WEB**. The owner confirmed the WEB suffix on 2026-10-08. New-information checking must not cause excessive load; once/day is the inquiry's proposed operating limit, not a newly invented numeric permission in the reply.

Conditions retained:

- No republication/redistribution of article body, original headlines, photos/images, video, scores or other publisher content; no logo/brand asset permission.
- No implication of partnership, cooperation, official endorsement or supervision.
- URLs/RSS may change or cease without notice; no guarantee of maintenance, notice or compatibility.
- Consult again for material changes to presentation, retrieval or the service.
- Test presentation may transition to formal operation within these conditions. Permission is not a judgment of an article's editorial value.

**Scope interpretation:** the email does not enumerate six section grants separately. The actual inquiry covers useful public AGM WEB articles, and the reply approves that described use. Selecting useful acoustic-guitar / singing-and-playing articles from the six official public sections below is within that scope. This is not permission for indiscriminate crawling, paid content or expression reuse. A later materially broader use requires consultation.

### Fixed public surfaces and extraction contract

| User section | Official section / canonical listing | Discovery | Publication date | Article types |
|---|---|---|---|---|
| はじめましてのアコギ入門 | Beginners — https://acousticguitarmagazine.jp/beginners/ | `/beginners/feed/` | RSS pubDate | beginner theory / technique / instrument knowledge |
| 演奏ネタ | Lesson — https://acousticguitarmagazine.jp/lesson/ | `/lesson/feed/` | RSS pubDate | playing / arranging / rhythm |
| 楽器情報 | Gears — https://acousticguitarmagazine.jp/gears/ | `/gears/feed/` | RSS pubDate | equipment, trial/review, product information |
| インタビュー | Interview — https://acousticguitarmagazine.jp/interview/ | `/interview/feed/` | RSS pubDate | person plus explicit musical topic |
| ニュース | News — https://acousticguitarmagazine.jp/news/ | fixed HTML listing, no RSS advertised | article-scoped JSON-LD datePublished / article:published_time | products / artist activity; unclear facts remain pending |
| 読みもの | Column — https://acousticguitarmagazine.jp/column/ | `/column/feed/` | RSS pubDate | columns / explanatory features |

Observed 2026-10-08: all six official listings and the five advertised feeds return HTTP 200. Section pagination exists (`/page/2/`) but is not followed. No sitemap discovery, tag traversal or whole-site crawl. robots.txt returns a parseable Allow-all group and sitemap declaration; robots is an access constraint, **not** the permission evidence. The publisher's Gmail reply supplies the permission.

- At most 10 metadata items per RSS; 9 News cards and their same-host canonical article metadata; maximum 16 wire requests including robots. Minimum 1s spacing, longer Crawl-delay honored. No retries around 403/429, redirects or opt-out.
- Exact fixed discovery endpoints; article URLs must remain on the AGM host in the selected section. News article canonical must equal the discovered URL. Dated slugs identify paths only, never dates.
- News datePublished values must agree; absent/invalid/conflicting values stay unknown and cannot publish. RSS pubDate is distinct from product release date. Existing 90-day and future-date gates remain.
- Metadata/HTML is transient; no article body, original headline, image or long summary is persisted. Original headline similarity uses the existing keyed fingerprint only.
- Editorial facts retain section/type, explicit normalized topic, and a bounded named-person fact where supported by metadata. Missing identity/theme stays pending. Fixed independent labels describe the article's subject, not its full content. Product launches retain the existing product/event rules.
- All newly discovered six-section candidates start PUBLISH_REVIEW, not AUTO. Editorial events are also explicitly barred from the automatic publication path. Existing human publication validation, fingerprint, source health, duplicate, date and category gates still apply.
- Existing canonical URLs deduplicate against both automatic Interview and manually added test articles. Existing records, publication status, facts, provenance, dates, Ledger and Shadow are not rewritten. Port maps historical AGM source labels to the exact required WEB attribution; new automatic source labels use it directly.
- Daily scheduler is unchanged. Permission, source metadata and collection results do not generate human approve/reject decisions or teacher records. New pending items may subsequently receive normal system Shadow observations; these are not human teacher signals.

### Other-source compliance re-audit (existing evidence reused, 2026-10-08)

Classification distinguishes legal rights in expression, website terms and technical access rules. No inference that robots or unprotected facts alone grants contractual permission. B is a bounded internal assessment, not an express publisher license or a guarantee that individual permission can never be necessary.

| Source | Official evidence / existing confirmation | Relevant terms and present scope | Class / contact |
|---|---|---|---|
| AGM | Gmail evidence above, 2026-10-08; https://www.rittor-music.co.jp/agreement/ | Express conditional grant for described facts/independent-label/attribution/direct-link and low-load checking | A, no further contact for this scope; material change requires consultation |
| 島村楽器 | https://www.shimamura.co.jp/siteusage/ ; `src/shimamura-evidence.js`, `src/source-policies.js` (2026-09-28/30) | Links permitted for commercial/noncommercial sites subject to identification, no framing and appropriate opening; recommends top page. Copyright retained. No broad automation grant established. Existing fixed product listing only | B; no new outreach; operational stop preserved |
| 池部PB | https://www.ikebe-gakki.com/Page/agreement.aspx ; `src/recovery-evidence.js`, `LEGACY-SOURCE-RECOVERY-REPORT.md` (2026-09-30) | Parent member/purchase terms and expression rights reviewed separately from public PB factual metadata. No applicable mandatory individual-permission/automation prohibition established for current fixed surface | B; contact recommended for broader commercial reuse/scope, not newly required for current scope |
| キクタニ | https://www.kikutani.co.jp/privacy-policy/ ; `src/coverage-evidence.js`, `COVERAGE-EXPANSION-PHASE1-REPORT.md` (2026-09-30) | Privacy/public policy is not a republication or automation license; fixed public product facts/links only, no copied expression | B; no new contact mandate established |
| ZOOM | https://zoomcorp.com/ja/jp/privacy-policy/ ; `src/quality-evidence.js` (2026-09-30) | Existing narrow product metadata assessment; no publisher-text reuse, no blanket automation permission claimed | B; no new contact mandate established |
| amass | https://amass.jp/rss/about , https://amass.jp/help/privacy.php ; `src/quality-evidence.js` (2026-09-30) | Official tag RSS offered, copyright retained. Only guitarist tag 3745; offering RSS does not grant general commercial republication | B; no new contact mandate established |
| Ikebe Events | https://www.ikebe-gakki.com/Page/agreement.aspx ; `src/high-value-evidence.js`, `HIGH-VALUE-SOURCE-POLICY.md` (2026-10-01) | Same parent scope caveat; fixed named-guitarist event surface, not arbitrary commercial content | B; current operational stop preserved; wider reuse should be clarified first |

No other source gained a new A classification. No new clear contradiction warranting D was established by the reused evidence. Unresolved points are the absence of an express automation/commercial-aggregation grant for B sources and the applicability of broader parent terms if scope changes; those uncertainties are not represented as an unconditional permission. AT, IK and Sleepfreaks intentional retirement/pause decisions remain unchanged and were not unnecessarily re-audited. No external permission request was sent.

Runtime preflight (2026-10-08): source state enabled for AGM/amass/Ikebe/Kikutani/ZOOM; Shimamura and Ikebe Events currently disabled, separate from the scope/legal assessment. This task does not clear their stops. NEWS baseline 62 approved / 16 pending / 22 rejected; Ledger 14, Shadow 80. AGM existing six approved records comprise two `agm` and four `manual-agm-test` records.

### Pre-release acceptance

Live isolated run (in-memory DB seeded with a read-only production snapshot) discovered 59 metadata items: 41 new pending, 6 canonical duplicates, 12 filtered (11 outside 90 days, one unrelated merchandise promotion). All six existing approved AGM articles deduplicated; no production DB write. Maximum 16 publisher requests; all six sections succeeded. The first isolated attempt stopped safely on a News article without an h1; canonical Article JSON-LD headline support was then added and the bounded run succeeded. A tag-context regression also prevents topic/award/product tags from becoming a person's name. No raw publisher responses or original headlines were saved.

| Section | Found | New pending | Duplicate | Filtered |
|---|---:|---:|---:|---:|
| Beginners | 10 | 6 | 0 | 4 |
| Lesson | 10 | 7 | 0 | 3 |
| Gears | 10 | 9 | 1 | 0 |
| Interview | 10 | 6 | 2 | 2 |
| News | 9 | 5 | 3 | 1 |
| Column | 10 | 8 | 0 | 2 |

Port read-only local preview uses the existing public-API proxy: 62 external articles plus one internal article; all six AGM attributions match the WEB suffix. 375/393/1280px show no horizontal overflow; direct links retain `_blank` and `noopener noreferrer`; category switching succeeds. No stored article identity/date/facts was changed to achieve the attribution update. Release targets: Port 1.19.6 (display patch), NEWS 0.22.0 (new bounded collection capability), Operator 0.21.0 (shared editorial validation/facts display). Authentication, Access, sync, account and other sources are outside this change.

### Production acceptance closeout — 2026-10-08

- Implementation commit `1637705670dfc561d0df02588afa7dd67f365b2a`, normal push to main. Pages run `37781616429` succeeded. NEWS version `0.22.0` deployed as `bdca3de5-92be-49b7-8a41-e9e533c842f5`; Operator `0.21.0` as `6bbc20c4-87b3-4411-a284-1ebd12485973`; Port `1.19.6`. Existing daily and retention cron unchanged. No migration or credential/auth change.
- Full NEWS/Operator suite **710/710 PASS**, full Port **998/998 PASS**; syntax, diff checks, scoped staged secret scan (32 files, including exact local NEWS secret-value comparison without printing values), both Worker dry-run bundles PASS.
- Audited `operator_validation` collection began `2026-10-08T13:06:59.866Z` (22:06:59 JST), duration 120,935ms. One production run, 16 wire requests; six section results exactly match the table above: 59 found, 41 new pending, 6 duplicates, 12 filtered, **0 new published**. Filtered discovery entries are not newly inserted rejected records. No additional scheduled run was triggered.
- Existing six AGM approved records, including the four representative test records, were matched by canonical URL and retained byte-for-byte. All **100** previously stored candidates compare equal across all saved columns. New records are `agm`, `PUBLISH_REVIEW`, `pending`, with exact WEB attribution.
- DB after: approved **62**, pending **57**, rejected **22**. Operator UI: AGM pending **41**, server-authoritative approvable **22**; remaining **19** need further fact/identity/topic verification. No approve/reject performed. Source permission has not been used to manufacture teaching decisions.
- Ledger **14** and Shadow **80**, full-row snapshots unchanged. All non-AGM source state and health rows unchanged. AGM health `healthy / ok`, failure_count 0, next daily eligible display 2026-10-09 06:00 JST.
- Public Port shows **62 external + 1 internal = 63** cards; all six AGM cards show `ACOUSTIC GUITAR MAGAZINE WEB`, keep original links, dates and headlines. Local and production 375/393px checks show no horizontal overflow; local desktop 1280px and category filter also verified. Public API health reports NEWS0.22.0. Authenticated Operator loads version0.21.0, the new source filter and its reviewability counts without console errors.
- One thank-you reply draft is saved in the original permission thread, addressed to the original sender. Gmail reload preserved it; no duplicate reply draft, attachment, Send or other external inquiry. The author thanks the publisher, acknowledges exact attribution/direct links, no expression/logo reuse or implied endorsement, no compatibility guarantees, consultation for material changes, and timely response to concerns. The reply remains for the owner to review and send.

## Source resume and remaining recovery — 2026-10-09

- **Shimamura: resume approved, same fixed product listing.** Fresh robots GET 200 agrees with the reviewed `User-agent: *` group and the two Disallow paths (`/p/test.xml`, `/originalbrand/ryoga/member.html`). The 2026-10-07 stop was an added terminal LF, not a directive change. Reviewed canonical hash is `robots-v1:7483de89e6e58bf2a2b555a443d477bca2a40e1cf6720d52b32d2c92ef5d2447`. The initial substantive review date remains; the transport recheck date is recorded separately. Only CRLF/LF, BOM and trailing line whitespace/blank lines are normalized. Directive/order/path/comment changes still require review. No RSS/sitemap or new URL surface is enabled.
- **Ikebe Events: resume approved on the existing URL.** Cloudflare Workers isolated remote preview, using the production bounded GET/manual-redirect implementation, checked `https://www.ikebe-gakki.com/blog/category/event/` at 2026-10-08T22:21:12.575Z (10/9 07:21 JST): 200, no Location, official host/path, robots allowed and reviewed, five parsed entries. The earlier redirect's destination cannot be reconstructed. No URL substitution or redirect following is introduced. Future blocked redirects record HTTP status, sanitized Location/source URL and timestamp in existing operational admin audit records; no teacher signal.
- **Kikutani bounded exhibition recovery:** the owner authorizes relevant guitar/effect exhibition facts, not only named-person events. For existing/new pending same-host `/news/` articles, at most robots plus one canonical article are checked. Require an article-bound explicit event name, current participation statement, venue, valid start/end dates (maximum seven days), relevant guitar/pedal subject and explicit linked exhibitor brands. No artist is fabricated, no product launch inferred, no article prose/images persisted. Final human approval, duplicates, fingerprints, dates, source health and opt-out gates remain. This extends the existing bounded article recovery, not general crawling or the daily discovery surfaces.
- Generic Ikebe article recovery supports explicit headphones, model descriptions, current reissue sentences, created-model wording, category-plus-product-block guitar evidence and signature/12-string facts. Mixed main/accessory identities and missing launch statements stay uncertain. Source-bound verified article facts are protected against being overwritten by subsequent weaker listing metadata. Eight representative pending candidates may receive system facts recovery and new Shadow observations; no approve/reject or human teacher write is authorized by this operation.
- Existing daily/retention/hourly cron, source URLs, publisher access rules, other source enablement, Access/JWT/CSRF and publication policy gates remain. NEWS0.24.0 and Operator0.23.0 add the controlled recovery capability; Port remains1.19.6.

### Production closeout — 2026-10-09 07:33 JST

- Implementation commit `26676b0a`, normal push completed. NEWS0.24.0 deployed as `aaaa54b6-3816-4e4f-afcf-d3b936e1b4b7`; Operator0.23.0 deployed as `1d35706e-ecac-4d8a-9682-cfe67e213650`. No schema, Access, other app or cron changes. Port1.19.6 unchanged.
- Both reviewed source states were resumed with exact before-row guards, preserving takedown/publication-block flags, previous request times and scheduled-day values. Two system operational `source-resume / review_complete` audit records retain the Workers proof. Production collection succeeded: Shimamura 12 entries, seven new pending, four duplicates and one discovery scope exclusion; Ikebe Events five entries, two duplicates and three evidence/scope exclusions, no new pending. Each used two wire requests (robots + the existing listing), no redirects, RSS/sitemap traversal, article fetch or automatic publication. Discovery exclusions did not perform candidate rejects or human decisions.
- Both source health rows are `healthy / ok`, failures 0, disabled 0, lease/backoff 0. Robots hashes now use the reviewed `robots-v1:` digest. No other source state/health row changed. Previous redirect destination remains unknown; the new code records future failures without following them.
- Eight pending rows were re-evaluated through the real isolated D1 schema/triggers and autonomous recheck, then applied with exact candidate/cache/lifecycle compare-and-swap guards. Verified cache receipts retain canonical URL, response hash, parser version and structured primary facts only; no raw article body/image retention. Production rows exactly match the verified plan. Nothing, Echoflanger, Keeley, Fender, Squier and Tokyo Pedal Summit are `RECOVERED_READY / READY_FOR_HUMAN_DECISION`, still pending. LAVA retains uncertain main/accessory binding and missing launch evidence; Yamaha retains two explicit tuner/metronome models but no launch/announcement evidence. Both are `RECOVERED_STILL_BLOCKED`, not approved.
- Published **103**, rejected **23**, Ledger **56**, human feedback **78** unchanged byte-for-byte. Pending **15 → 22** reflects only the seven new Shimamura candidates; no old candidate outside the eight targets changed or disappeared. Existing Shadow146 rows unchanged; eight new system observations bring Shadow to **154**. Current pending lifecycles: six READY, two still blocked, two duplicate, one no-new-evidence, four source-excluded; seven new candidates await their first normal lifecycle assessment. Historical lifecycle table remains64 rows (not64 current repair candidates).
- Public API all **103** items and ticker **5** items are identical before/after. Port renders **103 external + one internal = 104** cards, existing category filter and version1.19.6; a first navigation's transient load error cleared with the ordinary page-update flow, and final view/logs show no errors. Authenticated Operator0.23.0 shows published103, pending22, approvable6; the actual six cards have enabled publication controls, and Fender's inline validation has no errors. No publish/reject/recheck UI action was invoked.
- Full NEWS/Operator **743/743**, Port NEWS **46/46**, JavaScript syntax, explicit-file secret scan, diff check and both Worker dry-run builds PASS. Recovery application also passed exact-schema, protected-field, Ledger/teacher preservation and rerun-idempotency checks. Production row-by-row preservation, both active source health rows and public API comparison PASS.

## Pending cleanup authorization — 2026-10-09

The owner authorizes objective system cleanup of all current pending candidates while retaining final human decisions for READY records. IK official collection remains OFF under its existing source policy; IK products from other sources remain eligible. Four legacy IK source-excluded pending records can be terminally classified as rejected with `source_policy / source_disabled`, retaining all facts, dates, source provenance and IDs. No new human reject or teacher signal is created. Confirmed duplicate candidates may be closed with `system_policy / duplicate`; their existing approved originals remain unchanged. No source enablement, discovery scope, Access, cron or publication validation gate is changed by this cleanup.

## 2026-10-15 — Morning pending recovery and Morris scheduled evidence audit

This entry records operational verification, not an expanded publisher permission or source scope.

- Morning baseline: NEWS 0.28.0 / Operator 0.27.0; 176 candidates, 131 approved (130 public/API-visible), six pending and 39 rejected. Ledger 93 / feedback 115. The six pending records are three Ikebe, two Shimamura and one AGM record; none is Morris.
- Generic recovery: bounded, explicit product-series sections can preserve two to 24 printed models without truncating the record to four. Each model must be corroborated in the primary descriptions or the same section's named product table; the common series must be stated in the launch title/lead. Regional manufacturer labels may use a separately printed corroborating parent tag. No manufacturer/model whitelist, source-category-derived product type, shipping-date inference, related cards, reviews, restocks, sales or unqualified edition/color claims. Unknown specific instrument type is omitted from the label. Family identity preserves the member set; separate bass/guitar member sets are not duplicates merely because their series names match. Publication still requires keyed title evidence, source gates and field-level recovery provenance.
- AGM: explicit, labeled performance date, venues and an explicitly credited guitar performer can form reviewable event facts. Article publication date remains distinct from event date; contradictory/missing dates, no guitar performer, hidden/related sections and canceled events remain held. Expiry follows the verified event date. Metadata HTML entities are decoded as text before comparison with visible article fields.
- Ikebe reservation wording: a verified reservation-start lifecycle uses the existing release event family and its reservation label. It does not become a completed release or automatic approval.
- Existing per-source autonomous recovery caps, daily article cache, publisher access gates, leases, retries, collection surfaces and human publication decisions remain unchanged. A rolling 24-hour recovery budget can defer a source until the previous check ages out; that is budget deferral, not proof that article facts are absent.
- Production scheduled Morris receipt `listing:2026-10-15`: started 2026-10-15 06:00:26.672 JST, verified canonical Information listing, response SHA-256 `513c7b3a5aaa4dfe20d3be9dbdb35f42055c64f7e58f5efbc5bb50601f2a90ec`, parser `morris-listing-facts-1`. Two publisher requests comprise one robots check and one listing GET. Fourteen formal dated article URLs were retained; every listing entry's extracted facts was null. One URL already has an approved record; 13 old URLs received `baseline_old` receipts with zero detail requests. No historical detail, RSS or additional audit fetch was performed. Same-day isolated replay uses stored evidence with zero HTTP requests and retains the published Morris record.
- Historical Morris reassessment: FPD 2027 recruitment (10/1), Shinshu (9/19), east preliminary (9/15), Japan Forest (9/3), diagnosis (8/20), and M-AH (8/3) have formal listing URL/date/proof but no stored structured facts. No new READY record can be created from those receipts alone. Raw descriptions were deliberately not persisted and the keyed fingerprints cannot reconstruct them. Zero extraction is not evidence that the original listing lacked the facts; original-content insufficiency and parser limitations cannot be distinguished retrospectively. The audit does not fabricate missing facts or refetch today's listing/old details. Permission boundaries and original publication dates remain unchanged.
- Isolated production-snapshot simulation: the six morning candidates pass authoritative publication validation after audited recovery, remain pending for human decision, and leave all approved records, Ledger and feedback unchanged. Two Fender source pairs report overlapping announcements; the existing publication-time duplicate guard must be applied when the owner makes a decision. No pending record is falsely labeled as a duplicate of an approved record when no such approved original exists.
- Verification: NEWS/Operator 942 tests and Port NEWS 46 tests pass; both Worker production builds pass. Morris once-per-JST-day, old-detail prohibition, cache provenance, existing article preservation and teacher boundaries are covered by the existing full suites. New regression coverage exercises family identity/duplicate distinctions, raw-text non-persistence, source/date/opt-out gates, autonomous caps, entity normalization, performance evidence and event expiry.

### 2026-10-15 — Morris listing diagnostic instrumentation

- NEWS 0.30.0 / Operator 0.29.0 adds observation only. Extraction selectors, the first-three-paragraph window, facts/labels, publication validation, permission, source state, budgets, once-only receipts and scheduler remain unchanged. The facts evidence parser remains `morris-listing-facts-1`; diagnostic metadata has its own version `morris-listing-diagnostics-1`, preserving existing publication proof compatibility.
- Each new daily listing entry stores bounded counts/types of visible description candidates, the actually selected input character count, wider single-article-parent observations, parser branch/candidate flags, missing field codes and one primary plus supporting failure codes. A wider parent is diagnostic only: it must contain one bound article, never contributes facts, and cannot lend another card's text. Ambiguous scope is reported separately. No source HTML, heading, description, body, image, logo, class names or arbitrary attributes are retained by diagnostics.
- Metadata is additive in existing `entries_json` and listing `proof_json`; no migration or historical receipt rewrite. A summary can report `parser_quality_warning` only for at least three independently described relevant candidates with no recovered facts, excluding explicit policy wording. Sparse/irrelevant/legacy samples remain distinct. This is a read-only parser-quality diagnostic in the authenticated Operator summary, separate from network/source health: it does not disable collection, retry, change publication readiness or mark intentional stops as failures.
- Today's 14 entries remain uninstrumented; no root cause is inferred retrospectively from their null facts or from synthetic fixtures. No Morris HTTP request, forced collection/recheck, historical detail visit or RSS access is performed for this release. The first expected diagnostic observation is the next regular **2026-10-16 06:00 JST** acquisition. Real article recovery is not a release acceptance criterion; the actual next-run outcome must be checked separately.


## 2026-10-16 — Ikebe official permission finalization / outgoing-link tracking

- **Publisher / evidence:** 株式会社池部楽器店・広報室。正式回答は2026-10-15 15:28:24 JST、Gmail message `1a13e3f7691fbf79`, thread `1a13324557722b42`。最初の問い合わせ、10/14の5条件提示（`1a1398ed4b073bc9`）、実際の条件承諾返信（`1a139ff251ae701a`）と最新回答を照合。ISO-2022-JPの最新原文を復元して確認し、メール全文・署名・個人連絡先は保存しない。
- **Status: GRANTED WITH CONDITIONS.** 最初の問い合わせに明記したPB新製品情報とEventsの両scopeを含む。`ikebe` / `ikebe-event` と既存の承認済みmain-host個別記事（`manual-ikebe`を含む）の紹介リンクが対象。媒体全体の自由な取得、メーカー提供素材の二次利用や自動掲載の許諾ではない。
- **Five binding conditions:** (1) 出典を明記する。(2) トップページでなく原記事へ直接リンクする。(3) 客観的事実に基づく独自の短い見出し等に限定し、記事本文・画像・動画等を転載しない。(4) 池部楽器店または関係メーカー等からの訂正・削除要請に速やかに対応する。(5) 説明済みの取得方法・頻度を維持し、方法・対象範囲等の変更は事前相談する。
- **Acquisition unchanged:** PB固定新製品一覧とEvents固定一覧、原則1日1回・毎朝06:00 JSTの既存運用、必要な記事のみ上限付きの事実確認、既存robots/access制限・リトライ制限・source停止制御を維持。説明済みUA `SoundCruiseNewsBot/0.1 (+mailto:soundcruise.inc@gmail.com)`、Cloudflare Workersの非固定送信元IP運用を拡張しない。サイト全体・pagination・別domainへの範囲拡張なし。
- **Attribution:** 現行表示「池部楽器」「池部楽器 Events」は、当初問い合わせで提示した、情報元の分かる表示として維持。正式回答の例示は厳密な固定表示名指定ではないため、内部source ID・表示名を変更しない。
- **Required tracking:** exactly `utm_source=soundcruise`, `utm_medium=referral`, `utm_campaign=cruise_port`。Portの `news-external-link.js` で、HTTPS・資格情報なし・標準portの公式PB数値記事URLと公式main-host blog記事URLにのみ適用する。対象の既存UTM値・重複・大小文字variantはこの3指定値へ統一し、他queryとfragmentを保持する。許諾外domain、一覧・商品一覧・トップページには付与しない。
- **Presentation / preservation:** NEWS一覧のクリック用hrefだけを生成する。既存記事・今後の有効記事に同じ処理を使い、保存source URL/canonical、candidate ID、dedupe、日付、見出し、facts/provenance、掲載状態、人間判断、Ledger/feedback/Shadowは変更しない。Home tickerは従来どおりNEWS一覧へ移動し、そこで原記事リンクに同じ処理を適用する。自社記事詳細の内部リンクには適用しない。target / noopener / noreferrerを維持する。
- **Verification date:** 2026-10-16。Port通常版/Pro版・既存PB/Events記事・指定UTM・他source不変を本番公開後に確認する。NEWS/Operator Worker、D1、collection scope、schedulerの変更・deployは不要。設定完了のお礼は同スレッドのGmail下書きのみとし送信しない。


## 2026-10-18 — Morris official Information editorial policy and human review

- Owner editorial direction: Morris official Information is generally a NEWS candidate, including products, signature/limited models, events/exhibitions, contests/recruitment, artists/interviews, craftsmanship, repair/maintenance/services, reports/catalogs and other acoustic notices. Editorial relevance is separate from evidence completeness. This does not relax other sources' publication validation.
- Verified listing URL/date/proof can create a **NEEDS_CONFIRMATION / 要確認** card even when structured facts are null. Old `baseline_old` receipts stay unchanged; article ID, canonical URL and original publication date stay bound to saved evidence. The 90-day window and confirmed event expiry still exclude stale announcements. Audit identifying names and original titles are not converted into publishable labels.
- A separate, Access/CSRF-protected human primary-fact confirmation operation records only bounded structured facts, the checked source URL, type/action, explicit acknowledgements, verification time, a confirmation hash and the existing listing response hash. It does not pretend that a detail HTTP response was fetched. Recruitment needs a verified actor/target/action; an actual event announcement additionally needs its date and venue. Reports retain retrospective value, without invented future event fields. Product release wording requires a non-future verified release date.
- Formal publication validation, provenance, fingerprint, date/expiry, duplicate, source health and takedown checks remain mandatory. Saving verified facts does not publish; the owner must separately approve. An atomic full-candidate snapshot check prevents stale saves. Existing facts-recheck operational records are reused; no new human verdict, feedback or Shadow teacher record is generated by this operation.
- Daily listing and once-only fresh-detail ledgers, the 48-hour fresh-detail boundary, no historical detail batch access and no RSS remain unchanged. Receipt-only materialization and Operator recovery issue no publisher requests. Source attribution stays `Morris Guitars`, with direct original links and no original title/body/image/logo storage or reuse. No additional publisher access is authorized by this editorial policy.

### 2026-10-18 — Automatic facts and READY recovery

- The owner authorizes automatic classification, structured fact extraction, independent labels, formal validation and duplicate checks up to **READY_FOR_HUMAN_DECISION**. Publication still requires a separate human decision. Morris-specific notice validation reuses the existing editorial taxonomy; other sources' publication standards are unchanged.
- The once-only fresh-detail response is shared in memory across the bounded primary-article extractor, existing product/event analysis and typed notice candidates. Visible article paragraphs, subordinate headings, definition lists and table fields can contribute evidence; hidden/related/navigation content and another article cannot. At most 200 primary blocks / 24,000 characters are considered within the existing 128,000-byte response limit. Source HTML, original headings, prose and images are discarded, not retained.
- The official publisher is the announcer, not an inferred event organizer or manufacturer. Recruitment requires its explicit target and recruitment action; exhibition notices require the named event and explicit exhibition action, with dates/venue retained only when present and consistent. Actual hosting announcements still require date and venue. Repairs require an explicit service/action binding, reports require the report subject and publication action, and catalog publication/update requires its explicit target/action. Contradictions, multiple complete interpretations, negation, past product introductions, expired announcements and ambiguous product identities remain blocked. Publication dates never supply event/release dates.
- Parser versions `morris-listing-facts-4` / `morris-explicit-fields-4` retain compatibility with versions 1–3. Automatic notice facts use the existing `morris_notice` schema with `morris_explicit_notice_v1` evidence and exact acquisition-receipt provenance; human primary confirmations remain a distinct evidence method. A system recovery reuses `news_facts_rechecks` plus the existing pending lifecycle, preserves candidate ID/URL/publication date and CAS revision checks, and records `system_recovery`. It does not write a human Decision Ledger verdict, feedback or Shadow evaluation.
- Failed extraction retains the existing 要確認 card, source link and date, with bounded classification candidates/missing-field/reason codes. The existing fact-confirmation form is an optional exception path. Saved historical evidence lacking actual names/actions is not reconstructed from fingerprints or diagnostic flags. No additional Morris requests, historical detail requests, RSS, permission expansion, source-state changes or manual collection are authorized for this release.

## 2026-10-20 — Morris owner-selected historical primary review

- The owner explicitly requested a single supplemental check of six exact Information URLs (1001_01, 0919_01, 0915_01, 0903_01, 0820_01, 0803_01 in 2026). The three actual permission-thread messages were reread. This operation does not assert that the publisher granted a new historical-crawling exception, and it does not change the publisher permission record or regular acquisition policy.
- Exactly one real GET per selected URL, sequentially with ten-second spacing, standard disclosed Bot UA, no redirects/retries, no listing/RSS/product/media/related-page requests. All six returned HTML 200. A local sandbox DNS failure occurred before HTTP dispatch; normal network execution was used for the actual requests. Each existing permanent article receipt is spent once, retaining its original discovery and publication metadata. No perpetual historical collector is added.
- Primary review is explicitly `system_primary_review` / `morris-primary-review-1`, distinct from automatic classifier versions and human primary confirmation. Only typed facts, independent labels, response hashes, URL/day binding, keyed fingerprints and minimal review checks are retained. Original responses are transient only. A receipt, actual request count, exact fact/proof matching and all ordinary publication gates remain mandatory.
- The source-specific `ギター` product description avoids inventing an unprinted acoustic/electro-acoustic subtype. M-AH is introduced as an announcement, not as already released on its article's August 3 publication date. Its primary detail states an August 5 release date; the original candidate date is retained.
- Isolated assessment: four formal READY candidates (FPD 2027 recruitment, east preliminary, Japan Forest event, M-AH announcement); the August 29 diagnosis event is expired; the September 19 festival page has a conflicting og:url pointing to September 18 and cannot obtain formal publication provenance. The October 3–4 festival is also over. No event report is fabricated from an ended announcement.
- Migration 0019 corrects future recovery commits to apply an explicitly supplied keyed title fingerprint atomically with facts. It does not backfill or rewrite existing articles/history. Scheduled listing/fresh-detail limits, RSS exclusion, final human publication decision, existing published rows and teacher data are unchanged.

<a id="contact-policy-20261021"></a>

## 2026-10-21 — Final contact policy / inquiry evidence correction

**Latest contact-management addendum; local documentation only.** This entry supersedes the contact-status conclusions of the earlier October 21 audit, including its temporary HTML report. Earlier publisher replies, permission conditions and historical decisions remain intact. It does not authorize sending or change runtime policy.

### Separate contact evidence, permission and operation

| Contact evidence class | Required interpretation |
|---|---|
| 問い合わせ済み（Gmail記録あり） | Actual SENT correspondence or a publisher reply with its related correspondence. A draft is not sending evidence. |
| 問い合わせ済み（フォーム利用・送信証跡あり） | Matching official form receipt/submission evidence. Receipt is not permission. |
| 問い合わせ済みの可能性あり（フォーム利用の申告あり） | Respect the owner's report; delivery/date/receipt remain unverified unless separately evidenced. |
| 未問い合わせ確認済み | Affirmative evidence of no inquiry for the stated scope/campaign; Gmail absence alone is insufficient. |
| 不明 | Neither submission nor confirmed non-submission is established by available evidence. |

- **ZOOM / Kikutani correction:** on 2026-10-21 the owner reported that earlier official dedicated-form inquiries are highly likely. Both are now **問い合わせ済みの可能性あり（フォーム利用の申告あり）**. Earlier “未問い合わせ / initial inquiry only” conclusions based on Gmail absence are withdrawn. No submission time, form path, receipt number, delivery or answer is invented. ZOOM's separate unsent Gmail draft does not disprove prior form use.
- documented_silence, SAFE, policyDecision=approved, robots allow, form receipt and silence are not express publisher permission. Bounded internal operation remains separate from permission.
- Expression-rights reservations, link conditions, robots/access denial and publisher refusals are different evidence types. Internal retirement / DO_NOT_USE is not a publisher refusal.
- This work performs **no Gmail creation/edit/deletion/send, form submission, production write, source enable/disable or new publisher-content acquisition**.

### Production snapshot and actual frequency

- Latest dedicated NEWS worktree: HEAD 823ddffbac782b4ef94aa0ffd7ab76dc61233b86; NEWS **0.34.2**, Operator **0.33.2**, Port **1.24.0**. No version change.
- Runtime allowlist plus read-only D1 source_state/source_health: **7 active healthy sources** — shimamura, zoom, kikutani, ikebe, ikebe-event, agm, morris.
- D1 approved **153**, rejected **50**, pending **0** at this check. Approved is not the public API display count; date, event/sale expiry and takedown filters remain.
- October 15–21 inclusive: each active source has **7 successful scheduled runs, one per JST day**. Each AGM run records **16 HTTP requests**; each other active source records **2**. These are scheduled-run totals, not all-path daily traffic.
- Two requests mean **robots + one listing/feed**, not two listing visits. AGM's 16 are **robots + 5 section feeds + News listing + up to 9 News article pages**. Its current News loop checks the fixed latest article set, including already seen URLs; it is not a lifetime once-per-new-article implementation.
- Separate bounded facts recheck and owner-authorized primary review must not be omitted from the frequency account. October 21 retained proof has four distinct response hashes/URLs (three Ikebe, one AGM), reused by two analysis records each. Eight analysis records are not evidence of eight article HTTP fetches. A complete historical per-URL HTTP ledger cannot be reconstructed from scheduled summaries alone.
- Morris receipts show one daily listing reservation, two actual requests (robots + Information), on each day October 15–21. Permanent article receipts / fresh-article gates prevent routine repeated historical detail access. Previously documented historical primary-review exceptions do not create recurring permission.
- D1 queries are SELECT-only, rows_written=0 and changed_db=false. No Morris listing/detail/RSS or Yamaha robots/Topics request was added in this work.

### Final registry inventory — all 29 scopes

Dates are JST in 2026. “不明” is the contact-evidence status, not a statement that no contact occurred.

| Source ID / name | Operation / approved rows | Permission | Contact evidence | Last established event | Final contact policy |
|---|---|---|---|---|---|
| yamaha — ヤマハ日本製品Topics | OFF / 1 legacy | 利用了承済み、403技術回答待ち | 問い合わせ済み（Gmail記録あり） | Formal reply 10/16: 1a143ade3d41af2c; technical SENT 10/18: 1a14bf13cd93b30d | No reminder. Wait for technical answer; source OFF. |
| shimamura — 島村楽器 | ON / 31 | 回答待ち・明示許諾未確認 | 問い合わせ済み（フォーム利用・送信証跡あり） | 10/9 14:57 receipt 1a11f3d0e7568f97 / v4jxneszfp; automatic only | Hold PR draft. Audit current scope/policy. Do not use unrelated historical contacts. |
| natalie — 音楽ナタリー | OFF; publication blocked/takedown | 許諾未確認、品質・日付停止 | 不明 | No matching NEWS permission evidence; no confirmed non-submission | No current contact; scope/quality decision before future inquiry. |
| skream — Skream! | OFF / 0 | 許諾未確認 | 不明 | Unsent draft; no matching actual NEWS sending/reply | Hold draft; do not contact an unadopted scope merely to fill a matrix. |
| morris — Morris Guitars | ON / 5 | 条件付き許諾済み | 問い合わせ済み（Gmail記録あり）＋フォーム送信証跡 | 10/9 receipt; 10/14 15:01 clarification / 15:32 assent 1a1391d419b252c5 | Continue accepted operation; no further inquiry. Daily Information, fresh detail once, no RSS/historical bulk. |
| deviser — Deviser | OFF / 0 | 許諾未確認 | 不明 | No matching NEWS evidence | Hold; scope/adoption decision before contact. |
| roland — Roland / BOSS | OFF / 0 | 許諾未確認 | 不明 | No matching NEWS evidence; link policy is separate | Hold; no permission inferred from another publisher's Roland article. |
| audio-technica — 日本公式 | OFF / 0 | 許諾未確認 | 不明 | No matching NEWS evidence; separate from AT Distribution | Hold; no cross-publisher permission inference. |
| kanda — 神田商会 | OFF / 0 | 許諾未確認 | 不明 | No matching NEWS evidence | Hold; discovery/redirect/scope incomplete. |
| zoom — ZOOM | ON / 1 | 明示許諾未確認、回答未確認 | 問い合わせ済みの可能性あり（フォーム利用の申告あり） | Owner report 10/21; submission date/receipt unknown; Gmail draft unsent | No reminder or duplicate initial inquiry. Draft unchanged/on hold; policy/robots/frequency audit. |
| kikutani — キクタニ | ON / 5 approved, one expired | 明示許諾未確認、回答未確認 | 問い合わせ済みの可能性あり（フォーム利用の申告あり） | Owner report 10/21; submission date/receipt unknown | No new form or duplicate inquiry. Earlier form text held; policy/robots/frequency audit. |
| ikebe-event — 池部Events | ON / 2 | 条件付き許諾済み | 問い合わせ済み（Gmail記録あり） | Assent 10/15: 1a13e3f7691fbf79; thanks SENT 10/16: 1a141d2230efe3f5 | Continue accepted Events scope, five conditions and UTM; no inquiry. |
| at-distribution — AT Distribution | OFF / 1 retained | 現行scopeは意図的廃止、許諾主張なし | 不明 | Retirement before permission campaign recorded; no matching NEWS reply | Not a current target. Keep article; products are not globally excluded. |
| ikebe — 池部PB | ON / 41 | 条件付き許諾済み | 問い合わせ済み（Gmail記録あり） | Same formal Ikebe thread; latest SENT 10/16 | Continue accepted scope/frequency and UTM; no inquiry. |
| chuya — Discover chuya | OFF / 2 retained | 許諾未確認 | 不明 | No matching NEWS correspondence found | Retained-use gap remains. Confirm history/contact before any first verified approach; no restart now. |
| hookup — Hookup | OFF / 1 retained | 許諾未確認 | 不明 | No matching NEWS correspondence found | Retained-use gap remains; possible future official general form, no submission now. |
| sonicwire — SONICWIRE | OFF / 2 retained | 現行feed opt-out、例外許諾未確認 | 不明 | Existing opt-out evidence, not a publisher reply banning every factual link | Keep OFF. Clarify retained-use/permitted route if later needed; no bypass. |
| sleepfreaks — Sleepfreaks | OFF / 5 retained | 明示許諾未確認、歴史的Worker403 | 不明 | No matching NEWS permission/technical reply | Keep OFF. Future corporate routing must distinguish permission and technical access from lesson support. |
| ik — IK Multimedia | OFF / 3 retained | 現行scopeは意図的停止 | 不明 | Existing low-yield/technical retirement; no matching NEWS reply | Not a current target; preserve existing articles. |
| ahs — AHS | OFF / 1 retained | 許諾未確認 | 不明 | No matching NEWS permission evidence | Retained-use gap remains; confirm Web-use contact/history first. |
| agm — AGM WEB | ON / 46 plus manual below | 条件付き許諾済み | 問い合わせ済み（Gmail記録あり）＋フォーム送信証跡 | Receipt 10/7; assent 10/8: 1a11b3bf481d9fdb; AGM thanks SENT 10/9 | No inquiry. Exact WEB attribution; 10/11 Digimart consultation is a separate matter. |
| korg — KORG / VOX | OFF / 0 | 許諾未確認 | 不明 | No matching NEWS evidence | Hold until definite acquisition scope/adoption. |
| esp — ESP / BIGBOSS | OFF / 0 | Direct-link exception permission unconfirmed | 不明 | Existing official deep-link restriction; no exception reply | Keep OFF. Resolve restriction before any restart; products via other sources are distinct. |
| yamaha-newsroom — 別host | OFF / 0 | 当該scopeの許諾未確認 | 不明 | Topics reply is not evidence for this separate host/scope | Hold; no new inquiry/access test. |
| amass — Rick Nielsen tag | OFF / 1 retained | 現行scopeは意図的廃止 | 未問い合わせ確認済み（現行campaign） | Owner expressly chose no amass inquiry; 10/9 retirement | No email/form. Future acoustic-performance scope may be reevaluated. |
| tft — THE FIRST TIMES | OFF / 0 | 許諾未確認 | 不明 | No matching NEWS evidence | Hold until relevant acoustic/SSW scope is defined. |
| takamine — Takamine | OFF / 0 | 内部DO_NOT_USE、先方の拒否は未確認 | 不明 | Internal classification only | No current contact; do not invent publisher refusal. |
| kurosawa — クロサワ楽器 | OFF / 0 | 内部DO_NOT_USE、先方の拒否は未確認 | 不明 | Internal classification only | No current contact; do not invent publisher refusal. |
| soundhouse — サウンドハウス | OFF / 0 | 回答待ち | 問い合わせ済み（Gmail記録あり） | SENT 10/9: 1a11fa8668f94cd4; thread 1a11f88177c56a2a; no reply found | At most one follow-up candidate in original thread; ask general shop route to forward to Web/NEWS. No send now. |

### Additional eight scopes / candidates

| Scope | Operation / permission | Contact evidence | Final policy |
|---|---|---|---|
| manual-ikebe | Manual only / 1 approved; bounded existing use covered by Ikebe assent | 問い合わせ済み（Gmail記録あり） — same Ikebe correspondence | No separate inquiry or new automatic discovery. |
| manual-agm-test | Four approved; 10/8 reply includes existing test display | 問い合わせ済み（Gmail記録あり）＋フォーム送信証跡 | No duplicate inquiry; old permission-pending wording is historical. |
| manual-apu — APU Software | Automatic OFF; individual candidate rejected for insufficient facts; permission unconfirmed | 不明 | Hold; no resurrection, automation or inquiry now. |
| jes — JES International | Unconfigured/not published; reply pending | 問い合わせ済み（Gmail記録あり） — SENT 10/9: 1a11f36952d612e7; thread 1a11f1f9a208e400 | At most one later authorized follow-up to official web@jes1988.com, same thread. |
| digimart — デジマート・マガジン | Unconfigured/not published; actual permission authority unconfirmed | 問い合わせ済み（Gmail記録あり） — SENT 10/11: 1a1293dc6f5f8f45 to Hashimoto in AGM thread | Prefer official Digimart medium/operation route. Preserve previous consultation; do not assume Hashimoto's role or send parallel duplicate inquiries. |
| tascam | Research candidate/OFF; permission unconfirmed | 不明 | No current contact; scope/adoption decision first. |
| steinberg | OFF; old campaign expired, not a permanent publisher ban | 不明 | No current contact or revival of expired campaign. |
| kvr-apu-support | OFF; supporting evidence withdrawn for incomplete identity | 不明 | No current contact; no permission/reliability inferred. |

### Enabled-source policy and acquisition audit

Bounded documentary/code/log review, not a legal opinion or comprehensive clearance of undiscovered clauses. The reviewed policy pages were reread. Publisher robots/listings were **not** fetched again: saved hashes, successful scheduled runs and fail-closed code are the access evidence.

| Enabled source | Reviewed fixed surface and scheduled traffic | Official policy / findings |
|---|---|---|
| 島村 | /update/common/new-item/; daily, robots + listing | [Site usage](https://www.shimamura.co.jp/siteusage/) permits links subject to source identification, no frame, separate window. Current Port uses identified source/direct URL/target=_blank/no frame. Link permission is not automation permission. No new explicit prohibition of this bounded collection was identified in the reviewed page. Form answer remains pending. |
| ZOOM | https://zoomcorp.com/ja/jp/news/; daily, robots + listing | [Privacy policy](https://zoomcorp.com/ja/jp/privacy-policy/) is not an automation grant. Current scheduled listing collector is bounded to recorder/product updates, not article crawling. Robots/opt-out gates remain. Prior form report and missing reply are not consent. Site-wide terms clearance is not claimed. |
| キクタニ | https://www.kikutani.co.jp/news/; daily, robots + listing | [Privacy policy](https://www.kikutani.co.jp/privacy-policy/) does not establish an automated-news license. No new explicit prohibition of the narrow collection was identified on this page; robots/opt-out gates remain. Form use is reported, not confirmed never-contacted. |
| 池部PB | https://www.ikebe-gakki-pb.com/new_product/; daily, robots + HTML listing; separate bounded recheck | [Store terms](https://www.ikebe-gakki.com/Page/agreement.aspx) retain expression rights. The 10/15 specific assent supplies permission for the presented use/frequency. Reviewed robots-absence/change rules and required UTM remain. |
| 池部Events | https://www.ikebe-gakki.com/blog/category/event/; daily, robots + HTML listing | Same publisher assent covers originally presented Events scope, not a general main-host crawl. Five conditions, attribution/direct links/UTM retained. |
| AGM WEB | Six fixed sections; daily, 16 requests including latest News metadata | [Rittor terms](https://www.rittor-music.co.jp/agreement/) restrict expression reuse; the 10/8 AGM-specific assent supplies the relevant permission. Low load, exact ACOUSTIC GUITAR MAGAZINE WEB attribution, no expression/images/logos. Current latest-News checks are not “new articles only, once ever.” |
| Morris | Fixed Information listing daily; fresh eligible detail once per permanent receipt | Publisher's 10/14 actual assent to the clarification is the permission. Daily reviewed robots404 path stops on status change; article URL robots check required. No RSS/archive-wide/repeated-detail crawl. Historical exceptions do not grant future bulk access. |

Common checks and limits:
- src/policy.js uses the disclosed SoundCruiseNewsBot/0.1 (+mailto:soundcruise.inc@gmail.com), no credentials, rejected redirects, time/byte bounds and robots parsing. Robots is not a publisher grant.
- src/collector.js and src/facts-recheck.js stop/disable on 401/403/451, robots disallow/change and opt-out; 429/5xx back off. Morris separately enforces daily/once-only receipts and fail-closed responses.
- apps/cruise-port/news-ui.js shows independent headline/source/date, links directly in a new tab, and does not embed publisher pages/images. Ikebe tracking is handled by news-external-link.js.
- Collector/parser/storage boundaries retain bounded facts, fingerprints, provenance and hashes, not original HTML/headlines/article prose/images. Transient source strings are cleared. This is a code/schema review, not a forensic claim about every historical database byte.
- src/admin.js, news_takedowns, publication-block and source-state gates provide correction/removal/stop mechanisms; none was executed.
- No newly confirmed explicit prohibition requiring an immediate enabled-source stop was found in the reviewed evidence. If an applicable explicit prohibition/stop request is found, record exact scope/clause, report it and request the owner's stop decision. Do not infer consent from silence or bypass access controls.
- Scheduled summaries are not complete all-path HTTP totals. AGM's repeated latest-News metadata reads and separate recheck traffic remain explicit limitations, not silently described as once-per-new-article.

### Official routing / follow-up policy

- **Shimamura:** retain 10/9 official form receipt. The [current official PR listing](https://www.shimamura.co.jp/press/?p=9807) does list press@shimamura.co.jp, but its additional draft is **on hold**. No contact from an unrelated historical matter is used.
- **ZOOM / Kikutani:** reported likely prior dedicated-form submissions; no reminder, duplicate initial inquiry or repeated form now. No dates/receipt IDs invented.
- **Sound House:** [official general contact](https://www.soundhouse.co.jp/guidance/usage/detail/?no=G01863) confirms shop@soundhouse.co.jp, not a dedicated licensing department. A more appropriate dedicated Web/NEWS email remains unverified. Original thread/forwarding request; maximum **one** follow-up if later authorized. Preserve latest-News scope, including useful clearly conditioned sales/coupons/campaigns.
- **JES:** [official CONTACT](https://jes1988.com/concept.html) confirms web@jes1988.com. Appropriate routing entry, not guaranteed permission authority. Maximum **one** later authorized follow-up in the existing thread.
- **Digimart:** prefer [official medium support](https://www.digimart.net/help/support/), requesting editorial/permission routing. Earlier automatic read returned 412; no bypass. [Media guide](https://ad.rittor-music.co.jp/web/digimart.html) concerns advertising, not proof of rights authority. Preserve 10/11 Hashimoto consultation and avoid parallel duplicate contact. No new form/email now.
- **Yamaha:** granted usage permission, technical reply pending; no additional reminder; keep draft held/source OFF. No new access test.
- **Ikebe / Morris / AGM:** continue accepted scope, no further inquiry; material changes/stop requests follow existing conditions.
- Retired/unadopted sources remain held. chuya/Hookup/SONICWIRE/Sleepfreaks/AHS retained-publication permission gaps stay unresolved, not silently converted to consent or never-contacted.

### Gmail draft inventory — disposition only

Seven relevant drafts reread as DRAFT, not SENT, no attachments. Three unrelated drafts remain untouched. **No creation, update, deletion or send this time.**

| Recipient/purpose | Existing draft ID / thread | Final disposition |
|---|---|---|
| 島村 press@shimamura.co.jp | r-7408289216040500440 / 1a15bb36724a4930 | **保留** — existing form inquiry; no extra PR email now. |
| ZOOM info@zoom.co.jp | r4431530083308285062 / 1a11e1d26303e060 | **保留** — initial-contact wording must not be sent unchanged as if no prior form inquiry existed. No edit/delete now. |
| Sound House shop@soundhouse.co.jp | r2019933617244545387 / 1a11f88177c56a2a | **送信候補・未送信** — polite existing text prepared, maximum one follow-up after future send authorization. |
| JES web@jes1988.com | r-8301585181873700075 / 1a11f1f9a208e400 | **送信候補・未送信** — same one-follow-up ceiling. |
| Yamaha technical reminder | r2302582114671839155 / 1a143ade3d41af2c | **保留** — no additional reminder. |
| Skream info@skream.jp | r784802891982399290 / 1a15bb6f27f959fb | **保留** — unadopted scope. |
| Old AGM ad@rittor-music.co.jp | r-7641861625988268459 / 1a10b7c43b8d8cd3 | **送信不要・保管** — 10/8 permission already obtained. No duplicate send or unilateral deletion. |

Kikutani has no separate Gmail draft in this inventory; earlier form text is held. Digimart's unsubmitted form-transfer text is an alternative route, not authority to send duplicate inquiries.

### Remaining uncertainties / completion

1. ZOOM/Kikutani prior submission date, exact form path, receipt, delivery and answer remain unverified; owner report preserved, no request to repeat the form.
2. Sound House's specific Web/NEWS permission department and Digimart's editorial/rights authority remain unknown. Official routing is preferable to guessed addresses/roles.
3. Replies from Shimamura/ZOOM/Kikutani/Sound House/JES and Yamaha's technical team remain unconfirmed in available evidence. Yamaha alone is a technical hold after affirmative usage permission.
4. OFF-but-retained permission gaps and complete all-path historical HTTP counts remain unresolved. No production change is made to close them artificially.
5. At completion of this audit, this addendum/pointer was the only repository change and remained local/uncommitted. The owner subsequently authorized publication of this register alone; that Git publication does not authorize any source/Worker/DB/article/Gmail change or email/form submission. No application version bump or Worker deployment is required for this documentation-only publication.

## 2026-10-23 — Acoustic expansion implementation and source readiness

- **AGM:** existing grant and six fixed surfaces retained. The last saved robots
  probe (2026-10-23 08:11:50 JST) still returned the reviewed maintenance 302.
  No additional request in this work; existing due time 2026-10-24 08:11:50 JST
  and hourly recovery mechanism remain unchanged. NEWS 0.36.1 removes arbitrary
  same-response RSS/News truncation and adds durable exact-URL overflow recovery
  within the unchanged 7-base + at-most-9-detail daily budget. Cache validity stays
  seven days. No archive/pagination permission is added. Actual stopped-period
  recovery is not established by the isolated synthetic tests.
- **Deviser / Headway:** keep the existing source OFF. The retained limited
  documented-silence assessment is neither a publisher grant nor a refusal.
  `discoveryValid=false / structured_facts_incomplete` and missing current primary
  response/identity validation still block acceptance. No other source's grant is
  reused. Product-only evidence does not approve event/artist scope. No matching
  NEWS permission email was found; that does not disprove earlier form use.
- **Martin Club Japan:** preparation only; no runtime source is added or enabled.
  Official disclaimer items 1 and 7 require individual information-use and linking
  approval. Known product/NEWS lists define the proposed scope. Current robots,
  RSS URL, validators and DOM acceptance are unverified. The minimum unsent
  question and bounded 3-base + necessary-detail design are recorded in
  [ACOUSTIC-EXPANSION-OPERATIONS.md](ACOUSTIC-EXPANSION-OPERATIONS.md).
- **Safety:** no Yamaha HTTP/test/enable/contact, no source enablement, no publisher
  outreach, no automatic publication/rejection, no article/data/teacher edits.
  Existing canonical URLs, publication dates, HOT/order and manual categories are
  protected. All older permission records remain historical evidence unchanged.


## 2026-10-23 — Daily 06:00 JST maintenance recovery timing (NEWS 0.36.2)

- Normal discovery and reviewed AGM/Shimamura robots-maintenance recovery share
  `0 21 * * *` UTC (06:00 JST next calendar day). The hourly :17 timer keeps
  retention/pending facts only; it performs no maintenance discovery/backfill.
- The rolling 24-hour maintenance wait was NEWS policy, not a new publisher
  condition. The identified legacy wait is aligned to the next daily slot.
  Explicit Retry-After, unexplained longer holds, robots review, permissions,
  takedown/opt-out and intentional OFF remain binding; no blanket source unlock.
- AGM's saved 2026-10-23 08:11:50 JST reviewed 302 is eligible for the regular
  2026-10-24 06:00 probe, if unchanged. No publisher HTTP is used to validate this
  release. Real restoration and backfill remain unconfirmed until that run.
- AGM RSS100/News30/detail9/HTTP16, 7-day evidence cache and deferred URL receipts
  stay unchanged. Normal recovery reuses its robots response; no redirect follow.
- No permission expansion, Yamaha/Deviser/Martin enablement, article edits,
  automatic publication, human decision or teacher data change is authorized by
  this scheduling change. Prior permission/history records are retained.

## 2026-10-24 — Initial primary facts preparation and owner-authorized Ikebe budget

The owner explicitly authorized the five October 24 Ikebe pending articles, each
with at most one additional article GET, and a continuing **maximum six necessary
Ikebe PB article checks per JST calendar day**, shared by scheduled preparation and
facts rechecks. This is the owner's NEWS operating budget, not a newly invented
publisher condition. The existing October 15 assent, selected PB scope, low-frequency
listing, brand/source separation, attribution/direct links and UTM remain authoritative.
No Events, Yamaha, Morris or AGM acquisition scope is expanded by this decision.
Shimamura's existing one-new-article daily budget remains one; its October 9 form
receipt and documented-silence policy are not reclassified as explicit permission.

NEWS 0.37.0 connects the established primary facts/CAS/validation service to the
06:00 JST scheduled candidate path for Ikebe PB and Shimamura. Previous-day later
rechecks no longer consume the following JST day's article allowance. Listing-only
cache entries are not counted as article checks. Atomic per-article claims share the
allowance across initial and hourly processing; HTTP refusal, robots, Retry-After,
opt-out, source gates and response bounds still stop acquisition. The just-verified
robots result is reused within the batch, including the reviewed empty 404 result.
No rolling-24-hour bypass of an external restriction is introduced.

A bounded parser fallback independently verifies canonical URL, the explicit public
publication date (not update/release date), brand tag/grammatical subject, named product
sections, product definitions and announcement action. Keyboard, headset/headphone,
amp-plus-pedal bundle and construction-bound electric-guitar notices use a strict
facts shape with field provenance. It is not a product/URL whitelist. A retailer's
notice does not establish that the brand itself announced or shipped the product.
Future release dates stay future; uncertain identities/types/actions remain held.

The October 24 six primary responses were checked once under the authorized budgets.
Only typed facts, hashes and provenance persist; original HTML/headlines/descriptions
and images do not. Both real cron entrypoints were replayed offline with those full
responses held in memory. Morning listing HTML had not been retained: listing inputs
were explicitly reconstructed structural projections, not claimed original recordings.
Two earlier rescued candidates were tested from retained structured facts/proofs,
without claiming their discarded HTML could be replayed.

Operator 0.35.1 recognizes the same facts/provenance rules. READY remains pending for
human decision. No approval/rejection, published-news update, human Ledger/feedback
rewrite, HOT/order/category override change, new source or migration is authorized
by this preparation change. The next live scheduled run remains unverified until it
actually occurs.

## 2026-10-25 — Undated primary release notices and duplicate brand spelling

The 06:00 JST production run created two candidates. The Ikebe SONIFIX pedal
reached formal READY during initial preparation, before its later human approval.
The Shimamura headphone detail returned HTTP 200 but primary-announcement-1
classified the polite future release verb as a scheduled release and stopped for
an absent explicit release date. Its original morning HTML was not retained.

The owner authorized **only Shimamura article 101720, one additional article GET**
for this investigation. One robots check and one article GET succeeded without
redirects, retries or related-page requests. This does not change the normal
Shimamura one-article daily budget or reclassify its permission evidence. The
morning failure hash and the new response hash are different and remain separate.
No original HTML, headline, description or image is persisted.

NEWS 0.37.1 / Operator 0.35.2 recognize a narrowly bound, undated primary release
notice: explicit brand grammatical subject, named primary product and product type,
and direct intention to release. The independent notice action records no release
date and cannot assert shipping or borrow the publication date. Unbound actions,
ambiguous plans and insufficient facts still fail. New notice provenance requires
primary-announcement-2; valid older primary facts/proofs remain usable. Closed
missing-field codes persist in failure proofs and source/day preparation summaries.

The new primary evidence names ADAM Audio / H715 Reference; retained approved Ikebe
primary facts name ADAM / H715 Reference with the same headphone identity. A reviewed
ADAM Audio/ADAM spelling equivalence is used only for duplicate comparison. It does
not rewrite stored brands, serve as an extraction whitelist or generally strip
"Audio"/"Guitars". Model, category, version and event compatibility still apply.
The existing approved product must remain published; recovering the Shimamura facts
must not create READY for a duplicate or automatically reject/approve either item.

Both real cron entrypoints were replayed offline with the newly authorized primary
response held in memory, with and without the already published peer. Facts recover
in both; unique evidence reaches READY and the actual peer blocks publication as a
duplicate. Listing inputs are explicit structural reconstructions, not saved morning
HTML. These checks do not claim the next live run has already succeeded. Existing
published articles, human Ledger/feedback/Shadow, HOT/order/category overrides,
source policies, cron, cache and access budgets remain protected.

## 2026-10-27 — Collection audit and late-listed Shimamura URL recovery

The October 25–27 daily cron invocations completed with Cloudflare outcome `ok`.
D1 preparation evidence records two new candidates/one initial READY on October 25,
none on October 26, and three newly observed URLs/no new candidate on October 27.
Public NEWS groups use the original publication date, not discovery or approval:
the SONIFIX item discovered/approved October 25 belongs to October 24. No published
candidate has an October 25/26 original date. This is distinct from a scheduler outage.

AGM remains stopped: each daily robots recovery check returned the reviewed 302 to
its homepage. No redirect is followed. Other six active sources completed discovery;
Yamaha remains OFF without acquisition. No publisher traffic is added for a rerun.

Two newly observed Shimamura URLs dated October 24/21 were dropped as
`before_watermark` before relevance/facts evaluation. Publication chronology cannot
prove a URL was already discovered. NEWS 0.37.2 supplies the retained source-specific
candidate URL set: the one-day overlap watermark may skip known URLs, but unseen
URLs in the fixed listing reach the existing normal candidate/90-day pipeline.
A discovery receipt without a candidate does not make a URL known. Existing article
identity, status, policy gates, editorial exclusions and detail budget remain intact.
No pagination, listing retry, extra daily collection or acquisition scope is added.

Within the unused normal Shimamura one-article/day budget, the October 27 audit made
one robots check and one GET of newly discovered article 100600. Both returned 200.
The current primary response confirms a Charvel product notice; the established
parser cannot safely corroborate the title/body model spelling and product type.
No invented facts or forced READY is permitted. The response is held only in memory
for diagnosis/replay; only bounded facts metadata/hash/outcome persist. The second
late URL is not fetched after this budget is spent. No approval/rejection or existing
published article, human Ledger/feedback/Shadow, HOT/order/category edit is authorized.
