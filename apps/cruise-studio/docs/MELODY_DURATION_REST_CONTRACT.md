# Melody Duration & Rest Editing Architecture Contract v1

提供されたAstra設計全文。過去の実測記録と今回のM1結果は区別する。

**「Melody Duration & Rest Editing Architecture Contract v1」は、schema 2の正式導入を前提に進める案を採用します。**

編集の正本はStudioProject、編集中の所有者は既存Editing Sessionです。五線は派生表示を維持し、**音符・休符を選択してInspectorから共通commandを実行する**方式とします。音価変更で後続イベントを自動移動したり、小節境界で切り詰めたりしません。

以下は今回確定する設計です。製品コード・文書・Gitは変更していません。

**1. 現状調査の結果**

開始時にremote mainを照合し、指定された以下のSHAと一致しました。

`dbd9a46fe61ebf9583c289ff38a15e81c3abeaef`

調査には、このSHAをcheckout済みの既存ディレクトリ `/private/tmp/cruise-studio-melody-0381-integration-20261015` を使用しました。既存main rootと指定Studio worktreeは切り替えていません。

現行実装は **Studio 0.38.1／schema 1** です。

| 項目 | 現行の事実 |
|---|---|
| 小節 | `bars[]`に格納。配列順が基本。`barNumber`と`sectionId`があるが、永続bar IDはない |
| メロディ | `{tick, durationTicks, step, alter, octave}`。永続event ID、note/rest区別、確認状態はない |
| 音高 | major movable Do。`step`は0〜6、`octave`は基準ドからの相対オクターブ |
| 音価 | `durationTicks`として既に保存されている |
| 自動配置 | **ドレミ入力をSong Modelへ反映する時点**で決まる。五線描画時ではない |
| 配置方法 | 8分枠に収まれば240 tick、収まらなければ120 tick。伸ばし記号で延長 |
| 入力超過 | 現行setterは末尾を短縮・省略し、警告する |
| 休符 | メロディの明示restはない。イベント間・小節末のgapを変換Coreが無音区間として導出 |
| 並び順 | Coreは時間順のコピーで重複・gapを検査。元配列を並べ替えない |
| 小節追加・削除 | セクション末尾の増減などを行い、`barNumber`を再採番 |
| 移動・コピー | メロディイベントを対象にする汎用commandは未実装 |
| 小節長 | Song Modelは`beats × 480`。分母を反映しない。Core／五線は4/4以外を拒否 |
| Undo | 既存Sessionの単一履歴。100件／8MiB制限 |
| 保存 | Sessionの固定snapshotをRepositoryで明示保存。raw revision比較とWeb Locksを使用 |
| migration | 現在はschema 1の既定値補完。schema 2変換は未実装 |
| 五線 | Common Music Modelの成功結果から派生。音価の確認状態は保存していない |
| 印刷 | 現在も従来コード譜へのfallback。五線印刷は未実装 |

根拠：[Song Model](/private/tmp/cruise-studio-melody-0381-integration-20261015/apps/cruise-studio/js/core/song-model.js:80)、[ドレミ入力処理](/private/tmp/cruise-studio-melody-0381-integration-20261015/apps/cruise-studio/js/core/song-model.js:413)、[Common Music Model](/private/tmp/cruise-studio-melody-0381-integration-20261015/apps/cruise-studio/js/core/common-music-model.js:106)、[Repository](/private/tmp/cruise-studio-melody-0381-integration-20261015/apps/cruise-studio/js/core/project-repository.js:63)。

メモリ内で現行関数を実行し、次の非可逆性を確認しました。

```text
元のイベント
  ド：開始240、長さ180
  レ：開始960、長さ480

現行の表示文字列へ変換
  ド〜レ〜〜〜

その文字列を現行setterへ再投入
  ド：開始0、長さ480
  レ：開始480、長さ960
```

これは**現行の文字列変換を、音価編集後のデータの保存・再構築経路に使えない**ことの再現です。通常操作で必ずこの往復が発生する、という主張ではありません。[文字列への変換処理](/private/tmp/cruise-studio-melody-0381-integration-20261015/apps/cruise-studio/js/core/music-theory.js:209)

正式資料との違いは、次のように扱います。

| 重要度 | 相違・実装上の課題 | 今回の判断 |
|---|---|---|
| P1 | 正式schema 2は実音pitch・実音コード・カポ分離を要求するが、実装は相対階名 | 音価フィールドだけ追加した独自schema 2を作らない |
| P1 | 文字列への再変換でgap・音価が失われ得る | 手動編集後のドレミ入力に保護経路を設ける |
| P1 | Sessionは容量超過時に、履歴を消して操作自体を確定する場合がある | 新編集commandは履歴容量を確保できなければ変更前に拒否 |
| P1 | 現行の保存validatorだけでは、Core相当の整数・重複・越境検査を満たさない | schema 2の保存・編集双方に厳格なvalidatorを適用 |
| P2 | モックは確認操作・常設ルーペを示すが、0.38.1は未実装 | モックの操作意図を採用し、製品側で改めて実装・検証 |
| P2 | モックの五線印刷は製品機能ではない | 今回の編集v1と五線印刷を別の完了条件にする |
| P3 | 一部資料の冒頭に0.37／0.38.0の履歴が残る | 現行事実はSHAと0.38.1追記を基準にする |

P0相当の問題は、今回の調査範囲では確認していません。上表は主に**次工程を安全に成立させるための課題**です。

正式schema 2の根拠は[Architecture §9・§13](/private/tmp/cruise-studio-melody-0381-integration-20261015/apps/cruise-studio/docs/INTEGRATED_SCORE_ARCHITECTURE.md:275)、現在の限定実装は[Melody Staff Preview](/private/tmp/cruise-studio-melody-0381-integration-20261015/apps/cruise-studio/docs/MELODY_STAFF_PREVIEW.md:6)です。他モデルの今回のレビュー結果は評価根拠にしていません。

**2. 音価・休符編集の正本モデル**

schema 2のメロディイベントは、次を基本形とします。`durationTicks`は既存の複数形に統一します。

```json
{
  "id": "note_…",
  "kind": "note",
  "onsetTick": 240,
  "durationTicks": 720,
  "pitch": {
    "step": "C",
    "alter": 1,
    "octave": 4
  },
  "provenance": {
    "timing": {
      "onset": {
        "origin": "legacy-unknown",
        "confirmed": false
      },
      "duration": {
        "origin": "user-set",
        "confirmed": true
      }
    }
  }
}
```

restは同じ時間・ID・provenanceを持ち、`kind:"rest"`とします。**restにpitchは持たせません。**

| 情報 | 正本／派生の判断 |
|---|---|
| event ID | 保存する |
| bar ID | 親小節に保存。各eventへの重複保存はしない |
| onset・duration | 保存する。整数tick |
| note/rest | 保存する |
| 音名の綴り・octave | `pitch`として保存する |
| MIDI番号 | pitchから導出。独立して保存・編集しない |
| ドレミ | 階名入力基準とpitchから導出 |
| durationConfirmed | `provenance.timing.duration.confirmed`を唯一の保存値とする |
| manual override | 別の音価値を持たない。commandが正本のdurationを更新する |
| 描画用タイ・連桁・座標 | 派生。保存しない |
| gap | event配列の補集合。自動では保存しない |
| 選択・Inspectorの開閉 | Session外のUIメモリ。曲履歴に入れない |

開始位置と長さの確認状態は分けます。**長さを変更しただけでは、自動配置された開始位置まで確認済みにしません。**

`origin`は少なくとも次の3値です。

- `legacy-unknown`：schema 1由来で判断できない。
- `auto-assigned`：新しいドレミ入力の自動配置。
- `user-set`：ユーザーが数値に対応する操作を明示した。

確認ボタンを押しても元の`origin`は保持し、`confirmed`だけを変更します。

IDの契約は以下です。

| 場面 | 規則 |
|---|---|
| 新規 | `crypto.randomUUID()`によるIDを発行。Project内で重複検査。利用不能なら作成を拒否 |
| migration | 移行版・project ID・元の位置から決定的に生成 |
| 移動・並べ替え | 維持 |
| コピー | 新規発行。内部参照も対応表で更新 |
| note/rest変換 | 同じ時間上の対象としてID維持 |
| Undo/Redo | 記録済みIDを復元。再採番禁止 |
| Save/Load・通常JSON往復 | 維持 |
| 別曲としてimport | project IDを新規発行。内部IDはProject内スコープとして維持可能 |

移行IDは、例えば`m1:<エスケープしたprojectId>:melody:<元bar位置>:<元event位置>`の決定的な形式にします。**位置を使うのは移行時だけ**で、移行後は不透明なIDとして扱います。現在位置から再生成しません。

**3. v1編集機能**

| v1に含める | 後続工程 |
|---|---|
| 音符・明示休符の長さ変更 | 音符の分割・結合 |
| gapへの明示休符挿入 | イベント／小節のコピー専用UI |
| note→rest、rest→note | 小節をまたぐ移動・持続 |
| イベント削除 | ドラッグによる位置・音高編集 |
| 同一小節内の開始位置変更 | 複数声部、三連符作成 |
| 選択イベント／小節の時間確認 | 自由な音高編集、TAB直接編集 |
| 単一Undo、明示保存、JSON往復 | 五線印刷・MusicXML・新しい演奏MIDI |

同一小節内の位置変更はv1に含めます。これがないと、密に自動配置された音列を正確なリズムへ直す作業が、削除と再入力に偏るためです。

**4. 時間軸の不変条件**

初期対象は **4/4、480 PPQ、1920 tick／小節、メロディ1声部**です。

```text
0 ≤ onsetTick < 1920
durationTicks > 0
onsetTick + durationTicks ≤ 1920
onsetTick・durationTicksは安全な整数
```

イベント区間は半開区間`[onset, onset + duration)`です。noteとrestを合わせて、互いに重なってはいけません。境界で接することは許可します。

| 操作・状態 | 契約 |
|---|---|
| 短縮 | そのイベントだけ短縮。後ろにgapが生じる |
| 延長 | 後続のnote/restまたは小節末に接するまで許可 |
| 延長先にrest | 明示restも占有区間。黙って削除・短縮しない |
| 開始位置変更 | durationを維持。移動先の重複・越境を検査 |
| 削除 | 対象だけ削除。空いた時間はgap |
| 小節末の余白 | gapのまま保持。前の音を自動延長しない |
| 明示rest | ユーザーが意図した休止。保存・Undo対象 |
| 暗黙gap | 現時点でイベントがない時間。未確認として表示 |
| 自動補正 | 派生表示の並べ替え・番号付け・記譜分割だけ許可 |
| 禁止 | 時刻の丸め、duration切詰め、後続移動、音の結合、gapの自動保存 |

編集方式は**非リップル編集**に固定します。リップル方式は、歌詞・コード・小節境界まで変更対象が広がるため、後続の明示機能とします。

一つのnoteを記譜上分割した場合、各fragmentは同一event IDを参照します。タイはその持続を描く派生物です。長さの変更で分割が不要になればタイも消えます。

隣接する別IDの同音は、同じpitchでも別の発音です。自動でタイを付けません。

**5. 音高／Capo契約**

schema 1の移行前実音は、現行式を固定して評価します。

```text
MIDI =
60 + pitchClass(playKey) + capo
   + [0,2,4,5,7,9,11][step]
   + alter + 12 × octave
```

minor chordを理由にminor scaleへ変更しません。既存関数の丸めを、不正データの補正に使うことも禁止します。

schema 2では次の所有関係にします。

| 対象 | 所有者・意味 |
|---|---|
| メロディ実音 | 各noteの綴り付き`pitch` |
| コード | 実音基準のコード記号 |
| 調性表示 | `songInfo`。既存音符を書き換えない |
| カポ | `instrument.capo` |
| 階名入力基準 | 独立したmajor階名の基準音・基準オクターブ |
| Play Key・フォーム用コード | 実音側と楽器条件から導出 |
| ギター移調記譜 | ギター表示の責務。歌の五線には適用しない |

今回、カポ時のコード入力・コード譜表示は**従来と同じフォーム基準**を既定として確定します。UIに「フォーム基準」と明記し、入力時に実音コードへ変換します。保存した実音コードとフォーム文字列を二重更新しません。

例：

- Play B・Capo 2・ドは、現行実音73。移行後も73。
- C♭のドは現行式では71。一般的な別オクターブへ「修正」しない。
- 音価変更だけで、pitch・綴り・octave・キー・カポは変わらない。
- 実音保持でCapo 0→2にすると、歌のC4は60のまま。
- フォーム保持でCapo 0→2にするときだけ、明示した曲全体移調として+2する。

既存のキー・カポ欄からの直接代入はschema 2に流用しません。目的を「表記変更」「実音保持カポ」「フォーム保持カポ／移調」に分けたcommandへ置き換える必要があります。

**6. schema移行案の比較**

| 観点 | A：schema 1拡張 | B：schema 2 | C：memory-only先行 |
|---|---|---|---|
| 旧曲の読込 | 容易だが旧アプリが新意味を誤読 | v1 adapterで維持 | 維持可能 |
| データ破壊リスク | 高い。旧setterがID/rest等を失わせ得る | 移行とvalidatorで管理可能 | reload・切替時の編集喪失に注意 |
| 二重正本 | 旧形式との併存を招きやすい | 一つにできる | 別draftを作ると高リスク |
| 実装規模 | 小さく見えるが互換分岐が増える | 最初は大きい | 保存実装時に再設計が必要 |
| Undo | 追加可能だが旧操作との意味が混在 | 共通commandで統一 | 一時編集と保存状態の説明が難しい |
| migration | 形式差を隠してしまう | 明示的・試験可能 | 後で必要 |
| rollback | 旧アプリが受理して情報を落とす危険 | 原文バックアップから復元 | 未保存変更を失う |
| 将来TAB | 不向き | 正式契約に一致 | 結局schema 2が必要 |

**Bを採用します。** Aは表示専用フィールドの例外に該当せず、Cは今回の「保存できる譜面制作機能」への移行を二度に分けてしまいます。

**7. 採用するschema方針**

**既存の正式schema 2契約を維持し、その必要部分を実装します。** 相対階名を正本のまま残した別仕様のschema 2は作りません。

最低限の移行対象は以下です。

| schema 1 | schema 2 |
|---|---|
| barNumberによる識別 | 永続bar ID。番号は表示時に導出 |
| melodyの相対階名 | 実音pitch、note/rest、ID、時間provenance |
| chordsのフォーム記号 | ID付き実音コード。解釈不能なら原文＋元の音高基準 |
| lyrics | ID付き時間イベント。音符への自動対応付けはしない |
| `songInfo.capo` | `instrument.capo` |
| `playKey`による音高依存 | 階名入力基準とフォーム表示の派生値へ分離 |
| `strumPatterns` | `materials.rhythms`内の曲内snapshot |
| 基本／小節ストローク割当 | `performance`内のmaterial参照 |
| 譜面設定・改行指定 | `notation`内の唯一の保存場所 |

ストロークsnapshotは初期段階では`encoding:"studio-strum-v1"`として、現行のslots・action・duration・未解決情報を保持して構いません。**今回、新しいRhythm演奏解釈へ変換したことにしません。**

フォームやTABの新機能、外部本棚接続は実装対象外です。

**8. migration契約**

移行は**Repository／JSON読込境界で、Session作成前にメモリ上で実行**します。

1. 元JSON文字列を保持する。
2. schema 1構造と数値を検証する。
3. 元位置から安定IDを生成する。
4. 旧式で全メロディの実音を算出する。
5. 綴り付き実音pitchへ変換し、MIDI一致を検証する。
6. コード・楽器設定・ストローク割当・記譜設定を移す。
7. onsetとdurationを変更せずコピーする。
8. 時間の由来を`legacy-unknown／confirmed:false`にする。
9. schema 2全体と参照整合を検証する。
10. 成功したsnapshotからSessionを開始する。

| 条件 | 契約 |
|---|---|
| legacy source | 同じProject内の`provenance.legacySource`に元JSON原文と移行版を保持 |
| 原文の用途 | 復元・監査専用。表示・演奏・編集の入力に使わない |
| 第二保存領域 | 作らない。旧原文を別localStorageキーへ自動保存しない |
| idempotency | 同じv1入力は同じv2・IDになる。日時・乱数をmigrationに使わない |
| v2再読込 | 再移行・再採番・原文の入れ子化をしない |
| Save/Load | ID・pitch・時間・確認状態・由来を保持 |
| metadata | 読込だけで保存時刻や保存済みappVersionを更新しない |
| キー不整合 | 旧実音を優先。整合したと偽装しない。綴りを安全に確定できなければ移行停止 |
| 非4/4・非480 PPQ | v2編集を有効化しない。対応するv1互換経路を維持 |
| 不正・曖昧な時間 | 修復せず移行FAIL。v2保存不可 |
| future schema | 読込・編集・上書きを拒否 |
| unknown field | 勝手に削除しない。v1は原文を保持し、意味を判断できない追加項目では自動移行を停止 |
| v2拡張項目 | 明示した`extensions`内のJSONは無解釈で往復。未知の構造項目・kindは編集保存を拒否 |
| 容量超過 | 原文も含め予算検査。バックアップを捨てて成功させない |
| Undo | migration自体は対象外。schemaをUndoで戻さない |

有効なv1データが「非対応」である場合と、不正データによる「FAIL」は区別します。前者は従来機能をv1として利用できますが、v2へ保存しません。後者は原文を保持し、失敗した変換結果を書き込みません。

読込後は、曲内容のdirtyとは別に「旧形式から変換済み・未保存」を表示します。明示保存が成功するまでは保存領域のv1を維持します。

初回v2保存では旧raw revisionと比較し、原文を含むv2を同じProjectキーへ保存します。保存後のrollbackは元JSONの明示的な復元です。**v2での編集内容を保ったv1への逆変換は提供しません。**

**9. Editing Session command仕様**

共通command envelopeを次の意味で固定します。

```text
type
projectId / sessionId
documentGeneration / workspaceGeneration
expectedSnapshotVersion
expectedBaseRevision
barId
eventId または gap区間
payload
```

実行手順は共通です。

```text
対象・世代検査
→ 入力中／競合／保存中検査
→ staged draftへ変更
→ 時間・参照・音高・容量検証
→ 履歴記録可能性の検査
→ Sessionへ一括確定
→ 五線の更新要求
```

失敗時はdraft・dirty・Undo/Redo・保存領域を変更しません。

| command／操作 | 入力・事前条件 | 更新・不変条件 | エラー／Undo／UI |
|---|---|---|---|
| `melody.setDuration` | event ID、新duration。note/rest共通 | durationとその由来・確認だけ変更。pitch・onset不変 | 重複・越境・未対応値は拒否。1履歴。選択維持 |
| `melody.insertRest` | bar ID、開始、長さ。対象全体がgap | 新rest IDを発行 | 空き不足は拒否。1履歴。新rest選択 |
| `melody.setKind` note→rest | note ID | ID・時刻維持、pitch削除。時間の未確認はそのまま | 1履歴。Undoで元pitch復元 |
| `melody.setKind` rest→note | rest ID、明示pitchまたは階名入力 | 同じID・時刻にnoteを作る | pitch未指定・範囲外は拒否。隠した旧pitchを勝手に復活させない |
| `melody.delete` | event ID | 対象削除。gapを残す | 1履歴。選択解除、近隣へのフォーカスのみ移す |
| `melody.move` | event ID、新onset。同一小節 | ID・duration・pitch維持。onsetをuser-setにする | 重複・越境拒否。1履歴。選択維持 |
| `melody.confirmEventTiming` | event ID、確認する属性 | 指定したonset／durationの確認だけ変更 | 不正値・未対応表示では拒否。1履歴 |
| `melody.confirmGap` | snapshot付きgap区間 | gap全体を明示restへ変換 | gapが変化していたら拒否。1履歴 |
| `melody.confirmBarTiming` | bar ID、対象snapshot | 全eventの時間を確認し、全gapを明示rest化 | 一部だけ成功させない。全体で1履歴 |
| 分割：後続 | event ID、分割tick | 左ID維持、右は新ID。明示的な再発音として分割 | 端点・不正分割拒否。全体1履歴 |
| 結合：後続 | 隣接する2つのnote ID | 同一pitch・綴り、gapなし。左IDで一つにする | 再発音が消えることを明示。全体1履歴 |
| コピー：後続 | source ID、destination | 新ID。元イベント不変。未確認を確認済みに格上げしない | 配置先検証。全体1履歴 |
| Undo/Redo | 既存Session command | 内容・ID・確認状態を復元 | 別stack禁止。古いcallbackは失効 |
| Project切替 | 切替先project ID | 各Sessionのdraft・履歴を分離保持 | IME中は切替拒否。未保存draftを破棄しない |

実装上の注意は二つです。

- 現行`runOperation()`は、callbackが`{ok:false}`を返しただけでは中止しません。失敗時は明示cancelまたは例外経路を使います。
- 現行の容量超過処理は操作を履歴なしで公開します。新commandには`requireUndo`相当の経路を設け、**公開前に拒否**します。

根拠：[Sessionの操作確定処理](/private/tmp/cruise-studio-melody-0381-integration-20261015/apps/cruise-studio/js/core/editing-session.js:225)。

**10. UI／UX仕様**

比較すると、v1には「五線で選択、Inspectorで編集」が適しています。

| 方式 | 判断 |
|---|---|
| 五線上でドラッグして長さ・音高変更 | 誤操作、狭幅、IME、タッチ操作の検証範囲が大きい。後続 |
| 五線と無関係な別編集画面 | 対象対応を見失いやすい。不採用 |
| 五線で選択し、Inspectorで変更 | 対象を確認しながら既存commandへ接続できる。採用 |

Inspectorには、選択中の対象に必要なものだけを表示します。

```text
3小節目・2拍目　ド♯
音符／休符
長さ：全・2分・4分・8分・16分 ＋ 付点
開始位置
時間の状態：開始位置は自動／長さは確認済み
［この音の時間を確認］
その他：削除
```

gap選択時は「空いている時間」と表示し、［休みとして確定］を提示します。明示restには「休符」、gap由来の休符には「未確認の空き時間」とアクセシブル名を付けます。

- 五線のfragmentを選ぶと、元event全体を選択する。
- パネルを開いた時点のIDとsnapshotを保持する。
- 変更ボタンは即時command、1操作1Undo。数値入力は確定時に適用する。
- 入力途中の値はUIバッファであり、第二のProject draftにしない。
- エラーは「次の音に重なります。変更は適用していません」のように対象のそばへ表示する。
- 小節の警告は、未確認eventまたはgapが残る間は消さない。
- コード譜へ切り替えても、内容・履歴を維持する。
- 狭幅ではInspectorを下部編集領域へ移し、選択音を覆わない。
- 五線とInspectorの再描画で、ルーペの入力DOM・caretを作り直さない。

**ドレミ入力の保護を必須とします。**

1. 自動配置だけの小節は、従来の文字入力操作を維持する。ただし超過・不明文字を黙って省略して確定しない。
2. 時間を手動編集・確認した小節や明示restを含む小節は、文字列を全イベントの再構築に使わない。
3. 同数の音符への階名変更は、対応が明確な音符のpitchだけ変更する。ID・時刻・restを維持する。
4. 音数変更や伸ばし記号による再配置は、［小節を自動配置で置き換える］として変更内容を示し、明示実行する。
5. 自動配置に置き換えた範囲は`auto-assigned／未確認`に戻す。
6. focus・blur・表示切替・保存だけで再parseしない。

キーボードは、五線側の左右キーを選択移動、EnterをInspector、Escapeを閉じる操作にします。文字入力欄のUndoはブラウザ、譜面操作のUndoはSessionに委ねます。IME変換中とcomposition直後は、音価command・削除・選択変更を実行しません。

承認済みモックの根拠：[HANDOFFの音価・IME契約](/private/tmp/cruise-studio-melody-0381-integration-20261015/apps/cruise-studio/_proto/integrated-score/HANDOFF.md:5)。

**11. 五線描画への反映方法**

流れは次の一本にします。

```text
Sessionのworking snapshot
→ schema別converter
→ Common Music Model
→ melody notation projection
→ VexFlow／共通レイアウト
```

schema 2用の派生契約は**Common Music Model v2**として区別します。v1 converterのschema判定を外すだけの対応は禁止です。

v2で追加する内容は、永続bar/event ID、明示rest、時間の由来・確認状態です。gapは引き続き派生区間として別に持ちます。

- `sourceEventId`と描画fragmentを対応付ける。
- gapの選択は`barId＋区間＋snapshotVersion`で識別する。
- 画面上の座標から保存tickを逆算しない。
- `convert()`／`isCurrent()`の発行元・世代・raw revision検査を維持する。
- 予約frameと表示採用直前に再検査する。
- 旧表示を入力中に保持する場合は、0.38.1同様にpendingと明記し、編集対象にしない。
- fatalの部分結果を採用しない。今回、全体成功条件を緩めない。

根拠：[変換serviceの現在性判定](/private/tmp/cruise-studio-melody-0381-integration-20261015/apps/cruise-studio/js/core/structure-conversion.js:9)。

記譜対応は次の範囲にします。

| 項目 | v1 |
|---|---|
| 全・2分・4分・8分・16分 | 作成・編集・表示 |
| 付点 | 単付点。2分・4分・8分・16分を正式対応 |
| 付点全音符 | 4/4小節を超えるため拒否 |
| 休符 | 同じ時間精度で対応。長い区間は複数休符へ分割可能 |
| タイ | 同一eventの記譜fragment間のみ自動生成 |
| 連桁 | 既存の四分拍内の自動連桁を継続 |
| 臨時記号 | 保存pitchの綴りに従う。小節内の効力を描画層で処理 |
| 調号 | 現行Cb〜C#の対応を継続 |
| octave | 実音のletter octave。音価変更では不変 |
| 32分・64分 | 現行の正確な読取表示を維持。作成用ボタンは後続 |
| 三連符 | 数値を保持するが編集・五線表示は未対応。160→120等に丸めない |
| 複数声部 | 未対応 |
| 小節またぎタイ | 後続 |

現行の記譜分解は30 tick単位まで対応しています。[melody notation](/private/tmp/cruise-studio-melody-0381-integration-20261015/apps/cruise-studio/js/core/melody-notation.js:7)

保存モデルの「有効な整数時間」と、編集UI／rendererの「対応できる時間」を分けます。未対応値が存在してもデータを失わせず、対応していない操作だけを拒否します。

**12. Save／Load・Undo**

- 保存先は既存のProjectキー。Inspector専用保存は作らない。
- 保存は既存Sessionの`commit()`を通す。
- schema 2を扱うHome・JSON import/export・Structure・Pre-DTMの読込経路を揃える。
- 読込・選択・描画・確認候補表示ではProjectを書き込まない。
- 時間の確認状態変更は曲内容なのでdirty・Undo対象。
- 保存成功後もUndo履歴を保持する。
- 保存中に編集された場合、保存開始時のsnapshotだけをbaseとして採用し、新しい編集はdirtyのまま残す。
- 保存失敗・競合・結果不明ではdraftを保持する。
- raw revisionが変わっていたら、移行結果で旧データを上書きしない。
- A→B→Aでも、Aの古いUI callbackを復活させない。
- 原文バックアップは不変メタデータとして扱い、履歴に毎回重複計上しない。ただしProject全体の容量検査から除外しない。

Web Locksと複数localStorageキーの更新は、プロセス停止まで含む完全なDB transactionではありません。既存の失敗時復元と`result-unknown`を維持し、保存成功を偽装しないことも受入条件です。

**13. 受入テスト一覧**

以下は次工程の試験契約です。今回、新機能の試験を実行済みとはしていません。

共通して、拒否ケースでは**draft・履歴cursor・dirty・保存rawが不変**であることを検査します。

| # | 入力例 | 期待結果／失敗条件 |
|---|---|---|
| 1 音価変更 | note開始0・長さ240→480、次音960 | 長さだけ480。pitch・ID不変 |
| 2 休符挿入 | gap 480〜960へrest 480 | 新IDの明示rest。周囲不変 |
| 3 休符変更 | rest開始480・長さ240→480 | 960まで伸長。noteを変更しない |
| 4 note/rest | C4をrestへ、続いて明示D4でnoteへ | ID・時刻維持。Undoで各段階を復元 |
| 5 overlap | 次音開始480に対し、前音0から720へ | 全体拒否。240だけ部分延長しない |
| 6 小節越境 | 開始1680・長さ480 | 拒否。240へ切り詰めない |
| 7 短縮 | 0〜960を480へ短縮 | 480〜960がgap。次音不動 |
| 8 延長 | 0〜240を480へ。次音480 | 接する変更は成功。481は拒否 |
| 9 gap保持 | 開始240・長さ180のnoteを読込・表示・保存 | 前後gap維持。restの自動保存なし |
| 10 Undo/Redo | 音価変更→rest挿入→Undo×2→Redo×2 | 内容・ID・確認状態を完全復元 |
| 11 Save/Load | note/rest・gap・由来を含むv2 | metadata以外は意味的同値 |
| 12 v1 migration | 旧step・tick・durationの曲 | 全noteのMIDI、開始、長さが一致 |
| 13 idempotency | 同じrawを2回移行、v2を再読込 | 同じID。原文の重複追加なし |
| 14 安定ID | 前の小節削除・再番号・Undo・再読込 | 残る小節／eventのID不変 |
| 15 音高保持 | B＋Capo2、C♭、B♯、上下octave | 旧式MIDIと完全一致。音価編集でも不変 |
| 16 key/capo | 実音C4でCapo0→2実音保持 | MIDI60維持。明示+2移調時だけ62 |
| 17 A/B分離 | Aを未保存編集→B編集→A | A/Bの内容・Undoが混ざらない |
| 18 stale | Aのパネルを開きB→A、旧適用callback実行 | generation違いで拒否 |
| 19 IME | ドレミ・歌詞変換中に音価変更、Undo、切替 | command拒否。文字・caret・対象維持 |
| 20 no-write | v1読込、移行、選択、描画、確認候補 | Project・index・外部保存の書込ゼロ |
| 21 invalid | NaN、小数、0・負duration、重複ID、未知kind | validator／commandで拒否 |
| 22 unsupported | 160 tick、非4/4、非480 PPQ | 元値保持。近似表示・偽の成功なし |
| 23 print境界 | メロディ表示中に印刷／cancel | コード譜fallbackを明示。原データ不変、編集UI非印刷 |
| 24 他機能非干渉 | 同じ旧曲を移行前後で伴奏生成 | 既存Pre-DTMの音高・時刻等が一致。Chord/Rhythm/TABへの新規書込なし |
| 25 性能 | 8／32／64小節、単一変更・連続変更 | 古い描画不採用。性能・focus・scrollを計測 |
| 26 ドレミ往復 | 前述の開始240・長さ180の例 | blur・保存で再配置されない。pitch編集でも時間維持 |
| 27 部分確認 | 4音中1音の長さだけ変更 | 他の開始位置・長さ・gapの未確認表示が残る |
| 28 小節確認 | note＋複数gapを一括確認 | gapを明示rest化し、全体で1Undo |
| 29 履歴容量 | 一操作が履歴予算を超える | draftも既存履歴も維持して拒否 |
| 30 保存競合 | migration後、別タブがraw更新 | 保存拒否。両方の内容を勝手に混合しない |
| 31 保存失敗 | quota・index更新失敗・復旧失敗 | dirty保持。成功表示しない |
| 32 原文復元 | 空白・unknown項目を含む旧JSON | 保持した原文をそのまま取得可能 |
| 33 記譜fragment | 拍途中からの長音を選択・短縮 | 元eventを編集。fragment IDを正本にしない |
| 34 無変更操作 | 現在値を再適用、パネル開閉 | 内容も確認状態も同じなら履歴なし |
| 35 旧consumer | schema 2を旧解釈経路へ渡す | 明示拒否。stepを0とみなす等のfallback禁止 |

性能試験は同一環境・同一fixtureで0.38.1と比較します。初期受入目安は、64小節の更新完了500ms以内、同期編集処理のp95が16ms以内、変換・描画時間がbaselineの概ね1.5倍以内です。20回以上測定し、環境を記録します。これは**今回の実測結果ではなく、次工程の目標値**です。

合成IME試験に加えて、macOS／Windowsの日本語IMEとSafariを実機確認します。未実施なら、実施済みとして完了扱いにしません。

**14. 既存機能への影響**

変更範囲はStudio内でも広がります。主な理由は、schema 2の正本を旧consumerが誤読しないためです。

| 対象 | 必要な対応 |
|---|---|
| Song Model | schema別validator、migration、ID、pitch、時間command |
| Editing Session | Undo必須操作の容量事前拒否、不変移行メタデータ |
| Repository／storage | raw原文の受渡し、schema別読込、JSON往復 |
| Structure | ID参照、ドレミ保護、キー／カポcommand |
| Common Music Model | v2 converterとsource ID |
| Melody notation／staff | 明示rest・確認状態・event選択 |
| Pre-DTM | schema 2 adapter。既存伴奏結果を維持 |
| Print | v2から従来コード譜を生成する読取adapter |
| Home／import | 新規作成・読込・別曲importのschema整合 |

**他アプリ側の実装変更は不要な設計にします。** Studio内のreleased pure API利用を維持し、Chord／Rhythm本体、Shared、Worker、Pro／Account／Sync／Authorityには変更を広げません。

五線印刷は今回の完了条件に含めず、「コード譜を印刷します。五線は印刷されません」を継続して明示します。モックの完成譜印刷とは別工程です。

**15. 不明点・未確定事項**

設計の中核は今回決定しました。残るものは次の実測・実装前確認です。

- 実利用データに含まれるunknown fieldや不正値の分布。今回、ユーザーの保存領域は調査していません。
- 原文バックアップを含めた実際の保存容量・履歴処理時間。
- 実機IME、Safari、狭幅でのInspector配置。
- 今後実装を開始する正確なworktree・branch・ファイルmanifest。
- 製品バージョン番号。schema番号とは別に、次工程の変更規模から決定する必要があります。

次は未決として残しません。

- schema：2を採用。
- 時間編集：非リップル。
- 確認単位：属性／eventを保存単位、小節は集約表示と一括操作。
- カポ時のコード入力・既定表示：フォーム基準。
- 音高の保存正本：実音の綴り付きpitch。
- 原文保持：同一Project内の復元専用記録。
- 五線印刷：今回の範囲外。

**16. 実装ロードマップ**

| Milestone | 実装対象 | 完了条件 | 停止条件 | 回帰／Git対象 |
|---|---|---|---|---|
| **M1：schemaとSession契約** | schema 2、migration、ID、音高分離、全consumer adapter、pure command、Undo容量保護 | 移行前後の音高・時間・既存伴奏一致。v1/v2往復、no-write、競合試験成功 | 1音でも実音差、情報欠落、旧consumer混入、無断書込、原文喪失 | Studioのcore・保存・Structure／Pre-DTM adapter・関連テスト・契約文書 |
| **M2：音価・休符UIと五線連動** | event選択、Inspector、gap確定、確認表示、ドレミ保護、IME／focus | v1操作を同じSessionで実行できる。1操作1Undo。選択・入力DOM保持 | 誤対象更新、時間の丸め、IME破壊、部分確認で警告全解除 | StudioのStructure UI、staff／notation、HTML／CSS、関連テスト |
| **M3：保存・統合回帰** | Save/Load、JSON、A/B、外部更新、print fallback、性能・実機試験 | 上記受入試験と既存正式Node／Browser回帰が成功 | 保存不明を成功扱い、回帰FAIL、実機条件未達、他ownerへの変更要求 | Studio内の統合テスト・必要な修正・version／cache参照・文書 |

各工程では対象ファイルを個別manifestで確定します。`apps/cruise-studio/`全体の包括許可にはしません。

Gitの作成・変更・公開操作は次の実装依頼で指定する事項です。今回の設計完了を、commit・push・main統合・deployの承認として扱いません。

**17. Sol向け一括実装の推奨範囲**

**最初からM1〜M3全部を一括実装することは推奨しません。**

正式schema 2には、メロディの音価以外に、実音・コード・カポ・ストローク保存・既存consumerの変更が含まれます。ここを省略したままUIだけ完成させると、後から保存形式をやり直すことになります。

実装単位は二つを推奨します。

1. **M1を一つの実装工程として完成させ、独立レビューする。**
2. **M1の合格後、M2＋M3を一括実装する。**

M2＋M3はUI・Undo・保存の往復を同時に確認する必要があり、分けすぎない方が合理的です。分割・結合・コピー専用UI、三連符、跨小節タイ、五線印刷、TAB、本棚は、この実装範囲へ追加しません。

**18. 推奨モデル・推論レベル**

今回の推奨モデル：**Sol 6.1**
推論レベル：**高**
理由：今回の契約で判断の境界を定めたうえで、保存migration・状態管理・複数consumerの回帰を扱う実装になるためです。M1で契約に収まらない曖昧さが判明した場合は、深い推論で実装を押し進めず、設計判断へ戻す方が総コストを抑えられます。

調査終了時、参照用チェックアウトと指定Studio worktreeはcleanでした。main rootの既存未追跡項目も残っています。コード・文書の書換え、stage、commit、push、branch切替、worktree作成、サーバー操作は行っていません。ここで独立設計レビューを終了します。
