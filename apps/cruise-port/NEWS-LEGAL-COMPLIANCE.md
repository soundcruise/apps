> Phase 2, 2026-09-30: amass is internally assessed SAFE **only for the official Rick Nielsen tag RSS** (`https://amass.jp/rss/3745`). This replaces UNKNOWN for this restricted factual-metadata scope; it is not publisher permission or a commercial republication license. First-party RSS guidance offers artist/genre tag consumption. Privacy/copyright information remains binding. Generic music feed, bodies, excerpts and images remain excluded. ZOOM uses only its official fixed public news listing and recorder/firmware facts. Full assessments: `workers/sound-cruise-news/src/quality-evidence.js` and `QUALITY-COVERAGE-PHASE2.md`.

# Cruise Port NEWS Legal & Compliance Policy

調査日: 2026-09-28 / 更新日: 2026-09-30 / 対象: Port 1.5.0・NEWS自動収集／公開（島村楽器の製品ニュースのみ）

現在のproduction状態は本書末尾の「Production launch」を参照。日付付きphase節は当時の判断・実行履歴であり、過去のOFF表示を現行状態と混同しない。

## 1. Purpose

NEWSの設計根拠、source追加時の審査、運用条件、掲載停止と定期再確認の基準を恒久記録する。
これは**法律上の保証・法律意見書ではない**。AIによる調査や独立レビューは法律専門家の判断を代替しない。
将来の実装者は以下の制限を設定変更だけで緩和しないこと。

## 2. Current NEWS model

ギター・DTM・録音機材とギター弾き語り関連情報の所在・新着案内。
表示は独自の短い事実label、source、公開日、category、original URL。
本文、記事HTML、原見出し、長いsnippet、OGP/RSS画像、外部記事画像、iframeは使用しない。
Port 1.5.0は専用News APIを正本として表示する。23件fixtureは明示的な開発・テスト用途に残し、本番エラー時の無期限fallbackにしない。島村楽器の承認済み製品ニュース一覧metadataだけを自動収集し、独自の事実templateに適合したAUTO候補だけを公開する。REVIEWは保留。SALEは本番source未承認のため収集・公開しない。

## 3. Copyright Act Article 47-5

[e-Gov 著作権法47条の5](https://laws.e-gov.go.jp/law/345AC0000000048)は、電子計算機による情報処理で新たな知見・情報を創出し著作物の利用促進に資する所在検索や情報解析等について、政令の基準を満たす者による、目的上必要な限度の付随的な軽微利用を定める。軽微性は使用部分の割合・量・表示精度等で判断される。侵害送信を知った利用や、権利者の利益を不当に害する利用は除外される。2項の準備行為にも独立した条件がある。
[文化庁の平成30年改正解説](https://www.bunka.go.jp/seisaku/chosakuken/hokaisei/h30_hokaisei/)も検索・解析結果に付随する利用として説明している。
本NEWSが必ず該当するとは断定しない。単なる新着一覧と条文の情報処理要件の関係は専門家レビュー対象。リンク中心・独自label・最小保存・手動確認はこの規定との整合性を高める設計方針であり、適法性の証明ではない。

## 4. robots / opt-out

[施行令7条の4](https://laws.e-gov.go.jp/law/345CO0000000335)は、受信者識別情報の入力等によるアクセス制限、情報漏えい防止、適正利用措置を規定。
[施行規則4条の4](https://laws.e-gov.go.jp/law/345M50000080026/)は、一般の慣行に従うrobots.txtやHTML等の収集禁止措置に係る情報を提供しないことを定める。
実装ではrobots取得不能/未承認404はfail closed、対象URLの拒否は保存しない。非空なのにUA groupがない、directive連結やコメント後のdirective等はrobots_unparseableとして人の再審査まで停止する。CR/CRLFは正規化し、空robotsは有効とする。
robots.txt自身のX-Robots-Tag noindex/nofollow等は、そのファイルの索引指定として扱い、source全体の収集禁止にしない。FeedのX-Robots-TagまたはFeed metadata内のnoindex/noarchive/nosnippet/nofollow/noneは保守的に拒否する。記事側の指定は承認時に人が確認し、拒否指定があれば承認しない。
HTML記事を取得しないため、個別記事のmetaは自動確認できず、確認済みとは表明しない。承認済み一覧metadata・robots path・HTTP header・一覧opt-outを満たす製品候補だけをfacts-only自動公開境界へ進める。独自labelを生成できない候補はpendingで人の審査を待つ。手動審査のarticleチェックは維持し、自動経路で実施済みに偽装しない。拒否が判明した場合は削除・停止する。
**robots Allowは利用規約上の商用利用許可ではない。** Sitemap宣言も取得許可とはみなさない。

## 5. Pre-compliance review

施行規則4条の5は、業として行う際に要件の解釈資料の閲覧、学識経験者への相談その他の必要な取組をあらかじめ行い、問い合わせ先等を合理的に明示する旨を定める。
履歴:
- NEWS-JP1-A2: Codexのsource調査（既存REPORT.md / news-40.csv）。
- NEWS-JP1-B: Claude Opus独立監査の結果・分類をユーザーから受領。完全な監査原本や個別Termsの引用を今回独自に再構成したものではない。
- 2026-09-28: Codexがe-Gov法令APIで47条の5、令7条の4、規則4条の4/5を確認。文化庁、新聞協会、裁判所の一次資料を確認。
- NEWS-JP2B-3: JP2B-2のfinding一覧は今回のユーザー指示から受領。監査原本は未受領・提示依頼中であり、読了したとは扱わない。
- 法律専門家への相談を行った記録はない。本番開始前に法令適用・Terms・連絡窓口運用を人が承認すること。

## 6. Newspaper Association guidance

[新聞協会 2021-12-10](https://www.pressnet.or.jp/news/headline/211210_14373.html)は、所在検索に付随し元の情報源へ誘導する利用と、購読・閲覧を代替する利用を区別し、後者やデータベース事業への影響に慎重な見解を示している。これは**業界団体の見解**であり法令そのものではない。本NEWSは同資料の数量目安を転載許可として用いず、本文・画像の提供を行わない。

## 7. Yomiuri headline case

知財高裁 平成17年10月6日・平成17年(ネ)第10049号。
指定された旧要旨PDFは404。裁判所の移転先[判決全文](https://www.courts.go.jp/assets/hanrei/hanrei-pdf-9350.pdf)で事件を確認。
対象の見出しについて創作性が否定された一方、短い見出しが常に著作物にならないと一般化してはならない。営利目的で反復継続し、鮮度の高い見出しを実質的に複製・配信して競合する等の当該事案では不法行為による賠償が認められた。あらゆるリンクや事実案内に不法行為が成立するという判決ではない。
本NEWSはexact headlineを保存・表示せず、単なる語尾変更による見出し再利用も承認しない。

## 8. Copyright / Terms distinction

著作権法47条の5はTermsや契約を上書きする規定ではない。独自の事実label・URL・日付だけなら、そもそも著作物の表現を利用していない場合もあり得る。ただし具体的な表示・抽出方法ごとに判断し、適法性や規約上の許可を一律に断定しない。
SAFEは分類にすぎず、collection許可ではない。termsUrl / linkPolicyUrl / policySummary / reviewedBy / reviewedAt / robotsReviewedAt / discoveryReviewedAt / policyDecision=approvedを全て必要とする。不足時はevidence_missing、90日超過や未来日時はpolicy_expired。
CONTACTはpermissionRefがなければpermission_required。取得してもCONTACT/UNKNOWN/DO_NOT_USEは通常設定変更で収集可能にはならず、再分類のコードレビューが必要。
2026-09-28時点で完全な根拠が揃ったsourceは0。全source enabled=false。島村・Roland等の確認できた部分的な規約根拠をsource-policies.jsへ記録し、未確認部分を捏造して埋めない。Sleepfreaksのprivacyページや通販規約をニュース収集の許可に転用しない。

## 9. Criminal / civil risk boundary

著作権侵害、民法上の不法行為、規約・契約、不正アクセス、電子計算機損壊等業務妨害を別々に検討する。
成立にはそれぞれの要件があり、通常の公開情報アクセスが直ちに犯罪となる、あるいは本NEWSが該当するとは断定しない。罰則の最大値は列挙しない。
login突破、CAPTCHA回避、アクセス制御・403・rate limitの回避、過剰収集は実装・運用とも禁止する。

## 10. Source classifications

SAFE-ENOUGHは法的保証ではない。コードの分類キーはSAFE / CONTACT / UNKNOWN / DO_NOT_USE。
下表はregistryとの整合性テスト対象。enabledは**ローカル収集候補**の設定であり、DBの停止状態も優先する。表のenabledは静的registry値（false）のまま。production runtimeの明示allowlistで島村楽器だけを有効化する。

| id | Source | Status | Enabled |
|---|---|---|---|
| yamaha | Yamaha製品サイト | SAFE | false |
| shimamura | 島村楽器 | SAFE | false |
| natalie | 音楽ナタリー | SAFE | false |
| skream | Skream! | SAFE | false |
| morris | Morris | SAFE | false |
| deviser | Deviser | SAFE | false |
| roland | Roland/BOSS | SAFE | false |
| audio-technica | Audio-Technica | SAFE | false |
| kanda | 神田商会 | SAFE | false |
| zoom | ZOOM | SAFE | false |
| kikutani | キクタニ | SAFE | false |
| ikebe | 池部楽器 | SAFE | false |
| chuya | Discover chuya | SAFE | false |
| hookup | Hookup | SAFE | false |
| sonicwire | SONICWIRE | SAFE | false |
| sleepfreaks | Sleepfreaks | SAFE | false |
| ik | IK Multimedia | SAFE | false |
| ahs | AHS | SAFE | false |
| agm | AGM / Rittor Music | CONTACT | false |
| korg | KORG / VOX | CONTACT | false |
| esp | ESP / BIGBOSS | CONTACT | false |
| yamaha-newsroom | Yamahaニュースルーム | CONTACT | false |
| amass | amass | SAFE | false |
| tft | THE FIRST TIMES | UNKNOWN | false |
| takamine | Takamine | DO_NOT_USE | false |
| kurosawa | クロサワ楽器 | DO_NOT_USE | false |
| soundhouse | サウンドハウス（1.5.0 sale候補・未審査） | UNKNOWN | false |

Artist/Liveはギター関連の明示的根拠が必要。ピアノのみ、一般ツアー、一般芸能記事は除外。

## 11. Source re-review

registryはtermsUrl / robotsUrl / discoveryType / legalStatus / lastPolicyReviewAt / notes / enabledを保持。
policy evidenceの日付3種のいずれかが90日を超えた場合は収集・API掲載とも停止。少なくとも90日ごとに人が再確認する。
403/401/451、robots変更、Terms変更発見、停止依頼があれば即時停止・再審査。
初回robotsの内容はハッシュで保持し、次回変更時は自動で受け入れず停止する。

## 12. Takedown / correction

1. 窓口から停止・訂正・削除依頼を受けた担当者が対象URLを特定する。メール本文や依頼者個人情報をNEWS DBへ保存しない。
2. `admin:local`はlocal D1操作、`admin:plan`は将来のremote操作用SQLファイル生成のみ。詳細はWorker README参照。今回remote実行は一切行わない。
3. `global-off`はD1のcollection_enabled/api_enabledをOFF。source-disable/source-delete/item-deleteはsource停止・一括削除・1件削除。item削除は再取得抑止hashを90日保持。action/target（source IDまたはitem hash）/timestamp/reason codeだけを監査記録として保存する。
4. local処理はD1 batchで操作・audit・cache revisionを原子的に更新。remote SQL planは先頭でglobal OFFにし、途中失敗してもOFFを維持する。運用者は対象News専用DBを確認してから実行する。
5. APIは毎回D1停止状態をcacheより先に確認。source/item操作でrevisionを更新し古いedge cacheを使わない。ブラウザにはno-storeを返す。PortのAPI停止応答はtickerを隠し停止案内を表示する。
6. 再開はreview_complete reasonと有効なpolicy evidenceが必要。source-enableはregistry enabledも必要。停止前の承認を自動復元する操作は作らない。
7. Port手動fixtureとローカルレポートに同じmetadataがあればそれらも訂正・削除する。現在fixtureは未公開。本番反映には別の承認が必要。

## 13. Contact

既存窓口: `soundcruise.inc@gmail.com`。Portのterms.html、privacy.html、設定画面に存在。
NEWS画面にも同じメール導線を追加。架空窓口は作成していない。メール送信は行っていない。
運営者は本番開始前に受信・対応体制を確認する。

## 14. Data retention

候補・承認済みNEWS metadata、fingerprint、構造化reviewは同じ行に保持し最大90日。公開日+90日と初回収集日+90日の早い方で期限を固定し、日付訂正・再審査で延長しない。
収集と独立したscheduled handlerがD1 batchでphysical purgeする。本番用候補は毎時`17 * * * *`、稼働間隔を考慮して次の1時間以内に期限を迎えるNEWSも早めに削除する。Cron失敗はaggregate errorで監視し復旧する必要がある。今回はCron設定は空、local scheduled実行のみ。
run diagnosticsは90日、item再取得抑止hashは90日、内容を含まない操作監査（action/source IDまたはhash/time/reason）は365日。source停止状態は停止遵守のため継続保持。purge失敗はbatch rollbackし、現在のNEWSを破壊しない。削除件数だけをlog出力する。
保存はURL/source/date/category/独自label/topic/初回収集日/審査code/見出しfingerprint。本文・HTML・画像・原見出し・長いdescriptionはDB列にも保存しない。review自由記述は廃止。
`.local/last-run.json`はreview操作後に更新し、読み出し時に90日超過を削除する。手動コピーは担当者が期限管理する。NEWS itemの物理削除Cronは、端末上の手動コピーまでは削除しない。

### Prototype fixture exception (M-6)
23件のSAFE fixtureはPort 1.3.0本番ベータの初期データで、D1の90日physical retentionとは別管理。UIでは90日filterを維持し、正式production API切替時にはfixtureを削除またはdev-onlyへ移す。本番APIの代替表示として古いfixtureへ自動fallbackしない。

## 15. AI

今回は外部AIを呼ばない。既知製品辞書、word boundary、event分類、source別allowedPaths/deniedPathsでdeterministicに候補化する。tutorial/evergreenを除外する。1.5.0から大型の機材セールはNEWS対象（下記「NEWS-1.5.0」）で、coupon/points/送料無料/単品・中古1点/小規模販促/終了済みセールのみ除外する。不明な製品・出来事・セール規模はlabel_requiredまたはsale_*理由のpendingとする。
Raw headlines stay in memory. NFKC/case/whitespace/punctuation normalization precedes secret-keyed HMAC-SHA256. Persist only a domain-separated exact signature, key ID, gram count and at most 64 bottom-k 3-gram signatures. NEWS_HEADLINE_PEPPER is externally injected; never persist it, raw headlines or unsalted title_hash in D1/logs/reports/API. Missing or mismatched keys fail closed. Migration 0003 clears old fingerprints and quarantines old non-rejected rows as legacy pending, without conversion. DB-only gram dictionary enumeration is prevented under an uncompromised high-entropy key assumption; length/equality leak and key compromise remain limitations. This is neither an absolute non-reversibility guarantee nor a complete plagiarism detector.
手動承認はoperator/manual/admin識別子、関連性/事実/opt-out/重複/日付/source policy/labelの各booleanを要求。記事別にmeta robots、bot-specific meta、X-Robots-Tag、公開アクセス、link/reuse notice、canonical、公開日、独自label、ギター/機材関連、一次情報置換のcode値を必須とする。未確認・拒否状態では承認できない。内容crawlerは作らない。
pending→approved/rejected、rejected→明示reopen→reopened→approved/rejected。日付がFeed値と異なる場合はdateOverrideReasonを必須とし、approved topicKey重複はDB unique indexでも拒否する。
将来AIを使う場合も分類等の補助だけ。外部textを命令として扱わず、ツール・秘密情報を与えない。事実の追加や長い再生成は禁止。

## 16. Operational limits

各sourceは24時間間隔（コード下限6時間）。直列収集、source lease、localプロセスlockを使用。
robotsとdiscoveryの間は最低1秒、Crawl-delayが長ければそれに従う。60秒を超える指定は再審査待ちとして取得しない。
Feed/Atom metadataおよび島村の限定された公式listing parserのみ。記事本文・sitemap indexの再帰巡回は未実装。本番は島村楽器の製品一覧だけを承認allowlistで収集する。他sourceと全SALE収集はOFF。
ETag/If-Modified-Sinceを送る。403/401/451とFeed拒否ヘッダーは停止、429はRetry-Afterか24時間の長い方、5xxは指数backoff（最大7日）と最後の試行から24時間の長い方まで待つ。
robots失敗と未審査404はfail closed。redirectは0回、サイズはrobots 512KB / discovery 1MB、15秒timeout、最大100候補/回。

## 17. Prohibited engineering shortcuts

robots bypass、403 bypass、CAPTCHA bypass、回避用IP rotation、偽browser fingerprint、login credential使用、paywall突破、headless回避、全文スクレイピング、画像hotlinkは禁止。
source allowlist以外を取得しない。URL入力APIを作らない。local fetchではDNS解決を公開IPv4に限定して接続し、private/link-localへの接続を拒否する。XML DTD/ENTITYを拒否する。

## 18. Legal research references

いずれも調査日2026-09-28。

- 著作権法47条の5: https://laws.e-gov.go.jp/law/345AC0000000048 （法令APIの本文も確認）
- 著作権法施行令7条の4: https://laws.e-gov.go.jp/law/345CO0000000335
- 著作権法施行規則4条の4・4条の5: https://laws.e-gov.go.jp/law/345M50000080026/
- 文化庁 平成30年改正: https://www.bunka.go.jp/seisaku/chosakuken/hokaisei/h30_hokaisei/
- 同解説PDF: https://www.bunka.go.jp/seisaku/chosakuken/hokaisei/h30_hokaisei/pdf/r1406693_17.pdf
- 新聞協会の見解（法令ではない）: https://www.pressnet.or.jp/news/headline/211210_14373.html
- YOL事件の指定旧要旨URL（404確認）: https://www.ip.courts.go.jp/app/files/hanrei_jp/350/009350_point.pdf
- 同事件の裁判所移転先・判決全文: https://www.courts.go.jp/assets/hanrei/hanrei-pdf-9350.pdf

参照資料の確認は、個々のsourceの利用許可・契約成立・法律専門家の承認を意味しない。本番deploy、D1作成、migration、Cron開始には別途承認と独立レビューが必要。


## 19. JP2B-3 implementation / verification references

- source evidence: `workers/sound-cruise-news/src/source-policies.js` / `registry.js`
- Scheduled handler: https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
- D1 batch: https://developers.cloudflare.com/d1/worker-api/d1-database/
- 部分確認: https://www.shimamura.co.jp/siteusage/ / https://www.roland.com/jp/terms_of_use/ / https://www.audio-technica.co.jp/corp/privacypolicy / https://www.kandashokai.co.jp/terms/ / https://hookup.co.jp/about/tac / https://espguitars.co.jp/support/terms/
- Sleepfreaks: https://sleepfreaks-dtm.com/privacy/ はprivacyの根拠だけでありcollection許可ではない。
- Phase 1候補は島村楽器・Sleepfreaks・Hookup。全てOFF。

## NEWS-JP2B-5: evidence and readiness (2026-09-28)

- Dictionary extraction requires an explicit brand AND product in the same metadata. Never infer Universal Audio from LUNA or a product from its brand. Generic Boss/Luna/Reason/Logic/Studio do not supply facts. Event words must also be explicit; uncertain items remain pending/label_required. No external AI call.
- Shimamura terms/linkPolicyUrl both point to https://www.shimamura.co.jp/siteusage/ because this page contains both website terms and link conditions. Commercial/non-commercial links are generally unrestricted. Source must remain identifiable; frames are disallowed, separate windows required. Top page is recommended, other URLs are not categorically forbidden. Named-source links, no iframe, no article body/image/exact headline align with those conditions.
- No explicit automated collection permission found (documented silence). The internal limited-pilot rationale is public Feed, robots respect, once daily, metadata only, independent labels, 100% human approval, source traffic and immediate kill/takedown. This is an internal risk decision aimed at alignment with Article 47-5, not publisher permission or a legal determination.
- Current robots GET: https://www.shimamura.co.jp/robots.txt returned 200; valid, Update!/Feed paths allowed, no Crawl-delay. Hash recorded in src/shimamura-evidence.js. Its two explicit disallowed paths are outside scope.
- Candidate Feed https://www.shimamura.co.jp/update/feed/ was requested once but no validated response obtained. Update! listing HTML verification also failed to yield a response. Do not fill in discoveryReviewedAt or claim discovery verified. policyDecision=incomplete, PHASE-1 READY=false. No gated candidate collection followed.
- Allow only /update/guitar-bass/ and /update/amp-effector/, supported by prior JP2A verified direct links. Do not guess dtm-recording/PA paths. Exclude shops/sale/campaign/event/lesson/recruit/coupon/used/generic notices. Current site-structure recheck is incomplete: sourceRulesReviewed=false.
- Kanda corrected terms: https://www.kandashokai.co.jp/terms/ . Old notice.html is not current policy evidence.
- ESP: https://espguitars.co.jp/support/link explicitly prohibits direct links to site content (deep links). CONTACT/disabled retained.
- Audio-Technica: https://www.audio-technica.co.jp/corp/privacypolicy includes both website terms and linking conditions. No framing or misleading affiliation; comply with removal requests. Use the same URL for linkPolicyUrl. This does not establish automated collection permission.
- Readiness requires SAFE, complete/current evidence, valid robots/Feed, source rules, interval >=12h and source production OFF. Final gate separately requires global collection/API OFF and empty Cron. READY never means ON. Sleepfreaks/Hookup remain incomplete and disabled.

## NEWS-JP2B-6: Shimamura official listing discovery (2026-09-29 JST)

This section supersedes the JP2B-5 Feed dependency for Shimamura only.

1. Discovery is the official product-news listing at
   https://www.shimamura.co.jp/update/common/new-item/ . It was discovered through
   a visible product-news link on the official guitar/bass category page. Two
   listing observations returned HTTP 200, 126358 bytes and visible dated cards
   spanning guitar/bass, effects and DTM/recording. No further Feed probing.
2. Listing HTML is processed in memory only. No storage, response cache, archive,
   snapshot, fixture, debug output or trace contains raw publisher HTML. The
   parser executes no JavaScript and does not load linked resources. Source titles
   are transient inputs to classification/HMAC and are cleared at the sink.
3. No article HTML/body, images or OGP are requested. Article-level opt-out,
   canonical/date/factual checks and primary-source substitution remain mandatory
   human review steps before approval. All candidates are pending.
4. Official terms/link conditions were rechecked at
   https://www.shimamura.co.jp/siteusage/ . Automatic listing access remains
   DOCUMENTED SILENCE, not explicit permission. policyDecision=approved records
   only the internally authorized limited-pilot assessment under the documented
   restrictions, not a claim of permission or a legal verdict.
5. One listing GET per 24h (plus robots), first page only; no pagination. Respect
   robots, source/global kill, takedown and 90-day retention. Request uses
   conditional validators only; no HTML cache. Successful collection watermark
   overlaps one JST day because visible dates have no time, preventing routine
   same-day late additions from being skipped.
6. Fixed source and listing URL only, HTTPS/DNS/redirect/size/timeout controls.
   512000-byte limit. Product-news heading plus anchored list cards, visible
   date, title and category are required. No fallback to unrelated sections.
   Structural mismatch/opt-out/oversize disables the source for review.
7. Robots matched the previously reviewed digest. Actual listing validation
   stopped on a non-card h3 caption; no candidate was saved. The parser now ignores
   non-card captions while retaining card/date/category requirements. Synthetic
   regression passes, but the corrected adapter has not been live revalidated:
   the session's 3-listing-request budget was exhausted. discoveryValid=false,
   PHASE-1 READY=false. Production/local collection and API remain OFF.
8. Live persistence audit found no raw HTML in isolated D1/SQLite/WAL or session
   reports/logs. The structural failure occurred before any extracted title reached
   the persistence sink; no live title corpus was retained for a post-run content
   scan. This limitation is reported rather than labeling an empty scan as proof.
   Synthetic tests additionally check title/pepper/HTML absence from stored rows.

## NEWS-JP2C-1: future selection and source-health policy (2026-09-29)

When collection is separately authorized, select for **relevant-news recall**: reject clearly out-of-scope items, and hold uncertain items for factual review instead of silently discarding them. Missing brand identification, medium/low confidence, a slightly ambiguous article type, or similarity between an independently written factual label and a source headline is not alone a rejection reason. Shared facts such as brand, product, model, release/announcement/update, price and date may appear in a label. Never copy a publisher's catch copy, evaluation, metaphor or other creative expression. This editorial policy does not relax robots, Terms, source gating, human approval, or the current production OFF state.

Future collection operations must notify the operator/user when robots change or Disallow applies, Terms review expires, a source policy changes, HTTP 401/403/451 occurs, 429 repeats, listing/feed structure changes, a source auto-disables, global collection stops, or retention purge fails. Record the reason and affected source without publisher content or secrets. A notification backend belongs to a later phase; none is activated by Port 1.3.0.

## NEWS-JP2B-7E: Shimamura one-time early validation (2026-09-29 JST)

修正版の公式listing adapterを実ページで単発確認するため、Sound Cruiseが自主設定した24時間間隔に今回限りの例外を適用した。法令または媒体規約上の間隔要件を解除したものではない。固定listingへのGETは1回、robots再取得は0回。2026-09-29 08:16:26 JSTのアクセスを新しい基準とし、次回listing GETは2026-09-30 08:16:26 JST以降とする。以後は通常の24時間間隔に戻す。

HTTP 200・126358 bytesだったが、見出しの直近sectionにカード・日付・カテゴリが見つからず`listing_structure_changed`で停止した。2回目の取得は行わず、sourceはOFF、discoveryValid=false、PHASE-1 READY=NOを維持。原HTML・原見出し・秘密情報を保存・出力せず、候補承認・本番配信も行っていない。自動収集の明示許可は確認しておらず、DOCUMENTED SILENCEの判断は変わらない。

## NEWS-JP2B-8: offline parser / recall / source health (2026-09-29 JST)

同一sectionを前提にした抽出を廃止し、ページ識別子・同一originの許可記事URL形・可視タイトル/日付・カテゴリを組み合わせる。構造全体の破損時は停止し、個別の不確実な関連記事は審査待ちに残す。この段階では人工HTMLのテストのみ実施し、媒体への追加requestは0件。実ページへの適合は未確認で、sourceはOFFのまま。

Content recallとCompliance gateを分離する。ブランド未特定、分類の不確実性、事実だけで組み立てた独自labelとの類似は、それだけで関連記事を破棄しない。Similarity guardは独自labelの再生成または審査signalとし、媒体固有の宣伝文句・評価・比喩・創作的表現はコピーしない。HMAC fingerprintの秘密と原見出しは保存しない。推測で欠けた製品情報を補わない。robots/Terms/opt-out/停止状態などの法務・技術ゲートは従来どおり優先する。

将来の自動収集・自動掲載向けに`AUTO_PUBLISHABLE`、`PUBLISH_REVIEW`、`REJECT`の判定を保存できるようにした。ただし初期pilotの候補はすべて`pending`で、掲載には人の承認を要する。Source healthは定型の状態・理由・日時を保存し、状態遷移時のみoperator alertを作る。原HTMLや外部本文は保存しない。安全な管理者専用認証がPortに確認できないため、公開UI/APIは設けずローカル運用CLIにとどめる。メール・アプリ内通知は後続phaseで接続する。本番fixture 23件、News Worker未配備、収集/公開OFFは変わらない。

## NEWS-FINAL: automatic publication boundary (prepared 2026-09-29 JST)

最新のユーザー指示に基づき、正常収集できた`AUTO_PUBLISHABLE`を自動掲載する経路を準備した。ブランド・製品・出来事を確認できる定型の事実labelに限り、見出しとの事実上の一致は掲載を妨げない。HMACの形式と鍵の一致は引き続き検証し、類似度signalとは区別する。不明確な候補は`PUBLISH_REVIEW`として保持する。

自動経路の根拠は許可された一覧の可視metadata、robotsの対象パス、HTTP header、一覧metaのopt-outである。禁止されている個別記事HTMLへアクセスせず、未確認のarticle-level checklistを確認済みとは記録しない。手動審査の既存checklistは維持する。規約・robots・source停止・日付/URL・削除要求はContent recallより優先する。

運用者は既存Cloudflare認証を使うCLIから本番D1の状態・異常alert・審査候補を確認する。一般利用者のPro/Account状態を管理権限に流用しない。新しいメールサービスや秘密は導入しない。API停止時はPortに古いニュースを復活表示させない。本文・画像・原HTML・原見出しの保存禁止、90日保持、問い合わせ・takedownは維持する。

本番移行は1回のlive validation成功後に限定する。2026-09-29の準備段階ではpublisherへの追加request、本番D1作成、Worker deploy、collection ONは実施していない。最終結果はWorkerのPRODUCTION-OPERATIONS.mdおよびNEWS-FINALの完了報告に追記する。

## NEWS-1.5.0: sale eligibility (prepared 2026-09-29 JST, offline)

旧規則「sale-only / campaign-only は一律REJECT」を撤廃した。**大型の楽器・DTM・録音機材セールはNEWS対象**で、判定基準は「ニュースとして知らせる価値のある規模か」である。カテゴリー `sale`（表示名「セール」）を正式に追加した。広告・Sponsored・購入推奨の扱いにはせず、affiliateは実装しない。

- 掲載候補：大型楽器店の全店規模・決算・周年・ブラックフライデー・年末年始・サマー等のセール、複数ブランド／複数カテゴリの値下げ、DTM/録音機材の大型セール、メーカー公式の期間限定・多数製品の値下げ、価格メリットのある多数製品キャンペーン。
- AUTO_PUBLISHABLE：sale取得の証拠が承認済みのsource（`contentTypes`に`sale`、`saleCollection: approved`）で、販売元が明確・終了日が明確で未終了・対象機材が明確・規模が十分広く、掲載日がある場合のみ。
- PUBLISH_REVIEW（recall-first）：規模不明、特定brand限定、店舗限定だが大量、campaignとsaleの境界が曖昧、終了日不明、販売元不明（media）、sale取得が未審査のsource。曖昧さだけでは除外しない。
- REJECT：単品・1点・中古品の値下げ、couponのみ、ポイント倍率のみ、送料無料のみ、ノベルティ・抽選のみ、下取り・買取、小規模な週末・当日限りの販促、小規模な1店舗販促、終了済みセール、lesson/recruit/店舗案内（従来どおり）。
- ラベル：販売元（registry名）・固定語彙のイベント名・日付・固定語彙の対象機材・既知brandのみで生成する（例「イケベ楽器、決算セールを10月31日まで開催。ギター・エフェクターなどが対象」）。publisherの広告コピーや煽り語（衝撃・激安・爆安・史上最大・見逃し厳禁・超お得・今だけ等）は使わず、含むlabelは保存・承認できない。
- 保存：本文・HTML・原見出し・画像・OGPは従来どおり保存しない。セールの事実は既存 `product_facts` 列に構造化値（seller/event/scope/equipment/startDate/endDate）として保持する。表示期限の投影列はmigration 0007で追加する（本番適用は未実施）。
- 終了日：終了済みセールは候補化せず、自動公開時にも終了日を再確認する。
- Source：Sound House（`soundhouse`）を未審査候補として追加（UNKNOWN、enabled=false、discovery未設定）。Ikebe（`ikebe`）は既存登録を再利用し、sale対応は `pending_evidence`。どちらも terms/robots/listing・feed の証拠がなく、収集もsale自動公開もできない。registryに存在するだけでは一切fetchしない。本phaseでpublisherへのアクセスは行っていない。
- 島村楽器：承認済み証拠は製品ニュースlistingのみ。listing上の `sale_campaign` 除外はこのsource範囲の規則として維持し、島村楽器のセールを扱う場合は別途証拠が必要。
- Source health（robots変更、policy期限切れ、401/403/451、429反復、listing構造変化、source停止）はsale sourceにもそのまま適用する。


## NEWS SALE safety closure（2026-09-29、offline）

本番baselineはPort 1.4.3 (`be28371f`)、NEWS 1.5.0は未コミットWIPであり未公開。
SALE候補作成時の承認を永続的な許可とせず、自動承認直前に現在の共通証拠・SALE取得承認・source状態・healthを再確認する。承認欠落／不正／撤回／期限切れでは掲載せずpendingを保持する。

決算／Black Friday等の名称より、coupon・points・送料無料・景品抽選・買取だけの販促と単品値下げの除外を優先する。機材の複合語を複数カテゴリと数えず、規模不明の店舗限定やbrand限定はREVIEWに残す。曖昧な値下げと特典の混在も自動掲載しない。

表示期限と保存期限を分離した。終了日だけの場合はJST当日23:59:59.999まで、明示時刻がある場合はその時刻まで表示する。期限ちょうどは表示し、その後API・一覧・カテゴリ一覧・tickerから除外する。終了日不明は通常の90日表示規則に従う。SQLでページ分割前に除外し、継続位置・cache期限・Portの期限到達／復帰時描画も整合させる。D1から即削除せず、従来の90日physical retentionとtakedownを維持する。

publisherアクセス0、外部接続試行0。全8suite 1,794 PASS。Sound House／Ikebe SALEは無効、島村楽器のparser・証拠・readinessは変更なし。原見出し・本文・画像を保存しない方針、HMACとブランド／製品照合、既存Source Healthは維持。本番D1・Worker・Pagesの変更は実施していない。


## Shimamura final live validation — 2026-09-30 JST

08:39:30 JSTに許可されたlisting GETを1回だけ実行。HTTP 200、127022 bytes、
現行parserで11件の必要metadataを確認し、技術的なPHASE-1 READYを確認した。
robots・記事・画像・feed・他publisherへの追加GETは0。原HTML・原見出しは
メモリ内のみで処理・破棄し、本文は取得していない。既存robots/policy evidence
は有効で、DOCUMENTED SILENCE・明示的自動収集許可なしの判断を維持する。
SALE収集承認は追加しない。source/production/local pilotはOFFのまま。
本番化は別phase。詳細はworkers/sound-cruise-news/FINAL-LIVE-VALIDATION.md。

## Production launch / voluntary interval — 2026-09-30

Port 1.5.0の初回立ち上げに限り、ユーザーは自主的24時間待機のone-time exceptionを明示承認した。法令に定められた待機時間の変更ではない。operator専用CLIが日付・理由・一意なD1 audit・空DB・停止状態を検証し、listing GET最大1回のみを許可する。public/Cron経路や恒久bypass flagは存在しない。robots、規約evidence、source authorizationとhealthは緩和しない。

migration 0008のlast_publisher_request_atを通常guardの基準とし、HTTP失敗・timeoutでも24時間待機する。Cronは毎時起動するが、eligible sourceだけを収集する。初回保存後は収集OFFで保存済みAUTOを公開し、本番D1を使う拒否fetchテストで0回を確認してから通常運用ONへ進める。Source Health異常・opt-out・policy変更時は停止。独自label／URL／日付／分類／HMAC sketch以外のHTML・原見出し・本文・画像は保持しない。

実運用と一回限りの監査記録は[NEWS production completion operations](../../workers/sound-cruise-news/PRODUCTION-COMPLETION-OPERATIONS.md)および最終Production Completion Reportを参照する。Sound HouseとIkebe SALEは無効のまま。
