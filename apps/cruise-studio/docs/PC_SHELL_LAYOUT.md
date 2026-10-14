# PC Shell / Dock / Narrow Layout Polish v1

Studio 0.32.0 / Port 1.22.18 / schema1。開始基点 `a4f053cf90e28bbef947e8fe8f66f79d82113053`。
stage直前に並行NEWS文書commit `0e3dad0d29db276be045b7caa0fb92541eeab993`を検知。
指定基点のdirect child、NEWS-SOURCE-DECISION-REGISTER.mdのみ、HEAD/origin/remote一致・分岐なし・Studio不変更を確認し、許可された並行commit規則に従ってこの親から継続する。

これはUI-only工程であり、Authority安全性承認やM3 write解禁ではない。

## Main / Navigation / toolbar

600 CSS px以下ではNavigationを上段へ置き、workspace列とutility列を別々のnative横scrollにする。
名前を省略せず、Tab・Shift+Tab・pointerで全workspace / Inspector / Tools / Metronome / Themeへ到達できる。
600pxを超える画面は既存railを使う。Navigationの独立scrollと固定safety領域を分離する。
Mainが主scroll owner。固定toolbar min-widthをなくし、Pre-DTMのgridは実container幅に収める。
狭幅のtoolbar操作列は局所横scrollを許可する。各buttonは縮小せず、Tabで選択したbuttonが可視になる。
保存statusは行の余地が足りなければ折返す。viewport全体とMainに予期しない横scrollを作らない。

## Loupe bounds / input ownership

Shellの既存safe-area providerを使い、viewport座標のMain left/right/top/bottomから算出する。
幅は最大1240pxかつMain幅−16px以下。最小280pxもこの最大幅より大きくしない。
左右はMain内8px。drag、Alt+Shift+矢印、resize、pane開閉、browser resize、workspace復帰で再clampする。
実Loupe幅が680px未満でもheader actionを折返し、タイトルに14pxの可読floorを設定する。
狭幅resize handleを使えるようにし、表示幅自体は範囲内で変更できる。

Structure toolbarの下端は通常避ける。低高さで空間が足りない場合はMain底から168pxのreserve位置までに
上端除外を制限し、LoupeがMain底から出ない実max-heightを設定する。この場合toolbar領域と重なることはある。
Loupe内部は既存scrollを利用し、必要な編集行・Closeへ到達する。overflow:hiddenで画面外を隠さない。
window resizeは既存RAFのgeometry-only経路を使い、selectionの再描画やinput DOM差替えを予約しない。
したがってfocus / caret / IME所有を維持し、Modalへfocusを奪い返す処理を作らない。
UI位置/幅だけを既存barLoupe appSettingsへ保存する。project・selection・Editing Sessionを変更しない。

## Dock / Metronome

Navigationの同じDock toggleを「Metronome」と表示する。workspaceや第2engineを追加しない。
現在BPM、入力、既存Start/Stop toggle、同じvisual queueの4拍表示を優先する。
個別Start / StopとStandard effective設定の説明はnative details「設定・状態」へ移す。
memory-only、reload初期化、Port値との独立は維持。memory保存状態は閉じたsummaryでも確認できる。
音声停止/開始中/エラーのstatusは詳細の外に置き、既存runtimeの表示をそのまま使う。
未実装Transportは縮小した「準備中」の説明だけで、動作する再生機能として見せない。
Dockは折畳み時に占有0。展開時は最大24dvhで、必要時に内部scrollして詳細説明へ到達する。
Dock開閉、Theme、workspaceの移動はMetronomeの音声開始/停止へ結び付けない。
BPM / Start / Stop / Save / IME / Modalの既存listener・所有・shortcutは変更しない。

## Global Stop / safety

既存Global Stopをscroll領域の外へ移す。低高さ、nav scroll、Dock展開時にも同じbuttonへ到達する。
Metronome再生中の既存Stopも同じsafety領域に表示する。
Global Stopの実装はTuner workspace adapterが所有する既存Audio Coordinator.stopAll()の接続を利用する。
新機構・別owner・新keyboard shortcutは作らない。native Enterとclick、既存IME/Modal gateを維持する。
Global Stop後にDockを開いても自動再開しない。

## Formal regression

修正前の5反例を正式 `tests/pc-shell-layout.browser.cjs` へ追加し、5 FAILを確認した。
Structure/Pre-DTM Main247pxに対するscrollWidth265px、Loupe x=−16px、Dock192px/600px、Global Stop非到達。
修正後は同じassertionがPASS。非表示のゼロ寸法をinside合格としない。
新Node20件は実private geometry関数のVM評価と境界接続、CSS/Print/ownerを検証する。
全Node580 PASS。正規Chrome252 PASS、新layout18 PASS（親込み）。
6幅×2高さ×4 ThemesのMain/toolbar/Loupe到達性、狭幅drag/resize・pane・focus保持・小節変更・scroll・復帰、
Dock全幅詳細、BPM151・8回開閉・同一context、4 Themesの768/1440×600 nav scroll中Global Stop、
合成native Tuner track/context cleanup、Practice/Gear/My Apps focus、Modal/IME、JSON/MIDI、A4 Printを確認する。
4 Themes×390/1024/1920の12枚、Dock390・Pre-DTM390の2枚、A4 PDFを生成。代表画面とPrintを目視確認した。

## Isolation / remaining

正式repo独立8766・使い捨てChrome・443Hz合成micだけを使い、既存8765と利用者profileを操作しない。
測定readerのPort dataset/binary、Authority DB create、ProDevice、Account、Sync/outbox、Worker/cloud mutation0。
Studio project write / unexpected dirty0、console error / app404 / unhandled0、source/display0.32.0一致。
Port/Shared/Workerコード不変更。Host等の差分はStudio import cache queryのみ。
Production legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false維持。
Daybreak待機・L3c境界は継続。認証/認可の動的probe、正式共有write、本番deploy、D1、cutoverは行わない。

Safari、実OS IME、実マイク/OS音声、利用者のzoom設定での操作感は実機未確認。
domain Undo、draft crash recovery、Transport/実Pre-DTM再生、Port正式write/binary本体は別工程。
次はこのPC layoutの実機確認。未実装機能の完成を本工程から推定しない。
