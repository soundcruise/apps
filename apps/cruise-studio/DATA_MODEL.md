# クルーズスタジオ — データモデル定義

対象スキーマ: **schemaVersion 1**（実装: `js/core/song-model.js`）

## 1. 基本方針

- 曲データ（StudioProject）が唯一の正。譜面もMIDIもここから導出する
- 位置と長さはすべて **小節番号 + 小節内tick** で持つ。`ticksPerBeat = 480`（標準MIDI解像度）
- メロディは絶対音名ではなく **階名（movable do）＋オクターブ** で持つ
- 見た目専用データは最小限（`lineBreakAfter` と `sheetSettings` のみ）
- `proSettings`（プラン・課金情報）は**曲データに入れない**。アプリ側の状態として別管理する
- スキーマ変更時は `schemaVersion` を上げ、`migrateProject()` に旧→新の変換を必ず実装する

## 2. tick の規約

- 4分音符 = 480 tick（`ticksPerBeat`）
- 8分 = 240 / 16分 = 120 / 3連8分 = 160
- 4/4 の1小節 = 1920 tick。小節内tickは `0 〜 (beats × ticksPerBeat − 1)`
- イベントの `tick` は小節ローカル（小節をまたぐイベントは持たない。タイは将来 `tieToNext` で表現）
- 編集UIは16分グリッド（120tick）への量子化を基本とする（自由配置はしない）

## 3. キーの規約（ORGキー / Playキー / カポ）

```
keyToSemitone(playKey) + capo ≡ keyToSemitone(originalKey)  (mod 12)
```

- `originalKey`（ORGキー）: 実音（コンサートピッチ）のキー。例: D
- `playKey`: 演奏フォーム（コードシェイプ）のキー。例: C
- `capo`: カポ位置。例: 2 →「2カポC」= Cフォーム＋カポ2 = 実音D
- 譜面のコード表記・ドレミは **playKey 基準**（プレイヤーが見るもの）
- MIDI生成（実音）: `実音 = playKey基準の音 + capo 半音`
- 上式が成立しない入力は `validateProject()` が警告する（保存は拒否しない）

## 4. StudioProject スキーマ（schemaVersion 1）

```jsonc
{
  "schemaVersion": 1,              // スキーマ世代。マイグレーション判定用
  "appVersion": "0.1.0",           // 最後に保存したアプリのバージョン（参考情報）
  "projectId": "csp_xxxxxxxxxxxx", // 一意ID（storage.js が保存キーに使う）
  "createdAt": "2026-07-02T00:00:00.000Z",
  "updatedAt": "2026-07-02T00:00:00.000Z",

  "songInfo": {
    "title": "サンプルソング",
    "artist": "Cruise Studio",
    "originalKey": "C",            // ORGキー（実音）
    "playKey": "C",                // 演奏フォームのキー
    "capo": 0,                     // 0〜11
    "bpm": 100,                    // 20〜400
    "timeSignature": { "beats": 4, "beatUnit": 4 },
    "ticksPerBeat": 480
  },

  "sections": [                    // 表示順 = 配列順
    { "id": "sec_a", "name": "Aメロ", "lyricsHidden": false }
  ],

  "bars": [                        // 全小節を展開したフラット配列（繰り返し記号は持たない）
    {
      "barNumber": 1,              // 1始まり・連番。並び順の正は配列順
      "sectionId": "sec_a",
      "chords": [                  // 小節内のコードイベント
        { "tick": 0, "durationTicks": 1920, "symbol": "C" }
      ],
      "lyrics": [                  // 音節単位の歌詞イベント
        { "tick": 0, "text": "か" }
      ],
      "melody": [                  // 階名メロディイベント
        { "tick": 0, "durationTicks": 240, "step": 2, "alter": 0, "octave": 0 }
      ],
      "strumOverride": null,       // strumPatterns の id。null = 基本パターン
      "lineBreakAfter": false      // 譜面レイアウト指示（唯一の見た目データ）
    }
  ],

  "strumPatterns": [               // ストロークパターン定義（表示グリフとMIDIの共通ソース）
    {
      "id": "strum_8beat_a",
      "name": "8ビート基本",
      "lengthTicks": 1920,         // パターン1周の長さ（通常1小節）
      "slots": [
        { "tick": 0,    "action": "down", "accent": true  },
        { "tick": 240,  "action": "down", "accent": false }
        // action: "down" | "up" | "mute" | "rest"
      ]
    }
  ],
  "basicStrumPatternId": "strum_8beat_a",

  "sheetSettings": {               // 譜面クルーズの表示設定
    "showChords": true,
    "showLyrics": true,
    "showDoremi": true,
    "showStrum": true,
    "barsPerLine": 2,
    "paperSize": "A4"
  },

  "arrangement": {                 // プレDTMクルーズ用（Phase 4以降で拡張）
    "guitar": { "enabled": true,  "strumPatternId": null },  // null = basicStrumPatternId
    "bass":   { "enabled": true,  "style": "root8" },
    "drums":  { "enabled": true,  "style": "8beat" },
    "midiExport": { "format": 1, "includeClick": false }
  }
}
```

## 5. メロディ（階名）の規約

`melody` イベントは movable do（playKey 基準の階名）で持つ。

| フィールド | 意味 |
|---|---|
| `step` | 0=ド 1=レ 2=ミ 3=ファ 4=ソ 5=ラ 6=シ（長音階の度数） |
| `alter` | 半音変化。-1=♭ / 0 / +1=♯ |
| `octave` | 0 = 中心オクターブ。-1 = 低い / +1 = 高い（譜面ではドレミの色分けに使う） |
| `durationTicks` | 音価 |

実音MIDIノートへの変換（music-theory.js が担当）:

```
majorScale = [0, 2, 4, 5, 7, 9, 11]
midiNote = 60                        // 中心オクターブのド = C4 相当を基準
         + keyToSemitone(playKey)    // playKey のドへ移動
         + capo                      // カポで実音化
         + majorScale[step] + alter
         + octave * 12
```

## 6. コード記号の規約

- `symbol` の文字列が正（例: `"C"` `"Am7"` `"F/G"` `"Bm7-5"`）
- root / quality / bass への分解は保存せず、`parseBasicChordSymbol()` で使用時にパースする
- 表記は playKey 基準（譜面に印刷される通りのもの）

## 7. 保存（localStorage / JSONファイル）

実装: `js/core/storage.js`。キーはすべて `cruiseStudio.` プレフィックス（既存アプリと衝突させない）。

| キー | 内容 |
|---|---|
| `cruiseStudio.projects.index` | プロジェクト一覧メタ `[{projectId,title,artist,updatedAt}]` |
| `cruiseStudio.project.<projectId>` | StudioProject 本体（JSON文字列） |
| `cruiseStudio.currentProjectId` | 最後に開いていたプロジェクトのID（画面再読み込み時の復元用） |
| `cruiseStudio.appSettings` | アプリ側設定（将来。proSettings 相当もここ。曲データに入れない） |

JSONファイル書き出しは StudioProject をそのまま整形出力する。
読み込み時は `migrateProject()` → `validateProject()` の順に通す。

## 8. マイグレーション規約

- 読み込んだ `schemaVersion` が現行より古い場合、`migrateProject()` が段階的に変換する（v1→v2→v3…）
- 現行より新しい場合はエラーにする（新しいアプリで開き直してもらう）
- フィールド追加のみの変更でも schemaVersion を上げ、デフォルト値の補完を migrate に書く
- 変換ロジックは削除しない（過去のどの保存データも開けることを保証する）
