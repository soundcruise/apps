# Midnight互換性・段階的本番配備完了

2026-11-08 JST。入力head `30a67e1688663c2d77d1b825669e8432dfeac321`。本番Worker先行→受入PASS→4クライアント限定公開→iPhone最小受入→テストAccount/プロフィール削除を完了。Midnight新規選択は停止したまま。main merge・AI有効化・他ライン変更は行っていない。

## 配備対象と保全

開始/終了時main `b83a9119797429e00b14d82f81cec2dc6898e061`。開始Pages tree `9de564e955aa6581dfce8e87deff1c206dd1c8b0` は直前のStudio更新を含み、そのtreeを基準として保持した。

Worker v161の5モジュールを再取得し、前回基準と名前別SHA256一致を確認。既存保全方式のmultipart Script Upload APIで `production-v148.mjs` 内のテーマ許容値・sync-capabilities・旧v1 commit前保留の3箇所だけを更新した。このファイル名は旧名のままだが、内容は現行v161から保全したもの。AI/report/canary関連4モジュールはbyte一致。

最終Worker **v162**、Version ID `d0251d67-a342-4c60-a3ef-bcd909d43365`、Deployment ID `c3f20c69-bdee-46f9-a848-e0a24361eb85`、100%。配備後/終了時のGETで全5モジュールhash一致を確認した。

全70binding（secret binding19）、環境変数、互換日付等の機能設定は不変。配備メモannotationsだけを更新。cron `15 3 * * *` とtimestamp、workers.dev有効・preview無効も不変。STUDIO_CANARY_POLICY、Account/Pro/Device/Owner、report、AI基盤は保全した。health200、実AI endpoint `/v2/support/ask` はOFF404。直前の実候補bundleローカル試験19 PASSも再利用した。

## Worker段階の認証付き受入

iPhone iOS27.2、USB Web Inspector、新規Safariプロフィール `MIDNIGHT249`。最初のlocalStorageは今回のPro認証関連キーだけ、Account未接続、練習用DB attachments0件、Service Worker0件を確認。既存本人プロフィール/PWAは操作していない。Proの共通番号は本人が入力し、番号・資格・復旧コードは記録していない。

正式Account作成/接続コードAPIで今回専用Aを作成し、実Pro資格・実App資格・本番Worker・実IndexedDBで受入した。認証付きAccount読取りと初回Sync dataset readyを確認。

- 公開旧v1でDark/Charcoal/Gray/Lightの保存・反映が成功。
- v2のMidnight書込み/読取り成功、旧v1の表示はDark投影。保存値をDarkへ変換していない。
- 旧v1からの明示Light変更はCASを通って反映。
- 旧v1のMidnight操作はcommit前に `settings_theme_upgrade_required` で保留。クラウドは直前のLightのまま。実Outbox1件、Shadow/cursor維持を検証。

以上がPASSしてからPages更新を実施した。

## 4アプリの公開

公開commit **`b8d278c9eb60e7cb0bf0d734ea0fde85add30c98`**。既存Pages配信ブランチをfast-forwardした。mainは変更していない。

- 音感2.32.2
- 指板2.27.4
- リズム1.23.3
- コード1.23.4
- 共有runtime参照v37

製品19ファイルのみ、157追加/76削除。今回追加の製品実装修正はなし。固定候補にあった指板/リズムCSSと現行公開CSSの差分は持ち込まず、公開CSSを保全した。各アプリscript本体は版更新だけで、選択非表示/キーボード除外を保持。公開対象はclient-manifest.jsonの19ファイルであり、このPRの全treeをそのまま公開/mergeする指示ではない。後日のmain統合でも最新公開CSSを保全すること。既存4テーマ・保存済みMidnight復元も維持した。

Port1.30.5・Studio・NEWSは公開commitの差分ゼロ。共有runtimeの公開版との差分は対象3アプリのMidnight24行だけで、Port Shadow先行ACKを含む既存処理は不変。Port/StudioのPro入口HTMLのHTTP hashも公開前treeと一致。

Pages built、通常URLの製品hash **19/19**、HTML内の実際のversion付き参照hash **9/9** 一致。Chromiumの独立BrowserContextで4アプリStandard/Pro計8入口の版表示・Standard起動/Pro gate表示・pageerror0を確認。新規資格の発行をこのsmokeでは行っていない。Pro gate内の全機能を8画面とも再受入したとは扱わない。

## 公開後のiPhone最小受入

製品moduleを隔離Safariページで実行し、実IndexedDB/本番Workerを使った。Chordは公開製品のpairing UIを同じ隔離ページに一時mountして実button/radioを操作した。専用本番テストパスや新しい同期/認証基盤は作っていない。

1. v1の実Outboxをそのまま保持して公開v2 moduleをロード。同じoperation IDがクラウドのoperationIdと一致、Outbox0/競合0、Shadow/cloud payloadHash一致、Midnight保持。
2. 同じ保存領域の旧/新runtimeを順に同期。旧Dark投影後、新版でMidnightへ復元。クラウドrevisionは不変。
3. 指板・リズムの公開v2で初期同期成功、Midnight、Outbox0/競合0。
4. ローカル採用・項目別クラウド採用の両方で、Midnightを維持しOutbox0/競合0へ収束。settingsへのwhole-record remote指定は既存契約が拒否するため、製品UIと同じmerged/fieldChoicesを使用した。
5. Chordで旧Dark Shadow・既存cursor・Light保留operationの合成状態を構成。検証付き再取得で既存「要確認」UIへ接続。採用前のcursor/operationを保持。「同期内容を確認」→themeのクラウドMidnight→「選択内容で統合」→同期済み、Outbox0/競合0。
6. 正式APIでBを作成し実Account storageを切替。Aのguard付きruntimeは送信を拒否。Bの正式接続/空bootstrap後のクラウドは0件。AのOutboxは完全一致で保持され、Aへ戻した後の正規競合処理も成功。

試験準備中、legacy handoffのmembership状態拒否、内部operationの余分な管理フィールド、GETの不要なContent-Typeなどharness側の不適合を検出した。公開中の正式接続コードAPI・正規8 wireフィールド・通常GETヘッダーに合わせた。製品コード/認証/CORS/試験期待値は変更していない。

### 保証範囲

本番での旧→新は動的module更新、混在は同一ページの旧/新runtimeで確認した。iPhoneのPWA終了/再起動・実複数タブを今回再試験したとは主張しない。これらと旧保存済みresolution失敗からの復旧は、前工程の実Chromium/WebKit・実IDB **52 PASS** を再利用する。

Account試験は正式テストAccount API・実Account storageとguard付きruntimeの境界確認。Portの正式解除/復旧UI全体の再試験ではなく、既に受入済みのPort成果と配信差分ゼロを保全した。

## 後片付け・保持契約

Account A/Bは作成時hashと再照合し、正式delete intent/commit APIで削除。旧Account資格と旧App資格は410/account_deleting。API成功だけで完了扱いにせず、今回固有Deviceラベルで対象を限定したD1 SELECTでAccount hashを照合し、両Accountのstate=deleting・有効Account Device0・有効App Device0を確認。D1/R2への直接書込み/強制削除はしていない。

A: 合成クラウド6レコード（Chord2、音感/指板/リズム各1）。B:0レコード。既存7日保持契約で、Aは**11月15日18:28:55 JST以降**、Bは18:28:53以降purge対象。既存cronによる後続削除であり、物理削除済みではない。

専用Pro資格をローカルから解除、localStorage0。IndexedDB11個中9個は削除成功、2個は開いた接続でblocked。その後about:blankへ移動して接続/一時RAMを閉じ、OS設定から `MIDNIGHT249` プロフィール自体を削除。削除後に元の「個人用」「SYNC-P7-A」「SYNC-P7-B」だけが残る画面を確認した。OS削除後のDB物理ファイル再走査は行っていない。テストPWA・一時配信パスは今回作成せず、撤去対象なし。

本人Account・帰属不明12件は未操作。PR225/235/237、Studio/NEWSの変更なし。相談/AI推論は実行していない。新しい秘密情報/resource/DB/migrationも追加していない。

## 判定

**承認済みの段階的配備・最小本番受入・後片付けはPASS。** 今回の製品追加修正なし。Midnight再公開の最終承認判断へ進める。新規選択は非表示のまま、再開の実行は別承認が必要。main統合管理とUI再開の公開差分は独立工程として扱い、旧Worker全体へのrollbackや保留データ初期化は行わない。
