# Cruise Theme Cloud Sync Completion Report

## Overall Verdict

**COMPLETE WITH BACKWARD COMPATIBILITY GATE**

- 5アプリすべてで、カラーテーマの送信・受信が有効になりました（Port / Chord / Pitch / Fretboard / Rhythm）。
- reader-first 以前の旧クライアントは、theme 入りの settings を受け取ると同期全体がエラーになることを、実コードで確認しました。
- そのため、既存の capability の仕組みを使った後方互換ゲートを Sync Worker に入れてから、writer を Fretboard → Rhythm → Pitch の順で有効化しました。
- D1 マイグレーション、スキーマ番号の変更、新しいレコード種別はいずれもありません。

## 1. Starting Baseline

| 項目 | 実測（2026-10-01T22:36Z） |
|---|---|
| main / origin/main | `62b2b4ac`、0/0。未追跡は `.claude/` と `workers/sound-cruise-sync/node_modules/` のみ（保持） |
| 本番 | Port 1.13.0 / Chord 1.18.0 / Pitch 2.26.3 / Fretboard 2.21.3 / Rhythm 1.16.3（repo と一致） |
| Sync Worker | `7245c2e6`（100%） |
| 同期の状態 | Port・Chord は送受信 YES。Pitch・Fretboard・Rhythm は受信のみ（reader-first、`themeCloudMirror`） |
| プロトコル | 読み取りは `GET /v1/sync/snapshot?appId=&capabilities=`、書き込みは `POST /v1/sync/push`（`capabilities` は任意の body 項目）。Worker は push の payloadHash を自前で再計算して検証する。capability による出し分けは Port の `practice_menu_sets_v1` で稼働中 |

## 2. Old Client Behavior

reader-first 直前の版（`2e71d1ea^` = Pitch 2.26.1 / Fretboard 2.21.1 / Rhythm 1.16.1）のアダプタを、変更されていない共有 runtime 上で実際に動かしました。クラウドの settings に theme がある状態での結果です。

| シナリオ | Pitch | Fretboard | Rhythm |
|---|---|---|---|
| 同期中の端末が受信 | 同期全体が例外 `pitch_record_invalid`（分類 C）。ローカル・クラウドは無変更 | 同じ（`fretboard_record_invalid`） | 同じ（`rhythm_record_invalid`） |
| 別の設定を変えて同期 | push が競合し、競合ダイアログが1件出る。クラウドの theme は残る | 同じ | 同じ |
| 新しい旧端末の参加 | 参加処理が例外で失敗 | 同じ | 同じ |

- 分類は **C（同期全体がエラー）** です。
- さらに、競合ダイアログで「この端末」を選ぶと、theme 無しの settings で上書きされます。これはクラウドの theme を消す経路（E/F 相当の危険）です。
- ゲートなしでの writer 有効化は安全ではないと判断しました。

## 3. Backward Compatibility Strategy

- **既存の仕組みを流用**しました。Port で稼働中のクライアント capability（`sync-capabilities.js`）に、Pitch / Fretboard / Rhythm 用の値 `settings_theme_v1` を追加しました。
  - capability は既存の任意項目なので、プロトコルの新設はありません。
  - 名乗らないクライアントは旧版として扱います。
- **新しいクライアント**（writer 版）はアダプタで `syncCapabilities = ['settings_theme_v1']` を宣言し、theme を含む settings をそのまま受け取ります。
- **旧クライアント**（reader 以前の版と reader 版の両方）に対して：
  - 読み取り（スナップショット・差分・push の応答）では、Worker が settings から theme だけを除き、payloadHash と manifest をそのクライアントに見える内容で計算し直して返します。theme を除くと空になる settings は削除済みとして見せます（旧 Fretboard は空の settings を受け付けないため）。
  - 書き込み（push）では、そのクライアントが基にしたリビジョンの保存済み theme を Worker が引き継ぎます。リセット（削除）の場合も、theme だけの settings として残します。
- ゲートの対象は theme 項目だけです。他の settings、他のレコード種別、Port・Chord には影響しません。
- User-Agent による判定は使っていません。

## 4. Worker Changes

- 変更したファイル：`src/sync-capabilities.js`、`src/app.js`、`src/sync-database.js`
- テストを追加しました。
  - `test/theme-field-gate.test.js`
  - `test/theme-writer-compat.test.js`
  - `test/theme-compat-harness.js`
  - フィクスチャ：reader 以前と reader 版のアダプタ（`.fixture`）
- デプロイ：`cb6c315a`（100%）、2026-10-01T22:50:52Z、コミット `cd1a0052`。
- デプロイ前に、本番と手元の設定（環境変数・バインディング）が同一であることを確認しました（D1 は ID と名前の表示差のみ）。
- ヘルス応答は 200 です。
- D1 マイグレーション、スキーマ番号の変更、新しいレコード種別はありません。

## 5. Fretboard Writer

- 2.22.0、`465fdb3f`、本番反映済み。
- theme を同期される settings の項目にしました。既定値を持たないため、既定値で埋める `SYNC_SETTINGS` のループの外（`SYNC_OPTIONAL_SETTINGS`）で扱います。
  - そのまま `SYNC_SETTINGS` に入れると、未設定が「値 undefined の項目」としてマージに参加し、不要な競合や上書きの原因になるためです。
- 送信の順序：明示保存の theme → `themeCloudMirror` → どちらも無ければ送らない。
- 受信：有効な theme を端末の明示 theme として保存し、ミラーは解消します。theme の無い settings ではローカルの theme を消しません。
- 同期後は既存の `refreshFretboardStateAfterSync` がテーマを再適用します。
- 本番スモークは合格。Pro ゲートは画素差 0〜1px（既知のノイズ）です。

## 6. Rhythm Writer

- 1.17.0、`d49a6997`、本番反映済み。
- 送信・受信の規則は Fretboard と同じです。
- 反映後に `sound-cruise-rhythm-sync-applied` を発行し、本体は theme だけを読み直します。`state.theme` も更新されるので、その後の設定保存で受信テーマが戻りません。ブラウザでも確認しました。
- 音声・マイク・タイミング・canvas・VexFlow は無変更です（音声関連308行がベースラインと一致）。
- 本番スモークは合格、Pro ゲートは画素差 0 です。

## 7. Pitch Writer

- 2.27.0、`021a937f`、本番反映済み。
- theme を `LOCAL_ONLY_SETTINGS` から外しました（`baseHz` / `sustainTime` は引き続き端末専用）。
- theme は `DEFAULT_SETTINGS` による組み直しの外で扱うため、未設定のテーマが作られることも消えることもありません。
- 同期後は既存の `loadSettings()` の再実行で、表示と `this.theme` が更新されます。
- 音声は無変更です（音声関連113行が一致）。
- 本番スモーク 36/36、Pro ゲートは画素差 0 です。

## 8. Unset Theme Behavior

- 未設定の端末は theme を送りません。「未設定 = ダーク」を送ることはありません（3アプリとも単体テストと E2E で確認）。
- 未設定の端末が参加・同期すると、クラウドのテーマを自分の明示 theme として採用します（E2E：「an unset device adopts the cloud theme」）。
- その端末がその後に別の設定を保存しても、クラウドのテーマは変わりません。
- 明示的なダーク（リセット後など）は、`dark` として送られます。

## 9. themeCloudMirror Migration

- 送信時は、未設定の theme の代わりにミラーを使います。
- 受信時は、届いた theme を明示 theme として保存し、ミラーを削除します。
- 表示は「明示 theme → なければミラー」です（`pitchThemeOf` / `fretboardThemeOf` / `rhythmThemeOf`）。読み込み時の書き戻しはしません。
- 補足：これまで本番に writer は存在せず、ゲート導入後は reader 版にも theme が届かないため、実際にミラーを持つ端末はありません。安全側の互換処理として実装しています。

## 10. Old Client Push Preservation

- 旧クライアントが theme を知らずに別の設定を push しても、**クラウドの theme は消えません**。
- 例：クラウドが `theme = charcoal`・tempo 96 の状態で、旧 Fretboard が tempo だけを 120 にして push した場合、push 後のクラウドは `theme = charcoal`・tempo 120 になります。
- 本物の Worker と旧アダプタで、3アプリとも確認しました。
- 旧クライアントのリセット（settings の削除）でも、theme だけの settings として残ります。
- 「theme の有無で、旧版・reader 版クライアントの同期結果（各段階の成否・競合数・ローカル設定・クラウドの非 theme 値）が完全に一致する」ことを、3アプリ × 2世代で確認しました。

## 11. Conflict / Merge

- theme と別の設定を2台で同時に変えた場合：両方残り、競合は 0 です。
- 同じテーマを2台で同時に選んだ場合：競合は 0 です。
- 同じ項目（theme）を2台で同時に別の値にした場合：2台目に競合ダイアログが1件出ます。これは tempo などの他の設定とまったく同じ既存の規則で（E2E で同数を確認）、テーマのために余計な競合は増えていません。
- 旧クライアントの古いリビジョンからの書き込みは通常の競合になり、旧クライアントに返す競合レコードからも theme は除かれます。

## 12. Final Sync Matrix

| App | Local | Receive | Send |
|---|---|---|---|
| Port | YES | YES | YES |
| Chord | YES | YES | YES |
| Pitch | YES | YES | YES |
| Fretboard | YES | YES | YES |
| Rhythm | YES | YES | YES |

## 13. Two-Device Simulation

本物の Worker（SQLite で D1 を再現）・本物の共有 runtime・本物のアダプタを使い、独立したストレージの端末 A・B で実行しました。`test/theme-writer-compat.test.js` の 30件がすべて合格です。

- 4テーマの往復：A ライト → B ライト、B チャコール → A チャコール、A グレー → B グレー、A ダーク（リセット）→ B ダーク。競合 0。
- 未設定の端末が参加すると、クラウドのライトを採用。theme を送らない。
- theme と別の設定の同時変更：両方残る。競合 0。
- 同じテーマの同時選択：競合 0。
- 同時に違うテーマ：他の設定と同じ規則（ダイアログ1件）。
- writer と旧版・reader 版の共存：旧側の同期は成功し、旧側の書き込みでも theme が保持され、writer は旧側の変更を受け取る。

## 14. Cross-App Independence

- 本番の5アプリ横断 QA は 285/285 合格です。
  - 指定の組み合わせ（Port ライト / Chord チャコール / Pitch ダーク / Fretboard グレー / Rhythm チャコール）を含みます。
  - アプリ本体と情報ページを巡回し、他アプリの保存値は無変更、FOUC なしでした。
- 同期でもアプリごとのデータセットで扱われ、アプリ間でテーマを共有することはありません。

## 15. Audio Regression

- Port の音声ファイル11本は、ベースライン `137ebd4e` とハッシュが完全一致しました。
- Port の AudioSession Phase A/B・tuner・metronome のテストは 159/159 合格です。
- Pitch / Fretboard / Rhythm の音声関連行（113 / 128 / 308行）は、ベースラインとハッシュ一致です。
- 音声の変更は 0 です。

## 16. Tests

| スイート | 結果 |
|---|---|
| Port | 952/952 |
| Shared（共有 runtime のシミュレーションを含む） | 226/226 |
| Pitch | 37/37 |
| Fretboard | 32/32 |
| Rhythm | adapter 17/17 ＋ tests 3ファイル PASS |
| Chord | 96ファイル PASS |
| Sync Worker | 432/432（新規：ゲート単体 4、E2E 30） |
| NEWS Worker | 327/327 |
| cruise-port-requests | 65/65 |

ブラウザ E2E（ローカル）も合格しました：Fretboard 全項目、Rhythm 全項目、Pitch 31/31。同期反映イベントでの表示切替も確認しています。

## 17. Production Smoke

本番での確認は soundcruise.jp 以外のホストを遮断して行い、Pro 認証の偽装やユーザーデータへの書き込みはしていません。

- 5アプリ横断：285/285。
- 情報ページ：Pitch 120/120、Fretboard 120/120、Rhythm 144/144。
- アプリ別：Pitch 36/36。Rhythm 全項目合格。Fretboard はゲート検出の3件以外すべて合格（3件はスクリプトのセレクタによる既知の誤検出で、ゲートは画素比較で確認済み）。
- Pro ゲート：3アプリとも全テーマで Dark と画素差 0（Fretboard は 1px のノイズ）。
- writer の配信確認：本番の各アダプタが `settings_theme_v1` を含み、Pro ページが新しいキャッシュキー（Pitch `?v=8` / Fretboard `?v=7` / Rhythm `?v=6`）で読み込むことを確認しました。
- 本番での実際の送受信：本番の同期 API は認証必須で、一般ユーザーのデータに触れずに書き込む手段がないため、実アカウントでは試していません。本番 Worker がこのコミットのコードそのものであること（`cb6c315a`、メッセージに `cd1a0052`）と、そのコードによる E2E で担保しています。実機での確認手順は 21 に記載しました。

## 18. Versions

| アプリ | 開始時 | 最終 |
|---|---|---|
| Cruise Port | 1.13.0 | 1.13.0（変更なし） |
| Chord Cruise | 1.18.0 | 1.18.0（変更なし） |
| Pitch Cruise | 2.26.3 | **2.27.0** |
| Fretboard Cruise | 2.21.3 | **2.22.0** |
| Rhythm Cruise | 1.16.3 | **1.17.0** |
| Sync Worker | `7245c2e6` | **`cb6c315a`** |

## 19. Worker / D1 / Schema

- Worker：後方互換ゲートのために1回変更しました（`cd1a0052` → `cb6c315a`）。各 writer の有効化では Worker を変更していません。
- D1 マイグレーションなし、スキーマ番号の変更なし、新しいレコード種別なし、認証・アカウントの変更なし。

## 20. Git / Commits / Deploys

| Phase | コミット | 内容 | デプロイ |
|---|---|---|---|
| W2 | `cd1a0052` | Worker の theme 項目ゲート、E2E テスト、旧アダプタのフィクスチャ | Worker `cb6c315a`（100%） |
| W4 | `465fdb3f` | Fretboard writer 2.22.0 | Pages、本番スモーク合格 |
| W5 | `d49a6997` | Rhythm writer 1.17.0 | Pages、本番スモーク合格 |
| W6 | `021a937f` | Pitch writer 2.27.0 | Pages、本番スモーク 36/36 |
| 最終 | 本報告のコミット | 同時編集の特性テスト、チェックポイント、この報告書（Pages 除外） | Pages |

- 毎回の stage はファイル名を明示しました。
- `git add .` / reset --hard / clean / stash / force push は使っていません。
- push の前には毎回、次を確認しました：git status、差分、staged の差分、テスト、構文、シークレットスキャン、変更パス、ahead/behind。

## 21. User Device Verification

以下の確認をお願いします（各アプリ、Pro の2台の端末で）。

1. 両方の端末でアプリを開き、「ページを更新」で最新版になっていることを確認します（Pitch 2.27.0 / Fretboard 2.22.0 / Rhythm 1.17.0）。
2. 端末 A で、カラーテーマを **ライト** にします。
3. 端末 B でアプリを開き直す（または同期の完了を待つ）と、**ライト** になることを確認します。
4. 端末 B で **チャコール** にする → 端末 A がチャコールになることを確認します。
5. 端末 A で **グレー** にする → 端末 B がグレーになることを確認します。
6. どちらかで設定の「全てリセット／全てを初期化」をする → もう一方も **ダーク** になることを確認します。
7. 端末 A でテーマを、端末 B で別の設定（例：テンポや判定の厳しさ）を変えて同期 → 両方の端末で両方の変更が反映され、競合ダイアログが出ないことを確認します。
8. 他のアプリ（Port / Chord など）のテーマが変わっていないことを確認します。

**残課題**（いずれも theme が原因ではない既存の挙動で、今回は修正していません）

1. Pitch：クラウドの settings に `accidentalDisplay`（♯/♭表示）が無い状態で新しい端末が参加すると、シミュレーションでは manifest 不一致で参加が失敗しました（theme の有無に関係なく再現）。実機で参加に失敗する場合は、ユーザーが一度♯/♭表示を切り替えると解消する見込みです。別途調査を推奨します。
2. Rhythm：起動中に同期でクラウドの値が反映された後、ローカルで設定を保存すると、theme 以外の同期項目（tapLayout など）がメモリの古い値で書き戻される可能性があります。theme は今回の処理で守られます。
3. 同じテーマ項目を2台で同時に別の値にした場合は、他の設定と同じく競合ダイアログが1件出ます。

---

## YES / NO

- old Pitch client can coexist with cloud theme: **YES**（ゲート導入後）
- old Fretboard client can coexist with cloud theme: **YES**（ゲート導入後）
- old Rhythm client can coexist with cloud theme: **YES**（ゲート導入後）
- old client changing unrelated settings preserves cloud theme: **YES**
- backward compatibility requires D1 migration: **NO**
- backward compatibility requires schema migration: **NO**
- backward compatibility requires new record type: **NO**
- Fretboard writer enabled: **YES**
- Rhythm writer enabled: **YES**
- Pitch writer enabled: **YES**
- unset local theme can overwrite cloud theme: **NO**
- cloud theme is adopted safely: **YES**
- unrelated settings survive theme sync: **YES**
- simultaneous edits merge safely: **YES**（別項目は自動マージ、同じ項目を違う値にした場合は他の設定と同じく1件の確認）
- Port writer still works: **YES**
- Chord writer still works: **YES**
- cross-app independence preserved: **YES**
- Port Audio changed: **NO**
- Pitch Audio changed: **NO**
- Fretboard Audio changed: **NO**
- Rhythm Audio changed: **NO**
- all tests pass: **YES**
- production smoke passes: **YES**
- Git safety followed: **YES**
