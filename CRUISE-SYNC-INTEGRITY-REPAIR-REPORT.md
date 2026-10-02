# Cruise Sync Integrity Repair Report

## Overall Verdict

**COMPLETE WITH EXISTING LIMITATION**

- 対象の2件はどちらも、まず再現テストで原因を確定してから最小限の修正を行い、本番に反映しました。
  - Pitch：♯/♭ の無いクラウドに新しい端末が参加すると `manifest_mismatch` になる → 2.27.1 で修正
  - Rhythm：同期反映後のローカル保存で、同期された設定が古い値に巻き戻る → 1.17.1 で修正
- Theme Cloud Sync（5アプリとも送受信 YES）と `settings_theme_v1` の後方互換ゲートは、変更も破損もしていません。
- 「EXISTING LIMITATION」とした理由：調査中に Pitch で同じ種類の別の既存問題（Standard 版の形の settings）が見つかりました。修正には共有 runtime の変更が必要なため、今回は修正せず原因と推奨策を記載しています（20 参照）。

## 1. Starting Baseline

| 項目 | 実測（2026-10-01T23:57Z） |
|---|---|
| main / origin/main | `e19cfada`、0/0。未追跡は `.claude/` と `workers/sound-cruise-sync/node_modules/` のみ（保持） |
| 本番 | Port 1.13.0 / Chord 1.18.0 / Pitch 2.27.0 / Fretboard 2.22.0 / Rhythm 1.17.0 |
| Sync Worker | `cb6c315a`（100%、theme 項目ゲートあり） |
| Theme Sync | 5アプリとも Local / Receive / Send YES |

## 2. Pitch Reproduction

本物の Worker（SQLite で D1 を再現）・本物の共有 runtime・本物の Pitch アダプタで、参加処理の各段階を記録して原因を確定しました。

1. 参加する端末のスナップショットには♯/♭（`accidentalDisplay`）が無く、manifest はクラウドと同じ（`adf1…`）でした。
2. アダプタのマージ結果にも♯/♭は無く、競合は 0 でした。
3. 共有 runtime が settings を項目別にマージする際、Pitch の `effectiveSettingsForMerge` が欠けた♯/♭に `'sharp'` を補い、`encodeSettingsForMerge` はそれを取り除きませんでした。その結果、**最終スナップショットに `'sharp'` が入りました**。
4. その最終スナップショットを端末に反映しました。反映処理（materialize）も、値が無いときは常に `'sharp'` をストレージに書き込みます。
5. 送信差分の判定（`sameRecordForSync`）は「無い」と「sharp」を意味的に同じとみなすため、**push が省かれ、クラウドは `adf1…` のまま**でした。
6. 端末は `'sharp'` 入りの manifest（`61d0…`）で移行完了を申告し、Worker の照合が 409 `manifest_mismatch` を返しました。

- 再現したのは、クラウド無し × 未操作、クラウド無し × 明示 sharp の2ケースです。
- theme の有無で結果は変わりませんでした。
- 既存の共有テストが見逃していた理由：擬似サーバーが移行完了時の manifest を照合しないためです。本物の Worker で初めて再現しました。

## 3. Pitch Fix

- 2.27.1、`5ddf983d`。変更は Pitch アダプタだけです（共有 runtime・Worker・D1・スキーマは無変更）。
  - マージ用の補完（`effectiveSettingsForMerge`）で、♯/♭ の欠けを `'sharp'` で埋めるのをやめました。
  - 反映（materialize）は、値があるときだけストレージに書くようにしました。無ければキーを置きません（表示は従来どおり♯）。
  - 書き込みループは、値が無いキーを削除する形にしました。
- 起動時・読み込み時の書き戻しはありません。
- 本番のアダプタ（`?v=9`）は、リポジトリの修正版とハッシュが一致しています。

## 4. Pitch Default / Missing Semantics

- **無い ＝ 一度も選ばれていない**。表示は♯です。マージ・反映・ストレージ・manifest のすべてで「無い」のまま扱います。
- **明示の sharp / flat ＝ ユーザーの選択**。同期されます。
- 片方にだけ値がある場合は、共有の項目別マージの規則どおり「ある方を採用」します（theme と同じ）。
- 他の既定値項目（instrument など）の意味的比較は、従来どおり変えていません。

## 5. Pitch Join Tests

本物の Worker 上の `test/pitch-accidental-join.test.js` で、すべて合格しました。

| クラウド | 参加端末 | 結果 | クラウド書き込み |
|---|---|---|---|
| 無し | 未操作 | 参加成功、端末も無し（表示♯） | 0 |
| sharp | 未操作 | 参加成功、sharp | 0 |
| flat | 未操作 | 参加成功、flat | 0 |
| 無し | 明示 sharp | 参加成功、端末の明示値をクラウドへ（ある方を採用） | 1 |
| flat | 明示 sharp | 既存どおり競合1件 | — |

- 上の5ケースは、theme 有り／無しで結果が完全に一致しました。
- instrument / notationStyle / scaleEnabled / isAnswerMode / keyRandomMode / baseOctave / keyOffset / noteSpeed と、端末専用の baseHz は保持されました。
- 2台間で♯/♭の明示切替が往復し、競合は 0 でした。
- 未操作の2台は、3周同期しても書き込み 0 で、♯/♭ を作りません。
- 旧版（2.27.0 以前）が残した `'sharp'` は、1回だけ明示値として送られた後、安定しました。
- 共有 runtime の既存テスト2件は、新しい意味づけに合わせて期待値を更新しました。書き込み無し・揺れ無しという本来の意図は維持しています。

## 6. Pitch Theme Sync Regression

- 4テーマの往復、未設定の端末によるクラウドテーマの採用、theme と他設定の同時変更、旧版・reader 版との共存：E2E で全合格（`theme-writer-compat` 30件を含め、Worker のテストは 444/444）。
- 本番：Pitch スモーク 36/36、Pro ゲートは全テーマで画素差 0。

## 7. Rhythm Reproduction

Pro ページ（ローカル、本物の同期アダプタ）で、`applyRemoteSnapshot` でリモートの値を反映した後、端末で別の設定を保存しました。

| 同期で届いた値 | 1.17.0：ローカル保存後 | 1.17.1：ローカル保存後 |
|---|---|---|
| tapLayout `ud` | `lr` に巻き戻り | `ud` |
| judgePreset `strict` | `semiStrict` に巻き戻り | `strict` |
| inputMode `stroke` | `tap` に巻き戻り | `stroke` |
| clickRange `firstBar` | `always` に巻き戻り | `firstBar` |
| 内蔵ステージ1の BPM 111 | 消失 | 111 |
| カスタムステージ（改名＋追加） | 元の1件に戻る（データ消失） | 改名・追加とも保持 |
| theme `gray` | `gray`（前回保護済み） | `gray` |

## 8. Rhythm Stale Memory Root Cause

- 本体の次の3つの保存関数が、**保存内容をメモリの複製から丸ごと作り直していました**。
  - `saveSettings`：tapLayout / tapUnified / inputMode / judgePreset / カスタムステージを含む
  - `saveStageClickSettings`：clickRange / clickBeats / clickOffbeat
  - `saveRhythmStagePrefs`：内蔵ステージ設定
- 同期の反映はストレージだけを書き換え、メモリの複製は古いままでした。
- そのため、次のローカル保存（音量の変更など、無関係な操作でも）で古い値が書き戻されていました。

## 9. Rhythm Fix

- 1.17.1、`bf1e0bee`。変更は `script.js` だけです（同期アダプタ・音声は無変更）。
- **3-way 保存**：同期対象の値ごとに、最後にストレージから読んだ時点の値（基準）を記録します。
  - 保存時、この端末で基準から変えていない値は、ストレージの値（同期済み）を書きます。
  - 変えた値だけを端末の値として書きます。
  - 主設定は項目ごと、クリック設定は項目ごと、内蔵ステージ設定はステージごとに判定します。
- **読み直し（state hydration）**：`sound-cruise-rhythm-sync-applied` を受けたら、`hydrateRhythmSyncedSettings()` が同期対象だけをメモリへ読み直し、表示を更新します。
- **区別**：同期対象は `RHYTHM_SYNCED_MAIN_KEYS`・クリック設定・内蔵ステージ設定です。マイク補正・感度・音量・小節数・キャリブレーションなどの端末専用値は、読み直しも書き換えもしません。

## 10. Rhythm Runtime Side Effects

- 読み直しは、メモリ値の代入と設定 UI の表示切替だけです（`updateInputModeUI` / `applyTapLayout` / `updateJudgePresetUI` / `updateStageSettingsUI`）。
- 練習中（`state.running`）や練習画面の表示中は、読み直しを保留し、練習画面を離れる `show()` で実行します。保留中に保存が起きても、3-way 保存なので巻き戻りません（ブラウザで確認）。
- テーマは表示のみなので、従来どおり即時に反映します。
- マイクの再起動、AudioContext の作り直し、キャリブレーション、再生の開始・停止、練習の中断はいずれも行いません。
  - 単体テストで、読み直し処理がこれらの関数を呼ばないことを確認しています。
  - 音声関連の308行は、ベースラインとハッシュ一致です。

## 11. Rhythm Sync Tests

- `tests/sync-hydration.test.js`（新規）：本体の実際の関数を切り出して実行し、次を確認しました。
  - 3-way 保存（同期値の保持と、端末の変更の優先）
  - 待機中の読み直し、練習中・練習画面での保留、副作用なし
  - クリック設定・ステージ設定の項目別の保持
  - 本体への組み込み
- ブラウザ再現テスト（待機中・練習中）：上の表のとおり、すべて保持されました。端末の変更（音量・clickBeats・ステージ2の BPM）も反映され、端末専用値（threshold・micTestDone）は無変更です。
- 4テーマ同期・旧版クライアントとの共存：Worker の E2E で合格（同期アダプタは無変更）。
- ブラウザ E2E（テーマ・FOUC・他アプリ非干渉）：28/28。

## 12. Old Client Compatibility

- **Pitch**：インストール済みの旧版・reader 版クライアントは、修正版と並んで同期を続けられます（他設定の同期・theme 保持・競合 0）。
  - 旧版が新しく参加する場合の結果は、クラウドを修正版が作っても旧版が作っても完全に同じで、修正の影響はありません。
- **Rhythm**：同期アダプタは無変更です。旧版・reader 版との共存テストは引き続き合格しました。
- `settings_theme_v1` ゲート：Worker は `cb6c315a` のまま無変更で、ゲート関連のテストもすべて合格しました。

## 13. Five-App Theme Sync Regression

- 本番の5アプリ横断 QA：285/285（指定の組み合わせを含む5ラウンド × 3幅 × アプリと情報ページ）。
- テーマはアプリごとに独立し、5アプリとも送受信 YES のままです。
- Port・Chord・Fretboard のアプリコードは無変更です。

## 14. Audio Regression

- Port の音声ファイル11本は、ベースライン `137ebd4e` とハッシュ一致しました。
- Port の AudioSession・tuner・metronome のテストは 159/159 合格です。
- Pitch / Fretboard / Rhythm の音声関連行（113 / 128 / 308行）は、ハッシュ一致です。
- 音声の変更は 0 です。

## 15. Tests

| スイート | 結果 |
|---|---|
| Port | 952/952 |
| Shared（共有 runtime のシミュレーションを含む） | 226/226 |
| Pitch | 37/37 |
| Fretboard | 32/32 |
| Rhythm | adapter 17/17 ＋ tests 4ファイル PASS（`sync-hydration` を新規追加） |
| Chord | 96ファイル PASS |
| Sync Worker | 444/444（`pitch-accidental-join` 12件を新規追加） |
| NEWS Worker | 327/327 |
| cruise-port-requests | 65/65 |

## 16. Production Smoke

本番での確認は soundcruise.jp 以外のホストを遮断して行い、Pro 認証の偽装やユーザーデータへの書き込みはしていません。

- **Pitch 2.27.1**：スモーク 36/36、Pro ゲート画素差 0。
  - 本番のアダプタはリポジトリとハッシュ一致です。新規端末の参加で mismatch が出ないことは、このコードを本物の Worker で動かした E2E で確認しました。
- **Rhythm 1.17.1**：スモーク 21/21、Pro ゲート画素差 0。本番の `script.js` はリポジトリとハッシュ一致です。
  - 本番の Standard ページ（新しい空のブラウザ環境）で、375 / 393 / 1280 の3幅すべて、同期反映イベントの後にローカル保存しても巻き戻りませんでした。
- **5アプリ横断**：285/285。

## 17. Versions

| アプリ | 開始時 | 最終 |
|---|---|---|
| Cruise Port | 1.13.0 | 1.13.0（変更なし） |
| Chord Cruise | 1.18.0 | 1.18.0（変更なし） |
| Pitch Cruise | 2.27.0 | **2.27.1** |
| Fretboard Cruise | 2.22.0 | 2.22.0（変更なし） |
| Rhythm Cruise | 1.17.0 | **1.17.1** |
| Sync Worker | `cb6c315a` | `cb6c315a`（変更なし） |

## 18. Worker / D1 / Schema

Worker・D1・同期スキーマ・レコード種別・認証は、いずれも無変更です。

## 19. Git / Commits / Deploys

| Phase | コミット | 内容 | デプロイ |
|---|---|---|---|
| Pitch | `5ddf983d` | ♯/♭ の意味づけを統一（2.27.1）、E2E 12件、共有テストの期待値更新 | Pages、本番スモーク 36/36 |
| Rhythm | `bf1e0bee` | 3-way 保存 ＋ 同期後の読み直し（1.17.1）、テスト新規、チェックポイント | Pages、本番スモーク 21/21 |
| 最終 | 本報告のコミット | この報告書（Pages 除外） | Pages |

- 毎回の stage はファイル名を明示しました。
- `git add .` / reset --hard / clean / stash / force push は使っていません。
- push の前には毎回、次を確認しました：git status、差分、staged の差分、テスト、構文、シークレットスキャン、ahead/behind。

## 20. Remaining Issues

1. **Pitch：Standard 版の形の settings で、同じ種類の mismatch が起きる（既存・今回は修正せず）**
   - 条件：クラウドの settings が instrument / notationStyle / scaleEnabled / isAnswerMode の4項目だけ（Standard 版時代のデータで最初に同期した場合など）のとき、全項目を持つ端末が参加すると `manifest_mismatch` になる（theme とは無関係）。
   - 原因：♯/♭ と同じく、マージ時に既定値を補ったうえで「意味的に同じ」として push を省くこと。
   - 推奨修正：共有 runtime の参加処理で、「意味的に同じならクラウドの文字どおりの内容を採用する」ようにする。共有 runtime を変えると、Port を含む4アプリのキャッシュキーとバージョンに波及するため、ご判断ください。
2. **Pitch：旧版（2.27.0 以前）のタブが♯/♭の無いクラウドに新規参加すると、修正前と同じく失敗する**
   - 旧版のタブのコードで起きるもので、修正の影響ではありません（比較テストで確認）。
   - アプリを再読み込みして 2.27.1 になれば解消します。
3. **Pitch：旧版が残した `'sharp'` の扱い**
   - 旧版が残した `'sharp'` を持つ端末は、クラウドに♯/♭が無い場合に限り、更新後に1回だけ明示値として送ります。値の意味は変わりません。
4. **Rhythm：保留中の小さな例外**
   - 練習画面で読み直しが保留されている間に、ユーザーが「画面上ですでに選ばれている（古い）値」をあらためて選んでも、変更とはみなされず同期値が残ります。
   - 練習画面を離れると表示も最新になります。

---

## YES / NO

- Pitch missing accidentalDisplay can join successfully: **YES**
- Pitch explicit sharp syncs: **YES**
- Pitch explicit flat syncs: **YES**
- Pitch manifest mismatch fixed: **YES**（♯/♭ の欠けによるもの。Standard 版の形の settings による別件は 20-1 のとおり既存の制約）
- Pitch fix requires read-time writeback: **NO**
- Rhythm remote settings hydrate in-memory state: **YES**
- Rhythm later local save preserves remote settings: **YES**
- Rhythm local-only settings remain local: **YES**
- Rhythm audio/mic behavior changed: **NO**
- Theme Sync regressed: **NO**
- backward compatibility gate regressed: **NO**
- old clients still work: **YES**
- Worker changed: **NO**
- D1 migration performed: **NO**
- sync schema changed: **NO**
- new record type created: **NO**
- Port Audio changed: **NO**
- Pitch Audio changed: **NO**
- Fretboard Audio changed: **NO**
- Rhythm Audio changed: **NO**
- all tests pass: **YES**
- production smoke passes: **YES**
- Git safety followed: **YES**
