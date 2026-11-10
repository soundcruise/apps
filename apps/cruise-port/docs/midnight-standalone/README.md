# Port単独Midnight候補（未公開）

この記録は#241時点。公開済み1.29資産を統合した後続候補の最新判定は `../release130/README.md` を参照。

基準main: `49137e1bac58a65b7c52d15092aff42c3b6af5c6`。
作業中にmainが更新されたため、Portに重複変更がないことを確認し、最終base `a037421ae` へrebaseした。
移植元: PR #237 / `6766b40adf40a3390120981da05de9a4e6614e5c`。そのhead・内容は変更していない。

## 変更範囲

Portだけを変更。Standard/ProにMidnightを追加し、候補版1.30.0と関連cache queryを引き継ぐ。
`settings-store.js` のoverlay/pending journal、保存失敗・中断時の復元、明示選択と通常保存の区別、
Standard/Proの初回描画bootstrap、Studioの既存Port投影と同一のCSS token、回帰試験を#237から移植。
移植元で残っていた `pro-app-boot.js` 内の旧app import queryも1.30.0へ更新した。
旧版settings-store fixtureはPort内へ置き、Worker側の新規試験/fixtureへの依存は移植しない。

Studio/canary/shared/Worker/4学習アプリの製品コード・設定・アセット・テストは変更しない。
通常settings schema 3、既存repository/CAS、既存4テーマのsettings/global同期は変更しない。
Midnightのoverlayとpending journalはPortの端末ローカル専用で、dataset catalogやCloud Syncに追加しない。
PR #237のSync互換性問題Aとは独立している。

## 保存の安全性と限界

pending journalを通常settings/overlayより先に永続化し、両方の保存後、最後にpendingを除去して成功とする。
overlay削除や後続の書込みが失敗しても、以前のテーマを復元するための補償書込み成功に依存しない。
新しい明示選択で再試行でき、フォントだけの通常保存ではpendingを消さない。
plain storageと実repositoryの双方でbase/overlay/pendingの失敗・継続的な書込例外を試験した。

旧Portはoverlay/pendingを理解せず、既存4テーマの基底を表示する。旧タブの文字サイズ保存では新PortのMidnightを保持する。
旧タブが別の基底テーマへ明示変更した場合はその変更を優先する。
「基底と同じテーマの明示選択」と「通常保存」は観測上区別できないため、同値の場合はMidnightを保持する。
旧タブが別テーマへ変えてから基底へ戻り、その途中を新タブが読まなかった場合も、途中の意図は判定できない。
失敗したpendingを知らない旧版への完全rollbackは同じ表示を保証しないため、復元readerとローカルキーを維持する。

## 実ブラウザ検証

既存Playwright + インストール済みGoogle Chrome、390×844、実際のPort HTML/module/UIを使用。
ローカルHTTP fixture以外の通信は遮断。実ユーザーデータ・本番Account/Pro/Syncは使用していない。

**18チェックPASS / page error 0。** `browser-results.json` とStandard/Proの画像を参照。

- Standard/Proそれぞれ5テーマを実ボタンで選択→保存→reload後復元。
- 文字サイズ/表示サイズを維持。6種類の非settingsデータのraw値と無関係な保存値が不変。
- Midnight選択前に開いた旧mainの実タブで、文字サイズだけ保存→新タブでMidnight復元。
- 旧タブの明示Grayを新タブへ反映。
- 実Storageのoverlay削除を失敗させ、reload後にMidnightを復元→明示再試行でGrayを保存。
- passthrough型の合成Service Workerが制御する状態でも選択・復元。
- 新しいbrowser contextへ保存状態を引き継ぎ、再起動相当の復元を確認。
- 未変更のStudio `port-frame-theme.js` を実行し、実Port iframeの5テーマ連動とMidnight背景を確認。

ProテーマUIは**合成資格fixture**（テスト配信時だけgate scriptを代替）で確認した。
別チェックでは未変更の実gateをロードし、未認証時に閉じることを確認した。
本番の資格検証・device session・Account/Studio全体の入場受入を行ったという意味ではない。
Studioは投影moduleの実行試験であり、Studio全体の認証済みshellを使ったE2Eではない。

Port自身にはSW登録がない。合成passthrough SWと旧タブ混在を確認したが、任意の古いcache-first SWや
古いHTMLを強制更新できる保証はない。新cache queryが有効になるには新しい起動HTMLが必要。
旧タブ/旧版表示が残る場合の更新案内が必要であり、他アプリのSW/cacheは消さない。

```sh
node --test apps/cruise-port/settings-store.test.mjs apps/cruise-port/midnight-compat.test.mjs apps/cruise-port/home-display.test.mjs
node --test apps/cruise-port/theme.test.mjs
node apps/cruise-port/tests/midnight.browser.mjs
```

ブラウザのパスは `PLAYWRIGHT_MODULE` / `CHROME_EXECUTABLE` で上書き可能。
単体・保存・表示試験37 PASS。テーマ試験21 PASS / 既存5 FAIL。
既存5件はCSS/Dark hash/NEWS構造検査で、mainにも存在する。同じPortが前回の基準4cfbea2cから変更されていないことを確認した。
失敗をskip/緩和せず、そのまま記録した。関連する新しい回帰試験はすべてPASS。

## 公開判定・公開前確認

**コード依存としてPort単独で切り離せる。検証した保存・表示経路は合格。公開判定は条件付き保留。**
保存不整合Aを含む#237やWorkerの公開を前提にしない。
公開前には実iPhone/SafariとAndroid、実Pro sessionでの起動、実Studio内の認証済みPort表示を確認すること。
通常版/Pro版HTML、style、settings、practice app、Pro bootを一組として公開する。
旧HTMLを参照する端末への更新案内も確認する。今回の作業では公開しない。

rollback時はpending復元readerを維持し、overlay/pendingキーを削除しない。
UIだけ戻す場合でもsettings-store全体を未知キー非対応の旧版へ戻さない。
Cloud Sync側やWorkerのrollback/更新はこのPRには不要。
main merge、Pages公開、本番Worker・D1・R2操作は行っていない。
