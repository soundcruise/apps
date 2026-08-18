# コードクルーズ 開発概要（AIエディタ引き継ぎ用）

このファイルは、ChatGPT / Claude Code / Cursor / Codex など、どのAIエディタ・どのチャットで作業を再開しても
「コードクルーズ」の現状・設計・注意点を正確に引き継げるようにするための資料です。

**コードクルーズを修正するたびに、`apps/chord-cruise/ai-handoff/CHORD_CRUISE_OVERVIEW.md`（このファイル）も更新してください。** 更新不要と判断した場合は、完了報告にその理由を書いてください。
ユーザー向けの変更（見た目・文言・機能追加など）を行った場合は、`apps/chord-cruise/ai-handoff/chord-cruise-overview.html` も合わせて更新してください。

---

## 1. 基本情報

- アプリ名: コードクルーズ（Chord Cruise）
- ディレクトリ: `apps/chord-cruise/`
- 通常版URL: `https://soundcruise.jp/apps/chord-cruise/`（要確認: 本番公開状況は本ドキュメント作成時点で未確認。ディレクトリ構成から推測した一般的なURL）
- PRO版URL: **現時点でPRO版は存在しない。** `standard/` `pro_xxxxx/` のようなディレクトリ分割、`data-app-edition` 属性、PRO認証関連コードは一切見つからなかった。
- 現在のバージョン: `0.22.7`（Phase E1 分数コードbass overlay基盤を正式commit・push済み。ユーザー実機確認済み）
- v0.22.1直前の正式Chord Cruise commit（`git log --oneline -- apps/chord-cruise/` で確認）:
  - hash: `a562888a078494d6deeb9900d2b15260bc35128e`
  - message: `7種類のスケール選択に対応`
- `0.21.1`の正式修正: `saveChord`／`deleteChord`の原子的保存、詳細画面の保存失敗処理、書き込み障害注入テスト。実機確認済み。
- `0.21.2`の正式修正: 右上表示設定は候補値を先に`storage.saveSettings()`へ保存し、成功時だけ既存の共有`state.settings`へ反映して再描画する。失敗時はメモリ・UI・プレビューを変更せず、「設定を保存できませんでした」を表示する。本棚一覧専用設定は変更せず、実機確認済み。
- `0.21.3`正式修正: modal / bottom sheet のTab・Shift+Tabを共通helperで循環させる。Escape・backdrop・既存の保存処理は維持し、閉じた後は有効なopenerへfocusを戻す。
- `0.21.4`正式修正: コード削除・フォルダ削除・表示設定リセット確認に`aria-labelledby` / `aria-describedby`を追加し、スクリーンリーダーへ対象と重要説明を関連付ける。`alertdialog` / `dialog`の使い分け、初期focus、focus trapは維持する。
- `0.21.5`正式修正: 保存前編集と本棚詳細の編集可能マーカーへ`role="button"`、`tabindex="0"`、簡潔な`aria-label`、`aria-keyshortcuts="Enter Space"`を付与する。Enter / Spaceは既存クリック処理を1回だけ実行し、再描画後は同じ論理マーカーへfocusを戻す。マウス／タッチ、focus trap、保存失敗安全化は維持し、実機確認済み。
- `0.21.6`正式修正: Exploreのコード選択時に表示していた下部詳細カード（構成音・度数・役割・雰囲気・よく行くコード）を生成しない。`chord-info.js`の辞書とAPI、詳細行ビルダーは削除せず保持し、保存データ・任意コード・CAGED・指板表示には影響させない。実機確認済み。
- **v0.21.7 Phase 1確定**: `music-theory.js`へChord Cruise独自の`SCALES.major / minor`を導入し、3和音はscale上の1・3・5、4和音は1・3・5・7を積んで既存`QUALITIES`へ完全一致で照合する。`DIATONIC.major / minor`の公開shape、全12キーのrootPc・コード名・interval・qualityKey・Roman、Major/Minorの2ボタン、CAGED、保存schema、note spellingは変更しない。v0.21.6固定期待値336ケースとの完全一致テストを追加し、ユーザー実機確認済み。将来候補はDorian / Phrygian / Lydian / Mixolydian / Locrian。Roman全大文字化は別工程で、今回は行わない。Pitch Cruiseは参照のみで変更・import・shared化しない。
- **v0.21.8 Roman表記統一**: Major / Minorの3和音・4和音とも、Romanの度数部分だけを全大文字へ統一した。quality suffixの`M7` / `m7` / `7` / `m7♭5`、rootPc・interval・qualityKey・コード名・CAGED・note spelling・保存schemaは変更していない。新規保存の`keyContext.degreeLabel`は新Romanになるが、本棚等の既存保存コード表示で参照されないためmigration不要。旧保存データは書き換えない。v0.21.7の確定commitは`372253482239de82f0325664156ac44864c3aa7b`。Phase 2の教会旋法追加とは独立したパッチです。
- **v0.21.9 Phase 2A確定**: `SCALES` / `DIATONIC` / `getDiatonicChords()`をMajor / Ionian、Dorian、Phrygian、Lydian、Mixolydian、Minor / Aeolian、Locrianの7scaleへ拡張した。追加5scaleのintervalはPitch Cruiseの参照値と一致し、3度堆積から既存7qualityだけで3和音・4和音を生成する。Romanの度数部分は全大文字、qualityはsuffixで示す。12 tonic × 7 scale × 2 chord size × 7 degree = 1176件を実装非依存の固定期待値で検証し、Major / Minorはv0.21.8のコード名・note spellingを含む336件の完全回帰を維持した。
- **v0.22.0 Phase 2B確定**: ExploreのMajor / Minor 2ボタンを、現在のscale名を示すselectorと7件のbottom sheetへ置換した。順序は`major, dorian, phrygian, lydian, mixolydian, minor, locrian`に固定し、表示ラベルは`SCALES`をsource of truthとする。`storage.normalizeSettings()`はこの7 ID以外（未設定・`null`・不正値を含む）を`major`へ正規化するが、schemaVersionとmigrationは変更していない。選択時は`saveSettings()`成功後だけ共有`state.settings.scaleType`とExplore表示を更新し、失敗時は旧状態を保ってエラートーストを出す。sheetは既存focus trapでTab循環、Escape／backdrop／閉じるボタン、openerへのfocus return、radio ARIAを提供する。新scaleで保存する`keyContext.mode`は既存文字列フィールドへそのまま保存される。実機確認・1176理論ケース・Major/Minor 336回帰を完了し、正式commitは`a562888a078494d6deeb9900d2b15260bc35128e`。
- **v0.22.1 scale-aware note spelling**: 現在正式対応している7scaleだけを対象に、トニックのletter、degreeごとのletter進行、pitch classから理論音名を導く純粋なspelling engineを追加した。`E♯` / `B♯` / `C♭` / `F♭`とdouble accidentalの`♯♯` / `♭♭`へ対応し、ダイアトニックのroot名・コード記号・構成音・Explore/CAGED・保存前編集・本棚・PNGのCDEラベルへ反映する。pitch class、scale/chord interval、quality、Roman、CAGED座標・運指・バレー・ミュートは変更しない。任意コードとkey contextなしの旧データは`noteName()` / `keyUsesFlats()`による従来表記を維持する。既存保存コードのタイトル文字列は書き換えず、key contextから再計算できるCDEマーカーだけを補正する。schemaVersionは1、migrationと`tonicName`保存追加はなし。Harmonic / Melodic Minor、新quality、新CAGEDは本番へ追加していない。84 scale-tonic固定fixture、588 root、1176 chord spelling、1176構造、Major/Minor 336構造回帰を自動検証し、375px／1280px、保存・再読込・本棚・PNG・consoleを含むユーザー実機確認も完了した。次工程は`aug / mM7 / M7♯5 / dim7`と対応CAGED。
- **v0.22.2 Phase A正式化**: core `QUALITIES`を11品質へ拡張した。新canonical IDは`aug`（`aug` / Roman `aug` / `1 3 ♯5`）、`mMaj7`（`mM7` / `mM7` / `1 ♭3 5 7`）、`maj7sharp5`（`M7♯5` / `M7♯5` / `1 3 ♯5 7`）、`dim7`（`dim7` / `°7` / `1 ♭3 ♭5 ♭♭7`）。既存7品質にも`symbolSuffix`・`romanSuffix`・品質固有`degreeLabels`を明示し、互換用の既存`suffix`は維持する。`degreeLabelsForQuality()`は`dim7`の9半音だけを`♭♭7`として返し、一般の`degreeLabels()`は従来どおり`6`を返す。schemaVersion 1、migration、7scale、scale UI、任意コードUI表示／`qualityKey`、保存title、CAGED 35型は変更しない。`augM7`はinternal IDとして未使用のためaliasは未導入。次工程Phase BでCAGED 20型と任意コード正式照合を追加する。
- **v0.22.2 Phase B → v0.22.3正式化**: `aug / mMaj7 / maj7sharp5 / dim7`のC/A/G/E/D固定20フォームを実装し、CAGEDは11品質・55フォームになった。aug／mMaj7／M7♯5／dim7の全20型をユーザー実ギター確認済みとし、最後にdim7 G型を`8x787x`・`親・×・人・薬・中・×`へ修正した。FORMは全slot保持、運指未確定slotだけ`finger:null + fingeringWarning:true`、muteはFORM削除に使用しない。CDE／ドレミ／度数では全FORM音を表示する。schemaVersion 1、migrationなし、Harmonic / Melodic Minor未追加。Phase Bの正式commit・通常pushを完了した。
- **aug source-backed FINGERING表**:

  | 型 | 採用source shape（6→1弦） | 採用finger | source omission → Chord Cruise |
  |---|---|---|---|
  | C | `x3211x`（開放`x32110`） | 5弦4・4弦3・3弦1・2弦2、1弦開放はfingerなし | movable 1弦を⚠、FORMの1弦3度は保持 |
  | A | `x3655x`（開放Aaug `x03221`） | 5弦1・4弦4・3弦2・2弦3、開放形1弦1 | Caug 1弦を⚠、FORMの1弦♯5は保持 |
  | G | `87655x`（開放Gaug `321003`） | 6弦4・5弦3・4弦2・3〜2弦1、開放形は6弦3・5弦2・4弦1・1弦4 | Caug 1弦を⚠、FORMの1弦rootは保持 |
  | E | `8-11-10-9-x-x`（開放Eaug `032110`） | 6弦1・5弦4・4弦3・3弦2、開放形は5弦4・4弦3・3弦1・2弦2 | Caug 2・1弦を⚠、FORMの♯5/rootは保持 |
  | D | `xx10-13-13-12`（開放Daug `xx0332`） | 4弦1・3弦3・2弦4・1弦2、開放形は3弦2・2弦3・1弦1 | なし |

- **aug運指の採用資料**: [EverythingMusic C Augmented](https://everythingmusic.com/learn/guitar/chords/c/augmented)はC/A/G/DのCAGED別diagramに指番号を明示、[EverythingMusic E Augmented](https://everythingmusic.com/learn/guitar/chords/e/augmented)は開放`032110`の指番号を明示、[FretJam Augmented Guitar Chords](https://www.fretjam.com/augmented-guitar-chords.html)はC/A/G/D等の開放diagramをfingering表示で明示、[Tabs4Acoustic Caug](https://www.tabs4acoustic.com/en/Caug-guitar-chord%2C918.html)は`8 11 10 9 x x`と`1 4 3 2`を本文で明示する。[Guitar Wiz Caug](https://guitarwiz.app/chords/c-augmented/)の`x32110`、[GtrLib Caug](https://gtrlib.com/chords/c-augmented)のsuggested-finger diagram、[JGuitar Caug](https://jguitar.com/chord?chord=Augmented&root=C)、[Gock Major Sharp Five](https://chords.gock.net/chords/major-sharp-five)はshape／音程の照合に使い、指番号を明示確認できないTABだけからfingerを補完していない。
- **mMaj7 source-backed FINGERING表**:

  | 型 | 理論FORM（CmM7、6→1弦） | 指番号入りsource shape | 採用finger | source非対応slot → Chord Cruise |
  |---|---|---|---|---|
  | C | `x15-13-12-12-11` | `x15-13-12-12-x` | 5弦4・4弦2・3〜2弦1 | 1弦♭3を⚠、FORMには保持 |
  | A | `x35443` | `x35443` | 5弦1・4弦4・3弦2・2弦3・1弦1 | なし |
  | G | `865547` | user-verified | 6弦4・5弦2・4弦1・1弦3 | 3〜2弦を⚠、FORMには保持 |
  | E | `8-10-9-8-8-8` | `8-10-9-8-8-8` | 6弦1・5弦3・4弦2・3〜1弦1 | なし |
  | D | `xx10-12-12-11` | `xx10-12-12-11` | 4弦1・3弦3・2弦4・1弦2 | なし |

- **mMaj7運指の採用資料**: [GuitarLessons365 Minor/Major Seventh Chords CAGED Sequence PDF](https://www.guitarlessons365.com/scores/guitarchordmasterypt1/minMaj7Aug7min7b5CAGED.pdf)はCm(maj7)のC/A/G/E/D全5型についてTABと指番号を同じ図で明示するため、FINGERINGの唯一の採用sourceとした。[Guitar-chord.org m(Maj7)](https://www.guitar-chord.org/m-maj7.html)は`1-♭3-5-7`、Cmの`C-E♭-G-B`、開放／ムーバブルshapeを照合し、[Gock mMaj7](https://chords.gock.net/chords/minor-major-seventh)は`8x5547`・`8x988x`等の実用voicingを照合、[JGuitar Cmmaj7](https://jguitar.com/chordsearch/Cmmaj7)は複数voicingの存在確認に使用した。指番号を明示しないsourceからfingerは補完していない。
- **M7♯5 user-verified FINGERING表**: 一般資料から補完した前案を実ギターで再確認し、ユーザーが成立すると確認した指だけを正式採用した。成立しなかった音はFORMから削除もmute化もせず、運指だけ⚠に戻した。

  | 型 | 理論FORM（CM7♯5、6→1弦） | 実機確認後の運指 | barre / T / warning |
  |---|---|---|---|
  | C | `x32100` | `×・薬・中・人・open・open` | 開放はbarreなし / Tなし / 0 |
  | A | `x36454` | `×・人・⚠・中・小・薬` | barreなし / Tなし / 4弦のみ⚠ |
  | G | `876557` | `親・中・人・⚠・⚠・薬` | barreなし / 6弦のみT / 3〜2弦⚠ |
  | E | `8-11-9-9-9-8` | `人・⚠・中・薬・小・人` | 8F人差し指barre / Tなし / 5弦のみ⚠ |
  | D | `xx10-13-12-12` | `×・×・人・小・中・薬` | barreなし / Tなし / 0 |

- **dim7 source-backed FINGERING表**: [All Guitar Chords Cdim7](https://www.all-guitar-chords.com/index.php/chords/index/c/dim7)の指番号付き`x3424x`・`8x787x`・`xx10-11-10-11`をA/G/D型に採用した。[Guitar-chord.org Cdim7](https://www.guitar-chord.org/cdim7.html)、[Gock Diminished Seventh](https://chords.gock.net/chords/diminished-seventh)、[Elgitar dim7](https://www.elgitar.com/dim7)で`1 ♭3 ♭5 ♭♭7`、対称性、`x3x242 / 8978xx`を相互照合した。5型は異なる弦セットの4音FORMとして保持し、対称性を理由に型名を重複排除しない。

  | 型 | FORM（Cdim7、6→1弦） | 採用finger | barre / T / warning |
  |---|---|---|---|
  | C | `x3x242` | `×・中・×・人・小・人` | 3〜1弦2F人差し指（2弦4Fを上書き）/ Tなし / 0 |
  | A | `x3424x` | `×・中・薬・人・小・×` | なし / Tなし / 0 |
  | G | `8x787x` | `親・×・人・薬・中・×` | barreなし / 6弦8FのみT / 0 |
  | E | `8978xx` | `中・小・人・薬・×・×` | なし / Tなし / 0 |
  | D | `xx10-11-10-11` | `×・×・人・薬・中・小` | なし / Tなし / 0 |

- **v0.22.4 Phase C正式化**: core `SCALES` / `DIATONIC`へHarmonic Minorと、下降時もNatural Minorへ切り替えない上行固定のMelodic Minorを追加した。各12 tonic、3和音・7th・Roman・11品質・scale-aware spellingを固定期待値で検証し、両scaleで既存55 CAGEDフォームをそのまま利用できることを確認した。Harmonic MinorのG♯は`G♯ A♯ B C♯ D♯ E F♯♯`、7thは`G♯mM7 / A♯m7♭5 / BM7♯5 / C♯m7 / D♯7 / EM7 / F♯♯dim7`となる。UI selector、`VALID_SCALE_TYPES`、保存schema/migration、CAGED定義は変更せず、画面・保存で選べる正式7scaleを維持する。Phase Bの正式commitは`6cc72512a35863b05d5137aeb57b91bfeb2c61e6`。次工程はPhase Dの9scale UI公開検討。
- **v0.22.5 Phase D正式化**: selectorと`VALID_SCALE_TYPES`を、`major / dorian / phrygian / lydian / mixolydian / minor / harmonic-minor / melodic-minor / locrian`の正式9scaleへ公開した。minor直後にHarmonic / Melodic Minorをまとめ、Locrianは最後に固定する。labelは`SCALES`から取得し、新2scaleは`tonicFamily: 'minor'`で既存minor系12 tonic表記を使用する。保存・reload、save失敗時のtransaction、schemaVersion 1、migrationなしを回帰確認した。
- **v0.22.5 m7♭5運指正式化**: ユーザー実機確認に基づき、C/A/G型・FORM・mute・openFingers・barre検出は維持し、E/D型のmovable fingeringだけを更新した。E型は6→1弦で`親・⚠️・中・薬・人・小`（5弦のみ`finger:null + fingeringWarning:true`）で、FORM音を削除・mute化しない。D型は`×・×・人・中・薬・小`でwarningなし。C/A/G型は変更していない。save/reload/library/PNGと全scale回帰を完了し、Phase Bの55フォーム、理論構造・spellingを維持した。正式commitは`b20816984dfbee9ce2f879ab9274b56c0ad6f40f`、通常push済み。
- **v0.22.6 保存ボタン復元正式化**: 原因はv0.21.6の詳細カード削除ではなく、指板カード内の保存行がCAGED未選択時にhiddenとなり導線を発見できなかったことだった。下部詳細カードは復活させず、指板直後に`保存する`ボタンを常時表示し、コード未選択・CAGED未選択・CAGED非対応時はnative disabled、CAGED選択時だけ有効化した。ダイアトニック、Harmonic Minor、任意コードCM7♯5を含む既存save-editor・saveChord・本棚transaction・rollback・reload経路を再利用し、schemaVersion 1・migrationなしを維持する。375px/1280px、通常/ハイフレット、横overflow、console warn/error 0を実機確認済み。versionは`0.22.6`、次はPhase E分数コード／slash・overlay検討。
- **Phase E1 分数コードbass overlay（未commit）**: 任意コードのupper chordへoptional `bassPc`を追加するが、`intervals`・`qualityKey`・`identifyQuality()`には混ぜない。UIは「ベース音」selectorで、upper chordの構成音（テンションを含む）からrootを除いた候補だけを公開し、構成変更で候補外になったbassは`null`へ戻す。symbolはupper symbolをsourceとして`C/E`、`Dm7/C`、`CM7♯5/G♯`のように表示する。既存CAGED FORM・finger・warning・barreは変更せず、bassPcありの場合だけ4〜6弦の全候補を`type: 'bass'` overlayとして金色二重枠で合成する。重複slotは既存markerへ金枠だけを付け、overlay-onlyはFORM音でなくfingerなし・warningなしとする。CDE／ドレミ／degree（upper root基準）は表示し、運指modeでは追加bassの文字を空欄にして案内を出す。全体指板とCAGED指板で同じgeneratorを使い、通常・ハイフレットrangeを再計算する。slash保存・本棚再構築・PNG・non-chord-tone bass・tension UIは未対応で、誤保存防止のためbassPcありの保存ボタンはdisabled。schemaVersion 1、migrationなし、APP_VERSION／`?v=`は`0.22.6`のまま。正式基準HEADは`d5b0a23c141667e9fc0d26be0911609673efa317`。次工程はPhase E2でslash保存／本棚／PNGを別監査し、その後E3以降で1〜2弦tension overlayを検討する。
- **Phase E1 bass ring視認性調整（未commit）**: ユーザー実機で黄色い3度marker上のgold outlineが見えづらく、初回の1px separatorでは境界が足りないと判明した。local HTTPのresponse・runtime CSS rule・computed styleを照合し、cache／Service Workerではなく、先頭の4px gold `box-shadow`が後ろのdark shadowを覆う描画順が原因と確定した。bass candidate専用classは`marker本体 → --cc-bgの2px dark separator → --cc-gold-brightの2px outer ring`へ強化し、dark shadowを先頭（前面）へ置いた。通常30px markerに対し外径は38px（+8px、前案から+2px）で、色だけでなく外形と二重ringでBassを判別できる。merged markerとoverlay-only marker、カラーとmonochromeの双方で同じvisual languageを使い、FORM・finger・warning・barre・bassPc・候補生成・文言・保存disabledは不変。375pxの通常／ハイフレットでC/Eの黄色いE上にdark gapとgold ringを確認し、横overflowなし、CDE／ドレミ／度数／運指、console warn/error 0を確認済み。視認性についてはこの描画順修正後にユーザー再確認待ち。
- **v0.22.7 Phase E1正式化**: `bassPc`、upper qualityとの分離、ベース音selector、root除外、4〜6弦candidate全表示、既存marker merge／overlay-only、CDE・ドレミ・degree対応、運指modeの追加bass空欄、slash保存disabledを正式化した。C/E、C/G、G/B、D/F♯、Am/C、Dm7/Cを確認し、CAGED FORM・運指・5型・全体指板generatorは不変。Bass visualは2px dark separator＋2px gold outer ring（外径38px）で、既存`--cc-bg`／`--cc-gold-bright`のみ使用。source／HTTP／runtime／computed一致を確認し、cache問題ではなく描画順が原因だった。ユーザー実機でC/Eの黄色い3度上の3層表示を確認済み。正式HEADはcommit後に追記する。次工程はPhase E2（slash保存・本棚・PNG）、将来E3以降で1〜2弦tension overlay。
- 通常版/PRO版の構造: PRO版は存在しないため、`apps/chord-cruise/` 直下の `index.html` のみが唯一のエントリーポイント。他アプリのような `standard/` サブディレクトリも無い。
- JS/CSSの共有関係:
  - `theme.css` はコードクルーズ専用の1ファイル（`apps/shared/` には依存していない）。
  - JSは1本の `script.js` ではなく、`js/core/*.js`（データ・ロジック層）と `js/ui/*.js`（画面描画層）に分割されたモジュール構成。`index.html` から15本のscriptタグで個別に読み込む（`window.ChordCruise` というグローバルオブジェクトに各モジュールが機能を生やす形）。
- service workerの扱い: **存在しない。** `apps/chord-cruise/` 配下に `service-worker.js` は無く、`index.html` にも `navigator.serviceWorker.register` の記述は無い。PWA化はされていない。
- manifestの扱い: **存在しない。** `manifest.json` は無い。アイコンファイルも見当たらない。

---

## 2. 絶対に守るルール

- 作業対象ディレクトリ: `apps/chord-cruise/` のみ。
- 触ってよいファイル: `apps/chord-cruise/` 配下の `index.html`・`theme.css`・`js/core/*.js`・`js/ui/*.js`。
- 触ってはいけないファイル: `apps/shared/`（このアプリは現状 `shared/` に依存していないため、通常は触る理由自体が発生しないはず）、他アプリ全般、`apps/cruise-studio/`。
- `shared/` を触る場合の注意: 現状このアプリは `shared/` を一切読み込んでいない。もし将来 `shared/` 依存を追加する提案をする場合は、他アプリへの影響を必ず説明し、ユーザーに確認を取ってから進めること。
- 他アプリを誤ってstageしないこと。`git add` は変更したファイルを明示的に列挙し、`git add -A` は使わない。
- 未追跡ファイルを勝手にstageしないこと。
- ユーザーが確認・依頼していない仕様変更（UIの独自解釈での変更、コード理論データの独自修正など）はしないこと。
- 大きな構造変更（画面追加、データスキーマ変更、PWA化など）の前には、必ず既存コードを読んで調査すること。特に `js/core/storage.js` の `localStorage` スキーマ（`chordCruise.schemaVersion` 等）はバージョン非互換な変更をすると既存ユーザーの保存データが壊れる可能性があるため、変更前に必ず調査・確認すること。

---

## 3. 主要ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | 唯一のHTMLエントリーポイント。ホーム/コードを調べる/コード本棚の3画面（`<section>`）をJSで切り替えるSPA構造。 |
| `theme.css` | 見た目全体（`cc-` プレフィックスのクラス群）。他アプリの`theme.css`とは独立しており、`shared/`にも依存しない。 |
| `js/core/storage.js` | `localStorage`永続化層。プレフィックス `chordCruise.`。設定・フォルダ一覧・コードインデックス・個別コードデータに加え、`chordCruise.libraryOrder`で本棚の順序IDを分離管理する。コード保存・削除は関連キーを事前スナップショットし、途中失敗時に可能な限り全キーを復元して成功扱いにしない。`scaleType`は正式9 IDを受け入れ、不正値は通常正規化で`major`へ戻す。schemaVersionは維持する。 |
| `js/core/music-theory.js` | 音楽理論の基礎データ。coreではMajor / IonianからLocrian、Harmonic Minor、Melodic Minorの`SCALES` 9種と、7音scaleの3度堆積・quality同定から`DIATONIC`を生成する。Explore UIの9件表示順は別の明示リストで管理する。 |
| `js/core/caged-forms.js` | CAGEDフォーム（移動可能フォーム）の辞書データ。弦番号・オフセット・度数で構成音位置を定義。 |
| `js/core/chord-model.js` | 「任意コード作成」用のコードモデル（3度/5度/7度/テンション等の値体系）。 |
| `js/core/chord-info.js` | コードの説明文辞書（ダイアトニック度数ごとの機能解説）。 |
| `js/ui/fretboard.js` | コードクルーズ専用の指板描画。表示列・マーカー・バレーの共通座標モデルを作り、編集用DOM指板、軽量SVG、PNG元SVGへ展開する。 |
| `js/ui/focus-trap.js` | dialog / bottom sheet専用の最小共通helper。hidden・disabled・`tabindex=-1`を除外し、Tab/Shift+Tab循環、focusable要素なし時のcontainer focus、validなopenerへのfocus returnを提供する。 |
| `js/ui/explore.js` | 「コードを調べる」画面のロジック本体。キー/7scale selector、3和音/4和音、CAGED、指板表示モード、ハイフレット切替、コード詳細を担当。scale変更は保存成功後に反映する。 |
| `js/ui/chord-builder.js` | 「任意コードを作る」モーダル。共通focus trapとopener focus returnを適用する。コード内コメントに「UI構成・操作感は音感クルーズPROの『コードを作る』と統一」と明記あり（＝他アプリとのUI設計の一貫性を意図した実装）。 |
| `js/ui/save-editor.js` | フォームの保存前編集と保存コード編集の共通モーダル。Tab循環とopener focus returnを適用する。編集可能な運指マーカーはTabで到達でき、Enter / Spaceでクリックと同じ循環編集を行う。保存範囲・表示モード・運指・警告・音の消去・名前・メモ・フォルダを編集し、保存コードは同一IDでの上書き／新規IDでの別名保存を選べる。保存コード編集の初回だけ押弦範囲を中央寄せする。 |
| `js/ui/chord-export.js` | 保存コード指板のPNG書き出し。自己完結SVGを2倍Canvasへ描画し、download属性非対応時は新規タブ表示へフォールバックする。 |
| `js/ui/library.js` | 「コード本棚」の3階層。フォルダ管理・一覧表示設定bottom sheet・危険操作確認へ共通focus trapを適用する。フォルダと保存コードの上下ボタン式並び替え、1〜4列の指板カード、一覧専用の表示設定（CDE／ドレミ／度数／運指・カラー／白黒）、詳細の白黒切替・PNG書き出し・編集を管理する。本棚詳細の編集可能な運指マーカーはキーボードでも操作できる。 |
| `js/ui/settings.js` | 右上の共通設定ボタンと設定オーバーレイ。設定本体とデフォルト確認のTab循環を適用する。右上表示設定は保存成功後だけ共有状態・UI・再描画へ反映し、失敗時は旧表示を維持する。全主要画面と設定画面にあるVer表示／`_r=<timestamp>`付きページ更新も管理する。 |
| `js/app.js` | エントリースクリプト。バージョン定数の保持、画面切り替え（`showScreen`）、共通ナビ（戻る/TOP）のイベント登録、初期化処理。 |

**現時点で存在しないファイル**: PRO版HTML、`manifest.json`、`service-worker.js`、`info.html`、`terms.html`、`privacy.html`、単発ヘルプページ。

---

## 4. 画面構成

`js/app.js` の `SCREENS = ['home', 'explore', 'library']` で管理される3画面のSPA。

- **ホーム画面**（`cc-screen-home`）: タイトル・タグライン＋2つのアクションカード「🔍 コードを調べる」「📚 コード本棚」。この画面のときだけ共通ナビ（`cc-nav`）が隠れる。
- **コードを調べる画面**（`cc-screen-explore`）: `index.html` 上は「この画面は次のSTEPで実装します」というプレースホルダー文言が残っているが、**これは古いコメントで実際には`js/ui/explore.js`の`render()`がこのセクションのDOMを完全に上書きして動的に構築するため、実際には十分に実装済み**。中身は以下の通り:
  - キー選択（セレクトボックス）、現在のscale名selectorから開く7scale bottom sheet、3和音/4和音（トライアド/セブンス）切替
  - ダイアトニックコードのグリッド表示＋「＋ 任意コードを作る」ボタン
  - 指板表示（CDE/ドレミ/度数/運指の4モード。運指はCAGEDフォーム選択中のみ有効）
  - CAGEDフォーム切替（全体/C型/A型/G型/E型/D型）
  - 「このフォームを保存」ボタン、コード詳細情報表示
- **コード本棚画面**（`cc-screen-library`）: `js/ui/library.js`が「フォルダ一覧 → 指板サムネイル一覧 → 保存コード詳細」の3階層を動的に描画する。フォルダ一覧はヴィンテージ楽譜集風の縦書き背表紙を2〜6列で表示し、`folderShelfColumns`へ独立して保存する。英数字は一文字ずつ正立させ、長音記号「ー」だけは縦棒として描画する。各行の直下には個別の棚板を置く。各背表紙下部の「…」から名前変更・複製・色変更・完全削除を操作できる。コード一覧はコード名と保存範囲だけの指板を1〜4列で表示し、`libraryColumns`へ保存する。詳細は指板直上へコード名だけを表示し、一時的な白黒表示、PNG書き出し、保存コード編集に対応する。
- **設定画面**: 全画面共通の右上設定ボタンからオーバーレイで開く。「指板の表示」カードでフレット番号サイズと、すべて/ポジションマーク/カスタムの番号強調を選択できる。
- **PRO導線**: 現時点で存在しない。

---

## 5. 通常版 / PRO版の違い

**PRO版は現時点で存在しない。** 調査の結果、以下を確認済み:
- `isProEdition`・`data-app-edition`・`PRO版`といった文字列は `apps/chord-cruise/` 配下のどこにも見つからなかった。
- ディレクトリ構成にも `standard/` `pro_xxxxx/` のような分割は無い。
- 認証・パスワードゲート関連のコードも見当たらない。

このため、本章の他項目（PROロック対象・PRO認証の扱い等）は**該当なし**。将来PRO版を追加する場合は、他アプリ（指板クルーズ・音感クルーズ・リズムクルーズ）の実装パターン（`data-app-edition="Pro"` 属性＋`isProEdition()`関数、または`shared/pro-gate.js`によるパスワードゲート）を参考にできるが、その際は必ずユーザーに設計方針を確認してから進めること。

---

## 6. アプリ固有の主要機能

- **コードを調べる**:
  - キーとスケール（メジャー / ドリアン / フリジアン / リディアン / ミクソリディアン / マイナー / ロクリアン）を選ぶと、そのキーのダイアトニックコード（3和音/4和音切替可）がグリッド表示される。selectorは現在値を常時表示し、bottom sheetのradio選択・focus trap・Escape／backdrop／閉じるボタンへ対応する。
  - グリッドのコードをタップすると、指板上にCAGEDフォームベースで構成音が表示される。CAGED（C/A/G/E/D）の5フォーム＋「全体」表示を切替可能。
  - 指板の表示モードはCDE（音名）/ドレミ（ソルフェージュ）/度数/運指。運指はCAGEDフォーム選択時のみ有効。
  - ハイフレットOFFは0〜13F、ONは12〜25Fを同じ14列で表示する。音名・フォーム・保存データは列番号ではなく実フレット番号を使う。
  - 「＋ 任意コードを作る」から、ダイアトニックにない任意のコード（テンション等含む）を組み立てられる（`chord-builder.js`）。
  - 表示中のフォームは「このフォームを保存」からコード本棚へ保存できる（`save-editor.js` の保存前編集モーダルを経由）。
  - メジャーセブンスのユーザー表示は `M7` に統一。内部品質キーは `maj7` のまま維持する。旧保存名の `maj7` は表示時だけ `M7` に正規化し、自動一括更新しない。
- **CAGEDフォーム表示**: `js/core/caged-forms.js` の辞書データに基づき、指定された実フレット範囲内でフォームを探索する。全音が収まる配置を優先し、完全形が無い場合も表示可能な音が1つ以上あれば範囲外音だけを省略して同じ型のまま表示する。12〜25Fでは通常フォームを+12Fへ移し、`openFingers` ではなくムーバブル運指を使う。既存7品質35フォームにPhase Bの`aug / mMaj7 / maj7sharp5 / dim7`固定20フォームを加え、11品質55フォームを扱う。新4品質20型はFORMの理論slotを運指都合で削除しない。M7♯5は26slot中、実機で推奨指を確定できなかった4slotだけwarning。dim7は各型4slot・全構成音・warning 0。既存`m / dim / m7 / m7♭5`の共通変換は不変。`detectBarres()`は連続弦に加え、間の弦を別指でより高いフレットに押さえる物理的な上書きバレーも検出する。推奨運指を割り当てられないslotだけはFORMに残したまま`fingeringWarning`で区別し、CDE／ドレミ／度数では通常表示、運指でのみ⚠表示とする。「⚠️ 運指」と範囲外音を知らせる「△ フォーム」は独立した折りたたみで表示する。
- **押さえ方・運指・バレーコード表示の注意点**: 運指はCAGEDフォーム選択中のみ有効。警告音は運指モードだけ`⚠️`となり、他モードでは通常の音名・階名・度数を表示する。同じ指・同じ実フレットのノートからバレーを導出し、警告音と消去予定音は対象外。保存編集では`finger`、`fingeringWarning`、draft専用`pendingDelete`を分離し、確定時に消去予定音だけを除外する。
- **コード本棚**: 保存したコードフォームをフォルダ単位で整理する。フォルダはヴィンテージ楽譜集の背表紙として2〜6列で並び、各行の直下に棚板を描く。列数はコードカードの1〜4列設定とは別に`folderShelfColumns`で保持する。表示名は一文字ずつの装飾用spanで縦組みにし、半角英数字は正立、長音記号「ー」は空の専用spanの擬似要素でCSS製の縦線として描く。文字グリフの回転には依存しない。ボタン本体の`aria-label`と`title`は元の横書き名を保つ。各フォルダ下部の「…」は管理専用で、名前変更・フォルダと全コードの深い複製・12色からの色選択・完全削除をbottom sheetで提供する。未分類は先頭固定で色変更のみできる。フォルダのコピーは新規IDと新規コードIDを採番し、元の直後・元のコード順で追加する。色はフォルダの任意`colorKey`だけに保存し、既定は`black-leather`。colorKeyなしの旧フォルダも黒革として表示し、読むだけでは保存データを書き換えない。フォルダ削除は所属コードの個別レコード、index、`libraryOrder`をまとめて完全削除し、書き込み失敗時はスナップショットを復元する。コード一覧ではコード名＋軽量SVG指板を1〜4列で表示する。詳細・一覧・書き出しは同じ保存範囲描画モデルを使う。
- **保存データの整合性**: 保存コードの新規保存・上書き・フォルダ移動・削除では、個別コード、`chordCruise.chords.index`、`chordCruise.libraryOrder`、必要時のフォルダ初期化状態を同一トランザクション相当として扱う。各書き込み前の生値を保存し、途中失敗時は全キーの復元を個別に試み、復元の一部に失敗しても残りを継続する。APIは保存失敗時`null`、削除失敗時`false`を返し、詳細画面は入力・表示・現在位置を成功前に確定せずエラートーストを出す。
- **表示設定**: `chordCruise.settings` に `fretNumberSize`、`fretNumberHighlightMode`、`highlightedFrets`、`highFretMode`、`fretboardMarkerLabelSize`（`small`／`medium`／`large`／`xlarge`、既定`medium`）を保存する。右上の各変更は候補オブジェクトを保存してから、成功時だけ同じ共有`state.settings`オブジェクトへコピーし、DOM適用・操作部同期・`chordcruise:fretboard-settings-change`を行う。保存失敗時は共有状態・UI・プレビューを旧値のままにし、エラートーストのみ表示する。右上の「丸内文字の大きさ」はCDE／ドレミ／度数／運指／⚠へ共通適用し、Explore・本棚詳細・設定プレビュー・PNGだけに明示的に渡す。詳細では保存済み指板のオプション生成時にこの値を落とさず、指板hostへ渡す。保存前編集には渡さない。本棚一覧専用には`libraryCardDisplayMode`（既定`finger`）、`libraryCardMonochrome`（既定`false`）、`libraryCardChordNameSize`／`libraryCardFretNumberSize`／`libraryCardMarkerLabelSize`（各`small`／`medium`／`large`／`xlarge`、既定`medium`）を保存する。両系統は完全分離する。右上設定末尾の「すべてデフォルトに戻す」は確認後、`chordNameSize`、`fretNumberSize`、`fretboardMarkerLabelSize`、`fretNumberHighlightMode`、`highlightedFrets`、`fretboardDisplayMode`だけを`storage.getSettingsDefaults()`由来の既定値へ1回の部分保存で戻す。保存コード・フォルダ・一覧設定・順序・未知のsettings keyは保持し、全データ初期化や`localStorage.clear()`は使わない。表示設定bottom sheetは「表示」と「文字サイズ」のアクセシブルな2タブで、選択タブは金色下線、非選択はグレー文字として設定値ボタンと区別し、開くたびに表示タブから開始する。保存済みの弦・フレット・interval・fingerから軽量SVGだけを再描画し、特大は列数ごとに安全な倍率へクランプする。白黒一覧だけは固定高カードで上下の丸・フレット番号を切らないよう、SVGのviewBoxへ専用安全余白と白いパネル背景を渡す。既存settingsへ既定値をマージし、schemaVersionは変更しない。
- **通常版/PRO版で差がある機能**: 無し（PRO版自体が存在しないため）。
- **触る時に注意すべきロジック**:
  - `js/core/storage.js` の `localStorage` キー体系（`chordCruise.schemaVersion` 等）とスキーマバージョン管理。データ移行を伴う変更は要注意。
  - `js/ui/explore.js` の `renderFretboard()` / `computeFormMarkers()` は、選択中のコード・CAGEDフォーム・表示モードの組み合わせで表示内容が変わる複雑なロジックのため、変更前に一連の関数呼び出し順序を確認すること。

---

## 7. インフォメーション / 利用規約 / プライバシー

調査の結果、以下はすべて**現時点では未実装**。
- インフォメーションページ: 未実装
- 使い方ページ: 未実装
- 説明動画リンク: 未実装
- YouTube確認カード: 未実装
- 利用規約: 未実装
- プライバシーポリシー: 未実装
- お問い合わせ導線: 未実装

コード本文中にもこれらに関連する実装・準備コメントは見当たらなかった。今後追加する場合は、リズムクルーズの実装（`apps/rhythm-cruise/info.html` 等）を参考にできるが、着手前に方針をユーザーに確認すること。

---

## 8. バージョン更新ルール

- バージョン定数: `js/app.js` 内 `CHORD_CRUISE_APP_VERSION`（現在 `0.22.7`）。
- `?v=` によるキャッシュ管理: `index.html` 内の全15本のscriptタグとstylesheet link（計16参照）が同じ `0.22.7` を共有している。
- 通常版/PRO版で更新箇所が分かれているか: PRO版が存在しないため該当なし。
- service workerの更新: service worker自体が存在しないため不要。
- **バージョン更新漏れしやすい箇所**: `index.html`内の15本のscriptタグすべてに同一の`?v=`が付いているため、1本でも更新し忘れるとキャッシュ不整合が起きる可能性がある。バージョンを上げる際は、`grep -n "?v=" index.html` で全箇所を確認してから一括更新すること。

全CAGED型の`m / m7 / m7♭5 / dim`は、`maj / 7`テンプレートから共通生成する。三和音系は`3→♭3`、dimではさらに`5→♭5`、7th系はdominant 7を基準に`3→♭3`、m7♭5ではさらに`5→♭5`とし、ルートと♭7は維持する。C型mの5弦ルートは小指（finger 4）。G型dimは低音側を6弦=小、5弦=中、4弦=人とし、高音側3弦を`fingeringWarning`にする。推奨運指が成立しない音は運指モードだけ`⚠️`となり、保存編集では指指定・警告・消去を循環できる。フォーム警告は初期状態で閉じた「⚠️ 運指」ボタンへまとめ、範囲外音を省略した場合は別の「△ フォーム」ボタンで知らせる。`0.19.0`では一時比較UIを撤去し、A3のヴィンテージ楽譜集デザインを正式採用した。フォルダ列数は`folderShelfColumns`（2〜6、不正値は4）へ保存し、コードカードの`libraryColumns`とは独立する。`0.21.0`ではフォルダ内のコード一覧へ「表示設定」bottom sheetを追加し、「表示」と「文字サイズ」のアクセシブルな2タブから、CDE／ドレミ／度数／運指、カラー／白黒、コード名／フレット番号／音名の小・中・大・特大を本棚全体の共通設定として即時適用する。選択タブは金色下線で設定値ボタンと区別する。右上設定の`fretboardMarkerLabelSize`は小／中／大／特大を、Explore・本棚詳細・設定プレビュー・PNGの丸内文字へ明示的に適用する。一覧と保存前編集には渡さず、一覧用の`libraryCardMarkerLabelSize`とも分離する。フレット番号・音名は静的SVGの既存文字数別縮小へ倍率を掛け、特大も1〜4列で安全にクランプする。白黒一覧だけは固定高カードでも上下の丸・フレット番号を切らない専用viewBox安全余白を渡す。並び替え中は設定操作を無効化する。背表紙の英数字は正立し、長音記号は空の専用spanの`::before`が描く縦線で、文字グリフや`rotate()`には依存しない。JSで行ラッパーと棚板を生成する。背表紙下部の「…」は管理専用で、名前変更・元の直後へ追加する深いコピー・12色の`colorKey`選択・コード件数を明示した完全削除確認をbottom sheetで提供する。既定色は`black-leather`で、既存の色未設定フォルダも黒革として表示する。削除はフォルダ、所属コードの個別レコード、index、`libraryOrder`を原子的に削除し、未分類へ移動しない。既存保存コードのschemaVersionは1のまま維持する。

---

## 9. GitHub Pages反映トラブル運用

- push後、GitHub Pagesの本番が古いままになることがある（他アプリでも実績あり）。
- 原因は主に、GitHub Pagesの `pages build and deployment` ワークフローの `deploy` jobが失敗する、または `queued` のまま詰まるケース。GitHub Actions画面でrerunしても`Queued`のまま詰まることがある。
- **コードやpush自体には問題がないことがほとんど。空commitや再実装で直そうとしないこと。**
- 過去に、`gh` CLIで以下のPages build APIを1回実行し、復旧した実績がある（他アプリでの実績）。
  ```bash
  OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
  gh api -X POST "repos/$OWNER_REPO/pages/builds"
  ```
- 本番確認コマンド例（コードクルーズ用に応用。実際の公開URLは要確認）:
  ```bash
  curl -s "https://soundcruise.jp/apps/chord-cruise/index.html" | grep "chord-cruise/js/app.js?v="
  curl -s "https://soundcruise.jp/apps/chord-cruise/js/app.js?v=VERSION" | grep "CHORD_CRUISE_APP_VERSION"
  ```
- デプロイ直後（数分以内）はCDN側のキャッシュ伝播タイミングのズレで一時的に古い表示になることがある。deploy自体が成功しているなら、コードの問題と誤認しないこと。

---

## 10. 最近の主要commit履歴（chord-cruise関連）

`git log --oneline -- apps/chord-cruise/` で確認した実際の履歴（新しい順、主要分）。

- `0.22.1` 現行7scaleのscale-aware note spellingを正式反映（84/84理論綴り、28組修正、音楽構造・保存schema・任意コードは不変、実機確認済み）。
- `a562888` 7種類のスケール選択UIと設定正規化を正式反映（v0.22.0 Phase 2B、固定期待値1176ケース・Major/Minor 336ケース回帰、実機確認済み）。
- `0.21.8` Roman度数部分を全大文字化（quality suffix・Roman以外の理論値不変、実機確認済み）
- `0.21.7` Major / MinorのダイアトニックをSCALESと3度堆積から自動生成（v0.21.6固定336ケース一致、実機確認済み）
- `0.21.6` Explore下部詳細カードを非表示化（構成音・度数・役割・雰囲気・よく行くコード、実機確認済み）
- `ec60235` 運指編集マーカーのキーボード操作に対応（v0.21.5、実機確認済み）
- `f58af12` 危険操作確認のARIA関連付けを改善（v0.21.4、実機確認済み）
- `23fd5fe` modal / bottom sheetのfocus trapを追加（v0.21.3、実機確認済み）
- `3bc4ded` 設定保存失敗時の表示不整合を修正（v0.21.2）
- `a7ad0e8` コード保存と削除の安全性を改善（v0.21.1）
- `ced7a1c` コードクルーズの本棚表示設定を拡張（v0.21.0）
- `2e27acc` コードクルーズの本棚デザインとフォルダ管理を刷新（v0.19.0）
- `109fcaf` コードクルーズに本棚の並び替えと更新UIを追加（v0.18.0）
- `49a9d70` コードクルーズの設定・保存体験とフォーム表示を改善
- `02ebcb9` コードクルーズのCAGED表示と保存編集を拡張
- `096f077` コードクルーズにC型・G型のマイナー系フォームを追加
- `6c5b7a5` コード図のミュート記号サイズを調整
- `45c8494` コード本棚のコード図表示を調整
- `c42189b` コード本棚の表示設定と指板図を改善
- `0eb362d` コード本棚の一覧表示と編集・書き出しを改善
- `8359157` コードクルーズの設定とハイフレット表示を拡張
- `6b32c65e` コードクルーズの減三和音表記を変更
- `1454d34f` コードクルーズの運指とバレー表示を改善
- `b3d00e22` コードクルーズの説明表示と導線を整備
- `6dfdb748` コードクルーズに任意コード作成を追加
- `620c7eca` コードクルーズにコード本棚を追加
- `beed19ea` コードクルーズにコードフォーム保存を追加
- `dd0fb3de` コードクルーズにCAGEDフォーム表示を追加
- `0ce19aef` コードクルーズに指板表示を追加
- `c0000a1b` コードクルーズにダイアトニックコード表示を追加
- `c1f019a0` コードクルーズの初期画面を追加

（v0.21.0は`ced7a1c`まで、v0.21.1の保存データ安全性修正は`a7ad0e8`まで正式反映済み。v0.21.2は右上表示設定の保存失敗時安全化、v0.21.3はmodal / bottom sheetのキーボード操作改善、v0.21.4は危険操作確認のARIA改善、v0.21.5は運指編集マーカーのキーボード操作、v0.21.6はExplore下部詳細カード非表示化、v0.21.7はダイアトニックスケール生成基盤、v0.21.8はRoman表記全大文字化、v0.21.9 Phase 2Aは教会旋法内部対応、v0.22.0 Phase 2Bは7scale selector UI・設定正規化、v0.22.1はscale-aware note spellingを正式反映済み。）

---

## 11. 今後の運用ルール

- コードクルーズを修正したら、`apps/chord-cruise/ai-handoff/CHORD_CRUISE_OVERVIEW.md` も必要に応じて更新する。
- ユーザー向けに分かる変更（見た目・機能・文言）を行った場合は、`apps/chord-cruise/ai-handoff/chord-cruise-overview.html` も必要に応じて更新する。
- 更新不要と判断した場合は、完了報告にその理由を書く。
- AIエディタへの依頼プロンプトには、このファイルの存在と「触ってよい/悪い」ルールを毎回含めることが望ましい。
- 「調査のみ」と「実装」の依頼ははっきり分けて扱う。調査のみと言われた場合はファイルを一切変更しない。
- 不明点・曖昧な指示は、実装前に必ず質問する。推測で仕様を決めない。

---

## 12. よくある事故と回避策

| 事故 | 回避策 |
|---|---|
| 他アプリを誤ってstageしてしまう | `git add` は変更したファイルを明示的に列挙する。`git add -A` は使わない。 |
| `apps/cruise-studio/` の変更を巻き込む | コミット前に必ず `git status -sb` で対象外ファイルが混ざっていないか確認する。 |
| 未追跡ファイルをstageしてしまう | 同上。 |
| `index.html`内14本のscriptタグの`?v=`更新漏れ | バージョンを上げる際は`grep -n "?v=" index.html`で全箇所を確認する。 |
| `index.html`内の「次のSTEPで実装します」という古いプレースホルダー文言を鵜呑みにして「未実装」と誤認する | 実際は `js/ui/explore.js` / `js/ui/library.js` の `render()` が画面を動的に上書きするため、まずJS側の実装状況を確認してから判断する。 |
| `js/core/storage.js`のスキーマを不用意に変更し、既存ユーザーの保存データ（フォルダ・保存コード）を壊す | スキーマバージョン管理の仕組みを理解してから変更する。互換性のない変更は移行処理を検討する。 |
| PRO版が存在しないのに、他アプリのPRO実装を前提にコードを書いてしまう | 本ドキュメント5章の通り、PRO版は現状無い。追加提案の前にユーザーに確認する。 |

---

## 13. 次回作業開始時チェックリスト

1. `git status -sb` で現在の変更状態を確認（他アプリの変更が混ざっていないか）
2. `git log -5 --oneline` および `git log --oneline -- apps/chord-cruise/` で直近の履歴を確認
3. `git rev-parse HEAD` と `git rev-parse origin/main` を比較
4. 今回の作業対象ファイルを明確にする（本ファイルの「主要ファイル構成」を参照）
5. 未追跡ファイルが対象外であることを再確認
6. 本番バージョンを確認（公開URLが確定していれば `curl` で `?v=` の値を確認）
7. PRO版は存在しないため、相対パス分岐の考慮は不要（将来PRO版が追加された場合はこの前提を見直す）
8. 変更後は、ホーム/コードを調べる/コード本棚の3画面でクリック確認・コンソールエラー確認を行う
9. 変更内容に応じて、`apps/chord-cruise/ai-handoff/` 配下の本ファイルと `chord-cruise-overview.html` の更新要否を判断する
