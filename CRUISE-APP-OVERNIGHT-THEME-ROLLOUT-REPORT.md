# Cruise App Overnight Theme Rollout Report

**Overall Verdict: OVERNIGHT ROLLOUT COMPLETE**

全5アプリ（Port / Chord / Pitch / Fretboard / Rhythm）が Dark / Charcoal / Gray / Light の4テーマに対応し、本番へデプロイ済みです。全テスト・本番スモークは合格です。Pitch / Fretboard / Rhythm のテーマ送信（writer）は無効のままで、明日の確認後に有効化する計画です。

---

## 1. Starting Baseline

- main = origin/main = `137ebd4e`（Phase 0, 2026-10-01）
- Port 1.12.3 / Chord 1.17.1 / Pitch 2.25.0 / Fretboard 2.20.0 / Rhythm 1.15.0
- Sync Worker：最後のソース変更は `e455523c`（practice_menu_set capability gate）
- 既存の未追跡ファイル `.claude/`、`workers/sound-cruise-sync/node_modules/` は最後まで stage していません。

## 2. Fretboard

- 4テーマに対応しました（`330e3b29`, 2.21.0）。
- 設定の「共通」タブに「カラーテーマ」欄を追加しました。
  - タップするとその場でプレビューされ、「決定」で保存、「キャンセル」で元に戻ります。
  - 「全てリセット」でダークに戻ります。
  - Standard でも選べます。
- 配色は生成レイヤー `theme-colors.css` で付けています（`tools/theme-layer/generate.py fretboard`）。Dark の CSS は一切編集していません。
- 色が固定のままのもの：
  - 指板（木目・フレット・弦）
  - ノートマーカー
  - 度数・ルート・3度・5度・7度の機能色
  - 鍵盤
  - トラックボール
  - Pro ゲート
- Pro ゲートを完全に Dark に保つ修正を後から入れました（`69af8ef3`, 2.21.1）。
- 最終バージョンは 2.21.2（reader-first、`2e71d1ea`）です。

## 3. Pitch

- 4テーマに対応しました（`d18930e1`, 2.26.0）。
- 設定モーダルにテーマ項目を追加しました。プレビュー・キャンセル・リセットに対応しています。
- `theme` は `LOCAL_ONLY_SETTINGS` に入れており、送信されません。
- beta ページ用には専用レイヤー `theme-colors-beta.css` を用意しました。
- 色が固定のままのもの：
  - ピアノ鍵盤（白鍵・黒鍵・押下色）
  - 正誤フィードバック
  - 紙吹雪
- AudioEngine・gain・AudioSession・再生処理には触れていません（音声コード行のハッシュがベースラインと一致）。
- 最終バージョンは 2.26.2 です。

## 4. Rhythm

- 4テーマに対応しました（`356c7bba`, 1.16.0）。
- 設定にテーマ欄 `#rc-theme-card` を追加しました。
- パネル類は先に配色しています。
- canvas・VexFlow が「暗い地に明るい線」で描く部分だけは、最小限のパネルを Dark の地色のままにしています。
  - 対象：判定レーン、キャリブレーション、レビュー、結果グラフ、スコア編集
  - 地色：#090d13 / #10141a（Dark での実測値）
- 判定色（early / just / late）は変えていません。
- 音声・マイク処理は変更していません。
- 最終バージョンは 1.16.2 です。

## 5. Reader-First Cloud Sync

| 対象 | 状態 |
|---|---|
| Worker | テーマ値 `dark` / `charcoal` / `gray` / `light` を任意項目として受け入れます（Pitch / Rhythm / Fretboard settings）。`6c19d296` → 本番 `7245c2e6`（100%）。397/397 テスト合格 |
| Pitch | 受信した theme を `themeCloudMirror` に保存し、同期スナップショットにはその受信値だけを返します。端末自身の theme は送りません（`LOCAL_ONLY_SETTINGS`） |
| Fretboard | 同上（`SYNC_SETTINGS` に theme を入れていません） |
| Rhythm | 同上（`SYNC_SETTINGS` に theme を入れていません） |

- **writer enabled = NO**（3アプリとも、端末のテーマ送信は無効です）
- D1 マイグレーションなし、新しいレコード種別なし、同期スキーマ番号の変更なし。
- 実行時シミュレーション（THEME reader-first）は 132/132 合格です。
  - エラーなし、競合なし。
  - クラウドのテーマは消えず、端末のテーマは送られません。

## 6. Port Charcoal

- `c4fd125a`, 1.13.0（デプロイ済み）。
- 設定のテーマボタンは「ダーク / チャコール / グレー / ライト」の4つで、375px でも1行に収まります。
- Charcoal は Dark 系のテーマです。
  - トークンブロックを1つ追加し、面・くぼみ・文字色だけを持ち上げています。
  - Dark の金色アクセント、状態色、Dark 専用ルールはそのまま使います。
- そのほかの追加：
  - Port 内に限定した Sync UI ブロック
  - 文字色の段差を補う4ルール（半透明の金・薄い文字を不透明に描く）
  - NEWS の問い合わせリンク色
- チューナーはトークン経由で Charcoal に追従します。Dark 固定はしていません。チャコールでのコントラストは最小 4.58 です。
- My Apps アイコンには Dark プレートを付けていません。Charcoal 自体が Dark 系で、アイコンが十分に読めることを目視で確認しました。
- Gray / Light の既存ルールは一切変更していません。計算スタイルの差は、テーマ欄で兄弟要素の順番がずれる分だけです。
- Audio・AudioSession・チューナー・メトロノームのモジュールは無変更です（キャッシュキーも 1.12.3 のまま）。

## 7. Chord Charcoal

- `01f6df1c`, 1.18.0（デプロイ済み）。
- アプリ本体と info / usage / terms / privacy が Charcoal に対応しました（共通の起動ブートストラップを使用）。
- トークンブロックを1つ追加しました。
  - bg #424346 / surface #4c4e52 / raised #545559
  - 不透明な muted / faint 文字色
- Gray / Light 用のトークン駆動ルールのうち、次の4つの適用範囲を Charcoal にも広げました。Gray / Light の計算スタイルは不変です。
  - 固定オブジェクト
  - Sync UI
  - モーダルの暗幕
  - info ページのくぼみ
- 明るいページ専用のルールは Gray / Light 限定のままです（墨色タイトル、濃い金、白いインセット、ミュート縁）。
- 色が固定のままのもの：
  - 指板マーカー、バレー
  - 本、フォルダ、棚板
  - 白黒の運指図、書き出し画像
- Pro ゲートは Dark のままです（本番の画素比較で差 0）。

## 8. Final Theme Names

全5アプリで共通の値と表示名です。

| 値 | 表示名 |
|---|---|
| `dark` | ダーク |
| `charcoal` | チャコール |
| `gray` | グレー |
| `light` | ライト |

- 値が無い・不正・壊れている場合は `dark` になります。
- 保存されるのは、ユーザーが明示的に選んだときだけです。

## 9. Final Versions

| アプリ | 開始時 | 最終 |
|---|---|---|
| Cruise Port | 1.12.3 | **1.13.0** |
| Chord Cruise | 1.17.1 | **1.18.0** |
| Pitch Cruise | 2.25.0 | **2.26.2** |
| Fretboard Cruise | 2.20.0 | **2.21.2** |
| Rhythm Cruise | 1.15.0 | **1.16.2** |
| Sync Worker | `e455523c` | **`6c19d296` → deploy `7245c2e6`** |

## 10. Dark Preservation

- ベースライン（`137ebd4e`）と最終版の Dark を比較し、計算スタイルの差は**全5アプリで 0** でした。
- Dark CSS は一切編集していません（生成レイヤーと各アプリのテーマ部分は `data-theme` の指定があるときだけ効きます）。
- 差が出たのは次の2種類だけです。
  - 新しく追加したテーマ設定欄による配置のずれ
  - アニメーションやランダム出題による画素ノイズ（ベース同士の比較でも出ることを確認済み）
- Fretboard の新しい区切り線は、既存の Dark 区切りルールが新しく隣り合った欄に適用されたものです。
- Port のテーマボタン用ルール（文字サイズ・折り返し防止）だけは Dark にも効く新ルールです。ボタンが4つになったための調整で、Dark のハッシュテストではこのルールを除外して元と一致することを確認しています。Chord の同種のルールも同じ扱いです。

## 11. Charcoal Design

| アプリ | bg | surface | raised / panel | text | muted | アクセント |
|---|---|---|---|---|---|---|
| Port | #424346 | #4c4e52 | panel #505256 / control #56585c / field #3a3b3e | #f2f1ed | #d2cec5 | Dark の金（#cdb474 / #e6d29b）を維持 |
| Chord | #424346 | #4c4e52 | #545559 | #f2f1ed | #d2cec5（faint #c6c2b9） | Dark の金（#d4af37 / #e8c97a）を維持 |
| Pitch | #424346 | #4c4e52 | #58595e | #f2f1ed | #c4c5c7 | 文字用アクセント #00ff88 / #00d2ff / #ffd65e を contrast 補正 |
| Fretboard | #424346 | #4c4e52 | #58595e | #f2f1ed | #c4c5c7 | 文字用アクセント #4f9cf9 を contrast 補正 |
| Rhythm | #424346 | #4c4e52 | #58595e | #f2f1ed | #c4c5c7 | 文字用アクセント #ff9f1c / #dec27a を contrast 補正 |

- 全アプリとも `color-scheme: dark`、theme-color は #424346 です。

## 12. Gray Preservation

- Port と Chord の既存 Gray をベースラインと比較し、計算スタイルの差は、テーマボタンが1つ増えて兄弟要素の番号がずれた分だけでした。それ以外は 0 です。
- 画素差はアニメーションのノイズのみで、ベース同士の比較で確認しています。
- Chord の情報ページは差 0 です。

## 13. Light Preservation

- Gray と同じ結果です。Port と Chord の既存 Light で、テーマボタン以外のスタイル差は 0、Chord の情報ページも差 0 です。
- Port の Light に出た画素差（My Apps 新規、カレンダー、チューナー）は、ベース同士でも再現するアニメーションのノイズでした。

## 14. Functional Objects / Panels

テーマを切り替えても、次の色は Dark と同一です（オブジェクト比較で差 0）。

| アプリ | 固定されるもの |
|---|---|
| Port | 状態色・機能色（チューナーの in-tune 緑は Gray / Light では濃い緑に置換し、色相は維持） |
| Chord | 指板マーカー、バレー、本、棚、運指図、書き出し |
| Pitch | 鍵盤、正誤フィードバック |
| Fretboard | 指板、マーカー、度数色 |
| Rhythm | 判定レーン、波形、結果グラフ、スコア地、判定色 |

## 15. Audio Regression

- Port の音声ファイル11本は、ベースラインとハッシュが完全一致しました。
  - tuner-app / tuner-audio / tuner-engine / tuner-preview-audio / tuner-store / tuner-tuning / tuner-meter-preference
  - metronome-app / metronome-store / metronome-presets-store / metronome-timing
- Pitch / Fretboard / Rhythm の script.js から音声関連の行を抽出して比較し、すべて一致しました。
  - 抽出した記述：AudioContext / audioSession / gain / oscillator / getUserMedia / volume / buffer
  - 行数：Pitch 82行 / Fretboard 84行 / Rhythm 174行
- Port の AudioSession Phase A/B を担うテスト（tuner-audio / tuner-preview-audio / metronome 系）は **159/159 合格**です。
- 音声関連キーワードに一致した変更は1件だけでした。Fretboard の「音声診断結果」表示欄の文字色を変数フォールバック化したもので、表示のみの変更です。

## 16. Local Persistence

全5アプリで次を確認しました（ローカル E2E と本番スモーク）。

- テーマは明示的に選んだときだけ保存され、読み込み時に書き戻しません。
- 再読み込みしても保持されます。
- リセットで `dark` に戻ります。
- 不正な値・壊れた JSON・保存領域のエラーはすべて Dark になります。

## 17. Cross-App Independence

- 本番の横断 QA で **132/132 合格**しました。
  - 3幅 × 4ローテーション × 5アプリ × Standard / Pro。同一オリジン上で、各アプリに異なるテーマを割り当てています。
  - 各アプリは自分のキーだけを読み、他アプリのキーを一切書き換えません。
- OS テーマや globalTheme は使っていません。

## 18. Cloud Sync State

| アプリ | Worker が受理 | クライアントが受信 | クライアントが送信 |
|---|---|---|---|
| Port | YES | YES | YES |
| Chord | YES | YES | YES |
| Pitch | YES | YES | NO |
| Fretboard | YES | YES | NO |
| Rhythm | YES | YES | NO |

- Port の settings は汎用 JSON として、Chord の settings は項目単位の検証なしで扱われるため、Worker の変更なしで `charcoal` を受理します。
- Pitch / Fretboard / Rhythm は `validSettingsTheme` の4値で受理します。

## 19. Standard / Pro

- Standard と Pro の両方で4テーマが動作します。Pro の認証済み動作はローカル（127.0.0.1）でのみ確認しました。
- Pro 認証ゲートは全アプリで Dark 固定です。
  - Pitch / Fretboard / Rhythm：ゲート表示中はテーマレイヤーごと無効になります（`:has(body.pro-gate-active)`）。
  - Port / Chord：不透明なゲートが重なります。
  - 本番の画素比較（Dark と各テーマ）で、Port・Chord は差 0、Pitch・Rhythm も差 0、Fretboard は 1px のノイズだけでした。
- 本番では Pro 認証を偽装していません。

## 20. FOUC

- 全アプリで、`<head>` 内のブートストラップがスタイルシートより前に `html[data-theme]` を設定します。
- スタイルシートを意図的に 700〜800ms 遅らせても、CSS が届く前にテーマが確定していることを確認しました（本番横断 QA ＋ 各アプリの E2E）。
- Dark では theme-color meta を追加しません。

## 21. Contrast

- **新たなコントラスト低下は 0 件**です（各テーマを Dark と要素ごとに比較）。
- Port：Charcoal で AA 未満は 0 件（Dark は既存の `↗` 1件）。チューナーの Charcoal 最小値は 4.58 です。
- Chord：Charcoal で Dark より悪化した要素は 0 件（アプリ・情報ページとも）。CAGED ボタンのルート表記は 3.93 で、Dark でも 3.97 と AA 未満です（測定誤差の範囲）。
- Pitch / Fretboard / Rhythm：各フェーズで悪化 0 件。記録済みの例外は次のとおりで、いずれも Dark と同等か、オブジェクトの誤測定です。
  - 装飾の「・」区切り（opacity）
  - ページ地で測ってしまうマーカー
  - オーバーレイ下の項目
  - 鍵盤ラベル
  - グラデーション見出し
  - Fretboard Charcoal の版注記（3.21、Dark は約 2.7）

## 22. Tests

| スイート | 結果 |
|---|---|
| Port | 952/952 |
| Shared（sync-account） | 226/226 |
| Pitch | 36/36 |
| Fretboard | 31/31 |
| Rhythm | 17/17 ＋ tests 3ファイル PASS |
| Chord | 96ファイル PASS |
| Sync Worker | 397/397 |
| NEWS Worker | 327/327 |
| cruise-port-requests Worker | 65/65 |
| Runtime sync simulation（THEME reader-first 込み） | 132/132 |

## 23. Production Smoke

本番での確認は soundcruise.jp 以外のホストを遮断して行い、ユーザーデータには触れていません。

- Port 1.13.0：375 / 393 / 1280 × 4テーマでエラー 0。Charcoal のチューナー追従、Pro ゲート差 0 を確認しました。
- Chord 1.18.0：3幅で Charcoal の適用・再読み込み保持、info / usage / terms / privacy の Charcoal 化、エラー 0、ゲート差 0（375 / 1280）を確認しました。
- 5アプリ横断：132/132。
- Phase 1〜4 の各アプリのスモークは、各フェーズで PASS しています。

## 24. Git / Commits / Deploys

| コミット | 内容 | デプロイ |
|---|---|---|
| `17df5f5d` | チェックポイント追加（Pages 除外） | Pages |
| `330e3b29` | Fretboard 4テーマ 2.21.0 | Pages |
| `d18930e1` | Pitch 4テーマ 2.26.0 | Pages |
| `356c7bba` | Rhythm 4テーマ 1.16.0 | Pages |
| `69af8ef3` | Pro ゲート完全 Dark（F 2.21.1 / P 2.26.1 / R 1.16.1） | Pages |
| `6c19d296` | Worker：theme 受理（reader-first） | Worker `7245c2e6` |
| `2e71d1ea` | クライアント reader-first（F 2.21.2 / P 2.26.2 / R 1.16.2） | Pages |
| `c4fd125a` | Port Charcoal 1.13.0 | Pages |
| `01f6df1c` | Chord Charcoal 1.18.0 | Pages |
| `ac529623` | チェックポイントに Phase 6 / 7 を記録 | Pages |
| （本コミット） | Phase 8 記録とこの報告書（Pages 除外） | Pages |

- 毎回の stage はファイル名を明示しました。`git add .` / reset --hard / clean / stash / force push は一切使っていません。
- 各回、通常の push を行い、ahead / behind が 0/0 であることを確認しました。

## 25. Safe Checkpoints

上の表のすべてのコミットが、それぞれ単独で本番に出しても安全な状態です。途中で止めた場合は、そのコミットまでが動作確認済みの地点になります。

- Phase 1〜3（`69af8ef3`）：3アプリの4テーマがローカル保存のみで完結。
- Phase 4（`2e71d1ea`）：受信のみで、送信なし。
- Phase 5（`c4fd125a`）・Phase 6（`01f6df1c`）：Charcoal 追加。

## 26. Remaining Issues

1. **旧版が混在する期間（Port / Chord）**
   - 1.12.x の Port や 1.17.x の Chord が `charcoal` を受信すると、Dark で表示します（安全なフォールバック）。
   - その端末で別の設定を保存すると、theme なしの settings が同期されます。その結果、新しい端末側も Dark に戻ります。
   - データ破損はありません。PWA が更新されれば解消します。
2. **旧版の Pitch / Fretboard / Rhythm**（2.26.2 / 2.21.2 / 1.16.2 より前）は、theme を含む受信データを拒否します。writer を有効にする前に、旧版のタブが残っていないことを確認する必要があります。
3. **情報・規約系ページの Dark 固定**：Pitch / Fretboard / Rhythm の info / terms / privacy / guide / help / pro-access の計21ページは Dark のままです。規模が小さくないため、今夜は対象外にしました。
4. **Rhythm の描画**：canvas / VexFlow の描画色そのもののテーマ化は今後の課題です（JS 内に色指定が154箇所）。今は周囲のパネルを Dark の地色に保って可読性を確保しています。
5. **Pitch の背景透け**：Pro ゲート背後の blur 越しに、テーマ化したページがわずかに透けます（最大 8/255）。ゲートカード本体は Dark です。
6. **QA ツール側の既知の不具合**（アプリではなく検証スクリプトの問題）：
   - Chord 本番スモークのリセットボタン探索が空振りします（ローカル E2E では「リセット → ダーク」を確認済み）。
   - fprod のゲート検出セレクタが誤っています（ゲートは画素比較で確認済み）。

## 27. Tomorrow Writer Activation Plan

**前提：ユーザーの確認を得てから開始します。今夜は送信を開始していません。**

1. **事前確認**
   - 本番で配信中のバージョン（P 2.26.2 / F 2.21.2 / R 1.16.2 以上）を確認します。
   - 主要端末で「ページを更新」を実行してもらいます。
   - 旧タブが残っていないことを確認します（reader 公開から24時間以上たってから行うのが目安です）。
2. **1アプリずつ有効化**（推奨順：Fretboard → Rhythm → Pitch）
   - Fretboard / Rhythm：`SYNC_SETTINGS` に `theme` を追加します。
   - Pitch：`LOCAL_ONLY_SETTINGS` から `theme` を外します。
   - スナップショットは、`themeCloudMirror` の代わりに端末の theme を返すようにします。
   - 初回の扱い：端末に theme がなく `themeCloudMirror` だけある場合は、そのミラー値を端末の theme として採用します。これで「未設定」がクラウドの選択を上書きしないようにします。
   - 3-way のフィールドマージ（shared の settings-field-merge）用テストと runtime シミュレーションを追加します。
   - マイナーバージョンを上げます。
3. **Worker は変更不要**です（4値を受理済み）。D1 マイグレーション、スキーマ番号の変更、新しいレコード種別も不要です。
4. **検証**
   - 2台の端末で、A のテーマ変更が B に届くこと、競合が出ないことを確認します。
   - Port / Chord と同じ手順で行います。
5. **ロールバック**：writer のコミットを revert するだけで受信のみの状態に戻ります。Worker は触りません。

## 28. User Device Tests Recommended

- iPhone Safari と PWA の両方で、5アプリそれぞれ Charcoal のステータスバー色（theme-color #424346）と起動直後のちらつきがないことを確認。
- Port のチューナーを Charcoal で実際のマイクを使って確認（in-tune 表示の視認性、AudioSession 後の音量）。
- Port / Chord の Charcoal を2台の端末で同期（両端末とも最新版で）。
- Chord 設定画面の4つのテーマボタンの表示（小さい iPhone）と、info / usage / terms / privacy の Charcoal 表示。
- Rhythm の練習レーン・結果グラフ・スコア編集を Charcoal / Gray / Light で確認（パネルは Dark 地のまま）。
- 各アプリの Pro ゲートが、どのテーマでも Dark で表示されること。

---

## Expected YES

- Fretboard / Pitch / Rhythm have four themes: **YES**
- Port has Charcoal: **YES**
- Chord has Charcoal: **YES**
- All five apps use Dark / Charcoal / Gray / Light: **YES**
- Theme is independent per app: **YES**
- Port theme cloud send enabled: **YES**
- Chord theme cloud send enabled: **YES**
- Pitch theme cloud receive ready: **YES**
- Fretboard theme cloud receive ready: **YES**
- Rhythm theme cloud receive ready: **YES**
- Sync Worker accepts all four theme values: **YES**
- All tests pass: **YES**
- Production smoke passes: **YES**
- Git safety followed: **YES**

## Expected NO

- Dark appearance changed anywhere: **NO**
- Existing Gray / Light appearance changed in Port or Chord: **NO**
- Port Audio logic changed: **NO**
- Pitch Audio logic changed: **NO**
- Fretboard Audio logic changed: **NO**
- Rhythm Audio logic changed: **NO**
- Pitch theme cloud send enabled: **NO**
- Fretboard theme cloud send enabled: **NO**
- Rhythm theme cloud send enabled: **NO**
- D1 migration performed: **NO**
- New record type created: **NO**
- Sync schema version changed: **NO**
- FOUC exists: **NO**
- Functional objects lost meaning: **NO**
- New contrast regressions exist: **NO**
