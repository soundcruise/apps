# 譜面ビューワー 段階0 — ファイル・読み取り専用境界・拍時計

2026-11-16。基準 `bf533fe4`、作業ブランチ `codex/score-toolbar-ui`。Studioローカル候補 **0.144.0-dev.1**、Viewer基盤 **0.1.0-dev.1**。正式Studio 0.88.1は変更しない。[設計書](SCORE_VIEWER_DESIGN_20261116.md)の段階0の実装記録。

## 実装範囲

- `apps/score-viewer/core/` に、ホストに依存しないJSON検査・ファイルcodec・読み取り専用owner・拍時計を新設。
- Studioとの接点は `js/modules/sheet-cruise/viewer-contract.mjs`。既存schema2 validator、表示設定の許可リスト、発音計画を利用する。Viewer coreからStudioをimportしない。
- 既存 `sheet-renderer.js` に明示的な `readOnly:true` を追加。既定の編集画面の動作は維持。
- Studio/Portの入口、ファイル選択画面、永続ライブラリ、実音のスケジューラー、実スクロールは段階1〜2以降。現時点ではツール一覧にビューワーは増えていない。
- PDF・Service Worker・manifest・Worker・実Account/Syncは未変更。新規サーバー起動なし。既存 `http://127.0.0.1:18874/` を使い、破棄可能なブラウザprofileで検証。

## 閲覧用ファイル v1

拡張子 `.cruise-score.json`、JSON/UTF-8。外側の `formatVersion` は音楽データの `schemaVersion` と独立する。

```text
format: "sound-cruise/score-view"
formatVersion: 1
viewerDocumentId: 配布譜面のID
revisionId: この書き出し版のID
source:
  projectId: score.projectIdと同じ
  exportedAt: UTC ISO日時（ミリ秒を含む）
  studioVersion: 書き出し側の版
  scoreDigest: scoreのcanonical JSONに対するSHA-256
score: 検証済みschema2全体
defaultPresentation:
  version: 1
  layout: 現行の許可済み文字/色/書体/線/表示/フォーム/列数設定
  rows: [{barId, columns, used}]（実小節または空き枠IDを参照）
  zoom: 0.5〜3
  flow: "responsive" または "source"
requires: 音楽schema・拍子・使用中の素材encoding・配置能力
```

`score` は曲情報・原BPM・全イベント・ID・登録フォーム/使用弦・ストローク・配置・必要なprovenanceを欠落なく保持する。音楽データの別schemaへの変換やmigrationはしない。旧曲JSONの互換読み込みは段階1以降の別入口とする。外側にSession・Account資格・端末キーの欄は設けず、未知の外側フィールドは拒否する。音楽schema内の任意extensionsを認可情報として解釈しない。

書き出し時は、最初の非同期処理に入る前に元Projectを検証・コピーする。ハッシュ計算中にエディターの状態が変わっても、出力へ混入しない。ID・書き出し日時・版は呼出側が渡し、codecから時計・乱数・保存先へアクセスしない。

canonical JSONはオブジェクトのキーをソートし、配列順・値・文字列を保持する。音楽digestはキー順/整形に依存しない。一方、codecが返す `byteHash` は入力ファイルの元bytesに対するSHA-256であり、文書の中には入れない。整形の違いでbyteHashだけ変わり得る。これは転送整合性の検査であり、発行者の認証・電子署名ではない。

### 検証と予算

- 外側13MiBまで。UTF-8のdecode/JSON.parse前にbyte長を検査し、不正UTF-8も拒否する。
- 音楽部分は現行schema2の `JSON.stringify(score).length * 2 <= 8MiB` と最大2048小節をそのまま使用。前者の4Mi UTF-16 code unitsはUTF-8で最大12MiBになり得るため、外側13MiBと混同しない。
- 初期表示の一般設定は入力・正規化後とも64KiBまで。ビューワー0.19.1-dev.1以降は、小節ごとの入力グリッド（gridRows）に別途896KiBまで使用できる。現行の許可書体ID/HEX色等のみ採用する。未知の任意表示項目や補正した値は `presentation-normalized` を返す。画面での案内は次段階。
- 未対応の必須能力・schema・拍子、未知の必須表示version、壊れた参照、digest不一致、行設定の不正な参照は拒否。
- accessor/toJSON/循環参照/疎配列/非有限数は、直接APIへ渡されても書き出さない。
- 素材を参照するbindingがあるのに実体がない場合は、schema不整合としてファイル全体を拒否。bindingのないコードを含む有効な曲は開き、`unbound-form:no-automatic-voicing` を返す。別フォームの自動生成・インストールはしない。

## 読み取り専用の境界

`createReadOnlyScore` は検証済みの文書と端末側表示設定だけを所有する。Repository、EditingSession、保存/Undo/編集コマンドを受け取るAPIはない。公開する文書は再帰的にfreezeする。`setPresentation()` は別の設定値を更新し、文書の原BPM・元の初期表示・byteHashを変えない。

`open()` は検証とハッシュ確認の後、一度だけ現在文書を差し替える。失敗時は現在文書を保持する。同時読み込みの古い結果、dispose後の結果は採用しない。演奏中は差し替えを拒否し、読み込みの途中から演奏が始まった場合も採用しない。永続保存・revisionライブラリ・前版への復帰は次段階の保存adapterの責務。

`renderWith()` は呼出側の指定より優先して `readOnly:true, editableSlots:false` を渡す。rendererは編集用data属性、tabIndex、button role、編集用ARIA、空き枠の編集説明を取り除き、セクション再生ボタンを生成しない。編集/閲覧モードを跨ぐ際は、contentKeyが同じでも小節DOMを再利用しない。以前のDOMに付いたイベントリスナーも持ち越さない。閲覧同士の再配置は再利用できる。

ホスト側には引き続き、ビューワー専用containerと操作ルーターを用意する必要がある。既存エディターの親イベントハンドラーへビューワーを取り付ける設計にはしない。freezeやUI属性の除去は同一originの任意JavaScriptに対するアクセス制御/DRMではない。

## 共通の拍時計

`createBeatClock` は、秒単位の単調時計 `now()` を1つだけ注入する。音ありではAudioContext.currentTime、無音ではperformance.now()/1000を使う予定。時計自体はAudioNode、RAF、setTimeout、保存処理を持たない。

- 音声と描画の両方が、同じ `snapshot()` のtick/小節ID/小節内tickを読む。
- 現行4/4・480ticks/beat・1920ticks/barに限定。実小節だけが時間を持つ。無音の実小節も進み、斜線の空き枠や行末paddingは進行時間を増やさない。
- `setTempo()` はその瞬間の小数tickを保持し、新BPMを次の起点にする。元ProjectのBPMへ書き込まない。
- `pause(reason)` は位置を保持し、`play()` で同じ拍から再開する。停止中の実時間を加算しない。`seek()` は停止中のみ。終端は止まり、先頭へ自動復帰しない。
- 再生/停止/テンポ/seek/終端/disposeでgenerationを更新する。古いgenerationの発音予約は `valid()` で無効となり、`timeAtTick()` でも拒否する。
- `createEventCursor` は短い先読み範囲の予約ticketを発行する。既発行の将来音はテンポ変更後に再計算し、同一tickの異なる弦/声部は別イベントとして残す。開始後の最初のフレームが少し遅れても冒頭音を落とさず、同じ位置でテンポ変更/停止再開しても既発行の開始音を重複しない。

**まだ実音を予約する処理ではない。** 段階2では旧generationの未発音AudioNode予約を実際に取り消すhandle、発音済みの余韻/消音、Context中断・画面非表示・ホスト離脱のpause接続を実装する。ticketの無効化だけでWeb Audioの予約が自動消去されるわけではない。

Studio adapterの `playbackPlan()` は、指定BPMのコピーに既存の発音計画を適用する比較用契約。登録フォームの弦順、down/up、同音の別弦、休符/ミュート、メロディの音高/時間を維持する。bindingなしでは参考和音へ代替しない。これは全曲のAudioNode一括作成やライブテンポ変更の実装ではない。連続スクロールの行座標との結合も段階2。

## 検証

基準fixtureは自社の合成曲 `createUITestProject()`。登録フォーム・上下ストローク・空欄・歌詞・メロディ・明示休符・空き枠を使用。native rhythm snapshotと、2048実小節の上限fixtureも含む。ユーザーの実データや実アカウントは使用しない。

実行結果はPROJECT_STATEの先頭に記録。追加の試験ファイル：

- `tests/viewer-contract.test.mjs`：ファイル往復、参照/ハッシュ/能力/容量/不正入力、読み取り専用owner、端末設定分離、既存発音計画比較。
- `tests/viewer-clock.test.mjs`：テンポ・停止再開・seek・予約generation・開始音の欠落/重複防止・2048小節。
- `tests/viewer-contract.browser.cjs`：Chrome/WebKitで実際のrenderer/codec/共通時計。編集属性・リスナーを持ち越さず、元Session/履歴/localStorageを保持することを検証。

既存の全Node試験、譜面ブラウザ回帰、長い譜面のDOM再利用試験も実施。WebKit自動試験をSafari実機確認とは呼ばない。スマホ実機、音の聴感評価、実オフライン、PDF、実Syncは今回の検証対象外。

次は段階1：専用画面、Studio入口、書き出し/読込UI、保存adapter、縦横layout。段階0の時点で、伴奏・メロディを含む初期製品版が完成したとは扱わない。
