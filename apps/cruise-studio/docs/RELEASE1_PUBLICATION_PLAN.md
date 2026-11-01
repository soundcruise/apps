# Cruise Studio 1.0 公開候補監査・限定受入計画

この文書は実行承認ではない。今回は実資格、Production Backend、main、Pagesを変更しない。新機能・新基盤は追加せず、PR #153の製品バイトを固定する。

## 1. 固定候補と配信基準

- Repository: `soundcruise/apps`
- 製品候補: PR #153 / `2a76c8f1e6ca2b1949a87e77c8548a79f471d635` / tree `404464d60fcc07062c1af6f125f645dd8aef7774`
- 公開main: `cb48d8c17b4757a0404d031272a1f36ba92618b5`
- Cruise Port: **1.24.24**（現在のmainは1.24.20） / Cruise Studio: **1.0.3**
- GitHub Pages APIで確認: `legacy` / `main` / `/` / HTTPS / public / `soundcruise.jp`。
- 最新成功Pages build: **1331390387**、commitは上記main、2026-11-01 04:07:13 UTC完了。Actions run **41271772802** もsuccess。公開静的10ファイルをGETし、すべてmainのバイトと一致した。Worker endpointへはアクセスしていない。
- 履歴: main → #149 `b2f9cf474a8eb50697c7c1e42895c2a1165811af`（ready互換hook）→ `09c6f676…`（画像hydrate）→ #151 `0497fa029456a108defc0d82d983d43150fd5186` → #152 `4f20ea642da8656ab1bc7849a9acea27f7707679` → #153。

この監査branchは#153からの直系で、追加差分はJekyll除外済みの監査文書・manifestだけ。新しいmain向けDraftに全差分をまとめてレビューできるが、既存PRを順番にmergeしたり更新したりしない。製品を再構成する追加cherry-pickや大きな履歴整理は不要。

## 2. 公開構成・差分監査

初回対象は入口Pro/Account、5ツール、NEWS、4アプリ内部表示、Port共通Sync、5テーマ、中央/右ペイン。Studioは既存Portの正規Sync Center/runtimeを使用する。4アプリ内部表示はネイティブDOM/Controller/ローカル保存を再利用し、別のAccount/Sync ownerは起動しない。これはStudio内で各4アプリの独立Syncまで新たに受け入れたという意味ではない。単独アプリの既存Syncは変更しない。

main→#153のGit差分は110ファイル。内訳と全パスはmanifest参照。Portは13ファイルに機能差分（ready・iframe受信後のroute維持、画像hydrateのbinary/crop整合、Accountフォーム/commitガードと既存storeへの引渡し）、31ファイルはcache/versionのみ、15ファイルはテスト。Studio製品差分31ファイル、証跡/試験/packager18、Jekyll1、sharedはテストのcache URL1のみ。Studio公開ファイルは**34**であり、製品差分31という数とは別。

4アプリ全tree・Worker全tree・shared製品ファイルはmainと同一。Port SW、保存schema、共有認証、Account、Sync runtime、Worker API/設定/migrationは変更しない。Port 1.28.2全面移植は含まれない。新しいWorker/DB/DO/鍵/Control/Freeze/Owner経路はない。

実Jekyll safe buildではサイト全体815ファイル、うちStudioが正確に34。mainビルド比は追加26・変更65・配信除外206・同一724。除外206はStudio内のみで、開発ソースをGitから削除した数ではない。元のProject/Pre-DTM moduleはmainと同じバイトでGitに残り、公開成果物にはない。より新しい開発成果の既存PR/worktreeも保持する。開発版HTML/Project/Pre-DTM/Cloud client、fixture、scripts、docsは公開34ファイルに含まれず、Workerも配信されない。入口・hash・内部command・初期化からProject APIを起動しない既存Browser試験も再確認した。

注意: 従来mainのPages規則はPort側のNodeテストファイルを配信している。新規3テスト（asset-main-compat、port-account-save-guard、pro-studio-ready）も同じ規則で静的配信される。これらは通常の製品入口から呼ばれない合成Node試験で、実資格・Worker実装・開発権限の有効化経路を含まない。Studioの開発用URL無効化と混同しない。本工程では候補バイトを変えず、テスト配信整理は独立した配信衛生の後続作業にする。すべての開発ファイルがサイト全体で404だとは報告しない。

Lucide/FeatherのISC/MIT全文は公開対象の既存SVG metadata内にある。アイコン形状9個は維持。除外される別ファイル名だけを根拠にせず、実HTTPで配信SVG内の全文を確認した。

## 3. Production契約 A / B / C

| 区分 | 確認範囲 | 判定 |
|---|---|---|
| A 既存Port実績 | main/rootのPages公開履歴と静的10ファイル一致。保存済み2026-10-04のPro Device Session公開・既存スマホ継続・共有4アプリ認証・限定offline probe記録（`PRO_AUTH_OPERATIONS.md:394`以降）。mainのAccount/Pro/Sync/Asset呼出先とpayload契約を維持。 | 既存フローの証拠。今日の全endpoint/全フラグの実確認ではない。 |
| B Studio固有 | 正式入口でPro＋Account summaryを検証、同一originのPort iframeと4アプリsrcdocへ信頼sourceを引渡し、中央/右窓単一owner、Account接続後保存・初回受信、offline継続、画像同期、34ファイル隔離。新しいBackend APIは追加しない。 | 合成製品試験あり。実origin/実端末/実資格の受入が次工程。 |
| C 未確認実物 | 現在のv138 artifact/設定完全一致、実二端末・実資格・実R2画像/添付・現行CORS/Turnstile・Mac/Safari・旧タブとの共存。 | 未実施。v138 artifact完全取得を機械的な前提にはしない。既存Portの成功だけでStudio固有フローをPASSにもしない。 |

既存 `/v2/pro-auth` のverify/session/challenge/renew等、既存 `/v2/accounts/…` のAccount/device/Port接続、`/v1/sync/push`・changes・snapshotと既存Asset upload/download/参照/削除を使う。Account資格とPro資格は別々に必要。Studio Project専用API/Backendは不要。短期ACK喪失は既存operationId/payload保持・CAS・retry/own-echoの契約を使用し、新UNKNOWN基盤を移植しない。未確定操作を黙示破棄・新ID再送・CAS上書きしない。

既存v138を変更しないため、単一source Workerへの更新、schema0036のcleanup予約、新Project Backend、長期履歴期限を拡張する仕組みは初回公開の実装要件にしない。現在のAPIで通常の保存・同期・参照削除が実受入できることが必要。実際に既存APIが正常利用を拒否するならそのフローを停止し、Productionを書き換えて試験を通さない。

## 4. 実Account限定受入の前提・承認票

**今は未承認・未実施。** 127.0.0.1の既存18808/18829を含む合成プレビュー、`*.fixture.invalid`、`serve-local-pro.py`、Playwright資格注入/通信置換には実資格を一切入れない。

承認前に運営者が確定する項目:

- 実施者・日時・2端末（Mac Chrome専用profileと独立端末。Safariは別途明記）、専用の新規test Account A/B、各端末自身の正規Pro認証。普段利用している個人Account/既存profileは使わない。Pro番号・Account credential・join code・復旧情報をチャット/PR/画像/ログに記録しない。
- 許可するoriginは `https://soundcruise.jp`、既存native Workerへ通常UIで行う登録/参加/同期/専用Device解除/専用資格の再認証だけ。SQL、全体Pro generation変更、全ユーザー失効、Cloud全消去、Account全復旧は範囲外。
- 公開対象はこのmanifestで固定したフロントエンド。main/root一括Pagesのため、Port最小パッチは既存Port利用者全体へ配信される。canonical Studio URLは全員から取得可能で、利用は既存Pro/Accountゲートで制限される。「URLを知らせない」ことはアクセス制御ではなく、運営者だけのprivate公開・割合Canaryを現在の構成で保証しない。
- 本番originで候補を試すには別途フロントエンド公開承認が必要。新しいACL/Worker/サブドメイン/proxyを作らず、canonical URLで少人数が受入し、合格まで告知をしない方式を第一案とする。運営者のみへ厳密にアクセス限定することが必須なら、この方法を実施せず公開方式を再合意する。
- 元画像・完成画像・小さな添付ファイルを手元で保全し、テスト曲/機材/App名に固有prefixを付け、操作前後の件数と選択項目だけを記録する。Gear CSV/PNGは既存エクスポートとして使えるが、IndexedDBの画像・添付・秘密鍵まで復元できる完全Backupとは扱わない。
- 専用Accountは空から開始し、他人・既存個人データが見えたら直ちに中止する。既存データを扱わざるを得ない場合は、対応する既存Backup/Restoreの適用範囲を確認するまで開始しない。新Backup基盤は作らない。

## 5. 実受入手順（すべて未実施）

| 順 | 手順 | 合格条件・中止条件 |
|---|---|---|
| 1 既存Port基準 | 公開前に、承認済みの専用Chrome profileで現在のPort Standard/Proを開く。合成名称でGear/Practice/My Appsを登録・編集・保存・reload。Proは専用Account Aで既存Syncを確認。 | 正常保存・認証・同期の基準を記録。既存の個人datasetがあるなら続行しない。 |
| 2 同一ページ接続 | 候補公開後、新しい未接続profileのPortを開き、同じページでAccount Aを作成して保存。別profileは既存Aへ正規招待UIから参加。reload前後と初回Cloud受信を確認。Standardはローカル保存とAccount接続を確認し、Pro Syncを解放しない。 | 再読込を強要せず正常保存。受信後binary/cropが整合。 |
| 3 Studio入口 | 同じ本番originのStudioへ入り、正規ProとAccountで一度認証。未認証の別profileは拒否。 | 内部5ツール/4アプリで余分なPro入力なし。Pro表示フラグやURLだけでは入場できない。 |
| 4 UI/音声 | チューナーmic許可/拒否/再試行、メトロノーム・Practice timer、Gear/My Apps、NEWS記事/外部リンク、4アプリ主要操作。5テーマ、中央/右窓・幅変更、戻る/Home。 | 保存・操作が継続。非表示/閉鎖/Global Stopで音声停止。単独アプリの保存テーマ不変。 |
| 5 双方向 | 端末1 PortでAの機材を保存→端末2 Studio受信。Studio編集→Port受信。 | 正しい項目だけ往復し、重複・欠落・別Account採用なし。 |
| 6 画像 | Gear/My Appsで小さい元画像を追加→crop→保存→他端末受信→再編集→画像削除。 | 元/完成画像・参照・cropが一致。操作前の元ファイルは手元に残す。 |
| 7 添付 | Practiceに小さい合成PDF/画像等を追加・開く・他端末受信・削除。 | 対象添付だけ更新され、別の添付・メニューは残る。削除をR2物理purge済みとは判定しない。 |
| 8 CAS | 両端末で同じ専用テスト項目を編集し、明示同期で競合を起こす。 | 競合を表示し、利用者の明示選択で解決。黙った上書き・自動新operation化なし。 |
| 9 Offline | メトロノーム再生中にその端末をoffline→継続/ローカル編集→online→既存Sync。ブラウザの通信状態操作のみで行う。 | 既に検証済みの同一Sessionで正式猶予内だけ継続。初回未認証offline入場は拒否。未確定送信は既存状態表示を確認し、無理に再ID/破棄しない。commit後ACK喪失の厳密再現は合成E2Eで済んでおり、本番でproxy等を新設しない。 |
| 10 Account/失効 | Aの未保存Gear/画像/添付を保持して、専用Bへ正規UIで切替。A旧フォーム保存を試す。A pendingをBで送らないことを確認。専用Deviceだけを正式UIで解除し、正規再認証。 | Bで旧フォームを拒否し内容保持。正当な新B編集を妨げない。Aに戻ってもDevice/credentialが新規になった場合、古いフォームの自動再承認を要求しない。保存前に内容を控え、明示的な再編集で再開。全体generation/他利用者Deviceを変更しない。 |
| 11 Safari/実mic | Safariの新規専用profileで入口・画像/添付・保存/受信・中央右窓移動。Macの実mic/スピーカーでチューナー/音声lease/停止。 | 同期・IndexedDB・権限が維持。スマホ未実施なら別欄に残す。必要な対象ブラウザが失敗すれば公開判断を止める。 |
| 12 影響確認 | 既存Port/4アプリ単独タブの起動・保存・既存認証継続を確認。DevTools/画面保存は秘匿情報を除く。 | 他利用者データ、無関係な資格、既存テーマや初期値を変更しない。 |

各行は日時・端末/browser・候補SHA・PASS/FAIL/未実施・操作前後の安全な要約だけを記録する。トークンやAccount実IDを記録せずA/B/端末1/2の別名を用いる。予想外の混在、入力消失、誤削除、資格拒否、再送ループが一度でも出たらその場で受入を停止。新たな同期を増やさず、未保存内容を控え、該当profileを保持する。Cloud全体の復元や削除で症状を消さない。

## 6. 公開とフロントエンドrollback（別途承認後）

1. 公開直前にmain/PR153/Pages source/build SHAを再確認。固定mainから移動していたら無条件上書きしない。新しいmainの独立差分を照合して候補を再固定する。
2. 製品treeとmanifest34ファイル/Port差分をreview。現mainの`git archive`と実Jekyll出力、candidate出力・hashを秘密情報なしで手元保全。公開前復旧点は上記main、Pages build1331390387。これは**フロントエンドの復旧点**でありD1/R2 backupではない。
3. 承認したmain向けrelease PRの反映は一括で行い、上記legacy main/root Pagesが成功するのを確認。Worker、DB、R2、Pro設定、DNS、Pages sourceを変えない。実際の公開SHA/ファイルhash/Port1.24.24/Studio1.0.3を静的GETで確認する。
4. 開発URLとWorker URLの404、34ファイル、署名済みPro gate、専用Accountの試験1–12を確認。受入まで公開告知を保留する。現在のPagesには運営者限定ACLはないことを承認事項に含める。
5. 問題時はまず運営者のテストを止め、未保存入力・pendingを保持。Frontend rollbackは**新しいrevert/修正commitとPagesビルド**で行い、mainへのreset/force-pushは使わない。Cloudデータを巻き戻さない。
6. Studioだけの不具合なら、第一選択はStudio入口を利用停止の静的ページへ差し替え、正しいPortパッチとJekyll除外を残す小さい前向き修正（実施には別承認）。Port本体の保存/同期が悪化する場合だけ、対象Portファイルと関連cache参照を固定mainの完全な組へ戻す。manifestの変更44 Port製品パスを使い、混在versionを作らない。mainへ戻すと今回の画像hydrate修正・古いAccountフォーム拒否も外れるため、それらの保護まで維持できるrollbackとは扱わない。専用受入を停止し、内容を保持した上で最小の前向き修正と比較する。
7. release全体の単純revertは、現在mainにある古いStudio開発入口・公開Project JSを再露出するため通常手段にしない。必要ならStudio入口停止と開発ファイルのJekyll除外を残す復旧commitを独立worktreeで作り、同じJekyll/HTTP検証後に承認する。
8. 古いタブは配信rollbackだけで即座に停止しない。運営者profileは未保存内容を保護して既存Global Stop/更新を使う。全利用者のlocalStorage/IndexedDB、SW、セッションを一括削除・resetしない。rollbackしても、すでに正常確定したCloud変更を元に戻すことはできない。

これは手順書であり、入口停止ページやrevert commitを今作成・公開したものではない。初回公開への新Feature Flag/Freeze/Controlは追加しない。

## 7. リリース判定

| 分類 | 項目 |
|---|---|
| 公開前に必須 | 固定SHA/現main照合、限定差分review、34ファイル実ビルド/ライセンス/除外URL確認、実受入の専用データ・公開範囲・rollback担当の承認、混在・消失・誤上書きにつながる再現不具合がないこと。今回のコード/配信監査は完了、実施承認は未取得。 |
| 実Account限定受入で確認 | 手順1–12の正規資格/Account接続/二端末Sync/画像添付/CAS/offline/失効/現行Proの実動作、Mac/Safari/mic/既存クライアントとの共存。未実施でありProduction PASSと扱わない。 |
| 公開後に延期可能 | 譜面/Pre-DTM/Project SyncとBackend、公開4アプリのネイティブmidnight追加、Worker全面一本化・新cleanup・長期履歴拡張、新ACL/Canary基盤、Portテスト静的配信整理、今回の差分と無関係なテーマNode4件の整備。実受入で具体的不具合が出た場合はその問題を再分類する。 |

テーマNodeはmain・候補とも**22 PASS/4 FAIL**。3件はNEWS badgeの旧grid想定（現mainはalign-self/flex/nowrap）、1件は旧1.12 CSSハッシュ想定。対象CSS/testはmainとbyte一致。新規配色/レイアウト退行の証拠ではなく、独立した既存試験保守として管理する。根拠なくskip/緩和はしない。

今回の再実行は限定Node94 PASS、Browser9 PASS、main/候補テーマ比較、実Jekyll/HTTP。PR153の製品30/30×2・復旧12/12×2・Port全体Node証跡は同じ製品byteの履歴として参照し、今回再実行PASSに加算しない。独立した第二担当による監査は今回未実施。

## 8. 最短の次工程

1. このmain向けDraft、公開範囲・専用test Account/端末・フロントエンドrollbackを運営者が確認し、**現Portの実Account基準試験**と**候補のフロントエンド限定公開/実受入**をそれぞれ明示承認する。
2. 承認範囲だけで基準取得→候補公開→専用Account/2端末の手順1–12を実施。新Backendや資格回避を作らず、失敗は再現最小差分へ戻す。
3. 必須ケースが合格し、既存Portへの悪影響がなければ正式公開告知を別途承認する。公開の事実と合成試験だけで実受入を代替しない。

参照: [GitHub Pages公開方式](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)、[最新成功Pages run](https://github.com/soundcruise/apps/actions/runs/41271772802)、既存`ACCOUNT_CONNECT_FIRST_SYNC.md`、`RELEASE1_SYNC_MINIMAL.md`、`workers/sound-cruise-sync/PRO_AUTH_OPERATIONS.md`。この文書の最新判断は、以前の文書にあるv138完全artifactを一律の前提にした古いHOLD記載に優先する。証跡そのものは削除しない。
