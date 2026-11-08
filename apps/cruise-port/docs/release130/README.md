# Port 1.30.0公開準備候補 — HOLD / 未公開

2026-11-08 JST。main基準32f357ab1。#241固定head 0feac523と#237は変更しない。
このブランチは「公開済み1.29.0資産＋レビュー済みMidnight差分」を構成する別候補。
mainのPort全体を本番へ上書きする候補ではない。

## 公開配信との監査・保持

通常/Pro HTMLから静的JS/CSS/HTML/JSONの依存を追い、cache回避付きの読み取りGETで208応答を監査。
206成功応答はすべて保存済み公開コミット3af2a557のbytesと一致した。
2件はJS等の文字列をファイル相対で解決して抽出した候補URL（shared/privacy.html）で404。
実ブラウザが要求した依存の404を意味するものではない。画像等と計算された動的URLを網羅した監査ではない。
全記録はpublic-audit.json。資格・個人データ・Worker APIは取得していない。

main由来の#241から失われる可能性があったのは、AI相談のAccount日/月上限・全体予算・context上限の区分表示、
利用枠更新時刻、UIの上限説明、privacy/terms、およびAI/tunerのcache query。
AI client/UIと利用方針は公開版のbytesをそのまま保持し、practice appのAI importも1.29.0へ揃えた。
tunerは公開版を保持し、app-version importだけ1.30.0へ整合した。

Pro認証・Account・Cruise Sync、NEWS、練習・機材・ツールの既存製品コードは公開コミットを維持。
Stage bundle内の、監査成功応答に含まれる非overlay依存は公開SHA-256と一致することを検証した。
shared/Studio/canary/Worker/他4アプリは変更しない。

## 候補の生成と反映対象

```sh
python3 apps/cruise-port/scripts/package-midnight-candidate.py --out /private/tmp/port130-new-bundle
```

新しいリポジトリ外ディレクトリが必要。3af2a557のPort製品資産を取り出し、次の8ファイルだけを重ねる。

`index.html`, `pro_9a3943176561/index.html`, `app-version.js`, `practice-menu-app.js`,
`pro-app-boot.js`, `settings-store.js`, `style.css`, `tuner-app.js`。

PORT-RELEASE-MANIFEST.jsonに全ファイルの出典とSHA-256を保存する。deployApproved=false。
tests/docs/scripts、shared、Studio、Workerはパッケージに含めず、既存の依存資産を維持する。
公開済みAI/法務資産と作業ツリーの一致も生成時に確認する。
元#241のoverlay/pending journalと保存契約は維持。新しいSync機能は作らない。

## 追加試験

- AI相談・Midnight保存・settings：64 PASS / 0 FAIL。合成応答・メモリstorageのみ、AI推論は実行しない。
- 統合後Chrome：19チェックPASS / page error 0。
  Pro AI上限説明の実DOM、Pro起動、5テーマ、旧タブ、失敗復元、Studio投影を確認。
  以前のWebKit/Android36チェックは再実行せず、今回変更した依存グラフの統合確認に限定した。
- Pro UIは合成資格。別に実gateが未認証で閉じることを確認。本番資格の検証ではない。
- localhostプレビューが候補HTMLを配信し、CSPで本番API通信を遮断することを確認。

監査スクリプト/取得bytes/生成済みbundle/ブラウザ実行ログは作業環境の
`/private/tmp/port-release-audit/` と `/private/tmp/port130-reviewed-bundle/` に保持。

## 実機で確認する方法（外部公開しない）

まず新規のプライベートな検証ブラウザを使い、実Account・実ユーザーデータを持ち込まない。

```sh
python3 apps/cruise-port/scripts/preview-midnight.py --bundle /private/tmp/port130-reviewed-bundle
```

デフォルトは127.0.0.1:18741のみにbindする。通常版URLは
`http://127.0.0.1:18741/apps/cruise-port/`。
Androidはユーザー管理のADB/USBデバッグ環境で `adb reverse tcp:18741 tcp:18741` を実行し、
端末Chromeから同じlocalhost URLを開く。ADB未導入・端末承認未実施ならユーザー側で準備が必要。

iPhoneは同じ私設LAN上で、端末が信頼する証明書と対応ホスト名を用意する必要がある。
準備済みの証明書をユーザーが指定して、次のように起動できる。

```sh
python3 apps/cruise-port/scripts/preview-midnight.py --bundle /private/tmp/port130-reviewed-bundle --host 0.0.0.0 --cert /path/to/cert.pem --key /path/to/key.pem
```

LAN向けHTTP起動は拒否する。証明書インストール・ルーター開放・公開トンネル・DNS変更は行っていない。
HTTPS/端末の信頼・LAN到達性がない場合、iPhone実機検証は未準備でありPASSとしない。

**プレビューは本番API通信をCSPで遮断する。実Pro/Account情報を入力しないこと。**
Pro認証後の確認用環境ではなく、通常版の実機テーマ/保存確認と、未認証Pro表示までが対象。
保存キーを読むテレメトリや入力記録は設置しない。serverのrequest logも無効。

実Proと認証済みStudio shellには、既存backendが許可する検証origin・信頼できるHTTPS・
既存gate/device sessionとの整合が必要。そのorigin許可は今回確認/変更していない。
候補は/apps/cruise-port/の相対位置を維持し、Studio/sharedは既存コードを読み取り配信する必要がある。
実資格を入力する場合は、別途承認された環境でユーザー本人だけが操作し、Codexのブラウザ制御・画面取得を停止する。
実Accountデータ利用は禁止のままなので、実Studio入場に必要なAccount条件は別途整理が必要。
今回、認証済みStudio shell、実iPhone、実Android、実Proは未検証。

端末ではMidnight→reload→ブラウザ終了/再起動→既存4テーマ→文字/表示サイズ保持を確認し、
旧画面を残したまま新画面の選択が壊れないことを確認する。キーやpending journalは削除しない。

## 公開・rollback

最終判定HOLD。コード上の公開済み機能欠落は監査・統合で解消したが、実端末・実資格・
認証済みStudio shellの受入と、公開時点の配信ハッシュ再照合が未完。

公開承認後、公開元が監査対象から変わっていないことを再確認し、manifestを検証してから
8 overlay資産を一組で反映する。配信済み1.29の非overlay資産・共有資産を削除しない。
mainの全ツリーを配備せず、#237やWorkerの公開とも連動させない。
旧HTML/cache-first SWを強制更新できる保証はないため、ユーザー向け再読込案内を確認する。

rollbackでもpending復元readerとoverlay/pendingキーを保持する。旧版settings-storeへ丸戻ししない。
AI/NEWS/認証/Sync資産を巻き戻さず、Midnight UIだけ戻す互換候補を準備する必要がある。
データの消去やschema migrationによる巻き戻しはしない。
本番公開、main merge、Worker/D1/R2操作は一切行っていない。
