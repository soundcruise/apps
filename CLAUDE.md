# Sound Cruise アプリシリーズ — Claude Code 作業ルール

## リポジトリ構成

```
Cruise_apps/（このリポジトリのルート）
    shared/              ← 全アプリ共通CSS・JS
    pitch_trainer/       ← 音感クルーズ
    fretboard_cruise/    ← フレットボードクルーズ（開発予定）
```

---

## バージョン番号の自動判断・自動適用

コードを変更したとき、**ユーザーから指示がなくても** 以下のルールでバージョンを判断して上げる。

### 判断基準

| 変更の種類 | 上げる桁 | 例 |
|---|---|---|
| バグ修正・文言変更・スタイル微調整・設定値変更など、機能の追加がないもの | パッチ（右） | 1.16.1 → 1.16.2 |
| 新機能・新UI要素・新画面の追加、ユーザーが気づく動作変更 | マイナー（中）、右は 0 に戻す | 1.16.2 → 1.17.0 |
| 大規模な仕様変更・設計の刷新 | メジャー（左）、中・右は 0 に戻す | 1.17.0 → 2.0.0 |

1回のコミットに複数種類の変更が混在する場合は、最も大きい種類に合わせる。

### 音感クルーズ（pitch_trainer）の更新ファイル

```
pitch_trainer/script.js              ← PITCH_TRAINER_APP_VERSION
pitch_trainer/standard/index.html   ← script.js?v=
pitch_trainer/beta/index.html       ← script.js?v=
pitch_trainer/pro_x9v7q2m8/index.html ← script.js?v=
pitch_trainer/staging/index.html    ← script.js?v=
```

### 共通ファイル（shared/）の ?v= 管理

`shared/` 以下のファイルを変更したときは、そのファイルを参照している
**全アプリの全 HTML** の `?v=` を更新する。

| 変更ファイル | 更新対象の ?v= |
|---|---|
| `shared/style.css` | 全アプリの全 index.html の `style.css?v=` |
| `shared/pro-theme.css` | 全アプリの全 index.html の `pro-theme.css?v=` |
| `shared/pro-gate.css` | 全 Pro 版 index.html の `pro-gate.css?v=` |
| `shared/pro-gate.js` | 全 Pro 版 index.html の `pro-gate.js?v=` |

アプリ固有の `theme.css` を変更した場合は、そのアプリの HTML のみ `theme.css?v=` を更新する。

### 手順

1. 機能変更を実装する
2. 上の基準でバージョンを決定する
3. `sed` で対象ファイルを一括置換する
4. 実装内容とバージョンアップをまとめて1コミットにする（分けない）

---

## Pro版パスワード変更手順

パスワードを変えると、**次回ページを開いたとき自動で全員が強制退出**される。
アプリを開きっぱなしのユーザーも即退出させたい場合は GATE_VERSION も +1 する。

### 音感クルーズ（apps/pitch-cruise）

| ファイル | 変更箇所 | 操作 |
|---|---|---|
| `apps/pitch-cruise/pro_x9v7q2m8/index.html` | `window.__SOUNDCRUISE_PRO_GATE__` の `password` | 新しいパスワードに変更（これだけで次回アクセス時に全員退出） |
| `apps/pitch-cruise/pro_x9v7q2m8/service-worker.js` | `GATE_VERSION` | +1（開きっぱなしのユーザーも即退出させたいときのみ） |
