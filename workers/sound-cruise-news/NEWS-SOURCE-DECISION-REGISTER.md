# NEWS Source Decision Register

## Purpose and status

**Operational / Historical Reference**。既存repo記録の索引・整理であり、legal opinion、新しいauthorization、再審査、source設定変更ではありません。publisherアクセス／Web検索／robots・規約再取得は今回すべて0。Balanced Source Policyを維持します。

記録整理日：2026-10-01。開始baseline：Port 1.11.0／NEWS 0.9.1、HEAD `92b7fc05`。既存source判断日とこの文書作成日は別です。

## Current-state precedence

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
| [morris](#source-morris) | Morris | OFF | NEEDS EVIDENCE — ROBOTS / POLICY / DISCOVERY |
| [deviser](#source-deviser) | Deviser | OFF | BOUNDED ASSESSMENT COMPLETE / TECHNICAL-QUALITY INCOMPLETE |
| [roland](#source-roland) | Roland / BOSS | OFF | NEEDS EVIDENCE — PARSER / SUPPLY / SCOPE |
| [audio-technica](#source-audio-technica) | Audio-Technica（日本メーカーサイト） | OFF | NEEDS EVIDENCE — CLIENT METADATA / VALUE |
| [kanda](#source-kanda) | 神田商会 | OFF | NEEDS EVIDENCE — REDIRECT / DISCOVERY |
| [zoom](#source-zoom) | ZOOM | ON | ALLOWED WITH BOUNDS |
| [kikutani](#source-kikutani) | キクタニ | ON | ALLOWED WITH BOUNDS |
| [ikebe-event](#source-ikebe-event) | 池部楽器 Events | ON | ALLOWED WITH BOUNDS |
| [at-distribution](#source-at-distribution) | AT Distribution（公式代理店） | ON | ALLOWED WITH BOUNDS |
| [ikebe](#source-ikebe) | 池部楽器 新製品情報局（PB） | ON（Product）／自動Sale OFF | ALLOWED WITH BOUNDS |
| [chuya](#source-chuya) | Discover chuya | OFF／legacy承認済み記事は表示対象 | NEEDS EVIDENCE — ROBOTS AMBIGUITY |
| [hookup](#source-hookup) | Hookup | OFF／legacy承認済み記事は表示対象 | BOUNDED ASSESSMENT COMPLETE / QUALITY INCOMPLETE |
| [sonicwire](#source-sonicwire) | SONICWIRE | OFF／legacy承認済み記事は表示対象 | STOPPED — FEED OPT-OUT |
| [sleepfreaks](#source-sleepfreaks) | Sleepfreaks | COLLECTION STOPPED／approved 5件visible | ALLOWED WITH BOUNDS history / STOPPED — WORKER HTTP 403 |
| [ik](#source-ik) | IK Multimedia | ON | ALLOWED WITH BOUNDS |
| [ahs](#source-ahs) | AHS | OFF／legacy承認済み記事は表示対象 | NEEDS EVIDENCE — PARSER / POLICY SCOPE |
| [agm](#source-agm) | AGM / Rittor Music | ON（Interview限定） | ALLOWED WITH BOUNDS |
| [korg](#source-korg) | KORG / VOX（メーカー公式） | OFF | NEEDS EVIDENCE — APPLICABLE SCOPE / DISCOVERY |
| [esp](#source-esp) | ESP / BIGBOSS | OFF | EXPLICIT PERMISSION REQUIRED — DEEP LINK EXCEPTION |
| [yamaha-newsroom](#source-yamaha-newsroom) | Yamaha newsroom | OFF | NEEDS EVIDENCE — APPLICABLE SCOPE / DISCOVERY |
| [amass](#source-amass) | amass | ON（限定tag） | ALLOWED WITH BOUNDS |
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

## Morris — morris

| Item | Existing decision record |
|---|---|
| Source / Publisher | Morris |
| Surface | www.morris-guitar.com 公式新着候補、固定discovery未構成 |
| Current State | OFF |
| Current Scope | アコギ製品NEWS候補。 |
| Decision | NEEDS EVIDENCE — ROBOTS / POLICY / DISCOVERY |
| Why | robots 404のproduction absence review、適用規約、固定metadataが未完。 |
| Explicit Restriction | 404は明示拒否ではない。具体的な今回方式への禁止は記録未確定。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | UNKNOWN／適用scopeまたは明示許諾の確認は未完。今回の未確認を新たな禁止判断にしない。 |
| Evidence | [COVERAGE-EXPANSION-PHASE1-REPORT.md](COVERAGE-EXPANSION-PHASE1-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-REPORT.md](BLOCKED-SOURCE-RECOVERY-REPORT.md)、[BLOCKED-SOURCE-RECOVERY-EVIDENCE.json](BLOCKED-SOURCE-RECOVERY-EVIDENCE.json) |
| Decision Date | 2026-09-30 |
| Notes | 既存判断の整理のみ。新しい安全性判定・source変更なし。 |

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
| Decision | ALLOWED WITH BOUNDS |
| Why | PBと別scopeでrobots/policy/qualityを確認。阿部学ワークショップは公式facts確認後operator承認。 |
| Explicit Restriction | generic blog全体・paginationなし。店舗tagだけでは会場確定不可。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | documented silence／明示的automation許諾なし。既存の限定内部判断であり、許諾の不在だけを利用不可の理由にしない。 |
| Evidence | [src/high-value-evidence.js](src/high-value-evidence.js)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-10-01 |
| Notes | manual-ikebe：別途既存承認されたmain-hostの個別Event facts/link scopeも存在。自動化grantと混同しない。 |

<a id="source-at-distribution"></a>

## AT Distribution（公式代理店） — at-distribution

| Item | Existing decision record |
|---|---|
| Source / Publisher | AT Distribution（公式代理店） |
| Surface | https://atdistribution.net/information/ 固定listing |
| Current State | ON |
| Current Scope | 検証済みRecording製品の発表facts。 |
| Decision | ALLOWED WITH BOUNDS |
| Why | 固定1ページでHarrison FLEX 10の有用な型名・種類・公開日を検証し独自label採用。 |
| Explicit Restriction | privacy内のsite termsは表現再利用を制限。製品説明・本文・画像を使わない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | documented silence／明示的automation許諾なし。既存の限定内部判断であり、許諾の不在だけを利用不可の理由にしない。 |
| Evidence | [src/high-value-evidence.js](src/high-value-evidence.js)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-10-01 |
| Notes | FLEX 10は発表であり出荷を断定しない。日本Audio-Technicaの承認を流用していない。 |

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
| Permission Status | documented silence／明示的automation許諾なし。既存の限定内部判断であり、許諾の不在だけを利用不可の理由にしない。 |
| Evidence | [src/recovery-evidence.js](src/recovery-evidence.js)、[LEGACY-SOURCE-RECOVERY-REPORT.md](LEGACY-SOURCE-RECOVERY-REPORT.md)、[LEGACY-SOURCE-RECOVERY-EVIDENCE.json](LEGACY-SOURCE-RECOVERY-EVIDENCE.json)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-09-30〜10-01 |
| Notes | 拡大時contactはRECOMMENDED、確認済み必須条項ではない。Eventは別source。 |

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
| Current State | ON |
| Current Scope | guitar／DTM／Recording製品・主要software更新。公開日とpromo終了日を区別。 |
| Decision | ALLOWED WITH BOUNDS |
| Why | General Termsを実読し販売／software義務と公開Press facts/linkを分離。固定parserと独自label検証済み。 |
| Explicit Restriction | expression rights保持。forum、Tone.net、promos、supportへscope拡張なし。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | documented silence／明示的automation許諾なし。既存の限定内部判断であり、許諾の不在だけを利用不可の理由にしない。 |
| Evidence | [src/recovery-evidence.js](src/recovery-evidence.js)、[LEGACY-SOURCE-RECOVERY-REPORT.md](LEGACY-SOURCE-RECOVERY-REPORT.md)、[LEGACY-SOURCE-RECOVERY-EVIDENCE.json](LEGACY-SOURCE-RECOVERY-EVIDENCE.json)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-09-30〜10-01 |
| Notes | item_idだけidentity query許可。汎用一覧が返る個別candidateはREVIEW維持。 |

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
| Decision | ALLOWED WITH BOUNDS |
| Why | 2026-10-01の限定補足審査・sampleで国内Artist gapに有用な2件を確認。 |
| Explicit Restriction | copyright保護、表現再利用なし。親siteの「リンク歓迎」はautomation許可ではない。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | documented silence／明示的automation許諾なし。既存の限定内部判断であり、許諾の不在だけを利用不可の理由にしない。 |
| Evidence | [src/high-value-evidence.js](src/high-value-evidence.js)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-10-01 |
| Notes | 旧CONTACT計画はこのInterview surfaceだけ補足判断で更新。他surfaceへの包括承認ではない。 |

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
| Current State | ON（限定tag） |
| Current Scope | 名前のあるギタリスト＋明示ギター根拠のArtist／Event facts。 |
| Decision | ALLOWED WITH BOUNDS |
| Why | 公式artist/genre tag RSS案内、policy、robotsと限定sampleを検証。UNKNOWNから当該surfaceのみ限定判断。 |
| Explicit Restriction | 権利留保。full-music generic RSS、tag一括拡張、原文再利用なし。 |
| Internal Boundaries | 原見出し・本文・画像・OGP・raw HTMLを保存しない。独自facts label＋出典＋直接リンク。固定surfaceを原則1日1回、bounded fetch、robots/access/opt-out、90日retention、kill/takedownを維持。未確認factsはREVIEW。 |
| Permission Status | 公式tag RSS提供を確認／automationと商用転載licenseは主張しない。documented silenceの内部限定審査。 |
| Evidence | [src/quality-evidence.js](src/quality-evidence.js)、[HIGH-VALUE-COVERAGE-REPORT.md](HIGH-VALUE-COVERAGE-REPORT.md)、[HIGH-VALUE-COVERAGE-EVIDENCE.json](HIGH-VALUE-COVERAGE-EVIDENCE.json)、[HIGH-VALUE-SOURCE-POLICY.md](HIGH-VALUE-SOURCE-POLICY.md) |
| Decision Date | 2026-09-30〜10-01 |
| Notes | Brian May等の未承認追加tagはOFF。 |

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
