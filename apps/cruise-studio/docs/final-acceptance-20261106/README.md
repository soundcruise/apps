# 正式リリース前・最終一括受入

総合判定：**CONDITIONAL READY**。Safariの既存Account接続と再読み込み復帰は実機PASS。
残るSync表示の修正を本Draftで保全した。候補はStudio **0.84.2**、Portは**1.27.1のまま**。
基準main `4146ccdd3c5a7b9c210742810dbf34e8c5c4d17d`。本作業ではmerge/Pages公開/正式告知をしない。

## 実Safari・Chromeの結果（公開0.84.1/1.27.1）

- 旧資格は直前工程でCAS解除済み。今回は解除を再試行せず、Safariの未接続とPro有効を確認。
- Chromeの正常Accountは変更なし。接続前後ともsummary/devices 200。
- 前回409の実際のAPIはPOST `/v2/accounts/port-join-invitations`。
  当時のレスポンス本文・Invitation IDは保持されておらず、**過去のerror code自体は遡って確定できない**。
  画面上の利用可能なコードも残っていなかった。前回409から11分以上経過し、既存の5分TTLを超えていた。
- 期限経過後にPort単独の標準画面を保持して新規発行を**1回だけ**実行しHTTP201。
  そのコードをSafari標準UIで使用し、Chromeと同じ既存Accountへの接続を内部照合した。
  新Accountは作らず、秘密情報・Account ID・コード・本文は記録に含めない。
- Safariのsummary/devices 200、Device active、Pro有効。Account接続後のPort credentialは未発行。
  **Account接続PASSであって、Port/4アプリの同期開始・完了を新たに承認したものではない。**
- Homeへ正常移動→通常reload→再度Cruise Syncで同一Account・資格保持・Pro入場・正常表示を確認。
  旧削除Accountによる再ブロックなし。旧データの送信/統合には同意していない。

実機の詳細なhash比較receiptは非公開のローカル作業記録にのみ保持する。本repoへ実資格やそのhashを追加しない。

## localStorage・保存保護

今回の接続直前にキー別hashを取り、接続直後は**24件のまま、変更は` soundCruiseProAuth `のみ**。
Pro検証のキャッシュ/検証時刻を含む認証状態の正規更新に分類する。練習設定・プリセット等のキー変更/削除は観測なし。
Studio保存状態と比較対象の既存IDB12ストアは不変。Outbox/UNKNOWN、Projectは実機では前後0件。
reload後も資格・既存ストア・Studio保存状態が維持された。

最初の旧資格解除時は全体hashしか取得していなかったため、**その過去差分のキー別完全復元は不可**。
今回のPro関連変化と整合するが、当時もそれだけだったと断定しない。保存内容の書戻し・初期化はしない。
重大なデータ消失は確認されていない。非空UNKNOWN/Projectの保護は下記の隔離製品試験で確認する。

## 発見した製品問題と最小修正

### 1. コード表示iframeが背景化で失われ、Invitationだけがactiveに残る

Studioのnative Sync埋込は、ブラウザ切替のvisibilitychangeで通常stopしiframeを削除する。
追加コードのmodalも削除される一方、正規の「閉じる」callbackによるキャンセルは呼ばれず、
サーバーInvitationはactiveのまま残る。別画面での再発行は
**HTTP409 `port_join_already_active`**になる。

公開0.84.1を使った隔離WebKitで、標準UIで発行→公式GET状態active→背景化でiframe消失→
Port単独標準UIで再発行409という経路を立証した。[証拠](orphan-invitation-before.json)。
これは過去の実機409を生む合理的な製品経路だが、前述の通り過去応答本文の完全同定とは分ける。

修正：Syncでnative追加コード/既存Account接続のmodalが開いている間だけ、既存の
pause/preserve経路でiframeを保持する。コードを新たに永続化しない。ページ離脱・明示close・disposeは維持。
Server TTL・発行/使用/キャンセル・Account/Device認証は全て既存Port/Workerのまま。

### 2. 解除後に中断・再表示した通常接続が完了しても、旧iframeのowner holdが残る

実SafariではAccountは正常だが「前のAccountの入力を保持」が残った。Home→reloadで安全に復帰。
既存の完了監視は`pendingAccountRestart`直後に限って登録され、
中断後に通常の「既存のアカウントに接続」を開き直すと監視がなくなる。
公開版の隔離WebKitでも、正規解除→Home→Sync再表示→通常追加コード接続で再現し、
完了modalが閉じず待ちがtimeoutした。

修正：**Sync専用**の完了監視をそのdocumentのready時に登録し、
native接続確定ボタンの明示操作を追跡する。正常完了したSync documentだけを退役し、
既存のentryAuth再確認と期待Account一致を待って再生成する。observerはdispose時に切断。
他のProject/編集iframeに対するAccount owner hold、CAS、世代、帰属、保存ガードは変更しない。

実装の機能差分は`js/modules/library/port-surface.js`のみ。残りの製品差分は既存version/cache参照。
Port/shared/Worker/4アプリ/NEWS/保存schema/認証契約/Sync engine/Owner admissionは無変更。

## 検証と既存成果の再利用

|範囲|今回の結果|
|---|---|
|Chrome/WebKit native再スタート回帰|各12/12 PASS、pageerror 0。Port/Studio × deleting/deleted/invalid × create/connect。キャンセル、CAS解除、非空旧Outbox UNKNOWN、ローカル機材、Studio Project bytes保持、自動新Account送信なし|
|中断後の通常接続|Chrome/WebKit各1 PASS。完了後owner hold 0/inert false。[結果](handoff-after.json)|
|コード背景保持と正規状態取得/キャンセル|Chrome/WebKit各1 PASS。背景化でも同じコード・active状態を保持、正規close後cancelled|
|既存の譜面/PreDTM受入を隔離Chromeで再利用|編集・保存・再編集、undo/redo、JSON往復、MIDI、PDF、PreDTM Project/JSON/MIDI、schema1読取不変/明示schema2保存、5テーマ、1440/1024/768/390px PASS。[receipt](local-creation.json)|
|変更関連Node|247/247 PASS、skip 0。[ログ](related-node.log)|
|追加で拾った古いUI static検査|6 FAIL。公開mainでも同一6件で、退行なし。古いShell/テーマ/advanced metronome DOM期待。[比較](existing-node-failures.json)。期待値緩和/skipはしない|
|実Mac Safari|Pro/Home、Account接続/reload、4アプリ起動、全4アプリのMidnight投影（背景rgb(16,21,28)）、右ツール開閉、中央スクロール最終位置remaining 0/フッター到達、0.84.1表示を確認|
|既存合格を継承|チューナー/メトロノームの音声ライフサイクル、練習/カレンダー/機材/NEWS/My AppsのUI・単一scroll、Port/4アプリSync。今回、その機能/保存/音声実装は変更なし|
|物理デバイス|今回は実マイクの音程精度・スピーカー音・実iPhone UIを新規PASSにしない。運営者の既存Mac/iPhone Project双方向Sync PASSは、Owner/Cloud client契約不変の範囲で継承|

[合成結果](synthetic-results.json)。試験のAccount/コード/Project/Worker DBは隔離fixtureのみ。
`project-cloud.browser.mjs`の既存runnerとWorker fixtureを使用し、本番通信をinterceptする。
`STUDIO_DELETED_RESTART_ONLY=1`を基礎に、`STUDIO_SYNC_JOIN_INTERRUPTED=1`、
`STUDIO_INVITATION_VISIBILITY_ONLY=1`、`STUDIO_LOCAL_CREATION_ONLY=1`で各重点ケースを指定する。
旧版背景消失の再現だけは`STUDIO_EXPECT_CODE_LOSS=1`で旧0.84.1 artifactを指定した。
timeout/retry増量・ガード省略・本番Project書込みは行っていない。

配布181ファイルを既存packagerから生成し全hash一致。旧URL互換90資源は不変。
通常Studioの12資源が変更（lifecycle1資源とversion/cache）。[manifest](distribution.json)。

## Project CloudとProduction（読み取りのみ）

- 通常Studioへ既存client統合済み。schema2、Web Locks、raw revision CAS、帰属・UNKNOWN保持を維持。
  未接続でもローカル制作可能。Owner未許可write拒否の既存合格を再利用する。
- 現行Worker **v140 / e4abad3b-4b4d-4e73-bccb-1ec037ab5753**、100%配備を確認。
  mainの古いWorker sourceから再生成せず、既存#194固定canary正本/配備を維持する。
- D1 journal **33**、Project marker **studio_0001_rc4**、Owner activation **canary/revision2/対象2件**。
  SELECTの全応答はrows_written 0。一般開放なし。
- 正規Origin付きhealth/Pro policy 200。実Chrome/Safariのsummary/devicesも200。
- GitHub Pagesは公開main `4146ccdd…`でbuilt。PR207の配布197資源hash一致を再利用。
- 現行cronは**15 3 * * ***で登録GET200、observability有効。
  **2026-11-05 12:15 JSTのScheduled実行結果そのものは未確認**。手動実行はしない。
- D1 Time Travel bookmark取得可。既存の暗号化backup→隔離復元integrity/FK PASSを継承。
  本番restore/新export/R2コピーはしていない。復旧実行は別途承認が必要。

運用確認ではWrangler4.131.1のread-onlyコマンドとCloudflareのGET/読取APIを使用。
Worker/D1/R2の配備・更新・migration、Project/Outboxの移管・削除は行っていない。
cronの個別実行未確認や無関係なNEWS運用をStudioの新たなHOLD条件にはしない。

## 最短の残工程

1. 本Draftをレビューし、別途main統合・Pages公開を承認する（今回は実施しない）。
2. 公開後はSafariの既存の正常接続を維持して、Sync再表示・Home/reload・コード画面の保持を限定受入する。
   旧Account解除や新規接続をやり直す必要はない。追加コードの新規使用やデータ送信は必要時に別途判断する。
3. 実iPhoneの画面操作・実マイク/音声は、既存PASSで補えない範囲だけ運営者が確認する。

上記の小さなUI確認を終えれば正式リリースを推奨できる。
Project Cloud一般開放・将来の譜面/PreDTM拡張は今回のリリース条件に追加しない。
未公開0.84.2を実SafariでPASSしたとは報告しない。
