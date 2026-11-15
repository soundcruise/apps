# アコギ比較音声 — 0.127.0-dev.1

各ファイルは **旧音 4.8秒 → 無音 0.5秒 → 新音 4.8秒 → 無音 0.5秒**。ヘッドホン等で同じ再生音量のまま比較する。

- [ダウンのみ](down-old-then-new.mp3)
- [アップのみ](up-old-then-new.mp3)
- [ダウン／アップ交互](alternating-old-then-new.mp3)
- [休符・ミュート・C→Gの変更](rest-mute-change-old-then-new.mp3)
- [旧音の全フレーズ](old-matched.mp3) / [新音の全フレーズ](new-matched.mp3)（各19.2秒、上記4区間の順）
- [不具合のあった旧「通常再生」](old-normal-voicing-bug.mp3)（4.8秒。Cが3音になる別資料）

## 比較条件

テンポ100、同じ登録Cフォーム `[48,52,55,60,64]`、Gフォーム `[43,47,50,55,59,67]`、同じストローク位置。4種類とも2小節ずつ。
旧実装はコミット `ece208672f3f8ed815687666dc5ddeb6685930bd`。主比較では旧実装にも登録フォームresolverを渡し、押さえ方の違いを除いて発音・余韻を比較した。「不具合のあった旧通常再生」だけはresolverを渡していない。

実際の `createPianoAudition` と Audio Coordinator を抽出して Chromeの **OfflineAudioContext** で44.1kHzモノラルにレンダー。MP3の復号・近接サンプルのピッチ変換・GainNode・BufferSourceは実Web Audio。単なるイベント表から別シンセを作った音ではない。外部サイト・本番API・実アカウントは使っていない。

各区間の旧／新を一定のゲインで **−28 LUFS** に調整した。リミッター、コンプレッサー、リバーブは未使用。PCMでの再測定は−28.02〜−27.97 LUFS、最大True Peakは−2.21 dBTP。大きなミュートのピークを圧縮せず比較するため、控えめな基準音量を選んだ。MP3は192kbps。数値はエンコード前PCMの測定値であり、知覚上の完全一致を保証するものではない。

[測定値](audio-metrics.json) / [再生成スクリプト](../../scripts/render-acoustic-comparison.cjs)。各 `events:144` は区間ごとでなく全8小節の総イベント数。

```sh
NODE_PATH=/path/to/playwright/node_modules node apps/cruise-studio/scripts/render-acoustic-comparison.cjs
```

Python等の別音源ではなく実装の出力を使用したこと、フォーム一致、発音順、停止境界、ラウドネスは客観検証済み。人による聴感評価、「本物らしい」「好ましい」という判定は未確認。特にアップの強さ、低音の余韻、ミュートのノイズ量を聞き比べて判断する。

## 音源の権利・加工表示

録音: **University of Iowa Electronic Music Studios**。収集・編集: **N. P. Brosowsky / tonejs-instruments**。
[元録音の固定リビジョン](https://github.com/nbrosowsky/tonejs-instruments/tree/622c2f1c32c8cfce4158ddc3eb26e518ddef37e5/samples/guitar-acoustic)。
録音素材は [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/)、[ライセンス本文](https://creativecommons.org/licenses/by/3.0/legalcode)。
[同梱音源の権利表示](../../vendor/guitar/NOTICE.md)も参照。

本比較では既存13音を復号・移調・時間配置・音量包絡・ミックス・ラウドネス調整・MP3化した。ミュートは既存実装の合成ノイズ。元録音者による承認を意味しない。録音由来の部分には上記ライセンスと帰属を保持する。自社実装コードのライセンスとは別扱い。新規素材の取得・購入・公開パッケージへの追加は行っていない。
