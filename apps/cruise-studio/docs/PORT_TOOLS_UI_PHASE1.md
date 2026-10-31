# Port ツールと Studio UI — 第1工程

基準は Cruise Port のスマートフォン版 `apps/cruise-port/index.html` と、Studio の作業中 `0.48.0` UI。既存51ファイルの開始時内容は worktree 外の baseline manifest と tar/patch に保全した。これは開発証跡であり、既存ファイルの移動・リセットではない。

| 項目 | Port スマートフォン版 | Studio 第1工程 |
| --- | --- | --- |
| チューナー検出 | `tuner-engine.js` の音程、Hz、cent、confidence、RMS | 同じ pure engine を `tuner/runtime.mjs` が import。捕捉と停止は Studio Audio Coordinator が所有 |
| チューナー操作 | 音名と中央メーター、弦別基準音、調弦、入力閾値、入力レベル | 全画面 Tuner に調弦・閾値・基準音。新クイックパネルは譜面上でマイク開始/停止と音名・Hz・cent を表示し、全画面設定へ移動 |
| チューナー音声 | Port の capture controller とプレビュー合成 | Studio は Port の `synthesizeReferencePluck` と調弦表を利用。Port の capture controller は独立した audioSession/cleanup を持つため取り込まない |
| メトロノーム | BPM 30–240、スライダー、±1/±5、Start/Stop、拍表示。詳細の拍子・リズム・アクセント・音色・音量 | BPM、Start/Stop、拍表示は既存 Dock。新しく ±1/±5 を同じ memory controller に接続。詳細 Pro 設定は無効のまま |
| 設定と Pro | Port 側 store/preset/権限で保存・制限。チューナーのカポとメトロノーム詳細/preset 書込みには Pro 判定が関係する | 設定は Studio のメモリ内だけ。Port store、preset 書込み、Pro 資格、共有データを変更・接続しない |

## 再利用と境界

- 音程検出、調弦・基準音の素材は Port の pure module を参照する。メトロノームは既存の Port 整合済み core と Studio Coordinator/runtime を維持する。今回、新しい音声アルゴリズムや保存先を作らない。
- クイックパネルは既存 `tunerRuntime` を表示する Studio 専用 Adapter。開くだけではマイクを要求しない。閉じる、画面移動、非表示、pagehide では capture を停止する。Metronome 使用中は暗黙停止・暗黙マイク開始をしない。
- Metronome の ±1/±5 は既存 `setBpm` を呼ぶ。clamp、再生中の reschedule、memory 保存状態、停止・dispose は既存経路のまま。
- Port の設定保存、preset CRUD、Pro 判定とカポ、Studio の Shared Write/Cloud Sync 連携は別工程。必要な場合、Port/認証/保存 owner と操作・保存契約を先に定める。

## 競合と未検証

PR #56 は `apps/cruise-studio/index.html` と `tests/tuner.browser.cjs` を変更する。今回の `index.html` 追記と将来の統合には手動差分確認が必要。PR #61 は `tests/production-bundle.browser.mjs` で、この工程の変更ファイルとは重ならない。両 PR のコードは取り込まない。

ブラウザテストは使い捨て Chrome と合成マイク。実マイク、iPhone/Android、OS 音声割り込み、聴感は未確認であり、実機 PASS と扱わない。

## PC ブラウザでの確認順

1. ローカル Studio の「譜面」を開き、「チューナー」アイコンを押す。譜面を残して小パネルが開き、まだマイク許可を求めないこと。
2. 「マイク開始」を押し、許可後に単音を鳴らす。音名・Hz・cent・メーターが更新されること。「マイク停止」または閉じる操作でマイク使用表示が消えること。
3. 小パネルの「設定・基準音」から全画面 Tuner へ移り、調弦・入力閾値・基準音を確認する。戻ってもマイクが勝手に再開しないこと。
4. 譜面に戻り「メトロノーム」を開く。±5/±1 で BPM が変わり、Start で拍表示と音が始まり、再生中の BPM 変更と Stop が効くこと。設定欄の Pro 詳細項目は無効で、Studio の値は再読込で初期化されること。
5. メトロノーム再生中に小チューナーを開き「マイク開始」を押す。競合メッセージが出て再生を奪わないこと。Global Stop 後は明示操作でマイクを開始できること。
6. マイク使用中に別画面へ移る、タブを隠す、ページを離れる。マイクが止まり、自動再開しないこと。譜面・Pre-DTM の作業中ドラフトが保たれること。
7. 4テーマと狭いウィンドウで主要ボタン、譜面、メーターを確認する。実スマートフォンのタッチ、実マイクの精度、OS割り込み、聴感は別途実機で判定する。
