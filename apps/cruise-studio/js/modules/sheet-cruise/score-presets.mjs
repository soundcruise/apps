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

function strokeFill(value, width) {
    const tail = value === '↓' || value === '↑' ? '〜' : value === '×' ? '−' : value;
    return value + tail.repeat(width - 1);
}

// A tie carries the previous stroke into the next cell without re-attacking.
export function strokeSlots(rows, barTicks=1920) {
    if (!validRows(rows)) throw Error('ストロークパターンを確認してください');
    return rows.map((row,index)=>decodeStrokeRow(row,barTicks,canCarry(rows[index-1],barTicks)));
}
function canCarry(previous,barTicks){
    return !!previous && /[↓↑〜]$/.test(previous.slice(0,barTicks*previous.length/1920));
}
function decodeStrokeRow(row,barTicks,carry) {
    const durationTicks = 1920 / row.length;
    const slots = [];
    [...row].forEach((cell, index) => {
        const tick = index * durationTicks;
        if (tick>=barTicks || cell === '−') return;
        if (cell !== '〜') {
            slots.push({tick, durationTicks, action:strokeActions[cell], accent:false});
            return;
        }
        const previous = slots.at(-1);
        if (previous && previous.tick + previous.durationTicks === tick &&
            (previous.action === 'down' || previous.action === 'up')) previous.durationTicks += durationTicks;
        else if (previous || (index === 0 ? !carry : row[index - 1] !== '〜'))
            throw Error('「伸ばす」はストロークの直後に置いてください');
    });
    return slots;
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
function leadingHold(row) {
    return (row.match(/^〜+/)?.[0].length || 0) * 1920 / row.length;
}

function rowsFromScore(C, view, numbers) {
    return numbers.map(number => {
        if (C.model.rhythmForBar(view, number)?.encoding === 'rhythm-owner-cells-v1')
            throw Error('このリズム素材はパターンのマスに変換できません');
        const slots = C.model.getBarEffectiveStrumSlots(view, number) || [];
        const cells = Array(16).fill('−');
        const bar = view.bars[number-1];
        const pattern = view.strumPatterns.find(item=>item.id===(bar.strumOverride||view.basicStrumPatternId));
        cells.fill('〜',0,(pattern?.leadingSustainTicks||0)/120);
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
    const measureTicks=C.model.schema2.barLength(project);
    const beatsPerBar=measureTicks/480;
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
    let entries, current, rows, key, starting, gridUnits=[], beatUnits=[], selectedStroke=null, grid, refreshGridControls, timedChords, sourceSlots;
    let sectionSelected=false, fitPaper, rangeIndices = [], refreshPaper = () => {}, paintChords = () => {};

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
    if (!chords) node('small','クリックでマスを選択。もう一度クリックで変更。D・Uでダウン・アップを入力。',patternHead);
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
    function slotsForGrid(row,index) {
        const slots=decodeStrokeRow(row,measureTicks,canCarry(rows[index-1],measureTicks));
        const cells=strokeGrid(gridUnits[index]??row.length,beatUnits[index]??[]);
        // Merge adjacent rest fragments only within the same displayed cell.
        const result=[];
        for(const cell of cells){
            const start=cell.start*120, end=(cell.start+cell.span)*120;
            const inCell=slots.filter(slot=>slot.tick>=start && slot.tick<end);
            if(inCell.length && inCell[0].tick===start && inCell.every((slot,i)=>
                slot.action==='rest' && slot.tick+slot.durationTicks===(inCell[i+1]?.tick??end))){
                result.push({...inCell[0],durationTicks:end-start});
            }else result.push(...inCell);
        }
        return result;
    }
    function patternSlots() {
        return rows.map((row,index)=>{
            const exact=sourceSlots?.[index];
            if(!exact)return slotsForGrid(row,index);
            return exact.filter(slot=>slot.tick<measureTicks).map(slot=>
                slot.durationTicks>measureTicks-slot.tick ? {...slot,durationTicks:measureTicks-slot.tick} : slot);
        });
    }
    function patternProject(forPicker = false) {
        const schema = C.model.schema2;
        const patterns = chords ? timedChords : patternSlots();
        const barTicks = schema.barLength(project);
        if(patterns.some(events=>events.some(event=>event.tick>=barTicks||
            (!chords&&event.tick+(event.durationTicks??1)>barTicks))))
            throw Error('このパターンは曲の拍子に収まりません');
        const rhythms = [], barRhythms = [];
        const instrument=structuredClone(project.instrument);
        if(forPicker) {instrument.maxAbsoluteFret=(instrument.maxAbsoluteFret??22)-instrument.capo;instrument.capo=0;}

        const bars = patterns.map((events,index) => {
            const id = schema.newId(), materialId = schema.newId();
            const harmony = chords ? events : index===0 ? [{tick:0,symbol:view.songInfo.playKey}] : [];
            const slots = chords ? events.map((event,i) => ({tick:event.tick,action:'down',
                durationTicks:Math.min(event.durationTicks??(events[i+1]?.tick??barTicks)-event.tick,barTicks-event.tick)})) : events;
            const leading = chords ? 0 : Math.min(barTicks,leadingHold(rows[index]));
            rhythms.push({id:materialId,encoding:'studio-strum-v1',snapshot:{slots,...(leading && {leadingSustainTicks:leading})}});
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
        ({rows,sourceSlots,timedChords,edited,gridUnits,beatUnits}=structuredClone(savedDraft));
        if (chords) paintChords();
        else paintGrid();
    }
    function openEditor(initialEntry) {
        if (author?.open) return;
        void stopAudio();
        savedDraft = structuredClone({current, key:key?.value, rows, sourceSlots, timedChords,
            edited, rangeIndices,selectionAnchor,sectionSelected,gridUnits,beatUnits});
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
        rangeIndices = []; selectionAnchor=null; refreshPaper();
        status.textContent = '';
        hint.hidden = true; scoreHead.hidden = rail.hidden = true;
        author.addEventListener('close',() => {
            void stopAudio(); resetCellEditor(); author=null; targetArea.hidden=false;
            saveButton.remove(); sidebar.append(editor); editor.hidden=true;
            body.append(patternArea,targetArea); sidebar.append(status);

            hint.hidden=false; scoreHead.hidden=rail.hidden=false; patternArea.hidden=false; rangeControls.hidden=false;
            rangeIndices=savedDraft.rangeIndices;selectionAnchor=savedDraft.selectionAnchor;sectionSelected=savedDraft.sectionSelected;
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
        const save=button('保存',()=>savePreset(win,name.value,message),win.querySelector('header'));
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
            gridUnits=[];beatUnits=[];selectedStroke=null;
            rows = ['・'.repeat(Number(division.value))];
            paintGrid(); update();
        }, advanced);
        const lengthTools=node('div',undefined,patternArea);
        lengthTools.className='sc-pattern-length-tools sc-stroke-length-tools';
        const add=button('＋ 小節',()=>{
            if(rows.length>=8)return;
            const unit=gridUnits.at(-1)??rows.at(-1).length;
            rows.push('−−−−');gridUnits[rows.length-1]=unit;beatUnits[rows.length-1]=[];
            if(sourceSlots)sourceSlots.push([]);
            edited=true;selectedStroke=null;paintGrid();update();
        },lengthTools);
        const remove=button('末尾の空小節を削除',()=>{
            if(rows.length<=1 || /[^−]/.test(rows.at(-1)))return;
            rows.pop();sourceSlots?.pop();gridUnits.length=beatUnits.length=rows.length;
            edited=true;selectedStroke=null;paintGrid();update();
        },lengthTools);
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
        refreshGridControls = () => {
            if(!division.value)division.value = '8';
            add.disabled = rows.length >= 8;
            remove.disabled = rows.length <= 1 || /[^−]/.test(rows.at(-1));
        };
    }

    controls.append(presetActions);
    const strip=node('div',undefined,patternArea);strip.className='sc-pattern-strip';
    strip.append(patternPlay,patternArea.querySelector('.sc-preset-cell-editor,.sc-strum-preset-grid'));
    patternArea.prepend(patternHead,strip);
    patternArea.append(rangeControls);
    const wholeLabel=node('label',undefined,rangeControls),wholeSong=node('input',undefined,wholeLabel);
    wholeSong.type='checkbox';wholeLabel.append('曲全て');wholeSong.onchange=update;
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
    const targetHint = chords ? '小節で開始位置、セクション名でセクション全体を選択。選んだ範囲にコード進行を繰り返します。' : '小節で開始位置、セクション名で範囲を指定。ドラッグ・Shift＋クリックで範囲選択（複数小節のパターンは2小節単位）。余白で解除。';
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
    const hint = node('p', targetHint+' 選択した小節の'+(chords?'コード':'ストローク')+'はDeleteで削除できます。', scoreHead);
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
        if (!author) for (const label of frameBox.querySelectorAll('.sheet-section-label[data-section-id]')) {
            label.tabIndex=0;
            label.setAttribute('role','button');
            label.title=label.textContent+'の小節をすべて選択';
        }
        paperBars = Array.from(frameBox.querySelectorAll('.sheet-bar[data-bar-number]'));
        for (const item of paperBars) {
            if (!chords) item.style.touchAction='none';
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

    let gesture = null, selectionAnchor = null;
    function barAt(target) {
        const bar = target?.closest('.sheet-bar[data-bar-number]');
        return bar && paper.contains(bar) ? Number(bar.dataset.barNumber) - 1 : NaN;
    }
    function setRange(start, end) {
        rangeIndices = Array.from({length:Math.abs(end - start) + 1}, (_, index) => Math.min(start, end) + index);
    }
    function destinationIndices(anchor,section){
        if(wholeSong?.checked&&!author)return project.bars.map((_,i)=>i);
        if(chords || author || rows.length<2 || !rangeIndices.length)return rangeIndices;
        const first=rangeIndices[0], last=rangeIndices.at(-1);
        if(!section && first===last){
            return first+rows.length<=project.bars.length
                ? Array.from({length:rows.length},(_,i)=>first+i) : [];
        }
        if(rangeIndices.length%2===0)return rangeIndices;
        if(section)return rangeIndices.slice(0,-1);
        const backward=anchor===last;
        if(backward && first>0)return [first-1,...rangeIndices];
        if(!backward && last+1<project.bars.length)return [...rangeIndices,last+1];
        // At either end of the song, extend on the other side to keep all touched bars.
        if(first>0)return [first-1,...rangeIndices];
        if(last+1<project.bars.length)return [...rangeIndices,last+1];
        // An odd-length song cannot be covered entirely by pairs.
        return backward ? rangeIndices.slice(1) : rangeIndices.slice(0,-1);
    }
    function paintGesture(){
        if(chords || author)refreshPaper();
        else refreshPaper(destinationIndices(gesture.start,false).map(index=>project.bars[index].id));
    }
    function chooseFromPaper(start, end) {
        if(wholeSong&&!author)wholeSong.checked=false;
        sectionSelected=false;
        setRange(start, end);
        if (author) { selectionAnchor=start; refreshPaper(); captureFromScore(); return; }
        if (chords) {
            selectionAnchor=start;starting = Math.min(start,end);
        } else {
            selectionAnchor=start;
        }
        update();
        paperBars[start]?.focus({preventScroll:true});
    }
    const selectionSurface=paperArea;
    selectionSurface.addEventListener('pointerdown', event => {
        if (event.target.closest('button') || (!author && event.target.closest('.sheet-section-label'))) return;
        const index = barAt(event.target);
        if (event.button !== 0 || gesture) return;
        const wasWholeSong=wholeSong?.checked;
        if(!author&&wholeSong)wholeSong.checked=false;
        const anchor = event.shiftKey && selectionAnchor !== null ? selectionAnchor : Number.isInteger(index) ? index : null;
        gesture = {pointer:event.pointerId, wasWholeSong, previous:rangeIndices, start:anchor, end:Number.isInteger(index)?index:null,x:event.clientX,y:event.clientY};
        if(Number.isInteger(index)){setRange(anchor,index);paintGesture();}
        selectionSurface.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    const edgeScroll=C.sheetCruise.createDragScroll(paper,(x,y)=>{
        if(!gesture)return;
        const element=doc.elementFromPoint(x,y);
        let hit=barAt(element);
        if(!Number.isInteger(hit)&&paper.contains(element)){
            const row=element.closest('.sheet-line');
            const cells=row?.querySelectorAll('.sheet-bar[data-bar-number]');
            if(cells?.length)hit=barAt(cells[cells.length-1]);
            else if(paper.scrollTop+paper.clientHeight>=paper.scrollHeight-1)hit=project.bars.length-1;
        }
        if(Number.isInteger(hit)){gesture.start??=hit;gesture.end=hit;setRange(gesture.start,hit);paintGesture();}
    });
    dialog.addEventListener('close',()=>edgeScroll.stop(),{once:true});
    selectionSurface.addEventListener('lostpointercapture',()=>{edgeScroll.stop();});
    selectionSurface.addEventListener('pointermove', event => {
        if (gesture?.pointer !== event.pointerId) return;
        edgeScroll.move(event.clientX,event.clientY);
        // Sample the segment too: a fast drag can enter and leave a bar between events.
        const steps=Math.max(1,Math.ceil(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)/8));
        for(let step=1;step<=steps;step++){
            const fraction = step / steps;
            const x = gesture.x + (event.clientX - gesture.x) * fraction;
            const y = gesture.y + (event.clientY - gesture.y) * fraction;
            const index = barAt(doc.elementFromPoint(x, y));
            if (!Number.isInteger(index) || index === gesture.end) continue;
            gesture.start ??= index;
            gesture.end = index;
            setRange(gesture.start, index);
            paintGesture();
        }
        gesture.x=event.clientX;gesture.y=event.clientY;
    });
    selectionSurface.addEventListener('pointerup', event => {
        if (gesture?.pointer !== event.pointerId) return;
        const {start,end}=gesture;
        gesture = null;
        if(start===null || end===null){
            rangeIndices=[];selectionAnchor=null;
            if(author){patternArea.hidden=true;saveButton.hidden=true;void stopAudio();authorHint.textContent='譜面をドラッグして取り込む範囲を選択';}
            update();
        }
        else chooseFromPaper(start,end);
    });
    selectionSurface.addEventListener('pointercancel', event => {
        if (gesture?.pointer !== event.pointerId) return;
        if(wholeSong)wholeSong.checked=gesture.wasWholeSong;
        rangeIndices = gesture.previous;
        gesture = null;
        update();
    });
    paper.addEventListener('click', event => {
        const index = barAt(event.target);
        if (chooseSection(event.target)) return;
        if (Number.isInteger(index) && index >= 0) {
            if (!event.shiftKey || selectionAnchor === null) selectionAnchor=index;
            chooseFromPaper(selectionAnchor,index);
        }
    });
    function chooseSection(target) {
        const heading = target.closest('.sheet-section-label[data-section-id]');
        if (!heading || author) return false;
        if(wholeSong)wholeSong.checked=false;
        sectionSelected=true;
        rangeIndices=project.bars.flatMap((bar,i)=>bar.sectionId===heading.dataset.sectionId?[i]:[]);
        selectionAnchor=rangeIndices[0]??null;
        update();
        return true;
    }
    paper.addEventListener('keydown', event => {
        if(!author && !event.isComposing && ['Delete','Backspace'].includes(event.key)){
            const indices=destinationIndices(selectionAnchor,sectionSelected);
            if(!indices.length)return;
            event.preventDefault();
            const barIds=indices.map(i=>project.bars[i].id);
            try {
                stageEntry(chords?{barIds,pattern:indices.map(()=>[]),overwrite:true}:{barIds,clear:true});
                paperBars[indices[0]]?.focus({preventScroll:true});
                status.textContent=barIds.length+'小節の'+(chords?'コード':'ストローク')+'を削除しました';
            } catch(error){status.textContent=error.message;}
            return;
        }
        if (['Enter',' '].includes(event.key) && chooseSection(event.target)) {event.preventDefault();return;}
        const index = barAt(event.target);
        if (index < 0 || !Number.isInteger(index) || !(event.key==='Enter' || author && event.key===' ')) return;
        event.preventDefault();
        if (!event.shiftKey || selectionAnchor === null) selectionAnchor=index;
        chooseFromPaper(selectionAnchor,index);
    });
    refreshPaper = (ids = []) => {
        const target = new Set(ids), source = new Set(rangeIndices);
        paperBars.forEach(item => {
            const index = barAt(item);
            item.toggleAttribute('data-preset-destination', target.has(project.bars[index]?.id));
            item.toggleAttribute('data-preset-source', source.has(index) && (author || (chords && gesture !== null)));
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
                const grids=indices.map(index=>{
                    const bar=previewView.bars[index];
                    const material=previewView.strumPatterns.find(p=>p.id===(bar.strumOverride||previewView.basicStrumPatternId));
                    return C.model.strumInputGrid(material,C.model.schema2.barLength(previewProject));
                });
                gridUnits=grids.map(g=>g.unit);beatUnits=grids.map(g=>g.beats.slice());selectedStroke=null;
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
    if (!chords && !selectedBars.length && first) setRange(project.bars.indexOf(first),project.bars.indexOf(first));
    let previousKey = key?.value;
    if (selectedBars.length) setRange(project.bars.indexOf(selectedBars[0]), project.bars.indexOf(selectedBars.at(-1)));


    function strokeGrid(unit, beats) {
        const starts = C.model.strumCellStarts(unit, beats, measureTicks);
        return starts.map((tick,i)=>({start:tick/120, span:((starts[i+1]??measureTicks)-tick)/120}));
    }
    function paintGrid() {
        grid.replaceChildren();
        rows.forEach((row, index) => {
            const line = node('div', undefined, grid);
            line.setAttribute('aria-label', 'パターン ' + (index + 1) + '小節目');
            const units=gridUnits[index] ?? row.length;
            const beats=beatUnits[index] ?? [];
            const expanded=[...row].map(value=>strokeFill(value,16/row.length)).join('');
            const cells=strokeGrid(units,beats);
            function changeGrid(nextUnits,nextBeats) {
                gridUnits[index]=nextUnits;
                beatUnits[index]=nextBeats;
                selectedStroke=null;
                const layout=strokeGrid(nextUnits,nextBeats);
                let newRow='';
                const changes=[];
                for(const {start,span} of layout){
                    if(cells.some(cell=>cell.start===start && cell.span===span)){
                        newRow+=expanded.slice(start,start+span);
                        continue;
                    }
                    changes.push({start,span});
                    let value=expanded[start];
                    // A discarded offbeat attack may have been the source of this sustain.
                    if(value==='〜' && start>0 && !/[↓↑〜]$/.test(newRow))value='−';
                    newRow+=strokeFill(value,span);
                }
                replaceRow(newRow,layout,changes);
                paintGrid();update();
            }
            function replaceRow(newRow, layout, changes) {
                // Preserve the stored length of a rest when the grid needs only four or eight cells.
                const step=layout.every(({start,span})=>start%4===0 && span%4===0)?4:
                    layout.every(({start,span})=>start%2===0 && span%2===0)?2:1;
                newRow=newRow.slice(0,beatsPerBar*4).padEnd(16,'−');
                const compact=[...newRow].filter((_,i)=>i%step===0).join('');
                rows[index]=[...compact].map(cell=>strokeFill(cell,step)).join('')===newRow ? compact : newRow;
                edited=true;
                if(!sourceSlots || !changes.length)return;
                try {
                    const old=sourceSlots[index]||[];
                    const fallback=old.some(slot=>slot.tick%240 || (slot.durationTicks??240)%240) ? 120 : 240;
                    const kept=old.filter(slot=>{
                        const from=slot.tick/120,to=from+(slot.durationTicks??fallback)/120;
                        return changes.every(cell=>to<=cell.start || from>=cell.start+cell.span) &&
                            expanded.slice(from,to)===newRow.slice(from,to) && newRow[to]!=='〜';
                    });
                    const rebuilt=slotsForGrid(rows[index],index).filter(slot=>!kept.some(original=>
                        slot.tick>=original.tick && slot.tick<original.tick+(original.durationTicks??fallback)));
                    for(const slot of rebuilt){
                        const original=old.find(item=>item.tick===slot.tick && item.action===slot.action);
                        if(original)slot.accent=original.accent??false;
                    }
                    rebuilt.push(...kept);
                    rebuilt.sort((a,b)=>a.tick-b.tick);
                    sourceSlots=sourceSlots.map((slots,i)=>i===index?rebuilt:slots);
                } catch {
                    sourceSlots[index]=null;
                }
            }
            line.style.gridTemplateColumns='repeat('+beatsPerBar*4+',minmax(0,1fr))';
            const heading=node('strong',(index+1)+'小節目',line);
            heading.style.gridColumn='1 / -1';
            const cycle=[8,16,4,1,2];
            const toggle=button(units===1?'全音符':units+'分',()=>{
                changeGrid(cycle[(cycle.indexOf(units)+1)%cycle.length],beats);
            },heading);
            toggle.title='入力単位を切り替え';
            toggle.setAttribute('aria-label',(index+1)+'小節目の入力単位を切り替え');
            for(let beat=0;beat<beatsPerBar;beat++){
                const label=node('small',(beat+1)+'拍',line);
                label.style.gridColumn='span 4';
            }
            for(const [column,{start,span}] of cells.entries()){
                const cell=expanded[start];
                function writeStroke(next) {
                    gridUnits[index]=units;
                    let suffix=expanded.slice(start+span);
                    if(next==='−'||next==='・'||next==='×')suffix=suffix.replace(/^〜+/,tie=>'−'.repeat(tie.length));
                    replaceRow(expanded.slice(0,start)+strokeFill(next,span)+suffix,cells,[{start,span}]);
                    paintGrid();
                    grid.children[index].querySelectorAll('[data-stroke]')[column].focus({preventScroll:true});
                    update();
                }
                const slotKey=index+':'+column;
                const cellButton=button(cell,()=>{
                    if(selectedStroke===slotKey)writeStroke(noteStates[(noteStates.indexOf(cell)+1)%noteStates.length]);
                    else {
                        grid.querySelector('[data-selected]')?.removeAttribute('data-selected');
                        selectedStroke=slotKey;
                        cellButton.setAttribute('data-selected','');
                    }
                },line);
                cellButton.toggleAttribute('data-selected',selectedStroke===slotKey);
                cellButton.addEventListener('keydown',event=>{
                    if(event.ctrlKey||event.metaKey||event.altKey)return;
                    const value={d:'↓',u:'↑',x:'×',r:'・',' ':'・',delete:'−',backspace:'−','~':'〜','〜':'〜','～':'〜'}[event.key.toLowerCase()];
                    if(!value)return;
                    event.preventDefault();event.stopPropagation();selectedStroke=slotKey;writeStroke(value);
                });
                cellButton.style.gridColumn=(start+1)+' / span '+span;
                cellButton.style.gridRow='3';
                function renderCell(value) {
                    const action = strokeActions[value] || (value === '〜' ? 'sustain' : 'empty');
                    const inner=sourceSlots?.[index]?.filter(slot=>slot.tick>=start*120 && slot.tick<(start+span)*120);
                    const multiple=inner && C.sheetRenderer.hasInnerStroke(inner,start*120);
                    if(multiple)cellButton.textContent='…';
                    else C.sheetRenderer.renderStrumCell(cellButton,action,span*120);
                    cellButton.dataset.stroke = value;
                    cellButton.title = (index + 1) + '小節目・' + (column + 1) + 'マス目 ' + (multiple?'細かい入力があります。このマスの音価で上書きできます':stateNames[value]) + '（クリックで選択、もう一度クリックで変更）';
                    cellButton.setAttribute('aria-label', cellButton.title);
                }
                renderCell(cell);
            }
            for(let beat=0;beat<beatsPerBar;beat++){
                const fixed=beats[beat], effective=fixed || units;
                const opposite=units===8?16:8;
                const next=!fixed?opposite:fixed===opposite?(units<=4?16:units):null;
                const control=button(String(effective),()=>{
                    const updated=beats.slice();
                    updated[beat]=next;
                    changeGrid(units,updated);
                    grid.children[index].querySelectorAll('.sc-stroke-beat-unit')[beat].focus({preventScroll:true});
                },line);
                control.className='sc-stroke-beat-unit dock-lyrics-beat-res-btn '+(fixed?'is-local':'is-auto');
                control.style.gridColumn=(beat*4+1)+' / span 4';
                control.style.gridRow='4';
                control.setAttribute('aria-pressed',String(Boolean(fixed)));
                control.title=(index+1)+'小節目・'+(beat+1)+'拍目：'+(fixed?fixed+'分に固定中':'小節の単位に追従中')+'。クリックで'+(next?next+'分に固定':'小節の入力単位に戻す');
                control.setAttribute('aria-label',control.title);
            }
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
            if(wholeSong.checked||sectionSelected||rangeIndices.length>1){
                const bars=wholeSong.checked?project.bars:rangeIndices.map(i=>project.bars[i]);
                if(!bars.length)throw Error('入力先に小節がありません');
                return {bars,pattern:bars.map((_,i)=>pattern[i%pattern.length])};
            }
            const from = starting;
            if (from < 0 || from + pattern.length > project.bars.length)
                throw Error('曲の末尾までに ' + pattern.length + ' 小節の入力先がありません。開始小節を変更してください');
            return {pattern, bars:project.bars.slice(from, from + pattern.length)};
        }
        const bars=destinationIndices(selectionAnchor,sectionSelected).map(index=>project.bars[index]);
        if(!bars.length && rangeIndices.length)throw Error('この範囲に収まりません。開始小節か範囲を変更してください');
        if (!bars.length) throw Error('下の譜面で入力先を選んでください');
        return {bars, pattern:patternSlots().slice(0, bars.length)};
    }
    function update() {
        if (audioKind === 'pattern') void stopAudio();

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
        gridUnits=[];beatUnits=[]; selectedStroke=null;
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
        } else { rows = current.rows.slice();
            gridUnits=rows.map((row,i)=>[1,2,4,8,16].includes(current.gridUnits?.[i])?current.gridUnits[i]:row.length);
            beatUnits=rows.map((_,i)=>Array.from({length:4},(_,b)=>[8,16].includes(current.beatUnits?.[i]?.[b])?current.beatUnits[i][b]:null));
            sourceSlots = current.slots ? structuredClone(current.slots) : null; paintGrid(); }
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
                entry.slots=patternSlots();
                entry.rows=rows.slice();
                entry.gridUnits=rows.map((row,i)=>gridUnits[i]??row.length);
                entry.beatUnits=rows.map((_,i)=>beatUnits[i]??[]);
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
    }
    const lastKey='scoreLastStrumPreset';
    const lastId=!chords&&C.storage.getAppSetting(lastKey);
    const initial=!chords&&(library.items.find(item=>item.id===lastId)||
        library.items.find(item=>item.id==='default:'+strokes.findIndex(([name])=>name==='王道の8分')));
    populateOptions(initial); choose();
    const usedPresets=new WeakMap();
    fitPaper?.();
    function stageEntry(entry){
        void stopAudio();
        previewProject=C.structureOperations.previewPreset(previewProject,mode,entry,C.model.schema2,C.localChordForms?.installPreset);
        steps.push(entry);redoSteps.length=0;
        renderPaper();fitPaper();update();apply.disabled=false;status.textContent='';
    }
    function stagePattern() {
        try {
            const {bars, pattern} = plan(), barIds = bars.map(bar => bar.id);
            const entry = structuredClone(chords ? {barIds, pattern, overwrite:true} :
                {barIds, pattern, wholeSong:wholeSong.checked, leadingSustains:rows.map(row=>Math.min(measureTicks,leadingHold(row))), inputGrids:pattern.map((_,i)=>({unit:gridUnits[i]??rows[i].length, beats:beatUnits[i]??[]})), name:edited ? 'カスタムストローク' : current.name});
            stageEntry(entry);
            usedPresets.set(entry,current.id);
            stage.focus({preventScroll:true});
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
    return () => !author && steps.length ? {kind:mode, args:{steps},onApplied(){const last=steps.findLast(step=>usedPresets.has(step));if(!chords&&last)C.storage.setAppSetting(lastKey,usedPresets.get(last));}} : null;
}
