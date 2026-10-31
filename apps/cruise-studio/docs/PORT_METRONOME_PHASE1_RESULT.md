# Port / Studio 共通化 Phase 2: メトロノーム Standard

2026-10-31。隔離ブランチ `codex/studio-ui-tuner-20261031` の Studio 0.50.0 候補。Port 本体、保存 schema、Pro/Account、Worker、Cloud Sync の製品コードは変更しない。

## 実装と所有

Studio の Home と左ナビの「メトロノーム」は、同一オリジンの Port Standard 文書を 1 iframe 開き、Port 起動後に `#metronome` を選ぶ。Port の `metronome-app.js`、`metronome-store.js`、`metronome-presets-store.js`、timing/audio engine、Pro authorization が実行される。Studio の新しい [port-surface.js](../js/modules/metronome/port-surface.js) は frame 寿命と Audio Coordinator lease のみ扱い、Port DOM・store・認証を再実装しない。PC用の幅、スクロール領域、外側の戻る/ホームを Studio shell が提供する。

譜面の横にある旧 Studio Dock は memory-only の「譜面補助BPM」と表示する。正規 Port メトロノームの設定・プリセット保存UIとは扱わない。`portDataHost.canWrite=false` は維持し、Port frame 自身の正規保存とは別 owner とする。

## Standard / Pro の棚卸し

| 項目 | Port Standard の既存動作 | Studio 0.50.0 候補 |
| --- | --- | --- |
| BPM 30–240、スライダー、±1/±5、再生/停止、拍表示 | 使用可能。`cruisePort.metronome` v3 にPortが保存 | Port画面をそのまま表示・操作・再読込確認 |
| 拍子、リズム、拍アクセント、4音色、音量 | Port UIに存在するが、詳細設定はPro lock | 同じlockとPortのPro案内を表示。Studio独自解除なし |
| プリセット選択 | Portの既存保存値を表示・選択 | 既存v1プリセットの選択とBPM適用を合成browserで確認。実機は追加確認 |
| プリセット新規保存/削除 | Pro認可が必要。`cruisePort.metronomePresets` v1 | 同じPro lock。実Pro資格では未検証 |
| Sync | Port managed datasetの既存対象 | iframeで二端末同期を未受入。Studio Project同期とも別判定 |

Portの正規保存キーや形式は変更しない。Standard で非公開の詳細値を Studio Dock で保存しない。保存済み Pro 設定は Port の effective settings 処理に任せる。

## 音声・画面ライフサイクル

Port frame を開いている間、Studio は保守的な `audio-output/session` lease を持つ。Studio Dockやquick tunerが再生・録音中なら Port entry は停止を強制せず保留し、Global Stop 後の明示再試行を求める。Port と Studio の各ワークスペース遷移では先行 frame の cleanup 完了を待って新しい lease を得る。Global Stop、画面移動、親タブ非表示、pagehideでは frame を除去し、Port 自身の pagehide 停止を使う。可視復帰で自動再生しない。

合成ブラウザで Port UI 11要素、Standard Pro lock、BPM 143 の v3保存・再読込、既存v1プリセットからのBPM 160適用とStandardの詳細値抑制、再生中のGlobal Stop/画面移動/非表示/pagehideで AudioContext の close、チューナーとの往復、Dockとの競合、4テーマ、390/768/1440/1920px、譜面draft維持を確認。実オーディオデバイスとSafari、Pro認証、二端末Syncは未受入。

## iframe の長期評価と次の受入 gate

同一オリジンでPortの画面・保存・Pro lockをそのまま使える点は有効。Studioが保存APIを二重実装せずに済む。反面、frame はPort文書全体を起動し、内外で独立したナビゲーション・focus・テーマ・ブラウザ履歴を持つ。親の音声CoordinatorからPort内部のAudioContextを直接所有できず、pagehide停止に依存する。Port Pro gate、Account/device資格、Service Worker scope、添付/写真、download、スマートフォンとのSyncは機能別に受入が必要。したがって現時点では **Standardのチューナー・メトロノームに限定した採用** とし、全機能の恒久方式とは判定しない。広範な画面統合が必要になればPort ownerがUIとstoreを同時に管理する共有コンポーネント抽出を別ラインで検討する。Studio側の似た画面を増やさない。

次は練習メニューとカレンダー。Port routeを開くだけでなく、メニュー追加・編集・削除、セット、履歴、カレンダー、タイマー、添付、Standard件数/Pro制限、Port v3/v1/v5/v2各保存値を個別に照合する。写真・添付・Pro・Syncに関わる未受入部分はPort正規別タブを残し、共有書込み権限をUI lineから変更しない。
