# クルーズスタジオ 音声・UI・コードレビュー — 2026-11-15

2026-11-16ローカル追記：選択範囲ループ（0.130.0）と[1小節カウントイン（0.136.0）](count-in-20261116/README.md)は実装・隔離検証済み。[メトロノーム・滑らかな追従・フォーム拡大からの編集（0.137.0）](playback-forms-20261116/README.md)も実装・隔離検証済み。0.138.0では[拡大フォームの直接変更・再生設定・上部カード整理](direct-form-playback-20261116/README.md)へ更新済み。0.139.0では[履歴・別名保存・フォーム編集の整理](history-save-form-20261116/README.md)を実装・検証済み。以下の未実装表記は11月15日時点の記録。本番未反映。

作業: `codex/score-playback-follow-review`、基準 `ece208672f3f8ed815687666dc5ddeb6685930bd`。
ローカル候補 **0.127.0-dev.1**（ユーザーに分かる発音・余韻の変更を含むためマイナー更新）。正式製品 **0.88.1は変更なし**。
`apps/cruise-studio/` 内だけを変更。本番配信、公開HTML、認証、Account/Sync、Worker、実アカウント、main、他アプリ、共有CSSは変更していない。

## 1. 今回直したこと

| 優先度 / 状態 | 根拠・再現 | 修正と影響 |
|---|---|---|
| P1・再現済み→修正 | 同じ登録Cが通常再生では48/52/55、単独試聴では48/52/55/60/64。旧 `sheet-cruise.js` の通常再生にresolverなし | `score-playback.mjs:1` と `chord-audition.mjs:2` で共通化。全曲・1小節・2小節・コード進行・登録フォーム単独試聴が同じ使用弦になる。実ブラウザでも全5入口を照合 |
| P1・コード再現→修正 | bindingあり・material参照切れでも旧resolverはコード名の別和音にフォールバック | 登録なしだけ「参考和音」と明示。参照切れ、不正な弦、重複binding、未解決コードは警告し発音しない |
| P2・コード再現→修正 | 弦番号を捨てた音高順、同じ弦・同音別弦の区別なし、短いストローク区間ごとに音が切れる | 実際の弦順、方向別の非等間隔発音、弦別強弱。同音別弦を保持。同じ弦の再発音、休符、ミュート、コード変化、明示コード終端、再生範囲末尾で余韻を止める |
| P1・ブラウザ再現→修正 | ドレミに「ド」を確定→「不正」と入力→JSON書出し。画面には不正入力が残るのに以前の内容を書き出し「成功」表示。[修正前記録](acoustic-review-20261115/export-observation.json) | `sheet-cruise.js:4079` の出力前ガードでJSONと明示印刷を中止し、入力を保持。訂正後は出力可能。IME中も中止。OSの印刷機能自体の実機評価とは別 |

Project schema、保存形式、音符・フォーム・素材IDは変更していない。新しい `string / attackStart / release` は一時的な再生イベントだけ。Undo/RedoやProjectへ書き込まない。

登録フォームは採用時snapshotのカポ・チューニング・開放弦・ミュート・`playedStrings`を使う。現在の楽器設定で二重に移調しない。登録音の参考試聴と、確認済みフォームだけを出すPre-DTM MIDIの資格判定は別契約。

余韻は実録サンプルの自然減衰を利用し、最大4秒と消音境界で制限する。ストロークのセル長は次の発音や空欄の範囲を決めるが、空欄だけを理由に即消音しない。コードの明示持続時間は守る。アコギの消音包絡を最大45msとし、ピアノの従来包絡は維持。コード進行試聴だけの空欄補完は従来仕様のまま、休符や持続を上書きしない。

## 2. 今すぐ直すべき残件

P1は次の開発または公開判断の前、P2は使い勝手・保守の次段階。以下は今回の変更で生じた不具合ではなく、別途対応する。

| 優先度 / 確度 | ファイル・行 / 再現手順 | 影響 / 対応案 |
|---|---|---|
| **P1・計測再現済み** 長い曲の表示設定 | `paper-layout.mjs:104,187,195`、`sheet-cruise.js:411`。合成Projectを読み、フォーム表示ON→表示設定→コード文字サイズを5回変更 | 12小節中央値23.1ms、128小節205.4ms、256小節402.7ms/操作。256小節では見本と紙面合計91,641 DOMノード。文字・色はCSS変数だけを変更、フォームSVGはキャッシュ、構造変更だけ再描画する。rAFでまとめるだけでは1回400msは残る。[条件と全測定](acoustic-review-20261115/layout-metrics.json) |
| **P1・Node再現済み** 継続コードのギターMIDI欠落 | `pre-dtm-cruise/guitar-voicing.mjs:11`。1小節目のCフォームを確認済みにし、持続時間未指定、2小節目のコード欄を空にする | arrangement-engineは2小節目にもストローク6件を生成するが、enrichが当該小節内だけを探しMIDIが0音。1小節目30音、2小節目0音、schema/フォーム資格は有効。[記録](acoustic-review-20261115/pre-dtm-observation.json)。前小節からのコード継続を共通化し、明示durationは継続させない。今回は音声再生側を修正し、MIDI仕様の変更は保留 |
| **P1・試験で再現済み** 全試験が正常ではない | `tests/unified-release.test.mjs:15`、`release-license.test.mjs:7`、`rhythm-official-adapter.test.mjs:39`、テーマ・Shell等 | 基準コミットでも同じ39件が失敗。固定ファイル数108→実114、81→実112、旧Rhythm version期待等を含む。単に期待値を更新せず、現行仕様との不整合を分類して修復する。ライセンス試験は冒頭の件数で落ちており、これだけから権利表示欠落とは判断しない |
| **P2・コードからの推定** Pre-DTMの同音別弦 | `pre-dtm-cruise/guitar-voicing.mjs:17` の `new Set(result.soundingMidi)` | 同音の別弦がMIDIで統合される。MIDI側は重複note-offやチャンネル設計も関係するため、音声と完全一致させる要件を決めてから対応 |
| **P2・コード確認済み** 巨大な画面モジュール | `sheet-cruise.js` 約4,440行。入力、選択、印刷、試聴、CSS、紙面連携が同居 | 今回は純粋な再生計画のみ切り出した。次はAudio runtime、出力ガード、編集カードの順に既存試験を移しながら分離。Sessionを別実装に置換する全面リライトは不要 |

## 3. 操作をシンプルにする案（未実装）

| 優先 | 提案 | 効果 / 操作数 / 負担 |
|---|---|---|
| P1 | 常設は再生・保存・Undo/Redo・表示設定を中心にし、入出力と小節操作を各メニューへ | 1440pxで上部に可視ボタン19個＋表示チェック10個。紙面面積を増やせる。頻用操作は1クリック維持、低頻度操作のみ1→2クリック。実装負担は中 |
| P2 | 表示設定の冒頭と保存ボタン付近に「このブラウザだけに保存。曲JSON・同期には含まれません」 | 現状ダイアログに端末／ブラウザ保存の説明なし（DOMでも確認）。操作追加0、実装小。別途表示プリセット書出しを付ける場合もProjectへ混ぜない |
| P2 | 再生ボタンに対象を明示（曲／表示中の小節／コードのみ） | 音源は揃えたが、コード進行は空欄を補完する参考試聴であり通常再生と発音数まで同一ではない。操作追加0、実装小 |
| P2 | フォームの余白を用途別トークンで管理 | カードと本棚は `chord-form-diagram.mjs` の共通fitを使用。紙面／詳細は `paper-forms.mjs:15` のSVG padding、カード外側は `owner-chord-panel.mjs` の別CSS。画面ごとに寸法が違う事実は確認できるが、違い全てをバグとはしない。高フレット、開放弦、スマホ各幅で見比べて統一する。実装負担は中 |
| P2 | キーボード操作説明を編集カードのヘルプへ集約 | Space再生、ストローク欄のSpace休符、Enter移動を文脈別に説明。既存IME所有権を維持。操作追加はヘルプ閲覧のみ1、実装小 |

上表の実装負担は工数の相対評価。すべて未実装の提案。

## 4. 役立つ追加機能（未実装）

| 順位 | 機能 | 効果 | 追加操作 | 実装負担・前提 |
|---|---|---|---|---|
| 1 | 選択範囲ループ | 苦手な2〜4小節を反復し、毎回選択して再生し直す手間を省く | 範囲選択＋ループ切替1回 | 中〜高。範囲終端の消音、先頭の継続コード、Coordinatorの中断と追従位置を先に定義。範囲はUI状態 |
| 2 | 任意の1小節カウントイン | ギターを構えて歌い始めやすい | 初回ON1回、以後再生のみ | 中。別AudioContextを増やさず同じ時計・停止契約を使い、曲のtickをずらさない |
| 3 | A–B練習テンポの一時変更 | 難所を遅く練習して原速へ戻せる | 倍率1回、解除1回 | 中。曲BPM保存とは別の端末UI設定。ループ・カウントインを先に完成させる |

## 5. 現在の実行経路とレビュー範囲

すべて `apps/cruise-studio/` を基準とする。認証・Syncは静的確認まで。

| 領域 | 実行経路 / 確認結果 |
|---|---|
| 入口・Shell | `studio-template.html` → `js/app.js` / Shell / Active Document。ローカルのみ `scripts/local-ui-entry.mjs` → `local-ui-adapter.js`、固定origin＋CSP connect-src none。UIとログで外部通信なし。ローカルのrequestLeave連携を製品への導入済みとは扱わない |
| 譜面・編集カード | `sheet-cruise.js` → `Editing Session` → operation-adapter / schema2 → sheet-renderer / melody-staff。入力と履歴の所有者はSession。今回もProject・history不変、確定入力・Undo/Redo・移動を既存ブラウザ試験で確認 |
| 表示設定 | `paper-layout.mjs` / paper-appearance / paper-forms → AppSetting。ダイアログ内は一時編集、保存で確定、キャンセルで復帰。Project/JSON不変を確認。長曲負荷は上表 |
| コード・本棚 | chord-picker → owner-chord-panel → form-authoring / chord-form-transfer、book-source / book-bridge。共有描画を使い、source失効を検査。ローカル模擬本棚の名前転送と単独試聴は確認。実アカウント接続は未確認 |
| ライブラリ | `library/panel.mjs` → workspace / launch / port-data projection。公開境界・参照系は静的確認とNode試験。実ユーザーの棚へのアクセス・変更なし |
| プレDTM | Active Document → `pre-dtm.js:35,178` → readArrangementProjection → arrangement-engine → guitar-voicing → midi-export。保存前のworkingを明示捕捉。譜面再生と別経路で、音声再生UIは持たない。継続MIDIの不一致を別途再現。native Rhythm形式は明示的に出力未対応 |
| 保存・読込・JSON | Editing Session → project-repositoryのrevision照合・lock・復旧、storageのJSON検証。schema2を旧saveProjectへ流さない。ローカル入口で保存→JSON→reload→import一致。今回の不正入力書出しを修正。UNKNOWN・競合・資格変更の保存境界は既存Node試験 |
| 印刷 | 明示印刷→入力ガード→renderPreview→prepareCodePrint→window.print。ChromeのPDFシグネチャ、print CSSのUI除外はローカル試験。OSダイアログ・紙・Safari実機は未確認。五線画面でのコード譜fallbackは別途UX判断 |
| 音声 | startPreview / progression / singleChordPlan → 共通score-playback / chord-audition → createPianoAudition → Audio Coordinator → Web Audio。単音ピアノ、デコード待ちStop、lease、全停止、hidden中断、ストリーミング窓を維持 |
| キーボード | Shell keyboard-router / IMEGuard → ローカル編集所有者 → command-router。Spaceの文脈、IME、未確定入力、Enter/→移動、停止小節選択、手動スクロール優先と次小節追従を確認。実OSのIMEや高速初回入力は別扱い |
| 本番認証・Sync | `core/studio-entry.mjs` のgeneration/account再検査、`cloud/project-sync-host.mjs` のorigin・transport制限と競合分岐を静的確認。資格取得・API呼出し・運用変更はしていない。接続の動作確認済みとはしない |

アクセシビリティ: 操作ボタンのlabel、aria-pressed、native dialog、フォームのrole/button/キーボード導線は静的および既存ブラウザ試験で確認。スクリーンリーダー実機での読み上げ順・コントラスト全画面監査は未確認。情報量削減とフォーカス維持を優先し、見た目だけの全面変更はしていない。

## 6. 音の比較・検証・限界

[比較音声7ファイルと再生順・音量条件](acoustic-review-20261115/README.md)。ダウン／アップ／交互／休符・ミュート・変更を同テンポ・同フォームで旧→新にした。比較用だけの一定ゲインで音量差を抑えており、アプリを単に大音量化した変更ではない。

客観確認: 登録フォームの5入口一致、カポ、変則チューニング、使用弦、開放・ミュート、同音別弦、実弦順、再発音、休符、コード終端、継続、小節境界、メロディ不変、Project/history不変、停止契約。権利表示・13音のハッシュ保持もNode試験で確認。

現素材で可能: 正しい押さえ方、ピックの時間差・強弱、録音の減衰を残す発音長、境界消音。限界: 13音の近接ピッチ変換なので、弦固有の音色、弱／強の音色差、ラウンドロビン、実録ダウン／アップ、ピックやフレットノイズ、共鳴、ミュート奏法は再現し切れない。より改善するには弦・強弱・奏法ごとの録音が必要。新素材は今回導入せず、購入・配信・容量・ライセンス調査は将来の素材選定時に行う。

聴感による自然さ・好みは未判定。Safari実機、OS印刷、高速初回ストローク、実アカウント本棚の前回未確認事項は引き続き未確認。Chrome/WebKit試験をSafari実機の確認とはしない。

試験結果の詳細は [verification.json](acoustic-review-20261115/verification.json)。最終Nodeは2,165件（2,121成功・39失敗・5skip）、基準は2,158件（2,114成功・39失敗・5skip）。失敗の名前に追加なし。ブラウザは全体84件、WebKitの再生関連12件、追加回帰3件が成功（Node runnerの親テストを含む件数）。変更前から同じ39失敗・5skipがあるため「全試験PASS」とはしない。今回の追加・関連試験とブラウザ回帰の結果を分けて記録する。
