# Midnight互換性候補 — HOLD / 公開・merge不可

2026-11-08 JST。再現・前後比較の基準main `4cfbea2cfee9d63e0e55690741cad0179cb54e0a`。
PR作成中にmainが進んだため、最終base `23b449dc5c7d13fbb9f966dd6323d0b1d3ae98df` へrebase。
対象5アプリ・既存Sync検証/保存モジュールの内容に重複変更はなく、mainに追加されたStudio/NEWS/報告機能はそのまま保持した。
**4件のうちB/C/Dの再現経路を修正。Aは未解消。安全な公開候補として完成していない。**
未解消のAの回帰テストは有効なまま失敗する。skip/todo化していない。

## 範囲・保全

引継ぎworktree `codex/midnight-compat-20261108` の13 tracked変更・新規試験・固定旧版fixtureを引き継いだ。
変更前のpatch・元の再現ログはリポジトリ外の `Cruise_apps_handoffs/midnight-20261108/` に保持。
実ユーザー情報は使用していない。試験はメモリstorageとNode SQLite `:memory:`、既存の合成Pro/Account fixtureのみ。
本番Worker更新・D1/R2操作・Pages公開・main mergeは行っていない。

Studio、Studio canary、sharedはソース・設定・アセット・テストを含め差分ゼロ。
Account/Pro/Owner/Projectの認可・保存契約、Workerのmigration/config/bindingsは変更していない。
Studioの既存Port配色を読み取り、そのtoken一式をPortのselectorへそのまま再利用した。
実機・ブラウザでのStandard/Pro全画面受入とStudioへの間接影響の受入は未完。差分ゼロだけで動作受入済みとはしない。

## A: 公開現行v1のMidnight送信・競合解決 — 未解消 / HOLD

旧4テーマ版と公開現行5テーマ版は、どちらも同じ `settings_theme_v1` を宣言する。
同じsnapshot要求だけから、Midnightを検証できるかどうかを判別できない。
現候補のDark投影は旧4テーマ版への未知値配信を防ぐが、現行v1の送信・解決意図と一致しない。

固定した現行v1実コードで、join後に初めてMidnightを送ると、3アプリともクラウド保存後に競合。
`/theme=local` の解決が `resolution_verify_failed`、続くremote選択が `stale_resolution`、再同期が `conflict_pending` となる。
`midnight-regressions.test.js` のAが修正前後とも失敗する。

試した案：Midnightを送ったそのpushのACKだけはMidnightで返す。
通常同期の競合は消えるが、その後のsnapshotがDarkなのでローカル表示がDarkへ戻る。
実際の同時変更競合でlocalを採用すると、snapshotによる検証は引き続き失敗する。
3アプリで同じ結果。`A-echo-ack-experiment.log` に記録し、この修正案は採用していない。
受信能力を送信値から恒久的に推定することも、同じ資格を使う旧タブへの配信を安全にはしない。

残る設計境界：稼働中の旧v1を透明に5テーマ同期させる保証は、現行要求の情報だけでは成立しない。
新しい能力を明示するクライアントへ更新する経路、旧v1のMidnight書込を**commit前に保留する**経路、
保留したoutbox/既存競合を更新後に検証して再開する経路を一体で設計する必要がある。
単なる拒否コード追加では旧outboxがterminalのまま残るため、それだけも採用していない。
このHOLDを解除せずにWorkerを先行公開しないこと。

## B: 旧4テーマ版の明示Light変更 — 再現経路修正

原因：Dark投影を見た旧版がLightを選択しても、非v2というだけで書込時にMidnightを保持していた。
ACKはDarkとなり、ローカルLightとの差分が毎回再送された。

修正：保存元のrevisionが一致し、旧版が読めるLight/Gray/Charcoalを送った場合は明示変更として採用する。
既存のCAS/hash/operation ID/retry処理を通す。削除・theme省略・Darkのechoは従来どおりMidnightを保護する。
既存Chord関数試験のLightに関する期待値はこの新しい仕様へ更新し、他のhash/identity/削除検査は維持した。

修正前は3アプリともLightが反映されずrevisionが3→4→5。修正後はLightが保存され、次の同期でrevisionが増えない。
非テーマ変更の保持・既存4テーマの往復・stale CAS・再送・v2削除の試験も維持。

原理的限界：旧版がDark投影を通常保存した場合と、その同じDarkを明示選択した場合は区別できない。
この同値ケースでは保存済みMidnightを保持する。Darkへの明示変更はv2で行う必要がある。
「Midnightを常に優先」する仕様ではなく、区別可能な3テーマへの変更は反映する。
Aの問題が残るため、B単独のPASSは公開承認ではない。

## C: Chordのcursor更新 — 再現経路修正

原因：cursorは閲覧したrevisionを示すだけで、どのテーマ投影を見たかを示さない。
Darkのshadowがある端末へv2宣言だけ追加しても、changesの先に新revisionがなければMidnightを取得しない。

修正：旧投影の可能性があるDark shadowに対し、同じcursorを保持して検証付きsnapshotからsettingsを再取得する。
他レコード・cursor・outboxは破棄しない。既存のlocal/shadow比較と競合処理を再利用。
shadowのrevision/hashを端末内metaへ記録するので、再起動後の不要なsnapshotを避け、
旧タブが再びshadowをDarkへ変えた場合も再検査する。
settingsの未送信操作・競合がある場合は `theme_view_upgrade_pending` として保留し、勝手に削除/送信しない。
再取得前後にpendingを確認する。hash/manifest不正時もcursor/ローカルを保持して再試行できる。

修正前：同期成功/applied 0のままDark。修正後：Midnightへ復元。
同じstore/cursor、再起動、旧投影への再変更、pending保持、不正manifest後の再試行を検証。
残るリスク：pending/競合がある端末のUI復帰と、実ブラウザ・実IndexedDBでの受入は未完。
その場合の自動強制マージは実装していない。

## D: Portのoverlay削除失敗 — 再現経路修正

原因：通常settingsをGrayへcommitしてからoverlay削除が失敗すると、残ったoverlayのbaseTheme=Lightが一致しなくなった。
「overlayのbytesが残る」だけではMidnightを復元できなかった。

修正：Portだけの `cruisePort.midnightTheme.pending.v1` に、変更前テーマと前後の基底テーマを先に保存。
通常settings/overlayを保存し終え、最後にpendingを削除した時点で成功とする。
失敗/中断時はpendingから以前の表示を復元する。失敗後の補償書込みが成功することには依存しない。
途中のpendingを通常のフォント保存で消さず、新しい明示選択で再試行できる。
各操作固有のjournal bytesも照合し、別タブの新しいjournalを後片付けで消さない。
Standard/Proの初期描画bootstrapにも同じ復元規則を適用。

修正前：保存失敗後にGrayへ変化。修正後：Midnightを復元。
通常storage/repositoryの双方で、base書込・overlay削除・pending削除の失敗と、その後の継続書込失敗を注入。
再起動、通常保存、明示再試行、journal自体の割当失敗も検証。
通常settings schema 3、repository/CAS、Port Sync adapterは維持。
overlay/pendingはPortだけのローカル選択で、dataset catalog/Cloud Sync/新しい共通保存機構には追加していない。
したがってPortのMidnightは端末ローカル、既存4テーマのsettings/global同期はそのまま。
旧版の同値選択と通常保存を区別できない限界は残る。実複数タブ/ブラウザ終了タイミングの受入も未完。

## 試験結果と実行

詳細は `results.json`。修正前の4回帰は4 FAIL。修正後はB/C/D PASS・A FAIL。
既存74件は削除せず維持し、追加のfault/validation/provenanceを含む83件がPASS。
旧版fixtureはsource.jsonのcommit/SHA-256で固定し、公開現行v1と旧4テーマ版を分けた。

| グループ | 結果 |
|---|---|
| 元74件＋追加の互換性・保存・validation・fixture試験 | 83 PASS |
| 4アプリのテーマ・3アダプタ | 84 PASS |
| Worker records/validation/database/app | 44 PASS |
| A/B/C/D回帰 | 3 PASS / Aのみ1 FAIL（HOLD） |
| Portテーマ | 21 PASS / mainと同じ5 FAIL |
| Chord全体 | 90 PASS / mainと同じ6 FAIL |

グループ間に重複があるので合算しない。Port既存5件とChord既存6件の名前はresults.jsonで基準mainと比較可能。
既存失敗はskip/緩和していない。theme能力・ローカルjournal・バージョンに直接関係する期待値のみ更新。

```sh
node --test workers/sound-cruise-sync/test/midnight-regressions.test.js
node --test workers/sound-cruise-sync/test/theme-field-gate.test.js workers/sound-cruise-sync/test/theme-writer-compat.test.js workers/sound-cruise-sync/test/theme-reader-first.test.js workers/sound-cruise-sync/test/midnight-compat.test.js workers/sound-cruise-sync/test/midnight-fixtures.test.js apps/cruise-port/midnight-compat.test.mjs apps/cruise-port/settings-store.test.mjs
node --test apps/pitch-cruise/theme.test.mjs apps/fretboard_cruise/theme.test.mjs apps/rhythm-cruise/tests/theme.test.js apps/chord-cruise/tests/theme.test.js apps/pitch-cruise/sync/pitch-sync-adapter.test.mjs apps/fretboard_cruise/sync/fretboard-sync-adapter.test.mjs apps/rhythm-cruise/sync/rhythm-sync-adapter.test.mjs
node --test workers/sound-cruise-sync/test/records.test.js workers/sound-cruise-sync/test/validation.test.js workers/sound-cruise-sync/test/sync-database.test.js workers/sound-cruise-sync/test/app.test.js
```

## バージョン・公開とrollback

未公開候補：Port 1.30.0（取得済み公開1.29.0を考慮）、Pitch 2.32.1、Fretboard 2.27.2、Rhythm/Chord 1.23.1、Worker source 0.1.6。
変更モジュールと起動HTMLのcache queryを更新。未更新の旧タブ/SWがある前提で固定旧版試験を行った。
前回の公開ファイル調査では4学習アプリにMidnightが存在した。未公開と断定せず、端末の旧タブ/HTTP cache/入口の差が残る。
今回、本番の再取得・更新操作は行っていない。cache query更新は既に開いているタブの更新を保証しない。

**現候補に安全な公開順序はまだない。HOLDのまま公開しない。**
将来の順序は、Aの旧v1送信・競合解決・再開の受入を満たした後に確定する。
Worker側の読取/入力互換性を準備し、v2クライアントとcacheを更新し、Standard/Pro/Studio実行時を確認する。
Worker先行でも、既存の現行v1が既にMidnightを送るためAを誘発する。クライアント先行だけでも未更新端末は残る。

Worker rollbackでは、保存済みMidnightの検証・投影・保持を落とさない候補を用意する。
このmain由来Worker全体を本番へ置き換えて、別ラインのAI/Account/Pro等の成果を落とす操作は禁止。
Port rollbackではoverlay/pendingを削除せず、少なくともpending復元readerを維持する。
新UIだけを戻す場合も保存済みpendingを無視する旧settings-storeへ丸ごと戻さない。
Chordはcursor/outbox/shadowを保持し、復帰時の再取得を再実行できることを確認する。
破壊的cleanupやmigrationで「巻き戻す」方法は採用しない。
