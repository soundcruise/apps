# Cruise Sync UX 第1段階 — Claude Code監査用

## 結論と対象

Port **1.31.0**の未公開候補。1.30.7への独立監査で採用された指摘A/B/Cを反映済み。
修正対象はPortの表示・画面遷移と、そのcache参照だけ。
**本人の3アプリの未送信変更・競合が解消した、という結論ではない。**
本番配備、本人データ変更、同期開始・解決、Account変更、D1/R2書込みは実施していない。

- 第1段階開始時main: `b83a9119797429e00b14d82f81cec2dc6898e061`。
- 監査反映開始時の最新main: `2902dff47db58db41309058bcd42ca6fb6f29d87`。別ラインの変更を取り込まず保全。
- 実際のPages source: `codex/port-1.28.0-release-20261106`、公開tree `1893ed06b2466779ac2d8c2a6730a000db6227b6`。
- この公開treeを基準に独立ブランチを作成。古いmain全体やPR #225/#235/#237/#249は取り込まない。
- HTTPで公開Port 1.30.6の版・通常/Pro入口・同期UIと、4アプリの主要JSが公開treeとbyte一致することを確認。
- Worker v162、version `d0251d67-a342-4c60-a3ef-bcd909d43365`、100%、AI OFFを管理APIのGETで確認。
- PRのbaseは上記Pages source。**mainへの直接統合・公開の承認ではない。** 後続統合は本差分だけを現行公開成果に適用する。

## 現象の確定範囲

本人Accountを以前の正式復旧記録から特定し、そのAccountのmembership/device報告だけをSELECTした。
資格値・Account ID・データ本文・端末名はこの資料に記録しない。

| アプリ | 有効な同期先 | 問題として集計された報告 | 同じAccount内の別同期先 |
| --- | ---: | --- | --- |
| 音感 | 7 | attention、attentionCount=0 | より新しいclean報告あり |
| 指板 | 8 | attention、attentionCount=0 | より新しいclean報告あり。さらに古いpendingもあり |
| リズム | 8 | attention、attentionCount=0 | より新しいclean報告あり |
| コード | 7 | 有効同期先はすべてclean | 問題報告なし |

これは現在のOutbox読取りではなく、同期先ごとの**前回報告**。
Workerは、有効な同期先のどれかにattention/errorがあればmembershipをattentionとして返す。
別同期先の新しいcleanで、前の同期先の報告を消す契約ではない。
根拠: `workers/sound-cruise-sync/src/account-database.js:139`、`account-lifecycle-database.js:601`。

`attentionCount=0`も正常の証明にはならない。共有runtimeの報告数は競合件数であり、
terminal Outbox等でもattentionになり得る。根拠: `apps/shared/sync-account/multi-app-sync-runtime.js:515,2089`。
今回の3件がterminal Outboxなのか、すでに解消した古い報告なのかは未確定。

USB接続後もSafariに検査可能なコンテンツがなく、本人アプリは新規起動・更新しなかった。
したがって現在の問題同期先のOutbox・競合・Shadow、端末/PWAとの対応は未観測。
「開いたアプリが同期済み」には別同期先を開いた可能性があるが、その個別対応までは確定していない。

## 勝手に開く原因と1.30.7までの修正（履歴）

旧コードの確定経路:
`renderSyncCenter → renderAttentionGuidance → getAttentionGuide().open(automatic=true)`
`→ onResolveApp → resolveApp → location.assign(アプリPro URL + sync-review=1)`。
描画・再確認が、利用者のクリックなしに画面遷移を起こしていた。
session内の既読管理があっても、別アプリ/別issueでは再発する。

1. この自動呼出ループを削除。描画は表示だけにする。
2. 行の「解決方法を確認」を「アプリを開く」へ変更。明示クリック時だけ既存の遷移を実行。
3. summary/device応答が不一致の行は「もう一度確認」。既存のPort内読取り再確認へ進め、アプリへ遷移しない。
4. ready membershipの問題報告は「前回報告に確認事項」と表示。真のmembership異常・Port自身の競合は別表示を維持。
5. 詳細に報告時点とリンクの範囲を明記。アプリリンクは報告元の端末・ブラウザを指定できない。
6. 全体の件数を「確認事項のあるアプリ N件」に整理。現在のローカル競合総数として扱わない。

コード: `sync-center-ui.js:324,341,698,1490`、`sync-center-controller.js:24,45`、
`sync-center-device-detail.js:35,154`、`practice-menu-app.js:4441`（すべてPort配下）。

## 自動解決と利用者判断の境界

| 状態 | 第1段階での扱い |
| --- | --- |
| 一時的な通信失敗・ACK応答喪失・自分の送信済み操作 | 既存runtimeの再試行・同一operation・own echoを維持。追加の確認操作なし |
| summary/deviceの応答時点不一致 | 既存の自動再取得1回、復帰時再確認を維持。それでも不一致ならPort内再確認 |
| 同じ同期先が後にcleanを報告 | 既存の読取りで表示を更新。別同期先のattentionは勝手に消さない |
| Portのローカル/クラウドが既に一致した残存競合 | 既存の一致確認付き自動解消を維持。4アプリ全般へ拡張したとは主張しない |
| ローカル/クラウド双方が異なる真の競合 | 既存のローカル/クラウド採用、CAS・送信・検証。失敗時は未解決を維持 |
| 未送信変更なしを確認したクラウド復旧 | 既存復旧契約を利用可能だが、今回の報告だけでは前提を証明できず未実行 |
| 帰属不明・別Account・資格失効・Midnight保留操作 | 既存の保護を維持。自動帰属・Outbox破棄・投影値での上書きをしない |

根拠: `sync-center-refresh.js:1,62`、共有runtime `:515,1530,2089`、
同runtimeテスト `:1893,1911,1939,2914,3006,3322,3350,3771,3775`。
Portは他の保存領域のローカル競合内容を取得していないため、ここから勝手に採用側を決定しない。

## 1.30.7までの複雑性・他ラインへの影響（履歴）

- 削除: 描画時の自動遷移ループ、遷移用issue fingerprint生成、未使用のPort自動focus/競合open callback。
- 追加: 同じ`attention`状態に使う表示定数1個、短い説明、既存callbackのクリック分岐。
- 新しい状態enum・永続フラグ・DB・schema・保存形式・同期プロトコル: **0**。
- `sync-attention-ui.mjs`自体はStudio/各アプリ利用のため変更しない。Portだけ依存を外す。
- tunerはversion importのcache参照だけ更新。音声処理は不変更。
- 製品11ファイルで37行追加・40行削除（差引3行減）。別に関連試験と本監査資料を追加・更新。
- Worker、共有runtime/adapter、認証、練習保存、他4アプリ、Studio、NEWSの差分ゼロ。
- 以前復旧済みの本人12件は読み書きせず、今回の調査・試験へコピーしていない。

## 1.30.7までの検証と限界（履歴）

- 修正前: 既存表示関連115件PASS。ただし実DOMブラウザ再現は、描画直後に`pitch`が開くためFAIL。
- 修正後: 表示・controller・読取り再確認・navigation・Pro gate・version/cacheの関連Node **184/184 PASS**。
- 既存共有runtimeの通信回復、応答喪失、競合、一致時だけの解消、別Account拒否など選択した **11/11 PASS**。
- Chromium / 実DOM / 実IndexedDB / localStorage: 通常/Proで **50チェックPASS**。
  自動遷移なし、明示クリック、Port内再確認、複数同期先、offline、Port競合、再読み込み、320/393幅を確認。
  これはUI隔離試験であり、本人Account切替や実同期のE2E試験ではない。
- 追加確認した旧テスト群は **25 PASS / 8 FAIL**。8件は未変更公開treeでも同じ失敗:
  `module-cache-keys.test.mjs`の1.28.0等の固定期待値5件、
  `sync-center-orchestrator.test.mjs`の`port_sync_pending`対`port_sync_unavailable`3件。
  期待値を緩めず残した。変更対象のcache伝播は別の`sync-center-release.test.mjs`で検証。
- 未変更treeでさらに失敗していた`app-version.test.mjs`の旧版期待値は、今回の版更新対象として1.30.7へ更新。
- 新候補のiPhone/WebKit実機、報告元の実Outbox、実ユーザーの競合解決は未受入。

再現手順:
`node --test apps/cruise-port/sync-status-*.test.mjs apps/cruise-port/sync-center-release.test.mjs`
（その他の184件の対象はPR説明に列挙）。ブラウザは既存Playwright利用環境で
`node apps/cruise-port/tests/sync-center-ux-browser.cjs`。
Chromeを利用し、全外部通信を遮断。合成データだけを一時browser contextへ保存し終了時に破棄する。

## 独立監査反映 — 1.31.0

### アプリ誘導と同期先詳細

- `sync-center-device-detail.js::canOpenReportedApp`で既存の`isCurrent`と報告だけを利用。
  認証済みの現在Portとの接続関係であり、端末名・報告時刻から環境を推測しない。
- readyな情報でsummary/device応答が一致し、現在環境に結び付く同期先が**1つだけ**、
  かつattention/errorの報告元がすべてそこに一致するときだけ「アプリを開く」。
  報告元ID・報告時刻の欠落や、複数の現在同期先も不確定として扱う。
- 別環境・不明・複数環境の問題報告は「同期先を確認」。既存の詳細パネルを開き、
  既存の同期先タブの`aria-expanded`も更新する。新しい画面・保存状態を作らない。
- snapshot不一致は従来どおり「もう一度確認」で読取り再取得のみ。アプリを開かない。
- すべて利用者の明示クリックによる。1.30.7で削除した描画時の自動遷移は戻していない。
- 最終報告時刻・報告状態・追加時刻を別行で表示。報告時刻未取得は明記し、最終アクセス時刻で代用しない。
- 詳細に「使っていない同期先は各同期先の『解除』で外せる」ことと、保存データが残ること、
  未同期の変更は先に対象アプリで確認することを説明。古い報告を理由に自動解除しない。
  既存の同期先IDに対する確認画面・キャンセル・確定の契約は変更していない。

### 整理・保全・今回の検証

- `syncAttentionItems`の未使用`count`・`port`属性を削除。件数は従来どおり対象アプリ数だけ。
- 版と変更モジュールのcache伝播を1.31.0へ統一。tunerはversion import参照だけで音声処理は不変更。
- 1.30.7からの製品差分: **10ファイル、46行追加・26行削除**（差引20行）。
  新しい永続フラグ・DB・schema・保存形式・認証方式は**0**。純粋な表示判定と既存DOM参照だけ。
- 変更経路のNode **185/185 PASS**。現在/別/不明/複数/情報不足の報告、読み取り再確認、Pro gate、cache伝播を含む。
- Chromium・WebKitそれぞれ**106チェックPASS**。実DOM・実IndexedDB・localStorage、通常/Pro、
  320/393px、再描画/再読み込み、自動遷移なし、明示クリック時だけの環境別案内を検証。
  解除も実際の確認UIで、表示だけ・キャンセルは呼出0、明示確定だけ合成callback1回を確認。
  外部通信は遮断し、本人Accountやサーバーの解除は行っていない。
- Worker・共有runtime・Account/保存契約・他4アプリ・Studio・NEWSは公開treeから差分ゼロ。
  同期・Midnightの大規模試験は繰り返していない。上記履歴の既存8件FAILも別問題のまま維持。
- 本番Port1.30.6、Worker v162/100%/AI OFFを読み取り確認。本人データは読み書きしていない。

ブラウザ再現は前記スクリプトで、`SYNC_UX_BROWSER=webkit`を指定するとWebKitを使う。
新候補のiPhone実機・本人の問題同期先の実Outboxは未確認であり、このUI試験のPASSと混同しない。

**1.31.0の限定公開候補はPASS。今回の追加実装残件はない。** 本番公開は別途承認待ち。
本人3件の実データ調査やterminal Outbox整理などは、今回の候補に追加しない。

## 監査時の確認点 / 独立した残件

1. 描画・復帰・再確認から無操作で別アプリを開く経路が残っていないか。
2. 前回報告を現在の未送信変更と誤認する表示、または異なる同期先のcleanで問題を隠す分岐がないか。
3. 読取り再確認が同期再開/競合採用にすり替わっていないか。既存の削除・帰属安全条件が不変更か。
4. 新しい永続状態を増やさず既存callbackだけで整理できているか。

UI限定修正はレビュー候補として完成。公開には別途承認が必要。
3件の自動解消まで判断するには、**問題報告の同じ同期先**について、現在のOutbox件数・terminal code・
競合件数・最終成功/報告時刻だけを読み取り比較する。payload本文や新しい観測保存層は不要。
現時点でクラウド強制復旧・報告期限切れ・競合契約変更を追加する根拠はない。
