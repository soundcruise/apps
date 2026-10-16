# Studio 0.40.3 F3 metadata / cache alignment

## Source and ownership

2026-10-16の固定main `7cf2f02a65e05198cceead49d0d31df14ccfd8ae` と、固定topic `23e4c2a79d83e33418129b68f6ff173cd79a0e6a` を基準とする。
正式versionは各ownerの宣言を読む。Studioのmirror/cacheは正本ではない。

| Owner | 正式version | Source |
|---|---|---|
| Port | 1.23.1 | `apps/cruise-port/app-version.js` |
| Chord | 1.21.0 | `apps/chord-cruise/js/app.js` |
| Pitch | 2.30.0 | `apps/pitch-cruise/script.js` |
| Fretboard | 2.25.0 | `apps/fretboard_cruise/script.js` |
| Rhythm | 1.20.0 | `apps/rhythm-cruise/script.js` |
| Studio candidate | 0.40.3 | `js/core/song-model.js` |

Port ESM import queryを1.23.0から1.23.1へ追従。Chordの`music-theory.js` / `chord-model.js`はowner Standard HTMLの正式参照と照合し、Studio HTML内の1.20.1を1.21.0へ追従する。他ownerファイルは変更しない。
Studio自身のpatchに伴うHTML asset query、version付き内部module import、strict testと性能計測のcandidateラベルを0.40.3へ追従する。
vendor、Sharedの`pro-device-session.js?v=5`、Port readerの既存unversioned定義importは維持する。auth/runtime identityの変更や無関係なqueryの一括置換は行わない。

schemaVersionは2。migration、保存、Undo、音楽モデル、UI layout、認可の製品ロジックはこの修正で変更しない。過去releaseの文書記録は過去の値を維持する。

## Integration construction and review

現工程のユーザー指示を、隔離integration環境と統合候補生成に対する明示承認とする。[Git safety契約](PARALLEL_DEVELOPMENT_GIT_SAFETY.md)のchecker自体は変更しない。
新しいworktreeは固定mainから開始し、clean baseline、root/commonDir、branch、base、個別scopeを登録する。既存main root/topic/旧候補を変更しない。

1. 新規環境のtopic-development gateで構築前baselineを検査。
2. `git merge --no-commit --no-ff`で固定topicを取り込み、commit前のmerge結果へStudio限定F3修正を加える。
3. 正確なmanifestとstageを照合し、通常のmerge commitを生成する。
4. 完成commitの親を厳密に`[固定main, 固定topic]`と照合。F3以外のtopic差分とmain側の変更を保持する。
5. 完成SHAに対するmain-integration承認記録・元のclean baseline・fresh remote観測でrelease reviewを実行する。

checkerのmain-integrationは完成結果のpush/release review専用であり、development/commit gateとして使用しない。MERGE_HEADがある途中状態をcheckerで正常扱いしない。
手動tree構築、commit-tree、squash/rebase、固定topic変更、merge後へのF3 child commit追加は使わない。
完成候補へのrelease reviewは候補検証であり、main push、PR merge、Pages公開の承認ではない。

## Required verification and boundaries

`tests/component-version-cache.test.mjs`は6ownerの正式宣言、Port ESM query、Chord owner HTMLとの一致、Studio全HTML asset、内部version付きmodule queryを照合する。
`tests/component-version-cache.browser.cjs`は使い捨てoriginで実際の取得URLを記録し、Home/Library/Tuner/Dock、公開registry API、明示Port reader読取りとNo-writeを検査する。
registry APIの直接import試験とHomeでの自動起動範囲を混同しない。Pitch/Fretboard/RhythmのUIをversion取得のために実行しない。

Node全suiteと正式Browser cohortに加え、Structure conversion、Melody staff、Schema2、M2/M3、保存容量、legacy save boundary、狭幅/広幅UIの既存required試験を全件実行する。
正式443Hz WAV、別のloopback port、使い捨てChromeを使用し、8765/8766は操作しない。
性能は8/32/64/128小節の保存前後、各20回以上。64小節の同期編集p95 <=16ms、五線更新 <=500ms。
FAIL/skip/cancelledをPASSに置き換えない。結果・正確な候補SHA・F3個別manifest・原本hash・fresh remoteはrepo外の検証receiptへ保存し、未実施の試験を本文でPASSと先取りしない。

旧main rootの未追跡モック9ファイルは開始終了時hashを照合する。既存topic/旧候補/他owner作業を保持する。
Port/Chord/Pitch/Fretboard/Rhythm/Shared/Worker、Pro/Account/Authority/Syncの製品変更・動的security probe・shared write解禁は行わない。
GitHub Pagesはmain sourceの自動公開に連動する。候補作成は公開ではない。`_proto`のJekyll除外見込みを本番配信確認済みとは扱わない。
将来の公開にはfresh remote main再一致、required gate維持と別の明示承認が必要。
