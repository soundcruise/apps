# Cruise Port NEWS Legal & Compliance Policy

調査日: 2026-09-28 / 更新日: 2026-09-29 / 対象: Port 1.3.0 fixture beta・NEWS collection foundation / 本番収集: OFF

## 1. Purpose

NEWSの設計根拠、source追加時の審査、運用条件、掲載停止と定期再確認の基準を恒久記録する。
これは**法律上の保証・法律意見書ではない**。AIによる調査や独立レビューは法律専門家の判断を代替しない。
将来の実装者は以下の制限を設定変更だけで緩和しないこと。

## 2. Current NEWS model

ギター・DTM・録音機材とギター弾き語り関連情報の所在・新着案内。
表示は独自の短い事実label、source、公開日、category、original URL。
本文、記事HTML、原見出し、長いsnippet、OGP/RSS画像、外部記事画像、iframeは使用しない。
Port 1.3.0は23件の手動fixtureを本番ベータとして表示する。NEWS Workerの自動収集・APIは本番OFFで、Portへ自動配信しない。

## 3. Copyright Act Article 47-5

[e-Gov 著作権法47条の5](https://laws.e-gov.go.jp/law/345AC0000000048)は、電子計算機による情報処理で新たな知見・情報を創出し著作物の利用促進に資する所在検索や情報解析等について、政令の基準を満たす者による、目的上必要な限度の付随的な軽微利用を定める。軽微性は使用部分の割合・量・表示精度等で判断される。侵害送信を知った利用や、権利者の利益を不当に害する利用は除外される。2項の準備行為にも独立した条件がある。
[文化庁の平成30年改正解説](https://www.bunka.go.jp/seisaku/chosakuken/hokaisei/h30_hokaisei/)も検索・解析結果に付随する利用として説明している。
本NEWSが必ず該当するとは断定しない。単なる新着一覧と条文の情報処理要件の関係は専門家レビュー対象。リンク中心・独自label・最小保存・手動確認はこの規定との整合性を高める設計方針であり、適法性の証明ではない。

## 4. robots / opt-out

[施行令7条の4](https://laws.e-gov.go.jp/law/345CO0000000335)は、受信者識別情報の入力等によるアクセス制限、情報漏えい防止、適正利用措置を規定。
[施行規則4条の4](https://laws.e-gov.go.jp/law/345M50000080026/)は、一般の慣行に従うrobots.txtやHTML等の収集禁止措置に係る情報を提供しないことを定める。
実装ではrobots取得不能/未承認404はfail closed、対象URLの拒否は保存しない。非空なのにUA groupがない、directive連結やコメント後のdirective等はrobots_unparseableとして人の再審査まで停止する。CR/CRLFは正規化し、空robotsは有効とする。
robots.txt自身のX-Robots-Tag noindex/nofollow等は、そのファイルの索引指定として扱い、source全体の収集禁止にしない。FeedのX-Robots-TagまたはFeed metadata内のnoindex/noarchive/nosnippet/nofollow/noneは保守的に拒否する。記事側の指定は承認時に人が確認し、拒否指定があれば承認しない。
HTML記事を取得しないため、個別記事のmetaは自動確認できない。候補はpendingに限定し、人が公開ページの拒否設定を確認しない限りapprovedにできない。確認で拒否が判明した場合はrejectに留めず削除すること。
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
下表はregistryとの整合性テスト対象。enabledは**ローカル収集候補**の設定であり、DBの停止状態も優先する。本番は全件OFF。

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
| amass | amass | UNKNOWN | false |
| tft | THE FIRST TIMES | UNKNOWN | false |
| takamine | Takamine | DO_NOT_USE | false |
| kurosawa | クロサワ楽器 | DO_NOT_USE | false |

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

今回は外部AIを呼ばない。既知製品辞書、word boundary、event分類、source別allowedPaths/deniedPathsでdeterministicに候補化する。tutorial/evergreen/sale/coupon/usedを除外し、不明な製品・出来事はlabel_requiredのpendingとする。
Raw headlines stay in memory. NFKC/case/whitespace/punctuation normalization precedes secret-keyed HMAC-SHA256. Persist only a domain-separated exact signature, key ID, gram count and at most 64 bottom-k 3-gram signatures. NEWS_HEADLINE_PEPPER is externally injected; never persist it, raw headlines or unsalted title_hash in D1/logs/reports/API. Missing or mismatched keys fail closed. Migration 0003 clears old fingerprints and quarantines old non-rejected rows as legacy pending, without conversion. DB-only gram dictionary enumeration is prevented under an uncompromised high-entropy key assumption; length/equality leak and key compromise remain limitations. This is neither an absolute non-reversibility guarantee nor a complete plagiarism detector.
承認はoperator/manual/admin識別子、関連性/事実/opt-out/重複/日付/source policy/labelの各booleanを要求。記事別にmeta robots、bot-specific meta、X-Robots-Tag、公開アクセス、link/reuse notice、canonical、公開日、独自label、ギター/機材関連、一次情報置換のcode値を必須とする。未確認・拒否状態では承認できない。内容crawlerは作らない。
pending→approved/rejected、rejected→明示reopen→reopened→approved/rejected。日付がFeed値と異なる場合はdateOverrideReasonを必須とし、approved topicKey重複はDB unique indexでも拒否する。
将来AIを使う場合も分類等の補助だけ。外部textを命令として扱わず、ツール・秘密情報を与えない。事実の追加や長い再生成は禁止。

## 16. Operational limits

各sourceは24時間間隔（コード下限6時間）。直列収集、source lease、localプロセスlockを使用。
robotsとdiscoveryの間は最低1秒、Crawl-delayが長ければそれに従う。60秒を超える指定は再審査待ちとして取得しない。
Feed/Atom metadataおよび島村の限定された公式listing parserのみ。記事本文・sitemap indexの再帰巡回は未実装。現時点の本番収集はOFF。
ETag/If-Modified-Sinceを送る。403/401/451とFeed拒否ヘッダーは停止、429はRetry-Afterか24時間の長い方、5xxは指数backoff（最大7日）。
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
