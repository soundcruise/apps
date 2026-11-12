# Midnight問題A: 更新後に収束する互換性候補

**更新:実ブラウザ52件PASS・v161統合候補準備PASS。本番配備/実機/選択再開は未実施。** [実ブラウザと統合準備の記録](browser/README.md)。Chord候補は保留レビュー接続の限定修正により1.23.4。以下は初回ローカル候補の記録。

2026-11-08 JST。最新main fed3985f5上の独立Draft。PR237全体は移植しない。元PR237 head6766b40a、公開Port1.30.5/10449b7d、Worker v161/d278abbd-6989-44ab-a9bf-f7539dc0c8d9/AI OFFを読み取り確認した。本番変更・利用者データ操作・有料推論なし。

## 原因と境界

旧4テーマ版と公開5テーマ版が同じsettings_theme_v1を宣言するため、同じ要求から受信能力を識別できない。v1のMidnightをcommitしてACK/snapshotだけDarkへ投影すると、保存した意図と検証hashが一致しない。元のA再現を実行しpitch:first sendの失敗（B/C/D PASS）を確認した。元の失敗ログも保全。旧バイナリのままMidnight送受信を透過的に成功させるという元テストの前提は成立しない。今回はそれをPASSに書き換えず、固定旧adapter/runtimeで安全保留→更新後の実Outbox/競合復旧を別試験にした。

## 最小修正

1. Worker: Pitch/Fretboard/Rhythmのsettings/theme=midnight書込みはv2なしならoperation単位でsettings_theme_upgrade_requiredとしてcommit前に拒否。通常4テーマ・他レコードは既存経路のまま。資格・Account・CAS・operationHashの扱いは不変更。
2. Worker: PR237のv2読取/投影/保持とBを再利用。v1にDarkを投影しhash/manifestを整合させる。theme省略・旧版削除・Dark echoで保存Midnightを消さない。Light/Gray/Charcoalの明示変更は正確なrevisionのCASで採用する。同値Darkの明示選択とechoは識別不能なのでMidnightを保持し、Darkへの変更はv2で行う。
3. 3アプリ: 既存adapterのv1+v2能力宣言を再利用。共有runtimeはv2取得後のみ上記エラーの既存Outboxを再送候補に戻す。同じoperation ID・payloadHashを維持し、既存writer/Account検査を毎回通す。migration中の保留も同じ経路で復旧する。
4. 保存済み解決意図: v2 snapshotの同一revision/operation IDのレコードをDarkへ投影・再hashし、旧expectedRemoteに完全一致する場合だけアンカーを更新する。変更されるのは既存resolution.expectedRemoteのみ。意図/operation ID/ローカル/Shadow/cursorを初期化しない。真のrevision進行や非テーマ差分は通常の意図検査/CASで止まり、再選択できる。
5. Chord: PR237 Cの検証付きsnapshot再取得と既存metaのsettingsThemeViewV2 fingerprintを再利用。cursorを消さず、settingsのpending/競合がある場合はtheme_view_upgrade_pendingとして保持。pendingの強制処分はしない。旧Chordへ新しい拒否ガードを追加していない。
6. Port Dは再移植しない。Portの製品ファイル差分ゼロ。共有runtimeには本番済みPR235のPort Shadow先行ACK10行だけを保全し、mainの古いACKへ戻さない。関連mockのACK record補完7行も受入済み候補0ac85364から再利用した。検証・認証契約を緩めたものではない。

新しいDB/schema/migration/認証/同期プロトコル/独立状態機械はない。今回Aで増える永続フラグは0。追加はoperation単位の拒否コード1つ、既存terminalの再送条件、既存アンカーの限定更新。Cのmeta項目1つはPR237由来で、同じcursorでも読取投影が変わることと、旧タブが再びShadowを変えることを識別するため再利用。固定fixtureの追加コードは製品処理ではない。

## 旧版・新版・旧タブ

v1の4テーマは従来どおり。v1の新規Midnight書込はクラウドを変えず、既存Outbox/ローカルを保持して更新待ちとなる。旧UIは新しいエラー専用表示を知らないため一般的な注意表示になる可能性がある。更新せずに成功するとは案内しない。

v2更新後は同じ保存領域・cursorでOutboxを再送し、通常の成功ACK/検証後だけ既存の手順で確定する。既存Outbox/競合/Shadowを削除・再初期化して直す実装ではない。確認済み成功操作の通常の消込みは行う。
旧タブは毎要求v1として扱い、Device単位の恒久的能力推定はしない。同じstoreを使う旧→新の往復でもMidnightをクラウドに保持して再取得する。Webブラウザの実IndexedDB/同時イベント終了時の完全な受入までは主張しない。

## 検証

- Worker/互換性/固定fixture/復旧: 128 PASS、0 FAIL、skip0。うち新しいA/C復旧32ケースを含む。
- 3adapter＋Chord client: 69 PASS、0 FAIL。
- 3アプリtheme: 15 PASS、0 FAIL。能力宣言の期待値のみv1+v2へ更新。
- 共有runtimeの既存Account/authority/writer: 21 PASS、0 FAIL。
- Chord全体themeテスト: 1 FAIL。新規選択停止CSSのselectorが旧テストの配色selector検査に拒否される。同じ失敗を公開10449b7dの未変更テストでも確認。期待値の緩和・skip化はしない。Cの機能試験はPASS。Port/Studioの無関係な既存包括試験は反復しない。
- diff check PASS。Studio/NEWS/Port製品ファイルの差分ゼロ。4アプリの公開済み停止CSSをbyte一致で保全し、scriptは公開版からversion以外の変更なし。候補Pitch2.32.2/Fretboard2.27.4/Rhythm1.23.3/Chord1.23.3。Workerソースpackage0.1.6は配備版ラベルではない。

旧runtimeは公開10449b7dのbytes/SHA固定、旧adapterは既存source.jsonに固定。pre-gateで既にcommitした失敗の試験は、実Worker/repositoryを使い、新ガードだけを迂回してv1のACK投影を再現する合成transport。固定旧Worker全体を起動したとは表現しない。Accountは合成、DBはSQLite :memory:、本番D1/R2にアクセスしない。

## 公開順序と残る受入

1. 新規選択停止を維持したまま、実ブラウザで固定旧タブ・既存Outbox・旧解決途中状態からの更新を受入。Standard/Pro・同一Account・別Account guard、実IndexedDBの旧新同時タブ、Chord pending UIからの再開も確認する。Port1.30.5の既存受入を巻き戻さない。
2. Workerの3対象モジュール（capabilities/registry/validation）を現行v161の保全パッケージへ統合。AI/Account/Pro/STUDIO_CANARY_POLICY等の本番モジュールを保全し、このmain由来Worker全体で置換しない。旧v1で新規Midnightを送ると更新待ちとなることを受入する。
3. adapter v2と再送対応runtime v37を同時にcache更新した4アプリを配信。Chordはbootstrapとclientを一緒に更新。Port/Studioのcacheや製品ファイルを変更しない。旧タブが残る前提でsnapshot・manifest・cursor・Outboxの収束を確認する。
4. 別途承認後のみMidnight選択の再開へ進む。今回は再開・配備・mergeしていない。

rollbackでも保存Midnightを検証可能なWorker、v1投影/書込保持/commit前拒否、更新後Outbox readerを残す。旧Worker全体へ戻さず、保存データ・cursor・Outbox・競合を消さない。本人iPhoneの帰属不明12件は完全に別工程で未操作。

判定: ローカル合成の問題A解決候補PASS、実ブラウザ受入と本番統合/公開順の承認はHOLD。PR237は既存成果と失敗記録の保全用に残し、新Draftの依存元として記録する。
