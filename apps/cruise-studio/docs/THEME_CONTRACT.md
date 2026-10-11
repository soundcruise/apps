# Cruise Studio Theme Contract v1

2026-10-11。Portを正本とする検証付きStudio projection（方式E）。Shell本体・theme選択UIは未実装。
APP_VERSION 0.22.4、project schemaVersion 1を維持する。

## 1. 正本と責務

| 責務 | 正本 / consumer |
|---|---|
| Portの色とcomponent例外 | `apps/cruise-port/style.css`（読み取りのみ） |
| ID / default / browser chrome色 | Port `settings-store.js`。Standard / Pro HTMLの同期bootstrapとruntime applyを照合 |
| Studioの値・出典対応 | `js/core/theme-projection.json` |
| Studioのsemantic CSS | `theme-projection.css`（JSONからのprojectionを一致test） |
| Studio resolver / state / storage / apply | `js/core/color-theme.js` |
| Structure紙面 / Loupe | 既存`theme.css`のpaper / slot domain |
| A4印刷 | 既存`print.css` |

Port CSS / runtimeをStudioで実行・importしない。Port / 他apps / shared / Workerは変更しない。
Projectionの生成・検証時だけPort sourceをテキストとして読む。出力CSSはStudio内に同梱できる。
Metadata v1のPort ESM importにある隣接`/apps/`配信条件とは独立した契約である。

## 2. ID / root / default

| id | displayName | colorScheme | themeColor |
|---|---|---|---|
| dark | ダーク | dark | #090806 |
| charcoal | チャコール | dark | #424346 |
| gray | グレー | light | #c8cbd0 |
| light | ライト | light | #f7f6f2 |

Rootは`html[data-theme="<id>"]`。不正ID、未保存、不正JSON、record以外、storage failureはdark。
`system`やOS `prefers-color-scheme`追従は導入しない。CSSの属性なしrootもDark値を持つ。
解決規則は一つの`resolveColorTheme`と`getColorTheme`で所有し、inline側にID判定を複製しない。

`colorScheme`はPortの現行値と一致する。現段階では`--studio-color-scheme`と静的metadataに保持し、
既存画面のnative controlを変えないためhtml / bodyへ`color-scheme`を適用しない。
Shell実装時はShell host側でこのsemantic値を使用する。

## 3. Storage / runtime state

既存`cruiseStudio.appSettings`の任意field `colorTheme`へ保存する。新しいstorage keyは作らない。
`barLoupe`、`preDtmSettings`、未知のfieldを保持し、明示save時に最新objectを読み直してfieldだけ更新する。
Portの`cruisePort.settings`を読まない・書かない。曲JSONにもthemeを追加しない。

ロード / bootstrap / applyでは保存しない。themeがない場合もDarkを書き戻さない。
破損JSON・配列・null等は読取時Darkへfallbackし、save時は失敗として既存rawを保護する。
保存失敗時は`{ok:false, theme, error}`を返し、このruntimeだけに選択を適用する。将来UIは失敗を表示する。

初回getで保存値を読み、その後のgetは現在のruntime選択を返す。明示applyは非永続、setは永続保存を試みる。
別tabのstorage event・Account / Sync適用による自動theme切替は未導入。reload時のbootstrapで再読込する。
同期localStorage field更新を越えるwriter協調 / Sync / migrationは別工程。

## 4. Bootstrap / FOUC / cache

`index.html`は次の順で読み込む。

1. Darkの`theme-color` meta。
2. 同期classic script `color-theme.js?v=1`（API登録のみ）。
3. `colorTheme.applyColorTheme(colorTheme.getColorTheme())`。
4. `theme-projection.css?v=1`、既存`theme.css`、印刷CSS。

bootstrapと後のruntime APIは同じインスタンス・同じresolverを使う。別のinline判定式は持たない。
applyはroot属性と既存metaだけを更新する。listener通知以外のservice起動・network・timerはない。
script登録だけではstorage / DOM更新を行わない。Node requireはpureなfactory / resolverを返す。

旧meta `#120f0c`はPort契約のDark `#090806`へ揃えた。ブラウザーchromeのmeta値は変わるが、
現行TOP / Structure / Pre-DTMのdocument配色は変えない。
紙面alias化を含む既存CSSだけはcache keyを`0.22.4-theme-v1`へ更新。APP_VERSION bumpではない。

## 5. 最小API

Browser: `CruiseStudio.colorTheme`。

| API | 契約 |
|---|---|
| `listColorThemes()` | frozenの4件metadata |
| `resolveColorTheme(value)` | supported IDだけ許可。不正はdark |
| `getColorTheme()` | 初回load、その後は現在の選択 |
| `applyColorTheme(value)` | 正規化してroot / meta更新。保存しない。IDを返す |
| `setColorTheme(value)` | settings field保存を試行しapply。結果objectを返す |
| `subscribeColorTheme(listener)` | 選択変更のみ通知。unsubscribeを返す。初期通知なし |

同じIDの再適用は通知しない。subscriberの例外は他subscriberとapplyを止めない。
まだShell rendererへ接続しない。theme選択UIは次工程のhost / settings設計で追加する。

## 6. Semantic tokens（39種）

以下の接頭辞はすべて`--studio-`。Portの正式token名は変更しない。

| 分類 | 名前 |
|---|---|
| Foundation | app-bg, surface, surface-deep, panel, panel-alt, panel-deep, elevated |
| Text | text-primary, text-muted, text-secondary |
| Border | border-default, border-subtle, border-strong |
| Accent | accent, accent-bright, accent-text |
| Controls | control, control-hover, control-active, field, field-border |
| Primary action | primary-action-background, primary-action-top, primary-action-bottom, primary-action-text |
| Selection | selected-bg, selected-border, selected-text |
| Focus | focus, focus-primary, focus-danger |
| State | success, warning, danger |
| Modal / depth | overlay, shadow-low, shadow-medium, shadow-high |
| Native scheme | color-scheme |

surface / panel / elevated(menu) / fieldは用途を保持し、明度順へ並べ替えない。
`border-subtle`はpractice form separator、strongはpractice set dialog borderを正本とする。
primaryは`.primary-action`のgold gradient。別系統`.btn-primary`のgradientを混ぜない。
selectedは`.settings-choice.is-selected`。text-secondaryは`--port-dim-rgb`の不透明rgb表現。
これらは将来Shellの採用候補として明示した対応であり、Port全componentの完全な再現契約ではない。

## 7. 4テーマの主要値

| 意味 | Dark | Charcoal | Gray | Light |
|---|---|---|---|---|
| app-bg | #080806 | #424346 | #c8cbd0 | #f7f6f2 |
| surface | #12110f | #4c4e52 | #d8dbdf | #ffffff |
| panel | #11100d | #505256 | #e3e5e8 | #ffffff |
| field | #090907 | #3a3b3e | #eef0f2 | #ffffff |
| text-primary | #f3f0e8 | #f2f1ed | #1d1f23 | #1c1b18 |
| text-muted | #9b968a | #d2cec5 | #4a4e55 | #5f5b52 |
| accent-text / ordinary focus | #e6d29b | #e6d29b | #634c15 | #6b5318 |
| success | #cfe6d4 | #cfe6d4 | #285c34 | #2c6438 |
| warning | #ead39b | #ead39b | #6a4a06 | #765208 |
| danger | #ffd3d6 | #ffd3d6 | #8c2731 | #9a2e38 |

全156値・source file / selector / property / literalはJSON対応表を正とする。var参照先も検証する。
共通primary gradientは`linear-gradient(180deg, #e8d49d, #bfa25a)`、foregroundは`#171208`。

## 8. Component例外 / overlay / shadow

汎用stateはSyncの安全・警告・削除表示を代表sourceとする。Tuner in-tune、判定色、NEWS独自色、
Pro badge、Dark-fixed icon plate、Canvas / export画像色はglobal tokenへ統合しない。infoは新設しない。
disabledはPortに一意の色がなく、今回はglobal tokenを作らない。opacity / cursor / hit targetはhost責務。

通常focusは`.port-card:focus-visible`のgold-bright系。primary例外は`#fff3bd`、danger例外は
Dark / Charcoal `#ffd3d6`、Gray `#8c2731`、Light `#9a2e38`。例外を全controlへ一律適用しない。
特にprimary例外のLight上の利用可否はShell componentごとに確認し、色を無断デザインしない。

overlay: Darkは`.port-pro-prompt`のblack .75。Gray / Lightはroot .45 / .40。
CharcoalはPort Sync modalのroot scrim .55を採用する。Port通常modalがDark scrimを継承する
例外とは区別し、同じ色に統一したとは扱わない。写真 / ファイルlightboxの固定Darkは対象外。

shadow-low / medium / highの正本はcard / view-panel / practice-set-dialog-panel。
geometryはそれぞれ`0 10px 24px` / `0 16px 36px` / `0 22px 60px`。
Dark / Charcoalのalphaは.24 / .30 / .48。Gray .12、Light .08。
Charcoal rootのshadow-alpha .3を全用途へ適用せず、componentの実使用値を維持する。

## 9. Paper / print domain

既存paper-bg / ink / muted / faint / border / music notation色とLoupeのslot tokenは固定。
4テーマ切替で紙面背景や文字色を変えず、Dark Shellでも白系paper `#fdfbf5`を維持する。
screen選択のみ5つをalias化: paper-selection-bg / border / shadow-edge / number、paper-focus。
値は既存直書きと完全一致。Shell accent / focusへ接続しない。

印刷CSSは変更しない。白紙、dark paper ink、A4 210×297mm、Shell UIとLoupe非表示、
選択背景 / shadow除去を維持。print.cssは`--studio-*`とtheme IDに依存しない。
将来Shellを追加した際には新Shell DOMの印刷除外をその工程で追加する。

## 10. Source verification / fallback

`tests/theme-source-reader.mjs`は監査対象CSSの読み取り専用helper。exact selector / propertyを
一意に指定し、source literalと解決後の値を検証する。未知・曖昧なsourceは失敗させる。
rootの継承、alias / channel、個別state、gradient、focus、overlay、shadowを確認する。
source変更時にテストが失敗したら、Studio mappingとcontractを再監査する。Portを修正して合わせない。
helperは汎用CSS cascade / computed-style engineではない。Portに新しいcomponent overrideが追加された
場合も手動監査し、source selectorの対応を更新する。見た目同等の文字列表現変更も再確認する。

実行: `node --test apps/cruise-studio/tests/color-theme.test.mjs apps/cruise-studio/tests/feature-metadata.test.mjs`。
CSS再出力はJSONを読み、helperの`renderProjectionCss`で`theme-projection.css`を生成する。
値をsourceから自動更新してテストを通す運用はしない。変更をレビューし、期待値を明示更新する。

未知themeはDarkにfallbackする。欠落source / stale projectionを実行時にnetworkで補完しない。
既存画面は新semantic tokenを消費せず、全themeで現状配色を保つ。Shell実装時に初めて利用する。

## 11. Metadata境界 / acceptance

Feature Metadataはfeature / owner / presentation / capabilityのみ。Themeを追加しない。
Theme Contractはpalette / projection / source map、Runtime Themeはselected ID / storage / apply / listener。
Account / Pro / Sync / transport / musical stateをThemeへ持たせない。

検証結果: Theme 32 + Metadata 22 = 54 PASS。4テーマ / invalid / no-value / corrupt JSON /
storage-blockedの8ケースを既存8765サーバーの実HTTPで隔離Chrome確認。
CSS応答前とfirst-paint / first-contentful-paintでrootとruntimeが一致。全39 CSS値・固定paper・
初期非保存を確認。通常navigationでTOP / Structure / Loupe / Pre-DTM / printの変更前後画像・
body DOM、Project JSON / storageが一致、self-check OK、console error / asset 404なし。
baselineは開始commitのHTML / CSSで固定し、スクロール完了を待って比較。外部font CSSのみ検証側で隔離。
印刷のラスタ相当確認はprint media screenshotとcomputed A4寸法による。実プリンター / Safariは未再確認。

次工程: Studio Shell v1。Navigation rail / Main / Inspector / Tool pane / Dockは本工程では未実装。
