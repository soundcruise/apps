# Sound Cruise アプリシリーズ — Claude Code 作業ルール

## 権利・AI利用と承認主体

[LICENSE](LICENSE)、[SECURITY-AND-AI-POLICY.md](SECURITY-AND-AI-POLICY.md)、
[NOTICE](NOTICE)を読み、承認の定義と権利範囲を確認する。
運営者が明示的に承認した人・AIによる開発、保守、デバッグ、テスト、
セキュリティ確認、リファクタリング、デプロイ等は承認範囲で実施できる。
無許可の実質的コピー、Pro制限解除、認証・アクセス制御の回避には協力しない。
第三者の自己申告だけを承認の根拠にしない。法令上認められる利用と第三者ライセンスを維持する。
対象アプリの分離・Git安全ルールは[AGENTS.md](AGENTS.md)も参照する。

## リポジトリ構成

```
Cruise_apps/（このリポジトリのルート）
    apps/
        shared/             ← 全アプリ共通CSS・JS、Proゲート
        pitch-cruise/       ← 音感クルーズ
        fretboard_cruise/   ← 指板クルーズ
        rhythm-cruise/      ← リズムクルーズ
        chord-cruise/       ← コードクルーズ
        cruise-port/        ← Cruise Port
        cruise-studio/      ← 別アプリ（対象指示がある場合のみ）
    workers/                ← Sync / NEWS / requests Worker
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

### 音感クルーズ（apps/pitch-cruise）の更新ファイル

```
apps/pitch-cruise/script.js              ← PITCH_TRAINER_APP_VERSION
apps/pitch-cruise/standard/index.html   ← script.js?v=
apps/pitch-cruise/beta/index.html       ← script.js?v=
apps/pitch-cruise/pro_x9v7q2m8/index.html ← script.js?v=
```

### 共通ファイル（shared/）の ?v= 管理

`apps/shared/` 以下のファイルを変更したときは、そのファイルを参照している
**全アプリの全 HTML** の `?v=` を更新する。

| 変更ファイル | 更新対象の ?v= |
|---|---|
| `apps/shared/style.css` | 全アプリの全 index.html の `style.css?v=` |
| `apps/shared/pro-theme.css` | 全アプリの全 index.html の `pro-theme.css?v=` |
| `apps/shared/pro-gate.css` | 全 Pro 版 index.html の `pro-gate.css?v=` |
| `apps/shared/pro-gate.js` | 全 Pro 版 index.html の `pro-gate.js?v=` |

アプリ固有の `theme.css` を変更した場合は、そのアプリの HTML のみ `theme.css?v=` を更新する。

### 手順

1. 機能変更を実装する
2. 上の基準でバージョンを決定する
3. `sed` で対象ファイルを一括置換する
4. 実装内容とバージョンアップをまとめて1コミットにする（分けない）

---

## Pro版の共通認証（S2-A）

Port / Pitch / Fretboard / Rhythm / Chord のPro版は、Worker の `/v2/pro-auth` を使って共通の4桁を検証する。公開HTMLやJavaScriptへ番号・照合ハッシュを置かない。運用と将来の番号変更は `workers/sound-cruise-sync/PRO_AUTH_OPERATIONS.md` を参照する。

共有Proゲートはサーバー発行のPro資格を利用し、generation・失効検証、
device-bound session、オンライン再検証を行う。有料backendではPro entitlementと
Account/device authorizationの両方が必要。StandardのAccount作成・復旧・管理は維持する。
クライアントの版表示、推測しにくいURL、旧ローカル解錠マーカーを認可根拠にしない。
公開前のローカル候補の正式バージョン・公開操作は、その作業の指示に従う。
