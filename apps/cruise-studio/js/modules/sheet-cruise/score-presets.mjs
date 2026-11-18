import {placePlayhead} from '../score-ui.mjs';
import {presetChordCells} from './preset-chord-cells.mjs';
import {presetLibrary, presetWindow, managePresets} from './preset-library.mjs';

// Straight 4/4 patterns adapted from Rhythm Cruise's built-in stages 1–6.
// Progression symbols are in C, matching Pitch Cruise's built-in progressions.
const progressions = [
    ['基本進行', 'C F G C'], ['1950s', 'C Am F G'], ['王道進行', 'F G Em Am'],
    ['小室進行', 'Am F G C'], ['前ツーファイブワン', 'Dm G C Am'],
    ['後ツーファイブワン', 'Am Dm G C'], ['カノン進行', 'C G Am Em F C F G'],
    ['ポップパンク', 'F C G Am'], ['Let it be進行', 'C G Am F'],
    ['洋楽定番 (6415)', 'Am F C G'], ['王道アレンジ (4561)', 'F G Am C'],
    ['マイナー下降', 'Am G F G'], ['強進行 (3625)', 'Em Am Dm G'],
    ['Pop Standard', 'C F C G'], ['Pop Standard 2', 'C G F G'],
    ['625強進行 (1625)', 'C Am Dm G'], ['上昇順次進行 (3456)', 'Em F G Am'],
    ['トニック進行 (1361)', 'C Em Am C'], ['上昇順次進行2 (2345)', 'Dm Em F G']
];
const strokes = [
    ['4分連続', ['↓↓↓↓']], ['基本の8分', ['↓↑↓↑↓↑↓↑']],
    ['空振りを入れた8分', ['↓〜↓↑↓〜↓↑']], ['王道の8分', ['↓〜↓↑〜↑↓↑']],
    ['シンコペーション', ['↓〜↓↑〜↑↓↑', '〜↑↓↑〜↑↓↑']],
    ['王道の16分', ['↓〜〜〜↓〜↓↑〜↑↓〜↓〜↓↑']]
];
const noteStates = ['・', '↓', '↑', '×', '〜', '−'];
const strokeActions = {'・':'rest', '↓':'down', '↑':'up', '×':'mute'};
const stateNames = {'・':'休符', '↓':'ダウン', '↑':'アップ', '×':'ミュート', '〜':'伸ばす', '−':'未入力'};

function validRows(rows) {
    return Array.isArray(rows) && rows.length >= 1 && rows.length <= 8 &&
        rows.every(row => typeof row === 'string' && [4, 8, 16].includes(row.length) &&
            [...row].every(cell => noteStates.includes(cell)));
}

// Accept the Rhythm Cruise “リズムを作る” local storage shape. Shuffle/triplets
// cannot be represented faithfully by the score editor's straight grid.
export function importRhythmPresets(value) {
    return (Array.isArray(value) ? value : [value]).slice(0, 256).flatMap(preset => {
        const resolution = {1:4, 2:8, 3:16}[preset?.stageN];
        const {name, pattern, dirs, patternBars} = preset || {};
        if (!resolution || typeof name !== 'string' || !name.trim() ||
            !Number.isInteger(patternBars) || patternBars < 1 || patternBars > 8 ||
            !Array.isArray(pattern) || pattern.length !== resolution * patternBars ||
            !pattern.every(cell => ['hit', 'rest', 'tie'].includes(cell))) return [];
        const cells = pattern.map((cell, index) => {
            if (cell === 'rest') return '・';
            if (cell === 'tie') return '〜';
            return dirs?.[index] === 'up' || (dirs?.[index] === undefined && resolution > 4 && index % 2) ? '↑' : '↓';
        });
        const rows = Array.from({length:patternBars}, (_, i) => cells.slice(i * resolution, (i + 1) * resolution).join(''));
        return [{name:name.trim().slice(0, 80), rows}];
    });
}

// A tie carries the previous stroke into the next cell without re-attacking.
export function strokeSlots(rows) {
    if (!validRows(rows)) throw Error('ストロークパターンを確認してください');
    return rows.map((row, bar) => {
        const durationTicks = 1920 / row.length;
        const slots = [];
        [...row].forEach((cell, index) => {
            const tick = index * durationTicks;
            if (cell === '−') return;
            if (cell !== '〜') {
                slots.push({tick, durationTicks, action:strokeActions[cell], accent:false});
                return;
            }
            const previous = slots.at(-1);
            if (previous && previous.tick + previous.durationTicks === tick &&
                (previous.action === 'down' || previous.action === 'up')) previous.durationTicks += durationTicks;
            else if (previous || (index === 0 ? bar === 0 || /[・×−]$/.test(rows[bar - 1]) : row[index - 1] !== '〜'))
                throw Error('「伸ばす」はストロークの直後に置いてください');
        });
        return slots;
    });
}

function chordRows(entry, parse) {
    if (Array.isArray(entry.values)) return entry.values.map(symbol => [{tick:0, symbol}]);
    const pattern = entry.pattern;
    if (!Array.isArray(pattern) || !pattern.length || pattern.length > 64 || !pattern.every(bar =>
        Array.isArray(bar) && bar.length <= 64 && bar.every(item => item && Number.isInteger(item.tick) &&
            item.tick >= 0 && item.tick < 1920 && typeof item.symbol === 'string' && parse(item.symbol) &&
            (item.durationTicks === undefined || Number.isInteger(item.durationTicks) &&
                item.durationTicks > 0 && item.durationTicks + item.tick <= 1920)))) return null;
    return pattern;
}
function rowsFromScore(C, view, numbers) {
    return numbers.map(number => {
        if (C.model.rhythmForBar(view, number)?.encoding === 'rhythm-owner-cells-v1')
            throw Error('このリズム素材はパターンのマスに変換できません');
        const slots = C.model.getBarEffectiveStrumSlots(view, number) || [];
        const cells = Array(16).fill('−');
        const fallback = slots.some(slot => slot.tick % 240 || (slot.durationTicks ?? 240) % 240) ? 120 : 240;
        for (const slot of slots) {
            const end = slot.durationTicks === undefined ? slot.tick + fallback : slot.tick + slot.durationTicks;
            if (slot.tick % 120 || end % 120 || end > 1920 || slot.tieToNext)
                throw Error('16分のマスで表せないストロークが含まれています');
            const glyph = Object.keys(strokeActions).find(key => strokeActions[key] === slot.action);
            if (!glyph) throw Error('ストロークの種類を確認してください');
            if (cells[slot.tick / 120] !== '−') throw Error('重なっているストロークが含まれています');
            cells[slot.tick / 120] = glyph;
            for (let index = slot.tick / 120 + 1; index < end / 120; index++) {
                if (cells[index] !== '−') throw Error('重なっているストロークが含まれています');
                cells[index] = slot.action === 'rest' ? '・' : slot.action === 'mute' ? '−' : '〜';
            }
        }
        return cells.join('');
    });
}

// Audition the harmony at practice tempo, shortening only gaps longer than one beat.
export function compactChordAudition(plan) {
    const beat=480*plan.secondsPerTick;
    const attacks=[...new Set(plan.events.map(event=>event.attackStart))].sort((a,b)=>a-b);
    const groups=new Map();
    let end=.03;
    attacks.forEach((attack,index)=>{
        const length=Math.min(beat,(attacks[index+1]??plan.duration)-attack);
        groups.set(attack,{start:end,length});
        end+=length;
    });
    const events=plan.events.map(event=>{
        const group=groups.get(event.attackStart),offset=event.start-event.attackStart;
        return {...event,attackStart:group.start,start:group.start+offset,
            duration:Math.min(event.duration,group.length-offset)};
    }).filter(event=>event.duration>0);
    return {events,duration:end};
}

export function mountScorePresets({C, doc, node, body, status, apply, project, view, args, mode, navigate, createPreviewAudio, loadChordPicker, previewPaperOptions}) {
    const chords = mode === 'chordPreset';
    const storageKey = chords ? 'scoreChordPresetsV1' : 'scoreStrumPresetsV1';
    const saved = C.storage.getAppSetting(storageKey);
    const valid = entry => typeof entry?.name === 'string' && (chords ?
        (Array.isArray(entry.values) ? entry.values.length > 0 && entry.values.length <= 64 &&
            entry.values.every(value => typeof value === 'string' && C.theory.parseBasicChordSymbol(value)) :
            !!chordRows(entry,C.theory.parseBasicChordSymbol)) : validRows(entry.rows));
    const custom = Array.isArray(saved) ? saved.filter(valid).slice(0,64) : [];
    let imported = [];
    if (!chords) {
        try { imported = importRhythmPresets(JSON.parse(doc.defaultView.localStorage.getItem('rhythmCruiseCreatePresets:v1') || '[]')); }
        catch (_) { /* The two apps may be on separate origins. */ }
    }

    function field(label, tag, parent = body) {
        const wrap = node('label', undefined, parent);
        node('span', label, wrap);
        const control = node(tag, undefined, wrap);
        control.setAttribute('aria-label', label);
        return control;
    }
    function option(select, label, value) { node('option', label, select).value = value; }
    function button(label, action, parent) {
        const element = node('button', label, parent);
        element.type = 'button';
        element.onclick = action;
        return element;
    }
    const sidebar = node('aside', undefined, body);
    sidebar.className = 'sc-preset-sidebar';
    const patternArea = node('section', undefined, body);
    patternArea.className = 'sc-preset-pattern';
    const controls = node('div', undefined, sidebar);
    controls.className = 'sc-preset-controls';
    const preset = field('プリセット', 'select', controls);
    preset.dataset.scorePreset = '';
    const guide=node('p','1. プリセットを選ぶ　 2. '+(chords?'入力先の先頭の小節をクリック':'入力する範囲を選ぶ')+'　 3.「適用」ボタンをクリック',sidebar);
    guide.className='sc-preset-guide';
    const builtin = chords ? progressions.map(([name, value]) => ({name, values:value.split(' ')})) :
        strokes.map(([name, rows]) => ({name, rows}));
    let edited = false;
    let entries, current, rows, key, starting, scope, section, grid, refreshGridControls, timedChords, sourceSlots;
    let fitPaper, rangeIndices = [], refreshPaper = () => {}, paintChords = () => {};

    const library = presetLibrary(C.storage, storageKey, builtin, custom, imported, valid);
    let imports = [];
    function populateOptions(selected) {
        entries = [...library.items,...imports];
        preset.replaceChildren();
        for (const entry of entries) option(preset, entry.name, entry.id);
        if (selected && entries.some(item=>item.id===selected.id)) preset.value = selected.id;
    }

    const dialog = body.closest('dialog');
    const rangeControls = node('div', undefined, patternArea);
    rangeControls.className = 'sc-preset-range-controls';
    const stage = button('適用', stagePattern, rangeControls);
    stage.dataset.presetStage = '';
    const steps = [], redoSteps = [];
    let previewProject = project;
    const editor = node('section', undefined, sidebar);
    editor.hidden = true;
    const presetActions=node('div',undefined,controls);presetActions.className='sc-preset-actions';
    const addPreset=button('譜面からプリセット追加',()=>openEditor(null),presetActions);
    const edit=button('プリセットを編集',()=>{
        void stopAudio();
        managePresets(dialog,library,current,openEditor,()=>{
            populateOptions(current);
            if(preset.value!==current?.id)choose();
            else current=entries.find(entry=>entry.id===preset.value);
        });
    },presetActions);
    let author = null, authorHint, saveButton, editingEntry, savedDraft, savedEntry;
    const partName = chords ? 'コード進行' : 'ストローク';
    const patternHead = node('div',undefined,patternArea);
    patternHead.className = 'sc-preview-heading';
    const patternTitle = node('strong',partName,patternHead);
    const patternPlay = button('▶ 再生',() => play('pattern'),patternHead);
    patternPlay.dataset.previewPlay = 'pattern';
    let audio = null, audioKind = null, audioPhase = 'idle', audioEpoch = 0, releasing = Promise.resolve();
    const previewListeners=new Set();
    let cursorFrame=0, playingBar=null;
    const cursor=doc.createElement('span');
    cursor.dataset.layoutPlayhead='';cursor.setAttribute('aria-hidden','true');
    function clearCursor(){
        cancelAnimationFrame(cursorFrame);cursorFrame=0;
        cursor.remove();playingBar?.classList.remove('sc-layout-playing');playingBar=null;
    }
    function paintCursor(){
        if(!dialog.open||audioKind!=='score'||audioPhase!=='playing')return;
        const position=audio.position();
        const bar=position && paperBars[position.barNumber-1];
        if(bar){
            const bounds=bar.getBoundingClientRect(),sheet=page.getBoundingClientRect();
            const scale=sheet.width/page.offsetWidth;
            if(bar!==playingBar){
                playingBar?.classList.remove('sc-layout-playing');playingBar=bar;bar.classList.add('sc-layout-playing');
                const viewport=paper.getBoundingClientRect();
                if(bounds.bottom>viewport.bottom || bounds.top<viewport.top)paper.scrollTop+=bounds.top-viewport.top;
            }
            if(scale>0)placePlayhead(cursor,page,{x:(bounds.left-sheet.left+bounds.width*position.tick/(position.barTicks??1920))/scale,
                y:(bounds.top-sheet.top)/scale,height:bounds.height/scale});
        }
        cursorFrame=requestAnimationFrame(paintCursor);
    }
    function syncPlayButtons() {
        for (const refresh of previewListeners) refresh();
        for (const [kind,btn] of [['pattern',patternPlay],['score',scorePlay]]) {
            const active = audioKind === kind;
            btn.textContent = active ? '■ 停止' : '▶ 再生';
            btn.setAttribute('aria-pressed',String(active));
            btn.setAttribute('aria-busy',String(active && audioPhase === 'loading'));
            btn.setAttribute('aria-label',(kind === 'pattern' ? partName : '譜面') + (active ? 'を停止' : 'を再生'));
        }
    }
    async function stopAudio() {
        clearCursor();
        const old = audio;
        audio = null; audioKind = null; audioPhase='idle'; ++audioEpoch; syncPlayButtons();
        if (old) releasing=old.dispose();
        await releasing;
    }
    function patternProject(forPicker = false) {
        const schema = C.model.schema2;
        const patterns = chords ? timedChords : (sourceSlots || strokeSlots(rows));
        const barTicks = schema.barLength(project);
        if(patterns.some(events=>events.some(event=>event.tick>=barTicks||
            (!chords&&event.tick+(event.durationTicks??1)>barTicks))))
            throw Error('このパターンは曲の拍子に収まりません');
        const rhythms = [], barRhythms = [];
        const instrument=structuredClone(project.instrument);
        if(forPicker) {instrument.maxAbsoluteFret=(instrument.maxAbsoluteFret??22)-instrument.capo;instrument.capo=0;}

        const bars = patterns.map(events => {
            const id = schema.newId(), materialId = schema.newId();
            const harmony = chords ? events : [{tick:0,symbol:view.songInfo.playKey}];
            const slots = chords ? events.map((event,i) => ({tick:event.tick,action:'down',
                durationTicks:Math.min(event.durationTicks??(events[i+1]?.tick??barTicks)-event.tick,barTicks-event.tick)})) : events;
            rhythms.push({id:materialId,encoding:'studio-strum-v1',snapshot:{slots}});
            barRhythms.push({barId:id,materialId});
            return {id,melody:[],chords:harmony.map(event=>({id:schema.newId(),onsetTick:event.tick,
                symbol:schema.chord(event.symbol,instrument.capo),
                ...(event.durationTicks===undefined ? {} : {durationTicks:Math.min(event.durationTicks,barTicks-event.tick)})}))};
        });
        const draft={...project,bars,instrument,songInfo:{...project.songInfo,...(forPicker?{originalKey:key.value}:{})},
            materials:{...project.materials,forms:[],rhythms},performance:{...project.performance,barRhythms,formBindings:[]}};
        if(chords) patterns.forEach((events,i)=>events.forEach((entry,j)=>{
            if(entry.form) C.localChordForms.installPreset(draft,bars[i].chords[j],entry.form);
        }));
        return draft;
    }
    async function play(kind,auditionPlan) {
        const same = audioKind === kind;
        const stopped = stopAudio(), ticket = audioEpoch;
        await stopped;
        if (same && !auditionPlan || ticket !== audioEpoch || !dialog.open) return;
        try {
            const source = kind === 'note' || kind === 'pattern' ? patternProject() : previewProject;
            const player = createPreviewAudio(source,{
                patternOnly:kind!=='score', auditionTiming:chords && kind==='pattern' ? compactChordAudition : null, auditionPlan, isOpen:()=>ticket===audioEpoch && dialog.open,
                changed(phase) {
                    if (ticket!==audioEpoch) return;
                    clearCursor();
                    if(kind==='score'&&phase==='playing')cursorFrame=requestAnimationFrame(paintCursor);
                    audioPhase = phase; audioKind = phase === 'idle' ? null : kind;
                    syncPlayButtons();
                },
                message(text) { if (ticket===audioEpoch) status.textContent=text; }
            });
            audio = player; audioKind = kind; audioPhase='loading'; syncPlayButtons();
            await player.play();
        } catch(error) { if(ticket===audioEpoch){void stopAudio();status.textContent=error.message;} }
    }
    dialog.addEventListener('close',()=>{void stopAudio();},{once:true});

    function showPattern(entry = null) {
        editingEntry = entry; patternPlay.disabled=false;
        patternArea.hidden = editor.hidden = false;
        saveButton.hidden = false;
        patternTitle.textContent = entry ? entry.name : partName;
        fitPaper?.();
    }
    function restorePattern() {
        if (key) previousKey=key.value=savedDraft.key;
        ({rows,sourceSlots,timedChords,edited}=structuredClone(savedDraft));
        if (chords) paintChords();
        else paintGrid();
    }
    function openEditor(initialEntry) {
        if (author?.open) return;
        void stopAudio();
        savedDraft = structuredClone({current, key:key?.value, rows, sourceSlots, timedChords,
            edited, rangeIndices});
        savedEntry = editingEntry = null;
        author = presetWindow(dialog,initialEntry?'プリセットを編集':'譜面からプリセット追加','sc-batch-dialog sc-preset-author');
        const authorBody = node('div',undefined,author); authorBody.className = 'sc-preset-dialog-body';
        authorHint=node('p','',authorBody);authorHint.className='sc-preset-guide';
        function editEntry(entry){
            resetCellEditor();populateOptions(entry);choose();targetArea.hidden=true;showPattern(entry);
            paintAuthorGrid();status.textContent='';authorHint.textContent='内容を調整して保存';
        }
        targetArea.hidden=true;
        authorBody.append(patternArea,targetArea,status);
        patternArea.hidden = true;
        patternArea.append(editor);

        rangeControls.hidden = true;
        editor.hidden = true;
        saveButton = button('プリセットに保存',openNameDialog,editor);
        saveButton.className = 'sc-preset-primary'; saveButton.hidden = true;
        rangeIndices = []; refreshPaper();
        status.textContent = '';
        hint.hidden = true; scoreHead.hidden = rail.hidden = true;
        author.addEventListener('close',() => {
            void stopAudio(); resetCellEditor(); author=null; targetArea.hidden=false;
            saveButton.remove(); sidebar.append(editor); editor.hidden=true;
            body.append(patternArea,targetArea); sidebar.append(status);

            hint.hidden=false; scoreHead.hidden=rail.hidden=false; patternArea.hidden=false; rangeControls.hidden=false;
            rangeIndices=savedDraft.rangeIndices;
            const old = entries.find(item=>item.id===savedDraft.current?.id);
            populateOptions(savedEntry || old); choose();
            if (!savedEntry && old && JSON.stringify(old)===JSON.stringify(savedDraft.current)) {
                restorePattern();
            }
            patternTitle.textContent=partName;
            update();fitPaper?.();(initialEntry?edit:addPreset).focus();
            if(savedEntry) status.textContent='プリセットを保存しました。';
        },{once:true});
        if(initialEntry) editEntry(initialEntry);
        else {
            resetCellEditor();targetArea.hidden=false;
            authorHint.textContent='1. 譜面をドラッグして取り込む範囲を選択';
            refreshPaper();fitPaper();
        }
    }
    function openNameDialog() {
        void stopAudio();
        const win = presetWindow(author,'プリセットに保存');
        const name = field('プリセット名','input',win);
        name.maxLength=80; name.value=editingEntry?.name || '';
        const message=node('p','',win); message.setAttribute('role','status');
        const save=button('保存',()=>savePreset(win,name.value,message),win);
        save.className='sc-preset-primary';
        name.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();save.click();}};
        name.focus(); name.select();
    }
    let resetCellEditor=()=>{}, paintAuthorGrid=()=>{};
    const selected = new Set(args.barIds || []);
    const selectedBars = project.bars.filter(bar => selected.has(bar.id));
    const first = selectedBars[0] || project.bars[0];
    if (chords) {
        key = field('Playキー', 'select', controls);
        const keys = new Set([view.songInfo.playKey, 'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
        for (const value of keys) option(key, value, value);
        const cellHost=node('section',undefined,patternArea);cellHost.className='sc-preset-cell-editor';
        const cells=presetChordCells({C,doc,loadChordPicker,host:cellHost,read:()=>timedChords,
            write:pattern=>{timedChords=pattern;edited=true;update();},
            project:()=>patternProject(true),play:()=>play('pattern'),
            preview:plan=>play('note',{...plan,duration:2,events:plan.events.map(e=>({...e,midi:e.midi+project.instrument.capo}))}),
            previewState:()=>({scope:audioKind==='pattern'?'chords':null,phase:audioPhase}),
            subscribePreview:refresh=>{previewListeners.add(refresh);return ()=>previewListeners.delete(refresh);},
            closeAudio:()=>void stopAudio(),notice:message=>{status.textContent=message;}});
        resetCellEditor=cells.reset;
        paintAuthorGrid=cells.render;
        paintChords=cells.render;
        dialog.addEventListener('close',cells.reset,{once:true});
        starting=project.bars.indexOf(first);
    } else {
        grid = node('div', undefined, patternArea);
        grid.className = 'sc-strum-preset-grid';
        const advanced = node('details', undefined, editor);
        node('summary', 'パターンを編集・読み込む', advanced);
        const hint = node('p', 'マスをクリックして、休符・↓・↑・×・伸ばすを切り替えます。', advanced);
        hint.className = 'sc-strum-preset-hint';
        const division = field('新しい小節の入力単位', 'select', advanced);
        for (const count of [4, 8, 16]) option(division, count + '分', count);
        button('空のパターンを作る', () => {
            edited = true; sourceSlots = null;
            rows = ['・'.repeat(Number(division.value))];
            paintGrid(); update();
        }, advanced);
        const add = button('＋ パターンに小節を追加', () => {
            if (rows.length >= 8) return;
            edited = true; sourceSlots = null;
            rows.push('・'.repeat(Number(division.value)));
            paintGrid(); update();
        }, advanced);
        const remove = button('末尾の小節を外す', () => {
            if (rows.length <= 1) return;
            edited = true; sourceSlots = null;
            rows.pop(); paintGrid(); update();
        }, advanced);
        const file = field('リズムクルーズのプリセットJSON（4・8・16分）', 'input', advanced);
        const importedPattern = field('読み込んだパターン','select',advanced);
        importedPattern.parentElement.hidden = true;
        importedPattern.onchange = () => {
            const picked=imports.find(entry=>entry.id===importedPattern.value);
            if (picked) { populateOptions(picked); choose(); showPattern(); }
        };
        file.type = 'file';
        file.accept = '.json,application/json';
        if (doc.getElementById('studio-rhythm-panel')?.childElementCount)
            button('リズム素材を選ぶ', () => navigate('rhythmMaterials'), advanced);
        file.onchange = async () => {
            const picked = file.files[0], windowAtPick = author;
            file.value = '';
            if (!picked) return;
            try {
                if (picked.size > 1024 * 1024) throw Error('1 MB以内のJSONを選んでください');
                const choices = importRhythmPresets(JSON.parse(await picked.text()));
                if (!choices.length) throw Error('読み込める4・8・16分のプリセットが見つかりません');
                if (!windowAtPick?.open || author!==windowAtPick) return;
                imports = choices.map(item=>({...item,id:'file:' + crypto.randomUUID()}));
                importedPattern.replaceChildren();
                for (const entry of imports) option(importedPattern,entry.name,entry.id);
                importedPattern.parentElement.hidden=imports.length < 2;
                importedPattern.onchange();
                status.textContent = choices.length + '件読み込みました。残す場合は「プリセットに保存」を使ってください。';
            } catch (error) { status.textContent = error.message; }
        };
        scope = field('適用範囲', 'select', rangeControls);
        option(scope, '選択範囲', 'selection');
        option(scope, 'セクション', 'section');
        option(scope, '曲全体', 'all');
        scope.value = selectedBars.length > 1 ? 'selection' : 'section';
        section = field('セクション', 'select', rangeControls);
        for (const item of project.sections) option(section, item.name, item.id);
        section.value = first?.sectionId || '';
        refreshGridControls = () => {
            division.value = String(rows[0].length);
            add.disabled = rows.length >= 8;
            remove.disabled = rows.length <= 1;
        };
    }

    controls.append(presetActions);
    const strip=node('div',undefined,patternArea);strip.className='sc-pattern-strip';
    strip.append(patternPlay,patternArea.querySelector('.sc-preset-cell-editor,.sc-strum-preset-grid'));
    patternArea.prepend(patternHead,strip);
    patternArea.append(rangeControls);
    rangeControls.append(stage);
    const preview = node('p', '', rangeControls);
    preview.className = 'sc-preset-preview';
    preview.setAttribute('aria-live', 'polite');
    sidebar.appendChild(status);
    apply.textContent = 'OK';
    apply.disabled = true;
    dialog.querySelector('header').appendChild(apply);
    const targetArea = node('section', undefined, body);
    targetArea.className = 'sc-preset-target';
    const targetHint = chords ? 'クリックで開始小節を指定' : 'クリックでセクションを指定、ドラッグで範囲を選択';
    const scoreHead = node('div',undefined,targetArea); scoreHead.className='sc-preview-heading';
    node('strong','曲の譜面',scoreHead);
    const scorePlay=button('▶ 再生',()=>play('score'),scoreHead);
    scorePlay.title='曲の譜面を先頭から再生・停止（スペースキー）';
    dialog.addEventListener('keydown',event=>{
        if(author || event.defaultPrevented || (event.code!=='Space'&&event.key!==' ') || event.isComposing ||
            event.keyCode===229 || event.ctrlKey || event.altKey || event.metaKey ||
            event.target.closest('input,textarea,select,summary,[contenteditable=true]'))return;
        // Other controls keep native Space activation; a score measure uses Enter for selection.
        const control=event.target.closest('button');
        if(control && control!==scorePlay && control!==stage)return;
        event.preventDefault();if(!event.repeat)void play('score');
    });
    scorePlay.dataset.previewPlay='score'; syncPlayButtons();
    const hint = node('p', targetHint, scoreHead);
    hint.className = 'sc-preset-hint';
    const paper = node('div', undefined, targetArea);
    paper.className = 'sc-preset-paper';
    const frameBox = node('div', undefined, paper);
    frameBox.className = 'sc-preset-sheet-frame';
    const sourcePage=doc.querySelector('#sc-sheet-scale-box .sheet-page');
    if(sourcePage) frameBox.style.setProperty('--sc-source-font-size',getComputedStyle(sourcePage).fontSize);
    const paperArea=node('div',undefined,targetArea);paperArea.className='sc-preset-paper-area';
    const rail=node('div',undefined,paperArea);rail.className='sc-score-preview-rail';rail.append(scorePlay);
    paperArea.append(paper);
    let page, paperBars;
    function renderPaper() {
        C.sheetRenderer.render(previewProject,frameBox,{...previewPaperOptions(previewProject),
            readOnly:true,editableSlots:false});
        for(const item of frameBox.querySelectorAll('.sheet-form-event')) {
            item.setAttribute('role','img');item.removeAttribute('aria-haspopup');
        }
        page = frameBox.querySelector('.sheet-page');
        C.localPaperLayout?.apply(frameBox);
        frameBox.querySelectorAll('[tabindex]').forEach(item => item.removeAttribute('tabindex'));
        paperBars = Array.from(frameBox.querySelectorAll('.sheet-bar[data-bar-number]'));
        for (const item of paperBars) {
            item.tabIndex = 0;
            item.setAttribute('role','button');
            item.setAttribute('aria-label', item.dataset.barNumber + '小節目を選択');
        }
    }
    renderPaper();
    {
        const fit = () => {
            if (!paper.clientWidth || !page.offsetWidth) return;
            const width=paper.clientWidth;
            const scale=width/page.offsetWidth;
            page.style.transform='scale('+scale+')';
            frameBox.style.width=Math.round(page.offsetWidth*scale)+'px';
            strip.style.setProperty('--pattern-width',width+'px');
            frameBox.style.height = Math.ceil(page.offsetHeight * scale) + 'px';
        };
        fitPaper = fit;
        let frame;
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(fit);
        });
        observer.observe(paper);
        doc.fonts?.ready.then(() => { if (body.isConnected) fit(); });
        body.closest('dialog').addEventListener('close', () => { observer.disconnect(); cancelAnimationFrame(frame); }, {once:true});
    }

    let gesture = null;
    function barAt(target) { return Number(target?.closest('.sheet-bar[data-bar-number]')?.dataset.barNumber) - 1; }
    function setRange(start, end) {
        rangeIndices = Array.from({length:Math.abs(end - start) + 1}, (_, index) => Math.min(start, end) + index);

    }
    function chooseFromPaper(start, end) {
        setRange(start, end);
        if (author) { refreshPaper(); captureFromScore(); return; }
        if (chords) {
            starting = Math.min(start,end);
        } else {
            scope.value = start === end ? 'section' : 'selection';
            section.value = project.bars[start].sectionId;
        }
        update();
        paperBars[start]?.focus({preventScroll:true});
    }
    paper.addEventListener('pointerdown', event => {
        const index = barAt(event.target);
        if (event.button !== 0 || (event.pointerType === 'touch' && !author) || !Number.isInteger(index) || index < 0) return;
        gesture = {pointer:event.pointerId, start:index, end:index};
        paper.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    paper.addEventListener('pointermove', event => {
        if (gesture?.pointer !== event.pointerId) return;
        const index = barAt(doc.elementFromPoint(event.clientX, event.clientY));
        if (Number.isInteger(index) && index >= 0 && index !== gesture.end) {
            gesture.end = index;
            setRange(gesture.start, index); refreshPaper();
        }
    });
    paper.addEventListener('pointerup', event => {
        if (gesture?.pointer !== event.pointerId) return;
        chooseFromPaper(gesture.start, gesture.end);
        gesture = null;
    });
    paper.addEventListener('pointercancel', () => { gesture = null; });
    paper.addEventListener('click', event => {
        const index = barAt(event.target);
        if (Number.isInteger(index) && index >= 0) chooseFromPaper(index, event.shiftKey && rangeIndices.length ? rangeIndices[0] : index);
    });
    paper.addEventListener('keydown', event => {
        const index = barAt(event.target);
        if (index < 0 || !Number.isInteger(index) || !(event.key==='Enter' || author && event.key===' ')) return;
        event.preventDefault();
        chooseFromPaper(index, event.shiftKey && rangeIndices.length ? rangeIndices[0] : index);
    });
    refreshPaper = (ids = []) => {
        const target = new Set(ids), source = new Set(rangeIndices);
        paperBars.forEach(item => {
            const index = barAt(item);
            item.toggleAttribute('data-preset-destination', target.has(project.bars[index]?.id));
            item.toggleAttribute('data-preset-source', source.has(index) && (author || gesture !== null));
        });
    };
    function captureFromScore() {
        if (!rangeIndices.length) return;
        try {
            if (rangeIndices.length > (chords ? 64 : 8)) throw Error('取り込む小節数を減らしてください');
            const indices = rangeIndices.slice();
            if (chords) {
                const captured = indices.map(index => previewProject.bars[index].chords.map(event => {
                    const symbol = event.unresolved ? null : C.model.schema2.chord(event.symbol, -project.instrument.capo);
                    if (!symbol) throw Error('未解決のコードを含む範囲は取り込めません');
                    const binding=previewProject.performance.formBindings.find(b=>b.chordEventId===event.id);
                    let form;
                    if(binding){
                        const material=previewProject.materials.forms.find(m=>m.id===binding.materialId);
                        if(!material)throw Error('登録フォームを読み込めません');
                        const {id,...portable}=material;
                        form={playSymbol:symbol,material:structuredClone(portable),playedStrings:binding.playedStrings.slice(),
                            confirmed:C.localChordForms.evaluate(previewProject,binding).ready};
                    }
                    return {symbol, tick:event.onsetTick,...(form?{form}:{}), ...(event.durationTicks === undefined ? {} : {durationTicks:event.durationTicks})};
                }));
                if (!captured.some(events => events.length)) throw Error('選んだ範囲にコードがありません');
                key.value = view.songInfo.playKey; previousKey = key.value;
                timedChords = captured;
                paintChords();
            } else {
                const previewView = C.model.toStructureView(previewProject);
                rows = rowsFromScore(C, previewView, indices.map(index => index + 1));
                sourceSlots = indices.map(index => (C.model.getBarEffectiveStrumSlots(previewView, index + 1) || []).map(slot => {
                    const {id, ...value} = slot;
                    return value;
                }));
                paintGrid();
            }
            edited = true;
            void stopAudio(); resetCellEditor();showPattern(); paintAuthorGrid(); update(); refreshPaper();
            authorHint.textContent = '2. ' + partName + 'を調整して保存';
            status.textContent = '';
        } catch (error) {
            patternArea.hidden = true; void stopAudio();
            authorHint.textContent = '2. 譜面をドラッグして取り込む範囲を選択';
            status.textContent = error.message;
        }
    }
    let previousKey = key?.value;
    if (selectedBars.length > 1) setRange(project.bars.indexOf(selectedBars[0]), project.bars.indexOf(selectedBars.at(-1)));


    function paintGrid() {
        grid.replaceChildren();
        rows.forEach((row, index) => {
            const line = node('div', undefined, grid);
            line.setAttribute('aria-label', 'パターン ' + (index + 1) + '小節目');
            line.style.gridTemplateColumns = 'repeat(' + row.length + ', minmax(30px, 1fr))';
            [...row].forEach((cell, column) => {
                const cellButton = button(cell, () => {
                    const next = noteStates[(noteStates.indexOf(rows[index][column]) + 1) % noteStates.length];
                    edited = true; sourceSlots = null;
                    rows[index] = rows[index].slice(0, column) + next + rows[index].slice(column + 1);
                    renderCell(next); update();
                }, line);
                function renderCell(value) {
                    cellButton.textContent = value;
                    cellButton.dataset.stroke = value;
                    cellButton.title = (index + 1) + '小節目・' + (column + 1) + 'マス目 ' + stateNames[value];
                    cellButton.setAttribute('aria-label', cellButton.title);
                }
                renderCell(cell);
            });
        });
        refreshGridControls();
    }

    function transpose(values, amount) {
        return values.map(value => {
            const symbol = C.model.schema2.chord(value, amount);
            if (symbol === null) throw Error('コード名を確認してください');
            return symbol;
        });
    }
    function transposePattern(pattern, amount) {
        return pattern.map(events => events.map(event => ({...event, symbol:transpose([event.symbol], amount)[0]})));
    }
    function plan() {
        if (chords) {
            const pattern = timedChords;
            if (!pattern?.some(events => events.length)) throw Error('コードを入力してください');
            const from = starting;
            if (from < 0 || from + pattern.length > project.bars.length)
                throw Error('曲の末尾までに ' + pattern.length + ' 小節の入力先がありません。開始小節を変更してください');
            return {pattern, bars:project.bars.slice(from, from + pattern.length)};
        }
        const bars = scope.value === 'all' ? project.bars : scope.value === 'selection' ? rangeIndices.map(index => project.bars[index]) :
            project.bars.filter(bar => bar.sectionId === section.value);
        if (!bars.length) throw Error('適用先に小節がありません');
        return {bars, pattern:(sourceSlots || strokeSlots(rows)).slice(0, bars.length)};
    }
    function update() {
        if (audioKind === 'pattern') void stopAudio();
        if (section) section.parentElement.hidden = scope.value !== 'section';
        try {
            const {bars} = plan();
            refreshPaper(author ? [] : bars.map(bar => bar.id));
            const from = project.bars.indexOf(bars[0]) + 1;
            const to = project.bars.indexOf(bars.at(-1)) + 1;
            stage.disabled = !current;
            preview.textContent = (from === to ? from + '小節目' : from + '〜' + to + '小節目') + 'に入力' +
                (chords ? '' : '。既存のストロークは置き換わります。');
        } catch (error) {
            stage.disabled = true;
            preview.textContent = error.message;
            refreshPaper();
        }
    }
    function choose() {
        resetCellEditor();
        void stopAudio();
        current = entries.find(entry=>entry.id===preset.value);
        if (!current) {
            rows=['・・・・']; sourceSlots=null; timedChords=[[]];
            if(chords)paintChords();else paintGrid();
            update(); stage.disabled=true;patternPlay.disabled=true;return;
        }
        patternPlay.disabled=false;
        edited = false;

        if (chords) {
            timedChords = transposePattern(chordRows(current, C.theory.parseBasicChordSymbol), C.theory.keyToSemitone(key.value));
            paintChords();
        } else { rows = current.rows.slice(); sourceSlots = current.slots || null; paintGrid(); }
        status.textContent = '';
        update();
    }
    function savePreset(win, text, message) {
        try {
            const name=text.trim();
            if (!name || library.items.some(item=>item.name===name && item.id!==editingEntry?.id))
                throw Error('未使用のプリセット名を入力してください');
            const entry = {id:editingEntry?.id || crypto.randomUUID(), name};
            if (chords) {
                if (!timedChords.some(events=>events.length)) throw Error('コードを入力してください');
                entry.pattern=transposePattern(timedChords,-C.theory.keyToSemitone(key.value));
            } else {
                if (sourceSlots) entry.slots=sourceSlots;
                else strokeSlots(rows);
                entry.rows=rows.slice();
            }
            const replacing=library.items.some(item=>item.id===entry.id);
            library.write(replacing ? library.items.map(item=>item.id===entry.id ? entry : item) : [...library.items,entry]);
            savedEntry=entry;win.close();author.close();
        } catch(error) { message.textContent=error.message; }
    }
    preset.onchange = choose;
    if (chords) {
        key.value = view.songInfo.playKey;
        previousKey = key.value;
        key.onchange = () => {
            try {
                timedChords = transposePattern(timedChords, C.theory.keyToSemitone(key.value) - C.theory.keyToSemitone(previousKey));
                previousKey = key.value;
                paintChords();
            } catch (error) { key.value = previousKey; status.textContent = error.message; }
            update();
        };
    } else scope.onchange = section.onchange = update;
    populateOptions(); choose();
    fitPaper?.();
    function stagePattern() {
        try {
            void stopAudio();
            const {bars, pattern} = plan(), barIds = bars.map(bar => bar.id);
            const entry = structuredClone(chords ? {barIds, pattern, overwrite:true} :
                {barIds, pattern, name:edited ? 'カスタムストローク' : current.name});
            previewProject = C.structureOperations.previewPreset(previewProject, mode, entry, C.model.schema2,C.localChordForms?.installPreset);
            steps.push(entry);redoSteps.length=0;stage.focus({preventScroll:true});
            renderPaper(); fitPaper(); update();
            apply.disabled = false;
            status.textContent = '';
        } catch (error) { status.textContent = error.message; }
    }
    dialog.addEventListener('keydown',event=>{
        if(event.defaultPrevented || event.isComposing || event.keyCode===229 || event.altKey ||
            !(event.ctrlKey||event.metaKey) || event.key.toLowerCase()!=='z' ||
            event.target.closest('input,textarea,[contenteditable=true]'))return;
        const redo=event.shiftKey;
        if(!(redo?redoSteps:steps).length)return;
        event.preventDefault();
        try {
            const next=redo?[...steps,redoSteps.at(-1)]:steps.slice(0,-1);
            const restored=next.reduce((draft,step)=>C.structureOperations.previewPreset(draft,mode,step,
                C.model.schema2,C.localChordForms?.installPreset),project);
            if(redo)steps.push(redoSteps.pop());else redoSteps.push(steps.pop());
            void stopAudio();previewProject=restored;apply.disabled=!steps.length;
            renderPaper();fitPaper();update();status.textContent='';
        }catch(error){status.textContent=error.message;}
    });
    return () => !author && steps.length ? {kind:mode, args:{steps}} : null;
}
