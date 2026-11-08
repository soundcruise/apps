# Port 1.30.0 最終公開計画（公開未実施）

## 実設定（2026-11-08 JST、GitHub APIによる読取確認）

- Pages: build_type=legacy、source=`codex/port-1.28.0-release-20261106`、path=`/`。
- 公開先: https://soundcruise.jp/、HTTPS enforced。
- 最新成功build/deployment: `ed87b93e9c57fe5b58e2e76aa71ef32edc9bdcbc`、run 42445075104。
- 公開ブランチへのpushを受けて、GitHub管理の `dynamic/pages/pages-build-deployment` がサイト全体を生成・配信する。
- 独自 `.github/workflows` はない。公開ブランチの `_config.yml` の除外規則でworkers等を除外する。
- mainへのmergeそのものは現在のPagesの公開トリガーではない。

#244の31ファイルをmainへmergeする行為と、公開ブランチの8製品資産を更新する行為は別。
#244を公開ブランチへmerge/cherry-pickしたり、main全体を公開ブランチへコピーしてはいけない。
試験・証跡・生成スクリプトはmain側の管理用であり、公開ブランチへ持ち込まない。

## 生成済み候補と検証

`/private/tmp/port-pages-final/prepared-v2/`：

- `release-source/`・`release-site/`: 公開ブランチの全資産に8ファイルだけを重ねた1.30.0。
- `recovery-source/`・`recovery-site/`: 新規Midnightボタンを隠し、readerと既存Midnight配色を残す1.30.1。
- `baseline-source/`・`baseline-site/`: ed87b93eの比較用。復旧先としてそのまま使用しない。
- `PAGES-PREPARED-MANIFEST.json`: 各site全1059ファイルのSHA-256、生成元、差分一覧。

既存ローカルJekyll 3.10.0 `--safe` で3候補をビルド。公開用・復旧用とも差分は次の8ファイルだけ。
生成HTML/JS/CSSがsource bytesと一致し、その他1051生成ファイルはbaselineと同一。
GitHub上の全配信artifactをダウンロードして同一性検証したものではなく、同じ公開source/configからのローカル再現試験。

`index.html`, `pro_9a3943176561/index.html`, `app-version.js`, `practice-menu-app.js`,
`pro-app-boot.js`, `settings-store.js`, `style.css`, `tuner-app.js`（すべてapps/cruise-port/配下）。

復旧用の保存ロジックは公開用と同一（cache/version文字列だけ1.30.1）。
AI相談・NEWS・Pro・Account・Syncと他アプリ/Studioの資産を両候補で保持。
復旧readerで保存Midnight、文字サイズ保存、pendingからの再起動復元、明示Gray選択、両HTML bootstrapを試験。
新規試験4 PASS、全生成物のハッシュ再検証もPASS。既存ブラウザ試験は反復しない。

再生成は `scripts/prepare-pages-midnight.py --out <新規リポジトリ外ディレクトリ> --release-ref <承認時の公開branch SHA> --jekyll <既存jekyll executable>`。
GEM_HOME/GEM_PATHは既存Jekyll環境を指定。scriptにpush/deploy処理はない。
公開済みAI/法務が変わっていれば生成は拒否する。バージョン・sourceのドリフトは無視しない。

## 復旧方式の保証範囲

1.30.1は**新しいMidnight選択を止める復旧候補**であり、旧1.29への丸戻しではない。
既存Midnightは表示と保存を保持し、旧4テーマを明示選択できる。pending復元readerを残す。
`cruisePort.midnightTheme.v1` / `cruisePort.midnightTheme.pending.v1` を削除しない。
cursor/outbox/Account・Pro情報も削除しない。既存AI/NEWS等の資産を巻き戻さない。
reader自体に未知の不具合が見つかった場合、この候補で直るとは保証しない。
その場合は対象操作を止め、保存値を保持するreaderの前進修正が必要。データ消去で復旧しない。

## 実機・実資格の整理

現在の1.29.0でユーザーが確認できるもの：既存実Pro起動、既存Account/Sync状態、Studioから既存Portを開く経路。
認証コードに変更がないため、この確認は既存認証の事前基準として有効。ただし候補の受入を代替しない。

候補環境が必要なもの：候補Pro boot/cache、Midnight/pending readerと実Safari/Chrome、認証済みStudioへの間接影響。
実Pro情報は本人だけが操作し、Codexのブラウザ制御・画面取得・入力記録を止める。
実ユーザーデータを使わず、既存の承認済みテストAccount/検証用ブラウザが必要。新しい認証仕組みは開発しない。

通常版の最短手順：

- Android: ローカルpreviewを起動→本人がUSB/ADBで `adb reverse tcp:18741 tcp:18741`→端末Chromeのlocalhostで通常版を開く。
- iPhone: 同じ私設LAN、端末で信頼済みの証明書・ホスト名を本人が用意→previewをHTTPS起動→Safariの新規検証用画面で開く。
- Midnight選択→reload→終了/再起動→旧4テーマへ変更。フォント/表示サイズ保持、旧画面との混在を確認する。

offline previewは本番APIを遮断する。実Pro資格を入力しない。実Pro/Studioの候補受入には、
既存backendが許可したoriginとHTTPSで候補を配信できる、既存の承認済み環境が必要。
現在その環境は確認できていない。PagesはPR previewを自動提供しない。外部previewやWorker設定は作らない。

## A/Bの比較と推薦

| 方式 | 追加準備 | リスクと最短工程 |
|---|---|---|
| A: 全確認を公開前に完了 | 実端末、実Pro本人操作、承認済みテストAccount、候補を配信できる既存許可origin/HTTPS | 公開前の不確実性が最少。ただし認証候補originが未確保なので現制約のまま直ちには成立しない。環境提供→全受入→8ファイル公開。 |
| B: 変更範囲を限定して公開直後に受入 | 生成済み公開/復旧候補、ユーザーの端末・実Pro操作と担当者/復旧判断基準を同時待機 | 新しい認証環境が不要で最短。ただし公開直後に未検証の実機動作へ利用者が接触し得る。公開→即時受入→不合格なら復旧。 |

**推薦はB（ユーザーが残リスクを承認し、直後の受入/復旧担当が待機できる場合）。**
「限定」はPortの8変更ファイルと観測時間を限定する意味であり、利用者別canaryではない。
公開後は全利用者が新UIへ到達できる。利用者限定が必要ならBは選べず、Aの環境準備が必要。
認証コード・backend・保存schemaを変更していないため認証の新規仕様リスクは低いが、未試験をPASSにはしない。

## 承認後の一括工程（今回は実行禁止）

1. 承認内容が「公開branchへの8ファイルpushによる本番配信」と復旧条件まで含むことを確認。
   main mergeの承認だけでは公開branchへpushしない。端末/本人操作/復旧担当を待機させる。
2. Pages source設定と公開branchの最新SHA、配信Portのhashを再照合。ed87から進んでいれば新baseから再生成し、
   全生成物の差分8ファイルと非変更資産同一性を再検証。既存Studio等の追加を巻き戻さない。
3. 最新公開branchから隔離作業branchを作成し、release-sourceの8ファイルだけをコピー。
   git diffパス・SHA-256をmanifestと照合。試験/証跡31ファイルやmainの他変更を含めない。
4. 8ファイルだけを1commitにし、公開branchが確認SHAのままのときだけ通常のfast-forward push。
   force pushはしない。進んでいれば中断して最新baseへ再構成する。
5. GitHub管理Pages build/deploymentの成功とcommit SHAを追跡。配信8ファイルと代表的な非変更資産をhash照合。
   これはサイト全体の再配備だが、生成物差分は承認8ファイルに限定する。
6. 本人が実端末通常/Proと既存認証済みStudio Portを直ちに受入。Codexは資格を扱わない。
   保存/再起動不整合、Pro起動不能、既存機能消失なら受入失敗。調査中にデータ消去を案内しない。
7. 復旧条件に該当したら、最新公開headへrecovery-sourceの8ファイルを適用し、非変更資産を再検証して前進commit。
   配信成功と1.30.1のhash、pending復元/既存4テーマ操作を確認。任意の旧commitへのreset/force pushはしない。

公開計画・復旧準備は完了。本番公開の最終判定は**HOLD（承認と実機/実資格受入が未完）**。
main merge・公開branchへのpush・Pages設定変更・Worker/D1/R2操作は今回一切行っていない。
