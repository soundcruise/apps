あなたは優秀なフロントエンドエンジニアです。
以下の仕様と既存のリポジトリ構造に基づき、PWAとして動作するアプリ「指板クルーズ」を実装してください。

---

# 【既存リポジトリ構造】

このアプリは以下のモノレポに追加します。

```
apps/                              ← リポジトリルート（soundcruise.jp を配信）
    CNAME                          ← soundcruise.jp
    apps/                          ← このサブフォルダが URL /apps/ に対応
        pitch-cruise/              ← 既存アプリ（soundcruise.jp/apps/pitch-cruise/）
            theme.css
            script.js
            standard/index.html
            pro_x9v7q2m8/index.html
            staging/index.html
        fretboard_cruise/          ← ★今回作成（soundcruise.jp/apps/fretboard_cruise/）
            theme.css
            script.js
            standard/
                index.html
                service-worker.js
                manifest.json
            pro_x9v7q2m8/
                index.html
                service-worker.js
                manifest.json
            staging/
                index.html
                service-worker.js
                manifest.json
        shared/                    ← 全アプリ共通ファイル（soundcruise.jp/apps/shared/）
            style.css              ← 全アプリ共通ベーススタイル（:root カラー変数なし）
            pro-theme.css          ← Pro版UIテーマ
            pro-gate.css           ← Pro認証画面スタイル
            pro-gate.js            ← Pro認証ロジック（window.__SOUNDCRUISE_PRO_GATE__ を読む）
```

---

# 【出力するファイル一覧】

以下のファイルをすべて出力してください。

1. `apps/fretboard_cruise/theme.css`
2. `apps/fretboard_cruise/script.js`
3. `apps/fretboard_cruise/standard/index.html`
4. `apps/fretboard_cruise/standard/service-worker.js`
5. `apps/fretboard_cruise/standard/manifest.json`
6. `apps/fretboard_cruise/pro_x9v7q2m8/index.html`
7. `apps/fretboard_cruise/pro_x9v7q2m8/service-worker.js`
8. `apps/fretboard_cruise/pro_x9v7q2m8/manifest.json`
9. `apps/fretboard_cruise/staging/index.html`
10. `apps/fretboard_cruise/staging/service-worker.js`
11. `apps/fretboard_cruise/staging/manifest.json`

---

# 【各ファイルの実装ルール】

## theme.css
- `apps/shared/style.css` には `:root` カラー変数が存在しない
- 指板クルーズ固有のカラー変数をここに定義する
- 参考（音感クルーズの変数名）：

```css
:root {
    --bg-color: #0d1117;
    --surface-color: #161b22;
    --primary-color: #4f9cf9;      /* 指板クルーズは青系テーマ */
    --secondary-color: #7c6af7;
    --text-color: #f0f6fc;
    --white-key-color: #fdfdfd;
    --black-key-color: #333333;
    --key-active-color: #4f9cf9;
    --error-color: #ff4f6e;
    --in-game-refresh-stack-height: 96px;
}
```

## script.js
- 先頭に `const FRETBOARD_CRUISE_APP_VERSION = '1.0.0';` を定義する
- アプリ全体のロジックをここに実装する
- localStorage キーのプレフィックスは `fretboard_cruise_` を使う
- `window.FRETBOARD_CRUISE_APP_VERSION` として外部参照可能にする

## standard/index.html・pro_x9v7q2m8/index.html・staging/index.html
- CSS の読み込み順（必須）：

```html
<link rel="stylesheet" href="../../shared/style.css?v=97">
<link rel="stylesheet" href="../../shared/pro-theme.css?v=98">
<link rel="stylesheet" href="../theme.css?v=1">
<!-- Pro版のみ追加 -->
<link rel="stylesheet" href="../../shared/pro-gate.css?v=4">
```

- `../../shared/` は `apps/shared/` に解決される（相対パスは変更不要）
- フォント：`Outfit` (Google Fonts, wght 300;500;700;800)
- script.js の読み込み：`<script src="../script.js?v=1.0.0"></script>`
- バージョン表示エリアを必ず body 末尾付近に配置（共通 UI）：

```html
<div id="in-game-refresh-bar" class="in-game-refresh-bar">
    <span id="app-version-display" class="app-version-display"></span>
    <button type="button" class="btn-secondary btn-in-game-refresh js-reload-app">ページを更新</button>
</div>
```

## Pro版（pro_x9v7q2m8/index.html）の認証
- `../../shared/pro-gate.js` の **前** に inline script でパスワード設定を記述：

```html
<script>
    window.__SOUNDCRUISE_PRO_GATE__ = { password: '0000' };
</script>
<script src="../../shared/pro-gate.js?v=16"></script>
```

- `data-app-edition="Pro"` を `<html>` タグに付与する
- `<title>` は「指板クルーズ」（Pro表記なし）

## manifest.json（全エディション共通パターン）

アイコンは pitch-cruise と共用（`apps/` 直下の `icon_pwa_192.png` / `icon_pwa_512.png` を参照）。
各エディションのフォルダから見た相対パスは `../../icon_pwa_192.png`。

```json
{
  "name": "指板クルーズ",
  "short_name": "指板クルーズ",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0d1117",
  "theme_color": "#4f9cf9",
  "description": "ギター指板の音名を覚えるトレーニングアプリ。",
  "icons": [
    { "src": "../../icon_pwa_192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "../../icon_pwa_512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- Standard・Staging 版はこのまま使う
- Pro 版は `"src"` を `"../../pro_icon_192.png"` に変更する（pitch-cruise と共用）

## service-worker.js（全エディション共通パターン）

```javascript
const GATE_VERSION = 5; // パスワード変更時に +1（開きっぱなしのユーザーも即退出させたい場合）
const CACHE_NAME = 'fretboard-cruise-{edition}-v1';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
    e.waitUntil(Promise.all([
        caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))),
        self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
            clients.forEach(c => c.postMessage({ type: 'PRO_GATE_INVALIDATE', version: GATE_VERSION }));
        })
    ]));
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    if (e.request.mode === 'navigate') {
        e.respondWith(fetch(e.request, { cache: 'no-cache' }));
        return;
    }
    e.respondWith(fetch(e.request));
});
```

- `CACHE_NAME` は各エディションで固有の名前にすること
- Standard・staging 版の `GATE_VERSION` は 0 でよい（Pro 専用機能）

## staging/index.html
- URLパラメータ `?k=x9v7q2m8` がないと 404 ページを表示するアクセス制御を先頭に入れる
- 各版（standard / pro / staging）へのリンクを一覧表示するハブ画面にする
- Pro 版へのリンクには `?stagingPreview=1` を付与する

---

# 【アプリ仕様】

## ■ 目的
ギター指板の音名を暗記し、コード・スケール・キー視点で理解できるトレーニングアプリを作る。

## ■ 技術要件
- PWA（HTML / CSS / Vanilla JavaScript）
- スマホ縦画面最適化・タップ操作前提
- localStorage で状態保存（プレフィックス：`fretboard_cruise_`）
- フレームワーク不使用

---

## ■ ホーム画面
- タイトル：指板クルーズ
- ボタン：
  ① 覚えるコース
  ② 見える化コース（Pro）
- 下部：設定ボタン

---

## ■ 覚えるコース
【目的】指板の音名を暗記する

### UI
- 上部：レベル / 正解数 / 連続正解数
- 中央：問題文（例「4弦5フレットの音は？」）
- 回答ボタン：C D E F G A B（# 含む）
- 下部：指板表示（0〜12フレット）

### 挙動
- 回答すると即時判定
- 正解：緑表示 → 0.5秒後に次の問題へ
- 不正解：赤表示 + 正解表示 → 0.5秒後に次の問題へ

### レベル
- Level1：開放弦
- Level2：1〜3フレット
- Level3：1〜5フレット
- Level4：1〜7フレット
- Level5：1〜12フレット

---

## ■ 見える化コース（Pro限定）
【目的】指板を音楽的に理解する

### UI
- 上部：設定パネル（キー選択 C〜B、カポ 0〜7、表示モード切替）
- 中央：指板（6弦 / 0〜12フレット）
- 下部：ダイアトニックコード一覧・コード選択UI

### 表示モード
- 音名：C D E F G A B
- 度数：1〜7（キー依存）
- 移動ド：ドレミ表示
- スケール：スケール音／非スケール音を区別
- コード：ルート / 3rd / 5th / 7th 色分け

### 色ルール
- ルート：赤
- 3rd：青
- 5th：緑
- 7th：紫
- 非対象音：グレー薄表示

---

## ■ 指板データ

標準チューニング（6弦→1弦）：E A D G B E
0〜12フレットの全音を生成する関数を実装すること。

```javascript
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OPEN_STRINGS = [4, 9, 2, 7, 11, 4]; // E A D G B E（インデックス）
```

---

## ■ ロジック

### 度数計算
キーに対して音を相対変換（メジャースケール）

### コード構成音（例）
- C → C E G
- Am → A C E
- G7 → G B D F

### スケール
メジャースケールのみ実装（MVP）

---

## ■ カポ処理
- カポ位置に応じて実音を変換
- 表示切替：フォーム音 / 実音 / 度数 / 移動ド

---

## ■ 状態管理（localStorage）
- 現在のモード
- キー
- カポ
- 表示設定
- スコア

---

## ■ MVP範囲
- 覚えるコース：完全実装
- 見える化コース：音名・度数モードのみ実装（コード選択UI は UI のみ、ロジックは次フェーズ）

---

# 【UI / UX 方針】
- シンプルで直感的
- 指板の視認性を最優先（文字は大きく、タップ領域を広く）
- 処理は軽く
- スマホ操作に最適化
- `apps/shared/style.css` が提供するクラスを積極的に活用する（下記一覧参照）

---

# 【apps/shared/style.css で使えるクラス一覧】

新規にスタイルを書く前に、以下のクラスを優先して使うこと。

| クラス | 用途 |
|---|---|
| `.app-container` | 画面全体のラッパー |
| `.hidden` | 要素を非表示にする |
| `.stats` | スコア表示エリア（上部バー） |
| `.stat-item` | スコアの各項目 |
| `.stat-item .label` | スコアラベル（小文字） |
| `.stat-item .value` | スコアの値（大きめ） |
| `.feedback-display` | 正解/不正解フィードバック表示エリア |
| `.feedback-correct` | 正解時の緑フィードバック |
| `.feedback-wrong` | 不正解時の赤フィードバック |
| `.note-buttons` | 音名ボタン群のコンテナ |
| `.note-btn` | 音名ボタン単体 |
| `.note-btn.correct` | 正解ボタンの緑ハイライト |
| `.note-btn.wrong` | 不正解ボタンの赤ハイライト |
| `.level-buttons` | レベル選択ボタン群 |
| `.btn-primary` | 主要アクションボタン（塗りつぶし） |
| `.btn-secondary` | サブアクションボタン（アウトライン） |
| `.icon-btn` | ヘッダー等のアイコンボタン |
| `.action-btns` | ボタン群をまとめるコンテナ |
| `.overlay` | モーダル背景オーバーレイ |
| `.modal` | モーダルダイアログ本体 |
| `.home-title` | ホーム画面のタイトル（h1） |
| `.setting-group` | 設定項目グループ |
| `.preset-select` | セレクトボックス |
| `.switch` + `.slider` | ON/OFFトグルスイッチ |
| `.in-game-refresh-bar` | 右下の「Ver＋ページを更新」バー |
| `.app-version-display` | バージョン番号テキスト |
| `.btn-in-game-refresh` | 「ページを更新」ボタン |
| `.app-update-banner` | アップデート通知バナー |

---

# 【重要な注意事項】
- `apps/shared/` 以下のファイルは既に存在する。**出力しない・変更しない**
- `apps/pitch-cruise/` 以下のファイルも**変更しない**
- 出力するのは `apps/fretboard_cruise/` フォルダ以下の11ファイルのみ
- `index.html` 内に `<style>` でアプリ固有のスタイルを追加することは可（shared ファイルとの競合に注意）
