/* クルーズスタジオ — sheet-cruise.js（Phase 2B / R2、UI再編D1/D2/D3a/F1でレイアウトのみ改修）
   譜面クルーズ画面: プロジェクト選択・曲情報フォーム・キー関係チェック・
   セクション管理・小節グリッド（1小節1コード入力）・簡易プレビュー・保存。
   歌詞・メロディ入力とA4紙面プレビューは Phase 2C / Phase 3。
   D1（docs/DECISIONS.md ADR-025）: 曲情報・セクション・表示設定・小節グリッドは
   上部ドロワー（#sc-editor-drawer）へ移動。
   D2 MVP（同ADR-025）: 小節上の極小overlay（S1b〜R2）を画面下部の横長ドックへ移設。
   D3a（同ADR-025 / ADR-026）: 巨大な縦積みフォーム型ドックを、選択小節と同じ時間軸を持つ
   コンパクトなタイムグリッド・ドックへ変更（「選択小節のX線写真」）。本格セル編集は
   ストローク行のみ。コードは1小節1セル、歌詞・メロディは見た目だけ時間軸へ揃え、
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
    // 歌詞もメロディもないセクション（前奏などのコードのみ）は2倍詰めで表示する。

    // 編集行の順序。セルは絶対tickで対応させ、表示の分割だけを拍別に切り替える。
    var DOCK_ROW_ORDER = ['chord', 'strum', 'lyrics', 'doremi'];
    var DOCK_ROW_LABELS = { chord: 'コード', strum: 'ストローク', lyrics: '歌詞', doremi: 'メロディ' };

    // D3a: ストロークセルのクリック循環順（空/restから開始）
    var STRUM_CELL_CYCLE = ['down', 'up', 'mute', 'sustain', 'rest', 'empty'];
    var STRUM_GLYPHS = { down: '↓', up: '↑', mute: 'x', empty: '', sustain: '〜' };

    // F1: フローティング小節ルーペのサイズ定数（docs/DECISIONS.md ADR-027）
    var LOUPE_DEFAULT_WIDTH = 960;
    var LOUPE_MARGIN = 8;
    var LOUPE_MIN_WIDTH = 280;
    var LOUPE_MIN_HEIGHT = 160;
    var LOUPE_NARROW_BREAKPOINT = 680;
    var LOUPE_MOVE_STEP = 16;
    var LOUPE_APP_SETTING_KEY = 'barLoupe';

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
        loupe: { x: 0, y: 0, width: LOUPE_DEFAULT_WIDTH, height: null } // UI geometry, stored separately from the score
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
    var sheetActions=null,sheetActionsPending=null,duplicateFlight=false,historyPreview=null;
    var enabledParts={chords:true,melody:true};
    var playbackSettings=null,playbackSettingsPending=null,playbackMix={chords:100,melody:100,metronome:100},playbackVisualDelay=0,metronomeSound='click',previewPaperCursor=null,playingPaperBar=null,previewEditorCursor=null,playingEditorMeasure=null;
    var editorOpen=false;
    var editorHorizontalZoom=100,editorBars=1,editorAnchorId=null,editorPlacement='floating',collapsedEditorRows=new Set();
    var sectionPlaybackSelection=null;
    var scoreSettings=null,scoreSettingsPending=null,emptySlotSelection=null;
    function prepareScoreSettings(){
        if(!scoreSettingsPending)scoreSettingsPending=import('./score-settings.mjs?v=0.204.0-dev.1').then(function(module){scoreSettings=module.createScoreSettings({C:CS(),document:document,getSession:function(){return state.session;},canEdit:editorCanMove,execute:runStructureOperation,createPreviewAudio:createLayoutPreview,loadChordPicker:prepareChordPicker,previewPaperOptions:project=>paperRenderOptions(project,null),closed:refreshSessionStatus,changed:function(change){
            emptySlotSelection=null;var oldIds=new Set(change.previous.bars.map(function(b){return b.id;})),added=state.session.draft.bars.findIndex(function(b){return !oldIds.has(b.id);});redrawSession(false);
            if(change.mode==='slot'&&added>=0){editorOpen=true;selectSheetBar(added+1);}refreshSessionStatus();
        }});return scoreSettings;}).catch(function(e){scoreSettingsPending=null;setSaveStatus(e.message||'編集画面を読み込めませんでした',true);});return scoreSettingsPending;
    }
    function openScoreSettings(mode,args){
        if(!editorCanMove())return;finishTextInputs();stopPianoAudition();var frame=CS().structureOperations.capture(state.session);prepareScoreSettings().then(function(service){if(service&&CS().structureOperations.isCurrent(frame,state.session)&&editorCanMove())service.open(mode,args);});
    }
    var editorHelp=null,editorHelpPending=null;
    function prepareEditorHelp(){
        if(!editorHelpPending)editorHelpPending=import('./editor-help.mjs?v=0.240.0-rc.1').then(function(module){editorHelp=module.createEditorHelp({document:document,closed:refreshToolbarActions});return editorHelp;}).catch(function(){editorHelpPending=null;setSaveStatus('操作ガイドを読み込めませんでした。もう一度お試しください',true);});return editorHelpPending;
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
    function revealEditorCell(target){
        const viewport=els.slotOverlay.querySelector('.editor-score-scroll');
        if(!viewport||!target)return;
        const area=viewport.getBoundingClientRect(),box=target.getBoundingClientRect();
        const label=viewport.querySelector('.slot-overlay-row-label');
        const left=area.left+(label?.offsetWidth||0)+8;
        if(box.right>area.right-8)viewport.scrollLeft+=box.right-area.right+8;
        else if(box.left<left)viewport.scrollLeft+=box.left-left;
    }
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
        staffView.render(state.project, state.session?.draft.extensions?.scoreCellValuesV1);
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
    function operationEligible(allowPlaybackSettings) {
        return state.active && !scoreSettings?.isOpen && !editorHelp?.isOpen && (allowPlaybackSettings===true||!playbackSettings?.isOpen) && !sheetActions?.isOpen && !duplicateFlight && !formDialog?.open && !CS().localPaperLayout?.isOpen && !(CS().shellHost && CS().shellHost.getCommandContext().activeModal) &&
            !(CS().shellHost && CS().shellHost.keyboard.isIMEBlocked({})) &&
            state.overlayComposingRowId === null && !state.overlayBulkComposing &&
            state.lyricComposingTick === null && !state.lyricJustComposed;
    }
    function runStructureOperation(kind, args, expected) {
        finishTextInputs();
        if (!operationAdapter) operationAdapter = CS().structureOperations.create({ model: CS().model,
            getSession: function () { return state.session; }, isEligible: operationEligible, afterEdit:CS().localChordForms?.reconcile, installForm:CS().localChordForms?.installPreset,
            duplicateBinding:CS().localChordForms?.duplicateBinding });
        if(CS().localChordForms&&(['bulkChord','chordPreset','transpose','restoreSlot','instrument'].includes(kind)||kind==='songInfo'&&args?.instrument)&&!(kind==='restoreSlot'&&args?.activateEmpty)&&!CS().localChordForms.authorize(state.session))return {ok:false,error:'楽器条件の確認をキャンセルしました'};
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
        var listLabel=document.createElement('label'),listToggle=document.createElement('input');listLabel.className='pd-check';listToggle.type='checkbox';listToggle.id='sc-show-form-list';listLabel.append(listToggle,document.createTextNode(' フォーム一覧'));formsLabel.after(listLabel);listToggle.onchange=function(){if(editorCanMove())CS().localPaperLayout.set({appearance:{...CS().localPaperLayout.value.appearance,visibility:{...CS().localPaperLayout.value.appearance.visibility,formList:listToggle.checked}}});};
        check.addEventListener('change',function(){if(!state.session||!editorCanMove()){renderDisplayToggles();return;}if(typeof CS().localPaperLayout?.value.appearance.visibility.forms==='boolean')CS().localPaperLayout.set({appearance:{...CS().localPaperLayout.value.appearance,visibility:{...CS().localPaperLayout.value.appearance.visibility,forms:check.checked}}});else paperFormSessions.set(state.session,check.checked);renderPreview(true);});
        els.toolbar.appendChild(visibility);
        mountPaperLayoutControls();
        [['sc-copy-bar','コピー',copySelectedBar],['sc-paste-bar','貼り付け',pasteSelectedBar]].forEach(function(item){var b=document.createElement('button');b.type='button';b.id=item[0];b.className='btn btn-secondary btn-compact';b.textContent=item[1];b.title=item[1]+'（⌘ / Ctrl + '+(item[0]==='sc-copy-bar'?'C':'V')+'、同じ曲の選択小節）';b.addEventListener('click',item[2]);actions.querySelector('.sheet-bar-actions').appendChild(b);});
        els.undoBtn.title='元に戻す（⌘Z / Ctrl+Z）。メロディは既存の音符履歴を使います';els.redoBtn.title='やり直す（⌘⇧Z / Ctrl+Shift+Z）';
    }
    function mountMenuShortcuts(primary,picker,menuBody){
        const paths={
            'sc-new-project':'M5 3h9l5 5v13H5z M12 10v7m-3-3h6',
            'sc-save-overwrite':'M4 3h13l3 3v15H4z M8 3v6h8V3 M8 21v-8h8v8',
            'sc-duplicate-project':'M8 8h12v13H8z M5 16H3V3h12v2',
            'sc-save-as':'M4 3h12l4 4v4 M4 3v18h7 M8 3v6h7V3 M13 19l6-6 2 2-6 6-3 1z',
            'sc-import-json-button':'M3 15v5h18v-5 M12 3v12m-5-5 5 5 5-5',
            'sc-menu-file-location':'M2 6h8l2 3h10l-3 11H3z',
            'sc-menu-files':'M4 4h16v16H4z M7 8h2m2 0h6 M7 12h2m2 0h6 M7 16h2m2 0h6',
            'sc-menu-display':'M2 12q10-14 20 0-10 14-20 0z M15 12a3 3 0 1 0-6 0 3 3 0 1 0 6 0',
            'sc-menu-display-settings':'M3 6h9m4 0h5 M3 12h3m4 0h11 M3 18h11m4 0h3 M12 3v6 M7 9v6 M15 15v6',
            'sc-menu-fullscreen':'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',
            'sc-menu-tools':'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
            'sc-menu-staff-toggle':'M2 5h20M2 9h20M2 13h20M2 17h20 M15 3v12q-6-1-6 3t6-1',
            'sc-menu-zoom-out':'M5 12h14','sc-menu-zoom-in':'M5 12h14M12 5v14',
            'sc-menu-zoom-reset':'M3 9V4h5m8 0h5v5 M21 15v5h-5m-8 0H3v-5 M9 12h6',
            'sc-menu-playback-settings':'M3 9h4l5-5v16l-5-5H3z M16 8q5 4 0 8m3-11q8 7 0 14',
            'sc-edit-song':'M6 3h9l4 4v14H6z M10 10h5m-5 4h5',
            'sc-edit-instrument':'M4 4h16v16H4z M9 4v16m6-16v16 M7 4v8m10-8v8',
            'sc-edit-chord-preset':'M4 4h16v16H4z M9 4v16m6-16v16 M4 9h16M4 15h16 M8 6h2m4 6h2',
            'sc-edit-rhythm':'M7 3v17m-5-6 5 6 5-6 M17 21V4m-5 6 5-6 5 6',
            'sc-edit-sections':'M4 4h5v6H4z M12 7h8 M4 14h5v6H4z M12 17h8',
            'sc-export-viewer':'M3 4h18v13H3z M8 21h8m-4-4v4 M10 8l5 3-5 3z',
            'sc-export-pdf':'M5 3h10l4 4v14H5z M14 3v5h5 M8 17q6-14 5-5t4 3q-6-2-9 2',
            'sc-export-json':'M4 15v5h16v-5 M12 16V3m-5 5 5-5 5 5',
            'sc-print':'M7 8V3h10v5 M6 17H3V9h18v8h-3 M7 14h10v7H7z'
        };
        const mirrors={'sc-menu-display-settings':'sc-paper-settings','sc-menu-playback-settings':'sc-playback-settings',
            'sc-menu-zoom-in':'sc-zoom-in','sc-menu-zoom-out':'sc-zoom-out','sc-menu-zoom-reset':'sc-zoom-reset'};
        // These actions already have dedicated controls on the top card.
        const onCard=new Set(['sc-save-overwrite','sc-menu-display','sc-menu-fullscreen','sc-menu-tools',
            'sc-menu-zoom-in','sc-menu-zoom-out','sc-menu-zoom-reset']);
        const key='scoreToolbarShortcuts';
        const saved=CS().storage.getAppSetting(key);
        const chosen=new Set(Array.isArray(saved)?saved:[]);
        chosen.delete('sc-menu-staff-toggle');
        const strip=document.createElement('div');
        strip.className='sc-menu-shortcuts';strip.setAttribute('role','group');strip.setAttribute('aria-label','メニューのショートカット');
        const items=document.createElement('div');
        items.className='sc-shortcut-items';
        strip.append(items,picker.root);
        primary.append(strip);
        const summary=picker.root.querySelector('summary');
        summary.textContent='…';summary.title='ショートカットを選ぶ';summary.setAttribute('aria-label',summary.title);
        const configure=document.createElement('button');
        configure.id='sc-menu-tools';configure.type='button';configure.className='btn-ghost btn-compact';configure.textContent='ツールエリア';
        configure.addEventListener('click',()=>{summary.click();summary.focus();});
        menuBody.querySelector('#sc-menu-fullscreen').after(configure);
        const heading=document.createElement('strong');heading.textContent='ツールエリア';picker.body.append(heading);
        const pins=new Map();
        function arrange(){
            for(const id of chosen){
                const pin=pins.get(id);
                if(pin)items.append(pin);
            }
        }
        function saveOrder(){
            arrange();
            const result=CS().storage.setAppSetting(key,[...chosen]);
            if(!result.ok)setSaveStatus(result.error);
        }
        function pinAt(x,y){
            if(!items.contains(document.elementFromPoint(x,y)))return null;
            for(const pin of pins.values()){
                if(pin.hidden)continue;
                const rect=pin.getBoundingClientRect();
                if(y>=rect.top && y<=rect.bottom && x>=rect.left-3 && x<=rect.right+3)return pin;
            }
            return null;
        }
        for(const target of menuBody.querySelectorAll('button[id]')){
            if(menuBody.contains(target.closest('[hidden]')))continue;
            const id=target.id,command=q(mirrors[id])||target;
            if(!Array.isArray(saved) && !onCard.has(id))chosen.add(id);
            const pin=document.createElement('button');pin.type='button';pin.className='btn-ghost btn-compact';pin.dataset.shortcut=id;
            const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
            svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
            const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[id]||paths['sc-edit-song']);svg.append(path);pin.append(svg);
            const label=document.createElement('label'),check=document.createElement('input'),name=document.createElement('span');
            check.type='checkbox';check.checked=chosen.has(id);pin.hidden=!check.checked;
            label.append(check,name);picker.body.append(label);items.append(pin);
            function sync(){
                const title=id.startsWith('sc-menu-zoom-')?target.title:target.textContent.trim();
                name.textContent=title;pin.title=title;pin.setAttribute('aria-label',title+'（ショートカット）');
                pin.setAttribute('aria-disabled',String(target.disabled||command.disabled));
            }
            sync();
            const observer=new MutationObserver(sync);
            observer.observe(target,{attributes:true,attributeFilter:['disabled'],childList:true,characterData:true,subtree:true});
            if(command!==target)observer.observe(command,{attributes:true,attributeFilter:['disabled']});
            pins.set(id,pin);
            let drag=null, ignoreClick=false;
            pin.addEventListener('pointerdown',event=>{
                if(event.button!==0 || !event.isPrimary)return;
                ignoreClick=false;
                drag={pointer:event.pointerId,x:event.clientX,y:event.clientY};
                pin.setPointerCapture(event.pointerId);
            });
            pin.addEventListener('pointermove',event=>{
                if(drag?.pointer!==event.pointerId)return;
                if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>5)ignoreClick=true;
                if(!ignoreClick)return;
                const over=pinAt(event.clientX,event.clientY);
                for(const item of pins.values())delete item.dataset.dropSide;
                if(over && over!==pin && strip.contains(over)){
                    const rect=over.getBoundingClientRect();
                    over.dataset.dropSide=event.clientX<rect.left+rect.width/2?'before':'after';
                }
            });
            pin.addEventListener('pointerup',event=>{
                if(drag?.pointer!==event.pointerId || !ignoreClick)return;
                const over=pinAt(event.clientX,event.clientY);
                if(!over || over===pin || !strip.contains(over))return;
                const order=[...chosen].filter(value=>value!==id),rect=over.getBoundingClientRect();
                const index=order.indexOf(over.dataset.shortcut)+(event.clientX>=rect.left+rect.width/2?1:0);
                order.splice(index,0,id);
                chosen.clear();order.forEach(value=>chosen.add(value));saveOrder();
            });
            pin.addEventListener('lostpointercapture',()=>{
                drag=null;
                for(const item of pins.values())delete item.dataset.dropSide;
            });
            pin.addEventListener('click',event=>{
                if((!event.detail || !ignoreClick) && !target.disabled && !command.disabled)target.click();
            });
            check.addEventListener('change',()=>{
                if(check.checked){
                    const menuOrder=[...pins.keys()],next=menuOrder.slice(menuOrder.indexOf(id)+1).find(value=>chosen.has(value));
                    const order=[...chosen];order.splice(next?order.indexOf(next):order.length,0,id);
                    chosen.clear();order.forEach(value=>chosen.add(value));
                }else chosen.delete(id);
                pin.hidden=!check.checked;
                saveOrder();
            });
        }
        const reset=document.createElement('button');reset.type='button';reset.textContent='デフォルトの順番に戻す';
        reset.onclick=()=>{
            const order=[...pins.keys()].filter(id=>chosen.has(id));
            chosen.clear();order.forEach(id=>chosen.add(id));saveOrder();
        };
        const all=document.createElement('button');all.type='button';all.textContent='すべて表示';
        all.onclick=()=>{for(const [id,pin] of pins){chosen.add(id);pin.hidden=false;}
            picker.body.querySelectorAll('input[type=checkbox]').forEach(input=>input.checked=true);saveOrder();};
        picker.body.append(all,reset);
        arrange();

    }

    function mountToolbarScale(toolbar) {
        const grip=document.createElement('button');
        grip.type='button';
        grip.className='sc-toolbar-scale';
        grip.setAttribute('role','slider');
        grip.setAttribute('aria-label','上部カードの表示倍率');
        grip.setAttribute('aria-valuemin','70');
        grip.setAttribute('aria-valuemax','150');
        grip.title='ドラッグで上部カードの大きさを変更・ダブルクリックで標準に戻す';
        toolbar.append(grip);
        let scale=1, drag=null;
        function apply(value) {
            scale=Math.max(.7,Math.min(1.5,Math.round(value*100)/100));
            toolbar.style.setProperty('--sc-toolbar-scale',scale);
            grip.setAttribute('aria-valuenow',Math.round(scale*100));
            grip.setAttribute('aria-valuetext',Math.round(scale*100)+'%');
        }
        function remember(){CS().storage.setAppSetting('scoreToolbarScale',scale);}
        apply(Number(CS().storage.getAppSetting('scoreToolbarScale'))||1);
        grip.onpointerdown=event=>{
            if(event.button!==0 || !event.isPrimary)return;
            drag={x:event.clientX,y:event.clientY,scale};
            grip.setPointerCapture(event.pointerId);
        };
        grip.onpointermove=event=>{
            if(!drag || !grip.hasPointerCapture(event.pointerId))return;
            const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
            apply(drag.scale+(Math.abs(dx)>Math.abs(dy)?dx:dy)/300);
        };
        grip.onlostpointercapture=()=>{if(drag){drag=null;remember();}};
        grip.ondblclick=()=>{apply(1);remember();};
        grip.onkeydown=event=>{
            const values={ArrowUp:scale+.05,ArrowRight:scale+.05,ArrowDown:scale-.05,ArrowLeft:scale-.05,Home:.7,End:1.5,Enter:1};
            if(!Object.hasOwn(values,event.key))return;
            event.preventDefault();event.stopPropagation();apply(values[event.key]);remember();
        };
    }

    // Move existing controls, retaining their command handlers and session ownership.
    function mountCompactScoreToolbar(){
        if(!q('sc-zoom-controls'))return;
        var head=els.toolbar.querySelector('.sc-score-toolbar-head'),settings=q('sc-paper-settings');
        if(q('sc-curve-menu')){if(settings){settings.textContent='詳細設定';q('sc-display-menu').querySelector('.sc-toolbar-menu-body').appendChild(settings);}return;}
        if(!head){head=document.createElement('div');head.className='sc-score-toolbar-head';els.toolbar.prepend(head);head.appendChild(els.projectSelect.parentElement);}
        els.toolbar.classList.add('sc-compact-toolbar');
        mountToolbarScale(els.toolbar);
        function group(className){var el=document.createElement('div');el.className=className;return el;}
        function button(id,text,action){var el=document.createElement('button');el.type='button';el.id=id;el.className='btn-ghost btn-compact';el.textContent=text;el.addEventListener('click',action);return el;}
        function menu(id,title){var el=document.createElement('details'),summary=document.createElement('summary'),body=group('sc-toolbar-menu-body');el.id=id;el.className='sc-toolbar-menu';summary.id=id+'-toggle';summary.textContent=title;body.setAttribute('aria-labelledby',summary.id);el.append(summary,body);return {root:el,body:body};}
        function divider(body){body.appendChild(document.createElement('hr'));}
        var right=group('sc-toolbar-head-actions');right.id='sc-toolbar-head-actions';head.appendChild(right);
        const guide=document.createElement('a');guide.id='sc-score-guide';guide.textContent='？';
        guide.href='/apps/cruise-studio/score-guide/index.html';guide.target='_blank';guide.rel='noopener';
        guide.title='譜面クルーズの取扱説明書';guide.setAttribute('aria-label',guide.title+'（新しいタブ）');head.append(guide);
        var curve=menu('sc-curve-menu','メニュー');head.insertBefore(curve.root,right);
        function menuLabel(text){var label=document.createElement('span');label.textContent=text;label.className='sc-menu-label';curve.body.appendChild(label);}
        els.newProjectBtn.textContent='新しい曲を作成';curve.body.appendChild(els.newProjectBtn);divider(curve.body);menuLabel('保存');
        const canPickFile=typeof window.showSaveFilePicker==='function';
        if(canPickFile)els.saveBtn.title='初回は保存先を選びます。ブラウザの警告は、選んだファイルの読み書きについての案内です。';
        curve.body.appendChild(button('sc-save-overwrite',canPickFile?'上書き保存':'保存（このブラウザ内）',function(){els.saveBtn.click();}));
        const saveAs=button('sc-save-as','名前をつけて保存',function(){
            if(typeof window.showSaveFilePicker!=='function'){openExportGuide();return;}
            if(prepareExplicitOutput())void commitSession(state.session,{chooseFile:true});
        });
        saveAs.title=canPickFile?'ファイル名と保存先を選ぶ':'編集用のJSONを書き出す方法を見る';
        curve.body.append(saveAs,button('sc-duplicate-project','曲を複製',function(){openSheetAction('duplicate',q('sc-duplicate-project'));}));
        divider(curve.body);menuLabel('曲の設定');[['sc-edit-song','曲情報','settings'],['sc-edit-instrument','キー・カポ','instrument'],['sc-edit-chord-preset','コード一括','chordPreset'],['sc-edit-rhythm','ストローク一括','strumPreset'],['sc-edit-sections','セクション編集','sections']].forEach(function(item){curve.body.appendChild(button(item[0],item[1],function(){openScoreSettings(item[2],{barIds:selectedIDs(),returnFocus:curve.root.querySelector(':scope > summary')});}));});
        var transpose=els.toolbar.querySelector('.sc-transpose-tools');if(transpose){transpose.id='sc-transpose-menu';transpose.hidden=true;curve.body.appendChild(transpose);}
        q('sc-chord-forms').hidden=true;curve.body.appendChild(q('sc-chord-forms'));divider(curve.body);
        // A label around a hidden file input is not keyboard reachable in Safari.
        // Use a native button, keeping the existing file-change/import transaction.
        var importLabel=els.importInput.closest('label');importLabel.remove();els.importInput.hidden=true;
        var importButton=button('sc-import-json-button','ファイルを開く(JSON)',pickScoreJson);
        menuLabel('ファイル');curve.body.append(importButton,els.importInput,els.exportBtn,els.printBtn);
        if(CS().scoreViewer)curve.body.insertBefore(button('sc-export-viewer','譜面ビューワーに書き出す',downloadViewerScore),importButton);
        if(CS().scoreViewer)curve.body.insertBefore(button('sc-export-pdf','PDFとして保存',downloadProjectPDF),importButton);
        els.importInput.addEventListener('change',function(){curve.root.open=false;});
        var actions=els.toolbar.querySelector('.sheet-toolbar-actions'),primary=group('sc-toolbar-primary');
        actions.prepend(primary);
        var caption=group('sc-playback-caption');caption.append(q('sc-song-target'),q('sc-song-position'));
        const storedParts=CS().storage.getAppSetting('scoreEnabledParts');
        countInEnabled=CS().storage.getAppSetting('scoreCountIn')===true;metronomeEnabled=CS().storage.getAppSetting('scoreMetronome')!==false;
        playbackVisualDelay=Math.max(-1000,Math.min(1000,Number(CS().storage.getAppSetting('scoreVisualDelayMs'))||0));metronomeSound=['click','wood','beep','hihat'].includes(CS().storage.getAppSetting('scoreMetronomeSound'))?CS().storage.getAppSetting('scoreMetronomeSound'):'click';var storedMix=CS().storage.getAppSetting('scorePlaybackMix');Object.keys(playbackMix).forEach(function(key){var value=storedMix?.[key];if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100)playbackMix[key]=value;});
        for (const part of ['chords','melody']) enabledParts[part]=storedParts?.[part]??(playbackMix[part]>0);
        var playbackSettingsButton=button('sc-playback-settings','音設定',function(){openPlaybackSettings(playbackSettingsButton);});playbackSettingsButton.setAttribute('aria-haspopup','dialog');playbackSettingsButton.addEventListener('pointerdown',function(e){if(e.button===0)e.preventDefault();});
        var history=group('sc-toolbar-history'),historyButton=button('sc-history','履歴',function(){openSheetAction('history',historyButton);});historyButton.classList.add('sc-history-toggle');historyButton.setAttribute('aria-haspopup','dialog');history.append(els.undoBtn,els.redoBtn,historyButton);
        primary.append(els.saveBtn,history,els.saveStatus);var transport=group('score-transport sc-bottom-transport'),transportMain=group('score-transport-main'),transportOptions=group('score-transport-options'),bpm=document.createElement('span');transport.id='sc-transport';transport.setAttribute('role','toolbar');transport.setAttribute('aria-label','再生操作');bpm.id='sc-transport-tempo';bpm.className='score-tempo sv-tempo-group';bpm.setAttribute('aria-label','練習BPM');bpm.setAttribute('role','group');bpm.textContent='BPM';var tempo=document.createElement('input');tempo.type='number';tempo.id='sc-practice-tempo';tempo.min=20;tempo.max=400;tempo.setAttribute('aria-label','練習テンポ');tempo.title='元の曲のBPMは変わりません';bpm.appendChild(tempo);tempo.onchange=function(){setPracticeTempo(Number(tempo.value));};var previewButton=q('sc-song-preview');previewButton.classList.add('score-play');transportMain.append(previewButton);var repeatButton=button('sc-repeat','↻',function(){if(!editorCanMove())return;editorRepeat=!editorRepeat;autoRangeRepeat=false;refreshPracticeTransport();restartPracticePlayback();});repeatButton.setAttribute('aria-label','繰り返し');repeatButton.title='繰り返し';repeatButton.setAttribute('aria-pressed','false');transportMain.append(repeatButton);playbackSettingsButton.classList.add('score-audio-button');transportOptions.append(bpm,playbackSettingsButton);transport.append(transportMain,transportOptions,caption);els.root.appendChild(transport);
        [['sc-undo','↶','元に戻す'],['sc-redo','↷','やり直す']].forEach(function(item){var el=q(item[0]);el.textContent=item[1];el.setAttribute('aria-label',item[2]);el.classList.add('sc-history-icon');});
        var display=menu('sc-display-menu','表示');display.root.classList.add('score-display-menu');display.body.appendChild(els.toolbar.querySelector('.sc-paper-visibility'));display.body.querySelector('.sc-paper-visibility').appendChild(display.body.querySelector('#sc-show-form-list').closest('label'));
        q('sc-score-style').closest('label').hidden=true;q('sc-staff-refresh').hidden=true;els.editorDrawer.append(q('sc-score-style').closest('label'),q('sc-staff-refresh'));
        var grid=els.showGrid.closest('.sheet-display-toggles');if(grid){grid.hidden=true;grid.style.display='none';els.editorDrawer.appendChild(grid);}
        divider(display.body);if(settings){settings.textContent='詳細設定';display.body.appendChild(settings);}right.append(display.root,q('sc-zoom-controls'));
        // Match the viewer's File / Display / Playback / Export grouping.
        function mirror(id,text,source){return button(id,text,function(){var target=q(source);if(target)target.click();});}
        var hiddenForms=q('sc-chord-forms');var songSettings=['sc-edit-song','sc-edit-instrument','sc-edit-chord-preset','sc-edit-rhythm','sc-edit-sections'].map(q),fileActions=[els.newProjectBtn,q('sc-save-overwrite'),q('sc-save-as'),q('sc-duplicate-project'),importButton,button('sc-menu-file-location','この曲の保存場所',showFileLocation),button('sc-menu-files','ファイル一覧・削除…',openFileList),els.importInput],exports=[q('sc-export-viewer'),q('sc-export-pdf'),els.exportBtn,els.printBtn].filter(Boolean);
        for(const command of [...fileActions,...exports])if(command.tagName==='BUTTON')command.dataset.fileCommand='';
        curve.body.replaceChildren();menuLabel('ファイル');fileActions.forEach(function(e){curve.body.appendChild(e);});divider(curve.body);menuLabel('表示');
        curve.body.appendChild(button('sc-menu-display','表示',function(){display.root.open=true;}));curve.body.appendChild(mirror('sc-menu-display-settings','表示設定','sc-paper-settings'));
        const fullscreenCommand=mirror('sc-menu-fullscreen','全画面モード','sc-fullscreen');
        fullscreenCommand.disabled=!scoreFullscreen;
        curve.body.appendChild(fullscreenCommand);
        var staffToggle=button('sc-menu-staff-toggle','五線譜に切り替える',function(){
            var style=q('sc-score-style');
            style.value=staffStyle==='melody'?'code':'melody';
            style.dispatchEvent(new Event('change',{bubbles:true}));
        });
        staffToggle.title='メロディを五線譜で表示し、音の長さや休符を編集します';
        staffToggle.hidden=true;curve.body.appendChild(staffToggle);
        var zoomRow=group('sc-menu-zoom-row'),zoomLabel=document.createElement('span'),zoomButtons=group('sc-menu-zoom');zoomLabel.textContent='拡大・縮小';var minus=mirror('sc-menu-zoom-out','−','sc-zoom-out'),percent=mirror('sc-menu-zoom-reset','100%','sc-zoom-reset'),plus=mirror('sc-menu-zoom-in','＋','sc-zoom-in');minus.title='譜面を縮小';percent.title='標準の倍率に戻す';plus.title='譜面を拡大';zoomButtons.append(minus,percent,plus);zoomRow.append(zoomLabel,zoomButtons);curve.body.appendChild(zoomRow);function syncMenuZoom(){percent.textContent=q('sc-zoom-reset').textContent;}curve.root.addEventListener('toggle',syncMenuZoom);zoomButtons.addEventListener('click',syncMenuZoom);
        divider(curve.body);menuLabel('再生');curve.body.appendChild(mirror('sc-menu-playback-settings','音設定','sc-playback-settings'));
        divider(curve.body);menuLabel('曲の設定');songSettings.forEach(function(e){curve.body.appendChild(e);});if(transpose)curve.body.appendChild(transpose);curve.body.appendChild(hiddenForms);
        divider(curve.body);menuLabel('書き出し');exports.forEach(function(e){curve.body.appendChild(e);});

        q('sc-zoom-out').textContent='−';q('sc-zoom-out').setAttribute('aria-label','縮小');q('sc-zoom-out').title='譜面を縮小';
        q('sc-zoom-in').textContent='＋';q('sc-zoom-in').setAttribute('aria-label','拡大');q('sc-zoom-in').title='譜面を拡大';
        var context=els.toolbar.querySelector('.sheet-bar-actions'),label=document.createElement('span'),edit=button('sc-edit-selected','編集',function(){
            if(!editorCanMove())return;
            var range=selectedRangeNumbers();
            if(range.length){
                state.selectedBarNumber=range[0];editorAnchorId=state.session.draft.bars[range[0]-1].id;
                editorBars=Math.min(4,range.length);
            }
            editSelectedBar();
        });
        context.querySelectorAll('[data-bar-operation]').forEach(function(b){b._barOperationTitle=b.title;});
        context.id='sc-selected-bar-actions';context.classList.add('sc-toolbar-context');
        label.id='sc-toolbar-selection';label.className='sc-toolbar-selection';
        context.setAttribute('aria-labelledby',label.id);
        var selection=group('sc-selection-tools');
        selection.append(label,edit);context.prepend(selection);
        function groupActions(name,buttons){
            var group=document.createElement('div');group.className='sc-context-group';
            group.setAttribute('role','group');group.setAttribute('aria-label',name);
            group.append(...buttons);context.append(group);
        }
        var operation=name=>context.querySelector('[data-bar-operation="'+name+'"]');
        operation('duplicateBar')._barOperationTitle='選択した小節の直後にコピーを追加';
        groupActions('小節を追加',[operation('addBar'),operation('duplicateBar')]);
        q('sc-paste-bar').textContent='上書き貼り付け';
        groupActions('コピーと貼り付け',[q('sc-copy-bar'),q('sc-paste-bar'),button('sc-insert-paste','挿入して貼り付け',function(){pasteSelectedBar(true);})]);
        var moves=context.querySelectorAll('[data-bar-operation=moveBar]');
        moves.forEach(function(el){el.textContent=Number(el.dataset.direction)<0?'← 前へ移動':'後ろへ移動 →';});
        groupActions('小節を移動',moves);
        var remove=operation('deleteBar');remove.textContent='枠を残して削除';remove.setAttribute('aria-label',remove.textContent);
        groupActions('小節を削除',[remove,button('sc-delete-compact','詰めて削除',function(){deleteSelectedBars(false);})]);
        els.toolbar.appendChild(context);context.hidden=true;
        var gestureHelp=document.createElement('p');gestureHelp.id='sc-score-gesture-help';gestureHelp.className='sc-score-gesture-help';var footer=group('sc-toolbar-footer');footer.appendChild(gestureHelp);els.toolbar.appendChild(footer);
        // Keep the visible drawer reachable, with its purpose matching the menu item.
        var drawerLabel=els.editorDrawer.querySelector('.sheet-editor-drawer-label'),drawerHint=els.editorDrawer.querySelector('.sheet-editor-drawer-hint');
        if(drawerLabel)drawerLabel.textContent='曲情報・セクションを編集';if(drawerHint)drawerHint.textContent='曲名・キー・BPM・セクション構成など';
        var shortcutPicker=menu('sc-shortcut-menu','ショートカットを選ぶ');
        mountMenuShortcuts(primary,shortcutPicker,curve.body);
        function menus(){return [curve.root,display.root,shortcutPicker.root];}
        function closeMenu(el){var body=el.querySelector('.sc-toolbar-menu-body');if(body.popover&&body.matches(':popover-open'))body.hidePopover();el.open=false;}
        function closeMenus(except,restore){menus().forEach(function(el){if(el!==except&&el.open){closeMenu(el);if(restore)el.querySelector('summary').focus({preventScroll:true});}});}
        menus().forEach(function(el){
            var popup=el.querySelector('.sc-toolbar-menu-body');if(typeof popup.showPopover==='function')popup.popover='manual';else el.dataset.popupFallback='';
            function place(){
                const anchor=el.querySelector('summary').getBoundingClientRect();
                const bounds=popup.getBoundingClientRect();
                const scale=popup.offsetWidth ? bounds.width/popup.offsetWidth : 1;
                const width=bounds.width||Math.min(250,innerWidth-24);
                const left=Math.max(12,Math.min(anchor.right-width,innerWidth-width-12)),top=anchor.bottom+6;
                popup.style.left=left/scale+'px';popup.style.top=top/scale+'px';
                popup.style.maxHeight=Math.max(100,innerHeight-top-12)/scale+'px';
            }
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
    function refreshCompactScoreToolbar(bar,eligible,range){refreshPracticeTransport();
        var context=q('sc-selected-bar-actions');if(!context)return;
        var empty=emptySlotSelection?.owner===state.session;context.hidden=!bar&&!empty;
        context.classList.toggle('sc-empty-selection',!!empty);
        q('sc-toolbar-selection').textContent=empty?'空き枠（再生なし）':range.length>1?'第'+range[0]+'〜'+range.at(-1)+'小節（'+range.length+'小節選択）':bar?'第'+state.selectedBarNumber+'小節':'';
        q('sc-edit-selected').title=empty?'この空き枠を編集':range.length?'選択範囲の先頭から'+Math.min(4,range.length)+'小節を開く':bar?'第'+state.selectedBarNumber+'小節の編集画面を開く':'';
        var help=q('sc-score-gesture-help');if(help){var text=empty?'この空き枠をもう一度クリックすると、編集を始められます。枠の外側をクリックすると、選択を解除できます。':bar?'選んだ小節は、ドラッグで移動。Shift＋クリックで範囲選択、譜面の余白で選択解除。':'小節をクリックすると選択できます。複数選ぶには、最初の小節から最後の小節までドラッグします。';if(help.textContent!==text)help.textContent=text;}
        q('sc-edit-selected').disabled=!eligible||(!bar&&!empty)||!editorCanMove();q('sc-insert-paste').disabled=!eligible||(!bar&&!empty)||!barClipboards.has(state.session);q('sc-delete-compact').disabled=!eligible||!bar;['sc-edit-song','sc-edit-instrument','sc-edit-chord-preset','sc-edit-rhythm','sc-edit-sections'].forEach(function(id){q(id).disabled=!eligible;});
    }
    function mountPaperLayoutControls(){
        if(!els.toolbar||!CS().localPaperLayout||q('sc-paper-settings'))return;
        var visibility=els.toolbar.querySelector('.sc-paper-visibility'),actions=els.toolbar.querySelector('.sheet-toolbar-actions');
        if(visibility){
            [['showTitle','曲名','sc-show-title'],['showArtist','アーティスト名','sc-show-artist'],['showMeta','曲情報','sc-show-meta'],['showParts','セクション名','sc-show-parts'],['showNumbers','小節番号','sc-show-numbers']].forEach(function(item){var label=document.createElement('label'),input=document.createElement('input');label.className='pd-check';input.type='checkbox';input.id=item[2];input.checked=CS().localPaperLayout.value[item[0]];input.addEventListener('change',function(){if(!editorCanMove()){input.checked=CS().localPaperLayout.value[item[0]];return;}stopPianoAudition();CS().localPaperLayout.set({[item[0]]:input.checked});});label.append(input,document.createTextNode(' '+item[1]));visibility.appendChild(label);});
            ['title','artist','meta','parts','numbers','chords','forms','strum','lyrics','doremi','form-list'].forEach(function(name){var input=q('sc-show-'+name);if(input)visibility.appendChild(input.closest('label'));});
            var settings=document.createElement('button');settings.type='button';settings.id='sc-paper-settings';settings.className='btn-ghost btn-compact';settings.textContent='表示設定';settings.title='見本を見ながら小節数・フォーム・文字サイズを調整';settings.addEventListener('click',function(){openPaperDisplay();});var head=els.toolbar.querySelector('.sc-score-toolbar-head')||document.createElement('div');head.className='sc-score-toolbar-head';var projects=els.toolbar.querySelector('.sheet-toolbar-project');els.toolbar.prepend(head);if(projects&&projects.parentElement!==head)head.prepend(projects);head.appendChild(settings);
            CS().localPaperLayout.onChange(function(change){scoreUI?.applyScoreTheme(els.root,CS().localPaperLayout.value.appearance.interaction);if(els.slotOverlay)scoreUI?.applyScoreTheme(els.slotOverlay,CS().localPaperLayout.value.appearance.interaction);if(change?.structural===false){CS().localPaperLayout.apply(els.scaleBox);updateSheetScale();}else renderPreview(true,!!change?.reflowOnly);refreshHistoryControls();if(state.project)renderDisplayToggles();[['showTitle','title'],['showArtist','artist'],['showMeta','meta'],['showNumbers','numbers'],['showParts','parts']].forEach(function(pair){var name=pair[0],input=q('sc-show-'+pair[1]);if(input)input.checked=CS().localPaperLayout.value[name];});});
        }
        CS().localPaperLayout.apply(els.scaleBox);if(state.session)renderPreview(true);mountCompactScoreToolbar();
    }
    function refreshToolbarActions(){
        if(!els.toolbar)return;var owner=state.session,bars=Array.isArray(owner?.draft.bars)?owner.draft.bars:[],bar=bars[state.selectedBarNumber-1],eligible=!!owner&&owner.draft.schemaVersion===2&&!schemaViewError&&operationEligible()&&!owner.inputPending&&!owner.commitInFlight&&!owner.conflict&&!owner.externalUpdatePending&&!textDiagnostic(owner);
        var range=selectedRangeNumbers(),first=range[0]??state.selectedBarNumber,last=range.at(-1)??state.selectedBarNumber;
        els.toolbar.querySelectorAll('[data-bar-operation]').forEach(function(button){
            var move=button.dataset.barOperation==='moveBar';
            var atEdge=Number(button.dataset.direction)<0?first===1:last===bars.length;
            button.disabled=!eligible||!bar||(move&&atEdge);
            button.title=bar?(button._barOperationTitle||''):'編集する小節を選択してください';
        });
        refreshCompactScoreToolbar(bar,eligible,range);
        var forms=q('sc-chord-forms');if(forms)forms.disabled=!eligible||!bar||!bar.chords.length;
        var blocked=owner?.draft.performance?.formBindings?.some(function(b){return b.mode!=='auto'||!CS().localChordForms;})||bars.some(function(b){return Array.isArray(b.chords)&&b.chords.some(function(c){return c.unresolved;});});
        ['sc-transpose-down','sc-transpose-up'].forEach(function(id){var b=q(id);if(b){b.disabled=!eligible||!!blocked;b.title=blocked?'固定フォームや未解決コードを確認してから移調してください':'全曲の実音を半音移調します。カポは変更しません';}});
        if(els.showForms){els.showForms.disabled=!eligible||staffStyle!=='code'||!CS().localPaperForms;}
        ['sc-show-title','sc-show-artist','sc-show-meta','sc-show-numbers','sc-show-parts','sc-paper-settings'].forEach(function(id){if(q(id))q(id).disabled=!eligible;});
        var single=eligible&&editorCanMove();if(q('sc-copy-bar'))q('sc-copy-bar').disabled=!single||!bar;if(q('sc-paste-bar'))q('sc-paste-bar').disabled=!single||(!bar&&emptySlotSelection?.owner!==owner)||!barClipboards.has(owner);
        ['sc-history','sc-save-as','sc-duplicate-project'].forEach(function(id){if(q(id))q(id).disabled=!eligible||(id!=='sc-history'&&!CS().repository.canWrite());});
        var playbackSettingsButton=q('sc-playback-settings');if(playbackSettingsButton)playbackSettingsButton.disabled=!eligible;
        if(q('sc-export-viewer'))q('sc-export-viewer').disabled=!eligible||viewerExportFlight;
        var staffToggle=q('sc-menu-staff-toggle');
        if(staffToggle){
            staffToggle.disabled=!eligible;
            var staffLabel=staffStyle==='melody'?'コード譜に戻る':'五線譜に切り替える';
            if(staffToggle.textContent!==staffLabel)staffToggle.textContent=staffLabel;
            staffToggle.title=staffStyle==='melody'?'コード譜を表示します':'メロディを五線譜で表示し、音の長さや休符を編集します';
        }
        var staff=q('sc-staff-refresh');if(staff)staff.hidden=true;if(q('sc-save-overwrite'))q('sc-save-overwrite').disabled=!eligible||!owner?.dirty||!owner.canCommit()||!!textDiagnostic(owner)||!!schemaViewError;var play=q('sc-song-preview');if(play)play.disabled=(!eligible||!bars.length)&&!(barPreviewScope==='song'&&barPreviewPhase!=='idle');updateBarPlayButton();
        for(const option of els.projectSelect.querySelectorAll('[data-file-action]'))option.disabled=q(option.dataset.fileAction).disabled;
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

    const fileLabelPrefix='cruiseStudio.scoreFileLabel.';
    function scoreFileName(id){
        return localStorage.getItem(fileLabelPrefix+id) || fileHandles.get(id)?.name;
    }
    function refreshProjectSelect() {
        var storage = CS().storage;
        var projects = storage.listProjects();
        els.projectSelect.innerHTML = '';

        if (!state.project) return;

        CS().sessions.listSessions().filter(function (session) { return session.domain === 'structure'; }).forEach(function (session) {
            if (projects.some(function (meta) { return meta.projectId === session.target.projectId; })) return;
            var draft = document.createElement('option'); draft.value = session.target.projectId;
            draft.textContent = (scoreFileName(session.target.projectId) || session.draft.songInfo.title || '無題') + '（未保存）';
            els.projectSelect.appendChild(draft);
        });
        try{
            for(const key of Object.keys(localStorage)){
                if(!key.startsWith(draftPrefix))continue;
                const id=decodeURIComponent(key.slice(draftPrefix.length).split(':')[0]);
                if(projects.some(p=>p.projectId===id)||Array.from(els.projectSelect.options).some(o=>o.value===id))continue;
                const draft=draftRecord(id,null);
                if(draft?.base===null)els.projectSelect.add(new Option((scoreFileName(id)||draft.project.songInfo.title||'無題')+'（下書き）',id));
            }
        }catch{/* Browser storage may be unavailable. */}
        projects.forEach(function (meta) {
            var opt = document.createElement('option');
            opt.value = meta.projectId;
            opt.textContent = scoreFileName(meta.projectId) || meta.title + (meta.artist ? ' / ' + meta.artist : '');
            restoreFileHandle(meta.projectId);
            els.projectSelect.appendChild(opt);
        });
        const actions=document.createElement('optgroup');
        actions.label='ファイル操作';
        for(const command of ['sc-menu-file-location','sc-menu-files'].map(q).filter(Boolean)){
            const option=new Option(command.textContent.trim(),'command:'+command.id);
            option.dataset.fileAction=command.id;option.disabled=command.disabled;actions.append(option);
        }
        if(actions.children.length){
            const more=new Option('その他のファイル操作…','command:more');
            more.dataset.moreFileActions='';
            els.projectSelect.append(actions,more);
        }
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
        var measure = local && focused.closest('.editor-measure');
        if (selector && measure) selector = '.editor-measure[data-bar-number="' + measure.dataset.barNumber + '"] ' + selector;
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
        if (selected && selected.value === session.target.projectId) selected.textContent = (scoreFileName(session.target.projectId) || session.draft.songInfo.title || '無題') +
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
        dismissSaveNotice();
        cancelRangeSelection();stopPianoAudition();closePaperForm();playbackSettings?.close(false);sheetActions?.close(false);CS().localPaperLayout?.close();scoreFullscreen?.exit();
        els.toolbar?.querySelectorAll('.sc-toolbar-menu[open]').forEach(function(menu){menu.open=false;});editorOpen=false;
        finishTextInputs();
        if (state.session) projectViews.set(state.session.sessionId, {
            selectedBarNumber: state.selectedBarNumber, structureIdentity: structureIdentity, loupe: Object.assign({}, state.loupe),
            dockManualRes: state.dockManualRes, overlayWarnings: state.overlayWarnings,
            scroll: CS().scroll ? CS().scroll.getPosition('sheetCruise') : null
        });
        cancelRangeSelection();cancelBarDrag();editorHelp?.close({restoreFocus:false});scoreSettings?.close();emptySlotSelection=null;selectedBarIds = []; rangeAnchor = null;
        state.session = session;
        const fileId=session.target.projectId;
        restoreFileHandle(fileId);
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
        renderAll(); refreshSessionStatus();backupDraft(session);
        if (message && !session.externalUpdatePending) setSaveStatus(message);
    }

    function setProject(project, options) {
        if (state.session && state.session.inputPending) { setSaveStatus('入力の確定を待ってください', true); return; }
        var target = { type: 'project', projectId: project.projectId };
        var session = CS().sessions.getSession('structure', target);
        if (!session && options?.importName) {
            const record = CS().repository.read(target);
            const recovery = record.ok && draftRecord(target.projectId, record.revision);
            if (recovery && JSON.stringify(recovery.project) !== JSON.stringify(project)) {
                setSaveStatus('同じ曲の下書きがあります。曲名一覧から下書きを開き、保存してから読み込んでください。',true);
                return;
            }
        }
        if (session && options && options.dirty) {
            if (session.dirty || session.commitInFlight) { setSaveStatus('このファイルには未保存の変更があります。曲を保存してから、もう一度開いてください。', true); return; }
            session.replaceDraft(project);
        }
        if (!session) session = CS().sessions.getOrCreateSession('structure', target, options && options.dirty ? project : undefined);
        if(options?.importName)localStorage.setItem(fileLabelPrefix+project.projectId,options.importName);
        showSession(session, options && options.statusMessage);
        if(options?.presentation){
            const imported=CS().localPaperLayout?.readGridRows(options.presentation.gridRows,project)||new Map();
            for(const bar of state.project.bars){
                const rows=imported.get(bar.sourceId);
                for(const [row,grid] of Object.entries(rows||{})){
                    const map=editorResolutionMap(bar,row);map.set('row:'+row,grid.unit);
                    grid.beats.forEach((lock,i)=>setLyricBeatLocalRes(bar,i,lock,row));
                }
            }
            CS().localPaperLayout?.importPresentation(project,options.presentation);
            if(imported.size)renderPreview(true);
        }
        return true;
    }

    function openProject(projectId) {
        if (state.session && state.session.inputPending) { setSaveStatus('入力の確定を待ってください', true); refreshProjectSelect(); return false; }
        try {
            const target={type:'project',projectId};
            const recovered=draftRecord(projectId,CS().repository.read(target).revision),existing=CS().sessions.getSession('structure',target);
            const canRestore=!existing && recovered?.project?.projectId===projectId && CS().repository.read(target).revision===recovered.base;
            var session=existing||CS().sessions.getOrCreateSession('structure',target,canRestore&&recovered.base===null?recovered.project:undefined);
            if(canRestore){recoverySources.set(session,recovered);if(recovered.base!==null)session.replaceDraft(recovered.project);}
            showSession(session); return true;
        } catch (error) { setSaveStatus(error.message, true); refreshProjectSelect(); return false; }
    }

    function createNewProject(openSettings=true) {
        var names = new Set(CS().storage.listProjects().map(function(p){return p.title;}));
        CS().sessions.listSessions().forEach(function(s){names.add(s.draft.songInfo.title);});
        var number=1;while(names.has('無題のプロジェクト '+number))number++;
        var project=CS().model.createEmptyProject();project.songInfo.title='無題のプロジェクト '+number;
        const rhythm=project.materials.rhythms.find(m=>m.id===project.performance.basicRhythmId);
        rhythm.snapshot.slots=[];rhythm.snapshot.name='空白';rhythm.provenance.legacyId='strum_empty';
        if(CS().localChordForms)CS().localChordForms.initialize(project);
        setProject(project, { dirty: true, statusMessage: '新規プロジェクトを作成しました（未保存）' });
        els.editorDrawer.open=false;if(openSettings)openScoreSettings('settings',{selectTitle:true,newSong:true});
    }

    function switchSong(action){
        const owner=state.session;
        if(owner&&(owner.inputPending||owner.commitInFlight||owner.externalUpdatePending||owner.conflict||owner.commitError||textDiagnostic(owner))){
            refreshProjectSelect();setSaveStatus('入力または保存の完了後に切り替えてください',true);return;
        }
        action();
    }
    var leavePending = null;
    // Explicit discard/save flow. Ordinary song and workspace switches keep sessions.
    function requestLeave(continueAction,currentOnly=false) {
        if(leavePending || typeof continueAction!=='function')return false;
        var owner=state.session, workspace=CS().shellHost.getActiveWorkspace();
        const affected=()=>currentOnly?(owner?[owner]:[]):CS().sessions.listSessions();
        if(affected().some(function(s){return s.inputPending||s.commitInFlight||s.externalUpdatePending||s.conflict||s.commitError;}) || textDiagnostic(owner)) {
            setSaveStatus('入力・保存結果・競合を解決してから移動してください',true);return false;
        }
        var dirty=affected().filter(function(s){return s.dirty;});
        if(!dirty.length){continueAction();return true;}
        var modal=CS().shellHost.modal;if(modal.getActive())return false;
        stopPianoAudition();
        var body=document.createElement('div'),message=document.createElement('p'),actions=document.createElement('div');
        actions.className='sc-leave-actions';
        message.style.overflowWrap='anywhere';
        body.style.padding='12px';message.style.margin='0 0 24px';message.style.lineHeight='1.7';
        message.textContent='未保存の曲：'+dirty.map(function(s){return scoreFileName(s.target.projectId)||s.draft.songInfo.title;}).join('、')+'。変更を保存してから移動しますか？';body.appendChild(message);
        var buttons=[],record={active:true,saving:false};leavePending=record;
        function current(){return record.active&&leavePending===record&&state.session===owner&&CS().shellHost.getActiveWorkspace()===workspace&&CS().entryAuth.isAuthorized();}
        function proceed(){if(!current())return;if(affected().some(function(s){return s.inputPending||s.commitInFlight||s.externalUpdatePending||s.conflict||s.commitError;})){message.textContent='入力・保存結果・競合を解決してください。移動せずdraftを保持しています';return;}modal.close();continueAction();}
        function button(label,fn){var b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;b.className=buttons.length===0?'btn-primary':'btn-ghost';actions.appendChild(b);buttons.push(b);}
        button(currentOnly?'保存して進む':'保存して続行',async function(){
            if(!current()||record.saving)return;record.saving=true;buttons.forEach(function(b){b.disabled=true;});
            try {
                for(var session of affected().filter(function(s){return s.dirty;})){
                    if(!current())return;
                    var result=await commitSession(session);
                    if(!result.ok||session.dirty||session.externalUpdatePending||session.conflict)throw Error(result.error||'保存完了を確認できませんでした');
                }
                if(affected().some(function(s){return s.dirty||s.inputPending||s.commitInFlight||s.conflict||s.externalUpdatePending;}))throw Error('保存対象の状態が変わりました');
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
        els.timeSig.title = '曲全体の拍子を変更します';
        [els.playKey,els.capo].forEach(function(e){e.disabled=state.session.draft.schemaVersion===2;e.title=e.disabled?'schema 2 M1では表示専用です。実音保持・移調の編集導線は次工程です':'';});
        // 基本ストローク: slotsから記号列を再生成して表示（slotsが正。ADR-018）
        var basic=CS().model.getBasicStrumText(state.project);els.basicStrum.disabled=!!(basic&&basic.ok===false);els.basicStrum.value=basic&&basic.ok===false?basic.name+'（採用済み・旧編集非対応）':basic;
        els.basicStrum.classList.remove('is-invalid');
        els.basicStrum.title = '';
        updateKeyCheck();
    }

    function readFormIntoProject() { finishTextInputs(); } // DOM is not the content owner.

    function onFieldChange(event) {
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
                // .bar-cell: コード/歌詞/メロディの3行構成（将来は拍位置入力へ拡張）
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
                doremiInput.placeholder = 'メロディ';
                doremiInput.setAttribute('aria-label', bar.barNumber + '小節目のメロディ');
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
    function effectivePaperVisibility(project){var show=CS().sheetRenderer.resolveShowSettings(project);return {chords:show.chords,strum:show.strum,lyrics:show.lyrics,doremi:show.doremi,forms:!!paperFormSessions.get(state.session),timingGrid:CS().localPaperLayout?.value.timingGrid??show.timingGrid,gridResolution:CS().localPaperLayout?.value.gridResolution??show.gridResolution,...CS().localPaperLayout?.value.appearance.visibility};}
    var lastPaperColumns;
    function catalogueZoomHandler(owner,version){
        return (button,positions)=>{
            if(owner!==state.session||owner.snapshotVersion!==version||historyPreview||!positions.length)return;
            openPaperForm(button,positions[0].id,undefined,false,positions);
        };
    }
    function refreshSavedCatalogue(owner){
        const list=els.scaleBox.querySelector('.sc-form-list');
        if(!list||historyPreview)return;
        const current=CS().localPaperForms.list(owner.workingSnapshot(),{onZoom:catalogueZoomHandler(owner,owner.snapshotVersion)});
        if(!current){list.remove();return;}
        list.replaceWith(current);
        CS().localPaperForms.resizeList(els.scaleBox,CS().localPaperLayout.value.formListScale);
    }
    function paperRenderOptions(project,version=state.session?.snapshotVersion,editableCatalogue=false){
        const owner=state.session;
        var layout=CS().localPaperLayout?.renderOptions(project,els.root,editableCatalogue?catalogueZoomHandler(owner,version):undefined),defaultForms=effectivePaperVisibility(project).forms;
        lastPaperColumns=layout?.barsPerLine;
        var forms=(defaultForms||layout?.sectionRules.some(rule=>rule.visibility?.forms))&&CS().localPaperForms?.view(project,{scale:CS().localPaperLayout?.value.formScale});
        const rowSettings=state.lyricBeatResV2.get(state.session);
        return {contentKey:project.projectId+':'+version,structureView:!historyPreview&&state.session?.draft.projectId===project.projectId&&state.session.snapshotVersion===version?state.project:null,editableSlots:true,hasFormsForBar:forms?forms.has:null,formsForBar:forms?forms.row:null,defaultForms,...layout,
            inputGridForRow:function(bar,row,length){
                const settings=rowSettings?.get(bar.sourceId);
                if(!settings||historyPreview)return null;
                if(row==='strum' && (settings.get('strumMaterial')!==(bar.strumOverride||state.project.basicStrumPatternId)||settings.get('strumLength')!==length))return null;
                const unit=effectiveRowUnit(settings,row);
                const locks=Array.from({length:length/480},(_,beat)=>settings.get(row==='lyrics'?beat:row+':'+beat));
                return {unit,beats:locks};
            },
            heldForNote:function(number,tick){var e=project.bars[number-1]?.melody.find(function(e){return e.onsetTick===tick;});return e?.provenance.timing.onset.origin==='auto-assigned'&&e?.provenance.timing.duration.origin==='user-set';},
            restsForBar:function(number){return project.bars[number-1]?.melody.filter(function(e){return e.kind==='rest';})||[];},
            octaveForNote:function(number,tick){return project.bars[number-1]?.melody.find(function(e){return e.onsetTick===tick&&e.kind==='note';})?.pitch.octave;}};
    }

    function renderPreview(preserveInputs,reuseBars=false) {
        cancelBarDrag();closePaperForm();
        if(!state.project){renderInvalidProject();return;}
        state.overlayRefreshRequested = false;
        if(historyPreview&&(historyPreview.owner!==state.session||historyPreview.version!==state.session.snapshotVersion))historyPreview=null;
        els.scaleBox.toggleAttribute('data-history-preview',!!historyPreview);
        if (staffStyle === 'melody'&&!historyPreview) staffRequest();
        else {var project=historyPreview?.project||state.session.workingSnapshot();CS().sheetRenderer.render(project,els.scaleBox,{...paperRenderOptions(project,state.session.snapshotVersion,!historyPreview),reuseBars:reuseBars});}
        els.scaleBox.querySelectorAll('[data-paper-edit]').forEach(function(el){if(el.dataset.paperEdit){el.tabIndex=0;el.setAttribute('role','button');el.title=el.dataset.paperEdit==='section'?'セクション編集を開く':'曲情報を開く';}});
        CS().localPaperLayout?.apply(els.scaleBox);
        updateSheetScale();
        syncSheetSelection(preserveInputs);
        if(preserveInputs&&!historyPreview){
            // Capture the chord panel's ancestors before the synchronous piano
            // rebuild. WebKit can clamp a bottom-aligned right pane during it.
            refreshChordPicker();refreshPiano();
        }
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
#screen-sheet-cruise .sc-score-toolbar-head .sheet-toolbar-project{margin-right:0;display:flex;align-items:center;gap:4px;}
#sc-project-select{min-width:0;}.sc-location-dialog.sc-file-list{box-sizing:border-box;width:min(32rem,92vw);max-width:92vw;background:var(--studio-surface);color:var(--studio-text-primary);border:1px solid var(--studio-border-default);background-color:var(--studio-control,#222e38)}
.sc-file-list h2{font-size:1.15rem;margin:0 0 1rem}.sc-file-list button{border:1px solid var(--studio-border-default);color:inherit;background:transparent;padding:8px 12px;border-radius:5px;cursor:pointer}.sc-file-list>div>div button:last-child{color:#ffc1ba}.sc-file-list>div{display:grid;gap:6px;max-height:55vh;overflow:auto}.sc-file-list>div>div{display:flex;gap:10px}.sc-file-list>div>div button:first-child{flex:1;text-align:left;overflow-wrap:anywhere}
#sc-save-notice{position:fixed;z-index:100;inset:50% auto auto 50%;transform:translate(-50%,-50%);box-sizing:border-box;width:max-content;max-width:calc(100vw - 32px);margin:0;padding:14px 20px;border:1px solid var(--studio-border-default);border-radius:10px;background:var(--studio-panel);color:var(--studio-text-primary);font:15px/1.6 system-ui,sans-serif;text-align:center;box-shadow:0 6px 28px #0004;}
#sc-save-notice button{background:transparent;border:0;color:inherit;font:inherit;text-decoration:underline;cursor:pointer;padding:0;}
@media print{#sc-save-notice{display:none!important;}}
.sc-browser-save-note{display:block;margin-top:3px;font-size:.9em}
.sc-browser-save-note a{color:inherit;text-decoration:underline}
#sc-score-guide{position:absolute;inset:7px 0 auto auto;border:1px solid currentColor;color:inherit;text-decoration:none;border-radius:50%;width:30px;height:30px;display:grid;place-items:center;align-self:center;}
.sc-location-dialog details{margin:12px 0;}
.sc-location-dialog{margin:auto;max-width:min(26em,85vw);padding:20px;border-radius:10px;}
dialog.sc-save-place{box-sizing:border-box;width:min(25rem,calc(100vw - 32px));max-width:none;padding:24px;border:1px solid var(--studio-border-default,#465361);border-radius:14px;background:var(--studio-surface,#202b35);color:var(--studio-text-primary,#f6f4eb);box-shadow:0 12px 40px #0005}
.sc-save-place::backdrop{background:#0b1118a6}
.sc-save-place h2{margin:0 0 18px;font-size:1.15rem}
.sc-save-place strong{display:block;font-size:1rem;overflow-wrap:anywhere}
.sc-save-place p{margin:6px 0 20px;font-size:.9rem;line-height:1.6;overflow-wrap:anywhere}
.sc-save-place a{color:inherit;text-underline-offset:3px}.sc-save-place footer{margin-top:16px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
.sc-save-place footer button{min-height:40px;padding:8px 14px;border-radius:8px;font-size:.875rem}
dialog.sc-delete-confirm{width:min(29rem,calc(100vw - 24px));padding:clamp(14px,4vw,24px)}
.sc-delete-confirm p{margin:0}
.sc-delete-confirm .sc-delete-note{margin-top:6px;color:var(--studio-text-secondary);font-size:.85rem}
.sc-delete-confirm footer{margin-top:22px;gap:8px;flex-wrap:nowrap}
.sc-delete-confirm footer button{min-width:0;padding:8px clamp(6px,2vw,14px);line-height:1.35}
.sc-delete-confirm footer:has(button:nth-child(3)) button{flex:1 1 auto}
.sc-delete-confirm footer button:last-child{color:var(--studio-danger);border-color:var(--studio-danger)}

.sc-save-place p.sc-save-footnote{margin:14px 0 0;padding-top:12px;border-top:1px solid var(--studio-border-default);color:var(--studio-text-secondary);font-size:.82rem;line-height:1.65;}
.sc-save-place .sc-save-footnote a{white-space:nowrap;}
.sc-leave-actions .btn-primary:enabled,.sc-save-place footer .btn-primary:focus{outline:2px solid var(--studio-focus);outline-offset:2px;}
.sc-leave-actions:has(.btn-ghost:focus-visible) .btn-primary{outline:none;}
.sc-leave-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}
@media(max-width:480px){.sc-leave-actions{grid-template-columns:1fr;}}
.studio-modal .sc-leave-actions button{width:100%;margin:0;max-width:100%;min-height:40px;padding:8px 14px;border-radius:8px;}
.sc-file-list>div{padding:4px;}
.sc-file-list footer{display:flex;justify-content:flex-end;margin-top:16px;}
.sc-file-list footer button{min-height:40px;padding:8px 14px;border-radius:8px;}
.sc-file-list [role=status]:empty{display:none;}
.sc-save-place .sc-save-source{display:inline-block;margin:0 0 18px;font-size:.82rem;}
.sc-save-place p.sc-export-instructions{line-height:2.1;}

.sc-save-place a[download]{font-weight:700;text-decoration:underline;white-space:nowrap;}
.sc-save-place footer+details{margin:16px 0 0;padding-top:12px;border-top:1px solid var(--studio-border-default);font-size:.82rem;}
.sc-file-command-list{display:grid;gap:4px;max-height:55vh;overflow:auto;}
.sc-file-command-list button{text-align:start;padding:8px 12px;}
.sc-reminder-frequency{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:.875rem;}
.sc-reminder-frequency select{max-width:100%;min-height:36px;font:inherit;padding:6px 10px;border:1px solid var(--studio-border-default);border-radius:7px;background-color:var(--studio-control);color:inherit;}
.sc-save-place details>summary{cursor:pointer;font-size:.875rem;}
.sc-save-place details[open]>.sc-reminder-frequency{margin-block:10px;}
#screen-sheet-cruise .sc-score-toolbar-head>#sc-paper-settings{margin-left:auto;}
#screen-sheet-cruise .sc-paper-visibility{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;margin:10px 0 0;padding:10px 0 0;border-top:1px solid var(--studio-border-default);}
#screen-sheet-cruise .sc-paper-visibility label{display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;}
#screen-sheet-cruise .sc-paper-visibility input{width:16px;height:16px;accent-color:var(--studio-accent);}
:is(#sc-sheet-scale-box,.sc-preset-sheet-frame,.sc-song-preview,.sc-section-preview) .sheet-bar-forms{position:relative;margin:0 calc(-1 * var(--sheet-bar-pad-x));overflow:hidden;min-height:0;}
/* Safari can size an aspect-ratio wrapper taller than its SVG. Center the intrinsic image height. */
:is(#sc-sheet-scale-box,.sc-preset-sheet-frame,.sc-song-preview,.sc-section-preview) .sheet-form-event{position:absolute;transform:translateY(-50%);height:auto;aspect-ratio:auto;display:block;overflow:hidden;cursor:zoom-in;}
:is(#sc-sheet-scale-box,.sc-preset-sheet-frame,.sc-song-preview,.sc-section-preview) .sheet-form-event svg{display:block;width:100%;height:auto;}
:is(#sc-sheet-scale-box,.sc-preset-sheet-frame,.sc-song-preview,.sc-section-preview) .sheet-bar-num{min-height:24px;}
#sc-sheet-scale-box [data-edit-selected-bar]{position:absolute;right:6px;top:4px;z-index:6;border:1px solid #8c7949;border-radius:6px;padding:4px 9px;background:#fffcf3;color:#544626;font:600 11px sans-serif;cursor:pointer;}
#sc-sheet-scale-box .sheet-chord-event{cursor:default;}
.sc-form-dialog{position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);margin:0;width:min(300px,calc(100vw - 40px));max-height:85vh;padding:14px;border:1px solid #8e98a4;border-radius:14px;background:#fff;color:#171b20;box-shadow:0 20px 60px #0006;}
.sc-form-dialog .sc-form-empty-hit{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;padding:0;border:0;background:transparent;border-radius:50%;cursor:crosshair;}.sc-form-dialog .sc-form-empty-hit:hover,.sc-form-dialog .sc-form-empty-hit:focus-visible{outline:2px solid #6b8199;background:#e7ecf288;}
.sc-form-dialog::backdrop{background:#10182066;}
.sc-form-dialog .sc-form-quick-edit{display:block;margin:8px auto 0;}
.sc-form-dialog .sc-form-quick-edit[hidden]{display:none;}
.sc-form-actions{display:flex;gap:6px;}.sc-form-dialog .sc-form-touch{padding-left:0;}.sc-form-dialog .sc-form-mute-hit{position:absolute;transform:translate(-50%,-50%);background:white;border:0;padding:0;font-size:26px;width:30px;height:30px;line-height:1;}.sc-form-dialog footer[hidden],.sc-form-dialog .sc-form-hint[hidden]{display:none;}
#screen-sheet-cruise .sc-playback-dialog .sc-playback-option{display:flex;gap:8px;margin:12px 0;white-space:normal;}.sc-form-dialog footer:has([data-form-apply]){justify-content:flex-end;}
.sc-playback-dialog header h2{margin-right:auto;}
.sc-actions-dialog{box-sizing:border-box;position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);margin:0;width:min(460px,calc(100vw - 24px));max-height:85dvh;overflow:auto;padding:20px;border:1px solid var(--studio-border-default);border-radius:14px;background:var(--studio-panel);color:var(--studio-text-primary);font:14px/1.6 sans-serif;}.sc-actions-dialog::backdrop{background:#10182066;}.sc-actions-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px;}.sc-actions-dialog h2{font-size:20px;margin:0;}.sc-actions-dialog button,.sc-actions-dialog input{font:inherit;padding:7px 10px;border:1px solid var(--studio-border-default);border-radius:6px;background:var(--studio-control);color:inherit;}.sc-actions-dialog p{font-size:12px;color:var(--studio-text-secondary);}.sc-actions-dialog label{display:flex;flex-direction:column;gap:6px;}.sc-actions-dialog [data-duplicate-apply]{margin-top:12px;background:var(--studio-accent);color:#171b20;}.sc-history-list{list-style:none;margin:12px 0 0;padding:0;}.sc-history-list button{width:100%;display:flex;justify-content:space-between;gap:10px;text-align:left;border:0;border-radius:5px;cursor:pointer;}.sc-history-list button:hover{background:var(--studio-control-hover);}.sc-history-list button[aria-current=step]{color:var(--studio-accent);background:var(--studio-control);}.sc-history-list small{white-space:nowrap;color:var(--studio-text-secondary);}
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
.sc-playback-dialog::backdrop{background:#10182066;}.sc-playback-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px;}.sc-playback-dialog h2{font-size:20px;margin:0;}.sc-playback-dialog header{flex-wrap:wrap}.sc-playback-dialog [data-playback-settings-play]{background:var(--studio-accent);color:#201b11;border-color:var(--studio-accent)}.sc-audio-sync{border-top:1px solid var(--studio-border-default);padding-top:12px;margin-top:16px}.sc-audio-sync summary{cursor:pointer;font-size:12px}.sc-audio-sync label{display:flex;align-items:center;gap:8px;margin:12px 0}.sc-audio-sync input{min-width:0;flex:1;accent-color:var(--studio-accent)}.sc-playback-dialog h3{font-size:14px;margin:0 0 8px;color:var(--studio-accent);}.sc-playback-dialog section{margin-top:20px;}.sc-playback-dialog button{font:inherit;padding:6px 12px;border:1px solid var(--studio-border-default);border-radius:7px;background:var(--studio-control);color:inherit;cursor:pointer;}.sc-playback-note{font-size:11px;color:var(--studio-text-secondary);margin:6px 0;}.sc-volume-row{display:block;margin:12px 0;}.sc-volume-row>span{display:flex;justify-content:space-between;gap:8px;}.sc-volume-row input{display:block;box-sizing:border-box;width:100%;margin:7px 0;accent-color:var(--studio-accent);}.sc-playback-dialog .sc-playback-reset{font-size:11px;padding:4px 8px;}.sc-playback-dialog .sc-playback-option{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0;}.sc-playback-dialog .sc-playback-option small{flex-basis:100%;padding-left:24px;color:var(--studio-text-secondary);font-size:11px;}.sc-playback-dialog input[type=checkbox]{accent-color:var(--studio-accent);width:16px;height:16px;margin:0;}.sc-playback-dialog [data-playback-settings-notice]{font-size:12px;color:#e9b8ac;}
@media print{.sc-playback-dialog,.sc-playback-dialog::backdrop{display:none!important;}}

.sc-catalogue-edit{width:min(920px,calc(100vw - 24px));inset:0;margin:auto;transform:none}
.sc-catalogue-edit .score-owner-chord-picker{padding:18px}
.sc-catalogue-edit h2{margin:0;font-size:20px}
.sc-catalogue-edit p{margin:8px 0}
.sc-catalogue-edit details{margin-bottom:16px;color:var(--studio-text-secondary)}
.sc-catalogue-edit details p{max-height:5em;overflow:auto}
.sc-catalogue-edit label{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.sc-catalogue-edit input{box-sizing:border-box;min-height:32px;padding:4px 8px;border:1px solid var(--studio-border-default);border-radius:6px;background-color:var(--studio-control);color:inherit;font:inherit}
.sc-catalogue-edit input{min-width:0;flex:1}
.sc-catalogue-edit footer{display:flex;justify-content:flex-end;gap:10px;border-top:1px solid var(--studio-border-default);padding-top:14px;margin-top:16px}
.sc-catalogue-edit footer button:last-child{background:var(--studio-accent);color:#211b12}
.sc-catalogue-edit button:disabled{opacity:.5}

.sc-form-dialog header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:6px;}
.sc-form-dialog h2{margin:0;font-size:24px;}
.sc-form-dialog button{border:1px solid #a0a7ae;border-radius:7px;background:white;color:#273440;padding:6px 12px;cursor:pointer;}
.sc-form-dialog svg{display:block;width:100%;height:auto;max-height:65vh;}
@media print{[data-edit-selected-bar],.sc-form-dialog{display:none!important;}:is(#sc-sheet-scale-box,.sc-preset-sheet-frame,.sc-song-preview,.sc-section-preview) .sheet-bar-num{min-height:0;}}
#sc-slot-overlay {--editor-label-width:max(100px,calc(100px * var(--bar-loupe-scale,1)));--editor-label-offset:calc(var(--editor-label-width) + 8px * var(--bar-loupe-scale,1));--editor-min-cell:max(9px,calc(max(18px,24px * var(--bar-loupe-scale,1)) * var(--editor-horizontal-scale,1)));padding:0;gap:0;overflow:hidden;box-sizing:border-box;}
#sc-slot-overlay .slot-overlay-content{display:flex;flex-direction:column;gap:6px;min-height:0;overflow:auto;padding:8px 20px 16px;}
#sc-slot-overlay .slot-overlay-content > *{flex-shrink:0;}
#sc-slot-overlay.editor-right .slot-overlay-content{overflow:visible;}
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
#sc-slot-overlay .chord-cell{position:relative;display:grid;min-width:0;}
#sc-slot-overlay .chord-cell input{height:100%;}
#sc-slot-overlay .slot-overlay-row--chord .dock-lyrics-beat-res-btn{top:auto;bottom:1px;}
#sc-slot-overlay .editor-row-resolution{position:static;min-width:24px;min-height:18px;padding:0 3px;border:1px solid #89939b;border-radius:4px;background:white;color:#52606a;font:600 10px sans-serif;}
#sc-slot-overlay .chord-cell-toggle{position:absolute;z-index:2;left:2px;bottom:1px;width:18px;max-width:calc(100% - 4px);min-width:0;min-height:14px;padding:0;border:0;border-radius:3px;background:transparent;color:#74818a;font-size:9px;line-height:14px;cursor:pointer;}
#sc-slot-overlay .chord-cell-toggle:hover,#sc-slot-overlay .chord-cell-toggle[aria-expanded=true]{background:#dce6ef;color:#344f6b;}
#sc-slot-overlay .chord-cell-toggle:focus-visible{outline:2px solid #6b8199;outline-offset:0;}
#sc-slot-overlay .chord-cell-toggle:disabled{opacity:.35;cursor:default;}
#sc-slot-overlay .solfege-cell {position:relative;display:grid;min-width:0;}
#sc-slot-overlay .solfege-cell input {height:100%;}
#sc-slot-overlay .solfege-cell input:not(:focus):not(.is-invalid) {color:transparent!important;}
#sc-slot-overlay .solfege-colors {position:absolute;z-index:2;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;white-space:nowrap;overflow:hidden;font-size:max(11px,calc(13px * var(--bar-loupe-scale,1)));font-weight:600;}
#sc-slot-overlay .solfege-cell input:focus + .solfege-colors {visibility:hidden;}
#sc-slot-overlay .solfege-cell.piano-color-mode input {color:transparent!important;caret-color:transparent;}
#sc-slot-overlay .solfege-cell.piano-color-mode input:focus + .solfege-colors {visibility:visible;}
:is(#sc-sheet-scale-box,.sc-preset-sheet-frame,.sc-song-preview,.sc-section-preview) .sheet-bar-strum{column-gap:0;margin:0 calc(-1 * var(--sheet-bar-pad-x));padding:3px 0 0;border-radius:0;background:transparent;box-shadow:none;}
:is(#sc-sheet-scale-box,.sc-preset-sheet-frame,.sc-song-preview,.sc-section-preview) .sheet-bar-strum>span:not([data-playback-band]){border-radius:0;background:transparent;box-shadow:none;}
@media print{:is(#sc-sheet-scale-box,.sc-preset-sheet-frame,.sc-song-preview,.sc-section-preview) .sheet-bar-strum,:is(#sc-sheet-scale-box,.sc-preset-sheet-frame,.sc-song-preview,.sc-section-preview) .sheet-bar-strum>span{background:transparent!important;box-shadow:none!important;}}
#sc-sheet-scale-box .sheet-section-label{cursor:pointer;}
#sc-sheet-scale-box .sheet-section-label.is-selected-section{background:var(--score-fill,rgba(64,138,167,.12));outline:2px solid var(--score-border,#408aa7);outline-offset:3px;}
@media print{#sc-sheet-scale-box .sheet-section-label.is-selected-section{background:transparent;outline:none;}}
#sc-slot-overlay .slot-overlay-grid {position:relative;overflow:visible;}
#sc-slot-overlay .editor-score-scroll{overflow-y:hidden;}

#sc-slot-overlay .slot-overlay-row-body,:is(#sc-sheet-scale-box,.sc-preset-sheet-frame,.sc-song-preview,.sc-section-preview) .sheet-bar-row{position:relative;overflow:hidden;}
#sc-slot-overlay [data-playback-band],#sc-sheet-scale-box [data-playback-band]{position:absolute;top:0;bottom:0;pointer-events:none;z-index:3;background:var(--score-fill,rgba(64,138,167,.12));box-shadow:inset 0 0 0 1px var(--score-border,#408aa7);will-change:left;}
@media print{[data-playback-band]{display:none!important;}}
#sc-sheet-scale-box .sc-playing-cell {box-shadow:inset 0 0 0 2px var(--score-border,#408aa7)!important;background-color:var(--score-fill,rgba(64,138,167,.12))!important;}
#sc-sheet-scale-box{--paper-selection-bg:var(--score-fill,rgba(64,138,167,.12));--paper-selection-border:var(--score-border,#408aa7);--paper-selection-number:var(--score-ink,#265d72);--paper-selection-shadow-edge:var(--score-fill);--paper-focus:var(--score-border,#408aa7);}
#sc-sheet-scale-box .sheet-bar.is-selected,#sc-sheet-scale-box .sheet-bar.sc-playing-bar{background:var(--paper-selection-bg);box-shadow:inset 0 0 0 1px var(--paper-selection-border);}
@media screen{
#sc-sheet-scale-box .sheet-bar.sc-in-editor{background:var(--paper-selection-bg);box-shadow:inset 0 0 0 1px var(--paper-selection-border);}
#sc-sheet-scale-box .sheet-bar.sc-in-editor .sheet-bar-num{color:var(--paper-selection-number);}
}
#sc-sheet-scale-box:not(.sc-score-playing) .sheet-bar.is-selected:focus-visible{outline:1px solid var(--paper-focus);outline-offset:1px;}
#sc-sheet-scale-box.sc-score-playing .sheet-bar{transition:none;}
#sc-sheet-scale-box.sc-score-playing .sheet-bar:focus-visible{outline:none;}
#sc-sheet-scale-box.sc-score-playing:not(.sc-range-playing) .sheet-bar.is-selected:not(.sc-playing-bar){background:transparent;box-shadow:none;}
#sc-sheet-scale-box.sc-score-playing:not(.sc-range-playing) .sheet-bar.is-selected:not(.sc-playing-bar) .sheet-bar-num{color:var(--paper-faint);font-weight:400;}
#sc-sheet-scale-box .sheet-bar.sc-playing-bar .sheet-bar-num{color:var(--paper-selection-number);font-weight:800;}
#sc-sheet-scale-box.sc-score-playing [data-edit-selected-bar]{display:none;}
@media print{#sc-sheet-scale-box .sheet-bar.sc-playing-bar{background:transparent!important;box-shadow:none!important}}
#sc-slot-overlay [data-score-playhead],#sc-sheet-scale-box [data-score-playhead] {position:absolute;top:0;bottom:0;width:2px;background:var(--score-line,#286780);z-index:4;pointer-events:none;will-change:transform;contain:strict;backface-visibility:hidden;}
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

#sc-slot-overlay .slot-overlay-head-actions{width:100%;}
#sc-slot-overlay .editor-size-tabs{display:inline-flex;}
/* Keep trackpad overscroll inside the editor, including when a single bar fits. */
html:has(#screen-sheet-cruise:not(.hidden):not([hidden])):has(#sc-slot-overlay:not(.hidden)){overscroll-behavior-x:contain;}
#sc-slot-overlay .editor-score-scroll{min-width:0;overflow-x:auto;overscroll-behavior-x:contain;flex-shrink:0;}
#sc-slot-overlay .editor-measures{position:relative;display:grid;grid-template-columns:var(--editor-label-offset) repeat(var(--editor-count),minmax(0,1fr));width:var(--editor-horizontal-width,100%);min-width:calc(var(--editor-label-offset) + var(--editor-count) * (16 * var(--editor-min-cell) + 2px));}
#sc-slot-overlay .editor-measure,#sc-slot-overlay .editor-measure .slot-overlay-grid{display:contents;}
#sc-slot-overlay .editor-measure :is(.slot-overlay-row,.slot-overlay-ruler){grid-column:calc(var(--editor-column) + 1);min-width:0;}
#sc-slot-overlay .slot-overlay-ruler{grid-row:1;}
#sc-slot-overlay .slot-overlay-row--chord{grid-row:2;}
#sc-slot-overlay [data-chord-picker]{grid-row:3;grid-column:1/-1;}
#sc-slot-overlay .slot-overlay-row--strum{grid-row:4;}
#sc-slot-overlay .slot-overlay-row--lyrics{grid-row:5;}
#sc-slot-overlay .slot-overlay-row--doremi{grid-row:6;}
#sc-slot-overlay :is(.slot-overlay-row--strum,.slot-overlay-row--lyrics,.slot-overlay-row--doremi){margin-top:calc(3px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .editor-measure:first-child :is(.slot-overlay-ruler,.slot-overlay-row){display:grid;grid-column:1/-1;grid-template-columns:subgrid;column-gap:0;pointer-events:none;}
#sc-slot-overlay .editor-measure:first-child :is(.slot-overlay-ruler-track,.slot-overlay-row-body){grid-area:1/2;pointer-events:auto;}
#sc-slot-overlay .editor-measure:first-child :is(.slot-overlay-row-label,.slot-overlay-ruler-label){grid-area:1/1/2/-1;justify-self:start;position:sticky;left:0;width:var(--editor-label-width);background:var(--slot-surface);box-shadow:calc(var(--editor-label-offset) - var(--editor-label-width)) 0 var(--slot-surface);z-index:4;pointer-events:auto;}
#sc-slot-overlay .editor-measure:not(:first-child) :is(.slot-overlay-row-label,.slot-overlay-ruler-label){display:none;}
/* Each lane draws its barline on the outer track, including lanes with a nested input grid. */
#sc-slot-overlay .editor-measures .slot-overlay-row-body{box-sizing:border-box;border:1px solid var(--slot-border);border-radius:6px;background:var(--slot-input-surface);}
#sc-slot-overlay .editor-measures :is(.dock-strum-grid,.dock-lyrics-grid){border:0;border-radius:0;width:100%;box-shadow:none;}
#sc-slot-overlay .editor-measures .slot-overlay-ruler-track{box-sizing:border-box;border-inline:1px solid transparent;}
#sc-slot-overlay .editor-measure:not(:last-child) :is(.slot-overlay-row-body,.slot-overlay-ruler-track){border-right:2px solid var(--slot-border);border-top-right-radius:0;border-bottom-right-radius:0;}
#sc-slot-overlay .editor-measure:not(:first-child) :is(.slot-overlay-row-body,.slot-overlay-ruler-track){border-left:0;border-top-left-radius:0;border-bottom-left-radius:0;}
#sc-slot-overlay .slot-overlay-input{border-right:1px solid transparent;}
#sc-slot-overlay .slot-overlay-input.is-beat{border-right-color:var(--paper-line-beat);}
#sc-slot-overlay .slot-overlay-input.is-8th{border-right-color:var(--paper-line-eighth);}
#sc-slot-overlay .slot-overlay-input.is-16th{border-right-color:var(--paper-line-sixteenth);}
#sc-slot-overlay .editor-measures .is-barend{border-right-color:transparent;}
#sc-slot-overlay .slot-overlay-row-label{font-size:max(11px,calc(11.5px * var(--bar-loupe-scale,1)));white-space:nowrap;justify-content:space-between;gap:3px;}
#sc-slot-overlay .editor-row-tools{position:absolute;right:0;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;}
#sc-slot-overlay .slot-overlay-row-label{position:relative;}
#sc-slot-overlay .editor-row-tools .editor-row-fold{height:max(16px,calc(18px * var(--bar-loupe-scale,1)));}
#sc-slot-overlay .editor-row-disclosure{line-height:1;}
#sc-slot-overlay .editor-row-disclosure{font:inherit;font-size:max(11px,calc(11px * var(--bar-loupe-scale,1)))!important;padding:1px 3px!important;border:0!important;border-radius:3px!important;background:transparent!important;color:#435b81!important;text-decoration:none!important;cursor:pointer;}
#sc-slot-overlay .editor-row-disclosure[aria-expanded=true]{background:#dfe7f0!important;}
#sc-slot-overlay .score-owner-chord-picker{box-sizing:border-box;position:relative;z-index:5;min-width:0;width:calc(100% - var(--editor-label-offset));max-width:calc(100% - var(--editor-label-offset));margin:0 0 8px var(--editor-label-offset);padding:18px;flex-shrink:0;}
#sc-slot-overlay .score-chord-picker{position:relative;z-index:5;margin:0 0 8px var(--editor-label-offset);padding:12px;background:#f8faff;color:var(--slot-text);border:1px solid #9baac2;border-radius:8px;flex-shrink:0;}
#sc-slot-overlay input.chord-selected-cell{box-shadow:inset 0 0 0 2px var(--score-cell-selection-edge)!important;background:var(--score-cell-selection-fill)!important;}
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
#sc-slot-overlay.editor-right [data-loupe-resize]{display:none;}

#sc-slot-overlay.editor-right .piano-keys{min-width:420px;}
#sc-slot-overlay.editor-right .piano-keys button{font-size:10px;}
#sc-slot-overlay .slot-overlay-head {position:sticky;top:0;z-index:5;background:var(--slot-surface);padding-left:0;padding-right:var(--loupe-tool-clearance,0px);}
#sc-slot-overlay .slot-overlay-head-actions{--editor-header-height:max(28px,calc(28px * var(--bar-loupe-scale,1)));align-items:center;}
#sc-slot-overlay .slot-overlay-head-actions :is(.slot-overlay-nav-btn,.slot-overlay-close,.slot-overlay-res-toggle){box-sizing:border-box;height:var(--editor-header-height);min-height:0;}
#sc-slot-overlay .slot-overlay-head-actions button{display:inline-flex;align-items:center;justify-content:center;line-height:1;padding-block:0;}
#sc-slot-overlay .slot-overlay-head-actions .slot-overlay-res-btn{height:100%;box-sizing:border-box;}
#sc-slot-overlay .editor-window-actions{display:inline-flex;align-items:center;gap:inherit;margin-left:auto;}
#sc-slot-overlay .editor-window-actions :is(.slot-overlay-close,.editor-help-trigger){width:var(--editor-header-height);min-width:0;padding:0;}
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
@container(max-width:460px){
#sc-slot-overlay .piano-heading{grid-template-columns:minmax(0,1fr) auto;}
#sc-slot-overlay .piano-heading-left{display:contents;}
#sc-slot-overlay .piano-heading .piano-octave-controls{grid-column:1;grid-row:1;justify-self:start;}
#sc-slot-overlay .piano-heading .piano-melody-center{grid-column:1/-1;grid-row:2;}#sc-slot-overlay .piano-heading [data-piano-close]{grid-column:2;grid-row:1;}
#sc-slot-overlay .piano-heading>span:last-child{display:none;}
}
@container(max-width:220px){
#sc-slot-overlay .piano-heading{grid-template-columns:minmax(0,1fr);}
#sc-slot-overlay .piano-heading [data-piano-close]{grid-column:1;grid-row:1;}
#sc-slot-overlay .piano-heading .piano-octave-controls{grid-column:1;grid-row:2;justify-self:start;}
#sc-slot-overlay .piano-heading .piano-melody-center{grid-column:1;grid-row:3;}
}
#sc-slot-overlay .piano-range-edges{display:flex;justify-content:space-between;margin-top:6px;}
#sc-slot-overlay .piano-heading strong {font-size:max(12px,calc(13px * var(--bar-loupe-scale,1)));color:#435ca0;}
#sc-slot-overlay .piano-heading .piano-target {flex:1;margin:0;}
#sc-slot-overlay .piano-spacer {flex:1;}
#sc-slot-overlay .piano-selected-cell {outline:2px solid var(--score-border);outline-offset:-2px;background:var(--score-fill);}
#sc-slot-overlay.piano-open .solfege-colors [data-piano-event] {pointer-events:auto;cursor:pointer;border-radius:3px;line-height:1.25;}
#sc-slot-overlay.piano-open .solfege-colors [data-piano-event]:hover {background:#e7edf8;}
#sc-slot-overlay .solfege-colors .piano-selected-note {background:var(--score-fill);outline:1px solid var(--score-border);outline-offset:2px;}
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
#sc-slot-overlay [data-loupe-resize]{position:absolute;z-index:6;touch-action:none;}
#sc-slot-overlay [data-loupe-resize="width"]{top:8px;bottom:27px;right:0;width:9px;cursor:ew-resize;background:linear-gradient(var(--slot-border),var(--slot-border)) center / 2px 24px no-repeat;}
#sc-slot-overlay [data-loupe-resize="height"]{left:8px;right:27px;bottom:0;height:9px;cursor:ns-resize;background:linear-gradient(var(--slot-border),var(--slot-border)) center / 24px 2px no-repeat;}
#sc-slot-overlay [data-loupe-resize="both"]{display:block;}
#sc-slot-overlay [data-loupe-resize]:hover{background-color:var(--slot-divider);}
body.loupe-resizing,body.loupe-resizing *{cursor:var(--loupe-resize-cursor,nwse-resize)!important;user-select:none;}
#screen-sheet-cruise>.workspace-local-nav{position:static;}
#screen-sheet-cruise .form-field:has(#sc-basic-strum),#screen-sheet-cruise:has(.sc-compact-toolbar) #sc-editor-drawer:not([open]){display:none;}
#screen-sheet-cruise .sc-compact-toolbar{gap:10px;overflow:visible;zoom:var(--sc-toolbar-scale,1);top:6px;}
#screen-sheet-cruise .sc-toolbar-scale{position:absolute;right:1px;bottom:1px;width:18px;height:18px;min-height:0;padding:0;border:0;border-radius:0 0 5px 0;background:repeating-linear-gradient(135deg,transparent 0 2px,var(--studio-text-secondary) 2px 3px,transparent 3px 5px);clip-path:polygon(100% 0,100% 100%,0 100%);cursor:nwse-resize;touch-action:none;}
#screen-sheet-cruise .sc-toolbar-scale:focus-visible{background:var(--studio-focus);}
@media(pointer:coarse){#screen-sheet-cruise .sc-compact-toolbar{zoom:1;}#screen-sheet-cruise .sc-toolbar-scale{display:none;}}
/* Native popovers raise only the menu, leaving the movable editor unobstructed. */
#screen-sheet-cruise .sc-compact-toolbar:has(.sc-toolbar-menu[data-popup-fallback][open]){z-index:45;}
#screen-sheet-cruise .sc-compact-toolbar .sc-score-toolbar-head{position:relative;justify-content:flex-start;gap:10px;padding-right:40px;}
#screen-sheet-cruise .sc-compact-toolbar .sheet-toolbar-project{flex:1 1 240px;max-width:440px;min-width:0;}
#screen-sheet-cruise .sc-compact-toolbar .sheet-toolbar-project select{width:100%;font-size:14px;}
#screen-sheet-cruise .sc-toolbar-head-actions,#screen-sheet-cruise .sc-toolbar-primary,#screen-sheet-cruise .sc-toolbar-view{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0;}
#screen-sheet-cruise .sc-toolbar-head-actions{margin-left:auto;flex-wrap:nowrap;}
#screen-sheet-cruise .sc-compact-toolbar .sheet-toolbar-actions{flex:1 1 100%;width:100%;justify-content:space-between;overflow:visible;padding:0;gap:8px;}
#screen-sheet-cruise .sc-toolbar-primary{flex:1 1 280px;}
#screen-sheet-cruise .sc-menu-shortcuts{display:flex;align-items:center;gap:4px;min-width:0;max-width:100%;margin-inline-start:auto;padding:4px 6px;border-radius:10px;background:rgba(135,171,194,.13);border:1px solid rgba(135,171,194,.22);}
#screen-sheet-cruise .sc-shortcut-items>button,#screen-sheet-cruise #sc-shortcut-menu>summary{display:grid;place-items:center;box-sizing:border-box;width:36px;height:36px;padding:0;border-radius:8px;}
#screen-sheet-cruise #sc-shortcut-menu{flex:none;}
#screen-sheet-cruise #sc-shortcut-menu>summary{width:30px;background:color-mix(in srgb,var(--studio-control),#87abc2 14%);font:700 18px/1 system-ui,sans-serif;}
#screen-sheet-cruise #sc-shortcut-menu[open]>summary,#screen-sheet-cruise #sc-shortcut-menu>summary:hover{background:color-mix(in srgb,var(--studio-control-hover),#87abc2 22%);}
@media(pointer:coarse){#screen-sheet-cruise #sc-shortcut-menu>summary{width:44px;}}
#screen-sheet-cruise .sc-shortcut-items>button[hidden],#screen-sheet-cruise #sc-shortcut-menu>summary::after{display:none;}
#screen-sheet-cruise .sc-shortcut-items>button{touch-action:none;}
#screen-sheet-cruise .sc-shortcut-items{display:grid;gap:5px;padding:4px;margin-block:-4px;grid-auto-flow:column;grid-auto-columns:max-content;grid-template-rows:auto;align-content:center;justify-content:start;overflow-x:auto;min-width:0;}
#screen-sheet-cruise [data-shortcut]{position:relative;}
#screen-sheet-cruise [data-drop-side]::after{content:'';position:absolute;inset-block:1px;width:3px;background:#f1c96a;}
#screen-sheet-cruise [data-drop-side=before]::after{left:-4px;}
#screen-sheet-cruise [data-drop-side=after]::after{right:-4px;}
#screen-sheet-cruise .sc-compact-toolbar #sc-toolbar-head-actions{margin-left:0;max-width:100%;}
#screen-sheet-cruise .sc-shortcut-items>button[aria-disabled="true"]{opacity:.5;}
#screen-sheet-cruise .sc-menu-shortcuts svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;}
#screen-sheet-cruise #sc-shortcut-menu>.sc-toolbar-menu-body>strong{display:block;padding:6px 8px;}
#screen-sheet-cruise #sc-shortcut-menu label{display:flex;align-items:center;gap:10px;padding:7px 8px;cursor:pointer;}

#screen-sheet-cruise .sc-toolbar-history{display:flex;align-items:center;gap:8px;}
#screen-sheet-cruise .sc-toolbar-playback{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;}
#screen-sheet-cruise .sc-playback-option{display:inline-flex;align-items:center;gap:5px;font:12px/1.4 sans-serif;white-space:nowrap;margin:0;}
#screen-sheet-cruise .sc-playback-option input{width:16px;height:16px;accent-color:var(--studio-accent);}
#screen-sheet-cruise .sc-playback-caption{display:flex;flex-direction:column;justify-content:center;width:160px;min-width:0;max-width:calc(100vw - 120px);line-height:1.4;}
#screen-sheet-cruise #sc-song-target{font-size:12px;color:var(--studio-text-secondary);overflow-wrap:anywhere;}
#screen-sheet-cruise #sc-song-position{font-size:11px;min-width:0;overflow-wrap:anywhere;}
#screen-sheet-cruise #sc-song-position:empty{display:none;}
.sc-bar-drop-marker{position:fixed;z-index:4000;width:4px;pointer-events:none;background:#3d8fce;border-radius:2px;box-shadow:0 0 0 1px #fff;}.sc-bar-drop-marker[hidden]{display:none!important;}.sc-bar-drop-marker::before,.sc-bar-drop-marker::after{content:"";position:absolute;left:-3px;width:10px;height:4px;background:#3d8fce;border-radius:2px;}.sc-bar-drop-marker::before{top:0;}.sc-bar-drop-marker::after{bottom:0;}.sc-bar-drop-label{position:fixed;box-sizing:border-box;max-width:min(240px,calc(100vw - 16px));padding:4px 8px;border-radius:5px;background:#246b9d;color:#fff;font:600 12px/1.5 sans-serif;box-shadow:0 2px 6px #0003;}#sc-sheet-scale-box .sc-bar-drag-source{opacity:.55;}@media print{.sc-bar-drop-marker{display:none!important;}#sc-sheet-scale-box .sc-bar-drag-source{opacity:1;}}
#screen-sheet-cruise .sc-toolbar-footer{display:flex;align-items:center;flex-wrap:wrap;gap:10px;flex:1 1 100%;min-width:0;box-sizing:border-box;padding-right:24px;}
#screen-sheet-cruise .sc-score-gesture-help{flex:1 1 320px;margin:0;min-height:17px;color:var(--studio-text-secondary);font-size:11px;line-height:17px;}


#screen-sheet-cruise .sc-toolbar-menu .sc-menu-label{display:block;padding:5px 10px;font-size:11px;color:var(--studio-text-secondary);}
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
#screen-sheet-cruise .sc-selection-tools{display:flex;align-items:center;gap:10px;max-width:100%;}
#screen-sheet-cruise .sc-toolbar-selection{color:var(--studio-text-primary);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;}
#screen-sheet-cruise #sc-edit-selected{color:var(--studio-accent-text);border-color:var(--studio-accent);background:color-mix(in srgb,var(--studio-control),var(--studio-accent) 16%);font-weight:700;}
#screen-sheet-cruise #sc-edit-selected:hover:enabled{background:color-mix(in srgb,var(--studio-control),var(--studio-accent) 28%);}
#screen-sheet-cruise .sc-toolbar-context button{padding-inline:9px;white-space:nowrap;}
#screen-sheet-cruise .sc-toolbar-context.sc-empty-selection .sc-context-group:not([aria-label="コピーと貼り付け"]),
#screen-sheet-cruise .sc-toolbar-context.sc-empty-selection #sc-copy-bar{display:none;}
#screen-sheet-cruise .sc-context-group{display:flex;flex-wrap:wrap;gap:4px;padding-inline-start:7px;border-inline-start:1px solid var(--studio-border-default);max-width:100%;}
#screen-sheet-cruise .sc-context-group[aria-label="小節を削除"] button{color:var(--studio-danger,var(--studio-text-primary));}
#screen-sheet-cruise .sc-toolbar-head-actions>.sc-toolbar-menu>summary{height:40px;min-height:40px;white-space:nowrap;}
#screen-sheet-cruise .sc-compact-toolbar #sc-zoom-controls{display:flex;align-items:center;gap:0!important;height:40px;flex-shrink:0;box-sizing:border-box;border:1px solid var(--studio-border-default);border-radius:8px;background:var(--studio-control);overflow:hidden;}
#screen-sheet-cruise .sc-compact-toolbar #sc-zoom-controls button{box-sizing:border-box;height:38px;min-height:38px;min-width:38px;padding:6px 10px;border:0;border-radius:0;background:transparent;}
#screen-sheet-cruise .sc-compact-toolbar #sc-zoom-controls button:hover{background:var(--studio-control-hover);}
#screen-sheet-cruise .sc-compact-toolbar #sc-zoom-controls button:focus-visible{outline-offset:-3px;}
#screen-sheet-cruise .sc-compact-toolbar #sc-zoom-reset{min-width:58px;border-inline:1px solid var(--studio-border-default);}
@media(max-width:600px){
#screen-sheet-cruise .sc-compact-toolbar .sc-score-toolbar-head{display:grid;grid-template-columns:minmax(0,1fr) auto 30px;gap:6px;padding-right:0;}
#sc-score-guide{position:static;grid-area:1 / 3;}
#screen-sheet-cruise .sc-compact-toolbar .sheet-toolbar-project{max-width:none;}
#screen-sheet-cruise .sc-compact-toolbar #sc-toolbar-head-actions{grid-column:1 / -1;}
#screen-sheet-cruise .sc-toolbar-head-actions{margin-left:auto;flex-wrap:nowrap;gap:6px;}
#screen-sheet-cruise .sc-toolbar-head-actions>.sc-toolbar-menu>summary{font-size:12px;padding:6px 8px;gap:4px;}
#screen-sheet-cruise .sc-compact-toolbar #sc-zoom-controls button{min-width:30px;padding:6px;font-size:12px;}
#screen-sheet-cruise .sc-compact-toolbar #sc-zoom-reset{min-width:42px;}
#screen-sheet-cruise .sc-toolbar-primary{flex-basis:100%;}
#screen-sheet-cruise .sc-toolbar-footer{padding-right:16px;}
#screen-sheet-cruise .sc-toolbar-context{gap:6px;}
}
@media print{#screen-sheet-cruise .sc-toolbar-menu-body{display:none!important;}}
@media(pointer:coarse){#screen-sheet-cruise .sc-compact-toolbar button,#screen-sheet-cruise .sc-toolbar-menu>summary,#screen-sheet-cruise .sc-toolbar-menu label{min-height:44px;}}
#sc-sheet-scale-box [data-paper-edit]:not([data-paper-edit=""]){cursor:pointer;border-radius:3px;}
#sc-sheet-scale-box [data-paper-edit=instrument],#sc-sheet-scale-box [data-paper-edit=rhythm]{cursor:pointer;}
#sc-sheet-scale-box [data-paper-edit]:hover{outline:1px dashed #8c9da9;outline-offset:2px;}
:is(#sc-sheet-scale-box,.sc-preset-sheet-frame,.sc-song-preview,.sc-section-preview) .sheet-section-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;}
:is(#sc-sheet-scale-box,.sc-preset-sheet-frame,.sc-song-preview,.sc-section-preview) .sheet-section-heading .sheet-section-label{flex:1;}
#sc-sheet-scale-box .sheet-section-play{font:11px sans-serif;padding:4px 8px;border:1px solid #bbb5aa;border-radius:5px;background:transparent;color:#665e54;cursor:pointer;}
.sc-paper-layout.sc-hide-parts .sheet-section-heading{display:none!important;}
#sc-sheet-scale-box [data-editable-empty]{pointer-events:auto;cursor:pointer;min-height:80px;}
#sc-sheet-scale-box [data-editable-empty].is-selected{outline:2px solid #83a7c7;outline-offset:-2px;}
#sc-sheet-scale-box .sheet-artist--empty .sheet-artist-separator{display:none;}
#screen-sheet-cruise .sc-score-toolbar-head>#sc-curve-menu>summary,#screen-sheet-cruise .sheet-toolbar-project select{box-sizing:border-box;height:44px;min-height:44px;padding:8px 12px;font-size:14px;}
#screen-sheet-cruise .sc-toolbar-head-actions .sc-toolbar-menu>summary,#screen-sheet-cruise .sc-compact-toolbar #sc-zoom-controls{height:44px;min-height:44px;box-sizing:border-box;}#screen-sheet-cruise .sc-compact-toolbar #sc-zoom-controls button{height:42px;}
#screen-sheet-cruise .sc-bottom-transport{position:sticky;bottom:10px;z-index:24;margin-top:16px;box-shadow:0 5px 22px #0005;}.sc-bottom-transport>.sc-playback-caption{display:none!important;}
@media screen and (pointer:coarse) and (orientation:landscape) and (max-height:500px){
    #screen-sheet-cruise > .sc-compact-toolbar{position:relative;top:auto;}
    #screen-sheet-cruise:has(#sc-song-preview[aria-pressed="true"]) > .sc-compact-toolbar{display:none;}
}
@media print{#sc-transport{display:none!important}}
#screen-sheet-cruise .sc-score-toolbar-head>#sc-curve-menu{flex:none;}
#screen-sheet-cruise .sc-compact-toolbar #sc-song-preview{min-height:44px;min-width:108px;background:linear-gradient(135deg,#e6d29b,var(--studio-accent));border-color:var(--studio-accent);color:#201b11;font-weight:650;}
#screen-sheet-cruise .sc-menu-zoom-row{display:grid;grid-template-columns:80px 1fr;gap:8px;align-items:center;padding:8px 4px;font-size:12px;}.sc-menu-zoom{display:flex;border:1px solid var(--studio-border-default);border-radius:8px;overflow:hidden}.sc-menu-zoom button{flex:1;min-width:30px;border:0;background:var(--studio-control);color:inherit;padding:8px 4px;font:inherit;}
.sc-interaction-colors{display:grid;gap:12px;margin:18px 0;padding:12px;border:1px solid #ffffff25;border-radius:8px;font-size:13px}.sc-interaction-colors label{display:flex!important;align-items:center;justify-content:space-between}.sc-interaction-colors input[type=color]{width:38px;height:30px;padding:2px;background:transparent;border:1px solid #718390;border-radius:5px}
.sc-compact-toolbar.sc-range-selecting{box-sizing:border-box;height:var(--sc-range-toolbar-height);}
.sc-compact-toolbar.sc-range-selecting #sc-selected-bar-actions{position:absolute;visibility:hidden;pointer-events:none;}
#sc-sheet-scale-box.sc-range-selecting{user-select:none;cursor:crosshair;}
#sc-sheet-scale-box .sheet-artist--empty{opacity:.5;font-size:12px;}
.sc-layout-example-paper .sheet-artist--empty{display:none;}
#sc-slot-overlay .editor-help-trigger{border-radius:50%;font-weight:700;}
.sc-song-dialog{position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);margin:0;width:min(580px,calc(100vw - 24px));max-height:88dvh;overflow:auto;box-sizing:border-box;padding:20px;border:1px solid var(--studio-border-default);border-radius:14px;background:var(--studio-panel);color:var(--studio-text-primary);font:14px/1.5 sans-serif;}
.sc-song-dialog::backdrop{background:rgba(0,0,0,.45);}
.sc-song-dialog header,.sc-song-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.sc-song-dialog h2{font-size:19px;margin:0;}.sc-song-dialog header{margin-bottom:14px;}.sc-song-dialog footer{justify-content:flex-end;margin-top:14px;}
.sc-song-dialog button,.sc-song-dialog input,.sc-song-dialog select{font:inherit;box-sizing:border-box;padding:8px 10px;border:1px solid var(--studio-border-default);border-radius:7px;background:var(--studio-control);color:var(--studio-text-primary);max-width:100%;}
.sc-song-dialog label{display:flex;flex-direction:column;gap:5px;margin:10px 0;}.sc-song-dialog input:not([type=checkbox]){width:100%;}
.sc-song-dialog.sc-batch-dialog[open]{display:flex;flex-direction:column;width:min(1120px,calc(100vw - 24px));max-width:none;overflow:hidden;}
.sc-batch-dialog>[data-score-status]:empty{display:none;}
.sc-batch-dialog>header,.sc-batch-dialog>footer{flex:none;}
.sc-batch-dialog>footer{border-top:1px solid var(--studio-border-default);padding-top:12px;}
.sc-batch-dialog .sc-preset-dialog-body{min-height:0;overflow:auto;scrollbar-gutter:stable;padding-right:4px;}
.sc-batch-dialog .sc-preset-range-controls{display:flex;gap:12px;flex-wrap:wrap;}
.sc-batch-dialog .sc-preset-range-controls>label{flex:0 1 235px;margin-bottom:0;}
.sc-batch-dialog .sc-preset-range-controls>label[hidden]{display:none;}
.sc-preset-controls{display:flex;gap:12px;flex-wrap:wrap;align-items:end;}
.sc-preset-controls>label{flex:1 1 170px;margin-bottom:8px;}
.sc-preset-pattern,.sc-preset-target{margin:12px 0;}
.sc-preset-target h3{margin:0;font-size:15px;}
.sc-preset-target .sc-preset-target-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:0;}
.sc-preset-paper .sheet-header{display:none;}
.sc-preset-target .sc-preset-hint{margin:4px 0 8px;}
.sc-preset-paper{overflow:auto;max-height:38dvh;margin-top:10px;border:1px solid var(--studio-border-default);border-radius:8px;}

.sc-preset-paper .sheet-bar{cursor:pointer;user-select:none;}
.sc-preset-paper .sheet-bar[data-preset-source]{outline:2px dashed #64879f;outline-offset:-3px;z-index:1;}
.sc-preset-paper .sheet-bar[data-preset-destination]{background:#c8ad6333;box-shadow:inset 0 0 0 2px #a68136;}
/* Both bulk editors share the same space for the pattern and the score. */
.sc-song-dialog.sc-batch-dialog[open]{width:min(960px,calc(100vw - 24px));height:min(940px,95dvh);max-height:95dvh;padding:16px;gap:8px;}
.sc-song-dialog.sc-batch-dialog>header{margin:0;}
.sc-song-dialog.sc-batch-dialog>header h2{font-size:17px;}
.sc-song-dialog.sc-batch-dialog>footer:empty,.sc-batch-dialog [role=status]:empty,.sc-preset-window [role=status]:empty{display:none;}
.sc-song-dialog.sc-batch-dialog .sc-preset-dialog-body{flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;padding:0;overflow:auto;scrollbar-gutter:auto;}
.sc-preset-sidebar{border:1px solid var(--studio-border-default);background:var(--studio-control);border-radius:9px;padding:8px 12px;}
.sc-batch-dialog .sc-preset-controls,.sc-batch-dialog .sc-preset-range-controls,.sc-preview-heading{display:flex;align-items:center;gap:8px 14px;flex-wrap:wrap;}
.sc-batch-dialog .sc-preset-controls>label,.sc-batch-dialog .sc-preset-range-controls>label{display:flex;flex:0 1 auto;align-items:center;flex-direction:row;gap:8px;margin:0;min-width:0;font-size:13px;}
.sc-batch-dialog .sc-preset-controls select,.sc-batch-dialog .sc-preset-range-controls select{max-width:min(210px,65vw);}
.sc-batch-dialog :is(.sc-preset-controls,.sc-preset-range-controls,.sc-preview-heading)>button,.sc-batch-dialog select,.sc-preset-window button,.sc-batch-dialog>header button{font:inherit;font-size:13px;min-height:32px;padding:4px 10px;}
.sc-song-dialog.sc-batch-dialog .sc-preset-pattern{margin:0;min-width:0;}
.sc-batch-dialog .sc-preset-range-controls{margin-top:6px;justify-content:center;}
.sc-preview-heading{justify-content:flex-start;font-size:13px;margin:0 0 4px;}
.sc-song-dialog button.sc-preset-primary,.sc-song-dialog button[data-preset-stage]{width:auto;min-width:82px;background:var(--studio-accent,#cfb572);color:#211c10;border-color:#bca16c;font-weight:bold;}
.sc-batch-dialog button:disabled{opacity:.45;}
.sc-song-dialog .sc-preset-sidebar .sc-preset-preview{margin:3px 0 0;padding:0;background:none;font-size:12px;}
.sc-preset-window:not(.sc-batch-dialog){max-width:440px;}
.sc-preset-window select[size]{width:100%;padding:6px;margin-bottom:8px;}
.sc-preset-window select[size] option{padding:5px;}
.sc-preset-list-actions,.sc-preset-window:not(.sc-batch-dialog)>div:has(input),.sc-preset-author .sc-preset-pattern>section{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
.sc-preset-author .sc-preset-pattern>section{margin-top:6px;justify-content:space-between;}
.sc-preset-author .sc-preset-pattern>section details[open]{flex-basis:100%;}
.sc-preset-author details[open]{max-height:25dvh;overflow:auto;}
.sc-preset-window:not(.sc-batch-dialog)>div:has(input){margin-top:8px;}
.sc-preset-window:not(.sc-batch-dialog)>div input{flex:1;min-width:0;}
.sc-preset-author .sheet-bar{touch-action:none;}
.sc-batch-dialog .sc-preset-range-controls>.sc-preset-preview{margin:0;padding:0;background:none;font-size:12px;}
.sc-batch-dialog .sc-preview-heading .sc-preset-hint{margin:0;color:var(--studio-text-secondary);}
.sc-batch-dialog .sc-strum-preset-grid{box-sizing:border-box;max-width:100%;margin-inline:auto!important;}
.sc-song-dialog.sc-batch-dialog .sc-preset-target{flex:1 1 200px;display:flex;flex-direction:column;min-height:120px;margin:0;}
.sc-song-dialog.sc-batch-dialog .sc-preset-hint{margin:0 0 5px;font-size:11px;}
.sc-song-dialog.sc-batch-dialog .sc-preset-paper{flex:1;min-height:0;max-height:none;overflow:auto;margin:0;padding:5px;box-sizing:border-box;background:#141c24;scrollbar-gutter:stable both-edges;}
.sc-preset-sheet-frame{position:relative;margin:0 auto;overflow:hidden;}
.sc-song-dialog.sc-batch-dialog .sheet-page{position:absolute;top:0;left:0;transform-origin:top left;width:794px;min-width:794px;max-width:none;font-size:var(--sc-source-font-size,16px);margin:0 auto;}
.sc-song-dialog.sc-batch-dialog .sheet-header{display:block;}
@media(max-width:640px){
 .sc-song-dialog.sc-batch-dialog[open]{padding:10px;gap:6px;width:calc(100vw - 12px);max-height:97dvh;height:97dvh;}
 .sc-preset-sidebar{padding:5px 7px;}
 .sc-batch-dialog .sc-preset-controls,.sc-batch-dialog .sc-preset-range-controls{gap:4px 7px;}
 .sc-batch-dialog .sc-preset-controls>label{flex-direction:column;align-items:start;gap:1px;font-size:11px;}
 .sc-preset-controls>button{align-self:end;}
 .sc-preset-controls select[data-score-preset]{max-width:35vw;}

}
.sc-song-dialog .sc-preset-preview{background:var(--studio-control);padding:10px 12px;border-radius:8px;font-size:13px;}
.sc-song-dialog:is([data-score-dialog="chordPreset"],[data-score-dialog="strumPreset"]) details{margin:6px 0;}
.sc-song-dialog .sc-strum-preset-grid{overflow-x:auto;margin:8px 0;display:grid;gap:4px;}
.sc-strum-preset-grid>div{display:grid;box-sizing:border-box;width:50%;min-width:min(270px,100%);padding:4px;color:#413b32;}
.sc-strum-preset-grid strong button{margin-left:6px;min-height:20px;padding:0 5px;font-size:12px;}
.sc-batch-dialog .sc-strum-preset-grid{display:flex;flex-wrap:wrap;gap:0;}
.sc-strum-preset-grid>div>button[data-stroke]{min-height:40px;padding:3px;}
.sc-strum-preset-grid>div>button.sc-stroke-beat-unit{position:static;align-self:start;justify-self:end;box-sizing:border-box;width:30px;min-height:19px;margin:5px 1px 1px 0;padding:0 2px;border-radius:3px;font-size:10px;color:#52616c!important;}
.sc-strum-preset-grid .sc-stroke-beat-unit.is-local::before{width:8px;height:8px;}
.sc-strum-preset-grid>div>button.sc-stroke-beat-unit[aria-pressed=true]{border-color:#547fa1;background:#e0effa!important;}
.sc-preset-paper .sheet-section-label[role=button]{cursor:pointer;}
.sc-strum-preset-grid button{padding:4px;min-height:36px;border-radius:5px;font-size:16px;}
.sc-strum-preset-grid [data-stroke]{--stroke-ink:var(--paper-strum-stroke);}
.sc-strum-preset-grid [data-stroke="×"]{--stroke-ink:var(--paper-strum-mute);font-weight:700;}
.sc-strum-preset-grid [data-stroke="〜"]{--stroke-ink:var(--paper-strum-sustain);font-weight:600;}
.sc-strum-preset-grid [data-stroke="・"]{--stroke-ink:#746e65;}
.sc-batch-dialog [hidden]{display:none!important;}

.sc-batch-dialog .sc-preset-sidebar>section{padding:8px 0;}
.sc-batch-dialog .sc-strum-preset-grid{max-height:none;overflow:visible;margin:0;background:#f5f5f5;padding:3px;border-radius:4px;}
.sc-strum-preset-grid>div>button{border-radius:0;background-color:white!important;padding:2px;min-width:0;color:var(--stroke-ink,#704124)!important;background:transparent;border-color:#c5bcab;}
/* Bulk entry places each transport next to the material it auditions. */
.sc-batch-dialog .sc-preset-controls>label,.sc-batch-dialog .sc-preset-controls select{font:inherit;font-size:14px;}
.sc-batch-dialog .sc-preset-controls select{min-height:42px;padding-inline:12px;}
.sc-preset-guide{font-size:13px;color:var(--studio-text-secondary);margin:6px 0 0;}
.sc-pattern-strip{align-items:center;}
.sc-pattern-strip>[data-preview-play]{justify-self:end;margin-right:8px;white-space:nowrap;}
.sc-preset-paper-area{position:relative;display:flex;min-height:0;flex:1;background:#141c24;border-radius:8px;}
.sc-preset-author .sc-preset-pattern>section{display:block;}
.sc-preset-cell-editor{min-width:0;margin-bottom:8px;}
.sc-author-cell-tools{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:6px;}
.sc-author-cell-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr));gap:6px;max-height:27dvh;overflow:auto;margin:6px 0;}
.sc-author-measure{min-width:0;overflow:auto;background:#fbf8f0;color:#524c43;border:1px solid #afa693;border-radius:5px;}
.sc-author-measure strong{display:block;padding:2px 6px;font-size:12px;}
.sc-author-beats{display:grid;}
.sc-song-dialog .sc-author-beats input{min-width:0;padding:3px 1px;height:36px;border-radius:0;border:1px solid #dbd1c2;background:transparent;color:#a13923;font:bold 15px system-ui;text-align:center;}
:is(#sc-slot-overlay,.sc-song-dialog){--score-cell-selection-fill:#edf6ff;--score-cell-selection-edge:#92b1cb;}
.sc-song-dialog .sc-author-beats input[data-active],.sc-song-dialog .sc-strum-preset-grid button:focus,.sc-strum-preset-grid button[data-selected]{background:var(--score-cell-selection-fill)!important;color:#283845;outline:2px solid var(--score-cell-selection-edge);outline-offset:-2px;}
.sc-song-dialog .sc-author-beats input[data-active]{color:#b93222;}
.sc-preset-author .score-owner-chord-picker{max-height:48dvh;overflow:auto;}
.sc-batch-dialog .sc-preset-pattern{flex-shrink:0;}
.sc-stroke-length-tools{margin:4px 0 0 calc(var(--preset-rail) + 8px);}
.sc-preset-author .sc-preset-pattern>section details[open]{max-height:32dvh;overflow:auto;}
.sc-preset-window.sc-preset-catalog:not(.sc-batch-dialog){width:min(620px,94vw);max-width:none;}
.sc-preset-catalog ul{margin:0;padding:0;list-style:none;max-height:66dvh;overflow:auto;}
.sc-preset-catalog li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:center;padding:8px 4px;border-bottom:1px solid var(--studio-border-default);}
.sc-preset-catalog li strong{overflow-wrap:anywhere;}
.sc-preset-catalog .sc-preset-list-actions{display:flex;gap:4px;flex-wrap:nowrap;}
.sc-preset-catalog .sc-preset-list-actions button{display:inline-grid;place-items:center;min-width:32px;padding:2px 5px;font-size:16px;}
.sc-preset-catalog .sc-preset-list-actions button.sc-preset-primary{min-width:48px;font:500 13px/1.3 system-ui;}
.sc-preset-catalog button.sc-preset-delete{color:#f1a9a7;}
.sc-preset-row-detail:not(:empty){display:flex;align-items:center;flex-wrap:wrap;gap:6px;grid-column:1/-1;}
.sc-preset-row-detail:empty{display:none;}
.sc-song-dialog.sc-preset-author[open]:has(.sc-preset-target[hidden]){height:auto;}
@media(max-width:520px){.sc-preset-catalog li{grid-template-columns:minmax(0,1fr);}.sc-preset-catalog .sc-preset-list-actions button{min-width:36px;min-height:36px;}}
.sc-preset-author details input{max-width:270px;margin-right:6px;}
@media(max-width:640px){
 .sc-pattern-strip>[data-preview-play]{font-size:12px;padding:5px;margin-right:4px;}
 .sc-preset-guide{font-size:12px;}
}

.sc-preset-cell-editor{display:grid;grid-template-columns:68px minmax(0,1fr);gap:4px 8px;align-items:center;background:#f5f5f5;border-radius:6px;color:#515960;padding:7px;box-sizing:border-box;}
.sc-preset-cell-editor .sc-author-cell-tools{display:flex;flex-direction:column;gap:3px;margin:0;align-items:center;}
.sc-author-cell-tools strong{font-size:12px;}
.sc-song-dialog .sc-author-cell-tools button{min-height:0;padding:1px 4px;background:white;color:#505b63;border:1px solid #929ba1;border-radius:4px;font:bold 11px system-ui;}
.sc-author-cell-grid{display:grid;grid-template-columns:repeat(4,minmax(104px,1fr));min-width:0;overflow:auto;gap:5px 0;max-height:none;margin:0;}
.sc-author-measure{flex:1 0 0;box-sizing:border-box;border:0;background:white;}
.sc-author-measure strong{color:#515960;background:#f5f5f5;}
.sc-author-beats{border:1px solid #909ba3;border-radius:5px;overflow:auto;}
.sc-pattern-slot{min-width:0;position:relative;border-right:1px solid #ddd;background:white;padding-top:14px;}
.sc-pattern-slot small{position:absolute;top:0;left:2px;color:#59626a;font-size:9px;}
.sc-song-dialog .sc-pattern-slot input{border:0;height:27px;font:bold 15px system-ui;color:#ba3e30;}
.sc-pattern-grip{position:absolute;bottom:0;left:1px;cursor:grab;font-size:12px;line-height:14px;}
.sc-preset-cell-editor>section,.sc-pattern-length-tools{grid-column:1/-1;}
.sc-pattern-length-tools{display:flex;gap:6px;}
.sc-song-dialog .sc-pattern-length-tools button{padding:2px 6px;min-height:23px;font-size:11px;}

.sc-batch-dialog{--preset-rail:78px;}
.sc-batch-dialog .sc-pattern-strip,.sc-batch-dialog .sc-preset-paper-area{display:grid;grid-template-columns:var(--preset-rail) minmax(0,1fr);gap:8px;}
.sc-pattern-strip>.sc-preset-cell-editor,.sc-pattern-strip>.sc-strum-preset-grid{width:min(100%,var(--pattern-width,100%));justify-self:start;margin-inline:0!important;}
.sc-preset-author .sc-pattern-strip>.sc-preset-cell-editor,.sc-preset-author .sc-pattern-strip>.sc-strum-preset-grid{width:100%;}
.sc-batch-dialog .sc-preset-paper-area{align-items:stretch;padding:0;}
.sc-preset-paper-area:has(.sc-score-preview-rail[hidden]){grid-template-columns:minmax(0,1fr);}
.sc-score-preview-rail{display:flex;flex-direction:column;gap:4px;align-items:stretch;}
.sc-score-preview-rail{padding:6px 0 6px 6px;}
.sc-score-preview-rail button{min-height:32px;padding:3px;}
.sc-song-dialog.sc-batch-dialog .sc-preset-paper{padding:4px 0;border:0;scrollbar-gutter:stable;min-width:0;}
.sc-preset-sheet-frame{margin-inline:0;}
.sc-preset-actions{display:flex;align-items:center;margin-left:auto;gap:6px;flex-wrap:wrap;}
.sc-song-dialog .sc-preset-actions button{padding:5px 8px;font-size:12px;background:transparent;color:var(--studio-text-secondary);}
.sc-batch-dialog .sc-preset-controls select[data-score-preset]{background-color:#fbf8f0;color:#171717;color-scheme:light;border-color:var(--studio-accent);font-size:16px;font-weight:600;line-height:1.25;height:42px;}
.sc-pattern-onset{position:relative;padding-bottom:10px;}
@media(max-width:640px){.sc-batch-dialog{--preset-rail:54px;}.sc-batch-dialog .sc-preset-controls select{font-size:16px;}.sc-preset-actions{margin-left:0;}.sc-score-preview-rail button{font-size:12px;}}
#sc-slot-overlay .sc-editor-transfer-cell{position:relative;display:grid;width:100%;min-width:0;}
#sc-slot-overlay button.editor-cell-value,#sc-slot-overlay select.editor-row-resolution{appearance:none;background:#fff;color:#435563;border:1px solid #9ca9b3;border-radius:4px;min-height:0;height:calc(16px * var(--bar-loupe-scale,1));padding:0 2px;text-align:center;font:600 max(9px,calc(10px * var(--bar-loupe-scale,1)))/1.2 sans-serif;cursor:pointer;}
#sc-slot-overlay button.editor-cell-value{position:absolute;right:1px;bottom:1px;z-index:3;width:calc(24px * var(--bar-loupe-scale,1));max-width:50%;height:min(44%,calc(19px * var(--bar-loupe-scale,1)));min-width:0;display:flex;align-items:flex-end;justify-content:flex-end;padding:0 3px;background:transparent;border:0;color:#526573;font-size:max(9px,calc(9px * var(--bar-loupe-scale,1)));font-variant-numeric:tabular-nums;}
#sc-slot-overlay button.editor-cell-value:hover,#sc-slot-overlay button.editor-cell-value:focus-visible{background:#e6edf2;color:#233f53;}
#sc-slot-overlay button.editor-cell-value[data-unusual-value]{width:auto;max-width:calc(100% - 2px);}
#sc-slot-overlay select.editor-row-resolution{width:max(27px,calc(31px * var(--bar-loupe-scale,1)));}
#sc-slot-overlay button.editor-cell-value:focus-visible,#sc-slot-overlay select.editor-row-resolution:focus-visible{outline:2px solid #3676a6;z-index:4;}
#sc-slot-overlay .editor-measures.has-fine-values{--editor-min-cell:max(36px,calc(48px * var(--bar-loupe-scale,1) * var(--editor-horizontal-scale,1)));}
#sc-slot-overlay .sc-editor-transfer-cell> :is(.dock-strum-cell,.dock-lyrics-cell){height:100%;width:100%;min-width:0;}
#sc-slot-overlay .dock-strum-cell > *{pointer-events:none;}
#sc-slot-overlay [data-range-row] :is(input,button){touch-action:pan-y;}
#sc-slot-overlay [data-cell-selected]{box-shadow:inset 0 0 0 2px var(--score-cell-selection-edge);background:var(--score-cell-selection-fill);}
#sc-slot-overlay [data-cell-selected] input{caret-color:transparent!important;background:transparent!important;outline:0!important;box-shadow:none!important;}
#sc-slot-overlay .dock-strum-cell:focus{background:var(--score-cell-selection-fill);box-shadow:inset 0 0 0 2px var(--score-cell-selection-edge);outline:0;}
#sc-slot-overlay [data-cell-selected] .dock-strum-cell{background:transparent;box-shadow:none;outline:0;}
#sc-slot-overlay [data-range-row] > input{cursor:pointer;}
#sc-slot-overlay [data-cell-editing] > input:focus{cursor:text;caret-color:#202830!important;box-shadow:none;}
#sc-slot-overlay .sc-editor-playing-bar[data-preview-scope=melody] .slot-overlay-row--doremi .slot-overlay-row-body::after,
#sc-slot-overlay .sc-editor-playing-bar[data-preview-scope=chords] :is(.slot-overlay-row--chord,.slot-overlay-row--strum) .slot-overlay-row-body::after,
#sc-slot-overlay .sc-editor-playing-bar:is([data-preview-scope=all],[data-preview-scope=song]) .slot-overlay-row-body::after{content:'';position:absolute;inset:0;z-index:2;pointer-events:none;background:var(--score-fill);box-shadow:inset 0 0 0 1px var(--score-border);}
#sc-slot-overlay [data-cell-selected] input::selection{background:transparent;color:inherit;}
#sc-slot-overlay .sc-editor-transfer-cell.is-lifted{z-index:4;transform:translateY(-3px);box-shadow:0 3px 8px #33270740;cursor:grabbing;}
#sc-slot-overlay .sc-editor-cell-drag-handle{position:absolute;bottom:0;left:0;z-index:2;border:0;background:transparent;color:#536577;padding:1px 3px;font-size:12px;line-height:1;cursor:grab;}
#sc-slot-overlay .sc-editor-transfer-cell.is-drop-target{outline:2px solid var(--score-cell-selection-edge);outline-offset:-2px;}
.sc-song-dialog label:has(input[type=checkbox]){flex-direction:row;align-items:flex-start;}
.sc-song-dialog [role=status]{color:var(--studio-danger);font-size:12px;white-space:pre-line;}
.sc-song-dialog p{font-size:12px;color:var(--studio-text-secondary);}
.sc-song-dialog .sc-key-comparison{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;}.sc-key-comparison th,.sc-key-comparison td{text-align:left;padding:8px 4px;border-bottom:1px solid var(--studio-border-default);}.sc-key-comparison td:last-child{font-weight:700;color:var(--studio-accent);}.sc-song-dialog details>summary{cursor:pointer;font-size:12px;}
.sc-song-dialog[data-score-dialog=sections]{width:min(1050px,94vw);}
.sc-section-workspace{display:grid;grid-template-columns:minmax(244px,24%) minmax(0,1fr);gap:14px;}
.sc-section-flow{grid-column:1/-1;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.sc-section-flow>span{display:inline-flex;align-items:center;gap:5px;max-width:100%;}
.sc-section-flow{background:#283744;border:1px solid #425360;border-radius:8px;padding:8px;}
.sc-section-flow button[draggable]{cursor:grab;position:relative;}
.sc-section-flow button[data-drop]::after{content:'';position:absolute;inset:0 auto 0 -4px;border-left:3px solid #e7c985;}
.sc-section-flow button[data-drop=after]::after{left:auto;right:-4px;}
.sc-song-dialog .sc-section-workspace input[data-score-field]{background:#fff;color:#17191b;color-scheme:light;}
.sc-song-dialog[data-score-dialog=settings]{width:min(1120px,95vw);}
.sc-song-workspace{display:grid;grid-template-columns:minmax(215px,24%) minmax(0,1fr);gap:16px;align-items:start;}
.sc-song-workspace .sc-song-preview{max-height:65vh;overflow:auto;min-width:0;}
.sc-song-workspace aside button.sc-key-link{width:auto;background:transparent;color:var(--studio-text-secondary);border:0;text-decoration:underline;text-underline-offset:3px;padding:5px 0;font-size:.86em;}
.sc-song-workspace .sc-key-link.sc-key-entry:focus{outline:2px solid var(--studio-accent);outline-offset:3px;}
@keyframes sc-key-invitation{0%,100%{transform:translateY(0);}45%{transform:translateY(-3px);background-color:rgba(210,177,103,.2);}}
@media(prefers-reduced-motion:no-preference){.sc-song-workspace .sc-key-entry{animation:sc-key-invitation 750ms ease-out 1;}}
.sc-song-tools{box-sizing:border-box;min-width:0;margin:20px 0 0;padding:12px 16px 14px;border:1px solid var(--studio-border-default);border-radius:9px;background:rgba(130,160,184,.07);}
.sc-song-tools legend{padding:0 5px;font-weight:700;}
.sc-song-preview .sheet-section-label button{background:transparent;border:0;padding:0;color:inherit;font:inherit;cursor:pointer;}
.sc-song-tool-buttons{display:flex;flex-wrap:wrap;gap:8px;}
.sc-song-workspace aside button{width:100%;margin:3px 0;}
@media(max-width:680px){.sc-song-workspace{display:flex;flex-direction:column;}.sc-song-workspace>*{width:100%;}.sc-song-workspace .sc-song-preview{max-height:42vh;}}
.sc-section-flow button{max-width:100%;overflow-wrap:anywhere;}
.sc-section-flow button[aria-pressed=true]{border-color:#c9ae70;background:#514a37;color:white;}
.sc-section-workspace aside{align-self:stretch;display:flex;flex-direction:column;gap:12px;min-width:0;}
.sc-section-workspace .sc-song-section-list,.sc-section-command-row{display:grid;gap:6px;}
.sc-section-command-row [data-icon]::before{content:attr(data-icon) ' ';}
.sc-section-command-row{grid-template-columns:repeat(2,minmax(0,1fr));}
.sc-section-workspace aside button{margin:0;min-width:0;}
.sc-section-workspace aside fieldset{display:grid;grid-template-columns:1fr 1fr;padding:8px 10px;gap:8px;margin:0;min-width:0;border:1px solid var(--studio-border-default);border-radius:8px;}
.sc-section-workspace aside .sc-song-tools{display:block;margin-top:clamp(12px,calc(36dvh - 246px),110px);}
.sc-section-workspace aside .sc-song-tool-buttons{display:grid;}
.sc-section-workspace aside fieldset label{margin:0;align-items:center!important;}
.sc-section-workspace aside small{color:var(--studio-text-secondary);overflow-wrap:anywhere;}
.sc-section-workspace .sc-paste-source{grid-column:1/-1;}
.sc-section-workspace aside .sc-section-delete{border:1px solid #996e68;color:#efb3ae;margin-top:4px;}
#screen-sheet-cruise button.sc-page-help-trigger{display:inline-grid;place-items:center;align-self:center;flex:none;width:32px;height:32px;min-width:32px;min-height:32px;padding:0;border:1px solid var(--studio-border-default);border-radius:50%;font-size:16px;line-height:1;background:var(--studio-control);color:var(--studio-text-primary);}
.sc-page-help{box-sizing:border-box;width:min(430px,calc(100vw - 32px));max-height:84dvh;overflow:auto;padding:22px;border:1px solid var(--studio-border-default);border-radius:12px;background:var(--studio-panel);color:var(--studio-text-primary);font:inherit;box-shadow:0 16px 50px #0006;}
.sc-page-help::backdrop{background:#10182075;}.sc-page-help>header{display:flex;align-items:center;justify-content:space-between;gap:12px;}.sc-page-help h2{margin:0;font-size:18px;}.sc-page-help header button{font:inherit;padding:6px 12px;border:1px solid var(--studio-border-default);border-radius:7px;color:inherit;background:var(--studio-control);white-space:nowrap;}
.sc-page-help p,.sc-page-help dd{font-size:14px;line-height:1.65;}.sc-page-help p{margin:12px 0 16px;}.sc-page-help dl{margin:0;padding-top:4px;border-top:1px solid var(--studio-border-default);}.sc-page-help dt{margin:10px 0 2px;font-weight:700;}.sc-page-help dd{margin:0;color:var(--studio-text-secondary);}
.sc-page-help.sc-illustrated-help{width:min(660px,calc(100vw - 32px));}
.sc-illustrated-help img{display:block;max-width:100%;height:auto;margin-inline:auto;border-radius:7px;}
.sc-illustrated-help ol{padding:0;margin:14px 0;counter-reset:area;font-size:14px;line-height:1.6;}
.sc-illustrated-help li{position:relative;list-style:none;padding-left:30px;margin:8px 0;counter-increment:area;}
.sc-illustrated-help li::before{content:counter(area);position:absolute;left:0;top:0;width:22px;height:22px;display:grid;place-items:center;border-radius:50%;background:#a42b22;color:white;font-weight:bold;}
.sc-illustrated-help a{display:inline-block;color:var(--studio-text-primary);text-underline-offset:3px;padding:6px 0;}
@media screen and (min-width:800px){
 .sc-page-help:is([data-help-topic=instrument],[data-help-topic=audio])[open]{display:grid;width:min(900px,calc(100vw - 32px));grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);column-gap:20px;align-items:start;}
 .sc-page-help:is([data-help-topic=instrument],[data-help-topic=audio]) :is(header,p,a){grid-column:1/-1;}
 .sc-page-help[data-help-topic=audio] img{max-height:52dvh;width:auto;}
 .sc-page-help:is([data-help-topic=instrument],[data-help-topic=audio]) ol{margin-top:0;}
 .sc-page-help:is([data-help-topic=instrument],[data-help-topic=audio]) a{justify-self:start;margin-top:10px;}
}
#screen-sheet-cruise :is(.sc-playback-dialog header,.sc-layout-actions) button{box-sizing:border-box;height:36px;min-height:36px;padding-block:0;display:inline-flex;align-items:center;justify-content:center;}
#screen-sheet-cruise :is(.sc-playback-dialog header,.sc-layout-actions) .sc-page-help-trigger{width:36px;min-width:36px;}
@media print{.sc-page-help,.sc-page-help::backdrop,.sc-page-help-trigger{display:none!important;}}
.sc-song-dialog>header>h2,.sc-actions-dialog>header>h2{margin-right:auto;}
.sc-section-preview{max-height:70vh;overflow:auto;min-width:0;background:#18232b;}
.sc-section-preview .sheet-section-heading{display:flex;align-items:center;gap:5px;}
.sc-section-preview .sheet-section-heading button{width:auto;padding:2px 9px;min-height:26px;}
.sc-section-preview .sc-section-active{background:#d1b56c29;}
@media(max-width:620px){.sc-section-workspace{grid-template-columns:1fr;}.sc-section-preview{max-height:50vh;}}
.sc-song-dialog .sc-section-command-row button{padding:6px 4px;font-size:13px;}
.sc-section-workspace aside button:disabled{opacity:.5;}
.sc-song-dialog .sc-song-section-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:7px 0;border-bottom:1px solid var(--studio-border-default);}
.sc-song-dialog .sc-song-section-row label{flex:1 1 180px;min-width:0;margin:0;}.sc-song-section-row label>span{display:none;}

.sc-part-checks{display:flex;align-items:center;gap:10px;}
.sc-part-checks label{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;cursor:pointer;}
.sc-part-checks input[type=checkbox]{margin:0;accent-color:var(--studio-accent,#d0b77c);}
#sc-transport .sc-part-checks{border:1px solid var(--studio-border-default);border-radius:8px;padding:0 10px;}
#sc-transport .sc-part-checks label{min-height:36px;font-size:13px;}
#sc-transport .sc-parts-toggle{display:none;}
#sc-transport .sc-parts-popup{inset:auto 8px 66px auto;background:var(--studio-panel,#202a35);color:var(--studio-text-primary,#fff);border:1px solid var(--studio-border-default);border-radius:8px;padding:6px;}
#sc-transport .sc-parts-popup .sc-part-checks{border:0;}
@container score (max-width:680px){#sc-transport .sc-sound-parts{display:none;}#sc-transport .sc-parts-toggle{display:inline-flex;font-size:12px;padding:5px;}}
dialog.sc-cell-value-dialog{width:min(30rem,calc(100vw - 16px));}
.sc-cell-value-dialog>div{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:2px;}
.sc-cell-value-dialog>div label{justify-content:center;white-space:nowrap;padding:6px 0;}
.sc-cell-value-dialog>div input{margin:0;}
.sc-cell-value-dialog label{display:inline-flex;align-items:center;gap:4px;padding:5px;cursor:pointer;}
.sc-cell-value-dialog label:has(:disabled){opacity:.48;cursor:default;}
.sc-cell-value-dialog>label{margin:10px 0;}
/* One inset for single-line selects, including score dialogs mounted under body. */
:is(#screen-sheet-cruise,#sc-slot-overlay,body:has(#screen-sheet-cruise:not([hidden]):not(.hidden)) dialog) select:not(.editor-cell-value,.editor-row-resolution,[multiple]):is(:not([size]),[size="1"]){
    appearance:none;
    padding-inline-end:var(--sc-select-end,32px);
    background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);
    background-position:right calc(var(--sc-select-inset,12px) + 4px) center,right var(--sc-select-inset,12px) center;
    background-repeat:no-repeat;
    background-size:4px 4px;
}
@media(forced-colors:active){
    :is(#screen-sheet-cruise,#sc-slot-overlay,body:has(#screen-sheet-cruise:not([hidden]):not(.hidden)) dialog) select:not(.editor-cell-value,.editor-row-resolution,[multiple]):is(:not([size]),[size="1"]){appearance:auto;background-image:none;}
}
#screen-sheet-cruise .sv-sound-select{--sc-select-end:20px;--sc-select-inset:6px;}
@media print{.sc-song-dialog,.sheet-section-play,.sheet-artist--empty{display:none!important;}#sc-sheet-scale-box [data-paper-edit]:hover{outline:none;}}
`;
        document.head.appendChild(style);
    }
    function mountSheetZoom(){
        var controls=document.createElement('div');controls.id='sc-zoom-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','拡大縮小');controls.title='譜面上でピンチ、または Ctrl／⌘＋ホイールで拡大・縮小';controls.style.display='flex';controls.style.gap='8px';controls.style.alignItems='center';
        function button(id,label,change){var b=document.createElement('button');b.type='button';b.id=id;b.className='btn-ghost btn-compact';b.textContent=label;b.onclick=function(){sheetZoom=change(sheetZoom);updateSheetScale();};controls.appendChild(b);return b;}
        button('sc-zoom-out','縮小 −',function(z){return Math.max(scoreUI.MIN_SCORE_ZOOM,z-.25);});
        button('sc-zoom-reset','100%',function(){return 1;}).title='画面幅に合わせた表示へ戻す';
        button('sc-zoom-in','拡大 ＋',function(z){return Math.min(scoreUI.MAX_SCORE_ZOOM,z+.25);});
        (els.toolbar.querySelector('.sheet-toolbar-actions')||els.toolbar).appendChild(controls);
        prepareScorePlayback().then(()=>{
            updateSheetScale();
            const workspace=els.root.closest('.studio-main')||els.root;
            scoreUI?.bindScoreZoom(workspace,{
                read:()=>sheetZoom,write:value=>{sheetZoom=value;updateSheetScale();},paper:()=>els.preview,
                scrollX:()=>els.preview.parentElement,scrollY:()=>{
                    const owner=els.root.classList.contains('sc-focused')?els.root:CS().scroll?.getRoot('sheetCruise');
                    return !owner||owner===window?document.scrollingElement:owner;
                },
                enabled:event=>state.active&&(event.target===workspace||els.root.contains(event.target))&&!event.target.closest('dialog,#sc-slot-overlay,.sheet-toolbar,.sc-bottom-transport,input,select,textarea,button,details')
            });
        });
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
        if(q('sc-zoom-out'))q('sc-zoom-out').disabled=!scoreUI||sheetZoom<=scoreUI.MIN_SCORE_ZOOM;
        if(q('sc-zoom-in'))q('sc-zoom-in').disabled=!scoreUI||sheetZoom>=scoreUI.MAX_SCORE_ZOOM;
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
        if (rowId === 'doremi') return 'メロディを入力';
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
            (rowId === 'lyrics' ? '歌詞' : 'メロディ');
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

    const noteValues = [1, 2, 4, 8, 16, 32];
    const wholeNoteTicks = 1920;

    function rowEvents(bar, row) {
        if (row === 'strum') return effectiveStrumSlots(bar);
        const source = state.session.draft.bars[bar.barNumber - 1];
        return source[{chord:'chords', lyrics:'lyrics', doremi:'melody'}[row]] || [];
    }

    function editorCellRanges(bar, globalRes, row) {
        const length = CS().model.getBarLengthTicks(state.project);
        const base = rowResolution(bar, row);
        const locks = Array.from({length:length / 480}, (_, beat) => getLyricBeatLocalRes(bar, beat, row));
        const grid = state.session.draft.extensions?.scoreCellValuesV1?.[bar.sourceId];
        const saved = grid?.[row];
        const valid = Array.isArray(saved) && saved[0] === 0 &&
            saved.every((tick, i) => Number.isInteger(tick) && tick < length && (!i || tick > saved[i - 1]));
        const cuts = new Set(valid ? saved : CS().model.strumCellStarts(base, locks, length));
        const events = rowEvents(bar, row);
        const dividedStrokes = row === 'strum' && valid && grid.strumBeatGrouping === true;
        // Existing notes, rests and off-grid attacks define real boundaries, including in legacy scores.
        for (const event of events) {
            const start = event.onsetTick ?? event.tick;
            const end = start + event.durationTicks;
            if (end > start) {
                if (!dividedStrokes) for (const tick of cuts) if (tick > start && tick < end) cuts.delete(tick);
                if (end < length) cuts.add(end);
            }
        }
        for (const event of events) {
            const start = event.onsetTick ?? event.tick;
            if (start < length) cuts.add(start);
        }
        const written = row === 'doremi' && CS().sheetRenderer.writtenMelodyStarts(grid, events, length);
        const starts = written || Array.from(cuts).sort((a, b) => a - b);
        return starts.map((tick, index) => {
            const span = (starts[index + 1] ?? length) - tick, beat = Math.floor(tick / 480);
            const unit = wholeNoteTicks / span, res = noteValues.includes(unit) ? unit : 16;
            const end = tick + span;
            const boundary = end === length ? 'is-barend' : end % 480 === 0 ? 'is-beat' :
                end % 240 === 0 ? 'is-8th' : 'is-16th';
            return {tick, span, beat, res, boundary,
                previousTick:index ? starts[index - 1] : null};
        });
    }

    function noteValueTicks(value) {
        const dotted = value.endsWith('.');
        return wholeNoteTicks / parseInt(value, 10) * (dotted ? 1.5 : 1);
    }

    function cellValuePicker(trigger, initial, allowed, commit) {
        const dialog = fileDialog('マスの音価', {browse:true});
        dialog.classList.add('sc-cell-value-dialog');
        const group = document.createElement('div'), dotLabel = document.createElement('label');
        const dot = document.createElement('input'), actions = document.createElement('footer');
        dot.type = 'checkbox';
        dot.checked = initial.endsWith('.');
        dotLabel.append(dot, '付点');
        const radios = noteValues.map(unit => {
            const label = document.createElement('label'), radio = document.createElement('input');
            radio.type = 'radio'; radio.name = 'base-note'; radio.value = String(unit);
            radio.checked = unit === parseInt(initial, 10);
            label.append(radio, unit === 1 ? '全' : unit + '分');
            group.append(label);
            return radio;
        });
        const selected = () => radios.find(r => r.checked)?.value;
        const value = () => selected() + (dot.checked ? '.' : '');
        const apply = dialogButton('適用', () => {
            if (!allowed(value())) return;
            dialog.close();
            commit(value());
        }, true);
        function refresh() {
            for (const radio of radios) radio.disabled = !allowed(radio.value + (dot.checked ? '.' : ''));
            dot.disabled = !dot.checked && (!selected() || !allowed(selected() + '.'));
            apply.disabled = !selected() || !allowed(value()) || value() === initial;
        }
        actions.append(dialogButton('キャンセル', () => dialog.close()), apply);
        dialog.append(group, dotLabel, actions);
        dialog.addEventListener('change', refresh);
        dialog.addEventListener('close', () => { if (trigger.isConnected) trigger.focus({preventScroll:true}); }, {once:true});
        refresh();
        dialog.showModal();
    }

    function planNoteValue(bar, row, ranges, tick, value) {
        const span = noteValueTicks(value), length = CS().model.getBarLengthTicks(state.project);
        if (value === '1.' || value === '32.') return {error:'この音価には付点を付けられません'};
        const bulk = tick === null;
        const source = bulk ? null : ranges.find(r => r.tick === tick);
        if (bulk ? length % span : !source || tick + span > length) return {error:'小節内に収まりません'};
        const events = rowEvents(bar, row);
        const changes = new Map();
        for (const event of events) {
            const start = event.onsetTick ?? event.tick;
            if (start >= length) continue;
            if (bulk ? start % span !== 0 : start > tick && start < tick + span) return {error:'入力済みの位置を保持します'};
            if ((!bulk && start !== tick) || row === 'lyrics') continue;
            const previous = ranges.find(r => r.tick === start)?.span;
            const writtenSegment = !bulk && row === 'doremi' && state.session.draft.extensions?.scoreCellValuesV1?.[bar.sourceId]?.melodyBeatGrouping === true;
            if (previous === span && (writtenSegment || event.durationTicks == null || event.durationTicks === span)) continue;
            if (event.tieToNext) return {error:'次の小節へのタイを保持します'};
            changes.set(start, span);
        }
        let starts;
        if (bulk) starts = Array.from({length:length / span}, (_, i) => i * span);
        else {
            const cuts = new Set(ranges.map(r => r.tick));
            for (const cut of cuts) if (cut > tick && cut < tick + span) cuts.delete(cut);
            for (let cut = tick + span; cut < tick + source.span; cut += span) cuts.add(cut);
            if (tick + span < length) cuts.add(tick + span);
            starts = Array.from(cuts).sort((a, b) => a - b);
        }
        return {starts, changes};
    }

    function resizeStrumEvents(project, barId, changes, length) {
        const bindings = project.performance.barRhythms;
        const binding = bindings.find(b => b.barId === barId);
        const id = binding?.materialId || project.performance.basicRhythmId;
        const materials = project.materials.rhythms;
        const index = materials.findIndex(m => m.id === id);
        const material = JSON.parse(JSON.stringify(materials[index]));
        const shared = project.performance.basicRhythmId === id || bindings.some(b => b.barId !== barId && b.materialId === id);
        const newId = CS().model.schema2.newId;
        if (shared) {
            material.id = newId();
            material.provenance = {origin:'user-set'};
        }
        for (const slot of material.snapshot.slots) {
            if (shared) slot.id = newId();
            if (changes.has(slot.tick)) slot.durationTicks = changes.get(slot.tick);
        }
        if (material.snapshot.lengthTicks < length) {
            material.snapshot.lengthTicks = length;
            delete material.snapshot.inputGrid;
            delete material.snapshot.cellStarts;
        }
        if (!shared) materials[index] = material;
        else {
            materials.push(material);
            if (binding) binding.materialId = material.id;
            else bindings.push({id:newId(), barId, materialId:material.id});
        }
    }

    function noteValueControl(bar, row, range, {ranges, targets = [bar], cell} = {}) {
        const owner = state.session, bulk = !range;
        const length = CS().model.getBarLengthTicks(state.project);
        const select = document.createElement(bulk ? 'select' : 'button');
        const values = new Set(bulk ? ranges.map(r => r.span) : [range.span]);
        const span = values.size === 1 ? values.values().next().value : 0;
        const unit = wholeNoteTicks / span;
        const dotted = noteValues.find(v => noteValueTicks(v + '.') === span);
        const current = noteValues.includes(unit) ? String(unit) : dotted ? dotted + '.' : '';
        let label = current.replace('.', '·') || '混在';
        if (!current && span) {
            let a = wholeNoteTicks, b = span;
            while (b) [a,b] = [b,a%b];
            label = (span/a) + '/' + (wholeNoteTicks/a);
            select.dataset.unusualValue = '';
        }
        const position = range?.tick ?? null;
        const planFor = (target,value) => planNoteValue(target,row,editorCellRanges(target,null,row),position,value);
        const allowed = value => targets.every(target => !planFor(target,value).error);
        select.title = (targets.length>1 ? bar.barNumber+'〜'+targets.at(-1).barNumber : bar.barNumber) + '小節目・' + DOCK_ROW_LABELS[row] + (bulk ? '行の音価をそろえる' : '・このマスの音価');
        select.setAttribute('aria-label', select.title);
        if (bulk) {
            select.className = 'editor-row-resolution';
            select.dataset.rowResolution = row;
            if (!noteValues.includes(unit)) select.add(new Option(label, current));
            for (const value of noteValues) select.add(new Option(String(value),String(value)));
            select.value = current;
            const refresh = () => {
                for (const option of select.options) option.disabled = !noteValues.includes(Number(option.value)) || !allowed(option.value);
            };
            select.addEventListener('focus', refresh);
            select.addEventListener('pointerdown', refresh);
            select.addEventListener('change', () => {
                const value = select.value;
                select.value = current;
                commit(value);
            });
            if (row === 'strum' && targets.some(target=>CS().model.rhythmForBar(state.project,target.barNumber)?.encoding === 'rhythm-owner-cells-v1')) select.disabled = true;
        } else {
            select.type = 'button';
            select.className = 'editor-cell-value';
            select.dataset.cellValue = position;
            select.textContent = label;
            select.setAttribute('aria-haspopup','dialog');
            select.addEventListener('click', e => {
                e.stopPropagation();
                if (editorCanMove()) cellValuePicker(select, current, allowed, commit);
            });
            // WebKit may send the first marked character before the physical keydown.
            let marked = null;
            cell.addEventListener('compositionstart', e => {
                marked = { field:e.target, before:e.target.value, updates:0 };
            }, true);
            cell.addEventListener('compositionupdate', e => {
                if (marked) { marked.text = e.data; marked.updates++; }
            }, true);
            cell.addEventListener('compositionend', () => {
                if (marked?.shortcut) marked.field.value = marked.before;
                marked = null;
            }, true);
            cell.addEventListener('keydown', event => {
                if (event.metaKey || event.ctrlKey || event.altKey) return;
                const shorter = event.shiftKey && (event.key === '+' || event.code === 'NumpadAdd' || event.key === 'Process' && ['Equal','Semicolon'].includes(event.code));
                const longer = event.shiftKey && (event.code === 'Minus' || event.key === '-' || event.code === 'NumpadSubtract');
                const toggleDot = !event.shiftKey && (event.key === '.' || event.code === 'Period' || event.code === 'NumpadDecimal');
                if (!shorter && !longer && !toggleDot) return;
                const markedShortcut = marked?.field === event.target && marked.updates === 1 &&
                    (shorter ? /^[+＋]$/ : longer ? /^[-_=ー＿＝−]$/ : /^[.。．]$/).test(marked.text);
                if (!markedShortcut && (event.isComposing || CS().shellHost.keyboard.isIMEBlocked({}) || owner.inputPending)) return;
                event.preventDefault();
                event.stopPropagation();
                const changeValue = () => applyShortcut(event, shorter, longer, toggleDot, markedShortcut);
                if (markedShortcut) {
                    marked.shortcut = true;
                    event.target.value = marked.before;
                    select.focus({preventScroll:true});
                    // compositionend clears the shared IME guard in the next task.
                    window.setTimeout(() => {
                        if (document.activeElement === select && state.session === owner) changeValue();
                    }, 0);
                } else changeValue();
            }, true);
            function applyShortcut(event, shorter, longer, toggleDot, markedShortcut) {
                if (!select.isConnected || select.disabled || !editorCanMove() || !prepareLyricResolutionChange(bar).ok) return;
                let value;
                if (toggleDot && current) value = current.endsWith('.') ? current.slice(0,-1) : current + '.';
                if (shorter || longer) {
                    const dot = current.endsWith('.') ? '.' : '';
                    const next = (shorter ? noteValues : [...noteValues].reverse()).map(n => String(n) + (n===1 || n===32 ? '' : dot))
                        .find(v => shorter ? noteValueTicks(v) < span : noteValueTicks(v) > span);
                    value = next;
                }
                const wasButton = event.target === select;
                // A native IME can still deliver marked text after a canceled 229 keydown.
                // Keep focus on a non-text control until that key has been processed.
                const imeStart = !markedShortcut && !wasButton && event.keyCode === 229;
                const originalInput = imeStart && event.target.matches('input:not([readonly])') ? event.target : null;
                if (originalInput) originalInput.readOnly = true;
                if (imeStart) select.focus({preventScroll:true});
                if (value && allowed(value)) commit(value);
                const group = els.slotOverlay.querySelector('.editor-measure[data-bar-number="'+bar.barNumber+'"] .slot-overlay-row--'+row);
                const button = group?.querySelector('[data-cell-value="'+position+'"]');
                const focus = wasButton ? button : button?.parentElement.querySelector('[data-slot-tick]');
                if (imeStart && button) {
                    button.focus({preventScroll:true});
                    const release = new AbortController();
                    function finishKey() {
                        release.abort();
                        if (originalInput) originalInput.readOnly = false;
                    }
                    window.addEventListener('blur', finishKey, {once:true,signal:release.signal});
                    window.addEventListener('pointerdown', finishKey, {capture:true,once:true,signal:release.signal});
                    window.addEventListener('keyup', up => {
                        if (up.code !== event.code) return;
                        finishKey();
                        if (document.activeElement === button)
                            queueEditorFrame(() => focus?.focus({preventScroll:true}));
                    }, {capture:true,signal:release.signal});
                } else focus?.focus({preventScroll:true});
            }
            select.addEventListener('keydown', e => {
                if (e.isComposing || e.altKey || e.metaKey || e.ctrlKey || !['ArrowDown','ArrowUp'].includes(e.key)) return;
                e.preventDefault(); e.stopPropagation();
                const choices = e.key === 'ArrowDown' ? noteValues : [...noteValues].reverse();
                const next = choices.find(v => (e.key === 'ArrowDown' ? v > unit : v < unit) && allowed(String(v)));
                if (next) commit(String(next));
            });
        }
        select.addEventListener('pointerdown', e => {
            e.stopPropagation();
            if (!prepareLyricResolutionChange(getSelectedBar() || bar).ok) e.preventDefault();
        });
        if (owner.draft.schemaVersion !== 2) select.disabled = true;
        function commit(value) {
            if (!select.isConnected || state.session !== owner || !editorCanMove()) return;
            finishTextInputs();
            const edits = targets.map(target=>({target,plan:planFor(target,value)}));
            if (edits.some(edit=>edit.plan.error)) return;
            const changed = edits.reduce((n,edit)=>n+edit.plan.changes.size,0);
            const frame = contentFrame();
            function apply() {
                if (!select.isConnected || state.session !== owner || !currentFrame(frame) || !editorCanMove()) return;
                stopPianoAudition();
                const result = owner.runOperation(DOCK_ROW_LABELS[row] + 'の音価を変更', project => {
                    for (const {target,plan} of edits) {
                        const source = project.bars[target.barNumber - 1];
                        if (source.id !== target.sourceId) throw Error('対象の小節が変わりました');
                        project.extensions ||= {};
                        const grids = project.extensions.scoreCellValuesV1 || {};
                        project.extensions.scoreCellValuesV1 = {...grids, [source.id]:{...grids[source.id], [row]:plan.starts}};
                        if (row === 'strum' && plan.changes.size) resizeStrumEvents(project, source.id, plan.changes, length);
                        if (row === 'chord' || row === 'doremi') {
                            for (const event of source[row === 'chord' ? 'chords' : 'melody']) {
                                if (!plan.changes.has(event.onsetTick)) continue;
                                event.durationTicks = plan.changes.get(event.onsetTick);
                                if (row === 'doremi') event.provenance.timing.duration = {origin:'user-set', confirmed:true};
                            }
                        }
                    }
                });
                if (result.ok) redrawSession(false);
                else setSaveStatus(result.error, true);
            }
            if (bulk && changed) {
                const dialog = fileDialog('行の音価をそろえる'), message = document.createElement('p'), actions = document.createElement('footer');
                message.textContent = (targets.length>1 ? bar.barNumber+'〜'+targets.at(-1).barNumber : bar.barNumber) + '小節目の' + DOCK_ROW_LABELS[row] + 'で、入力済みの' + changed + '箇所の長さを変更します。';
                actions.append(dialogButton('キャンセル', () => dialog.close()), dialogButton('適用', () => {dialog.close(); apply();}, true));
                dialog.append(message, actions);
                dialog.showModal();
            } else apply();
        }
        return select;
    }

    function editorBeatGroups(wrap,bar,globalRes,rowId,ranges){
        wrap.classList.add('beat-groups');
        var groups=[];
        Array.from(new Set(ranges.map(function(r){return r.beat;}))).forEach(function(beat){
            var items=ranges.filter(function(r){return r.beat===beat;}),span=items.reduce(function(n,r){return n+r.span;},0);
            var group=document.createElement('div');group.className='beat-group dock-lyrics-beat-group';group.dataset.beatIndex=beat;group.style.flex=span+' 1 0px';
            var cells=document.createElement('div');cells.className='dock-lyrics-beat-cells';cells.style.gridTemplateColumns=items.map(r=>'minmax(0,'+r.span+'fr)').join(' ');group.appendChild(cells);
            wrap.appendChild(group);groups[beat]=cells;
        });
        return groups;
    }

    function cellDoremiText(events,span,project){
        if(events.length===1 && events[0].kind==='note' && events[0].durationTicks===span)return pianoToken(events[0].pitch,project);
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
        function setMix(value){Object.keys(mix).forEach(function(key){var n=value?.[key];mix[key]=typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100?n:100;});mixBuses.forEach(function(buses,ctx){Object.keys(buses).forEach(function(key){var param=buses[key].gain,value=key==='clickGate'?(options.isMetronomeEnabled?.()===false?0:1):mix[key]/100;if(param.setTargetAtTime)param.setTargetAtTime(value,ctx.currentTime,.015);else param.setValueAtTime(value,ctx.currentTime);});});voice?.refreshClicks?.();}
        function outputFor(ctx,part){var key=part==='piano'?'melody':['click','count'].includes(part)?'metronome':'chords',buses=mixBuses.get(ctx);if(!buses){buses={};mixBuses.set(ctx,buses);}if(!buses[key]){var gain=ctx.createGain();gain.gain.setValueAtTime(mix[key]/100,ctx.currentTime);gain.connect(ctx.destination);buses[key]=gain;}if(part==='click'&&options.isMetronomeEnabled){if(!buses.clickGate){var gate=ctx.createGain();gate.gain.setValueAtTime(options.isMetronomeEnabled()?1:0,ctx.currentTime);gate.connect(buses[key]);buses.clickGate=gate;}return buses.clickGate;}return buses[key];}
        setMix(options.mix);
        function notify(phase){try{if(options.onState)options.onState(phase,mode);}catch(_){}}
        function register(){if(!handle)handle=audio.register({sessionId:options.sessionId||'studio.sheet.solfege-audition',ownerFeatureId:'sheetCruise',cleanup:cleanup,notify:function(){void stop();}});}
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
        async function playEvents(events,isCurrent,holdSeconds,streaming,loopPeriod,preRoll,startOffset){
            startOffset=startOffset===undefined?0:startOffset;if(!Number.isFinite(startOffset)||startOffset<0||startOffset&&(preRoll||!streaming||startOffset>=holdSeconds))return {ok:false};
            var lead=preRoll?.duration||0,countEvents=preRoll?.events||[];
            if(preRoll&&(!streaming||!Number.isFinite(lead)||lead<=0||lead>12||!Array.isArray(countEvents)||![3,4].includes(countEvents.length)||!countEvents.every(function(e){return e.part==='count'&&[72,84].includes(e.midi)&&Number.isFinite(e.start)&&e.start>=0&&Number.isFinite(e.duration)&&e.duration>0&&e.start+e.duration<=lead+.03&&Number.isFinite(e.gain)&&e.gain>0&&e.gain<=.2;})))return {ok:false};
            if(loopPeriod!==undefined&&(!streaming||!Number.isFinite(loopPeriod)||loopPeriod<=0||loopPeriod>holdSeconds))return {ok:false};
            if(holdSeconds!==undefined&&(!Number.isFinite(holdSeconds)||holdSeconds<=0||holdSeconds>(streaming?122881:61)))return {ok:false};
            if(!Array.isArray(events)||(!events.length&&!holdSeconds)||events.length>(streaming?524288:256)||!events.every(function(e){return Number.isInteger(e.midi)&&e.midi>=21&&e.midi<=108&&['piano','guitar','mute','click'].includes(e.part)&&Number.isFinite(e.start)&&e.start>=0&&Number.isFinite(e.duration)&&e.duration>0&&(streaming||e.duration<=61)&&e.start+e.duration<=(streaming?holdSeconds+.01:61)&&Number.isFinite(e.gain)&&e.gain>0&&e.gain<=.45;})||!isCurrent())return {ok:false};
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
                var now=ctx.currentTime-startOffset,current={nodes:new Set(),remaining:events.length,startedAt:now,duration:holdSeconds||0,cursor:0,cycle:0};voice=current;
                function finish(){if(voice!==current||token!==epoch)return;cancelTimers();silence();idle(ctx,token);}
                var silentClicks=[];
                function refreshClicks(){var pending=silentClicks;silentClicks=[];for(var skipped of pending)if(now+lead+skipped.offset+skipped.event.start>=ctx.currentTime+.005){if(options.isMetronomeEnabled?.()===false)silentClicks.push(skipped);else schedule(skipped.event,skipped.offset);}}current.refreshClicks=refreshClicks;
                function schedule(e,offset){
                    if(e.part==='click'&&options.isMetronomeEnabled?.()===false){silentClicks.push({event:e,offset:offset||0});return;}
                    if(current.nodes.size>=2048)throw Error('同時に鳴らす音が多すぎるため停止しました');
                    var sample=['click','count'].includes(e.part)&&options.metronomeSample?options.metronomeSample(ctx,e.midi):samples.get(e.part+':'+e.midi),osc=ctx.createBufferSource(),gain=ctx.createGain(),rate=Math.pow(2,(e.midi-sample.midi)/12),start=now+(e.part==='count'?0:lead)+(offset||0)+e.start;
                    if (e.part === 'guitar' || e.part === 'mute') start = Math.max(now + startOffset, start - scoreUI.GUITAR_LEAD_SECONDS);
                    // Use the same output frame for a pick position reached through different bar offsets.
                    if(e.part==='guitar' && ctx.sampleRate)start=Math.round(start*ctx.sampleRate)/ctx.sampleRate;
                    var duration=Math.min(e.duration,sample.buffer.duration/rate),release=e.part==='guitar'?Math.min(e.release||.045,duration*.3):Math.min(.35,duration*.35);
                    osc.buffer=sample.buffer;osc.playbackRate.setValueAtTime(rate,start);
                    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(e.gain,start+Math.min(.005,duration/4));gain.gain.setValueAtTime(e.gain,start+duration-release);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
                    osc.connect(gain);gain.connect(outputFor(ctx,e.part));var node={osc:osc,gain:gain};current.nodes.add(node);
                    osc.onended=function(){if(voice!==current||token!==epoch)return;osc.onended=null;osc.disconnect();gain.disconnect();current.nodes.delete(node);if(!holdSeconds&&--current.remaining===0)finish();};
                    osc.start(start);osc.stop(start+duration);
                }
                countEvents.forEach(function(e){schedule(e,0);});
                if(streaming){
                    if(startOffset){
                        var entry=startOffset+.03;
                        events.filter(function(e){return e.part==='piano'&&e.tieStarts?.length&&e.start<startOffset&&e.start+e.duration>entry;})
                            .forEach(function(e){schedule({...e,start:entry,duration:e.start+e.duration-entry},0);});
                    }
                    events=events.slice().sort(function(a,b){return a.start-b.start;});while(current.cursor<events.length&&events[current.cursor].start<startOffset)current.cursor++;
                    function pump(){
                        pumpTimer=null;if(token!==epoch||voice!==current)return;
                        if(!isCurrent()||!audio.isLeaseCurrent(handle,next)){void stop();return;}
                        if(!loopPeriod&&ctx.currentTime>=now+lead+holdSeconds){finish();return;}
                        try{refreshClicks();while(events.length){
                            if(current.cursor===events.length){if(!loopPeriod)break;current.cursor=0;current.cycle++;}
                            var event=events[current.cursor],offset=current.cycle*(loopPeriod||0),start=now+lead+offset+event.start;
                            if(start>ctx.currentTime+1)break;
                            if(start<ctx.currentTime-.05){if(event.part==='click'&&options.isMetronomeEnabled?.()===false){current.cursor++;continue;}throw Error('再生が中断されたため停止しました');}
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
        return {dispose:function(){return handle?audio.disposeSession(handle):Promise.resolve({ok:true});},play:play,playEvents:playEvents,setMix:setMix,cancel:cancel,stop:stop,snapshot:function(){return {playing:!!voice,mode:mode,elapsedSeconds:voice&&context?Math.max(0,context.currentTime-voice.startedAt):0,visualElapsedSeconds:voice&&context?Math.max(0,(options.outputTime?options.outputTime(context):context.currentTime)-voice.startedAt):0,contextCount:contexts.size,error:error};}};
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
            pending=ctx.decodeAudioData(bytes.buffer).then(function(buffer){return {buffer:scoreUI?.trimSampleAttack?scoreUI.trimSampleAttack(ctx,buffer):buffer,midi:sample.midi};}).catch(function(e){pianoDecoded.delete(key);throw e;});
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
        var root=els.root.classList.contains('sc-focused')?els.root:CS().scroll?.getRoot('sheetCruise')||window;
        function position(){return root===window?{x:window.scrollX,y:window.scrollY}:{x:root.scrollLeft,y:root.scrollTop};}
        var follow={root:root,transport:q('sc-transport'),expected:position(),lastBar:null,pausedBar:null};
        function pause(){follow.pausedBar=previewLastBar;}
        function onScroll(){var p=position();if(Math.abs(p.x-follow.expected.x)>1||Math.abs(p.y-follow.expected.y)>1)pause();}
        function onKey(e){if(['PageUp','PageDown','Home','End','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)&&!e.target.closest('input,textarea,select,[contenteditable],button,[role="button"]'))pause();}
        root.addEventListener('scroll',onScroll,{passive:true});root.addEventListener('wheel',pause,{passive:true});root.addEventListener('touchstart',pause,{passive:true});root.addEventListener('keydown',onKey);
        follow.position=position;follow.dispose=function(){root.removeEventListener('scroll',onScroll);root.removeEventListener('wheel',pause);root.removeEventListener('touchstart',pause);root.removeEventListener('keydown',onKey);};playbackFollow=follow;
    }
    function followPlaybackBar(paper,number,box){
        var follow=playbackFollow,now=performance.now()/1000;if(!follow||!paper)return;if(formDialog||playbackSettings?.isOpen||follow.pausedBar===number){follow.lastTime=now;return;}follow.pausedBar=null;follow.lastBar=number;
        var dt=Math.min(.032,Math.max(0,now-(follow.lastTime??now-1/60)));follow.lastTime=now;
        var root=follow.root,area=root===window?{top:0,bottom:innerHeight,left:0,right:innerWidth}:root.getBoundingClientRect(),toolbar=els.toolbar?.getBoundingClientRect();
        var top=Math.max(0,area.top,toolbar&&toolbar.bottom>area.top&&toolbar.top<area.bottom?toolbar.bottom:0)+16,bottom=Math.min(innerHeight,area.bottom)-16,left=Math.max(0,area.left)+16,right=Math.min(innerWidth,area.right)-16;
        const transport=follow.transport?.getBoundingClientRect();
        if(transport?.height&&transport.top>top)bottom=Math.min(bottom,transport.top-16);
        var dy=box.top-scoreUI.playbackRowTop(top,bottom,box.height),dx=box.left<left?box.left-left:box.right>right?box.right-right:0;
        var beat=previewSecondsPerTick*480,alpha=1-Math.exp(-dt/Math.max(.08,Math.min(.5,beat*.45)));
        function step(delta){var limit=Math.max(20,bottom-top)*dt/Math.max(.1,beat*.7);return Math.abs(delta)<.75?delta:Math.max(-limit,Math.min(limit,delta*alpha));}
        // Fractional relative scrolls can accumulate a visible offset at Safari page zoom.
        // Anchor each move to the scroll owner's current absolute position.
        var current=follow.position();
        var nextX=dx ? Math.round(current.x+step(dx)) : current.x;
        var nextY=dy ? Math.round(current.y+step(dy)) : current.y;
        if(nextX!==current.x||nextY!==current.y){
            root.scrollTo({top:nextY,left:nextX,behavior:'instant'});
            follow.expected=follow.position();
        }
    }

    function clearPlayhead(){
        endPlaybackFollow();
        playingPaperBar=null;
        if(previewRAF!==null)cancelAnimationFrame(previewRAF);previewRAF=null;
        els.scaleBox?.classList.remove('sc-score-playing','sc-range-playing');
        playingEditorMeasure?.classList.remove('sc-editor-playing-bar');
        playingEditorMeasure=null;
        [els.slotOverlay,els.scaleBox].forEach(function(root){if(!root)return;root.querySelectorAll('.sc-playing-bar').forEach(function(e){e.classList.remove('sc-playing-bar');});root.querySelectorAll('.sc-playing-cell,.sc-playing-note').forEach(function(e){e.classList.remove('sc-playing-cell','sc-playing-note');});root.querySelectorAll('[data-score-playhead],[data-playback-band]').forEach(function(e){e.remove();});});
    }
    function updateBarPlayButton(){
        refreshPracticeTransport();var label=songPlaybackTarget(),target=q('sc-song-target');if(target&&target.textContent!==label)target.textContent=label;
        var whole=q('sc-song-preview');if(whole){var active=barPreviewPhase!=='idle'&&barPreviewScope==='song';whole.textContent=active?'■ 停止':'▶ 再生';whole.setAttribute('aria-label',active?'停止':'再生');whole.title=(active?'再生を停止':!state.session?.draft.bars.length?label:label+'再生')+'（Spaceで再生／停止）';whole.setAttribute('aria-pressed',String(active));whole.setAttribute('aria-busy',String(active&&barPreviewPhase==='loading'));}
        var position=q('sc-song-position');if(position&&(barPreviewPhase==='idle'||barPreviewScope!=='song'))position.textContent='';
        playbackSettings?.refresh();chordPreviewListeners.forEach(function(listener){listener();});
        if(!els.slotOverlay)return;
        els.slotOverlay.querySelectorAll('[data-bar-preview],[data-melody-preview]').forEach(function(button){var scope=button.hasAttribute('data-melody-preview')?'melody':'all',active=barPreviewPhase!=='idle'&&barPreviewScope===scope;button.textContent=active?(barPreviewPhase==='loading'?'■ 準備中':'■ 停止'):scope==='melody'?'▶ メロディ':'▶ 再生';button.setAttribute('aria-pressed',String(active));});
    }
    function followingSpan(span){
        if(!span)return null;
        return previewSpans[previewSpans.indexOf(span)+1]||(previewLoopPeriod?previewSpans[0]:null);
    }
    // Beat groups use equal-width cells within each beat, even when neighboring
    // beats have a different subdivision or the editor is zoomed.
    function editorBeatGeometry(measure,tick,root,sx,sy,maxWidth){
        if(!measure)return null;
        var group,upper=Infinity,lower=-Infinity;
        for(var body of measure.querySelectorAll('.slot-overlay-row-body:not([hidden])')){
            var rect=body.getBoundingClientRect();
            if(!rect.width||!rect.height)continue;
            upper=Math.min(upper,rect.top);lower=Math.max(lower,rect.bottom);
            if(group)continue;
            for(var field of body.querySelectorAll('[data-range-row] > [data-slot-tick]')){
                var start=Number(field.dataset.slotTick);
                if(tick>=start && tick<start+Number(field.dataset.slotTicks)){
                    group=field.closest('.dock-lyrics-beat-cells')||field.parentElement;
                    break;
                }
            }
        }
        if(!group)return null;
        var fields=group.querySelectorAll('[data-slot-tick]'),first=fields[0],last=fields[fields.length-1];
        var startTick=Number(first.dataset.slotTick),endTick=Number(last.dataset.slotTick)+Number(last.dataset.slotTicks);
        var left=(first.parentElement.getBoundingClientRect().left-root.left)/sx;
        var right=(last.parentElement.getBoundingClientRect().right-root.left)/sx;
        return {segment:group,left:left,width:Math.max(0,Math.min(right,maxWidth)-left),y:(upper-root.top)/sy,
            height:(lower-upper)/sy,seconds:(endTick-startTick)*previewSecondsPerTick,
            startTick:startTick,endTick:endTick,fraction:(tick-startTick)/(endTick-startTick)};
    }
    function paintEditorPlayback(number,tick,barTicks,span) {
        var measure=els.slotOverlay.querySelector('.editor-measure[data-bar-number="'+number+'"]');
        var measures=measure?.closest('.editor-measures');
        if(measure!==playingEditorMeasure){
            playingEditorMeasure?.classList.remove('sc-editor-playing-bar');
            playingEditorMeasure=measure;
            if(measure){
                measure.dataset.previewScope=barPreviewScope;
                measure.classList.add('sc-editor-playing-bar');
            }
        }
        if(!measures){previewEditorCursor?.remove();return;}
        var root=measures.getBoundingClientRect(),sx=root.width/measures.offsetWidth||1,sy=root.height/measures.offsetHeight||1;
        var boundsAt=(m,t)=>editorBeatGeometry(m,t,root,sx,sy,measures.clientWidth-2);
        var beat=boundsAt(measure,tick);
        if(!beat){previewEditorCursor?.remove();return;}
        if(!previewEditorCursor){
            previewEditorCursor=document.createElement('span');
            previewEditorCursor.dataset.scorePlayhead='';
            previewEditorCursor.setAttribute('aria-hidden','true');
        }
        previewEditorCursor.dataset.playheadBar=number;
        scoreUI.movePlayhead(previewEditorCursor,measures,{...beat,nextSegment:function(){
            if(beat.endTick<barTicks)return boundsAt(measure,beat.endTick);
            var next=followingSpan(span);
            return next && boundsAt(measures.querySelector('.editor-measure[data-bar-number="'+(next.index+1)+'"]'),0);
        }});
        var viewport=measures.parentElement,overflow=viewport.scrollWidth-viewport.clientWidth;
        if(overflow>0){
            var first=Number(measures.firstElementChild.dataset.barNumber);
            var progress=(number-first+tick/barTicks)/Number(measures.dataset.count);
            viewport.scrollLeft=overflow*progress;
        }
    }
    var previewLoopPeriod=0,previewCountIn=null,countInEnabled=false,metronomeEnabled=true,playbackNotice=null,practiceBpm=null,practiceOwner=null,editorRepeat=false,autoRangeRepeat=false,lastAutoRange='',previewRangeActive=false,syncSoundParts=null,scoreFullscreen=null,practiceRestart=0,practicePending=null,previewStartOffset=0;
    function paintPlayhead(){
        previewRAF=null;if(barPreviewPhase!=='playing'||!pianoAudition)return;
        if(!currentFrame(previewFrame)||!state.active||document.hidden){stopPianoAudition();return;}
        var sample=pianoAudition.snapshot(),elapsed=Math.max(0,(sample.visualElapsedSeconds??sample.elapsedSeconds)-.03-playbackVisualDelay/1000);
        if(previewCountIn&&elapsed<previewCountIn.duration){var countPosition=q('sc-song-position');if(countPosition)countPosition.textContent='カウント '+Math.min(previewCountIn.beats,Math.floor(elapsed/previewCountIn.beatSeconds)+1)+' / '+previewCountIn.beats;previewRAF=requestAnimationFrame(paintPlayhead);return;}
        elapsed=Math.max(previewStartOffset,elapsed-(previewCountIn?.duration||0));if(previewLoopPeriod)elapsed%=previewLoopPeriod;var span=previewSpans?(previewSpans.find(function(s){return elapsed<s.end;})||previewSpans[previewSpans.length-1]):null;
        var barTicks=getBeats(state.project)*480;
        var number=span?span.index+1:state.selectedBarNumber,tick=Math.min(barTicks-.001,Math.max(0,(elapsed-(span?span.start:0))/previewSecondsPerTick));
        previewLastBar=number;
        els.slotOverlay.dataset.playbackTick=String(tick);els.slotOverlay.dataset.playbackBar=number;
        var position=q('sc-song-position');if(position&&barPreviewScope==='song'){const label=number+' / '+state.session.draft.bars.length+'小節'+(previewLoopPeriod?'（範囲ループ）':'');if(position.textContent!==label)position.textContent=label;}

        if(!els.slotOverlay.classList.contains('hidden'))paintEditorPlayback(number,tick,barTicks,span);
        var paper=playingPaperBar?.isConnected && Number(playingPaperBar.dataset.barNumber)===number
            ?playingPaperBar:els.scaleBox.querySelector('.sheet-bar[data-bar-number="'+number+'"]');
        if(playingPaperBar!==paper){
            els.scaleBox.classList.add('sc-score-playing');els.scaleBox.classList.toggle('sc-range-playing',barPreviewScope==='song'&&(!!previewLoopPeriod||previewRangeActive));
            playingPaperBar?.classList.remove('sc-playing-bar');
            paper?.classList.add('sc-playing-bar');
            playingPaperBar=paper;
        }
        if(paper){
            if(!previewPaperCursor){
                previewPaperCursor=document.createElement('span');
                previewPaperCursor.dataset.scorePlayhead='';
                previewPaperCursor.setAttribute('aria-hidden','true');
            }
            if(previewPaperCursor.dataset.playheadBar!==String(number))previewPaperCursor.dataset.playheadBar=number;
            var barRect=paper.getBoundingClientRect();
            scoreUI.movePaperPlayhead(previewPaperCursor,els.scaleBox,paper,barRect,{
                fraction:tick/barTicks,seconds:barTicks*previewSecondsPerTick,nextBar:function(){
                    var next=followingSpan(span);
                    return next && getSheetBarByNumber(next.index+1);
                }});
            if(barPreviewScope==='song')followPlaybackBar(paper,number,barRect);
        }
        previewRAF=requestAnimationFrame(paintPlayhead);
    }
    function ensureAudition(){
        if(!pianoAudition)pianoAudition=createPianoAudition({coordinator:CS().audio,mix:audibleMix(),isMetronomeEnabled:function(){return metronomeEnabled;},metronomeSample:function(ctx,midi){return scoreUI.metronomeSample(ctx,midi,metronomeSound);},outputTime:function(ctx){return scoreUI?.outputContextTime?scoreUI.outputContextTime(ctx,performance.now()):ctx.currentTime;},createContext:function(){return new (window.AudioContext||window.webkitAudioContext)();},setTimer:window.setTimeout.bind(window),clearTimer:window.clearTimeout.bind(window),loadSample:loadPianoSample,onError:function(message){if(currentFrame(previewFrame))previewMessage(message);},onState:function(phase,mode){var stopped=phase==='idle'&&barPreviewPhase==='playing'&&barPreviewScope==='song'&&previewSelectOnStop&&!previewLoopPeriod&&!previewRangeActive&&currentFrame(previewFrame)&&state.active?previewLastBar:null;barPreviewPhase=['bar','song'].includes(mode)?phase:'idle';if(phase==='idle'){previewSelectOnStop=false;clearPlaybackNotice();}updateBarPlayButton();clearPlayhead();if(stopped)selectStoppedPlaybackBar(stopped);if(barPreviewPhase==='playing'){beginPlaybackFollow();previewRAF=requestAnimationFrame(paintPlayhead);}else if(els.slotOverlay){delete els.slotOverlay.dataset.playbackTick;delete els.slotOverlay.dataset.playbackBar;}}});
        return pianoAudition;
    }
    // Preload on workspace activation; never await an import inside the audio gesture.
    var scorePlayback=null,scoreUI=null,scorePlaybackPending=null;
    function prepareScorePlayback(){
        if(!scorePlaybackPending)scorePlaybackPending=Promise.all([import('./score-playback.mjs?v=0.204.0-dev.1'),import('../score-ui.mjs?v=0.204.0-dev.1')]).then(function(modules){scorePlayback=modules[0];scoreUI=modules[1];if(els.root){scoreUI.applyScoreTheme(els.root,CS().localPaperLayout?.value.appearance.interaction);if(els.slotOverlay)scoreUI.applyScoreTheme(els.slotOverlay,CS().localPaperLayout?.value.appearance.interaction);scoreUI.installScoreUI(document);var audio=q('sc-playback-settings');if(audio)scoreUI.styleAudioButton(audio);mountPracticeTransport();if(!scoreFullscreen){scoreFullscreen=scoreUI.mountScoreFullscreen(els.root,q('sc-toolbar-head-actions'),{className:'sc-focused',attribute:'scoreFullscreen',openSettings:()=>q('sc-paper-settings')?.click()});scoreFullscreen.button.id='sc-fullscreen';els.root.addEventListener('scorefullscreenchange',function(){if(barPreviewPhase==='playing')beginPlaybackFollow();});const fullscreenCommand=q('sc-menu-fullscreen');if(fullscreenCommand)fullscreenCommand.disabled=false;}}return scorePlayback;}).catch(function(){scorePlaybackPending=null;});return scorePlaybackPending;
    }
    function refreshPracticeTransport(){
        if(practiceOwner!==state.session){practiceOwner=state.session;var saved=CS().storage.getAppSetting('scorePracticeBpmV1'),tempo=saved?.[state.session?.draft.projectId];practiceBpm=typeof tempo==='number'&&Number.isFinite(tempo)&&tempo>=20&&tempo<=400?tempo:null;editorRepeat=false;autoRangeRepeat=false;lastAutoRange='';}
        var range=selectedBarIds.length>1?selectedBarIds.join(','):'';
        if(range!==lastAutoRange){if(range){editorRepeat=true;autoRangeRepeat=true;}else if(autoRangeRepeat){editorRepeat=false;autoRangeRepeat=false;}lastAutoRange=range;}
        var input=q('sc-practice-tempo'),repeat=q('sc-repeat'),eligible=!!state.session&&state.active&&editorCanMove();
        if(input){if(document.activeElement!==input)input.value=practiceBpm||state.project?.songInfo.bpm||100;input.disabled=!eligible||barPreviewPhase==='loading';}
        if(repeat){repeat.disabled=!eligible||barPreviewPhase==='loading';repeat.setAttribute('aria-pressed',String(editorRepeat));}
        syncSoundParts?.();
    }
    const soundPartNames={chords:'コード',melody:'メロディ',metronome:'メトロノーム'};
    function partEnabled(key){return key==='metronome'?metronomeEnabled:enabledParts[key];}
    function audibleMix(){
        return Object.fromEntries(Object.keys(soundPartNames).map(key=>[key,partEnabled(key)?playbackMix[key]:0]));
    }
    function syncPartChecks(group){
        for(const input of group.querySelectorAll('[data-sound-part]')){
            input.checked=partEnabled(input.dataset.soundPart)&&playbackMix[input.dataset.soundPart]>0;
            input.disabled=!state.session||!state.active;
        }
    }
    function buildPartChecks(place){
        const group=document.createElement('div');
        group.className='sc-part-checks';group.setAttribute('role','group');group.setAttribute('aria-label','再生する音');
        for(const [key,name] of Object.entries(soundPartNames)){
            const label=document.createElement('label'), input=document.createElement('input');
            input.type='checkbox';input.dataset.soundPart=key;
            if(place==='settings'&&key==='metronome')input.id='sc-metronome';
            input.onchange=()=>{
                if(key==='metronome')metronomeEnabled=input.checked;
                else enabledParts[key]=input.checked;
                const setting=key==='metronome'?'scoreMetronome':'scoreEnabledParts';
                let volumeSaved=true;
                if(input.checked&&playbackMix[key]===0){
                    playbackMix={...playbackMix,[key]:100};
                    volumeSaved=CS().storage.setAppSetting('scorePlaybackMix',playbackMix).ok;
                }
                const result=CS().storage.setAppSetting(setting,key==='metronome'?metronomeEnabled:{...enabledParts});
                if(!result.ok||!volumeSaved)setSaveStatus('音の設定は、この画面にのみ適用しています');
                pianoAudition?.setMix(audibleMix());
                refreshPracticeTransport();
                playbackSettings?.refresh();
            };
            label.append(input,name);group.append(label);
        }
        syncPartChecks(group);
        return group;
    }
    function mountPracticeTransport(){
        if(syncSoundParts||!q('sc-transport'))return;
        var parent=q('sc-transport').querySelector('.score-transport-options'),audio=q('sc-playback-settings');
        const group=document.createElement('div');
        group.className='sc-sound-parts';
        const parts=buildPartChecks('toolbar');
        group.append(parts);
        parent.append(group);
        const compact=document.createElement('button');
        compact.type='button';compact.className='sc-parts-toggle btn-ghost btn-compact';
        compact.textContent='パート';compact.setAttribute('aria-label','再生するパートを選ぶ');
        const popup=document.createElement('div');
        popup.popover='auto';popup.className='sc-parts-popup';
        const options=buildPartChecks('compact');popup.append(options);
        compact.popoverTargetElement=popup;
        parent.append(compact,popup);
        syncSoundParts=()=>{syncPartChecks(parts);syncPartChecks(options);};
        parent.append(audio);scoreUI.styleRepeatButton(q('sc-repeat'));refreshPracticeTransport();
    }
    function practiceProject(project){refreshPracticeTransport();return practiceBpm?Object.assign({},project,{songInfo:Object.assign({},project.songInfo,{bpm:practiceBpm})}):project;}
    function practiceSongPlan(project,deps){
        refreshPracticeTransport();var section=selectedPlaybackSection(),start=selectedBarIds.length>1?project.bars.findIndex(function(b){return b.id===selectedBarIds[0];}):section?project.bars.findIndex(function(b){return b.sectionId===section.id;}):Math.max(0,(state.selectedBarNumber||1)-1),count=selectedBarIds.length>1?selectedBarIds.length:editorRepeat?(state.selectedBarNumber?1:section?project.bars.filter(function(b){return b.sectionId===section.id;}).length:project.bars.length-start):undefined;
        return editorRepeat?scorePlayback.buildRangeLoopPlan(project,deps,start,count):buildSongPreviewPlan(project,deps,start,count);
    }
    function restartPracticePlayback(){
        var resume=barPreviewPhase!=='idle'?{number:previewLastBar||state.selectedBarNumber||1,scope:barPreviewScope}:practicePending,ticket=++practiceRestart;if(!resume)return;
        practicePending=resume;var owner=state.session,version=owner.snapshotVersion,stopGeneration=CS().audio.getStopGeneration();previewSelectOnStop=false;
        Promise.resolve(pianoAudition?.stop()).then(function(){if(ticket!==practiceRestart)return;practicePending=null;if(state.session===owner&&owner.snapshotVersion===version&&stopGeneration===CS().audio.getStopGeneration()&&state.active)startPreview(resume.scope,playbackSettings?.isOpen===true,{barNumber:resume.number});});
    }
    function savePracticeTempo(){try{var raw=JSON.parse(localStorage.getItem('cruiseStudio.appSettings')||'{}');if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error();var old=CS().storage.getAppSetting('scorePracticeBpmV1'),next=Object.assign(Object.create(null),old&&typeof old==='object'&&!Array.isArray(old)?old:{}),id=state.session.draft.projectId;if(practiceBpm===null)delete next[id];else next[id]=practiceBpm;if(CS().storage.setAppSetting('scorePracticeBpmV1',next)?.ok===false)throw Error();}catch(_){setSaveStatus('練習テンポは、この画面にのみ適用しています');}}
    function setPracticeTempo(value){if(!editorCanMove())return;if(!Number.isFinite(value)||value<20||value>400){var input=q('sc-practice-tempo');if(input)input.value=practiceBpm||state.project.songInfo.bpm;return;}practiceBpm=value;savePracticeTempo();restartPracticePlayback();refreshPracticeTransport();}
    function resetPracticeTempo(){practiceBpm=null;savePracticeTempo();restartPracticePlayback();refreshPracticeTransport();}
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
        return {pitchMidi:CS().model.schema2.pitchMidi,tieTarget:CS().model.schema2.melodyTieTarget,parseChord:CS().theory.parseBasicChordSymbol,qualities:window.ChordCruise.theory.QUALITIES,notePc:CS().theory.keyToSemitone,melodyOnly:!!melodyOnly,rhythm:function(p,i){
            var id=bindings.get(p.bars[i].id)||p.performance.basicRhythmId;if(cache.has(id))return cache.get(id);var m=materials.get(id),r;
            if(m?.encoding==='studio-strum-v1')r={...m.snapshot,encoding:m.encoding};
            else if(m?.encoding==='rhythm-owner-cells-v1'){var checked=CS().rhythmSnapshots.readRhythmMaterial(m);if(!checked.ok)throw Error('ストロークの内容を確認してください');r={encoding:m.encoding,projection:checked.projection};}
            if(!r)throw Error('ストローク形式が未対応です');cache.set(id,r);return r;
        }};
    }
    // Settings audition owns audio only; it never changes Session, selection or history.
    function createLayoutPreview(project,options){
        var owner=state.session,version=owner.snapshotVersion,runtime=null,phase='idle',plan=null,preRoll=null,generation=0,disposed=false;
        function current(){return !disposed&&state.active&&state.session===owner&&owner.snapshotVersion===version&&options.isOpen()&&!document.hidden;}
        function audio(){if(!runtime)runtime=createPianoAudition({sessionId:'studio.sheet.layout.'+crypto.randomUUID(),coordinator:CS().audio,mix:audibleMix(),isMetronomeEnabled:function(){return metronomeEnabled;},metronomeSample:function(ctx,midi){return scoreUI.metronomeSample(ctx,midi,metronomeSound);},outputTime:function(ctx){return scoreUI.outputContextTime(ctx,performance.now());},createContext:function(){return new (window.AudioContext||window.webkitAudioContext)();},setTimer:window.setTimeout.bind(window),clearTimer:window.clearTimeout.bind(window),loadSample:loadPianoSample,onState:function(value){phase=value;options.changed(value);},onError:function(text){options.message(text);}});return runtime;}
        return {async play(){var ticket=++generation,stopGeneration=CS().audio.getStopGeneration();if(!current())return;phase='loading';options.changed(phase);await prepareScorePlayback();if(ticket!==generation||stopGeneration!==CS().audio.getStopGeneration()||!current()||!scorePlayback){if(ticket===generation){phase='idle';options.changed(phase);}return;}try{var practice=practiceProject(project);var deps=previewDependencies(practice,false);
            plan=options.auditionPlan || buildSongPreviewPlan(practice,deps,0);
            if(!options.patternOnly)plan=scorePlayback.withMetronome(practice,plan);
            var schedule=options.auditionTiming?options.auditionTiming(plan):plan;
            preRoll=!options.patternOnly&&countInEnabled&&metronomeEnabled?scorePlayback.buildCountIn(practice):null;var result=await audio().playEvents(schedule.events,function(){return ticket===generation&&stopGeneration===CS().audio.getStopGeneration()&&current();},schedule.duration,true,undefined,preRoll);if(!result.ok){phase='idle';options.changed(phase);if(result.error)options.message(result.error);}}catch(error){phase='idle';options.changed(phase);options.message(error.message||'音を開始できませんでした');}},
            position(){if(phase!=='playing'||!runtime||!plan)return null;var snapshot=runtime.snapshot(),elapsed=(snapshot.visualElapsedSeconds??snapshot.elapsedSeconds)-.03-playbackVisualDelay/1000-(preRoll?.duration||0);if(elapsed<0)return null;var span=plan.spans.find(function(s){return elapsed<s.end;})||plan.spans[plan.spans.length-1];var next=span && plan.spans[plan.spans.indexOf(span)+1];return span?{barNumber:span.index+1,nextBarNumber:next?next.index+1:null,barTicks:plan.barTicks,barSeconds:plan.barTicks*plan.secondsPerTick,tick:Math.max(0,Math.min(plan.barTicks-.001,(elapsed-span.start)/plan.secondsPerTick))}:null;},
            stop(){generation++;phase='idle';options.changed(phase);if(runtime)void runtime.stop();},dispose(){disposed=true;generation++;return runtime?runtime.dispose():Promise.resolve({ok:true});}};
    }
    function startPreview(scope,fromSettings,restart){
        if(!restart){practiceRestart++;practicePending=null;}
        if(!scorePlayback){prepareScorePlayback();setSaveStatus('再生の準備中です。もう一度押してください');return;}
        if(!state.session?.draft.bars.length){setSaveStatus('再生する小節がありません。空き枠を編集してください');return;}

        if(barPreviewPhase!=='idle'&&barPreviewScope===scope){if(scope==='song')stopSongPreview();else stopPianoAudition();return;}
        finishTextInputs();var owner=state.session,c=scope==='song'?null:pianoContext();
        if(!owner||owner.draft.schemaVersion!==2||!operationEligible(fromSettings===true)||owner.inputPending||owner.commitInFlight||owner.conflict||owner.externalUpdatePending||textDiagnostic(owner)||(scope!=='song'&&pianoBlocked(c))){pianoMessage('未確定の入力・保存・競合を確認してください');return;}
        try{var project=practiceProject(owner.workingSnapshot()),deps=previewDependencies(project,scope==='melody'),plan=scope==='song'?practiceSongPlan(project,deps):editorBars>1?buildSongPreviewPlan(project,deps,editorStartIndex(project),editorBars):buildBarPreviewPlan(project,state.selectedBarNumber-1,deps);
            if(scope==='song')plan=scorePlayback.withMetronome(project,plan);
            var offset=restart?.barNumber?plan.spans?.find(function(s){return s.index+1===restart.barNumber;})?.start||0:0;playPreviewPlan(plan,scope,!restart&&scope==='song'&&countInEnabled&&metronomeEnabled?scorePlayback.buildCountIn(project):null,offset);
        }catch(e){pianoMessage(e.message);}
    }
    function clearPlaybackNotice(){var old=playbackNotice;playbackNotice=null;if(!old)return;if(piano.message===old)piano.message='';if(els.saveStatus?.textContent===old)refreshSessionStatus();}
    function previewMessage(message){playbackNotice=message;pianoMessage(message);}
    function playPreviewPlan(plan,scope){
        var preRoll=arguments[2]||null,startOffset=arguments[3]||0;previewCountIn=preRoll;previewStartOffset=startOffset;previewRangeActive=scope==='song'&&selectedBarIds.length>1;
        clearPlaybackNotice();piano.message='';if(plan.warnings.length)previewMessage(plan.warnings.join('／'));var frame=contentFrame();previewFrame=frame;previewSpans=plan.spans||null;previewLoopPeriod=plan.loopPeriod||0;previewSecondsPerTick=plan.secondsPerTick||0;barPreviewScope=scope;previewLastBar=null;previewSelectOnStop=scope==='song';
        void ensureAudition().playEvents(plan.events,function(){return currentFrame(frame)&&state.active&&!document.hidden&&(!CS().entryAuth||CS().entryAuth.isAuthorized());},plan.duration,scope==='song'||plan.spans?.length>1,plan.loopPeriod,preRoll,startOffset).then(function(r){if(!r.ok&&r.error&&currentFrame(frame))previewMessage(r.error);}).catch(function(){if(currentFrame(frame))previewMessage('試聴を開始できませんでした');});
    }
    function buildBarPlayButton(melodyOnly){
        var owner=state.session,sourceBarId=owner?.draft.bars[state.selectedBarNumber-1]?.id;
        var button=document.createElement('button');button.type='button';if(melodyOnly)button.dataset.melodyPreview='';else button.dataset.barPreview='';button.className='slot-overlay-nav-btn';var scope=melodyOnly?'melody':'all',active=barPreviewPhase!=='idle'&&barPreviewScope===scope;button.textContent=active?(barPreviewPhase==='loading'?'■ 準備中':'■ 停止'):melodyOnly?'▶ メロディ':'▶ 再生';button.setAttribute('aria-pressed',String(active));button.title=(editorBars>1?'表示中の小節':'この小節')+(melodyOnly?'のメロディだけを試聴':'のコード×ストローク＋メロディを試聴（コードは参考の響き）');
        // Keep the text target alive through WebKit's pointer-to-focus transition.
        button.addEventListener('pointerdown',function(e){if(e.button===0)e.preventDefault();e.stopPropagation();});button.addEventListener('click',function(e){e.stopPropagation();if(!button.isConnected||state.session!==owner||owner.draft.bars[state.selectedBarNumber-1]?.id!==sourceBarId)return;startPreview(scope);});return button;
    }
    function selectStoppedPlaybackBar(number){
        if(!state.session?.draft.bars[number-1])return;
        selectedBarIds=[];rangeAnchor=number;sectionPlaybackSelection=null;state.selectedBarNumber=number;editorAnchorId=state.session.draft.bars[number-1].id;selectionDeleted=false;editorOpen=false;
        syncSheetSelection();refreshToolbarActions();getSheetBarByNumber(number)?.focus({preventScroll:true});
    }
    function stopSongPreview(){
        practiceRestart++;practicePending=null;
        if(barPreviewPhase==='playing'&&pianoAudition&&previewSpans){var sample=pianoAudition.snapshot(),elapsed=(sample.visualElapsedSeconds??sample.elapsedSeconds)-playbackVisualDelay/1000-.03-(previewCountIn?.duration||0),span=elapsed<0?null:previewSpans.find(function(s){return elapsed<s.end;})||(elapsed<0?null:previewSpans[previewSpans.length-1]);if(span)previewLastBar=span.index+1;}
        // Keep the stopped output running silently through the existing 800 ms idle
        // window. This drains device queues before closing, and a quick restart
        // reuses the silent context instead of reopening a stale hardware tail.
        // Global Stop, invalidation and workspace exit still perform full cleanup.
        previewSelectOnStop=!previewLoopPeriod&&!previewRangeActive;if(pianoAudition)pianoAudition.cancel();
    }
    function stopPianoAudition(){practiceRestart++;practicePending=null;previewSelectOnStop=false;if(pianoAudition)void pianoAudition.stop();}
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
        els.slotOverlay.querySelectorAll('[data-chord-cell-toggle]').forEach(function(button){var active=chordPicker.open&&!collapsedEditorRows.has('chord')&&button.closest('.editor-measure')===editorRoot()&&Number(button.dataset.chordCellToggle)===chordPicker.tick;button.setAttribute('aria-expanded',String(active));button.textContent=active?'▲':'▼';button.title=button.getAttribute('aria-label')+(active?'（もう一度押すと閉じます）':'');});
        ['chord','piano'].forEach(function(kind){var open=kind==='chord'?chordPicker.open:piano.open,name=kind==='chord'?'コード':'鍵盤';els.slotOverlay.querySelectorAll('[data-'+kind+'-toggle]').forEach(function(button){button.textContent=open?'▲':'▼';button.title=name+'を'+(open?'閉じる':'開く');button.setAttribute('aria-label',button.title);button.setAttribute('aria-expanded',String(open));});});
    }
    function buildChordPickerPanel(){var root=document.createElement('section');root.dataset.chordPicker='';root.hidden=!chordPicker.open||collapsedEditorRows.has('chord');if(!root.hidden)populateChordPicker(root);return root;}
    function refreshChordPicker(){syncEditorDisclosures();var root=els.slotOverlay?.querySelector('[data-chord-picker]');if(root&&!root.hidden)populateChordPicker(root);}
    function prepareChordPicker(){
        if(!chordPickerModule)chordPickerModule=import('./chord-picker.mjs?v=0.204.0-dev.1')
            .then(function(module){return module.createChordPicker(CS(),window.ChordCruise);})
            .catch(function(error){chordPickerModule=null;throw error;});
        return chordPickerModule;
    }
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
        prepareChordPicker().then(function(module){
            if(!root.isConnected||!currentFrame(frame)||owner!==state.session||chordPicker.tick!==tick||chordPicker.formEventId!==eventId)return;
            module.mount(root,{session:owner,bar:bar,tick:tick,eventId:eventId,formEntry:eventId?chordPicker.formEntry:null,project:owner.workingSnapshot(),current:function(){return currentFrame(frame)&&chordPicker.tick===tick&&chordPicker.formEventId===eventId;},eligible:editorCanMove,write:function(symbol,formMaterial,formMode){
                if(!currentFrame(frame)||!editorCanMove())return false;var field=editorRoot().querySelector('[data-overlay-field="chord"][data-slot-tick="'+tick+'"]');if(!field||field.readOnly)return false;return field._applyBeatValue(symbol,formMaterial,formMode).ok;
            },close:function(){if(!currentFrame(frame)||!editorCanMove())return;stopPianoAudition();chordPicker.open=false;root.hidden=true;root._disposeOwnerChord?.();syncEditorDisclosures();},formDetail:function(id){var cell=getSheetBarByNumber(state.selectedBarNumber);if(cell&&currentFrame(frame))openPaperForm(cell,id,undefined,true);},changed:function(){renderPreview(true);},progression:function(){
                if(!currentFrame(frame)||!editorCanMove())return false;
                if(barPreviewScope==='chords'&&barPreviewPhase!=='idle'){stopPianoAudition();return true;}
                finishTextInputs();if(!currentFrame(frame)||!editorCanMove())return false;
                try{var p=owner.workingSnapshot(),deps=previewDependencies(p,false);deps.chordsOnly=true;var plan=editorBars>1?buildSongPreviewPlan(p,deps,editorStartIndex(p),editorBars):buildBarPreviewPlan(p,state.selectedBarNumber-1,deps);playPreviewPlan(plan,'chords');return true;}catch(e){pianoMessage(e.message);return false;}
            },previewRange:function(){return {startIndex:editorBars>1?editorStartIndex(owner.draft):state.selectedBarNumber-1,count:Math.min(editorBars,owner.draft.bars.length-editorStartIndex(owner.draft))};},previewState:function(){return {phase:barPreviewPhase,scope:barPreviewScope};},subscribePreview:function(listener){chordPreviewListeners.add(listener);return function(){chordPreviewListeners.delete(listener);};},preview:function(plan,scope){
                if(!currentFrame(frame)||!editorCanMove())return false;
                if(scope==='chords'&&barPreviewScope===scope&&barPreviewPhase!=='idle'){stopPianoAudition();return true;}
                finishTextInputs();if(!currentFrame(frame)||!editorCanMove())return false;playPreviewPlan(plan,scope);return true;
            }});
            if(preserved){root.style.minHeight=preserved.minHeight;var board=root.shadowRoot?.querySelector('#cc-fretboard-host .cc-fb-scroll');if(board&&Number.isFinite(preserved.boardX))board.scrollLeft=preserved.boardX;preserved.positions.forEach(function(p){if(p.node.isConnected){p.node.scrollLeft=p.x;p.node.scrollTop=p.y;}});if(window.scrollX!==preserved.x||window.scrollY!==preserved.y)window.scrollTo(preserved.x,preserved.y);}
        }).catch(function(){if(root.isConnected)root.textContent='コード入力画面を読み込めませんでした。開き直してください。';});
    }
    function buildPianoPanel(){
        var root=document.createElement('section');root.dataset.doremiPiano='';root.className='doremi-piano';
        root.hidden=collapsedEditorRows.has('doremi');root.setAttribute('aria-label','メロディ鍵盤');root.addEventListener('keydown',onPianoKeydown);populatePiano(root);return root;
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
    function togglePianoPanel(){var c=pianoContext();if(pianoBlocked(c))return;piano.open=!piano.open;if(!piano.open)stopPianoAudition();refreshPiano();var field=editorRoot().querySelector('[data-overlay-field="doremi"][data-slot-tick="'+c.range.tick+'"]');if(field)field.parentElement.classList.toggle('piano-color-mode',piano.open);if(piano.open){focusPianoCell(c);void ensurePianoBank().catch(function(){if(piano.open)setSaveStatus('ピアノ音源を読み込めませんでした。鍵盤を押して再試行してください。',true);});if(editorPlacement!=='right'){var area=getLoupeSafeArea();state.loupe.y=clampLoupeY(Math.min(state.loupe.y,area.bottom-area.bottomMargin-editorScrollArea().scrollHeight-2));}editorScrollArea().scrollTop=0;}positionSlotOverlay();}
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
        var scroll=document.createElement('div');scroll.className='piano-key-scroll';var keyboard=document.createElement('div');keyboard.className='piano-keys';keyboard.setAttribute('aria-label','3オクターブのメロディ鍵盤');
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
    var editorCellDrag = null, editorClipboard = null;
    var editorClipboardType = 'application/x-cruise-studio-cell';
    function bindEditorRanges(viewport, previousStrokeStart) {
        var owner = state.session, anchor = null, extent = null, editing = null, gesture = null, handledStroke = null;
        function cellOf(node) { return node?.closest('[data-range-row]'); }
        function controlOf(cell) { return cell?.firstElementChild; }
        function start(cell) { return Number(cell.dataset.rangeStart); }
        function end(cell) { return start(cell) + Number(controlOf(cell).dataset.slotTicks); }
        function limits() { return {start:Math.min(start(anchor), start(extent)), end:Math.max(end(anchor), end(extent))}; }
        function mark(first, last) {
            editing?.removeAttribute('data-cell-editing');
            anchor = first; extent = last; editing = null;
            const range = first && limits();
            viewport.querySelectorAll('[data-range-row]').forEach(cell => {
                cell.toggleAttribute('data-cell-selected', !!range && cell.dataset.rangeRow === first.dataset.rangeRow &&
                    start(cell) >= range.start && start(cell) < range.end);
            });
        }
        function enterText(cell) {
            if (controlOf(cell).readOnly) return;
            mark(null, null); editing = cell;
            cell.setAttribute('data-cell-editing','');
            cell.classList.remove('piano-color-mode');
        }
        function stopGesture() {
            gesture?.scroll?.stop();
            if (!gesture) return;
            const press = gesture;
            gesture = null;
            press.listeners.abort();
            clearTimeout(press.timer);
            if (viewport.hasPointerCapture(press.id)) viewport.releasePointerCapture(press.id);
            viewport.querySelectorAll('.is-lifted,.is-drop-target').forEach(cell => cell.classList.remove('is-lifted','is-drop-target'));
            if (press.cell.dataset.rangeRow === 'strum') handledStroke = press.cell;
        }
        function transfer(target, args, expected) {
            if (!editorCanMove() || owner !== state.session) return;
            stopPianoAudition();
            if (args.row === 'chord') {
                const barTicks = CS().model.getBarLengthTicks(state.project);
                const firstBar = Math.floor(args.to/barTicks), lastBar = Math.ceil((args.to+args.end-args.start)/barTicks);
                args.chordGrid = Object.fromEntries(state.project.bars.slice(firstBar,lastBar).map(bar =>
                    [bar.sourceId,Object.fromEntries(editorCellRanges(bar,getStrumGridResolution(bar),'chord')
                        .filter(range=>range.res>=16).map(range=>[range.tick,range.res]))]));
            }
            if (!runStructureOperation('rangeTransfer', args, expected).ok) return;
            state.selectedBarNumber = Number(target.closest('.editor-measure').dataset.barNumber);
            selectedBarIds = [];
            redrawSession(false);
            const targetCell = els.slotOverlay.querySelector('[data-range-row="' + args.row + '"][data-range-start="' + start(target) + '"]');
            const field = controlOf(targetCell);
            field?.focus({preventScroll:true}); revealEditorCell(field);
        }
        viewport.addEventListener('pointerdown', event => {
            if (!event.isPrimary) return;
            stopGesture();
            handledStroke = null;
            const cell = cellOf(event.target);
            const input = controlOf(cell);
            if (!input?.contains(event.target) || event.button !== 0 || !editorCanMove()) return;
            if (editing === cell && !event.shiftKey) return;
            const wasSelected = cell.hasAttribute('data-cell-selected'), second = anchor === extent && anchor === cell;
            const extend = event.shiftKey && anchor?.dataset.rangeRow === cell.dataset.rangeRow;
            if (extend) mark(anchor, cell);
            else if (!wasSelected) mark(cell, cell);
            const strum = cell.dataset.rangeRow === 'strum';
            if (strum || !second || extend) event.preventDefault();
            input.focus({preventScroll:true});
            // Collapse the first click's hidden text selection before the browser
            // places the caret on the second press.
            if (!second || extend) input.select?.();
            else if (!strum && !input.readOnly) input.setSelectionRange(input.selectionEnd,input.selectionEnd);
            const textPress = second && !extend && !strum && !input.readOnly;
            if (textPress) enterText(cell);
            if (!viewport.isConnected || !cell.isConnected) return;
            const press = {id:event.pointerId, cell, second:second && !extend, extend, x:event.clientX,y:event.clientY,
                moved:false,lift:false,frame:CS().structureOperations.capture(owner),listeners:new AbortController()};
            gesture = press;
            const capture = {capture:true,signal:press.listeners.signal};
            window.addEventListener('pointerup', finishGesture, capture);
            window.addEventListener('pointercancel', cancelPointer, capture);
            window.addEventListener('click', stopGesture, capture);
            window.addEventListener('blur', stopGesture, {signal:press.listeners.signal});
            if (event.pointerType === 'mouse') window.addEventListener('mouseup', e => {
                if (!(e.buttons & 1)) stopGesture();
            }, capture);
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) stopGesture();
            }, capture);
            if (!textPress) viewport.setPointerCapture(event.pointerId);
            if (!extend && (wasSelected && anchor !== extent || (!strum && input.value) ||
                cell.querySelector('[draggable=true]:not([hidden])') || input.dataset.strumState === 'rest')) {
                press.timer = setTimeout(() => {
                    if (gesture !== press) return;
                    if (!cell.isConnected || !editorCanMove()) { stopGesture(); return; }
                    press.lift = true;
                    if (!textPress) viewport.querySelectorAll('[data-cell-selected]').forEach(item => item.classList.add('is-lifted'));
                }, 380);
            }
        });
        function hit(event,source) {
            const target = cellOf(viewport.ownerDocument.elementFromPoint(event.clientX,event.clientY));
            return target && viewport.contains(target) && target.dataset.rangeRow === source.dataset.rangeRow ? target : null;
        }
        viewport.addEventListener('pointermove', event => {
            if (gesture?.id !== event.pointerId) return;
            if (!(event.buttons & 1)) {
                if (editing === gesture.cell) mark(gesture.cell,gesture.cell);
                stopGesture(); return;
            }
            if (!gesture.moved && Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y) < 5) return;
            clearTimeout(gesture.timer);
            if(!gesture.scroll)gesture.scroll=createDragScroll(viewport,(x,y)=>{
                if(!gesture||!viewport.isConnected){gesture?.scroll?.stop();return;}
                const target=hit({clientX:x,clientY:y},gesture.cell);
                if(target&&!gesture.lift)mark(gesture.extend?anchor:gesture.cell,target);
            },true);
            gesture.scroll.move(event.clientX,event.clientY);
            const target = hit(event,gesture.cell);
            if (gesture.lift) {
                if (!anchor) {
                    mark(gesture.cell,gesture.cell);
                    gesture.cell.classList.add('is-lifted');
                    viewport.setPointerCapture(event.pointerId);
                }
                viewport.querySelector('.is-drop-target')?.classList.remove('is-drop-target');
                target?.classList.add('is-drop-target');
            } else if (target) mark(gesture.extend ? anchor : gesture.cell,target);
            gesture.moved = true;
        });
        function finishGesture(event) {
            if (gesture?.id !== event.pointerId) return;
            const g = gesture;
            stopGesture();
            if (event.button !== 0 || !g.cell.isConnected || !editorCanMove() || !anchor || !extent) return;
            const target = hit(event,g.cell);
            if (g.lift && g.moved && target && target !== g.cell) {
                const range = limits();
                transfer(target,{row:g.cell.dataset.rangeRow,...range,to:range.start + start(target)-start(g.cell)},g.frame);
            } else if (target === g.cell && g.second && !g.moved && !g.lift) {
                if (g.cell.dataset.rangeRow === 'strum') controlOf(g.cell)._cycleStroke();
                else enterText(g.cell);
            } else if (target === g.cell && !g.extend && !g.lift && !g.moved) mark(g.cell,g.cell);
        }
        // A trusted click can land after the viewport scrolls during the press.
        viewport.addEventListener('click', event => {
            const completedGesture = handledStroke;
            handledStroke = null;
            const cell = cellOf(event.target), control = controlOf(cell);
            if (cell?.dataset.rangeRow !== 'strum' || !control.contains(event.target)) return;
            event.stopPropagation();
            if (completedGesture) return;
            if (!editorCanMove()) return;
            if (event.shiftKey && anchor?.dataset.rangeRow === 'strum') mark(anchor,cell);
            else if (anchor === cell && extent === cell) control._cycleStroke();
            else mark(cell,cell);
            if (control.isConnected) control.focus({preventScroll:true});
        });
        function cancelPointer(event) {
            if (gesture?.id === event.pointerId) stopGesture();
        }
        viewport.addEventListener('dblclick', event => {
            const input=controlOf(editing);
            if (input && input===event.target && !input.readOnly) {
                event.preventDefault();
                input.setSelectionRange(input.selectionEnd,input.selectionEnd);
            }
        });
        viewport.addEventListener('dragstart', event => {
            if (event.target.closest('[data-range-row] input')) event.preventDefault();
        },true);
        viewport.addEventListener('lostpointercapture',event => { if (gesture?.id === event.pointerId && !viewport.hasPointerCapture(event.pointerId)) stopGesture(); });
        function beginTyping(event) {
            const cell = cellOf(event.target);
            if (cell?.hasAttribute('data-cell-selected')) enterText(cell);
        }
        viewport.addEventListener('keydown', event => {
            // In text mode the browser moves the caret (and extends text selections).
            // Alt + arrow retains the editor's explicit measure navigation.
            if (editing && event.target === controlOf(editing) && !event.altKey &&
                (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) event.stopPropagation();
        },true);
        viewport.addEventListener('beforeinput',beginTyping,true);
        viewport.addEventListener('compositionstart',beginTyping,true);
        viewport.addEventListener('focusin', event => {
            const cell = cellOf(event.target);
            if (anchor && !cell?.hasAttribute('data-cell-selected')) mark(null,null);
        });
        viewport.addEventListener('focusout', event => {
            if (editing && event.target === controlOf(editing)) {
                editing.removeAttribute('data-cell-editing');
                editing = null;
            }
        });
        if (previousStrokeStart !== undefined) {
            const cell = viewport.querySelector('[data-range-row="strum"][data-range-start="' + previousStrokeStart + '"]');
            if (cell) mark(cell,cell);
        }
        viewport.addEventListener('copy', event => {
            if (!anchor || (anchor === extent && anchor.dataset.rangeRow !== 'strum') ||
                !event.clipboardData || !cellOf(event.target)?.hasAttribute('data-cell-selected')) return;
            const token = CS().model.schema2.newId(), range = limits();
            event.clipboardData.setData(editorClipboardType, token);
            event.clipboardData.setData('text/plain', Array.from(viewport.querySelectorAll('[data-cell-selected]'),cell => cell.dataset.rangeRow === 'strum' ? controlOf(cell).textContent : controlOf(cell).value).join('\t'));
            editorClipboard = {token, clip:{row:anchor.dataset.rangeRow, ...range, source:owner.workingSnapshot()}};
            event.preventDefault(); event.stopPropagation();
        },true);
        viewport.addEventListener('paste', event => {
            const cell = cellOf(event.target), clip = editorClipboard?.clip;
            if (!cell || !clip?.source || clip.row !== cell.dataset.rangeRow || event.clipboardData?.getData(editorClipboardType) !== editorClipboard.token) return;
            event.preventDefault(); event.stopPropagation();
            transfer(cell,{...clip,to:start(cell)},CS().structureOperations.capture(owner));
        },true);
    }
    function wireEditorCell(row, cell, input, bar, range, hasContent) {
        var owner = state.session, barId = bar.sourceId, tick = range.tick, span = range.span;
        var field = row === 'strum' ? '.dock-strum-cell' : row === 'lyrics' ? '.dock-lyrics-cell' : '[data-overlay-field="' + row + '"]';
        var tickField = row === 'strum' ? 'tick' : 'onsetTick';
        cell.classList.add('sc-editor-transfer-cell');
        cell.appendChild(noteValueControl(bar, row, range, {cell}));
        cell.dataset.rangeRow = row;
        cell.dataset.rangeStart = (bar.barNumber - 1) * CS().model.getBarLengthTicks(state.project) + tick;
        function eventsAtCell() {
            var canonical = owner.draft.bars.find(function (item) { return item.id === barId; });
            if (!canonical) return [];
            var events = row === 'strum' ? effectiveStrumSlots(bar) : canonical[row === 'doremi' ? 'melody' : row === 'chord' ? 'chords' : 'lyrics'];
            return events.filter(function (event) { return event[tickField] >= tick && event[tickField] < tick + span; });
        }
        function wholeCell() {
            return row === 'strum' || input.selectionStart === input.selectionEnd ||
                input.selectionStart === 0 && input.selectionEnd === input.value.length;
        }
        function eligible() {
            return barId && cell.isConnected && state.session === owner && editorCanMove();
        }
        function canReceive(moving) {
            return eligible() && (moving || !input.readOnly && input.getAttribute('aria-readonly') !== 'true');
        }
        function transfer(args, frame) {
            if (!canReceive(!!args.from)) return;
            stopPianoAudition();
            var result = runStructureOperation(row === 'chord' ? 'chordTransfer' : 'cellTransfer',
                Object.assign({barId:barId, row:row, tick:tick, span:span, resolution:range.res}, args), frame);
            if (!result.ok) return;
            var number = owner.draft.bars.findIndex(function (item) { return item.id === barId; }) + 1;
            state.selectedBarNumber = number;
            selectedBarIds = [];
            redrawSession(false);
            var target = els.slotOverlay.querySelector('.editor-measure[data-bar-number="' + number + '"] ' + field + '[data-slot-tick="' + tick + '"]');
            target?.focus({preventScroll:true});
            revealEditorCell(target);
        }
        if (row !== 'doremi') input.addEventListener('keydown', function (event) {
            if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'z' ||
                event.isComposing || event.keyCode === 229 || textDiagnostic(owner) || owner.inputPending) return;
            CS().shellHost.keyboard.localCommand(event, event.shiftKey ? 'studio.redo' : 'studio.undo', 'sheetCruise');
        }, true);
        input.addEventListener('copy', function (event) {
            if (!eligible() || row === 'chord' && input.readOnly || !wholeCell() || !event.clipboardData) return;
            var events = eventsAtCell();
            if (!events.length) return;
            var draft = owner.draft;
            var clip = {projectId:draft.projectId, row:row, tick:tick, events:events};
            if (row === 'chord') {
                var chord = events[0];
                var binding = draft.performance.formBindings.find(function (form) { return form.chordEventId === chord.id; });
                clip.event = chord;
                clip.binding = binding;
                clip.material = binding && draft.materials.forms.find(function (form) { return form.id === binding.materialId; });
                clip.instrument = draft.instrument;
            }
            var token = CS().model.schema2.newId();
            event.clipboardData.setData('text/plain', input.value || input.title);
            try { event.clipboardData.setData(editorClipboardType, token); }
            catch (_) { /* Plain text remains available in other apps. */ }
            editorClipboard = {token:token, clip:JSON.parse(JSON.stringify(clip))};
            event.preventDefault();
            event.stopPropagation();
        });
        input.addEventListener('paste', function (event) {
            if (!wholeCell() || !editorClipboard || event.clipboardData?.getData(editorClipboardType) !== editorClipboard.token) return;
            if (editorClipboard.clip.row !== row) return;
            event.preventDefault();
            event.stopPropagation();
            if (eligible()) transfer({clip:editorClipboard.clip});
        });
        var handle = document.createElement('span');
        handle.className = 'sc-editor-cell-drag-handle';
        handle.dataset.cellDragHandle = row;
        if (row === 'chord') handle.dataset.chordDragHandle = '';
        handle.textContent = '⠿';
        handle.draggable = true;
        handle.setAttribute('aria-hidden', 'true');
        handle.title = '同じ行へドラッグして移動（入力済みのマスは上書き）';
        cell.appendChild(handle);
        handle.hidden = !hasContent;
        function refreshHandle() {
            if (!cell.isConnected || state.session !== owner) return;
            var events = eventsAtCell();
            handle.hidden = !events.length ||
                row === 'chord' && (events.length !== 1 || events[0].onsetTick !== tick);
        }
        input.addEventListener('input', function () { queueMicrotask(refreshHandle); });
        input.addEventListener('compositionend', function () { queueMicrotask(refreshHandle); });
        handle.addEventListener('dragstart', function (event) {
            var events = eventsAtCell();
            if (!eligible() || !events.length || !event.dataTransfer) { event.preventDefault(); return; }
            finishTextInputs();
            var token = CS().model.schema2.newId();
            editorCellDrag = {row:row, token:token, from:{barId:barId, tick:tick, span:span, eventId:events[0].id},
                frame:CS().structureOperations.capture(owner)};
            event.dataTransfer.setData(editorClipboardType, token);
            event.dataTransfer.effectAllowed = 'move';
            event.stopPropagation();
        });
        handle.addEventListener('dragend', function () {
            editorCellDrag = null;
            els.slotOverlay.querySelectorAll('.is-drop-target').forEach(function (target) { target.classList.remove('is-drop-target'); });
        });
        function canDrop() {
            return editorCellDrag?.row === row && canReceive(true) &&
                CS().structureOperations.isCurrent(editorCellDrag.frame, owner);
        }
        cell.addEventListener('dragover', function (event) {
            if (!canDrop()) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'move';
            cell.classList.add('is-drop-target');
        });
        cell.addEventListener('dragleave', function (event) {
            if (!event.relatedTarget || !cell.contains(event.relatedTarget)) cell.classList.remove('is-drop-target');
        });
        cell.addEventListener('drop', function (event) {
            cell.classList.remove('is-drop-target');
            if (!canDrop() || event.dataTransfer?.getData(editorClipboardType) !== editorCellDrag.token) return;
            event.preventDefault();
            event.stopPropagation();
            var drag = editorCellDrag;
            editorCellDrag = null;
            transfer({from:drag.from}, drag.frame);
        });
    }

    function buildBeatTextRow(kind,bar,res) {
        var canonical=state.session.draft, source=canonical.bars[bar.barNumber-1];
        if(canonical.schemaVersion!==2)return buildOverlayInput({id:kind,label:kind==='chord'?'コード':'メロディ'},bar);
        var wrap=document.createElement('div');
        var collection=kind==='chord'?'chords':'melody', owner=state.session, ranges=editorCellRanges(bar,res,kind);
        var groups=editorBeatGroups(wrap,bar,res,kind,ranges);
        ranges.forEach(function(range,index){var tick=range.tick,span=range.span;
            var events=source[collection].filter(function(e){return e.onsetTick>=tick&&e.onsetTick<tick+span;});
            var exact=events.length===1&&events[0].onsetTick===tick?events[0]:null, batch=kind==='doremi'&&(autoCellGroup(events,tick,span)||pitchCellGroup(events,tick));
            var input=document.createElement('input');input.type='text';input.className='slot-overlay-input';
            input.style.minWidth='0';input.style.width='100%';input.style.padding='0 3px';input.style.boxSizing='border-box';input.style.textAlign='center';
            input.style.minHeight=kind==='chord'?'max(26px, calc(30px * var(--bar-loupe-scale,1)))':'max(28px, calc(34px * var(--bar-loupe-scale,1)))';
            var boundary=range.boundary;
            input.classList.add(boundary);

            if(kind==='doremi'){input.style.fontFamily='var(--paper-font)';input.style.fontSize='max(11px, calc(13px * var(--bar-loupe-scale, 1)))';input.style.fontWeight='600';input.style.letterSpacing='0';}
            input.dataset.overlayField=kind;input.dataset.slotTick=tick;input.dataset.slotTicks=span;input.setAttribute('aria-label',bar.barNumber+'小節目の'+(kind==='chord'?'コード':'メロディ')+' '+(tick/480+1)+'拍');
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
                var addedStroke=false;
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
                        if(!old||old.symbol!==symbol||old.unresolved)addedStroke=api.addChordStroke(p,b.id,tick,range.res);
                        if(old){old.symbol=symbol;old.unresolved=false;}else list.push({id:api.newId(),onsetTick:tick,symbol:symbol,unresolved:false,provenance:{origin:'user-set'}});
                        if(!old && p.extensions?.scoreCellValuesV1?.[b.id]?.chord)list.find(e=>e.onsetTick===tick).durationTicks=span;
                        if(CS().localChordForms){var chordEvent=list.find(function(e){return e.onsetTick===tick;});if(formMaterial){CS().model.schema2.assertJson(formMaterial);CS().localChordForms.initialize(p);if(formMaterial.provenance.sourceSymbol!==chordEvent.symbol||formMaterial.snapshot.capo!==p.instrument.capo||JSON.stringify(formMaterial.snapshot.tuningMidi)!==JSON.stringify(p.instrument.tuning)||formMaterial.snapshot.maxAbsoluteFret!==p.instrument.maxAbsoluteFret)throw Error('本棚フォームの名前・楽器条件が一致しません');CS().localChordForms.install(p,chordEvent,formMaterial,formMode==='auto'?'auto':'fixed');}else{if(formMode==='auto')p.performance.formBindings=p.performance.formBindings.filter(function(b){return b.chordEventId!==chordEvent.id;});CS().localChordForms.syncEvent(p,chordEvent);}}
                    }else{
                        var parsed=CS().theory.parseDoremiString(raw);
                        if(parsed.warnings.length||!parsed.notes.length)throw Error('メロディの表記を確認してください');
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
                if(result.ok&&addedStroke){
                    var updated=state.project.bars[bar.barNumber-1];
                    var row=input.closest('.editor-measure')?.querySelector('.dock-strum-grid');
                    if(row)row.replaceWith(buildStrumGridRow(updated,getStrumGridResolution(updated)));
                }
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
                    events.forEach(function(e){var token=document.createElement('span');if(e.kind==='rest'){token.appendChild(CS().sheetRenderer.createStrumRestSymbol(e.durationTicks));token.style.color='#746e65';}else token.textContent=pianoToken(e.pitch,owner.draft,true)+(events.length>1&&e.onsetTick+e.durationTicks<=tick+span?'〜'.repeat(Math.min(16,Math.max(e.provenance.timing.onset.origin==='auto-assigned'&&e.provenance.timing.duration.origin==='user-set'?1:0,e.durationTicks/unit-1))):'');if(e.kind==='note'){token.style.color=CS().sheetRenderer.octaveColor(e.pitch.octave);token.dataset.noteOctave=e.pitch.octave;}token.dataset.pianoEvent=e.id;token.setAttribute('role','button');token.setAttribute('aria-label',(e.kind==='rest'?'休符':pianoToken(e.pitch,owner.draft,true)+' オクターブ'+e.pitch.octave)+'を編集');
                        token.addEventListener('pointerdown',function(event){if(piano.open){event.preventDefault();event.stopPropagation();}});
                        function choose(event){if(!piano.open||!token.isConnected||state.session!==owner||state.session.draft.bars[state.selectedBarNumber-1]?.id!==source.id)return;event.preventDefault();event.stopPropagation();bindPianoCell(owner,source.id,tick,span);piano.eventId=e.id;piano.adding=false;refreshPiano();focusPianoCell(pianoContext());}token.addEventListener('click',choose);token.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' ')choose(event);else if(piano.open&&['Delete','Backspace'].includes(event.key)&&!event.isComposing&&event.keyCode!==229){choose(event);pianoWrite(pianoContext(),'delete');}});colors.appendChild(token);});
                    if(!events.length){var held=owner.draft.bars.find(function(b){return b.id===source.id;})?.melody.find(function(e){return e.kind==='note'&&e.onsetTick<tick&&e.onsetTick+e.durationTicks>tick;});if(held){var wave=document.createElement('span');wave.textContent='〜';wave.dataset.pianoSustain='';wave.style.color=CS().sheetRenderer.octaveColor(held.pitch.octave);wave.title='前の音を伸ばしています';colors.appendChild(wave);}}
                }

                input._applyBeatValue=function(value){input.value=value;return apply(false,true);};input._refreshColors=refreshColors;
                ['beforeinput','input','compositionstart'].forEach(function(type){input.addEventListener(type,function(){host.classList.remove('piano-color-mode');});});
                input.addEventListener('focus',function(){bindPianoCell(owner,source.id,tick,span);if(piano.open)host.classList.add('piano-color-mode');});host.append(input,colors);refreshColors();wireEditorCell(kind,host,input,bar,range,events.length>0);groups[range.beat].appendChild(host);
            }else {input._applyBeatValue=function(value,formMaterial,formMode){input.value=value;return apply(false,false,formMaterial,formMode);};input.addEventListener('focus',function(){bindChordCell(owner,source.id,tick);});
                var cell=document.createElement('div');cell.className='chord-cell';cell.appendChild(input);wireEditorCell(kind,cell,input,bar,range,!!exact);groups[range.beat].appendChild(cell);}
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

    function adjacentEditorPage(delta) {
        const project = state.session.draft, start = editorStartIndex(project);
        const next = Math.max(0, start + delta * editorBars);
        return next !== start && next < project.bars.length ? next : null;
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
        const project = state.session.draft, start = editorStartIndex(project);
        const page = adjacentEditorPage(delta);
        const target = options?.page ? (page === null ? null : state.project.bars[page]) : getMoveTarget(delta);
        if (!target || (!options?.page && target.barNumber === state.selectedBarNumber)) return;
        const index = target.barNumber - 1;
        if (options?.page || index < start || index >= start + editorBars) {
            editorAnchorId = project.bars[page ?? index].id;
        }
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
        button.disabled = adjacentEditorPage(delta) === null;
        button.addEventListener('click', function (event) {
            event.stopPropagation();
            var focusRowId = commitActiveOverlayInput({ skipRender: true });
            moveSelectedBar(delta, { page:true, focusRowId:focusRowId });
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
       Fable5レビュー「選択小節のX線写真」方針。紙面と同じ段順（コード/ストローク/歌詞/メロディ）を
       選択小節の時間軸のまま横に拡大する。本格的にセル編集するのはストローク行のみ。
       コードは1小節1コードの大きな1セル、歌詞・メロディは見た目だけ時間軸に揃えた1つの入力欄
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
       行（拍ルーラー/ストローク/歌詞/コード・メロディ背面線）のタイムライン部分を、
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
     * コード・メロディ行（1小節1入力を維持）の背面に敷く、装飾専用の拍/8分/16分縦線。
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
     * ルーペ全体（コード/ストローク/歌詞/メロディの拍ルーラー等）が共有する時間軸の
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
     * 小節の共有時間軸解像度（8 or 16）。拍ルーラー・ストロークセル・コード/メロディ背面線・
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
    // View changes are temporary. A stroke edit saves its grid with the rhythm.
    function lyricBeatStore(bar) {
        if(!bar.sourceId)return {store:state.lyricBeatRes,key:bar};
        var store=state.lyricBeatResV2.get(state.session);
        if(!store){store=new Map();state.lyricBeatResV2.set(state.session,store);}
        return {store:store,key:bar.sourceId};
    }
    function editorResolutionMap(bar,rowId){
        const owner=lyricBeatStore(bar);
        let map=owner.store.get(owner.key);
        if(!map){
            map=new Map();
            for(const row of ['lyrics','doremi'])map.set('initial:'+row,CS().sheetRenderer.defaultRowUnit(bar,row,8));
            owner.store.set(owner.key,map);
        }
        if(rowId==='strum'){
            const patternId=bar.strumOverride||state.project.basicStrumPatternId;
            const length=CS().model.getBarLengthTicks(state.project);
            if(!map.has('strumMaterial')||map.get('strumMaterial')!==patternId||map.get('strumLength')!==length){
                const pattern=state.project.strumPatterns.find(p=>p.id===patternId);
                const grid=CS().model.strumInputGrid(pattern,length);
                map.set('strumMaterial',patternId);map.set('strumLength',length);
                map.set('row:strum',grid.unit);
                for(let beat=0;beat<4;beat++)map.set('strum:'+beat,grid.beats[beat]??null);
            }
        }
        return map;
    }
    function getLyricBeatLocalRes(bar, beatIndex, rowId) {
        var map=editorResolutionMap(bar,rowId);
        var v = map.get(rowId&&rowId!=='lyrics'?rowId+':'+beatIndex:beatIndex);
        return (v === 8 || v === 16) ? v : null;
    }

    /**
     * res が null なら自動へ戻す（Mapからローカル指定を削除する）。
     */
    function setLyricBeatLocalRes(bar, beatIndex, res, rowId) {
        var key=rowId&&rowId!=='lyrics'?rowId+':'+beatIndex:beatIndex;
        var map=editorResolutionMap(bar,rowId);
        if (res !== 8 && res !== 16) {
            map.delete(key);
            return;
        }
        map.set(key, res);
    }

    /**
     * 拍beatIndexの実効解像度。ローカル指定があればそれを、無ければ全体設定
     * （globalRes）を返す。
     */
    function rowResolution(bar,rowId){
        return effectiveRowUnit(editorResolutionMap(bar,rowId),rowId);
    }
    function effectiveRowUnit(map,row){
        const preference=CS().localPaperLayout?.value.gridResolution??state.project.sheetSettings?.timingGridResolution;
        return map.get('row:'+row)||Math.max(map.get('initial:'+row)||8,preference===16?16:8);
    }
    function buildRowResolutionButton(bars,rowId){
        return noteValueControl(bars[0], rowId, null, {ranges:bars.flatMap(bar=>editorCellRanges(bar,null,rowId)), targets:bars});
    }
    function prepareLyricResolutionChange(bar) {
        // Subdivision also rebuilds solfege: preserve uncommitted/invalid buffers.
        if(!operationEligible()||textDiagnostic(state.session)||els.slotOverlay.querySelector('.is-composing')){
            setSaveStatus('入力を確定してから音価を変更してください。',true);
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
    function previousBarEndsWithStroke(bar){
        const prior=state.project.bars[bar.barNumber-2];
        if(!prior)return false;
        const slots=effectiveStrumSlots(prior);
        if(!Array.isArray(slots))return false;
        const length=CS().model.getBarLengthTicks(state.project);
        const last=slots.at(-1);
        if(last){
            const step=CS().sheetRenderer.strumNeedsSixteenth(slots)?120:240;
            return ['down','up'].includes(last.action) && last.tick+(last.durationTicks??step)>=length;
        }
        const pattern=state.project.strumPatterns.find(p=>p.id===(prior.strumOverride||state.project.basicStrumPatternId));
        return pattern?.leadingSustainTicks>=length;
    }
    function strumCellState(bar,range){
        var slots=effectiveStrumSlots(bar),end=range.tick+range.span;
        var starts=slots.filter(function(e){return e.tick>=range.tick&&e.tick<end;});
        var previous=slots.filter(function(e){return e.tick<range.tick;}).pop();
        var exact=starts.find(function(e){return e.tick===range.tick;});
        const pattern=state.project.strumPatterns.find(p=>p.id===(bar.strumOverride||state.project.basicStrumPatternId));
        const leading=pattern?.leadingSustainTicks||0;
        return {
            action:exact?exact.action:range.tick<leading?'sustain':previous&&previous.tick+(previous.durationTicks||1)>range.tick?(previous.action==='rest'?'rest':previous.action==='mute'?'empty':'sustain'):'empty',
            multiple:CS().sheetRenderer.hasInnerStroke(starts,range.tick),
            canSustain:(!previous && ((leading>0 && range.tick<=leading) || (range.tick===0 && previousBarEndsWithStroke(bar)))) || !!(previous&&['down','up'].includes(previous.action)&&(previous.tick+(previous.durationTicks||1)>=range.tick||(previous.durationTicks===undefined&&previous.tick===range.previousTick)))
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
        if(action==='sustain'&&!cell.canSustain){
            setSaveStatus('「〜」は直前のストロークを伸ばすマスに入力してください。');return;
        }
        // Work on exact legacy slots; do not quantize or reconstruct the whole bar.
        // The existing structure operation owns canonical publication and history.
        var slots=JSON.parse(JSON.stringify(effectiveStrumSlots(bar)));
        var old=slots.find(function(e){return e.tick===range.tick;});
        var previous=slots.filter(function(e){return e.tick<range.tick;}).pop();
        var previousEnd=previous?previous.tick+(previous.durationTicks||1):0;
        var end=range.tick+range.span;
        var replaced=slots.filter(e=>e.tick>=range.tick && e.tick<end);
        slots=slots.filter(e=>e.tick<range.tick || e.tick>=end);
        // A rest split preserves confirmed silence outside the edited interval.
        function restTail(event){
            var tailEnd=event&&event.action==='rest'?event.tick+(event.durationTicks||1):0;
            if(tailEnd>end){var tail=JSON.parse(JSON.stringify(event));tail.tick=end;tail.durationTicks=tailEnd-end;slots.push(tail);}
        }
        restTail(replaced.at(-1));
        if(previous&&previous.action==='rest'&&previousEnd>range.tick){restTail(previous);previous.durationTicks=range.tick-previous.tick;}
        const pattern=state.project.strumPatterns.find(p=>p.id===(bar.strumOverride||state.project.basicStrumPatternId));
        let leadingSustainTicks=Math.min(pattern?.leadingSustainTicks||0,range.tick);
        if(action==='sustain'){
            const last=replaced.at(-1);
            const tailEnd=last && ['down','up'].includes(last.action) ? last.tick+(last.durationTicks||1) : 0;
            if(previous){
                previous.durationTicks=Math.max(previousEnd,end,tailEnd)-previous.tick;
                if(last?.tieToNext && tailEnd>=end)previous.tieToNext=true;
            }else leadingSustainTicks=Math.max(pattern?.leadingSustainTicks||0,end,tailEnd);
        }else{
            if(previous&&previous.action!=='rest'&&previousEnd>range.tick){previous.durationTicks=range.tick-previous.tick;delete previous.tieToNext;}
            if(action!=='empty'){
                var value=old||{tick:range.tick,accent:false};
                value.action=action;
                value.durationTicks=range.span;
                if(action==='rest')value.accent=false;
                if(end!==CS().model.getBarLengthTicks(state.project)||action==='rest'||action==='mute')delete value.tieToNext;
                slots.push(value);
            }
        }
        slots.sort(function(a,b){return a.tick-b.tick;});
        const inputGrid={unit:rowResolution(bar,'strum'),beats:Array.from({length:getBeats(state.project)},(_,beat)=>getLyricBeatLocalRes(bar,beat,'strum'))};
        if(leadingSustainTicks===(pattern?.leadingSustainTicks||0) && JSON.stringify(slots)===JSON.stringify(effectiveStrumSlots(bar)) &&
            pattern?.inputGrid?.unit===inputGrid.unit &&
            inputGrid.beats.every((v,i)=>v===(pattern.inputGrid.beats[i]??null)))return;
        if (!runStructureOperation('strum', {barNumber:bar.barNumber, slots, keepEmpty:true, inputGrid, leadingSustainTicks}).ok) return;
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
            cell.className='dock-strum-cell is-'+action+' '+range.boundary;
            if(value.multiple)cell.textContent='…';
            else CS().sheetRenderer.renderStrumCell(cell,action,range.span);
            cell.dataset.strumState=action;
            if(value.multiple){cell.title='細かい位置にストロークがあります。入力すると、このマスの音価で上書きします';}
            cell.dataset.cellIndex=index;cell.dataset.slotTick=range.tick;cell.dataset.slotTicks=range.span;
            var meaning=action==='empty'?'未入力':action==='rest'?'休符':action==='sustain'?'直前のストロークを伸ばす':STRUM_GLYPHS[action]||'';
            cell.setAttribute('aria-label',bar.barNumber+'小節目 ストローク '+(index+1)+'マス目（'+(value.multiple?cell.title:meaning)+'）');
            if(!value.multiple)cell.title=meaning+' / 1回目で選択・以降はクリックごとに変更 / R・Spaceで休符 / Deleteで未入力';
            cell._cycleStroke=function(){applyStrumCellAction(bar,ranges,index,nextStrumCellAction(action,value.canSustain,false));};
            cell.addEventListener('mousedown',function(event){event.stopPropagation();});
            cell.addEventListener('keydown',function(event){onStrumCellKeydown(event,bar,ranges,index,action);});
            var host=document.createElement('div');host.appendChild(cell);
            wireEditorCell('strum',host,cell,bar,range,effectiveStrumSlots(bar).some(function (slot) { return slot.tick>=range.tick&&slot.tick<range.tick+range.span; }));
            groups[range.beat].appendChild(host);
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
        if (bar.strumOverride) return 'この小節のストロークを編集します';
        if (basic) return '曲に保存されたストロークです。セルを編集すると、この小節に反映されます';
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

    function buildLyricsGridRow(bar, globalRes) {
        var model = CS().model;
        var wrap = document.createElement('div');
        wrap.className = 'dock-lyrics-grid beat-groups';
        wrap.dataset.overlayField = 'lyrics';

        var ranges=editorCellRanges(bar,globalRes,'lyrics'),groups=editorBeatGroups(wrap,bar,globalRes,'lyrics',ranges);
        var infos=model.getBarLyricSlotRanges(state.project,bar.barNumber,ranges.map(function(r){return {slotTick:r.tick,slotTicks:r.span};}));
        ranges.forEach(function(r,i){
            var input=buildLyricCellInput(bar,r.tick,r.span,infos[i],r.boundary,i);
            var host=document.createElement('div');host.appendChild(input);
            wireEditorCell('lyrics',host,input,bar,r,!!infos[i].text);
            groups[r.beat].appendChild(host);
        });
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

    function clampLoupeWidth(width, area = getLoupeSafeArea()) {
        const max = Math.max(1, area.width - 2 * LOUPE_MARGIN);
        return Math.max(Math.min(LOUPE_MIN_WIDTH, max), Math.min(max, width));
    }

    function clampLoupeX(x, width, area = getLoupeSafeArea()) {
        const left = area.left + LOUPE_MARGIN;
        return Math.max(left, Math.min(area.right - LOUPE_MARGIN - width, x));
    }

    function clampLoupeHeight(height, area) {
        const max = Math.max(1, area.bottom - area.top - area.bottomMargin);
        return Math.max(Math.min(LOUPE_MIN_HEIGHT, max), Math.min(max, height));
    }

    function readDefaultLoupeSafeArea() {
        return {left:0, right:window.innerWidth, width:window.innerWidth, height:window.innerHeight,
            top:0, bottom:window.innerHeight, bottomMargin:LOUPE_MARGIN};
    }

    // viewport座標のまま、将来Header / Dockの境界だけを注入する。
    // providerはwidth / height / top / bottom / bottomMarginを返す。
    function wideInspectorOpen() {
        var inspector = document.getElementById('sc-melody-inspector');
        return window.innerWidth >= 1280 && inspector && !inspector.hidden;
    }
    function getLoupeSafeArea() {
        var area = loupeSafeAreaProvider ? loupeSafeAreaProvider() : readDefaultLoupeSafeArea();
        area=Object.assign({},area,{top:0});
        var transport=q('sc-transport'),transportRect=transport?.getBoundingClientRect();if(transportRect&&transportRect.top>area.top&&transportRect.top<area.bottom)area=Object.assign({},area,{bottom:transportRect.top-8,height:Math.max(1,transportRect.top-area.top-8)});
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

    function clampLoupeY(y, area = getLoupeSafeArea()) {
        const reserve = clampLoupeHeight(state.loupe.height ?? LOUPE_MIN_HEIGHT, area);
        return Math.max(area.top, Math.min(area.bottom - area.bottomMargin - reserve, y));
    }

    function editorScrollArea() {
        return els.slotOverlay.querySelector('.slot-overlay-content') || els.slotOverlay;
    }

    function saveLoupeSettings() {
        CS().storage?.setAppSetting?.(LOUPE_APP_SETTING_KEY, {...state.loupe});
    }

    function initLoupeGeometry() {
        const saved = CS().storage?.getAppSetting?.(LOUPE_APP_SETTING_KEY);
        const area = getLoupeSafeArea();
        const width = Number.isFinite(saved?.width) && saved.width > 0 ? saved.width : LOUPE_DEFAULT_WIDTH;
        state.loupe = {
            x: Number.isFinite(saved?.x) ? saved.x : area.left + (area.width - width) / 2,
            y: Number.isFinite(saved?.y) ? saved.y : area.height * 0.52,
            width,
            height: Number.isFinite(saved?.height) && saved.height > 0 ? saved.height : null
        };
    }

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
        const overlay = els.slotOverlay;
        if (!overlay) return;
        if (editorPlacement === 'right') {
            Object.assign(overlay.style, {left:'', top:'', width:'', height:'', maxHeight:''});
            overlay.classList.add('slot-overlay--narrow');
            overlay.style.removeProperty('--loupe-tool-clearance');
            return;
        }
        // Temporary shell constraints never overwrite the user's size and position.
        const area = getLoupeSafeArea();
        const loupe = state.loupe;
        const width = clampLoupeWidth(loupe.width, area);
        const x = clampLoupeX(loupe.x, width, area);
        const y = clampLoupeY(loupe.y, area);
        const availableHeight = Math.max(1, area.bottom - y - area.bottomMargin);
        Object.assign(overlay.style, {
            left:x + 'px', top:y + 'px', width:width + 'px',
            maxHeight:availableHeight + 'px',
            height:loupe.height === null ? '' : clampLoupeHeight(loupe.height, area) + 'px'
        });
        const tool = q('studio-tool-toggle')?.getBoundingClientRect();
        const headerClearance = tool?.width && y < tool.bottom ? Math.max(0, x + width - 20 - tool.left + 8) : 0;
        overlay.style.setProperty('--loupe-tool-clearance', headerClearance + 'px');
        overlay.classList.toggle('slot-overlay--narrow', isNarrowViewport() || width - headerClearance < LOUPE_NARROW_BREAKPOINT);
        positionBulkPopover();
    }

    // ドラッグを開始しない要素（ボタン・入力欄・ポップオーバー・リサイズハンドル等）
    var LOUPE_DRAG_IGNORE_SELECTOR =
        'button, input, select, textarea, a, .slot-overlay-bulk-popover, [data-loupe-resize]';

    function onLoupeHeaderPointerDown(event) {
        if(editorPlacement==='right')return;
        if (event.button !== undefined && event.button !== 0) return;
        if (event.target.closest && event.target.closest(LOUPE_DRAG_IGNORE_SELECTOR)) return;
        event.preventDefault();
        var header = event.currentTarget;
        var pointerId = event.pointerId;
        var startX = event.clientX;
        var startY = event.clientY;
        const start = els.slotOverlay.getBoundingClientRect();
        try { header.setPointerCapture(pointerId); } catch (_) { /* ignore */ }
        document.body.classList.add('loupe-dragging');

        function onMove(e) {
            if (e.pointerId !== pointerId) return;
            state.loupe.x = clampLoupeX(start.left + (e.clientX - startX), start.width);
            state.loupe.y = clampLoupeY(start.top + (e.clientY - startY));
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
        const rect = els.slotOverlay.getBoundingClientRect();
        state.loupe.x = clampLoupeX(rect.left + dx, rect.width);
        state.loupe.y = clampLoupeY(rect.top + dy);
        applyLoupeGeometry();
        saveLoupeSettings();
    }

    function onLoupeResizePointerDown(event) {
        if (editorPlacement === 'right' || event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.stopPropagation();
        const handle = event.currentTarget;
        const {pointerId, clientX, clientY} = event;
        const axis = handle.dataset.loupeResize;
        const start = els.slotOverlay.getBoundingClientRect();
        let resized = false;
        handle.setPointerCapture(pointerId);
        document.body.classList.add('loupe-resizing');
        document.body.style.setProperty('--loupe-resize-cursor', getComputedStyle(handle).cursor);

        function move(e) {
            if (e.pointerId !== pointerId) return;
            const dx = axis === 'height' ? 0 : e.clientX - clientX;
            const dy = axis === 'width' ? 0 : e.clientY - clientY;
            if (!resized && !dx && !dy) return;
            resized = true;
            const area = getLoupeSafeArea();
            const loupe = state.loupe;
            // Capture the initial rendered height so wrapping after a horizontal drag
            // cannot change it. Keep moving the origin when a growing edge hits a limit.
            loupe.height = axis === 'width' ? start.height : clampLoupeHeight(start.height + dy, area);
            if (axis !== 'height') {
                loupe.width = clampLoupeWidth(start.width + dx, area);
                loupe.x = start.left;
            }
            loupe.y = start.top;
            applyLoupeGeometry();
        }
        function end(e) {
            if (e.pointerId !== pointerId) return;
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('lostpointercapture', end);
            window.removeEventListener('pointerup', end, true);
            window.removeEventListener('pointercancel', end, true);
            document.body.classList.remove('loupe-resizing');
            document.body.style.removeProperty('--loupe-resize-cursor');
            if (resized) saveLoupeSettings();
        }
        handle.addEventListener('pointermove', move);
        handle.addEventListener('lostpointercapture', end);
        window.addEventListener('pointerup', end, true);
        window.addEventListener('pointercancel', end, true);
    }

    function buildLoupeResizeHandle(axis, title) {
        const handle = document.createElement('div');
        if (axis === 'both') handle.className = 'slot-overlay-resize-handle';
        handle.dataset.loupeResize = axis;
        handle.title = title;
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
     * 中身（コード/歌詞/メロディのまとめて入力）はD2までのロジックをそのまま再利用する。
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
            ['doremi', 'メロディ']
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
     * 紙面と同じ段順（コード/ストローク/歌詞/メロディ）を、選択小節と同じ時間軸のまま
     * コンパクトなタイムグリッドとして表示する。本格セル編集はストローク行のみ。
     * ヘッダーは1行に集約: 小節番号・セクション名・前へ/次へ・8分/16分・
     * まとめて入力・小節試聴・閉じる。
     */
    function renderSlotOverlayContent() {
        if (!els.slotOverlay) return;
        var oldViewport=els.slotOverlay.querySelector('.editor-score-scroll');
        var priorAnchor=oldViewport?.dataset.anchor,priorScroll=oldViewport?.scrollLeft||0;
        var priorStroke=oldViewport?.querySelector('[data-cell-selected][data-range-row="strum"] > :focus')?.parentElement;
        var selectedStrokeStart=priorStroke && oldViewport.querySelectorAll('[data-cell-selected]').length===1
            ? priorStroke.dataset.rangeStart : undefined;
        els.slotOverlay.querySelectorAll('[data-chord-picker]').forEach(function(root){root._disposeOwnerChord?.();});
        els.slotOverlay.innerHTML = '';
        scoreUI?.applyScoreTheme(els.slotOverlay,CS().localPaperLayout?.value.appearance.interaction);

        var bar = getSelectedBar();
        if (!bar||!editorOpen) {
            els.slotOverlay.classList.add('hidden');
            els.slotOverlay.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('dock-open');
            syncEditorRangeHighlight();
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
        [1,2,3,4].forEach(function(count){var tab=document.createElement('button');tab.type='button';tab.dataset.editorBars=count;tab.className='slot-overlay-res-btn'+(editorBars===count?' is-active':'');tab.textContent=count+'小節';tab.setAttribute('aria-pressed',String(editorBars===count));tab.title=count+'小節を並べて編集';tab.addEventListener('pointerdown',function(e){e.preventDefault();});tab.addEventListener('click',function(){if(!editorCanMove()||editorBars===count)return;stopPianoAudition();finishTextInputs();editorBars=count;editorAnchorId=state.session.draft.bars[state.selectedBarNumber-1].id;renderSlotOverlayContent();});tabs.appendChild(tab);});headActions.appendChild(tabs);
        var zoom=document.createElement('div');zoom.className='slot-overlay-res-toggle';zoom.setAttribute('role','group');zoom.setAttribute('aria-label','横方向の拡大・縮小');
        function changeHorizontalZoom(value){
            if(!scoreUI){
                prepareScorePlayback().then(()=>{if(scoreUI&&zoom.isConnected)changeHorizontalZoom(value);});
                return;
            }
            value=Math.round(Math.min(scoreUI.MAX_SCORE_ZOOM*100,Math.max(scoreUI.MIN_SCORE_ZOOM*100,value)));
            editorHorizontalZoom=value;
            els.slotOverlay.style.setProperty('--editor-horizontal-scale',String(value/100));
            els.slotOverlay.style.setProperty('--editor-horizontal-width',value+'%');
            zoomValue.textContent=value+'%';
            zoomOut.disabled=value<=scoreUI.MIN_SCORE_ZOOM*100;zoomIn.disabled=value>=scoreUI.MAX_SCORE_ZOOM*100;
        }
        function zoomButton(text,label,run){
            var button=document.createElement('button');button.type='button';button.className='slot-overlay-res-btn';
            button.textContent=text;button.title=label;button.setAttribute('aria-label',label);
            button.onclick=function(){if(editorCanMove())run();};zoom.appendChild(button);return button;
        }
        var zoomOut=zoomButton('−','横に縮小',function(){changeHorizontalZoom(editorHorizontalZoom-20);});
        var zoomValue=zoomButton('100%','横方向を100%に戻す',function(){changeHorizontalZoom(100);});
        var zoomIn=zoomButton('＋','横に拡大',function(){changeHorizontalZoom(editorHorizontalZoom+20);});
        changeHorizontalZoom(editorHorizontalZoom);headActions.appendChild(zoom);
        var placement=document.createElement('button');placement.type='button';placement.className='slot-overlay-nav-btn';placement.dataset.editorPlacement='';placement.textContent=editorPlacement==='right'?'カードに戻す':'右窓へ';placement.disabled=!CS().localEditorPane;placement.title=editorPlacement==='right'?'浮かぶ編集カードへ戻す':'既存の右ツール窓へ移動';placement.addEventListener('pointerdown',function(e){e.preventDefault();});placement.addEventListener('click',function(){if(editorCanMove())setEditorPlacement(editorPlacement==='right'?'floating':'right');});





        headActions.appendChild(buildBarPlayButton());

        var helpBtn=document.createElement('button');helpBtn.type='button';helpBtn.className='slot-overlay-nav-btn editor-help-trigger';helpBtn.textContent='？';helpBtn.dataset.editorHelpTrigger='';helpBtn.title='編集の操作ガイド';helpBtn.setAttribute('aria-label','編集の操作ガイド');helpBtn.setAttribute('aria-haspopup','dialog');helpBtn.setAttribute('aria-controls','sc-editor-help');helpBtn.setAttribute('aria-expanded','false');
        helpBtn.addEventListener('pointerdown',function(event){event.preventDefault();event.stopPropagation();});helpBtn.addEventListener('click',function(event){event.stopPropagation();openEditorHelp(helpBtn);});

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
        const windowActions = document.createElement('div');
        windowActions.className = 'editor-window-actions';
        windowActions.append(placement, helpBtn, closeBtn);
        headActions.appendChild(windowActions);
        head.appendChild(headActions);
        const content = document.createElement('div');
        content.className = 'slot-overlay-content';
        content.appendChild(head);
        els.slotOverlay.appendChild(content);

        var canonical=state.session.draft,anchor=canonical.bars.findIndex(function(b){return b.id===editorAnchorId;});
        if(editorBars===1||anchor<0||state.selectedBarNumber<anchor+1||state.selectedBarNumber>anchor+editorBars){anchor=Math.max(0,state.selectedBarNumber-1);editorAnchorId=canonical.bars[anchor].id;}
        var viewport=document.createElement('div');viewport.className='editor-score-scroll';viewport.dataset.anchor=editorAnchorId;content.appendChild(viewport);var measures=document.createElement('div');measures.className='editor-measures';measures.dataset.count=Math.min(editorBars,canonical.bars.length-anchor);measures.style.setProperty('--editor-count',measures.dataset.count);viewport.appendChild(measures);
        const displayedBars=state.project.bars.slice(anchor,anchor+editorBars);
        scoreUI?.bindScoreZoom(viewport,{read:()=>editorHorizontalZoom/100,write:value=>changeHorizontalZoom(value*100),enabled:editorCanMove});
        displayedBars.forEach(function(bar){
            var measure=document.createElement('section');measure.className='editor-measure';measure.dataset.barNumber=bar.barNumber;measure.style.setProperty('--editor-column',bar.barNumber-anchor);measure.setAttribute('aria-label',bar.barNumber+'小節目を編集');
            function activate(event){if(event.target.closest('.editor-row-tools,.editor-cell-value,[data-chord-cell-toggle]'))return;if(!activateEditorMeasure(bar.barNumber)){event.preventDefault();event.stopImmediatePropagation();if(event.type==='focus'){event.target.blur();editorRoot().querySelector('.is-invalid')?.focus({preventScroll:true});}}else if(event.type==='focus')revealEditorCell(event.target);}
            measure.addEventListener('pointerdown',activate,true);measure.addEventListener('focus',activate,true);
        // 拍ルーラー（コード/ストローク/歌詞/メロディの共通時間軸）
        var res = getStrumGridResolution(bar);
        measure.appendChild(buildBeatRuler(bar, res));

        // タイムグリッド本文: コード=1小節1セル / ストローク・歌詞=本格セル編集（F2a） /
        // メロディ=時間軸に揃えた1つの入力欄（tick位置セル分解はF3）
        var grid = document.createElement('div');
        grid.className = 'slot-overlay-grid';

        DOCK_ROW_ORDER.forEach(function (rowId) {
            var rowDef = { id: rowId, label: DOCK_ROW_LABELS[rowId] };
            var row = document.createElement('div');
            row.className = 'slot-overlay-row slot-overlay-row--' + rowId;

            var rowLabel = document.createElement('span');
            rowLabel.className = 'slot-overlay-row-label';
            var text=document.createElement('span');text.textContent=rowDef.label;rowLabel.appendChild(text);
            var tools=document.createElement('span');tools.className='editor-row-tools';if(bar===displayedBars[0])tools.appendChild(buildRowResolutionButton(displayedBars,rowId));
            if((rowId==='chord'||rowId==='doremi')&&bar.barNumber===anchor+1){
                var disclosureOwner=state.session,disclosure=document.createElement('button');disclosure.type='button';disclosure.className='editor-row-disclosure';disclosure.dataset[rowId==='chord'?'chordToggle':'pianoToggle']='';
                disclosure.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();});disclosure.addEventListener('click',function(e){e.stopPropagation();if(!disclosure.isConnected||state.session!==disclosureOwner||!editorCanMove())return;if(rowId==='chord'){var id=state.session.draft.bars[state.selectedBarNumber-1].id;bindChordCell(state.session,id,chordPicker.owner===state.session&&chordPicker.barId===id?chordPicker.tick:0);chordPicker.open=!chordPicker.open;renderSlotOverlayContent();}else togglePianoPanel();});tools.appendChild(disclosure);
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

            grid.appendChild(row);
            if(rowId==='chord'&&bar.barNumber===state.selectedBarNumber)grid.appendChild(buildChordPickerPanel());
        });

        measure.appendChild(grid);
            measures.appendChild(measure);
        });
        bindEditorRanges(viewport, priorAnchor===editorAnchorId ? selectedStrokeStart : undefined);
        measures.classList.toggle('has-fine-values',Array.from(measures.querySelectorAll('[data-slot-ticks]')).some(cell=>Number(cell.dataset.slotTicks)<120));
        content.appendChild(buildPianoPanel());
        syncEditorDisclosures();
        var legend=document.createElement('p');legend.className='strum-state-legend';legend.textContent='ストローク：↓ ダウン　↑ アップ　× ミュート　〜 伸ばす　｜　R・Spaceで休符、Deleteで空欄';content.appendChild(legend);



        els.slotOverlay.append(
            buildLoupeResizeHandle('width', '左右にドラッグして幅を変える'),
            buildLoupeResizeHandle('height', '上下にドラッグして高さを変える'),
            buildLoupeResizeHandle('both', 'ドラッグして幅と高さを変える')
        );

        els.slotOverlay.classList.remove('hidden');
        els.slotOverlay.setAttribute('aria-hidden', 'false');
        els.slotOverlay.setAttribute('aria-label', bar.barNumber + '小節目の編集');
        document.body.classList.add('dock-open');
        syncEditorRangeHighlight();refreshEditorHeader();applyLoupeGeometry();if(priorAnchor===editorAnchorId)viewport.scrollLeft=priorScroll;
    }

    function syncEditorRangeHighlight(){
        const visible=new Set(editorOpen && !els.slotOverlay.classList.contains('hidden')
            ? Array.from(els.slotOverlay.querySelectorAll('.editor-measure'),m=>m.dataset.barNumber) : []);
        for(const cell of els.scaleBox.querySelectorAll('.sheet-bar[data-bar-number]')){
            cell.classList.toggle('sc-in-editor',visible.has(cell.dataset.barNumber));
        }
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
        else syncEditorRangeHighlight();
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
            applyLoupeGeometry();
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
            if(changed && state.session && CS().localPaperLayout?.value.autoBarsPerLine && CS().localPaperLayout.automaticColumns(els.root)!==lastPaperColumns){
                playingPaperBar=null;
                renderPreview(true,true);
                if(barPreviewPhase==='playing')beginPlaybackFollow();
            }
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
    // Keep extending the selection when the pointer rests at the viewport edge.
    function createDragScroll(root,onScroll,horizontal=false,visibleBounds){
        let frame=0,x=0,y=0;
        function tick(){
            frame=0;
            const rect=visibleBounds?visibleBounds():root.getBoundingClientRect();
            const lo=Math.max(0,horizontal?rect.left:rect.top),hi=Math.min(horizontal?innerWidth:innerHeight,horizontal?rect.right:rect.bottom);
            const pos=horizontal?x:y,edge=Math.min(56,(hi-lo)/4);
            if(edge<=0)return;
            const amount=pos<lo+edge?-Math.min(1,(lo+edge-pos)/edge):pos>hi-edge?Math.min(1,(pos-hi+edge)/edge):0;
            if(!amount)return;
            const prop=horizontal?'scrollLeft':'scrollTop',before=root[prop];
            root[prop]+=Math.sign(amount)*Math.ceil(16*Math.abs(amount));
            if(root[prop]===before)return;
            frame=requestAnimationFrame(tick);
            const hit=Math.max(lo+2,Math.min(hi-2,pos));
            onScroll(horizontal?hit:x,horizontal?y:hit);
        }
        return {move(px,py){x=px;y=py;if(!frame)frame=requestAnimationFrame(tick);},
            stop(){cancelAnimationFrame(frame);frame=0;}};
    }
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
        if(!drag.scroll){
            const owner=els.root.classList.contains('sc-focused')?els.root:CS().scroll?.getRoot('sheetCruise');
            const root=(!owner||owner===window)?document.scrollingElement:owner;
            drag.scroll=createDragScroll(root,(x,y)=>extendRangeSelection({clientX:x,clientY:y,pointerId:drag.pointerId,preventDefault(){},scrolled:true}),false,()=>{
                const box=root===document.scrollingElement?{top:0,bottom:innerHeight}:root.getBoundingClientRect();
                return {top:Math.max(box.top,els.toolbar.getBoundingClientRect().bottom),bottom:Math.min(box.bottom,els.root.querySelector('.sc-bottom-transport').getBoundingClientRect().top)};
            });
        }
        if(!event.scrolled&&(drag.verticalScroll||Math.abs(event.clientY-drag.y)>5)){drag.verticalScroll=true;drag.scroll.move(event.clientX,event.clientY);}
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
    function cancelRangeSelection(){rangeDrag?.scroll?.stop();rangeDrag=null;els.scaleBox?.classList.remove('sc-range-selecting');els.toolbar?.classList.remove('sc-range-selecting');els.toolbar?.style.removeProperty('--sc-range-toolbar-height');}
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
    function prepareSheetActions(){if(!sheetActionsPending)sheetActionsPending=import('./sheet-actions.mjs?v=0.204.0-dev.1').then(function(m){sheetActions=m.createSheetActions({document:document,host:els.root,closed:refreshToolbarActions});return {module:m,ui:sheetActions};}).catch(function(){sheetActionsPending=null;return null;});return sheetActionsPending;}
    function openSheetAction(kind,trigger){
        if(!editorCanMove())return;finishTextInputs();if(!editorCanMove())return;stopPianoAudition();var owner=state.session,version=owner.snapshotVersion;
        prepareSheetActions().then(function(ready){if(!ready||state.session!==owner||owner.snapshotVersion!==version||!editorCanMove())return;
            if(kind==='history')ready.ui.history(trigger,owner,function(cursor,ticket){
                if(state.session!==owner||!editorCanMove()){setSaveStatus('曲や保存状態が変わりました。現在の内容は保持しています。履歴を開き直してください。',true);return;}var direction=cursor<owner.getHistory().cursor?'undo':'redo';if(!historyController?.can(direction)){setSaveStatus('履歴に戻せませんでした。現在の内容は保持しています。',true);return;}
                var result=owner.restoreHistory(cursor,ticket,{discardFuture:true});refreshSessionStatus();if(!result.ok)setSaveStatus('履歴が変わりました。開き直してください。現在の内容は保持しています。',true);
            },function(project){if(state.session!==owner||!state.active)return;historyPreview=project?{owner:owner,version:owner.snapshotVersion,project:project}:null;if(project&&staffView)staffView.invalidate();renderPreview(true);});
            else{var original=owner.workingSnapshot(),intent=CS().documents.ticket(),base=owner.baseRevision;
                function current(){return state.session===owner&&state.active&&CS().documents.isSelected(intent)&&owner.snapshotVersion===version&&!owner.inputPending&&!owner.commitInFlight&&!owner.conflict&&!owner.externalUpdatePending&&!textDiagnostic(owner)&&CS().repository.readRevision(owner.target).revision===base;}
                ready.ui.duplicate(trigger,original.songInfo.title,async function(name){
                    if(!current())return {ok:false,error:'曲や入力状態が変わりました。開き直してください。'};
                    var project=ready.module.copyProject(original,name,CS().model.schema2.newId(),new Date().toISOString()),check=CS().model.validateProject(project);if(!check.ok)return {ok:false,error:check.errors.join(' / ')};
                    duplicateFlight=true;
                    refreshToolbarActions();
                    let result;
                    try{
                        result=await CS().repository.save({target:{type:'project',projectId:project.projectId},baseRevision:null,snapshot:project,precondition:current});
                    }finally{
                        duplicateFlight=false;
                        refreshSessionStatus();
                    }
                    if(result.ok && current()){
                        const copy=CS().sessions.getOrCreateSession('structure',{type:'project',projectId:project.projectId});
                        showSession(copy);
                        refreshProjectSelect();
                        showSaveReceipt('曲を複製して保存しました。');
                    }
                    return result;
                });
            }
        });
    }
    function openPlaybackSettings(trigger){
        if(!editorCanMove())return;var owner=state.session;
        if(!playbackSettingsPending)playbackSettingsPending=import('./playback-settings.mjs?v=0.204.0-dev.1').then(function(module){playbackSettings=module.createPlaybackSettings({document:document,host:els.root,partChecks:()=>buildPartChecks('settings'),syncPartChecks:syncPartChecks,resetTempo:resetPracticeTempo,read:function(){return {mix:playbackMix,scoreCountIn:countInEnabled,scoreMetronome:metronomeEnabled,visualDelayMs:playbackVisualDelay,metronomeSound:metronomeSound,phase:barPreviewPhase};},toggle:function(){startPreview('song',true);},change:function(key,value,notice){
            if(key==='scorePlaybackMix'){playbackMix=module.normalizeMix(value);value=playbackMix;}else if(key==='scoreCountIn')countInEnabled=value;else if(key==='scoreMetronomeSound'){metronomeSound=['click','wood','beep','hihat'].includes(value)?value:'click';value=metronomeSound;}else if(key==='scoreVisualDelayMs'){playbackVisualDelay=Math.max(-1000,Math.min(1000,Number(value)||0));value=playbackVisualDelay;}else metronomeEnabled=value;pianoAudition?.setMix(audibleMix());refreshPracticeTransport();
            try{var raw=localStorage.getItem('cruiseStudio.appSettings'),settings=raw===null?{}:JSON.parse(raw);if(!settings||typeof settings!=='object'||Array.isArray(settings))throw Error('invalid-settings');var result=CS().storage.setAppSetting(key,value);if(!result.ok)throw Error(result.error);notice.textContent='';}catch(_){notice.textContent='設定を保存できませんでした。この画面にのみ適用しています';}
        },closed:refreshToolbarActions});return playbackSettings;}).catch(function(){playbackSettingsPending=null;setSaveStatus('音設定を読み込めませんでした',true);});
        playbackSettingsPending.then(function(settings){if(settings&&state.session===owner&&editorCanMove())settings.open(trigger);});
    }
    function prepareFormPopup(){if(!formPopupPending)formPopupPending=import('./form-popup.mjs?v=0.204.0-dev.1').then(function(m){formPopupModule=m;return m;}).catch(function(){formPopupPending=null;return null;});return formPopupPending;}
    function closePaperForm(){CS().localPaperForms?.closeZoom?.();formPopupEpoch++;if(formDialog){var dialog=formDialog;formDialog=null;dialog.noRestore=true;dialog.close();dialog.remove();}}
    async function openCatalogueFormEditor(owner,ids,fingers){
        if(owner!==state.session||!editorCanMove()||historyPreview)return;
        const C=CS(),project=owner.workingSnapshot(),ticket=C.structureOperations.capture(owner);
        const selected=new Set(ids),positions=[];
        for(const [index,bar] of project.bars.entries())for(const event of bar.chords){
            if(selected.has(event.id))positions.push('第'+(index+1)+'小節・'+(1+event.onsetTick/480)+'拍目');
        }
        if(positions.length!==selected.size||selected.size<2)return;
        let editor,picker;
        try{[editor,picker]=await Promise.all([import('./catalogue-form-editor.mjs'),prepareChordPicker()]);}catch(_){setSaveStatus('一括編集画面を開けませんでした',true);return;}
        if(!C.structureOperations.isCurrent(ticket,state.session)||!editorCanMove())return;
        const entry=C.localPaperForms.catalogue(project).find(item=>item.eventId===ids[0]);
        if(!entry)return;
        closePaperForm();
        const dialog=document.createElement('dialog');
        dialog.className='sc-playback-dialog sc-catalogue-edit';
        els.root.append(dialog);formDialog=dialog;
        dialog.addEventListener('close',()=>{if(formDialog===dialog)formDialog=null;dialog.remove();},{once:true});
        dialog.showModal();
        let auditioning=false;
        function play(plan,scope){auditioning=true;playPreviewPlan(plan,scope);}
        function stop(){if(auditioning){auditioning=false;stopPianoAudition();}}
        editor.buildCatalogueEditor(dialog,{project,entry,ids,positions,fingers,picker,schema:C.model.schema2,play,stop,
            previewState:()=>({phase:barPreviewPhase,scope:barPreviewScope}),
            subscribePreview(listener){chordPreviewListeners.add(listener);return ()=>chordPreviewListeners.delete(listener);},
            progression(draft,index){
                if(auditioning&&barPreviewScope==='chords'&&barPreviewPhase!=='idle'){stop();return;}
                const deps=previewDependencies(draft,false);deps.chordsOnly=true;
                play(buildBarPreviewPlan(draft,index,deps),'chords');
            },
            apply(symbol,replacement,range,pendingFingers){
                if(!C.structureOperations.isCurrent(ticket,state.session))return {ok:false,error:'譜面が変わりました。開き直してください。'};
                const result=C.localChordForms.replaceCatalogueForms(owner,ids,symbol,replacement,range,pendingFingers);
                if(result.ok){closePaperForm();redrawSession(false);setSaveStatus(ids.length+'箇所を変更しました（未保存）');}
                return result;
            }
        });
    }
    function editRegisteredForm(owner,eventId){
        if(owner!==state.session||!editorCanMove()||historyPreview)return;
        const project=owner.workingSnapshot(),index=project.bars.findIndex(bar=>bar.chords.some(chord=>chord.id===eventId));
        if(index<0)return;
        const bar=project.bars[index],chord=bar.chords.find(item=>item.id===eventId);
        selectedBarIds=[];rangeAnchor=index+1;
        selectBarRange(index+1,false);
        collapsedEditorRows.delete('chord');
        Object.assign(chordPicker,{open:true,owner,barId:bar.id,tick:chord.onsetTick,formEventId:eventId,formEntry:{unopened:true}});
        editSelectedBar();
        if(editorPlacement!=='right'){
            state.loupe.y=clampLoupeY(Math.min(112,getLoupeSafeArea().height*0.12));
            applyLoupeGeometry();
        }
        editorScrollArea().scrollTop=0;
    }
    async function openPaperForm(cell,eventId,tick,fromEditor=false,positions=null){
        if(!editorCanMove()||!CS().localPaperForms)return;
        var p=state.session.workingSnapshot(),number=positions?p.bars.findIndex(bar=>bar.chords.some(event=>event.id===eventId))+1:Number(cell.dataset.barNumber),chord=p.bars[number-1]?.chords.find(function(c){return eventId?c.id===eventId:c.onsetTick===tick;}),binding=chord&&p.performance.formBindings.find(function(b){return b.chordEventId===chord.id;}),material=binding&&p.materials.forms.find(function(m){return m.id===binding.materialId;});
        if(!material){setSaveStatus('このコードのフォームは未登録です');return;}
        var owner=state.session,ticket=CS().structureOperations.capture(owner),barId=p.bars[number-1].id,request=++formPopupEpoch;
        if(!formPopupModule&&!await prepareFormPopup()){setSaveStatus('フォームを開けませんでした',true);return;}
        if(request!==formPopupEpoch||state.session!==owner||!cell.isConnected||!CS().structureOperations.isCurrent(ticket,owner)||!editorCanMove())return;
        closePaperForm();var previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='sc-form-dialog sc-unified-form'+(positions?' sc-readonly-form':'');dialog.dataset.paperFormDetail=chord.id;dialog.setAttribute('aria-label',chord.symbol+'のコードフォーム');els.root.appendChild(dialog);formDialog=dialog;
        const shown=formPopupModule.automaticVoicingSnapshot(chord,material,binding)||material.snapshot;
        function continueFormEdit(ids,fingers){
            if(state.session!==owner||!CS().structureOperations.isCurrent(ticket,owner))return;
            closePaperForm();
            if(ids?.length>1)openCatalogueFormEditor(owner,ids,fingers);
            else editRegisteredForm(owner,ids?.[0]||chord.id);
        }
        formPopupModule.createFormPopup({document:document,dialog:dialog,positions,onDetail:continueFormEdit,onEdit:fromEditor?undefined:continueFormEdit,applyFingers:function(ids,changes){
            if(state.session!==owner||!CS().structureOperations.isCurrent(ticket,owner))return {ok:false,error:'譜面が変わりました。開き直してください。'};
            const result=CS().localChordForms.changeFingers(owner,ids||[chord.id],changes);
            if(result.ok){ticket=CS().structureOperations.capture(owner);closePaperForm();redrawSession(false);setSaveStatus('運指を変更しました（未保存）');}
            return result;
        },symbol:chord.symbol,snapshot:shown,playedStrings:shown===material.snapshot?binding.playedStrings:shown.strings.filter(n=>n.kind==='note').map(n=>n.string),diagram:CS().localPaperForms.diagram,detectBarres:window.ChordCruise.caged.detectBarres,apply:function(draft){
            if(state.session!==owner||!CS().structureOperations.isCurrent(ticket,owner))return {ok:false,error:'編集対象が変わりました。開き直してください'};
            draft.snapshot.playability='unknown';draft.snapshot.ownerWarning='変更した押さえ方は未確認';
            var authored=CS().localChordForms.material(draft.snapshot,chord.symbol,'manual',material.provenance.externalMaterialId,material.provenance.shape);
            var result=CS().localChordForms.adopt(owner,barId,chord.id,authored,draft.playedStrings);if(result.ok){ticket=CS().structureOperations.capture(owner);closePaperForm();redrawSession(false);setSaveStatus('フォームを変更しました（未保存）');}return result;
        }});
        dialog.addEventListener('close',function(){if(formDialog===dialog)formDialog=null;dialog.remove();if(!dialog.noRestore&&previous?.isConnected)previous.focus({preventScroll:true});});dialog.addEventListener('keydown',function(e){e.stopPropagation();if(e.isComposing||e.keyCode===229)return;if((e.ctrlKey||e.metaKey)&&['s','z'].includes(e.key.toLowerCase()))e.preventDefault();});dialog.showModal();
    }
    function editSelectedBar(){if(emptySlotSelection?.owner===state.session){openScoreSettings('slot',{slot:emptySlotSelection.slot});return;}if(!editorCanMove()||!getSelectedBar())return;editorOpen=true;syncSheetSelection();els.slotOverlay.focus({preventScroll:true});}
    function copySelectedBar(){
        if(!editorCanMove()||!selectedIDs().length)return false;finishTextInputs();if(!editorCanMove())return false;
        var source=state.session.workingSnapshot(),ids=selectedIDs();barClipboards.set(state.session,{source:source,sourceBarIds:ids});refreshToolbarActions();setSaveStatus(ids.length+'小節をコピーしました（このProject内）');return true;
    }
    function pasteSelectedBar(insert){
        insert=insert===true;
        if(!editorCanMove())return false;
        var range=selectedRangeNumbers(),first=range[0]??state.selectedBarNumber;
        var clip=barClipboards.get(state.session),bar=state.session.draft.bars[first-1],empty=emptySlotSelection?.owner===state.session?emptySlotSelection.slot:null;if(!clip||(!bar&&!empty))return false;
        if(!insert&&selectedBarIds.length>1&&selectedBarIds.length!==clip.sourceBarIds.length){setSaveStatus('コピーした小節数と貼り付け先の選択数を合わせてください',true);return false;}
        var targets;
        if(!insert){
            if(range.length)targets=range.map(n=>({barId:state.session.draft.bars[n-1].id}));
            else{
                var cells=Array.from(els.scaleBox.querySelectorAll('.sheet-line > .sheet-bar'));
                var start=cells.findIndex(cell=>bar?Number(cell.dataset.barNumber)===first:cell.dataset.emptySlot===emptySlotSelection.key);
                targets=cells.slice(start,start+clip.sourceBarIds.length).map(cell=>cell.dataset.emptySlot?JSON.parse(cell.dataset.emptySlot):{barId:state.session.draft.bars[Number(cell.dataset.barNumber)-1].id});
            }
        }
        var oldIds=new Set(state.session.draft.bars.map(function(b){return b.id;})),result=runStructureOperation('pasteBars',{barId:bar?.id,slot:empty,source:clip.source,sourceBarIds:clip.sourceBarIds,targetSlots:targets,insert:insert===true});
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
    function openPaperDisplay(sectionId){if(!editorCanMove())return;finishTextInputs();stopPianoAudition();var project=state.session.workingSnapshot(),version=state.session.snapshotVersion;CS().localPaperLayout.open(els.root,{project:project,sectionId:sectionId,selectedBarNumber:state.selectedBarNumber||1,createPreviewAudio:function(options){return createLayoutPreview(project,options);},getVisibility:function(){return effectivePaperVisibility(project);},getRenderOptions:function(){return paperRenderOptions(project,version);}});refreshToolbarActions();}
    function onPreviewClick(event) {
        if(event.defaultPrevented)return;if(performance.now()<rangeClickUntil){rangeClickUntil=0;event.preventDefault();event.stopPropagation();return;}
        var marker=event.target.closest?.('[data-layout-section]');if(marker){event.stopPropagation();openPaperDisplay(marker.dataset.layoutSection);return;}
        var metadata=event.target.closest?.('[data-paper-edit]');if(metadata&&metadata.dataset.paperEdit){event.stopPropagation();var field=metadata.dataset.paperEdit;openScoreSettings(field==='section'?'sections':field==='rhythm'?'rhythm':'settings',{field:field,returnFocus:metadata,sectionId:metadata.dataset.sectionId});return;}
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
        if(els.showForms)els.showForms.checked=show.forms;if(q('sc-show-form-list'))q('sc-show-form-list').checked=show.formList===true;
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

    function scorePresentation(project){
        const presentation=CS().localPaperLayout?.exportPresentation(project,effectivePaperVisibility(project));
        if(!presentation)return presentation;
        const settings=state.lyricBeatResV2.get(state.session),gridRows=[];
        for(const bar of state.project.bars){
            const map=settings?.get(bar.sourceId);
            if(!map)continue;
            const rows={};
            const pattern=state.project.strumPatterns.find(p=>p.id===(bar.strumOverride||state.project.basicStrumPatternId));
            const length=CS().model.getBarLengthTicks(state.project);
            for(const row of ['chord','strum','lyrics','doremi']){
                const fallback=row==='strum'?CS().model.strumInputGrid(pattern,length):
                    {unit:CS().sheetRenderer.defaultRowUnit(bar,row,presentation.layout.gridResolution),beats:[]};
                if(row==='strum'&&(map.get('strumMaterial')!==pattern?.id||map.get('strumLength')!==length))continue;
                const unit=effectiveRowUnit(map,row),beats=Array.from({length:length/480},(_,i)=>map.get(row==='lyrics'?i:row+':'+i)??null);
                if(unit!==fallback.unit||beats.some((v,i)=>v!==(fallback.beats[i]??null)))rows[row]={unit,beats};
            }
            if(Object.keys(rows).length)gridRows.push({barId:bar.sourceId,rows});
        }
        if(gridRows.length)presentation.gridRows=gridRows;
        return presentation;
    }

    var viewerExportFlight=false;
    async function downloadProjectPDF(){
        if(viewerExportFlight||!prepareExplicitOutput())return;var owner=state.session,version=owner.snapshotVersion,project=owner.workingSnapshot(),presentation=scorePresentation(project)||{};viewerExportFlight=true;refreshToolbarActions();
        try{await CS().scoreViewer.pdf(project,presentation,{isCurrent:function(){return state.active&&state.session===owner&&owner.snapshotVersion===version&&!owner.inputPending&&!textDiagnostic(owner);},notify:function(text,error){setSaveStatus(text,error);}});}catch(error){setSaveStatus('PDFを作成できませんでした。元の譜面は保持しています',true);}finally{viewerExportFlight=false;refreshToolbarActions();}
    }
    async function downloadViewerScore() {
        if(viewerExportFlight||!prepareExplicitOutput())return;
        var owner=state.session,version=owner.snapshotVersion,project=owner.workingSnapshot(),presentation=scorePresentation(project)||{};
        viewerExportFlight=true;refreshToolbarActions();
        try{
            var module=await import('./viewer-contract.mjs?v=0.204.0-dev.1'),contract=module.createStudioViewerContract({schema:CS().model.schema2});
            var hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(project.projectId));
            var documentId='score-'+Array.from(new Uint8Array(hash),function(n){return n.toString(16).padStart(2,'0');}).join('');
            var result=await contract.codec.encode(project,{documentId:documentId,revisionId:crypto.randomUUID(),exportedAt:new Date().toISOString(),studioVersion:CS().releaseFeatures?.scoreVersion||'0.204.0-dev.1',defaultPresentation:presentation});
            if(!state.active||state.session!==owner||owner.snapshotVersion!==version||owner.inputPending||textDiagnostic(owner)){setSaveStatus('曲や入力状態が変わったため、書き出しを中止しました',true);return;}
            var exportedEntry=await CS().scoreViewer.add(result.text,{isCurrent:function(){return state.active&&state.session===owner&&owner.snapshotVersion===version&&!owner.inputPending&&!textDiagnostic(owner);}});
            if(!exportedEntry){setSaveStatus('書き出しをキャンセルしました');return;}
            setSaveStatus('譜面ビューワーのライブラリに追加しました');
            await CS().scoreViewer.completed(exportedEntry);
        }catch(error){setSaveStatus('ビューワー用の書き出しに失敗しました。元の譜面は保持しています',true);}
        finally{viewerExportFlight=false;refreshToolbarActions();}
    }
    function createProjectDownloadLink() {
        if(!prepareExplicitOutput())return null;
        var project = state.session.workingSnapshot();
        var json = CS().storage.exportProjectJson(project, scorePresentation(project));
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var title = state.project.songInfo.title || 'project';
        a.href = url;
        a.download = 'cruise-studio_' + title.replace(/[\\/:*?"<>|\s]+/g, '_') + '.json';
        return a;
    }
    function downloadCurrentProjectJson() {
        const link=createProjectDownloadLink();
        if(!link)return false;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
        setSaveStatus('JSONファイルへ書き出しました');
        return true;
    }

    async function pickScoreJson(){
        if(typeof window.showOpenFilePicker!=='function'){els.importInput.click();return;}
        const intent=CS().documents.ticket(),frame=CS().structureOperations.capture(state.session);
        try{
            const [handle]=await window.showOpenFilePicker({types:[{description:'譜面ファイル',accept:{'application/json':['.json']}}]});
            const file=await handle.getFile();
            if(!CS().documents.isSelected(intent)||!CS().structureOperations.isCurrent(frame,state.session))return;
            document.getElementById('sc-curve-menu').open=false;
            importScoreJson(file,handle);
        }catch(error){
            if(error.name==='SecurityError')els.importInput.click();
            else if(error.name!=='AbortError')setSaveStatus('ファイルを開けませんでした。もう一度選んでください。',true);
        }
    }
    function onImportJsonFile(event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = '';
        if(file)importScoreJson(file);
    }
    function importScoreJson(file,sourceHandle){
        var reader = new FileReader();
        var intent = CS().documents.ticket(), importFrame = CS().structureOperations.capture(state.session);
        reader.onload = async function () {
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
            // File copies share an embedded project ID, but must not share a draft or overwrite handle.
            const sourceId=res.project.projectId, filename=file.name.normalize('NFC');
            const importKey='cruiseStudio.scoreImport.'+JSON.stringify([sourceId,filename]);
            let id=localStorage.getItem(importKey)||sourceId;
            restoreFileHandle(id);
            await handleReads.get(id);
            if(!CS().documents.isSelected(intent)||!CS().structureOperations.isCurrent(importFrame,state.session))return;
            const knownName=scoreFileName(id);
            if(knownName && knownName.normalize('NFC')!==filename)id=CS().model.schema2.newId();
            res.project.projectId=id;
            var warnText = res.warnings.length ? '（警告: ' + res.warnings.join(' / ') + '）' : '';
            const imported=setProject(res.project, {
                dirty: true,
                presentation: res.presentation,
                importName: file.name,
                statusMessage: 'JSONを読み込みました（未保存）' + warnText
            });
            if(!imported)return;
            if(id!==sourceId)localStorage.setItem(importKey,id);
            if(typeof window.showOpenFilePicker==='function'){
                // Remember where the file came from independently of its future overwrite target.
                await storedHandle(['import',id],sourceHandle||null).catch(()=>{});
            }
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

    const draftPrefix='cruiseStudio.scoreDraft.',draftVersions=new WeakMap(),fileSaves=new WeakSet();
    const fileHandles=new Map(),handleReads=new Map();
    let fileDatabase;
    const draftWriter=window.crypto?.randomUUID?.()||String(Date.now())+Math.random(),recoverySources=new WeakMap();
    function recoveryKeys(id){
        const prefix=draftPrefix+encodeURIComponent(id)+':';
        return Object.keys(localStorage).filter(key=>key.startsWith(prefix));
    }
    function draftRecord(id,revision){
        try{
            return recoveryKeys(id).map(key=>({...JSON.parse(localStorage.getItem(key)),key}))
                .filter(record=>record.base===revision).sort((a,b)=>b.time-a.time)[0];
        }catch{return null;}
    }
    function backupDraft(session){
        if(session.domain!=='structure'||session.inputPending)return;
        const key=draftPrefix+encodeURIComponent(session.target.projectId)+':'+draftWriter;
        try{
            if(!session.dirty){
                if(draftVersions.has(session)){
                    localStorage.removeItem(key);draftVersions.delete(session);

                }
                return;
            }
            if(draftVersions.get(session)===session.snapshotVersion)return;
            localStorage.setItem(key,JSON.stringify({time:Date.now(),base:session.baseRevision,project:session.workingSnapshot()}));
            draftVersions.set(session,session.snapshotVersion);
            const source=recoverySources.get(session);
            if(source && source.key!==key && JSON.parse(localStorage.getItem(source.key))?.time===source.time)localStorage.removeItem(source.key);
            recoverySources.delete(session);
        }catch{setSaveStatus('下書きをブラウザに保存できません。曲を保存してください。',true);}
    }
    function restoreFileHandle(id){
        if(typeof window.showSaveFilePicker!=='function' || handleReads.has(id))return;
        const read=storedHandle(id).then(handle=>{
            if(!handle || fileHandles.has(id))return;
            fileHandles.set(id,handle);
            const option=Array.from(els.projectSelect.options).find(item=>item.value===id);
            if(option){
                if(state.session?.target.projectId===id)refreshSessionStatus();
                else option.textContent=scoreFileName(id);
            }
        }).catch(()=>{ /* A browser-only song can still be opened by its title. */ });
        handleReads.set(id,read);
    }
    function storedHandle(id,handle){
        if(!fileDatabase)fileDatabase=new Promise((resolve,reject)=>{
            const req=indexedDB.open('cruiseStudio.scoreFiles',1);
            req.onupgradeneeded=()=>req.result.createObjectStore('handles');
            req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
        });
        return fileDatabase.then(db=>new Promise((resolve,reject)=>{
            const tx=db.transaction('handles',handle===undefined?'readonly':'readwrite'),store=tx.objectStore('handles');
            const req=handle===null?store.delete(id):handle?store.put(handle,id):store.get(id);
            tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error);
        }));
    }
    let saveNoticeEvents=null;
    function dismissSaveNotice(){
        saveNoticeEvents?.abort();
        saveNoticeEvents=null;
        q('sc-save-notice')?.remove();
    }
    function showSaveNotice(message){
        dismissSaveNotice();
        const notice=document.createElement('div');
        notice.id='sc-save-notice';notice.setAttribute('role','status');
        els.root.append(notice);
        notice.textContent=message;
        saveNoticeEvents=new AbortController();
        const options={capture:true,passive:true,signal:saveNoticeEvents.signal};
        function dismissOutside(event){
            if(notice.contains(event.target)||event.key==='Tab')return;
            dismissSaveNotice();
        }
        for(const type of ['pointerdown','click','keydown','input','change','wheel']){
            document.addEventListener(type,dismissOutside,options);
        }
        notice.addEventListener('click',()=>{
            setTimeout(()=>{if(notice.isConnected)dismissSaveNotice();},0);
        });
        return notice;
    }
    function showSaveReceipt(message='保存しました。', { recommendChrome = false } = {}){
        const notice=showSaveNotice(message);
        const location=document.createElement('button');
        location.type='button';
        location.textContent='保存場所';
        location.onclick=showFileLocation;
        notice.append('(',location,')');
        if (recommendChrome) {
            const note = document.createElement('span');
            note.className = 'sc-browser-save-note';
            note.append('Google Chromeを推奨します。(', browserSaveHelp(), ')');
            notice.append(note);
        }
    }
    function bindBrowsingCard(dialog,options){
        // The file menu is available even before the playback UI has finished loading.
        if(scoreUI)scoreUI.bindOutsideDismiss(dialog,options);
        else import('../score-ui.mjs?v=0.204.0-dev.1').then(ui=>{
            if(dialog.open)ui.bindOutsideDismiss(dialog,options);
        });
    }
    function fileDialog(heading,{browse=false}={}){
        const dialog=document.createElement('dialog'),title=document.createElement('h2');
        dialog.className='sc-location-dialog sc-save-place';
        dialog.setAttribute('aria-label',heading);title.textContent=heading;
        const parent=leavePending?.saving ? CS().shellHost.modal.getActive() : null;
        dialog.append(title);(parent || els.root).append(dialog);
        if(browse)bindBrowsingCard(dialog);
        dialog.addEventListener('close',()=>dialog.remove(),{once:true});
        return dialog;
    }
    function dialogButton(text,action,primary=false){
        const button=document.createElement('button');
        button.type='button';button.textContent=text;
        button.className=primary?'btn-primary':'btn-ghost';button.onclick=action;
        return button;
    }
    function openMoreFileActions(){
        const dialog=fileDialog('その他のファイル操作',{browse:true}),list=document.createElement('div');
        list.className='sc-file-command-list';
        const direct=new Set(Array.from(els.projectSelect.querySelectorAll('[data-file-action]'),o=>o.dataset.fileAction));
        for(const command of els.toolbar.querySelectorAll('#sc-curve-menu [data-file-command]')){
            if(direct.has(command.id))continue;
            const button=dialogButton(command.textContent.trim(),()=>{dialog.close();command.click();});
            button.disabled=command.disabled;list.append(button);
        }
        const footer=document.createElement('footer');
        footer.append(dialogButton('閉じる',()=>dialog.close()));
        dialog.append(list,footer);dialog.showModal();
    }
    function browserSaveHelp(){
        const help=document.createElement('a');
        help.href='/apps/cruise-studio/score-guide/index.html#browser-saving';
        help.target='_blank';help.rel='noopener';help.textContent='詳しく';
        help.setAttribute('aria-label','ブラウザによる保存方法の違いを詳しく見る');
        return help;
    }
    function storageBrowserName(){
        // This label describes the current browser. Its APIs determine save behavior.
        const ua=navigator.userAgent;
        if(/Edg(?:e|A|iOS)?\//.test(ua))return 'Microsoft Edge';
        if(/Firefox\/|FxiOS\//.test(ua))return 'Firefox';
        if(/Chrome\/|CriOS\//.test(ua))return 'Google Chrome';
        if(/Safari\//.test(ua))return 'Safari';
        return 'このブラウザ';
    }
    const reminderKey='scoreFilePermissionReminder';
    function reminderSelect(setting){
        const label=document.createElement('label'),select=document.createElement('select');
        label.className='sc-reminder-frequency';label.append('この案内',select);
        for(const [value,text] of [['always','毎回表示する'],['sometimes','ときどき表示する（30日ごと）'],['never','次回から表示しない']]){
            select.add(new Option(text,value));
        }
        select.value=setting?.mode||'always';
        return {label,select};
    }
    function confirmFileSave(setting){
        const dialog=fileDialog('ファイル保存時のご案内'),text=document.createElement('p');
        text.textContent='保存画面の「警告」は、選んだ譜面ファイルに編集内容を書き込むための、ブラウザの通常の確認です。';
        const reassurance=document.createElement('p');
        reassurance.textContent='アプリやブラウザに問題があるわけではありません。';
        const source=document.createElement('a');
        source.href='https://developer.chrome.com/docs/capabilities/web-apis/file-system-access?hl=ja#security_and_permissions';
        source.target='_blank';source.rel='noopener noreferrer';
        source.className='sc-save-source';source.textContent='Chrome公式の説明（日本語）';
        const {label,select}=reminderSelect(setting),footer=document.createElement('footer');
        return new Promise(resolve=>{
            const proceed=dialogButton('保存を続ける',()=>{
                CS().storage.setAppSetting(reminderKey,{mode:select.value,lastShown:Date.now()});
                dialog.close('continue');
            },true);
            footer.append(dialogButton('キャンセル',()=>dialog.close()),proceed);
            dialog.append(text,reassurance,source,label,footer);
            dialog.addEventListener('close',()=>resolve(dialog.returnValue==='continue'),{once:true});
            dialog.showModal();proceed.focus();
        });
    }
    async function openFileList(){
        const ownerSession=state.session;
        await Promise.all(handleReads.values());
        if(!state.active || state.session!==ownerSession)return;
        const dialog=document.createElement('dialog'),list=document.createElement('div'),title=document.createElement('h2');
        const message=document.createElement('p'),close=document.createElement('button');
        dialog.className='sc-location-dialog sc-file-list';dialog.setAttribute('aria-label','ファイル一覧');
        title.textContent='ファイル一覧';message.setAttribute('role','status');close.className='btn-ghost';close.textContent='閉じる';close.onclick=()=>dialog.close();
        let deleting=false;
        function refresh(){
            refreshProjectSelect();list.replaceChildren();
            const saved=new Set(CS().storage.listProjects().map(meta=>meta.projectId));
            for(const item of els.projectSelect.querySelectorAll(':scope > option:not([data-more-file-actions])')){
                const id=item.value,target={type:'project',projectId:id},row=document.createElement('div');
                const name=document.createElement('button'),remove=document.createElement('button');
                name.textContent=item.textContent;name.title='この曲を開く';remove.textContent='削除';
                remove.setAttribute('aria-label',item.textContent+'を削除');row.append(name,remove);list.append(row);
                name.onclick=()=>{dialog.close();if(state.session.target.projectId!==id)switchSong(()=>openProject(id));};
                remove.onclick=async()=>{
                    if(deleting)return;
                    const owner=CS().sessions.getSession('structure',target),record=CS().repository.read(target);
                    if(!record.ok||owner?.inputPending||owner?.commitInFlight||fileSaves.has(owner)){
                        message.textContent=record.error||'入力・保存の完了後にもう一度お試しください。';return;
                    }
                    if(saved.has(id)!==record.exists){message.textContent='曲の状態が変わりました。もう一度選んでください。';refresh();return;}
                    deleting=true;
                    const version=owner?.snapshotVersion;
                    const canBrowse=typeof window.showOpenFilePicker==='function';
                    if(canBrowse){restoreFileHandle(id);await handleReads.get(id);}
                    const savedHandle=fileHandles.get(id);
                    const location=savedHandle || (canBrowse && await storedHandle(['import',id]).catch(()=>null));
                    if(!dialog.open)return;
                    const confirm=fileDialog('削除の確認'),description=document.createElement('strong'),actions=document.createElement('footer');
                    confirm.classList.add('sc-delete-confirm');
                    description.textContent=item.textContent;
                    const note=document.createElement('p');
                    note.className='sc-delete-note';
                    if(location || scoreFileName(id))note.textContent='一覧から削除しても、パソコンのJSONファイルは残ります。';
                    else if(record.exists)note.textContent='このブラウザに保存した曲と、その下書きを削除します。';
                    else note.textContent='このブラウザにある未保存の下書きを削除します。';
                    confirm.append(description,note);
                    if(canBrowse && location){
                        const hint=document.createElement('p');
                        hint.className='sc-save-footnote';hint.hidden=true;hint.setAttribute('role','status');
                        actions.append(folderButton(location,hint,'元のフォルダを開く'));
                        confirm.append(hint);
                    }else if(scoreFileName(id)){
                        const hint=document.createElement('p');
                        hint.className='sc-save-footnote';hint.textContent='元のファイルは、パソコンで「'+scoreFileName(id)+'」を検索して確認できます。';
                        confirm.append(hint);
                    }
                    const cancel=dialogButton('キャンセル',()=>confirm.close());
                    cancel.autofocus=true;
                    actions.append(cancel,dialogButton('削除する',()=>confirm.close('delete')));
                    confirm.append(actions);
                    const accepted=new Promise(resolve=>confirm.addEventListener('close',()=>resolve(confirm.returnValue==='delete'),{once:true}));
                    confirm.showModal();
                    if(!await accepted){deleting=false;remove.focus();return;}
                    list.inert=true;
                    try{
                        if(CS().sessions.getSession('structure',target)!==owner || owner?.snapshotVersion!==version || owner?.inputPending || owner?.commitInFlight || fileSaves.has(owner))
                            throw Error('曲の状態が変わりました。もう一度選んでください。');
                        if(record.exists){
                            const result=await CS().repository.remove(target,record.revision);
                            if(!result.ok)throw Error(result.error||'保存済みの曲を削除できませんでした。');
                        }
                        if(owner){
                            const result=await CS().sessions.destroySession(owner,{discard:true});
                            if(!result.ok)throw Error(result.error);
                        }
                        for(const key of recoveryKeys(id))localStorage.removeItem(key);
                        if(state.session?.target.projectId===id){
                            const other=Array.from(els.projectSelect.querySelectorAll(':scope > option:not([data-more-file-actions])')).find(o=>o.value!==id);
                            if(!other||!openProject(other.value))createNewProject(false);
                        }
                        localStorage.removeItem(fileLabelPrefix+id);
                        await handleReads.get(id);handleReads.delete(id);fileHandles.delete(id);
                        if(canBrowse)await storedHandle(['import',id],null);
                        if(typeof window.showSaveFilePicker==='function')await storedHandle(id,null);
                        message.textContent='「'+item.textContent+'」を削除しました。';
                    }catch(error){message.textContent=error.message;}
                    finally{deleting=false;list.inert=false;refresh();}
                };
            }
        }
        const footer=document.createElement('footer');footer.append(close);
        dialog.append(title,list,message,footer);els.root.append(dialog);refresh();bindBrowsingCard(dialog,{canClose:()=>!list.inert});dialog.showModal();
        dialog.onclose=()=>dialog.remove();
    }

    function folderButton(handle,hint,label,primary=false){
        return dialogButton(label,async()=>{
            try{await window.showOpenFilePicker({startIn:handle,multiple:false});}
            catch(error){
                if(error.name!=='AbortError'){
                    hint.hidden=false;
                    hint.textContent='フォルダを開けませんでした。パソコンで「'+handle.name+'」を検索してください。';
                }
            }
        },primary);
    }
    async function showFileLocation(){
        const session=state.session;
        if(!session)return;
        const id=session.target.projectId;
        await handleReads.get(id);
        if(state.session!==session)return;
        const handle=fileHandles.get(id), saved=session.baseRevision!==null;
        const dialog=fileDialog('保存場所',{browse:true}),place=document.createElement('strong'),hint=document.createElement('p');
        const direct=typeof window.showSaveFilePicker==='function';
        place.textContent=handle?handle.name:saved?storageBrowserName()+'のサイトデータ（このパソコン内）':'この曲はまだ保存されていません。';
        if(handle){
            hint.hidden=true;
        }else{
            hint.textContent=saved?'曲をここから別のフォルダへ直接移動することはできません。ファイルとして持ち出すには「JSON書き出し」を使います。':'「保存」を押すと、この曲を保存できます。';
        }
        dialog.append(place,hint);
        if(!handle){
            const note=document.createElement('p');
            note.className='sc-save-footnote';
            note.append(direct?'※「名前をつけて保存」で、保存先のフォルダを指定できます。':'※ Chromeでは「名前をつけて保存」でフォルダを指定できます。',' ',browserSaveHelp());
            dialog.append(note);
        }
        const footer=document.createElement('footer');
        footer.append(dialogButton('閉じる',()=>dialog.close()));
        if(handle && typeof window.showOpenFilePicker==='function'){
            footer.append(folderButton(handle,hint,'保存フォルダを開く',true));
        }
        dialog.append(footer);
        if(direct){
            const details=document.createElement('details'),summary=document.createElement('summary');
            summary.textContent='保存時の案内設定';
            const {label,select}=reminderSelect(CS().storage.getAppSetting(reminderKey));
            select.onchange=()=>CS().storage.setAppSetting(reminderKey,{mode:select.value,lastShown:Date.now()});
            details.append(summary,label);dialog.append(details);
        }
        dialog.showModal();
    }
    function openExportGuide(){
        const link=createProjectDownloadLink();
        if(!link)return;
        const session=state.session,version=session.snapshotVersion;
        const dialog=fileDialog('名前をつけて保存',{browse:true});
        const explanation=document.createElement('p');
        const browser=storageBrowserName();
        explanation.textContent=(browser==='Safari'||browser==='Firefox'?browser:'この環境')+'では「名前をつけて保存」は使えません。';
        const alternative=document.createElement('p');
        link.textContent='JSONを書き出す';
        alternative.className='sc-export-instructions';
        alternative.append(link,'と、ブラウザで指定したダウンロード先に譜面ファイルを保存できます。');
        link.addEventListener('click',event=>{
            if(state.session!==session || session.snapshotVersion!==version){
                event.preventDefault();
                showSaveNotice('曲が変わりました。もう一度「名前をつけて保存」を開いてください。');
            }else{
                setSaveStatus('JSONファイルへ書き出しました');
            }
            dialog.close();
        });
        dialog.addEventListener('close',()=>URL.revokeObjectURL(link.href),{once:true});
        const note=document.createElement('p');
        note.className='sc-save-footnote';
        note.append('パソコン版Chrome・Edgeでは、保存時にフォルダとファイル名を選べます。',' ',browserSaveHelp());
        const footer=document.createElement('footer');
        footer.append(dialogButton('閉じる',()=>dialog.close()));
        dialog.append(explanation,alternative,note,footer);
        dialog.showModal();
    }
    async function commitSession(session,{chooseFile=false}={}){
        if(fileSaves.has(session))return {ok:false,error:'保存中です'};
        session.finishTextGroup();
        if(!session.canCommit())return {ok:false,error:'保存できる状態を確認してください'};
        const id=session.target.projectId,version=session.snapshotVersion,project=session.workingSnapshot();
        fileSaves.add(session);
        try{
            if(typeof window.showSaveFilePicker!=='function')return await commitBrowserSession(session);
            const check=CS().model.validateProject(project);if(!check.ok)throw Error(check.errors.join(' / '));
            const setting=CS().storage.getAppSetting(reminderKey);
            const recent=setting?.mode==='sometimes' && Date.now()-setting.lastShown<30*24*60*60*1000;
            if(setting?.mode!=='never' && !recent){
                if(!await confirmFileSave(setting))throw new DOMException('キャンセル','AbortError');
                if(session.snapshotVersion!==version || !session.canCommit())throw Error('曲の状態が変わりました。確認してからもう一度保存してください。');
            }
            const json=CS().storage.exportProjectJson(project,scorePresentation(project));
            let handle;
            if(!chooseFile){
                await handleReads.get(id);
                handle=fileHandles.get(id);
            }
            if(handle && handle.requestPermission && await handle.requestPermission({mode:'readwrite'})!=='granted')handle=null;
            if(!handle)try{
                handle=await window.showSaveFilePicker({suggestedName:(!chooseFile&&scoreFileName(id))||(project.songInfo.title||'無題').replace(/[\\/:*?"<>|]/g,'_')+'.json',types:[{description:'譜面クルーズの曲',accept:{'application/json':['.json']}}]});
            }catch(error){
                dismissSaveNotice();
                if(error.name==='SecurityError'){
                    if(!chooseFile)return await commitBrowserSession(session);
                    openExportGuide();
                    return {ok:false,error:'ファイルの保存先を選べないため、JSON書き出しをご利用ください。'};
                }
                throw error;
            }
            const writable=await handle.createWritable();
            try{await writable.write(json);await writable.close();}catch(error){await writable.abort().catch(()=>{});throw error;}
            try{if(handle!==fileHandles.get(id))await storedHandle(id,handle);}catch{
                throw Error('ファイルには保存しましたが、次の上書き先を登録できませんでした。「名前をつけて保存」で保存先を選び直してください。');
            }
            fileHandles.set(id,handle);
            localStorage.removeItem(fileLabelPrefix+id);
            if(session.snapshotVersion!==version)throw Error('ファイル保存後に編集が加わりました。もう一度保存してください');
            return await commitBrowserSession(session, { fileSaved: true });
        }catch(error){
            if(!chooseFile && error.name==='NotFoundError')fileHandles.delete(id);
            const message=error.name==='AbortError'?'保存をキャンセルしました':error.message;
            if(state.session===session)showSaveNotice(message);
            return {ok:false,error:message};
        }finally{fileSaves.delete(session);}
    }
    function commitBrowserSession(session, { fileSaved = false } = {}) {
        session.finishTextGroup();
        // UI mutations already write to the session; never read another document's form here.
        return session.commit().then(function (result) {
            if (state.session === session) {
                refreshProjectSelect(); refreshSessionStatus();
                if(result.ok && !session.dirty && !session.externalUpdatePending){
                    showSaveReceipt(undefined, { recommendChrome: !fileSaved });
                }
            }
            if(state.session===session && !result.ok)showSaveNotice(result.error||'保存に失敗しました。');
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
        dismissSaveNotice();
        cancelRangeSelection();cancelBarDrag();editorHelp?.close({restoreFocus:false});scoreSettings?.close();stopPianoAudition();closePaperForm();playbackSettings?.close(false);sheetActions?.close(false);CS().localPaperLayout?.close();scoreFullscreen?.exit();
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
        const dirty = Array.from(els.root.querySelectorAll('dialog[open]')).some(dialog => dialog.hasUnappliedScoreChanges?.());
        return !dirty || window.confirm('この画面の変更を破棄しますか？');
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
            const option=els.projectSelect.selectedOptions[0];
            if(option?.hasAttribute('data-more-file-actions')){refreshProjectSelect();openMoreFileActions();return;}
            const action=option?.dataset.fileAction;
            if(action){refreshProjectSelect();q(action)?.click();return;}
            var selectedId = els.projectSelect.value;
            if (state.project && selectedId === state.project.projectId) return;
            refreshProjectSelect();
            switchSong(function(){openProject(selectedId);});
        });
        els.newProjectBtn.addEventListener('click', function(){switchSong(()=>requestLeave(createNewProject,true));});
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
            if(kind==='addBar'&&selectedBarIds.length>1){
                index=selectedRangeNumbers().at(-1)-1;id=canonical.bars[index].id;
            }
            var result=runStructureOperation(kind,{barId:id,direction:direction});
            if(!result.ok)return;
            var next=kind==='deleteBar'?Math.min(index,state.session.draft.bars.length-1):kind==='moveBar'?index+direction:kind==='addBar'||kind==='duplicateBar'?index+1:index;
            selectSheetBar(next+1);setSaveStatus((next+1)+'小節目を選択（未保存）');
        });});
        [['sc-transpose-down',-1],['sc-transpose-up',1]].forEach(function(pair){q(pair[0]).addEventListener('click',function(){if(operationEligible()&&runStructureOperation('transpose',{semitones:pair[1]}).ok)redrawSession(false);});});
        q('sc-goto-pre-dtm').addEventListener('click', function () {
            if (state.session && state.session.inputPending) { setSaveStatus('入力の確定を待ってください', true); return; }
            finishTextInputs();
            CS().shellHost.navigate('preDtm');
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
        els.slotOverlay.tabIndex=-1;els.slotOverlay.addEventListener('pointerdown',function(e){if(e.composedPath().some(function(node){return node?.matches?.('[data-chord-picker]');}))return;if(!e.target.closest('button,input,textarea,select,a,[contenteditable],[data-piano-event],[data-loupe-resize]')&&editorCanMove())els.slotOverlay.focus({preventScroll:true});});
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
            backupDraft(session);
            if (state.session !== session) return;
            if(kind==='commit-success')refreshSavedCatalogue(session);
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
            const wouldLoseChanges = CS().sessions.listSessions().some(session => {
                if (session.commitInFlight || session.inputPending) return true;
                if (!session.dirty) return false;
                if (session.domain !== 'structure') return true;
                try {
                    const revision = CS().repository.read(session.target).revision;
                    const recovery = draftRecord(session.target.projectId, revision);
                    return !recovery || JSON.stringify(recovery.project) !== JSON.stringify(session.workingSnapshot());
                } catch { return true; }
            });
            if (!wouldLoseChanges) return;
            e.preventDefault();
            e.returnValue = ''; // ブラウザ標準の確認ダイアログを出す
        });
    }

    window.CruiseStudio = window.CruiseStudio || {};
    window.CruiseStudio.sheetCruise = {
        // B-line local UI candidate; formal product/cache identity remains A-owned.
        developmentVersion: '0.204.0-dev.1',
        createDragScroll,
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
