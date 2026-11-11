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
        lastAutoScrollBar: null, // D3a: 自動スクロールを選択が変わった時だけ行うための直前値
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
            active: function () { return staffStyle === 'melody' && state.active; },
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
        return state.active && !(CS().shellHost && CS().shellHost.getCommandContext().activeModal) &&
            !(CS().shellHost && CS().shellHost.keyboard.isIMEBlocked({})) &&
            state.overlayComposingRowId === null && !state.overlayBulkComposing &&
            state.lyricComposingTick === null && !state.lyricJustComposed;
    }
    function runStructureOperation(kind, args, expected) {
        finishTextInputs();
        if (!operationAdapter) operationAdapter = CS().structureOperations.create({ model: CS().model,
            getSession: function () { return state.session; }, isEligible: operationEligible });
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
        if (!textAdapter) textAdapter = CS().structureText.create({ model: CS().model,
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
        var play=document.createElement('button');play.id='sc-song-preview';play.type='button';play.className='btn-ghost btn-compact';play.textContent='▶ 全曲再生';play.addEventListener('pointerdown',function(e){if(e.button===0)e.preventDefault();});play.addEventListener('click',function(){startPreview('song');});els.saveBtn.after(play);
        var position=document.createElement('span');position.id='sc-song-position';position.setAttribute('role','status');play.after(position);
        var names={addBar:'小節追加',duplicateBar:'複製',deleteBar:'小節削除'};actions.querySelectorAll('[data-bar-operation]').forEach(function(b){b.textContent=names[b.dataset.barOperation]||(b.dataset.direction==='-1'?'小節を前へ':'小節を後へ');});
        var forms=q('sc-chord-forms');if(forms)forms.textContent='コードフォーム';q('sc-goto-pre-dtm').textContent='伴奏確認';
        var launchers=actions.querySelector('.sheet-tool-launchers');if(launchers)launchers.hidden=true;
        var details=document.createElement('details');details.className='sc-transpose-tools';var summary=document.createElement('summary');summary.textContent='移調';details.appendChild(summary);
        [['sc-transpose-down','全曲 −半音'],['sc-transpose-up','全曲 ＋半音']].forEach(function(pair){var b=q(pair[0]);b.textContent=pair[1];details.appendChild(b);});actions.appendChild(details);
        els.undoBtn.title='元に戻す（⌘Z / Ctrl+Z）。ドレミは既存の音符履歴を使います';els.redoBtn.title='やり直す（⌘⇧Z / Ctrl+Shift+Z）';
    }
    function refreshToolbarActions(){
        if(!els.toolbar)return;var owner=state.session,bars=Array.isArray(owner?.draft.bars)?owner.draft.bars:[],bar=bars[state.selectedBarNumber-1],eligible=!!owner&&owner.draft.schemaVersion===2&&!schemaViewError&&operationEligible()&&!owner.inputPending&&!owner.commitInFlight&&!owner.conflict&&!owner.externalUpdatePending&&!textDiagnostic(owner);
        els.toolbar.querySelectorAll('[data-bar-operation]').forEach(function(b){var kind=b.dataset.barOperation,dir=Number(b.dataset.direction);b.disabled=!eligible||!bar||(kind==='deleteBar'&&owner.draft.bars.length<=1)||(kind==='moveBar'&&(state.selectedBarNumber-1+dir<0||state.selectedBarNumber-1+dir>=owner.draft.bars.length));if(!bar)b.title='編集する小節を選択してください';});
        var forms=q('sc-chord-forms');if(forms)forms.disabled=!eligible||!bar||!bar.chords.length;
        var blocked=owner?.draft.performance?.formBindings?.length||bars.some(function(b){return Array.isArray(b.chords)&&b.chords.some(function(c){return c.unresolved;});});
        ['sc-transpose-down','sc-transpose-up'].forEach(function(id){var b=q(id);if(b){b.disabled=!eligible||!!blocked;b.title=blocked?'固定フォームや未解決コードを確認してから移調してください':'全曲の実音を半音移調します。カポは変更しません';}});
        var staff=q('sc-staff-refresh');if(staff)staff.hidden=staffStyle!=='melody';var play=q('sc-song-preview');if(play)play.disabled=!eligible&&!(barPreviewScope==='song'&&barPreviewPhase!=='idle');updateBarPlayButton();
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
        els.saveStatus.classList.toggle('is-error', !!isError);
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
        els.saveBtn.disabled = !session.canCommit();
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
        stopPianoAudition();
        finishTextInputs();
        if (state.session) projectViews.set(state.session.sessionId, {
            selectedBarNumber: state.selectedBarNumber, structureIdentity: structureIdentity, loupe: Object.assign({}, state.loupe),
            dockManualRes: state.dockManualRes, overlayWarnings: state.overlayWarnings,
            scroll: CS().scroll ? CS().scroll.getPosition('sheetCruise') : null
        });
        selectedBarIds = []; rangeAnchor = null;
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
        setProject(project, { dirty: true, statusMessage: '新規プロジェクトを作成しました（未保存）' });
        els.editorDrawer.open=true;els.title.focus();els.title.select();
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
                    selectSheetBar(bar.barNumber);
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

    function renderPreview(preserveInputs) {
        if(!state.project){renderInvalidProject();return;}
        if (preserveInputs) state.overlayRefreshRequested = false;
        if (staffStyle === 'melody') staffRequest();
        else CS().sheetRenderer.render(state.project, els.scaleBox, {resolutionForBar:getStrumGridResolution,heldForNote:function(number,tick){var e=state.session.draft.bars[number-1]?.melody.find(function(e){return e.onsetTick===tick;});return e?.provenance.timing.onset.origin==='auto-assigned'&&e?.provenance.timing.duration.origin==='user-set';},restsForBar:function(number){return state.session.draft.bars[number-1]?.melody.filter(function(e){return e.kind==='rest';})||[];},octaveForNote:function(number,tick){return state.session.draft.bars[number-1]?.melody.find(function(e){return e.onsetTick===tick&&e.kind==='note';})?.pitch.octave;}});
        updateSheetScale();
        syncSheetSelection(preserveInputs);
        if(preserveInputs)refreshPiano();
        refreshToolbarActions();
        // 画面切替直後は clientWidth が 0 のことがあるため、表示後にもう一度合わせる
        scheduleOverlayPosition(!preserveInputs);
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
#sc-slot-overlay {gap:calc(6px * var(--bar-loupe-scale,1));padding:calc(8px * var(--bar-loupe-scale,1)) calc(20px * var(--bar-loupe-scale,1)) calc(16px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-head {gap:calc(14px * var(--bar-loupe-scale,1));padding-bottom:calc(6px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-head-main,#sc-slot-overlay .slot-overlay-head-actions {gap:calc(8px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-section {font-size:calc(11px * var(--bar-loupe-scale,1));padding:calc(2px * var(--bar-loupe-scale,1)) calc(10px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-nav {gap:calc(4px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-nav-btn,#sc-slot-overlay .slot-overlay-res-btn,#sc-slot-overlay .slot-overlay-reset-btn,#sc-slot-overlay .slot-overlay-bulk-toggle {font-size:calc(12px * var(--bar-loupe-scale,1));padding:calc(5px * var(--bar-loupe-scale,1)) calc(10px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-nav-btn {min-width:calc(56px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-hint,#sc-slot-overlay .slot-overlay-row-label {font-size:calc(10.5px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-close {font-size:calc(13px * var(--bar-loupe-scale,1));width:calc(26px * var(--bar-loupe-scale,1));height:calc(26px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-ruler,#sc-slot-overlay .slot-overlay-row {gap:calc(8px * var(--bar-loupe-scale,1));}
#sc-slot-overlay .slot-overlay-ruler-label,#sc-slot-overlay .slot-overlay-row-label {flex-basis:calc(62px * var(--bar-loupe-scale,1));}
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
#sc-slot-overlay .slot-overlay-grid {position:relative;}
#sc-slot-overlay .sc-playing-cell,#sc-sheet-scale-box .sc-playing-cell {box-shadow:inset 0 0 0 2px #6b8199!important;background-color:#e7ecf2!important;}
#sc-slot-overlay .solfege-colors .sc-playing-note {background:#cfd9e5;border-radius:3px;}
#sc-slot-overlay [data-score-playhead],#sc-sheet-scale-box [data-score-playhead] {position:absolute;top:0;bottom:0;width:2px;background:#344b66;z-index:4;pointer-events:none;}
@media print {[data-score-playhead]{display:none!important}.sc-playing-cell{box-shadow:none!important;background-color:transparent!important}.sc-playing-note{background:transparent!important}}
#screen-sheet-cruise .sheet-tool-launchers[hidden],#sc-staff-refresh[hidden]{display:none!important;}
#sc-song-position{font-size:12px;color:#a5b2c1;min-width:6em;}
#screen-sheet-cruise .sheet-bar-actions{gap:8px;}
#screen-sheet-cruise .sheet-bar-actions button,#screen-sheet-cruise .sc-transpose-tools button{padding:8px 12px;font:inherit;font-size:12px;white-space:nowrap;}
#screen-sheet-cruise .sc-transpose-tools{display:inline-flex;font-size:12px;align-items:center;gap:8px;}
#screen-sheet-cruise .sc-transpose-tools summary{cursor:pointer;padding:8px;}
#screen-sheet-cruise .sc-transpose-tools:not([open]) button{display:none;}
#sc-slot-overlay .slot-overlay-head {position:sticky;top:0;z-index:5;background:var(--slot-surface);}
#sc-slot-overlay .doremi-piano {margin:calc(-6px * var(--bar-loupe-scale,1)) 0 0 calc(70px * var(--bar-loupe-scale,1));padding:calc(10px * var(--bar-loupe-scale,1));background:var(--slot-input-surface);border:1px solid var(--slot-border);border-radius:0 0 8px 8px;flex-shrink:0;border-color:#9baac2;background:#f8faff;}
#sc-slot-overlay.piano-open .slot-overlay-row--doremi .slot-overlay-row-body {border-color:#9baac2;border-radius:6px 6px 0 0;}
#sc-slot-overlay .doremi-piano button,#sc-slot-overlay .doremi-piano select {font:inherit;font-size:max(11px,calc(12px * var(--bar-loupe-scale,1)));padding:calc(6px * var(--bar-loupe-scale,1)) calc(10px * var(--bar-loupe-scale,1));border:1px solid var(--slot-border);border-radius:6px;background:white;color:var(--slot-text);}
#sc-slot-overlay .doremi-piano button[aria-pressed=true] {background:#f3dfb9;border-color:#947444;box-shadow:inset 0 0 0 1px #947444;}
#sc-slot-overlay .doremi-piano button:disabled {opacity:.45;}
#sc-slot-overlay .piano-controls,#sc-slot-overlay .piano-heading {display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0;}
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
        stopPianoAudition();
        finishTextInputs();
        if (!state.selectedBarNumber) return;
        state.selectedBarNumber = null;
        selectionDeleted = false;
        state.overlayWarnings = {};
        state.overlayBulkMessage = null;
        syncSheetSelection();
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
        var field = els.slotOverlay.querySelector('[data-overlay-field="' + snapshot.rowId + '"]');
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
        var contexts=new Set(),closing=new Map();
        function notify(phase){try{if(options.onState)options.onState(phase,mode);}catch(_){}}
        function register(){if(!handle)handle=audio.register({sessionId:'studio.sheet.solfege-audition',ownerFeatureId:'sheetCruise',cleanup:cleanup,notify:function(){void stop();}});}
        function silence(){if(!voice)return;var old=voice;voice=null;old.nodes.forEach(function(n){n.osc.onended=null;try{n.osc.stop();}catch(_){}try{n.osc.disconnect();n.gain.disconnect();}catch(_){}});}
        function cancelTimers(){if(idleTimer!==null)options.clearTimer(idleTimer);if(endTimer!==null)options.clearTimer(endTimer);if(pumpTimer!==null)options.clearTimer(pumpTimer);idleTimer=endTimer=pumpTimer=null;}
        function closeContext(ctx){
            if(closing.has(ctx))return closing.get(ctx);
            if(context===ctx)context=null;
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
        async function playEvents(events,isCurrent,holdSeconds,streaming){
            if(holdSeconds!==undefined&&(!Number.isFinite(holdSeconds)||holdSeconds<=0||holdSeconds>(streaming?122881:61)))return {ok:false};
            if(!Array.isArray(events)||(!events.length&&!holdSeconds)||events.length>(streaming?524288:256)||!events.every(function(e){return Number.isInteger(e.midi)&&e.midi>=21&&e.midi<=108&&['piano','guitar','mute'].includes(e.part)&&Number.isFinite(e.start)&&e.start>=0&&Number.isFinite(e.duration)&&e.duration>0&&e.duration<=61&&e.start+e.duration<=(streaming?holdSeconds+.01:61)&&Number.isFinite(e.gain)&&e.gain>0&&e.gain<=.45;})||!isCurrent())return {ok:false};
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
                var samples=new Map();events.forEach(function(e){var key=e.part+':'+e.midi;if(!samples.has(key))samples.set(key,options.loadSample(ctx,e.midi,e.part));});
                var keys=Array.from(samples.keys()),decoded=await Promise.all(Array.from(samples.values()));keys.forEach(function(key,i){samples.set(key,decoded[i]);});
                if(token!==epoch)return {ok:false};
                if(!isCurrent()||!audio.isLeaseCurrent(handle,next)){await stop();return {ok:false};}
                var now=ctx.currentTime,current={nodes:new Set(),remaining:events.length,startedAt:now,duration:holdSeconds||0,cursor:0};voice=current;
                function finish(){if(voice!==current||token!==epoch)return;cancelTimers();silence();idle(ctx,token);}
                function schedule(e){
                    if(current.nodes.size>=2048)throw Error('同時に鳴らす音が多すぎるため停止しました');
                    var sample=samples.get(e.part+':'+e.midi),osc=ctx.createBufferSource(),gain=ctx.createGain(),rate=Math.pow(2,(e.midi-sample.midi)/12),start=now+e.start;
                    var duration=Math.min(e.duration,sample.buffer.duration/rate),release=Math.min(.35,duration*.35);
                    osc.buffer=sample.buffer;osc.playbackRate.setValueAtTime(rate,start);
                    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(e.gain,start+Math.min(.005,duration/4));gain.gain.setValueAtTime(e.gain,start+duration-release);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
                    osc.connect(gain);gain.connect(ctx.destination);var node={osc:osc,gain:gain};current.nodes.add(node);
                    osc.onended=function(){if(voice!==current||token!==epoch)return;osc.onended=null;osc.disconnect();gain.disconnect();current.nodes.delete(node);if(--current.remaining===0&&!holdSeconds)finish();};
                    osc.start(start);osc.stop(start+duration);
                }
                if(streaming){
                    events=events.slice().sort(function(a,b){return a.start-b.start;});
                    function pump(){
                        pumpTimer=null;if(token!==epoch||voice!==current)return;
                        if(!isCurrent()||!audio.isLeaseCurrent(handle,next)){void stop();return;}
                        if(ctx.currentTime>=now+holdSeconds){finish();return;}
                        try{while(current.cursor<events.length&&now+events[current.cursor].start<=ctx.currentTime+1){var event=events[current.cursor++];if(now+event.start<ctx.currentTime-.05)throw Error('再生が中断されたため停止しました');schedule(event);}}
                        catch(e){void stop().then(function(){error=e.message;if(options.onError)options.onError(error);});return;}
                        pumpTimer=options.setTimer(pump,25);
                    }
                    pump();if(voice!==current)return {ok:false};
                }else{events.forEach(schedule);if(holdSeconds)endTimer=options.setTimer(finish,Math.ceil(holdSeconds*1000)+50);}
                notify('playing');return {ok:true};
            }catch(e){if(token===epoch){await stop();error='音を開始できませんでした。音源や端末の音声設定を確認してください。';return {ok:false,error:error};}return {ok:false};}
        }
        async function play(midi,isCurrent){var r=await playEvents([{midi:midi,part:'piano',start:0,duration:1.6,gain:.45}],isCurrent);return r.ok?{ok:true,midi:midi,frequency:440*Math.pow(2,(midi-69)/12)}:r;}
        return {play:play,playEvents:playEvents,cancel:cancel,stop:stop,snapshot:function(){return {playing:!!voice,mode:mode,elapsedSeconds:voice&&context?Math.max(0,context.currentTime-voice.startedAt):0,contextCount:contexts.size,error:error};}};
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
    var pianoAudition=null,barPreviewPhase='idle',barPreviewScope='all',previewFrame=null,previewSecondsPerTick=0,previewRAF=null,previewSpans=null;
    function clearPlayhead(){
        if(previewRAF!==null)cancelAnimationFrame(previewRAF);previewRAF=null;
        [els.slotOverlay,els.scaleBox].forEach(function(root){if(!root)return;root.querySelectorAll('.sc-playing-cell,.sc-playing-note').forEach(function(e){e.classList.remove('sc-playing-cell','sc-playing-note');});root.querySelectorAll('[data-score-playhead]').forEach(function(e){e.remove();});});
    }
    function updateBarPlayButton(){
        var whole=q('sc-song-preview');if(whole){var active=barPreviewPhase!=='idle'&&barPreviewScope==='song';whole.textContent=active?(barPreviewPhase==='loading'?'■ 準備中':'■ 全曲停止'):'▶ 全曲再生';whole.setAttribute('aria-pressed',String(active));}
        var position=q('sc-song-position');if(position&&(barPreviewPhase==='idle'||barPreviewScope!=='song'))position.textContent='';
        if(!els.slotOverlay)return;
        els.slotOverlay.querySelectorAll('[data-bar-preview],[data-melody-preview]').forEach(function(button){var scope=button.hasAttribute('data-melody-preview')?'melody':'all',active=barPreviewPhase!=='idle'&&barPreviewScope===scope;button.textContent=active?(barPreviewPhase==='loading'?'■ 準備中':'■ 停止'):scope==='melody'?'▶ メロディ':'▶ 再生';button.setAttribute('aria-pressed',String(active));});
    }
    function paintPlayhead(){
        previewRAF=null;if(barPreviewPhase!=='playing'||!pianoAudition)return;
        if(!currentFrame(previewFrame)||!state.active||document.hidden){stopPianoAudition();return;}
        var elapsed=Math.max(0,pianoAudition.snapshot().elapsedSeconds-.03),span=barPreviewScope==='song'?(previewSpans.find(function(s){return elapsed<s.end;})||previewSpans[previewSpans.length-1]):null;
        var number=span?span.index+1:state.selectedBarNumber,tick=Math.min(1919.999,Math.max(0,(elapsed-(span?span.start:0))/previewSecondsPerTick)),bar=state.session.draft.bars[number-1],cardActive=number===state.selectedBarNumber;
        els.slotOverlay.dataset.playbackTick=String(tick);els.slotOverlay.dataset.playbackBar=number;
        var position=q('sc-song-position');if(position&&barPreviewScope==='song')position.textContent=number+' / '+state.session.draft.bars.length+'小節';

        els.slotOverlay.querySelectorAll('.dock-strum-cell,.dock-lyrics-cell,[data-overlay-field]').forEach(function(e){var start=Number(e.dataset.slotTick),span=Number(e.dataset.slotTicks),target=e.dataset.overlayField==='doremi'?e.parentElement:e,allowed=cardActive&&(barPreviewScope!=='melody'||e.dataset.overlayField==='doremi');target.classList.toggle('sc-playing-cell',allowed&&Number.isFinite(start)&&span>0&&tick>=start&&tick<start+span);});
        els.slotOverlay.querySelectorAll('[data-piano-event]').forEach(function(e){var note=bar.melody.find(function(n){return n.id===e.dataset.pianoEvent;});e.classList.toggle('sc-playing-note',cardActive&&!!note&&note.kind==='note'&&tick>=note.onsetTick&&tick<note.onsetTick+note.durationTicks);});
        var grid=els.slotOverlay.querySelector('.slot-overlay-grid'),body=grid?.querySelector('.slot-overlay-row-body');
        if(grid&&!cardActive)grid.querySelector('[data-score-playhead]')?.remove();
        if(grid&&body&&cardActive){var line=grid.querySelector('[data-score-playhead]');if(!line){line=document.createElement('span');line.dataset.scorePlayhead='';line.setAttribute('aria-hidden','true');grid.appendChild(line);}line.style.left=(body.getBoundingClientRect().left-grid.getBoundingClientRect().left+body.getBoundingClientRect().width*tick/1920)+'px';}
        var paper=els.scaleBox.querySelector('.sheet-bar[data-bar-number="'+number+'"]');
        els.scaleBox.querySelectorAll('.sheet-bar').forEach(function(b){if(b!==paper){b.querySelector('[data-score-playhead]')?.remove();b.querySelectorAll('.sc-playing-cell').forEach(function(c){c.classList.remove('sc-playing-cell');});}});
        if(paper){paper.querySelectorAll('.sheet-timed-cell,[data-strum-state]').forEach(function(e){var allowed=barPreviewScope!=='melody'||!!e.closest('.sheet-bar-doremi'),start=Number(e.dataset.slotTick),row=e.parentElement,span=1920/row.children.length;e.classList.toggle('sc-playing-cell',allowed&&Number.isFinite(start)&&tick>=start&&tick<start+span);});var line=paper.querySelector('[data-score-playhead]');if(!line){line=document.createElement('span');line.dataset.scorePlayhead='';line.setAttribute('aria-hidden','true');paper.appendChild(line);}line.style.left=tick/1920*100+'%';}
        previewRAF=requestAnimationFrame(paintPlayhead);
    }
    function ensureAudition(){
        if(!pianoAudition)pianoAudition=createPianoAudition({coordinator:CS().audio,createContext:function(){return new (window.AudioContext||window.webkitAudioContext)();},setTimer:window.setTimeout.bind(window),clearTimer:window.clearTimeout.bind(window),loadSample:loadPianoSample,onError:function(message){if(currentFrame(previewFrame))pianoMessage(message);},onState:function(phase,mode){barPreviewPhase=['bar','song'].includes(mode)?phase:'idle';updateBarPlayButton();clearPlayhead();if(barPreviewPhase==='playing')previewRAF=requestAnimationFrame(paintPlayhead);else if(els.slotOverlay){delete els.slotOverlay.dataset.playbackTick;delete els.slotOverlay.dataset.playbackBar;}}});
        return pianoAudition;
    }
    // Pure reference sound projection. It never adopts a form or confirms timing.
    function buildBarPreviewPlan(project,index,deps){
        var bar=project.bars[index],bpm=project.songInfo.bpm,seconds=60/bpm/480,total=1920*seconds,events=[],warnings=[];
        if(!bar||!Number.isFinite(total)||total<=0||total>60)throw Error('BPMや小節を確認してください');
        bar.melody.forEach(function(e){if(e.kind!=='note')return;var midi=deps.pitchMidi(e.pitch);if(midi<21||midi>108){warnings.push('音域外のメロディは鳴らせません');return;}events.push({part:'piano',midi:midi,start:.03+e.onsetTick*seconds,duration:e.durationTicks*seconds,gain:.32,tick:e.onsetTick,sourceEventId:e.id});});
        if(!deps.melodyOnly){
            var rhythm=deps.rhythm(project,index),slots;
            if(rhythm?.encoding==='studio-strum-v1')slots=rhythm.slots.slice().sort(function(a,b){return a.tick-b.tick;});
            else if(rhythm?.encoding==='rhythm-owner-cells-v1'&&rhythm.projection?.rhythmResolved)slots=rhythm.projection.events.filter(function(e){return e.sound!=='sustain';}).map(function(e){return {tick:e.onsetTick,action:e.sound==='rest'?'rest':e.direction,durationTicks:e.notationDurationTicks,accent:e.accent===true};});
            else throw Error('このストローク形式は試聴未対応です。元のデータを保持しています');
            if(slots.some(function(s){return s.tieToNext===true||!['down','up','mute','rest'].includes(s.action);}))throw Error('このストロークの方向・タイは試聴未対応です');
            var fallback=slots.some(function(s){return s.tick%240||(s.durationTicks!==undefined&&s.durationTicks%240);})?120:240;
            var chords=bar.chords.slice().sort(function(a,b){return a.onsetTick-b.onsetTick;});
            function chordAt(tick){
                var found=chords.filter(function(c){return c.onsetTick<=tick;}).pop();
                if(found)return found.durationTicks!==undefined&&tick>=found.onsetTick+found.durationTicks?null:found;
                for(var b=index-1;b>=0;b--){var previous=project.bars[b].chords.slice().sort(function(a,b){return a.onsetTick-b.onsetTick;}).pop();if(previous)return previous.durationTicks===undefined?previous:null;}
                return null;
            }
            if(!slots.length&&chords.length)warnings.push('ストローク未入力のためコードは鳴りません');
            slots.forEach(function(slot,i){
                var end=Math.min(1920,slot.tick+(slot.durationTicks===undefined?fallback:slot.durationTicks),slots[i+1]?.tick??1920),duration=(end-slot.tick)*seconds;
                if(duration<=0||slot.action==='rest')return;
                if(slot.action==='mute'){events.push({part:'mute',midi:60,start:.03+slot.tick*seconds,duration:Math.min(.085,duration),gain:slot.accent?.18:.14,tick:slot.tick,stroke:'mute'});return;}
                var chord=chordAt(slot.tick),parsed=chord&&!chord.unresolved&&deps.parseChord(chord.symbol),quality=parsed&&Object.keys(deps.qualities).find(function(key){return key===parsed.quality||deps.qualities[key].symbolSuffix===parsed.quality;});
                if(!quality){warnings.push(chord?'未対応のコード '+chord.symbol+' は鳴らせません':'コード未入力のストロークは鳴らせません');return;}
                if(chords.filter(function(c){return c.onsetTick===chord.onsetTick;}).length>1){warnings.push('同じ位置の複数コードは試聴未対応です');return;}
                if(chord.durationTicks!==undefined)end=Math.min(end,chord.onsetTick+chord.durationTicks);duration=(end-slot.tick)*seconds;if(duration<=0)return;
                var root=deps.notePc(parsed.root),bass=deps.notePc(parsed.bass||parsed.root),low=40+((bass-4+12)%12);
                var notes=deps.qualities[quality].intervals.map(function(interval){var n=48+root+interval;while(n<low)n+=12;return n;});notes.push(low);notes=Array.from(new Set(notes)).sort(function(a,b){return a-b;});
                if(slot.action==='up')notes.reverse();
                var spread=Math.min(.012,duration*.25/Math.max(1,notes.length-1)),gain=.075*(slot.action==='up'?.85:1)*(slot.accent?1.2:1);
                notes.forEach(function(midi,n){var offset=n*spread;events.push({part:'guitar',midi:midi,start:.03+slot.tick*seconds+offset,duration:duration-offset,gain:gain,tick:slot.tick,stroke:slot.action,sourceEventId:chord.id});});
            });
        }
        if(events.length>256)throw Error('試聴する音が多すぎます');return {events:events,duration:total+.03,secondsPerTick:seconds,warnings:Array.from(new Set(warnings))};
    }
    function previewDependencies(project,melodyOnly){
        var materials=new Map(project.materials.rhythms.map(function(m){return [m.id,m];})),bindings=new Map(project.performance.barRhythms.map(function(b){return [b.barId,b.materialId];})),cache=new Map();
        return {pitchMidi:CS().model.schema2.pitchMidi,parseChord:CS().theory.parseBasicChordSymbol,qualities:window.ChordCruise.theory.QUALITIES,notePc:CS().theory.keyToSemitone,melodyOnly:!!melodyOnly,rhythm:function(p,i){
            var id=bindings.get(p.bars[i].id)||p.performance.basicRhythmId;if(cache.has(id))return cache.get(id);var m=materials.get(id),r;
            if(m?.encoding==='studio-strum-v1')r={encoding:m.encoding,slots:m.snapshot.slots};
            else if(m?.encoding==='rhythm-owner-cells-v1'){var checked=CS().rhythmSnapshots.readRhythmMaterial(m);if(!checked.ok)throw Error('ストロークの内容を確認してください');r={encoding:m.encoding,projection:checked.projection};}
            if(!r)throw Error('ストローク形式が未対応です');cache.set(id,r);return r;
        }};
    }
    function buildSongPreviewPlan(project,deps){
        var events=[],spans=[],warnings=[],offset=0;
        project.bars.forEach(function(bar,i){var plan;try{plan=buildBarPreviewPlan(project,i,deps);}catch(e){throw Error((i+1)+'小節目：'+e.message);}
            plan.events.forEach(function(e){events.push(Object.assign({},e,{start:e.start+offset,barIndex:i}));});
            spans.push({index:i,start:offset,end:offset+plan.duration-.03});offset+=plan.duration-.03;
            plan.warnings.forEach(function(w){if(warnings.length<8&&!warnings.includes(w))warnings.push(w);});
        });return {events:events,spans:spans,duration:offset+.03,secondsPerTick:60/project.songInfo.bpm/480,warnings:warnings};
    }
    function startPreview(scope){
        if(barPreviewPhase!=='idle'&&barPreviewScope===scope){stopPianoAudition();return;}
        finishTextInputs();var owner=state.session,c=scope==='song'?null:pianoContext();
        if(!owner||owner.draft.schemaVersion!==2||!operationEligible()||owner.inputPending||owner.commitInFlight||owner.conflict||owner.externalUpdatePending||textDiagnostic(owner)||(scope!=='song'&&pianoBlocked(c))){pianoMessage('未確定の入力・保存・競合を確認してください');return;}
        try{var project=owner.workingSnapshot(),deps=previewDependencies(project,scope==='melody'),plan=scope==='song'?buildSongPreviewPlan(project,deps):buildBarPreviewPlan(project,state.selectedBarNumber-1,deps);
            piano.message='';if(plan.warnings.length)pianoMessage(plan.warnings.join('／'));var frame=contentFrame();previewFrame=frame;previewSpans=plan.spans||null;previewSecondsPerTick=plan.secondsPerTick;barPreviewScope=scope;
            void ensureAudition().playEvents(plan.events,function(){return currentFrame(frame)&&state.active&&!document.hidden&&(!CS().entryAuth||CS().entryAuth.isAuthorized());},plan.duration,scope==='song').then(function(r){if(!r.ok&&r.error&&currentFrame(frame))pianoMessage(r.error);}).catch(function(){if(currentFrame(frame))pianoMessage('試聴を開始できませんでした');});
        }catch(e){pianoMessage(e.message);}
    }
    function buildBarPlayButton(melodyOnly){
        var owner=state.session,sourceBarId=owner?.draft.bars[state.selectedBarNumber-1]?.id;
        var button=document.createElement('button');button.type='button';if(melodyOnly)button.dataset.melodyPreview='';else button.dataset.barPreview='';button.className='slot-overlay-nav-btn';var scope=melodyOnly?'melody':'all',active=barPreviewPhase!=='idle'&&barPreviewScope===scope;button.textContent=active?(barPreviewPhase==='loading'?'■ 準備中':'■ 停止'):melodyOnly?'▶ メロディ':'▶ 再生';button.setAttribute('aria-pressed',String(active));button.title=melodyOnly?'この小節のメロディだけを試聴':'この小節のコード×ストローク＋メロディを試聴（コードは参考の響き）';
        // Keep the text target alive through WebKit's pointer-to-focus transition.
        button.addEventListener('pointerdown',function(e){if(e.button===0)e.preventDefault();e.stopPropagation();});button.addEventListener('click',function(e){e.stopPropagation();if(!button.isConnected||state.session!==owner||owner.draft.bars[state.selectedBarNumber-1]?.id!==sourceBarId)return;startPreview(scope);});return button;
    }
    function stopPianoAudition(){if(pianoAudition)void pianoAudition.stop();}
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
        queueEditorFrame(function(){var field=els.slotOverlay.querySelector('[data-overlay-field="doremi"][data-slot-tick="'+c.range.tick+'"]');if(field){field.parentElement.classList.add('piano-color-mode');field.focus({preventScroll:true});field.setSelectionRange(field.value.length,field.value.length);}});
    }
    function pianoMessage(message){piano.message=message;setSaveStatus(message,true);refreshPiano();}
    function pianoExtension(c){
        if(!c)return {error:'伸ばす位置を選んでください'};
        var selected=c.event,at=selected?selected.onsetTick:c.range.tick,previous=c.bar.melody.filter(function(e){return e.onsetTick<at;}).pop();
        var replace=selected?.kind==='note'&&previous?.kind==='note'&&previous.onsetTick+previous.durationTicks===at;
        var event=replace?previous:selected;
        if(!event&&!c.events.length)event=c.bar.melody.filter(function(e){return e.kind==='note'&&e.onsetTick<c.range.tick&&e.onsetTick+e.durationTicks>=c.range.tick;}).pop();
        if(!event||event.kind!=='note')return {error:'前の音につなぐ位置を選んでください。休符は先に消去してください'};
        var end=replace?selected.onsetTick+selected.durationTicks:selected?event.onsetTick+event.durationTicks+c.range.span:c.range.tick+c.range.span;
        if(end<=event.onsetTick+event.durationTicks)return {error:'この位置はすでに前の音から伸びています'};
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
        var field=els.slotOverlay.querySelector('[data-overlay-field="doremi"][data-slot-tick="'+c.range.tick+'"]');
        if(!field)return;field.focus({preventScroll:true});field.dispatchEvent(new KeyboardEvent('keydown',{key:direction<0?'ArrowLeft':'ArrowRight',bubbles:true,cancelable:true}));
        requestAnimationFrame(function(){
            var active=document.activeElement;if(!CS().structureOperations.isCurrent(frame.content,state.session)||!CS().documents.isSelected(frame.ticket)||state.session!==c.owner||state.session.draft.bars[state.selectedBarNumber-1]?.id!==expectedId||!active?.matches('[data-overlay-field="doremi"]')||Number(active.dataset.slotTick)!==expectedTick)return;
            var target=pianoContext();piano.eventId=target.events.length?(direction<0?target.events[target.events.length-1]:target.events[0]).id:null;piano.adding=false;refreshPiano();
        });
    }
    function pianoWrite(c,action,midi){
        if(pianoBlocked(c)){pianoMessage('入力・保存・競合の状態を確認してください。元の内容を保持しています。');return;}
        if(action==='pitch'&&(!Number.isInteger(midi)||midi<21||midi>108))return;
        piano.message='';if(action==='extend'&&pianoExtendError(c)){pianoMessage(pianoExtendError(c));return;}
        var extension=action==='extend'?pianoExtension(c):null,selected=extension?extension.event:c.event,range=c.range,owner=c.owner;if(action==='pitch'&&selected?.kind==='note'&&CS().model.schema2.pitchMidi(selected.pitch)===midi)return true;owner.finishTextGroup();
        if(action==='pitch'&&!selected){
            var field=els.slotOverlay.querySelector('[data-overlay-field="doremi"][data-slot-tick="'+range.tick+'"]');
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
            if(action==='pitch'){event.kind='note';event.pitch=pianoPitch(midi,project);}
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
        if(extension)piano.eventId=extension.event.id;piano.adding=false;finishPianoChange(c);return true;
    }
    function buildPianoPanel(){
        var root=document.createElement('section');root.dataset.doremiPiano='';root.className='doremi-piano';
        root.setAttribute('aria-label','ドレミ鍵盤');root.addEventListener('keydown',onPianoKeydown);populatePiano(root);return root;
    }
    function refreshPiano(){var root=els.slotOverlay&&els.slotOverlay.querySelector('[data-doremi-piano]');if(root)populatePiano(root);}
    function syncPianoSelection(c){
        if(!els.slotOverlay)return;
        els.slotOverlay.querySelectorAll('.solfege-cell').forEach(function(host){
            var field=host.querySelector('input'),active=!!(piano.open&&c&&Number(field.dataset.slotTick)===c.range.tick);
            host.classList.toggle('piano-selected-cell',active);host.querySelector('.solfege-colors').setAttribute('aria-hidden',String(!piano.open));
            host.querySelectorAll('[data-piano-event]').forEach(function(token){var selected=active&&!piano.adding&&token.dataset.pianoEvent===piano.eventId;token.classList.toggle('piano-selected-note',selected);token.setAttribute('aria-pressed',String(selected));token.tabIndex=piano.open?0:-1;});
            var old=host.querySelector('[data-piano-pending]');if(old)old.remove();
            if(active&&piano.adding){var pending=document.createElement('span');pending.dataset.pianoPending='';pending.className='piano-pending-note';pending.textContent='＋';pending.setAttribute('aria-label','ここに次の音を追加');host.querySelector('.solfege-colors').appendChild(pending);}
        });
    }
    function focusPianoCell(c){
        var field=els.slotOverlay.querySelector('[data-overlay-field="doremi"][data-slot-tick="'+c.range.tick+'"]');
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
    function populatePiano(root){
        var c=pianoContext();root.replaceChildren();if(!c)return;syncPianoSelection(c);
        function button(label,action,attrs){
            var b=document.createElement('button');b.type='button';b.textContent=label;
            Object.keys(attrs||{}).forEach(function(k){b.setAttribute(k,attrs[k]);});
            b.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();});
            b.addEventListener('click',function(e){e.stopPropagation();if(b.isConnected&&currentFrame(c.frame))action();});return b;
        }
        els.slotOverlay.classList.toggle('piano-open',piano.open);
        function toggle(){piano.open=!piano.open;if(!piano.open)stopPianoAudition();refreshPiano();var field=els.slotOverlay.querySelector('[data-overlay-field="doremi"][data-slot-tick="'+c.range.tick+'"]');if(field)field.parentElement.classList.toggle('piano-color-mode',piano.open);if(piano.open){focusPianoCell(c);void ensurePianoBank().catch(function(){if(piano.open)setSaveStatus('ピアノ音源を読み込めませんでした。鍵盤を押して再試行してください。',true);});var area=getLoupeSafeArea();state.loupe.y=clampLoupeY(Math.min(state.loupe.y,area.bottom-area.bottomMargin-els.slotOverlay.scrollHeight-2));els.slotOverlay.scrollTop=0;}positionSlotOverlay();}
        var heading=document.createElement('div');heading.className='piano-heading';
        heading.appendChild(button(piano.open?'鍵盤を閉じる':'鍵盤を開く',toggle,{'data-piano-toggle':'','aria-expanded':String(piano.open)}));
        function changeTypingOctave(value){if(pianoBlocked(c))return;c.owner.finishTextGroup();typingOctaves.set(c.owner,value);refreshPiano();}
        var octave=typingOctave(c.owner),lowerType=button('←',function(){changeTypingOctave(Math.max(0,octave-1));},{'data-typing-lower':'','aria-label':'入力オクターブを下げる'});lowerType.disabled=octave===0||pianoBlocked(c);heading.appendChild(lowerType);
        var typing=document.createElement('select');typing.dataset.typingOctave='';typing.setAttribute('aria-label','直接入力のオクターブ');typing.title='新しく入力するドレミの高さ。入力済みの音は変更しません';
        var tonic=c.owner.draft.solfege.tonic,name=tonic.step+window.ChordCruise.theory.formatAccidental(tonic.alter);for(var o=0;o<=8;o++){var option=document.createElement('option');option.value=o;option.textContent=name+o;typing.appendChild(option);}typing.value=octave;typing.disabled=pianoBlocked(c);typing.addEventListener('change',function(){if(typing.isConnected&&currentFrame(c.frame))changeTypingOctave(Number(typing.value));});heading.appendChild(typing);
        var higherType=button('→',function(){changeTypingOctave(Math.min(8,octave+1));},{'data-typing-higher':'','aria-label':'入力オクターブを上げる'});higherType.disabled=octave===8||pianoBlocked(c);heading.appendChild(higherType);
        var headingSpacer=document.createElement('span');headingSpacer.className='piano-spacer';heading.appendChild(headingSpacer);heading.appendChild(buildBarPlayButton(true));
        if(piano.open)heading.appendChild(button(piano.sound?'音 ON':'音 OFF',function(){piano.sound=!piano.sound;if(!piano.sound)stopPianoAudition();refreshPiano();},{'data-piano-sound':'','aria-label':'試聴音を切り替える','aria-pressed':String(piano.sound)}));
        root.appendChild(heading);
        if(!piano.open){if(piano.message){var notice=document.createElement('p');notice.className='piano-help';notice.setAttribute('role','status');notice.textContent=piano.message;root.appendChild(notice);}return;}
        var toolbar=document.createElement('div');toolbar.className='piano-controls';
        var add=button('＋',function(){piano.adding=true;piano.eventId=null;refreshPiano();focusPianoCell(c);},{'data-piano-add':'','aria-label':'同じマスに音を追加','aria-pressed':String(piano.adding)});
        add.disabled=c.events.length>0&&!autoCellGroup(c.events,c.range.tick,c.range.span);add.title=add.disabled?'既存の拍位置・音価を保持するため追加できません':'同じマスに音を追加';toolbar.appendChild(add);
        [-1,1].forEach(function(direction){var nav=button(direction<0?'←':'→',function(){movePianoCell(direction);},{'data-piano-cell-nav':direction,'aria-label':direction<0?'前のマス':'次のマス'});nav.disabled=pianoBlocked(c);toolbar.appendChild(nav);});
        [['伸ばす','extend'],['消去','delete']].forEach(function(pair){
            var b=button(pair[1]==='extend'?'〜':pair[1]==='delete'?'⌫':'',function(){pianoWrite(c,pair[1]);},{'data-piano-action':pair[1],'aria-label':pair[0]});b.title=pair[0];
            if(pair[1]==='rest')b.appendChild(CS().sheetRenderer.createStrumRestSymbol(c.range.span));
            if(pair[1]==='extend'&&pianoExtension(c).removeId)b.title='選択音を前の音の伸ばしに置換（元に戻すで取消）';
            b.disabled=pianoBlocked(c)||(pair[1]==='delete'&&!c.event)||(pair[1]==='rest'&&piano.adding&&c.events.length>0);if(pair[1]==='extend'&&pianoExtendError(c))b.title=pianoExtendError(c);toolbar.appendChild(b);
        });
        var spacer=document.createElement('span');spacer.className='piano-spacer';toolbar.appendChild(spacer);
        var lower=button('←',function(){piano.octave=Math.max(0,piano.octave-1);refreshPiano();},{'data-piano-lower':'','aria-label':'低い音域へ'});lower.disabled=piano.octave===0;toolbar.appendChild(lower);
        var select=document.createElement('select');select.setAttribute('aria-label','鍵盤の音域');select.dataset.pianoOctave='';
        for(var oct=0;oct<=5;oct++){var option=document.createElement('option');option.value=oct;option.textContent=oct===0?'A0〜C3':'C'+oct+'〜C'+(oct+3);select.appendChild(option);}select.value=piano.octave;
        select.addEventListener('change',function(){if(select.isConnected&&currentFrame(c.frame)){var value=Number(select.value);if(!Number.isInteger(value)||value<0||value>5)return;piano.octave=value;refreshPiano();root.querySelector('[data-piano-octave]')?.focus({preventScroll:true});}});toolbar.appendChild(select);
        var higher=button('→',function(){piano.octave=Math.min(5,piano.octave+1);refreshPiano();},{'data-piano-higher':'','aria-label':'高い音域へ'});higher.disabled=piano.octave===5;toolbar.appendChild(higher);
        toolbar.appendChild(button('🎨',function(){piano.colorsOpen=!piano.colorsOpen;refreshPiano();},{'data-piano-colors':'','aria-label':'オクターブの色を変更','aria-expanded':String(piano.colorsOpen)}));root.appendChild(toolbar);
        if(piano.colorsOpen){
            var palette=document.createElement('div');palette.className='piano-palette';
            CS().sheetRenderer.getOctaveColors().forEach(function(color,octave){
                var label=document.createElement('label');label.textContent=octave===0?'A0':'C'+octave;
                var picker=document.createElement('input');picker.type='color';picker.value=color;picker.dataset.octaveColor=octave;picker.setAttribute('aria-label','オクターブ'+octave+'の色');
                picker.addEventListener('change',function(){if(!picker.isConnected||!currentFrame(c.frame))return;var colors=CS().sheetRenderer.getOctaveColors();colors[octave]=picker.value;CS().sheetRenderer.setOctaveColors(colors);savePianoColors();repaintPianoColors();});label.appendChild(picker);palette.appendChild(label);
            });
            palette.appendChild(button('初期色',function(){CS().sheetRenderer.setOctaveColors(null);savePianoColors();repaintPianoColors();},{'data-piano-colors-reset':''}));root.appendChild(palette);
        }
        var scroll=document.createElement('div');scroll.className='piano-key-scroll';var keyboard=document.createElement('div');keyboard.className='piano-keys';keyboard.setAttribute('aria-label','3オクターブのドレミ鍵盤');
        var first=Math.max(21,12*(piano.octave+1)),last=Math.min(108,12*(piano.octave+4)),whites=[],blacks=[];
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
        var help=document.createElement('p');help.className='piano-help';help.textContent='鍵盤で入力・試聴。マス内の音を選択して変更、＋で次の音を追加。';root.appendChild(help);
        if(piano.message){var message=document.createElement('p');message.className='piano-help';message.setAttribute('role','status');message.textContent=piano.message;root.appendChild(message);}
        var credit=document.createElement('small');credit.className='piano-credit';credit.textContent='Piano: Alexander Holm / Guitar: Iowa · N. P. Brosowsky · CC BY 3.0';root.appendChild(credit);
    }

    function onPianoKeydown(event){
        if(event.isComposing||event.keyCode===229||state.session?.inputPending)return;
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();piano.open=false;stopPianoAudition();els.slotOverlay.querySelectorAll('.piano-color-mode').forEach(function(e){e.classList.remove('piano-color-mode');});refreshPiano();return;}
        if(event.key==='Tab'){
            var c=pianoContext(),field=c&&els.slotOverlay.querySelector('[data-overlay-field="doremi"][data-slot-tick="'+c.range.tick+'"]');
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
            var exact=events.length===1&&events[0].onsetTick===tick?events[0]:null, batch=kind==='doremi'&&autoCellGroup(events,tick,span);
            var input=document.createElement('input');input.type='text';input.className='slot-overlay-input';
            input.style.minWidth='0';input.style.width='100%';input.style.padding='0 3px';input.style.boxSizing='border-box';input.style.textAlign='center';
            input.style.minHeight=kind==='chord'?'max(26px, calc(30px * var(--bar-loupe-scale,1)))':'max(28px, calc(34px * var(--bar-loupe-scale,1)))';
            var boundary=lyricLocalBoundaryClass(range.slot,range.count,range.res,range.beat===getBeats(state.project)-1);
            input.classList.add(boundary);
            input.style.borderRight='1px solid var('+(boundary==='is-beat'?'--paper-line-beat':boundary==='is-8th'?'--paper-line-eighth':boundary==='is-16th'?'--paper-line-sixteenth':'--slot-border')+')';
            if(kind==='doremi'){input.style.fontFamily='var(--paper-font)';input.style.fontSize='max(11px, calc(13px * var(--bar-loupe-scale, 1)))';input.style.fontWeight='600';input.style.letterSpacing='0';}
            input.dataset.overlayField=kind;input.dataset.slotTick=tick;input.dataset.slotTicks=span;input.setAttribute('aria-label',bar.barNumber+'小節目の'+(kind==='chord'?'コード':'ドレミ')+' '+(tick/480+1)+'拍');
            input.value=kind==='chord'?(exact?(bar.chords.find(function(e){return e.tick===tick;})||{}).symbol||'':''):((exact&&exact.kind==='note')||batch?CS().model.getBarDoremiText({melody:bar.melody.filter(function(e){return e.tick>=tick&&e.tick<tick+span;})}):'');
            if(events.length && !exact && !batch){input.readOnly=true;input.value='…';input.title='この範囲には細かな位置のイベントがあります。元の時間情報を保持しています';}
            var composing=false,justComposed=false,nativeHistory=false,replacingAll=false,initial=input.value;
            function apply(composition,absoluteTokens){
                if(input.readOnly||!input.isConnected||state.session!==owner||owner.draft.bars[bar.barNumber-1]?.id!==source.id||composing)return {ok:false};
                if(input.value===initial&&!replacingAll){input.setAttribute('aria-invalid','false');input.classList.remove('is-invalid');var prior=textDiagnostics.get(owner);if(prior)prior.delete(input);return {ok:true};}
                if(!operationEligible()&&!composition)return {ok:false};
                var raw=input.value.trim();
                var result=(composition?owner.runCompositionTextOperation:owner.runTextOperation)(JSON.stringify(['beat',kind,source.id,tick]),'拍位置の'+kind+'入力',function(p){
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
                    }else{
                        var parsed=CS().theory.parseDoremiString(raw);
                        if(parsed.warnings.length||!parsed.notes.length)throw Error('ドレミの表記を確認してください');
                        var units=parsed.notes.reduce(function(n,e){return n+1+e.extensions;},0);
                        if(units>span)throw Error('1マスに入力する音数が多すぎます。元の音を保持しました');
                        var cellEvents=list.filter(function(e){return e.onsetTick>=tick&&e.onsetTick<tick+span;});
                        if(cellEvents.length>1&&!autoCellGroup(cellEvents,tick,span))throw Error('既存の細かな時間情報を保持しています');
                        if(units>1&&old&&!autoCellGroup(cellEvents,tick,span))throw Error('既存の音価を変更するまとめ入力は適用できません。1音ずつ編集してください');
                        var tonic=p.solfege.tonic,key=tonic.step+window.ChordCruise.theory.formatAccidental(tonic.alter),scale=window.ChordCruise.theory.spellScaleNotes({tonicPc:CS().theory.keyToSemitone(key),tonicName:key,scaleId:'major'});
                        var previous=CS().theory.parseDoremiString(initial).notes;
                        var matches=replacingAll?parsed.notes.map(function(){return -1;}):matchTypedNotes(previous,parsed.notes),reserved=new Set(matches.filter(function(n){return n>=0;})),used=new Set();
                        var cursor=tick,usedUnits=0;
                        var generated=parsed.notes.map(function(note,i){
                            var matched=matches[i]>=0?cellEvents[matches[i]]:null,index=matched?matches[i]:cellEvents.findIndex(function(e,j){return !reserved.has(j)&&!used.has(j);}),existing=index>=0?cellEvents[index]:null;used.add(index);
                            var keepTiming=parsed.notes.length===cellEvents.length&&cellEvents.every(function(e){return e.kind==='note'||e.kind==='rest';})&&parsed.notes.every(function(n){return !n.extensions;});
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
                    e.preventDefault();queueEditorFrame(function(){if(state.session!==owner||state.session.draft.bars[state.selectedBarNumber-1]?.id!==source.id)return;var next=els.slotOverlay.querySelector('[data-overlay-field="doremi"][data-slot-tick="'+tick+'"]');if(next){if(piano.open)next.parentElement.classList.add('piano-color-mode');next.focus({preventScroll:true});}});return;
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
                if(e.key==='ArrowUp'||e.key==='ArrowDown'){focusAdjacentRow(kind,tick,e.key==='ArrowUp'?-1:1);return;}
                if((e.key==='Enter'||e.key==='ArrowRight'||(e.key==='Tab'&&!e.shiftKey))&&index===ranges.length-1){moveSelectedBar(1,{focusRowId:kind});return;}
                if((e.key==='ArrowLeft'||(e.key==='Tab'&&e.shiftKey))&&index===0){moveSelectedBar(-1,{focusRowId:kind,focusLast:true});return;}
                var direction=e.key==='ArrowLeft'||(e.key==='Tab'&&e.shiftKey)?-1:1;
                var nextTick=ranges[Math.max(0,Math.min(ranges.length-1,index+direction))].tick;
                if(kind==='doremi'&&CS().theory.parseDoremiString(input.value).notes.length>1){renderSlotOverlayContent();queueEditorFrame(function(){var next=els.slotOverlay.querySelector('[data-overlay-field="'+kind+'"][data-slot-tick="'+nextTick+'"]');if(next)next.focus();});}
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
            }else groups[range.beat].appendChild(input);
        });
        return wrap;
    }

    // Navigation uses time positions, so different subdivisions still share a column.
    function focusAdjacentRow(rowId,tick,direction){
        var target=DOCK_ROW_ORDER[DOCK_ROW_ORDER.indexOf(rowId)+direction];
        if(!target||!els.slotOverlay)return;
        finishTextInputs();
        queueEditorFrame(function(){
            var selector=target==='lyrics'?'.dock-lyrics-cell':target==='strum'?'.dock-strum-cell':'[data-overlay-field="'+target+'"]';
            var cells=Array.from(els.slotOverlay.querySelectorAll(selector));
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
        if (!rowId || !els.slotOverlay) return;
        queueEditorFrame(function () {
            var selector=rowId==='strum'?'.dock-strum-cell':rowId==='lyrics'?'.dock-lyrics-cell':'[data-overlay-field="'+rowId+'"]';
            var cells=els.slotOverlay.querySelectorAll(selector),cell=cells[last?cells.length-1:0];
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
        positionSlotOverlay();
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
            var cell = els.slotOverlay.querySelector('.dock-strum-cell[data-cell-index="' + index + '"]');
            if (cell) cell.focus({ preventScroll: true });
        });
    }

    function focusStrumCellByIndex(index) {
        if (!els.slotOverlay) return;
        var grid = els.slotOverlay.querySelector('.dock-strum-grid');
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
        var grid = els.slotOverlay.querySelector('.dock-lyrics-grid');
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

    /* ══════════ D3a: 自動スクロール（選択小節がドック裏へ隠れないようにする） ══════════ */

    function scrollSelectedBarIntoDockView(barNumber) {
        var cell = getSheetBarByNumber(barNumber);
        if (!cell || !els.slotOverlay || els.slotOverlay.classList.contains('hidden')) return;
        var dockRect = els.slotOverlay.getBoundingClientRect();
        var cellRect = cell.getBoundingClientRect();
        var margin = 16;
        var scroll = CS().scroll;
        var viewportTop = scroll ? scroll.getViewportTop('sheetCruise') : 0;
        var scrollBy = function (options) {
            if (scroll) scroll.scrollBy('sheetCruise', options);
            else window.scrollBy(options);
        };
        if (cellRect.bottom > dockRect.top - margin) {
            scrollBy({ top: cellRect.bottom - (dockRect.top - margin), behavior: 'smooth' });
        } else if (cellRect.top < viewportTop) {
            scrollBy({ top: cellRect.top - viewportTop - margin, behavior: 'smooth' });
        }
    }

    /**
     * 選択小節が変わった時だけ自動スクロールする（入力中の再描画毎には行わない）。
     */
    function maybeAutoScrollToSelection() {
        if (state.selectedBarNumber === state.lastAutoScrollBar) return;
        state.lastAutoScrollBar = state.selectedBarNumber;
        if (!state.selectedBarNumber) return;
        var barNumber = state.selectedBarNumber;
        queueEditorFrame(function () {
            scrollSelectedBarIntoDockView(barNumber);
        });
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
    function applyLoupeGeometry() {
        if (!els.slotOverlay) return;
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
            !!(CS().shellHost && CS().shellHost.getCommandContext().activeModal);
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
        els.slotOverlay.innerHTML = '';

        var bar = getSelectedBar();
        if (!bar) {
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

        var headMain = document.createElement('div');
        headMain.className = 'slot-overlay-head-main';
        var title = document.createElement('span');
        title.className = 'slot-overlay-title';
        title.textContent = bar.barNumber + '小節目';
        headMain.appendChild(title);
        var sectionName = getBarSectionName(bar);
        if (sectionName) {
            var sectionBadge = document.createElement('span');
            sectionBadge.className = 'slot-overlay-section';
            sectionBadge.textContent = sectionName;
            headMain.appendChild(sectionBadge);
        }

        var headActions = document.createElement('div');
        headActions.className = 'slot-overlay-head-actions';

        var nav = document.createElement('div');
        nav.className = 'slot-overlay-nav';
        nav.appendChild(buildOverlayNavButton('← 前へ', -1));
        nav.appendChild(buildOverlayNavButton('次へ →', 1));
        headActions.appendChild(nav);

        headActions.appendChild(buildResolutionToggle(bar));

        headActions.appendChild(buildBulkToggleButton());
        headActions.appendChild(buildBarPlayButton());

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'slot-overlay-close';
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', '小節ルーペを閉じる');
        closeBtn.addEventListener('click', function (event) {
            event.stopPropagation();
            deselectBar();
        });
        closeBtn.addEventListener('mousedown', function (event) {
            event.stopPropagation();
        });
        headActions.appendChild(closeBtn);

        head.appendChild(headMain);
        head.appendChild(headActions);
        els.slotOverlay.appendChild(head);

        // 拍ルーラー（コード/ストローク/歌詞/ドレミの共通時間軸）
        var res = getStrumGridResolution(bar);
        els.slotOverlay.appendChild(buildBeatRuler(bar, res));

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
            rowLabel.textContent = rowDef.label;
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
        });

        els.slotOverlay.appendChild(grid);
        els.slotOverlay.appendChild(buildPianoPanel());
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
        applyLoupeGeometry();
    }

    function syncSheetSelection(preserveInputs) {
        if (!els.scaleBox) return;
        var selectedExists = false;
        Array.prototype.forEach.call(els.scaleBox.querySelectorAll('.sheet-bar[data-bar-number]'), function (cell) {
            var barNumber = parseInt(cell.dataset.barNumber, 10);
            var selected = barNumber === state.selectedBarNumber || selectedBarIds.includes(state.session?.draft.bars[barNumber-1]?.id);
            cell.draggable = true;
            if (selected) selectedExists = true;
            cell.classList.toggle('is-selected', selected);
            cell.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        if (state.selectedBarNumber && !selectedExists) {
            state.selectedBarNumber = null;
            selectionDeleted = true;
        }
        if (!preserveInputs) renderSlotOverlayContent();
        positionSlotOverlay();
        maybeAutoScrollToSelection();
        publishSelection();
    }

    /**
     * D2: 下部ドックは画面下部に固定表示するため座標計算は不要（CSSのposition:fixedに任せる）。
     * ただし、選択中の小節が紙面上から消えた場合（セクション削除・小節数変更等）は
     * 安全側でドックを閉じる。
     */
    function positionSlotOverlay() {
        if (!els.slotOverlay || els.slotOverlay.classList.contains('hidden')) return;
        var cell = getSheetBarByNumber(state.selectedBarNumber);
        if (!cell) {
            els.slotOverlay.classList.add('hidden');
            els.slotOverlay.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('dock-open');
        } else if (staffStyle === 'melody') {
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
        state.selectedBarNumber = barNumber;
        selectionDeleted = false;
        syncSheetSelection();
    }

    function selectBarRange(number, extend) {
        stopPianoAudition();
        var anchor=rangeAnchor || state.selectedBarNumber;
        selectSheetBar(number);
        if(extend&&anchor){rangeAnchor=anchor;var from=Math.min(anchor,number)-1,to=Math.max(anchor,number);selectedBarIds=state.session.draft.bars.slice(from,to).map(function(b){return b.id;});syncSheetSelection();setSaveStatus((from+1)+'〜'+to+'小節を選択');}
    }
    function moveSelectedBars(args) {
        var ids=args.barIds.slice(),res=runStructureOperation('moveBars',args);if(!res.ok)return;
        var index=state.session.draft.bars.findIndex(function(b){return ids.includes(b.id);});selectSheetBar(index+1);selectedBarIds=ids;syncSheetSelection();setSaveStatus((index+1)+'小節目から'+ids.length+'小節を移動（未保存）');
    }
    function onPreviewClick(event) {
        var cell = event.target.closest && event.target.closest('.sheet-bar[data-bar-number]');
        if (!cell || cell.classList.contains('sheet-bar--empty')) return;
        selectBarRange(parseInt(cell.dataset.barNumber, 10), event.shiftKey);
    }

    function onPreviewKeydown(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        var cell = event.target.closest && event.target.closest('.sheet-bar[data-bar-number]');
        if (!cell || cell.classList.contains('sheet-bar--empty')) return;
        event.preventDefault();
        selectBarRange(parseInt(cell.dataset.barNumber, 10), event.shiftKey);
    }

    /* ══════════ 表示トグル（sheetSettings.showChords / showStrum / showLyrics /
       showDoremi / showTimingGrid / timingGridResolution） ══════════ */

    function renderDisplayToggles() {
        var show = CS().sheetRenderer.resolveShowSettings(state.project);
        els.showChords.checked = show.chords;
        els.showStrum.checked = show.strum;
        els.showLyrics.checked = show.lyrics;
        els.showDoremi.checked = show.doremi;
        els.showGrid.checked = show.timingGrid;
        els.gridResolution.value = String(show.gridResolution);
        els.gridResolution.disabled = !show.timingGrid;
    }

    function onDisplayToggleChange() {
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
    function printSheet() {
        readFormIntoProject();
        renderPreview();
        prepareCodePrint();
        window.print();
    }

    function downloadCurrentProjectJson() {
        readFormIntoProject();
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
        stopPianoAudition();
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
        els.scaleBox.addEventListener('dragstart',function(e){var cell=e.target.closest('.sheet-bar[data-bar-number]');if(!cell||!operationEligible()){e.preventDefault();return;}var bar=state.session.draft.bars[Number(cell.dataset.barNumber)-1];dragFrame={ticket:CS().structureOperations.capture(state.session),ids:selectedBarIds.includes(bar.id)?selectedBarIds.slice():[bar.id]};e.dataTransfer.setData('text/plain','Studio bars');e.dataTransfer.effectAllowed='move';});
        els.scaleBox.addEventListener('dragover',function(e){if(dragFrame&&e.target.closest('.sheet-bar[data-bar-number]'))e.preventDefault();});
        els.scaleBox.addEventListener('drop',function(e){var cell=e.target.closest('.sheet-bar[data-bar-number]'),frame=dragFrame;dragFrame=null;if(!cell||!frame||!operationEligible()||!CS().structureOperations.isCurrent(frame.ticket,state.session))return;e.preventDefault();var bar=state.session.draft.bars[Number(cell.dataset.barNumber)-1];moveSelectedBars({barIds:frame.ids,beforeId:bar.id});});
        els.scaleBox.addEventListener('dragend',function(){dragFrame=null;});

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
            if(kind==='operation'&&pianoAudition?.snapshot().mode&&['bar','song'].includes(pianoAudition.snapshot().mode))pianoAudition.cancel();
            if (['external-adopt', 'cancel', 'replace', 'undo', 'redo'].includes(kind)){stopPianoAudition();textDiagnostics.delete(session);}
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
                state.lastAutoScrollBar = null; state.dockBulkOpen = false;
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
        // B-line patch candidate; formal product/cache identity remains A-owned.
        developmentVersion: '0.97.0-dev.1',
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
