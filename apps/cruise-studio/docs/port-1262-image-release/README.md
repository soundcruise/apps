# Port 1.26.2 — 画像パッチ単独公開候補

**単独公開候補として合成受入PASS。main merge・Pages公開は別途明示承認。**

最新main `c862e590ead36f41e39574997bf34517120e51dd`から独立branch
`codex/port-1262-image-release`を作成。
#190固定head `2cfce456722c5f7c6a873ca10d67ec089b240821`、client-only
`f118eb91fb1ef2e1c742075562705c9cf201d224`は変更しない。
同commitをそのままcherry-pickし、初期抽出のstable patch-id
`b5b7c82bc45694fb6efb64b35f1a562d9f91c54b`が一致することを確認した。
その後は試験fixture・検証記録だけを追加調整し、製品実装を増やしていない。

## 製品差分

- Port Asset Syncに37行、controllerに3行。正規のAccount/AppDevice取得後、初回migrationの
  bootstrap前だけ、明示承認済みの画像参照を既存backup/uploadPair/repository CASで準備する。
- 現Accountでアクセスできる画像はそのまま。404の旧参照は、端末に本体がある場合のみ、
  明示承認されたローカル画像を新Accountの新IDで登録する。
- 参加・表示更新だけで画像を送信しない。旧Accountの画像取得・再利用・削除・unreferenceはしない。
  元のOutboxとローカル画像を保持する。
- Offline/503/資格変更/本体欠落/別編集を指すpending/backup失敗では安全停止。
  pendingの勝手な破棄・置換や新しいAccount正本は追加しない。
- Port 1.26.2の版と変更moduleのcache keyを更新。変更していないmoduleのkeyは保持する。
- Studio製品側はPort版readerのimport query1行のみ更新。Studioは公開版**0.74.1**を維持する。
- Worker・D1・R2・Account API・Owner・DDL・shared・4アプリ・NEWS製品コードはmainと不変。
  #186〜#190のProject Cloud/Worker候補を取り込まない。

## 合成受入

既存Port/Studio製品E2E、使い捨てChrome、ローカルMiniflare/D1/R2を再利用。
Workerは将来の#189候補ではなく、前工程で読み取り保全した**稼働v138 artifact**を隔離実行した。
SHA256 `de6b6fbd2f759fdc55a32662e10d224e11d876672405b604944270387cc19b15`。
同artifactはGit `21d76600c5abcfd752a1564f7e8262815086c443`からの再buildと
source-map末尾コメント以外byte一致した既存証拠を利用する。artifact本体をrepoへ複製しない。
Account/Proの登録・challengeは既存の合成fixture、データ/Asset APIはv138を通す。
実Account受入・Production操作のPASSではない。

- 製品E2E **52/52**、page error0。Port単独/Studio正式入口、4アプリCloud受信・保存・更新、
  Account/Pro/Device失効、5ツール・カレンダー・NEWS・5テーマ等の既存回帰。
- 強化した代表Assetケース **1/1**。
  Aの画像source/finalを実製品UIから保存。実編集からA Outboxを1件作成し旧runtimeをpause。
  正規Account解除→Bへ正規参加後、送信・統合の既存確認を明示承認。
  参加だけではB push0、B Outbox空。承認後は同期済み・B Gear1件。
  A Outbox内容一致、A Asset2件保持・R2バイナリhash不変。
  Bには別のAsset IDが2件作られ、画像hashは承認されたローカル本体と一致。
  AのAsset IDはBへ流用されない。
- 画像/添付/ACK/CAS・競合解決復旧 **12/12**。
- 関連Node **125/125**。
- Port全Node **1250PASS / 5FAIL / 1255件**。5件は同じmainでも再現済みのtheme4件と
  SP2 shared-runtime cache期待値1件。製品CSS/shared runtimeを変更しておらず、新規失敗ではない。
- 実Jekyll safe build：Studio **81ファイル/hash一致**、native配布813ファイルは本checkoutとbyte一致。
  Studio Project API要求0、Cloud/developmentファイルは公開物に存在しない。
  Project DDLなしでも製品E2Eが動作する。

今回の限定fixture調整：

- 保全済みv138の正確なhashを既存pin許可リストへ追加。旧v137のpinも保持し、未知bundleは拒否する。
- 代表ケースの保存完了を実カード表示で待ってからOutboxを取得し、空Outboxの比較だけにならないよう補強。
- 復旧suiteは最初11件通過後、Studioが同じ問題の自動再表示を抑止する場合の待機で停止した。
  もともと存在した手動の「競合を確認する」fallbackを待機前へ置き、正規UIから解決まで確認した。
  timeout延長、期待値緩和、試験skip、製品の競合UI変更はない。

## 配布境界と次の操作

`_config.yml`、Studio allowlist、Project Cloud起動経路はmainと不変。
譜面/PreDTMの現在のローカル制作機能を維持し、Project Cloud Syncは無効・非公開のまま。
この検証記録は既存の`apps/cruise-studio/docs`除外の内側に置き、公開81ファイルへ追加しない。
新しいWorker/schema/API/保存キー/Syncエンジンは0。

本候補の最終差分確認後、別途承認された場合だけこの単独PRをmainへ統合・Pages公開する。
#186〜#190を先にmergeする必要はない。Backend配備・DDL・Project Owner有効化は行わない。
公開後はPort 1.26.2と新moduleの配信を確認し、運営者が通常保存・既存同期を限定受入する。
実AccountのA→B移行を本工程の確認目的で実行しない。
