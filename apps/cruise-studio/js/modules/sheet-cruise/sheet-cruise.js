/* クルーズスタジオ — sheet-cruise.js（Phase 2B / R2、UI再編D1/D2/D3a/F1でレイアウトのみ改修）
   譜面クルーズ画面: プロジェクト選択・曲情報フォーム・キー関係チェック・
   セクション管理・小節グリッド（1小節1コード入力）・簡易プレビュー・保存。
   歌詞・ドレミ入力とA4紙面プレビューは Phase 2C / Phase 3。
   D1（docs/DECISIONS.md ADR-025）: 曲情報・セクション・表示設定・小節グリッドは
   上部ドロワー（#sc-editor-drawer）へ移動。
   D2 MVP（同ADR-025）: 小節上の極小overlay（S1b〜R2）を画面下部の横長ドックへ移設。
   D3a（同ADR-025 / ADR-026）: 巨大な縦積みフォーム型ドックを、選択小節と同じ時間軸を持つ
   コンパクトなタイムグリッド・ドックへ変更（「選択小節のX線写真」）。本格セル編集は
   ストローク行のみ。コードは1小節1セル、歌詞・ドレミは見た目だけ時間軸へ揃え、
   入力方式は現行の小節単位文字列入力のまま（tick位置セル分解はD3bで扱う）。
   まとめて入力はヘッダーのボタンから開くポップオーバー化。
   F1（ADR-027）: D3aのタイムグリッド編集はそのまま、表示方式を bottom固定の黒いドックから
   紙面デザイン（アイボリー・墨色・アンバー枠）の「フローティング小節ルーペ」へ変更。
   x/y自由配置・タイトルバードラッグ・右下ハンドルでの比例リサイズ・
   cruiseStudio.appSettings（barLoupeキー）への位置/幅保存を追加。
   F2a（ADR-028）: 歌詞行をtick位置ごとのセル編集（8/16マス）へ変更。IME 3層ガード付き。
   旧小節グリッドの歌詞inputはreadonly化（クリックでルーペを開く）、まとめて入力の歌詞は
   セル編集への移行に伴い一時停止。bar.lyricsのスキーマ・schemaVersionは変更しない。
   F2a時点では保存/復元/JSON/プレDTM/MIDIの経路・データ構造を維持。
   Editing Session v1（0.24.0）: draft所有・保存command・Pre-DTM working入力を接続。schemaVersion 1を維持。
   グローバル名前空間 CruiseStudio.sheetCruise に登録する。 */
(function () {
    'use strict';

    function CS() { return window.CruiseStudio || {}; }
    var pianoScriptURL=typeof document==='object'&&document.currentScript?document.currentScript.src:null;

    // フォームのキー選択肢（normalizeKeyName が受ける表記に揃える）
    var KEY_OPTIONS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    // プレビューの1行あたり小節数は sheetSettings.barsPerLine（既定2）。
    // 歌詞もドレミもないセクション（前奏などのコードのみ）は2倍詰めで表示する。

    // 編集行の順序。セルは絶対tickで対応させ、表示の分割だけを拍別に切り替える。
    var DOCK_ROW_ORDER = ['chord', 'strum', 'lyrics', 'doremi'];
    var DOCK_ROW_LABELS = { chord: 'コード', strum: 'ストローク', lyrics: '歌詞', doremi: 'ドレミ' };

    // D3a: ストロークセルのクリック循環順（空/restから開始）
    var STRUM_CELL_CYCLE = ['down', 'up', 'mute', 'sustain', 'rest', 'empty'];
    var STRUM_GLYPHS = { down: '↓', up: '↑', mute: 'x', empty: '', sustain: '〜' };
    function strumRestGlyph(ticks){return ticks===120?'𝄿':ticks===240?'𝄾':'休';}

    // F1: フローティング小節ルーペのサイズ定数（docs/DECISIONS.md ADR-027）
    var LOUPE_BASE_WIDTH = 960;     // --bar-loupe-scale = 現在幅 / この値
    var LOUPE_DEFAULT_WIDTH = 960;
    var LOUPE_MIN_WIDTH = 680;
    var LOUPE_MAX_WIDTH = 1240;
    var LOUPE_MAX_WIDTH_MARGIN = 32;  // 最大幅は min(1240, viewportWidth - 32)
    var LOUPE_TOP_MARGIN = 8;         // topは8px以上
    var LOUPE_SIDE_VISIBLE = 120;     // 左右は最低120pxを画面内へ残す
    var LOUPE_HEADER_RESERVE = 56;    // タイトルバーが画面内に残るための下限余白
    var LOUPE_NARROW_BREAKPOINT = 680; // これ未満はPCファーストの安全フォールバック
    var LOUPE_NARROW_MARGIN = 28;
    var LOUPE_MOVE_STEP = 16;         // Alt+Shift+矢印キーでの移動量(px)
    var LOUPE_APP_SETTING_KEY = 'barLoupe';
    var LOUPE_BOTTOM_MARGIN = 8;          // v0.22.4後修正: 動的max-height算出時の下端余白
    var LOUPE_MIN_AVAILABLE_HEIGHT = 160; // 同: 上端がbottomMarginの分だけ下がっても、
                                           // ヘッダー・拍ルーラー・最低1行程度は必ず触れる高さ

    var state = {
        session: null,   // One source of truth: session-owned observable draft
        selectedBarNumber: null,
        overlayFrame: null,
        overlayRefreshRequested: false,
        active: false,
        workspaceScroll: null,
        workspaceFocus: null,
        overlayComposingRowId: null,
        overlayBulkComposing: false,
        overlayBulkMessage: null,
        overlayWarnings: {},
        dockManualRes: {},     // D3a: barNumber → 16（ユーザーが一時的に選んだ16分表示。保存しない）
        dockBulkOpen: false,   // D3a: まとめて入力ポップオーバーの開閉状態（UI一時状態）
        lyricComposingTick: null,  // G2a: IME変換中の歌詞セルslotTick（同時に1つだけの想定。F2a時点はindexで管理していた）
        lyricJustComposed: false,  // F2a: compositionend直後のEnter誤爆ガード（Safari対策）
        // G2b: 歌詞の拍別ローカル解像度（UI一時状態。ADR-030）。bar objectをキーにした
        // WeakMapなので、project/localStorage/appSettingsへは保存されず、JSON読込・
        // 新規project・再読込では新しいbarオブジェクトになるため自然に消える。
        // 小節削除等でbarオブジェクトが参照されなくなればGC対象にもなる。
        // 値: WeakMap<bar, Map<beatIndex, 8|16>>（ローカル指定が無いbeatIndexはMapに存在しない＝自動）
        lyricBeatRes: new WeakMap(),
        // Session -> stable bar ID -> beat map. Derived views never own this UI state.
        lyricBeatResV2: new WeakMap(),
        loupe: { x: 0, y: 0, width: LOUPE_DEFAULT_WIDTH } // F1: ルーペの位置/幅。UI状態のみ（projectに保存しない）
    };

    var schemaViewVersion=null,schemaView=null,schemaViewError=null;
    Object.defineProperties(state, {
        project: { get: function () {
            if(!state.session)return null;
            var v=state.session.snapshotVersion;
            if(v!==schemaViewVersion){
                schemaView=null;schemaViewError=null;
                try { schemaView=(CS().model.toStructureView||CS().model.toLegacyView)(state.session.draft.schemaVersion === 2 ? state.session.workingSnapshot() : state.session.draft); }
                catch(error){
                    if(error.code==='invalid-project')schemaViewError=error.diagnostics.slice();
                    else if(error instanceof TypeError && /^(non-json-|json-depth$|sparse-json-array$)/.test(error.message))schemaViewError=[error.message];
                    else throw error;
                }
                schemaViewVersion=v;
            }
            return schemaView;
        } },
        dirty: { get: function () { return !!(state.session && state.session.dirty); } }
    });
    var staffStyle = 'code', staffView = null;
    var paperFormSessions=new WeakMap(),barClipboards=new WeakMap(),formDialog=null,formPopupModule=null,formPopupPending=null,formPopupEpoch=0;
    var sheetActions=null,sheetActionsPending=null,saveAsFlight=false,historyPreview=null;
    var playbackSettings=null,playbackSettingsPending=null,playbackMix={chords:100,melody:100,metronome:100};
    var editorOpen=false;
    var editorBars=1,editorAnchorId=null,editorPlacement='floating',collapsedEditorRows=new Set();
    var sectionPlaybackSelection=null;
    var scoreSettings=null,scoreSettingsPending=null,emptySlotSelection=null;
    function prepareScoreSettings(){
        if(!scoreSettingsPending)scoreSettingsPending=import('./score-settings.mjs?v=0.141.0-dev.1').then(function(module){scoreSettings=module.createScoreSettings({C:CS(),document:document,getSession:function(){return state.session;},canEdit:editorCanMove,execute:runStructureOperation,closed:refreshSessionStatus,changed:function(change){
            emptySlotSelection=null;var oldIds=new Set(change.previous.bars.map(function(b){return b.id;})),added=state.session.draft.bars.findIndex(function(b){return !oldIds.has(b.id);});redrawSession(false);
            if(change.mode==='slot'&&added>=0){editorOpen=true;selectSheetBar(added+1);}refreshSessionStatus();
        }});return scoreSettings;}).catch(function(e){scoreSettingsPending=null;setSaveStatus(e.message||'編集画面を読み込めませんでした',true);});return scoreSettingsPending;
    }
    function openScoreSettings(mode,args){
        if(!editorCanMove())return;finishTextInputs();stopPianoAudition();var frame=CS().structureOperations.capture(state.session);prepareScoreSettings().then(function(service){if(service&&CS().structureOperations.isCurrent(frame,state.session)&&editorCanMove())service.open(mode,args);});
    }
    var editorHelp=null,editorHelpPending=null;
    function prepareEditorHelp(){
        if(!editorHelpPending)editorHelpPending=import('./editor-help.mjs?v=0.141.0-dev.1').then(function(module){editorHelp=module.createEditorHelp({document:document,closed:refreshToolbarActions});return editorHelp;}).catch(function(){editorHelpPending=null;setSaveStatus('操作ガイドを読み込めませんでした。もう一度お試しください',true);});return editorHelpPending;
    }
    function openEditorHelp(trigger){
        if(!state.active||!editorOpen||!operationEligible()||els.slotOverlay.querySelector('.is-composing'))return;
        var frame=contentFrame(),previous=document.activeElement;
        prepareEditorHelp().then(function(help){if(!help||!currentFrame(frame)||!trigger.isConnected||!editorOpen||!operationEligible())return;stopPianoAudition();help.open({host:els.root,trigger:trigger,returnFocus:previous});refreshToolbarActions();});
    }
    function selectEmptySlot(cell){
        if(!editorCanMove())return;finishTextInputs();stopPianoAudition();editorOpen=false;state.selectedBarNumber=null;selectedBarIds=[];sectionPlaybackSelection=null;emptySlotSelection={owner:state.session,slot:JSON.parse(cell.dataset.emptySlot),key:cell.dataset.emptySlot};syncSheetSelection();refreshToolbarActions();cell.focus({preventScroll:true});
    }
    function selectedIDs(){return selectedBarIds.length?selectedBarIds.slice():state.session?.draft.bars[state.selectedBarNumber-1]?[state.session.draft.bars[state.selectedBarNumber-1].id]:[];}
    function selectedRangeNumbers(){
        if(!state.session||selectedBarIds.length<2)return [];
        var ids=new Set(selectedBarIds),numbers=[];state.session.draft.bars.forEach(function(bar,index){if(ids.has(bar.id))numbers.push(index+1);});return numbers;
    }
    function songPlaybackTarget(){
        if(!state.session?.draft.bars.length)return '再生する小節なし';
        var range=selectedRangeNumbers();if(range.length>1)return range[0]+'〜'+range.at(-1)+'小節をループ';
        var section=selectedPlaybackSection(),number=section?state.session.draft.bars.findIndex(function(b){return b.sectionId===section.id;})+1:state.selectedBarNumber;
        return number?number+'小節目から':'最初から';
    }
    function deleteSelectedBars(keep){
        if(!editorCanMove())return;var ids=selectedIDs();if(!ids.length)return;var result=runStructureOperation('deleteBars',{barIds:ids,keepSlots:keep});if(!result.ok)return;editorOpen=false;state.selectedBarNumber=null;selectedBarIds=[];emptySlotSelection=null;redrawSession(true);refreshToolbarActions();setSaveStatus(keep?'選択小節を空き枠にしました（元に戻すで復元）':'選択小節を詰めて削除しました（元に戻すで復元）');
    }
    function selectedPlaybackSection(){var choice=sectionPlaybackSelection;if(!choice)return null;if(choice.owner!==state.session){sectionPlaybackSelection=null;return null;}var section=state.session.draft.sections.find(function(s){return s.id===choice.id;});if(!section||!state.session.draft.bars.some(function(b){return b.sectionId===choice.id;})){sectionPlaybackSelection=null;return null;}return section;}
    function selectPlaybackSection(id,toggle,forPlayback){
        if(!editorCanMove())return false;var current=selectedPlaybackSection(),section=state.session.draft.sections.find(function(s){return s.id===id;});if(!section)return false;
        if(forPlayback){previewSelectOnStop=false;if(pianoAudition)pianoAudition.cancel();finishTextInputs();selectedBarIds=[];editorOpen=false;state.selectedBarNumber=null;state.overlayWarnings={};state.overlayBulkMessage=null;}else{stopPianoAudition();finishTextInputs();selectedBarIds=[];deselectBar();}sectionPlaybackSelection=toggle&&current?.id===id?null:{owner:state.session,id:id};syncSheetSelection(true);updateBarPlayButton();return true;
    }
    function onPlaybackSpace(event){
        if(event.defaultPrevented||event.key!==' '||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||event.isComposing||event.keyCode===229||!state.active||!operationEligible()||!CS().entryAuth?.isAuthorized())return;
        var target=event.target;if(!(target===document.body||els.root.contains(target)||els.slotOverlay.contains(target)))return;
        if(target.closest('summary,.sc-toolbar-menu,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],.dock-strum-cell,[data-piano-event]'))return;
        var button=target.closest('button,a,[role="button"]');if(button&&!button.matches('[data-bar-preview],[data-melody-preview],#sc-song-preview,.sheet-section-label,.sheet-bar'))return;
        event.preventDefault();event.stopPropagation();if(event.repeat)return;
        if(barPreviewPhase!=='idle'){if(barPreviewScope==='song')stopSongPreview();else stopPianoAudition();return;}
        var section=target.closest('.sheet-section-label');if(section&&selectedPlaybackSection()?.id!==section.dataset.sectionId&&!selectPlaybackSection(section.dataset.sectionId,false))return;
        startPreview(!els.slotOverlay.classList.contains('hidden')?(piano.open?'melody':'all'):'song');
    }
    function editorRoot(){return els.slotOverlay?.querySelector('.editor-measure[data-bar-number="'+state.selectedBarNumber+'"]')||els.slotOverlay;}
    function editorStartIndex(project){var index=project.bars.findIndex(function(b){return b.id===editorAnchorId;});return index>=0?index:Math.max(0,state.selectedBarNumber-1);}
    function revealEditorCell(target){var viewport=els.slotOverlay.querySelector('.editor-score-scroll');if(!viewport||!target)return;var area=viewport.getBoundingClientRect(),box=target.getBoundingClientRect();if(box.right>area.right-8)viewport.scrollLeft+=box.right-area.right+8;else if(box.left<area.left+8)viewport.scrollLeft+=box.left-area.left-8;}
    function editorCanMove(){return operationEligible()&&!state.session?.inputPending&&!state.session?.commitInFlight&&!state.session?.conflict&&!state.session?.externalUpdatePending&&!textDiagnostic(state.session)&&!els.slotOverlay.querySelector('.is-composing');}
    function activateEditorMeasure(number){
        if(number===state.selectedBarNumber)return true;if(!editorCanMove())return false;finishTextInputs();stopPianoAudition();
        state.selectedBarNumber=number;selectedBarIds=[];state.overlayBulkMessage=null;refreshEditorHeader();syncSheetSelection(true);refreshPiano();return true;
    }
    function refreshEditorHeader(){
        var bar=getSelectedBar();if(!bar)return;var title=els.slotOverlay.querySelector('.slot-overlay-title');if(title)title.textContent=bar.barNumber+'小節目';
        var badge=els.slotOverlay.querySelector('.slot-overlay-section');if(badge)badge.textContent=getBarSectionName(bar);
        var resolution=els.slotOverlay.querySelector('[data-active-resolution]');if(resolution)resolution.replaceChildren(buildResolutionToggle(bar));
        var play=els.slotOverlay.querySelector('[data-bar-preview]');if(play)play.replaceWith(buildBarPlayButton());
        els.slotOverlay.querySelectorAll('.editor-measure').forEach(function(root){root.classList.toggle('is-active-measure',Number(root.dataset.barNumber)===state.selectedBarNumber);});
    }

    function renderInvalidProject() {
        if(staffView){staffView.invalidate();staffView=null;}
        var box=document.createElement('div');box.className='schema-invalid-project';box.setAttribute('role','alert');
        var message=document.createElement('p');message.textContent='譜面を表示できません。曲の入力値を確認してください。';box.appendChild(message);
        var details=document.createElement('details'),summary=document.createElement('summary'),diagnostic=document.createElement('pre');
        summary.textContent='詳細診断';diagnostic.textContent=(schemaViewError||[]).join(' / ');
        // The scaled viewport has an explicit height; details expansion must
        // update it too, otherwise overflow:hidden clips the diagnostic text.
        details.addEventListener('toggle',updateSheetScale);
        details.append(summary,diagnostic);box.appendChild(details);els.scaleBox.replaceChildren(box);
        if(els.slotOverlay)els.slotOverlay.classList.add('hidden');
        updateSheetScale();
    }
    function staffRequest() {
        if (staffStyle !== 'melody' || !state.active || !state.project) return;
        if (!staffView) staffView = CS().melodyStaff.create({ host: els.scaleBox,
            active: function () { return staffStyle === 'melody' && state.active&&!historyPreview; },
            onLayout: function () { updateSheetScale(); syncSheetSelection(true);if(CS().melodyInspector)CS().melodyInspector.refresh(); },
            onTarget:function(t,n,open){return CS().melodyInspector&&CS().melodyInspector.select(t,n,open);},
            onTargetKey:function(t,n,e){if(CS().melodyInspector)CS().melodyInspector.key(t,n,e);}
        });
        staffView.render(state.project);
    }
    function prepareCodePrint() {
        if (staffStyle !== 'melody' || !state.project) return;
        var previous = els.scaleBox.querySelector('.melody-print-fallback');
        if (previous) previous.remove();
        var fallback = document.createElement('div'); fallback.className = 'melody-print-fallback';
        CS().sheetRenderer.render(state.session.workingSnapshot(), fallback); els.scaleBox.appendChild(fallback);
    }
    var projectViews = new Map();
    var operationAdapter = null, structureIdentity = null, publishedBars = null, focusEpoch = 0;
    function contentFrame() {
        return { content: CS().structureOperations.capture(state.session),
            ticket: CS().documents.ticket(), barNumber: state.selectedBarNumber };
    }
    function currentFrame(frame) {
        return !!(frame && CS().structureOperations.isCurrent(frame.content, state.session) &&
            CS().documents.isSelected(frame.ticket) && frame.barNumber === state.selectedBarNumber);
    }
    function operationEligible() {
        return state.active && !scoreSettings?.isOpen && !editorHelp?.isOpen && !playbackSettings?.isOpen && !sheetActions?.isOpen && !saveAsFlight && !formDialog?.open && !CS().localPaperLayout?.isOpen && !(CS().shellHost && CS().shellHost.getCommandContext().activeModal) &&
            !(CS().shellHost && CS().shellHost.keyboard.isIMEBlocked({})) &&
            state.overlayComposingRowId === null && !state.overlayBulkComposing &&
            state.lyricComposingTick === null && !state.lyricJustComposed;
    }
    function runStructureOperation(kind, args, expected) {
        finishTextInputs();
        if (!operationAdapter) operationAdapter = CS().structureOperations.create({ model: CS().model,
            getSession: function () { return state.session; }, isEligible: operationEligible, afterEdit:CS().localChordForms?CS().localChordForms.reconcile:null });
        if(CS().localChordForms&&['bulkChord','transpose','restoreSlot','instrument'].includes(kind)&&!(kind==='restoreSlot'&&args?.activateEmpty)&&!CS().localChordForms.authorize(state.session))return {ok:false,error:'楽器条件の確認をキャンセルしました'};
        var result = operationAdapter.execute(kind, args, expected);
        if (!result.ok) { q('sc-edit-error').textContent = result.error || '編集を適用できませんでした'; setSaveStatus(result.error || '編集を適用できませんでした', true); return result; }
        q('sc-edit-error').textContent = '';
        if (result.code === 'history-overflow') setSaveStatus('編集は反映されましたが、履歴容量を超えたため記録できませんでした', true);
        return result;
    }
    // Deferred focus belongs to the exact document/content/selection and current focus owner.
    function queueContentFrame(callback) {
        var frame = contentFrame();
        return window.requestAnimationFrame(function () {
            if (currentFrame(frame) && isWorkspaceVisible()) callback();
        });
    }
    function queueEditorFrame(callback) {
        var frame = contentFrame(), focused = document.activeElement, epoch = focusEpoch;
        return window.requestAnimationFrame(function () {
            var active = document.activeElement;
            var replacedControl = focused && !focused.isConnected && active === document.body && epoch === focusEpoch;
            if (!currentFrame(frame) || !operationEligible() || epoch !== focusEpoch || (active !== focused && !replacedControl)) return;
            callback();
        });
    }
    var historyController = null;
    function refreshHistoryControls() {
        refreshToolbarActions();
        if (!els.undoBtn || !els.redoBtn) return;
        els.undoBtn.disabled = !historyController || !historyController.can('undo');
        els.redoBtn.disabled = !historyController || !historyController.can('redo');
    }
    function connectHistoryCommands(host) {
        historyController = CS().domainHistoryCommands.create({
            getSession: function () { return state.session; }, getContext: host.getCommandContext,
            isIMEBlocked: function () { return !operationEligible(); },
            settleInput: function (session) {
                if (session !== state.session) return;
                var input = document.activeElement;
                if (input && els.root.contains(input) && input.classList.contains('section-name-input')) {
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            },
            onResult: function (direction, result, session, event) {
                if (session !== state.session) return;
                refreshHistoryControls();
                els.historyStatus.textContent = result.ok ? (direction === 'undo' ? '元に戻しました' : 'やり直しました') :
                    '履歴を適用できませんでした。現在の編集内容を保持しています';
                // Keep a restored editor focus; offer the next toolbar action if its old button is disabled.
                var focused = document.activeElement;
                if (result.ok && (focused === document.body || (focused && focused.disabled &&
                    (focused === els.undoBtn || focused === els.redoBtn)))) {
                    var next = direction === 'undo' ? els.redoBtn : els.undoBtn;
                    (next.disabled ? els.projectSelect : next).focus({ preventScroll: true });
                }
            }
        });
        var off = historyController.attach(host.commands, host.keyboard);
        refreshHistoryControls(); return off;
    }
    function routeLocalHistory(event) {
        if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'z' ||
            CS().keyboard.isTextControl(event.target) || CS().keyboard.isTextControl(document.activeElement)) return false;
        return !!(els.root.contains(event.target) && CS().shellHost &&
            CS().shellHost.keyboard.localCommand(event, event.shiftKey ? 'studio.redo' : 'studio.undo', 'sheetCruise'));
    }
    var textAdapter = null, textControls = new WeakMap(), textDiagnostics = new WeakMap();
    function textDiagnostic(session) {
        var entries = textDiagnostics.get(session), message = null;
        if (entries) entries.forEach(function (value, input) {
            if (!input.isConnected) entries.delete(input); else message = value;
        });
        return message;
    }
    function finishTextInputs() { if (state.session) state.session.finishTextGroup(); refreshHistoryControls(); }
    function wireTextControl(input, target, update, reusable) {
        var info = { session: reusable ? null : state.session, target: target, composing: false,
            justComposed: false, compositionValue: null, native: false };
        textControls.set(input, info);
        input.addEventListener('beforeinput', function (event) {
            info.native = event.inputType === 'historyUndo' || event.inputType === 'historyRedo';
            if (info.native) finishTextInputs();
        });
        input.addEventListener('compositionstart', function () {
            info.composing = true; info.justComposed = false; info.compositionOwner = state.session;
            info.compositionTicket = CS().documents.ticket(); finishTextInputs();
        });
        input.addEventListener('compositionend', function () {
            info.composing = false; info.justComposed = true; info.compositionValue = input.value;
            if (info.compositionOwner === state.session && CS().documents.isSelected(info.compositionTicket)) update({ target: input, composition: true });
            window.setTimeout(function () { info.justComposed = false; }, 0);
        });
        input.addEventListener('input', function (event) {
            if (event.isComposing || info.composing) return;
            if (info.justComposed && input.value === info.compositionValue) return;
            update(event); info.native = false;
        });
        input.addEventListener('blur', finishTextInputs);
        input.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' || event.isComposing || event.keyCode===229 || info.composing || info.justComposed) return;
            if(['chord','doremi'].includes(target.kind)){
                if(input.dataset.overlayField)return;
                event.preventDefault();
                if(input.classList.contains('is-invalid')||CS().shellHost.keyboard.isIMEBlocked({}))return;
                var result=applyTextInput(input,event);if(!result.ok||result.deferred)return;
                finishTextInputs();
                var next=els.root.querySelector('.bar-'+target.kind+'-input[data-history-bar="'+(target.barNumber+1)+'"]');
                if(next)next.focus();
            }else finishTextInputs();
        });
    }
    function applyTextInput(input, event) {
        var info = textControls.get(input);
        if (!info || !input.isConnected || (info.session && info.session !== state.session) ||
            info.composing || (event && event.isComposing)) return { ok: true, deferred: true, warnings: [] };
        if(CS().localChordForms&&info.target.kind==='chord'&&input.value.trim()&&!CS().localChordForms.authorize(state.session)){var pending=textDiagnostics.get(state.session);if(!pending){pending=new Map();textDiagnostics.set(state.session,pending);}pending.set(input,'楽器条件の確認待ちです');input.setAttribute('aria-invalid','true');refreshSessionStatus();return {ok:false,error:'楽器条件の確認をキャンセルしました'};}
        if (!textAdapter) textAdapter = CS().structureText.create({ model: CS().model,afterEdit:CS().localChordForms?CS().localChordForms.reconcile:null,
            getSession: function () { return state.session; },
            isEligible: function () { return state.active && !(CS().shellHost && CS().shellHost.getCommandContext().activeModal); } });
        var mode = event && event.composition ? 'composition' : info.native ? 'native' : input.tagName === 'SELECT' ? 'discrete' : null;
        var entries = textDiagnostics.get(state.session);
        if (!entries) { entries = new Map(); textDiagnostics.set(state.session, entries); }
        entries.delete(input); input.removeAttribute('aria-invalid'); input.removeAttribute('aria-description');
        var result = textAdapter.apply(info.target, input.value, mode);
        if (!result.ok) {
            var message = result.error || '入力を適用できませんでした。入力内容を保持しています';
            entries.set(input, message); input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-description', message);
        }
        refreshSessionStatus();
        return result;
    }
    var selectedBarIds = [], dragFrame = null, rangeAnchor = null;
    var selectionListeners = new Set(), selectionDeleted = false, selectionSignature = null;
    // Read projection of Structure's existing single-bar selection and session draft.
    function getSelectionSnapshot() {
        var session = state.session, readable=!!state.project, validSelection = readable && session && structureIdentity === CS().structureOperations.structureKey(session.draft);
        var selected = validSelection ? state.selectedBarNumber : null, bar = selected ? getSelectedBar() : null;
        var canonical = bar && session.draft.schemaVersion === 2 ? session.draft.bars[selected - 1] : null;
        return Object.freeze({ active: state.active, sessionId: session ? session.sessionId : null,
            barNumbers: Object.freeze(selected ? [selected] : []), barId: canonical ? canonical.id : null,
            chords: Object.freeze((canonical ? canonical.chords : bar ? bar.chords : []).map(function (chord) { return Object.freeze({ id: canonical ? chord.id : null, tick: canonical ? chord.onsetTick : chord.tick, symbol: chord.symbol }); })),
            invalid: !!(session && !readable), editing: !!(session && session.inputPending), dirty: !!(session && session.dirty),
            externalUpdatePending: !!(session && session.externalUpdatePending),
            deleted: selectionDeleted || !!(state.selectedBarNumber && !getSelectedBar()) || !!(session && session.conflict && session.conflict.deleted) });
    }
    function publishSelection() {
        refreshToolbarActions();
        var snapshot = getSelectionSnapshot(), signature = JSON.stringify(snapshot);
        if (signature === selectionSignature) return;
        selectionSignature = signature;
        selectionListeners.forEach(function (fn) { try { fn(snapshot); } catch (_) { /* readers cannot corrupt Structure */ } });
    }
    var compositionOwners = new WeakMap();
    var els = {};
    var resizeObserver = null;
    var loupeSafeAreaProvider = null;

    function q(id) { return document.getElementById(id); }

    function resolveElements() {
        els.root = q('screen-sheet-cruise');
        els.toolbar = els.root && els.root.querySelector('.sheet-toolbar');
        els.nav = q('app-nav');
        els.editorDrawer = q('sc-editor-drawer');
        els.barGridDrawer = q('sc-bar-grid-drawer');
        els.projectSelect = q('sc-project-select');
        els.newProjectBtn = q('sc-new-project');
        els.title = q('sc-title');
        els.artist = q('sc-artist');
        els.originalKey = q('sc-original-key');
        els.playKey = q('sc-play-key');
        els.capo = q('sc-capo');
        els.bpm = q('sc-bpm');
        els.timeSig = q('sc-time-sig');
        els.keyCheck = q('sc-key-check');
        els.saveBtn = q('sc-save');
        els.undoBtn = q('sc-undo'); els.redoBtn = q('sc-redo'); els.historyStatus = q('sc-history-status');
        els.saveStatus = q('sc-save-status');
        els.printBtn = q('sc-print');
        els.exportBtn = q('sc-export-json');
        els.importInput = q('sc-import-json');
        els.sectionList = q('sc-section-list');
        els.addSectionBtn = q('sc-add-section');
        els.barGrid = q('sc-bar-grid');
        els.preview = q('sc-preview');
        els.scaleBox = q('sc-sheet-scale-box');
        els.slotOverlay = q('sc-slot-overlay');
        els.showChords = q('sc-show-chords');
        els.showLyrics = q('sc-show-lyrics');
        els.showDoremi = q('sc-show-doremi');
        els.showStrum = q('sc-show-strum');
        els.showGrid = q('sc-show-grid');
        els.gridResolution = q('sc-grid-resolution');
        els.basicStrum = q('sc-basic-strum');
    }

    function mountScoreToolbar(){
        if(!els.toolbar||q('sc-song-preview'))return;var actions=els.toolbar.querySelector('.sheet-toolbar-actions');
        var play=document.createElement('button');play.id='sc-song-preview';play.type='button';play.className='btn-ghost btn-compact';play.textContent='▶ 再生';play.setAttribute('aria-label','再生');play.addEventListener('pointerdown',function(e){if(e.button===0)e.preventDefault();});play.addEventListener('click',function(){startPreview('song');});els.saveBtn.after(play);
        var target=document.createElement('span');target.id='sc-song-target';target.setAttribute('role','status');target.setAttribute('aria-live','polite');target.setAttribute('aria-atomic','true');play.setAttribute('aria-describedby',target.id);play.after(target);
        var position=document.createElement('span');position.id='sc-song-position';position.setAttribute('role','status');target.after(position);
        var names={addBar:'小節追加',duplicateBar:'複製',deleteBar:'小節削除'};actions.querySelectorAll('[data-bar-operation]').forEach(function(b){b.textContent=names[b.dataset.barOperation]||(b.dataset.direction==='-1'?'小節を前へ':'小節を後へ');});
        var forms=q('sc-chord-forms');if(forms)forms.textContent='コードフォーム';q('sc-goto-pre-dtm').hidden=true;
        var launchers=actions.querySelector('.sheet-tool-launchers');if(launchers)launchers.hidden=true;
        var details=document.createElement('details');details.className='sc-transpose-tools';var summary=document.createElement('summary');summary.textContent='移調';details.appendChild(summary);
        [['sc-transpose-down','全曲 −半音'],['sc-transpose-up','全曲 ＋半音']].forEach(function(pair){var b=q(pair[0]);b.textContent=pair[1];details.appendChild(b);});actions.appendChild(details);
        var visibility=els.root.querySelector('.sheet-display-toggles');visibility.classList.add('sc-paper-visibility');visibility.setAttribute('aria-label','譜面の表示');
        var formsLabel=document.createElement('label');formsLabel.className='pd-check';var check=document.createElement('input');check.type='checkbox';check.id='sc-show-forms';check.title='登録済みコードフォームを紙面に表示';formsLabel.append(check,document.createTextNode(' フォーム'));els.showChords.closest('label').after(formsLabel);els.showForms=check;
        check.addEventListener('change',function(){if(!state.session||!editorCanMove()){renderDisplayToggles();return;}if(typeof CS().localPaperLayout?.value.appearance.visibility.forms==='boolean')CS().localPaperLayout.set({appearance:{...CS().localPaperLayout.value.appearance,visibility:{...CS().localPaperLayout.value.appearance.visibility,forms:check.checked}}});else paperFormSessions.set(state.session,check.checked);renderPreview(true);});
        els.toolbar.appendChild(visibility);
        mountPaperLayoutControls();
        [['sc-copy-bar','コピー',copySelectedBar],['sc-paste-bar','貼り付け',pasteSelectedBar]].forEach(function(item){var b=document.createElement('button');b.type='button';b.id=item[0];b.className='btn btn-secondary btn-compact';b.textContent=item[1];b.title=item[1]+'（⌘ / Ctrl + '+(item[0]==='sc-copy-bar'?'C':'V')+'、同じ曲の選択小節）';b.addEventListener('click',item[2]);actions.querySelector('.sheet-bar-actions').appendChild(b);});
        els.undoBtn.title='元に戻す（⌘Z / Ctrl+Z）。ドレミは既存の音符履歴を使います';els.redoBtn.title='やり直す（⌘⇧Z / Ctrl+Shift+Z）';
    }
    // Move existing controls, retaining their command handlers and session ownership.
    function mountCompactScoreToolbar(){
        if(!q('sc-zoom-controls'))return;
        var head=els.toolbar.querySelector('.sc-score-toolbar-head'),settings=q('sc-paper-settings');
        if(q('sc-curve-menu')){if(settings){settings.textContent='詳細設定';q('sc-display-menu').querySelector('.sc-toolbar-menu-body').appendChild(settings);}return;}
        if(!head){head=document.createElement('div');head.className='sc-score-toolbar-head';els.toolbar.prepend(head);head.appendChild(els.projectSelect.parentElement);}
        els.toolbar.classList.add('sc-compact-toolbar');
        function group(className){var el=document.createElement('div');el.className=className;return el;}
        function button(id,text,action){var el=document.createElement('button');el.type='button';el.id=id;el.className='btn-ghost btn-compact';el.textContent=text;el.addEventListener('click',action);return el;}
        function menu(id,title){var el=document.createElement('details'),summary=document.createElement('summary'),body=group('sc-toolbar-menu-body');el.id=id;el.className='sc-toolbar-menu';summary.id=id+'-toggle';summary.textContent=title;body.setAttribute('aria-labelledby',summary.id);el.append(summary,body);return {root:el,body:body};}
        function divider(body){body.appendChild(document.createElement('hr'));}
        var right=group('sc-toolbar-head-actions');right.id='sc-toolbar-head-actions';head.appendChild(right);
        var curve=menu('sc-curve-menu','曲メニュー');right.appendChild(curve.root);
        function menuLabel(text){var label=document.createElement('span');label.textContent=text;label.className='sc-menu-label';curve.body.appendChild(label);}
        menuLabel('保存');curve.body.appendChild(button('sc-save-overwrite','上書き保存',function(){els.saveBtn.click();}));els.newProjectBtn.textContent='新しい曲を作成';curve.body.appendChild(button('sc-save-as','名前をつけて保存',function(){openSheetAction('saveAs',q('sc-save-as'));}));
        divider(curve.body);menuLabel('曲の設定');[['sc-edit-song','曲情報','settings'],['sc-edit-instrument','キー・カポ','instrument'],['sc-edit-rhythm','基本ストローク','rhythm'],['sc-edit-sections','セクション','sections']].forEach(function(item){curve.body.appendChild(button(item[0],item[1],function(){openScoreSettings(item[2],{returnFocus:curve.root.querySelector(':scope > summary')});}));});
        var transpose=els.toolbar.querySelector('.sc-transpose-tools');if(transpose){transpose.id='sc-transpose-menu';transpose.hidden=true;curve.body.appendChild(transpose);}
        q('sc-chord-forms').hidden=true;curve.body.appendChild(q('sc-chord-forms'));divider(curve.body);
        menuLabel('ファイル');curve.body.append(els.newProjectBtn,els.importInput.closest('label'),els.exportBtn,els.printBtn);
        els.importInput.addEventListener('change',function(){curve.root.open=false;});
        var actions=els.toolbar.querySelector('.sheet-toolbar-actions'),primary=group('sc-toolbar-primary'),view=group('sc-toolbar-view');
        actions.prepend(primary,view);
        var playback=group('sc-toolbar-playback'),caption=group('sc-playback-caption');caption.append(q('sc-song-target'),q('sc-song-position'));
        countInEnabled=CS().storage.getAppSetting('scoreCountIn')===true;metronomeEnabled=CS().storage.getAppSetting('scoreMetronome')===true;
        var storedMix=CS().storage.getAppSetting('scorePlaybackMix');Object.keys(playbackMix).forEach(function(key){var value=storedMix?.[key];if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100)playbackMix[key]=value;});
        var playbackSettingsButton=button('sc-playback-settings','再生設定',function(){openPlaybackSettings(playbackSettingsButton);});playbackSettingsButton.setAttribute('aria-haspopup','dialog');playbackSettingsButton.addEventListener('pointerdown',function(e){if(e.button===0)e.preventDefault();});
        playback.append(q('sc-song-preview'),playbackSettingsButton,caption);
        var history=group('sc-toolbar-history'),historyButton=button('sc-history','履歴',function(){openSheetAction('history',historyButton);});historyButton.classList.add('sc-history-toggle');historyButton.setAttribute('aria-haspopup','dialog');history.append(els.undoBtn,els.redoBtn,historyButton);
        primary.append(playback,els.saveBtn,history,els.saveStatus);
        [['sc-undo','↶','元に戻す'],['sc-redo','↷','やり直す']].forEach(function(item){var el=q(item[0]);el.textContent=item[1];el.setAttribute('aria-label',item[2]);el.classList.add('sc-history-icon');});
        var display=menu('sc-display-menu','表示');display.body.appendChild(els.toolbar.querySelector('.sc-paper-visibility'));
        q('sc-score-style').closest('label').hidden=true;q('sc-staff-refresh').hidden=true;els.editorDrawer.append(q('sc-score-style').closest('label'),q('sc-staff-refresh'));
        var grid=els.showGrid.closest('.sheet-display-toggles');if(grid){grid.hidden=true;grid.style.display='none';els.editorDrawer.appendChild(grid);}
        divider(display.body);if(settings){settings.textContent='詳細設定';display.body.appendChild(settings);}view.append(q('sc-zoom-controls'),display.root);
        q('sc-zoom-out').textContent='−';q('sc-zoom-out').setAttribute('aria-label','縮小');q('sc-zoom-out').title='譜面を縮小';
        q('sc-zoom-in').textContent='＋';q('sc-zoom-in').setAttribute('aria-label','拡大');q('sc-zoom-in').title='譜面を拡大';
        var context=els.toolbar.querySelector('.sheet-bar-actions'),label=document.createElement('span'),edit=button('sc-edit-selected','編集',editSelectedBar),more=menu('sc-bar-menu','小節操作');
        context.id='sc-selected-bar-actions';context.classList.add('sc-toolbar-context');label.id='sc-toolbar-selection';label.className='sc-toolbar-selection';context.prepend(label,edit);
        context.querySelectorAll('[data-bar-operation=moveBar]').forEach(function(el){el.textContent=Number(el.dataset.direction)<0?'前へ移動':'後ろへ移動';more.body.appendChild(el);});divider(more.body);more.body.appendChild(context.querySelector('[data-bar-operation=deleteBar]'));
        more.body.appendChild(button('sc-delete-compact','詰めて削除',function(){deleteSelectedBars(false);}));
        more.body.querySelector('[data-bar-operation=deleteBar]').textContent='枠を残して削除';
        more.body.prepend(button('sc-insert-paste','挿入して貼り付け',function(){pasteSelectedBar(true);}));
        context.appendChild(more.root);els.toolbar.appendChild(context);context.hidden=true;
        var gestureHelp=document.createElement('p');gestureHelp.id='sc-score-gesture-help';gestureHelp.className='sc-score-gesture-help';els.toolbar.appendChild(gestureHelp);
        // Keep the visible drawer reachable, with its purpose matching the menu item.
        var drawerLabel=els.editorDrawer.querySelector('.sheet-editor-drawer-label'),drawerHint=els.editorDrawer.querySelector('.sheet-editor-drawer-hint');
        if(drawerLabel)drawerLabel.textContent='曲情報・セクションを編集';if(drawerHint)drawerHint.textContent='曲名・キー・BPM・セクション構成など';
        function menus(){return [curve.root,display.root,more.root];}
        function closeMenu(el){var body=el.querySelector('.sc-toolbar-menu-body');if(body.popover&&body.matches(':popover-open'))body.hidePopover();el.open=false;}
        function closeMenus(except,restore){menus().forEach(function(el){if(el!==except&&el.open){closeMenu(el);if(restore)el.querySelector('summary').focus({preventScroll:true});}});}
        menus().forEach(function(el){
            var popup=el.querySelector('.sc-toolbar-menu-body');if(typeof popup.showPopover==='function')popup.popover='manual';else el.dataset.popupFallback='';
            function place(){var body=el.querySelector('.sc-toolbar-menu-body'),anchor=el.querySelector('summary').getBoundingClientRect(),width=body.offsetWidth||Math.min(250,innerWidth-24),left=Math.max(12,Math.min(anchor.right-width,innerWidth-width-12)),top=anchor.bottom+6;body.style.left=left+'px';body.style.top=top+'px';body.style.maxHeight=Math.max(100,innerHeight-top-12)+'px';}
            el.querySelector('summary').addEventListener('click',function(){closeMenus(el,false);place();});
            el.addEventListener('toggle',function(event){if(event.target!==el)return;if(el.open){if(popup.popover&&!popup.matches(':popover-open'))popup.showPopover();place();}else if(popup.popover&&popup.matches(':popover-open'))popup.hidePopover();});
        });
        window.addEventListener('resize',function(){closeMenus(null,false);});
        window.addEventListener('beforeprint',function(){closeMenus(null,false);});
        window.matchMedia('print').addEventListener('change',function(event){if(event.matches)closeMenus(null,false);});
        document.addEventListener('scroll',function(event){if(!event.target.closest?.('.sc-toolbar-menu-body'))closeMenus(null,false);},true);
        document.addEventListener('click',function(event){if(!els.root.contains(event.target)||!event.target.closest('.sc-toolbar-menu'))closeMenus(null,false);},true);
        els.toolbar.addEventListener('click',function(event){var action=event.target.closest('button'),opened=action?.closest('.sc-toolbar-menu');if(opened&&!action.closest('#sc-zoom-controls')){closeMenu(opened);if(document.activeElement===action||document.activeElement===document.body)opened.querySelector('summary').focus({preventScroll:true});}});
        document.addEventListener('keydown',function(event){if(state.active&&event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog[open]')&&menus().some(function(el){return el.open;})){event.preventDefault();event.stopPropagation();closeMenus(null,true);}},true);
        refreshToolbarActions();
    }
    function refreshCompactScoreToolbar(bar,eligible){
        var context=q('sc-selected-bar-actions');if(!context)return;
        var empty=emptySlotSelection?.owner===state.session;context.hidden=!bar&&!empty;
        var range=selectedRangeNumbers();q('sc-toolbar-selection').textContent=empty?'空き枠（再生なし）':range.length>1?'第'+range[0]+'〜'+range.at(-1)+'小節（'+range.length+'小節選択）':bar?'第'+state.selectedBarNumber+'小節':'';
        var help=q('sc-score-gesture-help');if(help){var text=empty?'この空き枠をもう一度クリックすると、編集を始められます。枠の外側をクリックすると、選択を解除できます。':bar?'選んだ小節は、ドラッグで移動できます。Shiftキーを押しながら別の小節をクリックすると、その間もまとめて選べます。小節の外側をクリックすると、選択を解除できます。':'小節をクリックすると選択できます。複数選ぶには、最初の小節から最後の小節までドラッグします。';if(help.textContent!==text)help.textContent=text;}
        q('sc-edit-selected').disabled=!eligible||(!bar&&!empty)||!editorCanMove();q('sc-insert-paste').disabled=!eligible||(!bar&&!empty)||!barClipboards.has(state.session);q('sc-delete-compact').disabled=!eligible||!bar;['sc-edit-song','sc-edit-instrument','sc-edit-rhythm','sc-edit-sections'].forEach(function(id){q(id).disabled=!eligible;});
        if(!bar)q('sc-bar-menu').open=false;
    }
    function mountPaperLayoutControls(){
        if(!els.toolbar||!CS().localPaperLayout||q('sc-paper-settings'))return;
        var visibility=els.toolbar.querySelector('.sc-paper-visibility'),actions=els.toolbar.querySelector('.sheet-toolbar-actions');
        if(visibility){
            [['showTitle','曲名','sc-show-title'],['showArtist','アーティスト名','sc-show-artist'],['showMeta','曲情報','sc-show-meta'],['showParts','セクション名','sc-show-parts'],['showNumbers','小節番号','sc-show-numbers']].forEach(function(item){var label=document.createElement('label'),input=document.createElement('input');label.className='pd-check';input.type='checkbox';input.id=item[2];input.checked=CS().localPaperLayout.value[item[0]];input.addEventListener('change',function(){if(!editorCanMove()){input.checked=CS().localPaperLayout.value[item[0]];return;}stopPianoAudition();CS().localPaperLayout.set({[item[0]]:input.checked});});label.append(input,document.createTextNode(' '+item[1]));visibility.appendChild(label);});
            ['title','artist','meta','parts','numbers','chords','forms','strum','lyrics','doremi'].forEach(function(name){var input=q('sc-show-'+name);if(input)visibility.appendChild(input.closest('label'));});
            var settings=document.createElement('button');settings.type='button';settings.id='sc-paper-settings';settings.className='btn-ghost btn-compact';settings.textContent='表示設定';settings.title='見本を見ながら小節数・フォーム・文字サイズを調整';settings.addEventListener('click',function(){if(!editorCanMove())return;finishTextInputs();stopPianoAudition();var project=state.session.workingSnapshot();CS().localPaperLayout.open(els.root,{project:project,selectedBarNumber:state.selectedBarNumber||1,getVisibility:function(){return effectivePaperVisibility(project);},getRenderOptions:function(){return paperRenderOptions(project);}});refreshToolbarActions();});var head=els.toolbar.querySelector('.sc-score-toolbar-head')||document.createElement('div');head.className='sc-score-toolbar-head';var projects=els.toolbar.querySelector('.sheet-toolbar-project');els.toolbar.prepend(head);if(projects&&projects.parentElement!==head)head.prepend(projects);head.appendChild(settings);
            CS().localPaperLayout.onChange(function(change){if(change?.structural===false){CS().localPaperLayout.apply(els.scaleBox);updateSheetScale();refreshToolbarActions();}else renderPreview(true);if(state.project)renderDisplayToggles();[['showTitle','title'],['showArtist','artist'],['showMeta','meta'],['showNumbers','numbers'],['showParts','parts']].forEach(function(pair){var name=pair[0],input=q('sc-show-'+pair[1]);if(input)input.checked=CS().localPaperLayout.value[name];});});
        }
        CS().localPaperLayout.apply(els.scaleBox);if(state.session)renderPreview(true);mountCompactScoreToolbar();
    }
    function refreshToolbarActions(){
        if(!els.toolbar)return;var owner=state.session,bars=Array.isArray(owner?.draft.bars)?owner.draft.bars:[],bar=bars[state.selectedBarNumber-1],eligible=!!owner&&owner.draft.schemaVersion===2&&!schemaViewError&&operationEligible()&&!owner.inputPending&&!owner.commitInFlight&&!owner.conflict&&!owner.externalUpdatePending&&!textDiagnostic(owner);
        els.toolbar.querySelectorAll('[data-bar-operation]').forEach(function(b){var kind=b.dataset.barOperation,dir=Number(b.dataset.direction);b.disabled=!eligible||!bar||(kind==='moveBar'&&(state.selectedBarNumber-1+dir<0||state.selectedBarNumber-1+dir>=owner.draft.bars.length));if(!bar)b.title='編集する小節を選択してください';});
        refreshCompactScoreToolbar(bar,eligible);
        var forms=q('sc-chord-forms');if(forms)forms.disabled=!eligible||!bar||!bar.chords.length;
        var blocked=owner?.draft.performance?.formBindings?.some(function(b){return b.mode!=='auto'||!CS().localChordForms;})||bars.some(function(b){return Array.isArray(b.chords)&&b.chords.some(function(c){return c.unresolved;});});
        ['sc-transpose-down','sc-transpose-up'].forEach(function(id){var b=q(id);if(b){b.disabled=!eligible||!!blocked;b.title=blocked?'固定フォームや未解決コードを確認してから移調してください':'全曲の実音を半音移調します。カポは変更しません';}});
        if(els.showForms){els.showForms.disabled=!eligible||staffStyle!=='code'||!CS().localPaperForms;}
        ['sc-show-title','sc-show-artist','sc-show-meta','sc-show-numbers','sc-show-parts','sc-paper-settings'].forEach(function(id){if(q(id))q(id).disabled=!eligible;});
        var single=eligible&&editorCanMove();if(q('sc-copy-bar'))q('sc-copy-bar').disabled=!single||!bar;if(q('sc-paste-bar'))q('sc-paste-bar').disabled=!single||(!bar&&emptySlotSelection?.owner!==owner)||!barClipboards.has(owner);
        ['sc-history','sc-save-as'].forEach(function(id){if(q(id))q(id).disabled=!eligible||(id==='sc-save-as'&&!CS().repository.canWrite());});
        var playbackSettingsButton=q('sc-playback-settings');if(playbackSettingsButton)playbackSettingsButton.disabled=!eligible;
        var staff=q('sc-staff-refresh');if(staff)staff.hidden=true;if(q('sc-save-overwrite'))q('sc-save-overwrite').disabled=!eligible||!owner?.dirty||!owner.canCommit()||!!textDiagnostic(owner)||!!schemaViewError;var play=q('sc-song-preview');if(play)play.disabled=(!eligible||!bars.length)&&!(barPreviewScope==='song'&&barPreviewPhase!=='idle');updateBarPlayButton();
    }
    function fillKeySelect(select) {
        select.innerHTML = '';
        KEY_OPTIONS.forEach(function (key) {
            var opt = document.createElement('option');
            opt.value = key;
            opt.textContent = key;
            select.appendChild(opt);
        });
    }

    /**
     * キー名を KEY_OPTIONS の表記へ寄せる（'C#' → 'Db' 等の異名同音も吸収する）。
     */
    function toOptionKey(keyName) {
        var theory = CS().theory;
        var semi = theory.keyToSemitone(keyName);
        if (semi === null) return null;
        for (var i = 0; i < KEY_OPTIONS.length; i++) {
            if (theory.keyToSemitone(KEY_OPTIONS[i]) === semi) return KEY_OPTIONS[i];
        }
        return null;
    }

    function setSelectKey(select, keyName) {
        select.value = toOptionKey(keyName) || 'C';
    }

    function setSaveStatus(message, isError) {
        if (!els.saveStatus) return;
        els.saveStatus.textContent = message || '';
        els.saveStatus.classList.toggle('is-error', !!isError);els.saveStatus.classList.toggle('sc-status-quiet',!isError);
    }

    function markDirty() {
        refreshSessionStatus();
    }

    /* ══════════ プロジェクト管理 ══════════ */

    function refreshProjectSelect() {
        var storage = CS().storage;
        var projects = storage.listProjects();
        els.projectSelect.innerHTML = '';

        if (!state.project) return;

        CS().sessions.listSessions().filter(function (session) { return session.domain === 'structure'; }).forEach(function (session) {
            if (projects.some(function (meta) { return meta.projectId === session.target.projectId; })) return;
            var draft = document.createElement('option'); draft.value = session.target.projectId;
            draft.textContent = (session.draft.songInfo.title || '無題') + '（未保存）';
            els.projectSelect.appendChild(draft);
        });
        projects.forEach(function (meta) {
            var opt = document.createElement('option');
            opt.value = meta.projectId;
            opt.textContent = meta.title + (meta.artist ? ' / ' + meta.artist : '');
            els.projectSelect.appendChild(opt);
        });
        els.projectSelect.value = state.project.projectId;
    }

    function renderAll() {
        if(!state.project){renderInvalidProject();return;}
        renderForm();
        renderDisplayToggles();
        renderSections();
        renderBarGrid();
        renderPreview();
        refreshProjectSelect();
    }

    function redrawSession(structureChanged) {
        var focused = state.active ? document.activeElement : state.workspaceFocus;
        var local = focused && els.root.contains(focused), selector = null;
        if (local && focused.id) selector = '#' + focused.id;
        else if (local && focused.dataset.sectionId) selector = '.' +
            (focused.classList.contains('section-name-input') ? 'section-name-input' : 'section-bar-count') +
            '[data-section-id="' + window.CSS.escape(focused.dataset.sectionId) + '"]';
        else if (local && !structureChanged && focused.dataset.historyBar) selector = '.' +
            (focused.classList.contains('bar-chord-input') ? 'bar-chord-input' : 'bar-doremi-input') +
            '[data-history-bar="' + focused.dataset.historyBar + '"]';
        else if (local && !structureChanged && focused.classList.contains('dock-lyrics-cell')) selector = '.dock-lyrics-cell[data-slot-tick="' + focused.dataset.slotTick + '"]';
        else if (local && !structureChanged && focused.classList.contains('dock-strum-cell')) selector = '.dock-strum-cell[data-cell-index="' + focused.dataset.cellIndex + '"]';
        else if (local && !structureChanged && focused.dataset.overlayField) selector = '[data-overlay-field="' + focused.dataset.overlayField + '"]'+(focused.dataset.slotTick!==undefined?'[data-slot-tick="'+focused.dataset.slotTick+'"]':'');
        var start = local ? focused.selectionStart : null, end = local ? focused.selectionEnd : null;
        var scroll = CS().scroll ? CS().scroll.getPosition('sheetCruise') : null;
        if (state.selectedBarNumber && !getSelectedBar()) { state.selectedBarNumber = null; selectionDeleted = true; }
        renderAll();
        state.overlayRefreshRequested = false; // Already rebuilt from the current snapshot; keep restored editor DOM.
        var restored = selector ? els.root.querySelector(selector) : null;
        if (restored && !restored.disabled) {
            state.workspaceFocus = restored;
            if (state.active) {
                restored.focus({ preventScroll: true });
                if (start != null && typeof restored.setSelectionRange === 'function') {
                    try { restored.setSelectionRange(start, end); } catch (_) { /* number/select control */ }
                }
            }
        }
        if (scroll && CS().scroll) CS().scroll.restorePosition('sheetCruise', scroll);
    }

    function refreshSessionStatus() {
        refreshHistoryControls();
        var session = state.session;
        if (!session) return;
        var selected = els.projectSelect.selectedOptions[0];
        if (selected && selected.value === session.target.projectId) selected.textContent = (session.draft.songInfo.title || '無題') +
            (session.conflict && session.conflict.deleted ? '（削除・draft保持）' : session.baseRevision === null ? '（新規・未保存）' : session.dirty ? '（未保存）' : '');
        els.saveBtn.disabled = !session.dirty || !session.canCommit() || !!textDiagnostic(session) || !!schemaViewError;
        if(q('sc-save-overwrite'))q('sc-save-overwrite').disabled=els.saveBtn.disabled;
        var adopt = q('sc-adopt-external');
        if (adopt) { adopt.hidden = !session.externalUpdatePending; adopt.disabled = session.commitInFlight || !!(session.conflict && session.conflict.deleted); }
        if (session.conflict && session.conflict.deleted) setSaveStatus('保存対象が削除されました。未保存内容は保持しています。JSONへ書き出せます。', true);
        else if (session.externalUpdatePending) setSaveStatus('保存済みprojectが外部で更新されています。編集中の内容を保持しています。', true);
        else if (session.commitError) setSaveStatus(session.commitError, true);
        else if (textDiagnostic(session)) setSaveStatus(textDiagnostic(session), true);
        else if (schemaViewError) setSaveStatus('入力値に問題があります。譜面の詳細診断を確認してください。', true);
        else if (session.commitInFlight) setSaveStatus('保存中です。追加編集は保持されます');
        else if (!CS().repository.canWrite()) setSaveStatus('この環境では安全な保存を利用できません。JSONへ書き出せます。', true);
        else if (session.getHistory().status === 'overflow') setSaveStatus('編集は反映されましたが、履歴容量を超えたため記録できませんでした', true);
        else setSaveStatus(session.dirty ? '未保存の変更があります' : session.draft.schemaVersion===2 && session.baseRevision && JSON.parse(session.baseRevision).schemaVersion===1 ? '旧形式から変換済み・未保存（明示保存でschema 2へ更新）' : '保存済み');
    }

    function showSession(session, message) {
        cancelRangeSelection();stopPianoAudition();closePaperForm();playbackSettings?.close(false);sheetActions?.close(false);CS().localPaperLayout?.close();
        els.toolbar?.querySelectorAll('.sc-toolbar-menu[open]').forEach(function(menu){menu.open=false;});editorOpen=false;
        finishTextInputs();
        if (state.session) projectViews.set(state.session.sessionId, {
            selectedBarNumber: state.selectedBarNumber, structureIdentity: structureIdentity, loupe: Object.assign({}, state.loupe),
            dockManualRes: state.dockManualRes, overlayWarnings: state.overlayWarnings,
            scroll: CS().scroll ? CS().scroll.getPosition('sheetCruise') : null
        });
        cancelRangeSelection();cancelBarDrag();editorHelp?.close({restoreFocus:false});scoreSettings?.close();emptySlotSelection=null;selectedBarIds = []; rangeAnchor = null;
        state.session = session;
        structureIdentity = CS().structureOperations.structureKey(session.draft);
        publishedBars = session.draft.bars;
        selectionDeleted = false;
        CS().sessions.activateSession(session);
        if (CS().documents) CS().documents.bind(session);
        var view = projectViews.get(session.sessionId);
        var sameStructure = view && view.structureIdentity === structureIdentity;
        state.selectedBarNumber = sameStructure ? view.selectedBarNumber : null;
        state.dockManualRes = sameStructure ? view.dockManualRes : {};
        state.overlayWarnings = sameStructure ? view.overlayWarnings : {};
        if (view) state.loupe = Object.assign({}, view.loupe);
        state.dockBulkOpen = false;
        state.workspaceFocus = null; state.workspaceScroll = view ? view.scroll : null;
        if (CS().storage.getCurrentProjectId() !== session.target.projectId) CS().storage.setCurrentProjectId(session.target.projectId);
        if (CS().shellHost) {
            CS().shellHost.setCommandTarget('editingSession', session);
            CS().shellHost.setCommandTarget('activeDocument', session.target);
        }
        renderAll(); refreshSessionStatus();
        if (message && !session.externalUpdatePending) setSaveStatus(message);
    }

    function setProject(project, options) {
        if (state.session && state.session.inputPending) { setSaveStatus('入力の確定を待ってください', true); return; }
        var target = { type: 'project', projectId: project.projectId };
        var session = CS().sessions.getSession('structure', target);
        if (session && options && options.dirty) {
            if (session.dirty || session.commitInFlight) { setSaveStatus('同じprojectの未保存内容を保持しています。保存または明示cancel後に読み込んでください。', true); return; }
            session.replaceDraft(project);
        }
        if (!session) session = CS().sessions.getOrCreateSession('structure', target, options && options.dirty ? project : undefined);
        showSession(session, options && options.statusMessage);
    }

    function openProject(projectId) {
        if (state.session && state.session.inputPending) { setSaveStatus('入力の確定を待ってください', true); refreshProjectSelect(); return false; }
        try {
            var session = CS().sessions.getOrCreateSession('structure', { type: 'project', projectId: projectId });
            showSession(session); return true;
        } catch (error) { setSaveStatus(error.message, true); refreshProjectSelect(); return false; }
    }

    function createNewProject() {
        var names = new Set(CS().storage.listProjects().map(function(p){return p.title;}));
        CS().sessions.listSessions().forEach(function(s){names.add(s.draft.songInfo.title);});
        var number=1;while(names.has('無題のプロジェクト '+number))number++;
        var project=CS().model.createEmptyProject();project.songInfo.title='無題のプロジェクト '+number;
        if(CS().localChordForms)CS().localChordForms.initialize(project);
        setProject(project, { dirty: true, statusMessage: '新規プロジェクトを作成しました（未保存）' });
        els.editorDrawer.open=false;openScoreSettings('settings',{selectTitle:true});
    }

    var leavePending = null;
    // B-owned continuation contract. Shell must call this before changing workspace.
    function requestLeave(continueAction) {
        if(leavePending || typeof continueAction!=='function')return false;
        var sessions=CS().sessions.listSessions(), owner=state.session, workspace=CS().shellHost.getActiveWorkspace();
        if(sessions.some(function(s){return s.inputPending||s.commitInFlight||s.externalUpdatePending||s.conflict||s.commitError;}) || textDiagnostic(owner)) {
            setSaveStatus('入力・保存結果・競合を解決してから移動してください',true);return false;
        }
        var dirty=sessions.filter(function(s){return s.dirty;});
        if(!dirty.length){continueAction();return true;}
        var modal=CS().shellHost.modal;if(modal.getActive())return false;
        stopPianoAudition();
        var body=document.createElement('div'),message=document.createElement('p'),actions=document.createElement('div');
        actions.style.display='flex';actions.style.flexWrap='wrap';actions.style.gap='12px';actions.style.padding='4px';
        message.style.overflowWrap='anywhere';
        body.style.padding='12px';message.style.margin='0 0 24px';message.style.lineHeight='1.7';actions.style.gap='16px';actions.style.padding='4px';
        message.textContent='未保存のProject: '+dirty.map(function(s){return s.draft.songInfo.title;}).join('、')+'。保存せず続行しても画面内のdraftは保持しますが、ブラウザ終了や再読込で失われる可能性があります。';body.appendChild(message);
        var buttons=[],record={active:true,saving:false};leavePending=record;
        function current(){return record.active&&leavePending===record&&state.session===owner&&CS().shellHost.getActiveWorkspace()===workspace&&CS().entryAuth.isAuthorized();}
        function proceed(){if(!current())return;if(CS().sessions.listSessions().some(function(s){return s.inputPending||s.commitInFlight||s.externalUpdatePending||s.conflict||s.commitError;})){message.textContent='入力・保存結果・競合を解決してください。移動せずdraftを保持しています';return;}modal.close();continueAction();}
        function button(label,fn){var b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;b.style.maxWidth='100%';actions.appendChild(b);buttons.push(b);}
        button('保存して続行',async function(){
            if(!current()||record.saving)return;record.saving=true;buttons.forEach(function(b){b.disabled=true;});
            try {
                for(var session of CS().sessions.listSessions().filter(function(s){return s.dirty;})){
                    if(!current())return;
                    var result=await commitSession(session);
                    if(!result.ok||session.dirty||session.externalUpdatePending||session.conflict)throw Error(result.error||'保存完了を確認できませんでした');
                }
                if(CS().sessions.listSessions().some(function(s){return s.dirty||s.inputPending||s.commitInFlight||s.conflict||s.externalUpdatePending;}))throw Error('保存対象の状態が変わりました');
                proceed();
            }catch(error){if(current())message.textContent=error.message+'。移動せずdraftを保持しています';}
            finally{record.saving=false;buttons.forEach(function(b){b.disabled=false;});}
        });
        button('保存せず続行',function(){if(!record.saving)proceed();});
        button('キャンセル',function(){if(!record.saving)modal.close();});
        body.appendChild(actions);
        modal.open({title:'未保存の変更を確認',content:body,onClose:function(){record.active=false;if(leavePending===record)leavePending=null;}});
        return false;
    }

    /* ══════════ 曲情報フォーム ══════════ */

    function renderForm() {
        var si = state.project.songInfo;
        els.title.value = si.title || '';
        els.artist.value = si.artist || '';
        setSelectKey(els.originalKey, si.originalKey);
        setSelectKey(els.playKey, si.playKey);
        els.capo.value = si.capo;
        els.bpm.value = si.bpm;
        els.timeSig.value = si.timeSignature.beats + '/' + si.timeSignature.beatUnit;
        els.timeSig.title = '現在のschema2は4/4のみ対応しています。拍別データの切捨ては行いません';
        [els.playKey,els.capo].forEach(function(e){e.disabled=state.session.draft.schemaVersion===2;e.title=e.disabled?'schema 2 M1では表示専用です。実音保持・移調の編集導線は次工程です':'';});
        // 基本ストローク: slotsから記号列を再生成して表示（slotsが正。ADR-018）
        var basic=CS().model.getBasicStrumText(state.project);els.basicStrum.disabled=!!(basic&&basic.ok===false);els.basicStrum.value=basic&&basic.ok===false?basic.name+'（採用済み・旧編集非対応）':basic;
        els.basicStrum.classList.remove('is-invalid');
        els.basicStrum.title = '';
        updateKeyCheck();
    }

    function readFormIntoProject() { finishTextInputs(); } // DOM is not the content owner.

    function onFieldChange(event) {
        if (event.target === els.timeSig && state.session.draft.schemaVersion === 2 && els.timeSig.value !== '4/4') {
            els.timeSig.value = '4/4';q('sc-edit-error').textContent = '現在のschema2保存契約は4/4のみです。変更しませんでした';setSaveStatus('現在のschema2保存契約は4/4のみです。拍別データを保持するため変更しませんでした', true);return;
        }
        var result = applyTextInput(event.target, event);
        if (!result.ok || result.deferred) return;
        markDirty(); updateKeyCheck(); renderPreview(true);
    }

    /**
     * 基本ストローク入力（R1）。記号をslotsへ正規化して strumPatterns に保存する。
     * 入力欄の値は打鍵中には書き換えない（次の renderForm 時に正規化表示される）。
     */
    function onBasicStrumInput(event) {
        var res = applyTextInput(els.basicStrum, event);
        if (!res.ok || res.deferred) return;
        els.basicStrum.classList.toggle('is-invalid', res.warnings.length > 0);
        els.basicStrum.title = res.warnings.join(' / ');
        markDirty();
        renderPreview(true);
    }

    /**
     * Playキー + カポ = ORGキー の関係チェック（DATA_MODEL.md 3章）。
     * ズレていても保存は妨げない（例外的な使い方を許容する）。
     */
    function updateKeyCheck() {
        var theory = CS().theory;
        var si = state.project.songInfo;
        var derived = theory.capoToOriginalKey(si.playKey, si.capo);

        if (derived === null) {
            els.keyCheck.textContent = 'キーまたはカポの値を確認してください';
            els.keyCheck.className = 'key-check is-warning';
            return;
        }
        if (theory.isKeyRelationConsistent(si.playKey, si.capo, si.originalKey)) {
            els.keyCheck.textContent = '✓ Playキー ' + si.playKey +
                (si.capo > 0 ? ' + カポ' + si.capo : '') + ' = ORGキー ' + si.originalKey;
            els.keyCheck.className = 'key-check is-ok';
        } else {
            els.keyCheck.textContent = '⚠ Playキー ' + si.playKey + ' + カポ' + si.capo +
                ' は実音 ' + derived + ' になり、ORGキー ' + si.originalKey +
                ' と一致しません（意図した設定ならこのまま保存できます）';
            els.keyCheck.className = 'key-check is-warning';
        }
    }

    /* ══════════ セクション管理 ══════════ */

    function renderSections() {
        var model = CS().model;
        els.sectionList.innerHTML = '';

        state.project.sections.forEach(function (sec) {
            var row = document.createElement('div');
            row.className = 'section-row';

            var nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'section-name-input'; nameInput.dataset.sectionId = sec.id;
            nameInput.value = sec.name;
            nameInput.setAttribute('aria-label', 'セクション名');
            var nameFrame = CS().structureOperations.capture(state.session);
            ['focus', 'input'].forEach(function (kind) { nameInput.addEventListener(kind, function () { nameFrame = CS().structureOperations.capture(state.session); }); });
            nameInput.addEventListener('change', function () {
                if (!nameInput.isConnected || !CS().structureOperations.isCurrent(nameFrame, state.session)) return;
                if (!runStructureOperation('renameSection', { sectionId: sec.id, name: nameInput.value }).ok) return;
                nameInput.value = state.project.sections.filter(function (s) { return s.id === sec.id; })[0].name;
                nameFrame = CS().structureOperations.capture(state.session);
                markDirty();
                renderBarGrid();
                renderPreview();
            });

            var countWrap = document.createElement('label');
            countWrap.className = 'section-bar-count-wrap';
            var countLabel = document.createElement('span');
            countLabel.textContent = '小節';
            var countInput = document.createElement('input');
            countInput.type = 'number';
            countInput.className = 'section-bar-count'; countInput.dataset.sectionId = sec.id;
            countInput.min = '1';
            countInput.max = '64';
            countInput.step = '1';
            countInput.value = model.getSectionBarCount(state.project, sec.id);
            var countFrame = CS().structureOperations.capture(state.session);
            ['focus', 'input'].forEach(function (kind) { countInput.addEventListener(kind, function () { countFrame = CS().structureOperations.capture(state.session); }); });
            countInput.addEventListener('change', function () {
                if (!countInput.isConnected || !CS().structureOperations.isCurrent(countFrame, state.session)) return;
                if (!runStructureOperation('barCount', { sectionId: sec.id, count: parseInt(countInput.value, 10) }).ok) { countInput.value = model.getSectionBarCount(state.project, sec.id); return; }
                countInput.value = model.getSectionBarCount(state.project, sec.id); // クランプ結果を反映
                countFrame = CS().structureOperations.capture(state.session);
                markDirty();
                renderBarGrid();
                renderPreview();
            });
            countWrap.appendChild(countLabel);
            countWrap.appendChild(countInput);

            var deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn-mini btn-danger';
            deleteBtn.textContent = '削除';
            deleteBtn.addEventListener('click', function () {
                var expected = CS().structureOperations.capture(state.session);
                var barCount = model.getSectionBarCount(state.project, sec.id);
                if (!window.confirm('セクション「' + sec.name + '」（' + barCount + '小節）を削除しますか？')) return;
                var res = runStructureOperation('removeSection', { sectionId: sec.id }, expected);
                if (!res.ok) {
                    setSaveStatus(res.error, true);
                    return;
                }
                markDirty();
                renderSections();
                renderBarGrid();
                renderPreview();
            });

            row.appendChild(nameInput);
            row.appendChild(countWrap);
            row.appendChild(deleteBtn);
            els.sectionList.appendChild(row);
        });
    }

    function onAddSection() {
        if (!runStructureOperation('addSection').ok) return;
        markDirty();
        renderSections();
        renderBarGrid();
        renderPreview();
    }

    /* ══════════ 小節グリッド（1小節1コード: ADR-008） ══════════ */

    /**
     * コード入力欄の簡易検証。解釈できない表記は警告表示にするが入力は禁止しない。
     */
    function validateChordInput(input) {
        var theory = CS().theory;
        var value = input.value.trim();
        var invalid = (value !== '' && theory.parseBasicChordSymbol(value) === null);
        input.classList.toggle('is-invalid', invalid);
        input.title = invalid ? '解釈できないコード表記です（このまま保存はできます）' : '';
    }

    function renderBarGrid() {
        var model = CS().model;
        els.barGrid.innerHTML = '';

        state.project.sections.forEach(function (sec) {
            var bars = model.getSectionBars(state.project, sec.id);

            var sectionBlock = document.createElement('div');
            sectionBlock.className = 'bar-grid-section';

            var heading = document.createElement('div');
            heading.className = 'bar-grid-section-head';
            var headName = document.createElement('span');
            headName.className = 'bar-grid-section-name';
            headName.textContent = sec.name;
            var headRange = document.createElement('span');
            headRange.className = 'bar-grid-section-range';
            if (bars.length > 0) {
                headRange.textContent = bars[0].barNumber + '〜' + bars[bars.length - 1].barNumber + '小節';
            }
            heading.appendChild(headName);
            heading.appendChild(headRange);
            sectionBlock.appendChild(heading);

            var cells = document.createElement('div');
            cells.className = 'bar-grid-cells';

            bars.forEach(function (bar) {
                // .bar-cell: コード/歌詞/ドレミの3行構成（将来は拍位置入力へ拡張）
                var cell = document.createElement('div');
                cell.className = 'bar-cell';

                var num = document.createElement('span');
                num.className = 'bar-cell-num';
                num.textContent = bar.barNumber;

                var chordInput = document.createElement('input');
                chordInput.type = 'text';
                chordInput.className = 'bar-chord-input'; chordInput.dataset.historyBar = String(bar.barNumber);
                chordInput.placeholder = 'コード';
                chordInput.setAttribute('aria-label', bar.barNumber + '小節目のコード');
                chordInput.value = (bar.chords[0] && bar.chords[0].symbol) || '';
                validateChordInput(chordInput);
                wireTextControl(chordInput, { kind: 'chord', barNumber: bar.barNumber }, function (event) {
                    var res = applyTextInput(chordInput, event); if (!res.ok || res.deferred) return;
                    validateChordInput(chordInput); markDirty(); renderPreview(true);
                });

                // F2a: 歌詞は小節ルーペのセル編集へ移行。このinputは表示専用（readonly）にし、
                // クリック/フォーカスで該当小節を選択してルーペを開く。setBarLyricsText()への
                // 書き込み経路はここから完全に断つ（readonlyなのでinputイベントは発火しない）。
                var lyricsInput = document.createElement('input');
                lyricsInput.type = 'text';
                lyricsInput.className = 'bar-lyrics-input';
                lyricsInput.placeholder = '歌詞';
                lyricsInput.readOnly = true;
                lyricsInput.title = '歌詞は小節ルーペのセルで編集します';
                lyricsInput.setAttribute('aria-label', bar.barNumber + '小節目の歌詞（読み取り専用。ルーペで編集）');
                lyricsInput.value = CS().model.getBarLyricsText(bar);
                lyricsInput.addEventListener('focus', function () {
                    editorOpen=true;selectSheetBar(bar.barNumber);
                    focusOverlayField('lyrics');
                });

                var doremiInput = document.createElement('input');
                doremiInput.type = 'text';
                doremiInput.className = 'bar-doremi-input'; doremiInput.dataset.historyBar = String(bar.barNumber);
                doremiInput.placeholder = 'ドレミ';
                doremiInput.setAttribute('aria-label', bar.barNumber + '小節目のドレミ');
                doremiInput.value = CS().model.getBarDoremiText(bar);
                wireTextControl(doremiInput, { kind: 'doremi', barNumber: bar.barNumber }, function (event) {
                    var res = applyTextInput(doremiInput, event); if (!res.ok || res.deferred) return;
                    doremiInput.classList.toggle('is-invalid', res.warnings.length > 0);
                    doremiInput.title = res.warnings.join(' / '); markDirty(); renderPreview(true);
                });

                cell.appendChild(num);
                cell.appendChild(chordInput);
                cell.appendChild(lyricsInput);
                cell.appendChild(doremiInput);
                cells.appendChild(cell);
            });

            sectionBlock.appendChild(cells);
            els.barGrid.appendChild(sectionBlock);
        });
    }

    /* ══════════ A4紙面プレビュー（sheet-renderer.js が紙面DOMを構築。ADR-016） ══════════ */

    // Both the paper and its settings preview use the same snapshot and display choices.
    function effectivePaperVisibility(project){var show=CS().sheetRenderer.resolveShowSettings(project?.schemaVersion===2?CS().model.toStructureView(project):project);return {chords:show.chords,strum:show.strum,lyrics:show.lyrics,doremi:show.doremi,forms:!!paperFormSessions.get(state.session),timingGrid:CS().localPaperLayout?.value.timingGrid??show.timingGrid,gridResolution:CS().localPaperLayout?.value.gridResolution??show.gridResolution,...CS().localPaperLayout?.value.appearance.visibility};}
    function paperRenderOptions(project){
        var forms=effectivePaperVisibility(project).forms&&CS().localPaperForms?.view(project,{scale:CS().localPaperLayout?.value.formScale});
        var resolutions=new Map(state.project.bars.map(function(bar){return [bar.barNumber,getStrumGridResolution(bar)];}));
        return {editableSlots:true,hasFormsForBar:forms?forms.has:null,formsForBar:forms?forms.row:null,...CS().localPaperLayout?.renderOptions(project),
            resolutionForBar:function(bar){return Math.max(resolutions.get(bar.barNumber),CS().localPaperLayout?.value.gridResolution||0);},
            heldForNote:function(number,tick){var e=project.bars[number-1]?.melody.find(function(e){return e.onsetTick===tick;});return e?.provenance.timing.onset.origin==='auto-assigned'&&e?.provenance.timing.duration.origin==='user-set';},
            restsForBar:function(number){return project.bars[number-1]?.melody.filter(function(e){return e.kind==='rest';})||[];},
            octaveForNote:function(number,tick){return project.bars[number-1]?.melody.find(function(e){return e.onsetTick===tick&&e.kind==='note';})?.pitch.octave;}};
    }

    function renderPreview(preserveInputs) {
        cancelBarDrag();closePaperForm();
        if(!state.project){renderInvalidProject();return;}
        state.overlayRefreshRequested = false;
        if(historyPreview&&(historyPreview.owner!==state.session||historyPreview.version!==state.session.snapshotVersion))historyPreview=null;
        els.scaleBox.toggleAttribute('data-history-preview',!!historyPreview);
        if (staffStyle === 'melody'&&!historyPreview) staffRequest();
        else {var project=historyPreview?.project||state.session.workingSnapshot();CS().sheetRenderer.render(project,els.scaleBox,paperRenderOptions(project));}
        els.scaleBox.querySelectorAll('[data-paper-edit]').forEach(function(el){if(el.dataset.paperEdit){el.tabIndex=0;el.setAttribute('role','button');el.title='クリックして編集';}});
        CS().localPaperLayout?.apply(els.scaleBox);
        updateSheetScale();
        syncSheetSelection(preserveInputs);
        if(preserveInputs&&!historyPreview){refreshPiano();refreshChordPicker();}
        refreshToolbarActions();
        // The current input DOM has just been published above. A later frame only
        // adjusts geometry; rebuilding again could detach the next typing/click target.
        scheduleOverlayPosition(false);
    }

    /**
     * A4紙面（794px幅）をプレビューペインの幅に合わせて縮小表示する。
     * transform はレイアウト寸法に影響しないため、ビューポートの高さはJSで確保する。
     */
    var sheetZoom=1;
    // B-owned editor styling; no Studio Shell/public stylesheet changes.
    function mountEditorStyles(){
        if(document.getElementById('sc-editor-interaction-style'))return;
        var style=document.createElement('style');style.id='sc-editor-interaction-style';
        style.textContent=`

#screen-sheet-cruise .sc-score-toolbar-head{padding-right:52px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;flex-basis:100%;width:100%;}
#screen-sheet-cruise .sc-score-toolbar-head .sheet-toolbar-project{margin-right:auto;}
#screen-sheet-cruise .sc-score-toolbar-head>#sc-paper-settings{margin-left:auto;}
#screen-sheet-cruise .sc-paper-visibility{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;margin:10px 0 0;padding:10px 0 0;border-top:1px solid var(--studio-border-default);}
#screen-sheet-cruise .sc-paper-visibility label{display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;}
#screen-sheet-cruise .sc-paper-visibility input{width:16px;height:16px;accent-color:var(--studio-accent);}
#sc-sheet-scale-box .sheet-bar-forms{position:relative;margin:0 calc(-1 * var(--sheet-bar-pad-x));overflow:hidden;min-height:0;}
/* Safari can size an aspect-ratio wrapper taller than its SVG. Center the intrinsic image height. */
#sc-sheet-scale-box .sheet-form-event{position:absolute;transform:translateY(-50%);height:auto;aspect-ratio:auto;display:block;overflow:hidden;cursor:zoom-in;}
#sc-sheet-scale-box .sheet-form-event svg{display:block;width:100%;height:auto;}
#sc-sheet-scale-box .sheet-bar-num{min-height:24px;}
#sc-sheet-scale-box [data-edit-selected-bar]{position:absolute;right:6px;top:4px;z-index:6;border:1px solid #8c7949;border-radius:6px;padding:4px 9px;background:#fffcf3;color:#544626;font:600 11px sans-serif;cursor:pointer;}
#sc-sheet-scale-box .sheet-chord-event{cursor:default;}
.sc-form-dialog{position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);margin:0;width:min(300px,calc(100vw - 40px));max-height:85vh;padding:14px;border:1px solid #8e98a4;border-radius:14px;background:#fff;color:#171b20;box-shadow:0 20px 60px #0006;}
.sc-form-dialog .sc-form-empty-hit{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;padding:0;border:0;background:transparent;border-radius:50%;cursor:crosshair;}.sc-form-dialog .sc-form-empty-hit:hover,.sc-form-dialog .sc-form-empty-hit:focus-visible{outline:2px solid #6b8199;background:#e7ecf288;}
.sc-form-dialog::backdrop{background:#10182066;}
.sc-form-actions{display:flex;gap:6px;}.sc-form-dialog .sc-form-touch{padding-left:0;}.sc-form-dialog .sc-form-mute-hit{position:absolute;transform:translate(-50%,-50%);background:white;border:0;padding:0;font-size:26px;width:30px;height:30px;line-height:1;}.sc-form-dialog footer[hidden],.sc-form-dialog .sc-form-hint[hidden]{display:none;}
#screen-sheet-cruise .sc-playback-dialog .sc-playback-option{display:flex;gap:8px;margin:12px 0;white-space:normal;}.sc-form-dialog footer:has([data-form-apply]){justify-content:flex-end;}
.sc-playback-title-group{display:flex;align-items:center;gap:8px;}.sc-playback-dialog .sc-playback-help-toggle{width:25px;height:25px;line-height:1;padding:0;border-radius:50%;font-size:14px;}#sc-playback-help[hidden]{display:none;}#sc-playback-help{font-size:13px;padding:12px;border:1px solid var(--studio-border-default);border-radius:8px;}#sc-playback-help ul{padding-left:18px;margin:0;}#sc-playback-help li{margin:6px 0;}
.sc-actions-dialog{box-sizing:border-box;position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);margin:0;width:min(460px,calc(100vw - 24px));max-height:85dvh;overflow:auto;padding:20px;border:1px solid var(--studio-border-default);border-radius:14px;background:var(--studio-panel);color:var(--studio-text-primary);font:14px/1.6 sans-serif;}.sc-actions-dialog::backdrop{background:#10182066;}.sc-actions-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px;}.sc-actions-dialog h2{font-size:20px;margin:0;}.sc-actions-dialog button,.sc-actions-dialog input{font:inherit;padding:7px 10px;border:1px solid var(--studio-border-default);border-radius:6px;background:var(--studio-control);color:inherit;}.sc-actions-dialog p{font-size:12px;color:var(--studio-text-secondary);}.sc-actions-dialog label{display:flex;flex-direction:column;gap:6px;}.sc-actions-dialog [data-save-as-apply]{margin-top:12px;background:var(--studio-accent);color:#171b20;}.sc-history-list{list-style:none;margin:12px 0 0;padding:0;}.sc-history-list button{width:100%;display:flex;justify-content:space-between;gap:10px;text-align:left;border:0;border-radius:5px;cursor:pointer;}.sc-history-list button:hover{background:var(--studio-control-hover);}.sc-history-list button[aria-current=step]{color:var(--studio-accent);background:var(--studio-control);}.sc-history-list small{white-space:nowrap;color:var(--studio-text-secondary);}
.sc-history-dialog{width:min(350px,calc(100vw - 24px));max-height:75dvh;}.sc-history-dialog::backdrop{background:transparent;}.sc-history-dialog header{position:sticky;top:0;z-index:2;background:var(--studio-panel);cursor:move;touch-action:none;user-select:none;}.sc-history-dialog header:focus-visible{outline:2px solid var(--studio-accent);outline-offset:3px;}.sc-history-dialog footer{position:sticky;bottom:0;background:var(--studio-panel);padding:8px 0;display:flex;justify-content:flex-end;gap:8px;margin-top:16px;}.sc-history-dialog [data-history-apply]{background:var(--studio-accent);color:#171b20;}.sc-history-dialog [data-history-apply]:disabled{opacity:.4;}.sc-history-dialog [data-history-warning]{color:var(--studio-warning);}.sc-history-list button[aria-pressed=true]{outline:2px solid var(--studio-accent);outline-offset:-2px;}#sc-sheet-scale-box[data-history-preview] [data-edit-selected-bar]{display:none;}#screen-sheet-cruise:has(#sc-sheet-scale-box[data-history-preview]) #sc-slot-overlay{visibility:hidden;pointer-events:none;}

#screen-sheet-cruise #sc-history{font-size:11px;padding:5px 7px;min-width:0;border-color:transparent;color:var(--studio-text-secondary);background:transparent;}#screen-sheet-cruise #sc-save:disabled{background:var(--studio-control);color:var(--studio-text-secondary);border-color:var(--studio-border-default);opacity:.6;}
#screen-sheet-cruise #sc-song-target,#screen-sheet-cruise .sc-status-quiet{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip-path:inset(50%);white-space:nowrap;}#screen-sheet-cruise .sc-playback-caption{width:auto;}#screen-sheet-cruise .sc-playback-caption:has(#sc-song-position:empty){display:contents;}
@media print{.sc-actions-dialog,.sc-actions-dialog::backdrop{display:none!important;}}

.sc-form-dialog{box-sizing:border-box;width:min(360px,calc(100vw - 24px));overflow:auto;}
.sc-form-touch{position:relative;padding-left:32px;}.sc-form-board{position:relative;}.sc-form-string,.sc-form-finger-hit{position:absolute;transform:translate(-50%,-50%);min-width:28px;min-height:28px;box-sizing:border-box;}
.sc-form-dialog .sc-form-string{left:14px;padding:0;width:26px;height:26px;font-size:18px;border:0;color:#52616a;background:#f1f3f4;}.sc-form-dialog .sc-form-string[aria-pressed=false]{color:#9c3434;background:#fff2ee;}.sc-form-dialog .sc-form-string:disabled{opacity:.5;cursor:default;}
.sc-form-dialog .sc-form-finger-hit{padding:0;width:30px;height:30px;border:0;border-radius:50%;background:transparent;}.sc-form-finger-hit:hover,.sc-form-finger-hit:focus-visible{outline:2px solid #4095c9;outline-offset:1px;}
.sc-form-hint{font:12px/1.6 sans-serif;color:#52616a;margin:8px 0;}.sc-form-palette{display:flex;align-items:center;flex-wrap:wrap;gap:5px;font:12px sans-serif;}.sc-form-palette[hidden]{display:none;}.sc-form-dialog .sc-form-palette button{padding:5px 8px;}.sc-form-palette button[aria-pressed=true]{background:#e0f2ff;}.sc-form-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid #e4e7e9;margin-top:12px;padding-top:12px;}.sc-form-dialog footer small{font:11px/1.5 sans-serif;color:#52616a;}.sc-form-dialog [data-form-apply]{white-space:nowrap;background:#e2c67d;border-color:#c4aa60;}.sc-form-dialog [data-form-apply]:disabled{opacity:.5;cursor:default;}
.sc-playback-dialog{box-sizing:border-box;position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);margin:0;width:min(420px,calc(100vw - 24px));max-height:90dvh;overflow:auto;padding:20px;border:1px solid var(--studio-border-default);border-radius:14px;background:var(--studio-panel);color:var(--studio-text-primary);font:14px/1.6 sans-serif;}
.sc-playback-dialog::backdrop{background:#10182066;}.sc-playback-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px;}.sc-playback-dialog h2{font-size:20px;margin:0;}.sc-playback-dialog h3{font-size:14px;margin:0 0 8px;color:var(--studio-accent);}.sc-playback-dialog section{margin-top:20px;}.sc-playback-dialog button{font:inherit;padding:6px 12px;border:1px solid var(--studio-border-default);border-radius:7px;background:var(--studio-control);color:inherit;cursor:pointer;}.sc-playback-note{font-size:11px;color:var(--studio-text-secondary);margin:6px 0;}.sc-volume-row{display:block;margin:12px 0;}.sc-volume-row>span{display:flex;justify-content:space-between;gap:8px;}.sc-volume-row input{display:block;box-sizing:border-box;width:100%;margin:7px 0;accent-color:var(--studio-accent);}.sc-playback-dialog .sc-playback-reset{font-size:11px;padding:4px 8px;}.sc-playback-dialog .sc-playback-option{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0;}.sc-playback-dialog .sc-playback-option small{flex-basis:100%;padding-left:24px;color:var(--studio-text-secondary);font-size:11px;}.sc-playback-dialog input[type=checkbox]{accent-color:var(--studio-accent);width:16px;height:16px;margin:0;}.sc-playback-dialog [data-playback-settings-notice]{font-size:12px;color:#e9b8ac;}
@media print{.sc-playback-dialog,.sc-playback-dialog::backdrop{display:none!important;}}

.sc-form-dialog header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:6px;}
.sc-form-dialog h2{margin:0;font-size:24px;}
.sc-form-dialog button{border:1px solid #a0a7ae;border-radius:7px;background:white;color:#273440;padding:6px 12px;cursor:pointer;}
.sc-form-dialog svg{display:block;width:100%;height:auto;max-height:65vh;}
@media print{[data-edit-selected-bar],.sc-form-dialog{display:none!important;}#sc-sheet-scale-box .sheet-bar-num{min-height:0;}}
#sc-slot-overlay {--editor-label-width:max(82px,calc(82px * var(--bar-loupe-scale,1)));--editor-label-offset:calc(var(--editor-label-width) + 8px * var(--bar-loupe-scale,1));--editor-min-cell:max(18px,calc(24px * var(--bar-loupe-scale,1)));gap:calc(6px * var(--bar-loupe-scale,1));padding:calc(8px * var(--bar-loupe-scale,1)) calc(20px * var(--bar-loupe-scale,1)) calc(16px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-head {gap:calc(14px * var(--bar-loupe-scale,1));padding-bottom:calc(6px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-head-main,#sc-slot-overlay .slot-overlay-head-actions {gap:calc(8px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-section {font-size:calc(11px * var(--bar-loupe-scale,1));padding:calc(2px * var(--bar-loupe-scale,1)) calc(10px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-nav {gap:calc(4px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-nav-btn,#sc-slot-overlay .slot-overlay-res-btn,#sc-slot-overlay .slot-overlay-reset-btn,#sc-slot-overlay .slot-overlay-bulk-toggle {font-size:calc(12px * var(--bar-loupe-scale,1));padding:calc(5px * var(--bar-loupe-scale,1)) calc(10px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-nav-btn {min-width:calc(56px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-hint,#sc-slot-overlay .slot-overlay-row-label {font-size:calc(10.5px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-close {font-size:calc(13px * var(--bar-loupe-scale,1));width:calc(26px * var(--bar-loupe-scale,1));height:calc(26px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-ruler,#sc-slot-overlay .slot-overlay-row {gap:calc(8px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-ruler-label,#sc-slot-overlay .slot-overlay-row-label {flex-basis:var(--editor-label-width);}
#sc-slot-overlay .slot-overlay-ruler {min-height:calc(16px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-ruler-cell {font-size:calc(9.5px * var(--bar-loupe-scale,1));padding-left:calc(2px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-ruler-cell.is-offbeat-dot::after {width:calc(3px * var(--bar-loupe-scale,1));height:calc(3px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-grid {gap:calc(3px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-head,#sc-slot-overlay .slot-overlay-ruler,#sc-slot-overlay .slot-overlay-grid,#sc-slot-overlay .strum-state-legend {flex-shrink:0;}
#sc-slot-overlay .dock-lyrics-beat-cells {padding-bottom:0;min-height:calc(42px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-row--lyrics .dock-lyrics-beat-cells,#sc-slot-overlay .slot-overlay-row--doremi .dock-lyrics-beat-cells {min-height:calc(46px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .dock-lyrics-beat-cells > input,#sc-slot-overlay .dock-lyrics-beat-cells > button {height:100%;}
#sc-slot-overlay .dock-strum-cell.is-rest {color:#746e65;}
#sc-slot-overlay .solfege-cell {position:relative;display:grid;min-width:0;}
#sc-slot-overlay .solfege-cell input {height:100%;}
#sc-slot-overlay .solfege-cell:not(:focus-within) input:not(.is-invalid) {color:transparent!important;}
#sc-slot-overlay .solfege-colors {position:absolute;z-index:2;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;white-space:nowrap;overflow:hidden;font-size:max(11px,calc(13px * var(--bar-loupe-scale,1)));font-weight:600;}
#sc-slot-overlay .solfege-cell:focus-within .solfege-colors {visibility:hidden;}
#sc-slot-overlay .solfege-cell.piano-color-mode input {color:transparent!important;caret-color:transparent;}
#sc-slot-overlay .solfege-cell.piano-color-mode:focus-within .solfege-colors {visibility:visible;}
#sc-sheet-scale-box .sheet-bar-strum{column-gap:0;margin:0 calc(-1 * var(--sheet-bar-pad-x));padding:3px 0 0;border-radius:0;background:transparent;box-shadow:none;}
#sc-sheet-scale-box .sheet-bar-strum>span:not([data-playback-band]){border-radius:0;background:transparent;box-shadow:none;}
@media print{#sc-sheet-scale-box .sheet-bar-strum,#sc-sheet-scale-box .sheet-bar-strum>span{background:transparent!important;box-shadow:none!important;}}
#sc-sheet-scale-box .sheet-section-label{cursor:pointer;}
#sc-sheet-scale-box .sheet-section-label.is-selected-section{background:#e7ecf2;outline:2px solid #6b8199;outline-offset:3px;}
@media print{#sc-sheet-scale-box .sheet-section-label.is-selected-section{background:transparent;outline:none;}}
#sc-slot-overlay .slot-overlay-grid {position:relative;overflow:visible;}
#sc-slot-overlay .editor-score-scroll{overflow-y:hidden;}

#sc-slot-overlay .slot-overlay-row-body,#sc-sheet-scale-box .sheet-bar-row{position:relative;overflow:hidden;}
#sc-slot-overlay [data-playback-band],#sc-sheet-scale-box [data-playback-band]{position:absolute;top:0;bottom:0;pointer-events:none;z-index:3;background:rgba(91,116,143,.19);box-shadow:inset 0 0 0 1px rgba(66,89,115,.5);will-change:left;}
@media print{[data-playback-band]{display:none!important;}}
#sc-slot-overlay .sc-playing-cell,#sc-sheet-scale-box .sc-playing-cell {box-shadow:inset 0 0 0 2px #6b8199!important;background-color:#e7ecf2!important;}
#sc-slot-overlay .solfege-colors .sc-playing-note {background:#cfd9e5;border-radius:3px;}
#sc-sheet-scale-box{--paper-selection-bg:rgba(91,116,143,.19);--paper-selection-border:rgba(66,89,115,.5);--paper-selection-number:#344b66;--paper-selection-shadow-edge:rgba(66,89,115,.12);--paper-focus:#6b8199;}
#sc-sheet-scale-box .sheet-bar.sc-playing-bar{background:var(--paper-selection-bg);box-shadow:inset 0 0 0 2px var(--paper-selection-border),0 0 0 1px var(--paper-selection-shadow-edge);}
#sc-sheet-scale-box.sc-score-playing .sheet-bar{transition:none;}
#sc-sheet-scale-box.sc-score-playing .sheet-bar:focus-visible{outline:none;}
#sc-sheet-scale-box.sc-score-playing:not(.sc-range-playing) .sheet-bar.is-selected:not(.sc-playing-bar){background:transparent;box-shadow:none;}
#sc-sheet-scale-box.sc-score-playing:not(.sc-range-playing) .sheet-bar.is-selected:not(.sc-playing-bar) .sheet-bar-num{color:var(--paper-faint);font-weight:400;}
#sc-sheet-scale-box .sheet-bar.sc-playing-bar .sheet-bar-num{color:var(--paper-selection-number);font-weight:800;}
#sc-sheet-scale-box.sc-score-playing [data-edit-selected-bar]{display:none;}
@media print{#sc-sheet-scale-box .sheet-bar.sc-playing-bar{background:transparent!important;box-shadow:none!important}}
#sc-slot-overlay [data-score-playhead],#sc-sheet-scale-box [data-score-playhead] {position:absolute;top:0;bottom:0;width:2px;background:#344b66;z-index:4;pointer-events:none;}
@media print {[data-score-playhead]{display:none!important}.sc-playing-cell{box-shadow:none!important;background-color:transparent!important}.sc-playing-note{background:transparent!important}}
#screen-sheet-cruise .sheet-tool-launchers[hidden],#sc-staff-refresh[hidden],#sc-goto-pre-dtm[hidden]{display:none!important;}
#sc-song-position{font-size:12px;color:#a5b2c1;min-width:6em;}
#screen-sheet-cruise .sheet-bar-actions{gap:8px;}
#screen-sheet-cruise .sheet-bar-actions button,#screen-sheet-cruise .sc-transpose-tools button{padding:8px 12px;font:inherit;font-size:12px;white-space:nowrap;}
#screen-sheet-cruise .sc-transpose-tools{display:inline-flex;font-size:12px;align-items:center;gap:8px;}
#screen-sheet-cruise .sc-transpose-tools summary{cursor:pointer;padding:8px;}
#screen-sheet-cruise .sc-transpose-tools:not([open]) button{display:none;}
#sc-slot-overlay .slot-overlay-head-actions{flex-wrap:wrap;}
#sc-slot-overlay .slot-overlay-head-actions>*{flex-shrink:0;}
#sc-slot-overlay [data-active-resolution]{display:flex;}
#sc-slot-overlay [data-editor-placement]{margin-left:auto;}
#sc-slot-overlay .slot-overlay-head-actions{width:100%;}
#sc-slot-overlay .editor-size-tabs{display:inline-flex;}
#sc-slot-overlay .editor-score-scroll{min-width:0;overflow-x:auto;flex-shrink:0;}
#sc-slot-overlay .editor-measures{display:grid;grid-template-columns:minmax(0,1fr);gap:0;min-width:calc(var(--editor-label-offset) + 16 * var(--editor-min-cell) + 2px);}
#sc-slot-overlay .editor-measures[data-count="2"]{min-width:calc(var(--editor-label-offset) + 32 * var(--editor-min-cell) + 4px);grid-template-columns:calc(50% + var(--editor-label-offset) / 2) minmax(0,1fr);}
#sc-slot-overlay .editor-measure{min-width:0;border:0;padding:0;border-radius:0;}
#sc-slot-overlay .editor-measure:nth-child(2) .slot-overlay-row-label,#sc-slot-overlay .editor-measure:nth-child(2) .slot-overlay-ruler-label{display:none;}
#sc-slot-overlay .editor-measures[data-count="2"] .editor-measure:first-child .slot-overlay-row-body{border-top-right-radius:0;border-bottom-right-radius:0;border-right-width:2px;}
#sc-slot-overlay .editor-measures[data-count="2"] .editor-measure:nth-child(2) .slot-overlay-row-body{border-top-left-radius:0;border-bottom-left-radius:0;border-left:0;}
#sc-slot-overlay .editor-measures[data-count="2"] .editor-measure:first-child :is(.dock-strum-grid,.dock-lyrics-grid){border-top-right-radius:0;border-bottom-right-radius:0;}
#sc-slot-overlay .editor-measures[data-count="2"] .editor-measure:nth-child(2) :is(.dock-strum-grid,.dock-lyrics-grid){border-top-left-radius:0;border-bottom-left-radius:0;}
#sc-slot-overlay .slot-overlay-row-label{font-size:max(10px,calc(10.5px * var(--bar-loupe-scale,1)));white-space:nowrap;justify-content:space-between;gap:3px;}
#sc-slot-overlay .editor-row-tools{position:absolute;right:0;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;}
#sc-slot-overlay .slot-overlay-row-label{position:relative;}
#sc-slot-overlay .editor-row-tools .editor-row-fold{height:max(16px,calc(18px * var(--bar-loupe-scale,1)));}
#sc-slot-overlay .editor-row-disclosure{line-height:1;}
#sc-slot-overlay .editor-row-disclosure{font:inherit;font-size:max(11px,calc(11px * var(--bar-loupe-scale,1)))!important;padding:1px 3px!important;border:0!important;border-radius:3px!important;background:transparent!important;color:#435b81!important;text-decoration:none!important;cursor:pointer;}
#sc-slot-overlay .editor-row-disclosure[aria-expanded=true]{background:#dfe7f0!important;}
#sc-slot-overlay .score-owner-chord-picker{box-sizing:border-box;position:relative;z-index:auto;min-width:0;width:calc(100% - var(--editor-label-offset));max-width:calc(100% - var(--editor-label-offset));margin:0 0 8px var(--editor-label-offset);padding:18px;flex-shrink:0;}
#sc-slot-overlay .slot-overlay-grid:has(.score-owner-chord-picker) > [data-score-playhead]{display:none;}
#sc-slot-overlay .score-chord-picker{position:relative;z-index:5;margin:0 0 8px var(--editor-label-offset);padding:12px;background:#f8faff;color:var(--slot-text);border:1px solid #9baac2;border-radius:8px;flex-shrink:0;}
#sc-slot-overlay input.chord-selected-cell{box-shadow:inset 0 0 0 2px #6b8199!important;background:#e7ecf2!important;}
#sc-slot-overlay .score-chord-picker:empty,[data-chord-picker][hidden]{display:none!important;}
#sc-slot-overlay .score-chord-controls,#sc-slot-overlay .score-chord-choices,#sc-slot-overlay .score-chord-builder{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
#sc-slot-overlay .score-chord-picker label{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:max(11px,calc(12px * var(--bar-loupe-scale,1)));}
#sc-slot-overlay .score-chord-picker button,#sc-slot-overlay .score-chord-picker select,#sc-slot-overlay .score-chord-picker input:not([type=checkbox]){font:inherit;font-size:max(11px,calc(12px * var(--bar-loupe-scale,1)));color:var(--slot-text);padding:6px 9px;border:1px solid var(--slot-border);border-radius:6px;background:white;max-width:100%;}
#sc-slot-overlay .score-chord-picker input[type=number]{width:55px;}
#sc-slot-overlay .score-chord-picker button[aria-pressed=true]{background:#e0e8f1;border-color:#6b8199;}
#sc-slot-overlay .score-chord-picker button:disabled{opacity:.45;}
#sc-slot-overlay .score-chord-picker fieldset{display:flex;gap:9px;flex-wrap:wrap;border:1px solid var(--slot-border);padding:8px;}
#sc-slot-overlay .score-chord-picker p{font-size:max(11px,calc(12px * var(--bar-loupe-scale,1)));margin:8px 0;}
#sc-slot-overlay .score-chord-forms{border-top:1px solid var(--slot-border);padding-top:10px;}
#sc-slot-overlay .score-chord-fretboard{overflow-x:auto;}
#sc-slot-overlay .score-chord-fretboard svg{display:block;min-width:480px;width:100%;max-height:200px;}
#sc-slot-overlay .editor-row-fold{font:inherit;font-size:max(10px,calc(11px * var(--bar-loupe-scale,1)));width:max(18px,calc(18px * var(--bar-loupe-scale,1)));height:max(20px,calc(20px * var(--bar-loupe-scale,1)));padding:0;border:1px solid var(--slot-border);border-radius:4px;background:var(--slot-input-surface);color:var(--slot-muted);cursor:pointer;flex-shrink:0;}
#sc-slot-overlay .slot-overlay-row.is-collapsed{height:max(22px,calc(22px * var(--bar-loupe-scale,1)));min-height:0;}
#sc-slot-overlay .slot-overlay-row-body[hidden],#sc-slot-overlay .doremi-piano[hidden]{display:none!important;}

#sc-slot-overlay.editor-right{position:relative!important;top:auto!important;left:auto!important;margin:0;width:100%;max-width:100%;min-width:0;z-index:auto;box-sizing:border-box;max-height:none!important;}
#sc-slot-overlay.editor-right .slot-overlay-head{cursor:default;flex-wrap:wrap;gap:6px;}
#sc-slot-overlay.editor-right .slot-overlay-head-actions{flex:1 1 100%;}
#sc-slot-overlay.editor-right .slot-overlay-resize-handle{display:none;}
#sc-slot-overlay.editor-right .editor-measures[data-count="2"]{min-width:calc(var(--editor-label-offset) + 16 * var(--editor-min-cell) + 2px);grid-template-columns:minmax(0,1fr);gap:12px;}
#sc-slot-overlay.editor-right .editor-measure:nth-child(2) .slot-overlay-row-label{display:flex;}
#sc-slot-overlay.editor-right .editor-measure:nth-child(2) .slot-overlay-ruler-label{display:block;}
#sc-slot-overlay.editor-right .editor-measures[data-count] .editor-measure .slot-overlay-row-body{border-radius:6px;border-left-width:1px;border-right-width:1px;}
#sc-slot-overlay.editor-right .editor-measures[data-count] .editor-measure :is(.dock-strum-grid,.dock-lyrics-grid){border-radius:8px;}

#sc-slot-overlay.editor-right .piano-keys{min-width:420px;}
#sc-slot-overlay.editor-right .piano-keys button{font-size:10px;}
#sc-slot-overlay .slot-overlay-head {position:sticky;top:0;z-index:5;background:var(--slot-surface);padding-right:0;padding-left:calc(34px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-close{position:absolute;left:0;right:auto;top:0;}
#sc-slot-overlay .doremi-piano {margin:calc(-6px * var(--bar-loupe-scale,1)) 0 0 var(--editor-label-offset);padding:calc(3px * var(--bar-loupe-scale,1)) calc(10px * var(--bar-loupe-scale,1)) calc(10px * var(--bar-loupe-scale,1));background:var(--slot-input-surface);border:1px solid var(--slot-border);border-radius:0 0 8px 8px;flex-shrink:0;border-color:#9baac2;background:#f8faff;}
#sc-slot-overlay .doremi-piano.is-collapsed{padding:0;border:0;background:transparent;border-radius:0;}
#sc-slot-overlay .doremi-piano.is-collapsed .piano-heading{display:flex!important;min-height:0;margin:0;}
#sc-slot-overlay.piano-open .slot-overlay-row--doremi .slot-overlay-row-body {border-color:#9baac2;border-radius:6px 6px 0 0;}
#sc-slot-overlay .doremi-piano button,#sc-slot-overlay .doremi-piano select {font:inherit;font-size:max(11px,calc(12px * var(--bar-loupe-scale,1)));padding:calc(6px * var(--bar-loupe-scale,1)) calc(10px * var(--bar-loupe-scale,1));border:1px solid var(--slot-border);border-radius:6px;background:white;color:var(--slot-text);}
#sc-slot-overlay .doremi-piano button[aria-pressed=true] {background:#f3dfb9;border-color:#947444;box-shadow:inset 0 0 0 1px #947444;}
#sc-slot-overlay .doremi-piano button:disabled {opacity:.45;}
#sc-slot-overlay .piano-controls,#sc-slot-overlay .piano-heading {display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0;}
#sc-slot-overlay .piano-heading{display:grid!important;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);min-height:34px;}
#sc-slot-overlay .piano-octave-controls{display:inline-flex;align-items:stretch;gap:0;flex-wrap:nowrap;border:1px solid var(--slot-border);border-radius:6px;overflow:hidden;}
#sc-slot-overlay .piano-octave-controls output{display:flex;align-items:center;justify-content:center;min-width:40px;padding:0 5px;font-size:max(11px,calc(12px * var(--bar-loupe-scale,1)));background:white;}
#sc-slot-overlay .piano-octave-controls button{border:0;border-radius:0;min-width:30px;}

#sc-slot-overlay .piano-heading-left{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;}
#sc-slot-overlay .piano-heading .piano-melody-center{justify-self:center;}#sc-slot-overlay .piano-heading [data-piano-close]{justify-self:end;width:auto;min-height:28px;font-size:12px;padding:4px 10px;}
#sc-slot-overlay .doremi-piano{container-type:inline-size;}
@container(max-width:340px){
#sc-slot-overlay .piano-heading{grid-template-columns:minmax(0,1fr) minmax(0,1fr);}
#sc-slot-overlay .piano-heading-left{display:contents;}
#sc-slot-overlay .piano-heading .piano-octave-controls{grid-column:1;grid-row:1;justify-self:start;}
#sc-slot-overlay .piano-heading .piano-melody-center{grid-column:1/-1;grid-row:2;}#sc-slot-overlay .piano-heading [data-piano-close]{grid-column:2;grid-row:1;}
#sc-slot-overlay .piano-heading>span:last-child{display:none;}
}
@container(max-width:220px){
#sc-slot-overlay .piano-heading{grid-template-columns:minmax(0,1fr) auto;}
#sc-slot-overlay .piano-heading .piano-octave-controls{grid-column:1;grid-row:1;justify-self:start;}
#sc-slot-overlay .piano-heading .piano-melody-center{grid-column:1/-1;grid-row:2;}
}
#sc-slot-overlay .piano-range-edges{display:flex;justify-content:space-between;margin-top:6px;}
#sc-slot-overlay .piano-heading strong {font-size:max(12px,calc(13px * var(--bar-loupe-scale,1)));color:#435ca0;}
#sc-slot-overlay .piano-heading .piano-target {flex:1;margin:0;}
#sc-slot-overlay .piano-spacer {flex:1;}
#sc-slot-overlay .piano-selected-cell {outline:2px solid #7a8da9;outline-offset:-2px;background:#f5f8ff;}
#sc-slot-overlay.piano-open .solfege-colors [data-piano-event] {pointer-events:auto;cursor:pointer;border-radius:3px;line-height:1.25;}
#sc-slot-overlay.piano-open .solfege-colors [data-piano-event]:hover {background:#e7edf8;}
#sc-slot-overlay .solfege-colors .piano-selected-note {background:#f8e4bc;outline:1px solid #947444;outline-offset:2px;}
#sc-slot-overlay .piano-pending-note {border:1px dashed #947444;border-radius:3px;padding:1px 5px;background:#fff4dc;color:#755421;}
#sc-slot-overlay .piano-credit {font-size:max(8px,calc(9px * var(--bar-loupe-scale,1)));color:var(--slot-muted);display:block;margin-top:5px;}
#sc-slot-overlay .piano-palette {display:flex;align-items:center;flex-wrap:wrap;gap:calc(8px * var(--bar-loupe-scale,1));margin:8px 0;}
#sc-slot-overlay .piano-palette label {display:flex;gap:3px;align-items:center;font-size:max(10px,calc(11px * var(--bar-loupe-scale,1)));}
#sc-slot-overlay .piano-palette input {width:max(20px,calc(24px * var(--bar-loupe-scale,1)));height:max(20px,calc(24px * var(--bar-loupe-scale,1)));padding:0;border:1px solid var(--slot-border);}
#sc-slot-overlay [data-piano-action] {min-width:34px;min-height:30px;display:inline-flex;align-items:center;justify-content:center;font-size:max(15px,calc(17px * var(--bar-loupe-scale,1)));}
#sc-slot-overlay .piano-key-scroll {overflow-x:auto;min-width:0;}
#sc-slot-overlay .piano-target,#sc-slot-overlay .piano-help {font-size:max(10px,calc(11px * var(--bar-loupe-scale,1)));color:var(--slot-muted);line-height:1.6;margin:8px 0;}
#sc-slot-overlay .piano-keys {display:grid;position:relative;min-width:660px;height:max(100px,calc(108px * var(--bar-loupe-scale,1)));margin-top:8px;}
#sc-slot-overlay .piano-keys button {border-radius:0 0 5px 5px;min-width:0;padding:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;line-height:1.3;}
#sc-slot-overlay .piano-keys small {font-size:.7em;}
#sc-slot-overlay .piano-keys .piano-white {padding-bottom:8px;font-weight:700;}
#sc-slot-overlay .piano-keys .piano-black {position:absolute;top:0;width:7%;height:58%;background:#303b44;color:white;z-index:1;padding-bottom:5px;}
#sc-slot-overlay .piano-keys .piano-black[aria-pressed=true] {background:#806432;color:white;}
#sc-slot-overlay .piano-keys .piano-black span {font-size:.7em;}
#sc-slot-overlay .dock-lyrics-beat-res-btn {width:calc(24px * var(--bar-loupe-scale,1));min-height:calc(12px * var(--bar-loupe-scale,1));font-size:calc(8px * var(--bar-loupe-scale,1));gap:calc(1.5px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .dock-lyrics-beat-res-btn.is-local::before {width:calc(6.5px * var(--bar-loupe-scale,1));height:calc(6.5px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .dock-strum-grid.is-inherited {opacity:1;}
#sc-slot-overlay .strum-state-legend {font-size:calc(10px * var(--bar-loupe-scale,1));color:var(--slot-muted);margin:calc(4px * var(--bar-loupe-scale,1)) 0 0;}
#sc-slot-overlay .dock-lyrics-grid {background:var(--slot-input-surface);}

#sc-slot-overlay .dock-lyrics-cell.has-content {background:transparent;}
#sc-slot-overlay .dock-lyrics-cell.is-composing {background:rgba(74,101,126,.30);}
#sc-slot-overlay .dock-lyrics-cell:focus {background:var(--slot-input-surface);}
#sc-slot-overlay .slot-overlay-row-note {font-size:calc(10px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-resize-handle {width:calc(24px * var(--bar-loupe-scale,1));height:calc(24px * var(--bar-loupe-scale,1));}
#screen-sheet-cruise>.workspace-local-nav{top:0;}
#screen-sheet-cruise:has(.sc-compact-toolbar) #sc-editor-drawer:not([open]){display:none;}
#screen-sheet-cruise .sc-compact-toolbar{gap:10px;overflow:visible;top:52px;}
/* Native popovers raise only the menu, leaving the movable editor unobstructed. */
#screen-sheet-cruise .sc-compact-toolbar:has(.sc-toolbar-menu[data-popup-fallback][open]){z-index:45;}
#screen-sheet-cruise .sc-compact-toolbar .sc-score-toolbar-head{gap:8px;padding-right:44px;}
#screen-sheet-cruise .sc-compact-toolbar .sheet-toolbar-project{flex:1 1 240px;max-width:440px;min-width:0;}
#screen-sheet-cruise .sc-compact-toolbar .sheet-toolbar-project select{width:100%;font-size:14px;}
#screen-sheet-cruise .sc-toolbar-head-actions,#screen-sheet-cruise .sc-toolbar-primary,#screen-sheet-cruise .sc-toolbar-view{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0;}
#screen-sheet-cruise .sc-toolbar-head-actions{margin-left:auto;}
#screen-sheet-cruise .sc-compact-toolbar .sheet-toolbar-actions{flex:1 1 100%;width:100%;justify-content:space-between;overflow:visible;padding:0;gap:8px;}
#screen-sheet-cruise .sc-toolbar-primary{flex:1 1 280px;}
#screen-sheet-cruise .sc-toolbar-history{display:flex;align-items:center;gap:8px;}
#screen-sheet-cruise .sc-toolbar-playback{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;}
#screen-sheet-cruise .sc-playback-option{display:inline-flex;align-items:center;gap:5px;font:12px/1.4 sans-serif;white-space:nowrap;margin:0;}
#screen-sheet-cruise .sc-playback-option input{width:16px;height:16px;accent-color:var(--studio-accent);}
#screen-sheet-cruise .sc-playback-caption{display:flex;flex-direction:column;justify-content:center;width:160px;min-width:0;max-width:calc(100vw - 120px);line-height:1.4;}
#screen-sheet-cruise #sc-song-target{font-size:12px;color:var(--studio-text-secondary);overflow-wrap:anywhere;}
#screen-sheet-cruise #sc-song-position{font-size:11px;min-width:0;overflow-wrap:anywhere;}
#screen-sheet-cruise #sc-song-position:empty{display:none;}
.sc-bar-drop-marker{position:fixed;z-index:4000;width:4px;pointer-events:none;background:#3d8fce;border-radius:2px;box-shadow:0 0 0 1px #fff;}.sc-bar-drop-marker[hidden]{display:none!important;}.sc-bar-drop-marker::before,.sc-bar-drop-marker::after{content:"";position:absolute;left:-3px;width:10px;height:4px;background:#3d8fce;border-radius:2px;}.sc-bar-drop-marker::before{top:0;}.sc-bar-drop-marker::after{bottom:0;}.sc-bar-drop-label{position:fixed;box-sizing:border-box;max-width:min(240px,calc(100vw - 16px));padding:4px 8px;border-radius:5px;background:#246b9d;color:#fff;font:600 12px/1.5 sans-serif;box-shadow:0 2px 6px #0003;}#sc-sheet-scale-box .sc-bar-drag-source{opacity:.55;}@media print{.sc-bar-drop-marker{display:none!important;}#sc-sheet-scale-box .sc-bar-drag-source{opacity:1;}}
#screen-sheet-cruise .sc-score-gesture-help{margin:2px 0 0;min-height:17px;color:var(--studio-text-secondary);font-size:11px;line-height:17px;}

#screen-sheet-cruise .sc-toolbar-view{margin-left:auto;}
#sc-display-menu #sc-zoom-controls{display:flex;align-items:center;gap:6px;padding:4px 0;}#sc-display-menu #sc-zoom-controls button{width:auto;flex:1;padding:6px 8px;min-width:0;}#screen-sheet-cruise .sc-toolbar-menu .sc-menu-label{display:block;padding:5px 10px;font-size:11px;color:var(--studio-text-secondary);}
#screen-sheet-cruise .sc-compact-toolbar .save-status{flex:0 1 auto;min-width:0;text-align:left;overflow-wrap:anywhere;}
#screen-sheet-cruise .sc-compact-toolbar #sc-edit-error:not(:empty){flex:1 1 100%;}
#screen-sheet-cruise .sc-compact-toolbar .sc-history-icon{min-width:36px;padding:6px;font-size:21px;line-height:1;}
#screen-sheet-cruise .sc-toolbar-menu{position:relative;min-width:0;}
#screen-sheet-cruise .sc-toolbar-menu>summary{list-style:none;display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;min-height:36px;border:1px solid var(--studio-border-default);border-radius:8px;background:var(--studio-control);color:var(--studio-text-primary);font-size:13px;box-sizing:border-box;}
#screen-sheet-cruise .sc-toolbar-menu>summary::after{content:'▾';font-size:11px;}
#screen-sheet-cruise .sc-toolbar-menu>summary::-webkit-details-marker{display:none;}
#screen-sheet-cruise .sc-toolbar-menu>summary:hover{background:var(--studio-control-hover);}
#screen-sheet-cruise .sc-toolbar-menu>summary:focus-visible{outline:2px solid var(--studio-focus);outline-offset:2px;}
#screen-sheet-cruise .sc-toolbar-menu-body{position:fixed;inset:auto;margin:0;z-index:60;box-sizing:border-box;width:250px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow-y:auto;overscroll-behavior:contain;padding:8px;background:var(--studio-panel);color:var(--studio-text-primary);border:1px solid var(--studio-border-default);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);}
#screen-sheet-cruise .sc-toolbar-menu:not([open])>.sc-toolbar-menu-body{display:none;}
#screen-sheet-cruise .sc-toolbar-menu-body>button,#screen-sheet-cruise .sc-toolbar-menu-body>.file-label{display:flex;align-items:center;width:100%;margin:0;padding:9px 10px;text-align:left;border:0;border-radius:5px;font-size:13px;box-sizing:border-box;background:transparent;color:var(--studio-text-primary);}
#screen-sheet-cruise .sc-toolbar-menu-body>button:hover,#screen-sheet-cruise .sc-toolbar-menu-body>.file-label:hover{background:var(--studio-control-hover);}
#screen-sheet-cruise .sc-toolbar-menu-body hr{border:0;border-top:1px solid var(--studio-border-default);margin:6px 0;}
#screen-sheet-cruise .sc-toolbar-menu .sc-paper-visibility{display:flex;flex-direction:column;align-items:stretch;gap:0;margin:0;padding:0;border:0;}
#screen-sheet-cruise .sc-toolbar-menu .sc-paper-visibility label{padding:6px 10px;}
#screen-sheet-cruise .sc-toolbar-menu button:disabled{opacity:.45;cursor:default;}
#screen-sheet-cruise .sc-toolbar-menu .staff-style-label{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 10px;font-size:12px;}
#screen-sheet-cruise .sc-toolbar-menu .staff-style-label select{max-width:100%;}
#screen-sheet-cruise .sc-toolbar-menu .sc-transpose-tools{display:block;font-size:13px;}
#screen-sheet-cruise .sc-toolbar-menu .sc-transpose-tools summary{padding:9px 10px;}
#screen-sheet-cruise .sc-toolbar-menu .sc-transpose-tools button{margin:2px 4px;max-width:calc(100% - 8px);}
#screen-sheet-cruise .sc-toolbar-context{display:flex;align-items:center;flex-wrap:wrap;gap:8px;flex:1 1 100%;width:100%;margin:0;padding-top:10px;border-top:1px solid var(--studio-border-default);}
#screen-sheet-cruise .sc-toolbar-context[hidden]{display:none;}
#screen-sheet-cruise .sc-toolbar-selection{color:var(--studio-text-secondary);font-size:12px;}
#screen-sheet-cruise #sc-bar-menu [data-bar-operation=deleteBar]{color:var(--studio-danger,var(--studio-text-primary));}
#screen-sheet-cruise .sc-compact-toolbar #sc-zoom-controls{gap:2px!important;}
#screen-sheet-cruise .sc-compact-toolbar #sc-zoom-controls button{padding:8px 11px;min-width:38px;min-height:38px;}#screen-sheet-cruise #sc-zoom-reset{min-width:58px;}#screen-sheet-cruise .sc-toolbar-view{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}#screen-sheet-cruise #sc-zoom-controls{display:flex;gap:4px;align-items:center;}
@media(max-width:600px){
#screen-sheet-cruise .sc-compact-toolbar .sc-score-toolbar-head{padding-right:38px;}
#screen-sheet-cruise .sc-compact-toolbar .sheet-toolbar-project{flex-basis:100%;max-width:100%;}
#screen-sheet-cruise .sc-toolbar-head-actions{margin-left:0;}
#screen-sheet-cruise .sc-toolbar-primary{flex-basis:100%;}
#screen-sheet-cruise .sc-toolbar-view{margin-left:0;}
#screen-sheet-cruise .sc-toolbar-context{gap:6px;}
}
@media print{#screen-sheet-cruise .sc-toolbar-menu-body{display:none!important;}}
@media(pointer:coarse){#screen-sheet-cruise .sc-compact-toolbar button,#screen-sheet-cruise .sc-toolbar-menu>summary,#screen-sheet-cruise .sc-toolbar-menu label{min-height:44px;}}
#sc-sheet-scale-box [data-paper-edit]:not([data-paper-edit=""]){cursor:text;border-radius:3px;}
#sc-sheet-scale-box [data-paper-edit=instrument],#sc-sheet-scale-box [data-paper-edit=rhythm]{cursor:pointer;}
#sc-sheet-scale-box [data-paper-edit]:hover{outline:1px dashed #8c9da9;outline-offset:2px;}
#sc-sheet-scale-box .sheet-section-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;}
#sc-sheet-scale-box .sheet-section-heading .sheet-section-label{flex:1;}
#sc-sheet-scale-box .sheet-section-play{font:11px sans-serif;padding:4px 8px;border:1px solid #bbb5aa;border-radius:5px;background:transparent;color:#665e54;cursor:pointer;}
.sc-paper-layout.sc-hide-parts .sheet-section-heading{display:none!important;}
#sc-sheet-scale-box [data-editable-empty]{pointer-events:auto;cursor:pointer;min-height:80px;}
#sc-sheet-scale-box [data-editable-empty].is-selected{outline:2px solid #83a7c7;outline-offset:-2px;}
#sc-sheet-scale-box .sheet-artist--empty .sheet-artist-separator{display:none;}
.sc-compact-toolbar.sc-range-selecting{box-sizing:border-box;height:var(--sc-range-toolbar-height);}
.sc-compact-toolbar.sc-range-selecting #sc-selected-bar-actions{position:absolute;visibility:hidden;pointer-events:none;}
#sc-sheet-scale-box.sc-range-selecting{user-select:none;cursor:crosshair;}
#sc-sheet-scale-box .sheet-artist--empty{opacity:.5;font-size:12px;}
.sc-layout-example-paper .sheet-artist--empty{display:none;}
#sc-slot-overlay .editor-help-trigger{border-radius:50%!important;min-width:32px!important;padding:6px!important;font-weight:700!important;}
.sc-song-dialog{position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);margin:0;width:min(580px,calc(100vw - 24px));max-height:88dvh;overflow:auto;box-sizing:border-box;padding:20px;border:1px solid var(--studio-border-default);border-radius:14px;background:var(--studio-panel);color:var(--studio-text-primary);font:14px/1.5 sans-serif;}
.sc-song-dialog::backdrop{background:rgba(0,0,0,.45);}
.sc-song-dialog header,.sc-song-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.sc-song-dialog h2{font-size:19px;margin:0;}.sc-song-dialog header{margin-bottom:14px;}.sc-song-dialog footer{justify-content:flex-end;margin-top:14px;}
.sc-song-dialog button,.sc-song-dialog input,.sc-song-dialog select{font:inherit;box-sizing:border-box;padding:8px 10px;border:1px solid var(--studio-border-default);border-radius:7px;background:var(--studio-control);color:var(--studio-text-primary);max-width:100%;}
.sc-song-dialog label{display:flex;flex-direction:column;gap:5px;margin:10px 0;}.sc-song-dialog input:not([type=checkbox]){width:100%;}
.sc-song-dialog label:has(input[type=checkbox]){flex-direction:row;align-items:flex-start;}
.sc-song-dialog [role=status]{color:var(--studio-danger);font-size:12px;white-space:pre-line;}
.sc-song-dialog p{font-size:12px;color:var(--studio-text-secondary);}
.sc-song-dialog .sc-key-comparison{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;}.sc-key-comparison th,.sc-key-comparison td{text-align:left;padding:8px 4px;border-bottom:1px solid var(--studio-border-default);}.sc-key-comparison td:last-child{font-weight:700;color:var(--studio-accent);}.sc-song-dialog details>summary{cursor:pointer;font-size:12px;}
.sc-song-dialog .sc-song-section-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:7px 0;border-bottom:1px solid var(--studio-border-default);}
.sc-song-dialog .sc-song-section-row label{flex:1 1 180px;min-width:0;margin:0;}.sc-song-section-row label>span{display:none;}
#sc-slot-overlay .sc-form-performance{margin:8px 0;padding:10px;border-top:1px solid #bac1c7;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;}
#sc-slot-overlay .sc-form-performance label{display:inline-flex;gap:3px;align-items:center;}
#sc-slot-overlay .sc-form-performance input{width:16px;height:16px;}
@media print{.sc-song-dialog,.sheet-section-play,.sheet-artist--empty{display:none!important;}#sc-sheet-scale-box [data-paper-edit]:hover{outline:none;}}
`;
        document.head.appendChild(style);
    }
    function mountSheetZoom(){
        var controls=document.createElement('div');controls.id='sc-zoom-controls';controls.style.display='flex';controls.style.gap='8px';controls.style.alignItems='center';
        function button(id,label,change){var b=document.createElement('button');b.type='button';b.id=id;b.className='btn-ghost btn-compact';b.textContent=label;b.onclick=function(){sheetZoom=change(sheetZoom);updateSheetScale();};controls.appendChild(b);return b;}
        button('sc-zoom-out','縮小 −',function(z){return Math.max(.5,z-.25);});
        button('sc-zoom-reset','100%',function(){return 1;}).title='画面幅に合わせた表示へ戻す';
        button('sc-zoom-in','拡大 ＋',function(z){return Math.min(2,z+.25);});
        (els.toolbar.querySelector('.sheet-toolbar-actions')||els.toolbar).appendChild(controls);
        mountCompactScoreToolbar();
    }
    function updateSheetScale() {
        if (!els.preview || !els.scaleBox) return;
        // Measure the containing pane, not our already zoomed viewport.
        var pane = els.preview.parentElement;
        var available = pane.clientWidth;
        if (!available) return;
        if(window.matchMedia('print').matches)return;
        var scale = Math.min(1, available / 794)*sheetZoom;
        pane.style.overflowX='auto';
        els.preview.style.width=Math.ceil(794*scale)+'px';
        els.preview.style.maxWidth='none';
        els.preview.style.flexShrink='0';
        var label=q('sc-zoom-reset');if(label)label.textContent=Math.round(sheetZoom*100)+'%';
        if(q('sc-zoom-out'))q('sc-zoom-out').disabled=sheetZoom<=.5;
        if(q('sc-zoom-in'))q('sc-zoom-in').disabled=sheetZoom>=2;
        els.scaleBox.style.transform = 'scale(' + scale + ')';
        els.preview.style.height = Math.ceil(els.scaleBox.offsetHeight * scale) + 'px';
        positionSlotOverlay();
    }

    /* ══════════ S1b/S1c: A4紙面上の小節選択と編集overlay ══════════ */

    function getSheetBarByNumber(barNumber) {
        if (!els.scaleBox || !barNumber) return null;
        return els.scaleBox.querySelector('.sheet-bar[data-bar-number="' + barNumber + '"]');
    }

    function getSelectedBar() {
        if (!state.project || !state.selectedBarNumber) return null;
        return state.project.bars.filter(function (bar) {
            return bar.barNumber === state.selectedBarNumber;
        })[0] || null;
    }

    /**
     * D2: ドックヘッダーに表示するセクション名（分かる場合のみ）。
     */
    function getBarSectionName(bar) {
        if (!bar || !state.project || !Array.isArray(state.project.sections)) return '';
        var sec = state.project.sections.filter(function (s) { return s.id === bar.sectionId; })[0];
        return sec ? sec.name : '';
    }

    /**
     * D2: ドックの「閉じる」ボタン。選択解除してドックを閉じる
     * （紙面の小節を再クリックすれば同じ小節がまた選択され、ドックも再表示される）。
     */
    function deselectBar() {
        stopPianoAudition();finishTextInputs();editorOpen=false;
        state.selectedBarNumber=null;selectedBarIds=[];rangeAnchor=null;sectionPlaybackSelection=null;emptySlotSelection=null;editorAnchorId=null;
        selectionDeleted=false;state.overlayWarnings={};state.overlayBulkMessage=null;
        syncSheetSelection();updateBarPlayButton();
    }

    function getOverlayFieldValue(rowId, bar) {
        if (rowId === 'chord') return (bar.chords[0] && bar.chords[0].symbol) || '';
        if (rowId === 'doremi') return CS().model.getBarDoremiText(bar);
        return '';
    }

    function getOverlayPlaceholder(rowId) {
        if (rowId === 'chord') return 'コードを入力';
        if (rowId === 'doremi') return 'ドレミを入力';
        return '';
    }

    function getOverlayNote(rowId) {
        var warnings = state.overlayWarnings[rowId] || [];
        if (warnings.length > 0) return { text: warnings.join(' / '), tone: 'warning' };
        return null;
    }

    function buildOverlayNote(rowId, bar) {
        var noteInfo = getOverlayNote(rowId, bar);
        if (!noteInfo) return null;
        var note = document.createElement('span');
        note.className = 'slot-overlay-row-note slot-overlay-row-note--' + noteInfo.tone;
        note.textContent = noteInfo.text;
        return note;
    }

    function captureOverlayFocus(rowId, input) {
        var active = document.activeElement;
        if (!input || active !== input) return null;
        return {
            frame: contentFrame(),
            rowId: rowId,
            value: input.value,
            selectionStart: typeof input.selectionStart === 'number' ? input.selectionStart : null,
            selectionEnd: typeof input.selectionEnd === 'number' ? input.selectionEnd : null
        };
    }

    function restoreOverlayFocus(snapshot) {
        if (!snapshot || !currentFrame(snapshot.frame) || !els.slotOverlay) return;
        var field = editorRoot().querySelector('[data-overlay-field="' + snapshot.rowId + '"]');
        if (!field) return;
        field.focus({ preventScroll: true });
        if (field.value !== snapshot.value) field.value = snapshot.value;
        if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
            try {
                field.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
            } catch (_) {
                // テキスト入力以外に拡張された場合の保険。
            }
        }
    }

    function restoreOverlayFocusAfterRender(snapshot) {
        restoreOverlayFocus(snapshot);
        queueEditorFrame(function () {
            restoreOverlayFocus(snapshot);
        });
    }

    function syncBarGridInput(rowId, barNumber, value, warnings) {
        if (rowId === 'strum') return;
        var className = rowId === 'chord' ? 'bar-chord-input' :
            (rowId === 'lyrics' ? 'bar-lyrics-input' : 'bar-doremi-input');
        var labelText = rowId === 'chord' ? 'コード' :
            (rowId === 'lyrics' ? '歌詞' : 'ドレミ');
        // F2aで旧グリッドの歌詞inputのaria-labelへ「（読み取り専用。ルーペで編集）」を
        // 追記した際、ここが完全一致セレクタのままだったため歌詞だけ同期が効かなくなっていた
        // 既存不具合（G2aの検証中に発見）。前方一致にして両方に対応する。
        var input = els.barGrid && els.barGrid.querySelector(
            '.' + className + '[aria-label^="' + barNumber + '小節目の' + labelText + '"]'
        );
        if (!input) return;
        input.value = value;
        if (rowId === 'chord') {
            validateChordInput(input);
        } else if (rowId === 'doremi') {
            input.classList.toggle('is-invalid', !!(warnings && warnings.length));
            input.title = (warnings || []).join(' / ');
        }
    }

    function applyOverlayFieldChange(rowId, input, options) {
        var bar = getSelectedBar();
        if (!bar || !input) return;
        var isComposing = options && options.composing;
        var skipRender = options && options.skipRender;
        var warnings = [];
        var applied = applyTextInput(input, options && options.event);
        if (!applied.ok || applied.deferred) return;

        if (rowId === 'chord') {
            validateChordInput(input);
            state.overlayWarnings[rowId] = input.classList.contains('is-invalid') ?
                [input.title] : [];
        } else if (rowId === 'doremi') {
            warnings = applied.warnings;
            state.overlayWarnings[rowId] = warnings;
            input.classList.toggle('is-invalid', warnings.length > 0);
            input.title = warnings.join(' / ');
        } else {
            return;
        }

        markDirty();
        syncBarGridInput(rowId, bar.barNumber, input.value, warnings);
        if (isComposing || skipRender) return;

        renderPreview(true);
    }

    function buildOverlayInput(rowDef, bar) {
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'slot-overlay-input';
        input.placeholder = getOverlayPlaceholder(rowDef.id, bar);
        input.value = getOverlayFieldValue(rowDef.id, bar);
        input.dataset.overlayField = rowDef.id;
        input.setAttribute('aria-label', bar.barNumber + '小節目の' + rowDef.label);
        if (rowDef.id === 'chord') {
            validateChordInput(input);
        } else if (rowDef.id === 'doremi') {
            var warnings = state.overlayWarnings[rowDef.id] || [];
            input.classList.toggle('is-invalid', warnings.length > 0);
            input.title = warnings.join(' / ');
        }

        wireTextControl(input, { kind: rowDef.id, barNumber: bar.barNumber }, function (event) {
            applyOverlayFieldChange(rowDef.id, input, { event: event });
        });
        input.addEventListener('keydown', function (event) {
            if (routeLocalSave(event) || routeLocalEscape(event)) return;
            event.stopPropagation();
            if (event.isComposing || state.overlayComposingRowId === rowDef.id) return;
            if (event.key === 'Enter') {
                event.preventDefault();
                var info=textControls.get(input);
                if(event.keyCode===229 || (info&&info.justComposed) || CS().shellHost.keyboard.isIMEBlocked({}) || input.classList.contains('is-invalid'))return;
                var result=applyTextInput(input,event);
                if(!result.ok||result.deferred||input.getAttribute('aria-invalid')==='true')return;
                moveSelectedBar(1,{focusRowId:rowDef.id});return;
            }
            if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
            event.preventDefault();
            applyOverlayFieldChange(rowDef.id, input, { skipRender: true });
            moveSelectedBar(event.key === 'ArrowLeft' ? -1 : 1, { focusRowId: rowDef.id });
        });
        input.addEventListener('click', function (event) {
            event.stopPropagation();
        });
        input.addEventListener('mousedown', function (event) {
            event.stopPropagation();
        });
        return input;
    }

    function editorCellRanges(bar,globalRes,rowId){
        var beats=getBeats(state.project),beatTicks=CS().model.getBarLengthTicks(state.project)/beats,ranges=[];
        for(var beat=0;beat<beats;beat++){
            var res=getLyricBeatEffectiveRes(bar,globalRes,beat,rowId==='doremi'?'lyrics':rowId);
            var count=res/beats,span=beatTicks/count;
            for(var slot=0;slot<count;slot++)ranges.push({tick:beat*beatTicks+slot*span,span:span,beat:beat,slot:slot,count:count,res:res});
        }
        ranges.forEach(function(r,i){r.previousTick=i?ranges[i-1].tick:null;});
        return ranges;
    }

    function editorBeatGroups(wrap,bar,globalRes,rowId,ranges){
        wrap.classList.add('beat-groups');
        var groups=[];
        for(var beat=0;beat<getBeats(state.project);beat++){
            var group=document.createElement('div');group.className='beat-group dock-lyrics-beat-group';group.dataset.beatIndex=beat;
            var cells=document.createElement('div');cells.className='dock-lyrics-beat-cells';
            cells.style.gridTemplateColumns='repeat('+ranges.filter(function(r){return r.beat===beat;}).length+',minmax(0,1fr))';
            group.appendChild(cells);
            if(rowId!=='doremi')group.appendChild(buildLyricBeatResButton(bar,beat,globalRes,rowId));
            wrap.appendChild(group);groups.push(cells);
        }
        return groups;
    }

    function cellDoremiText(events,span,project){
        var unit=events.length===1?events[0].durationTicks:span;function gcd(a,b){while(b){var r=a%b;a=b;b=r;}return a;}events.forEach(function(e){unit=gcd(unit,e.durationTicks);});
        return events.filter(function(e){return e.kind==='note';}).map(function(e){var held=e.provenance.timing.onset.origin==='auto-assigned'&&e.provenance.timing.duration.origin==='user-set';return pianoToken(e.pitch,project)+(e.durationTicks<=span?'〜'.repeat(Math.min(16,Math.max(held?1:0,e.durationTicks/unit-1))):'');}).join('');
    }
    function pitchCellGroup(events,tick){return events.length>0&&events[0].onsetTick===tick&&events.every(function(e){return e.kind==='note';});}
    function autoCellGroup(events,tick,span){
        var end=tick;
        return events.length>0&&events.every(function(e){var valid=e.kind==='note'&&e.onsetTick===end&&e.provenance.timing.onset.origin==='auto-assigned'&&e.provenance.timing.duration.origin==='auto-assigned'&&!e.provenance.timing.onset.confirmed&&!e.provenance.timing.duration.confirmed;end=e.onsetTick+e.durationTicks;return valid;})&&end===tick+span;
    }
    // UI selection only. Notes, timing, history and persistence remain Session-owned.
    var typingOctaves=new WeakMap();
    function typingOctave(owner){return typingOctaves.has(owner)?typingOctaves.get(owner):owner.draft.solfege.tonic.octave;}
    var piano={open:false,owner:null,barId:null,tick:0,span:240,eventId:null,adding:false,octave:3,sound:true,colorsOpen:false,message:''};
    // Short pitch audition only; all contexts/leases belong to the existing coordinator.
    function createPianoAudition(options){
        var audio=options.coordinator,handle=null,context=null,voice=null,lease=null,epoch=0,idleTimer=null,endTimer=null,pumpTimer=null,error=null,failed=false,mode=null;
        var contexts=new Set(),closing=new Map(),mixBuses=new Map(),mix={chords:100,melody:100,metronome:100};
        function setMix(value){Object.keys(mix).forEach(function(key){var n=value?.[key];mix[key]=typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100?n:100;});mixBuses.forEach(function(buses,ctx){Object.keys(buses).forEach(function(key){var param=buses[key].gain;if(param.setTargetAtTime)param.setTargetAtTime(mix[key]/100,ctx.currentTime,.015);else param.setValueAtTime(mix[key]/100,ctx.currentTime);});});}
        function outputFor(ctx,part){var key=part==='piano'?'melody':['click','count'].includes(part)?'metronome':'chords',buses=mixBuses.get(ctx);if(!buses){buses={};mixBuses.set(ctx,buses);}if(!buses[key]){var gain=ctx.createGain();gain.gain.setValueAtTime(mix[key]/100,ctx.currentTime);gain.connect(ctx.destination);buses[key]=gain;}return buses[key];}
        setMix(options.mix);
        function notify(phase){try{if(options.onState)options.onState(phase,mode);}catch(_){}}
        function register(){if(!handle)handle=audio.register({sessionId:'studio.sheet.solfege-audition',ownerFeatureId:'sheetCruise',cleanup:cleanup,notify:function(){void stop();}});}
        function silence(){if(!voice)return;var old=voice;voice=null;old.nodes.forEach(function(n){n.osc.onended=null;try{n.osc.stop();}catch(_){}try{n.osc.disconnect();n.gain.disconnect();}catch(_){}});}
        function cancelTimers(){if(idleTimer!==null)options.clearTimer(idleTimer);if(endTimer!==null)options.clearTimer(endTimer);if(pumpTimer!==null)options.clearTimer(pumpTimer);idleTimer=endTimer=pumpTimer=null;}
        function closeContext(ctx){
            if(closing.has(ctx))return closing.get(ctx);
            if(context===ctx)context=null;var buses=mixBuses.get(ctx);if(buses){Object.values(buses).forEach(function(bus){try{bus.disconnect();}catch(_){}});mixBuses.delete(ctx);}
            var pending=Promise.resolve().then(function(){return ctx.state==='closed'?undefined:ctx.close();}).then(function(){
                if(ctx.state!=='closed')throw Error('試聴音の停止を完了できませんでした');contexts.delete(ctx);audio.forgetContext(handle,ctx);
            }).finally(function(){closing.delete(ctx);});closing.set(ctx,pending);return pending;
        }
        function idle(ctx,token){
            if(lease)audio.release(handle,lease);lease=null;notify('idle');mode=null;
            if(ctx)idleTimer=options.setTimer(function(){idleTimer=null;if(token!==epoch||voice)return;void closeContext(ctx).catch(function(){failed=true;error='試聴音の停止を確認できません。「全停止」を再実行してください。';});},800);
        }
        async function cleanup(){
            epoch++;cancelTimers();silence();notify('idle');mode=null;var results=await Promise.allSettled(Array.from(contexts,closeContext));
            var bad=results.find(function(r){return r.status==='rejected';});failed=!!bad;
            if(bad){error='試聴音を停止できませんでした。「全停止」を再実行してください。';throw bad.reason;}
            if(lease)audio.release(handle,lease);lease=null;error=null;
        }
        function stop(){return handle?audio.cleanup(handle,'audition-stop'):Promise.resolve({ok:true});}
        function cancel(){
            if(failed||!handle||!lease||!audio.isLeaseCurrent(handle,lease))return;
            epoch++;cancelTimers();silence();idle(context,epoch);
        }
        async function playEvents(events,isCurrent,holdSeconds,streaming,loopPeriod,preRoll){
            var lead=preRoll?.duration||0,countEvents=preRoll?.events||[];
            if(preRoll&&(!streaming||!Number.isFinite(lead)||lead<=0||lead>12||!Array.isArray(countEvents)||countEvents.length!==4||!countEvents.every(function(e){return e.part==='count'&&[72,84].includes(e.midi)&&Number.isFinite(e.start)&&e.start>=0&&Number.isFinite(e.duration)&&e.duration>0&&e.start+e.duration<=lead+.03&&Number.isFinite(e.gain)&&e.gain>0&&e.gain<=.2;})))return {ok:false};
            if(loopPeriod!==undefined&&(!streaming||!Number.isFinite(loopPeriod)||loopPeriod<=0||loopPeriod>holdSeconds))return {ok:false};
            if(holdSeconds!==undefined&&(!Number.isFinite(holdSeconds)||holdSeconds<=0||holdSeconds>(streaming?122881:61)))return {ok:false};
            if(!Array.isArray(events)||(!events.length&&!holdSeconds)||events.length>(streaming?524288:256)||!events.every(function(e){return Number.isInteger(e.midi)&&e.midi>=21&&e.midi<=108&&['piano','guitar','mute','click'].includes(e.part)&&Number.isFinite(e.start)&&e.start>=0&&Number.isFinite(e.duration)&&e.duration>0&&e.duration<=61&&e.start+e.duration<=(streaming?holdSeconds+.01:61)&&Number.isFinite(e.gain)&&e.gain>0&&e.gain<=.45;})||!isCurrent())return {ok:false};
            if(failed)return {ok:false,error:error};
            register();var next=audio.request(handle,'audio-output/session');
            if(!next)return {ok:false,error:'ほかの音声を停止してから試聴してください。'};
            lease=next;cancelTimers();silence();var token=++epoch;error=null;mode=streaming?'song':holdSeconds?'bar':'audition';notify('loading');
            try{
                // Create/resume inside the user gesture, before any sample decoding.
                if(!context||context.state==='closed'){context=options.createContext();contexts.add(context);audio.ownContext(handle,next,context);}
                var ctx=context;if(ctx.state!=='running')await ctx.resume();
                if(token!==epoch)return {ok:false};
                if(ctx.state!=='running'){await stop();return {ok:false,error:'音を開始できませんでした。もう一度押してください。'};}
                if(!isCurrent()||!audio.isLeaseCurrent(handle,next)){await stop();return {ok:false};}
                if(!audio.grant(handle,next)){await stop();return {ok:false};}
                var samples=new Map();events.concat(countEvents).forEach(function(e){var key=e.part+':'+e.midi;if(!samples.has(key))samples.set(key,options.loadSample(ctx,e.midi,e.part));});
                var keys=Array.from(samples.keys()),decoded=await Promise.all(Array.from(samples.values()));keys.forEach(function(key,i){samples.set(key,decoded[i]);});
                if(token!==epoch)return {ok:false};
                if(!isCurrent()||!audio.isLeaseCurrent(handle,next)){await stop();return {ok:false};}
                var now=ctx.currentTime,current={nodes:new Set(),remaining:events.length,startedAt:now,duration:holdSeconds||0,cursor:0,cycle:0};voice=current;
                function finish(){if(voice!==current||token!==epoch)return;cancelTimers();silence();idle(ctx,token);}
                function schedule(e,offset){
                    if(current.nodes.size>=2048)throw Error('同時に鳴らす音が多すぎるため停止しました');
                    var sample=samples.get(e.part+':'+e.midi),osc=ctx.createBufferSource(),gain=ctx.createGain(),rate=Math.pow(2,(e.midi-sample.midi)/12),start=now+(e.part==='count'?0:lead)+(offset||0)+e.start;
                    var duration=Math.min(e.duration,sample.buffer.duration/rate),release=e.part==='guitar'?Math.min(e.release||.045,duration*.3):Math.min(.35,duration*.35);
                    osc.buffer=sample.buffer;osc.playbackRate.setValueAtTime(rate,start);
                    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(e.gain,start+Math.min(.005,duration/4));gain.gain.setValueAtTime(e.gain,start+duration-release);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
                    osc.connect(gain);gain.connect(outputFor(ctx,e.part));var node={osc:osc,gain:gain};current.nodes.add(node);
                    osc.onended=function(){if(voice!==current||token!==epoch)return;osc.onended=null;osc.disconnect();gain.disconnect();current.nodes.delete(node);if(!holdSeconds&&--current.remaining===0)finish();};
                    osc.start(start);osc.stop(start+duration);
                }
                countEvents.forEach(function(e){schedule(e,0);});
                if(streaming){
                    events=events.slice().sort(function(a,b){return a.start-b.start;});
                    function pump(){
                        pumpTimer=null;if(token!==epoch||voice!==current)return;
                        if(!isCurrent()||!audio.isLeaseCurrent(handle,next)){void stop();return;}
                        if(!loopPeriod&&ctx.currentTime>=now+lead+holdSeconds){finish();return;}
                        try{while(events.length){
                            if(current.cursor===events.length){if(!loopPeriod)break;current.cursor=0;current.cycle++;}
                            var event=events[current.cursor],offset=current.cycle*(loopPeriod||0),start=now+lead+offset+event.start;
                            if(start>ctx.currentTime+1)break;
                            if(start<ctx.currentTime-.05)throw Error('再生が中断されたため停止しました');
                            current.cursor++;schedule(event,offset);
                        }}
                        catch(e){void stop().then(function(){error=e.message;if(options.onError)options.onError(error);});return;}
                        pumpTimer=options.setTimer(pump,25);
                    }
                    pump();if(voice!==current)return {ok:false};
                }else{events.forEach(function(e){schedule(e,0);});if(holdSeconds)endTimer=options.setTimer(finish,Math.ceil(holdSeconds*1000)+50);}
                notify('playing');return {ok:true};
            }catch(e){if(token===epoch){await stop();error='音を開始できませんでした。音源や端末の音声設定を確認してください。';return {ok:false,error:error};}return {ok:false};}
        }
        async function play(midi,isCurrent){var r=await playEvents([{midi:midi,part:'piano',start:0,duration:1.6,gain:.45}],isCurrent);return r.ok?{ok:true,midi:midi,frequency:440*Math.pow(2,(midi-69)/12)}:r;}
        return {play:play,playEvents:playEvents,setMix:setMix,cancel:cancel,stop:stop,snapshot:function(){return {playing:!!voice,mode:mode,elapsedSeconds:voice&&context?Math.max(0,context.currentTime-voice.startedAt):0,contextCount:contexts.size,error:error};}};
    }
    // End short pitch audition.
    var pianoBankPromise=null,guitarBankPromise=null,pianoDecoded=new Map();
    function ensurePianoBank(){
        if(CS().pianoSamples)return Promise.resolve(CS().pianoSamples);
        if(pianoBankPromise)return pianoBankPromise;
        pianoBankPromise=new Promise(function(resolve,reject){
            var script=document.createElement('script'),timer=setTimeout(function(){finish(false);},10000);
            function finish(ok){clearTimeout(timer);script.onload=script.onerror=null;if(!ok){script.remove();pianoBankPromise=null;reject(Error('ピアノ音源を読み込めませんでした'));}else resolve(CS().pianoSamples);}
            script.src=new URL('../../../vendor/piano/salamander-bank.js',pianoScriptURL).href;script.onload=function(){finish(!!CS().pianoSamples);};script.onerror=function(){finish(false);};document.head.appendChild(script);
        });return pianoBankPromise;
    }
    function ensureGuitarBank(){
        if(CS().guitarSamples)return Promise.resolve(CS().guitarSamples);
        if(guitarBankPromise)return guitarBankPromise;
        guitarBankPromise=new Promise(function(resolve,reject){var script=document.createElement('script'),timer=setTimeout(function(){done(false);},10000);
            function done(ok){clearTimeout(timer);script.onload=script.onerror=null;if(ok)resolve(CS().guitarSamples);else{script.remove();guitarBankPromise=null;reject(Error('アコギ音源を読み込めませんでした'));}}
            script.src=new URL('../../../vendor/guitar/acoustic-bank.js',pianoScriptURL).href;script.onload=function(){done(!!CS().guitarSamples);};script.onerror=function(){done(false);};document.head.appendChild(script);
        });return guitarBankPromise;
    }
    async function loadPianoSample(ctx,midi,part){
        if(part==='count'||part==='click'){
            var key=part+':'+midi+':'+ctx.sampleRate;if(!pianoDecoded.has(key)){var buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.06),ctx.sampleRate),data=buffer.getChannelData(0),frequency=midi===84?1500:1000;for(var j=0;j<data.length;j++){var t=j/ctx.sampleRate;data[j]=Math.sin(2*Math.PI*frequency*t)*Math.min(1,t/.001)*Math.exp(-t/.009);}pianoDecoded.set(key,Promise.resolve({midi:midi,buffer:buffer}));}return pianoDecoded.get(key);
        }
        if(part==='mute'){
            var key='mute:'+ctx.sampleRate;if(!pianoDecoded.has(key)){var buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.085),ctx.sampleRate),data=buffer.getChannelData(0),seed=9137,previous=0;for(var j=0;j<data.length;j++){seed=(seed*1664525+1013904223)>>>0;var noise=seed/2147483648-1;data[j]=(noise-previous)*.5*Math.exp(-j/(ctx.sampleRate*.018));previous=noise;}pianoDecoded.set(key,Promise.resolve({midi:60,buffer:buffer}));}return pianoDecoded.get(key);
        }

        var bank=await (part==='guitar'?ensureGuitarBank():ensurePianoBank()),sample=bank.samples.reduce(function(best,s){return Math.abs(s.midi-midi)<Math.abs(best.midi-midi)?s:best;});
        var key=(part||'piano')+':'+sample.midi+':'+ctx.sampleRate,pending=pianoDecoded.get(key);
        if(!pending){
            var binary=atob(sample.mp3),bytes=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
            pending=ctx.decodeAudioData(bytes.buffer).then(function(buffer){return {buffer:buffer,midi:sample.midi};}).catch(function(e){pianoDecoded.delete(key);throw e;});
            pianoDecoded.set(key,pending);if(pianoDecoded.size>8)pianoDecoded.delete(pianoDecoded.keys().next().value);
        }return pending;
    }
    var chordPreviewListeners=new Set();
    var pianoAudition=null,barPreviewPhase='idle',barPreviewScope='all',previewFrame=null,previewSecondsPerTick=0,previewRAF=null,previewSpans=null,previewLastBar=null,previewSelectOnStop=false;
    // Manual scrolling owns the current bar; the next bar resumes playback following.
    var playbackFollow=null;
    function endPlaybackFollow(){if(playbackFollow){playbackFollow.dispose();playbackFollow=null;}}
    function beginPlaybackFollow(){
        endPlaybackFollow();if(barPreviewScope!=='song')return;
        var root=CS().scroll?.getRoot('sheetCruise')||window;
        function position(){return root===window?{x:window.scrollX,y:window.scrollY}:{x:root.scrollLeft,y:root.scrollTop};}
        var follow={root:root,expected:position(),lastBar:null,pausedBar:null};
        function pause(){follow.pausedBar=previewLastBar;}
        function onScroll(){var p=position();if(Math.abs(p.x-follow.expected.x)>1||Math.abs(p.y-follow.expected.y)>1)pause();}
        function onKey(e){if(['PageUp','PageDown','Home','End','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)&&!e.target.closest('input,textarea,select,[contenteditable],button,[role="button"]'))pause();}
        root.addEventListener('scroll',onScroll,{passive:true});root.addEventListener('wheel',pause,{passive:true});root.addEventListener('touchstart',pause,{passive:true});root.addEventListener('keydown',onKey);
        follow.position=position;follow.dispose=function(){root.removeEventListener('scroll',onScroll);root.removeEventListener('wheel',pause);root.removeEventListener('touchstart',pause);root.removeEventListener('keydown',onKey);};playbackFollow=follow;
    }
    function followPlaybackBar(paper,number){
        var follow=playbackFollow,now=performance.now()/1000;if(!follow||!paper)return;if(formDialog||playbackSettings?.isOpen||follow.pausedBar===number){follow.lastTime=now;return;}follow.pausedBar=null;follow.lastBar=number;
        var dt=Math.min(.032,Math.max(0,now-(follow.lastTime??now-1/60)));follow.lastTime=now;
        var root=follow.root,area=root===window?{top:0,bottom:innerHeight,left:0,right:innerWidth}:root.getBoundingClientRect(),toolbar=els.root.querySelector('.sheet-toolbar')?.getBoundingClientRect(),box=paper.getBoundingClientRect();
        var top=Math.max(0,area.top,toolbar&&toolbar.bottom>area.top&&toolbar.top<area.bottom?toolbar.bottom:0)+16,bottom=Math.min(innerHeight,area.bottom)-16,left=Math.max(0,area.left)+16,right=Math.min(innerWidth,area.right)-16;
        var dy=box.top+Math.min(box.height,bottom-top)/2-(top+bottom)/2,dx=box.left<left?box.left-left:box.right>right?box.right-right:0;
        var beat=previewSecondsPerTick*480,alpha=1-Math.exp(-dt/Math.max(.08,Math.min(.5,beat*.45)));
        function step(delta){var limit=Math.max(20,bottom-top)*dt/Math.max(.1,beat*.7);return Math.abs(delta)<.75?delta:Math.max(-limit,Math.min(limit,delta*alpha));}
        if(Math.abs(dx)>.1||Math.abs(dy)>.1){root.scrollBy({top:step(dy),left:step(dx),behavior:'instant'});follow.expected=follow.position();}
    }

    function clearPlayhead(){
        endPlaybackFollow();
        if(previewRAF!==null)cancelAnimationFrame(previewRAF);previewRAF=null;
        els.scaleBox?.classList.remove('sc-score-playing','sc-range-playing');
        [els.slotOverlay,els.scaleBox].forEach(function(root){if(!root)return;root.querySelectorAll('.sc-playing-bar').forEach(function(e){e.classList.remove('sc-playing-bar');});root.querySelectorAll('.sc-playing-cell,.sc-playing-note').forEach(function(e){e.classList.remove('sc-playing-cell','sc-playing-note');});root.querySelectorAll('[data-score-playhead],[data-playback-band]').forEach(function(e){e.remove();});});
    }
    function updateBarPlayButton(){
        var label=songPlaybackTarget(),target=q('sc-song-target');if(target&&target.textContent!==label)target.textContent=label;
        var whole=q('sc-song-preview');if(whole){var active=barPreviewPhase!=='idle'&&barPreviewScope==='song';whole.textContent=active?'■ 停止':'▶ 再生';whole.setAttribute('aria-label',active?'停止':'再生');whole.title=(active?'再生を停止':!state.session?.draft.bars.length?label:label+'再生')+'（Spaceで再生／停止）';whole.setAttribute('aria-pressed',String(active));whole.setAttribute('aria-busy',String(active&&barPreviewPhase==='loading'));}
        var position=q('sc-song-position');if(position&&(barPreviewPhase==='idle'||barPreviewScope!=='song'))position.textContent='';
        chordPreviewListeners.forEach(function(listener){listener();});
        if(!els.slotOverlay)return;
        els.slotOverlay.querySelectorAll('[data-bar-preview],[data-melody-preview]').forEach(function(button){var scope=button.hasAttribute('data-melody-preview')?'melody':'all',active=barPreviewPhase!=='idle'&&barPreviewScope===scope;button.textContent=active?(barPreviewPhase==='loading'?'■ 準備中':'■ 停止'):scope==='melody'?'▶ メロディ':'▶ 再生';button.setAttribute('aria-pressed',String(active));});
    }
    function paintBands(root,tick,editor){
        root.querySelectorAll(editor?'.slot-overlay-row':'.sheet-bar-row').forEach(function(row){
            var kind=editor?DOCK_ROW_ORDER.find(function(k){return row.classList.contains('slot-overlay-row--'+k);}):row.classList.contains('sheet-bar-chord')?'chord':row.classList.contains('sheet-bar-strum')?'strum':row.classList.contains('sheet-bar-lyrics')?'lyrics':row.classList.contains('sheet-bar-forms')?'forms':'doremi';
            var body=editor?row.querySelector('.slot-overlay-row-body'):row,allowed=barPreviewScope==='melody'?kind==='doremi':barPreviewScope==='chords'?['chord','strum','forms'].includes(kind):true;
            if(!body)return;var band=body.querySelector(':scope > [data-playback-band]');
            if(!allowed||body.hidden||!body.clientWidth){band?.remove();return;}
            var cells=Array.from(body.querySelectorAll(editor?'.dock-strum-cell,.dock-lyrics-cell,[data-overlay-field]':':scope > [data-slot-tick]')),left,width;
            if(kind==='forms'){width=body.clientWidth/Number(body.dataset.formResolution||8);left=body.clientWidth*tick/1920-width/2;}
            else{var cell=cells.find(function(e){var start=Number(e.dataset.slotTick),span=Number(e.dataset.slotTicks)||1920/cells.length;return tick>=start&&tick<start+span;});if(!cell){band?.remove();return;}var start=Number(cell.dataset.slotTick),span=Number(cell.dataset.slotTicks)||1920/cells.length,target=editor&&cell.dataset.overlayField==='doremi'?cell.parentElement:cell,a=body.getBoundingClientRect(),b=target.getBoundingClientRect();if(!a.width)return;width=b.width/a.width*body.clientWidth;left=(b.left-a.left)/a.width*body.clientWidth+width*(tick-start)/span-width/2;}
            if(!Number.isFinite(left)||!Number.isFinite(width)){band?.remove();return;}
            if(!band){band=document.createElement('span');band.dataset.playbackBand='';band.dataset.playbackRow=kind;band.setAttribute('aria-hidden','true');body.appendChild(band);}band.style.left=left+'px';band.style.width=width+'px';
        });
    }
    var previewLoopPeriod=0,previewCountIn=null,countInEnabled=false,metronomeEnabled=false,playbackNotice=null;
    function paintPlayhead(){
        previewRAF=null;if(barPreviewPhase!=='playing'||!pianoAudition)return;
        if(!currentFrame(previewFrame)||!state.active||document.hidden){stopPianoAudition();return;}
        var elapsed=Math.max(0,pianoAudition.snapshot().elapsedSeconds-.03);
        if(previewCountIn&&elapsed<previewCountIn.duration){var countPosition=q('sc-song-position');if(countPosition)countPosition.textContent='カウント '+Math.min(previewCountIn.beats,Math.floor(elapsed/previewCountIn.beatSeconds)+1)+' / '+previewCountIn.beats;previewRAF=requestAnimationFrame(paintPlayhead);return;}
        elapsed=Math.max(0,elapsed-(previewCountIn?.duration||0));if(previewLoopPeriod)elapsed%=previewLoopPeriod;var span=previewSpans?(previewSpans.find(function(s){return elapsed<s.end;})||previewSpans[previewSpans.length-1]):null;
        var number=span?span.index+1:state.selectedBarNumber,tick=Math.min(1919.999,Math.max(0,(elapsed-(span?span.start:0))/previewSecondsPerTick)),bar=state.session.draft.bars[number-1],cardActive=number===state.selectedBarNumber;
        previewLastBar=number;
        els.slotOverlay.dataset.playbackTick=String(tick);els.slotOverlay.dataset.playbackBar=number;
        var position=q('sc-song-position');if(position&&barPreviewScope==='song')position.textContent=number+' / '+state.session.draft.bars.length+'小節'+(previewLoopPeriod?'（範囲ループ）':'');

        els.slotOverlay.querySelectorAll('[data-piano-event]').forEach(function(e){var note=bar.melody.find(function(n){return n.id===e.dataset.pianoEvent;});e.classList.toggle('sc-playing-note',barPreviewScope!=='chords'&&!!note&&note.kind==='note'&&tick>=note.onsetTick&&tick<note.onsetTick+note.durationTicks);});
        var playingMeasure=els.slotOverlay.querySelector('.editor-measure[data-bar-number="'+number+'"]'),grid=playingMeasure?.querySelector('.slot-overlay-grid'),body=grid&&Array.from(grid.querySelectorAll('.slot-overlay-row-body')).find(function(e){return !e.hidden;});
        els.slotOverlay.querySelectorAll('.slot-overlay-grid').forEach(function(g){if(g!==grid){g.querySelector('[data-score-playhead]')?.remove();g.querySelectorAll('[data-playback-band]').forEach(function(e){e.remove();});}});
        if(playingMeasure)paintBands(playingMeasure,tick,true);
        if(grid&&body){var line=grid.querySelector('[data-score-playhead]');if(!line){line=document.createElement('span');line.dataset.scorePlayhead='';line.setAttribute('aria-hidden','true');grid.appendChild(line);}line.style.left=Math.max(0,Math.min(grid.clientWidth-2,body.getBoundingClientRect().left-grid.getBoundingClientRect().left+body.getBoundingClientRect().width*tick/1920))+'px';revealEditorCell(line);}
        var paper=els.scaleBox.querySelector('.sheet-bar[data-bar-number="'+number+'"]');
        els.scaleBox.classList.add('sc-score-playing');els.scaleBox.classList.toggle('sc-range-playing',barPreviewScope==='song'&&!!previewLoopPeriod);els.scaleBox.querySelectorAll('.sheet-bar').forEach(function(b){b.classList.toggle('sc-playing-bar',b===paper);if(b!==paper){b.querySelector('[data-score-playhead]')?.remove();b.querySelectorAll('[data-playback-band]').forEach(function(e){e.remove();});b.querySelectorAll('.sc-playing-cell').forEach(function(c){c.classList.remove('sc-playing-cell');});}});
        if(paper){if(barPreviewScope==='song')followPlaybackBar(paper,number);var line=paper.querySelector('[data-score-playhead]');if(!line){line=document.createElement('span');line.dataset.scorePlayhead='';line.setAttribute('aria-hidden','true');paper.appendChild(line);}line.style.left=tick/1920*100+'%';}
        previewRAF=requestAnimationFrame(paintPlayhead);
    }
    function ensureAudition(){
        if(!pianoAudition)pianoAudition=createPianoAudition({coordinator:CS().audio,mix:playbackMix,createContext:function(){return new (window.AudioContext||window.webkitAudioContext)();},setTimer:window.setTimeout.bind(window),clearTimer:window.clearTimeout.bind(window),loadSample:loadPianoSample,onError:function(message){if(currentFrame(previewFrame))previewMessage(message);},onState:function(phase,mode){var stopped=phase==='idle'&&barPreviewPhase==='playing'&&barPreviewScope==='song'&&previewSelectOnStop&&!previewLoopPeriod&&currentFrame(previewFrame)&&state.active?previewLastBar:null;barPreviewPhase=['bar','song'].includes(mode)?phase:'idle';if(phase==='idle'){previewSelectOnStop=false;clearPlaybackNotice();}updateBarPlayButton();clearPlayhead();if(stopped)selectStoppedPlaybackBar(stopped);if(barPreviewPhase==='playing'){beginPlaybackFollow();previewRAF=requestAnimationFrame(paintPlayhead);}else if(els.slotOverlay){delete els.slotOverlay.dataset.playbackTick;delete els.slotOverlay.dataset.playbackBar;}}});
        return pianoAudition;
    }
    // Preload on workspace activation; never await an import inside the audio gesture.
    var scorePlayback=null,scorePlaybackPending=null;
    function prepareScorePlayback(){
        if(!scorePlaybackPending)scorePlaybackPending=import('./score-playback.mjs?v=0.141.0-dev.1').then(function(m){scorePlayback=m;}).catch(function(){scorePlaybackPending=null;});
    }
    function buildBarPreviewPlan(project,index,deps){
        if(!scorePlayback){prepareScorePlayback();throw Error('再生の準備中です。もう一度押してください');}
        return scorePlayback.buildBarPreviewPlan(project,index,deps);
    }
    function buildSongPreviewPlan(project,deps,startIndex,count){
        if(!scorePlayback){prepareScorePlayback();throw Error('再生の準備中です。もう一度押してください');}
        return scorePlayback.buildSongPreviewPlan(project,deps,startIndex,count);
    }
    function previewDependencies(project,melodyOnly){
        var materials=new Map(project.materials.rhythms.map(function(m){return [m.id,m];})),bindings=new Map(project.performance.barRhythms.map(function(b){return [b.barId,b.materialId];})),cache=new Map();
        return {pitchMidi:CS().model.schema2.pitchMidi,parseChord:CS().theory.parseBasicChordSymbol,qualities:window.ChordCruise.theory.QUALITIES,notePc:CS().theory.keyToSemitone,melodyOnly:!!melodyOnly,fillBlankStrums:scorePlayback?.fillBlankStrums,rhythm:function(p,i){
            var id=bindings.get(p.bars[i].id)||p.performance.basicRhythmId;if(cache.has(id))return cache.get(id);var m=materials.get(id),r;
            if(m?.encoding==='studio-strum-v1')r={encoding:m.encoding,slots:m.snapshot.slots};
            else if(m?.encoding==='rhythm-owner-cells-v1'){var checked=CS().rhythmSnapshots.readRhythmMaterial(m);if(!checked.ok)throw Error('ストロークの内容を確認してください');r={encoding:m.encoding,projection:checked.projection};}
            if(!r)throw Error('ストローク形式が未対応です');cache.set(id,r);return r;
        }};
    }
    function startPreview(scope){
        if(!scorePlayback){prepareScorePlayback();setSaveStatus('再生の準備中です。もう一度押してください');return;}
        if(!state.session?.draft.bars.length){setSaveStatus('再生する小節がありません。空き枠を編集してください');return;}

        if(barPreviewPhase!=='idle'&&barPreviewScope===scope){if(scope==='song')stopSongPreview();else stopPianoAudition();return;}
        finishTextInputs();var owner=state.session,c=scope==='song'?null:pianoContext();
        if(!owner||owner.draft.schemaVersion!==2||!operationEligible()||owner.inputPending||owner.commitInFlight||owner.conflict||owner.externalUpdatePending||textDiagnostic(owner)||(scope!=='song'&&pianoBlocked(c))){pianoMessage('未確定の入力・保存・競合を確認してください');return;}
        try{var project=owner.workingSnapshot(),deps=previewDependencies(project,scope==='melody'),plan=scope==='song'&&selectedBarIds.length>1?scorePlayback.buildRangeLoopPlan(project,deps,project.bars.findIndex(function(b){return b.id===selectedBarIds[0];}),selectedBarIds.length):scope==='song'?buildSongPreviewPlan(project,deps,selectedPlaybackSection()?project.bars.findIndex(function(b){return b.sectionId===selectedPlaybackSection().id;}):Math.max(0,(state.selectedBarNumber||1)-1)):editorBars===2?buildSongPreviewPlan(project,deps,editorStartIndex(project),2):buildBarPreviewPlan(project,state.selectedBarNumber-1,deps);
            if(scope==='song'&&metronomeEnabled)plan=scorePlayback.withMetronome(project,plan);
            playPreviewPlan(plan,scope,scope==='song'&&countInEnabled?scorePlayback.buildCountIn(project):null);
        }catch(e){pianoMessage(e.message);}
    }
    function clearPlaybackNotice(){var old=playbackNotice;playbackNotice=null;if(!old)return;if(piano.message===old)piano.message='';if(els.saveStatus?.textContent===old)refreshSessionStatus();}
    function previewMessage(message){playbackNotice=message;pianoMessage(message);}
    function playPreviewPlan(plan,scope){
        var preRoll=arguments[2]||null;previewCountIn=preRoll;
        clearPlaybackNotice();piano.message='';if(plan.warnings.length)previewMessage(plan.warnings.join('／'));var frame=contentFrame();previewFrame=frame;previewSpans=plan.spans||null;previewLoopPeriod=plan.loopPeriod||0;previewSecondsPerTick=plan.secondsPerTick||0;barPreviewScope=scope;previewLastBar=null;previewSelectOnStop=scope==='song';
        void ensureAudition().playEvents(plan.events,function(){return currentFrame(frame)&&state.active&&!document.hidden&&(!CS().entryAuth||CS().entryAuth.isAuthorized());},plan.duration,scope==='song'||plan.spans?.length>1,plan.loopPeriod,preRoll).then(function(r){if(!r.ok&&r.error&&currentFrame(frame))previewMessage(r.error);}).catch(function(){if(currentFrame(frame))previewMessage('試聴を開始できませんでした');});
    }
    function buildBarPlayButton(melodyOnly){
        var owner=state.session,sourceBarId=owner?.draft.bars[state.selectedBarNumber-1]?.id;
        var button=document.createElement('button');button.type='button';if(melodyOnly)button.dataset.melodyPreview='';else button.dataset.barPreview='';button.className='slot-overlay-nav-btn';var scope=melodyOnly?'melody':'all',active=barPreviewPhase!=='idle'&&barPreviewScope===scope;button.textContent=active?(barPreviewPhase==='loading'?'■ 準備中':'■ 停止'):melodyOnly?'▶ メロディ':'▶ 再生';button.setAttribute('aria-pressed',String(active));button.title=(editorBars===2?'表示中の2小節':'この小節')+(melodyOnly?'のメロディだけを試聴':'のコード×ストローク＋メロディを試聴（コードは参考の響き）');
        // Keep the text target alive through WebKit's pointer-to-focus transition.
        button.addEventListener('pointerdown',function(e){if(e.button===0)e.preventDefault();e.stopPropagation();});button.addEventListener('click',function(e){e.stopPropagation();if(!button.isConnected||state.session!==owner||owner.draft.bars[state.selectedBarNumber-1]?.id!==sourceBarId)return;startPreview(scope);});return button;
    }
    function selectStoppedPlaybackBar(number){
        if(!state.session?.draft.bars[number-1])return;
        selectedBarIds=[];rangeAnchor=number;sectionPlaybackSelection=null;state.selectedBarNumber=number;editorAnchorId=state.session.draft.bars[number-1].id;selectionDeleted=false;editorOpen=false;
        syncSheetSelection();refreshToolbarActions();getSheetBarByNumber(number)?.focus({preventScroll:true});
    }
    function stopSongPreview(){
        if(barPreviewPhase==='playing'&&pianoAudition&&previewSpans){var elapsed=pianoAudition.snapshot().elapsedSeconds-.03-(previewCountIn?.duration||0),span=elapsed<0?null:previewSpans.find(function(s){return elapsed<s.end;})||(elapsed<0?null:previewSpans[previewSpans.length-1]);if(span)previewLastBar=span.index+1;}
        previewSelectOnStop=!previewLoopPeriod;if(pianoAudition)void pianoAudition.stop();
    }
    function stopPianoAudition(){previewSelectOnStop=false;if(pianoAudition)void pianoAudition.stop();}
    function playPianoAudition(midi){
        if(!piano.sound)return;
        if(!CS().audio){setSaveStatus('試聴を開始できません。画面を再読込して確認してください。',true);return;}
        ensureAudition();
        var frame=contentFrame();void pianoAudition.play(midi,function(){return piano.sound&&piano.open&&currentFrame(frame)&&state.active&&!document.hidden&&(!CS().entryAuth||CS().entryAuth.isAuthorized());}).then(function(r){if(!r.ok&&r.error&&currentFrame(frame))pianoMessage(r.error);}).catch(function(){if(currentFrame(frame))setSaveStatus('試聴を開始できませんでした。',true);});
    }
    function pianoScale(project){
        var tonic=project.solfege.tonic,key=tonic.step+window.ChordCruise.theory.formatAccidental(tonic.alter);
        return window.ChordCruise.theory.spellScaleNotes({tonicPc:CS().theory.keyToSemitone(key),tonicName:key,scaleId:'major'});
    }
    function pianoPitch(midi,project){
        var scale=pianoScale(project),pc=midi%12,pcs={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
        var spelled=scale.find(function(n){return (pcs[n.letter]+n.accidental+12)%12===pc;});
        if(!spelled){var flat=scale.reduce(function(n,s){return n+s.accidental;},0)<0;
            var letters=flat?['C','D','D','E','E','F','G','G','A','A','B','B']:['C','C','D','D','E','F','F','G','G','A','A','B'];
            var step=letters[pc];spelled={letter:step,accidental:pc-pcs[step]};
        }
        return {step:spelled.letter,alter:spelled.accidental,octave:(midi-pcs[spelled.letter]-spelled.accidental)/12-1};
    }
    function pianoToken(pitch,project,short){
        var scale=pianoScale(project),degree=scale.findIndex(function(n){return n.letter===pitch.step;}),alter=pitch.alter-scale[degree].accidental;
        var octave=(CS().model.schema2.pitchMidi(pitch)-CS().model.schema2.pitchMidi(project.solfege.tonic)-[0,2,4,5,7,9,11][degree]-alter)/12;
        return ['ド','レ','ミ','ファ','ソ','ラ','シ'][degree]+(alter>0?'♯'.repeat(alter):'♭'.repeat(-alter))+(short?'':octave>0?'↑'.repeat(octave):'↓'.repeat(-octave));
    }
    function pianoContext(){
        var owner=state.session,bar=getSelectedBar();if(!owner||!bar||owner.draft.schemaVersion!==2)return null;
        var canonical=owner.draft.bars[bar.barNumber-1],ranges=editorCellRanges(bar,getStrumGridResolution(bar),'doremi');
        if(piano.owner!==owner||piano.barId!==canonical.id){piano.owner=owner;piano.barId=canonical.id;piano.tick=0;piano.eventId=null;piano.adding=false;piano.message='';}
        var range=ranges.filter(function(r){return r.tick<=piano.tick;}).pop()||ranges[0];piano.tick=range.tick;piano.span=range.span;
        var events=canonical.melody.filter(function(e){return e.onsetTick>=range.tick&&e.onsetTick<range.tick+range.span;});
        var selected=events.find(function(e){return e.id===piano.eventId;});if(!selected&&!piano.adding)selected=events[0];
        piano.eventId=selected?selected.id:null;
        return {owner:owner,bar:canonical,events:events,event:selected,range:range,frame:contentFrame()};
    }
    function pianoBlocked(c){
        return !c||!currentFrame(c.frame)||!operationEligible()||c.owner!==state.session||c.owner.inputPending||c.owner.commitInFlight||c.owner.conflict||c.owner.externalUpdatePending||!!textDiagnostic(c.owner)||!!els.slotOverlay.querySelector('.is-composing');
    }
    function bindPianoCell(owner,barId,tick,span){
        if(piano.owner!==owner||piano.barId!==barId||piano.tick!==tick){piano.owner=owner;piano.barId=barId;piano.tick=tick;piano.span=span;piano.eventId=null;piano.adding=false;piano.message='';}
        refreshPiano();
    }
    function finishPianoChange(c){
        if(c.owner!==state.session||state.session.draft.bars[state.selectedBarNumber-1]?.id!==c.bar.id)return;
        renderPreview(true);renderSlotOverlayContent();
        queueEditorFrame(function(){if(collapsedEditorRows.has('doremi'))return;var field=editorRoot().querySelector('[data-overlay-field="doremi"][data-slot-tick="'+c.range.tick+'"]');if(field){field.parentElement.classList.add('piano-color-mode');field.focus({preventScroll:true});field.setSelectionRange(field.value.length,field.value.length);}});
    }
    function pianoMessage(message){piano.message=message;setSaveStatus(message,true);refreshPiano();}
    function pianoAppendRange(c){
        if(!c)return null;var start=c.range.tick,end=start+c.range.span;
        c.bar.melody.forEach(function(e){if(e.onsetTick<end&&e.onsetTick+e.durationTicks>start)start=Math.max(start,e.onsetTick+e.durationTicks);});
        return start<end?{tick:start,span:end-start}:null;
    }
    function pianoExtension(c){
        if(!c)return {error:'伸ばす位置を選んでください'};
        var selected=c.event,at=selected?selected.onsetTick:c.range.tick,previous=c.bar.melody.filter(function(e){return e.onsetTick<at;}).pop();
        var replace=selected?.kind==='note'&&previous?.kind==='note'&&previous.onsetTick+previous.durationTicks===at;
        var pending=!selected&&piano.adding&&c.events.length,event=replace?previous:pending?c.events[c.events.length-1]:selected;
        if(!event&&!c.events.length)event=c.bar.melody.filter(function(e){return e.kind==='note'&&e.onsetTick<c.range.tick&&e.onsetTick+e.durationTicks>=c.range.tick;}).pop();
        if(!event||event.kind!=='note')return {error:'前の音につなぐ位置を選んでください。休符は先に消去してください'};
        var end=replace?selected.onsetTick+selected.durationTicks:selected?event.onsetTick+event.durationTicks+c.range.span:c.range.tick+c.range.span;
        if(pending||end<=event.onsetTick+event.durationTicks){var heldEnd=event.onsetTick+event.durationTicks;if(heldEnd<c.range.tick+c.range.span)end=c.range.tick+c.range.span;else{var next=editorCellRanges(getSelectedBar(),getStrumGridResolution(getSelectedBar()),'doremi').find(function(r){return r.tick>=heldEnd;});if(!next)return {error:'小節をまたぐ伸ばしは未対応です'};end=next.tick+next.span;}}
        if(end>getBeats(state.project)*480)return {error:'小節をまたぐ伸ばしは未対応です'};
        if(c.bar.melody.some(function(e){return e.id!==event.id&&(!replace||e.id!==selected.id)&&e.onsetTick<end&&e.onsetTick+e.durationTicks>event.onsetTick;}))return {error:'伸ばしを入れる位置へ→で移動してから〜を押してください。他の音は保持しました'};
        return {event:event,end:end,removeId:replace?selected.id:null};
    }
    function pianoExtendError(c){return pianoExtension(c).error||null;}
    function movePianoCell(direction){
        var c=pianoContext();if(pianoBlocked(c))return;
        var events=c.events.slice().sort(function(a,b){return a.onsetTick-b.onsetTick;}),index=events.findIndex(function(e){return e.id===piano.eventId;}),next=piano.adding?direction<0?events.length-1:events.length:index+direction;
        if(next>=0&&next<events.length){piano.eventId=events[next].id;piano.adding=false;refreshPiano();focusPianoCell(c);return;}
        var number=state.selectedBarNumber,bar=getSelectedBar(),ranges=editorCellRanges(bar,getStrumGridResolution(bar),'doremi'),slot=ranges.findIndex(function(r){return r.tick===c.range.tick;})+direction;
        if(slot<0||slot>=ranges.length){number+=direction;if(number<1||number>state.project.bars.length)return;bar=state.project.bars[number-1];ranges=editorCellRanges(bar,getStrumGridResolution(bar),'doremi');slot=direction<0?ranges.length-1:0;}
        var expectedId=c.owner.draft.bars[number-1].id,expectedTick=ranges[slot].tick,frame=contentFrame();
        c.owner.finishTextGroup();var within=number===state.selectedBarNumber;
        if(!within)moveSelectedBar(direction,{focusRowId:'doremi',focusLast:direction<0});
        else {var field=editorRoot().querySelector('[data-overlay-field="doremi"][data-slot-tick="'+expectedTick+'"]');if(!field)return;field.focus({preventScroll:true});field.parentElement.classList.add('piano-color-mode');}
        function chooseTarget(){
            var active=document.activeElement;if(!CS().structureOperations.isCurrent(frame.content,state.session)||!CS().documents.isSelected(frame.ticket)||state.session!==c.owner||state.session.draft.bars[state.selectedBarNumber-1]?.id!==expectedId||!active?.matches('[data-overlay-field="doremi"]')||Number(active.dataset.slotTick)!==expectedTick)return;
            var target=pianoContext();piano.eventId=target.events.length?(direction<0?target.events[target.events.length-1]:target.events[0]).id:null;piano.adding=false;active.parentElement.classList.add('piano-color-mode');refreshPiano();
        }
        if(within)chooseTarget();else requestAnimationFrame(chooseTarget);
    }
    function pianoWrite(c,action,midi){
        if(pianoBlocked(c)){pianoMessage('入力・保存・競合の状態を確認してください。元の内容を保持しています。');return;}
        if(action==='pitch'&&(!Number.isInteger(midi)||midi<21||midi>108))return;
        piano.message='';if(action==='extend'&&pianoExtendError(c)){pianoMessage(pianoExtendError(c));return;}
        var extension=action==='extend'?pianoExtension(c):null,selected=extension?extension.event:c.event,range=c.range,owner=c.owner;if(action==='pitch'&&selected?.kind==='note'&&CS().model.schema2.pitchMidi(selected.pitch)===midi)return true;owner.finishTextGroup();
        var insertRange=action==='pitch'&&!selected&&!autoCellGroup(c.events,range.tick,range.span)?pianoAppendRange(c):null,createdId=null;
        if(action==='pitch'&&!selected&&!insertRange){
            var field=editorRoot().querySelector('[data-overlay-field="doremi"][data-slot-tick="'+range.tick+'"]');
            if(!field||!field._applyBeatValue||field.readOnly||c.events.length&&!autoCellGroup(c.events,range.tick,range.span)){setSaveStatus('既存の音価を保持するため、このマスへの音の追加は適用できません。',true);return;}
            var token=pianoToken(pianoPitch(midi,owner.draft),owner.draft),previous=field.value;
            var result=field._applyBeatValue((piano.adding?previous:'')+token);
            if(!result.ok){field._applyBeatValue(previous);refreshPiano();pianoMessage(result.error||'隣の音と重なるため適用できません。');return;}
            owner.finishTextGroup();var updated=owner.draft.bars.find(function(b){return b.id===c.bar.id;}).melody.filter(function(e){return e.onsetTick>=range.tick&&e.onsetTick<range.tick+range.span;});
            piano.eventId=updated.length?updated[updated.length-1].id:null;piano.adding=false;finishPianoChange(c);return true;
        }
        var result=owner.runOperation('鍵盤：'+action,function(project){
            if(!currentFrame(c.frame))throw Error('対象の曲または小節が変わりました');
            var bar=project.bars.find(function(b){return b.id===c.bar.id;}),event=selected&&bar.melody.find(function(e){return e.id===selected.id;});
            if(selected&&!event)throw Error('対象の音が変わりました');
            if(action==='pitch'){if(!event){if(!insertRange)throw Error('追加する空き時間がありません');createdId=CS().model.schema2.newId();event={id:createdId,kind:'note',onsetTick:insertRange.tick,durationTicks:insertRange.span,provenance:CS().model.schema2.timing('auto-assigned',false)};bar.melody.push(event);event=bar.melody.find(function(e){return e.id===createdId;});}event.kind='note';event.pitch=pianoPitch(midi,project);}
            else if(action==='delete'){if(event)bar.melody=bar.melody.filter(function(e){return e.id!==event.id;});}
            else if(action==='rest'){
                if(event){event.kind='rest';delete event.pitch;}
                else bar.melody.push({id:CS().model.schema2.newId(),kind:'rest',onsetTick:range.tick,durationTicks:range.span,provenance:CS().model.schema2.timing('user-set',true)});
            }else if(action==='extend'){
                if(!event||event.kind!=='note')throw Error('伸ばす音を選んでください');
                event.durationTicks=extension.end-event.onsetTick;event.provenance.timing.duration={origin:'user-set',confirmed:true};
                if(extension.removeId)bar.melody=bar.melody.filter(function(e){return e.id!==extension.removeId;});
            }
            bar.melody.sort(function(a,b){return a.onsetTick-b.onsetTick;});
        });
        if(!result.ok){pianoMessage(result.error||'音の位置・長さを確認してください。元の内容を保持しています。');return;}
        if(createdId)piano.eventId=createdId;else if(extension)piano.eventId=extension.event.id;piano.adding=false;finishPianoChange(c);return true;
    }
    var chordPicker={open:false,owner:null,barId:null,tick:0,formEventId:null},chordPickerModule=null;
    function bindChordCell(owner,barId,tick){
        if(chordPicker.owner!==owner||chordPicker.barId!==barId){chordPicker.owner=owner;chordPicker.barId=barId;chordPicker.tick=0;}
        chordPicker.formEventId=null;chordPicker.tick=tick;refreshChordPicker();
    }
    function syncEditorDisclosures(){
        if(!els.slotOverlay)return;
        els.slotOverlay.querySelectorAll('[data-overlay-field=chord]').forEach(function(field){field.classList.toggle('chord-selected-cell',chordPicker.open&&!collapsedEditorRows.has('chord')&&field.closest('.editor-measure')===editorRoot()&&Number(field.dataset.slotTick)===chordPicker.tick);});
        ['chord','piano'].forEach(function(kind){var open=kind==='chord'?chordPicker.open:piano.open,name=kind==='chord'?'コード':'鍵盤';els.slotOverlay.querySelectorAll('[data-'+kind+'-toggle]').forEach(function(button){button.textContent=open?'▲':'▼';button.title=name+'を'+(open?'閉じる':'開く');button.setAttribute('aria-label',button.title);button.setAttribute('aria-expanded',String(open));});});
    }
    function buildChordPickerPanel(){var root=document.createElement('section');root.dataset.chordPicker='';root.hidden=!chordPicker.open||collapsedEditorRows.has('chord');if(!root.hidden)populateChordPicker(root);return root;}
    function refreshChordPicker(){syncEditorDisclosures();var root=els.slotOverlay?.querySelector('[data-chord-picker]');if(root&&!root.hidden)populateChordPicker(root);}
    function populateChordPicker(root){
        var owner=state.session,bar=owner.draft.bars[state.selectedBarNumber-1];if(!bar)return;
        if(chordPicker.owner!==owner||chordPicker.barId!==bar.id){chordPicker.owner=owner;chordPicker.barId=bar.id;chordPicker.tick=0;chordPicker.formEventId=null;}
        var eventId=chordPicker.formEventId,symbol=bar.chords.find(function(c){return eventId?c.id===eventId:c.onsetTick===chordPicker.tick;})?.symbol||'';
        var preserved=null;if(root._chordOwner===owner&&root._chordBarId===bar.id&&root._chordTick===chordPicker.tick&&root._chordSymbol===symbol){
            var positions=[];for(var ancestor=root.parentElement;ancestor;ancestor=ancestor.parentElement)positions.push({node:ancestor,x:ancestor.scrollLeft,y:ancestor.scrollTop});
            var board=root.shadowRoot?.querySelector('#cc-fretboard-host .cc-fb-scroll');preserved={positions:positions,x:window.scrollX,y:window.scrollY,boardX:board?.scrollLeft,minHeight:root.style.minHeight};root.style.minHeight=root.offsetHeight+'px';
        }
        root._chordOwner=owner;root._chordBarId=bar.id;root._chordTick=chordPicker.tick;root._chordSymbol=symbol;root._disposeOwnerChord?.();
        syncEditorDisclosures();var tick=chordPicker.tick,frame=contentFrame();root.textContent='コードを読み込んでいます…';
        if(!chordPickerModule)chordPickerModule=import('./chord-picker.mjs?v=0.141.0-dev.1').then(function(m){return m.createChordPicker(CS(),window.ChordCruise);}).catch(function(e){chordPickerModule=null;throw e;});
        chordPickerModule.then(function(module){
            if(!root.isConnected||!currentFrame(frame)||owner!==state.session||chordPicker.tick!==tick||chordPicker.formEventId!==eventId)return;
            module.mount(root,{session:owner,bar:bar,tick:tick,eventId:eventId,editForm:!!eventId,project:owner.workingSnapshot(),current:function(){return currentFrame(frame)&&chordPicker.tick===tick&&chordPicker.formEventId===eventId;},eligible:editorCanMove,write:function(symbol,formMaterial,formMode){
                if(!currentFrame(frame)||!editorCanMove())return false;var field=editorRoot().querySelector('[data-overlay-field="chord"][data-slot-tick="'+tick+'"]');if(!field||field.readOnly)return false;return field._applyBeatValue(symbol,formMaterial,formMode).ok;
            },close:function(){if(!currentFrame(frame)||!editorCanMove())return;stopPianoAudition();chordPicker.open=false;root.hidden=true;root._disposeOwnerChord?.();syncEditorDisclosures();},formDetail:function(id){var cell=getSheetBarByNumber(state.selectedBarNumber);if(cell&&currentFrame(frame))openPaperForm(cell,id);},changed:function(){renderPreview(true);},progression:function(resolver){
                if(!currentFrame(frame)||!editorCanMove())return false;
                if(barPreviewScope==='chords'&&barPreviewPhase!=='idle'){stopPianoAudition();return true;}
                finishTextInputs();if(!currentFrame(frame)||!editorCanMove())return false;
                try{var p=owner.workingSnapshot(),deps=previewDependencies(p,false);deps.chordsOnly=true;deps.fillBlankStrums=resolver.fillBlank;var plan=editorBars===2?buildSongPreviewPlan(p,deps,editorStartIndex(p),2):buildBarPreviewPlan(p,state.selectedBarNumber-1,deps);playPreviewPlan(plan,'chords');return true;}catch(e){pianoMessage(e.message);return false;}
            },previewRange:function(){return {startIndex:editorBars===2?editorStartIndex(owner.draft):state.selectedBarNumber-1,count:editorBars};},previewState:function(){return {phase:barPreviewPhase,scope:barPreviewScope};},subscribePreview:function(listener){chordPreviewListeners.add(listener);return function(){chordPreviewListeners.delete(listener);};},preview:function(plan,scope){
                if(!currentFrame(frame)||!editorCanMove())return false;
                if(scope==='chords'&&barPreviewScope===scope&&barPreviewPhase!=='idle'){stopPianoAudition();return true;}
                finishTextInputs();if(!currentFrame(frame)||!editorCanMove())return false;playPreviewPlan(plan,scope);return true;
            }});
            mountFormPerformance(root,owner,bar,tick,frame);
            if(preserved){root.style.minHeight=preserved.minHeight;var board=root.shadowRoot?.querySelector('#cc-fretboard-host .cc-fb-scroll');if(board&&Number.isFinite(preserved.boardX))board.scrollLeft=preserved.boardX;preserved.positions.forEach(function(p){if(p.node.isConnected){p.node.scrollLeft=p.x;p.node.scrollTop=p.y;}});if(window.scrollX!==preserved.x||window.scrollY!==preserved.y)window.scrollTo(preserved.x,preserved.y);}
        }).catch(function(){if(root.isConnected)root.textContent='コード入力画面を読み込めませんでした。開き直してください。';});
    }
    function mountFormPerformance(root,owner,bar,tick,frame){
        var previous=root.parentElement?.querySelector('[data-form-performance]');if(previous)previous.remove();
        var event=bar.chords.find(function(c){return c.onsetTick===tick;});if(!event||!CS().localChordForms)return;
        var project=owner.workingSnapshot(),binding=project.performance.formBindings.find(function(b){return b.chordEventId===event.id;}),material=binding&&project.materials.forms.find(function(m){return m.id===binding.materialId;});
        var panel=document.createElement('details');panel.className='sc-form-performance';panel.dataset.formPerformance='';var summary=document.createElement('summary');summary.textContent='鳴らす弦・フォームの管理';panel.appendChild(summary);
        var analysis=CS().chordReadModel?.createAdapter({chordTheory:window.ChordCruise.theory,chordModel:window.ChordCruise.chordModel,studioTheory:CS().theory}).analyze(event.symbol);
        var info=document.createElement('p');info.textContent=analysis?.status==='ready'?'構成音：'+analysis.notes.join('・')+'　度数：'+analysis.degrees.join('・'):event.symbol;panel.appendChild(info);
        if(material){var checks=[];[1,2,3,4,5,6].forEach(function(n){var label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.dataset.playedString=n;check.checked=binding.playedStrings.includes(n);check.disabled=material.snapshot.strings[n-1].kind!=='note';label.append(check,document.createTextNode(n+'弦'));panel.appendChild(label);checks.push(check);});
            function commit(remove){if(!currentFrame(frame)||!editorCanMove())return;stopPianoAudition();finishTextInputs();var result=CS().localChordForms.configureStrings(owner,bar.id,event.id,checks.filter(function(c){return c.checked;}).map(function(c){return Number(c.dataset.playedString);}),remove);if(!result.ok){info.textContent=result.error||'使用する弦を確認してください';return;}renderPreview(true);refreshSessionStatus();if(root.isConnected)populateChordPicker(root);}
            var apply=document.createElement('button');apply.type='button';apply.textContent='使用する弦を適用';apply.dataset.applyPlayedStrings='';apply.addEventListener('click',function(){commit(false);});panel.appendChild(apply);
            var clear=document.createElement('button');clear.type='button';clear.textContent='フォーム解除';clear.dataset.removeChordForm='';clear.addEventListener('click',function(){commit(true);});panel.appendChild(clear);
        }else info.textContent+='（フォーム未登録）';root.after(panel);
    }
    function buildPianoPanel(){
        var root=document.createElement('section');root.dataset.doremiPiano='';root.className='doremi-piano';
        root.hidden=collapsedEditorRows.has('doremi');root.setAttribute('aria-label','ドレミ鍵盤');root.addEventListener('keydown',onPianoKeydown);populatePiano(root);return root;
    }
    function refreshPiano(){syncEditorDisclosures();var root=els.slotOverlay&&els.slotOverlay.querySelector('[data-doremi-piano]');if(root)populatePiano(root);}
    function syncPianoSelection(c){
        if(!els.slotOverlay)return;
        els.slotOverlay.querySelectorAll('.solfege-cell').forEach(function(host){
            var field=host.querySelector('input'),active=!!((piano.open||host.classList.contains('piano-color-mode'))&&c&&host.closest('.editor-measure')===editorRoot()&&Number(field.dataset.slotTick)===c.range.tick);
            host.classList.toggle('piano-selected-cell',active);host.querySelector('.solfege-colors').setAttribute('aria-hidden',String(!piano.open&&!host.classList.contains('piano-color-mode')));
            host.querySelectorAll('[data-piano-event]').forEach(function(token){var selected=active&&!piano.adding&&token.dataset.pianoEvent===piano.eventId;token.classList.toggle('piano-selected-note',selected);token.setAttribute('aria-pressed',String(selected));token.tabIndex=piano.open?0:-1;});
            var old=host.querySelector('[data-piano-pending]');if(old)old.remove();
            if(active&&piano.adding){var pending=document.createElement('span');pending.dataset.pianoPending='';pending.className='piano-pending-note';pending.textContent='＋';pending.setAttribute('aria-label','ここに次の音を追加');host.querySelector('.solfege-colors').appendChild(pending);}
        });
    }
    function focusPianoCell(c){
        if(collapsedEditorRows.has('doremi'))return;
        var field=editorRoot().querySelector('[data-overlay-field="doremi"][data-slot-tick="'+c.range.tick+'"]');
        if(field){field.parentElement.classList.add('piano-color-mode');field.focus({preventScroll:true});}syncPianoSelection(pianoContext());
    }
    function savePianoColors(){if(CS().storage?.setAppSetting){CS().storage.setAppSetting('solfegeOctaveColors',CS().sheetRenderer.getOctaveColors());CS().storage.setAppSetting('solfegeOctaveColorsVersion',2);}}
    function loadPianoColors(){
        var saved=CS().storage?.getAppSetting?.('solfegeOctaveColors'),version=CS().storage?.getAppSetting?.('solfegeOctaveColorsVersion');
        var old=[['#555c66'],['#526478','#287a43'],['#23685f','#1686a0'],[],['#435ca0'],['#76539a','#c8498a'],['#92552c','#8055ad'],['#99434f','#bb4583'],['#754561','#845b3b']];
        CS().sheetRenderer.setOctaveColors(null);var defaults=CS().sheetRenderer.getOctaveColors();
        if(Array.isArray(saved)){CS().sheetRenderer.setOctaveColors(version===2?saved:saved.map(function(color,i){return old[i]?.includes(String(color).toLowerCase())?defaults[i]:color;}));if(version!==2)savePianoColors();}
    }
    function repaintPianoColors(){
        els.slotOverlay.querySelectorAll('[data-overlay-field="doremi"]').forEach(function(field){if(field._refreshColors)field._refreshColors();});renderPreview(true);refreshPiano();
    }
    function togglePianoPanel(){var c=pianoContext();if(pianoBlocked(c))return;piano.open=!piano.open;if(!piano.open)stopPianoAudition();refreshPiano();var field=editorRoot().querySelector('[data-overlay-field="doremi"][data-slot-tick="'+c.range.tick+'"]');if(field)field.parentElement.classList.toggle('piano-color-mode',piano.open);if(piano.open){focusPianoCell(c);void ensurePianoBank().catch(function(){if(piano.open)setSaveStatus('ピアノ音源を読み込めませんでした。鍵盤を押して再試行してください。',true);});if(editorPlacement!=='right'){var area=getLoupeSafeArea();state.loupe.y=clampLoupeY(Math.min(state.loupe.y,area.bottom-area.bottomMargin-els.slotOverlay.scrollHeight-2));}els.slotOverlay.scrollTop=0;}positionSlotOverlay();}
    function populatePiano(root){
        var c=pianoContext();root.replaceChildren();if(!c)return;syncPianoSelection(c);
        function button(label,action,attrs){
            var b=document.createElement('button');b.type='button';b.textContent=label;
            Object.keys(attrs||{}).forEach(function(k){b.setAttribute(k,attrs[k]);});b.title=b.getAttribute('aria-label')||label;
            b.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();});
            b.addEventListener('click',function(e){e.stopPropagation();if(!b.isConnected)return;if(!currentFrame(c.frame)){pianoMessage('編集対象が更新されました。元の内容を保持しています。音を選び直して操作してください');return;}action();});return b;
        }
        root.classList.toggle('is-collapsed',!piano.open);
        els.slotOverlay.classList.toggle('piano-open',piano.open);
        var heading=document.createElement('div');heading.className='piano-heading';
        function changeTypingOctave(value){if(pianoBlocked(c))return;c.owner.finishTextGroup();typingOctaves.set(c.owner,value);refreshPiano();}
        var octave=typingOctave(c.owner),tonic=c.owner.draft.solfege.tonic,name=tonic.step+window.ChordCruise.theory.formatAccidental(tonic.alter);
        var octaveControls=document.createElement('div');octaveControls.className='piano-octave-controls';octaveControls.setAttribute('role','group');octaveControls.setAttribute('aria-label','入力オクターブ');
        [-1,1].forEach(function(dir){if(dir===1){var readout=document.createElement('output');readout.dataset.typingOctave='';readout.dataset.octave=octave;readout.textContent=name+octave;readout.title='直接入力する音のオクターブ。入力済みの音は変更しません';readout.setAttribute('aria-label','入力オクターブ '+name+octave);octaveControls.appendChild(readout);}var step=button(dir<0?'↓':'↑',function(){changeTypingOctave(Math.max(0,Math.min(8,octave+dir)));},{'data-typing-step':dir,'aria-label':dir<0?'入力と鍵盤を1オクターブ下げる':'入力と鍵盤を1オクターブ上げる'});step.disabled=pianoBlocked(c)||(dir<0?octave===0:octave===8);octaveControls.appendChild(step);});heading.appendChild(octaveControls);
        var left=document.createElement('div');left.className='piano-heading-left';while(heading.firstChild)left.appendChild(heading.firstChild);heading.appendChild(left);if(piano.open){var melody=buildBarPlayButton(true);melody.classList.add('piano-melody-center');heading.appendChild(melody);}if(piano.open)heading.appendChild(button('閉じる',function(){if(pianoBlocked(pianoContext()))return;piano.open=false;stopPianoAudition();els.slotOverlay.querySelectorAll('.piano-color-mode').forEach(function(e){e.classList.remove('piano-color-mode');});refreshPiano();},{'data-piano-close':'','aria-label':'メロディのカードを閉じる'}));else heading.appendChild(document.createElement('span'));
        root.appendChild(heading);
        if(!piano.open){if(piano.message){var notice=document.createElement('p');notice.className='piano-help';notice.setAttribute('role','status');notice.textContent=piano.message;root.appendChild(notice);}return;}
        var toolbar=document.createElement('div');toolbar.className='piano-controls';
        var add=button('＋',function(){if(!autoCellGroup(c.events,c.range.tick,c.range.span)&&!pianoAppendRange(c)){pianoMessage('このマスの末尾に空き時間がないため追加できません。既存の音価を保持しています。空のマスを選んでください');return;}piano.adding=true;piano.eventId=null;refreshPiano();focusPianoCell(c);},{'data-piano-add':'','aria-label':'同じマスに音を追加','aria-pressed':String(piano.adding)});
        add.disabled=pianoBlocked(c);add.title='同じマスに音を追加。手動の音価がある場合は空き時間だけを使います';toolbar.appendChild(add);
        [-1,1].forEach(function(direction){var nav=button(direction<0?'←':'→',function(){movePianoCell(direction);},{'data-piano-cell-nav':direction,'aria-label':direction<0?'前のマス':'次のマス'});nav.disabled=pianoBlocked(c);toolbar.appendChild(nav);});
        [['伸ばす','extend'],['消去','delete']].forEach(function(pair){
            var b=button(pair[1]==='extend'?'〜':pair[1]==='delete'?'⌫':'',function(){pianoWrite(c,pair[1]);},{'data-piano-action':pair[1],'aria-label':pair[0]});b.title=pair[0];
            if(pair[1]==='rest')b.appendChild(CS().sheetRenderer.createStrumRestSymbol(c.range.span));
            if(pair[1]==='extend'&&pianoExtension(c).removeId)b.title='選択音を前の音の伸ばしに置換（元に戻すで取消）';
            b.disabled=pianoBlocked(c)||(pair[1]==='delete'&&!c.event)||(pair[1]==='rest'&&piano.adding&&c.events.length>0);if(pair[1]==='extend'&&pianoExtendError(c))b.title=pianoExtendError(c);toolbar.appendChild(b);
        });
        var spacer=document.createElement('span');spacer.className='piano-spacer';toolbar.appendChild(spacer);
        if(piano.open)toolbar.appendChild(button(piano.sound?'音 ON':'音 OFF',function(){piano.sound=!piano.sound;if(!piano.sound)stopPianoAudition();refreshPiano();},{'data-piano-sound':'','aria-label':'鍵盤を押したときの試聴音を切り替える','aria-pressed':String(piano.sound)}));
        toolbar.appendChild(button('🎨',function(){piano.colorsOpen=!piano.colorsOpen;refreshPiano();},{'data-piano-colors':'','aria-label':'オクターブの色を変更','aria-expanded':String(piano.colorsOpen)}));root.appendChild(toolbar);
        if(piano.colorsOpen){
            var palette=document.createElement('div');palette.className='piano-palette';
            CS().sheetRenderer.getOctaveColors().forEach(function(color,octave){
                var label=document.createElement('label');label.textContent=octave===0?'A0':'C'+octave;
                var picker=document.createElement('input');picker.type='color';picker.value=color;picker.dataset.octaveColor=octave;picker.setAttribute('aria-label','オクターブ'+octave+'の色');picker.title='オクターブ'+octave+'の表示色を変更';
                picker.addEventListener('change',function(){if(!picker.isConnected||!currentFrame(c.frame))return;var colors=CS().sheetRenderer.getOctaveColors();colors[octave]=picker.value;CS().sheetRenderer.setOctaveColors(colors);savePianoColors();repaintPianoColors();});label.appendChild(picker);palette.appendChild(label);
            });
            palette.appendChild(button('初期色',function(){CS().sheetRenderer.setOctaveColors(null);savePianoColors();repaintPianoColors();},{'data-piano-colors-reset':''}));root.appendChild(palette);
        }
        var scroll=document.createElement('div');scroll.className='piano-key-scroll';var keyboard=document.createElement('div');keyboard.className='piano-keys';keyboard.setAttribute('aria-label','3オクターブのドレミ鍵盤');
        var windowOctave=Math.max(0,Math.min(6,octave-1)),first=Math.max(21,12*(windowOctave+1)),last=Math.min(108,12*(windowOctave+4)-1),whites=[],blacks=[];
        for(var midi=first;midi<=last;midi++){if([0,2,4,5,7,9,11].includes(midi%12))whites.push(midi);else blacks.push(midi);}
        keyboard.style.gridTemplateColumns='repeat('+whites.length+',minmax(0,1fr))';
        var selected=c.event&&c.event.kind==='note'?CS().model.schema2.pitchMidi(c.event.pitch):null;
        function key(midi,black){
            var pitch=pianoPitch(midi,c.owner.draft),label=pianoToken(pitch,c.owner.draft,true),absolute=pitch.step+(pitch.alter>0?'♯'.repeat(pitch.alter):'♭'.repeat(-pitch.alter))+pitch.octave;
            var b=button('',function(){if(pianoWrite(c,'pitch',midi))playPianoAudition(midi);},{'data-piano-midi':midi,'aria-label':label+' / '+absolute,'aria-pressed':String(midi===selected)});b.className=black?'piano-black':'piano-white';b.title=label+' / '+absolute;b.disabled=pianoBlocked(c);
            if(!black){var name=document.createElement('span');name.textContent=label;var value=document.createElement('small');value.textContent=midi%12===0?absolute:' ';b.append(name,value);b.style.color=CS().sheetRenderer.octaveColor(pitch.octave);}return b;
        }
        whites.forEach(function(midi){keyboard.appendChild(key(midi,false));});
        blacks.forEach(function(midi){var lower=whites.filter(function(n){return n<midi;}).length,k=key(midi,true),width=62/whites.length;k.style.width=width+'%';k.style.left=(lower*100/whites.length-width/2)+'%';keyboard.appendChild(k);});scroll.appendChild(keyboard);root.appendChild(scroll);
        var edges=document.createElement('div');edges.className='piano-range-edges';
        [-1,1].forEach(function(dir){var edge=button(dir<0?'←':'→',function(){changeTypingOctave(Math.max(0,Math.min(8,octave+dir)));},{'data-piano-range-step':dir,'aria-label':dir<0?'入力と鍵盤を1オクターブ下げる':'入力と鍵盤を1オクターブ上げる'});edge.disabled=pianoBlocked(c)||(dir<0?octave===0:octave===8);edges.appendChild(edge);});root.appendChild(edges);
        if(piano.message){var message=document.createElement('p');message.className='piano-help';message.setAttribute('role','status');message.textContent=piano.message;root.appendChild(message);}
        var credit=document.createElement('small');credit.className='piano-credit';credit.textContent='Piano: Alexander Holm / Guitar: Iowa · N. P. Brosowsky · CC BY 3.0';root.appendChild(credit);
    }

    function onPianoKeydown(event){
        if(event.isComposing||event.keyCode===229||state.session?.inputPending)return;
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();piano.open=false;stopPianoAudition();els.slotOverlay.querySelectorAll('.piano-color-mode').forEach(function(e){e.classList.remove('piano-color-mode');});refreshPiano();return;}
        if(event.key==='Tab'){
            var c=pianoContext(),field=c&&editorRoot().querySelector('[data-overlay-field="doremi"][data-slot-tick="'+c.range.tick+'"]');
            if(field){event.preventDefault();event.stopPropagation();field.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:event.shiftKey,bubbles:true,cancelable:true}));}
        }
    }

    function matchTypedNotes(before,after){
        var equal=function(a,b){return a.step===b.step&&a.alter===b.alter&&a.octave===b.octave;};
        var rows=Array.from({length:before.length+1},function(){return new Uint16Array(after.length+1);});
        for(var a=before.length-1;a>=0;a--)for(var b=after.length-1;b>=0;b--)rows[a][b]=equal(before[a],after[b])?1+rows[a+1][b+1]:Math.max(rows[a+1][b],rows[a][b+1]);
        var result=Array(after.length).fill(-1),a=0,b=0;while(a<before.length&&b<after.length){if(equal(before[a],after[b])){result[b++]=a++;}else if(rows[a+1][b]>=rows[a][b+1])a++;else b++;}return result;
    }
    // Each field owns an exact onset; no lossy whole-bar text reconstruction.
    function buildBeatTextRow(kind,bar,res) {
        var canonical=state.session.draft, source=canonical.bars[bar.barNumber-1];
        if(canonical.schemaVersion!==2)return buildOverlayInput({id:kind,label:kind==='chord'?'コード':'ドレミ'},bar);
        var wrap=document.createElement('div');
        var collection=kind==='chord'?'chords':'melody', owner=state.session, ranges=editorCellRanges(bar,res,kind);
        var groups=editorBeatGroups(wrap,bar,res,kind,ranges);
        ranges.forEach(function(range,index){var tick=range.tick,span=range.span;
            var events=source[collection].filter(function(e){return e.onsetTick>=tick&&e.onsetTick<tick+span;});
            var exact=events.length===1&&events[0].onsetTick===tick?events[0]:null, batch=kind==='doremi'&&(autoCellGroup(events,tick,span)||pitchCellGroup(events,tick));
            var input=document.createElement('input');input.type='text';input.className='slot-overlay-input';
            input.style.minWidth='0';input.style.width='100%';input.style.padding='0 3px';input.style.boxSizing='border-box';input.style.textAlign='center';
            input.style.minHeight=kind==='chord'?'max(26px, calc(30px * var(--bar-loupe-scale,1)))':'max(28px, calc(34px * var(--bar-loupe-scale,1)))';
            var boundary=lyricLocalBoundaryClass(range.slot,range.count,range.res,range.beat===getBeats(state.project)-1);
            input.classList.add(boundary);
            input.style.borderRight='1px solid var('+(boundary==='is-beat'?'--paper-line-beat':boundary==='is-8th'?'--paper-line-eighth':boundary==='is-16th'?'--paper-line-sixteenth':'--slot-border')+')';
            if(kind==='doremi'){input.style.fontFamily='var(--paper-font)';input.style.fontSize='max(11px, calc(13px * var(--bar-loupe-scale, 1)))';input.style.fontWeight='600';input.style.letterSpacing='0';}
            input.dataset.overlayField=kind;input.dataset.slotTick=tick;input.dataset.slotTicks=span;input.setAttribute('aria-label',bar.barNumber+'小節目の'+(kind==='chord'?'コード':'ドレミ')+' '+(tick/480+1)+'拍');
            input.value=kind==='chord'?(exact?(bar.chords.find(function(e){return e.tick===tick;})||{}).symbol||'':''):((exact&&exact.kind==='note')||batch?cellDoremiText(events,span,canonical):'');
            if(events.length && !exact && !batch){input.readOnly=true;input.value='…';input.title='この範囲には細かな位置のイベントがあります。元の時間情報を保持しています';}
            var composing=false,justComposed=false,nativeHistory=false,replacingAll=false,initial=input.value;
            function apply(composition,absoluteTokens,formMaterial,formMode){
                if(input.readOnly||!input.isConnected||state.session!==owner||owner.draft.bars[bar.barNumber-1]?.id!==source.id||composing)return {ok:false};
                if(input.value===initial&&!replacingAll&&!formMaterial&&formMode!=='auto'){input.setAttribute('aria-invalid','false');input.classList.remove('is-invalid');var prior=textDiagnostics.get(owner);if(prior)prior.delete(input);return {ok:true};}
                if(!operationEligible()&&!composition)return {ok:false};
                var raw=input.value.trim();
                var priorChord=owner.draft.bars.find(function(b){return b.id===source.id;})?.chords.find(function(e){return e.onsetTick===tick;}),fixedForm=priorChord&&owner.draft.performance.formBindings.some(function(b){return b.chordEventId===priorChord.id&&b.mode==='fixed';});
                var formAllowed=kind!=='chord'||!raw||!CS().localChordForms||fixedForm&&!formMaterial||CS().localChordForms.authorize(owner);
                var result=(composition?owner.runCompositionTextOperation:owner.runTextOperation)(JSON.stringify(['beat',kind,source.id,tick]),'拍位置の'+kind+'入力',function(p){
                    if(!formAllowed)throw Error('楽器条件の確認をキャンセルしました。入力内容は保存されていません');
                    var b=p.bars.find(function(b){return b.id===source.id;}), list=b[collection], old=list.find(function(e){return e.onsetTick===tick;});
                    if(kind==='chord'&&list.some(function(e){return e.onsetTick>tick&&e.onsetTick<tick+span;}))throw Error('細かな時間位置を持つイベントはこのセルで置換できません');
                    if(!raw){var clearing=list.filter(function(e){return e.onsetTick>=tick&&e.onsetTick<tick+span;});if(kind==='doremi'&&clearing.length>1&&!autoCellGroup(clearing,tick,span))throw Error('既存の細かな時間情報を保持しています');b[collection]=list.filter(function(e){return !clearing.includes(e);});if(kind==='chord'&&old)p.performance.formBindings=p.performance.formBindings.filter(function(f){return f.chordEventId!==old.id;});return;}
                    var api=CS().model.schema2;
                    if(kind==='chord'){
                        if(!CS().theory.parseBasicChordSymbol(raw))throw Error('コード名を確認してください');
                        var symbol=api.chord(raw,p.instrument.capo);if(symbol===null)throw Error('コード名を確認してください');
                        // An explicitly inserted chord establishes a new harmony boundary. Keep IDs and make this one undoable edit.
                        if(!old)list.forEach(function(e){if(e.durationTicks!==undefined&&e.onsetTick<tick&&e.onsetTick+e.durationTicks>tick)e.durationTicks=tick-e.onsetTick;});
                        if(old){old.symbol=symbol;old.unresolved=false;}else list.push({id:api.newId(),onsetTick:tick,symbol:symbol,unresolved:false,provenance:{origin:'user-set'}});
                        if(CS().localChordForms){var chordEvent=list.find(function(e){return e.onsetTick===tick;});if(formMaterial){CS().model.schema2.assertJson(formMaterial);CS().localChordForms.initialize(p);if(formMaterial.provenance.sourceSymbol!==chordEvent.symbol||formMaterial.snapshot.capo!==p.instrument.capo||JSON.stringify(formMaterial.snapshot.tuningMidi)!==JSON.stringify(p.instrument.tuning)||formMaterial.snapshot.maxAbsoluteFret!==p.instrument.maxAbsoluteFret)throw Error('本棚フォームの名前・楽器条件が一致しません');CS().localChordForms.install(p,chordEvent,formMaterial,formMode==='auto'?'auto':'fixed');}else{if(formMode==='auto')p.performance.formBindings=p.performance.formBindings.filter(function(b){return b.chordEventId!==chordEvent.id;});CS().localChordForms.syncEvent(p,chordEvent);}}
                    }else{
                        var parsed=CS().theory.parseDoremiString(raw);
                        if(parsed.warnings.length||!parsed.notes.length)throw Error('ドレミの表記を確認してください');
                        var units=parsed.notes.reduce(function(n,e){return n+1+e.extensions;},0);
                        if(units>span)throw Error('1マスに入力する音数が多すぎます。元の音を保持しました');
                        var cellEvents=list.filter(function(e){return e.onsetTick>=tick&&e.onsetTick<tick+span;});
                        var previous=CS().theory.parseDoremiString(initial).notes,keepTiming=parsed.notes.length===cellEvents.length&&parsed.notes.length===previous.length&&parsed.notes.every(function(n,i){return n.extensions===previous[i].extensions;});
                        if(cellEvents.length>1&&!autoCellGroup(cellEvents,tick,span)&&!keepTiming)throw Error('既存の細かな時間情報を保持しています');
                        if(units>1&&old&&!autoCellGroup(cellEvents,tick,span)&&!keepTiming)throw Error('既存の音価を変更するまとめ入力は適用できません。1音ずつ編集してください');
                        var tonic=p.solfege.tonic,key=tonic.step+window.ChordCruise.theory.formatAccidental(tonic.alter),scale=window.ChordCruise.theory.spellScaleNotes({tonicPc:CS().theory.keyToSemitone(key),tonicName:key,scaleId:'major'});
                        var matches=replacingAll?parsed.notes.map(function(){return -1;}):matchTypedNotes(previous,parsed.notes),reserved=new Set(matches.filter(function(n){return n>=0;})),used=new Set();
                        var cursor=tick,usedUnits=0;
                        var generated=parsed.notes.map(function(note,i){
                            var matched=matches[i]>=0?cellEvents[matches[i]]:null,index=matched?matches[i]:cellEvents.findIndex(function(e,j){return !reserved.has(j)&&!used.has(j);}),existing=index>=0?cellEvents[index]:null;used.add(index);
                            var duration=keepTiming?cellEvents[i].durationTicks:Math.floor(span*(usedUnits+1+note.extensions)/units)-Math.floor(span*usedUnits/units);usedUnits+=1+note.extensions;
                            var basis=absoluteTokens?tonic:Object.assign({},tonic,{octave:typingOctave(owner)});
                            var spelled=scale[note.step],midi=api.pitchMidi(basis)+[0,2,4,5,7,9,11][note.step]+note.alter+12*note.octave,alter=spelled.accidental+note.alter;
                            var pitch={step:spelled.letter,alter:alter,octave:(midi-({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[spelled.letter])-alter)/12-1};
                            var value=existing?JSON.parse(JSON.stringify(existing)):{id:api.newId(),provenance:api.timing('auto-assigned',false)};
                            value.kind='note';value.onsetTick=keepTiming?cellEvents[i].onsetTick:cursor;value.durationTicks=duration;value.pitch=matched&&matched.kind==='note'?JSON.parse(JSON.stringify(matched.pitch)):pitch;if(!keepTiming)value.provenance=api.timing('auto-assigned',false);cursor+=duration;return value;
                        });
                        var untouched=list.filter(function(e){return !cellEvents.includes(e);});
                        if(generated.some(function(a){return untouched.some(function(e){return e.onsetTick<a.onsetTick+a.durationTicks&&e.onsetTick+e.durationTicks>a.onsetTick;});}))throw Error('隣の音・休符と重なります。元の時間情報を保持しました');
                        b.melody=untouched.concat(generated).sort(function(a,b){return a.onsetTick-b.onsetTick;});
                    }
                    if(kind==='chord')list.sort(function(a,b){return a.onsetTick-b.onsetTick;});
                });
                input.setAttribute('aria-invalid',result.ok?'false':'true');input.classList.toggle('is-invalid',!result.ok);input.title=result.ok?'':result.error||'入力を確認してください';
                var diagnostics=textDiagnostics.get(owner);if(!diagnostics){diagnostics=new Map();textDiagnostics.set(owner,diagnostics);}
                if(result.ok)diagnostics.delete(input);else diagnostics.set(input,input.title);
                if(result.ok){initial=input.value;replacingAll=false;if(input._refreshColors)input._refreshColors();renderPreview(true);}else{setSaveStatus(input.title,true);refreshPiano();}
                return result;
            }
            input.addEventListener('compositionstart',function(){composing=true;input.classList.add('is-composing');owner.finishTextGroup();});
            input.addEventListener('compositionend',function(){composing=false;input.classList.remove('is-composing');justComposed=true;apply(true);setTimeout(function(){justComposed=false;},0);});
            input.addEventListener('beforeinput',function(e){if(kind==='doremi'&&e.inputType?.startsWith('insert')&&input.value.length&&input.selectionStart===0&&input.selectionEnd===input.value.length)replacingAll=true;nativeHistory=e.inputType==='historyUndo'||e.inputType==='historyRedo';if(nativeHistory)owner.finishTextGroup();});
            input.addEventListener('input',function(e){if(!e.isComposing&&!composing&&!justComposed)apply(false);if(nativeHistory){owner.finishTextGroup();nativeHistory=false;}});
            input.addEventListener('blur',function(){owner.finishTextGroup();});
            input.addEventListener('keydown',function(e){
                // Both typed and keyboard-picked solfege use Session history to retain exact octave metadata.
                if(kind==='doremi'&&(e.metaKey||e.ctrlKey)&&!e.altKey&&e.key.toLowerCase()==='z'){
                    e.stopPropagation();
                    if(!composing&&!e.isComposing&&!owner.inputPending)CS().shellHost.keyboard.localCommand(e,e.shiftKey?'studio.redo':'studio.undo','sheetCruise');
                    e.preventDefault();queueEditorFrame(function(){if(state.session!==owner||state.session.draft.bars[state.selectedBarNumber-1]?.id!==source.id)return;var next=editorRoot().querySelector('[data-overlay-field="doremi"][data-slot-tick="'+tick+'"]');if(next){if(piano.open)next.parentElement.classList.add('piano-color-mode');next.focus({preventScroll:true});}});return;
                }
                if(kind==='doremi'&&host?.classList.contains('piano-color-mode')&&['Backspace','Delete'].includes(e.key)&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
                    if(e.isComposing||e.keyCode===229||composing||justComposed||owner.inputPending)return;
                    e.preventDefault();e.stopPropagation();var selected=pianoContext();if(selected?.event)pianoWrite(selected,'delete');else if(host.querySelector('[data-piano-sustain]'))pianoMessage('伸ばしている音は先頭のマスで選んで消去してください');return;
                }
                if(kind==='doremi'&&host?.classList.contains('piano-color-mode')&&['~','〜','～'].includes(e.key)&&!e.isComposing&&e.keyCode!==229&&!composing&&!justComposed&&!owner.inputPending){e.preventDefault();e.stopPropagation();pianoWrite(pianoContext(),'extend');return;}
                if(routeLocalSave(e)||routeLocalEscape(e))return;e.stopPropagation();
                if(e.altKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();if(apply(false).ok)moveSelectedBar(e.key==='ArrowLeft'?-1:1,{focusRowId:kind});return;}
                if(!['Enter','ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Tab'].includes(e.key))return;e.preventDefault();
                if(e.isComposing||e.keyCode===229||composing||justComposed||owner.inputPending)return;
                var result=input.readOnly?{ok:true}:apply(false);if(!result.ok||input.getAttribute('aria-invalid')==='true')return;
                owner.finishTextGroup();
                if(kind==='doremi'&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){host.classList.add('piano-color-mode');movePianoCell(e.key==='ArrowLeft'?-1:1);return;}
                if(e.key==='ArrowUp'||e.key==='ArrowDown'){focusAdjacentRow(kind,tick,e.key==='ArrowUp'?-1:1);return;}
                if((e.key==='Enter'||e.key==='ArrowRight'||(e.key==='Tab'&&!e.shiftKey))&&index===ranges.length-1){moveSelectedBar(1,{focusRowId:kind});return;}
                if((e.key==='ArrowLeft'||(e.key==='Tab'&&e.shiftKey))&&index===0){moveSelectedBar(-1,{focusRowId:kind,focusLast:true});return;}
                var direction=e.key==='ArrowLeft'||(e.key==='Tab'&&e.shiftKey)?-1:1;
                var nextTick=ranges[Math.max(0,Math.min(ranges.length-1,index+direction))].tick;
                if(kind==='doremi'&&CS().theory.parseDoremiString(input.value).notes.length>1){renderSlotOverlayContent();queueEditorFrame(function(){var next=editorRoot().querySelector('[data-overlay-field="'+kind+'"][data-slot-tick="'+nextTick+'"]');if(next)next.focus();});}
                else{var next=wrap.querySelector('[data-slot-tick="'+nextTick+'"]');if(next)next.focus();}
            });
            if(kind==='doremi'){
                var host=document.createElement('div');host.className='solfege-cell';var colors=document.createElement('span');colors.className='solfege-colors';colors.setAttribute('aria-hidden','true');
                function refreshColors(){colors.replaceChildren();var events=owner.draft.bars.find(function(b){return b.id===source.id;})?.melody.filter(function(e){return e.onsetTick>=tick&&e.onsetTick<tick+span;})||[];
                            input.style.color=events.length&&events.every(function(e){return e.kind==='note'&&e.pitch.octave===events[0].pitch?.octave;})?CS().sheetRenderer.octaveColor(events[0].pitch.octave):'var(--paper-doremi)';
                    var unit=events.length===1?events[0].durationTicks:span;function gcd(a,b){while(b){var r=a%b;a=b;b=r;}return a;}events.forEach(function(e){unit=gcd(unit,e.durationTicks);});
                    events.forEach(function(e){var token=document.createElement('span');if(e.kind==='rest'){token.appendChild(CS().sheetRenderer.createStrumRestSymbol(e.durationTicks));token.style.color='#746e65';}else token.textContent=pianoToken(e.pitch,owner.draft,true)+(e.onsetTick+e.durationTicks<=tick+span?'〜'.repeat(Math.min(16,Math.max(e.provenance.timing.onset.origin==='auto-assigned'&&e.provenance.timing.duration.origin==='user-set'?1:0,e.durationTicks/unit-1))):'');if(e.kind==='note'){token.style.color=CS().sheetRenderer.octaveColor(e.pitch.octave);token.dataset.noteOctave=e.pitch.octave;}token.dataset.pianoEvent=e.id;token.setAttribute('role','button');token.setAttribute('aria-label',(e.kind==='rest'?'休符':pianoToken(e.pitch,owner.draft,true)+' オクターブ'+e.pitch.octave)+'を編集');
                        token.addEventListener('pointerdown',function(event){if(piano.open){event.preventDefault();event.stopPropagation();}});
                        function choose(event){if(!piano.open||!token.isConnected||state.session!==owner||state.session.draft.bars[state.selectedBarNumber-1]?.id!==source.id)return;event.preventDefault();event.stopPropagation();bindPianoCell(owner,source.id,tick,span);piano.eventId=e.id;piano.adding=false;refreshPiano();focusPianoCell(pianoContext());}token.addEventListener('click',choose);token.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' ')choose(event);else if(piano.open&&['Delete','Backspace'].includes(event.key)&&!event.isComposing&&event.keyCode!==229){choose(event);pianoWrite(pianoContext(),'delete');}});colors.appendChild(token);});
                    if(!events.length){var held=owner.draft.bars.find(function(b){return b.id===source.id;})?.melody.find(function(e){return e.kind==='note'&&e.onsetTick<tick&&e.onsetTick+e.durationTicks>tick;});if(held){var wave=document.createElement('span');wave.textContent='〜';wave.dataset.pianoSustain='';wave.style.color=CS().sheetRenderer.octaveColor(held.pitch.octave);wave.title='前の音を伸ばしています';colors.appendChild(wave);}}
                }

                input._applyBeatValue=function(value){input.value=value;return apply(false,true);};input._refreshColors=refreshColors;
                ['beforeinput','input','compositionstart'].forEach(function(type){input.addEventListener(type,function(){host.classList.remove('piano-color-mode');});});
                input.addEventListener('focus',function(){bindPianoCell(owner,source.id,tick,span);if(piano.open)host.classList.add('piano-color-mode');});host.append(input,colors);refreshColors();groups[range.beat].appendChild(host);
            }else {input._applyBeatValue=function(value,formMaterial,formMode){input.value=value;return apply(false,false,formMaterial,formMode);};input.addEventListener('focus',function(){bindChordCell(owner,source.id,tick);});groups[range.beat].appendChild(input);}
        });
        return wrap;
    }

    // Navigation uses time positions, so different subdivisions still share a column.
    function focusAdjacentRow(rowId,tick,direction){
        var visibleRows=DOCK_ROW_ORDER.filter(function(id){return !collapsedEditorRows.has(id);}),target=visibleRows[visibleRows.indexOf(rowId)+direction];
        if(!target||!els.slotOverlay)return;
        finishTextInputs();
        queueEditorFrame(function(){
            var selector=target==='lyrics'?'.dock-lyrics-cell':target==='strum'?'.dock-strum-cell':'[data-overlay-field="'+target+'"]';
            var cells=Array.from(editorRoot().querySelectorAll(selector));
            var cell=cells.filter(function(e){return Number(e.dataset.slotTick)<=tick;}).pop();
            if(cell)cell.focus({preventScroll:true});
        });
    }

    function getSelectedBarIndex() {
        if (!state.project || !state.selectedBarNumber) return -1;
        for (var i = 0; i < state.project.bars.length; i++) {
            if (state.project.bars[i].barNumber === state.selectedBarNumber) return i;
        }
        return -1;
    }

    function getMoveTarget(delta) {
        if (!state.project || !Array.isArray(state.project.bars) || state.project.bars.length === 0) return null;
        var index = getSelectedBarIndex();
        if (index < 0) return null;
        var nextIndex = Math.max(0, Math.min(state.project.bars.length - 1, index + delta));
        return state.project.bars[nextIndex] || null;
    }

    function focusOverlayField(rowId,last) {
        if (!rowId || !els.slotOverlay||collapsedEditorRows.has(rowId)) return;
        queueEditorFrame(function () {
            var selector=rowId==='strum'?'.dock-strum-cell':rowId==='lyrics'?'.dock-lyrics-cell':'[data-overlay-field="'+rowId+'"]';
            var cells=editorRoot().querySelectorAll(selector),cell=cells[last?cells.length-1:0];
            if(cell)cell.focus({preventScroll:true});
        });
    }

    function moveSelectedBar(delta, options) {
        finishTextInputs();
        var target = getMoveTarget(delta);
        if (!target || target.barNumber === state.selectedBarNumber) return;
        stopPianoAudition();
        state.selectedBarNumber = target.barNumber;
        state.overlayWarnings = {};
        state.overlayBulkMessage = null;
        syncSheetSelection();
        if (options && options.focusRowId) focusOverlayField(options.focusRowId,options.focusLast);
    }

    function commitActiveOverlayInput(options) {
        if (!els.slotOverlay) return null;
        var active = document.activeElement;
        if (!active) return null;
        if (active.dataset && active.dataset.overlayField) {
            applyOverlayFieldChange(active.dataset.overlayField, active, options || { skipRender: true });
            return active.dataset.overlayField;
        }
        // D3a: ストロークセルは編集のたびに即保存されているため、ここではフォーカス先だけ伝える
        if (active.classList && active.classList.contains('dock-strum-cell')) {
            return 'strum';
        }
        // F2a: 歌詞セルも編集のたびに即保存されているため、ここではフォーカス先だけ伝える
        if (active.classList && active.classList.contains('dock-lyrics-cell')) {
            return 'lyrics';
        }
        return null;
    }

    function buildOverlayNavButton(label, delta) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'slot-overlay-nav-btn';
        button.textContent = label;
        button.disabled = !getMoveTarget(delta) || getMoveTarget(delta).barNumber === state.selectedBarNumber;
        button.addEventListener('click', function (event) {
            event.stopPropagation();
            var focusRowId = commitActiveOverlayInput({ skipRender: true });
            moveSelectedBar(delta, { focusRowId: focusRowId });
        });
        button.addEventListener('mousedown', function (event) {
            event.stopPropagation();
        });
        button.addEventListener('keydown', function (event) {
            if (routeLocalSave(event) || routeLocalEscape(event)) return;
            event.stopPropagation();
        });
        return button;
    }

    /* ══════════ D3a: 下部ドックのタイムグリッド（拍ルーラー・ストロークセル編集） ══════════
       Fable5レビュー「選択小節のX線写真」方針。紙面と同じ段順（コード/ストローク/歌詞/ドレミ）を
       選択小節の時間軸のまま横に拡大する。本格的にセル編集するのはストローク行のみ。
       コードは1小節1コードの大きな1セル、歌詞・ドレミは見た目だけ時間軸に揃えた1つの入力欄
       （tick位置セルへの分解はD3bで扱う）。 */

    function getBeats(project) {
        var ts = project && project.songInfo && project.songInfo.timeSignature;
        return (ts && typeof ts.beats === 'number' && ts.beats > 0) ? ts.beats : 4;
    }

    /**
     * 境界線（セル右端）の強弱class。紙面のタイミンググリッド（sheet-renderer.js内の
     * buildTimingGridと同じ判定基準）に合わせる: 小節端 ＞ 拍頭 ＞ 8分位置 ＞ 16分位置。
     */
    function timelineBoundaryClass(boundary, res, slotsPerBeat) {
        if (boundary >= res) return 'is-barend';
        if (boundary % slotsPerBeat === 0) return 'is-beat';
        if (res === 16) return (boundary % 2 === 0) ? 'is-8th' : 'is-16th';
        return 'is-8th';
    }

    /* ══════════ G1: 拍グループ構造化（docs/DECISIONS.md ADR-029） ══════════
       行（拍ルーラー/ストローク/歌詞/コード・ドレミ背面線）のタイムライン部分を、
       「拍グループ（均等幅・flex） × 拍内スロット（slotsPerBeatのgrid）」の
       二段構造で組み立てる共通ヘルパー。全行がこの1つの関数だけを経由することで、
       拍・8分・16分の境界線のx座標が行をまたいで完全に一致する。
       G1は見た目とDOM構造だけのリファクタであり、セル数・tick位置・index順序・
       解像度の意味は一切変えない（既存の timelineBoundaryClass をそのまま使う）。 */

    /**
     * 拍グループを container の直下へ組み立てる。buildSlot(globalIndex, slotsPerBeat) が
     * 返すDOM要素を、拍0のスロット0..slotsPerBeat-1 → 拍1のスロット0.. という
     * 既存のフラットなセルindexと完全に同じ順序でDOMへ追加する
     * （querySelectorAll等の取得順・data-cell-indexの意味は不変）。
     */
    function populateBeatGroups(container, res, buildSlot) {
        var beats = getBeats(state.project);
        var slotsPerBeat = res / beats;
        for (var b = 0; b < beats; b++) {
            var group = document.createElement('div');
            group.className = 'beat-group';
            group.dataset.beatIndex = String(b);
            group.style.gridTemplateColumns = 'repeat(' + slotsPerBeat + ', 1fr)';
            for (var s = 0; s < slotsPerBeat; s++) {
                var globalIndex = b * slotsPerBeat + s;
                group.appendChild(buildSlot(globalIndex, slotsPerBeat));
            }
            container.appendChild(group);
        }
    }

    /**
     * コード・ドレミ行（1小節1入力を維持）の背面に敷く、装飾専用の拍/8分/16分縦線。
     * populateBeatGroups() を使うため、拍ルーラー・ストローク・歌詞セルと
     * 完全に同じx座標で線が揃う。クリック・キャレット操作を妨げないよう
     * pointer-events:none・aria-hidden・入力欄より背面（CSS側で z-index 制御）とする。
     */
    function buildTimelineBackground(res) {
        var bg = document.createElement('div');
        bg.className = 'slot-overlay-timeline-bg beat-groups';
        bg.setAttribute('aria-hidden', 'true');
        populateBeatGroups(bg, res, function (globalIndex, slotsPerBeat) {
            var slot = document.createElement('span');
            slot.className = 'slot-overlay-timeline-slot ' +
                timelineBoundaryClass(globalIndex + 1, res, slotsPerBeat);
            return slot;
        });
        return bg;
    }

    /**
     * ルーペ全体（コード/ストローク/歌詞/ドレミの拍ルーラー等）が共有する時間軸の
     * 必要解像度判定はストローク由来のみとする（G2b / ADR-030）。
     * F2a〜G1時点では歌詞のtickも判定に含めていたが、G2bで歌詞行が拍別ローカル解像度を
     * 持てるようになったため、歌詞データを理由に全体設定を16分へ強制することは廃止した
     * （歌詞は「自動」のときヘッダーの全体設定へ追従するだけで、データ由来の自動昇格はしない）。
     */
    function isStrumDataForcedSixteenth(bar) {
        var slots = CS().model.getBarEffectiveStrumSlots(state.project, bar.barNumber);
        return Array.isArray(slots)&&CS().model.barNeedsSixteenthResolution({ strumSlots: slots });
    }

    /**
     * 小節の共有時間軸解像度（8 or 16）。拍ルーラー・ストロークセル・コード/ドレミ背面線・
     * 歌詞の「自動」拍が使う。「データから必要な解像度」（ストローク由来のみ。G2b）と
     * 「ユーザーが一時的に選んだ解像度」（state.dockManualRes。barNumberごとに保持。
     * _proto/slot-editor.js の barResOverride と同じ思想でUI一時状態のみ）の大きい方を使う。
     */
    function getStrumGridResolution(bar) {
        var dataRes = isStrumDataForcedSixteenth(bar) ? 16 : 8;
        var manualRes = (state.dockManualRes[bar.barNumber] === 16) ? 16 : 8;
        return Math.max(dataRes, manualRes);
    }

    function isStrumGridForcedSixteenth(bar) {
        return isStrumDataForcedSixteenth(bar);
    }

    /**
     * 8分ボタンをdisabledにする理由（ツールチップ文言）。G2b: 全体8分ロックは
     * ストローク由来のみに限定した（歌詞由来のロックは廃止。歌詞は拍別ローカル指定または
     * 全体設定への追従のみで、16分位置データによる自動昇格はしない）。
     */
    function getForcedSixteenthReason(bar) {
        var slots = CS().model.getBarEffectiveStrumSlots(state.project, bar.barNumber);
        var strumForced = !!(Array.isArray(slots) && CS().sheetRenderer.strumNeedsSixteenth(slots));
        if (strumForced) return 'ストロークに16分位置があるため8分表示にはできません';
        return '';
    }

    /* ══════════ G2b: 歌詞の拍別ローカル解像度（docs/DECISIONS.md ADR-030） ══════════
       実効解像度の優先順位は2段階だけ: 1) その拍のローカル指定（state.lyricBeatRes）
       2) ヘッダーの全体8分/16分設定（getStrumGridResolution）。歌詞データのtickを
       理由に自動的に16分へ昇格する処理は行わない（「自動」は必ず全体設定に追従する）。 */

    // Existing UI-only Session/bar store, namespaced by row. Lyrics and solfege share numeric beat keys.
    // Chord/strum settings never enter Project, JSON, Repository or Undo history.
    function lyricBeatStore(bar) {
        if(!bar.sourceId)return {store:state.lyricBeatRes,key:bar};
        var store=state.lyricBeatResV2.get(state.session);
        if(!store){store=new Map();state.lyricBeatResV2.set(state.session,store);}
        return {store:store,key:bar.sourceId};
    }
    function getLyricBeatLocalRes(bar, beatIndex, rowId) {
        var owner=lyricBeatStore(bar),map=owner.store.get(owner.key);
        if (!map) return null;
        var v = map.get(rowId&&rowId!=='lyrics'?rowId+':'+beatIndex:beatIndex);
        return (v === 8 || v === 16) ? v : null;
    }

    /**
     * res が null なら自動へ戻す（Mapからローカル指定を削除する）。
     */
    function setLyricBeatLocalRes(bar, beatIndex, res, rowId) {
        var key=rowId&&rowId!=='lyrics'?rowId+':'+beatIndex:beatIndex;
        var owner=lyricBeatStore(bar),map=owner.store.get(owner.key);
        if (res !== 8 && res !== 16) {
            if (map) map.delete(key);
            return;
        }
        if (!map) {
            map = new Map();
            owner.store.set(owner.key, map);
        }
        map.set(key, res);
    }

    /**
     * 拍beatIndexの実効解像度。ローカル指定があればそれを、無ければ全体設定
     * （globalRes）を返す。
     */
    function getLyricBeatEffectiveRes(bar, globalRes, beatIndex, rowId) {
        var local = getLyricBeatLocalRes(bar, beatIndex, rowId);
        return local || globalRes;
    }

    /**
     * 拍別ローカル解像度ボタンのクリックサイクル。
     * 全体が8分で自動状態: 自8 → 16 → 8 → 自8
     * 全体が16分で自動状態: 自16 → 8 → 16 → 自16
     * つまり自動からの最初のクリックは必ず全体設定と逆の解像度へ固定し、
     * 見た目が必ず変化するようにする。ローカル固定同士を1往復した後、再度押すと自動へ戻る。
     * @returns {8|16|null} 次の状態（nullは自動へ戻すことを意味する）
     */
    function nextLyricBeatResState(isAuto, local, globalRes) {
        var opposite = (globalRes === 8) ? 16 : 8;
        if (isAuto) return opposite;
        if (local === opposite) return globalRes;
        return null;
    }

    /**
     * 拍内でのセル境界の強弱class（is-beat/is-8th/is-16th/is-barend）を、
     * その拍「だけ」のローカル解像度基準で求める（G2b）。既存の timelineBoundaryClass は
     * 小節全体で単一の解像度を前提にしたグローバルboundary番号を使うため、拍ごとに
     * 解像度が異なりうる歌詞行では使えない。1拍分に閉じた同等ロジックとして実装する
     * （全拍が同じ解像度のときは timelineBoundaryClass と完全に同じ結果になる）。
     */
    function lyricLocalBoundaryClass(slotIndexInBeat, slotsPerBeat, beatRes, isLastBeat) {
        var boundaryWithinBeat = slotIndexInBeat + 1;
        if (boundaryWithinBeat >= slotsPerBeat) {
            return isLastBeat ? 'is-barend' : 'is-beat';
        }
        if (beatRes === 16) {
            return (boundaryWithinBeat % 2 === 0) ? 'is-8th' : 'is-16th';
        }
        return 'is-8th';
    }

    /**
     * ローカル拍ボタン・全体8分/16分ボタンの両方が使う、解像度変更前の安全処理（G2b）。
     * 1) 現在フォーカス中の要素が歌詞セルで、かつIME変換中なら何もせず中止する
     *    （{ok:false}を返す。呼び出し側は解像度状態を変更してはいけない）
     * 2) 歌詞セルがアクティブなら、変更があるときだけG2aの無変更ガード経由で1回だけ
     *    commitする（無変更なら書き込まない。renderPreviewはさせない= skipRender）
     * 3) フォーカス復元用に、そのセルのtick・選択範囲・値をキャプチャして返す
     * 呼び出し側は、続けて解像度状態を変更し、renderSlotOverlayContent()を1回だけ呼び、
     * 戻り値のsnapshotをrestoreLyricCellFocusAfterRender()等でフォーカス復元に使う
     * （G2aのtick中心フォールバック: 同tick→含む→直前→先頭をそのまま再利用する）。
     */
    function prepareLyricResolutionChange(bar) {
        // Subdivision also rebuilds solfege: preserve uncommitted/invalid buffers.
        if(!operationEligible()||textDiagnostic(state.session)||els.slotOverlay.querySelector('.is-composing')){
            setSaveStatus('入力を確定・修正してから8／16分を切り替えてください。',true);
            return {ok:false};
        }
        var active = document.activeElement;
        var isLyricCell = !!(active && active.classList && active.classList.contains('dock-lyrics-cell'));
        if (!isLyricCell) return { ok: true, snapshot: null };

        var slotTick = Number(active.dataset.slotTick);
        if (state.lyricComposingTick === slotTick) {
            return { ok: false }; // IME変換中は切替を実行しない
        }
        var snapshot = captureLyricCellFocus(slotTick, active);
        if(!commitLyricCell(bar, active, slotTick, { skipRender: true }))return {ok:false};
        return { ok: true, snapshot: snapshot };
    }

    /**
     * prepareLyricResolutionChange()とセットで使う、再描画＋フォーカス復元の共通処理。
     */
    function finishLyricResolutionChange(bar, snapshot) {
        var expectedBarNumber = bar.barNumber;
        renderSlotOverlayContent();
        renderPreview(true);
        if (snapshot) restoreLyricCellFocusAfterRender(snapshot, expectedBarNumber);
    }

    function effectiveStrumSlots(bar){
        return CS().model.getBarEffectiveStrumSlots(state.project,bar.barNumber)||[];
    }
    function strumCellState(bar,range){
        var slots=effectiveStrumSlots(bar),end=range.tick+range.span;
        var starts=slots.filter(function(e){return e.tick>=range.tick&&e.tick<end;});
        var previous=slots.filter(function(e){return e.tick<range.tick;}).pop();
        var exact=starts.find(function(e){return e.tick===range.tick;});
        return {
            action:exact?exact.action:previous&&previous.tick+(previous.durationTicks||1)>range.tick?(previous.action==='rest'?'rest':'sustain'):'empty',
            protected:starts.some(function(e){return e.tick!==range.tick;}),
            canSustain:!!(previous&&previous.action!=='rest'&&(previous.tick+(previous.durationTicks||1)>=range.tick||(previous.durationTicks===undefined&&previous.tick===range.previousTick)))
        };
    }
    function nextStrumCellAction(current,canSustain,up){
        var cycle=up?['up','down','mute','sustain','rest','empty']:STRUM_CELL_CYCLE;
        var next=cycle[(cycle.indexOf(current)+1)%cycle.length];
        // A stretch needs a preceding stroke; never invent one or get stuck here.
        return next==='sustain'&&!canSustain?'rest':next;
    }

    function focusStrumCellAfterRender(index) {
        queueEditorFrame(function () {
            if (!els.slotOverlay) return;
            var cell = editorRoot().querySelector('.dock-strum-cell[data-cell-index="' + index + '"]');
            if (cell) cell.focus({ preventScroll: true });
        });
    }

    function focusStrumCellByIndex(index) {
        if (!els.slotOverlay) return;
        var grid = editorRoot().querySelector('.dock-strum-grid');
        if (!grid) return;
        var cells = grid.querySelectorAll('.dock-strum-cell');
        if (cells.length === 0) return;
        var clamped = Math.max(0, Math.min(cells.length - 1, index));
        cells[clamped].focus({ preventScroll: true });
    }

    /**
     * ストロークセル1つを変更して保存する。基本ストローク継承中（override未作成）の
     * 小節は、現在の継承内容を丸ごとコピーしたうえで1セルだけ変えた形で
     * setBarStrumSlots() に渡す＝これが「最初の編集で小節専用override化」になる。
     */
    function applyStrumCellAction(bar, ranges, index, action, focusIndex) {
        var range=ranges[index];if(!range)return;
        var cell=strumCellState(bar,range);
        if(cell.protected){setSaveStatus('細かな位置のストロークを保持しています。16分表示で編集してください。',true);return;}
        if(action==='sustain'&&!cell.canSustain){
            setSaveStatus('「〜」は直前のストロークを伸ばすマスに入力してください。');return;
        }
        // Work on exact legacy slots; do not quantize or reconstruct the whole bar.
        // The existing structure operation owns canonical publication and history.
        var slots=JSON.parse(JSON.stringify(effectiveStrumSlots(bar)));
        var old=slots.find(function(e){return e.tick===range.tick;});
        var previous=slots.filter(function(e){return e.tick<range.tick;}).pop();
        var previousEnd=previous?previous.tick+(previous.durationTicks||1):0;
        slots=slots.filter(function(e){return e!==old;});
        var end=range.tick+range.span;
        // A rest split preserves confirmed silence outside the edited interval.
        function restTail(event){
            var tailEnd=event&&event.action==='rest'?event.tick+(event.durationTicks||1):0;
            if(tailEnd>end){var tail=JSON.parse(JSON.stringify(event));tail.tick=end;tail.durationTicks=tailEnd-end;slots.push(tail);}
        }
        restTail(old);
        if(previous&&previous.action==='rest'&&previousEnd>range.tick){restTail(previous);previous.durationTicks=range.tick-previous.tick;}
        if(action==='sustain'){
            previous.durationTicks=Math.max(previousEnd,end,old&&old.action!=='rest'?old.tick+(old.durationTicks||1):0)-previous.tick;
            if(old&&old.action!=='rest'&&old.tieToNext)previous.tieToNext=true;
        }else{
            if(previous&&previous.action!=='rest'&&previousEnd>range.tick){previous.durationTicks=range.tick-previous.tick;delete previous.tieToNext;}
            if(action!=='empty'){
                var value=old||{tick:range.tick,accent:false};
                value.action=action;
                if(action==='rest') {value.durationTicks=range.span;value.accent=false;delete value.tieToNext;}
                else if(!old||cell.action==='rest')value.durationTicks=Math.max(end,previous&&previous.action!=='rest'?previousEnd:0)-range.tick;
                slots.push(value);
            }
        }
        slots.sort(function(a,b){return a.tick-b.tick;});
        if(JSON.stringify(slots)===JSON.stringify(effectiveStrumSlots(bar)))return;
        if (!runStructureOperation('strum', { barNumber: bar.barNumber, slots: slots,keepEmpty:true }).ok) return;
        markDirty();renderPreview();
        focusStrumCellAfterRender(typeof focusIndex === 'number' ? focusIndex : index);
    }

    /**
     * 「基本に戻す」。override を外して基本ストロークの継承へ戻す
     * （setBarStrumSlotsに空配列を渡すと override=null になる既存挙動を利用）。
     */
    function resetBarStrumOverride(bar) {
        if (!runStructureOperation('resetStrum', { barNumber: bar.barNumber }).ok) return;
        markDirty();
        renderPreview();
    }

    function onStrumCellKeydown(event, bar, ranges, index, currentAction) {
        if (routeLocalHistory(event)) return;
        if (routeLocalSave(event) || routeLocalEscape(event)) return;
        if (event.isComposing || event.keyCode === 229 || CS().shellHost.keyboard.isIMEBlocked({})) return;
        var key = event.key;
        event.stopPropagation();
        if(event.shiftKey&&(key==='ArrowUp'||key==='ArrowDown')){
            event.preventDefault();focusAdjacentRow('strum',ranges[index].tick,key==='ArrowUp'?-1:1);return;
        }

        if (event.altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
            event.preventDefault();
            moveSelectedBar(key === 'ArrowLeft' ? -1 : 1, { focusRowId: 'strum' });
            return;
        }
        if (key === 'ArrowRight') {
            event.preventDefault();
            if(index===ranges.length-1)moveSelectedBar(1,{focusRowId:'strum'});else focusStrumCellByIndex(index + 1);
            return;
        }
        if (key === 'ArrowLeft') {
            event.preventDefault();
            if(index===0)moveSelectedBar(-1,{focusRowId:'strum',focusLast:true});else focusStrumCellByIndex(index - 1);
            return;
        }
        if (key === 'ArrowDown' || key === 'd' || key === 'D') {
            event.preventDefault();
            applyStrumCellAction(bar,ranges,index,key==='ArrowDown'?nextStrumCellAction(currentAction,strumCellState(bar,ranges[index]).canSustain,false):'down');
            return;
        }
        if (key === 'ArrowUp' || key === 'u' || key === 'U') {
            event.preventDefault();
            applyStrumCellAction(bar,ranges,index,key==='ArrowUp'?nextStrumCellAction(currentAction,strumCellState(bar,ranges[index]).canSustain,true):'up');
            return;
        }
        if (key === 'x' || key === 'X') {
            event.preventDefault();
            applyStrumCellAction(bar, ranges, index, 'mute');
            return;
        }
        if(key==='〜'||key==='～'||key==='~'){
            event.preventDefault();applyStrumCellAction(bar,ranges,index,'sustain');return;
        }
        if (key === ' ' || key === 'Spacebar' || key==='r' || key==='R') {
            // ネイティブのbutton click（=セル循環）を誘発しないよう、rest確定はこちらで処理する
            event.preventDefault();
            applyStrumCellAction(bar, ranges, index, 'rest');
            return;
        }
        if (key === 'Delete' || key === 'Backspace') {
            event.preventDefault();
            applyStrumCellAction(bar, ranges, index, 'empty');
            return;
        }
        if (key === 'Enter') {
            event.preventDefault();
            if(index===ranges.length-1)moveSelectedBar(1,{focusRowId:'strum'});
            else focusStrumCellAfterRender(index + 1);
            return;
        }
        if(key==='Tab'){event.preventDefault();if(!event.shiftKey&&index===ranges.length-1)moveSelectedBar(1,{focusRowId:'strum'});else if(event.shiftKey&&index===0)moveSelectedBar(-1,{focusRowId:'strum',focusLast:true});else focusStrumCellAfterRender(index+(event.shiftKey?-1:1));return;}
        // Keep cell navigation within this row.
        event.stopPropagation();
    }

    function buildStrumGridRow(bar, res) {
        var ranges=editorCellRanges(bar,res,'strum');
        var wrap=document.createElement('div');wrap.className='dock-strum-grid'+(!bar.strumOverride?' is-inherited':'');
        wrap.dataset.overlayField='strum';wrap.title=getStrumGridStatusText(bar);
        var groups=editorBeatGroups(wrap,bar,res,'strum',ranges);
        ranges.forEach(function(range,index){
            var value=strumCellState(bar,range),action=value.action;
            var cell=document.createElement('button');cell.type='button';
            cell.className='dock-strum-cell is-'+action+' '+lyricLocalBoundaryClass(range.slot,range.count,range.res,range.beat===getBeats(state.project)-1);
            cell.textContent=value.protected?'…':action==='rest'?strumRestGlyph(range.span):STRUM_GLYPHS[action]||'';
            cell.dataset.strumState=action;
            if(!value.protected&&(action==='rest'||action==='down'||action==='up')){cell.textContent='';cell.appendChild(action==='rest'?CS().sheetRenderer.createStrumRestSymbol(range.span):CS().sheetRenderer.createStrumArrow(action));}
            if(value.protected){cell.setAttribute('aria-readonly','true');cell.title='この範囲の細かなストロークを保持しています。16分表示で編集してください。';}
            cell.dataset.cellIndex=index;cell.dataset.slotTick=range.tick;cell.dataset.slotTicks=range.span;
            cell.addEventListener('focus',function(){cell.style.boxShadow='inset 0 0 0 2px var(--slot-focus)';cell.style.position='relative';cell.style.zIndex='1';});
            cell.addEventListener('blur',function(){cell.style.boxShadow='';cell.style.zIndex='';});
            var meaning=action==='empty'?'未入力':action==='rest'?(range.span===120?'16分休符の表示区間':'8分休符の表示区間'):action==='sustain'?'直前のストロークを伸ばす':STRUM_GLYPHS[action]||'';
            cell.setAttribute('aria-label',bar.barNumber+'小節目 ストローク '+(index+1)+'マス目（'+meaning+'）');
            if(!value.protected)cell.title=meaning+' / R／Space:休符 / Delete:未入力';
            cell.addEventListener('click',function(event){event.stopPropagation();applyStrumCellAction(bar,ranges,index,nextStrumCellAction(action,value.canSustain,false));});
            cell.addEventListener('mousedown',function(event){event.stopPropagation();});
            cell.addEventListener('keydown',function(event){onStrumCellKeydown(event,bar,ranges,index,action);});
            groups[range.beat].appendChild(cell);
        });
        return wrap;
    }

    /**
     * ストローク行の状態メモ（基本継承中 / override中 / 空）。
     * 行の高さを消費しないよう、常時表示のテキストではなく title（ツールチップ）にする。
     * ゴースト表示（.is-inherited）と「基本に戻す」ボタンの有無で視覚的にも状態が分かる。
     */
    function getStrumGridStatusText(bar) {
        var basic = CS().model.getBasicStrumText(state.project);
        if (bar.strumOverride) return '小節別に編集中（基本ストロークとは別内容）';
        if (basic) return '基本ストロークを継承表示中。セルを編集すると小節専用になります';
        return 'まだ何も入力されていません。セルをクリックまたはキーボードで入力できます';
    }

    /* ══════════ F2a/G2a: 歌詞セル編集（docs/DECISIONS.md ADR-028。tick中心化はG2a） ══════════
       歌詞行を、ストローク行と同じ時間軸のセル（8 or 16マス）に分解して編集する。
       1セル＝1 bar.lyrics イベント。既存のtick:0全文データは自動分割せず先頭セルへ
       そのまま表示する（後方互換）。入力欄は<input>（strumのようなbuttonではなく
       IME変換を受けるテキストフィールド）。IME中は commit / markDirty / 再描画をしない
       3層ガード（keydown isComposing・compositionstartのcomposing状態・
       compositionend直後のjustComposedフラグ）でSafariのEnter誤爆にも対応する。
       G2a: G2b（拍別8分/16分混在）に備え、セルの位置管理をセルindexからtick
       （data-slot-tick / data-slot-ticks）中心へ移した。data-cell-indexは表示順・
       aria-label・互換確認用として残すが、フォーカス復元・ナビゲーション・commit対象の
       正はtickになる。G2aは全セルが一律解像度のため、ユーザーから見た移動順・
       セル数・入力結果はF2a時点と完全に同じ（機能等価リファクタ）。
       あわせて「無変更commit防止」を導入: 表示された初期値（input._initialValue）と
       現在値が一致する場合は setBarLyricSlot・markDirty・renderPreview のいずれも
       呼ばない（G2bで8分セルへ16分イベント2個を集約表示した際、編集せずblurしただけで
       複数イベントが1イベントへ統合されてしまう事故を防ぐための前提整備）。 */

    /**
     * ルーペ内の歌詞セルをDOM順（=tick昇順）の配列として取得する。
     */
    function getOrderedLyricCells() {
        if (!els.slotOverlay) return [];
        var grid = editorRoot().querySelector('.dock-lyrics-grid');
        if (!grid) return [];
        return Array.prototype.slice.call(grid.querySelectorAll('.dock-lyrics-cell'));
    }

    /**
     * 指定tickに対応するセルを安全にフォールバックしながら探す。
     * 1. slotTickが完全一致するセル
     * 2. そのtickを含む範囲 [slotTick, slotTick+slotTicks) のセル
     * 3. それも無ければ、直前（slotTickが最大でtick以下）のセル
     * 4. 最終的に先頭セル
     * G2aでは全セルが一律解像度のため常に1で見つかるが、G2b以降の解像度混在・
     * 切替後にも使えるようこのフォールバック構造にしてある。
     */
    function findLyricCellByTick(cells, tick) {
        if (!cells || cells.length === 0) return null;
        for (var i = 0; i < cells.length; i++) {
            if (Number(cells[i].dataset.slotTick) === tick) return cells[i];
        }
        for (var j = 0; j < cells.length; j++) {
            var st = Number(cells[j].dataset.slotTick);
            var sd = Number(cells[j].dataset.slotTicks);
            if (tick >= st && tick < st + sd) return cells[j];
        }
        var best = null;
        cells.forEach(function (c) {
            var cst = Number(c.dataset.slotTick);
            if (cst <= tick && (!best || cst > Number(best.dataset.slotTick))) best = c;
        });
        return best || cells[0];
    }

    /**
     * currentSlotTickのセルから見て、direction（+1/-1）方向へ隣接するセルのtickを返す。
     * 両端では同じtickを返す（クランプ）。G2aでは全セルが一律解像度で並んでいるため、
     * 見た目の移動順はF2a時点のindex+1/-1と完全に同じになる。
     */
    function getAdjacentLyricCellTick(cells, currentSlotTick, direction) {
        if (!cells || cells.length === 0) return currentSlotTick;
        var idx = -1;
        for (var i = 0; i < cells.length; i++) {
            if (Number(cells[i].dataset.slotTick) === currentSlotTick) { idx = i; break; }
        }
        if (idx === -1) {
            var fallback = findLyricCellByTick(cells, currentSlotTick);
            idx = cells.indexOf(fallback);
            if (idx === -1) idx = 0;
        }
        var targetIdx = Math.max(0, Math.min(cells.length - 1, idx + direction));
        return Number(cells[targetIdx].dataset.slotTick);
    }

    function focusLyricCellByTick(tick) {
        var cells = getOrderedLyricCells();
        var cell = findLyricCellByTick(cells, tick);
        if (!cell) return;
        cell.focus({ preventScroll: true });
        try {
            var v = cell.value;
            cell.setSelectionRange(v.length, v.length);
        } catch (_) {
            // テキスト入力以外に拡張された場合の保険。
        }
    }

    function captureLyricCellFocus(slotTick, input) {
        var active = document.activeElement;
        if (!input || active !== input) return null;
        return {
            frame: contentFrame(),
            slotTick: slotTick,
            slotTicks: Number(input.dataset.slotTicks), // G4後修正: range幅。restoreLyricCellFocus()の
            // value/selection復元をrange一致セルだけに限定するために保持する（ADR-030後修正参照）。
            value: input.value,
            selectionStart: typeof input.selectionStart === 'number' ? input.selectionStart : null,
            selectionEnd: typeof input.selectionEnd === 'number' ? input.selectionEnd : null
        };
    }

    /**
     * expectedBarNumberは「このsnapshot/フォーカス移動の元になったcommit」が
     * 行われた時点で選択されていた小節番号。rAF発火時にstate.selectedBarNumberが
     * それと違っていたら、その間にAlt+矢印などで別の小節へ選択が移っている
     * ということなので、古いコールバックは何もせず捨てる（別小節セルへの誤書き込み防止）。
     * renderPreview()はscheduleOverlayPosition()経由で同じ小節のルーペをもう一度
     * 再描画することがあるため、判定は「再描画されたか」ではなく「選択小節が
     * 変わったか」で行う（同一小節の再描画は正常にフォーカス復元してよいため）。
     *
     * G4後修正（G2b由来の不具合対応）: フォーカス先の決定（findLyricCellByTick()の
     * 同tick→含む範囲→直前→先頭フォールバック）と、value/selectionの復元は別条件で
     * 判断する。フォーカス先はフォールバックしてよいが、value/selectionは
     * 「切替前後でslotTick・slotTicksが完全に一致する、全く同じrangeのセルへ
     * 戻す場合」だけに限定する。解像度切替（拍別ボタン・全体8分/16分ボタン）で
     * セルのrangeが変わった場合、findLyricCellByTick()のフォールバックは
     * 別range（集約セルや分解後セル）へ着地することがあり、そこへ切替前セルの
     * 部分的なvalueを代入すると、再描画で正しくセットされたproject由来の値
     * （集約後の連結文字列や分解後の個別文字列）を上書きしてしまう。この上書きは
     * DOM表示だけでなく、以後のblur/Enter/Tab等でG2aの無変更commit防止
     * （input._initialValueとの比較）を誤って通過させ、setBarLyricSlot()経由で
     * projectデータの一部（例: 集約前の複数イベントの片方）を消してしまう危険がある。
     * rangeが変わった場合は、再描画済みDOMの値（project由来）を正としてそのまま残す。
     */
    function restoreLyricCellFocus(snapshot, expectedBarNumber) {
        if (!snapshot || !currentFrame(snapshot.frame) || !els.slotOverlay) return;
        if (typeof expectedBarNumber === 'number' && state.selectedBarNumber !== expectedBarNumber) return;
        var cell = findLyricCellByTick(getOrderedLyricCells(), snapshot.slotTick);
        if (!cell) return;
        cell.focus({ preventScroll: true });
        var sameRange = Number(cell.dataset.slotTick) === snapshot.slotTick &&
            Number(cell.dataset.slotTicks) === snapshot.slotTicks;
        if (!sameRange) return; // range不一致: フォーカスのみ行い、value/selectionはproject由来のまま残す
        if (cell.value !== snapshot.value) cell.value = snapshot.value;
        if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
            try {
                cell.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
            } catch (_) {
                // テキスト入力以外に拡張された場合の保険。
            }
        }
    }

    function restoreLyricCellFocusAfterRender(snapshot, expectedBarNumber) {
        restoreLyricCellFocus(snapshot, expectedBarNumber);
        queueEditorFrame(function () {
            restoreLyricCellFocus(snapshot, expectedBarNumber);
        });
    }

    /**
     * 歌詞セル1つを確定保存する。位置はinputEl.dataset.slotTick/slotTicksから読む
     * （tick中心化。G2a）。model層（setBarLyricSlot）はrenderPreview・markDirty・
     * 保存を一切行わないため、ここでUI層としてそれらを担当する。
     *
     * 無変更commit防止（G2a最重要要件）: inputEl.value が表示時点の初期値
     * （inputEl._initialValue）と完全に同じ場合は、setBarLyricSlot・markDirty・
     * renderPreviewのいずれも呼ばない。書き込みが成功した場合のみ_initialValueを
     * 新しい値へ更新し、以後のblur等での二重commitを防ぐ。この比較はUI層の生の
     * input.value同士で行い、setBarLyricSlot内部で行われるtrim等の正規化は比較の
     * 前段では一切行わない（未編集なのに変更扱いになることを避けるため）。
     *
     * focusTick省略時（連続入力・IME確定など）は同じセルへカーソル位置ごと復元し、
     * 指定時（Enter/Tab/矢印などの明示的な移動）は移動先セルの末尾へフォーカスする。
     * 無変更でfocusTickが指定された場合（例: 何も編集せずTabだけ押した）は、
     * 書き込み・再描画をせずそのセルへ直接フォーカスするだけにとどめる。
     * options.skipRender: trueのときはmodelの更新のみ行い、render・フォーカス移動は
     * 呼び出し側に任せる（Alt+矢印での小節移動の直前など）。
     */
    function commitLyricCell(bar, inputEl, focusTick, options) {
        var opts = options || {};
        var info=textControls.get(inputEl);
        if(!inputEl.isConnected||!info||info.session!==state.session||bar.barNumber!==state.selectedBarNumber||info.composing)return false;
        var model = CS().model;
        var slotTick = Number(inputEl.dataset.slotTick);
        var slotTicks = Number(inputEl.dataset.slotTicks);
        var changed = inputEl.value !== inputEl._initialValue;

        if (changed) {
            var result = applyTextInput(inputEl, opts.event);
            if (!result.ok || result.deferred) return false;
            inputEl._initialValue = inputEl.value;
            markDirty();
            syncBarGridInput('lyrics', bar.barNumber, model.getBarLyricsText(getSelectedBar()), []);
        }

        if(inputEl.getAttribute('aria-invalid')==='true')return false;
        if (opts.skipRender) return true;

        if (!changed) {
            if (typeof focusTick === 'number' && focusTick !== slotTick) {
                focusLyricCellByTick(focusTick);
            }
            return true;
        }

        var snapshot = captureLyricCellFocus(slotTick, inputEl);
        var expectedBarNumber = bar.barNumber;
        renderPreview(true);
        if (typeof focusTick === 'number' && focusTick !== slotTick) {
            queueEditorFrame(function () {
                if (state.selectedBarNumber !== expectedBarNumber) return;
                focusLyricCellByTick(focusTick);
            });
        } else if (snapshot) {
            restoreLyricCellFocusAfterRender(snapshot, expectedBarNumber);
        }
        return true;
    }

    /**
     * 歌詞行「小節全体の最終セル」でEnterが押された場合の処理（G4）。
     * 現在のセルを1回だけ確定し（G2aの無変更ガード込み。Alt+←/→と全く同じ
     * commitLyricCell(..., {skipRender:true})パターンを再利用するため、無変更なら
     * setBarLyricSlot/markDirtyを呼ばない）、曲全体の正規順序で次小節へ移動する。
     * 「正規順序」「セクション境界を越える」「1回だけ再描画」「移動先の先頭セルへの
     * フォーカス・キャレット方針」は、既存のgetMoveTarget()/moveSelectedBar()
     * （前へ/次へ・Alt+←/→が使うのと同じ関数）をそのまま再利用することで自動的に満たす。
     * skipRender:trueのcommitLyricCellは新しいrAF/setTimeoutを一切予約しないため、
     * 小節切替後に古いコールバックが誤って動く心配はない。ただ1つ残る非同期処理は
     * 各セルのblurハンドラのsetTimeout(0)だが、実行時にinput.isConnectedを見て
     * 既にDOMから外れていれば何もしないという既存の安全策（F2a以来）で十分に防げる
     * （renderSlotOverlayContent()がinnerHTML='' で古いinputを破棄するため）。
     * 次小節が存在しない場合（曲全体の最終小節）は、小節を移動せず現在のセルへ留まる。
     * 新しい小節・セクションは作らず、moveSelectedBar()を呼ばないため不要な再描画もしない。
     */
    function commitLyricCellAndMoveToNextBar(bar, input, slotTick) {
        if(!commitLyricCell(bar, input, slotTick, { skipRender: true }))return;
        var target = getMoveTarget(1);
        if (!target || target.barNumber === state.selectedBarNumber) {
            setSaveStatus('最後の小節です。次の小節はありません。');
            return;
        }
        moveSelectedBar(1, { focusRowId: 'lyrics' });
    }

    /**
     * 歌詞セルのkeydown。IME 3層ガードの1つ目（isComposing / keyCode 229 /
     * このセルが変換中フラグ中）と、compositionend直後のjustComposedガード（Safari対策で
     * IME確定のEnterがisComposing=falseで届く場合に、セル移動として誤動作させない）。
     * Escapeだけは局所ownerとしてShell routerへ委譲する。
     * ポップオーバー→右pane→セル編集解除→ルーペ終了の順序を中央で解決する。
     */
    function onLyricCellKeydown(event, bar) {
        if (routeLocalSave(event) || routeLocalEscape(event)) return;
        event.stopPropagation();

        var input = event.currentTarget;
        var slotTick = Number(input.dataset.slotTick);

        if (event.isComposing || event.keyCode === 229 || state.lyricComposingTick === slotTick || CS().shellHost.keyboard.isIMEBlocked({})) return;

        var key = event.key;

        if (state.lyricJustComposed && ['Enter','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key)) {
            // Safari等でIME確定のEnterがisComposing=falseとして届く場合の保険。
            // compositionendで既に確定保存済みのため、ここではセル移動させず消費するだけ。
            event.preventDefault();
            state.lyricJustComposed = false;
            return;
        }

        if (event.altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
            event.preventDefault();
            if(!commitLyricCell(bar, input, slotTick, { skipRender: true }))return;
            moveSelectedBar(key === 'ArrowLeft' ? -1 : 1, { focusRowId: 'lyrics' });
            return;
        }

        var cells = getOrderedLyricCells();
        if(key==='ArrowUp'||key==='ArrowDown'){
            event.preventDefault();
            if(commitLyricCell(bar,input,slotTick))focusAdjacentRow('lyrics',slotTick,key==='ArrowUp'?-1:1);
            return;
        }

        if (key === 'Enter') {
            event.preventDefault();
            // G4: 小節全体の最終セル（DOM順=tick昇順で最後）でのEnterだけ次小節へ移動する。
            // 各拍の最後ではなく、getOrderedLyricCells()が返す実際の最終DOM要素で判定する
            // ため、mixed resolutionでもセル数・tickのハードコードは不要。
            if(cells[cells.length-1]===input)commitLyricCellAndMoveToNextBar(bar,input,slotTick);
            else commitLyricCell(bar, input, getAdjacentLyricCellTick(cells, slotTick, 1));
            return;
        }
        if (key === 'Tab') {
            event.preventDefault();
            var dir = event.shiftKey ? -1 : 1;
            if((dir===1&&cells[cells.length-1]===input)||(dir===-1&&cells[0]===input)){
                if(commitLyricCell(bar,input,slotTick,{skipRender:true}))moveSelectedBar(dir,{focusRowId:'lyrics',focusLast:dir===-1});
            }else commitLyricCell(bar, input, getAdjacentLyricCellTick(cells, slotTick, dir));
            return;
        }
        if (key === 'ArrowRight') {
            event.preventDefault();
            if(cells[cells.length-1]===input){
                if(commitLyricCell(bar,input,slotTick,{skipRender:true}))moveSelectedBar(1,{focusRowId:'lyrics'});
            }else commitLyricCell(bar, input, getAdjacentLyricCellTick(cells, slotTick, 1));
            return;
        }
        if (key === 'ArrowLeft') {
            event.preventDefault();
            if(cells[0]===input){
                if(commitLyricCell(bar,input,slotTick,{skipRender:true}))moveSelectedBar(-1,{focusRowId:'lyrics',focusLast:true});
            }else commitLyricCell(bar, input, getAdjacentLyricCellTick(cells, slotTick, -1));
            return;
        }
        if (key === 'Backspace') {
            if (input.value === '') {
                var prevTick = getAdjacentLyricCellTick(cells, slotTick, -1);
                if (prevTick !== slotTick) {
                    event.preventDefault();
                    focusLyricCellByTick(prevTick);
                }
            }
            // 空でなければ通常の文字削除に任せる
            return;
        }
        if (key === 'Delete') {
            event.preventDefault();
            input.value = '';
            commitLyricCell(bar, input, slotTick);
            return;
        }
        // Space・通常の文字入力キーはIMEを妨げないよう素通しする
    }

    /**
     * 歌詞セル1つ分の<input>を組み立てる（G2b: mixed resolution対応のため
     * buildLyricsGridRowから切り出した）。IME 3層ガード・無変更commit防止・
     * tick中心ナビゲーションはF2a/G2aのものをそのまま使う（挙動不変）。
     * isMultiセル（8分セルに複数の16分イベントが集約表示されている等）は、
     * titleへ全文と「編集確定すると統合される」旨の説明を付け加える。
     */
    function buildLyricCellInput(bar, slotTick, slotTicks, cellInfo, boundaryClass, ariaIndex) {
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'dock-lyrics-cell ' + boundaryClass +
            (cellInfo.text ? ' has-content' : '') + (cellInfo.isMulti ? ' is-multi' : '');
        input.style.letterSpacing='0';input.style.boxSizing='border-box';
        input.value = cellInfo.text;
        input._initialValue = cellInfo.text; // G2a: 無変更commit防止用の表示済み初期値
        input.dataset.slotTick = String(slotTick);
        input.dataset.slotTicks = String(slotTicks);
        input.dataset.cellIndex = String(ariaIndex); // 表示順・aria-label・互換確認用（位置管理の正ではない）
        input.setAttribute('aria-label', bar.barNumber + '小節目 歌詞 ' + (ariaIndex + 1) + 'マス目' +
            (cellInfo.isMulti ? '（複数位置の歌詞が集約表示中）' : ''));
        if (cellInfo.isMulti) {
            input.title = cellInfo.text +
                '\n複数位置の歌詞をまとめて表示中。編集して確定すると、このセルの範囲へ統合されます。';
        } else if (cellInfo.text) {
            input.title = cellInfo.text;
        }

        wireTextControl(input, { kind: 'lyrics', barNumber: bar.barNumber, tick: slotTick, ticks: slotTicks }, function (event) {
            commitLyricCell(bar, input, slotTick, { event: event });
        });
        input.addEventListener('compositionstart', function () { state.lyricComposingTick = slotTick; input.classList.add('is-composing'); });
        input.addEventListener('compositionend', function () {
            input.classList.remove('is-composing'); state.lyricComposingTick = null; state.lyricJustComposed = true;
            window.setTimeout(function () { state.lyricJustComposed = false; }, 0);
        });
        input.addEventListener('keydown', function (event) {
            onLyricCellKeydown(event, bar);
        });
        input.addEventListener('blur', function () {
            if (state.lyricComposingTick === slotTick) return;
            var frame = contentFrame();
            window.setTimeout(function () {
                // Tab/Enter/矢印等の明示操作が既にこのセルをcommitして再描画済みなら
                // このinputはDOMから外れている（多重commit・再描画によるフォーカス
                // 奪還を防ぐ）。
                if (!input.isConnected || !currentFrame(frame)) return;
                commitLyricCell(bar, input);
                finishTextInputs();
            }, 0);
        });
        input.addEventListener('click', function (event) { event.stopPropagation(); });
        input.addEventListener('mousedown', function (event) { event.stopPropagation(); });

        return input;
    }

    /**
     * 拍beatIndexの右下に置く、歌詞のローカル解像度切替ボタン（G2b）。
     * 自動状態: 「自8」「自16」（全体設定に追従中）。ローカル固定: 「8」「16」。
     * クリックサイクル・安全処理（IME中は無操作・編集中セルの保全）は
     * nextLyricBeatResState() / prepareLyricResolutionChange() を参照。
     */
    function buildLyricBeatResButton(bar, beatIndex, globalRes, rowId) {
        rowId=rowId||'lyrics';
        var local = getLyricBeatLocalRes(bar, beatIndex, rowId);
        var isAuto = (local === null);
        var effectiveRes = local || globalRes;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.resolutionRow=rowId;
        btn.className = 'dock-lyrics-beat-res-btn' + (isAuto ? ' is-auto' : ' is-local');
        // v0.22.3後修正: ユーザー最終決定により、表示テキストは常に有効解像度の数字
        // だけ（自動「自8/自16」・固定「固8/固16」という接頭辞文字は廃止）にする。
        // 固定状態は代わりにCSS側（.dock-lyrics-beat-res-btn.is-local::before）が
        // currentColorのモノクロ線画アイコン（南京錠。Unicode絵文字は不使用）を
        // 表示することで区別する。状態サイクル・内部値（WeakMapへ保持する8/16の数値）・
        // 変数名・className（is-auto/is-local）は無変更。
        btn.textContent = String(effectiveRes);

        var stateText = isAuto ?
            ('全体設定へ自動追従中（現在は' + globalRes + '分）') :
            ('この拍だけ' + effectiveRes + '分に固定中。全体設定を変えても追従しません');
        var next = nextLyricBeatResState(isAuto, local, globalRes);
        var nextText = (next === null) ?
            'クリックすると、自動追従へ戻します' :
            ('クリックすると、この拍だけ' + next + '分に固定します');
        var label = (beatIndex + 1) + '拍目の'+(rowId==='lyrics'?'歌詞・ドレミ':DOCK_ROW_LABELS[rowId])+'セル解像度: ' + stateText + '。' + nextText;
        btn.title = label;
        btn.setAttribute('aria-label', label);

        btn.addEventListener('click', function (event) {
            event.stopPropagation();
            switchLyricBeatResolution(bar, beatIndex, rowId);
        });
        btn.addEventListener('mousedown', function (event) { event.stopPropagation(); });
        // G2b: pointerdown preventDefaultで編集中セルの先行blurを止める
        // （理由はbuildResolutionToggle()内の同種コメントを参照）。
        btn.addEventListener('pointerdown', function (event) {
            event.preventDefault();
            event.stopPropagation();
        });

        return btn;
    }

    /**
     * 拍別ローカル解像度ボタンのクリック処理本体（G2b）。安全処理→状態変更→
     * 1回だけ再描画→フォーカス復元、の順を厳守する。
     */
    function switchLyricBeatResolution(bar, beatIndex, rowId) {
        var prep = prepareLyricResolutionChange(bar);
        if (!prep.ok) return; // IME変換中は何もしない

        var globalRes = getStrumGridResolution(bar);
        var local = getLyricBeatLocalRes(bar, beatIndex, rowId);
        var isAuto = (local === null);
        var next = nextLyricBeatResState(isAuto, local, globalRes);
        setLyricBeatLocalRes(bar, beatIndex, next, rowId);

        finishLyricResolutionChange(bar, prep.snapshot);
    }

    /**
     * 歌詞行のDOMを組み立てる（G2b: 拍ごとに異なる解像度が混在しうる）。
     * 外側の拍グループ構造（拍の数だけ均等幅）はG1のpopulateBeatGroups()と同じ考え方だが、
     * 拍内のスロット数が拍ごとに変わりうるため、専用のループで組み立てる。
     * 各拍の実効解像度からセルrangeを一括生成し、getBarLyricSlotRanges()（G2a）で
     * まとめて読み出す。8分セルの範囲に複数の16分イベントが入っていれば、tick順に
     * 連結されたテキストとisMultiが返る（bar.lyrics自体は変更しない）。
     * DOM順は必ずslotTick昇順（拍0の左端スロット→…→拍最後の右端スロット）。
     */
    function buildLyricsGridRow(bar, globalRes) {
        var model = CS().model;
        var beats = getBeats(state.project);
        var barTicks = model.getBarLengthTicks(state.project);
        var beatTicks = barTicks / beats;

        var wrap = document.createElement('div');
        wrap.className = 'dock-lyrics-grid beat-groups';
        wrap.dataset.overlayField = 'lyrics';

        var beatResList = [];
        var ranges = [];
        var rangeMeta = [];
        for (var b = 0; b < beats; b++) {
            var beatRes = getLyricBeatEffectiveRes(bar, globalRes, b);
            beatResList.push(beatRes);
            var slotsPerBeat = beatRes / beats;
            var slotTicksInBeat = beatTicks / slotsPerBeat;
            for (var s = 0; s < slotsPerBeat; s++) {
                ranges.push({ slotTick: b * beatTicks + s * slotTicksInBeat, slotTicks: slotTicksInBeat });
                rangeMeta.push({ beatIndex: b, slotIndexInBeat: s, slotsPerBeat: slotsPerBeat, beatRes: beatRes });
            }
        }
        var cellInfos = model.getBarLyricSlotRanges(state.project, bar.barNumber, ranges);

        var cursor = 0;
        var globalCellIndex = 0;
        for (var bi = 0; bi < beats; bi++) {
            var slotsPerBeatForBeat = beatResList[bi] / beats;
            var isLastBeat = (bi === beats - 1);

            var group = document.createElement('div');
            group.className = 'beat-group dock-lyrics-beat-group';
            group.dataset.beatIndex = String(bi);

            var cellsWrap = document.createElement('div');
            cellsWrap.className = 'dock-lyrics-beat-cells';
            cellsWrap.style.gridTemplateColumns = 'repeat(' + slotsPerBeatForBeat + ', 1fr)';

            for (var si = 0; si < slotsPerBeatForBeat; si++) {
                var range = ranges[cursor];
                var cellInfo = cellInfos[cursor];
                var meta = rangeMeta[cursor];
                cursor++;

                var boundaryClass = lyricLocalBoundaryClass(meta.slotIndexInBeat, meta.slotsPerBeat, meta.beatRes, isLastBeat);
                var input = buildLyricCellInput(bar, range.slotTick, range.slotTicks, cellInfo, boundaryClass, globalCellIndex);
                globalCellIndex++;
                cellsWrap.appendChild(input);
            }

            group.appendChild(cellsWrap);
            group.appendChild(buildLyricBeatResButton(bar, bi, globalRes));
            wrap.appendChild(group);
        }
        return wrap;
    }

    function buildBeatRuler(bar, res) {
        var ruler = document.createElement('div');
        ruler.className = 'slot-overlay-ruler';

        var spacer = document.createElement('span');
        spacer.className = 'slot-overlay-ruler-label';
        ruler.appendChild(spacer);

        var track = document.createElement('div');
        track.className = 'slot-overlay-ruler-track beat-groups';
        populateBeatGroups(track, res, function (globalIndex, slotsPerBeat) {
            var cell = document.createElement('span');
            var boundary = globalIndex + 1;
            cell.className = 'slot-overlay-ruler-cell ' + timelineBoundaryClass(boundary, res, slotsPerBeat);
            if (globalIndex % slotsPerBeat === 0) {
                cell.classList.add('is-beat-head');
                cell.textContent = String(Math.floor(globalIndex / slotsPerBeat) + 1) + '拍';
            } else if (res === 8 && slotsPerBeat === 2 && globalIndex % slotsPerBeat === 1) {
                cell.classList.add('is-offbeat-dot');
            }
            return cell;
        });
        ruler.appendChild(track);
        return ruler;
    }

    function buildResolutionToggle(bar) {
        var res = getStrumGridResolution(bar);
        var forced = isStrumGridForcedSixteenth(bar);

        var wrap = document.createElement('div');
        wrap.className = 'slot-overlay-res-toggle';

        var btn8 = document.createElement('button');
        btn8.type = 'button';
        btn8.className = 'slot-overlay-res-btn';
        btn8.textContent = '8分';
        btn8.classList.toggle('is-active', res === 8);
        btn8.disabled = forced;
        btn8.title = forced ? getForcedSixteenthReason(bar) : '';
        btn8.addEventListener('click', function (event) {
            event.stopPropagation();
            // G2b: 全体解像度ボタンも歌詞セルの編集中内容を保全してから切り替える
            var prep = prepareLyricResolutionChange(bar);
            if (!prep.ok) return;
            delete state.dockManualRes[bar.barNumber];
            finishLyricResolutionChange(bar, prep.snapshot);
        });

        var btn16 = document.createElement('button');
        btn16.type = 'button';
        btn16.className = 'slot-overlay-res-btn';
        btn16.textContent = '16分';
        btn16.classList.toggle('is-active', res === 16);
        btn16.addEventListener('click', function (event) {
            event.stopPropagation();
            var prep = prepareLyricResolutionChange(bar);
            if (!prep.ok) return;
            state.dockManualRes[bar.barNumber] = 16;
            finishLyricResolutionChange(bar, prep.snapshot);
        });

        [btn8, btn16].forEach(function (b) {
            b.addEventListener('mousedown', function (event) { event.stopPropagation(); });
            // G2b: pointerdownでpreventDefaultし、ボタンへのネイティブフォーカス移動
            // （＝編集中の歌詞セルの先行blur）を止める。これによりclickハンドラ内で
            // document.activeElementがまだ編集中の歌詞セルのままとなり、
            // prepareLyricResolutionChange()が正しく検出・commitできる
            // （先にネイティブblurが起きると、その委譲commitがsetTimeoutの次tickになり、
            // 同期的なrenderSlotOverlayContent()より後回しになって編集内容が消えるため）。
            b.addEventListener('pointerdown', function (event) {
                event.preventDefault();
                event.stopPropagation();
            });
        });

        wrap.appendChild(btn8);
        wrap.appendChild(btn16);
        return wrap;
    }

    /* ══════════ F1: フローティング小節ルーペの位置・サイズ（docs/DECISIONS.md ADR-027） ══════════
       「選択小節そのものを拡大した、紙面の上に浮かぶもう一枚の紙」。
       position: fixed のまま bottom固定をやめ、x/y座標で自由配置する。
       位置・幅はUI状態としてのみ扱い、projectデータ・schemaVersionには影響しない。
       cruiseStudio.appSettings の barLoupe キーへ保存する（storage.getAppSetting/setAppSetting）。 */

    function isNarrowViewport() {
        return getLoupeSafeArea().width < LOUPE_NARROW_BREAKPOINT;
    }

    /**
     * ルーペ幅のクランプ。ShellではMain実幅の左右余白内に収める。
     * 280pxの操作幅も可用幅より大きくしない。狭幅でも範囲内でresizeできる。
     */
    function clampLoupeWidth(width) {
        var area = getLoupeSafeArea();
        var vw = area.width;
        var maxW = Math.max(1, Math.min(LOUPE_MAX_WIDTH, vw - (area.contain ? 16 : LOUPE_MAX_WIDTH_MARGIN)));
        var minW = Math.min(area.contain ? 280 : LOUPE_MIN_WIDTH, maxW);
        var w = (typeof width === 'number' && isFinite(width)) ? width : LOUPE_DEFAULT_WIDTH;
        return Math.max(minW, Math.min(maxW, w));
    }

    /**
     * 水平位置のクランプ。Shellのcontain領域では左右をMain境界内に保つ。
     * standalone fallbackのみ従来の120px可視制約を使う。
     */
    function clampLoupeX(x, width) {
        var vw = getLoupeSafeArea().width;
        var area = getLoupeSafeArea();
        var minX = area.contain ? area.left + 8 : LOUPE_SIDE_VISIBLE - width;
        var maxX = area.contain ? area.right - width - 8 : vw - LOUPE_SIDE_VISIBLE;
        if (minX > maxX) return Math.round(area.contain ? area.left + (vw - width) / 2 : (vw - width) / 2);
        var v = (typeof x === 'number' && isFinite(x)) ? x : (vw - width) / 2;
        return Math.round(Math.max(minX, Math.min(maxX, v)));
    }

    // Overlap with the Project toolbar is allowed. Keep global navigation usable.
    function readDefaultLoupeSafeArea() {
        return {width:window.innerWidth,height:window.innerHeight,top:0,bottom:window.innerHeight,bottomMargin:LOUPE_BOTTOM_MARGIN};
    }

    // viewport座標のまま、将来Header / Dockの境界だけを注入する。
    // providerはwidth / height / top / bottom / bottomMarginを返す。
    var loupeInspectorWidth = null;
    function wideInspectorOpen() {
        var inspector = document.getElementById('sc-melody-inspector');
        return window.innerWidth >= 1280 && inspector && !inspector.hidden;
    }
    function getLoupeSafeArea() {
        var area = loupeSafeAreaProvider ? loupeSafeAreaProvider() : readDefaultLoupeSafeArea();
        area=Object.assign({},area,{top:0});
        var inspector = document.getElementById('sc-melody-inspector');
        if (window.innerWidth < 1280 && inspector && !inspector.hidden) {
            var bottom = Math.min(area.bottom, inspector.getBoundingClientRect().top - 8);
            return Object.assign({}, area, { bottom: bottom, height: Math.max(1, bottom - area.top) });
        }
        if (wideInspectorOpen()) {
            var right = Math.min(area.right, inspector.getBoundingClientRect().left - 8);
            return Object.assign({}, area, { right: right, width: Math.max(1, right - area.left) });
        }
        return area;
    }

    function setLoupeSafeAreaProvider(provider) {
        if (provider !== null && typeof provider !== 'function') {
            throw new TypeError('Loupe safe-area providerには関数またはnullが必要です');
        }
        loupeSafeAreaProvider = provider;
        scheduleOverlayPosition(false);
    }

    function getLoupeMinTop() {
        return getLoupeSafeArea().top;
    }

    /**
     * 垂直位置のクランプ。topはviewportの0px以上（ローカルナビとの重なりを許可）、
     * 下端はタイトルバー（閉じるボタン含む）が必ず画面内に残る位置までに制限する。
     */
    function clampLoupeY(y) {
        var bottom = getLoupeSafeArea().bottom;
        var minY = getLoupeMinTop();
        var area = getLoupeSafeArea();
        var reserve = area.contain ? LOUPE_MIN_AVAILABLE_HEIGHT + area.bottomMargin : LOUPE_HEADER_RESERVE;
        var maxY = Math.max(minY, bottom - reserve);
        var v = (typeof y === 'number' && isFinite(y)) ? y : minY;
        return Math.round(Math.max(minY, Math.min(maxY, v)));
    }

    function loadLoupeSettings() {
        var storage = CS().storage;
        if (!storage || !storage.getAppSetting) return null;
        var saved = storage.getAppSetting(LOUPE_APP_SETTING_KEY);
        if (!saved || typeof saved !== 'object') return null;
        if (typeof saved.x !== 'number' || typeof saved.y !== 'number' || typeof saved.width !== 'number' ||
            !isFinite(saved.x) || !isFinite(saved.y) || !isFinite(saved.width)) {
            return null; // 壊れた値・異常値は無視して初期値へ戻す
        }
        return { x: saved.x, y: saved.y, width: saved.width };
    }

    function saveLoupeSettings() {
        var storage = CS().storage;
        if (!storage || !storage.setAppSetting) return;
        storage.setAppSetting(LOUPE_APP_SETTING_KEY, {
            x: state.loupe.x, y: state.loupe.y, width: state.loupe.width
        });
    }

    /**
     * 起動時に1度だけ呼ぶ。保存済み位置があれば復元（現在の画面サイズへクランプ）、
     * なければ初期位置（水平中央・垂直はやや下寄り）を計算する。
     */
    function initLoupeGeometry() {
        var saved = loadLoupeSettings();
        var width = clampLoupeWidth(saved ? saved.width : LOUPE_DEFAULT_WIDTH);
        var x, y;
        if (saved) {
            x = clampLoupeX(saved.x, width);
            y = clampLoupeY(saved.y);
        } else {
            var safeArea = getLoupeSafeArea();
            x = clampLoupeX((safeArea.width - width) / 2, width);
            y = clampLoupeY(safeArea.height * 0.52);
        }
        state.loupe = { x: x, y: y, width: width };
    }

    /**
     * state.loupe を実DOMへ反映する。#sc-slot-overlay はrenderSlotOverlayContent()が
     * innerHTML='' で子要素だけを作り直すため、この関数はルート要素自身のインラインstyle
     * （left/top/width/--bar-loupe-scale）を書くだけでよく、再描画のたびに呼んでも安全。
     */
    function setEditorPlacement(mode){
        finishTextInputs();var bridge=CS().localEditorPane;
        if(!bridge){setSaveStatus('右窓への移動はローカル開発入口で利用できます',true);return;}
        if(mode==='right'){
            if(!bridge.mount(els.slotOverlay,function(){editorPlacement='floating';els.slotOverlay.classList.remove('editor-right');renderSlotOverlayContent();updateSheetScale();})){
                setSaveStatus('使用中の右ツールを閉じてから、もう一度右窓へ移動してください',true);return;
            }
            editorPlacement='right';els.slotOverlay.classList.add('editor-right');renderSlotOverlayContent();updateSheetScale();
        }else bridge.unmount(els.slotOverlay);
    }
    function applyLoupeGeometry() {
        if (!els.slotOverlay) return;
        if(editorPlacement==='right'){els.slotOverlay.style.left='';els.slotOverlay.style.top='';els.slotOverlay.style.width='';els.slotOverlay.style.maxHeight='calc(100vh - 24px)';els.slotOverlay.style.setProperty('--bar-loupe-scale','1');els.slotOverlay.classList.add('slot-overlay--narrow');return;}
        // v0.22.4後修正: initLoupeGeometry()はアプリ起動直後（まだTOP画面でapp-navが
        // hidden化されている時点）に1度だけ呼ばれるため、その時点のclampLoupeYは
        // #app-navの高さを0として計算してしまい、実際に譜面クルーズ画面でルーペが
        // 開かれる頃にはタイトルバーがapp-navの裏へ入り込む不具合があった。
        // DOMへ実際に反映するこの関数の入口でY座標を都度再クランプすることで、
        // ルーペが表示されるたび（renderSlotOverlayContent経由）に、その時点の
        // app-nav表示状態・viewportに合わせて必ず補正する。ドラッグ・リサイズの
        // 呼び出し元は既にclampLoupeY済みの値を渡すため、ここでの再クランプは
        // 冪等（値が変わらない）で、意図した位置を余分にリセットすることはない。
        // Inspector occupancy is temporary UI geometry, not a saved width preference.
        if (wideInspectorOpen()) {
            if (loupeInspectorWidth === null) loupeInspectorWidth = state.loupe.width;
        } else if (loupeInspectorWidth !== null) {
            state.loupe.width = loupeInspectorWidth; loupeInspectorWidth = null;
        }
        state.loupe.width = clampLoupeWidth(state.loupe.width);
        state.loupe.x = clampLoupeX(state.loupe.x, state.loupe.width);
        state.loupe.y = clampLoupeY(state.loupe.y);
        els.slotOverlay.style.left = state.loupe.x + 'px';
        els.slotOverlay.style.top = state.loupe.y + 'px';
        els.slotOverlay.style.width = state.loupe.width + 'px';
        // v0.22.4後修正: 上端clamp強化（#app-nav・.sheet-toolbar考慮）でtopの下限が
        // 上がったため、CSS側の固定`max-height: calc(100vh - 16px)`のままだと
        // 下端がviewportを超えうる。実際のtopを引いた利用可能高さをinline styleで
        // 都度設定し、CSSのmax-heightより優先させる（CSS側はJS無効時のフォールバック
        // として残す）。最低LOUPE_MIN_AVAILABLE_HEIGHTは確保し、極端に低いviewportでも
        // ヘッダー・拍ルーラー等の主要操作部には触れられるようにする。
        var safeArea = getLoupeSafeArea();
        var availableHeight = Math.max(
            safeArea.contain ? 1 : LOUPE_MIN_AVAILABLE_HEIGHT,
            safeArea.bottom - state.loupe.y - safeArea.bottomMargin
        );
        els.slotOverlay.style.maxHeight = availableHeight + 'px';
        els.slotOverlay.style.setProperty('--bar-loupe-scale', String(state.loupe.width / LOUPE_BASE_WIDTH));
        els.slotOverlay.classList.toggle('slot-overlay--narrow', isNarrowViewport() || state.loupe.width < LOUPE_NARROW_BREAKPOINT);
        positionBulkPopover();
    }

    /**
     * ウィンドウリサイズ時の再クランプ（幅→位置の順）。幅が変わった場合はappSettingsも
     * 補正後の値へ更新する（仕様上「更新してよい」とされているため、ずれを溜め込まない）。
     */
    function reclampLoupeOnResize() {
        if (!els.slotOverlay) return;
        if(editorPlacement==='right'){applyLoupeGeometry();return;}
        if (wideInspectorOpen() || loupeInspectorWidth !== null) { applyLoupeGeometry(); return; }
        var newWidth = clampLoupeWidth(state.loupe.width);
        var widthChanged = newWidth !== state.loupe.width;
        state.loupe.width = newWidth;
        state.loupe.x = clampLoupeX(state.loupe.x, newWidth);
        state.loupe.y = clampLoupeY(state.loupe.y);
        applyLoupeGeometry();
        if (widthChanged) saveLoupeSettings();
    }

    // ドラッグを開始しない要素（ボタン・入力欄・ポップオーバー・リサイズハンドル等）
    var LOUPE_DRAG_IGNORE_SELECTOR =
        'button, input, select, textarea, a, .slot-overlay-bulk-popover, .slot-overlay-resize-handle';

    function onLoupeHeaderPointerDown(event) {
        if(editorPlacement==='right')return;
        if (event.button !== undefined && event.button !== 0) return;
        if (event.target.closest && event.target.closest(LOUPE_DRAG_IGNORE_SELECTOR)) return;
        event.preventDefault();
        var header = event.currentTarget;
        var pointerId = event.pointerId;
        var startX = event.clientX;
        var startY = event.clientY;
        var originX = state.loupe.x;
        var originY = state.loupe.y;
        try { header.setPointerCapture(pointerId); } catch (_) { /* ignore */ }
        document.body.classList.add('loupe-dragging');

        function onMove(e) {
            if (e.pointerId !== pointerId) return;
            state.loupe.x = clampLoupeX(originX + (e.clientX - startX), state.loupe.width);
            state.loupe.y = clampLoupeY(originY + (e.clientY - startY));
            applyLoupeGeometry();
        }
        function onUp(e) {
            if (e.pointerId !== pointerId) return;
            try { header.releasePointerCapture(pointerId); } catch (_) { /* ignore */ }
            header.removeEventListener('pointermove', onMove);
            header.removeEventListener('pointerup', onUp);
            header.removeEventListener('pointercancel', onUp);
            document.body.classList.remove('loupe-dragging');
            saveLoupeSettings();
        }
        header.addEventListener('pointermove', onMove);
        header.addEventListener('pointerup', onUp);
        header.addEventListener('pointercancel', onUp);
    }

    /**
     * タイトルバーへのキーボード移動代替: Alt+Shift+矢印で16pxずつ移動する。
     */
    function onLoupeHeaderKeydown(event) {
        if(editorPlacement==='right')return;
        if (event.isComposing) return;
        if (!event.altKey || !event.shiftKey) return;
        var dx = 0, dy = 0;
        if (event.key === 'ArrowLeft') dx = -LOUPE_MOVE_STEP;
        else if (event.key === 'ArrowRight') dx = LOUPE_MOVE_STEP;
        else if (event.key === 'ArrowUp') dy = -LOUPE_MOVE_STEP;
        else if (event.key === 'ArrowDown') dy = LOUPE_MOVE_STEP;
        else return;
        event.preventDefault();
        state.loupe.x = clampLoupeX(state.loupe.x + dx, state.loupe.width);
        state.loupe.y = clampLoupeY(state.loupe.y + dy);
        applyLoupeGeometry();
        saveLoupeSettings();
    }

    /**
     * 右下ハンドルでの比例リサイズ。幅だけをドラッグで変え、--bar-loupe-scaleの更新を通じて
     * フォントサイズ・行高さ・セル等がCSS側で比例拡大縮小する（高さは内容に応じた自動のまま）。
     */
    function onLoupeResizePointerDown(event) {
        if(editorPlacement==='right')return;
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        var handle = event.currentTarget;
        var pointerId = event.pointerId;
        var startX = event.clientX;
        var startWidth = state.loupe.width;
        try { handle.setPointerCapture(pointerId); } catch (_) { /* ignore */ }
        document.body.classList.add('loupe-resizing');

        function onMove(e) {
            if (e.pointerId !== pointerId) return;
            var newWidth = clampLoupeWidth(startWidth + (e.clientX - startX));
            state.loupe.width = newWidth;
            if (loupeInspectorWidth !== null) loupeInspectorWidth = newWidth;
            state.loupe.x = clampLoupeX(state.loupe.x, newWidth);
            applyLoupeGeometry();
        }
        function onUp(e) {
            if (e.pointerId !== pointerId) return;
            try { handle.releasePointerCapture(pointerId); } catch (_) { /* ignore */ }
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.removeEventListener('pointercancel', onUp);
            document.body.classList.remove('loupe-resizing');
            saveLoupeSettings();
        }
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
    }

    function buildLoupeResizeHandle() {
        var handle = document.createElement('div');
        handle.className = 'slot-overlay-resize-handle';
        handle.setAttribute('aria-hidden', 'true');
        handle.addEventListener('pointerdown', onLoupeResizePointerDown);
        return handle;
    }

    // Keep the panel in the Loupe's DOM/theme/focus owner, but use viewport
    // positioning so its scroll container cannot clip the Apply/Close buttons.
    function positionBulkPopover() {
        var popover = els.slotOverlay && els.slotOverlay.querySelector('.slot-overlay-bulk-popover');
        if (!popover) return;
        popover.classList.remove('is-flip-down', 'is-flip-left');
        Object.assign(popover.style, { position: 'fixed', right: 'auto', bottom: 'auto',
            maxHeight: 'calc(100dvh - 16px)', overflowY: 'auto' });
        var anchor = els.slotOverlay.getBoundingClientRect(), rect = popover.getBoundingClientRect();
        var top = anchor.top - rect.height - 8;
        if (top < 8) top = anchor.bottom + 8;
        popover.style.left = Math.max(8, Math.min(anchor.right - rect.width - 20, window.innerWidth - rect.width - 8)) + 'px';
        popover.style.top = Math.max(8, Math.min(top, window.innerHeight - rect.height - 8)) + 'px';
    }

    function tokenizeBulkChords(text) {
        return String(text || '')
            .replace(/(^|\s)\/(?=\s|$)/g, ' ')
            .split(/\s+/)
            .map(function (token) { return token.trim(); })
            .filter(Boolean);
    }

    function linesForBulkText(text) {
        return String(text || '').replace(/\r\n?/g, '\n').split('\n');
    }

    function bulkValues(kind, text) {
        if (kind === 'chord') return tokenizeBulkChords(text);
        return linesForBulkText(text);
    }

    function applyBulkInput(kind, text) {
        var bar = getSelectedBar();
        if (!bar) return;

        if (kind === 'lyrics') {
            // F2a〜F4暫定: 歌詞はセル編集へ移行したため、まとめて入力からの書き込みは
            // 行わない（UI側でも textarea/ボタンをdisabledにしているが、防御的に二重で止める）。
            state.overlayBulkMessage = {
                type: 'warning',
                text: '歌詞はセル編集に移行しました。まとめて配置は今後の対応予定です。'
            };
            renderSlotOverlayContent();
            return;
        }

        var values = bulkValues(kind, text);
        var start = getSelectedBarIndex();
        var available = state.project.bars.length - start;
        var count = Math.min(values.length, available);
        var warnings = [];
        var theory = CS().theory;

        if (values.length === 0) {
            state.overlayBulkMessage = { type: 'warning', text: '入力がありません' };
            renderSlotOverlayContent();
            return;
        }
        if (values.length > available) {
            warnings.push('小節数を超えた ' + (values.length - available) + '件は反映しませんでした');
        }

        var applied = runStructureOperation(kind === 'chord' ? 'bulkChord' : 'bulkDoremi',
            { barNumber: bar.barNumber, values: values.slice(0, count) });
        if (!applied.ok) return;
        warnings = warnings.concat(applied.warnings);
        if (kind === 'chord') values.slice(0, count).forEach(function (value, i) {
            if (String(value || '').trim() && theory.parseBasicChordSymbol(value) === null) {
                warnings.push(state.project.bars[start + i].barNumber + '小節目: 解釈できないコード表記です');
            }
        });

        markDirty();
        state.overlayBulkMessage = {
            type: warnings.length ? 'warning' : 'ok',
            text: count + '小節に反映しました' + (warnings.length ? ' / ' + warnings.join(' / ') : '')
        };
        renderBarGrid();
        renderPreview();
    }

    /**
     * D3a: 「まとめて入力」をヘッダーのボタンから開くポップオーバーにする
     * （常設右カラムは廃止。ドックの通常高さ・幅は消費しない）。
     * 中身（コード/歌詞/ドレミのまとめて入力）はD2までのロジックをそのまま再利用する。
     */
    function buildBulkInputPanel() {
        var panel = document.createElement('div');
        panel.className = 'slot-overlay-bulk-popover';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'まとめて入力');

        var body = document.createElement('div');
        body.className = 'slot-overlay-bulk-body';

        var kind = document.createElement('select');
        kind.className = 'slot-overlay-bulk-kind';
        [
            ['chord', 'コード'],
            ['lyrics', '歌詞'],
            ['doremi', 'ドレミ']
        ].forEach(function (pair) {
            var option = document.createElement('option');
            option.value = pair[0];
            option.textContent = pair[1];
            kind.appendChild(option);
        });

        var text = document.createElement('textarea');
        text.className = 'slot-overlay-bulk-text';
        text.rows = 3;
        text.placeholder = '現在の小節から順に反映';
        text.setAttribute('aria-label', 'まとめて入力');

        // F2a〜F4暫定: 歌詞はセル編集へ移行したため、まとめて入力の歌詞は一時停止する
        // （docs/DECISIONS.md ADR-028）。
        var lyricsNotice = document.createElement('p');
        lyricsNotice.className = 'slot-overlay-bulk-lyrics-notice';
        lyricsNotice.textContent = '歌詞はセル編集に移行しました。まとめて配置は今後の対応予定です。';
        lyricsNotice.hidden = true;

        function updateBulkLyricsDisabledState() {
            var isLyrics = kind.value === 'lyrics';
            text.disabled = isLyrics;
            apply.disabled = isLyrics;
            lyricsNotice.hidden = !isLyrics;
        }
        kind.addEventListener('change', updateBulkLyricsDisabledState);

        var actions = document.createElement('div');
        actions.className = 'slot-overlay-bulk-actions';

        var apply = document.createElement('button');
        apply.type = 'button';
        apply.className = 'slot-overlay-bulk-apply';
        apply.textContent = '現在の小節から反映';
        apply.addEventListener('click', function (event) {
            event.stopPropagation();
            if (kind.value === 'lyrics') return; // F2a〜F4暫定: bulk歌詞は停止中
            applyBulkInput(kind.value, text.value);
        });
        updateBulkLyricsDisabledState();

        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'slot-overlay-bulk-close';
        close.textContent = '閉じる';
        close.addEventListener('click', function (event) {
            event.stopPropagation();
            state.dockBulkOpen = false;
            renderSlotOverlayContent();
        });

        actions.appendChild(apply);
        actions.appendChild(close);
        body.appendChild(kind);
        body.appendChild(text);
        body.appendChild(lyricsNotice);
        body.appendChild(actions);

        if (state.overlayBulkMessage) {
            var message = document.createElement('p');
            message.className = 'slot-overlay-bulk-message is-' + state.overlayBulkMessage.type;
            message.textContent = state.overlayBulkMessage.text;
            body.appendChild(message);
        }

        panel.appendChild(body);
        panel.addEventListener('compositionstart', function () {
            state.overlayBulkComposing = true;
        });
        panel.addEventListener('compositionend', function () {
            state.overlayBulkComposing = false;
        });
        panel.addEventListener('keydown', function (event) {
            if (routeLocalSave(event) || routeLocalEscape(event)) return;
            event.stopPropagation();
        });
        panel.addEventListener('click', function (event) {
            event.stopPropagation();
        });
        panel.addEventListener('mousedown', function (event) {
            event.stopPropagation();
        });
        return panel;
    }

    function buildBulkToggleButton() {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'slot-overlay-bulk-toggle';
        btn.textContent = 'まとめて入力';
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', state.dockBulkOpen ? 'true' : 'false');
        btn.addEventListener('click', function (event) {
            event.stopPropagation();
            state.dockBulkOpen = !state.dockBulkOpen;
            renderSlotOverlayContent();
        });
        btn.addEventListener('mousedown', function (event) { event.stopPropagation(); });
        return btn;
    }

    /**
     * D3a: まとめて入力ポップオーバーの外側クリック / Escapeで閉じる。
     * init() で一度だけ登録するグローバルリスナー（ドックは毎描画で作り直されるため）。
     */
    function onDocumentClickForBulkPopover(event) {
        if (!state.dockBulkOpen || !els.slotOverlay) return;
        var popover = els.slotOverlay.querySelector('.slot-overlay-bulk-popover');
        var toggleBtn = els.slotOverlay.querySelector('.slot-overlay-bulk-toggle');
        if (popover && popover.contains(event.target)) return;
        if (toggleBtn && toggleBtn.contains(event.target)) return;
        state.dockBulkOpen = false;
        renderSlotOverlayContent();
    }

    /**
     * F1: Escapeの優先順位を整理する（既存挙動を壊さない範囲で）。
     * 1. まとめて入力ポップオーバーが開いていれば、それを閉じる
     * 2. ルーペ内の入力欄・ストロークセルにフォーカスがあれば、それを外す（セル編集解除）
     * 3. それ以外は選択小節を解除してルーペを閉じる（既存のdeselectBar）
     * ルーペ自体はフォーカストラップを持たない非モーダルなツールパレットとして扱う。
     */
    var escapeRouter = null;
    function escapeBlocked(event) {
        return event.defaultPrevented || !isWorkspaceVisible() || event.key !== 'Escape' ||
            event.isComposing || event.keyCode === 229 || state.overlayComposingRowId !== null ||
            state.lyricComposingTick !== null || state.lyricJustComposed || state.overlayBulkComposing ||
            !!editorHelp?.isOpen || !!(CS().shellHost && CS().shellHost.getCommandContext().activeModal);
    }
    function closeTransient(event) {
        if (escapeBlocked(event) || !state.dockBulkOpen) return false;
        state.dockBulkOpen = false;
        renderSlotOverlayContent();
        var trigger = els.slotOverlay.querySelector('.slot-overlay-bulk-toggle');
        if (trigger) trigger.focus({ preventScroll: true });
        return true;
    }
    function handleEscape(event) {
        if (escapeBlocked(event)) return false;
        if(CS().melodyInspector&&CS().melodyInspector.isOpen())return CS().melodyInspector.close();
        var active = document.activeElement;
        var isEditingInLoupe = active && els.slotOverlay && els.slotOverlay.contains(active) &&
            (active.tagName === 'INPUT' || (active.classList && active.classList.contains('dock-strum-cell')));
        if (isEditingInLoupe) { active.blur(); els.slotOverlay.focus({ preventScroll: true }); return true; }
        if (!state.selectedBarNumber) return false;
        deselectBar();
        els.root.focus({ preventScroll: true });
        return true;
    }
    // Local editor Escape opt-in only; other text shortcuts remain control-owned.
    function routeLocalEscape(event) {
        if (event.key !== 'Escape') return false;
        if (!escapeBlocked(event) && escapeRouter && els.slotOverlay.contains(event.target)) escapeRouter(event);
        return true;
    }

    /**
     * D3a: 画面下部の編集ドック本体を組み立てる（「選択小節のX線写真」）。
     * 紙面と同じ段順（コード/ストローク/歌詞/ドレミ）を、選択小節と同じ時間軸のまま
     * コンパクトなタイムグリッドとして表示する。本格セル編集はストローク行のみ。
     * ヘッダーは1行に集約: 小節番号・セクション名・前へ/次へ・8分/16分・
     * まとめて入力・小節試聴・閉じる。
     */
    function renderSlotOverlayContent() {
        if (!els.slotOverlay) return;
        els.slotOverlay.querySelectorAll('[data-chord-picker]').forEach(function(root){root._disposeOwnerChord?.();});
        els.slotOverlay.innerHTML = '';

        var bar = getSelectedBar();
        if (!bar||!editorOpen) {
            els.slotOverlay.classList.add('hidden');
            els.slotOverlay.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('dock-open');
            return;
        }

        var head = document.createElement('div');
        head.className = 'slot-overlay-head';
        // F1: タイトルバーはドラッグ領域。button/input/select/textarea/a等の上では
        // onLoupeHeaderPointerDown内のセレクタ判定でドラッグを開始しない
        head.tabIndex = 0;
        head.addEventListener('pointerdown', onLoupeHeaderPointerDown);
        head.addEventListener('keydown', onLoupeHeaderKeydown);

        var headActions = document.createElement('div');
        headActions.className = 'slot-overlay-head-actions';

        var nav = document.createElement('div');
        nav.className = 'slot-overlay-nav';
        nav.appendChild(buildOverlayNavButton('← 前へ', -1));
        nav.appendChild(buildOverlayNavButton('次へ →', 1));
        headActions.appendChild(nav);
        var tabs=document.createElement('div');tabs.className='editor-size-tabs slot-overlay-res-toggle';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','編集する小節数');
        [1,2].forEach(function(count){var tab=document.createElement('button');tab.type='button';tab.dataset.editorBars=count;tab.className='slot-overlay-res-btn'+(editorBars===count?' is-active':'');tab.textContent=count+'小節';tab.setAttribute('aria-pressed',String(editorBars===count));tab.title=count+'小節を並べて編集';tab.addEventListener('pointerdown',function(e){e.preventDefault();});tab.addEventListener('click',function(){if(!editorCanMove()||editorBars===count)return;stopPianoAudition();finishTextInputs();editorBars=count;editorAnchorId=state.session.draft.bars[state.selectedBarNumber-1].id;renderSlotOverlayContent();});tabs.appendChild(tab);});headActions.appendChild(tabs);
        var placement=document.createElement('button');placement.type='button';placement.className='slot-overlay-nav-btn';placement.dataset.editorPlacement='';placement.textContent=editorPlacement==='right'?'カードに戻す':'右窓へ';placement.disabled=!CS().localEditorPane;placement.title=editorPlacement==='right'?'浮かぶ編集カードへ戻す':'既存の右ツール窓へ移動';placement.addEventListener('pointerdown',function(e){e.preventDefault();});placement.addEventListener('click',function(){if(editorCanMove())setEditorPlacement(editorPlacement==='right'?'floating':'right');});


        var resolution=document.createElement('span');resolution.dataset.activeResolution='';resolution.appendChild(buildResolutionToggle(bar));headActions.appendChild(resolution);

        headActions.appendChild(buildBulkToggleButton());
        headActions.appendChild(buildBarPlayButton());

        var helpBtn=document.createElement('button');helpBtn.type='button';helpBtn.className='slot-overlay-nav-btn editor-help-trigger';helpBtn.textContent='？';helpBtn.dataset.editorHelpTrigger='';helpBtn.title='編集の操作ガイド';helpBtn.setAttribute('aria-label','編集の操作ガイド');helpBtn.setAttribute('aria-haspopup','dialog');helpBtn.setAttribute('aria-controls','sc-editor-help');helpBtn.setAttribute('aria-expanded','false');
        helpBtn.addEventListener('pointerdown',function(event){event.preventDefault();event.stopPropagation();});helpBtn.addEventListener('click',function(event){event.stopPropagation();openEditorHelp(helpBtn);});headActions.appendChild(helpBtn);

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'slot-overlay-close';
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', '小節ルーペを閉じる');
        closeBtn.addEventListener('click', function (event) {
            event.stopPropagation();
            if(editorCanMove())deselectBar();
        });
        closeBtn.addEventListener('mousedown', function (event) {
            event.stopPropagation();
        });
        headActions.appendChild(placement);
        head.appendChild(headActions);head.appendChild(closeBtn);
        els.slotOverlay.appendChild(head);

        var canonical=state.session.draft,anchor=canonical.bars.findIndex(function(b){return b.id===editorAnchorId;});
        if(editorBars===1||anchor<0||state.selectedBarNumber<anchor+1||state.selectedBarNumber>anchor+2){anchor=Math.max(0,state.selectedBarNumber-1);editorAnchorId=canonical.bars[anchor].id;}
        var viewport=document.createElement('div');viewport.className='editor-score-scroll';els.slotOverlay.appendChild(viewport);var measures=document.createElement('div');measures.className='editor-measures';measures.dataset.count=Math.min(editorBars,canonical.bars.length-anchor);viewport.appendChild(measures);
        state.project.bars.slice(anchor,anchor+editorBars).forEach(function(bar){
            var measure=document.createElement('section');measure.className='editor-measure';measure.dataset.barNumber=bar.barNumber;measure.setAttribute('aria-label',bar.barNumber+'小節目を編集');
            function activate(event){if(event.target.closest('.editor-row-tools'))return;if(!activateEditorMeasure(bar.barNumber)){event.preventDefault();event.stopImmediatePropagation();if(event.type==='focus'){event.target.blur();editorRoot().querySelector('.is-invalid')?.focus({preventScroll:true});}}else if(event.type==='focus')revealEditorCell(event.target);}
            measure.addEventListener('pointerdown',activate,true);measure.addEventListener('focus',activate,true);
        // 拍ルーラー（コード/ストローク/歌詞/ドレミの共通時間軸）
        var res = getStrumGridResolution(bar);
        measure.appendChild(buildBeatRuler(bar, res));

        // タイムグリッド本文: コード=1小節1セル / ストローク・歌詞=本格セル編集（F2a） /
        // ドレミ=時間軸に揃えた1つの入力欄（tick位置セル分解はF3）
        var grid = document.createElement('div');
        grid.className = 'slot-overlay-grid';

        DOCK_ROW_ORDER.forEach(function (rowId) {
            var rowDef = { id: rowId, label: DOCK_ROW_LABELS[rowId] };
            var row = document.createElement('div');
            row.className = 'slot-overlay-row slot-overlay-row--' + rowId;

            var rowLabel = document.createElement('span');
            rowLabel.className = 'slot-overlay-row-label';
            var text=document.createElement('span');text.textContent=rowDef.label;rowLabel.appendChild(text);
            var fold=document.createElement('button');fold.type='button';fold.className='editor-row-fold';fold.dataset.foldRow=rowId;fold.textContent=collapsedEditorRows.has(rowId)?'+':'−';fold.title=rowDef.label+(collapsedEditorRows.has(rowId)?'を展開':'を折り畳む');fold.setAttribute('aria-label',fold.title);fold.setAttribute('aria-expanded',String(!collapsedEditorRows.has(rowId)));fold.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();});fold.addEventListener('click',function(e){e.stopPropagation();if(!editorCanMove()){setSaveStatus('入力・保存・競合の状態を確認してください。内容を保持しています',true);return;}finishTextInputs();stopPianoAudition();if(collapsedEditorRows.has(rowId))collapsedEditorRows.delete(rowId);else collapsedEditorRows.add(rowId);renderSlotOverlayContent();queueEditorFrame(function(){editorRoot().querySelector('[data-fold-row="'+rowId+'"]')?.focus({preventScroll:true});});});var tools=document.createElement('span');tools.className='editor-row-tools';tools.appendChild(fold);
            if((rowId==='chord'||rowId==='doremi')&&bar.barNumber===anchor+1){
                var disclosure=document.createElement('button');disclosure.type='button';disclosure.className='editor-row-disclosure';disclosure.dataset[rowId==='chord'?'chordToggle':'pianoToggle']='';
                disclosure.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();});disclosure.addEventListener('click',function(e){e.stopPropagation();if(!editorCanMove())return;if(rowId==='chord'){var id=state.session.draft.bars[state.selectedBarNumber-1].id;bindChordCell(state.session,id,chordPicker.owner===state.session&&chordPicker.barId===id?chordPicker.tick:0);chordPicker.open=!chordPicker.open;renderSlotOverlayContent();}else togglePianoPanel();});tools.appendChild(disclosure);
            }
            rowLabel.appendChild(tools);
            row.appendChild(rowLabel);

            if (rowId === 'strum') {
                var strumWrap = document.createElement('div');
                strumWrap.className = 'slot-overlay-row-body slot-overlay-row-body--strum';
                var rhythm=CS().model.rhythmForBar(state.project,bar.barNumber);if(rhythm&&rhythm.encoding==='rhythm-owner-cells-v1')strumWrap.textContent=rhythm.name+'（採用済み・旧編集非対応）';else strumWrap.appendChild(buildStrumGridRow(bar, res));
                row.appendChild(strumWrap);
            } else if (rowId === 'lyrics') {
                var lyricsWrap = document.createElement('div');
                lyricsWrap.className = 'slot-overlay-row-body slot-overlay-row-body--lyrics';
                lyricsWrap.appendChild(buildLyricsGridRow(bar, res));
                row.appendChild(lyricsWrap);
            } else {
                var rowBody = document.createElement('div');
                rowBody.className = 'slot-overlay-row-body';
                rowBody.appendChild(buildBeatTextRow(rowId,bar,res));
                row.appendChild(rowBody);
            }
            row.classList.toggle('is-collapsed',collapsedEditorRows.has(rowId));row.querySelector('.slot-overlay-row-body').hidden=collapsedEditorRows.has(rowId);
            grid.appendChild(row);
            if(rowId==='chord'&&bar.barNumber===state.selectedBarNumber&&(editorBars===1||editorPlacement==='right'))grid.appendChild(buildChordPickerPanel());
        });

        measure.appendChild(grid);
            measures.appendChild(measure);
        });
        if(editorBars===2&&editorPlacement!=='right')els.slotOverlay.appendChild(buildChordPickerPanel());
        els.slotOverlay.appendChild(buildPianoPanel());
        syncEditorDisclosures();
        var legend=document.createElement('p');legend.className='strum-state-legend';legend.textContent='ストローク：空欄＝未入力 ／ 休符記号＝休符 ／ 〜＝伸ばし　R／Space：休符　Delete：未入力';els.slotOverlay.appendChild(legend);

        if (state.dockBulkOpen) {
            els.slotOverlay.appendChild(buildBulkInputPanel());
            queueContentFrame(positionBulkPopover);
        }

        // F1: 右下ハンドル（比例リサイズ）。狭い画面ではCSS側で非表示にする
        els.slotOverlay.appendChild(buildLoupeResizeHandle());

        els.slotOverlay.classList.remove('hidden');
        els.slotOverlay.setAttribute('aria-hidden', 'false');
        els.slotOverlay.setAttribute('aria-label', bar.barNumber + '小節目の編集');
        document.body.classList.add('dock-open');
        refreshEditorHeader();applyLoupeGeometry();
    }

    function syncSheetSelection(preserveInputs) {
        if(historyPreview)return;
        if (!els.scaleBox) return;
        var selectedExists = false;
        Array.prototype.forEach.call(els.scaleBox.querySelectorAll('.sheet-bar[data-bar-number]'), function (cell) {
            var barNumber = parseInt(cell.dataset.barNumber, 10);
            var selected = barNumber === state.selectedBarNumber || selectedBarIds.includes(state.session?.draft.bars[barNumber-1]?.id);
            cell.draggable = !!state.selectedBarNumber;
            cell.setAttribute('aria-describedby','sc-score-gesture-help');cell.title=state.selectedBarNumber?'クリックで選択、再クリックで編集。ドラッグで小節を移動。Shift＋クリックで範囲選択。':'クリックで選択、再クリックで編集。ドラッグで範囲選択。';
            if (selected) selectedExists = true;
            cell.classList.toggle('is-selected', selected);
            cell.setAttribute('aria-pressed', selected ? 'true' : 'false');
            cell.querySelector('[data-edit-selected-bar]')?.remove();if(selected&&barNumber===state.selectedBarNumber&&!editorOpen){var edit=document.createElement('button');edit.type='button';edit.dataset.editSelectedBar=barNumber;edit.textContent='編集する';edit.setAttribute('aria-label',barNumber+'小節目を編集する');cell.appendChild(edit);}
        });
        if (state.selectedBarNumber && !selectedExists) {
            state.selectedBarNumber = null;
            selectionDeleted = true;
        }
        els.scaleBox.querySelectorAll('[data-editable-empty]').forEach(function(cell){cell.classList.toggle('is-selected',emptySlotSelection?.owner===state.session&&cell.dataset.emptySlot===emptySlotSelection.key);});
        var section=selectedPlaybackSection();els.scaleBox.querySelectorAll('.sheet-section-label[data-section-id]').forEach(function(label){var selected=label.dataset.sectionId===section?.id;label.classList.toggle('is-selected-section',selected);label.setAttribute('aria-pressed',String(selected));});
        if (!preserveInputs) renderSlotOverlayContent();
        positionSlotOverlay();
        publishSelection();refreshToolbarActions();
    }

    /**
     * D2: 下部ドックは画面下部に固定表示するため座標計算は不要（CSSのposition:fixedに任せる）。
     * ただし、選択中の小節が紙面上から消えた場合（セクション削除・小節数変更等）は
     * 安全側でドックを閉じる。
     */
    function positionSlotOverlay() {
        if(historyPreview)return;
        if (!els.slotOverlay || els.slotOverlay.classList.contains('hidden')) return;
        var cell = getSheetBarByNumber(state.selectedBarNumber);
        if (!cell) {
            els.slotOverlay.classList.add('hidden');
            els.slotOverlay.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('dock-open');
        } else if (staffStyle === 'melody'&&editorPlacement!=='right') {
            // Move only the existing Loupe surface; never replace its focused input DOM.
            var staff = cell.querySelector('.melody-svg'), area = getLoupeSafeArea();
            if (!staff) return;
            var scoreRect = staff.getBoundingClientRect(), loupeRect = els.slotOverlay.getBoundingClientRect();
            if (loupeRect.left < scoreRect.right && loupeRect.right > scoreRect.left &&
                loupeRect.top < scoreRect.bottom && loupeRect.bottom > scoreRect.top) {
                var below = scoreRect.bottom + 8, above = scoreRect.top - loupeRect.height - 8;
                if (below + loupeRect.height <= area.bottom - area.bottomMargin) state.loupe.y = below;
                else if (above >= area.top) state.loupe.y = above;
                else return; // Low-height layout retains the existing movable editor.
                applyLoupeGeometry();
            }
        }
    }

    function isWorkspaceVisible() {
        return state.active && els.root && !els.root.classList.contains('hidden') &&
            els.preview && els.preview.clientWidth > 0;
    }

    function scheduleOverlayPosition(refreshSelection) {
        // 既存のrender/resize経路は再描画を維持。observer/activateは入力DOMを保持する。
        if (refreshSelection !== false) state.overlayRefreshRequested = true;
        if (state.overlayFrame) return;
        state.overlayFrame = window.requestAnimationFrame(function () {
            state.overlayFrame = null;
            var refresh = state.overlayRefreshRequested;
            state.overlayRefreshRequested = false;
            if (!isWorkspaceVisible()) return;
            updateSheetScale();
            if (refresh) syncSheetSelection();
            else positionSlotOverlay();
            reclampLoupeOnResize(); // F1: ウィンドウサイズ変更のたびにルーペの位置・幅も再クランプする
        });
    }

    function observeWorkspaceSize() {
        if (!window.ResizeObserver) return; // 従来のwindow resize経路は常に残す
        var sizes = new WeakMap();
        resizeObserver = new ResizeObserver(function (entries) {
            if (!isWorkspaceVisible() || window.matchMedia('print').matches) return;
            var changed = false;
            entries.forEach(function (entry) {
                var width = entry.contentRect.width;
                var height = entry.contentRect.height;
                if (width <= 0 || height <= 0) return;
                // preview高さはupdateSheetScale自身が書くため幅だけを監視する。
                if (entry.target === els.preview) height = 0;
                var previous = sizes.get(entry.target);
                if (!previous || previous.width !== width || previous.height !== height) {
                    sizes.set(entry.target, { width: width, height: height });
                    changed = true;
                }
            });
            if (changed) scheduleOverlayPosition(false);
        });
        [els.root, els.preview, els.toolbar].forEach(function (el) {
            if (el) resizeObserver.observe(el);
        });
    }

    function selectSheetBar(barNumber) {
        stopPianoAudition();
        selectedBarIds = [];rangeAnchor = barNumber;
        finishTextInputs();
        if (!state.project || !barNumber) return;
        var exists = state.project.bars.some(function (bar) {
            return bar.barNumber === barNumber;
        });
        if (!exists) return;
        if (state.selectedBarNumber !== barNumber) {
            state.overlayBulkMessage = null;
        }
        sectionPlaybackSelection=null;emptySlotSelection=null;
        state.selectedBarNumber = barNumber;
        editorAnchorId=state.session.draft.bars[barNumber-1].id;
        selectionDeleted = false;
        syncSheetSelection();
    }

    function selectBarRange(number, extend) {
        stopPianoAudition();
        var anchor=rangeAnchor || state.selectedBarNumber;
        selectSheetBar(number);
        if(extend&&anchor){rangeAnchor=anchor;var from=Math.min(anchor,number)-1,to=Math.max(anchor,number);selectedBarIds=state.session.draft.bars.slice(from,to).map(function(b){return b.id;});syncSheetSelection();setSaveStatus((from+1)+'〜'+to+'小節を選択');}
    }
    // From a neutral score surface, dragging selects a time range. A drag on an
    // already selected score keeps the existing move-bars gesture.
    var rangeDrag=null,rangeClickUntil=0;
    function beginRangeSelection(event){
        if(event.button!==0||event.pointerType==='touch'||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey||!editorCanMove())return;
        if(!els.root.contains(event.target)||els.slotOverlay.contains(event.target)||event.target.closest('.sheet-toolbar,#sc-editor-drawer,.workspace-local-nav,[role=dialog],button,a,label,summary,input,textarea,select,[data-paper-edit],.sheet-form-event,.sheet-section-label'))return;
        var bar=event.target.closest('.sheet-bar[data-bar-number]'),blank=isBlankScoreSurface(event.target),bounds=els.preview.closest('.sheet-preview').getBoundingClientRect();
        if(bar&&(state.selectedBarNumber||emptySlotSelection)||!bar&&(!blank||event.clientY<bounds.top-12||event.clientY>bounds.bottom+12))return;
        rangeDrag={pointerId:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,anchor:bar?Number(bar.dataset.barNumber):null,moved:false,frame:CS().structureOperations.capture(state.session)};
    }
    // Coalesced pointer events can jump across several bars. Use the whole segment
    // so an outside-to-outside drag still selects the first and last bars crossed.
    function crossedRangeBars(x,y,nextX,nextY){
        var dx=nextX-x,dy=nextY-y,hits=[];
        els.scaleBox.querySelectorAll('.sheet-bar[data-bar-number]').forEach(function(cell){
            var r=cell.getBoundingClientRect();if(r.width<2||r.height<2)return;var enter=0,leave=1;
            for(var axis of [[x,dx,r.left+.5,r.right-.5],[y,dy,r.top+.5,r.bottom-.5]]){
                if(Math.abs(axis[1])<.001){if(axis[0]<axis[2]||axis[0]>axis[3])return;}
                else{var first=(axis[2]-axis[0])/axis[1],last=(axis[3]-axis[0])/axis[1];enter=Math.max(enter,Math.min(first,last));leave=Math.min(leave,Math.max(first,last));if(enter>leave)return;}
            }
            hits.push({cell:cell,enter:enter});
        });
        return hits.sort(function(a,b){return a.enter-b.enter;}).map(function(hit){return hit.cell;});
    }
    function extendRangeSelection(event){
        var drag=rangeDrag;if(!drag||drag.pointerId!==event.pointerId)return;
        if(!CS().structureOperations.isCurrent(drag.frame,state.session)||!editorCanMove()){cancelRangeSelection();return;}
        if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6)return;
        var cell=document.elementFromPoint(event.clientX,event.clientY)?.closest('.sheet-bar[data-bar-number]');if(cell&&!els.scaleBox.contains(cell))cell=null;
        var hits=!drag.anchor||!cell?crossedRangeBars(drag.lastX,drag.lastY,event.clientX,event.clientY):[];drag.lastX=event.clientX;drag.lastY=event.clientY;
        if(!drag.anchor){var first=hits[0]||cell;if(first)drag.anchor=Number(first.dataset.barNumber);}
        cell=cell||hits.at(-1);if(!cell||!drag.anchor)return;
        var number=Number(cell.dataset.barNumber);
        if(!drag.moved)els.toolbar.style.setProperty('--sc-range-toolbar-height',els.toolbar.getBoundingClientRect().height+'px');
        drag.moved=true;event.preventDefault();window.getSelection()?.removeAllRanges();els.scaleBox.classList.add('sc-range-selecting');els.toolbar.classList.add('sc-range-selecting');
        rangeAnchor=drag.anchor;editorOpen=false;emptySlotSelection=null;selectBarRange(number,true);
    }
    function endRangeSelection(event){
        if(!rangeDrag||rangeDrag.pointerId!==event.pointerId)return;
        if(rangeDrag.moved){rangeClickUntil=performance.now()+350;getSheetBarByNumber(state.selectedBarNumber)?.focus({preventScroll:true});}
        cancelRangeSelection();
    }
    function cancelRangeSelection(){rangeDrag=null;els.scaleBox?.classList.remove('sc-range-selecting');els.toolbar?.classList.remove('sc-range-selecting');els.toolbar?.style.removeProperty('--sc-range-toolbar-height');}
    var barDropMarker=null,barDropCell=null;
    function clearBarDropMarker(){if(barDropMarker)barDropMarker.remove();barDropMarker=null;barDropCell=null;}
    function cancelBarDrag(){dragFrame=null;clearBarDropMarker();els.scaleBox?.querySelectorAll('.sc-bar-drag-source').forEach(function(cell){cell.classList.remove('sc-bar-drag-source');});}
    function resolveBarDrop(event){
        if(!dragFrame)return null;
        if(!editorCanMove()||!CS().structureOperations.isCurrent(dragFrame.ticket,state.session)){cancelBarDrag();return null;}
        var cell=event.target.closest?.('.sheet-bar[data-bar-number]');if(!cell||!els.scaleBox.contains(cell))return null;
        var bars=state.session.draft.bars,index=Number(cell.dataset.barNumber)-1,target=bars[index],ids=dragFrame.ids;
        if(!target||ids.includes(target.id))return null;
        var positions=ids.map(function(id){return bars.findIndex(function(b){return b.id===id;});}).sort(function(a,b){return a-b;});
        if(!positions.length||positions.some(function(n,i){return n<0||(i&&n!==positions[0]+i);}))return null;
        var rect=cell.getBoundingClientRect(),side=event.clientX>=rect.left+rect.width/2?'after':'before',boundary=index+(side==='after'?1:0);
        // Adjacent boundaries keep the original order unless section membership changes.
        if(boundary>=positions[0]&&boundary<=positions.at(-1)+1&&positions.every(function(n){return bars[n].sectionId===target.sectionId;}))return null;
        return {cell:cell,anchorId:target.id,side:side,number:index+1};
    }
    function positionBarDropMarker(){
        if(!barDropMarker||!barDropCell?.isConnected)return;
        var rect=barDropCell.getBoundingClientRect(),top=Math.max(0,rect.top,Math.min(innerHeight,els.toolbar.getBoundingClientRect().bottom)),bottom=Math.min(innerHeight,rect.bottom),edge=barDropMarker.dataset.dropSide==='after'?rect.right:rect.left;
        barDropMarker.hidden=bottom<=top||edge<0||edge>innerWidth;if(barDropMarker.hidden)return;
        barDropMarker.style.left=(edge-2)+'px';barDropMarker.style.top=top+'px';barDropMarker.style.height=(bottom-top)+'px';
        var label=barDropMarker.firstElementChild;label.style.top=Math.max(8,Math.min(top+8,innerHeight-label.getBoundingClientRect().height-8))+'px';label.style.left=Math.max(8,Math.min(edge+10,innerWidth-label.getBoundingClientRect().width-8))+'px';
    }
    function showBarDropMarker(target){
        if(!barDropMarker){barDropMarker=document.createElement('div');barDropMarker.className='sc-bar-drop-marker';barDropMarker.dataset.barDropMarker='';barDropMarker.setAttribute('role','status');barDropMarker.setAttribute('aria-live','polite');var label=document.createElement('span');label.className='sc-bar-drop-label';barDropMarker.appendChild(label);document.body.appendChild(barDropMarker);}
        if(barDropCell!==target.cell||barDropMarker.dataset.dropSide!==target.side){barDropCell=target.cell;barDropMarker.dataset.dropSide=target.side;delete barDropMarker.dataset.dropBefore;delete barDropMarker.dataset.dropAfter;barDropMarker.dataset[target.side==='after'?'dropAfter':'dropBefore']=target.anchorId;barDropMarker.firstElementChild.textContent='第'+target.number+'小節の'+(target.side==='after'?'後へ':'前へ')+(dragFrame.ids.length>1?'（'+dragFrame.ids.length+'小節）':'');}
        positionBarDropMarker();
    }
    function moveSelectedBars(args) {
        var ids=args.barIds.slice(),res=runStructureOperation('moveBars',args);if(!res.ok)return;
        var index=state.session.draft.bars.findIndex(function(b){return ids.includes(b.id);});selectSheetBar(index+1);selectedBarIds=ids;syncSheetSelection();setSaveStatus((index+1)+'小節目から'+ids.length+'小節を移動（未保存）');
    }
    function prepareSheetActions(){if(!sheetActionsPending)sheetActionsPending=import('./sheet-actions.mjs?v=0.141.0-dev.1').then(function(m){sheetActions=m.createSheetActions({document:document,host:els.root,closed:refreshToolbarActions});return {module:m,ui:sheetActions};}).catch(function(){sheetActionsPending=null;return null;});return sheetActionsPending;}
    function openSheetAction(kind,trigger){
        if(!editorCanMove())return;finishTextInputs();if(!editorCanMove())return;stopPianoAudition();var owner=state.session,version=owner.snapshotVersion;
        prepareSheetActions().then(function(ready){if(!ready||state.session!==owner||owner.snapshotVersion!==version||!editorCanMove())return;
            if(kind==='history')ready.ui.history(trigger,owner,function(cursor,ticket){
                if(state.session!==owner||!editorCanMove()){setSaveStatus('曲や保存状態が変わりました。現在の内容は保持しています。履歴を開き直してください。',true);return;}var direction=cursor<owner.getHistory().cursor?'undo':'redo';if(!historyController?.can(direction)){setSaveStatus('履歴に戻せませんでした。現在の内容は保持しています。',true);return;}
                var result=owner.restoreHistory(cursor,ticket,{discardFuture:true});refreshSessionStatus();if(!result.ok)setSaveStatus('履歴が変わりました。開き直してください。現在の内容は保持しています。',true);
            },function(project){if(state.session!==owner||!state.active)return;historyPreview=project?{owner:owner,version:owner.snapshotVersion,project:project}:null;if(project&&staffView)staffView.invalidate();renderPreview(true);});
            else{var original=owner.workingSnapshot(),intent=CS().documents.ticket(),base=owner.baseRevision;
                function current(){return state.session===owner&&state.active&&CS().documents.isSelected(intent)&&owner.snapshotVersion===version&&!owner.inputPending&&!owner.commitInFlight&&!owner.conflict&&!owner.externalUpdatePending&&!textDiagnostic(owner)&&CS().repository.readRevision(owner.target).revision===base;}
                ready.ui.saveAs(trigger,original.songInfo.title,async function(name){
                    if(!current())return {ok:false,error:'曲や入力状態が変わりました。開き直してください。'};
                    var project=ready.module.copyProject(original,name,CS().model.schema2.newId(),new Date().toISOString()),check=CS().model.validateProject(project);if(!check.ok)return {ok:false,error:check.errors.join(' / ')};
                    saveAsFlight=true;refreshToolbarActions();try{var result=await CS().repository.save({target:{type:'project',projectId:project.projectId},baseRevision:null,snapshot:project,precondition:current});
                        if(!result.ok)return result;if(current()){var next=CS().sessions.getOrCreateSession('structure',{type:'project',projectId:project.projectId});showSession(next);refreshProjectSelect();refreshSessionStatus();}return result;
                    }finally{saveAsFlight=false;refreshSessionStatus();}
                });
            }
        });
    }
    function openPlaybackSettings(trigger){
        if(!editorCanMove())return;var owner=state.session;
        if(!playbackSettingsPending)playbackSettingsPending=import('./playback-settings.mjs?v=0.141.0-dev.1').then(function(module){playbackSettings=module.createPlaybackSettings({document:document,host:els.root,read:function(){return {mix:playbackMix,scoreCountIn:countInEnabled,scoreMetronome:metronomeEnabled};},change:function(key,value,notice){
            if(key==='scorePlaybackMix'){playbackMix=module.normalizeMix(value);pianoAudition?.setMix(playbackMix);value=playbackMix;}else if(key==='scoreCountIn')countInEnabled=value;else metronomeEnabled=value;
            try{var raw=localStorage.getItem('cruiseStudio.appSettings'),settings=raw===null?{}:JSON.parse(raw);if(!settings||typeof settings!=='object'||Array.isArray(settings))throw Error('invalid-settings');var result=CS().storage.setAppSetting(key,value);if(!result.ok)throw Error(result.error);notice.textContent='';}catch(_){notice.textContent='設定を保存できませんでした。この画面にのみ適用しています';}
        },closed:refreshToolbarActions});return playbackSettings;}).catch(function(){playbackSettingsPending=null;setSaveStatus('再生設定を読み込めませんでした',true);});
        playbackSettingsPending.then(function(settings){if(settings&&state.session===owner&&editorCanMove())settings.open(trigger);});
    }
    function prepareFormPopup(){if(!formPopupPending)formPopupPending=import('./form-popup.mjs?v=0.141.0-dev.1').then(function(m){formPopupModule=m;return m;}).catch(function(){formPopupPending=null;return null;});return formPopupPending;}
    function closePaperForm(){formPopupEpoch++;if(formDialog){var dialog=formDialog;formDialog=null;dialog.noRestore=true;dialog.close();dialog.remove();}}
    async function openPaperForm(cell,eventId,tick){
        if(!editorCanMove()||!CS().localPaperForms)return;
        var number=Number(cell.dataset.barNumber),p=state.session.workingSnapshot(),chord=p.bars[number-1]?.chords.find(function(c){return eventId?c.id===eventId:c.onsetTick===tick;}),binding=chord&&p.performance.formBindings.find(function(b){return b.chordEventId===chord.id;}),material=binding&&p.materials.forms.find(function(m){return m.id===binding.materialId;});
        if(!material){setSaveStatus('このコードのフォームは未登録です');return;}
        var owner=state.session,ticket=CS().structureOperations.capture(owner),barId=p.bars[number-1].id,request=++formPopupEpoch;
        if(!formPopupModule&&!await prepareFormPopup()){setSaveStatus('フォームを開けませんでした',true);return;}
        if(request!==formPopupEpoch||state.session!==owner||!cell.isConnected||!CS().structureOperations.isCurrent(ticket,owner)||!editorCanMove())return;
        closePaperForm();var previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='sc-form-dialog';dialog.dataset.paperFormDetail=chord.id;dialog.setAttribute('aria-label',chord.symbol+'のコードフォーム');els.root.appendChild(dialog);formDialog=dialog;
        formPopupModule.createFormPopup({document:document,dialog:dialog,symbol:chord.symbol,snapshot:material.snapshot,playedStrings:binding.playedStrings,diagram:CS().localPaperForms.diagram,detectBarres:window.ChordCruise.caged.detectBarres,apply:function(draft){
            if(state.session!==owner||!CS().structureOperations.isCurrent(ticket,owner))return {ok:false,error:'編集対象が変わりました。開き直してください'};
            draft.snapshot.playability='unknown';draft.snapshot.ownerWarning='変更した押さえ方は未確認';
            var authored=CS().localChordForms.material(draft.snapshot,chord.symbol,'manual',material.provenance.externalMaterialId,material.provenance.shape);
            var result=CS().localChordForms.adopt(owner,barId,chord.id,authored,draft.playedStrings);if(result.ok){closePaperForm();redrawSession(false);setSaveStatus('フォームを変更しました（未保存）');}return result;
        }});
        var outside=false;function isOutside(e){var r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;}
        dialog.addEventListener('pointerdown',function(e){outside=isOutside(e);});dialog.addEventListener('click',function(e){if(outside&&isOutside(e)){e.preventDefault();e.stopPropagation();dialog.close();}outside=false;});
        dialog.addEventListener('close',function(){if(formDialog===dialog)formDialog=null;dialog.remove();if(!dialog.noRestore&&previous?.isConnected)previous.focus({preventScroll:true});});dialog.addEventListener('keydown',function(e){e.stopPropagation();if(e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();dialog.close();}if((e.ctrlKey||e.metaKey)&&['s','z'].includes(e.key.toLowerCase()))e.preventDefault();});dialog.showModal();
    }
    function editSelectedBar(){if(emptySlotSelection?.owner===state.session){openScoreSettings('slot',{slot:emptySlotSelection.slot});return;}if(!editorCanMove()||!getSelectedBar())return;editorOpen=true;syncSheetSelection();els.slotOverlay.focus({preventScroll:true});}
    function copySelectedBar(){
        if(!editorCanMove()||!selectedIDs().length)return false;finishTextInputs();if(!editorCanMove())return false;
        var source=state.session.workingSnapshot(),ids=selectedIDs();barClipboards.set(state.session,{source:source,sourceBarIds:ids});refreshToolbarActions();setSaveStatus(ids.length+'小節をコピーしました（このProject内）');return true;
    }
    function pasteSelectedBar(insert){
        insert=insert===true;
        if(!editorCanMove())return false;var clip=barClipboards.get(state.session),bar=state.session.draft.bars[state.selectedBarNumber-1],empty=emptySlotSelection?.owner===state.session?emptySlotSelection.slot:null;if(!clip||(!bar&&!empty))return false;
        if(!insert&&selectedBarIds.length>1&&selectedBarIds.length!==clip.sourceBarIds.length){setSaveStatus('コピーした小節数と貼り付け先の選択数を合わせてください',true);return false;}
        var cells=Array.from(els.scaleBox.querySelectorAll('.sheet-line > .sheet-bar')),start=cells.findIndex(function(cell){return bar?Number(cell.dataset.barNumber)===state.selectedBarNumber:cell.dataset.emptySlot===emptySlotSelection.key;}),targets=cells.slice(start,start+clip.sourceBarIds.length).map(function(cell){return cell.dataset.emptySlot?JSON.parse(cell.dataset.emptySlot):{barId:state.session.draft.bars[Number(cell.dataset.barNumber)-1].id};});
        var oldIds=new Set(state.session.draft.bars.map(function(b){return b.id;})),result=runStructureOperation('pasteBars',{barId:bar?.id,slot:empty,source:clip.source,sourceBarIds:clip.sourceBarIds,targetSlots:insert?undefined:targets,insert:insert===true});
        if(result.ok){emptySlotSelection=null;var index=bar&&!insert?state.session.draft.bars.findIndex(function(b){return b.id===bar.id;}):state.session.draft.bars.findIndex(function(b){return !oldIds.has(b.id);});editorOpen=false;redrawSession(false);if(index>=0){selectSheetBar(index+1);if(clip.sourceBarIds.length>1){selectedBarIds=state.session.draft.bars.slice(index,index+clip.sourceBarIds.length).map(function(b){return b.id;});syncSheetSelection();}}setSaveStatus(clip.sourceBarIds.length+'小節を貼り付けました（元に戻すで復元）');}return result.ok;
    }
    function onBarClipboardKey(event){
        if(event.defaultPrevented||!(event.ctrlKey||event.metaKey)||event.altKey||event.shiftKey||event.isComposing||event.keyCode===229||!state.active)return;
        var key=event.key.toLowerCase();if(!['c','v'].includes(key))return;
        var target=event.target;if(!els.root.contains(target)||target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')||!editorCanMove()||(!state.selectedBarNumber&&emptySlotSelection?.owner!==state.session)||!els.slotOverlay.classList.contains('hidden'))return;
        if(window.getSelection()?.toString())return;
        if(key==='v'&&!barClipboards.has(state.session))return;
        event.preventDefault();event.stopPropagation();if(event.repeat)return;if(key==='c')copySelectedBar();else pasteSelectedBar(false);
    }
    function onPreviewClick(event) {
        if(event.defaultPrevented)return;if(performance.now()<rangeClickUntil){rangeClickUntil=0;event.preventDefault();event.stopPropagation();return;}
        var metadata=event.target.closest?.('[data-paper-edit]');if(metadata&&metadata.dataset.paperEdit){event.stopPropagation();var field=metadata.dataset.paperEdit;openScoreSettings(field==='instrument'?'instrument':field==='rhythm'?'rhythm':'inline',{field:field,sectionId:metadata.dataset.sectionId});return;}
        var sectionPlay=event.target.closest?.('[data-play-section]');if(sectionPlay){event.stopPropagation();if(selectPlaybackSection(sectionPlay.dataset.playSection,false,true))startPreview('song');return;}
        var empty=event.target.closest?.('[data-editable-empty]');if(empty){event.stopPropagation();if(emptySlotSelection?.key===empty.dataset.emptySlot)editSelectedBar();else selectEmptySlot(empty);return;}
        var edit=event.target.closest?.('[data-edit-selected-bar]');if(edit){event.stopPropagation();editSelectedBar();return;}
        var section=event.target.closest?.('.sheet-section-label[data-section-id]');if(section){selectPlaybackSection(section.dataset.sectionId,true);return;}
        var cell=event.target.closest?.('.sheet-bar[data-bar-number]');if(!cell||cell.classList.contains('sheet-bar--empty'))return;event.stopPropagation();
        var form=event.target.closest('.sheet-form-event');if(form){openPaperForm(cell,form.dataset.formEvent);return;}
        if(!editorCanMove())return;var number=Number(cell.dataset.barNumber);if(!event.shiftKey&&!editorOpen&&state.selectedBarNumber===number&&selectedBarIds.length<=1){editSelectedBar();return;}closePaperForm();editorOpen=false;selectBarRange(number,event.shiftKey);cell.focus({preventScroll:true});
    }
    function isBlankScoreSurface(target){
        // A bar owns its entire rectangle, including empty tracks and padding.
        // Only surroundings outside bars may clear the current selection.
        if(target.closest('.sheet-bar,button,a,label,summary,input,textarea,select,[data-paper-edit]'))return false;
        if(target.closest('.sheet-preview'))return true;
        return els.root.contains(target)&&!target.closest('.workspace-local-nav,#sc-editor-drawer,.sc-toolbar-menu,[role=button]');
    }
    function onPaperMarginClick(event){
        if(event.defaultPrevented||!editorCanMove()||els.slotOverlay.contains(event.target))return;
        if(!isBlankScoreSurface(event.target))return;
        if(performance.now()<rangeClickUntil){rangeClickUntil=0;event.preventDefault();return;}
        deselectBar();els.root.focus({preventScroll:true});
    }
    function onPaperNavigationKey(event){
        if(event.defaultPrevented||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||event.isComposing||event.keyCode===229||event.altKey||event.ctrlKey||event.metaKey||!editorCanMove())return;
        var target=event.target;if(!(target===document.body||els.root.contains(target)||els.slotOverlay.contains(target))||target.closest('summary,.sc-toolbar-menu,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],.dock-strum-cell,[data-piano-event],.sheet-form-event,a,button:not(#sc-copy-bar):not(#sc-paste-bar),[role="button"]:not(.sheet-bar)'))return;
        var number=Number(target.closest('.sheet-bar[data-bar-number]')?.dataset.barNumber)||state.selectedBarNumber;if(!number)return;
        event.preventDefault();event.stopPropagation();var next;
        if(event.key==='ArrowUp'||event.key==='ArrowDown'){
            var current=getSheetBarByNumber(number),line=current?.closest('.sheet-line');if(!line)return;var lines=Array.from(els.scaleBox.querySelectorAll('.sheet-line')),index=lines.indexOf(line),other=lines[index+(event.key==='ArrowUp'?-1:1)];if(!other)return;var column=Array.from(line.children).indexOf(current),bars=Array.from(other.querySelectorAll('.sheet-bar[data-bar-number]'));if(!bars.length)return;next=Number(bars[Math.min(column,bars.length-1)].dataset.barNumber);
        }else next=number+(event.key==='ArrowLeft'?-1:1);
        if(next<1||next>state.session.draft.bars.length)return;selectBarRange(next,event.shiftKey);(editorOpen?els.slotOverlay:getSheetBarByNumber(next))?.focus({preventScroll:true});
    }
    function onPreviewKeydown(event) {
        if(event.isComposing||event.keyCode===229)return;
        var empty=event.target.closest?.('[data-editable-empty]');if(empty&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();if(emptySlotSelection?.key!==empty.dataset.emptySlot)selectEmptySlot(empty);editSelectedBar();return;}
        var metadata=event.target.closest?.('[data-paper-edit]');if(metadata&&['Enter',' '].includes(event.key)){event.preventDefault();metadata.click();return;}
        var form=event.target.closest?.('.sheet-form-event');if(form&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();openPaperForm(form.closest('.sheet-bar'),form.dataset.formEvent);return;}
        onPaperNavigationKey(event);if(event.defaultPrevented)return;
        if(event.key!=='Enter'||event.target.closest('[data-edit-selected-bar]'))return;
        var section=event.target.closest?.('.sheet-section-label[data-section-id]');if(section){event.preventDefault();selectPlaybackSection(section.dataset.sectionId,true);return;}
        var cell=event.target.closest?.('.sheet-bar[data-bar-number]');if(!cell||cell.classList.contains('sheet-bar--empty')||!editorCanMove())return;
        event.preventDefault();editorOpen=true;selectBarRange(Number(cell.dataset.barNumber),event.shiftKey);
    }

    /* ══════════ 表示トグル（sheetSettings.showChords / showStrum / showLyrics /
       showDoremi / showTimingGrid / timingGridResolution） ══════════ */

    function renderDisplayToggles() {
        var show = {...CS().sheetRenderer.resolveShowSettings(state.project),...effectivePaperVisibility(state.project)};
        if(els.showForms)els.showForms.checked=show.forms;
        els.showChords.checked = show.chords;
        els.showStrum.checked = show.strum;
        els.showLyrics.checked = show.lyrics;
        els.showDoremi.checked = show.doremi;
        els.showGrid.checked = show.timingGrid;
        els.gridResolution.value = String(show.gridResolution);
        els.gridResolution.disabled = !show.timingGrid;
    }

    function onDisplayToggleChange() {
        var appearance=CS().localPaperLayout?.value.appearance;if(appearance&&Object.keys(appearance.visibility).some(function(k){return k!=='forms';})){
            var timingGrid=els.showGrid.checked,gridResolution=Number(els.gridResolution.value);CS().localPaperLayout.set({appearance:{...appearance,visibility:{...appearance.visibility,chords:els.showChords.checked,strum:els.showStrum.checked,lyrics:els.showLyrics.checked,doremi:els.showDoremi.checked}}});
            var original=CS().sheetRenderer.resolveShowSettings(state.project);if(original.timingGrid===timingGrid&&original.gridResolution===gridResolution){renderPreview(true);return;}
            var grid=runStructureOperation('display',{settings:{showChords:original.chords,showStrum:original.strum,showLyrics:original.lyrics,showDoremi:original.doremi,showTimingGrid:timingGrid,timingGridResolution:gridResolution}});if(grid.ok){markDirty();renderPreview();}renderDisplayToggles();return;
        }
        var result = runStructureOperation('display', { settings: {
            showChords: els.showChords.checked, showStrum: els.showStrum.checked,
            showLyrics: els.showLyrics.checked, showDoremi: els.showDoremi.checked,
            showTimingGrid: els.showGrid.checked,
            timingGridResolution: els.gridResolution.value === '16' ? 16 : 8
        } });
        if (!result.ok) { renderDisplayToggles(); return; }
        els.gridResolution.disabled = !els.showGrid.checked;
        markDirty();
        renderPreview();
    }

    /* ══════════ 印刷・JSON入出力 ══════════ */

    /**
     * ブラウザ印刷（PDF保存）。print.css が譜面プレビューだけを印刷対象にする（ADR-010）。
     */
    function prepareExplicitOutput() {
        finishTextInputs();
        if(!state.session||schemaViewError||!operationEligible()||state.session.inputPending||textDiagnostic(state.session)){
            setSaveStatus('未確定・不正な入力を確認してください。入力内容を保持し、出力を中止しました',true);return false;
        }
        return true;
    }
    function printSheet() {
        if(!prepareExplicitOutput())return;
        renderPreview();
        prepareCodePrint();
        window.print();
    }

    function downloadCurrentProjectJson() {
        if(!prepareExplicitOutput())return;
        var json = CS().storage.exportProjectJson(state.session.workingSnapshot());
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var title = state.project.songInfo.title || 'project';
        a.href = url;
        a.download = 'cruise-studio_' + title.replace(/[\\/:*?"<>|\s]+/g, '_') + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setSaveStatus('JSONファイルへ書き出しました');
    }

    function onImportJsonFile(event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        var reader = new FileReader();
        var intent = CS().documents.ticket(), importFrame = CS().structureOperations.capture(state.session);
        reader.onload = function () {
            if (!CS().documents.isSelected(intent)) {
                if (CS().structureOperations.isCurrent(importFrame, state.session)) setSaveStatus('対象の曲が変わったため読み込みを中止しました', true);
                return;
            }
            if (!CS().structureOperations.isCurrent(importFrame, state.session)) return;
            var res = CS().storage.importProjectJson(String(reader.result));
            if (!res.ok) {
                setSaveStatus(res.error, true);
                return;
            }
            var warnText = res.warnings.length ? '（警告: ' + res.warnings.join(' / ') + '）' : '';
            setProject(res.project, {
                dirty: true,
                statusMessage: 'JSONを読み込みました（未保存）' + warnText
            });
            if (state.session && state.session.target.projectId === res.project.projectId &&
                !state.session.dirty && !state.session.inputPending && !state.session.commitInFlight && state.session.baseRevision !== null) {
                setSaveStatus('JSONを読み込みました（保存済みの内容と一致）' + warnText);
            }
        };
        reader.onerror = function () {
            if (!CS().documents.isSelected(intent) || !CS().structureOperations.isCurrent(importFrame, state.session)) return;
            setSaveStatus('ファイルの読み取りに失敗しました', true);
        };
        reader.readAsText(file);
    }

    /* ══════════ 保存 ══════════ */

    function save(event) { if (CS().shellHost) CS().shellHost.commands.execute('studio.save', event); }

    function commitSession(session) {
        session.finishTextGroup();
        // UI mutations already write to the session; never read another document's form here.
        return session.commit().then(function (result) {
            if (state.session === session) {
                refreshProjectSelect(); refreshSessionStatus();
                if (result.ok && !session.dirty && !session.externalUpdatePending) setSaveStatus('保存しました（' + session.draft.songInfo.title + '）');
            }
            return result;
        });
    }

    function routeLocalSave(event) {
        if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's') return false;
        if (event.isComposing || event.keyCode === 229 || state.overlayComposingRowId !== null ||
            state.lyricComposingTick !== null || state.lyricJustComposed || state.overlayBulkComposing) return false;
        return !!(CS().shellHost && CS().shellHost.keyboard.localCommand(event, 'studio.save', 'sheetCruise'));
    }

    /* ══════════ 画面ライフサイクル（app.js から呼ばれる） ══════════ */

    /**
     * 譜面クルーズ画面に入る。
     * currentProjectId → 最新の保存済みプロジェクト → 新規作成 の順で開く
     * （TOPのサンプル作成直後などに別の新規が開かないようにする）。
     */
    function load(projectId) {
        var storage = CS().storage;
        if (projectId) { openProject(projectId); return; }
        if (state.session) return;
        var currentId = storage.getCurrentProjectId();
        if (currentId && openProject(currentId)) return;
        var latest = storage.listProjects()[0];
        if (latest && latest.projectId !== currentId && openProject(latest.projectId)) return;
        createNewProject();
    }

    // 表示の切替はhostが担当。activateはstorageを読まず、保持したdraftのgeometryを復帰する。
    function activate() {
        state.active = true;
        prepareScorePlayback();prepareScoreSettings();prepareEditorHelp();prepareFormPopup();
        refreshHistoryControls();
        publishSelection();
        staffRequest();
        if (state.workspaceScroll && CS().scroll) {
            CS().scroll.restorePosition('sheetCruise', state.workspaceScroll);
        }
        if (state.workspaceFocus && state.workspaceFocus.isConnected && isWorkspaceVisible()) {
            state.workspaceFocus.focus({ preventScroll: true });
        }
        scheduleOverlayPosition(false);
    }

    function deactivate() {
        cancelRangeSelection();cancelBarDrag();editorHelp?.close({restoreFocus:false});scoreSettings?.close();stopPianoAudition();closePaperForm();playbackSettings?.close(false);sheetActions?.close(false);CS().localPaperLayout?.close();
        if(editorPlacement==='right')CS().localEditorPane?.unmount(els.slotOverlay);
        if (!state.active) return;
        finishTextInputs();
        state.workspaceScroll = CS().scroll ? CS().scroll.getPosition('sheetCruise') : null;
        var focused = document.activeElement;
        state.workspaceFocus = els.root && els.root.contains(focused) ? focused : null;
        state.active = false;
        if(CS().melodyInspector)CS().melodyInspector.deactivate();
        if (staffView) staffView.invalidate('五線プレビューは再表示待ちです');
        refreshHistoryControls();
        publishSelection();
        if (state.overlayFrame) window.cancelAnimationFrame(state.overlayFrame);
        state.overlayFrame = null;
        state.overlayRefreshRequested = false;
    }

    // 公開API互換: enterは旧hostの明示reload入口。Shellの復帰にはactivateを使う。
    function enter() {
        load();
        activate();
    }

    /**
     * 画面切替ではsessionを保持する。ページを閉じる場合はbeforeunloadで保護する。
     */
    function canLeave() {
        return true; // Workspace navigation retains all sessions.
    }

    function init() {
        resolveElements();
        mountEditorStyles();
        mountScoreToolbar();
        mountSheetZoom();
        fillKeySelect(els.originalKey);
        fillKeySelect(els.playKey);

        // F1: フローティング小節ルーペの初期位置/幅（appSettingsに保存済みなら復元）と
        // 非モーダルなツールパレットとしての静的a11y属性
        loadPianoColors();
        initLoupeGeometry();
        if (els.slotOverlay) {
            els.slotOverlay.setAttribute('role', 'dialog');
            els.slotOverlay.setAttribute('aria-modal', 'false');
            els.slotOverlay.tabIndex = -1;
        }

        els.projectSelect.addEventListener('change', function () {
            var selectedId = els.projectSelect.value;
            if (state.project && selectedId === state.project.projectId) return;
            refreshProjectSelect();
            requestLeave(function(){openProject(selectedId);});
        });
        els.newProjectBtn.addEventListener('click', function(){requestLeave(createNewProject);});
        els.scaleBox.addEventListener('dragstart',function(e){
            cancelBarDrag();var cell=e.target.closest('.sheet-bar[data-bar-number]');
            if(rangeDrag||!state.selectedBarNumber||!cell||!editorCanMove()||!e.dataTransfer){e.preventDefault();return;}
            var bar=state.session.draft.bars[Number(cell.dataset.barNumber)-1];if(!bar){e.preventDefault();return;}
            dragFrame={ticket:CS().structureOperations.capture(state.session),ids:selectedBarIds.includes(bar.id)?selectedBarIds.slice():[bar.id]};
            els.scaleBox.querySelectorAll('.sheet-bar[data-bar-number]').forEach(function(el){if(dragFrame.ids.includes(state.session.draft.bars[Number(el.dataset.barNumber)-1]?.id))el.classList.add('sc-bar-drag-source');});
            e.dataTransfer.setData('text/plain','Studio bars');e.dataTransfer.effectAllowed='move';
        });
        els.scaleBox.addEventListener('dragover',function(e){var target=resolveBarDrop(e);if(e.dataTransfer&&dragFrame)e.dataTransfer.dropEffect=target?'move':'none';if(!target){clearBarDropMarker();return;}e.preventDefault();showBarDropMarker(target);});
        els.scaleBox.addEventListener('dragleave',function(e){if(!els.scaleBox.contains(e.relatedTarget))clearBarDropMarker();});
        els.scaleBox.addEventListener('drop',function(e){var frame=dragFrame,target=resolveBarDrop(e);if(frame)e.preventDefault();cancelBarDrag();if(target)moveSelectedBars(Object.assign({barIds:frame.ids},target.side==='after'?{afterId:target.anchorId}:{beforeId:target.anchorId}));});
        document.addEventListener('dragend',cancelBarDrag);
        document.addEventListener('drop',cancelBarDrag);
        document.addEventListener('dragover',function(e){if(dragFrame&&!els.scaleBox.contains(e.target))clearBarDropMarker();});
        document.addEventListener('scroll',function(){if(dragFrame&&barDropCell){if(!editorCanMove()||!CS().structureOperations.isCurrent(dragFrame.ticket,state.session))cancelBarDrag();else positionBarDropMarker();}},true);
        document.addEventListener('keydown',function(e){if(dragFrame&&e.key==='Escape'){cancelBarDrag();e.stopPropagation();}},true);
        window.addEventListener('blur',function(){cancelBarDrag();cancelRangeSelection();});window.addEventListener('resize',cancelBarDrag);


        function rejectUnsupportedMeter(event) {
            if (state.session && state.session.draft.schemaVersion === 2 && els.timeSig.value !== '4/4') {
                els.timeSig.value = '4/4';
                q('sc-edit-error').textContent = '現在のschema2保存契約は4/4のみです。拍別データを保持するため変更しませんでした';
                event.stopImmediatePropagation();
            }
        }
        els.timeSig.addEventListener('input', rejectUnsupportedMeter, true);
        els.timeSig.addEventListener('change', rejectUnsupportedMeter, true);
        [[els.title, 'title'], [els.artist, 'artist'], [els.capo, 'capo'], [els.bpm, 'bpm'],
         [els.originalKey, 'originalKey'], [els.playKey, 'playKey'], [els.timeSig, 'timeSignature']].forEach(function (pair) {
            wireTextControl(pair[0], { kind: 'song', field: pair[1] }, onFieldChange, true);
            if (pair[0].tagName === 'SELECT') pair[0].addEventListener('change', onFieldChange);
        });
        wireTextControl(els.basicStrum, { kind: 'basicStrum' }, onBasicStrumInput, true);

        els.addSectionBtn.addEventListener('click', onAddSection);
        els.saveBtn.addEventListener('click', save);
        document.querySelectorAll('[data-bar-operation]').forEach(function(button){button.addEventListener('click',function(){
            if (!operationEligible()) return;
            var index=state.selectedBarNumber-1, canonical=state.session.draft, selected=canonical.bars[index];
            if(!selected){setSaveStatus('編集する小節を選択してください',true);return;}
            var kind=button.dataset.barOperation, direction=Number(button.dataset.direction), id=selected.id;
            if(kind==='deleteBar'){deleteSelectedBars(true);return;}
            if(kind==='duplicateBar'&&selectedBarIds.length>1){var copy=runStructureOperation('duplicateBars',{barIds:selectedIDs()});if(copy.ok)redrawSession(false);return;}
            if(kind==='moveBar'&&selectedBarIds.length>1){moveSelectedBars({barIds:selectedBarIds.slice(),direction:direction});return;}
            var result=runStructureOperation(kind,{barId:id,direction:direction});
            if(!result.ok)return;
            var next=kind==='deleteBar'?Math.min(index,state.session.draft.bars.length-1):kind==='moveBar'?index+direction:kind==='addBar'||kind==='duplicateBar'?index+1:index;
            selectSheetBar(next+1);setSaveStatus((next+1)+'小節目を選択（未保存）');
        });});
        [['sc-transpose-down',-1],['sc-transpose-up',1]].forEach(function(pair){q(pair[0]).addEventListener('click',function(){if(operationEligible()&&runStructureOperation('transpose',{semitones:pair[1]}).ok)redrawSession(false);});});
        q('sc-goto-pre-dtm').addEventListener('click', function () {
            if (state.session && state.session.inputPending) { setSaveStatus('入力の確定を待ってください', true); return; }
            finishTextInputs();
            requestLeave(function(){CS().shellHost.navigate('preDtm');});
        });
        [els.undoBtn, els.redoBtn].forEach(function (button) {
            button.addEventListener('pointerdown', function (event) {
                if (event.button === 0) event.preventDefault(); // explicit domain button does not blur the editor first
            });
            button.addEventListener('click', function (event) {
                if (CS().shellHost) CS().shellHost.commands.execute(button === els.undoBtn ? 'studio.undo' : 'studio.redo', event);
                refreshHistoryControls();
            });
        });
        els.root.addEventListener('keydown', routeLocalSave);
        document.addEventListener('keydown',onPlaybackSpace);
        document.addEventListener('keydown',onBarClipboardKey);
        document.addEventListener('keydown',onPaperNavigationKey);
        els.slotOverlay.tabIndex=-1;els.slotOverlay.addEventListener('pointerdown',function(e){if(e.composedPath().some(function(node){return node?.matches?.('[data-chord-picker]');}))return;if(!e.target.closest('button,input,textarea,select,a,[contenteditable],[data-piano-event],.slot-overlay-resize-handle')&&editorCanMove())els.slotOverlay.focus({preventScroll:true});});
        document.addEventListener('focusin', function () { focusEpoch++; finishTextInputs(); }, true);
        // An IME buffer is not a semantic draft edit yet. Hold external adoption until it settles.
        els.root.addEventListener('compositionstart', function (event) {
            if (state.session) { compositionOwners.set(event.target, state.session); state.session.setInputPending(true); }
        }, true);
        els.root.addEventListener('compositionend', function (event) {
            var owner = compositionOwners.get(event.target);
            if (owner) {
                compositionOwners.delete(event.target); owner.setInputPending(false);
                var ticket = CS().documents.ticket();
                window.setTimeout(function () {
                    if (state.session === owner && CS().documents.isSelected(ticket)) refreshHistoryControls();
                }, 0); // UI eligibility refresh only; never defer an Undo action
            }
        });
        CS().sessions.subscribe(function (session, kind) {
            if (state.session !== session) return;
            if(kind==='operation'&&pianoAudition?.snapshot().mode)pianoAudition.cancel();
            if (['external-adopt', 'cancel', 'replace', 'undo', 'redo'].includes(kind)){cancelRangeSelection();cancelBarDrag();editorHelp?.close({restoreFocus:false});stopPianoAudition();textDiagnostics.delete(session);}
            if(!state.project){renderInvalidProject();refreshSessionStatus();publishSelection();return;}
            if(els.scaleBox.querySelector('.schema-invalid-project'))renderAll();
            if(['external-adopt','cancel','replace'].includes(kind))state.lyricBeatResV2.delete(session);
            var nextStructure = CS().structureOperations.structureKey(session.draft), structureChanged = structureIdentity !== nextStructure;
            if (structureChanged) {
                // barNumber is not stable: never carry a Loupe into a different bar after renumbering.
                var selectedId=session.draft.schemaVersion===2 && publishedBars && publishedBars[state.selectedBarNumber-1]?.id;
                selectionDeleted = !!(state.selectedBarNumber && (selectedId ? !session.draft.bars.some(function(b){return b.id===selectedId;}) : !getSelectedBar()));
                selectedBarIds = [];
                state.selectedBarNumber = null; state.dockManualRes = {}; state.overlayWarnings = {};
                state.dockBulkOpen = false;
                syncSheetSelection();
            }
            if (kind === 'operation' && structureIdentity === nextStructure && publishedBars) {
                // Publication replaces proxies. Preserve UI-only beat resolution on unchanged bar layout.
                publishedBars.forEach(function (bar, i) {
                    var resolution = state.lyricBeatRes.get(bar);
                    if (resolution && session.draft.bars[i]) state.lyricBeatRes.set(session.draft.bars[i], resolution);
                });
            }
            publishedBars = session.draft.bars;
            structureIdentity = nextStructure;
            if (['external-adopt', 'cancel', 'replace', 'undo', 'redo'].includes(kind) || (kind === 'operation' && structureChanged)) redrawSession(structureChanged);
            refreshSessionStatus();
            if(['commit-start','commit-success','commit-failure','input','validation','external-pending'].includes(kind))refreshPiano();
            publishSelection();
            staffRequest();
        });
        q('sc-adopt-external').addEventListener('click', function () {
            var session = state.session;
            if (!window.confirm('編集中の変更を破棄して、最新の保存済みprojectを採用しますか？')) return;
            session.adoptExternal().then(function (result) { if (!result.ok && state.session === session) setSaveStatus(result.error, true); });
        });
        q('sc-score-style').addEventListener('change', function (event) {
            if (!operationEligible()) { event.target.value = staffStyle; return; }
            staffStyle = event.target.value === 'melody' ? 'melody' : 'code';
            if(staffStyle==='code'&&CS().melodyInspector)CS().melodyInspector.deactivate();
            if (staffView) staffView.invalidate();
            renderPreview(true);
        });
        q('sc-staff-refresh').addEventListener('click', staffRequest);
        els.root.addEventListener('compositionend', function () { window.setTimeout(staffRequest, 0); });
        els.root.addEventListener('focusin', function () { if (staffStyle === 'melody') staffRequest(); });
        window.addEventListener('beforeprint', prepareCodePrint);
        window.addEventListener('afterprint', function () { var f = els.scaleBox.querySelector('.melody-print-fallback'); if (f) f.remove(); });
        els.printBtn.addEventListener('click', printSheet);
        els.exportBtn.addEventListener('click', downloadCurrentProjectJson);
        els.importInput.addEventListener('change', onImportJsonFile);


        [els.showChords, els.showStrum, els.showLyrics, els.showDoremi,
         els.showGrid, els.gridResolution].forEach(function (el) {
            el.addEventListener('change', onDisplayToggleChange);
        });

        // ペイン幅の変化に合わせてA4紙面のスケールを追従させる
        window.addEventListener('resize', function () { scheduleOverlayPosition(false); });
        observeWorkspaceSize();
        els.preview.addEventListener('click', onPreviewClick);
        els.root.addEventListener('click', onPaperMarginClick);
        els.root.addEventListener('pointerdown',beginRangeSelection);
        document.addEventListener('pointermove',extendRangeSelection,{passive:false});
        document.addEventListener('pointerup',endRangeSelection);document.addEventListener('pointercancel',endRangeSelection);
        window.addEventListener('blur',cancelRangeSelection);
        els.preview.addEventListener('keydown', onPreviewKeydown);

        // D1: ドロワー開閉でプレビュー領域の高さが変わり、overlay位置がズレうるため再計算する
        if (els.editorDrawer) els.editorDrawer.addEventListener('toggle', scheduleOverlayPosition);
        if (els.barGridDrawer) els.barGridDrawer.addEventListener('toggle', scheduleOverlayPosition);

        // D3a/F1: まとめて入力ポップオーバーの外側クリックで閉じる。Escapeは
        // ポップオーバー→セル編集解除→ルーペを閉じる、の優先順位で処理する
        // （ドックは毎描画で作り直すため、要素にではなくdocumentへ一度だけ登録する）
        document.addEventListener('click', onDocumentClickForBulkPopover);
        // Escape is registered once by Shell; no independent document key listener.

        // ブラウザのタブ閉じ / リロード / URL移動に対する未保存ガード。
        // 画面内の移動はsessionを保持し、他projectのdirty draftも閉じる前に保護する。
        document.addEventListener('visibilitychange',function(){if(document.hidden)stopPianoAudition();});
        window.addEventListener('pagehide',stopPianoAudition);
        window.addEventListener('beforeunload', function (e) {
            if (!CS().sessions.listSessions().some(function (session) { return session.dirty || session.commitInFlight || session.inputPending; })) return;
            e.preventDefault();
            e.returnValue = ''; // ブラウザ標準の確認ダイアログを出す
        });
    }

    window.CruiseStudio = window.CruiseStudio || {};
    window.CruiseStudio.sheetCruise = {
        // B-line local UI candidate; formal product/cache identity remains A-owned.
        developmentVersion: '0.141.0-dev.1',
        connectPaperLayout: mountPaperLayoutControls,
        init: init,
        connectHistoryCommands: connectHistoryCommands,
        enter: enter,
        load: load,
        activate: activate,
        deactivate: deactivate,
        setLoupeSafeAreaProvider: setLoupeSafeAreaProvider,
        refreshRhythmView: function () { if (state.active && state.session === CS().documents.getSession()) redrawSession(false); },
        refreshAuthorization: refreshSessionStatus,
        refreshEditorGeometry: function () { scheduleOverlayPosition(false); },
        closeTransient: closeTransient,
        handleEscape: handleEscape,
        setEscapeRouter: function (router) { escapeRouter = router; },
        getSession: function () { return state.session; },
        openProject: openProject,
        getSelectionSnapshot: getSelectionSnapshot,
        subscribeSelection: function (fn) { selectionListeners.add(fn); return function () { selectionListeners.delete(fn); }; },
        getStaffMetrics: function () { return staffView ? staffView.metrics() : null; },
        commitSession: commitSession,
        refreshProjects: refreshProjectSelect,
        requestLeave: requestLeave,
        canLeave: canLeave
    };
})();
