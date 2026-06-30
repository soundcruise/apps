# リズムクルーズ マイクシステム全体像

この資料は v0.12.94 時点の現在仕様をまとめたものです。既存の `MIC_CORRECTION_DESIGN.md` は古い設計思想メモとして残し、このファイルでは実装・実機確認後の現在状態を整理します。

## 現在の安定版

| 項目 | 内容 |
|---|---|
| バージョン | v0.12.94 |
| commit | `81ae02a` |
| commit message | `端末種別と補正ルートの不一致を防止` |
| 実機確認済み | Android通常マイク / Android有線イヤホン / Android Bluetoothイヤホン / iPhone通常マイク |
| 最優先方針 | 補正・保存・判定・測定・クリック音量ロジックは現状維持 |

現時点では、実機確認済みの補正フローを安定版として扱います。特に Android通常マイク、Android有線、Android Bluetooth、iPhone通常マイクは、実機OK状態を崩さないことを優先します。

## マイク補正フロー全体

| ステップ | 役割 |
|---|---|
| 1. 端末選択 | iPhone用ルート / Android用ルートを選ぶ。v0.12.94 では実機OSと選択ルートの不一致を入口で止める |
| 2. 入力タイプ選択 | 通常マイクかイヤホン接続かを選ぶ |
| 3. イヤホン種類選択 | イヤホン接続時に、有線イヤホンか Bluetoothイヤホンかを選ぶ |
| 4. 音ズレ・遅延テスト | クリック音や測定音がマイクへ届くまでの遅れを測り、端末/入力タイプごとの補正値へ反映する |
| 5. マイク反応テスト | ストローク音を拾うためのマイク感度、クリック音量、クールダウンを推定する |
| 6. 最終確認テスト | Practiceに近い状態で、判定補正・感度・クリック音量が実用できるか確認する |
| 7. 手動設定・保存 | 必要に応じて音ズレ補正、マイク感度、クリック音量を調整し、プリセットとして保存する |

各テストは、測るもの、保存するもの、Practiceへ渡すものを分けて扱います。音ズレ・遅延テストは入力遅延、マイク反応テストはPractice用の入力設定、最終確認テストはPractice条件での確認を担当します。

## 端末選択と入口ガード

v0.12.94 では、実機OSとユーザーが選んだ補正ルートが食い違った場合、補正フローへ進む前に止めます。

- `onPickWizardPlatform(platform)` の先頭で判定する
- `selectedTestPlatform = platform` より前に止める
- iPhone / iPad実機で Androidルートを選んだ場合は `alert()` で停止
- Android実機で iPhoneルートを選んだ場合は `alert()` で停止
- unknown端末は止めない
- 補正ロジック、保存ロジック、判定ロジックには到達させない

止める理由は、実機OSと選択ルートが食い違うと、表示、保存先、判定式が混在する可能性があるためです。入口で止めることで、`selectedTestPlatform` の変更、初期補正値の適用、`saveSettings()`、画面遷移を発生させません。

## 入力タイプ別の保存先と判定式

| 実機 / ルート | 入力タイプ | 保存先 | 判定式 | `usedOffsetSource` | 現在の状態 | 注意点 |
|---|---|---|---|---|---|---|
| iPhone / iPhoneルート | 通常マイク | `timingOffsetMs` | `timingOffsetMs` | Android専用ログでは通常出ない | 実機OK | v0.12.93で赤い警告カード条件を調整済み |
| iPhone / iPhoneルート | 有線イヤホン | `wiredMicOffsetMs` | `timingOffsetMs + wiredMicOffsetMs` | Android専用ログでは通常出ない | 現状維持 | iPhone通常マイクの `timingOffsetMs` とイヤホン補正値を合算する構造 |
| iPhone / iPhoneルート | Bluetoothイヤホン | `bluetoothMicOffsetMs` | `timingOffsetMs + bluetoothMicOffsetMs` | Android専用ログでは通常出ない | 現状維持 | Bluetooth系は遅延が大きくなりやすい |
| Android / Androidルート | 通常マイク | `androidBuiltinMicOffsetMs` | `androidBuiltinMicOffsetMs` 単独 | `androidBuiltinMicOffsetMs` | 実機OK | v0.12.90で `timingOffsetMs` を重ねない形に修正済み |
| Android / Androidルート | 有線イヤホン | `androidWiredMicOffsetMs` | `timingOffsetMs + androidWiredMicOffsetMs` | `androidWiredMicOffsetMs` | 実機OK | 実機ログでは `timingOffsetMs = 0` のため、実質 `androidWiredMicOffsetMs` 単独。コード上は潜在リスクとして記録 |
| Android / Androidルート | Bluetoothイヤホン | `androidBluetoothMicOffsetMs` | `timingOffsetMs + androidBluetoothMicOffsetMs` | `androidBluetoothMicOffsetMs` | 実機OK | 実機ログでは `timingOffsetMs = 0` のため、実質 `androidBluetoothMicOffsetMs` 単独。コード上は潜在リスクとして記録 |

`usedOffsetSource` は、Android専用デバッグ表示で「どの専用補正値を優先しているか」を示すラベルです。有線 / Bluetooth では `usedOffsetSource` が `androidWiredMicOffsetMs` / `androidBluetoothMicOffsetMs` でも、現在の判定式としては `timingOffsetMs` も合算されます。

## Android通常マイクの重要履歴

### v0.12.89

Android通常マイクの遅延保存を修正しました。

それ以前は、ユーザー向け Android ルートが内部的に `android_ios_style_trial` へ接続されている一方、保存条件が旧 `selectedTestPlatform === 'android'` に寄っていたため、測定した Android本体マイク補正値が正しく保存されない問題がありました。

v0.12.89 以降は、Android通常マイクの音ズレ・遅延テスト結果が `androidBuiltinMicOffsetMs` に保存されます。

### v0.12.90

Android通常マイクの判定二重補正を修正しました。

以前は Android通常マイクで以下の形になっていました。

```text
timingOffsetMs + androidBuiltinMicOffsetMs
```

このため、`timingOffsetMs = -80` などが残っていると、Android専用補正値にさらに `timingOffsetMs` が重なり、最終確認テストが大きく早めにズレる問題がありました。

現在は Android通常マイクだけ、以下の形です。

```text
androidBuiltinMicOffsetMs
```

`timingOffsetMs` は重ねません。実機確認済みでOKです。

## Android有線 / Bluetooth の現在判断

Android有線 / Bluetooth は、コード上では以下の判定式が残っています。

```text
timingOffsetMs + androidWiredMicOffsetMs
timingOffsetMs + androidBluetoothMicOffsetMs
```

ただし、現在の実機ログでは `timingOffsetMs = 0` で、実質的には Android専用補正値単独で判定されています。

| 入力タイプ | 実機確認 | 現在判断 |
|---|---|---|
| Android有線イヤホン | GOOD8、平均ズレ約 -10ms、判定補正は `androidWiredMicOffsetMs` 系 | OK。今すぐ単独化しない |
| Android Bluetoothイヤホン | GOOD7 / MISS1、平均ズレ約 -13ms、判定補正は `androidBluetoothMicOffsetMs` 系 | OK。今すぐ単独化しない |

現時点では「潜在リスクとして記録、実装変更なし」です。将来、Android有線 / Bluetoothで `timingOffsetMs` が非0のまま残り、最終確認がズレるログが出た場合に再調査します。

## iPhone通常マイクの警告条件

v0.12.93 で、iPhone通常マイクの赤い警告カード表示条件を調整しました。

以前は、通常マイクで `clickDetectionPass` が false の場合に警告が出ていました。現在は iPhone通常マイクだけ、次の遅延テスト用100%クリックが検知できそうかを示す `clickDelayTestReadinessPass` ベースです。

- iPhone通常マイク: `clickDelayTestReadinessPass` が true なら警告しない
- Android通常マイク: 従来どおり `clickDetectionPass` ベース
- イヤホン系: `isNormalMicInput()` が false なので対象外

これにより、マイク反応テスト中のクリック検出が少なくても、次の音ズレ・遅延テスト用100%クリックが十分検知できそうなら、不要な警告を出しません。

## 各テストの役割

### 音ズレ・遅延テスト

クリック音や測定音をマイクで拾い、音が出てからマイクへ届くまでの遅れを測ります。保存先は端末 / 入力タイプごとに異なります。

| 入力タイプ | 主な保存先 |
|---|---|
| iPhone通常マイク | `timingOffsetMs` |
| iPhone有線イヤホン | `wiredMicOffsetMs` |
| iPhone Bluetoothイヤホン | `bluetoothMicOffsetMs` |
| Android通常マイク | `androidBuiltinMicOffsetMs` |
| Android有線イヤホン | `androidWiredMicOffsetMs` |
| Android Bluetoothイヤホン | `androidBluetoothMicOffsetMs` |

音ズレ・遅延テストではクリック音を拾う必要があるため、Practice用の反応条件とは別に、測定用のクリック音量や反応ラインを使うことがあります。

### マイク反応テスト

ストローク音を拾うための設定を作ります。主に以下を推定・調整します。

- マイク感度
- クリック音量
- クールダウン
- クリック音がストローク判定に混ざらないか
- 通常マイク / イヤホン系に応じた入力特性

マイク反応テストは Practice 用設定を作るためのテストです。音ズレ・遅延テストのようにクリック音を拾うことが目的ではありません。

### 最終確認テスト

実際の練習に近い状態で、クリック音だけでは反応しにくく、ストロークでGOODが出るかを確認します。

- `finalJudgeOffsetMs` を使って最終判定補正を確認する
- `usedOffsetSource` でAndroid専用補正の使用状態を確認する
- 平均ズレが0ms付近かを見る
- Practiceと同じクリック音量、反応ライン、クールダウン、判定補正で確認する

最終確認テストでOKになった条件が、そのままPracticeで使える状態であることが重要です。

## 手動マイク調整

Practice画面には、手動マイク調整UIがあります。

調整できる項目は以下です。

- 音ズレ補正
- マイク感度
- クリック音量

保存済みカスタムプリセットから呼び出している場合は、変更後に上書き保存できます。未保存設定や変更なしの状態では、上書き保存は無効です。別名保存は新しいプリセットとして保存します。

手動補正は既存の保存先に反映されます。たとえば、Android通常マイクなら `androidBuiltinMicOffsetMs`、iPhone通常マイクなら `timingOffsetMs` など、現在の端末/入力タイプに応じた保存先を使います。

手動マイク調整は、既存の補正値や設定値を調整するUIです。補正ロジックそのものを変えるものではありません。

## 原則触らない箇所

安定状態を崩さないため、以下は原則触りません。変更が必要な場合は、先に調査のみを行い、実機ログや影響範囲を確認してから小さく実装します。

- `micJudgeOffsetMs()`
- `finalCheckJudgeOffsetMs()`
- `saveAndroidBuiltinMicCorrection()`
- `timingOffsetMs`
- `androidBuiltinMicOffsetMs`
- `androidWiredMicOffsetMs`
- `androidBluetoothMicOffsetMs`
- `wiredMicOffsetMs`
- `bluetoothMicOffsetMs`
- 音ズレ・遅延テスト測定ロジック
- マイク反応テストロジック
- 最終確認テストロジック
- クリック音生成
- クリック音量ロジック
- 保存ロジック
- localStorage構造
- プリセット構造

## 今後の調査候補

| 候補 | 内容 | 現時点の扱い |
|---|---|---|
| Android有線 / Bluetoothの `timingOffsetMs` 非0ログ | `timingOffsetMs + androidXxxMicOffsetMs` が過補正になるか確認する | ログが出たら再調査。今すぐ実装しない |
| `resumeClickInputFromHelp()` の復元ルート | sessionStorageから `selectedTestPlatform` を復元する経路の安全性確認 | 通常利用では同一端末/同一セッションなので優先度低。必要なら調査のみ |
| 実機OS/選択ルート不一致ガードの拡張 | v0.12.94では端末選択ボタン入口のみガード | 復帰経路などに広げる必要があるかは別途調査 |
| 手動マイク調整UIの最終調整 | Practice画面、マイク設定画面、最終確認後パネルの文言・見た目確認 | ロジックに触らない範囲で小さく調整 |

## 開発時の基本方針

- 実機OK状態を崩さない
- 変更は小さく分ける
- 補正・保存・判定・測定・クリック音量に触る場合は、必ず先に調査のみ
- `script.js` を変更した場合は通常版 / PRO版の `script.js?v=` も同期する
- `theme.css` を触らない場合、`theme.css?v=` は更新しない
- 未追跡アイコン案はstageしない

