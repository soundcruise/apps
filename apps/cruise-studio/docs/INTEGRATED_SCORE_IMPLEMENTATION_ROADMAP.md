## 0.38.0 implementation status

工程2のmelody staff previewをmemory-onlyで追加。4/4限定、既存Coreのfatal全体拒否を維持。
ルーペ全体刷新・schema2・共通pagination・音価確認保存・Chord/Rhythm/TABは未実装。
最新の限定範囲は[MELODY_STAFF_PREVIEW](MELODY_STAFF_PREVIEW.md)。
正式Node942 / Browser437 PASS（2026-10-15、FAIL/skip0）。実SVG12ケースと欠落paint反例を追加。
前回のselector不整合は試験側で解消し、再開時の製品コード変更なし。
今後は実機IME/読みやすさ確認と共通配置・常設ルーペを進める。任意の跨拍連桁/跨小節tieは未対応。
以下のレビュー由来ロードマップは将来契約として保持する。

# Integrated Score — 実装ロードマップと受入境界

Studio0.37.1 / 実装済みschema1。metadata保守commit `02a21d74a35e93d94a06b5827e1713fe5ae3efe0`。
[Architecture](INTEGRATED_SCORE_ARCHITECTURE.md)と[最終UX](INTEGRATED_SCORE_UX.md)が将来設計の正本。

## 採用済みモックの参照

- commit: `2b754b0f78b8ba856f9f315e9c76d27420088168`。9ファイルのhashは作業receiptで照合。
- [README](https://github.com/soundcruise/apps/blob/2b754b0f78b8ba856f9f315e9c76d27420088168/apps/cruise-studio/_proto/integrated-score/README.md)
- [HANDOFF](https://github.com/soundcruise/apps/blob/2b754b0f78b8ba856f9f315e9c76d27420088168/apps/cruise-studio/_proto/integrated-score/HANDOFF.md)
- この保守branchへモックをコピーしない。製品module graph・保存・Audio・Pro/Account/Authority/Syncへ接続しない。

## 段階実装

| 工程 | 内容 | 保存・依存境界 |
|---|---|---|
| 0 | 正式設計文書化 | 本工程。schema1維持 |
| 1 | 承認済み統合紙面モックを基準として受入条件整理 | 5スタイル・S01〜S24。U1〜U3を確定 |
| 2 | Core v1からメロディpreview | memory-only。ルーペ常設DOM/IME保護、共通配置。音価を原曲確定と見せない |
| 3 | Chord pure adapter・完全性検証 | ownerの getCommonForm/getForm を利用。独自おすすめ順位なし |
| 4 | Rhythm公式pattern API/decoder/reader | owner側の独立工程。基本4/4・8分/16分。初期化書込なし |
| 5 | 伴奏TAB/五線preview | 同じ演奏projection。使用弦・slash bass・tie/stopを検証 |
| 6 | schema2・stable ID・migration・全consumer対応 | 実音/時間不変、明示保存、raw revision競合検証。自動保存なし |
| 7 | フォーム/リズム採用UI | 局所適用が既定。一括は明示、固定保持、共通Undo、履歴容量事前確認 |
| 8 | 音価・休符編集、確認操作 | 本棚連携より先。自動/legacy-unknownを確認まで保持 |
| 9 | 印刷/PDFと共通pagination | 未確認0の対象だけ完成譜。確認用の帯・枠・脚注。強制縮小なし |
| 10 | 本棚・マイリズムreader | 読取権限確定後、出所付きsnapshot採用。元の更新/削除に追従しない |
| 11 | 手動運指・高度時間表現 | 別途scope/schema/Pro判断。丸めや推測補完なし |
| 12 | MusicXML・新演奏MIDI等 | SVG/DOMから逆算せず、音楽/演奏モデルから出力 |

## モック状態と受入対象

| 状態 | 対象 |
|---|---|
| S01〜S05 | 5スタイル、コード/メロディ/ギターの役割、歌詞の単一表示 |
| S06〜S08 | 1920/1280/800/600幅、紙面密度、Inspector、横移動 |
| S09〜S10 | 常設ルーペ、スクロール補正、IME/caret/focus、音価・休符確認 |
| S11〜S13 | コード編集と押さえ方入口の分離、局所/一括適用、固定＋要確認保持 |
| S14〜S15 | リズム基本/小節割当と継承、attack/rest/sustain/空振り/消音/dead stroke |
| S16 | 移調/実音保持カポ/フォーム保持カポ/表記の4目的、前後例と影響件数 |
| S17〜S19 | 出力別readiness、空欄/N.C./明示carry、Toolbar到達性 |
| S20〜S22 | 確認用/完成譜、部分出力、改ページ・密集・長い歌詞 |
| S23〜S24 | 共通Undo/Redo、外部素材snapshot、元削除・Pro準備中 |

## 実装前の必須条件

- U3（カポ時の入力/表示基準）が未決のまま、コード入力変換を公開しない。保存正本は実音。
- Core v1のfatalを無視して部分描画しない。全体破損と声部別未解決を分ける次版契約を先に確定。
- ルーペのIME/caret/focus保護を実機確認。満たせなければ固定編集領域へ切替えて再審査。
- 8分/16分の意味をowner schemaで照合。rest/sustain/空振りを混同しない。N.C.を空欄へ正規化しない。
- 保存schema2の実装前にmaterial/performance/notationを永続化しない。現在のDATA_MODEL.mdはschema1のまま。
- 高度CAGED/本棚/マイリズムのPro範囲を確定するまで公開しない。権限失効で採用済みデータを削除しない。
- 既存Pre-DTMのMIDI契約を新ギター演奏と混同しない。

## 検証とGit境界

各工程は新規のNode/正式Browser回帰、変換identity/Undo/外部更新、音高・時間、出力別readiness、No-write、Console/404/通信、scopeと原本hashを検証する。
過去の試験件数やモック承認を製品実装のPASSへ流用しない。Git safety・別owner境界・Daybreak待機を維持し、owner API整備をStudio製品変更に紛れ込ませない。
今回のmainへのpush・PR merge・auto-merge・Pages公開は承認外。候補の親/履歴/scopeが現行integration gateへ適合しなければ、方式を変更せず停止する。
