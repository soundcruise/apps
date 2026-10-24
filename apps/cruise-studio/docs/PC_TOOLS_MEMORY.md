# PC Tuner / Metronome 一時操作契約

この工程はPort保存・Account・Pro資格・Syncを接続しない。StudioProject schema 2、Editing Session、domain Undoは変更しない。

## Tuner

- Port `tuner-engine.js`、`tuner-tuning.js`、`tuner-preview-audio.js`の純粋な検出・調弦・基準音合成を再利用する。
- 調弦11種はownerの列挙値を直接表示する。カポは0固定。A4はownerと同じ440 Hz。検出表示は実音を維持し、選択した調弦へ音名を強制しない。
- 閾値はPortと同じ−100〜−40 dBFS、整数。入力は未適用draftであり、一時適用または変更を戻す操作で確定する。適用はマイクを再取得せず検出器を差し替え、古い検出値を消す。
- 調弦選択で弦ごとの基準音を表示し、FreeでもA4基準音を選べる。基準音は明示button操作だけで再生する。
- 基準音の合成はPort owner、AudioContext・lease・cleanupはStudio Audio Coordinatorに属する。専用contextと小さい出力gainを使用し、Portアプリ全体や保存・AudioSessionの副作用をimportしない。PortのUI側EQ経路との完全な音色一致を保証する工程ではない。
- 基準音とマイク／Metronomeは排他的。暗黙停止・自動マイク再開は行わない。基準音の自然終了、workspace退出、pagehide、hidden、Global Stopでcontextを閉じる。close失敗はleaseを保持して再操作を要求する。
- マイク権限表示は現在の取得操作の結果を表す。OS全体の権限を既知と推測したり、表示のために権限を要求しない。

## Metronome

- 現行StandardはPortと同じBPMのみ。M2 memory repositoryへの反映は既存の一時CAS経路を維持し、Port保存値は変更しない。
- 保存済みpresetはPortDataHostの明示readと既存revision検証を経て、選択したBPMだけを一時適用・明示Startする。presetの拍子／音色／音量などは適用しない。破損・future schema・stale候補は既存の拒否条件を維持する。
- 拍子・リズム・音色・音量・アクセントはPro領域。現在値をdisabled fieldsetに表示し、正式Pro接続が未完了であることを明示する。既存fixture用access stateを製品資格として利用しない。
- 詳細音声の正式操作には、trusted Pro bridgeとPort ownerの全renderer機能を再利用する別工程が必要。現工程をPort Proとの完全な機能同等と扱わない。

## 検証境界

Nodeはowner export同一性、閾値境界、参照音のcancel／close失敗／lease排他を検証する。Browserは使い捨てChrome、独立loopback、正式443 HzダミーWAVだけで検証する。

既存Tuner／Metronomeの関連試験と、新規PC操作試験を使用する。Metronome M2の入力数試験は「BPMの有効inputは1つ」を維持し、追加された詳細input2つ・select3つがすべてdisabledであることを厳密に検証する。

実マイク、OSネイティブIME、Safari、実プリンター、Pro認証成功、正式保存の受入とは区別する。
